# CLAUDE.md — OA機器販売 顧客管理システム

## プロジェクト概要

OA機器（複合機・プリンター等）の販売・リース契約を管理するWebアプリケーション。
PC向けWEB版（正本）とスマホ向けPWA版（閲覧専用）を提供する。

## 技術スタック

- **フロントエンド**: Next.js (App Router) + TypeScript
- **UI**: shadcn/ui + Tailwind CSS
- **バックエンド**: Next.js API Routes
- **ORM**: Prisma
- **DB**: PostgreSQL（開発: Docker）
- **認証**: NextAuth.js（Credentials + JWT）
- **PWA**: next-pwa

## ディレクトリ構成（想定）

```
├── prisma/
│   ├── schema.prisma          # DBスキーマ定義
│   ├── seed.ts                # シードスクリプト
│   └── migrations/            # マイグレーションファイル
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   └── login/page.tsx
│   │   ├── (main)/
│   │   │   ├── customers/
│   │   │   │   ├── page.tsx          # 顧客一覧
│   │   │   │   ├── new/page.tsx      # 顧客登録
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx      # 顧客詳細
│   │   │   │       ├── edit/page.tsx  # 顧客編集
│   │   │   │       └── contracts/
│   │   │   │           └── new/page.tsx  # 契約登録
│   │   │   ├── contracts/
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx      # 契約詳細
│   │   │   │       └── edit/page.tsx  # 契約編集
│   │   │   └── admin/
│   │   │       └── users/page.tsx    # ユーザー管理
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/route.ts
│   │   │   ├── customers/
│   │   │   ├── contracts/
│   │   │   ├── users/
│   │   │   └── batch/
│   │   └── layout.tsx
│   ├── components/
│   │   ├── ui/               # shadcn/ui コンポーネント
│   │   ├── header.tsx
│   │   ├── pagination.tsx
│   │   ├── search-bar.tsx
│   │   └── ...
│   ├── lib/
│   │   ├── prisma.ts         # Prismaクライアント
│   │   ├── auth.ts           # NextAuth設定
│   │   ├── utils.ts          # 共通ユーティリティ
│   │   └── contract-utils.ts  # 残回数計算等
│   └── types/
│       └── index.ts          # 型定義
├── public/
│   ├── manifest.json         # PWA マニフェスト
│   └── icons/
├── docs/                     # 設計ドキュメント
├── docker-compose.yml
├── .env.example
└── CLAUDE.md
```

## コマンド

```bash
# 開発
npm run dev              # 開発サーバー起動
docker compose up -d     # PostgreSQL起動

# DB操作
npx prisma migrate dev   # マイグレーション実行（開発）
npx prisma migrate deploy # マイグレーション実行（本番）
npx prisma db seed       # シードデータ投入
npx prisma studio        # DB GUI

# ビルド・テスト
npm run build            # プロダクションビルド
npm run test             # テスト実行
npm run lint             # リンター実行
```

## 重要な設計判断

1. **残回数の動的計算**: `remaining_months` カラムはDBに持たない。`start_date` と `total_months` からAPIレスポンス時にサーバー側で算出する。計算ロジックは `src/lib/contract-utils.ts` に集約。

2. **ステータスのバッチ更新**: 契約ステータス（active → expiring_soon → expired）は日次バッチで更新。残回数自体は都度計算だが、ステータスはDB検索の効率のためカラムとして保持。

3. **PWAの閲覧専用制限**: WEB版とPWA版は同一コードベース。ビューポート幅（768px）で登録/編集/削除ボタンの表示を制御。

4. **認証**: NextAuth.js の Credentials Provider + JWT セッション。ロールは admin / general の2種。

## コーディング規約

- 日本語コメントOK（変数名・関数名は英語）
- API レスポンスは `{ data: ... }` / `{ error: ... }` の統一形式
- Prisma のテーブル名はスネークケース（`@@map` で指定）、モデル名はパスカルケース
- コンポーネントは関数コンポーネント + hooks
- フォームバリデーションはサーバー側とクライアント側の両方で実施
