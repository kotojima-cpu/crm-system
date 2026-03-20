# Staging 反映手順 (AWS CLI)

実行前に以下を確認すること:
- `aws sts get-caller-identity` でアカウントIDと権限を確認済み
- ECR に対象イメージがプッシュ済み
- Secrets Manager に staging シークレット登録済み (`/oa-system/staging/database-url`, `/oa-system/staging/nextauth-secret`)
- SQS キュー `oa-system-staging-outbox` 作成済み
- SES ドメイン `itf-oa.com` 検証済み

---

## 0. 共通変数のセット

```bash
AWS_ACCOUNT_ID=<your-12-digit-account-id>
IMAGE_TAG=<ecr-image-tag>   # 例: latest, v1.0.0, git sha
ALLOWED_EMAIL_DOMAINS=<例: itf-oa.com,example.com>
ALLOWED_WEBHOOK_HOSTS=<例: hooks.example.com>
STAGING_DATABASE_URL_SECRET_ARN=</oa-system/staging/database-url の完全 ARN>
STAGING_NEXTAUTH_SECRET_ARN=</oa-system/staging/nextauth-secret の完全 ARN>
```

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

## 1. IAM ロールの作成

### 1-1. Task Role

```bash
# 信頼ポリシー
cat > /tmp/ecs-trust-policy.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "ecs-tasks.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

aws iam create-role \
  --role-name oa-system-staging-task-role \
  --assume-role-policy-document file:///tmp/ecs-trust-policy.json

# 置換済みポリシーを作成して適用 (SQS_QUEUE_NAME は oa-system-staging-outbox 固定済み)
sed "s/{{AWS_ACCOUNT_ID}}/$AWS_ACCOUNT_ID/g" \
  deploy/iam-task-role-policy-staging.json > /tmp/task-role-policy-staging.json

aws iam put-role-policy \
  --role-name oa-system-staging-task-role \
  --policy-name oa-system-staging-task-policy \
  --policy-document file:///tmp/task-role-policy-staging.json
```

### 1-2. Execution Role

```bash
aws iam create-role \
  --role-name oa-system-staging-execution-role \
  --assume-role-policy-document file:///tmp/ecs-trust-policy.json

# マネージドポリシーをアタッチ (ECR/CWL の基本権限)
aws iam attach-role-policy \
  --role-name oa-system-staging-execution-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy

# カスタムポリシー (Secrets Manager + CWL CreateLogGroup)  ← CMK 不使用版
sed "s/{{AWS_ACCOUNT_ID}}/$AWS_ACCOUNT_ID/g" \
  deploy/iam-execution-role-policy-nokms.json > /tmp/execution-role-policy-nokms.json

aws iam put-role-policy \
  --role-name oa-system-staging-execution-role \
  --policy-name oa-system-staging-execution-policy \
  --policy-document file:///tmp/execution-role-policy-nokms.json
```

---

## 2. ECS クラスターの作成 (初回のみ)

```bash
aws ecs create-cluster \
  --cluster-name oa-system-staging \
  --region ap-northeast-1
```

---

## 3. タスク定義の登録

プレースホルダを一括置換してからタスク定義を登録する:

```bash
sed \
  -e "s/{{AWS_ACCOUNT_ID}}/$AWS_ACCOUNT_ID/g" \
  -e "s/{{IMAGE_TAG}}/$IMAGE_TAG/g" \
  -e "s|{{STAGING_DATABASE_URL_SECRET_ARN}}|$STAGING_DATABASE_URL_SECRET_ARN|g" \
  -e "s|{{STAGING_NEXTAUTH_SECRET_ARN}}|$STAGING_NEXTAUTH_SECRET_ARN|g" \
  -e "s/{{ALLOWED_EMAIL_DOMAINS}}/$ALLOWED_EMAIL_DOMAINS/g" \
  -e "s/{{ALLOWED_WEBHOOK_HOSTS}}/$ALLOWED_WEBHOOK_HOSTS/g" \
  deploy/ecs-taskdef-staging.json > /tmp/ecs-taskdef-staging-resolved.json

# 内容を目視確認
cat /tmp/ecs-taskdef-staging-resolved.json

# 登録
aws ecs register-task-definition \
  --cli-input-json file:///tmp/ecs-taskdef-staging-resolved.json \
  --region ap-northeast-1
```

登録後、リビジョン番号を確認:
```bash
aws ecs describe-task-definition \
  --task-definition oa-system-staging \
  --region ap-northeast-1 \
  --query 'taskDefinition.taskDefinitionArn' --output text
```

---

## 4. ECS サービスの作成 (初回) / 更新 (以降)

### 初回作成

```bash
# VPC/サブネット/セキュリティグループは事前に確認しておくこと
SUBNET_ID_1=<staging 用プライベートサブネット ID (AZ-a)>
SUBNET_ID_2=<staging 用プライベートサブネット ID (AZ-c)>
SECURITY_GROUP_ID=<ECS タスク用セキュリティグループ ID>

aws ecs create-service \
  --cluster oa-system-staging \
  --service-name oa-system \
  --task-definition oa-system-staging \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNET_ID_1,$SUBNET_ID_2],securityGroups=[$SECURITY_GROUP_ID],assignPublicIp=DISABLED}" \
  --region ap-northeast-1
```

### 以降のデプロイ (イメージ更新時)

```bash
aws ecs update-service \
  --cluster oa-system-staging \
  --service oa-system \
  --task-definition oa-system-staging \
  --region ap-northeast-1
```

---

## 5. デプロイ完了の確認

```bash
# サービスが RUNNING になるまで待機 (最大 5 分)
aws ecs wait services-stable \
  --cluster oa-system-staging \
  --services oa-system \
  --region ap-northeast-1

# 実行中タスクの確認
aws ecs list-tasks \
  --cluster oa-system-staging \
  --service-name oa-system \
  --region ap-northeast-1

# ヘルスチェック確認 (ALB 経由または ECS Exec)
# ALB がある場合: curl -s https://stg.itf-oa.com/api/health
```

---

## 6. CloudWatch Logs の確認

```bash
# 直近のログを表示
aws logs tail /ecs/oa-system-staging \
  --since 10m \
  --region ap-northeast-1
```

---

## ロールバック

```bash
# 前のリビジョンに戻す (例: リビジョン 2 に戻す場合)
aws ecs update-service \
  --cluster oa-system-staging \
  --service oa-system \
  --task-definition oa-system-staging:2 \
  --region ap-northeast-1
```
