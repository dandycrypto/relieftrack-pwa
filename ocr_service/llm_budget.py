"""
llm_budget.py — Daily call budget for the shared LLM relay.

WHY THIS EXISTS
---------------
The OpenCode Zen relay key on this host is shared with protocol90-meals. That
service enforces its own P90_DAILY_CAP=40/day *inside its own process*, but the
relay has no per-consumer accounting and exposes no balance endpoint (every
/v1/key, /v1/usage, /v1/balance probe returns 404). So ReliefTrack's model calls
spend from the same upstream balance while being completely invisible to
protocol90's cap: when ReliefTrack is busy, protocol90 still believes it has
its full 40 analyses available and then fails for its own users.

This module gives ReliefTrack its own independent budget so the two services
cannot starve each other. It is intentionally a local, per-process, per-day
counter -- the same simple model protocol90 uses -- because the goal is
bounded blast radius, not distributed quota management. If ReliefTrack ever
runs more than one worker, this needs a shared store; that constraint is
documented here so it isn't discovered in production.

Override with LLM_DAILY_CAP. Setting it to 0 disables the cap entirely, which
is appropriate for local development.
"""
import logging
import os
from datetime import date

logger = logging.getLogger("relieftrack-ocr")

_DEFAULT_CAP = 200


def _cap() -> int:
    raw = os.environ.get("LLM_DAILY_CAP")
    if raw is None or raw == "":
        return _DEFAULT_CAP
    try:
        return int(raw)
    except ValueError:
        logger.warning("LLM_DAILY_CAP=%r is not an integer, using default", raw)
        return _DEFAULT_CAP


_hits: dict[str, int] = {}


def _today() -> str:
    return date.today().isoformat()


def remaining() -> int:
    """Calls still allowed today. A cap of 0 means unlimited."""
    cap = _cap()
    if cap <= 0:
        return 999_999
    return max(0, cap - _hits.get(_today(), 0))


def allowed() -> bool:
    return remaining() > 0


def consume() -> None:
    """Record one call. Call this only after a request is actually sent."""
    day = _today()
    _hits[day] = _hits.get(day, 0) + 1
    # Keep the dict from growing without bound across day rollovers.
    for stale in [d for d in _hits if d != day]:
        del _hits[stale]


def stats() -> dict:
    return {
        "cap": _cap(),
        "used": _hits.get(_today(), 0),
        "remaining": remaining(),
        "date": _today(),
    }
