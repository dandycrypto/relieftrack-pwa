"""
ocr_engine.py — OCR wrapper around RapidOCR (PP-OCRv4 ONNX).

Single responsibility: take an image array, return raw text + lines + per-line confidence.
Model swap: PP-OCRv5 multilingual models can be plugged in by replacing
~/.local/lib/python3.10/site-packages/rapidocr/models/ files:
  - ch_PP-OCRv4_det_mobile.onnx (keep — detection)
  - ch_PP-OCRv4_rec_mobile.onnx → en_PP-OCRv5_rec_mobile_infer.onnx (multilingual recognition)

For now uses PP-OCRv4 Chinese-English model which handles Latin chars fine.
"""
import os
import warnings
import logging
from typing import Optional
import numpy as np

warnings.filterwarnings('ignore')
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'

logger = logging.getLogger("relieftrack-ocr")

# Lazy singleton
_engine = None


def get_engine():
    """Get or create RapidOCR engine singleton."""
    global _engine
    if _engine is None:
        from rapidocr import RapidOCR
        _engine = RapidOCR()
    return _engine


def run_ocr(image: np.ndarray) -> dict:
    """Run OCR on a preprocessed image.

    Returns:
        {
            raw_text: str,         # newline-joined
            lines: [                # ordered top-to-bottom
                {"text": str, "confidence": float, "bbox": [[x,y], ...]}
            ],
            confidence: float,      # mean of per-line confidence
            ocr_ms: int
        }
    """
    import time
    engine = get_engine()
    t0 = time.time()
    result = engine(image)
    elapsed = time.time() - t0

    if result is None:
        return {"raw_text": "", "lines": [], "confidence": 0.0, "ocr_ms": int(elapsed * 1000)}

    # RapidOCROutput has .txts, .scores, .boxes attributes
    txts = getattr(result, 'txts', None)
    scores = getattr(result, 'scores', None)
    boxes = getattr(result, 'boxes', None)

    if (txts is None or (hasattr(txts, '__len__') and len(txts) == 0)) \
            and isinstance(result, (list, tuple)):
        txts = result[0] if len(result) > 0 else None
        scores = result[1] if len(result) > 1 else None
        boxes = result[2] if len(result) > 2 else None

    # Ensure lists (numpy-safe)
    txts = list(txts) if txts is not None else []
    scores = list(scores) if scores is not None else []
    boxes = list(boxes) if boxes is not None else []

    lines = []
    raw_text_parts = []
    confidences = []
    for i, txt in enumerate(txts):
        if not txt or not txt.strip():
            continue
        conf = float(scores[i]) if i < len(scores) and scores[i] is not None else 0.0
        bbox_raw = boxes[i] if i < len(boxes) else None
        bbox = []
        if bbox_raw is not None:
            try:
                bbox = [[float(x), float(y)] for x, y in bbox_raw]
            except Exception:
                bbox = []
        lines.append({
            "text": txt,
            "confidence": conf,
            "bbox": bbox,
        })
        raw_text_parts.append(txt)
        confidences.append(conf)

    return {
        "raw_text": "\n".join(raw_text_parts),
        "lines": lines,
        "confidence": float(np.mean(confidences)) if confidences else 0.0,
        "ocr_ms": int(elapsed * 1000),
    }


def tag_zones(lines: list, image_height: int) -> list:
    """Tag each line with a layout zone based on y-position.

    Zones:
      header:  0-20% (vendor name, logo, "Invoice")
      items:   20-70% (line items, dates, descriptions)
      totals:  70-90% (subtotal, tax, grand total)
      footer:  90-100% (page numbers, signatures, footers)
    """
    if not lines or image_height <= 0:
        return lines
    for ln in lines:
        if not ln.get("bbox"):
            ln["zone"] = "items"
            continue
        ys = [p[1] for p in ln["bbox"]]
        y_mid = sum(ys) / len(ys)
        rel = y_mid / image_height
        if rel < 0.20:
            ln["zone"] = "header"
        elif rel < 0.70:
            ln["zone"] = "items"
        elif rel < 0.90:
            ln["zone"] = "totals"
        else:
            ln["zone"] = "footer"
    return lines
