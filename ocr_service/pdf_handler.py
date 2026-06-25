"""
pdf_handler.py — PDF text extraction with OCR fallback.

Strategy:
  1. Try pdfplumber text-layer extraction (digital PDFs)
  2. If text found → return text + synthetic lines
  3. If no text or insufficient text → render first page as image (pdf2image, 200 DPI)
  4. Return None if both fail
"""
import io
import logging
from typing import Optional
import numpy as np

logger = logging.getLogger("relieftrack-ocr")


def extract_pdf_text(content: bytes) -> tuple[str, list]:
    """Try to extract text from PDF bytes using pdfplumber.

    Returns: (raw_text, lines_with_synthetic_bboxes)
    Returns: ("", []) if extraction fails or text insufficient.
    """
    try:
        import pdfplumber
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            all_text = []
            all_lines = []
            for page_num, page in enumerate(pdf.pages):
                page_text = page.extract_text() or ""
                all_text.append(page_text)
                # Create synthetic lines from text (no real bboxes from pdfplumber)
                y_offset = page_num * 1000
                for i, line in enumerate(page_text.split("\n")):
                    if line.strip():
                        all_lines.append({
                            "text": line,
                            "confidence": 0.99,  # digital text = high conf
                            "bbox": [[0, y_offset + i*20, 200, y_offset + (i+1)*20]],
                            "page": page_num,
                            "zone": "items",  # default
                        })
            text = "\n".join(all_text)
            if len(text.strip()) > 50:
                return text, all_lines
            return "", []
    except Exception as e:
        logger.warning(f"pdfplumber failed: {e}")
        return "", []


def pdf_to_image(content: bytes, dpi: int = 200) -> Optional[np.ndarray]:
    """Render first page of PDF as numpy RGB array.

    Uses pdf2image (poppler) at 200 DPI. Returns None on failure.
    """
    try:
        from pdf2image import convert_from_bytes
        images = convert_from_bytes(content, dpi=dpi, first_page=1, last_page=1)
        if images:
            return np.array(images[0].convert('RGB'))
    except Exception as e:
        logger.warning(f"pdf2image failed: {e}")
    return None


def process_pdf(content: bytes) -> dict:
    """Full PDF handling pipeline.

    Returns dict with keys:
      raw_text: extracted text
      lines: list of {text, confidence, bbox}
      method: "pdfplumber" | "ocr" | "error"
      image: numpy RGB array (only if method=="ocr", for further preprocessing)
    """
    text, lines = extract_pdf_text(content)
    if text and lines:
        return {"raw_text": text, "lines": lines, "method": "pdfplumber", "image": None}

    # Fallback: render as image and OCR
    img = pdf_to_image(content)
    if img is None:
        return {"raw_text": "", "lines": [], "method": "error", "image": None}

    return {"raw_text": "", "lines": [], "method": "ocr", "image": img}
