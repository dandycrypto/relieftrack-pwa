#!/usr/bin/env bash
# relieftrack-keepalive — keeps the Supabase Free-plan project from auto-pausing.
#
# Supabase pauses Free projects after ~7 days of low database activity.
# Their docs: "Typically a few user requests to the database each day over
# the previous week is enough to keep the project from being paused."
#
# This script performs one real database read per run. It is intentionally
# read-only: no schema or data writes.
#
# Isolated to relieftrack only:
#   - own unit:   relieftrack-keepalive.service / .timer
#   - own log:    /var/log/relieftrack-keepalive.log
#   - own env:    reads relieftrack's .env.local (never modifies it)
#   - no shared cron entries, no shared temp files
#
# Exit code 0 = healthy ping. Non-zero = Supabase unreachable or paused.

set -uo pipefail

ENV_FILE="/home/ubuntu/.openclaw/workspace/my-v0-app/.env.local"
LOG="/var/log/relieftrack-keepalive.log"
PROJECT_REF="wtymxwzxtwbjcdmixfjt"
MAX_LOG_BYTES=262144   # 256 KiB, then rotate once

log() {
  local line
  line="$(printf '%s [%s] %s' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$1" "$2")"
  # Always echo (systemd journal captures stdout); also append to our own log
  # so the history survives journal rotation.
  printf '%s\n' "$line"
  if [ -w "$(dirname "$LOG")" ]; then
    printf '%s\n' "$line" >> "$LOG" 2>/dev/null || true
  fi
}

# --- rotate log if it has grown too large -----------------------------------
if [ -f "$LOG" ] && [ "$(stat -c %s "$LOG" 2>/dev/null || echo 0)" -gt "$MAX_LOG_BYTES" ]; then
  mv -f "$LOG" "${LOG}.1" 2>/dev/null || true
fi

# --- load credentials -------------------------------------------------------
if [ ! -r "$ENV_FILE" ]; then
  log ERROR "cannot read env file: $ENV_FILE"
  exit 1
fi

# Only pull the keys we need; do not export the whole file.
SERVICE_KEY="$(grep -m1 '^SUPABASE_SERVICE_ROLE_KEY=' "$ENV_FILE" | cut -d= -f2- | tr -d '"'"'"'')"
ANON_KEY="$(grep -m1 '^NEXT_PUBLIC_SUPABASE_ANON_KEY=' "$ENV_FILE" | cut -d= -f2- | tr -d '"'"'"'')"

# Prefer the service key; fall back to anon.
KEY="${SERVICE_KEY:-$ANON_KEY}"

if [ -z "${KEY:-}" ]; then
  log ERROR "no Supabase key found in $ENV_FILE"
  exit 1
fi

# --- ping the project with a real database read -----------------------------
# lhdn_categories is seeded reference data and always present. `count=exact`
# makes this a genuine query against the database, not just an edge hit.
URL="https://${PROJECT_REF}.supabase.co/rest/v1/lhdn_categories?select=id&limit=1"

RESP="$(curl -sS -m 30 \
  -H "apikey: ${KEY}" \
  -H "Authorization: Bearer ${KEY}" \
  -H "Prefer: count=exact" \
  -D /tmp/relieftrack-keepalive-headers.$$ \
  -o /tmp/relieftrack-keepalive-body.$$ \
  -w '%{http_code}' \
  "$URL" 2>/dev/null)"
CURL_RC=$?

HTTP_CODE="${RESP:-000}"

if [ "$CURL_RC" -ne 0 ]; then
  log ERROR "curl failed (rc=$CURL_RC) — project unreachable or DNS failure"
  rm -f /tmp/relieftrack-keepalive-headers.$$ /tmp/relieftrack-keepalive-body.$$
  exit 1
fi

case "$HTTP_CODE" in
  200|206)
    ROWS="$(grep -i '^content-range:' /tmp/relieftrack-keepalive-headers.$$ 2>/dev/null \
            | tr -d '\r' | awk -F/ '{print $2}')"
    log OK "db ping ${HTTP_CODE} rows=${ROWS:-?} project=${PROJECT_REF}"
    RC=0
    ;;
  401|403)
    log ERROR "auth rejected (HTTP ${HTTP_CODE}) — keys may have rotated"
    RC=2
    ;;
  521|522|523|524|525|526|530)
    log ERROR "origin down (HTTP ${HTTP_CODE}) — project likely paused; resume it in the Supabase dashboard"
    RC=3
    ;;
  *)
    log ERROR "unexpected response HTTP ${HTTP_CODE} body=$(head -c 200 /tmp/relieftrack-keepalive-body.$$ 2>/dev/null | tr -d '\n')"
    RC=4
    ;;
esac

rm -f /tmp/relieftrack-keepalive-headers.$$ /tmp/relieftrack-keepalive-body.$$
exit "$RC"
