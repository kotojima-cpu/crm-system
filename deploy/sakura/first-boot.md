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

## 3. 初期ユーザーの作成

マイグレーション完了後、**ホスト側** (VPS の OS) から初期ユーザーを作成する。

> **注意:** `prisma/seed.ts` はセキュリティ上コンテナイメージに含めていない。
> ホスト側に Node.js がない場合は、コンテナ内の Prisma CLI で直接 SQL を実行する。

### 方法 A: ホスト側で seed を実行 (Node.js がある場合)

```bash
cd /opt/oa-system

# 依存インストール (初回のみ)
npm ci

# DATABASE_URL をセットしてシードを実行
export DATABASE_URL="postgresql://oa_user:【パスワード】@【DB_VPS_IP】:5432/oadb"
npx tsx prisma/seed.ts
```

### 方法 B: コンテナ内で SQL を直接実行 (Node.js 不要)

```bash
cd /opt/oa-system/deploy/sakura

# bcrypt ハッシュを生成 (コンテナ内 Node.js を利用)
HASH=$(docker compose exec -T app node -e \
  "require('bcryptjs').hash('【パスワード】',12).then(h=>process.stdout.write(h))")

# Tenant を作成
docker compose exec -T app node node_modules/prisma/build/index.js db execute \
  --datasource-url "$DATABASE_URL" \
  --stdin <<EOF
INSERT INTO tenants (name, status, created_at, updated_at)
VALUES ('デフォルトテナント', 'active', NOW(), NOW())
ON CONFLICT DO NOTHING;
EOF

# platform_admin ユーザーを作成
docker compose exec -T app node node_modules/prisma/build/index.js db execute \
  --datasource-url "$DATABASE_URL" \
  --stdin <<EOF
INSERT INTO users (tenant_id, login_id, password_hash, name, role, is_active, created_at, updated_at)
VALUES (
  (SELECT id FROM tenants LIMIT 1),
  'platform_admin',
  '${HASH}',
  'プラットフォーム管理者',
  'platform_admin',
  true,
  NOW(),
  NOW()
)
ON CONFLICT (login_id) DO NOTHING;
EOF
```

### 作成後の確認

```bash
# .env に platform_admin の認証情報をセット
nano /opt/oa-system/deploy/sakura/.env
# OUTBOX_POLL_LOGIN_ID=platform_admin
# OUTBOX_POLL_PASSWORD=【上で設定したパスワード】
```

> **既存の seed.ts は `admin` (role: admin) と `sales01` (role: sales) のみ作成する。**
> outbox ポーリングには `platform_admin` ロールが必要なため、
> 上記いずれかの方法で明示的に作成すること。

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
