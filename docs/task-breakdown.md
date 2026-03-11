# タスク分解

## Phase 1: プロジェクト初期設定

- [ ] Next.js プロジェクト作成（App Router, TypeScript）
- [ ] Tailwind CSS + shadcn/ui セットアップ
- [ ] Prisma セットアップ + PostgreSQL 接続設定
- [ ] Docker Compose で PostgreSQL コンテナ定義
- [ ] Prisma スキーマ定義（users, customers, lease_contracts）
- [ ] 初回マイグレーション実行
- [ ] シードスクリプト作成（管理者ユーザー + サンプルデータ）
- [ ] NextAuth.js セットアップ（Credentials Provider + JWT）
- [ ] 認証ミドルウェア作成（未認証リダイレクト）
- [ ] 共通レイアウト作成（ヘッダー、レスポンシブ対応）
- [ ] 共通エラーハンドリング（API用ユーティリティ）

## Phase 2: 顧客管理

### API
- [ ] `GET /api/customers` — 一覧取得（検索・ソート・ページネーション）
- [ ] `GET /api/customers/:id` — 詳細取得（契約一覧含む）
- [ ] `POST /api/customers` — 新規登録（バリデーション付き）
- [ ] `PUT /api/customers/:id` — 更新
- [ ] `DELETE /api/customers/:id` — 削除（契約あり時は拒否）

### 画面
- [ ] SCR-010: 顧客一覧画面（テーブル + 検索バー + ページネーション）
- [ ] SCR-011: 顧客登録画面（フォーム + バリデーション）
- [ ] SCR-012: 顧客詳細画面（顧客情報 + 契約一覧表示）
- [ ] SCR-013: 顧客編集画面（登録フォームの再利用）

## Phase 3: 契約管理

### API
- [ ] `GET /api/contracts` — 一覧取得（ステータスフィルタ・検索）
- [ ] `GET /api/contracts/:id` — 詳細取得
- [ ] `POST /api/contracts` — 新規登録
- [ ] `PUT /api/contracts/:id` — 更新
- [ ] `DELETE /api/contracts/:id` — 削除

### 残回数計算
- [ ] `calculateRemainingMonths()` ユーティリティ関数の実装
- [ ] API レスポンスに `remainingMonths` を動的付与する共通処理

### 画面
- [ ] SCR-020: 契約登録画面（顧客紐付け）
- [ ] SCR-021: 契約詳細画面（残回数プログレスバー + ステータスバッジ）
- [ ] SCR-022: 契約編集画面
- [ ] 顧客詳細画面に契約一覧のハイライト表示（残3ヶ月以内）

## Phase 4: ユーザー管理

### API
- [ ] `GET /api/users` — 一覧取得（admin のみ）
- [ ] `GET /api/users/:id` — 詳細取得
- [ ] `POST /api/users` — 新規登録（パスワード bcrypt ハッシュ化）
- [ ] `PUT /api/users/:id` — 更新（パスワード変更オプション）
- [ ] `DELETE /api/users/:id` — 無効化（is_active = false）

### 画面
- [ ] SCR-030: ユーザー管理画面（一覧 + 登録/編集モーダル）
- [ ] admin ロール以外のアクセス制限

## Phase 5: PWA対応

- [ ] next-pwa プラグインの導入と設定
- [ ] Web App Manifest 作成（アイコン・テーマカラー・表示名）
- [ ] Service Worker 設定（キャッシュ戦略）
- [ ] レスポンシブ対応の調整（モバイルカード表示）
- [ ] PWA版での登録/編集/削除ボタン非表示制御
- [ ] モバイルヘッダー（ハンバーガーメニュー）
- [ ] 契約詳細の残回数を目立つ表示に調整

## Phase 6: バッチ処理

- [ ] ステータス自動更新バッチの実装（`POST /api/batch/update-contract-status`）
- [ ] Cron ジョブ設定（Vercel Cron or node-cron）
- [ ] バッチ実行ログの出力
- [ ] バッチ用 API 認証（シークレットキー）

## Phase 7: テスト・デプロイ

### テスト
- [ ] API ルートの単体テスト（Jest or Vitest）
- [ ] 残回数計算ロジックのテスト（境界値テスト）
- [ ] バッチ処理のテスト
- [ ] フォームバリデーションのテスト

### デプロイ
- [ ] 環境変数の整理（.env.example 作成）
- [ ] Vercel プロジェクト設定（または Docker 構成）
- [ ] 本番 DB のマイグレーション手順確認
- [ ] 本番シードデータ投入（管理者ユーザー）

## TODO（未対応・将来対応）

### PostgreSQL 移行時の対応
- [ ] `schema.prisma` の provider を `postgresql` に変更
- [ ] `@db.VarChar()`, `@db.Decimal()` 等の属性を復元
- [ ] `contains` 検索に `mode: 'insensitive'` を追加（顧客検索の大文字小文字対応）
- [ ] Docker Compose で PostgreSQL コンテナ定義を追加

### PWA 本番用アイコン生成
- [ ] `public/icons/icon.svg` から 192x192 / 512x512 の PNG を生成
- [ ] 生成ツール: RealFaviconGenerator, Figma, Canva 等
- [ ] `public/icons/icon-192.png`, `icon-512.png` をプレースホルダーから差し替え
- [ ] `manifest.json` の icons 設定を本番用に最終確認

### 契約の論理削除への統一
- [ ] 顧客は論理削除（`isDeleted` フラグ）だが、契約は現在物理削除
- [ ] 将来的に `LeaseContract` にも `isDeleted` カラムを追加し論理削除に統一
- [ ] 契約一覧・詳細の取得クエリに `isDeleted: false` 条件を追加
- [ ] 関連APIの DELETE エンドポイントを論理削除に変更

---

## 依存関係

```
Phase 1（初期設定）
  ├→ Phase 2（顧客管理）
  │    └→ Phase 3（契約管理）← 顧客が先に必要
  ├→ Phase 4（ユーザー管理）← Phase 1 完了後いつでも可
  └→ Phase 5（PWA対応）← Phase 2, 3 の画面完成後
       └→ Phase 6（バッチ処理）← Phase 3 完了後
            └→ Phase 7（テスト・デプロイ）← 全Phase完了後
```
