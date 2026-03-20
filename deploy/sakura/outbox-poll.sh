#!/bin/sh
# ============================================================
# outbox-poll.sh — アウトボックスポーリング実行スクリプト
#
# 処理フロー:
#   1. /api/auth/csrf で CSRF トークンを取得
#   2. /api/auth/callback/credentials でログイン (セッションクッキー取得)
#   3. /api/platform/outbox/poll を呼び出してポーリング実行
#   4. セッションクッキーを削除
#
# 必要な環境変数 (.env または systemd EnvironmentFile で設定):
#   APP_URL             — アプリの URL (例: https://app.itf-oa.com)
#   OUTBOX_POLL_LOGIN_ID — platform_admin ロールを持つユーザーのログインID
#   OUTBOX_POLL_PASSWORD — 上記ユーザーのパスワード
#
# 注意:
#   このスクリプトが呼ぶ /api/platform/outbox/poll は
#   Permission.OUTBOX_POLL_EXECUTE を持つ platform_admin のみ実行可能。
#   一般ユーザーやゲストでは 403 が返る。
# ============================================================

set -e

APP_URL="${APP_URL:-https://app.itf-oa.com}"
LOGIN_ID="${OUTBOX_POLL_LOGIN_ID}"
PASSWORD="${OUTBOX_POLL_PASSWORD}"
POLL_LIMIT="${OUTBOX_POLL_LIMIT:-50}"
COOKIE_JAR="$(mktemp /tmp/outbox-poll-XXXXXX.txt)"

# 終了時にクッキーファイルを必ず削除
trap 'rm -f "$COOKIE_JAR"' EXIT

# ----------------------------------------------------------
# バリデーション
# ----------------------------------------------------------
if [ -z "$LOGIN_ID" ] || [ -z "$PASSWORD" ]; then
    echo "[outbox-poll] ERROR: OUTBOX_POLL_LOGIN_ID / OUTBOX_POLL_PASSWORD が未設定です" >&2
    exit 1
fi

# ----------------------------------------------------------
# Step 1: CSRF トークン取得
# ----------------------------------------------------------
CSRF_RESPONSE=$(curl -s -f \
    --cookie-jar "$COOKIE_JAR" \
    "${APP_URL}/api/auth/csrf") || {
    echo "[outbox-poll] ERROR: CSRF トークンの取得に失敗しました (アプリが起動しているか確認してください)" >&2
    exit 1
}

CSRF_TOKEN=$(printf '%s' "$CSRF_RESPONSE" | grep -o '"csrfToken":"[^"]*"' | cut -d'"' -f4)

if [ -z "$CSRF_TOKEN" ]; then
    echo "[outbox-poll] ERROR: CSRF トークンのパースに失敗しました: $CSRF_RESPONSE" >&2
    exit 1
fi

# ----------------------------------------------------------
# Step 2: ログイン (セッションクッキー取得)
# ----------------------------------------------------------
LOGIN_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    --cookie "$COOKIE_JAR" \
    --cookie-jar "$COOKIE_JAR" \
    -X POST \
    --data-urlencode "loginId=${LOGIN_ID}" \
    --data-urlencode "password=${PASSWORD}" \
    --data-urlencode "csrfToken=${CSRF_TOKEN}" \
    --data-urlencode "callbackUrl=${APP_URL}" \
    -L \
    "${APP_URL}/api/auth/callback/credentials")

# NextAuth のログイン成功は 200 (リダイレクト後) または 302
if [ "$LOGIN_STATUS" != "200" ] && [ "$LOGIN_STATUS" != "302" ]; then
    echo "[outbox-poll] ERROR: ログインに失敗しました (HTTP ${LOGIN_STATUS})" >&2
    echo "[outbox-poll] OUTBOX_POLL_LOGIN_ID のユーザーが platform_admin ロールを持つか確認してください" >&2
    exit 1
fi

# ----------------------------------------------------------
# Step 3: アウトボックスポーリング実行
# ----------------------------------------------------------
POLL_RESPONSE=$(curl -s -f \
    --cookie "$COOKIE_JAR" \
    -X POST \
    -H "Content-Type: application/json" \
    -d "{\"limit\": ${POLL_LIMIT}}" \
    "${APP_URL}/api/platform/outbox/poll") || {
    echo "[outbox-poll] ERROR: ポーリングAPIの呼び出しに失敗しました" >&2
    exit 1
}

# ----------------------------------------------------------
# Step 4: 結果ログ出力
# ----------------------------------------------------------
TIMESTAMP=$(date -Iseconds 2>/dev/null || date "+%Y-%m-%dT%H:%M:%S")
echo "[outbox-poll] ${TIMESTAMP} result=${POLL_RESPONSE}"
