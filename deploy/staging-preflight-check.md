# Staging 反映 事前確認チェックリスト

---

## 1. セット必要な変数

`staging-apply-commands.md` を実行する前に、以下をすべてシェルにセットすること。

| 変数 | 値の例 / 取得方法 |
|---|---|
| `AWS_ACCOUNT_ID` | `aws sts get-caller-identity --query Account --output text` |
| `IMAGE_TAG` | ECR にプッシュ済みのタグ (例: `v1.0.0`, git SHA) |
| `STAGING_DATABASE_URL_SECRET_ARN` | 後述の ARN 確認コマンドで取得 |
| `STAGING_NEXTAUTH_SECRET_ARN` | 後述の ARN 確認コマンドで取得 |
| `ALLOWED_EMAIL_DOMAINS` | 例: `itf-oa.com` |
| `ALLOWED_WEBHOOK_HOSTS` | 例: `hooks.example.com` |
| `SUBNET_ID_1` | staging 用プライベートサブネット (AZ-a) |
| `SUBNET_ID_2` | staging 用プライベートサブネット (AZ-c) |
| `SECURITY_GROUP_ID` | ECS タスク用セキュリティグループ |

ARN の確認コマンド:
```bash
for name in database-url nextauth-secret; do
  printf "%-40s " "/oa-system/staging/$name:"
  aws secretsmanager describe-secret \
    --secret-id /oa-system/staging/$name \
    --region ap-northeast-1 \
    --query 'ARN' --output text
done
```

---

## 2. AWS リソース 事前条件チェックリスト

実行前にすべて ✅ になっていること。

### Secrets Manager
- [ ] `/oa-system/staging/database-url` が存在し、値が `postgresql://...` 形式
- [ ] `/oa-system/staging/nextauth-secret` が存在し、値がランダム文字列

確認コマンド:
```bash
aws secretsmanager list-secrets \
  --filter Key=name,Values=/oa-system/staging/ \
  --region ap-northeast-1 \
  --query 'SecretList[].Name' --output table
```

### ECR image
- [ ] ECR リポジトリ `oa-system` が存在する
- [ ] `${IMAGE_TAG}` のイメージがプッシュ済み

確認コマンド:
```bash
aws ecr describe-images \
  --repository-name oa-system \
  --image-ids imageTag=$IMAGE_TAG \
  --region ap-northeast-1 \
  --query 'imageDetails[0].imageTags'
```

### SQS queue
- [ ] キュー `oa-system-staging-outbox` が存在する

確認コマンド:
```bash
aws sqs get-queue-url \
  --queue-name oa-system-staging-outbox \
  --region ap-northeast-1
```

### ECS cluster
- [ ] クラスター `oa-system-staging` が存在する、または初回作成を手順 2 で行う

確認コマンド:
```bash
aws ecs describe-clusters \
  --clusters oa-system-staging \
  --region ap-northeast-1 \
  --query 'clusters[0].status' --output text
```

### Subnets / Security Group
- [ ] `SUBNET_ID_1` / `SUBNET_ID_2` が同一 VPC 内の異なる AZ に存在する
- [ ] `SECURITY_GROUP_ID` がアウトバウンド全開 (または RDS/SQS/SES への疎通を許可) している
- [ ] RDS のセキュリティグループが ECS タスクの SG からポート 5432 を許可している

確認コマンド:
```bash
aws ec2 describe-subnets \
  --subnet-ids $SUBNET_ID_1 $SUBNET_ID_2 \
  --query 'Subnets[].{ID:SubnetId,AZ:AvailabilityZone,VPC:VpcId}' \
  --output table
```

### SES ドメイン
- [ ] `itf-oa.com` が SES で検証済み (IdentityVerificationStatus: Success)

確認コマンド:
```bash
aws ses get-identity-verification-attributes \
  --identities itf-oa.com \
  --region ap-northeast-1 \
  --query 'VerificationAttributes'
```

---

## 3. 実行後 確認コマンド (3つ)

### (1) ECS サービス状態確認

サービスが安定するまで待機し、RUNNING タスク数を確認する。

```bash
aws ecs wait services-stable \
  --cluster oa-system-staging \
  --services oa-system \
  --region ap-northeast-1 \
&& aws ecs describe-services \
  --cluster oa-system-staging \
  --services oa-system \
  --region ap-northeast-1 \
  --query 'services[0].{Status:status,Running:runningCount,Desired:desiredCount,Pending:pendingCount}'
```

期待値: `runningCount == desiredCount`, `status == "ACTIVE"`

### (2) CloudWatch Logs 確認

コンテナ起動直後のログを確認し、エラーが出ていないことを確かめる。

```bash
aws logs tail /ecs/oa-system-staging \
  --since 10m \
  --region ap-northeast-1
```

確認ポイント:
- `Prisma Client` の初期化ログが出ている
- `Ready on http://localhost:3000` が出ている
- `ERROR` / `UnhandledPromiseRejection` が出ていない

### (3) /api/health 確認

ALB または ECS Exec 経由でヘルスエンドポイントに HTTP 200 が返ることを確認する。

```bash
# ALB がある場合
curl -s -o /dev/null -w "%{http_code}" https://stg.itf-oa.com/api/health

# ECS Exec を使う場合 (ALB なし / 直接確認)
TASK_ARN=$(aws ecs list-tasks \
  --cluster oa-system-staging \
  --service-name oa-system \
  --region ap-northeast-1 \
  --query 'taskArns[0]' --output text)

aws ecs execute-command \
  --cluster oa-system-staging \
  --task $TASK_ARN \
  --container oa-system \
  --interactive \
  --command "node -e \"const h=require('http');h.get('http://localhost:3000/api/health',(r)=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{console.log(r.statusCode,d);process.exit(r.statusCode===200?0:1)})}).on('error',e=>{console.error(e);process.exit(1)})\""
```

期待値: HTTP `200`, レスポンスボディに `"status":"ok"` が含まれる
