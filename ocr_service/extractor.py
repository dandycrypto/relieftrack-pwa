"""
extractor.py — Rule-based structured extraction (Strategy A).

Pure functions, no I/O. Takes raw OCR text + lines, returns structured dict.
Multi-language: EN, MS, ZH (CJK), Tamil (transliterated).
"""
import re
from datetime import datetime
from typing import Optional
import numpy as np

from .synonyms import (
    TOTAL_SYNONYMS_LOWER, TAX_SST_LOWER, TAX_GST_LOWER,
    SERVICE_CHARGE_LOWER, EXCLUDE_LOWER, JUNK_PREFIX_LOWER,
    HEADER_SKIP_RES, VENDOR_SUFFIX_COMPILED,
    CATEGORY_KEYWORDS, DATE_PATTERNS,
    EA_FORM_TRIGGERS, CATEGORY_LIST,
)

# Amount pattern: catches 145.20, 1,234.56, 1.234,56 (EU), 12, RM-prefixed
# Negative lookahead/lookbehind to avoid partial matches like "12345" inside "1234567"
AMOUNT_RE = re.compile(r'(?<![.\d])(\d{1,3}(?:[,.\s]\d{3})*[.,]\d{2}|\d+[.,]\d{2})(?![.\d])')

# Invoice number pattern
INVOICE_PATTERNS = [
    r"Invoice\s*No\.?\s*[:#]?\s*([A-Z0-9][A-Z0-9/\-_]{4,30})",
    r"Invoice\s*#?\s*([A-Z0-9][A-Z0-9/\-_]{4,30})",
    r"INVOICE\s+([A-Z0-9][A-Z0-9/\-_]{4,30})",  # "INVOICE 500948954"
    r"Inv\.?\s*#?\s*:?\s*([A-Z0-9][A-Z0-9/\-_]{4,30})",
    r"Bill\s*No\.?\s*[:#]?\s*([A-Z0-9][A-Z0-9/\-_]{4,30})",
    r"Receipt\s*#?\s*:?\s*([A-Z0-9][A-Z0-9/\-_]{4,30})",
    r"Resit\s*#?\s*:?\s*([A-Z0-9][A-Z0-9/\-_]{4,30})",
    r"Ref(?:erence)?\.?\s*#?\s*:?\s*([A-Z0-9][A-Z0-9/\-_]{4,30})",
]

# OCR-jammed file-format suffixes
FILE_EXT_SUFFIX = re.compile(r'(PDF|JPG|JPEG|PNG|IMAGE|FILE|IMG|PHOTO|PIC|DOC|TIFF|BMP)$', re.I)

# TIN (Malaysian tax ID): 13 digits, often labeled
TIN_PATTERN = re.compile(
    r'\b(?:TIN|Tax\s*ID|No\.\s*Cukai\s*Pendapatan|NRIC\s*No)\s*[:#]?\s*(\d{12,13})',
    re.I
)

# SST registration patterns
SST_PATTERNS = [
    r'SST\s*(?:Reg|Reg\.?|Registration|ID|No\.?)?\s*[:#]?\s*([A-Z0-9][A-Z0-9\-]{6,20})',
    r'ServiceTax\s*Reg\.?\s*ND?\s*:\s*([A-Z0-9][A-Z0-9\-]{6,20})',
    r'B16-\d{4}-\d{7,8}',
]

INVOICE_FILE_SUFFIX_RE = FILE_EXT_SUFFIX


def parse_amount_value(s: str) -> Optional[float]:
    """Parse '1,234.56' or '1.234,56' or '1234.56' → 1234.56. Returns None on failure."""
    s = s.strip()
    if not s:
        return None
    # Handle EU format: 1.234,56 (period=thousands, comma=decimal)
    if re.match(r'^\d{1,3}(\.\d{3})*(,\d{2})$', s):
        s = s.replace('.', '').replace(',', '.')
    else:
        # US/MY format: commas=thousands, period=decimal; or just period
        s = s.replace(',', '')
    try:
        v = float(s)
        if 0 < v < 1000000:
            return v
    except ValueError:
        pass
    return None


def extract_amount(lines: list, full_text: str = "") -> Optional[float]:
    """Find total amount using priority scoring.

    Scoring:
      +50 if line contains a TOTAL_SYNONYMS keyword
      +20 if zone is "totals"
      +5  if zone is "items"
      -10 if zone is "footer"
      -100 if line contains an EXCLUDE word (cash, change, balance returned)
      -30 if line contains TAX or SERVICE_CHARGE keyword (those are sub-amounts)
      Rightmost number in a line wins (usually the amount after the label)
    """
    candidates = []  # (amount, score, zone, text)

    for ln in lines:
        text = ln["text"]
        zone = ln.get("zone", "")
        text_lower = text.lower()

        # Hard reject excluded lines
        if any(w in text_lower for w in EXCLUDE_LOWER):
            continue

        # Find amounts in line
        matches = list(AMOUNT_RE.finditer(text))
        if not matches:
            continue

        # Score base
        score = 0.0
        for syn in TOTAL_SYNONYMS_LOWER:
            if syn in text_lower:
                score += 50
                break

        # Zone weighting
        if zone == "totals":
            score += 20
        elif zone == "items":
            score += 5
        elif zone == "footer":
            score -= 10

        # Penalize tax/SC lines
        is_tax_or_sc = False
        for syn in TAX_SST_LOWER + TAX_GST_LOWER + SERVICE_CHARGE_LOWER:
            if syn in text_lower:
                score -= 30
                is_tax_or_sc = True
                break

        # Pick rightmost amount (typically the value, not date or invoice)
        m = matches[-1]
        val = parse_amount_value(m.group(1))
        if val is None:
            continue

        # Skip if amount appears inside a date context
        ctx = text[max(0, m.start() - 12):m.start() + 12]
        if re.search(r'\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}', ctx):
            continue

        candidates.append((val, score, zone, text))

    if not candidates:
        # Fallback: search entire text for the largest amount
        all_amounts = [parse_amount_value(m.group(1)) for m in AMOUNT_RE.finditer(full_text)]
        all_amounts = [a for a in all_amounts if a is not None and 0.50 <= a <= 50000]
        if all_amounts:
            return max(all_amounts)
        return None

    candidates.sort(key=lambda x: (-x[1], -x[0]))
    return candidates[0][0]


def extract_tax_amount(lines: list) -> tuple[Optional[float], Optional[str]]:
    """Find SST/GST tax line and extract amount + type."""
    for ln in lines:
        text = ln["text"].lower()
        tax_type = None
        for syn in TAX_SST_LOWER:
            if syn in text:
                tax_type = "SST"
                break
        if not tax_type:
            for syn in TAX_GST_LOWER:
                if syn in text:
                    tax_type = "GST"
                    break
        if not tax_type:
            continue
        matches = list(AMOUNT_RE.finditer(ln["text"]))
        if matches:
            val = parse_amount_value(matches[-1].group(1))
            if val is not None:
                return val, tax_type
    return None, None


def extract_vendor(lines: list) -> Optional[str]:
    """Extract clean company name from receipt.

    Strategy:
      Step A: Priority-ranked company-suffix detection (Sdn Bhd > Berhad > Bhd > ...)
             Walk back 1-4 brand words, drop junk prefixes (MYR0.00, Pay here, ...)
      Step B: First substantial line in header zone, filtering CTAs / labels / numbers
    """
    # Step A: scan first 40 lines for company-suffix lines
    candidates = []
    for i, ln in enumerate(lines[:40]):
        text = ln["text"]
        if not text or len(text) > 100:
            continue
        # Clean line: keep word chars, spaces, basic punctuation
        cleaned = re.sub(r'[^\w\s\-&()/.]', ' ', text).strip()
        cleaned = re.sub(r'\s+', ' ', cleaned)
        for name, pat, pri in VENDOR_SUFFIX_COMPILED:
            for m in pat.finditer(cleaned):
                # Position in line: later = more likely the actual vendor line
                position_score = m.start() / max(len(cleaned), 1)
                candidates.append((pri, m.start(), m.group(0), cleaned, i, position_score))

    if candidates:
        # Sort: highest suffix priority, then earliest position (vendor name usually
        # appears before the suffix in the line), then position_score
        candidates.sort(key=lambda x: (-x[0], x[1]))
        _, suffix_start, suffix_word, cleaned, idx, _ = candidates[0]
        # Walk back 1-4 brand words
        before = cleaned[:suffix_start].rstrip()
        words = before.split()
        # Filter junk
        # Single-word junk
        single_junk = {"myr", "rm", "rp", "usd", "sgd", "eur", "gbp",
                       "pay", "here", "deposit", "to", "at", "from", "the",
                       "cash", "bill", "invoice", "for", "of"}
        # Multi-word junk prefixes (will match sliding window of last 1-3 words)
        multi_junk = {"pay here", "deposit myr", "bill to", "billed to",
                      "payment to", "my r", "myr 0", "myr0", "my r0"}
        amount_re = re.compile(r"^(myr|rm|rp|usd|sgd|eur|gbp)?\s*\d+([.,]\d+)?$", re.I)
        kept = []
        kept_lower = []
        for w in reversed(words):
            w_clean = w.lower().rstrip(',.')
            # Single-word junk check
            if w_clean in single_junk:
                continue
            # Multi-word: check if last 1-3 kept words + this one form a junk phrase
            joined = " ".join([*kept_lower, w_clean])
            if any(j in joined for j in multi_junk):
                # Skip this word AND any trailing kept words that are part of the phrase
                # (only the immediately preceding junk word(s))
                # Actually just skip this one — the previous kept is what we have
                continue
            if amount_re.match(w):
                continue
            if re.match(r"^\d+$", w):
                continue
            kept.insert(0, w)
            kept_lower.insert(0, w_clean)
            if len(kept) >= 4:
                break
        if not kept:
            kept = words[-4:] if len(words) >= 4 else words
        if not kept:
            return None
        name = (" ".join(kept) + " " + suffix_word).replace('  ', ' ').strip()
        # Strip any trailing numeric noise (e.g., registration numbers glued after name)
        name = re.sub(r'\s+\d.*$', '', name).strip()
        if name and len(name) >= 4:
            return name[:80]

    # Step B: First substantial line in header zone
    for ln in lines[:15]:
        text = ln["text"].strip()
        if not text or len(text) < 2 or len(text) > 80:
            continue
        if text[0].isdigit():
            continue
        skip = False
        for sr in HEADER_SKIP_RES:
            if sr.match(text):
                skip = True
                break
        if skip:
            continue
        # Skip lines that are mostly digits (account numbers, etc.)
        digits = sum(1 for c in text if c.isdigit())
        if digits > len(text) * 0.5:
            continue
        # Clean and return
        cleaned = re.sub(r'[^\w\s\-&()/.]', ' ', text).strip()
        cleaned = re.sub(r'\s+', ' ', cleaned)
        return cleaned[:80]
    return None


def parse_date(text: str) -> Optional[str]:
    """Try multiple date patterns, return ISO 8601 (YYYY-MM-DD) or None."""
    for pat in DATE_PATTERNS:
        m = re.search(pat, text)
        if not m:
            continue
        s = m.group(0)
        try:
            if re.match(r'^\d{4}-\d{2}-\d{2}$', s):
                return s
            if re.match(r'^\d{2}/\d{2}/\d{4}$', s):
                d, mo, yr = s.split('/')
                return f"{yr}-{int(mo):02d}-{int(d):02d}"
            if re.match(r'^\d{2}-\d{2}-\d{4}$', s):
                d, mo, yr = s.split('-')
                return f"{yr}-{int(mo):02d}-{int(d):02d}"
            if re.match(r'^\d{1,2}/\d{1,2}/\d{2,4}$', s):
                parts = s.split('/')
                d, mo, yr = int(parts[0]), int(parts[1]), int(parts[2])
                if yr < 100:
                    yr += 2000
                return f"{yr:04d}-{mo:02d}-{d:02d}"
            if re.match(r'^\d{2}\s+[A-Za-z]{3,9}\s+\d{4}$', s):
                dt = datetime.strptime(s, "%d %b %Y")
                return dt.strftime("%Y-%m-%d")
            if re.match(r'^\d{1,2}-[A-Za-z]{3,9}-\d{2,4}$', s):
                dt = datetime.strptime(s, "%d-%b-%y" if len(s.split('-')[-1]) == 2
                                        else "%d-%b-%Y")
                return dt.strftime("%Y-%m-%d")
            # ZH: 2026年1月15日
            if '年' in s:
                zh_m = re.match(r'(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日', s)
                if zh_m:
                    yr, mo, d = int(zh_m.group(1)), int(zh_m.group(2)), int(zh_m.group(3))
                    return f"{yr:04d}-{mo:02d}-{d:02d}"
        except (ValueError, IndexError):
            continue
    return None


def parse_time(text: str) -> Optional[str]:
    """Extract HH:MM time. Filters unrealistic values."""
    m = re.search(r'\b(\d{1,2}):(\d{2})(?::\d{2})?\b', text)
    if m:
        h, mi = int(m.group(1)), int(m.group(2))
        if 0 <= h <= 23 and 0 <= mi <= 59:
            return f"{h:02d}:{mi:02d}"
    return None


def extract_invoice_number(text: str) -> Optional[str]:
    for pat in INVOICE_PATTERNS:
        m = re.search(pat, text, re.I)
        if m:
            cleaned = INVOICE_FILE_SUFFIX_RE.sub('', m.group(1)).upper()[:30]
            if len(cleaned) >= 4:
                return cleaned
    return None


def extract_tin(text: str) -> Optional[str]:
    m = TIN_PATTERN.search(text)
    if m:
        digits = re.sub(r'\D', '', m.group(1))
        if len(digits) >= 12:
            return digits[:13]
    return None


def extract_sst_id(text: str) -> Optional[str]:
    for pat in SST_PATTERNS:
        m = re.search(pat, text, re.I)
        if m:
            # Some patterns (B16-XXXX-XXXXXXXX) capture the full match
            captured = m.group(1) if m.lastindex and m.lastindex >= 1 else m.group(0)
            return captured.upper()[:30]
    return None


def extract_category(text: str) -> Optional[str]:
    """Score categories by keyword hits, return highest."""
    text_lower = text.lower()
    scores = {cat: 0 for cat in CATEGORY_LIST}
    for cat, kws in CATEGORY_KEYWORDS.items():
        for kw in kws:
            if kw in text_lower:
                scores[cat] = scores.get(cat, 0) + 1
    best_cat = max(scores.items(), key=lambda x: x[1])
    return best_cat[0] if best_cat[1] > 0 else None


def detect_document_type(text: str, lines: list) -> str:
    """Classify receipt / invoice / ea_form / unknown."""
    if any(t in text.upper() for t in EA_FORM_TRIGGERS):
        return "ea_form"
    upper = text.upper()
    if "TAX INVOICE" in upper or re.search(r'\bINVOICE\b', upper):
        # Distinguish: invoices usually have "INVOICE" near top + no "RECEIPT"
        if "RECEIPT" not in upper:
            return "invoice"
    if "RECEIPT" in upper or "RINGKASAN BIL" in upper or "RESIT" in upper:
        return "receipt"
    # Default to receipt if amount-like total line exists
    for ln in lines:
        if any(s in ln["text"].lower() for s in TOTAL_SYNONYMS_LOWER[:5]):
            return "receipt"
    return "unknown"


def math_check(lines: list, amount: Optional[float],
               tax_amount: Optional[float]) -> bool:
    """Verify subtotal + tax ≈ total ± RM1.00."""
    if amount is None:
        return True  # can't verify
    sub_re = re.compile(r'(?<![.\d])(\d{1,3}(?:[,.]\d{3})*[.,]\d{2}|\d+[.,]\d{2})(?![.\d])')
    for ln in lines:
        text = ln["text"].lower()
        if "sub" in text and ("total" in text or "jumlah" in text):
            matches = list(sub_re.finditer(ln["text"]))
            if matches:
                sub = parse_amount_value(matches[-1].group(1))
                if sub is not None:
                    expected = sub + (tax_amount or 0)
                    return abs(expected - amount) < 1.00
    return True  # no subtotal line, can't verify → pass


def extract_all(text: str, lines: list) -> dict:
    """Run all extractors and return combined dict."""
    amount = extract_amount(lines, text)
    tax_amount, tax_type = extract_tax_amount(lines)
    vendor = extract_vendor(lines)
    invoice = extract_invoice_number(text)
    tin = extract_tin(text)
    sst = extract_sst_id(text)
    date = parse_date(text)
    time = parse_time(text)
    category = extract_category(text)
    doc_type = detect_document_type(text, lines)
    math_ok = math_check(lines, amount, tax_amount)
    return {
        "vendor": vendor,
        "date": date,
        "time": time,
        "amount": amount,
        "tax_amount": tax_amount,
        "tax_type": tax_type,
        "currency": "MYR",
        "category": category,
        "invoice_number": invoice,
        "tin": tin,
        "sst_registration_no": sst,
        "document_type": doc_type,
        "math_check_passed": math_ok,
    }
