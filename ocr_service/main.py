"""
main.py — FastAPI microservice for ReliefTrack OCR v2.

Endpoint:
  POST /ocr  →  Accept image or PDF, return structured JSON

Pipeline:
  1. Detect input type (image vs PDF)
  2. For PDFs: try pdfplumber text layer, fallback to OCR on rendered image
  3. For images: preprocess (CLAHE + denoise + perspective + deskew)
  4. OCR (RapidOCR PP-OCRv4 — swap to PP-OCRv5 multilingual when available)
  5. Tag layout zones (header/items/totals/footer)
  6. Detect document type (receipt/invoice/ea_form)
  7. Run extraction (Strategy A rules + Strategy B LLM fallback)
  8. Score confidence → set needs_review flag
  9. Return final JSON
"""
import io
import logging
import os
import time
import warnings

warnings.filterwarnings('ignore')
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from .preprocessor import load_image_bytes, preprocess_image
from .ocr_engine import run_ocr, tag_zones
from .extractor import extract_all
from .confidence import confidence_score, needs_review, confidence_band
from .ea_template import is_ea_form, extract_ea_form
from .pdf_handler import process_pdf
from .llm_extractor import llm_extract

# ─── App ───────────────────────────────────────────────────────────────────

app = FastAPI(title="ReliefTrack OCR", version="2.0.0")
logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("relieftrack-ocr")


# ─── Routes ────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"service": "relieftrack-ocr", "version": "2.0.0", "status": "ok"}


@app.get("/health")
def health():
    from .ocr_engine import get_engine
    try:
        get_engine()
        return {"status": "ok", "ocr_engine": "rapidocr-pp-ocrv4"}
    except Exception as e:
        return {"status": "degraded", "error": str(e)}


@app.post("/ocr")
async def ocr_endpoint(file: UploadFile = File(...)):
    """Main OCR endpoint. Accepts image or PDF."""
    t0 = time.time()
    try:
        content = await file.read()
        if not content:
            raise HTTPException(400, "Empty file")

        filename = (file.filename or "").lower()
        is_pdf = filename.endswith(".pdf") or content[:4] == b"%PDF"

        # ── Step 1: Document router
        if is_pdf:
            pdf_result = process_pdf(content)
            if pdf_result["method"] == "error":
                raise HTTPException(400, "PDF could not be processed")
            if pdf_result["method"] == "pdfplumber":
                text = pdf_result["raw_text"]
                lines = pdf_result["lines"]
                extraction_method = "pdfplumber"
                image_height = max(
                    (l["bbox"][3] for l in lines if l.get("bbox") and len(l["bbox"][0]) > 1),
                    default=1000
                )
            else:  # "ocr" — need to run OCR on rendered image
                img = pdf_result["image"]
                pp, _ = preprocess_image(img)
                ocr_result = run_ocr(pp)
                text = ocr_result["raw_text"]
                lines = ocr_result["lines"]
                tag_zones(lines, pp.shape[0])
                extraction_method = "paddleocr_rule"
                image_height = pp.shape[0]
        else:
            # ── Step 2: Image preprocessing
            img = load_image_bytes(content)
            pp, stats = preprocess_image(img)
            # ── Step 3: OCR
            ocr_result = run_ocr(pp)
            text = ocr_result["raw_text"]
            lines = ocr_result["lines"]
            tag_zones(lines, pp.shape[0])
            extraction_method = "paddleocr_rule"
            image_height = pp.shape[0]

        if not text.strip():
            raise HTTPException(400, "No text extracted")

        # ── Step 4: EA form template detection
        if is_ea_form(text):
            ea_data = extract_ea_form(text)
            ea_data["raw_text"] = text
            ea_data["confidence"] = 0.85  # template match = high confidence
            ea_data["extraction_method"] = "template_ea"
            ea_data["needs_review"] = True
            ea_data["elapsed_ms"] = int((time.time() - t0) * 1000)
            return JSONResponse(_add_legacy_aliases(ea_data))

        # ── Step 5: Strategy A (rule-based extraction)
        a_result = extract_all(text, lines)
        a_result["raw_text"] = text

        # ── Step 6: Compute confidence
        conf = confidence_score(
            amount=a_result["amount"],
            vendor=a_result["vendor"],
            date=a_result["date"],
            doc_type=a_result["document_type"],
            math_check_passed=a_result["math_check_passed"],
            used_llm=False,
        )

        # ── Step 7: Strategy B (LLM fallback if confidence low)
        used_llm = False
        if conf < 0.65 or a_result["amount"] is None:
            logger.info(f"Strategy A confidence {conf} < 0.65, trying LLM fallback")
            llm_data, llm_provider = llm_extract(text)
            if llm_data:
                used_llm = True
                logger.info(f"LLM ({llm_provider}) returned data, merging with Strategy A")
                # Merge: Strategy A wins for present fields, LLM fills missing
                for key in ["vendor", "date", "time", "amount", "tax_amount",
                            "tax_type", "category", "invoice_number", "tin",
                            "sst_registration_no"]:
                    if a_result.get(key) is None and llm_data.get(key) is not None:
                        a_result[key] = llm_data[key]
                # Recompute confidence with LLM penalty
                conf = confidence_score(
                    amount=a_result["amount"],
                    vendor=a_result["vendor"],
                    date=a_result["date"],
                    doc_type=a_result["document_type"],
                    math_check_passed=a_result["math_check_passed"],
                    used_llm=True,
                )

        # ── Step 8: Finalize response
        a_result["confidence"] = conf
        a_result["extraction_method"] = "paddleocr_llm" if used_llm else extraction_method
        a_result["needs_review"] = needs_review(
            conf, a_result["amount"], a_result["math_check_passed"],
            used_llm=used_llm,
        )
        a_result["confidence_band"] = confidence_band(conf)
        a_result["elapsed_ms"] = int((time.time() - t0) * 1000)

        return JSONResponse(_add_legacy_aliases(a_result))

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"OCR endpoint failed: {e}")
        raise HTTPException(500, f"OCR processing failed: {str(e)}")


def _add_legacy_aliases(result: dict) -> dict:
    """Add legacy field aliases so old Next.js dashboard doesn't break.

    New schema → Legacy aliases:
      vendor → merchant
      invoice_number → invoiceNumber
      tax_amount → taxAmount
      category → suggestedCategory
    """
    if "vendor" in result and result["vendor"] is not None:
        result["merchant"] = result["vendor"]
    if "invoice_number" in result and result["invoice_number"] is not None:
        result["invoiceNumber"] = result["invoice_number"]
    if "tax_amount" in result and result["tax_amount"] is not None:
        result["taxAmount"] = result["tax_amount"]
    if "category" in result and result["category"] is not None:
        result["suggestedCategory"] = result["category"]
    return result


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8001, log_level="info")
