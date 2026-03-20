# Secrets Manager 登録シークレット一覧

コンテナ起動時に ECS Execution Role が取得し、環境変数としてコンテナに注入する。
**値はすべて `SecretString` (プレーンテキスト) で登録する。JSON オブジェクト形式は使用しない。**

---

## environment と secrets の分類

| 分類 | 対象 | 理由 |
|---|---|---|
| **secrets** (Secrets Manager) | `DATABASE_URL`、`NEXTAUTH_SECRET` | 資格情報・署名鍵。平文露出が危険。 |
| **environment** (タスク定義に直書き) | `NEXTAUTH_URL`、`AWS_SES_FROM`、`AWS_SQS_QUEUE_URL`、安全ガード各種 | 機密でない設定値。 |

---

## 命名規則

```
/oa-system/{env}/{key}
```

---

## prod シークレット (2件)

| シークレット名 | 対応する環境変数 | 値の形式 |
|---|---|---|
| `/oa-system/prod/database-url` | `DATABASE_URL` | `postgresql://user:pass@host:5432/db?sslmode=require` |
| `/oa-system/prod/nextauth-secret` | `NEXTAUTH_SECRET` | `openssl rand -base64 32` で生成したランダム文字列 |

---

## staging シークレット (2件)

| シークレット名 | 対応する環境変数 | 値の形式 |
|---|---|---|
| `/oa-system/staging/database-url` | `DATABASE_URL` | `postgresql://user:pass@host:5432/db_staging?sslmode=require` |
| `/oa-system/staging/nextauth-secret` | `NEXTAUTH_SECRET` | prod とは別に生成すること |

---

## 登録コマンド例 (AWS CLI)

```bash
# prod: database-url
aws secretsmanager create-secret \
  --name /oa-system/prod/database-url \
  --secret-string "postgresql://appuser:CHANGEME@prod-db.cluster-xxxx.ap-northeast-1.rds.amazonaws.com:5432/oadb?sslmode=require" \
  --region ap-northeast-1

# prod: nextauth-secret (ランダム生成)
aws secretsmanager create-secret \
  --name /oa-system/prod/nextauth-secret \
  --secret-string "$(openssl rand -base64 32)" \
  --region ap-northeast-1

# staging: database-url
aws secretsmanager create-secret \
  --name /oa-system/staging/database-url \
  --secret-string "postgresql://appuser:CHANGEME@staging-db.cluster-xxxx.ap-northeast-1.rds.amazonaws.com:5432/oadb_staging?sslmode=require" \
  --region ap-northeast-1

# staging: nextauth-secret (ランダム生成)
aws secretsmanager create-secret \
  --name /oa-system/staging/nextauth-secret \
  --secret-string "$(openssl rand -base64 32)" \
  --region ap-northeast-1
```

---

## タスク定義の valueFrom に貼る完全 ARN の取得方法

`secrets[].valueFrom` には **6文字サフィックス付きの完全 ARN** を直接記入する。
以下のコマンドで各シークレットの ARN を確認し、タスク定義のプレースホルダと置き換える。

```bash
# prod の ARN を一括取得
for name in database-url nextauth-secret; do
  printf "%-35s " "/oa-system/prod/$name:"
  aws secretsmanager describe-secret \
    --secret-id /oa-system/prod/$name \
    --region ap-northeast-1 \
    --query 'ARN' --output text
done

# staging の ARN を一括取得
for name in database-url nextauth-secret; do
  printf "%-40s " "/oa-system/staging/$name:"
  aws secretsmanager describe-secret \
    --secret-id /oa-system/staging/$name \
    --region ap-northeast-1 \
    --query 'ARN' --output text
done
```

出力例:
```
/oa-system/prod/database-url:          arn:aws:secretsmanager:ap-northeast-1:123456789012:secret:/oa-system/prod/database-url-AbCdEf
/oa-system/prod/nextauth-secret:       arn:aws:secretsmanager:ap-northeast-1:123456789012:secret:/oa-system/prod/nextauth-secret-GhIjKl
/oa-system/staging/database-url:       arn:aws:secretsmanager:ap-northeast-1:123456789012:secret:/oa-system/staging/database-url-MnOpQr
/oa-system/staging/nextauth-secret:    arn:aws:secretsmanager:ap-northeast-1:123456789012:secret:/oa-system/staging/nextauth-secret-StUvWx
```

タスク定義のプレースホルダと対応:

| タスク定義のプレースホルダ | 置換する完全 ARN |
|---|---|
| `{{PROD_DATABASE_URL_SECRET_ARN}}` | `arn:aws:secretsmanager:ap-northeast-1:{{AWS_ACCOUNT_ID}}:secret:/oa-system/prod/database-url-AbCdEf` |
| `{{PROD_NEXTAUTH_SECRET_ARN}}` | `arn:aws:secretsmanager:ap-northeast-1:{{AWS_ACCOUNT_ID}}:secret:/oa-system/prod/nextauth-secret-GhIjKl` |
| `{{STAGING_DATABASE_URL_SECRET_ARN}}` | `arn:aws:secretsmanager:ap-northeast-1:{{AWS_ACCOUNT_ID}}:secret:/oa-system/staging/database-url-MnOpQr` |
| `{{STAGING_NEXTAUTH_SECRET_ARN}}` | `arn:aws:secretsmanager:ap-northeast-1:{{AWS_ACCOUNT_ID}}:secret:/oa-system/staging/nextauth-secret-StUvWx` |

---

## environment に直書きする設定値 (Secrets Manager 不要)

| 環境変数 | prod | staging |
|---|---|---|
| `NEXTAUTH_URL` | `https://app.itf-oa.com` | `https://stg.itf-oa.com` |
| `AWS_SES_FROM` | `noreply@itf-oa.com` | `noreply@itf-oa.com` |
| `AWS_SQS_QUEUE_URL` | `https://sqs.ap-northeast-1.amazonaws.com/{{AWS_ACCOUNT_ID}}/oa-system-prod-outbox` | `https://sqs.ap-northeast-1.amazonaws.com/{{AWS_ACCOUNT_ID}}/oa-system-staging-outbox` |
| `DISABLE_REAL_EMAIL_SEND` | (設定しない) | `true` |
| `DISABLE_REAL_WEBHOOK_SEND` | (設定しない) | `true` |
| `ALLOWED_EMAIL_DOMAINS` | (設定しない) | `{{ALLOWED_EMAIL_DOMAINS}}` |
| `ALLOWED_WEBHOOK_HOSTS` | (設定しない) | `{{ALLOWED_WEBHOOK_HOSTS}}` |

---

## 現時点で登録不要 (スタブ実装)

| 将来の環境変数 | 用途 | 状態 |
|---|---|---|
| `EVENTBRIDGE_BUS_NAME` | EventBridge イベントバス名 | stub (未使用) |
| `S3_BUCKET_NAME` | S3 バケット名 | stub (未使用) |
| `OUTBOX_ALERT_WEBHOOK_URL` | 障害通知 Webhook URL | オプション (environment 直書き可) |
| `OUTBOX_ALERT_EMAIL_TO` | 障害通知メール宛先 | オプション (environment 直書き可) |
