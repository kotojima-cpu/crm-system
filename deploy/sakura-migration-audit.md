# AWS ECS/Fargate → さくらのVPS 移行調査レポート

調査対象: `C:\Users\琴島\oa-system`
調査日: 2026-03-19

---

## 1. AWS 依存箇所の一覧

### SES (Simple Email Service)

| 種別 | ファイル | 内容 |
|---|---|---|
| 実装 | `src/infrastructure/mail/ses-mailer.ts` | `SESClient` + `SendEmailCommand` を使用 (本実装済み) |
| ファクトリ | `src/infrastructure/factory.ts` L48-52 | `INFRASTRUCTURE_MODE=aws` のとき `SesMailer` を返す |
| 設定取得 | `src/infrastructure/config.ts` L61-64 | `getSesFromAddress()` で `AWS_SES_FROM` を読む |
| 安全ガード | `src/infrastructure/config.ts` L98-100 | `DISABLE_REAL_EMAIL_SEND` / `ALLOWED_EMAIL_DOMAINS` で staging 遮断 |
| 使用箇所 | `src/worker/handlers/invoice-created.ts` L57 | ハンドラが `createMailer().send()` を呼ぶ |
| タスク定義 | `deploy/ecs-taskdef-prod.json` L29 | `AWS_SES_FROM=noreply@itf-oa.com` |
| IAM | `deploy/iam-task-role-policy.json` L13-22 | `ses:SendEmail` / `ses:SendRawEmail` を許可 |

**使用環境変数:** `AWS_SES_FROM`, `AWS_REGION`, `DISABLE_REAL_EMAIL_SEND`, `ALLOWED_EMAIL_DOMAINS`

---

### SQS (Simple Queue Service)

| 種別 | ファイル | 内容 |
|---|---|---|
| 実装 | `src/infrastructure/queue/sqs-queue.ts` | `SQSClient` + `SendMessageCommand` を使用 (本実装済み) |
| ファクトリ | `src/infrastructure/factory.ts` L54-59 | `INFRASTRUCTURE_MODE=aws` のとき `SqsQueue` を返す |
| 設定取得 | `src/infrastructure/config.ts` L66-69 | `getSqsQueueUrl()` で `AWS_SQS_QUEUE_URL` を読む |
| ディスパッチャ | `src/outbox/dispatcher.ts` L247-270 | `queue` モードのアウトボックスイベントを SQS に発行 |
| タスク定義 | `deploy/ecs-taskdef-prod.json` L30 | `AWS_SQS_QUEUE_URL` にキュー URL を設定 |
| IAM | `deploy/iam-task-role-policy.json` L5-11 | `sqs:SendMessage` を許可 |

**使用環境変数:** `AWS_SQS_QUEUE_URL`, `AWS_REGION`

**SQS に発行されるイベント種別 (queue モード):**
- `invoice.created`, `invoice.confirmed`
- `customer.created/updated/deleted`
- `contract.created/updated`
- `tenant-user.invite.requested`, `email.send`, `email.invoice_notification`

---

### EventBridge

| 種別 | ファイル | 内容 |
|---|---|---|
| 実装 | `src/infrastructure/eventbus/eventbridge-publisher.ts` | **スタブ実装のみ。SDK 呼び出しはコメントアウト済み** |
| ファクトリ | `src/infrastructure/factory.ts` L75-80 | `INFRASTRUCTURE_MODE=aws` のとき EventBridge パブリッシャーを返す |
| ディスパッチャ | `src/outbox/dispatcher.ts` L272-294 | `eventbus` モードのハンドラ (未稼働) |

**現状:** スタブのみで有効な SDK 呼び出しなし。`executionMode: "eventbus"` のイベントは現在登録なし。

---

### Secrets Manager

| 種別 | ファイル | 内容 |
|---|---|---|
| 実装 | `src/infrastructure/secrets/secrets-manager-provider.ts` | **スタブ実装のみ。SDK 呼び出しはコメントアウト済み** |
| ファクトリ | `src/infrastructure/factory.ts` L68-73 | `INFRASTRUCTURE_MODE=aws` のとき作成 |
| ECS 経由注入 | `deploy/ecs-taskdef-prod.json` / `ecs-taskdef-staging.json` | タスク定義の `secrets` 配列で ARN を直接参照し、ECS Execution Role が取得 → 環境変数として注入 |
| IAM | `deploy/iam-execution-role-policy.json` L4-14 | Execution Role に `secretsmanager:GetSecretValue` を許可 |

**現状:** アプリケーションコードから直接 SDK を呼んでいない。ECS のタスク定義注入機能のみ使用。

---

### CloudWatch

| 種別 | ファイル | 内容 |
|---|---|---|
| ログ (no-op) | `src/infrastructure/logging/cloudwatch-logger-adapter.ts` | **no-op 実装。SDK 呼び出しなし** |
| メトリクス | `src/infrastructure/metrics/cloudwatch-metrics.ts` | EMF フォーマットを **stdout に出力するだけ**。CloudWatch SDK 呼び出しなし |
| ECS ログ設定 | `deploy/ecs-taskdef-prod.json` L55-63 | `awslogs` ドライバーで `/ecs/oa-system-prod` へ転送 |
| IAM | `deploy/iam-execution-role-policy.json` L24-32 | Execution Role に `logs:CreateLogGroup` を許可 |

**現状:** SDK を直接呼んでいない。ECS の `awslogs` ドライバーが stdout を CloudWatch Logs へ転送している構成。

---

### S3

| 種別 | ファイル | 内容 |
|---|---|---|
| 実装 | `src/infrastructure/storage/s3-storage.ts` | **スタブ実装のみ。SDK 呼び出しはコメントアウト済み** |
| ファクトリ | `src/infrastructure/factory.ts` L82-87 | `INFRASTRUCTURE_MODE=aws` のとき S3Storage を返す |

**現状:** スタブのみ。`S3_BUCKET_NAME` 環境変数は未設定・未使用。ワーカーハンドラからの呼び出しなし。

---

### ECS/Fargate 固有ファイル (deploy/ 配下)

| ファイル | 内容 |
|---|---|
| `deploy/ecs-taskdef-prod.json` | Family: `oa-system-prod`, CPU 512 / Mem 1024, awsvpc, awslogs |
| `deploy/ecs-taskdef-staging.json` | Family: `oa-system-staging`, CPU 256 / Mem 512, 安全ガード付き |
| `deploy/iam-task-role-policy.json` | SQS / SES 権限 (Task Role 用) |
| `deploy/iam-task-role-policy-staging.json` | staging 用 Task Role ポリシー |
| `deploy/iam-execution-role-policy.json` | Secrets Manager / CWL 権限 (Execution Role 用) |
| `deploy/iam-execution-role-policy-nokms.json` | KMS なし版 Execution Role ポリシー |
| `deploy/secrets-list.md` | Secrets Manager 登録シークレット一覧 |
| `deploy/staging-apply-commands.md` | ECS staging 反映手順 |
| `deploy/staging-preflight-check.md` | staging 事前確認チェックリスト |
| `deploy/deploy-checklist.md` | デプロイチェックリスト |

---

## 2. AWS をやめてコード変更なしで移した場合に壊れる機能

### CRITICAL: メール送信が完全停止

- **根拠:** `src/infrastructure/mail/ses-mailer.ts` が `SESClient` を直接インスタンス化 (本実装済み)
- `INFRASTRUCTURE_MODE=aws` のまま VPS で動かすと `SQSClient` / `SESClient` の初期化は成功するが、実際の通信時に `UnknownEndpoint` または認証エラーで失敗する
- **影響:** 請求書通知メール・ユーザー招待メール・全ての email モードのアウトボックスイベントが失敗
- **ワーカーの動作:** ステータスが `failed` に遷移し、リトライ後 `dead` に積まれる

### CRITICAL: アウトボックスイベントの SQS 発行が停止

- **根拠:** `src/infrastructure/queue/sqs-queue.ts` が `SQSClient` を直接インスタンス化 (本実装済み)
- **影響:** queue モードのアウトボックスイベントが全滅
  - 請求書作成・確定、顧客作成・更新・削除、契約作成・更新、ユーザー招待の配信が止まる
- DB のアウトボックステーブルにイベントが溜まり続ける

### CRITICAL: データベース接続不可でアプリが起動しない

- **根拠:** `scripts/docker-entrypoint.sh` L5 で `prisma migrate deploy` を起動時に実行
- `DATABASE_URL` が旧 RDS エンドポイントのままだと、TCP 接続タイムアウトで起動失敗
- **影響:** コンテナが起動しない

### LOW: CloudWatch メトリクス出力が無効化 (運用上のみ影響)

- **根拠:** `src/infrastructure/metrics/cloudwatch-metrics.ts` は EMF 形式を stdout に出力するだけ
- ECS の `awslogs` ドライバーがなくなれば stdout は単なるログになる
- **影響:** アウトボックスの送信件数・失敗件数のメトリクスが集積されなくなる
- アプリケーション自体は動作継続 (best-effort 実装)

---

## 3. さくらのVPS で必要な環境変数一覧

### 必須 (値を更新して設定する)

| 環境変数 | 現在値 | VPS での値 | 用途 |
|---|---|---|---|
| `DATABASE_URL` | Secrets Manager 経由 | `postgresql://user:pass@localhost:5432/oadb` | PostgreSQL 接続 |
| `NEXTAUTH_SECRET` | Secrets Manager 経由 | `openssl rand -base64 32` で生成 | JWT 署名鍵 |
| `NEXTAUTH_URL` | `https://app.itf-oa.com` | 実際のドメイン (変わらない場合はそのまま) | NextAuth コールバック URL |
| `NODE_ENV` | `production` | `production` | Node.js モード |
| `APP_ENV` | `production` | `production` | アプリ動作環境 |
| `INFRASTRUCTURE_MODE` | `aws` | **`local`** ← 変更必須 | ファクトリの実装切り替え |
| `PORT` | (暗黙 3000) | `3000` | Next.js リスンポート |
| `HOSTNAME` | `0.0.0.0` | `0.0.0.0` | バインドアドレス |

### AWS 固有 (削除または不要)

| 環境変数 | 理由 |
|---|---|
| `AWS_REGION` | `INFRASTRUCTURE_MODE=local` では参照されない |
| `AWS_SES_FROM` | `local` モードでは LocalMailer が使われる |
| `AWS_SQS_QUEUE_URL` | `local` モードでは LocalQueue が使われる |
| `DISABLE_REAL_EMAIL_SEND` | `local` モードでは常に LocalMailer (送信しない) |
| `DISABLE_REAL_WEBHOOK_SEND` | `local` モードでは常に LocalWebhook |
| `ALLOWED_EMAIL_DOMAINS` | staging 安全ガード。VPS では不要 |
| `ALLOWED_WEBHOOK_HOSTS` | staging 安全ガード。VPS では不要 |

### オプション (設定しなくても動作する)

| 環境変数 | 用途 |
|---|---|
| `OUTBOX_ALERT_WEBHOOK_URL` | アウトボックス障害時の外部通知 Webhook |
| `OUTBOX_ALERT_EMAIL_TO` | アウトボックス障害時の通知メール宛先 |
| `CLOUDWATCH_METRICS_NAMESPACE` | メトリクス名前空間 (stdout 出力のみ) |

---

## 4. 別プロセスで動かす必要があるもの

### Next.js アプリケーションサーバー

- **起動:** `scripts/docker-entrypoint.sh` → `prisma migrate deploy` → `node server.js`
- **ポート:** 3000
- **担当:** Web UI、API ルート、ヘルスチェック (`/api/health`)

### アウトボックスポーラー (バックグラウンド処理)

**現在の実装: 独立プロセスではなく HTTP エンドポイント**

- **根拠:** `src/app/api/platform/outbox/poll/route.ts` がポーリングの HTTP エントリポイント
- `POST /api/platform/outbox/poll` を呼ぶと `src/outbox/poller.ts` の `runOutboxPollCycle()` が実行される
- 現在はプラットフォーム管理者が手動で呼ぶ設計

**アウトボックスパターンの実装構造:**

```
[APIハンドラ]
  → writeOutboxEvent(tx, eventType, payload)  # src/outbox/writer.ts
  → (コミット後) dispatchOutboxEvent(record)  # src/outbox/dispatcher.ts
  → executionMode に応じてルーティング:
      queue   → SqsQueue.publish()          # src/infrastructure/queue/sqs-queue.ts
      email   → queue 経由                  # ワーカーハンドラが処理
      webhook → queue 経由
      eventbus → EventBridgePublisher (stub)

[ポーラー HTTP エンドポイント]
  → runOutboxPollCycle()                    # src/outbox/poller.ts
  → consumeOutboxEventRecord(record)        # src/worker/consumer.ts
  → ハンドラ呼び出し (例: handleInvoiceCreated)  # src/worker/handlers/invoice-created.ts
  → Mailer.send() または Webhook.dispatch()
  → ステータス更新: sent / failed / dead
```

**ステータス遷移:**
```
pending → processing → sent
                   ↓
              failed → (retryCount < maxRetries) → pending (リトライ待機)
                     → (retryCount >= maxRetries) → dead
```

**VPS での自動ポーリング方法 (3択):**

```bash
# Option A: cron (最もシンプル)
* * * * * curl -s -X POST https://app.itf-oa.com/api/platform/outbox/poll \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -d '{"limit": 50}'
```

```ini
# Option B: systemd timer (本番推奨)
# /etc/systemd/system/outbox-poll.timer
[Timer]
OnBootSec=60s
OnUnitActiveSec=60s
```

```typescript
// Option C: Node.js 内蔵スケジューラ (コード変更あり)
// npm install node-cron が必要
```

---

## 5. 最小限のコード修正案

### CRITICAL (必須)

| 対応 | 内容 | 根拠 |
|---|---|---|
| 環境変数設定 | `INFRASTRUCTURE_MODE=local` をセット | `src/infrastructure/factory.ts` が mode で実装を切り替える |
| 環境変数設定 | `DATABASE_URL` を VPS の PostgreSQL エンドポイントに変更 | `src/lib/prisma.ts` が `DATABASE_URL` を参照 |
| 環境変数設定 | `NEXTAUTH_SECRET` を新規生成して設定 | `src/lib/auth.ts` が NextAuth JWT 署名に使用 |

> `INFRASTRUCTURE_MODE=local` に変更するだけで、SES → LocalMailer、SQS → LocalQueue に自動切り替えされる。コード変更は不要。

### CRITICAL (本番メールが必要な場合)

| ファイル | 変更内容 |
|---|---|
| `src/infrastructure/mail/smtp-mailer.ts` (新規) | `Mailer` インターフェースを実装。`nodemailer` または SendGrid SDK を使用 |
| `src/infrastructure/factory.ts` | `INFRASTRUCTURE_MODE=local` のとき SMTP mailer を返す分岐を追加 |
| `package.json` | `nodemailer` を追加 |

**なぜ必要か:** `INFRASTRUCTURE_MODE=local` では `LocalMailer` が使われ、メールはログ出力のみ。本番メールを送る場合は SMTP 実装が必要。

### CRITICAL (イベント配信の永続化が必要な場合)

| ファイル | 変更内容 |
|---|---|
| `src/infrastructure/queue/database-queue.ts` (新規) | `QueuePublisher` インターフェースを実装。DB テーブルにエンキュー |
| `src/infrastructure/factory.ts` | VPS モードのとき DB キューを返す分岐を追加 |

**なぜ必要か:** `LocalQueue` はメモリ内キュー。サーバー再起動で未処理イベントが消失する。

### オプション (今すぐ不要)

| 対応 | 内容 |
|---|---|
| `package.json` | `@aws-sdk/client-ses`, `@aws-sdk/client-sqs` を削除 (イメージサイズ削減) |
| `src/infrastructure/metrics/` | Prometheus エクスポーターに差し替え |

---

## 6. 運用方式の推奨

### 推奨: **Docker Compose**

**根拠:**

1. **コードがすでにコンテナ前提で構築されている**
   - `Dockerfile` が 3 ステージビルドで完成済み (`Dockerfile` L1-97)
   - `scripts/docker-entrypoint.sh` でマイグレーション → 起動の順序が保証されている
   - `next.config.ts` に `output: "standalone"` 設定済み

2. **PostgreSQL との依存関係を `depends_on` で明示できる**
   - DB が健全状態になってからアプリが起動するよう制御可能

3. **開発環境との一致**
   - 既存の Docker 環境をそのまま VPS に持っていける

4. **推奨構成:**
   ```yaml
   version: '3.8'
   services:
     app:
       build: .
       ports:
         - "3000:3000"
       environment:
         NODE_ENV: production
         APP_ENV: production
         INFRASTRUCTURE_MODE: local
         DATABASE_URL: postgresql://oa_user:oa_pass@postgres:5432/oadb
         NEXTAUTH_SECRET: ${NEXTAUTH_SECRET}
         NEXTAUTH_URL: https://app.itf-oa.com
       depends_on:
         postgres:
           condition: service_healthy

     postgres:
       image: postgres:15-alpine
       environment:
         POSTGRES_USER: oa_user
         POSTGRES_PASSWORD: oa_pass
         POSTGRES_DB: oadb
       volumes:
         - postgres_data:/var/lib/postgresql/data
       healthcheck:
         test: ["CMD-SHELL", "pg_isready -U oa_user"]
         interval: 10s
         timeout: 5s
         retries: 5

   volumes:
     postgres_data:
   ```

### systemd + Node.js 直接実行を選ぶ場合

- さくらのVPS の制約で Docker が使えない場合のみ
- Node.js バージョン管理 (nvm/volta) が別途必要
- PostgreSQL を OS に直接インストールする管理コストが生じる

**どちらの場合でも:** アウトボックスポーラーは `cron` または `systemd timer` で 1 分間隔の自動実行を追加すること。

---

## 7. AWSを解約してよいもの / まだ残すべきもの

### 解約・削除してよいもの

| AWS サービス | 根拠 |
|---|---|
| **ECS/Fargate** | 移行目的そのもの。VPS + Docker で置き換え |
| **ECR (コンテナレジストリ)** | Docker Hub またはローカルビルドで代替可能 |
| **SQS** | `INFRASTRUCTURE_MODE=local` で LocalQueue に切り替え可能 (永続化改善後) |
| **CloudWatch Logs** | stdout を Docker ログドライバーで管理。必要なら Loki/ELK |
| **CloudWatch Metrics** | EMF 出力は stdout のまま継続。Prometheus で代替可 |
| **EventBridge** | スタブ実装のみ。有効な SDK 呼び出しゼロ |
| **S3** | スタブ実装のみ。有効な SDK 呼び出しゼロ |
| **Secrets Manager** | VPS ではファイルベースの `.env` または systemd `EnvironmentFile` で代替 |
| **IAM ロール** | ECS 専用。VPS では不要 |
| **KMS** | Secrets Manager と同時に不要 |

### 移行後も残すか代替が必要なもの

| AWS サービス | 理由 | 代替手段 |
|---|---|---|
| **SES (メール)** | 本番メール送信に使用中。移行後も SMTP 代替が必要 | Postfix (VPS 直接) / SendGrid / Mailgun |
| **RDS (PostgreSQL)** | アクティブなデータベース。データ移行が必要 | VPS 上の PostgreSQL (Docker) |
| **Route 53 / ドメイン** | DNS 管理。ドメインを保持するなら継続 | さくらのドメイン等へ移管も可 |
| **ALB (ロードバランサ)** | 現在 HTTPS ターミネーションを担当 | VPS + Nginx リバースプロキシ + Let's Encrypt |
| **ACM (証明書)** | ALB と連動。ALB を解約すれば不要 | Let's Encrypt (certbot) で代替 |

### 解約の推奨順序

```
1. ECS サービス・タスク定義を削除
2. ALB + ターゲットグループを削除 → Nginx で代替
3. ECR リポジトリを削除
4. SQS キューを削除 (DB キュー実装後)
5. Secrets Manager シークレットを削除 (.env ファイルで管理)
6. CloudWatch ロググループを削除 (ログ移行後)
7. IAM ロール・ポリシーを削除
8. SES → SMTP 移行完了後に SES を削除
9. RDS → VPS PostgreSQL 移行完了・動作確認後に RDS を削除
```

---

*本レポートはコードの実際の内容を根拠としています。推測で記載した箇所はありません。*
