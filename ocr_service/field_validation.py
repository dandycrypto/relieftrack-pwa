"""
field_validation.py — Plausibility checks for OCR-extracted fields.

WHY THIS EXISTS
---------------
confidence.py scores *presence*: an amount that parses, a vendor of plausible
length, a date in ISO shape. It never asks whether the characters themselves
make sense. That produced a green "no review needed" result for an invoice
number read as ``INV-202S-00842`` (letter S where a digit belongs) on a blurred
photo -- a wrong value delivered with full confidence, which is worse for the
user than an honest failure.

The checks here are deliberately narrow and explainable: they only flag
patterns that are almost certainly recognition errors, never stylistic
preferences. Each returns a list of human-readable issues so the UI can say
what looks wrong instead of only lowering a number.
"""
import re
from typing import List, Optional


# Characters that OCR routinely confuses inside numeric runs. Applied only to
# fields that are expected to be digit-heavy, so a vendor name containing "S"
# or "O" is never touched.
_DIGIT_CONFUSIONS = {
    'S': '5', 's': '5',
    'O': '0', 'o': '0', 'Q': '0', 'D': '0',
    'I': '1', 'l': '1', '|': '1', 'i': '1',
    'B': '8',
    'Z': '2', 'z': '2',
    'G': '6',
    'T': '7',
    'A': '4',
}


def _looks_like_serial(value: str) -> bool:
    """True when a value is mostly digits with a short alpha prefix.

    Invoice/receipt numbers are typically 8+ characters that are at least 60%
    digits. Pure alpha strings (e.g. "REFUND") are not serial-like.
    """
    if not value or len(value) < 6:
        return False
    digits = sum(ch.isdigit() for ch in value)
    alnum = sum(ch.isalnum() for ch in value)
    if alnum == 0:
        return False
    return digits >= 4 and digits / alnum >= 0.5


def check_serial(value: Optional[str], field: str = "invoice_number") -> List[str]:
    """Flag likely digit/letter confusion inside a serial number.

    Example: INV-202S-00842 -> the "S" sits inside a digit run and is almost
    certainly a misread "5".
    """
    issues: List[str] = []
    if not value or not isinstance(value, str):
        return issues
    if not _looks_like_serial(value):
        return issues

    # Walk each maximal alphanumeric run; a run that is predominantly digits
    # but contains a confusable letter is suspicious.
    for run in re.findall(r'[A-Za-z0-9]+', value):
        if len(run) < 3:
            continue
        digits = sum(ch.isdigit() for ch in run)
        letters = sum(ch.isalpha() for ch in run)
        if digits >= 2 and letters >= 1 and digits > letters:
            bad = [ch for ch in run if ch in _DIGIT_CONFUSIONS]
            if bad:
                issues.append(
                    f"{field}: '{run}' mixes digits with letter(s) "
                    f"{', '.join(sorted(set(bad)))} — possible OCR confusion"
                )
    return issues


def check_date(value: Optional[str], field: str = "date") -> List[str]:
    """Flag dates that parse but are implausible for a tax document."""
    issues: List[str] = []
    if not value or not isinstance(value, str):
        return issues
    m = re.match(r'^(\d{4})-(\d{2})-(\d{2})$', value)
    if not m:
        issues.append(f"{field}: '{value}' is not ISO YYYY-MM-DD")
        return issues
    year, month, day = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if not (1 <= month <= 12):
        issues.append(f"{field}: month {month} out of range")
    if not (1 <= day <= 31):
        issues.append(f"{field}: day {day} out of range")
    # A receipt older than ~12 years or dated in the future is a misread.
    if year < 2005:
        issues.append(f"{field}: year {year} is implausibly old for a receipt")
    if year > 2100:
        issues.append(f"{field}: year {year} is implausible")
    return issues


def check_amount(value, field: str = "amount") -> List[str]:
    """Flag amounts outside a sane range for personal tax receipts."""
    issues: List[str] = []
    if value is None:
        return issues
    try:
        v = float(value)
    except (TypeError, ValueError):
        issues.append(f"{field}: '{value}' is not numeric")
        return issues
    if v < 0:
        issues.append(f"{field}: negative value {v}")
    if v == 0:
        issues.append(f"{field}: zero amount is suspicious")
    if v >= 1_000_000:
        issues.append(f"{field}: {v} exceeds plausible receipt range")
    return issues


def check_vendor(value: Optional[str], field: str = "vendor") -> List[str]:
    """Flag vendor strings that look like OCR noise rather than a name."""
    issues: List[str] = []
    if not value or not isinstance(value, str):
        return issues
    v = value.strip()
    if len(v) < 3:
        issues.append(f"{field}: '{v}' too short to be a business name")
        return issues

    letters = sum(ch.isalpha() for ch in v)
    if letters == 0:
        issues.append(f"{field}: '{v}' contains no letters")

    # A long name with no spaces at all is the classic symptom of a recognition
    # model that dropped word boundaries (see ocr_engine PP-OCRv5 note).
    if len(v) > 18 and ' ' not in v:
        issues.append(
            f"{field}: '{v}' is {len(v)} chars with no spaces — "
            "word boundaries likely lost"
        )

    if not re.search(r'[A-Za-z]', v):
        issues.append(f"{field}: no alphabetic content")
    return issues


def validate_fields(fields: dict) -> List[str]:
    """Run every field check and return all issues."""
    issues: List[str] = []
    issues += check_vendor(fields.get("vendor"))
    issues += check_date(fields.get("date"))
    issues += check_amount(fields.get("amount"))
    issues += check_serial(fields.get("invoice_number"))
    return issues
