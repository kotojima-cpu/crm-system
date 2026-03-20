# Staging 検証手順 — Phase 19

> 本番デプロイ前に staging 環境で実施するチェックリスト
> Phase 19: Alert History API / Health History 詳細表示 / 運用画面強化 / Cleanup 基盤

---

## 前提条件

- `APP_ENV=staging` が設定されていること
- platform_admin 権限を持つテストユーザーが用意されていること
- Phase 18 の検証が完了していること

---

## 1. Alert History API の確認

### 1.1 基本取得

```bash
TOKEN="<platform_admin_token>"

curl \
  -H "Authorization: Bearer $TOKEN" \
  "/api/platform/outbox/alert-history"
# 期待値: 200, data.items が配列
```

### 1.2 limit クエリ

```bash
curl \
  -H "Authorization: Bearer $TOKEN" \
  "/api/platform/outbox/alert-history?limit=5"
# 期待値: items の件数が最大 5 件
```

### 1.3 channel フィルター

```bash
# webhook のみ
curl \
  -H "Authorization: Bearer $TOKEN" \
  "/api/platform/outbox/alert-history?channel=webhook"
# 期待値: channel=webhook のレコードのみ

# mail のみ
curl \
  -H "Authorization: Bearer $TOKEN" \
  "/api/platform/outbox/alert-history?channel=mail"
```

### 1.4 無効な channel

```bash
curl \
  -H "Authorization: Bearer $TOKEN" \
  "/api/platform/outbox/alert-history?channel=fax"
# 期待値: channel フィルターなし（全件）
```

---

## 2. /platform/outbox 画面の確認

UI から `/platform/outbox` を開いて:

1. **Health Check 履歴** と **Alert 履歴** が 2 カラムで並んで表示されること
2. モバイル表示（768px 以下）で 1 カラムに切り替わること

### 2.1 Health History 詳細確認

- 各行の下に summary 行が表示されること
  - `pending: N / failed: N / dead: N / stuck: N / recoverable: N`
- summary JSON が壊れている行は summary 行が非表示になること

### 2.2 Alert History 確認

- 最終送信日時 / チャネル / Alert Key / 表示 が列表示されること
- Alert Key の表示列が `webhook: DEAD_EVENTS_EXIST` 形式になること

---

## 3. Retention Cleanup の動作確認

cleanup は API route がないため DB 直接確認:

```sql
-- 30 日以上前のデータを挿入してテスト
INSERT INTO platform_alert_histories (alert_key, channel, last_sent_at, created_at, updated_at)
VALUES ('TEST', 'webhook', NOW() - INTERVAL '31 days', NOW(), NOW());

-- cleanup 実行後に削除されること（アプリ内で service を呼び出すか、
-- または以下で手動確認）
SELECT COUNT(*) FROM platform_alert_histories
WHERE last_sent_at < NOW() - INTERVAL '30 days';
-- → 削除前: 1以上、削除後: 0
```

---

## 4. Permission 確認

| 操作 | 期待 |
|------|------|
| tenant_admin で `/alert-history` | 403 |
| platform_admin で `/alert-history` | 200 |

---

## 5. test:ci 実行

```bash
npm run test:ci
# 全テスト PASS であること
```

---

## 6. チェックリスト

- [ ] `GET /api/platform/outbox/alert-history` が 200 を返す
- [ ] limit クエリが機能する
- [ ] channel=webhook / mail フィルターが機能する
- [ ] 無効な channel は全件取得になる
- [ ] tenant_admin でアクセスすると 403
- [ ] /platform/outbox に 2 カラムで Health/Alert 履歴が表示される
- [ ] Health History の各行に summary サブ行が表示される
- [ ] Alert History の「表示」列が `チャネル: コード` 形式
- [ ] `npm run test:ci` が全テスト PASS
