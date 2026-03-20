# 課金設計書

## 1. 課金モデル

### 1.1 料金体系

```
月額請求額 = 月額基本料（プラン別固定） + 超過料金
超過料金 = MAX(0, アクティブ顧客数 - softLimit) × 超過単価（円/件）
```

**日割り計算は行わない。** 暦月単位での請求とする。
月途中の開始・停止があっても日割りしない（将来拡張として検討可）。

### 1.2 プラン定義

| プラン | 月額基本料 | customerLimit | softLimit | hardLimit | 超過単価 | ユーザー上限 |
|--------|-----------|:---:|:---:|:---:|---------|:---:|
| standard | 5,000円 | 100件 | 100件 | 150件 | 100円/件 | 5名 |
| premium | 15,000円 | 500件 | 500件 | 700件 | 80円/件 | 20名 |
| enterprise | 30,000円 | 2,000件 | 2,000件 | 2,500件 | 50円/件 | 50名 |

プラン設定はテナント単位で `Tenant` テーブルに格納し、個別カスタマイズ可能とする（`customerLimit`, `softLimit`, `hardLimit`, `monthlyBaseFee`, `overageFeePerCustomer` を直接編集可能）。

### 1.3 件数制限と課金の関係

| 状態 | 条件 | 登録 | 課金 |
|------|------|:---:|------|
| 通常 | 顧客数 < softLimit | 可 | 基本料のみ |
| 超過（ソフト） | softLimit ≤ 顧客数 < hardLimit | 可 | 基本料 + 超過料金 |
| 超過（ハード） | 顧客数 ≥ hardLimit | **不可** | 基本料 + 超過料金 |

---

## 2. 請求サイクル

### 2.1 請求対象期間

- **暦月単位**（月初〜月末）
- 例: 2026年3月分 = 2026-03-01 〜 2026-03-31

### 2.2 請求生成タイミング

- 毎月1日の 00:30（バッチ処理）に前月分の請求を生成
- 生成された請求は `draft` 状態
- platform_admin が確認・承認後に `confirmed` → `sent` に遷移

### 2.3 請求ステータス遷移

```
draft → confirmed → sent → paid
                  ↘ overdue（支払期限超過）
draft → cancelled（取消）
```

### 2.4 月途中の開始・停止

- **月途中の開始:** 開始月も満額請求
- **月途中の停止:** 停止月も満額請求
- **停止中の月:** 請求なし（テナントステータスが `suspended` の期間）
- 日割り計算は行わない。将来的に日割り対応を検討する場合は別途設計する

---

## 3. 超過課金計算ロジック

### 3.1 顧客数のカウント

```
アクティブ顧客数 = COUNT(customers WHERE tenant_id = ? AND is_deleted = false)
```

### 3.2 計算タイミングと顧客数取得方法

請求生成バッチ実行時（毎月1日 00:30）に**月初バッチ実行時点のアクティブ顧客数**（`is_deleted = false`）をスナップショットとして記録する。

**顧客数取得SQL:**

```sql
SELECT COUNT(*) as customer_count
FROM customers
WHERE tenant_id = :tenantId
  AND is_deleted = false
```

**計測基準の定義:**
- バッチは毎月1日 00:30 に実行される。**バッチ実行時点の状態を当月の請求基準とする**
- 厳密な月末時点の再現は行わない（`deleted_at` タイムスタンプカラムがないため）
- 月途中で削除→復元された顧客も、バッチ実行時に `is_deleted = false` であれば計上する
- バッチは `withPlatformTx` 内で全テナントを処理する（RLS バイパスで一括取得）

#### バッチ処理の安全性ルール

1. **基準時刻の固定:** バッチ開始時にタイムスタンプを取得し、処理全体でこの時刻を基準とする
2. **advisory lock:** 請求生成バッチは PostgreSQL advisory lock を取得し、二重実行を防止する
   ```sql
   SELECT pg_try_advisory_lock(1) -- 1 = 請求生成バッチのロック ID
   ```
   ロック取得失敗時はバッチをスキップ（既に実行中）
3. **顧客登録 API との競合:** バッチ実行中の顧客登録は許可する（バッチは snapshot ベースのため影響なし）

**TypeScript 実装例（バッチ内）:**

```typescript
await withPlatformTx(async (tx) => {
  const tenants = await tx.tenant.findMany({
    where: { status: "active" },
  });

  for (const tenant of tenants) {
    const customerCount = await tx.customer.count({
      where: { tenantId: tenant.id, isDeleted: false },
    });

    const overageCount = Math.max(0, customerCount - tenant.softLimit);
    const overageFee = overageCount * tenant.overageFeePerCustomer;
    const baseFee = tenant.monthlyBaseFee;
    const totalFee = baseFee + overageFee;
    const taxAmount = Math.floor(totalFee * 0.10);
    const totalWithTax = totalFee + taxAmount;

    await tx.invoice.create({
      data: {
        tenantId: tenant.id,
        billingPeriodStart: startOfLastMonth,
        billingPeriodEnd: endOfLastMonth,
        plan: tenant.plan,
        baseFee,
        customerCount,
        customerLimit: tenant.customerLimit,
        softLimit: tenant.softLimit,
        hardLimit: tenant.hardLimit,
        overageCount,
        overageUnitFee: tenant.overageFeePerCustomer,
        overageFee,
        totalFee,
        taxRate: 0.10,
        taxAmount,
        totalWithTax,
        status: "draft",
        dueDate: endOfNextMonth,
      },
    });
  }
});
```

### 3.3 超過件数の算出

```
超過件数 = MAX(0, アクティブ顧客数 - softLimit)
超過料金 = 超過件数 × overageFeePerCustomer
```

**注意:** 超過課金の基準は `softLimit`（`customerLimit` ではない）。
`customerLimit` は表示用の基準件数。`softLimit` が課金計算の閾値。

### 3.4 計算例

```
テナントA: premium プラン
  softLimit: 500件, hardLimit: 700件
  バッチ実行時点の顧客数: 530件
  超過件数: 530 - 500 = 30件
  超過料金: 30 × 80 = 2,400円
  月額基本料: 15,000円
  合計請求額: 17,400円
```

```
テナントB: standard プラン（カスタム設定）
  softLimit: 120件, hardLimit: 200件
  バッチ実行時点の顧客数: 145件
  超過件数: 145 - 120 = 25件
  超過料金: 25 × 100 = 2,500円
  月額基本料: 5,000円
  合計請求額: 7,500円
```

---

## 4. 請求テーブル設計

### 4.1 Invoice（請求）

```prisma
model Invoice {
  id              Int       @id @default(autoincrement())
  tenantId        Int       @map("tenant_id")
  billingPeriodStart DateTime @map("billing_period_start") @db.Date
  billingPeriodEnd   DateTime @map("billing_period_end") @db.Date
  plan            String    @db.VarChar(50)               // 請求時のプラン名
  baseFee         Int       @map("base_fee")              // 基本料金（円）
  customerCount   Int       @map("customer_count")        // 請求時の顧客数
  customerLimit   Int       @map("customer_limit")        // 請求時の customerLimit
  softLimit       Int       @map("soft_limit")            // 請求時の softLimit
  hardLimit       Int       @map("hard_limit")            // 請求時の hardLimit
  overageCount    Int       @default(0) @map("overage_count")    // 超過件数
  overageUnitFee  Int       @default(0) @map("overage_unit_fee") // 超過単価
  overageFee      Int       @default(0) @map("overage_fee")      // 超過料金
  adjustmentFee   Int       @default(0) @map("adjustment_fee")   // 手動調整額
  adjustmentNote  String?   @map("adjustment_note")              // 調整理由
  totalFee        Int       @map("total_fee")             // 合計請求額（税抜）
  taxRate         Decimal   @default(0.10) @map("tax_rate") @db.Decimal(5,4)
  taxAmount       Int       @map("tax_amount")            // 消費税額（切り捨て）
  totalWithTax    Int       @map("total_with_tax")        // 税込合計
  status          String    @default("draft") @db.VarChar(20)
  dueDate         DateTime? @map("due_date") @db.Date     // 支払期限
  paidAt          DateTime? @map("paid_at")
  notes           String?
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@unique([tenantId, billingPeriodStart], map: "idx_invoices_tenant_period")
  @@index([status], map: "idx_invoices_status")
  @@index([dueDate], map: "idx_invoices_due_date")
  @@map("invoices")
}
```

### 4.2 請求生成バッチのロジック

```
1. 全 active テナントを取得（suspended/cancelled は除外）
2. 各テナントについて:
   a. バッチ実行時点のアクティブ顧客数を取得（isDeleted = false）
   b. 基本料金 = tenant.monthlyBaseFee
   c. 超過件数 = MAX(0, 顧客数 - tenant.softLimit)
   d. 超過料金 = 超過件数 × tenant.overageFeePerCustomer
   e. 合計（税抜） = 基本料金 + 超過料金
   f. 消費税 = FLOOR(合計 × taxRate)
   g. 税込合計 = 合計 + 消費税
   h. Invoice レコードを draft 状態で作成（softLimit, hardLimit もスナップショットとして記録）
3. 処理結果のサマリーをログ出力
```

#### 冪等性ルール

**原則: 同一期間の invoice は常に1レコードのみ存在する。**

- unique 制約 `(tenant_id, billing_period_start)` により同一期間の二重生成を防止
- 再実行時の挙動:
  - 既存の **draft** 請求がある場合: **再計算して update**
  - 既存の **cancelled** 請求がある場合: **`draft` に戻して再利用（update）**（新規作成しない）
  - 既存の **confirmed / sent / paid / overdue** 請求がある場合: **スキップ**（確定済みは変更不可）

#### cancelled 再利用時のフィールドルール

| 区分 | フィールド | 処理 |
|------|-----------|------|
| 更新 | 金額系（baseFee, overageFee, totalFee 等）、customerCount、softLimit、hardLimit、taxAmount、totalWithTax、status（→ `draft`）、updated_at | 再計算した値で上書き |
| 保持 | id、created_at、cancel_reason、cancel_timestamp | 変更しない（履歴として保持） |

#### 監査ログ

cancelled → draft の再生成時は以下を記録する:
- `action: "invoice_regenerated"`

```typescript
// 実装パターン
const existing = await tx.invoice.findUnique({
  where: { tenantId_billingPeriodStart: { tenantId, billingPeriodStart } },
});

if (!existing) {
  // 新規作成
  await tx.invoice.create({ data: invoiceData });

} else if (existing.status === "draft" || existing.status === "cancelled") {
  // draft: 再計算 / cancelled: draft に戻して再利用
  await tx.invoice.update({
    where: { id: existing.id },
    data: { ...invoiceData, status: "draft" },
  });

} else {
  // confirmed / sent / paid / overdue — 確定済みはスキップ
  continue;
}
```

---

## 5. 請求管理画面の仕様

### 5.1 画面一覧

| 画面 | URL | アクセス権限 | 説明 |
|------|-----|-----------|------|
| 請求一覧 | /platform/billing | platform_admin | 全テナントの請求一覧 |
| 請求詳細 | /platform/billing/:id | platform_admin | 請求の詳細・手動調整・ステータス変更 |
| テナント請求履歴 | /admin/billing | tenant_admin | 自テナントの請求履歴（閲覧のみ） |

### 5.2 請求一覧画面

**フィルタ:**
- 請求対象月（YYYY-MM）
- ステータス（draft / confirmed / sent / paid / overdue）
- テナント名

**表示項目:**
- テナント名、対象月、プラン、基本料、超過料金、合計（税込）、ステータス

**一括操作:**
- 「全て confirm」ボタン（draft → confirmed を一括実行）
- 「全て送付済みにする」ボタン（confirmed → sent を一括実行）

### 5.3 請求詳細画面

**表示:**
- テナント情報（名前、プラン、softLimit/hardLimit）
- 請求期間、基本料、顧客数、超過件数・料金
- 手動調整額・理由
- 消費税、税込合計

**操作:**
- ステータス変更ボタン（draft→confirmed→sent→paid / overdue）
- 手動調整（adjustmentFee / adjustmentNote の入力）
- 請求取消（cancelled に変更）

---

## 6. テナント側の請求閲覧

tenant_admin は自テナントの請求履歴を `/admin/billing` で閲覧可能。
表示のみで編集は不可。

---

## 7. 仮定事項

1. 消費税率は 10% 固定（将来の税率変更に備えて Invoice に taxRate を保持）
2. 消費税の端数は切り捨て
3. 支払期限は請求月の翌月末（例: 3月分の請求は 4月30日が期限）
4. 日割り課金は MVP では行わない
5. 請求書 PDF の自動生成は将来対応（MVP ではデータのみ管理）
