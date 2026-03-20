# SaaS化 要件定義書

## 1. SaaS化の目的

本システムは現在、単一企業向けのOA機器顧客管理システムとして稼働している。
これを複数の販売代理店（テナント）が利用できるSaaS型サービスに転換し、
プラットフォーム運営者（我々）が複数テナントを一元管理できるようにする。

### 1.1 ビジネス目標

- OA機器販売代理店向けに月額制で顧客管理サービスを提供する
- テナントごとのデータ完全分離を保証する
- プラットフォーム運営者がテナントの利用状況・課金を一元管理する

### 1.2 スコープ

**対象範囲:**
- テナント管理（登録・編集・停止・再開）
- マルチテナント対応の認証・認可
- テナント別データ分離（共有DB + tenantId + RLS による三重防御）
- 課金管理（月額基本料＋超過従量課金、日割りなし）
- テナント別パスワードポリシー
- TOTP 2要素認証
- お知らせ配信機能
- 運営管理画面（platform_admin専用）
- 監査ログの強化

**対象外（将来検討）:**
- 独自ドメイン対応
- API外部公開
- SSO連携（SAML/OIDC）
- テナントごとのUI カスタマイズ
- 日割り課金

---

## 2. テナントモデル

### 2.1 方式: 共有DB + tenantId + RLS（三重防御）

単一のPostgreSQLデータベースを全テナントで共有し、各テーブルに `tenant_id` カラムを追加してデータを論理分離する。加えて PostgreSQL Row Level Security (RLS) を最終防衛線として適用する。

**選定理由:**
- テナント数が中規模（数十〜数百）を想定
- インフラ管理コストを最小化
- Prisma ORMとの相性が良い（スキーマ分離はPrismaの制約が多い）
- RLS により、アプリ層のバグがあってもテナント間データ漏洩を防止

### 2.2 三重防御アーキテクチャ

| レイヤー | 手段 | 役割 |
|---------|------|------|
| Layer 1: アプリ層 | Prisma Client Extensions | クエリへの tenantId 自動注入（補助的手段） |
| Layer 2: 認可helper/API層 | getSessionUser() + 認可helper + API ルート | tenantId の明示的検証 |
| Layer 3: DB層 | PostgreSQL Row Level Security (RLS) | 最終防衛線 |

**重要原則:**
- Prisma Extensions は補助的手段であり、**これだけに依存しない**
- 認可 helper / API ルートでも tenantId を明示的に確認する
- RLS は最終防衛線として、アプリ層のバグがあってもテナント間データ漏洩を防止する
- platform_admin は専用 DB ロール（`app_platform_role`）で RLS を BYPASS する

**テナントコンテキスト設定方式:**
- 全てのテナントスコープ DB 操作は `withTenantTx(tenantId, fn)` 経由で実行する
- `withTenantTx` は `$transaction` 内で `SET LOCAL app.current_tenant_id` と `SET LOCAL ROLE app_tenant_role` を設定
- `SET LOCAL` はトランザクション終了時に自動リセットされるため、コネクションプール汚染のリスクなし
- platform_admin は `withPlatformTx(fn)` で `SET LOCAL ROLE app_platform_role` を設定

**tenantId 決定ルール:**
- テナントユーザーの tenantId は JWT（authContext.tenantId）からのみ取得する
- リクエストボディ/クエリパラメータ/Cookie/カスタムヘッダーから tenantId を取得することは**禁止**（IDOR 防止）
- platform_admin がテナントデータを操作する場合、`/platform/tenants/:tenantId/*` のパスパラメータのみ許可

### 2.3 テナントテーブル

```prisma
model Tenant {
  id              Int       @id @default(autoincrement())
  name            String    @db.VarChar(200)            // テナント表示名（会社名）
  slug            String    @unique @db.VarChar(100)    // URLスラッグ（英数字・ハイフン）
  status          String    @default("active") @db.VarChar(20) // "active" | "suspended" | "cancelled"
  plan            String    @default("standard") @db.VarChar(50) // "standard" | "premium" | "enterprise"
  customerLimit   Int       @default(100) @map("customer_limit")      // プラン基本件数
  softLimit       Int       @default(100) @map("soft_limit")          // 超過課金の開始閾値
  hardLimit       Int       @default(150) @map("hard_limit")          // 新規登録禁止の閾値
  monthlyBaseFee  Int       @default(5000) @map("monthly_base_fee")   // 月額基本料（円）
  overageFeePerCustomer Int @default(100) @map("overage_fee_per_customer") // 超過1件あたり（円/月）
  contactName     String?   @map("contact_name") @db.VarChar(100)
  contactEmail    String?   @map("contact_email") @db.VarChar(255)
  contactPhone    String?   @map("contact_phone") @db.VarChar(20)
  notes           String?
  suspendedAt     DateTime? @map("suspended_at")
  suspendReason   String?   @map("suspend_reason")
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")

  users           User[]
  customers       Customer[]
  leaseContracts  LeaseContract[]
  auditLogs       AuditLog[]
  invoices        Invoice[]
  announcements   TenantAnnouncement[]
  passwordPolicy  PasswordPolicy?

  @@index([status], map: "idx_tenants_status")
  @@index([slug], map: "idx_tenants_slug")
  @@map("tenants")
}
```

### 2.4 既存テーブルへの tenantId 追加

以下のテーブルに `tenantId` カラムを追加する:
- `users` — `tenant_id INT NULL`（platform_adminはNULL）
- `customers` — `tenant_id INT NOT NULL`
- `lease_contracts` — `tenant_id INT NOT NULL`
- `audit_logs` — `tenant_id INT NULL`（platform操作はNULL）

各テーブルに `@@index([tenantId])` を追加し、複合インデックスも設定する。

---

## 3. ロール定義と権限マトリクス

### 3.1 ロール一覧

| ロール | 説明 | テナント所属 |
|--------|------|-------------|
| platform_admin | プラットフォーム運営者 | なし（全テナントにアクセス可） |
| tenant_admin | テナント管理者 | 所属テナントのみ |
| sales | 営業担当者 | 所属テナントのみ |

### 3.2 権限マトリクス

| 操作 | platform_admin | tenant_admin | sales |
|------|:---:|:---:|:---:|
| **テナント管理** | | | |
| テナント一覧表示 | O | X | X |
| テナント登録 | O | X | X |
| テナント編集 | O | X | X |
| テナント停止/再開 | O | X | X |
| テナント削除 | O | X | X |
| **ユーザー管理** | | | |
| 全テナントのユーザー管理 | O | X | X |
| 自テナントのユーザー一覧 | O | O | X |
| 自テナントのユーザー登録 | O | O | X |
| 自テナントのユーザー編集 | O | O | X |
| 自テナントのユーザー無効化 | O | O | X |
| **顧客管理** | | | |
| 自テナントの顧客一覧 | O（全テナント閲覧可） | O | O |
| 自テナントの顧客登録 | X | O | O |
| 自テナントの顧客編集 | X | O | O |
| 自テナントの顧客削除 | X | O | X |
| **契約管理** | | | |
| 自テナントの契約一覧 | O（全テナント閲覧可） | O | O |
| 自テナントの契約登録 | X | O | O |
| 自テナントの契約編集 | X | O | O |
| 自テナントの契約削除 | X | O | X |
| **課金管理** | | | |
| 請求一覧（全テナント） | O | X | X |
| 請求詳細 | O | O（自テナント分） | X |
| 手動請求調整 | O | X | X |
| **お知らせ管理** | | | |
| お知らせ作成・配信 | O | X | X |
| お知らせ閲覧 | O | O | O |
| **監査ログ** | | | |
| 全テナントの監査ログ閲覧 | O | X | X |
| 自テナントの監査ログ閲覧 | O | O | X |
| **セキュリティ設定** | | | |
| パスワードポリシー変更 | O（全テナント） | O（自テナント） | X |
| 2FA設定管理 | O | O（自テナント強制設定） | 自分のみ |
| **レポート** | | | |
| テナント別利用レポート | O | X | X |
| 自テナントの利用状況 | O | O | X |

---

## 4. テナント停止時の挙動

### 4.1 停止操作

platform_admin がテナントの `status` を `"suspended"` に変更する。

### 4.2 停止中の挙動

| 項目 | 挙動 |
|------|------|
| ログイン | 不可。ログイン画面に「このアカウントは現在利用できません。管理者にお問い合わせください」を表示 |
| APIアクセス | 既存セッション含め全て `403 TENANT_SUSPENDED` を返却 |
| データ | 完全保持（削除しない） |
| バッチ処理 | 対象外（停止テナントの契約ステータス更新はスキップ） |
| 課金 | 停止月も満額請求（日割りしない）。将来的に日割り対応を検討可 |

### 4.3 再開

platform_admin が `status` を `"active"` に戻すと即座に利用再開可能。
再開時に契約ステータスのバッチ更新を即時実行する。

### 4.4 テナントステータス遷移

```
active → suspended → active（再開可能）
active → cancelled（解約 — 復帰不可）
suspended → cancelled（停止中からの解約 — 復帰不可）
```

**`cancelled` からの復帰は不可。** 解約したテナントを再利用する場合は、新規テナントとして登録する。
`cancelled` テナントのデータは一定期間保持後、データ消去ポリシーに従い削除する。

---

## 5. 顧客件数上限: softLimit / hardLimit 方式

### 5.1 設定項目

テナントごとに以下の3つの件数設定を持つ（プランのデフォルト値を上書き可能）:

| 設定項目 | 説明 | standard | premium | enterprise |
|---------|------|:---:|:---:|:---:|
| customerLimit | プラン基本件数（課金計算の基準表示用） | 100 | 500 | 2,000 |
| softLimit | 超過課金の開始閾値 | 100 | 500 | 2,000 |
| hardLimit | 新規登録禁止の閾値 | 150 | 700 | 2,500 |

### 5.2 カウント対象

`isDeleted = false` の顧客のみ。

#### ソフトデリートと一意制約

`is_deleted` を使用するテーブルでは、アクティブレコードのみに一意制約を適用する:

```sql
-- 例: customers テーブルの電話番号ユニーク制約
CREATE UNIQUE INDEX idx_customers_phone_active
  ON customers(tenant_id, phone_number_normalized)
  WHERE is_deleted = false;
```

**ルール:**
- 一意制約は `WHERE is_deleted = false` の部分インデックスで定義する
- 論理削除済みレコードと同一キーのレコードを再作成可能とする
- `lease_contracts.contract_number` も同様:
  ```sql
  CREATE UNIQUE INDEX idx_contracts_tenant_number_active
    ON lease_contracts(tenant_id, contract_number)
    WHERE contract_number IS NOT NULL AND is_deleted = false;
  ```

### 5.3 動作ルール（優先順位）

| 状態 | 条件 | 登録可否 | 課金 |
|------|------|:---:|------|
| 通常 | 顧客数 < softLimit | 可 | なし |
| 超過（ソフト） | softLimit ≤ 顧客数 < hardLimit | 可 | 超過分を課金 |
| 超過（ハード） | 顧客数 ≥ hardLimit | **不可** | 超過分を課金 |

### 5.4 上限チェックタイミング

顧客新規登録 API (`POST /api/customers`) のリクエスト時に確認。

### 5.5 hardLimit 到達時のエラー

- HTTP 403 `CUSTOMER_HARD_LIMIT_REACHED`
- メッセージ: 「顧客登録数が上限（{hardLimit}件）に達しています。プランのアップグレードについては管理者にお問い合わせください」
- 既存顧客の編集・契約の追加は引き続き可能

### 5.6 超過課金

- 超過件数 = MAX(0, アクティブ顧客数 - softLimit)
- 超過料金 = 超過件数 × `overageFeePerCustomer`（円/月）
- 請求生成バッチ実行時（毎月1日 00:30）に月初バッチ実行時点のアクティブ顧客数をスナップショットとして記録

---

## 6. 非機能要件

### 6.1 テナント間データ分離保証（三重防御）

1. **Layer 1（アプリ層）:** Prisma Client Extensions でクエリに自動的に tenantId フィルターを注入（補助的手段）
2. **Layer 2（認可helper/API層）:** 認可 helper でセッションの tenantId を検証。API ルートでも明示的に tenant 制約を確認。重要画面のデータ取得でも tenant 制約を確認
3. **Layer 3（DB層）:** PostgreSQL RLS で全テナント関連テーブルにポリシーを設定。アプリ層のバグがあってもデータ漏洩しない最終防衛線
4. **テスト:** テナント分離のE2Eテストで全APIを検証（他テナントのデータにアクセスできないことを確認）
5. **contractNumber** のユニーク制約を `tenantId` との複合ユニークに変更

### 6.2 パフォーマンス目標

| 指標 | 目標値 |
|------|--------|
| API応答時間（95%ile） | 500ms以下 |
| 同時テナント数 | 100テナント |
| テナントあたり最大ユーザー数 | 50 |
| テナントあたり最大顧客数 | 10,000 |
| テナントあたり最大契約数 | 50,000 |

### 6.3 インデックス戦略

テナントIDを含む複合インデックスを追加:
- `customers(tenant_id, is_deleted, company_name)`
- `customers(tenant_id, is_deleted, phone_number_normalized)`
- `lease_contracts(tenant_id, contract_status)`
- `lease_contracts(tenant_id, customer_id)`
- `audit_logs(tenant_id, created_at)`
- `users(tenant_id, is_active)`

---

## 7. 新規テーブル一覧（6テーブル）

| # | テーブル名 | 用途 |
|---|-----------|------|
| 1 | tenants | テナント管理（プラン、件数上限、料金設定、停止情報） |
| 2 | invoices | 請求管理（月額基本料 + 超過課金 + 手動調整 + 消費税） |
| 3 | password_policies | テナント別パスワードポリシー |
| 4 | recovery_codes | 2FA リカバリーコード |
| 5 | announcements | お知らせマスタ |
| 6 | tenant_announcements | テナント別お知らせ配信・既読管理 |

---

## 8. 仮定事項

1. ログインIDはシステム全体でユニーク（テナントID入力不要）
2. テナント数は数十〜数百規模を想定
3. `monthlyFee` は小数不要（月額リース料は円単位の整数）
4. 日割り課金は MVP では行わない（将来拡張として検討可）
5. お知らせ配信はポーリング方式（将来的に WebSocket/SSE で拡張可）
6. platform_admin は少数（1〜5名程度）を想定
7. softLimit と hardLimit は同じ値でも設定可能（softLimit = hardLimit の場合、超過即登録不可）
