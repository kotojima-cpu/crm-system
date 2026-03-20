# Staging 検証手順 — Phase 18

> 本番デプロイ前に staging 環境で実施するチェックリスト
> Phase 18: Vitest 安定化 / Alert Suppression Audit / Alert Status API 改善 / Docs 強化

---

## 前提条件

- `APP_ENV=staging` が設定されていること
- platform_admin 権限を持つテストユーザーが用意されていること
- Phase 17 の検証が完了していること

---

## 1. test:ci の実行確認

```bash
npm run test:ci
# 期待値: 全テスト PASS、.claude/** / .next/** が除外されること
```

---

## 2. Alert Cooldown Suppression の確認

### 2.1 初回アラート通知（suppression なし）

```bash
TOKEN="<platform_admin_token>"

# dead event を作成後、health-check を実行
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  /api/platform/outbox/health-check
# 期待値: notificationsSent=true または suppressedByCooldown=false
```

### 2.2 60 分以内の再実行（cooldown suppression）

```bash
# 同じアラートキーで再度 health-check
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  /api/platform/outbox/health-check
# 期待値: suppressedByCooldown=true
```

### 2.3 Suppression Audit Log 確認

```sql
SELECT action, new_values
FROM audit_logs
WHERE action = 'suppress'
  AND table_name = 'outbox_event'
ORDER BY created_at DESC
LIMIT 1;
-- new_values.business.reason = "cooldown"
-- new_values.business.channels に suppressed channel が含まれること
-- new_values.business.alertCodes にアラートコードが含まれること
```

---

## 3. Alert Status API の確認

### 3.1 レスポンスに status フィールドが含まれること

```bash
curl \
  -H "Authorization: Bearer $TOKEN" \
  /api/platform/outbox/alert-status
# 期待値: 200
# レスポンスに status（"healthy" | "warning" | "critical"）が含まれること
# 例:
# {
#   "data": {
#     "lastHealthCheckAt": "2026-03-17T10:00:00.000Z",
#     "suppressedByCooldown": true,
#     "alertCodes": ["DEAD_EVENTS_EXIST"],
#     "status": "critical"
#   }
# }
```

### 3.2 履歴なしの場合

```bash
# DB に health check 履歴がない状態で実行
curl \
  -H "Authorization: Bearer $TOKEN" \
  /api/platform/outbox/alert-status
# 期待値:
# {
#   "data": {
#     "lastHealthCheckAt": null,
#     "suppressedByCooldown": false,
#     "alertCodes": [],
#     "status": "healthy"
#   }
# }
```

---

## 4. Status 判定ロジックの確認

| alertCodes | 期待 status |
|-----------|------------|
| `[]` | `healthy` |
| `["FAILED_EVENTS_HIGH"]` | `warning` |
| `["DEAD_EVENTS_EXIST"]` | `critical` |
| `["STUCK_PROCESSING"]` | `critical` |
| `["DEAD_EVENTS_EXIST", "FAILED_EVENTS_HIGH"]` | `critical` |

---

## 5. Health History List UI 確認

UI から `/platform/outbox` を開いて:
1. Health Check 実行後、履歴リストに行が追加されること
2. status カラムが正しく表示されること（healthy=緑、warning=黄、critical=赤）
3. Cooldown 抑制カラムが suppression 時に「あり」と表示されること

---

## 6. チェックリスト

- [ ] `npm run test:ci` が全テスト PASS
- [ ] cooldown suppression が動作する（60 分以内再送が抑制）
- [ ] suppression 発生時に audit_logs に `action=suppress` が記録される
- [ ] audit_logs の `new_values.business.reason` が `"cooldown"` であること
- [ ] `GET /api/platform/outbox/alert-status` に `status` フィールドが含まれる
- [ ] dead/stuck なし → status=healthy
- [ ] dead/stuck あり → status=critical
- [ ] 履歴なしの場合 status=healthy, lastHealthCheckAt=null が返る
- [ ] Health History List UI の status カラムが正しく表示される
