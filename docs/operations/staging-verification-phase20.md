# Staging 確認手順 — Phase 20

> 対象: platform_admin ロール保有者
> 環境: staging
> 最終更新: 2026-03-17 (Phase 20)

---

## 1. History Dashboard API

```bash
curl -s /api/platform/outbox/history-dashboard \
  -H "Authorization: Bearer <token>" | jq .
```

確認項目:
- [ ] HTTP 200 が返る
- [ ] `data.alertHistoryCount` が数値
- [ ] `data.healthHistoryCount` が数値
- [ ] `data.webhookAlertCount` が数値
- [ ] `data.mailAlertCount` が数値
- [ ] `data.suppressedHealthCheckCount` が数値
- [ ] `data.latestHealthStatus` が `healthy` / `warning` / `critical` / `unknown` のいずれか
- [ ] `data.latestHealthCheckAt` が ISO 日時文字列または `null`

---

## 2. History Cleanup API

### 2.1 正常系

```bash
curl -s -X POST /api/platform/outbox/history-cleanup \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"retentionDays": 30}' | jq .
```

確認項目:
- [ ] HTTP 200 が返る
- [ ] `data.alertHistoryDeletedCount` が数値
- [ ] `data.healthHistoryDeletedCount` が数値
- [ ] `data.retentionDays` が `30`

### 2.2 バリデーションテスト

```bash
# retentionDays=0 → 400
curl -s -X POST /api/platform/outbox/history-cleanup \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"retentionDays": 0}' | jq .
# 期待: HTTP 400, error.code = "VALIDATION_ERROR"

# retentionDays=366 → 400
curl -s -X POST /api/platform/outbox/history-cleanup \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"retentionDays": 366}' | jq .
# 期待: HTTP 400, error.code = "VALIDATION_ERROR"

# retentionDays=1 → 200
curl -s -X POST /api/platform/outbox/history-cleanup \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"retentionDays": 1}' | jq .
# 期待: HTTP 200

# retentionDays=365 → 200
curl -s -X POST /api/platform/outbox/history-cleanup \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"retentionDays": 365}' | jq .
# 期待: HTTP 200
```

確認項目:
- [ ] `retentionDays=0` → HTTP 400
- [ ] `retentionDays=366` → HTTP 400
- [ ] `retentionDays=1` → HTTP 200
- [ ] `retentionDays=365` → HTTP 200

---

## 3. Alert History alertKey 検索

```bash
# alertKey 部分一致フィルター
curl -s "/api/platform/outbox/alert-history?alertKey=DEAD" \
  -H "Authorization: Bearer <token>" | jq .

# channel + alertKey 組み合わせ
curl -s "/api/platform/outbox/alert-history?alertKey=DEAD&channel=webhook" \
  -H "Authorization: Bearer <token>" | jq .

# 空の alertKey はフィルターなし
curl -s "/api/platform/outbox/alert-history?alertKey=" \
  -H "Authorization: Bearer <token>" | jq .
```

確認項目:
- [ ] `?alertKey=DEAD` で DEAD を含む alertKey のレコードのみ返る
- [ ] `?alertKey=DEAD&channel=webhook` で channel も絞り込まれる
- [ ] `?alertKey=` はフィルターなし（全件返る）

---

## 4. UI — ダッシュボードカード / Cleanup パネル

`/platform/outbox` を開いて確認:

- [ ] OutboxSummaryCards の下に OutboxHistoryDashboardCards が表示される
- [ ] 6つのカードが表示される（アラート履歴件数、Health Check 履歴件数、Webhook、Mail、Cooldown 抑制、最新ステータス）
- [ ] latestHealthStatus のバッジが色付きで表示される（healthy=緑, warning=黄, critical=赤, unknown=灰）
- [ ] latestHealthCheckAt が表示される（または「null」）
- [ ] OutboxHistoryCleanupPanel が表示される
- [ ] retentionDays 入力欄のデフォルトが 30
- [ ] 「履歴 Cleanup 実行」ボタンをクリックすると結果が表示される
- [ ] エラー時はエラーメッセージが赤字で表示される

---

## 5. retentionDays バリデーション（UI 経由）

OutboxHistoryCleanupPanel で以下を確認:

| retentionDays | 期待結果 |
|--------------|---------|
| 0 | エラーメッセージ表示（400） |
| 366 | エラーメッセージ表示（400） |
| 1 | 正常結果表示（200） |
| 365 | 正常結果表示（200） |
