"""
llm_extractor.py — Strategy B LLM fallback for low-confidence OCR.

Provider priority (tries in order):
  1. Ollama (local, fast, free) — env: OLLAMA_HOST
  2. OpenRouter (cloud, paid) — env: OPENROUTER_API_KEY
  3. Anthropic Claude (cloud, paid) — env: ANTHROPIC_API_KEY

Each provider returns a partial dict that fills in missing fields from Strategy A.
LLM output always triggers `needs_review: true` (penalty in confidence scoring).

Recommended models:
  - Ollama: qwen2.5:1.5b (~1GB, ~2s) or qwen2.5:7b (~4.5GB, ~5s)
  - OpenRouter: google/gemini-flash-1.5 (~$0.0001/receipt)
  - Anthropic: claude-haiku-4-5 (~$0.001/receipt)
"""
import json
import logging
import os
import re
import time
from typing import Optional

from . import llm_budget

logger = logging.getLogger("relieftrack-ocr")


LLM_PROMPT = """You are a Malaysian receipt and invoice data extractor.
Extract structured data from the OCR text below.
The document is from Malaysia. Currency is always MYR.
Common languages: English, Bahasa Malaysia, Mandarin Chinese, Tamil.
Common tax labels: SST, cukai perkhidmatan, 服务税, service charge, PCB.
Common total labels: Jumlah, Jum. Kena Bayar, 合计, Total, Grand Total.
Dates are usually DD/MM/YYYY format in Malaysia.

Return ONLY a valid JSON object with these exact keys:
vendor, date (YYYY-MM-DD or null), time (HH:MM or null),
amount (number, final payable), tax_amount (number or null),
tax_type (SST/GST/SERVICE_CHARGE/PCB or null), invoice_number (string or null),
tin (13-digit string or null), sst_registration_no (string or null),
category (one of: food_beverage, medical, education, lifestyle, utilities,
 transport, groceries, insurance, childcare, other, or null).

Rules:
- amount is the final total the customer pays, never the cash tendered
- date must be ISO 8601 (YYYY-MM-DD)
- Return null for any field you cannot determine with confidence
- No explanation, no markdown, just the JSON object

OCR text:
"""


# ─── Ollama ────────────────────────────────────────────────────────────────

def call_ollama(raw_text: str, model: str = None) -> Optional[dict]:
    """Call local Ollama instance. Returns parsed JSON or None."""
    host = os.environ.get("OLLAMA_HOST")
    if not host:
        return None
    model = model or os.environ.get("OLLAMA_MODEL", "qwen2.5:1.5b")
    try:
        import requests
        prompt = LLM_PROMPT + raw_text
        t0 = time.time()
        r = requests.post(
            f"{host.rstrip('/')}/api/generate",
            json={"model": model, "prompt": prompt, "stream": False,
                  "format": "json", "options": {"temperature": 0.0}},
            timeout=20,
        )
        elapsed = time.time() - t0
        logger.info(f"Ollama {model}: {r.status_code} in {elapsed:.2f}s")
        if not r.ok:
            return None
        resp = r.json().get("response", "")
        return _parse_json(resp)
    except Exception as e:
        logger.warning(f"Ollama failed: {e}")
        return None


# ─── OpenRouter ────────────────────────────────────────────────────────────

def call_openrouter(raw_text: str, model: str = "google/gemini-flash-1.5") -> Optional[dict]:
    """Call OpenRouter API (paid). Returns parsed JSON or None."""
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        return None
    try:
        import requests
        prompt = LLM_PROMPT + raw_text
        t0 = time.time()
        r = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
                "response_format": {"type": "json_object"},
                "temperature": 0.0,
            },
            timeout=20,
        )
        elapsed = time.time() - t0
        logger.info(f"OpenRouter {model}: {r.status_code} in {elapsed:.2f}s")
        if not r.ok:
            return None
        content = r.json()["choices"][0]["message"]["content"]
        return _parse_json(content)
    except Exception as e:
        logger.warning(f"OpenRouter failed: {e}")
        return None


# ─── Anthropic ─────────────────────────────────────────────────────────────

def call_anthropic(raw_text: str, model: str = "claude-haiku-4-5-20251001") -> Optional[dict]:
    """Call Anthropic Claude API (paid). Returns parsed JSON or None."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return None
    try:
        import requests
        prompt = LLM_PROMPT + raw_text
        t0 = time.time()
        r = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": api_key, "anthropic-version": "2023-06-01"},
            json={
                "model": model,
                "max_tokens": 1024,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.0,
            },
            timeout=20,
        )
        elapsed = time.time() - t0
        logger.info(f"Anthropic {model}: {r.status_code} in {elapsed:.2f}s")
        if not r.ok:
            return None
        content = r.json()["content"][0]["text"]
        return _parse_json(content)
    except Exception as e:
        logger.warning(f"Anthropic failed: {e}")
        return None


# ─── Helpers ───────────────────────────────────────────────────────────────

def _parse_json(text: str) -> Optional[dict]:
    """Robustly parse JSON from LLM response, handling code blocks."""
    text = text.strip()
    # Strip markdown code blocks
    text = re.sub(r'^```(?:json)?\s*', '', text, flags=re.M)
    text = re.sub(r'```\s*$', '', text, flags=re.M)
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Try to extract JSON object from the text
        m = re.search(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', text, re.S)
        if m:
            try:
                return json.loads(m.group(0))
            except json.JSONDecodeError:
                pass
    return None



# --- OpenAI-compatible relay (primary) ----------------------------------

def call_relay(raw_text: str, model: str = None):
    """Call an OpenAI-compatible relay (e.g. opencode zen).

    This is the only cloud provider actually configured on this host, and it is
    tried before the local Ollama path. Ollama here serves a 3GB gemma model on
    a 2-core CPU box and takes roughly 90 seconds per call, which exceeds the
    OCR request budget -- a fallback list that starts with Ollama therefore
    never completes in practice.
    """
    base = os.environ.get("LLM_BASE_URL")
    key = os.environ.get("LLM_API_KEY")
    if not base or not key:
        return None
    # The relay key is shared with protocol90-meals and has no server-side
    # per-consumer accounting, so ReliefTrack must bound its own spend or it
    # silently eats that service's daily allowance.
    if not llm_budget.allowed():
        logger.warning(
            "LLM daily cap reached (%s), skipping relay fallback", llm_budget.stats()
        )
        return None
    model = model or os.environ.get("LLM_MODEL", "deepseek-v4.1-flash")
    try:
        import requests
        prompt = LLM_PROMPT + raw_text
        t0 = time.time()
        r = requests.post(
            base.rstrip("/") + "/chat/completions",
            headers={
                "Authorization": "Bearer " + key,
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.0,
                "max_tokens": 600,
            },
            timeout=25,
        )
        elapsed = time.time() - t0
        llm_budget.consume()
        logger.info("Relay %s: %s in %.2fs", model, r.status_code, elapsed)
        if not r.ok:
            logger.warning("Relay failed body: %s", r.text[:200])
            return None
        content = r.json()["choices"][0]["message"]["content"]
        return _parse_json(content)
    except Exception as e:
        logger.warning("Relay failed: %s", e)
        return None


def llm_extract(raw_text: str) -> tuple[Optional[dict], str]:
    """Try each LLM provider in priority order.

    Returns: (parsed_dict, provider_name) or (None, "none")
    """
    for provider_fn, name in [
        (call_relay, "relay"),
        (call_ollama, "ollama"),
        (call_openrouter, "openrouter"),
        (call_anthropic, "anthropic"),
    ]:
        result = provider_fn(raw_text)
        if result:
            return result, name
    return None, "none"
