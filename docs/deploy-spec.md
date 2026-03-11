# デプロイ仕様書

## 概要

OA顧客管理システムのデプロイ構成を定義する。
Netlify を使用し、本番・テスト・PRプレビューの3環境を運用する。

---

## 環境構成

| 環境 | ブランチ | URL形式 | 用途 |
|---|---|---|---|
| **Production** | `main` | `https://<site-name>.netlify.app` | 本番環境 |
| **Staging** | `staging` | `https://staging--<site-name>.netlify.app` | テスト版（社内確認用） |
| **Deploy Preview** | PR ごと | `https://deploy-preview-<PR番号>--<site-name>.netlify.app` | PR 単位の動作確認 |

### 役割分担

- **Production**: 本番運用。main ブランチへのマージで自動デプロイ
- **Staging**: 社内メンバーが本番リリース前に動作確認する固定URL環境。staging ブランチへの push で自動デプロイ
- **Deploy Preview**: 開発者が PR 単位で変更を確認。PR 作成・更新時に自動デプロイ

---

## ブランチ運用

```
feature/* → PR → staging → main
                   ↓         ↓
              テスト版     本番
```

1. 機能開発は `feature/*` ブランチで行う
2. PR を作成 → Deploy Preview で動作確認
3. レビュー後、`staging` ブランチにマージ → Staging 環境で社内確認
4. 社内確認完了後、`main` ブランチにマージ → 本番デプロイ

---

## 環境変数

### 一覧

| 変数名 | Staging | Production | 説明 |
|---|---|---|---|
| `DATABASE_URL` | `file:./dev.db` | PostgreSQL の接続URL | データベース接続先 |
| `NEXTAUTH_SECRET` | テスト用の値 | 本番用の強力な値 | JWT署名シークレット |
| `NEXTAUTH_URL` | staging の URL | 本番の URL | NextAuth のベースURL |
| `APP_ENV` | `staging` (自動) | `production` (自動) | 環境識別子 |

### 重要ルール

- **秘密情報はリポジトリにコミットしない**
- 環境変数は全て **Netlify UI** の Site configuration > Environment variables で設定する
- `APP_ENV` は `netlify.toml` で各コンテキストに自動設定済み
- `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL` は Netlify UI で手動設定が必要

### Netlify UI での設定手順

1. Netlify ダッシュボード → 対象サイト → **Site configuration** → **Environment variables**
2. **Add a variable** をクリック
3. 以下を登録:

#### 全環境共通
なし（環境ごとに異なる値を使うため）

#### Staging 用（Scopes: All）
| Key | Value |
|---|---|
| `DATABASE_URL` | `file:./dev.db` |
| `NEXTAUTH_SECRET` | `staging-secret-<ランダム文字列>` |
| `NEXTAUTH_URL` | `https://staging--<site-name>.netlify.app` |

#### Production 用（Scopes: All）
| Key | Value |
|---|---|
| `DATABASE_URL` | PostgreSQL の接続URL |
| `NEXTAUTH_SECRET` | 本番用の強力なシークレット |
| `NEXTAUTH_URL` | `https://<site-name>.netlify.app` |

4. 環境ごとに異なる値を使う場合は、変数の **Different value for each deploy context** を選択

---

## ビルド設定

### netlify.toml

`netlify.toml` で以下を設定済み:

- ビルドコマンド: `npm run build:netlify`
- 各コンテキスト（production, staging, deploy-preview）の `APP_ENV` 自動設定
- PWA 関連ファイル（manifest.json, sw.js, icons）のキャッシュヘッダー

### build:netlify スクリプト

```
npx prisma generate → npx prisma migrate deploy → npx prisma db seed → next build
```

1. Prisma Client 生成
2. マイグレーション適用（SQLite の場合は DB ファイル作成）
3. シードデータ投入（テスト用ユーザー: admin/admin123, sales01/sales123）
4. Next.js ビルド

### 現在の制約

- **Staging / Deploy Preview は SQLite を使用**: Netlify のビルド環境で毎回 DB を作成・シードする。データは永続化されない（デプロイごとにリセット）
- **本番環境は PostgreSQL を想定**: 本番移行時に `prisma/schema.prisma` の provider 変更が必要（TODO として管理中）

---

## GitHub リポジトリへの push 手順

### 初回セットアップ

```bash
# 1. Git リポジトリを初期化
git init

# 2. 全ファイルをステージング
git add .

# 3. 初回コミット
git commit -m "初回コミット: OA顧客管理システム"

# 4. main ブランチに名前変更（デフォルトが master の場合）
git branch -M main

# 5. リモートリポジトリを追加
git remote add origin https://github.com/kotojima-cpu/crm-system.git

# 6. main ブランチを push
git push -u origin main

# 7. staging ブランチを作成して push
git checkout -b staging
git push -u origin staging

# 8. main ブランチに戻る
git checkout main
```

### push 前の確認事項

- [ ] `.env` がコミットに含まれていないこと（`.gitignore` で除外済み）
- [ ] `prisma/dev.db` がコミットに含まれていないこと（`.gitignore` で除外済み）
- [ ] `node_modules/` がコミットに含まれていないこと
- [ ] `package.json` がルートに存在すること
- [ ] `netlify.toml` がルートに存在すること
- [ ] `prisma/schema.prisma` が存在すること
- [ ] `prisma/migrations/` が存在すること（migrate deploy に必要）

### 日常の開発フロー

```bash
# feature ブランチで開発
git checkout -b feature/xxx
# ... 開発 ...
git add .
git commit -m "機能追加: xxx"
git push -u origin feature/xxx
# → GitHub で PR 作成 → Deploy Preview で確認

# staging にマージ（テスト版更新）
git checkout staging
git merge feature/xxx
git push origin staging
# → Staging 環境が自動更新

# 本番リリース
git checkout main
git merge staging
git push origin main
# → Production が自動デプロイ
```

---

## Netlify UI でのサイト設定手順

### 1. サイト作成

1. https://app.netlify.com にログイン
2. **Add new site** → **Import an existing project**
3. Git プロバイダー（GitHub）を選択
4. リポジトリを選択
5. Build settings:
   - **Build command**: `npm run build:netlify`（netlify.toml で自動設定）
   - **Publish directory**: `.next`（netlify.toml で自動設定）
6. **Deploy site** をクリック

### 2. Branch deploy の有効化

1. **Site configuration** → **Build & deploy** → **Branches and deploy contexts**
2. **Branch deploys** を **Let me add individual branches** に変更
3. `staging` を追加
4. **Deploy Previews** が **Automatically build deploy previews for all pull requests** になっていることを確認

### 3. 環境変数の設定

上記「環境変数」セクションの手順に従って設定する。

### 4. Next.js ランタイム

Netlify は `@netlify/plugin-nextjs` を自動検出する。
特別なプラグイン設定は不要。

---

## PWA の動作確認

各環境で以下が動作することを確認する:

- `/manifest.json` がアクセス可能
- `/sw.js` が登録される
- `/icons/icon-192.png`, `/icons/icon-512.png` が表示される
- `display: standalone` でインストール可能

### テスト環境での注意

- Netlify の staging URL は HTTPS で提供されるため、Service Worker は正常に動作する
- Deploy Preview URL も HTTPS のため同様に動作する

---

## データベースの環境分離

| 環境 | DB | データ | 永続性 |
|---|---|---|---|
| ローカル開発 | SQLite (`prisma/dev.db`) | seed データ | ローカルに永続 |
| Staging | SQLite (ビルド時作成) | seed データ | デプロイごとにリセット |
| Deploy Preview | SQLite (ビルド時作成) | seed データ | デプロイごとにリセット |
| Production | PostgreSQL | 本番データ | 永続 |

### テスト環境でのログイン情報

Staging / Deploy Preview では、ビルド時に以下のシードユーザーが作成される:

| ログインID | パスワード | ロール |
|---|---|---|
| `admin` | `admin123` | 管理者 |
| `sales01` | `sales123` | 営業 |
