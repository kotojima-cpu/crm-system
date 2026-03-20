# Staging 検証手順 — Phase 16

> 本番デプロイ前に staging 環境で実施するチェックリスト
> Phase 16: Stuck Recovery / Alert Notification / Health Check / UI 改善

---

## 前提条件

- `APP_ENV=staging` が設定されていること
- platform_admin 権限を持つテストユーザーが用意されていること
- Phase 15 の検証が完了していること

---

## 1. Health Check の確認

```bash
TOKEN="<platform_admin_token>"

# health-check 実行
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  /api/platform/outbox/health-check
# 期待値: 200
# レスポンスに summary / alerts / metricsPublished が含まれること
```

アラート通知が未設定の場合:
```json
{
  "data": {
    "metricsPublished": true,
    "notificationsSent": false,
    "notificationReasons": ["OUTBOX_ALERT_WEBHOOK_URL and OUTBOX_ALERT_EMAIL_TO are not set"]
  }
}
```

---

## 2. Stuck Event 作成 → Recovery 確認

### 2.1 stuck event を作成する（テスト用）

```sql
-- 15分以上前に processing になったままのイベントを作成
UPDATE outbox_events
SET status = 'processing',
    updated_at = NOW() - INTERVAL '20 minutes'
WHERE id = <テスト用 event ID>;
```

### 2.2 recoverable-stuck 一覧確認

```bash
curl \
  -H "Authorization: Bearer $TOKEN" \
  "/api/platform/outbox/recoverable-stuck?thresholdMinutes=15"
# 期待値: 200、items に上記 event が含まれること
```

### 2.3 Dry Run で対象確認

```bash
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"thresholdMinutes": 15, "dryRun": true}' \
  /api/platform/outbox/recover-stuck
# 期待値: dryRun=true、recoveredIds に event ID が含まれること
# DB の status は変わっていないこと
```

### 2.4 Recovery 実行

```bash
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"thresholdMinutes": 15, "dryRun": false}' \
  /api/platform/outbox/recover-stuck
# 期待値: recoveredCount >= 1
# DB で event.status = 'failed'、lastError に "Recovered from stuck processing" が入ること
# AuditLog に action=recover が記録されること
```

---

## 3. Alert Notification の確認

### 3.1 Webhook 通知（allowlist 設定時）

```bash
# 環境変数設定
export OUTBOX_ALERT_WEBHOOK_URL=https://hooks.staging.local/outbox-alert
export ALLOWED_WEBHOOK_HOSTS=hooks.staging.local

# dead event を作って health-check を実行
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  /api/platform/outbox/health-check
# 期待値: notificationsSent=true（allowlist 通過時）
# ログに "[HttpWebhook] Dispatching webhook" が出ること
```

### 3.2 Mail 通知の dry-run 動作確認

```bash
export OUTBOX_ALERT_EMAIL_TO=ops@staging.local
export ALLOWED_EMAIL_DOMAINS=staging.local
# staging では staging.local ドメインのみ送信される
```

---

## 4. Force Replay 理由入力必須の確認

UI から `/platform/outbox/{eventId}` を開いて:
1. `sent` ステータスのイベントで「Force Replay（危険）」ボタンをクリック
2. 理由入力フォームが表示されること
3. 理由が空のまま「実行」ボタンが disabled であること
4. 理由入力後に実行可能になること
5. 実行後 AuditLog に `reason` が記録されること

```sql
SELECT new_values
FROM audit_logs
WHERE action = 'replay'
  AND resource_type = 'outbox_event'
ORDER BY created_at DESC
LIMIT 1;
-- new_values.reason に入力した理由が含まれること
```

---

## 5. Metrics 発行確認

```bash
# poll または health-check を実行
curl -X POST -H "Authorization: Bearer $TOKEN" \
  /api/platform/outbox/health-check

# ECS タスクログで EMF JSON 出力を確認:
# {"_aws":{"Timestamp":...,"CloudWatchMetrics":[...]},"OutboxEventsPending":N,...}
```

---

## 6. Permission 確認

| 操作 | 期待 |
|------|------|
| tenant_admin で `/health-check` | 403 |
| tenant_admin で `/recover-stuck` | 403 |
| platform_admin で `/health-check` | 200 |
| platform_admin で `/recover-stuck` | 200 |
| platform_admin で `/recoverable-stuck` | 200 |

---

## 7. Validation エラー確認

```bash
# thresholdMinutes 範囲外
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"thresholdMinutes": 0}' \
  /api/platform/outbox/recover-stuck
# 期待値: 400

# limit 超過
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"limit": 501}' \
  /api/platform/outbox/recover-stuck
# 期待値: 400
```

---

## 8. チェックリスト

- [ ] health-check が 200 を返す
- [ ] health-check 後に CloudWatch Logs に EMF JSON が出力される
- [ ] recoverable-stuck 一覧が取得できる
- [ ] dryRun で対象確認後、実行で DB が更新される
- [ ] recovery 後 event.status が failed になる
- [ ] recovery 後 AuditLog に recover が記録される
- [ ] force replay で理由入力フォームが表示される
- [ ] 理由なしで force replay ボタンが disabled
- [ ] force replay 後 AuditLog の reason に入力理由が入る
- [ ] tenant_admin が health-check / recover-stuck にアクセスすると 403
- [ ] thresholdMinutes=0 → 400
- [ ] limit=501 → 400
