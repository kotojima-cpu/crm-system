# 初回起動ガイド

初回起動時に必要な手順をまとめる。
2回目以降のデプロイは `deploy-checklist.md` の「デプロイ更新」セクションを参照。

---

## 1. 環境変数の設定

```bash
cd /opt/oa-system/deploy/sakura
cp .env.example .env
chmod 600 .env
```

`.env` を開いて以下の値を必ず埋める:

```bash
# NEXTAUTH_SECRET を生成して貼り付ける
openssl rand -base64 32
```

| 変数名 | 設定すること |
|---|---|
| `DATABASE_URL` | DB VPS の PostgreSQL 接続文字列 |
| `NEXTAUTH_SECRET` | 上記コマンドの出力値 |
| `NEXTAUTH_URL` | `https://app.itf-oa.com` (ドメインに合わせる) |
| `OUTBOX_POLL_LOGIN_ID` | platform_admin ユーザーのログインID (シード後に確認) |
| `OUTBOX_POLL_PASSWORD` | platform_admin ユーザーのパスワード (シード後に確認) |

---

## 2. ビルドと起動

```bash
cd /opt/oa-system/deploy/sakura
docker compose build
docker compose up -d app
```

初回起動時、`docker-entrypoint.sh` が自動的に `prisma migrate deploy` を実行する。
マイグレーション完了のログ:

```
[entrypoint] Running Prisma migrations...
[entrypoint] Starting Next.js...
   ▲ Next.js 16.x.x
   - Local: http://localhost:3000
```

---

## 3. 初期データの投入 (シード)

マイグレーション完了後、コンテナの中でシードを実行する:

```bash
docker compose exec app node node_modules/prisma/build/index.js db seed
```

シード完了後、`OUTBOX_POLL_LOGIN_ID` / `OUTBOX_POLL_PASSWORD` に設定するユーザーの
ログインID / パスワードを確認する (シードスクリプトの初期値を参照)。

---

## 4. Nginx のセットアップ

```bash
sudo cp /opt/oa-system/deploy/sakura/nginx.conf.example \
        /etc/nginx/sites-available/oa-system
sudo ln -s /etc/nginx/sites-available/oa-system \
           /etc/nginx/sites-enabled/oa-system
sudo nginx -t && sudo systemctl reload nginx

# HTTPS 証明書の取得
sudo certbot --nginx -d app.itf-oa.com
```

---

## 5. Outbox ポーリングの設定

```bash
chmod +x /opt/oa-system/deploy/sakura/outbox-poll.sh
sudo cp /opt/oa-system/deploy/sakura/systemd-outbox-poll.service \
        /etc/systemd/system/outbox-poll.service
sudo cp /opt/oa-system/deploy/sakura/systemd-outbox-poll.timer \
        /etc/systemd/system/outbox-poll.timer
sudo systemctl daemon-reload
sudo systemctl enable outbox-poll.timer
sudo systemctl start outbox-poll.timer
```

テスト実行:
```bash
sudo systemctl start outbox-poll.service
sudo journalctl -u outbox-poll -n 20
```

期待されるログ出力:
```
[outbox-poll] 2026-03-19T12:00:00+09:00 result={"data":{"sent":0,"failed":0,"dead":0,"skipped":0}}
```

---

## 6. ログ確認コマンド

```bash
# アプリログ
docker compose -f /opt/oa-system/deploy/sakura/docker-compose.yml logs -f app

# outbox poll ログ
sudo journalctl -u outbox-poll -f

# Nginx アクセスログ
sudo tail -f /var/log/nginx/oa-system-access.log
```

---

## LocalQueue / LocalMailer の運用上の制約

**現在の `INFRASTRUCTURE_MODE=local` では以下の機能が制限される。**

### キュー (LocalQueue)

- **動作:** `src/infrastructure/queue/local-queue.ts` — メモリ内にキューイング
- **制約:**
  - **アプリ再起動でキュー内のメッセージが全消失する**
  - 未処理のアウトボックスイベント (`queue` モード) が消える
- **影響を受けるイベント:**
  - `invoice.created`, `invoice.confirmed`
  - `customer.created/updated/deleted`
  - `contract.created/updated`
  - `tenant-user.invite.requested`
- **対策:**
  - outbox ポーラーを 60 秒間隔で動かすことで、DB に `pending` で残っているイベントを再処理できる
  - LocalQueue はあくまで「dispatch 直後の即時処理」に使われる。DB の OutboxEvent テーブルが信頼の源泉なので、再起動後もポーラーが DB を読んで処理を継続する

### メール (LocalMailer)

- **動作:** `src/infrastructure/mail/local-mailer.ts` — stdout に dry-run ログを出力
- **制約:**
  - **実際のメール送信は行われない**
  - 請求書通知・ユーザー招待メールはログに記録されるだけ
- **対策:**
  - 本番でメール送信が必要な場合は `smtp-mailer.ts` を実装して factory.ts に追加する (今後の対応)

### Webhook (LocalWebhook)

- **動作:** `src/infrastructure/webhook/local-webhook.ts` — dry-run ログのみ
- **制約:**
  - **外部 Webhook エンドポイントへの実際の通知は行われない**
- **対策:**
  - Webhook を実際に送信したい場合は `INFRASTRUCTURE_MODE=local` のままでは不可
  - factory.ts で `HttpWebhook` を返す分岐を追加する必要がある (今後の対応)

---

## 初回起動後の確認チェック

- [ ] `https://app.itf-oa.com/api/health` → `{"status":"ok"}`
- [ ] `https://app.itf-oa.com/login` がブラウザで表示される
- [ ] ログインできる
- [ ] `sudo journalctl -u outbox-poll -n 5` に結果が出ている
- [ ] `docker compose logs app` に `ERROR` がない
