# さくらのVPS デプロイチェックリスト

---

## 事前条件

- [ ] VPS 1台目 (アプリ用) の SSH ログインができる
- [ ] VPS 2台目 (DB用) の SSH ログインができる
- [ ] ドメイン `app.itf-oa.com` の DNS A レコードが VPS 1台目の IP を指している

---

## VPS 1台目 (アプリ) の準備

### Docker / Docker Compose のインストール

```bash
# Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# ログアウトして再ログイン

# Docker Compose プラグイン確認
docker compose version
```

### Nginx のインストール

```bash
sudo apt update
sudo apt install -y nginx
```

### curl のインストール (outbox-poll.sh が使用)

```bash
sudo apt install -y curl
```

---

## VPS 2台目 (DB) の準備

**詳細手順は [`db-server-setup.md`](db-server-setup.md) を参照。**

概要:
- [ ] PostgreSQL 16 をインストール
- [ ] DB `oadb` / ユーザー `oa_user` を作成
- [ ] `listen_addresses` を設定
- [ ] `pg_hba.conf` で App VPS の IP のみ許可
- [ ] ファイアウォール (ufw) でポート 5432 を App VPS の IP のみ許可
- [ ] SSL の有無を判断して設定
- [ ] App VPS から `psql` で接続確認
- [ ] バックアップ cron を設定

---

## アプリのデプロイ

### リポジトリの配置

```bash
sudo mkdir -p /opt/oa-system
sudo chown $USER:$USER /opt/oa-system
git clone <repository-url> /opt/oa-system
# または scp / rsync でファイルを転送
```

### 環境変数の設定

```bash
cd /opt/oa-system/deploy/sakura
cp .env.example .env
chmod 600 .env
nano .env
# 以下を必ず設定する:
#   DATABASE_URL
#   NEXTAUTH_SECRET  (openssl rand -base64 32 の出力)
#   NEXTAUTH_URL
#   OUTBOX_POLL_LOGIN_ID
#   OUTBOX_POLL_PASSWORD
```

### Docker イメージのビルドと起動

```bash
cd /opt/oa-system/deploy/sakura

# イメージをビルドしてアプリを起動
docker compose build
docker compose up -d app

# ログ確認 (マイグレーション完了まで待つ)
docker compose logs -f app
```

マイグレーション完了のサイン:
```
[entrypoint] Running Prisma migrations...
[entrypoint] Starting Next.js...
```

### ヘルスチェック確認

```bash
curl -s http://127.0.0.1:3000/api/health
# 期待値: {"status":"ok"} HTTP 200
```

---

## Nginx の設定

```bash
# 設定ファイルを配置 (HTTP のみの初期設定)
sudo cp /opt/oa-system/deploy/sakura/nginx.conf.example \
        /etc/nginx/sites-available/oa-system

# ドメイン名を実際の値に編集 (app.itf-oa.com の場合は変更不要)
# sudo nano /etc/nginx/sites-available/oa-system

# デフォルトサイトを無効化 (競合防止)
sudo rm -f /etc/nginx/sites-enabled/default

# 有効化
sudo ln -s /etc/nginx/sites-available/oa-system \
           /etc/nginx/sites-enabled/oa-system
sudo nginx -t
sudo systemctl reload nginx

# HTTP でアプリにアクセスできることを確認
curl -s http://localhost/api/health
# → {"status":"ok"} が返ればOK

# Let's Encrypt 証明書の取得 (certbot が HTTPS 設定を自動追記する)
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d app.itf-oa.com

# certbot 完了後、nginx.conf.example 末尾のコメントにある
# セキュリティヘッダーを HTTPS server ブロック内に追記する
sudo nano /etc/nginx/sites-available/oa-system
sudo nginx -t && sudo systemctl reload nginx
```

---

## Outbox ポーリングの設定

```bash
# outbox-poll.sh に実行権限を付与
chmod +x /opt/oa-system/deploy/sakura/outbox-poll.sh

# systemd ユニットを配置
sudo cp /opt/oa-system/deploy/sakura/systemd-outbox-poll.service \
        /etc/systemd/system/outbox-poll.service
sudo cp /opt/oa-system/deploy/sakura/systemd-outbox-poll.timer \
        /etc/systemd/system/outbox-poll.timer

# EnvironmentFile のパスを確認 (/opt/oa-system/deploy/sakura/.env)
# sudo nano /etc/systemd/system/outbox-poll.service

# 有効化
sudo systemctl daemon-reload
sudo systemctl enable outbox-poll.timer
sudo systemctl start outbox-poll.timer

# 状態確認
sudo systemctl status outbox-poll.timer
sudo systemctl list-timers outbox-poll.timer
```

手動で1回テスト実行:
```bash
sudo systemctl start outbox-poll.service
sudo journalctl -u outbox-poll -n 20
```

---

## 動作確認

- [ ] `curl -s http://127.0.0.1:3000/api/health` → `{"status":"ok"}` が返る
- [ ] `https://app.itf-oa.com/login` がブラウザで表示される
- [ ] ログインできる
- [ ] `sudo journalctl -u outbox-poll -n 10` にエラーがない
- [ ] `docker compose logs app` に `ERROR` がない

---

## デプロイ更新 (2回目以降)

```bash
cd /opt/oa-system

# コードを更新
git pull

# イメージを再ビルドして再起動
cd deploy/sakura
docker compose build
docker compose up -d app

# マイグレーション確認
docker compose logs -f app
```

---

## ロールバック

```bash
cd /opt/oa-system/deploy/sakura

# 前のイメージタグに戻す
docker compose down
git checkout <前のコミット>
docker compose build
docker compose up -d app
```
