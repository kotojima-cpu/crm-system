# Outbox 運用ランブック

> 対象: platform_admin ロール保有者
> 環境: staging / production
> 最終更新: 2026-03-17 (Phase 16 更新)

---

## 1. Outbox とは

Outbox パターンは、DBトランザクションと非同期処理（メール送信・Webhook・SQS等）を
確実に連動させるための仕組み。

```
API リクエスト
  → DB write + outbox_event 作成（同一トランザクション）
  → poll サイクルで処理
  → sent / failed / dead に遷移
```

### イベントステータス遷移

```
pending → processing → sent      （正常）
                    → failed      （エラー、retryCount < maxRetries）
                    → dead        （retryCount >= maxRetries）
```

---

## 2. 監視ダッシュボード

### 2.1 概要サマリー確認

```
GET /api/platform/outbox/summary
Authorization: Bearer <platform_admin_token>
```

レスポンス例:
```json
{
  "data": {
    "summary": {
      "pendingCount": 3,
      "processingCount": 0,
      "failedCount": 1,
      "deadCount": 0,
      "sentCount": 1024,
      "stuckProcessingCount": 0
    },
    "alerts": [
      { "level": "warning", "code": "FAILED_EVENTS_HIGH", "count": 10 }
    ]
  }
}
```

### 2.2 アラート種別と対処

| code | 意味 | 対処 |
|------|------|------|
| `DEAD_EVENTS_EXIST` | dead イベントが存在する | replay で再投入 |
| `STUCK_PROCESSING` | 15分以上 processing のまま止まっている | worker 確認後 retry |
| `FAILED_EVENTS_HIGH` | failed が 10 件以上 | エラーサンプル確認後 retry |

---

## 3. 通常操作

### 3.1 Poll サイクル手動実行

```bash
curl -X POST /api/platform/outbox/poll \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"limit": 50}'
```

- `limit`: 1回で処理する最大件数（デフォルト 50）

### 3.2 Failed イベントの手動 Retry

`failed` ステータスのイベントを `pending` に戻し、次回 poll で再処理する。

```bash
curl -X POST /api/platform/outbox/{eventId}/retry \
  -H "Authorization: Bearer <token>"
```

### 3.3 Dead イベントの Replay

`dead` ステータスのイベントを `pending` に戻す。retryCount もリセット可能。

```bash
curl -X POST /api/platform/outbox/{eventId}/replay \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"resetRetryCount": true}'
```

- `resetRetryCount: true`: retryCount を 0 にリセット（推奨）

---

## 4. 緊急操作

### 4.1 Sent イベントの Force Replay

⚠️ **危険操作**: `sent` 済みのイベントを強制的に再処理する。
冪等でない handler では**二重送信**が発生する可能性がある。

```bash
curl -X POST /api/platform/outbox/{eventId}/force-replay \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"forceSentReplay": true}'
```

**実行前チェックリスト**:
- [ ] handler が冪等であることを確認（Invoice 作成等は非冪等）
- [ ] 受信側で重複チェックがあることを確認
- [ ] 操作を AuditLog で追跡できることを確認（自動記録される）

---

## 5. 障害対応フロー

### 5.1 Dead イベント大量発生

1. `GET /api/platform/outbox/summary` でアラート確認
2. `GET /api/platform/outbox?status=dead` で dead 一覧取得
3. `GET /api/platform/outbox/{eventId}` でエラー詳細確認
4. エラー原因を修正（外部サービス障害等）
5. `POST /api/platform/outbox/{eventId}/replay` で replay
6. `POST /api/platform/outbox/poll` で poll 実行

### 5.2 Stuck Processing（処理が固まっている）

1. `GET /api/platform/outbox?status=processing` で一覧確認
2. worker ログを CloudWatch Logs で確認（requestId で突合）
3. worker プロセスが死んでいる場合: 再起動
4. イベント単体の問題の場合: `POST /api/platform/outbox/{eventId}/retry`

### 5.3 SES / Webhook 送信失敗

1. `GET /api/platform/outbox/{eventId}` で `lastError` を確認
2. `isRetryable` に応じて対処:
   - retryable=true: `retry` または `replay` で再投入
   - retryable=false: 設定ミス（FROM アドレス、ドメイン検証等）を修正後 retry

---

## 6. CloudWatch Metrics

poll サイクル実行後、以下のメトリクスが `OAManagement/Outbox` namespace に発行される:

| メトリクス名 | 説明 |
|------------|------|
| `OutboxEventsPending` | 処理待ちイベント数 |
| `OutboxEventsProcessing` | 処理中イベント数 |
| `OutboxEventsFailed` | 失敗イベント数 |
| `OutboxEventsDead` | dead イベント数 |
| `OutboxEventsSent` | 送信済みイベント数 |
| `OutboxStuckProcessingCount` | 15分以上 processing のイベント数 |

推奨アラーム設定:
- `OutboxEventsDead > 0` → SNS 通知
- `OutboxStuckProcessingCount > 0` → SNS 通知
- `OutboxEventsFailed >= 10` → SNS 通知

---

## 7. 権限マッピング

| 操作 | 必要 Permission |
|------|----------------|
| 一覧・詳細・サマリー閲覧 | `OUTBOX_READ` |
| Failed → Pending (retry) | `OUTBOX_RETRY` |
| Dead → Pending (replay) | `OUTBOX_REPLAY` |
| Sent → Pending (force replay) | `OUTBOX_FORCE_REPLAY` |
| Poll サイクル実行 | `OUTBOX_POLL_EXECUTE` |
| メトリクス閲覧 | `MONITORING_READ` |

全権限は `platform_admin` ロールに付与済み。

---

## 8. Health Check（Phase 16）

Outbox 全体の健全性を確認し、metrics 発行 + アラート通知を一括実行する。

```bash
curl -X POST /api/platform/outbox/health-check \
  -H "Authorization: Bearer <token>"
```

レスポンス例:
```json
{
  "data": {
    "summary": { ... },
    "alerts": [...],
    "metricsPublished": true,
    "notificationsSent": false,
    "notificationReasons": ["OUTBOX_ALERT_WEBHOOK_URL and OUTBOX_ALERT_EMAIL_TO are not set"]
  }
}
```

アラート通知を有効にするには環境変数を設定:
- `OUTBOX_ALERT_WEBHOOK_URL` — Webhook 通知先 URL
- `OUTBOX_ALERT_EMAIL_TO` — メール通知先アドレス

---

## 9. Stuck Processing Recovery（Phase 16）

### 9.1 対象確認（Dry Run）

```bash
curl /api/platform/outbox/recoverable-stuck?thresholdMinutes=15 \
  -H "Authorization: Bearer <token>"
```

### 9.2 一括 Recovery 実行

```bash
curl -X POST /api/platform/outbox/recover-stuck \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"thresholdMinutes": 15, "limit": 100, "dryRun": false}'
```

- `thresholdMinutes`: stuck 判定閾値（1〜1440分、デフォルト15）
- `limit`: 一括処理上限（1〜500件、デフォルト100）
- `dryRun=true`: 対象一覧のみ返す（DB 更新なし）
- recovery 後: processing → failed（retryCount 増やさない、次回 poll で自動 retry）

---

## 10. 操作別ガイド

| 状況 | 推奨操作 | 備考 |
|------|----------|------|
| failed イベントが少数 | `/retry` | 個別に pending に戻す |
| dead イベントがある | `/replay` | retryCount リセット推奨 |
| stuck processing がある | `/recover-stuck` | まず dryRun で件数確認 |
| sent を再送したい | `/force-replay` | ⚠️ 冪等性確認必須、理由入力必須 |
| 全体の健全性確認 | `/health-check` | metrics + アラート通知も実行 |

---

## 11. 権限マッピング（Phase 16 追加分）

| 操作 | 必要 Permission |
|------|----------------|
| Stuck Recovery 実行 | `OUTBOX_RECOVER_STUCK` |
| Health Check 実行 | `OUTBOX_HEALTH_CHECK` |
| Recoverable-stuck 一覧 | `OUTBOX_READ` |

---

## 12. アラート Cooldown / Dedup（Phase 17 追加）

### 概要

同一アラートコードセットに対して、**60分間隔**で通知を抑制する cooldown 機能。
`platform_alert_histories` テーブルで `(alert_key, channel)` ごとに最終送信日時を管理する。

### Dedup キー

アラートコードをアルファベット順ソートして `|` で結合した文字列。
例: `DEAD_EVENTS_EXIST|STUCK_PROCESSING`

### 動作フロー

1. `notifyOutboxOperationalAlerts` 呼び出し時、`buildAlertDedupKey` でキーを生成
2. 各チャネル（webhook / mail）ごとに `shouldSendPlatformAlert` で cooldown 確認
3. cooldown 内の場合は送信をスキップ（`suppressedChannels` に記録）
4. 送信成功後は `markPlatformAlertSent` で lastSentAt を更新

### 確認コマンド

```sql
-- 最近の抑制状況を確認
SELECT alert_key, channel, last_sent_at
FROM platform_alert_histories
ORDER BY last_sent_at DESC
LIMIT 20;
```

### リセット方法（緊急時）

```sql
-- 特定キーの cooldown をリセットする
DELETE FROM platform_alert_histories
WHERE alert_key = 'DEAD_EVENTS_EXIST';
```

---

## 13. Health Check 履歴（Phase 17 追加）

### 概要

`runOutboxHealthCheck` 実行ごとに結果を `platform_health_check_histories` テーブルへ保存（best-effort）。
UI の「Health Check 履歴」テーブルや `/api/platform/outbox/health-history` API で参照可能。

### 保存されるフィールド

| フィールド | 内容 |
|------------|------|
| `summary_json` | OutboxSummary の JSON スナップショット |
| `alert_codes_json` | アラートコードの配列 JSON |
| `metrics_published` | CloudWatch Metrics 発行成否 |
| `notifications_sent` | 通知送信成否 |
| `suppressed_by_cooldown` | cooldown により通知が抑制されたか |

### 取得 API

```
GET /api/platform/outbox/health-history?limit=20
GET /api/platform/outbox/alert-status
```

### クリーンアップ（月次推奨）

```sql
-- 30 日以上前の履歴を削除
DELETE FROM platform_health_check_histories
WHERE created_at < NOW() - INTERVAL '30 days';
```

---

## 14. Alert Suppression Audit（Phase 18 追加）

cooldown による通知抑制が発生した場合、`audit_logs` テーブルに自動記録される。

### 保存される情報

| フィールド | 内容 |
|------------|------|
| `action` | `suppress` |
| `table_name` | `outbox_event` |
| `new_values.business.reason` | `"cooldown"` |
| `new_values.business.alertKey` | dedup キー |
| `new_values.business.channels` | 抑制されたチャネル配列 |
| `new_values.business.alertCodes` | アラートコード配列 |
| `new_values.business.environment` | 実行環境 |

### 確認クエリ

```sql
SELECT action, new_values, created_at
FROM audit_logs
WHERE action = 'suppress'
  AND table_name = 'outbox_event'
ORDER BY created_at DESC
LIMIT 10;
```

---

## 15. Alert Status API（Phase 18 強化）

`GET /api/platform/outbox/alert-status` のレスポンスに `status` フィールドが追加された。

### レスポンス例

```json
{
  "data": {
    "lastHealthCheckAt": "2026-03-17T10:00:00.000Z",
    "suppressedByCooldown": false,
    "alertCodes": ["DEAD_EVENTS_EXIST"],
    "status": "critical"
  }
}
```

### status 判定ルール

| alertCodes | status |
|-----------|--------|
| `[]` | `healthy` |
| `["FAILED_EVENTS_HIGH"]` | `warning` |
| `["DEAD_EVENTS_EXIST"]` | `critical` |
| `["STUCK_PROCESSING"]` | `critical` |

履歴が存在しない場合は `status: "healthy"`, `lastHealthCheckAt: null` を返す。

---

## 16. Alert History の見方（Phase 19 追加）

`platform_alert_histories` テーブルには、**実際に通知が送信された**チャネルごとの最終送信日時が記録される。

### 取得 API

```
GET /api/platform/outbox/alert-history
GET /api/platform/outbox/alert-history?channel=webhook
GET /api/platform/outbox/alert-history?channel=mail
GET /api/platform/outbox/alert-history?limit=10
```

### フィールド説明

| フィールド | 意味 |
|------------|------|
| `alertKey` | コードをソートして `|` で結合した dedup キー |
| `channel` | 通知チャネル（`webhook` / `mail`） |
| `lastSentAt` | そのチャネルで最後に送信した日時 |

### SQL 確認

```sql
SELECT alert_key, channel, last_sent_at
FROM platform_alert_histories
ORDER BY last_sent_at DESC;
```

---

## 17. Health History の詳細表示（Phase 19 追加）

health history の各レコードには `summary_json` が保存されており、
主要カウントを確認できる。

### summary_json の主要フィールド

- `pendingCount` / `failedCount` / `deadCount` / `stuckProcessingCount` / `recoverableStuckCount`

### alert_codes_json の意味

- 空配列 `[]` → healthy
- `["FAILED_EVENTS_HIGH"]` → warning
- `["DEAD_EVENTS_EXIST"]` / `["STUCK_PROCESSING"]` → critical

### 取得 API

```
GET /api/platform/outbox/health-history?limit=20
```

---

## 18. Retention Cleanup（Phase 19 追加）

alert history / health history は DB に蓄積するため、定期的なクリーンアップが必要。

### デフォルト retention

- 30 日（`retentionDays = 30`）

### Cleanup functions

```typescript
import { cleanupOldPlatformAlertHistory } from "@/features/platform-alert-history";
import { cleanupOldPlatformHealthHistory } from "@/features/platform-health-history";

// 30 日以上前のアラート履歴を削除
const alertCount = await cleanupOldPlatformAlertHistory(30);

// 30 日以上前の health check 履歴を削除
const healthCount = await cleanupOldPlatformHealthHistory(30);
```

### SQL 手動クリーンアップ

```sql
-- アラート履歴
DELETE FROM platform_alert_histories
WHERE last_sent_at < NOW() - INTERVAL '30 days';

-- ヘルスチェック履歴
DELETE FROM platform_health_check_histories
WHERE created_at < NOW() - INTERVAL '30 days';
```

> 推奨: 月次バッチまたは日次 cron で cleanup を実行する。

---

## 19. History Dashboard（Phase 20 追加）

`GET /api/platform/outbox/history-dashboard` — 履歴ダッシュボードのサマリーを一括取得する。

```bash
curl /api/platform/outbox/history-dashboard \
  -H "Authorization: Bearer <token>"
```

### レスポンスフィールド

| フィールド | 説明 |
|------------|------|
| `alertHistoryCount` | `platform_alert_histories` の総件数 |
| `healthHistoryCount` | `platform_health_check_histories` の総件数 |
| `webhookAlertCount` | channel=webhook のアラート履歴件数 |
| `mailAlertCount` | channel=mail のアラート履歴件数 |
| `suppressedHealthCheckCount` | cooldown 抑制された Health Check の件数 |
| `latestHealthStatus` | 最新 Health Check のステータス（`healthy` / `warning` / `critical` / `unknown`） |
| `latestHealthCheckAt` | 最新 Health Check の実行日時（履歴がなければ `null`） |

### 必要権限

`OUTBOX_READ`

---

## 20. History Cleanup 運用手順（Phase 20 追加）

`POST /api/platform/outbox/history-cleanup` — alert history と health history を一括クリーンアップする。

```bash
curl -X POST /api/platform/outbox/history-cleanup \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"retentionDays": 30}'
```

### パラメータ

| パラメータ | 説明 | デフォルト | 制約 |
|-----------|------|-----------|------|
| `retentionDays` | 保持する日数。これより古いレコードを削除 | `30` | 1〜365（整数） |

### レスポンス例

```json
{
  "data": {
    "alertHistoryDeletedCount": 12,
    "healthHistoryDeletedCount": 8,
    "retentionDays": 30
  }
}
```

### 推奨運用

- **月次**で実行することを推奨
- `retentionDays: 30` が標準。長期分析が必要な場合は `90` や `180` を指定
- 削除件数が多い場合（数万件以上）は DB 負荷に注意

### 必要権限

`OUTBOX_HEALTH_CHECK`

---

## 21. Alert History 検索（Phase 20 追加）

`GET /api/platform/outbox/alert-history` に `alertKey` クエリパラメータを追加。

```bash
# 特定のアラートキーを含む履歴を検索
curl "/api/platform/outbox/alert-history?alertKey=DEAD_EVENTS" \
  -H "Authorization: Bearer <token>"

# channel と組み合わせた絞り込み
curl "/api/platform/outbox/alert-history?alertKey=DEAD_EVENTS&channel=webhook" \
  -H "Authorization: Bearer <token>"
```

### クエリパラメータ

| パラメータ | 説明 |
|-----------|------|
| `alertKey` | alertKey の部分一致フィルター（空文字の場合はフィルターなし） |
| `channel` | `webhook` / `mail` で絞り込み |
| `limit` | 取得件数（最大 100） |
