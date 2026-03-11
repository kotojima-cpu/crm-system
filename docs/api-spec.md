# API仕様書

## 1. 共通仕様

### 1.1 ベースURL

```
/api
```

### 1.2 認証

- NextAuth.js の JWT セッションを使用
- 認証が必要なエンドポイントには `Authorization: Bearer <token>` ヘッダーまたはセッション Cookie を付与
- 未認証の場合は `401 Unauthorized` を返却

### 1.3 共通レスポンス形式

**成功時（単一リソース）**:
```json
{
  "data": { ... }
}
```

**成功時（一覧）**:
```json
{
  "data": [ ... ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

**エラー時**:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "会社名は必須です",
    "details": [
      { "field": "companyName", "message": "必須項目です" }
    ]
  }
}
```

### 1.4 エラーコード一覧

| HTTPステータス | code | 説明 |
|---------------|------|------|
| 400 | VALIDATION_ERROR | バリデーションエラー |
| 401 | UNAUTHORIZED | 未認証 |
| 403 | FORBIDDEN | 権限不足 |
| 404 | NOT_FOUND | リソースが見つからない |
| 409 | CONFLICT | 重複（メールアドレス等） |
| 500 | INTERNAL_ERROR | サーバー内部エラー |

### 1.5 ページネーション共通パラメータ

| パラメータ | 型 | デフォルト | 説明 |
|-----------|-----|-----------|------|
| page | number | 1 | ページ番号 |
| limit | number | 20 | 1ページあたりの件数（最大100） |

---

## 2. 認証 API

### 2.1 POST /api/auth/login

ログイン認証を行い、JWTトークンを発行する。

**リクエスト**:
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**レスポンス（200）**:
```json
{
  "data": {
    "user": {
      "id": 1,
      "email": "user@example.com",
      "name": "田中太郎",
      "role": "admin"
    },
    "token": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

**エラー（401）**: メールアドレスまたはパスワードが不正

### 2.2 POST /api/auth/logout

セッションを破棄する。

**レスポンス（200）**:
```json
{
  "data": { "message": "ログアウトしました" }
}
```

### 2.3 GET /api/auth/me

現在のログインユーザー情報を取得する。

**レスポンス（200）**:
```json
{
  "data": {
    "id": 1,
    "email": "user@example.com",
    "name": "田中太郎",
    "role": "admin"
  }
}
```

---

## 3. 顧客 API

### 3.1 GET /api/customers

顧客一覧を取得する。

**クエリパラメータ**:

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| page | number | ページ番号 |
| limit | number | 件数 |
| search | string | 会社名・担当者名・電話番号での部分一致検索 |
| sortBy | string | ソート項目（`companyName`, `companyNameKana`, `createdAt`） |
| sortOrder | string | ソート順（`asc`, `desc`） |

**レスポンス（200）**:
```json
{
  "data": [
    {
      "id": 1,
      "companyName": "株式会社ABC商事",
      "companyNameKana": "カブシキガイシャエービーシーショウジ",
      "phone": "03-1234-5678",
      "contactName": "佐藤花子",
      "contractCount": 3,
      "createdAt": "2025-04-01T09:00:00Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 50, "totalPages": 3 }
}
```

### 3.2 GET /api/customers/:id

顧客詳細を取得する（紐付く契約一覧を含む）。

**レスポンス（200）**:
```json
{
  "data": {
    "id": 1,
    "companyName": "株式会社ABC商事",
    "companyNameKana": "カブシキガイシャエービーシーショウジ",
    "zipCode": "100-0001",
    "address": "東京都千代田区...",
    "phone": "03-1234-5678",
    "fax": "03-1234-5679",
    "contactName": "佐藤花子",
    "contactPhone": "090-1234-5678",
    "contactEmail": "sato@abc-shoji.co.jp",
    "notes": "月末訪問希望",
    "createdBy": { "id": 1, "name": "田中太郎" },
    "createdAt": "2025-04-01T09:00:00Z",
    "updatedAt": "2025-04-15T14:30:00Z",
    "leaseContracts": [
      {
        "id": 1,
        "contractNumber": "LC-2025-001",
        "deviceName": "Canon iR-ADV C5560",
        "startDate": "2025-04-01",
        "totalMonths": 60,
        "remainingMonths": 57,
        "status": "active",
        "monthlyAmount": 45000
      }
    ]
  }
}
```

### 3.3 POST /api/customers

顧客を新規登録する。

**リクエスト**:
```json
{
  "companyName": "株式会社ABC商事",
  "companyNameKana": "カブシキガイシャエービーシーショウジ",
  "zipCode": "100-0001",
  "address": "東京都千代田区...",
  "phone": "03-1234-5678",
  "fax": "03-1234-5679",
  "contactName": "佐藤花子",
  "contactPhone": "090-1234-5678",
  "contactEmail": "sato@abc-shoji.co.jp",
  "notes": "月末訪問希望"
}
```

| フィールド | 必須 | バリデーション |
|-----------|------|---------------|
| companyName | ○ | 1〜200文字 |
| companyNameKana | — | カタカナ、200文字以内 |
| zipCode | — | `NNN-NNNN` 形式 |
| address | — | 500文字以内 |
| phone | — | 電話番号形式 |
| fax | — | 電話番号形式 |
| contactName | — | 100文字以内 |
| contactPhone | — | 電話番号形式 |
| contactEmail | — | メールアドレス形式 |
| notes | — | テキスト |

**レスポンス（201）**: 作成された顧客データ（GET /api/customers/:id と同形式）

### 3.4 PUT /api/customers/:id

顧客情報を更新する。

**リクエスト**: POST と同一形式（部分更新可）

**レスポンス（200）**: 更新後の顧客データ

### 3.5 DELETE /api/customers/:id

顧客を削除する。紐付く契約がある場合は `409 CONFLICT` を返す。

**レスポンス（200）**:
```json
{
  "data": { "message": "顧客を削除しました" }
}
```

---

## 4. 契約 API

### 4.1 GET /api/contracts

契約一覧を取得する。

**クエリパラメータ**:

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| page | number | ページ番号 |
| limit | number | 件数 |
| customerId | number | 顧客IDでフィルタ |
| status | string | ステータスでフィルタ（`active`, `expiring_soon`, `expired`, `cancelled`） |
| search | string | 契約番号・機器名での部分一致検索 |
| sortBy | string | ソート項目（`startDate`, `endDate`, `remainingMonths`, `createdAt`） |
| sortOrder | string | ソート順（`asc`, `desc`） |

**レスポンス（200）**:
```json
{
  "data": [
    {
      "id": 1,
      "contractNumber": "LC-2025-001",
      "customer": { "id": 1, "companyName": "株式会社ABC商事" },
      "leaseCompany": "オリックス",
      "deviceName": "Canon iR-ADV C5560",
      "startDate": "2025-04-01",
      "endDate": "2030-03-31",
      "totalMonths": 60,
      "remainingMonths": 57,
      "monthlyAmount": 45000,
      "status": "active"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 30, "totalPages": 2 }
}
```

> **注意**: `remainingMonths` はDBから取得せず、`startDate` と `totalMonths` からサーバー側で動的計算してレスポンスに含める。

### 4.2 GET /api/contracts/:id

契約詳細を取得する。

**レスポンス（200）**:
```json
{
  "data": {
    "id": 1,
    "contractNumber": "LC-2025-001",
    "customer": {
      "id": 1,
      "companyName": "株式会社ABC商事",
      "contactName": "佐藤花子"
    },
    "leaseCompany": "オリックス",
    "deviceName": "Canon iR-ADV C5560",
    "deviceModel": "C5560",
    "deviceSerial": "ABC123456",
    "startDate": "2025-04-01",
    "endDate": "2030-03-31",
    "totalMonths": 60,
    "remainingMonths": 57,
    "monthlyAmount": 45000,
    "status": "active",
    "notes": "",
    "createdBy": { "id": 1, "name": "田中太郎" },
    "createdAt": "2025-04-01T09:00:00Z",
    "updatedAt": "2025-04-01T09:00:00Z"
  }
}
```

### 4.3 POST /api/contracts

契約を新規登録する。

**リクエスト**:
```json
{
  "customerId": 1,
  "contractNumber": "LC-2025-001",
  "leaseCompany": "オリックス",
  "deviceName": "Canon iR-ADV C5560",
  "deviceModel": "C5560",
  "deviceSerial": "ABC123456",
  "startDate": "2025-04-01",
  "endDate": "2030-03-31",
  "totalMonths": 60,
  "monthlyAmount": 45000,
  "notes": ""
}
```

| フィールド | 必須 | バリデーション |
|-----------|------|---------------|
| customerId | ○ | 有効な顧客ID |
| contractNumber | — | 50文字以内、ユニーク |
| leaseCompany | — | 200文字以内 |
| deviceName | ○ | 1〜200文字 |
| deviceModel | — | 100文字以内 |
| deviceSerial | — | 100文字以内 |
| startDate | ○ | YYYY-MM-DD 形式 |
| endDate | ○ | YYYY-MM-DD 形式、startDate 以降 |
| totalMonths | ○ | 正の整数 |
| monthlyAmount | — | 0以上の整数 |
| notes | — | テキスト |

**レスポンス（201）**: 作成された契約データ

### 4.4 PUT /api/contracts/:id

契約情報を更新する。

**リクエスト**: POST と同一形式（部分更新可、customerId は変更不可）

**レスポンス（200）**: 更新後の契約データ

### 4.5 DELETE /api/contracts/:id

契約を削除する。

**レスポンス（200）**:
```json
{
  "data": { "message": "契約を削除しました" }
}
```

---

## 5. ユーザー管理 API

> **権限**: 管理者（role: admin）のみアクセス可能。一般ユーザーは `403 FORBIDDEN`。

### 5.1 GET /api/users

ユーザー一覧を取得する。

**クエリパラメータ**:

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| page | number | ページ番号 |
| limit | number | 件数 |
| search | string | 名前・メールアドレスでの検索 |

**レスポンス（200）**:
```json
{
  "data": [
    {
      "id": 1,
      "email": "admin@example.com",
      "name": "管理者",
      "role": "admin",
      "isActive": true,
      "createdAt": "2025-01-01T00:00:00Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 5, "totalPages": 1 }
}
```

### 5.2 GET /api/users/:id

ユーザー詳細を取得する。

### 5.3 POST /api/users

ユーザーを新規登録する。

**リクエスト**:
```json
{
  "email": "user@example.com",
  "password": "securePassword123",
  "name": "田中太郎",
  "role": "general"
}
```

| フィールド | 必須 | バリデーション |
|-----------|------|---------------|
| email | ○ | メールアドレス形式、ユニーク |
| password | ○ | 8文字以上 |
| name | ○ | 1〜100文字 |
| role | ○ | `admin` または `general` |

**レスポンス（201）**: 作成されたユーザーデータ（password_hash は含まない）

### 5.4 PUT /api/users/:id

ユーザー情報を更新する。password フィールドが含まれる場合のみパスワードを更新。

### 5.5 DELETE /api/users/:id

ユーザーを無効化する（`is_active = false`）。物理削除は行わない。
自分自身は削除不可（`400 Bad Request`）。

---

## 6. バッチ API

### 6.1 POST /api/batch/update-contract-status

契約ステータスの一括更新を実行する。Cron ジョブから呼び出される。

**認証**: API キーまたは Cron シークレットによる認証

**レスポンス（200）**:
```json
{
  "data": {
    "processed": 150,
    "updated": 3,
    "details": {
      "toExpiringSoon": 2,
      "toExpired": 1
    }
  }
}
```
