# セキュリティ設計書

## 1. Row Level Security (RLS)

### 1.1 RLS 適用方針

RLS はテナントデータ分離の**最終防衛線**として位置付ける。
アプリ層（Prisma Extensions）や認可 helper でのチェックに加え、DB 層でも分離を強制する。

**Prisma Extensions だけに依存しない。** RLS は以下を保証する:
- アプリ層のバグがあってもテナント間データ漏洩を防止
- raw SQL を使う場合でもテナント分離が維持される
- 新規 API エンドポイント追加時に tenant フィルタを忘れても安全

### 1.2 RLS 適用対象テーブル

| テーブル | RLS適用 | ポリシー方針 |
|---------|:---:|------|
| customers | **適用** | `tenant_id = current_setting('app.current_tenant_id')::int` |
| lease_contracts | **適用** | 同上 |
| users | **適用** | 同上（platform_admin は tenant_id IS NULL で別ポリシー） |
| audit_logs | **適用** | 同上（platform操作は tenant_id NULL → NULL許可ポリシーも追加） |
| invoices | **適用** | 同上 |
| tenant_announcements | **適用** | 同上 |
| announcements | **非適用** | platform_admin のみが CRUD。テナントは tenant_announcements 経由で閲覧 |
| tenants | **非適用** | platform_admin のみがアクセス。テナントユーザーは session 経由で自テナント情報取得 |
| password_policies | **非適用** | テナントと 1:1 対応。認可 helper でアクセス制御 |
| recovery_codes | **非適用** | User と紐づき、ユーザー認証で制御 |

### 1.3 DB ロール設計

```sql
-- テナントユーザー用ロール（RLS 適用）
CREATE ROLE app_tenant_role NOLOGIN;
GRANT ALL ON ALL TABLES IN SCHEMA public TO app_tenant_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO app_tenant_role;

-- platform_admin 用ロール（RLS バイパス）
CREATE ROLE app_platform_role NOLOGIN BYPASSRLS;
GRANT ALL ON ALL TABLES IN SCHEMA public TO app_platform_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO app_platform_role;

-- アプリケーション接続ユーザーに両ロールの SET ROLE 権限を付与
GRANT app_tenant_role TO app_user;
GRANT app_platform_role TO app_user;
```

### 1.3.1 DB ロール設計のセキュリティ考慮

**現行案のリスク:**

> アプリ接続ユーザー `app_user` が `app_tenant_role` と `app_platform_role` の両方を持つため、
> アプリ侵害時（SQL インジェクション等）に `SET ROLE app_platform_role` が悪用されると
> 全テナントデータへの不正アクセスが可能になるリスクがある。

**代替案:**

| 案 | 方式 | メリット | デメリット |
|----|------|---------|-----------|
| A: 接続分離 | tenant 用接続プール（`app_tenant_user`）と platform 用接続プール（`app_platform_user`）を分離。`app_tenant_user` には `app_platform_role` を付与しない | tenant 接続からの platform 権限昇格が原理的に不可能 | Prisma Client を2つ管理。接続数が倍増 |
| B: 別 datasource | platform 用の別 `PrismaClient` インスタンス（別 datasourceUrl）を使用 | 接続ユーザーレベルで分離。Prisma の datasource 機能で対応可能 | 設定の複雑化。環境変数が増加 |

**現行案を採る場合の前提条件:**

1. platform 用 API（`/platform/*`）を middleware で厳格に分離し、`role !== "platform_admin"` の場合は一切アクセス不可
2. `SET LOCAL ROLE app_platform_role` の実行は `withPlatformTx` 内部に限定。アプリコードから直接実行することを禁止
3. platform_admin の操作は全て監査ログに記録（`execution_context: "platform"` を含む）
4. **PoC / セキュリティレビューで最終確定する**（Phase 0 タスク 0-6 に追加）

**注意:** 現行案が無条件に安全とは言い切れない。PoC 後にセキュリティレビューで方式を最終決定する。

#### SET LOCAL ROLE 採用の PoC 成功条件

`SET LOCAL ROLE` パターンは **PoC 成功を前提とした暫定設計** である。
以下の全条件を満たした場合のみ正式採用する:

1. `$transaction` 内で `SET LOCAL ROLE` した role が後続クエリに適用されること
2. transaction 終了後に role が残留しないこと（コネクションプール汚染なし）
3. 並行 transaction で role が混在しないこと（`Promise.all` テスト）
4. RLS が `SET LOCAL ROLE` に応じて正常に適用/BYPASS されること

**不成立時の代替案（優先順に検討）:**

1. RLS ポリシー定義の SQL 修正
2. DB ロール設計の見直し
3. Prisma 接続方式の変更
4. tenant / platform 接続プール分離（上記 案A）
5. platform 用 datasource 分離（上記 案B）

### 1.4 RLS ポリシー定義

```sql
-- customers テーブル
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_customers ON customers
  USING (tenant_id = current_setting('app.current_tenant_id', true)::int)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::int);

-- lease_contracts テーブル
ALTER TABLE lease_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE lease_contracts FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_contracts ON lease_contracts
  USING (tenant_id = current_setting('app.current_tenant_id', true)::int)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::int);

-- users テーブル
-- 注意: テナントユーザーから platform_admin レコード（tenant_id IS NULL）が見えないようにする。
-- platform_admin は app_platform_role（BYPASSRLS）で全件アクセスするため、
-- ここではテナントユーザー用ポリシーのみ定義する。
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_users ON users
  FOR ALL TO app_tenant_role
  USING (tenant_id = current_setting('app.current_tenant_id', true)::int)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::int);

-- audit_logs テーブル
-- テナントユーザーは自テナントのログのみ閲覧可能。
-- platform操作ログ（tenant_id IS NULL）はテナントユーザーには不可視。
-- platform_admin は BYPASSRLS で全件アクセス。
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_audit ON audit_logs
  FOR ALL TO app_tenant_role
  USING (tenant_id = current_setting('app.current_tenant_id', true)::int);

-- invoices テーブル
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_invoices ON invoices
  USING (tenant_id = current_setting('app.current_tenant_id', true)::int)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::int);

-- tenant_announcements テーブル
ALTER TABLE tenant_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_announcements FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_announcements ON tenant_announcements
  USING (tenant_id = current_setting('app.current_tenant_id', true)::int);
```

### 1.5 platform_admin の全件アクセス方法

platform_admin は `app_platform_role`（`BYPASSRLS` 権限付き）を使用する。
`withPlatformTx(fn)` で `SET LOCAL ROLE app_platform_role` を設定し、トランザクション内で RLS をバイパスする。

```typescript
// platform_admin の API ルートでの使用（withPlatformTx パターン）
import { withPlatformTx } from "@/lib/prisma-tenant";

const data = await withPlatformTx(async (tx) => {
  // SET LOCAL ROLE app_platform_role は withPlatformTx 内で自動設定
  // RLS がバイパスされ、全テナントのデータにアクセス可能
  return tx.tenant.findMany();
});
// トランザクション終了時に SET LOCAL が自動リセットされる
// 手動での RESET ROLE は不要
```

### 1.6 raw SQL を使う場合のルール

**全ての DB 操作は `withTenantTx` / `withPlatformTx` 内で実行する。**
`SET`（`LOCAL` なし）でのテナントコンテキスト設定は**禁止**。

1. **テナントユーザーの場合:**
   - `withTenantTx(tenantId, fn)` 内で raw SQL を実行する
   - `SET LOCAL app.current_tenant_id` は `withTenantTx` が自動設定
   - SQL 内にも `WHERE tenant_id = $1` を含める（RLS との二重防御）

2. **platform_admin の場合:**
   - `withPlatformTx(fn)` 内で raw SQL を実行する
   - `SET LOCAL ROLE app_platform_role` は `withPlatformTx` が自動設定

3. **リセット処理:**
   - **不要。** `SET LOCAL` はトランザクション終了時に自動リセットされる
   - `RESET ROLE` / `RESET app.current_tenant_id` の手動呼び出しは**禁止**

4. **`$executeRawUnsafe` の使用制限:**
   - `$executeRawUnsafe` は `withTenantTx` / `withPlatformTx` の内部実装に**限定**
   - 業務 API・サービス層・バッチ処理で `$executeRawUnsafe` を直接使用することは**禁止**
   - アプリケーションコードでの raw SQL は `tx.$queryRaw` / `tx.$executeRaw`（タグ付きテンプレート）のみ許可

5. **禁止事項:**
   - トランザクション外での `SET` / `SET LOCAL` の使用
   - トランザクション外での raw SQL 実行
   - ユーザー入力を直接 `SET` コマンドに埋め込むこと（SQLインジェクション対策）
   - `getTenantPrisma()` / `getPlatformPrisma()` / `resetPrismaRole()` の使用（**廃止済み**）

### 1.7 RLS 導入マイグレーション順序（厳守）

以下の順序を守ること。順序を変えると RLS ポリシー適用前にデータが見えなくなる等の問題が発生する。

| # | ステップ | SQL 概要 | rollback |
|---|---------|---------|----------|
| 1 | tenant_id カラム追加 | `ALTER TABLE ... ADD COLUMN tenant_id INT NULL` | `ALTER TABLE ... DROP COLUMN tenant_id` |
| 2 | デフォルトテナント投入 | `INSERT INTO tenants VALUES (1, ...)` | `DELETE FROM tenants WHERE id = 1` |
| 3 | 既存データに tenant_id 設定 | `UPDATE ... SET tenant_id = 1` | `UPDATE ... SET tenant_id = NULL` |
| 4 | NOT NULL 制約追加 | `ALTER TABLE ... ALTER COLUMN tenant_id SET NOT NULL` | `ALTER TABLE ... ALTER COLUMN tenant_id DROP NOT NULL` |
| 5 | DB ロール作成 | `CREATE ROLE app_tenant_role ...;` `CREATE ROLE app_platform_role ...;` | `DROP ROLE ...` |
| 6 | ロール権限付与 | `GRANT ... TO app_user` | `REVOKE ... FROM app_user` |
| 7 | RLS ポリシー作成 | `CREATE POLICY ... ON ...` | `DROP POLICY ... ON ...` |
| 8 | RLS 有効化 | `ALTER TABLE ... ENABLE ROW LEVEL SECURITY; FORCE ROW LEVEL SECURITY` | `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` |

**重要:**
- ステップ 7→8 の順序は**厳守**（ENABLE 前にポリシーがないと全行が不可視になる）
- rollback は逆順で実行する（8→7→6→...→1）
- 各ステップ完了後にテストクエリで動作確認を行う

---

## 2. パスワードポリシー

### 2.1 テナント別設定可能項目

```prisma
model PasswordPolicy {
  id                  Int     @id @default(autoincrement())
  tenantId            Int     @unique @map("tenant_id")
  minLength           Int     @default(8) @map("min_length")           // 最小文字数（8〜32）
  requireUppercase    Boolean @default(false) @map("require_uppercase") // 大文字必須
  requireLowercase    Boolean @default(false) @map("require_lowercase") // 小文字必須
  requireNumbers      Boolean @default(false) @map("require_numbers")   // 数字必須
  requireSymbols      Boolean @default(false) @map("require_symbols")   // 記号必須
  maxAgeDays          Int     @default(0) @map("max_age_days")         // パスワード有効期限（0=無期限）
  historyCount        Int     @default(0) @map("history_count")        // 過去N回と重複不可（0=制限なし）
  maxFailedAttempts   Int     @default(10) @map("max_failed_attempts") // ロックアウト回数
  lockoutDurationMin  Int     @default(30) @map("lockout_duration_min") // ロックアウト時間（分）
  requireTwoFactor    Boolean @default(false) @map("require_two_factor") // 2FA強制
  createdAt           DateTime @default(now()) @map("created_at")
  updatedAt           DateTime @updatedAt @map("updated_at")

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@map("password_policies")
}
```

### 2.2 デフォルトポリシー

テナント作成時に以下のデフォルト値で `PasswordPolicy` を自動作成:
- 最小8文字
- 大文字・数字必須（`requireUppercase=true, requireNumbers=true`）
- 有効期限なし（`maxAgeDays=0`）
- ロックアウト: 10回失敗で30分ロック

### 2.3 platform_admin のポリシー

platform_admin は固定の高セキュリティポリシーを適用（テナントに依存しない）:
- 最小12文字
- 大文字・小文字・数字・記号すべて必須
- 90日有効期限
- 2FA必須

### 2.4 パスワードバリデーション関数

```typescript
// src/lib/password-policy.ts
export async function validatePassword(
  password: string,
  tenantId: number | null
): Promise<{ valid: boolean; errors: string[] }>
```

ユーザー登録・パスワード変更時にサーバー側で呼び出す。
クライアント側にはポリシー情報をAPIで公開し、リアルタイムバリデーションを行う。

### 2.5 パスワード有効期限

`User.passwordChangedAt` を記録し、ログイン時に `maxAgeDays` と比較。
期限切れの場合、ログイン成功後にパスワード変更画面へ強制リダイレクト。

---

## 3. 2FA（TOTP）導入

### 3.1 方式

- TOTP（Time-based One-Time Password）: RFC 6238
- 認証アプリ: Google Authenticator / Microsoft Authenticator 等
- ライブラリ: `otplib` (npm)

### 3.2 データモデル

User テーブルに以下のカラムを追加:
- `two_factor_secret`: TOTP秘密鍵（AES-256-GCMで暗号化して格納）
- `two_factor_enabled`: 2FA有効フラグ

### 3.3 2FA 設定フロー

```
1. ユーザーが設定画面で「2FAを有効にする」をクリック
2. サーバーが TOTP secret を生成し、QRコード（otpauth:// URI）を返却
3. ユーザーが認証アプリでQRコードをスキャン
4. ユーザーが認証アプリに表示された6桁コードを入力
5. サーバーがコードを検証し、成功なら two_factor_enabled = true に更新
6. リカバリーコード（8個）を生成して表示（一度のみ表示、bcryptハッシュ化して保存）
```

### 3.4 2FA ログインフロー

NextAuth の Credentials Provider は単一の authorize 関数のため、2FA は2段階で実装する。

```
Step 1: loginId + password → 検証OK → 仮トークン発行（2fa_pending状態）
Step 2: 仮トークン + TOTPコード → 検証OK → 本JWTセッション発行
```

2FA入力画面 (`/login/2fa`) で TOTP コードを `POST /api/auth/verify-2fa` に送信。
検証成功で本セッションを確立する。

### 3.5 リカバリーコード

```prisma
model RecoveryCode {
  id        Int      @id @default(autoincrement())
  userId    Int      @map("user_id")
  codeHash  String   @map("code_hash")  // bcryptハッシュ
  usedAt    DateTime? @map("used_at")
  createdAt DateTime @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id])

  @@index([userId], map: "idx_recovery_codes_user_id")
  @@map("recovery_codes")
}
```

- 8個のリカバリーコードを生成（8文字の英数字）
- 各コードは1回のみ使用可能（使用時に usedAt を記録）
- 2FA設定時と再生成時にのみ平文を表示

### 3.6 テナント単位の2FA強制

`PasswordPolicy.requireTwoFactor = true` に設定すると、テナント内の全ユーザーに 2FA を強制。
2FA未設定のユーザーがログインすると、2FA設定画面へ強制リダイレクト。

---

## 4. 監査ログ強化

### 4.1 対象操作一覧

| カテゴリ | 操作 | action値 |
|---------|------|---------|
| 認証 | ログイン成功 | login |
| 認証 | ログイン失敗 | login_failed |
| 認証 | ログアウト | logout |
| 認証 | 2FA検証成功 | 2fa_verified |
| 認証 | 2FA検証失敗 | 2fa_failed |
| 認証 | パスワード変更 | password_changed |
| 認証 | 2FA設定変更 | 2fa_setting_changed |
| ユーザー | ユーザー作成 | user_created |
| ユーザー | ユーザー編集 | user_updated |
| ユーザー | ユーザー無効化 | user_deactivated |
| 顧客 | 顧客作成 | customer_created |
| 顧客 | 顧客編集 | customer_updated |
| 顧客 | 顧客削除（論理） | customer_deleted |
| 契約 | 契約作成 | contract_created |
| 契約 | 契約編集 | contract_updated |
| 契約 | 契約削除 | contract_deleted |
| テナント | テナント作成 | tenant_created |
| テナント | テナント編集 | tenant_updated |
| テナント | テナント停止 | tenant_suspended |
| テナント | テナント再開 | tenant_resumed |
| 課金 | 請求ステータス変更 | invoice_status_changed |
| 課金 | 請求手動調整 | invoice_adjusted |
| お知らせ | お知らせ作成 | announcement_created |
| セキュリティ | パスワードポリシー変更 | password_policy_changed |
| エクスポート | データエクスポート | data_exported |

### 4.2 AuditLog テーブル拡張

```prisma
model AuditLog {
  id          Int       @id @default(autoincrement())
  tenantId    Int?      @map("tenant_id")
  userId      Int?      @map("user_id")
  action      String
  tableName   String    @map("table_name")
  recordId    Int?      @map("record_id")
  oldValues   String?   @map("old_values")
  newValues   String?   @map("new_values")
  ipAddress   String?   @map("ip_address")
  userAgent   String?   @map("user_agent")
  requestPath String?   @map("request_path")
  // --- 追加（v4）: 実行コンテキスト追跡 ---
  actorRole         String?   @map("actor_role") @db.VarChar(30)           // "platform_admin" | "tenant_admin" | "sales" | "system"
  executionContext   String?   @map("execution_context") @db.VarChar(20)   // "system" | "tenant" | "platform"
  requestedTenantId Int?      @map("requested_tenant_id")                  // 要求された tenantId
  effectiveTenantId Int?      @map("effective_tenant_id")                  // 最終的に採用された tenantId
  targetTenantId    Int?      @map("target_tenant_id")                     // 操作対象テナント（platform操作時）
  result            String?   @map("result") @db.VarChar(20)              // "success" | "denied"
  createdAt   DateTime  @default(now()) @map("created_at")

  tenant Tenant? @relation(fields: [tenantId], references: [id])
  user   User?   @relation(fields: [userId], references: [id])

  @@index([tenantId, createdAt], map: "idx_audit_logs_tenant_date")
  @@index([userId], map: "idx_audit_logs_user_id")
  @@index([tableName], map: "idx_audit_logs_table_name")
  @@index([action], map: "idx_audit_logs_action")
  @@index([createdAt], map: "idx_audit_logs_created_at")
  @@index([executionContext], map: "idx_audit_logs_exec_context")
  @@map("audit_logs")
}
```

### 4.3 保持期間

| テナントプラン | 保持期間 |
|---------------|---------|
| standard | 6ヶ月 |
| premium | 12ヶ月 |
| enterprise | 24ヶ月 |
| platform操作 | 無期限 |

月次バッチで保持期限を超えた監査ログを削除する。

### 4.4 writeAuditLog の拡張

```typescript
export async function writeAuditLog(params: {
  // --- 既存 ---
  tenantId?: number | null;
  userId: number;
  action: string;
  tableName: string;
  recordId?: number;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  requestPath?: string;
  // --- 追加（v4） ---
  actorRole: string;                    // "platform_admin" | "tenant_admin" | "sales" | "system"
  executionContext: string;             // "system" | "tenant" | "platform"
  requestedTenantId?: number | null;    // 要求された tenantId（パスパラメータ等）
  effectiveTenantId?: number | null;    // 最終的に採用された tenantId
  targetTenantId?: number | null;       // 操作対象テナント（platform操作時）
  result: string;                       // "success" | "denied"
}) {
  // 既存実装を拡張
}
```

**追加カラムの意図:**

- `actorRole`: 誰がこの操作を実行したか（ロール単位）
- `executionContext`: どのコンテキストで実行されたか（system / tenant / platform）
- `result`: 操作結果（成功 or 拒否）

#### tenantId 系フィールドの定義と使い分け（正本）

> **本セクション（security-design.md §4.4）が tenantId 系フィールドの唯一の定義元である。**
> 他ドキュメントでは本セクションを参照すること。

| フィールド | 定義 | 設定元 | 例 |
|-----------|------|--------|-----|
| `requestedTenantId` | 呼び出し元が**明示的に要求した** tenantId。tenant user API では **null**（JWT の tenantId は暗黙的であり「要求」ではない） | パスパラメータ（`/platform/tenants/:tenantId/*`）/ バッチジョブの引数 | platform API の `:tenantId` パラメータ |
| `effectiveTenantId` | DB テナントコンテキストに設定された tenantId。RLS が参照する値 | `withTenantTx` の引数 / `SET LOCAL app.current_tenant_id` の値 | `current_setting('app.current_tenant_id')` |
| `targetTenantId` | 業務処理の対象テナント | tenant API → `authContext.tenantId` / platform API → path param / バッチ → `tenant.id` | 請求生成時の対象テナント |

**コンテキスト別の設定ルール:**

| コンテキスト | requestedTenantId | effectiveTenantId | targetTenantId |
|-------------|-------------------|-------------------|----------------|
| tenant API | **null** | authContext.tenantId | authContext.tenantId |
| platform API（特定テナント操作） | path param tenantId | null（BYPASSRLS） | path param tenantId |
| system batch | null | null | tenant.id（ループ内の処理対象） |
| system（認証前） | null | null | null |

これにより tenantId 決定ルールの検証を監査ログから追跡可能になる。

**AuditLog テーブルへの対応カラム追加:**

```sql
ALTER TABLE audit_logs ADD COLUMN actor_role VARCHAR(30);
ALTER TABLE audit_logs ADD COLUMN execution_context VARCHAR(20);
ALTER TABLE audit_logs ADD COLUMN requested_tenant_id INT NULL;
ALTER TABLE audit_logs ADD COLUMN effective_tenant_id INT NULL;
ALTER TABLE audit_logs ADD COLUMN target_tenant_id INT NULL;
ALTER TABLE audit_logs ADD COLUMN result VARCHAR(20);
```

---

## 5. セッション管理強化

### 5.1 セッション有効期限

| ロール | 有効期限 | 備考 |
|--------|---------|------|
| platform_admin | 8時間 | セキュリティ重視 |
| tenant_admin | 24時間 | 現行と同じ |
| sales | 24時間 | 現行と同じ |

### 5.2 セッション即時失効（authVersion）

**原則: JWT は権限ソースではなく補助キャッシュである。**
最終的な権限判定は認可 helper（`requireTenantAccess` / `requirePlatformAccess`）で DB 再確認する。

User テーブルに `auth_version INT DEFAULT 1` を追加する。
JWT に `authVersion` を含め、以下の2段階で失効を検出する:

1. **JWT callback（早期検出）:** セッション更新時に authVersion + isActive を照合。不一致時は JWT を無効化
2. **認可 helper（最終判定）:** API リクエスト時に DB から authVersion・isActive・tenant.status を再確認。不一致時は 401/403 を返し再ログインを強制

**セッション失効条件（いずれか1つで失効）:**
- `authVersion` 不一致
- `user.isActive = false`
- `tenant.status !== "active"`（tenant context のみ）

**authVersion をインクリメントするタイミング:**

- role 変更時
- tenant 変更時
- ユーザー無効化時
- テナント停止時（テナント内全ユーザーを一括更新）

**将来拡張（設計注記）:**
テナント停止時に全ユーザーの authVersion を一括更新する必要がある。
大規模環境では `tenantAuthVersion`（テナント単位の権限バージョン）導入を検討する。

詳細は `tenant-auth-design.md §2.2, §3.2, §5.4` を参照。

### 5.3 アカウントロックアウト

- `User.failedLoginAttempts` で失敗回数を追跡
- `PasswordPolicy.maxFailedAttempts` 回失敗で `User.lockedUntil` を設定
- ロックアウト中はログイン不可（「アカウントがロックされています。{N}分後に再試行してください」）
- ログイン成功時に `failedLoginAttempts = 0` にリセット
- tenant_admin は自テナントユーザーのロック解除が可能

---

## 6. テナントデータ分離の技術的保証（まとめ）

### 6.1 多層防御

| レイヤー | 対策 | 依存度 |
|---------|------|-------|
| Layer 1: 認可helper/API | getSessionUser() + assertTenantOwnership() + API ルートでの明示チェック + 明示的 where 句 | **必須** |
| Layer 2: DB | PostgreSQL RLS | **必須**（最終防衛線） |
| 補助: アプリ | Prisma Client Extensions で tenantId 自動注入 | 任意（追加安全策） |
| テスト | テナント分離 E2E テスト | 検証 |

### 6.2 実行コンテキスト一覧

| コンテキスト | 代表処理 | 使用ロール | RLS | 使用する関数 | 典型 API/処理 | 注意点 |
|-------------|---------|-----------|:---:|------------|-------------|--------|
| **system** | ログイン認証、パスワードリセットトークン検証、2FA 仮状態確認 | なし（素の prisma） | 未適用 | `prisma.user.findUnique()` 直接 | `authorize()`, `/api/auth/verify-2fa` | RLS 適用前。全ユーザーにアクセス可能。最小限の操作に限定 |
| **tenant** | 顧客管理、契約管理、テナント所属ユーザー参照 | `app_tenant_role` | **適用** | `withTenantTx(tenantId, fn)` | `/api/customers/*`, `/api/contracts/*` | tenantId は JWT 由来のみ。where 句 + RLS の二重防御 |
| **platform** | テナント一覧、請求管理、テナント横断監査ログ、バッチ処理 | `app_platform_role` | **BYPASS** | `withPlatformTx(fn)` | `/platform/*`, バッチジョブ | 全テナントデータにアクセス可。監査ログ必須。targetTenantId を記録 |

#### 6.2.1 コンテキスト別 許可/禁止ルール

**system context:**
- 許可: ログインユーザー検索、パスワードリセットトークン検証、2FA 仮認証
- 禁止: 業務データ（顧客/契約）取得、テナント横断取得、platform 管理処理
- 原則: 認証前の最小処理のみ。素の `prisma` を使用。

**tenant context:**
- 許可: 顧客管理、契約管理、自テナントユーザー参照
- 禁止: 他テナント tenantId の指定、platform API の呼び出し、RLS bypass
- 原則: `withTenantTx(authContext.tenantId, fn)` 内でのみ DB 操作。

**platform context:**
- 許可: テナント管理、請求生成、テナント横断監査ログ、バッチ処理
- 禁止: tenant API のルート流用、tenant service の直接呼び出し
- 原則: `withPlatformTx(fn)` 内でのみ DB 操作。全操作を監査ログに記録。

### 6.3 必須テストケース

- テナントAのユーザーがテナントBの顧客を取得できないこと
- テナントAのユーザーがテナントBの顧客IDを直接指定してもアクセスできないこと
- テナントAで作成したデータの tenant_id がテナントAのIDであること
- platform_admin が特定テナントのデータのみを正しく取得できること
- テナント停止中のユーザーが一切の操作を行えないこと
- raw SQL 実行時に RLS が正しく機能すること
- Prisma Extensions を意図的にバイパスしても RLS でブロックされること

---

## 7. 非同期処理のセキュリティ原則

### 7.1 外部連携 payload の tenantId 必須化

Webhook / 外部 API 連携の payload には **tenantId を必須とする。**
受信側がテナントを特定できない payload は送信しない。

```json
{
  "tenantId": 42,
  "event": "invoice.created",
  "invoiceId": 1832,
  "timestamp": "2026-03-16T00:30:00Z"
}
```

### 7.2 非同期処理の5原則

非同期処理（メール送信・Webhook・キュー・バッチ worker）では以下を**必ず守る。**

| # | 原則 | 理由 |
|---|------|------|
| 1 | payload に tenant 文脈（tenantId, actorUserId, executionContext, requestId）を含める | tenant 文脈喪失による誤処理を防止 |
| 2 | transaction 内で外部副作用を実行しない | DB rollback 時の状態不整合を防止 |
| 3 | worker で `withTenantTx` により tenant context を再構築する | RLS を適用し、テナント分離を維持 |
| 4 | 外部連携 payload に tenantId を含める | 受信側でのテナント特定を保証 |
| 5 | ID 単体 payload を禁止する | tenant 文脈なしの処理を原理的に排除 |

詳細な実装パターンは `tenant-auth-design.md §11` を参照。

---

## 8. AWS 本番インフラのセキュリティ要件

### 8.1 本番 DB 基盤

本番 DB は **Amazon RDS for PostgreSQL** または **Aurora PostgreSQL** を候補とする。

**RDS Proxy について:**

RDS Proxy は接続プール効率化のために有用だが、`SET LOCAL app.current_tenant_id` / `SET LOCAL ROLE` を使用するアーキテクチャでは **pinning（コネクション固定）** が発生する可能性がある。

- RDS Proxy は **初期前提にしない**
- **PoC 合格後に採用可否を決定する**

**RDS Proxy PoC 検証項目:**

| # | 検証項目 | 成功基準 |
|---|---------|---------|
| 1 | `$transaction` 内で `SET LOCAL` が後続クエリに確実に適用されること | RDS Proxy 経由でも `withTenantTx` が期待どおり動作 |
| 2 | transaction 終了後に tenant context / role が残留しないこと | コネクション返却後に他リクエストへの汚染なし |
| 3 | 並行実行時に tenant context が混在しないこと | `Promise.all` テストで分離確認 |
| 4 | pinning 発生の有無と頻度 | `SET LOCAL` による pinning が発生するか確認 |
| 5 | pinning 時の接続効率・性能影響 | RDS Proxy 不使用時と比較して許容範囲か |

**RDS Proxy 不採用時:**
- RDS に直接接続（Prisma のコネクションプールを利用）
- 接続数管理は Prisma の `connection_limit` で制御

### 8.2 秘密情報管理

**原則: 本番環境で長期秘密情報を `.env` に固定保存しない。**

| 秘密情報 | 管理先 |
|---------|--------|
| DB 接続情報（DATABASE_URL） | AWS Secrets Manager |
| NextAuth secret（NEXTAUTH_SECRET） | AWS Secrets Manager |
| SES 認証情報 | AWS Secrets Manager |
| 外部 API keys | AWS Secrets Manager |
| OAuth secrets | AWS Secrets Manager |

**運用ルール:**
- Secrets Manager のローテーション機能を活用する
- アプリケーション起動時に Secrets Manager から取得する
- 開発環境では `.env` を継続使用（本番のみ Secrets Manager）

### 8.3 暗号化・鍵管理

| 用途 | 方式 |
|------|------|
| 2FA secret（TOTP）の保護 | AWS KMS で暗号化して DB に保存 |
| 暗号鍵の管理 | AWS KMS のカスタマーマネージドキー |
| トークン保護・機微データ暗号化 | KMS 利用を検討対象とする |
| RDS の保管時暗号化 | RDS 暗号化（デフォルト有効） |

### 8.4 IAM 実行ロール分離

アプリケーション実行基盤ごとに IAM ロールを分離し、最小権限の原則を適用する。

| IAM ロール | 用途 | 主な権限 |
|-----------|------|---------|
| **Web App role** | Next.js アプリケーション（ECS/Fargate） | Secrets Manager（読取）、SES（送信）、CloudWatch Logs（書込） |
| **Worker role** | 非同期処理 worker（ECS/Fargate） | Secrets Manager（読取）、SQS（受信・削除）、CloudWatch Logs（書込） |
| **Platform job role** | 請求バッチ等の platform 系ジョブ | Secrets Manager（読取）、SQS（全操作）、SES（送信）、S3（読書）、CloudWatch Logs（書込） |

**追加ルール:**
- tenant API 用の Web App role に platform 系の不要な AWS 権限を付与しない
- platform 系ジョブにのみ必要な外部権限（S3 全体参照等）を持たせる
- S3 利用時は **tenant 別 prefix 分離**（`s3://bucket/tenants/{tenantId}/`）とアクセス制御を前提とする

---

## 9. 監査ログ・運用ログの役割分担

### 9.1 3層ログ体系

本番環境では以下の3層でログを管理する。各層の役割を混同しない。

| 層 | 基盤 | 用途 | 記録内容 |
|----|------|------|---------|
| **業務監査** | AuditLog テーブル（DB） | 誰が・どの tenant に・何をしたか | userId, action, requestedTenantId, effectiveTenantId, targetTenantId, requestId, result |
| **アプリログ** | CloudWatch Logs | アプリ/worker/非同期処理/エラーログ | requestId, tenantId, ログレベル, スタックトレース |
| **AWS 操作監査** | CloudTrail | AWS リソース操作の追跡 | IAM 変更、Secrets 変更、SES 設定変更、SQS 設定変更、RDS 設定変更 |

**役割の境界:**
- 業務上の「誰が何をしたか」→ AuditLog
- アプリケーションの動作状況・エラー → CloudWatch Logs
- AWS インフラ設定変更の追跡 → CloudTrail

### 9.2 requestId 伝搬ルール

`requestId` を以下の全経路で一貫して伝搬すること。

```
API request → queue publish → worker process → external integration
     ↓              ↓              ↓                  ↓
  AuditLog     SQS message    CloudWatch Logs    Webhook payload
```

**ルール:**
- API リクエスト受信時に `requestId`（UUID v4）を生成する
- 非同期 payload に `requestId` を必ず含める（§7.2 原則1）
- worker 処理時のログにも同一 `requestId` を出力する
- AuditLog と CloudWatch Logs を `requestId` で突合可能にする
- AWS 側の設定変更監査は CloudTrail を参照する前提とする
- **非同期経路でも requestId を欠落させない**
