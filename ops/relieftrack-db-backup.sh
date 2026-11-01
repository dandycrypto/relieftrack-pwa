#!/usr/bin/env bash
# relieftrack-db-backup — export the ReliefTrack Supabase database to disk.
#
# WHY THIS EXISTS
#   The Supabase project runs on the FREE plan, which has ZERO days of backup
#   retention. If the project is deleted (not merely paused) the data is gone
#   forever. Keep-alive prevents pausing; this script is what actually protects
#   the data.
#
# WHAT IT DOES
#   Pulls every local table via PostgREST plus the auth user list via the
#   admin API, into a timestamped directory, then validates each file.
#   Read-only: it never writes to Supabase.
#
# ISOLATION
#   Own unit relieftrack-db-backup.service/.timer, own log, own script.
#   No cron entries shared with other services.
#
# RETENTION
#   Keeps the newest $KEEP backups, deletes older ones.

set -uo pipefail

ENV_FILE="/home/ubuntu/.openclaw/workspace/my-v0-app/.env.local"
BACKUP_ROOT="/home/ubuntu/relieftrack-backups"
LOG="/var/log/relieftrack-db-backup.log"
PROJECT_REF="wtymxwzxtwbjcdmixfjt"
KEEP=14
MAX_LOG_BYTES=262144

TABLES="profiles records settings drive_connections lhdn_categories"

log() {
  local line
  line="$(printf '%s [%s] %s' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$1" "$2")"
  printf '%s\n' "$line"
  if [ -w "$(dirname "$LOG")" ]; then
    printf '%s\n' "$line" >> "$LOG" 2>/dev/null || true
  fi
}

if [ -f "$LOG" ] && [ "$(stat -c %s "$LOG" 2>/dev/null || echo 0)" -gt "$MAX_LOG_BYTES" ]; then
  mv -f "$LOG" "${LOG}.1" 2>/dev/null || true
fi

# --- credentials ------------------------------------------------------------
if [ ! -r "$ENV_FILE" ]; then
  log ERROR "cannot read env file: $ENV_FILE"
  exit 1
fi

SERVICE_KEY="$(grep -m1 '^SUPABASE_SERVICE_ROLE_KEY=' "$ENV_FILE" | cut -d= -f2- | tr -d '"'"'"'')"
if [ -z "${SERVICE_KEY:-}" ]; then
  log ERROR "SUPABASE_SERVICE_ROLE_KEY missing from $ENV_FILE"
  exit 1
fi

BASE="https://${PROJECT_REF}.supabase.co"
TS="$(date -u +%Y%m%d-%H%M%S)"
OUT="${BACKUP_ROOT}/supabase-${TS}"

mkdir -p "$OUT" || { log ERROR "cannot create $OUT"; exit 1; }

log INFO "starting backup -> $OUT"

FAILED=0

# --- tables -----------------------------------------------------------------
for t in $TABLES; do
  code="$(curl -sS -m 120 \
    -H "apikey: ${SERVICE_KEY}" \
    -H "Authorization: Bearer ${SERVICE_KEY}" \
    -H "Prefer: count=exact" \
    -o "${OUT}/${t}.json" -w '%{http_code}' \
    "${BASE}/rest/v1/${t}?select=*" 2>/dev/null)"

  if [ "$code" = "200" ] || [ "$code" = "206" ]; then
    rows="$(python3 -c "import json,sys;print(len(json.load(open('${OUT}/${t}.json'))))" 2>/dev/null || echo '?')"
    log OK "table ${t}: ${code} rows=${rows}"
  else
    log ERROR "table ${t}: HTTP ${code}"
    FAILED=$((FAILED + 1))
  fi
done

# --- auth users -------------------------------------------------------------
code="$(curl -sS -m 120 \
  -H "apikey: ${SERVICE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_KEY}" \
  -o "${OUT}/auth_users.json" -w '%{http_code}' \
  "${BASE}/auth/v1/admin/users?per_page=1000" 2>/dev/null)"

if [ "$code" = "200" ]; then
  n="$(python3 -c "import json;print(len(json.load(open('${OUT}/auth_users.json')).get('users',[])))" 2>/dev/null || echo '?')"
  log OK "auth_users: ${code} users=${n}"
else
  log ERROR "auth_users: HTTP ${code}"
  FAILED=$((FAILED + 1))
fi

# --- manifest ---------------------------------------------------------------
printf '{"created":"%s","project":"%s","source":"REST export","failed_tables":%s}\n' \
  "$(date -u +%FT%TZ)" "$PROJECT_REF" "$FAILED" > "${OUT}/MANIFEST.json"

# --- validate ---------------------------------------------------------------
if [ -x /usr/local/bin/relieftrack-validate-backup.py ]; then
  if /usr/local/bin/relieftrack-validate-backup.py "$OUT"; then
    log OK "validation passed"
  else
    log ERROR "validation FAILED — inspect $OUT"
    FAILED=$((FAILED + 1))
  fi
fi

# --- retention --------------------------------------------------------------
# Only prune when this run succeeded, so a broken run never deletes good backups.
if [ "$FAILED" -eq 0 ]; then
  count=0
  for d in $(ls -1dt "${BACKUP_ROOT}"/supabase-* 2>/dev/null); do
    count=$((count + 1))
    if [ "$count" -gt "$KEEP" ]; then
      rm -rf -- "$d" && log INFO "pruned old backup: $(basename "$d")"
    fi
  done
  log OK "retention: keeping newest $KEEP"
else
  log WARN "retention skipped (${FAILED} failure(s)) — no backups deleted"
fi

if [ "$FAILED" -ne 0 ]; then
  log ERROR "backup completed with ${FAILED} failure(s)"
  exit 1
fi

log OK "backup complete"
exit 0
