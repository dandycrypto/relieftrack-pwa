"""
synonyms.py — Multilingual synonym dictionaries for Malaysian receipt parsing.

Covers: English, Bahasa Malaysia, Mandarin Chinese (simplified), Tamil (transliterated),
and common abbreviations used in Malaysian receipts.
"""
import re

# Total / amount payable synonyms (priority order: longer/more specific first)
TOTAL_SYNONYMS = [
    # Mandarin (highest priority for ZH receipts)
    "合计", "总计", "总额", "应付金额", "实收", "收款",
    "合  计", "总  计",
    # Bahasa Malaysia
    "jumlah", "jumlah bayaran", "jumlah keseluruhan", "jum. kena bayar",
    "jumlah kena bayar", "jum bayar", "amaun perlu dibayar",
    "amaun", "jumlah amaun", "harga", "harga jualan", "jumlah harga",
    "jumlah bersih", "bayaran", "bayaran akhir",
    # English
    "total amount", "amount due", "amount payable", "grand total",
    "net total", "net amount", "balance due", "total payable",
    "total", "balance",
    # Abbreviations
    "ttl", "tot", "tot amt", "t/amt", "total rm",
]

# Tax labels (SST, GST, service charge)
TAX_SYNONYMS = {
    "SST": [
        "sst", "service tax", "cukai perkhidmatan", "cukai jualan",
        "sales & service tax", "s&s tax", "sales and service tax",
        # ZH
        "服务税", "销售税",
    ],
    "GST": [
        "gst", "goods and services tax", "cukai barangan dan perkhidmatan",
    ],
}

SERVICE_CHARGE_SYNONYMS = [
    "service charge", "caj perkhidmatan", "服务费",
]

# Date patterns (tried in order)
DATE_PATTERNS = [
    r'\d{4}-\d{2}-\d{2}',            # ISO YYYY-MM-DD
    r'\d{2}/\d{2}/\d{4}',            # DD/MM/YYYY (Malaysian standard)
    r'\d{2}-\d{2}-\d{4}',            # DD-MM-YYYY
    r'\d{2}\s+[A-Za-z]{3,9}\s+\d{4}',# 15 Jan 2024
    r'\d{1,2}/\d{1,2}/\d{2,4}',     # D/M/YY
    r'\d{1,2}-[A-Za-z]{3,9}-\d{2,4}',# 1-Jan-26
    # ZH: 2026年1月15日
    r'\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日',
]

# Vendor company suffixes (Malaysian business registration types)
VENDOR_SUFFIX_PATTERNS = [
    ("sdn bhd", r"\bsdn\.?\s*bhd\.?\b", 100),
    ("berhad", r"\bberhad\b", 95),
    ("bhd", r"\bbhd\b", 90),
    ("plt", r"\bplt\b", 80),
    ("llp", r"\bllp\b", 80),
    ("holdings", r"\bholdings\b", 60),
    ("enterprises", r"\benterprises?\b", 55),
    ("trading", r"\btrading\b", 45),
    ("group", r"\bgroup\b", 35),
]

# LHDN-relevant category enum (for tax deduction tagging)
CATEGORY_LIST = [
    "food_beverage", "medical", "education", "lifestyle", "utilities",
    "transport", "groceries", "insurance", "childcare", "other",
]

CATEGORY_KEYWORDS = {
    "medical": ["pharmacy", "clinic", "hospital", "guardian", "watsons",
                "caring", "klinik", "dentist", "dental", "doctor",
                "医院", "诊所", "药房"],
    "utilities": ["electric", "water", "internet", "phone", "telco",
                  "maxis", "unifi", "tm ", "tenaga", "air selangor",
                  "tnb ", "time.com", "time.ccm", "telekom", "electricity",
                  "tnb", "tt dotcom", "tt dot", "电费", "水费"],
    "transport": ["petrol", "parking", "toll", "lrt", "mrt", "bus",
                  "taxi", "grab", "car ", "motor", "fuel", "shell",
                  "petronas", "caltex", "tng", "touch n go"],
    "food_beverage": ["mamak", "restaurant", "cafe", "coffee", "kopitiam",
                      "nasi", "mcdonald", "kfc", "starbucks", "tealive",
                      "chatime", "kedai makan", "restoran", "oldtown",
                      "secret recipe", "麦当劳", "星巴克", "餐厅"],
    "groceries": ["mydin", "aeon", "tesco", "jaya grocer", "village grocer",
                  "cold storage", "giant", "supermarket", "pasaraya",
                  "99 speedmart", "7-eleven", "7 eleven", "family mart",
                  "kk mart", "econsave"],
    "education": ["university", "college", "tuition", "udemy", "coursera",
                  "school", "sekolah", "universiti", "kolej"],
    "lifestyle": ["shopping", "mall", "store", "yonex", "decathlon",
                  "nike", "adidas", "bookstore", "mph", "kinokuniya",
                  "fitness", "gym"],
    "insurance": ["insurance", "takaful", "aia", "prudential",
                  "great eastern", "etiqa"],
    "childcare": ["childcare", "tadika", "kindergarten", "daycare",
                  "taska", "nursery"],
}

# Words to EXCLUDE when looking for amounts (sub-amounts, not totals)
EXCLUDE_AMOUNT_WORDS = [
    "cash", "change", "tunai", "baki", "balance returned",
    "cash tendered", "received", "kembali",
]

# Junk prefixes to strip from vendor names
VENDOR_JUNK_PREFIXES = [
    "pay here", "deposit", "myr", "rm", "rp", "usd", "sgd",
    "bill to", "billed to", "payment to",
]

# Skip patterns for "header line" vendor fallback (browser chrome, CTAs, etc.)
HEADER_SKIP_PATTERNS = [
    r"^(invoice|inv\.?|receipt|doc|date|time|cashier|account|payment|change|balance|order|ref)\b",
    r"^(continue|submit|generate|cancel|next|back|close|done|accept|decline|open|save|share|download|print)\b",
    r"^(generative|ai|user|guidelines?|welcome|loading|please|thank|introduction|summary|description)\b",
    r"^(email|phone|tel|fax|address|http|www)\b",
]

# EA Form (LHDN annual income statement) detection
EA_FORM_TRIGGERS = [
    "BORANG EA", "PENYATA SARAAN", "EA FORM",
    "PENDAPATAN DARI PENGGajian", "EMPLOYER'S RETURN",
    "HASIL", "MAJIKAN",
]

# Compile regexes once at module load for performance
TOTAL_SYNONYMS_LOWER = [s.lower() for s in TOTAL_SYNONYMS]
TAX_SST_LOWER = [s.lower() for s in TAX_SYNONYMS["SST"]]
TAX_GST_LOWER = [s.lower() for s in TAX_SYNONYMS["GST"]]
SERVICE_CHARGE_LOWER = [s.lower() for s in SERVICE_CHARGE_SYNONYMS]
EXCLUDE_LOWER = [w.lower() for w in EXCLUDE_AMOUNT_WORDS]
JUNK_PREFIX_LOWER = [w.lower() for w in VENDOR_JUNK_PREFIXES]

HEADER_SKIP_RES = [re.compile(p, re.I) for p in HEADER_SKIP_PATTERNS]
VENDOR_SUFFIX_COMPILED = [
    (name, re.compile(pat, re.I), pri)
    for (name, pat, pri) in VENDOR_SUFFIX_PATTERNS
]

# CJK + Tamil detection
CJK_RE = re.compile(r'[\u4e00-\u9fff]')
TAMIL_RE = re.compile(r'[\u0bff-\u0bff\u0b80-\u0bbf]')


def detect_languages(text: str) -> dict:
    """Detect which scripts appear in text."""
    return {
        "cjk": bool(CJK_RE.search(text)),
        "tamil": bool(TAMIL_RE.search(text)),
        "latin": bool(re.search(r'[A-Za-z]', text)),
    }
