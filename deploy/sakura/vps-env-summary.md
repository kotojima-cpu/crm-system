# VPS 環境変数まとめ

---

## 必須変数 (手入力が必要なもの)

| 変数名 | 設定値の例 | 入手方法 |
|---|---|---|
| `DATABASE_URL` | `postgresql://oa_user:【パスワード】@【DB VPS IP】:5432/oadb?sslmode=require` | DB VPS を構築後に確定 |
| `NEXTAUTH_SECRET` | (ランダム文字列) | `openssl rand -base64 32` で生成 |
| `NEXTAUTH_URL` | `https://app.itf-oa.com` | ドメインが確定したら設定 |
| `OUTBOX_POLL_LOGIN_ID` | `platform_admin` のログインID | DB シード後に確認 |
| `OUTBOX_POLL_PASSWORD` | `platform_admin` のパスワード | DB シード後に確認 |

---

## 固定値 (変更不要)

| 変数名 | 値 | 理由 |
|---|---|---|
| `NODE_ENV` | `production` | Next.js 本番モード |
| `APP_ENV` | `production` | 外部送信ガードを有効にする |
| `INFRASTRUCTURE_MODE` | `local` | LocalMailer / LocalQueue を使用 |
| `PORT` | `3000` | Next.js リスンポート |
| `HOSTNAME` | `0.0.0.0` | コンテナ内バインドアドレス |

---

## INFRASTRUCTURE_MODE=local の動作

`INFRASTRUCTURE_MODE=local` を設定すると、`src/infrastructure/factory.ts` のファクトリが以下のように切り替わる:

| 機能 | local モードの実装 | 動作 |
|---|---|---|
| メール送信 | `LocalMailer` | **実際には送信しない。** ログに `[LocalMailer] Mail send (dry-run)` と出力される |
| キュー発行 | `LocalQueue` | **メモリ内にのみ保存。** 再起動で消える |
| Webhook 送信 | `LocalWebhook` | **実際には送信しない。** ログに dry-run と出力される |
| シークレット取得 | `EnvSecretProvider` | 環境変数から直接読む (Secrets Manager 不要) |
| オブジェクトストレージ | `LocalStorage` | メモリ内のみ |

根拠: `src/infrastructure/factory.ts` L47-101 のすべてのファクトリ関数が `getInfrastructureMode() === "aws"` で分岐。

---

## APP_ENV=production + INFRASTRUCTURE_MODE=local の組み合わせ

`src/infrastructure/config.ts` の `isExternalSendAllowed()` は `APP_ENV=production` のとき `true` を返すが、
実際の送信実装として `LocalMailer` / `LocalWebhook` が選ばれているため、外部送信は行われない。

```
isRealEmailSendAllowed() → true (production環境のため)
createMailer() → LocalMailer (INFRASTRUCTURE_MODE=local のため)
LocalMailer.send() → ログ出力のみ (dry-run)
```

この組み合わせは意図的。将来 SMTP 実装を追加したときに `APP_ENV` 判定が正しく機能する。

---

## 不要な変数 (削除してよい)

| 変数名 | 理由 |
|---|---|
| `AWS_REGION` | `INFRASTRUCTURE_MODE=local` では参照されない |
| `AWS_SES_FROM` | LocalMailer は参照しない |
| `AWS_SQS_QUEUE_URL` | LocalQueue は参照しない |
| `DISABLE_REAL_EMAIL_SEND` | local モードでは常に dry-run |
| `DISABLE_REAL_WEBHOOK_SEND` | local モードでは常に dry-run |
| `ALLOWED_EMAIL_DOMAINS` | ステージング安全ガード。VPS 本番では不要 |
| `ALLOWED_WEBHOOK_HOSTS` | ステージング安全ガード。VPS 本番では不要 |

---

## オプション変数

| 変数名 | 値の例 | 用途 |
|---|---|---|
| `OUTBOX_ALERT_WEBHOOK_URL` | `https://hooks.example.com/alert` | dead イベント発生時の Webhook 通知 |
| `OUTBOX_ALERT_EMAIL_TO` | `ops@itf-oa.com` | dead イベント発生時のメール通知 |
| `OUTBOX_POLL_LIMIT` | `50` | 1 回のポーリングで処理する最大件数 (デフォルト: 50) |
