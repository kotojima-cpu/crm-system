# SaaS化 タスクブレークダウン

## 1. フェーズ概要

| フェーズ | 名称 | 期間目安 | 概要 |
|---------|------|---------|------|
| **Phase 0** | **PoC 検証** | **2〜3日** | **Prisma + RLS の技術的前提を検証** |
| Phase 1 | マルチテナント基盤 | 4〜5週間 | テナントモデル・認証・データ分離・RLS |
| Phase 2 | 運営管理・課金 | 3〜4週間 | 運営管理画面・請求管理 |
| Phase 3 | セキュリティ強化 | 2〜3週間 | パスワードポリシー・2FA・監査ログ強化 |
| Phase 4 | 通知・レポート・仕上げ | 2〜3週間 | お知らせ配信・利用レポート・テスト・移行 |

---

## 1.5. Phase 0: PoC 検証（Phase 1 着手前に必須）

### 目的

Phase 1 の実装開始前に、`withTenantTx` パターン（Prisma `$transaction` + `SET LOCAL` + RLS）の技術的前提を検証する。致命的問題が発覚した場合、設計の根本変更が必要になるため最優先で実施する。

### タスク一覧

| # | タスク | 成功基準 | 失敗時の代替案 | 見積り |
|---|--------|---------|--------------|-------|
| 0-1 | Prisma `$transaction` + `SET LOCAL` 動作検証 | `$transaction` 内で `SET LOCAL app.current_tenant_id` が有効で、commit 後にリセットされること | Prisma を `$queryRaw` のみで使用し、クエリビルダーを自前実装 | 0.5日 |
| 0-2 | 並行リクエストでのコンテキスト分離検証 | 2つの `withTenantTx` を `Promise.all` で同時実行し、tenantId が混在しないこと | `SET LOCAL` で解決済みのはず。失敗時は Prisma バージョン変更 or `datasourceUrl` 分離 | 0.5日 |
| 0-3 | Docker PostgreSQL RLS 有効化検証 | `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + ポリシー設定が Docker 環境で動作すること | PostgreSQL バージョンを 15+ に固定 | 0.5日 |
| 0-4 | Prisma Extensions バイパス + RLS 防御テスト | Extensions を経由しない `$queryRaw` でも RLS がテナントフィルタを強制すること | RLS を捨てる方向にはしない。失敗時は以下を順に検討: (1) RLS ポリシー定義の SQL を見直す（`FORCE ROW LEVEL SECURITY` の確認、ポリシー条件の修正）(2) DB ロール設計を見直す（権限付与の不足、ロール切替の問題）(3) Prisma の接続方式を見直す（`$queryRaw` の実行コンテキスト確認）(4) 必要なら tenant / platform 接続分離（0-6 の案A/B）を採用 | 0.5日 |
| 0-5 | `app_tenant_role` / `app_platform_role` 権限差分検証 | `SET LOCAL ROLE app_tenant_role` 時に RLS 適用、`SET LOCAL ROLE app_platform_role` 時に BYPASSRLS が機能すること | ロールベース BYPASS が使えない場合、`current_setting` の値で platform_admin を判定する代替ポリシー | 0.5日 |
| 0-6 | DB ロール分離方式の検証 | 現行案（`app_user` に両ロール付与）vs 接続分離案（`app_tenant_user` / `app_platform_user` 分離）vs 別 datasource 案。セキュリティリスクと運用コストを評価し方式を最終決定する | 接続分離案を採用する場合、Prisma Client を2つ管理する設計に変更 | 0.5日 |

**Phase 0 完了時に SET LOCAL ROLE の採否を確定し、不採用の場合は代替案を選定する。**

#### SET LOCAL ROLE 採用の判断基準

以下の全条件を満たした場合のみ、SET LOCAL ROLE パターンを正式採用する:

1. `$transaction` 内で `SET LOCAL ROLE` した role が後続クエリに適用されること
2. transaction 終了後に role が残留しないこと（コネクションプール汚染なし）
3. 並行 transaction で role が混在しないこと（`Promise.all` テスト）
4. RLS が `SET LOCAL ROLE` に応じて正常に適用/BYPASS されること

不成立時の代替案（優先順に検討）:
1. RLS ポリシー定義の SQL 修正
2. DB ロール設計の見直し
3. Prisma 接続方式の変更
4. tenant / platform 接続プール分離（security-design.md §1.3.1 案A）
5. platform 用 datasource 分離（security-design.md §1.3.1 案B）

**Phase 0 合計: 約3日（2〜3日）**

### 検証環境

- Docker PostgreSQL 15+（現行の `docker-compose.yml` を使用）
- Prisma Client（現行バージョン）
- テスト用スクリプト: `src/__tests__/poc/` に配置

### 判断基準

- 0-1 が失敗 → **設計根本変更が必要**（`withTenantTx` パターンが成立しない）
- 0-2〜0-5 が失敗 → 代替案で対応可能（設計は維持）

---

## 2. Phase 1: マルチテナント基盤

### 2.1 タスク一覧

| # | タスク | 依存 | 影響範囲 | 見積り |
|---|--------|------|---------|-------|
| 1-1 | Tenant モデル作成（Prisma スキーマ + マイグレーション） | なし | schema.prisma | 0.5日 |
| 1-2 | 既存テーブルに tenant_id カラム追加（マイグレーション） | 1-1 | schema.prisma | 1日 |
| 1-3 | 既存データにデフォルトテナント設定（データマイグレーション） | 1-2 | DB | 0.5日 |
| 1-4 | User モデル拡張（role変更, tenantId, 2FA関連カラム） | 1-2 | schema.prisma | 0.5日 |
| 1-5 | next-auth.d.ts 型定義拡張 | なし | types/next-auth.d.ts | 0.5日 |
| 1-6 | NextAuth authorize 関数変更（テナントチェック追加） | 1-4, 1-5 | lib/auth.ts | 1日 |
| 1-7 | JWT / session コールバック変更（tenantId, role 追加） | 1-6 | lib/auth.ts | 0.5日 |
| 1-8 | getSessionUser 拡張（tenantId 返却） | 1-7 | lib/session.ts | 0.5日 |
| 1-9 | **RLS 設計・DB ロール作成** | 1-2 | マイグレーション SQL | 1日 |
| 1-10 | **RLS ポリシー作成（6テーブル分）** | 1-9 | マイグレーション SQL | 1.5日 |
| 1-11 | **withTenantTx / withPlatformTx 実装**（SET LOCAL + $transaction パターン）+ Prisma Extensions（補助） | Phase 0, 1-10 | lib/prisma-tenant.ts（新規） | 2日 |
| 1-12 | **認可 helper 作成（requireTenantAccess, requirePlatformAccess, assertTenantOwnership）** | 1-8 | lib/auth-guard.ts（新規） | 1.5日 |
| 1-13 | middleware 変更（テナント停止チェック、platform ルート保護） | 1-7 | middleware.ts | 1日 |
| 1-14 | 顧客 API 修正（三重防御適用） | 1-11, 1-12 | api/customers/* | 1日 |
| 1-15 | 契約 API 修正（三重防御適用） | 1-11, 1-12 | api/contracts/* | 1日 |
| 1-16 | ユーザー API 修正（テナントスコープ） | 1-11, 1-12 | api/users/* | 1日 |
| 1-17 | contractNumber ユニーク制約変更（テナント内ユニーク） | 1-2 | schema.prisma | 0.5日 |
| 1-18 | バッチ処理修正（テナント停止スキップ） | 1-2 | api/batch/* | 0.5日 |
| 1-19 | 監査ログに tenantId 付与 | 1-2 | lib/audit.ts | 0.5日 |
| 1-20 | ヘッダーコンポーネント修正（ロール別メニュー表示） | 1-7 | components/header.tsx | 0.5日 |
| 1-21 | ログイン画面修正（テナント停止エラー表示） | 1-13 | app/login/page.tsx | 0.5日 |
| 1-22 | **RLS 動作確認テスト** | 1-10 | テスト | 1日 |
| 1-23 | **テナント分離 E2E テスト（三重防御の各レイヤーを検証）** | 1-14, 1-15 | テスト | 2日 |
| 1-24 | **認可 helper テスト** | 1-12 | テスト | 1日 |
| 1-25 | **Prisma Extensions バイパス時の RLS 防御テスト** | 1-10, 1-11 | テスト | 0.5日 |

**Phase 1 合計: 約21日（4〜5週間）**

### 2.2 既存機能への影響

- **全 API ルート**: `requireTenantAccess()` + `withTenantTx(tenantId, fn)` パターンに統一
- **ログインフロー**: テナントステータスチェックの追加（authorize は素の prisma を使用、RLS 未適用）
- **ユーザー管理**: `role` の値が `admin`→`tenant_admin` に変更
- **バッチ処理**: `withPlatformTx` 内で停止テナントのスキップロジック追加
- **contract-cache.ts**: `withTenantTx` 内でテナントスコープ適用（refreshRemainingCountCache に tenantId パラメータ追加）
- **contract-utils.ts**: 変更なし（純粋関数のため影響なし）
- **PWA**: 変更なし（データ分離は API 層で実施）
- **tenantId 決定ルール**: 全 API で authContext.tenantId（JWT 由来）のみ使用。リクエストボディ/クエリからの tenantId 取得は禁止

---

## 3. Phase 2: 運営管理・課金

### 3.1 タスク一覧

| # | タスク | 依存 | 見積り |
|---|--------|------|-------|
| 2-1 | Invoice モデル作成（Prisma スキーマ + マイグレーション） | Phase 1 | 0.5日 |
| 2-2 | platform_admin ユーザー作成・シード | Phase 1 | 0.5日 |
| 2-3 | Platform テナント CRUD API | Phase 1 | 2日 |
| 2-4 | テナント停止/再開 API | 2-3 | 1日 |
| 2-5 | 請求生成バッチ API（暦月単位、softLimit ベース超過計算、advisory lock による二重実行防止、冪等性保証） | 2-1 | 2日 |
| 2-6 | 請求管理 API（一覧・詳細・ステータス変更・手動調整） | 2-1 | 2日 |
| 2-7 | Platform ダッシュボード画面（softLimit/hardLimit到達表示含む） | 2-3 | 1.5日 |
| 2-8 | テナント一覧画面（顧客数/SL/HL 表示） | 2-3 | 1日 |
| 2-9 | テナント登録画面（customerLimit/softLimit/hardLimit設定UI含む） | 2-3 | 1.5日 |
| 2-10 | テナント詳細画面（SL/HL 対比の利用率表示） | 2-3 | 1.5日 |
| 2-11 | テナント編集画面（SL/HL 編集可能） | 2-3 | 1日 |
| 2-12 | 請求一覧画面（超過件数表示） | 2-6 | 1.5日 |
| 2-13 | 請求詳細画面（softLimit/hardLimit/超過件数表示、手動調整含む） | 2-6 | 1.5日 |
| 2-14 | Platform 用レイアウト・ナビゲーション | 2-2 | 1日 |
| 2-15 | 顧客登録時の softLimit/hardLimit チェック API 修正 | 2-3 | 0.5日 |
| 2-16 | テナント側請求履歴閲覧画面 | 2-6 | 1日 |

**Phase 2 合計: 約20日（3〜4週間）**

---

## 4. Phase 3: セキュリティ強化

### 4.1 タスク一覧

| # | タスク | 依存 | 見積り |
|---|--------|------|-------|
| 3-1 | PasswordPolicy モデル作成 | Phase 1 | 0.5日 |
| 3-2 | パスワードバリデーション関数実装 | 3-1 | 1日 |
| 3-3 | パスワードポリシー設定 API（tenant_admin用） | 3-1 | 1日 |
| 3-4 | パスワードポリシー設定画面 | 3-3 | 1日 |
| 3-5 | ユーザー登録・パスワード変更にポリシー適用 | 3-2 | 1日 |
| 3-6 | パスワード有効期限チェック＋強制変更画面 | 3-2 | 1.5日 |
| 3-7 | アカウントロックアウト実装 | 3-1 | 1日 |
| 3-8 | 2FA TOTP: otplib 導入・secret生成・QRコード生成 | Phase 1 | 1日 |
| 3-9 | 2FA 設定画面（QR表示・コード確認） | 3-8 | 1.5日 |
| 3-10 | 2FA ログインフロー（/login/2fa 画面 + verify API） | 3-8 | 2日 |
| 3-11 | RecoveryCode モデル・生成・検証 | 3-8 | 1日 |
| 3-12 | 2FA 強制設定（テナント単位） | 3-9, 3-1 | 0.5日 |
| 3-13 | 監査ログ拡張（userAgent, requestPath 追加） | Phase 1 | 0.5日 |
| 3-14 | 監査ログ保持期限バッチ | 3-13 | 0.5日 |
| 3-15 | セキュリティ関連テスト | 3-7, 3-10 | 2日 |

**Phase 3 合計: 約16日（2〜3週間）**

---

## 5. Phase 4: 通知・レポート・仕上げ

### 5.1 タスク一覧

| # | タスク | 依存 | 見積り |
|---|--------|------|-------|
| 4-1 | Announcement / TenantAnnouncement モデル作成 | Phase 1 | 0.5日 |
| 4-2 | お知らせ CRUD API（platform_admin用） | 4-1 | 1.5日 |
| 4-3 | お知らせ配信バッチ（予約配信） | 4-2 | 1日 |
| 4-4 | お知らせ取得 API（テナントユーザー用） | 4-1 | 0.5日 |
| 4-5 | お知らせ一覧/作成画面（platform_admin） | 4-2 | 1.5日 |
| 4-6 | ヘッダーに未読お知らせバッジ表示 | 4-4 | 1日 |
| 4-7 | テナントユーザー向けお知らせ一覧画面 | 4-4 | 1日 |
| 4-8 | 利用レポート API（SL/HL利用率含む） | Phase 2 | 1.5日 |
| 4-9 | 利用レポート画面 | 4-8 | 2日 |
| 4-10 | 監査ログ閲覧画面（platform_admin） | Phase 3 | 1.5日 |
| 4-11 | テナント側監査ログ閲覧画面 | Phase 3 | 1日 |
| 4-12 | CSV エクスポート機能（レポート・監査ログ） | 4-8, 4-10 | 1日 |
| 4-13 | **E2E テスト（全画面 + 三重防御の統合テスト）** | 全Phase | 3日 |
| 4-14 | 本番環境マイグレーション手順書作成 | 全Phase | 1日 |
| 4-15 | 既存データ移行スクリプト作成・テスト | 全Phase | 1.5日 |
| 4-16 | パフォーマンステスト（100テナント想定） | 全Phase | 1.5日 |

**Phase 4 合計: 約20日（3〜4週間）**

---

## 6. 依存関係図

```
Phase 0 (PoC検証: Prisma + RLS + SET LOCAL)
  │
  └──→ Phase 1 (マルチテナント基盤 + RLS)
        │
        ├──→ Phase 2 (運営管理・課金)
        │       │
        │       └──→ Phase 4 (利用レポート部分)
        │
        ├──→ Phase 3 (セキュリティ強化)
        │       │
        │       └──→ Phase 4 (監査ログ閲覧部分)
        │
        └──→ Phase 4 (お知らせ部分)
```

**Phase 0 は Phase 1 の前提条件。** PoC で致命的問題が発覚した場合、設計の根本変更が必要。
Phase 2 と Phase 3 は Phase 1 完了後に並行開発可能。
Phase 4 は Phase 2・3 の完了を待つタスクがあるが、お知らせ機能は Phase 1 完了後に着手可能。

---

## 7. 既存機能への影響と移行手順

### 7.1 影響マトリクス

| 既存ファイル | 変更内容 | リスク |
|-------------|---------|-------|
| prisma/schema.prisma | 全モデルに tenantId 追加、6新モデル追加 | 高（DB構造変更） |
| src/lib/auth.ts | authorize 関数の大幅変更 | 高（認証の中核） |
| src/lib/session.ts | tenantId 返却追加 | 中 |
| src/middleware.ts | テナント停止チェック、/platform ルート保護 | 高（全リクエストに影響） |
| src/lib/audit.ts | tenantId 付与 | 低 |
| src/app/api/customers/route.ts | 三重防御（Extensions + 認可helper + RLS）適用 | 中 |
| src/app/api/customers/[id]/route.ts | 同上 | 中 |
| src/app/api/contracts/route.ts | 同上 | 中 |
| src/app/api/contracts/[id]/route.ts | 同上 | 中 |
| src/types/next-auth.d.ts | JWT型拡張 | 低 |
| src/components/header.tsx | ロール別メニュー表示 | 低 |
| src/lib/contract-cache.ts | テナントスコープ適用 | 中 |
| src/lib/contract-utils.ts | **変更なし**（純粋関数） | なし |

### 7.2 本番移行手順

```
1. メンテナンス開始告知
2. アプリケーション停止
3. データベースバックアップ
4. DB ロール作成（app_tenant_role, app_platform_role）
5. Prisma マイグレーション実行（新テーブル作成、tenant_id カラム追加）
6. データマイグレーション（既存データにデフォルトテナント設定）
7. NOT NULL制約追加
8. RLS 有効化・ポリシー設定
9. platform_admin ユーザー作成
10. 新バージョンのアプリケーションデプロイ
11. 動作確認（既存テナントでのCRUD操作 + RLS動作確認）
12. メンテナンス終了告知
```

**想定ダウンタイム:** 30分〜1時間

---

## 8. リスクと対策

| # | リスク | 影響度 | 発生確率 | 対策 |
|---|--------|-------|---------|------|
| 1 | テナント分離漏れによるデータ漏洩 | 致命的 | 中 | 三重防御（Extensions + 認可helper + RLS）+ `withTenantTx` 標準化 + E2Eテスト |
| 2 | マイグレーション失敗によるデータ損失 | 致命的 | 低 | 移行前の完全バックアップ。ステージング環境での事前検証。ロールバック手順の準備 |
| 3 | JWT コールバックでのDB問い合わせによるパフォーマンス劣化 | 高 | 中 | テナントステータスのインメモリキャッシュ（TTL 60秒）。問題顕在化時はRedis導入 |
| 4 | 既存ユーザーのロール移行ミス | 高 | 低 | マイグレーションスクリプトのテスト。移行前後の件数確認クエリ |
| 5 | 2FA導入時の NextAuth との統合の複雑さ | 中 | 高 | 2FA は独自の検証エンドポイントで実装し、NextAuth の authorize と分離 |
| 6 | RLS と Prisma の相性問題 | 高 | 中 | **Phase 0 の PoC で事前検証。** `$transaction` + `SET LOCAL` の動作確認 |
| 7 | コネクションプール汚染 | 致命的 | **低** | **`SET LOCAL`（トランザクションスコープ）で解消。** `SET`（セッションスコープ）は禁止。手動 RESET 不要 |
| 8 | 顧客上限チェックの競合状態 | 低 | 低 | SELECT FOR UPDATE またはユニーク制約を活用した楽観的ロック |
| 9 | 大量テナント時のバッチ処理遅延 | 中 | 低 | テナント単位で並列処理。タイムアウト設定の調整 |
| 10 | **`$transaction` のパフォーマンス影響** | 中 | 低 | 全 DB 操作をトランザクションで包むためコネクション保持時間が増加。負荷テストで検証 |
| 11 | **platform_admin IDOR** | 高 | 低 | `/platform/tenants/:tenantId/*` のパスパラメータのみ許可。role チェック + 監査ログ必須 |
| 12 | **ログイン時の RLS 非適用** | 中 | - | ログイン時は authorize 関数で素の prisma を使用（RLS 適用前）。認証成功後に withTenantTx へ移行 |

---

## 9. AWS 本番運用準備タスク

### 9.1 RDS Proxy PoC

| # | タスク | 成功基準 | 見積り |
|---|--------|---------|-------|
| AWS-1 | RDS Proxy 経由で `withTenantTx` / `withPlatformTx` 動作確認 | `SET LOCAL` が RDS Proxy 経由でも後続クエリに適用されること | 1日 |
| AWS-2 | RDS Proxy 利用時の pinning 有無・性能影響計測 | pinning 発生頻度と接続効率低下が許容範囲内であること | 0.5日 |
| AWS-3 | RDS Proxy 不採用時との比較 | 直接接続時のパフォーマンスとの比較結果を文書化 | 0.5日 |

**注意:** RDS Proxy は PoC 合格後に採用。不合格時は RDS 直接接続（Prisma コネクションプール）で運用する。

### 9.2 SES 本番化

| # | タスク | 見積り |
|---|--------|-------|
| AWS-4 | SES sandbox 解除（production access 申請） | 1日（申請〜承認待ち含む） |
| AWS-5 | 送信元ドメイン検証 | 0.5日 |
| AWS-6 | SPF / DKIM / DMARC 設定 | 0.5日 |
| AWS-7 | tenant ごとの送信設定方針の決定 | 0.5日 |
