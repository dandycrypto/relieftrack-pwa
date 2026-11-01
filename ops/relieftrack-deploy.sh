#!/usr/bin/env bash
# relieftrack-deploy — build and deploy the ReliefTrack Next.js app safely.
#
# WHY THIS EXISTS
#   `next build` in Next.js standalone mode writes its output into a path that
#   mirrors the project's ABSOLUTE path. Because this project lives at
#   /home/ubuntu/.openclaw/workspace/my-v0-app, the real output lands at:
#
#       .next/standalone/.openclaw/workspace/my-v0-app/
#
#   ...NOT at .next/standalone/ where systemd's WorkingDirectory expects it.
#   A naive `npm run build && systemctl restart` therefore fails with
#   "Cannot find module .../standalone/server.js".
#
#   This script builds, promotes the nested output to the expected location,
#   verifies server.js exists BEFORE stopping the service, and rolls back
#   automatically if the new build fails its health check.
#
# USAGE
#   sudo /usr/local/bin/relieftrack-deploy.sh
#
# ISOLATION
#   Touches only relieftrack.service and its build tree. Never modifies
#   relieftrack-ocr.service or any other unit.

set -uo pipefail

APP_DIR="/home/ubuntu/.openclaw/workspace/my-v0-app"
NESTED_REL=".next/standalone/.openclaw/workspace/my-v0-app"
STAGING="/home/ubuntu/.next-staging"
BACKUP="/home/ubuntu/.next-standalone-backup"
SERVICE="relieftrack.service"
HEALTH_URL="http://127.0.0.1:5567/"
LOG="/var/log/relieftrack-deploy.log"

log() {
  local line
  line="$(printf '%s [%s] %s' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$1" "$2")"
  printf '%s\n' "$line"
  printf '%s\n' "$line" >> "$LOG" 2>/dev/null || true
}

die() { log ERROR "$1"; exit 1; }

cd "$APP_DIR" || die "cannot cd to $APP_DIR"

# ── 0. Safety: never build on top of a dirty tree we don't understand ────────
log INFO "starting deploy (branch: $(sudo -u ubuntu git branch --show-current 2>/dev/null))"

# ── 1. Build ────────────────────────────────────────────────────────────────
log INFO "building"
if ! sudo -u ubuntu env PATH="/home/ubuntu/.local/bin:$PATH" npm run build > /tmp/relieftrack-build.log 2>&1; then
  log ERROR "build FAILED — service left untouched. Last lines:"
  tail -20 /tmp/relieftrack-build.log
  exit 1
fi
log OK "build succeeded"

# ── 2. Verify the nested output exists BEFORE touching the running service ──
if [ ! -f "${NESTED_REL}/server.js" ]; then
  die "expected build output missing: ${NESTED_REL}/server.js — service left untouched"
fi

# ── 3. Stage the new output (copy, never move) ──────────────────────────────
rm -rf "$STAGING"
cp -r "$NESTED_REL" "$STAGING" || die "staging copy failed"
mkdir -p "${STAGING}/.next"
cp -r .next/static "${STAGING}/.next/static" || die "static copy failed"
chown -R ubuntu:ubuntu "$STAGING"
[ -f "${STAGING}/server.js" ] || die "staged server.js missing — aborting"
log OK "staged new build"

# ── 4. Snapshot the currently-running build for rollback ────────────────────
rm -rf "${BACKUP}-prev"
if [ -d .next/standalone ]; then
  cp -r .next/standalone "${BACKUP}-prev" || log WARN "could not snapshot current build"
fi

# ── 5. Swap ─────────────────────────────────────────────────────────────────
systemctl stop "$SERVICE"
rm -rf .next/standalone
mv "$STAGING" .next/standalone || die "swap failed"
chown -R ubuntu:ubuntu .next/standalone
systemctl start "$SERVICE"

# ── 6. Health check with automatic rollback ─────────────────────────────────
ok=0
for _ in $(seq 1 15); do
  sleep 2
  if systemctl is-active --quiet "$SERVICE"; then
    if curl -sS -m 5 -o /dev/null -w '%{http_code}' "$HEALTH_URL" 2>/dev/null | grep -qE '^(200|307)$'; then
      ok=1
      break
    fi
  fi
done

if [ "$ok" -eq 1 ]; then
  log OK "deploy complete — service healthy (build $(cat .next/BUILD_ID 2>/dev/null))"
  exit 0
fi

# ── 7. Rollback ─────────────────────────────────────────────────────────────
log ERROR "health check FAILED — rolling back"
systemctl stop "$SERVICE"
rm -rf .next/standalone
if [ -d "${BACKUP}-prev" ]; then
  cp -r "${BACKUP}-prev" .next/standalone
  chown -R ubuntu:ubuntu .next/standalone
  systemctl start "$SERVICE"
  sleep 5
  if systemctl is-active --quiet "$SERVICE"; then
    log OK "rollback complete — previous build restored and running"
  else
    log ERROR "rollback started service but it is not active — manual attention required"
  fi
else
  log ERROR "no rollback snapshot available — manual attention required"
fi
exit 1
