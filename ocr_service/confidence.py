"""
confidence.py — Weighted confidence scoring for OCR extractions.

Weights (sum to 1.0):
  amount present + parseable:      0.35
  vendor present:                 0.20
  date present + ISO format:      0.20
  math_check_passed (sub+tax=total): 0.15
  document_type identified:       0.10

Total: 0.0 - 1.0

Thresholds:
  ≥ 0.85: green (high confidence)
  0.70 - 0.84: amber (review recommended)
  < 0.70: red (manual review required)

Penalty: if LLM (Strategy B) was used, multiply final score by 0.85
         (because LLM output is fallback and not validated against ground truth)
"""

# Field weights (must sum to 1.0)
WEIGHT_AMOUNT = 0.35
WEIGHT_VENDOR = 0.20
WEIGHT_DATE = 0.20
WEIGHT_MATH = 0.15
WEIGHT_DOC_TYPE = 0.10

# Thresholds
THRESHOLD_GREEN = 0.85
THRESHOLD_AMBER = 0.70

# LLM penalty
LLM_PENALTY = 0.85


def confidence_score(amount, vendor, date, doc_type: str,
                    math_check_passed: bool, used_llm: bool = False) -> float:
    """Compute weighted confidence score.

    Args:
        amount: parsed float amount or None
        vendor: extracted vendor name or None
        date: ISO date string (YYYY-MM-DD) or None
        doc_type: receipt/invoice/ea_form/unknown
        math_check_passed: True if subtotal+tax ≈ total (or not verifiable)
        used_llm: True if LLM Strategy B was used (penalty applies)
    """
    score = 0.0

    # Amount present and reasonable
    if amount is not None and isinstance(amount, (int, float)) and 0 < amount < 1000000:
        score += WEIGHT_AMOUNT

    # Vendor present and reasonable length
    if vendor is not None and isinstance(vendor, str) and 3 <= len(vendor) <= 80:
        score += WEIGHT_VENDOR

    # Date in ISO format
    if date is not None and isinstance(date, str) and len(date) == 10 and date[4] == '-':
        score += WEIGHT_DATE

    # Math check passed
    if math_check_passed:
        score += WEIGHT_MATH

    # Document type identified
    if doc_type and doc_type != "unknown":
        score += WEIGHT_DOC_TYPE

    # LLM penalty
    if used_llm:
        score *= LLM_PENALTY

    return round(min(score, 1.0), 3)


def needs_review(confidence: float, amount, math_check_passed: bool,
                 used_llm: bool = False) -> bool:
    """Determine if extraction needs human review.

    Returns True if:
      - confidence < THRESHOLD_AMBER
      - amount is None (critical field missing)
      - math_check_failed
      - LLM was used (always review LLM output)
    """
    if used_llm:
        return True
    if amount is None:
        return True
    if not math_check_passed:
        return True
    if confidence < THRESHOLD_AMBER:
        return True
    return False


def confidence_band(score: float) -> str:
    """Return 'green' | 'amber' | 'red' band."""
    if score >= THRESHOLD_GREEN:
        return "green"
    if score >= THRESHOLD_AMBER:
        return "amber"
    return "red"
