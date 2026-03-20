# ECS/Fargate デプロイ手順・チェックリスト

- 本番 URL    : https://app.itf-oa.com
- ステージング : https://stg.itf-oa.com
- SES 送信元  : noreply@itf-oa.com (prod / staging 共通)
- リージョン  : ap-northeast-1 (固定)

---

## 置換が必要なプレースホルダ (最終版)

デプロイ前に以下をすべて実値に置換してから AWS CLI を実行する。

| プレースホルダ | 対象ファイル | 取得方法 / 値 |
|---|---|---|
| `{{AWS_ACCOUNT_ID}}` | 全4 JSON | `aws sts get-caller-identity --query Account --output text` |
| `{{IMAGE_TAG}}` | 両タスク定義 | ECR push 後に確定 (例: `v1.0.0`, `latest`) |
| `{{PROD_DATABASE_URL_SECRET_ARN}}` | ecs-taskdef-prod.json | `aws secretsmanager describe-secret --secret-id /oa-system/prod/database-url --query ARN --output text` |
| `{{PROD_NEXTAUTH_SECRET_ARN}}` | ecs-taskdef-prod.json | `aws secretsmanager describe-secret --secret-id /oa-system/prod/nextauth-secret --query ARN --output text` |
| `{{STAGING_DATABASE_URL_SECRET_ARN}}` | ecs-taskdef-staging.json | `aws secretsmanager describe-secret --secret-id /oa-system/staging/database-url --query ARN --output text` |
| `{{STAGING_NEXTAUTH_SECRET_ARN}}` | ecs-taskdef-staging.json | `aws secretsmanager describe-secret --secret-id /oa-system/staging/nextauth-secret --query ARN --output text` |
| `{{SQS_QUEUE_NAME}}` | iam-task-role-policy.json | `oa-system-prod-outbox` (prod) / `oa-system-staging-outbox` (staging) |
| `{{KMS_KEY_ID}}` | iam-execution-role-policy.json | CMK 不使用なら `KMSDecryptForSecrets` Statement を丸ごと削除 |
| `{{ALLOWED_EMAIL_DOMAINS}}` | ecs-taskdef-staging.json | 例: `itf-oa.com` |
| `{{ALLOWED_WEBHOOK_HOSTS}}` | ecs-taskdef-staging.json | 例: `hooks.stg.itf-oa.com` / 不要なら `""` |

ARN を一括取得するスクリプト:

```bash
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "AWS_ACCOUNT_ID: $AWS_ACCOUNT_ID"

for env in prod staging; do
  for key in database-url nextauth-secret; do
    printf "{{${env^^}_${key^^//-/_}_SECRET_ARN}}: "
    aws secretsmanager describe-secret \
      --secret-id /oa-system/$env/$key \
      --region ap-northeast-1 \
      --query 'ARN' --output text
  done
done
```

---

## 0. 前提確認

- [ ] AWS アカウント ID 確認済み (`aws sts get-caller-identity --query Account --output text`)
- [ ] `itf-oa.com` の DNS 管理権限あり
- [ ] ACM 証明書発行済み (`app.itf-oa.com` / `stg.itf-oa.com`)

---

## 1. ECR リポジトリ作成とイメージ push

```bash
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# リポジトリ作成 (初回のみ)
aws ecr create-repository \
  --repository-name oa-system \
  --region ap-northeast-1

# Docker ログイン
aws ecr get-login-password --region ap-northeast-1 \
  | docker login --username AWS --password-stdin \
    ${AWS_ACCOUNT_ID}.dkr.ecr.ap-northeast-1.amazonaws.com

# ビルド・タグ・push
docker build -t oa-system:latest .
docker tag oa-system:latest \
  ${AWS_ACCOUNT_ID}.dkr.ecr.ap-northeast-1.amazonaws.com/oa-system:latest
docker push \
  ${AWS_ACCOUNT_ID}.dkr.ecr.ap-northeast-1.amazonaws.com/oa-system:latest
```

- [ ] ECR リポジトリ作成済み
- [ ] Docker イメージ push 済み
- [ ] `{{IMAGE_TAG}}` を決定済み

---

## 2. RDS (PostgreSQL) セットアップ

- [ ] RDS PostgreSQL 15+ インスタンス作成済み (Private Subnet / Multi-AZ 推奨)
- [ ] ECS タスクのセキュリティグループから 5432 ポートへのアクセス許可済み
- [ ] DB ユーザー・パスワード設定済み
- [ ] DB 接続 URL を手元で確認済み

---

## 3. Secrets Manager への登録と ARN 取得

`deploy/secrets-list.md` を参照。登録するシークレットは **prod / staging 各2件のみ**。

```bash
# prod: database-url
aws secretsmanager create-secret \
  --name /oa-system/prod/database-url \
  --secret-string "postgresql://appuser:CHANGEME@prod-db.cluster-xxxx.ap-northeast-1.rds.amazonaws.com:5432/oadb?sslmode=require" \
  --region ap-northeast-1

# prod: nextauth-secret
aws secretsmanager create-secret \
  --name /oa-system/prod/nextauth-secret \
  --secret-string "$(openssl rand -base64 32)" \
  --region ap-northeast-1

# staging: database-url
aws secretsmanager create-secret \
  --name /oa-system/staging/database-url \
  --secret-string "postgresql://appuser:CHANGEME@staging-db.cluster-xxxx.ap-northeast-1.rds.amazonaws.com:5432/oadb_staging?sslmode=require" \
  --region ap-northeast-1

# staging: nextauth-secret
aws secretsmanager create-secret \
  --name /oa-system/staging/nextauth-secret \
  --secret-string "$(openssl rand -base64 32)" \
  --region ap-northeast-1
```

登録後、ARN を取得してタスク定義のプレースホルダを置換する:

```bash
# prod ARN 取得
PROD_DB_ARN=$(aws secretsmanager describe-secret \
  --secret-id /oa-system/prod/database-url \
  --region ap-northeast-1 --query 'ARN' --output text)

PROD_AUTH_ARN=$(aws secretsmanager describe-secret \
  --secret-id /oa-system/prod/nextauth-secret \
  --region ap-northeast-1 --query 'ARN' --output text)

# staging ARN 取得
STG_DB_ARN=$(aws secretsmanager describe-secret \
  --secret-id /oa-system/staging/database-url \
  --region ap-northeast-1 --query 'ARN' --output text)

STG_AUTH_ARN=$(aws secretsmanager describe-secret \
  --secret-id /oa-system/staging/nextauth-secret \
  --region ap-northeast-1 --query 'ARN' --output text)

echo "PROD_DATABASE_URL_SECRET_ARN:    $PROD_DB_ARN"
echo "PROD_NEXTAUTH_SECRET_ARN:        $PROD_AUTH_ARN"
echo "STAGING_DATABASE_URL_SECRET_ARN: $STG_DB_ARN"
echo "STAGING_NEXTAUTH_SECRET_ARN:     $STG_AUTH_ARN"
```

- [ ] `/oa-system/prod/database-url` 登録済み + ARN 取得済み
- [ ] `/oa-system/prod/nextauth-secret` 登録済み + ARN 取得済み
- [ ] `/oa-system/staging/database-url` 登録済み + ARN 取得済み
- [ ] `/oa-system/staging/nextauth-secret` 登録済み + ARN 取得済み
- [ ] `ecs-taskdef-prod.json` の `{{PROD_*_SECRET_ARN}}` を実 ARN で置換済み
- [ ] `ecs-taskdef-staging.json` の `{{STAGING_*_SECRET_ARN}}` を実 ARN で置換済み

---

## 4. SQS キュー作成

```bash
# prod
aws sqs create-queue \
  --queue-name oa-system-prod-outbox \
  --region ap-northeast-1

# staging
aws sqs create-queue \
  --queue-name oa-system-staging-outbox \
  --region ap-northeast-1
```

- [ ] `oa-system-prod-outbox` 作成済み (AWS_SQS_QUEUE_URL はタスク定義に直書き済み)
- [ ] `oa-system-staging-outbox` 作成済み
- [ ] DLQ 設定済み (最大受信数: 3〜5 / 可視性タイムアウト: 300 秒推奨)

---

## 5. SES ドメイン検証と production アクセス

送信元: `noreply@itf-oa.com`。ルートドメイン `itf-oa.com` を検証する。

```bash
# ドメイン検証 (DNS 検証)
aws ses verify-domain-identity \
  --domain itf-oa.com \
  --region ap-northeast-1

# DKIM 設定
aws ses verify-domain-dkim \
  --domain itf-oa.com \
  --region ap-northeast-1
```

- [ ] `itf-oa.com` のドメイン検証済み (DKIM / SPF / DMARC)
- [ ] SES production access 申請済み (AWS Console > SES > Account dashboard > Request production access)
- [ ] `noreply@itf-oa.com` でテスト送信成功を確認

---

## 6. IAM ロール作成

```bash
# 信頼ポリシー
cat > /tmp/ecs-task-trust.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "ecs-tasks.amazonaws.com" },
    "Action": "sts:AssumeRole"
  }]
}
EOF

AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# --- prod Task Role ---
aws iam create-role \
  --role-name oa-system-prod-task-role \
  --assume-role-policy-document file:///tmp/ecs-task-trust.json

# {{AWS_ACCOUNT_ID}} と {{SQS_QUEUE_NAME}} を置換してから実行
aws iam put-role-policy \
  --role-name oa-system-prod-task-role \
  --policy-name oa-system-prod-task-policy \
  --policy-document file://deploy/iam-task-role-policy.json

# --- prod Execution Role ---
aws iam create-role \
  --role-name oa-system-prod-execution-role \
  --assume-role-policy-document file:///tmp/ecs-task-trust.json

aws iam attach-role-policy \
  --role-name oa-system-prod-execution-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy

# {{AWS_ACCOUNT_ID}} を置換し、CMK 不使用なら KMSDecryptForSecrets Statement を削除してから実行
aws iam put-role-policy \
  --role-name oa-system-prod-execution-role \
  --policy-name oa-system-prod-execution-policy \
  --policy-document file://deploy/iam-execution-role-policy.json
```

staging も同手順で `oa-system-staging-task-role` / `oa-system-staging-execution-role` を作成する。
`iam-task-role-policy.json` の `{{SQS_QUEUE_NAME}}` を `oa-system-staging-outbox` に変更して適用する。

- [ ] prod Task Role 作成済み + ポリシー適用済み
- [ ] prod Execution Role 作成済み + マネージドポリシー + 追加ポリシー適用済み
- [ ] staging Task Role 作成済み + ポリシー適用済み
- [ ] staging Execution Role 作成済み + マネージドポリシー + 追加ポリシー適用済み

---

## 7. ECS クラスター・サービス作成

```bash
# クラスター作成 (初回のみ)
aws ecs create-cluster --cluster-name oa-system-prod --region ap-northeast-1
aws ecs create-cluster --cluster-name oa-system-staging --region ap-northeast-1

# タスク定義登録 (全プレースホルダを実値に置換済みであること)
aws ecs register-task-definition \
  --cli-input-json file://deploy/ecs-taskdef-prod.json \
  --region ap-northeast-1

aws ecs register-task-definition \
  --cli-input-json file://deploy/ecs-taskdef-staging.json \
  --region ap-northeast-1

# prod サービス作成 (ALB ターゲットグループ ARN は事前に取得しておく)
aws ecs create-service \
  --cluster oa-system-prod \
  --service-name oa-system \
  --task-definition oa-system-prod \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-XXXXX,subnet-YYYYY],securityGroups=[sg-ZZZZZ],assignPublicIp=DISABLED}" \
  --load-balancers "targetGroupArn=arn:aws:elasticloadbalancing:ap-northeast-1:{{AWS_ACCOUNT_ID}}:targetgroup/oa-system-prod/XXXXXXXX,containerName=oa-system,containerPort=3000" \
  --health-check-grace-period-seconds 120 \
  --region ap-northeast-1
```

- [ ] prod タスク定義の全プレースホルダを実値で置換済み
- [ ] staging タスク定義の全プレースホルダを実値で置換済み
- [ ] prod タスク定義登録済み
- [ ] staging タスク定義登録済み
- [ ] ALB・ターゲットグループ作成済み
- [ ] ECS サービス作成済み

---

## 8. ALB / DNS 設定

ALB ターゲットグループのヘルスチェック設定:

| 設定項目 | 推奨値 |
|---|---|
| プロトコル | HTTP |
| パス | `/api/health` |
| 成功コード | `200` |
| 正常しきい値 | 2 |
| 非正常しきい値 | 3 |
| タイムアウト | 10 秒 |
| 間隔 | 30 秒 |

DNS レコード:

| ホスト名 | タイプ | 値 |
|---|---|---|
| `app.itf-oa.com` | CNAME / Alias | prod ALB の DNS 名 |
| `stg.itf-oa.com` | CNAME / Alias | staging ALB の DNS 名 |

- [ ] ALB ヘルスチェックを `/api/health` (成功コード: 200) に設定済み
- [ ] `app.itf-oa.com` → prod ALB の DNS レコード設定済み
- [ ] `stg.itf-oa.com` → staging ALB の DNS レコード設定済み

---

## 9. 動作確認

```bash
# prod
curl -sf https://app.itf-oa.com/api/health
# 期待: {"status":"ok","db":"ok"}

curl -sI https://app.itf-oa.com/login
# 期待: HTTP/2 200

# staging
curl -sf https://stg.itf-oa.com/api/health
# 期待: {"status":"ok","db":"ok"}

# ECS タスク状態確認 (prod)
aws ecs describe-tasks \
  --cluster oa-system-prod \
  --tasks $(aws ecs list-tasks --cluster oa-system-prod --query 'taskArns[0]' --output text) \
  --query 'tasks[0].{status:lastStatus,health:healthStatus}' \
  --region ap-northeast-1

# CloudWatch Logs 確認
aws logs tail /ecs/oa-system-prod --follow --region ap-northeast-1
```

- [ ] `https://app.itf-oa.com/api/health` → `{"status":"ok","db":"ok"}`
- [ ] `https://app.itf-oa.com/login` → HTTP 200
- [ ] `https://stg.itf-oa.com/api/health` → `{"status":"ok","db":"ok"}`
- [ ] ECS タスクが RUNNING・HEALTHY
- [ ] CloudWatch Logs にエラーなし

---

## 10. staging 固有チェック

- [ ] `DISABLE_REAL_EMAIL_SEND=true` 設定済み (タスク定義確認)
- [ ] `DISABLE_REAL_WEBHOOK_SEND=true` 設定済み (タスク定義確認)
- [ ] `{{ALLOWED_EMAIL_DOMAINS}}` を実ドメインに置換済み
- [ ] `{{ALLOWED_WEBHOOK_HOSTS}}` を設定済み (不要なら `""`)

---

## 注意事項

### Prisma マイグレーション
`docker-entrypoint.sh` が起動時に `prisma migrate deploy` を実行する。冪等のため複数回実行されても問題ない。初回は DB が接続可能であること。

### Turbopack + Prisma Client
`Dockerfile` の symlink 自動作成ステップで `@prisma/client-{hash}` を解決済み。Prisma スキーマ変更時はイメージを再ビルドすること。

### health check の2層構造

| レイヤー | 確認内容 | 期待レスポンス |
|---|---|---|
| ECS コンテナヘルスチェック | Node.js プロセス生存 | HTTP 任意応答 (接続成功) |
| ALB ターゲットグループ | アプリ + DB 疎通 | HTTP 200 のみ |

`/api/health` は DB 接続失敗時に 503 を返す。ALB は 200 のみ正常と判定するため、DB 障害時はそのタスクへのルーティングを自動で切り離す。
