# Phase 17 ステージング検証手順

> 対象: platform_admin ロール保有者
> 環境: staging
> フェーズ: Phase 17 — Alert Dedup/Cooldown + Health Check History

---

## 前提条件

- [ ] `prisma migrate deploy` 実行済み（`platform_alert_histories`, `platform_health_check_histories` テーブルが存在する）
- [ ] staging 環境で `platform_admin` ロールのアカウントにログインできる

---

## A. Alert Cooldown 動作確認

### A-1. 初回アラート通知（送信許可）

1. `OUTBOX_ALERT_WEBHOOK_URL` または `OUTBOX_ALERT_EMAIL_TO` が設定されていることを確認
2. POST `/api/platform/outbox/health-check` を実行（dead または failed イベントが存在する場合）
3. 通知が送信されること（logs で確認）
4. `platform_alert_histories` テーブルに `last_sent_at` が記録されること

```sql
SELECT * FROM platform_alert_histories ORDER BY last_sent_at DESC;
```

### A-2. Cooldown 中の抑制確認

1. 60分以内に再度 POST `/api/platform/outbox/health-check` を実行
2. レスポンスの `suppressedByCooldown` が `true` であること
3. 通知が送信されないこと

```bash
curl -X POST /api/platform/outbox/health-check \
  -H "Authorization: Bearer ..." | jq '.data.suppressedByCooldown'
# → true
```

### A-3. Cooldown リセット後の再送信

```sql
DELETE FROM platform_alert_histories WHERE alert_key LIKE '%DEAD_EVENTS_EXIST%';
```

再度 health-check を実行し、通知が送信されること。

---

## B. Health Check 履歴確認

### B-1. 履歴の保存確認

1. POST `/api/platform/outbox/health-check` を複数回実行
2. `platform_health_check_histories` にレコードが追加されること

```sql
SELECT id, metrics_published, notifications_sent, suppressed_by_cooldown, created_at
FROM platform_health_check_histories
ORDER BY created_at DESC
LIMIT 5;
```

### B-2. 履歴取得 API

```bash
curl /api/platform/outbox/health-history?limit=10 \
  -H "Authorization: Bearer ..." | jq '.data.items | length'
```

### B-3. アラートステータス API

```bash
curl /api/platform/outbox/alert-status \
  -H "Authorization: Bearer ..." | jq '.data'
# {
#   "lastHealthCheckAt": "...",
#   "suppressedByCooldown": false,
#   "alertCodes": []
# }
```

---

## C. UI 確認

### C-1. Health Check パネル

1. `/platform/outbox` にアクセス
2. "Health Check 実行" ボタンが表示されること
3. ボタンをクリックしてレスポンスの `status` バッジが表示されること（healthy / warning / critical）

### C-2. Health Check 履歴テーブル

1. `/platform/outbox` の「Health Check 履歴」セクションにテーブルが表示されること
2. 各行に実行日時・ステータス・Metrics・通知・Cooldown 抑制が表示されること

---

## D. 新規モデル確認

```sql
-- PlatformAlertHistory
\d platform_alert_histories

-- PlatformHealthCheckHistory
\d platform_health_check_histories
```

期待するカラム:
- `platform_alert_histories`: id, alert_key, channel, last_sent_at, created_at, updated_at
- `platform_health_check_histories`: id, summary_json, alert_codes_json, metrics_published, notifications_sent, suppressed_by_cooldown, created_at

---

## E. 監査ログ確認

`AUDIT_OUTBOX_ALERT_SUPPRESSED` アクションが audit ログに記録されること（suppress された場合）。

---

## チェックリスト

- [ ] A-1: 初回通知が送信される
- [ ] A-2: 60分以内の再通知が抑制される
- [ ] A-3: Cooldown リセット後に再通知が送信される
- [ ] B-1: health check 履歴が DB に保存される
- [ ] B-2: GET /api/platform/outbox/health-history が 200 を返す
- [ ] B-3: GET /api/platform/outbox/alert-status が 200 を返す
- [ ] C-1: Health Check パネルが機能する
- [ ] C-2: 履歴テーブルが表示される
- [ ] D: 新規テーブルが存在し構造が正しい
