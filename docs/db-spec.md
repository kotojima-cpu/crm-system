# DB設計書

## 1. ER図

```
users
  PK id

customers
  PK id
  FK created_by → users.id

lease_contracts
  PK id
  FK customer_id → customers.id
  FK created_by → users.id
```

### リレーション

```
users 1 ──< N customers        (created_by)
users 1 ──< N lease_contracts   (created_by)
customers 1 ──< N lease_contracts (customer_id)
```

---

## 2. テーブル定義

### 2.1 users（ユーザー）

| カラム | 型 | 制約 | デフォルト | 説明 |
|--------|----|------|-----------|------|
| id | SERIAL (INT) | PK | auto | |
| email | VARCHAR(255) | UNIQUE, NOT NULL | — | ログインメールアドレス |
| password_hash | VARCHAR(255) | NOT NULL | — | bcrypt ハッシュ値 |
| name | VARCHAR(100) | NOT NULL | — | 表示名（氏名） |
| role | VARCHAR(20) | NOT NULL | 'general' | 権限（'admin' / 'general'） |
| is_active | BOOLEAN | NOT NULL | TRUE | アカウント有効/無効 |
| created_at | TIMESTAMP | NOT NULL | now() | 作成日時 |
| updated_at | TIMESTAMP | NOT NULL | now() | 更新日時 |

### 2.2 customers（顧客）

| カラム | 型 | 制約 | デフォルト | 説明 |
|--------|----|------|-----------|------|
| id | SERIAL (INT) | PK | auto | |
| company_name | VARCHAR(200) | NOT NULL | — | 会社名 |
| company_name_kana | VARCHAR(200) | — | NULL | 会社名カナ（検索・ソート用） |
| zip_code | VARCHAR(8) | — | NULL | 郵便番号（ハイフンあり: 123-4567） |
| address | VARCHAR(500) | — | NULL | 住所 |
| phone | VARCHAR(20) | — | NULL | 電話番号 |
| fax | VARCHAR(20) | — | NULL | FAX番号 |
| contact_name | VARCHAR(100) | — | NULL | 担当者名 |
| contact_phone | VARCHAR(20) | — | NULL | 担当者電話番号 |
| contact_email | VARCHAR(255) | — | NULL | 担当者メールアドレス |
| notes | TEXT | — | NULL | 備考 |
| created_by | INT | FK → users.id | — | 登録者 |
| created_at | TIMESTAMP | NOT NULL | now() | 作成日時 |
| updated_at | TIMESTAMP | NOT NULL | now() | 更新日時 |

### 2.3 lease_contracts（リース契約）

| カラム | 型 | 制約 | デフォルト | 説明 |
|--------|----|------|-----------|------|
| id | SERIAL (INT) | PK | auto | |
| customer_id | INT | FK → customers.id, NOT NULL | — | 紐付く顧客 |
| contract_number | VARCHAR(50) | UNIQUE | NULL | 契約番号 |
| lease_company | VARCHAR(200) | — | NULL | リース会社名 |
| device_name | VARCHAR(200) | NOT NULL | — | 機器名称（例: Canon iR-ADV C5560） |
| device_model | VARCHAR(100) | — | NULL | 型番 |
| device_serial | VARCHAR(100) | — | NULL | シリアル番号 |
| start_date | DATE | NOT NULL | — | 契約開始日 |
| end_date | DATE | NOT NULL | — | 契約終了日 |
| total_months | INT | NOT NULL | — | 総回数（月数） |
| monthly_amount | DECIMAL(12,0) | — | NULL | 月額リース料（円） |
| counter_base_fee | DECIMAL(10,2) | — | NULL | カウンター基本料金（円/月） |
| mono_counter_rate | DECIMAL(10,2) | — | NULL | モノクロカウンター料金（円/枚、小数対応） |
| color_counter_rate | DECIMAL(10,2) | — | NULL | カラーカウンター料金（円/枚、小数対応） |
| status | VARCHAR(20) | NOT NULL | 'active' | 契約ステータス |
| notes | TEXT | — | NULL | 備考 |
| created_by | INT | FK → users.id | — | 登録者 |
| created_at | TIMESTAMP | NOT NULL | now() | 作成日時 |
| updated_at | TIMESTAMP | NOT NULL | now() | 更新日時 |

> **注意**: `remaining_months`（残回数）カラムは持たない。残回数は `start_date` と `total_months` からAPIレスポンス時に動的計算する。

---

## 3. ステータス定義と遷移

### 3.1 契約ステータス（status）

| 値 | 表示名 | 説明 |
|----|--------|------|
| active | 有効 | 残回数4ヶ月以上の有効な契約 |
| expiring_soon | 満了間近 | 残回数3ヶ月以下の契約 |
| expired | 満了 | 残回数0（契約終了日を経過） |
| cancelled | 解約 | 途中解約された契約 |

### 3.2 ステータス遷移図

```
active → expiring_soon（残3ヶ月以下） → expired（残0ヶ月）
   ↘ cancelled（途中解約・手動変更）
```

---

## 4. 残回数の計算ロジック

DBに残回数を保持せず、サーバー側で動的に計算する。

### 4.1 計算式

```
remaining_months = total_months - months_elapsed

months_elapsed = (現在年 - 開始年) × 12 + (現在月 - 開始月)

// 境界条件
if remaining_months < 0 then remaining_months = 0
if remaining_months > total_months then remaining_months = total_months
```

### 4.2 TypeScript実装例

```typescript
function calculateRemainingMonths(startDate: Date, totalMonths: number): number {
  const now = new Date();
  const elapsed =
    (now.getFullYear() - startDate.getFullYear()) * 12 +
    (now.getMonth() - startDate.getMonth());
  return Math.max(0, Math.min(totalMonths, totalMonths - elapsed));
}
```

---

## 5. バッチ処理（ステータス自動更新）

残回数はAPI応答時に動的計算するが、**ステータス**はバッチで更新する。
これにより、ステータスでのフィルタリングや検索がDB側で効率的に行える。

### 5.1 実行タイミング

- 毎日 00:05 に実行（Vercel Cron または node-cron）

### 5.2 処理フロー

```
1. status = 'active' OR 'expiring_soon' の契約を取得
2. 各契約について残回数を計算:
   a. remaining <= 0 → status = 'expired'
   b. remaining <= 3 かつ > 0 → status = 'expiring_soon'
   c. remaining > 3 → status = 'active'（expiring_soon から戻る場合）
3. 変更があった契約のみ UPDATE
4. 処理結果をログ出力
```

---

## 6. インデックス定義

```sql
-- 顧客検索用
CREATE INDEX idx_customers_company_name ON customers(company_name);
CREATE INDEX idx_customers_company_name_kana ON customers(company_name_kana);
CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_customers_contact_name ON customers(contact_name);

-- 契約検索・バッチ処理用
CREATE INDEX idx_contracts_customer_id ON lease_contracts(customer_id);
CREATE INDEX idx_contracts_status ON lease_contracts(status);
CREATE INDEX idx_contracts_end_date ON lease_contracts(end_date);
CREATE INDEX idx_contracts_start_date ON lease_contracts(start_date);
```

---

## 7. Prisma スキーマ（想定）

```prisma
model User {
  id           Int       @id @default(autoincrement())
  email        String    @unique @db.VarChar(255)
  passwordHash String    @map("password_hash") @db.VarChar(255)
  name         String    @db.VarChar(100)
  role         String    @default("general") @db.VarChar(20)
  isActive     Boolean   @default(true) @map("is_active")
  createdAt    DateTime  @default(now()) @map("created_at")
  updatedAt    DateTime  @updatedAt @map("updated_at")

  customers      Customer[]
  leaseContracts LeaseContract[]

  @@map("users")
}

model Customer {
  id              Int       @id @default(autoincrement())
  companyName     String    @map("company_name") @db.VarChar(200)
  companyNameKana String?   @map("company_name_kana") @db.VarChar(200)
  zipCode         String?   @map("zip_code") @db.VarChar(8)
  address         String?   @db.VarChar(500)
  phone           String?   @db.VarChar(20)
  fax             String?   @db.VarChar(20)
  contactName     String?   @map("contact_name") @db.VarChar(100)
  contactPhone    String?   @map("contact_phone") @db.VarChar(20)
  contactEmail    String?   @map("contact_email") @db.VarChar(255)
  notes           String?
  createdBy       Int       @map("created_by")
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")

  creator        User            @relation(fields: [createdBy], references: [id])
  leaseContracts LeaseContract[]

  @@index([companyName], map: "idx_customers_company_name")
  @@index([companyNameKana], map: "idx_customers_company_name_kana")
  @@index([phone], map: "idx_customers_phone")
  @@index([contactName], map: "idx_customers_contact_name")
  @@map("customers")
}

model LeaseContract {
  id             Int       @id @default(autoincrement())
  customerId     Int       @map("customer_id")
  contractNumber String?   @unique @map("contract_number") @db.VarChar(50)
  leaseCompany   String?   @map("lease_company") @db.VarChar(200)
  deviceName     String    @map("device_name") @db.VarChar(200)
  deviceModel    String?   @map("device_model") @db.VarChar(100)
  deviceSerial   String?   @map("device_serial") @db.VarChar(100)
  startDate      DateTime  @map("start_date") @db.Date
  endDate        DateTime  @map("end_date") @db.Date
  totalMonths    Int       @map("total_months")
  monthlyAmount    Decimal?  @map("monthly_amount") @db.Decimal(12, 0)
  counterBaseFee   Decimal?  @map("counter_base_fee") @db.Decimal(10, 2)   // カウンター基本料金（円/月）
  monoCounterRate  Decimal?  @map("mono_counter_rate") @db.Decimal(10, 2)  // モノクロカウンター料金（円/枚）
  colorCounterRate Decimal?  @map("color_counter_rate") @db.Decimal(10, 2) // カラーカウンター料金（円/枚）
  status           String    @default("active") @db.VarChar(20)
  notes          String?
  createdBy      Int       @map("created_by")
  createdAt      DateTime  @default(now()) @map("created_at")
  updatedAt      DateTime  @updatedAt @map("updated_at")

  customer Customer @relation(fields: [customerId], references: [id])
  creator  User     @relation(fields: [createdBy], references: [id])

  @@index([customerId], map: "idx_contracts_customer_id")
  @@index([status], map: "idx_contracts_status")
  @@index([endDate], map: "idx_contracts_end_date")
  @@index([startDate], map: "idx_contracts_start_date")
  @@map("lease_contracts")
}
```

---

## 8. マイグレーション方針

- Prisma Migrate を使用（`npx prisma migrate dev`）
- 開発環境: Docker Compose で PostgreSQL を起動
- 本番環境: `npx prisma migrate deploy` で適用
- シード: `prisma/seed.ts` で管理者ユーザーと初期データを投入
