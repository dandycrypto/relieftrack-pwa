"""
ea_template.py — Template-based extractor for LHDN BORANG EA (annual income statement).

LHDN EA Form is the Malaysian Employer's Return of Remuneration, used to declare
annual income for tax purposes. Key fields:

  - Employer name (Name of Employer)
  - Employee name (Name of Employee)
  - Employee NRIC (12-digit, format YYMMDD-PB-###G or 12 raw digits)
  - Year of Assessment (e.g., 2025)
  - B1: Gross Income (Pendapatan Kasar)
  - B2: Total Allowances
  - B3: Total Deductions (EPF, SOCSO, EIS, PCB)
  - B4: Net Income (Pendapatan Bersih)
  - B5: Statutory Income
  - PCB / MTD: Monthly Tax Deductions

This module uses regex templates tuned for OCR-varied EA forms.
"""
import re
from typing import Optional


def is_ea_form(text: str) -> bool:
    """Detect if text is from an LHDN EA Form."""
    upper = text.upper()
    triggers = ["BORANG EA", "PENYATA SARAAN", "EA FORM",
                "PENDAPATAN DARI PENGGAJIAN", "EMPLOYER'S RETURN",
                "PENDAPATAN KASAR", "GAJI"]
    # Need at least 2 of these triggers (avoid false positives)
    hits = sum(1 for t in triggers if t in upper)
    return hits >= 2


def extract_field(pattern: str, text: str, group: int = 1) -> Optional[str]:
    """Helper to extract a field using a regex pattern."""
    m = re.search(pattern, text, re.I)
    if m and m.lastindex and m.lastindex >= group:
        return m.group(group).strip()
    return None


def extract_ea_form(text: str) -> dict:
    """Extract structured data from EA Form text.

    Returns dict matching standard OCR result schema + employee_ic, year_of_assessment.
    """
    result = {
        "vendor": None,           # employer name
        "recipient": None,        # employee name
        "employee_ic": None,
        "year_of_assessment": None,
        "date": None,             # derived from YoA (Dec 31 of YoA)
        "time": None,
        "amount": None,           # B1 gross income (primary field)
        "tax_amount": None,       # Total PCB/MTD for the year
        "tax_type": "PCB",
        "currency": "MYR",
        "category": None,
        "invoice_number": None,   # No invoice on EA form
        "tin": None,
        "sst_registration_no": None,
        "document_type": "ea_form",
        "extraction_method": "template_ea",
    }

    # Employer name
    employer = extract_field(
        r'(?:Name\s*of\s*Employer|Nama\s*Majikan|Majikan)\s*[:\-]?\s*([^\n\r]{3,80})',
        text
    )
    if employer:
        # Trim registration numbers and addresses
        employer = re.sub(r'\s*\d{6,}.*$', '', employer).strip()
        result["vendor"] = employer[:80]

    # Employee name
    employee = extract_field(
        r'(?:Name\s*of\s*Employee|Nama\s*Pekerja|Pekerja)\s*[:\-]?\s*([^\n\r]{3,80})',
        text
    )
    if employee:
        employee = re.sub(r'\s*\d{6,}.*$', '', employee).strip()
        result["recipient"] = employee[:80]

    # Employee NRIC (Malaysian format: 12 digits, may have dashes)
    nric = extract_field(r'(\d{6}-?\d{2}-?\d{4})', text)
    if nric:
        result["employee_ic"] = nric

    # Year of Assessment
    yoa = extract_field(r'(?:Year\s*of\s*Assessment|Tahun\s*Taksiran)\s*[:\-]?\s*(\d{4})', text)
    if yoa:
        result["year_of_assessment"] = yoa
        # Set date to Dec 31 of YoA (last day of assessment year)
        result["date"] = f"{yoa}-12-31"

    # B1: Gross Income (Pendapatan Kasar)
    b1 = extract_field(
        r'(?:B1|Gross\s*Income|Pendapatan\s*Kasar|Jumlah\s*Pendapatan)\s*[:\-]?\s*([\d,]+\.\d{2})',
        text
    )
    if b1:
        result["amount"] = float(b1.replace(',', ''))

    # Total PCB / MTD (income tax deducted)
    # Try multiple PCB patterns (sometimes labeled differently on form variants)
    pcb = None
    for pat in [
        r'(?:Potongan\s*Cukai\s*Bulanan|PCB\s*MTD|Total\s*PCB|MTD\s*PCB)\s*[:\-]?\s*([\d,]+\.\d{2})',
        r'(?:PCB|MTD|Cukai\s*Bulanan)\s*[:\-]?\s*([\d,]+\.\d{2})',
    ]:
        pcb = extract_field(pat, text)
        if pcb:
            break
    if pcb:
        result["tax_amount"] = float(pcb.replace(',', ''))

    # TIN (13 digits, often labeled)
    tin = extract_field(
        r'(?:TIN|No\.\s*Cukai\s*Pendapatan|Tax\s*ID)\s*[:\-]?\s*(\d{12,13})',
        text
    )
    if tin:
        result["tin"] = tin[:13]

    return result
