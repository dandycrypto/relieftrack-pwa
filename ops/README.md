# ReliefTrack operations

Three automated timers keep this app healthy, plus a deploy script that cannot
take the site down silently. Everything here is **scoped to ReliefTrack** — no
shared cron entries, no shared logs, no shared units with other services on the host.

| Concern | Unit | Schedule (UTC) | Log |
|---|---|---|---|
| Supabase auto-pause | `relieftrack-keepalive.timer` | 02:17, 10:17, 18:17 | `/var/log/relieftrack-keepalive.log` |
| Database backup | `relieftrack-db-backup.timer` | 03:43 daily | `/var/log/relieftrack-db-backup.log` |
| App deployment | `relieftrack-deploy.sh` (manual) | — | `/var/log/relieftrack-deploy.log` |

Schedule minutes (`:17`, `:43`) are chosen to sit clear of every other job on
this host, which uses `:00 :05 :15 :20 :30 :35 :40 :50 :55`.

---

## 1. Supabase keep-alive

The Supabase project (`wtymxwzxtwbjcdmixfjt`) is on the **Free plan**, which
Supabase pauses after ~7 days of low database activity. Per
[the docs](https://supabase.com/docs/guides/platform/free-project-pausing):

> A Free plan project is considered inactive if it does not receive sufficient user
> database activity over the past week. […] Typically **a few user requests to the
> database each day** over the previous week is enough to keep the project from being paused.

This timer satisfies that threshold with margin.

**What it does:** one read-only `GET /rest/v1/lhdn_categories?select=id&limit=1`
with `Prefer: count=exact`. A genuine database query, not just an edge hit.
**No writes.**

**Exit codes**

| Code | Meaning |
|---|---|
| `0` | Healthy — HTTP 200/206 |
| `1` | Unreachable — curl/DNS failure |
| `2` | Auth rejected (401/403) — keys may have rotated |
| `3` | Origin down (521–530) — **project likely paused**; resume in the dashboard |
| `4` | Unexpected HTTP response |

---

## 2. Database backup

The Free plan has **zero days of backup retention**. Keep-alive prevents
*pausing*; this timer is what actually protects the data if the project is
deleted.

**What it does:** exports every table via PostgREST plus the auth user list via
the Admin API into `/home/ubuntu/relieftrack-backups/supabase-<timestamp>/`,
then validates every file parses and counts rows. Read-only against Supabase.

- Keeps the newest **14** backups; prunes older ones.
- **Pruning only happens when the run fully succeeds** — a broken run never
  deletes good backups.
- Validator: `ops/relieftrack-validate-backup.py`

**Restore outline:** the JSON files are `select=*` dumps. The schema DDL lives in
`supabase/migrations/001_initial_schema.sql`. To restore elsewhere:
apply the migration, then insert each table's rows (order matters for foreign
keys: `profiles` → `records`/`settings` → `drive_connections`).

---

## 3. Deployment

**Never run `npm run build && systemctl restart` directly.** It fails.

Next.js standalone output mirrors the project's **absolute path**. Because this
project lives at `/home/ubuntu/.openclaw/workspace/my-v0-app`, the real build
output lands at:

```
.next/standalone/.openclaw/workspace/my-v0-app/server.js
```

…not at `.next/standalone/server.js`, where systemd's `WorkingDirectory` looks.
A naive restart dies with `Cannot find module .../standalone/server.js`.

`relieftrack-deploy.sh` handles this:

1. build
2. **verify the nested `server.js` exists before touching the running service**
3. stage the output outside the build tree (copy, never move)
4. snapshot the running build for rollback
5. swap and start
6. health-check `http://127.0.0.1:5567/` for up to 30s
7. **auto-rollback** to the snapshot if the health check fails

```bash
sudo /usr/local/bin/relieftrack-deploy.sh
```

Exit `0` = deployed and healthy. Non-zero = build failed (service untouched) or
health check failed (rolled back).

---

## Service topology (do not confuse these)

- `relieftrack.service` — Next.js standalone server, `:5567`, run from
  `/home/ubuntu/.openclaw/workspace/my-v0-app/.next/standalone`
- `relieftrack-ocr.service` — OCR microservice, `:8001`, **separate unit**
- nginx — TLS, static PWA assets from `/var/www/relieftrack-static/`, proxies to `:5567`

Restarting `relieftrack.service` does **not** restart OCR. If OCR breaks,
restart `relieftrack-ocr.service` directly.

---

## Common operations

```bash
# health
curl -sS -o /dev/null -w '%{http_code}\n' https://relieftrack.dysolvit.com/
curl -sS http://127.0.0.1:8001/health

# all three units at a glance
systemctl is-active relieftrack.service relieftrack-ocr.service \
  relieftrack-keepalive.timer relieftrack-db-backup.timer

# run a backup now
sudo systemctl start relieftrack-db-backup.service

# run a keep-alive ping now
sudo systemctl start relieftrack-keepalive.service

# what did the last deploy do
sudo tail -20 /var/log/relieftrack-deploy.log
```

## Known caveats

- The keep-alive is a mitigation, not a guarantee — Supabase may change thresholds.
- Free plan has no backups; only these local exports protect the data.
- A paused project is restorable for up to **1 year**.
- `auth` schema is **not** exposed to PostgREST. Any code needing identities
  must use the Admin API (`/auth/v1/admin/users/<id>`), not `.from('identities')`.
