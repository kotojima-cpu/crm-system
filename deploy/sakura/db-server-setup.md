# DB サーバー構築手順 (さくらのVPS 2台目)

対象 OS: **Ubuntu 24.04 LTS**
PostgreSQL: **16** (Ubuntu 24.04 デフォルト)

> このドキュメントは OA 顧客管理システム専用。
> Prisma スキーマ (`prisma/schema.prisma`) を前提に記述している。

---

## 事前に決めておく値

| 項目 | 例 | 備考 |
|---|---|---|
| DB ユーザー名 | `oa_user` | 変更可 |
| DB パスワード | (ランダム生成) | `openssl rand -base64 24` で生成 |
| DB 名 | `oadb` | Prisma マイグレーションがこの DB に適用される |
| App VPS の IP | `153.xxx.xxx.xxx` | pg_hba.conf で許可する唯一の IP |
| DB VPS の IP | `153.yyy.yyy.yyy` | App VPS の .env `DATABASE_URL` に記載する |

---

## 1. SSH ログインと初期アップデート

```bash
ssh user@【DB_VPS_IP】

sudo apt update && sudo apt upgrade -y
sudo reboot
```

---

## 2. PostgreSQL のインストール

```bash
sudo apt install -y postgresql postgresql-contrib

# バージョン確認
psql --version
# → psql (PostgreSQL) 16.x

# サービス状態の確認
sudo systemctl status postgresql
```

---

## 3. DB とユーザーの作成

```bash
# パスワードを生成してメモしておく
openssl rand -base64 24

sudo -u postgres psql <<'SQL'
-- ユーザー作成
CREATE USER oa_user WITH PASSWORD '【↑で生成したパスワード】';

-- データベース作成 (owner = oa_user)
CREATE DATABASE oadb
  OWNER oa_user
  ENCODING 'UTF8'
  LC_COLLATE 'ja_JP.UTF-8'
  LC_CTYPE 'ja_JP.UTF-8'
  TEMPLATE template0;

-- oa_user に oadb 内の全権限を付与 (owner なので暗黙で付与済みだが明示)
GRANT ALL PRIVILEGES ON DATABASE oadb TO oa_user;
SQL
```

> `ja_JP.UTF-8` ロケールがない場合:
> ```bash
> sudo locale-gen ja_JP.UTF-8
> sudo update-locale
> ```
> その後 PostgreSQL を再起動してからやり直す。

### 作成確認

```bash
sudo -u postgres psql -c "\l" | grep oadb
# → oadb | oa_user | UTF8 | ja_JP.UTF-8 | ...
```

---

## 4. 外部接続の許可

### 4-1. listen_addresses の変更

```bash
# PostgreSQL 設定ファイルの場所を確認
sudo -u postgres psql -c "SHOW config_file;"
# → /etc/postgresql/16/main/postgresql.conf

sudo nano /etc/postgresql/16/main/postgresql.conf
```

以下の行を見つけて変更:

```
# 変更前
#listen_addresses = 'localhost'

# 変更後
listen_addresses = 'localhost,【DB_VPS自身のIP】'
```

> `'*'` でも動くが、必要最小限に絞る方が安全。
> プライベート IP がある場合はプライベート IP を記載する。

### 4-2. pg_hba.conf の設定

```bash
sudo nano /etc/postgresql/16/main/pg_hba.conf
```

ファイル末尾に **App VPS の IP だけ** を許可するルールを追加:

```
# === OA System App VPS ===
# TYPE  DATABASE  USER     ADDRESS              METHOD
host    oadb      oa_user  【App_VPS_IP】/32     scram-sha-256
```

**考え方:**
- `/32` = 単一 IP のみ許可 (サブネット全体を開けない)
- `scram-sha-256` = PostgreSQL 14+ 推奨の認証方式
- `oadb` / `oa_user` を明示して他の DB / ユーザーへのアクセスを遮断
- VPN やプライベートネットワークがある場合はそのアドレスを使う

### 4-3. PostgreSQL の再起動

```bash
sudo systemctl restart postgresql

# リスンポート確認
sudo ss -tlnp | grep 5432
# → 0.0.0.0:5432 または 【DB_VPS_IP】:5432 が表示される
```

---

## 5. ファイアウォール (ufw) の設定

```bash
# App VPS の IP のみ PostgreSQL ポートを許可
sudo ufw allow from 【App_VPS_IP】/32 to any port 5432 proto tcp comment "OA App VPS"

# SSH は許可済みか確認
sudo ufw status

# ufw が無効なら有効化 (SSH が許可されていることを必ず確認してから)
sudo ufw enable
```

---

## 6. SSL の設定 (分岐)

### パターン A: SSL なし (同一 DC / プライベートネットワーク)

さくらのVPS 同士が同じデータセンター内にあり、ローカル接続ネットワーク (プライベート IP) を使用する場合は SSL なしでも実用上問題ない。

**App VPS の DATABASE_URL:**
```
postgresql://oa_user:【パスワード】@【DB_VPS_IP】:5432/oadb
```

(`?sslmode=require` を付けない)

### パターン B: SSL あり (グローバル IP 間の通信)

VPS 同士がグローバル IP で通信する場合は SSL を有効にする。

```bash
# PostgreSQL の SSL 設定
sudo nano /etc/postgresql/16/main/postgresql.conf
```

```
ssl = on
ssl_cert_file = '/etc/ssl/certs/ssl-cert-snakeoil.pem'
ssl_key_file = '/etc/ssl/private/ssl-cert-snakeoil.key'
```

> Ubuntu 24.04 は `ssl-cert` パッケージが標準インストールされており、
> 自己署名証明書が `/etc/ssl/certs/ssl-cert-snakeoil.pem` にある。
> 内部通信用途にはこれで十分。

pg_hba.conf を `hostssl` に変更:

```
# 変更前
host    oadb  oa_user  【App_VPS_IP】/32  scram-sha-256

# 変更後 (SSL 必須)
hostssl oadb  oa_user  【App_VPS_IP】/32  scram-sha-256
```

```bash
sudo systemctl restart postgresql
```

**App VPS の DATABASE_URL:**
```
postgresql://oa_user:【パスワード】@【DB_VPS_IP】:5432/oadb?sslmode=require
```

---

## 7. 接続確認 (App VPS から実行)

App VPS に SSH して以下を実行:

```bash
# psql がなければインストール
sudo apt install -y postgresql-client

# 接続テスト
psql "postgresql://oa_user:【パスワード】@【DB_VPS_IP】:5432/oadb" -c "SELECT version();"
```

成功すれば以下のような出力:

```
                          version
------------------------------------------------------------
 PostgreSQL 16.x on x86_64-pc-linux-gnu, compiled by ...
(1 row)
```

### 接続できない場合のチェック項目

| 症状 | 確認すること |
|---|---|
| `Connection refused` | DB VPS の `listen_addresses` / ufw / PostgreSQL が起動しているか |
| `no pg_hba.conf entry` | pg_hba.conf に App VPS の IP が正しく書かれているか |
| `password authentication failed` | パスワードが正しいか、ユーザー名が合っているか |
| `SSL connection is required` | `?sslmode=require` と DB 側の SSL 設定が一致しているか |
| タイムアウト | DB VPS の IP が正しいか、ネットワーク / FW がブロックしていないか |

---

## 8. DATABASE_URL への反映

App VPS の `.env` に以下を設定:

```bash
# SSL なしの場合
DATABASE_URL=postgresql://oa_user:【パスワード】@【DB_VPS_IP】:5432/oadb

# SSL ありの場合
DATABASE_URL=postgresql://oa_user:【パスワード】@【DB_VPS_IP】:5432/oadb?sslmode=require
```

設定箇所: `/opt/oa-system/deploy/sakura/.env`

> パスワードに `@`, `:`, `/`, `%` などの特殊文字が含まれる場合は
> URL エンコードが必要。`openssl rand -base64 24` は通常安全だが、
> `+` や `/` が含まれることがある。心配なら `openssl rand -hex 16` を使う。

---

## 9. バックアップの運用

### 日次フルバックアップ (最低限)

```bash
# バックアップスクリプトを作成
sudo mkdir -p /opt/backup/postgresql
sudo nano /opt/backup/postgresql/daily-backup.sh
```

```bash
#!/bin/bash
set -e

BACKUP_DIR="/opt/backup/postgresql"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/oadb_${TIMESTAMP}.sql.gz"
KEEP_DAYS=14

# バックアップ実行
sudo -u postgres pg_dump oadb | gzip > "$BACKUP_FILE"
chmod 600 "$BACKUP_FILE"

# 古いバックアップを削除
find "$BACKUP_DIR" -name "oadb_*.sql.gz" -mtime +${KEEP_DAYS} -delete

echo "[backup] Created: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
```

```bash
sudo chmod +x /opt/backup/postgresql/daily-backup.sh

# cron に登録 (毎日 03:00 に実行)
sudo crontab -e
```

```
0 3 * * * /opt/backup/postgresql/daily-backup.sh >> /var/log/oadb-backup.log 2>&1
```

### 手動バックアップ (デプロイ前など)

```bash
sudo -u postgres pg_dump oadb | gzip > /opt/backup/postgresql/oadb_manual_$(date +%Y%m%d).sql.gz
```

### リストア手順

```bash
# 既存 DB を削除して再作成
sudo -u postgres dropdb oadb
sudo -u postgres createdb -O oa_user -E UTF8 oadb

# バックアップからリストア
gunzip -c /opt/backup/postgresql/oadb_20260320_030000.sql.gz | sudo -u postgres psql oadb
```

---

## 10. PostgreSQL のチューニング (小規模向け)

さくらのVPS (メモリ 1〜2GB) 向けの最低限の設定:

```bash
sudo nano /etc/postgresql/16/main/postgresql.conf
```

```
# 接続数 (Next.js standalone + Prisma のコネクションプール)
max_connections = 50

# メモリ (VPS のメモリの 25% 程度)
shared_buffers = 256MB
effective_cache_size = 512MB
work_mem = 4MB
maintenance_work_mem = 64MB

# WAL
wal_buffers = 8MB

# ログ (スロークエリを記録)
log_min_duration_statement = 500
```

```bash
sudo systemctl restart postgresql
```

---

## まとめ

### ユーザーが手で決める値

| 項目 | 決め方 |
|---|---|
| DB パスワード | `openssl rand -base64 24` (または `-hex 16`) で生成。安全な場所にメモ |
| SSL の有無 | VPS 同士がプライベートネットワークで接続できるか確認して判断 |
| バックアップ保持日数 | デフォルト 14 日。ディスク容量に応じて調整 |

### 先に確認すべきこと

1. **さくらのVPS 2台が同じリージョン / データセンターか** — ローカル接続ネットワーク (プライベート IP) が使えるかどうかで SSL 方針が変わる
2. **DB VPS のメモリとディスクサイズ** — PostgreSQL チューニング値とバックアップ保持日数に影響
3. **App VPS のグローバル IP** — pg_hba.conf と ufw に設定する値

### DB 構築後に次やること

1. App VPS から `psql` で接続確認
2. App VPS の `.env` に `DATABASE_URL` を設定
3. `docker compose build && docker compose up -d app` でアプリを起動
4. `docker compose logs -f app` で `[entrypoint] Running Prisma migrations...` が成功することを確認
5. `first-boot.md` の「初期ユーザー作成」に進む
