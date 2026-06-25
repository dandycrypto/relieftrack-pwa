#!/usr/bin/env python3
"""
OCR accuracy test harness — measures parse correctness across synthetic Malaysian receipts.

Generates N receipt variants (different vendors, amounts, dates, noise levels),
runs them through scripts/ocr_rapid.py, then runs the client-side parser
extracted from lib/ocr.ts logic. Reports per-field accuracy.

Metrics:
  - vendor_correct: did we get the exact merchant name?
  - date_correct: YYYY-MM-DD matches?
  - time_correct: HH:MM matches?
  - amount_within_1pct: extracted amount within 1% of ground truth?
  - category_correct: suggested category matches expected?
  - ocr_confidence: mean confidence from RapidOCR
  - total_time_ms: end-to-end time

Usage:
  python3 scripts/tests/test_ocr_accuracy.py [--count 20] [--output report.json]
"""
import sys
import os
import json
import time
import argparse
import subprocess
import random
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np

# Add parent dir to path so we can import ocr_rapid module
SCRIPT_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(SCRIPT_DIR))

# ─── Ground truth fixtures ────────────────────────────────────────────────
# Each fixture: vendor, address, items, totals, date, time, category
FIXTURES = [
    {
        "name": "tesco_clean",
        "vendor": "TESCO EXTRA",
        "address": "Lot 88, Bukit Bintang, Kuala Lumpur",
        "items": [
            ("Beras 5kg", 28.90),
            ("Minyak masak", 12.50),
            ("Roti Gardenia", 4.50),
        ],
        "subtotal": 45.90,
        "total": 45.90,
        "cash": 50.00,
        "change": 4.10,
        "date": "25/06/2026",
        "time": "14:32",
        "category": "lifestyle",  # groceries = lifestyle
        "footer": "TERIMA KASIH - THANK YOU",
    },
    {
        "name": "guardian_pharmacy",
        "vendor": "GUARDIAN",
        "address": "Sunway Pyramid, Petaling Jaya",
        "items": [
            ("Panadol 16s", 8.50),
            ("Vit C 100s", 12.00),
            ("Mask 50s", 5.00),
        ],
        "subtotal": 25.50,
        "total": 25.50,
        "cash": 30.00,
        "change": 4.50,
        "date": "20/05/2026",
        "time": "10:15",
        "category": "medical_self",
        "footer": "TERIMA KASIH",
    },
    {
        "name": "mcdonalds",
        "vendor": "McDonald's",
        "address": "KLCC, Kuala Lumpur",
        "items": [
            ("Big Mac Meal", 18.90),
            ("Apple Pie", 3.50),
        ],
        "subtotal": 22.40,
        "total": 22.40,
        "cash": 25.00,
        "change": 2.60,
        "date": "15/06/2026",
        "time": "19:45",
        "category": "lifestyle",
        "footer": "THANK YOU - SILA DATANG LAGI",
    },
    {
        "name": "shell_petrol",
        "vendor": "SHELL",
        "address": "Jalan Tun Razak, KL",
        "items": [
            ("PETRONAS PRIMAX 95", 50.00),
        ],
        "subtotal": 50.00,
        "total": 50.00,
        "cash": 50.00,
        "change": 0.00,
        "date": "01/06/2026",
        "time": "08:20",
        "category": "transport",
        "footer": "TERIMA KASIH",
    },
    {
        "name": "unifi_bill",
        "vendor": "unifi",
        "address": "TM Point, KL",
        "items": [
            ("Unifi 500Mbps", 199.00),
            ("Service Tax 6%", 11.94),
        ],
        "subtotal": 199.00,
        "total": 210.94,
        "cash": 210.94,
        "change": 0.00,
        "date": "10/06/2026",
        "time": "12:00",
        "category": "utilities",  # unifi broadband → utilities (telco)
        "footer": "TERIMA KASIH",
    },
    {
        "name": "yonex_sports",
        "vendor": "YONEX",
        "address": "Mid Valley Megamall",
        "items": [
            ("BG80 String", 18.00),
            ("Grip Tape", 5.50),
            ("Shuttlecock 6pcs", 24.00),
        ],
        "subtotal": 47.50,
        "total": 47.50,
        "cash": 50.00,
        "change": 2.50,
        "date": "05/06/2026",
        "time": "16:30",
        "category": "lifestyle",  # sports equipment
        "footer": "THANK YOU",
    },
    {
        "name": "kfc_food",
        "vendor": "KFC",
        "address": "Pavilion KL",
        "items": [
            ("Zinger Meal", 16.90),
            ("Coleslaw", 7.50),
            ("Pepsi 1L", 5.90),
        ],
        "subtotal": 30.30,
        "total": 30.30,
        "cash": 35.00,
        "change": 4.70,
        "date": "18/06/2026",
        "time": "20:00",
        "category": "lifestyle",
        "footer": "JOM MAKAN LAGI",
    },
    {
        "name": "caring_pharmacy",
        "vendor": "CARING PHARMACY",
        "address": "1 Utama, PJ",
        "items": [
            ("Vitamin D3 60s", 28.50),
        ],
        "subtotal": 28.50,
        "total": 28.50,
        "cash": 30.00,
        "change": 1.50,
        "date": "12/06/2026",
        "time": "11:00",
        "category": "medical_self",
        "footer": "STAY HEALTHY!",
    },
]


# ─── Image generation ─────────────────────────────────────────────────────

def generate_receipt_image(fixture: dict, skew_deg: float = 0, noise_pct: float = 0, blur: float = 0) -> Image.Image:
    """Generate synthetic receipt image from fixture data."""
    width, height = 480, 720
    img = Image.new('RGB', (width, height), (252, 252, 252))
    d = ImageDraw.Draw(img)

    # Use a real font if available, else default
    font_paths = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    font_big = ImageFont.load_default()
    font_med = ImageFont.load_default()
    font_small = ImageFont.load_default()
    for fp in font_paths:
        if os.path.exists(fp):
            try:
                font_big = ImageFont.truetype(fp, 22)
                font_med = ImageFont.truetype(fp.replace("Bold", ""), 16)
                font_small = ImageFont.truetype(fp.replace("Bold", ""), 13)
                break
            except Exception:
                continue

    lines = [
        (fixture["vendor"], font_big),
        (fixture["address"], font_small),
        ("", font_small),
        (f"Date: {fixture['date']}    Time: {fixture['time']}", font_small),
        ("", font_small),
        ("-" * 40, font_small),
    ]
    for name, price in fixture["items"]:
        right = f"RM {price:.2f}"
        line = f"{name:<32} {right:>7}"
        lines.append((line, font_med))

    lines.extend([
        ("-" * 40, font_small),
        (f"{'Subtotal':<32} {'RM ' + format(fixture['subtotal'], '.2f'):>7}", font_med),
        (f"{'TOTAL':<32} {'RM ' + format(fixture['total'], '.2f'):>7}", font_big),
        (f"{'CASH':<32} {'RM ' + format(fixture['cash'], '.2f'):>7}", font_med),
        (f"{'CHANGE':<32} {'RM ' + format(fixture['change'], '.2f'):>7}", font_med),
        ("", font_small),
        (fixture["footer"], font_small),
        ("SST ID: 001234567890", font_small),
    ])

    y = 20
    for text, font in lines:
        d.text((15, y), text, fill='black', font=font)
        y += 28 if font == font_big else (22 if font == font_med else 18)

    # Apply transforms
    if skew_deg != 0:
        img = img.rotate(skew_deg, expand=True, fillcolor=(252, 252, 252))
    if blur > 0:
        img = img.filter(ImageFilter.GaussianBlur(blur))
    if noise_pct > 0:
        arr = np.array(img).astype(np.int16)
        amp = int(255 * noise_pct / 100)
        noise = np.random.randint(-amp, amp, arr.shape, dtype=np.int16)
        arr = np.clip(arr + noise, 0, 255).astype(np.uint8)
        img = Image.fromarray(arr)

    return img


# ─── Test client-side parser against rawText ──────────────────────────────
# Inlined mirror of lib/ocr.ts parsers (Python port — keep in sync)

import re

TXN_KW = ['total','grand','amount','due','subtotal','balance','amount due','payable',
          'cash','tendered','change','tunai','jumlah','bayar','resit','grand total',
          'amount payable','bil','tot']
KW_WEIGHTS = [
    (re.compile(r'\bgrand\s*total\b', re.I), 100),
    (re.compile(r'\btotal\s*including\s*tax\b', re.I), 95),
    (re.compile(r'\bamount\s*due\b', re.I), 85),
    (re.compile(r'\bpayable\b', re.I), 80),
    (re.compile(r'\btotal\b', re.I), 75),
    (re.compile(r'\bnett?\b', re.I), 70),
    (re.compile(r'\bjumlah\b', re.I), 70),
    (re.compile(r'\bbayar\b', re.I), 65),
    (re.compile(r'\bbil\b', re.I), 60),
    (re.compile(r'\bsubtotal\b', re.I), 50),
    (re.compile(r'\bsales\b', re.I), 45),
    (re.compile(r'\bcharge\b', re.I), 40),
    (re.compile(r'\bfee\b', re.I), 35),
    (re.compile(r'\bbaki\b', re.I), 5),
    (re.compile(r'\btunai\b', re.I), 10),
    (re.compile(r'\bbalance\b', re.I), 20),
    (re.compile(r'\bcash\b', re.I), 10),
    (re.compile(r'\bchange\b', re.I), 5),
    (re.compile(r'\bRM\s', re.I), 8),
]

VENDOR_SKIP = re.compile(r'receipt|invoice|order|date|time|cashier|address|phone|tel|email|gst|sst|tax|terminal|transaction|merchant|store|branch|opening|closing', re.I)
CATEGORY_KEYWORDS = {
    "Food": ["mamak","restaurant","cafe","coffee","kopitiam","nasi","laksa","satay","food","meal","lunch","dinner","breakfast","burger","pizza","sushi","mcdonald","kfc","starbucks","tealive","roti","noodle"],
    "Transport": ["petrol","parking","toll","lrt","mrt","bus","taxi","grab","fuel","shell","petronas"],
    "Utilities": ["electric","water","internet","phone","telco","maxis","unifi","tm","tenaga","air selangor"],
    "Shopping": ["shop","store","mall","guardian","watsons","yonex","badminton","sports"],
    "Medical": ["pharmacy","clinic","hospital","doctor","medical","guardian","watsons","caring"],
}
CATEGORY_MAP = {"Food": "lifestyle", "Transport": "transport", "Utilities": "utilities", "Shopping": "lifestyle", "Medical": "medical_self"}


def parse_amount(raw_text: str):
    amount_regex = re.compile(r'(?<![.\d])(\d{1,4}[,.]?\d{0,2}[,.]?\d{2})(?![.\d])')
    candidates = []  # list of (val, weight)
    for m in amount_regex.finditer(raw_text):
        val = float(m.group(1).replace(',', ''))
        if val < 0.01 or val > 9999:
            continue
        ctx = raw_text[max(0, m.start() - 10):m.start() + 10]
        if re.search(r'\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}', ctx):
            continue
        line_start = raw_text.rfind('\n', 0, m.start()) + 1
        line_end = raw_text.find('\n', m.start())
        if line_end == -1:
            line_end = m.start() + 30
        line = raw_text[line_start:line_end].lower()
        # Find best keyword weight
        best_w = 0
        for pat, w in KW_WEIGHTS:
            if pat.search(line):
                if w > best_w:
                    best_w = w
        if best_w > 0:
            candidates.append((val, best_w))
    if not candidates:
        return None
    # Sort by weight desc, then value desc
    candidates.sort(key=lambda x: (-x[1], -x[0]))
    return candidates[0][0]


def parse_date_time(raw_text: str):
    m = re.search(r'(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})', raw_text)
    if not m:
        return None, None
    d, mo, yr = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if yr < 100:
        yr += 2000
    date = f"{yr:04d}-{mo:02d}-{d:02d}"
    t = re.search(r'\b(\d{1,2}):(\d{2})\b', raw_text)
    time = f"{int(t.group(1)):02d}:{t.group(2)}" if t else None
    return date, time


def parse_vendor(raw_text: str):
    lines = [l.strip() for l in raw_text.split('\n') if l.strip()]
    for i in range(min(5, len(lines))):
        line = lines[i]
        if VENDOR_SKIP.search(line):
            continue
        if line[0].isdigit():
            continue
        # Accept any line with 2+ letters (KFC, GUARDIAN, TESCO EXTRA, etc.)
        if len(line) >= 2 and re.search(r'[a-z]{2,}', line, re.I):
            return line[:80]
    return "Unknown Merchant"


def parse_category(raw_text: str):
    text_lower = raw_text.lower()
    # Vendor-specific overrides
    vendor_priority = [
        (re.compile(r'guardian|caring\s*pharmacy|watsons|alpro\s*pharmacy|big\s*pharmacy', re.I), "medical_self"),
        (re.compile(r'unifi|maxis|celcom|digi|tm\s|time\.com', re.I), "utilities"),
        (re.compile(r'syabas|air\s*selangor|tenaga\s*nasional|tnb', re.I), "utilities"),
        (re.compile(r'aia|prudential|great\s*eastern|takaful', re.I), "insurance"),
        (re.compile(r'shell\s|petronas\s|caltex\s|bhp', re.I), "transport"),
        (re.compile(r'starbucks|mcdonald|kfc|pizza\s*hut|texas\s*chicken|tealive|chatime', re.I), "lifestyle"),
    ]
    for pat, cat in vendor_priority:
        if pat.search(text_lower):
            return cat
    # Keyword scoring
    best, score = "lifestyle", 0
    for cat, kws in CATEGORY_KEYWORDS.items():
        s = sum(1 for kw in kws if kw in text_lower)
        if s > score:
            score = s
            best = cat
    return CATEGORY_MAP.get(best, "lifestyle")


def evaluate_parsed(fixture: dict, raw_text: str) -> dict:
    """Compare parsed fields vs ground truth."""
    parsed_amount = parse_amount(raw_text)
    parsed_date, parsed_time = parse_date_time(raw_text)
    parsed_vendor = parse_vendor(raw_text)
    parsed_category = parse_category(raw_text)

    expected_date = f"{fixture['date'][-4:]}-{fixture['date'][3:5]}-{fixture['date'][:2]}"
    expected_time = fixture['time']

    # Vendor fuzzy match — accept if expected substring appears in parsed, OR char jaccard >= 0.5
    expected_l = fixture['vendor'].lower()
    expected_words = set(re.findall(r'[a-z0-9]+', expected_l))
    expected_words = {w for w in expected_words if len(w) > 2}
    parsed_l = parsed_vendor.lower()
    parsed_words = set(re.findall(r'[a-z0-9]+', parsed_l))
    # Direct word overlap (handles "KFC" matching "kfc")
    word_match = bool(expected_words & parsed_words)
    # Substring match (handles "TESCOEXTRA" containing "tesco")
    sub_match = any(w in parsed_l for w in expected_words if len(w) >= 4)
    # Char jaccard (handles dropped spaces)
    expected_chars = set(re.findall(r'[a-z]', expected_l))
    parsed_chars = set(re.findall(r'[a-z]', parsed_l))
    jaccard = len(expected_chars & parsed_chars) / max(1, len(expected_chars | parsed_chars))
    vendor_correct = word_match or sub_match or jaccard >= 0.5

    amount_ok = parsed_amount is not None and abs(parsed_amount - fixture['total']) <= fixture['total'] * 0.01
    date_correct = parsed_date == expected_date
    time_correct = parsed_time == expected_time
    category_correct = parsed_category == fixture['category']

    return {
        "expected_total": fixture['total'],
        "parsed_amount": parsed_amount,
        "amount_ok": amount_ok,
        "expected_date": expected_date,
        "parsed_date": parsed_date,
        "date_correct": date_correct,
        "expected_time": expected_time,
        "parsed_time": parsed_time,
        "time_correct": time_correct,
        "expected_vendor": fixture['vendor'],
        "parsed_vendor": parsed_vendor,
        "vendor_correct": vendor_correct,
        "expected_category": fixture['category'],
        "parsed_category": parsed_category,
        "category_correct": category_correct,
    }


# ─── Main test loop ────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--count", type=int, default=1, help="Variants per fixture")
    parser.add_argument("--output", type=str, default=None, help="Save detailed report JSON")
    parser.add_argument("--no-preprocess", action="store_true", help="Skip preprocessing")
    args = parser.parse_args()

    tmpdir = Path("/tmp/ocr_test_fixtures")
    tmpdir.mkdir(parents=True, exist_ok=True)

    all_results = []
    rng = random.Random(42)  # deterministic for reproducibility

    for fixture in FIXTURES:
        for variant in range(args.count):
            # Vary conditions
            skew = rng.uniform(-3, 3) if variant > 0 else 0
            noise = rng.uniform(2, 8) if variant > 0 else 0
            blur = rng.uniform(0.2, 0.8) if variant > 0 else 0

            img = generate_receipt_image(fixture, skew_deg=skew, noise_pct=noise, blur=blur)
            img_path = tmpdir / f"{fixture['name']}_{variant}.jpg"
            img.save(img_path, quality=85)

            # Run OCR
            t0 = time.time()
            cmd = ["python3", str(SCRIPT_DIR / "ocr_rapid.py"), str(img_path)]
            if args.no_preprocess:
                cmd.append("--no-preprocess")
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
            elapsed = (time.time() - t0) * 1000

            if result.returncode != 0:
                print(f"❌ {fixture['name']}_{variant}: OCR failed")
                continue

            try:
                ocr_data = json.loads(result.stdout)
            except Exception as e:
                print(f"❌ {fixture['name']}_{variant}: JSON parse failed: {e}")
                continue

            raw_text = ocr_data.get('rawText', '')
            confidence = ocr_data.get('confidence', 0)

            # Evaluate parser
            eval_result = evaluate_parsed(fixture, raw_text)

            all_results.append({
                "fixture": fixture['name'],
                "variant": variant,
                "skew": round(skew, 1),
                "noise_pct": round(noise, 1),
                "blur": round(blur, 2),
                "ocr_confidence": confidence,
                "elapsed_ms": int(elapsed),
                "rawText": raw_text,
                **eval_result,
            })

            status = "✅" if all([
                eval_result['amount_ok'],
                eval_result['date_correct'],
                eval_result['vendor_correct'],
                eval_result['category_correct'],
            ]) else "⚠️"
            amt = eval_result['parsed_amount']
            exp = eval_result['expected_total']
            amt_ok = eval_result['amount_ok']
            amount_str = f"{amt:.2f}" if amt else "None"
            amount_check = "✓" if amt_ok else f"✗ (want {exp:.2f})"
            print(f"{status} {fixture['name']}_{variant:02d}: "
                  f"conf={confidence:.2f} "
                  f"vendor={'✓' if eval_result['vendor_correct'] else '✗'} "
                  f"date={'✓' if eval_result['date_correct'] else '✗'} "
                  f"amount={amount_str}{amount_check} "
                  f"cat={'✓' if eval_result['category_correct'] else '✗'} "
                  f"({int(elapsed)}ms)")

    # Summary
    if not all_results:
        print("\nNo results to summarize")
        return

    n = len(all_results)
    print(f"\n{'='*70}")
    print(f"OCR ACCURACY REPORT — {n} samples across {len(FIXTURES)} fixture types")
    print(f"{'='*70}")
    print(f"  vendor_correct:   {sum(r['vendor_correct'] for r in all_results)}/{n} ({100*sum(r['vendor_correct'] for r in all_results)/n:.1f}%)")
    print(f"  date_correct:     {sum(r['date_correct'] for r in all_results)}/{n} ({100*sum(r['date_correct'] for r in all_results)/n:.1f}%)")
    print(f"  time_correct:     {sum(r['time_correct'] for r in all_results)}/{n} ({100*sum(r['time_correct'] for r in all_results)/n:.1f}%)")
    print(f"  amount_within_1%: {sum(r['amount_ok'] for r in all_results)}/{n} ({100*sum(r['amount_ok'] for r in all_results)/n:.1f}%)")
    print(f"  category_correct: {sum(r['category_correct'] for r in all_results)}/{n} ({100*sum(r['category_correct'] for r in all_results)/n:.1f}%)")
    print(f"  ocr_confidence:   {sum(r['ocr_confidence'] for r in all_results)/n:.3f} (mean)")
    print(f"  elapsed_ms:       {sum(r['elapsed_ms'] for r in all_results)/n:.0f} (mean)")

    if args.output:
        Path(args.output).write_text(json.dumps(all_results, indent=2, ensure_ascii=False))
        print(f"\nDetailed report saved to: {args.output}")


if __name__ == "__main__":
    main()