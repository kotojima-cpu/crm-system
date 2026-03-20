# Staging 検証手順 — Phase 15

> 本番デプロイ前に staging 環境で実施するチェックリスト
> Phase 15: Permission 分離 / CloudWatch Metrics / インフラ整備

---

## 前提条件

- `APP_ENV=staging` が設定されていること
- `INFRASTRUCTURE_MODE=aws` または `local` で動作確認済みであること
- platform_admin 権限を持つテストユーザーが用意されていること

---

## 1. Permission 分離の検証

### 1.1 正常系: platform_admin で各操作が成功する

```bash
TOKEN="<platform_admin_token>"

# Outbox 一覧取得
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  GET /api/platform/outbox
# 期待値: 200

# Outbox サマリー
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  GET /api/platform/outbox/summary
# 期待値: 200

# Poll 実行
curl -s -o /dev/null -w "%{http_code}" \
  -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"limit": 1}' \
  /api/platform/outbox/poll
# 期待値: 200
```

### 1.2 異常系: tenant_admin / 未認証で 401/403 が返ること

```bash
TENANT_TOKEN="<tenant_admin_token>"

# tenant_admin は outbox にアクセスできない
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $TENANT_TOKEN" \
  GET /api/platform/outbox
# 期待値: 401 or 403

# 未認証
curl -s -o /dev/null -w "%{http_code}" \
  GET /api/platform/outbox
# 期待値: 401
```

---

## 2. Outbox CRUD 操作の検証

### 2.1 Retry (failed → pending)

```bash
# 1. failed なイベントの ID を取得
EVENT_ID=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "/api/platform/outbox?status=failed&limit=1" | jq '.data.items[0].id')

# 2. retry 実行
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  /api/platform/outbox/${EVENT_ID}/retry
# 期待値: { "data": { "id": ..., "status": "pending" } }
```

### 2.2 Force Replay — forceSentReplay フラグなし → 400

```bash
# フラグなしで呼ぶと 400
curl -s -o /dev/null -w "%{http_code}" \
  -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}' \
  /api/platform/outbox/1/force-replay
# 期待値: 400
```

### 2.3 Force Replay — forceSentReplay: true → 成功

```bash
# ⚠️ 実行前: handler が冪等であることを確認
SENT_EVENT_ID=<送信済みイベントのID>
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"forceSentReplay": true}' \
  /api/platform/outbox/${SENT_EVENT_ID}/force-replay
# 期待値: { "data": { "id": ..., "status": "pending" } }
```

---

## 3. Webhook URL 検証の確認

staging 環境では不正な URL を持つ webhook イベントが処理されても
アプリがクラッシュしないことを確認する。

```bash
# ALLOWED_WEBHOOK_HOSTS に含まれていない endpoint は dry-run
# ログに "[HttpWebhook] Endpoint blocked by allowlist" が出ること

# 不正な URL スキームは早期リターン
# ログに "[HttpWebhook] Invalid endpoint URL format" が出ること
```

---

## 4. CloudWatch Metrics の確認

### 4.1 EMF ログが stdout に出力されること

```bash
# poll を実行して CloudWatch Logs に EMF JSON が出力されることを確認
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"limit": 5}' \
  /api/platform/outbox/poll

# ECS タスクログで以下の形式を確認:
# {"_aws":{"Timestamp":...,"CloudWatchMetrics":[...]},"OutboxEventsPending":N,...}
```

### 4.2 CloudWatch Metrics コンソール確認 (aws モード)

- Namespace: `OAManagement/Outbox`
- メトリクス: `OutboxEventsPending`, `OutboxEventsFailed`, `OutboxEventsDead` 等
- poll 後 1〜2 分でデータポイントが反映されること

---

## 5. AuditLog 記録の確認

| 操作 | AuditLog に記録されること |
|------|--------------------------|
| retry 実行 | action="retry", resourceType="outbox_event" |
| replay 実行 | action="replay", resourceType="outbox_event" |
| force-replay 実行 | action="replay", resourceType="outbox_event" |
| poll 実行 | action="poll", resourceType="outbox_event" |

```sql
-- DB で確認
SELECT action, resource_type, resource_id, actor_user_id, created_at
FROM audit_logs
WHERE resource_type = 'outbox_event'
ORDER BY created_at DESC
LIMIT 10;
```

---

## 6. チェックリスト

- [ ] platform_admin で outbox 一覧・詳細・サマリー取得できる
- [ ] tenant_admin で outbox API にアクセスすると 403 になる
- [ ] retry が failed イベントを pending に変更する
- [ ] replay が dead イベントを pending に変更する
- [ ] force-replay は `forceSentReplay: true` なしで 400 になる
- [ ] force-replay 実行後に AuditLog が記録される
- [ ] poll 実行後に CloudWatch Logs に EMF JSON が出力される
- [ ] 不正な URL (not-a-url) の webhook イベントがエラーログを出して skip される
- [ ] SES dry-run ログが `[SesMailer] Real email send is disabled` で出力される
