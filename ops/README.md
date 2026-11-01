# Supabase Free-plan keep-alive

The ReliefTrack Supabase project (`wtymxwzxtwbjcdmixfjt`) runs on the **Free plan**,
which Supabase pauses after ~7 days of low database activity.

From [Supabase docs](https://supabase.com/docs/guides/platform/free-project-pausing):

> A Free plan project is considered inactive if it does not receive sufficient user
> database activity over the past week. […] Typically **a few user requests to the
> database each day** over the previous week is enough to keep the project from being paused.

This timer satisfies that threshold with a small margin.

## What runs

| Piece | Path |
|---|---|
| Script | `/usr/local/bin/relieftrack-keepalive.sh` (source of truth: `ops/relieftrack-keepalive.sh`) |
| Service | `/etc/systemd/system/relieftrack-keepalive.service` |
| Timer | `/etc/systemd/system/relieftrack-keepalive.timer` |
| Log | `/var/log/relieftrack-keepalive.log` (self-rotating at 256 KiB) |

**Schedule:** `02:17`, `10:17`, `18:17` UTC — 3× daily.

The `:17` minute offset is deliberate: other jobs on this VPS run at
`:00 :05 :15 :20 :30 :35 :40 :50 :55`. This keeps the wake-up from colliding
with them.

## Isolation

Scoped to ReliefTrack only — nothing shared with other services:

- Own systemd unit pair (own name, own log, own journal stream)
- Own script under `/usr/local/bin`
- No entries added to `crontab -u ubuntu`, `/etc/cron.d`, or any other unit
- Reads relieftrack's `.env.local` **read-only**; never modifies it
- Does not touch `relieftrack.service` or `relieftrack-ocr.service`

## What the ping does

One read-only `GET /rest/v1/lhdn_categories?select=id&limit=1` with
`Prefer: count=exact`. This is a genuine database query (not just an edge/CDN hit),
so it registers as project activity. **No writes** to schema or data.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Healthy — HTTP 200/206 |
| `1` | Unreachable — curl failure / DNS failure |
| `2` | Auth rejected (401/403) — keys may have rotated |
| `3` | Origin down (521–530) — **project likely paused**, resume it in the dashboard |
| `4` | Unexpected HTTP response |

## Operations

```bash
# status / next run
systemctl status relieftrack-keepalive.timer
systemctl list-timers relieftrack-keepalive.timer

# run once now
sudo systemctl start relieftrack-keepalive.service

# recent history
sudo tail -20 /var/log/relieftrack-keepalive.log

# disable (e.g. after migrating off Supabase)
sudo systemctl disable --now relieftrack-keepalive.timer
```

## Caveats

This is a mitigation, **not a guarantee**:

- Supabase may change its pausing thresholds at any time.
- The Free plan has **zero days of backup retention**. A keep-alive prevents
  *pausing*; it does not protect against data loss from deletion.
- A paused project is restorable for up to **1 year**.

If ReliefTrack becomes load-bearing, either upgrade to Pro (projects on paid plans
are never paused) or migrate to self-hosted Postgres — see the migration notes.
