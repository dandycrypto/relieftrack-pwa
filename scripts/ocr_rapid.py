#!/usr/bin/env python3
"""
ReliefTrack MY — Server-side OCR via RapidOCR (PP-OCRv4 ONNX).
Usage: python3 scripts/ocr_rapid.py <image_path> [--no-preprocess]

Output (stdout): JSON
{
  "rawText": "string",          # newline-joined recognized lines
  "confidence": 0.0-1.0,        # mean of per-line confidence
  "lines": [                    # ordered top-to-bottom
    {"text": "...", "confidence": 0.0-1.0, "bbox": [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]}
  ],
  "preprocessed": true/false,
  "elapsed_ms": 123
}

Preprocessing pipeline (OpenCV):
  1. Load image (auto-rotate via EXIF)
  2. Detect document boundary (largest 4-point contour)
  3. Perspective-correct to rectangle
  4. Deskew (rotation correction via minAreaRect on text mask)
  5. Denoise (fastNlMeansDenoisingColored)
  6. Adaptive threshold for cleaner OCR

Designed for: phone photos of Malaysian receipts (thermal, faded, skewed, low-DPI).
"""
import sys
import os
import json
import time
import argparse
import warnings
warnings.filterwarnings('ignore')

# Suppress RapidOCR verbose logs
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
import logging
logging.getLogger('rapidocr').setLevel(logging.ERROR)
logging.getLogger('rapidocr_onnxruntime').setLevel(logging.ERROR)


def load_image(path: str):
    """Load image with EXIF rotation applied."""
    from PIL import Image, ImageOps
    import numpy as np
    img = Image.open(path)
    img = ImageOps.exif_transpose(img)  # honor EXIF orientation
    return np.array(img.convert('RGB'))


def order_points(pts):
    """Order 4 points as: top-left, top-right, bottom-right, bottom-left."""
    rect = np.zeros((4, 2), dtype="float32")
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]
    rect[2] = pts[np.argmax(s)]
    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)]
    rect[3] = pts[np.argmax(diff)]
    return rect


def find_document_corners(img):
    """Find receipt/document boundary via largest 4-point contour.
    Returns None if no clean rectangle found (image is already cropped)."""
    import cv2
    import numpy as np
    h, w = img.shape[:2]

    # Downscale for speed
    scale = 600.0 / max(h, w) if max(h, w) > 600 else 1.0
    if scale < 1.0:
        small = cv2.resize(img, (int(w * scale), int(h * scale)))
    else:
        small = img.copy()

    gray = cv2.cvtColor(small, cv2.COLOR_RGB2GRAY) if len(small.shape) == 3 else small
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edged = cv2.Canny(blurred, 50, 150)
    edged = cv2.dilate(edged, np.ones((3, 3), np.uint8), iterations=1)

    contours, _ = cv2.findContours(edged, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contours = sorted(contours, key=cv2.contourArea, reverse=True)[:5]

    for c in contours:
        peri = cv2.arcLength(c, True)
        approx = cv2.approxPolyDP(c, 0.02 * peri, True)
        if len(approx) == 4:
            pts = approx.reshape(4, 2) / scale
            return order_points(pts.astype("float32"))

    return None


def perspective_correct(img, corners):
    """Apply 4-point perspective transform to flatten receipt to rectangle."""
    import cv2
    import numpy as np
    (tl, tr, br, bl) = corners

    width_a = np.linalg.norm(br - bl)
    width_b = np.linalg.norm(tr - tl)
    height_a = np.linalg.norm(tr - br)
    height_b = np.linalg.norm(tl - bl)

    max_w = int(max(width_a, width_b))
    max_h = int(max(height_a, height_b))

    if max_w < 50 or max_h < 50:
        return img

    dst = np.array([
        [0, 0],
        [max_w - 1, 0],
        [max_w - 1, max_h - 1],
        [0, max_h - 1]
    ], dtype="float32")

    M = cv2.getPerspectiveTransform(corners, dst)
    return cv2.warpPerspective(img, M, (max_w, max_h))


def deskew(img):
    """Correct rotation by detecting text angle via minAreaRect on edges."""
    import cv2
    import numpy as np
    gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY) if len(img.shape) == 3 else img
    gray = cv2.bitwise_not(gray)
    thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)[1]

    coords = np.column_stack(np.where(thresh > 0))
    if len(coords) < 100:
        return img

    angle = cv2.minAreaRect(coords)[-1]
    if angle < -45:
        angle = -(90 + angle)
    else:
        angle = -angle

    # Only correct if skew is significant (avoid noise on already-straight images)
    if abs(angle) < 0.3:
        return img

    h, w = img.shape[:2]
    center = (w // 2, h // 2)
    M = cv2.getRotationMatrix2D(center, angle, 1.0)
    return cv2.warpAffine(
        img, M, (w, h),
        flags=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_REPLICATE
    )


def denoise(img):
    """Light denoise preserving text edges."""
    import cv2
    if len(img.shape) == 3:
        return cv2.fastNlMeansDenoisingColored(img, None, 4, 4, 7, 21)
    return cv2.fastNlMeansDenoising(img, None, 4, 7, 21)


def preprocess_image(img):
    """Full preprocessing pipeline: detect → perspective → deskew → denoise."""
    import cv2
    import numpy as np
    t0 = time.time()

    # Step 1: detect & perspective-correct receipt boundary
    corners = find_document_corners(img)
    if corners is not None:
        img = perspective_correct(img, corners)

    # Step 2: deskew
    img = deskew(img)

    # Step 3: denoise (light)
    img = denoise(img)

    # Skip adaptive threshold — RapidOCR handles grayscale fine and binarize can hurt colored logos

    elapsed = (time.time() - t0) * 1000
    return img, elapsed


def run_ocr(image_path: str, use_preprocess: bool = True) -> dict:
    """Run RapidOCR on image with optional preprocessing. Returns structured result."""
    import numpy as np
    t_start = time.time()

    # Load
    img = load_image(image_path)

    preprocess_ms = 0
    if use_preprocess:
        try:
            img, preprocess_ms = preprocess_image(img)
            preprocessed = True
        except Exception as e:
            # If preprocess fails, fall back to raw image (don't lose OCR)
            sys.stderr.write(f"[WARN] preprocess failed: {e}, falling back to raw image\n")
            img = load_image(image_path)
            preprocessed = False
    else:
        preprocessed = False

    # Run RapidOCR
    from rapidocr import RapidOCR
    engine = RapidOCR()
    t_ocr = time.time()
    result = engine(img)
    t_ocr_end = time.time()

    # Parse result
    # RapidOCROutput: .txts (list of strings), .scores (list of floats), .boxes (list of 4-point arrays)
    if result is None:
        return {
            "rawText": "",
            "confidence": 0.0,
            "lines": [],
            "preprocessed": preprocessed,
            "elapsed_ms": int((time.time() - t_start) * 1000),
        }

    # Handle both list and RapidOCROutput
    _txts = getattr(result, 'txts', None)
    _scores = getattr(result, 'scores', None)
    _boxes = getattr(result, 'boxes', None)
    if _txts is None:
        _txts = result[0] if isinstance(result, (list, tuple)) else []
    if _scores is None:
        _scores = result[1] if isinstance(result, (list, tuple)) and len(result) > 1 else []
    if _boxes is None:
        _boxes = result[2] if isinstance(result, (list, tuple)) and len(result) > 2 else []
    txts, scores, boxes = _txts, _scores, _boxes

    lines = []
    raw_lines = []
    for i, txt in enumerate(txts):
        if not txt or not txt.strip():
            continue
        conf = float(scores[i]) if i < len(scores) else 0.0
        bbox = boxes[i].tolist() if (i < len(boxes) and hasattr(boxes[i], 'tolist')) else []
        y_min = min(p[1] for p in bbox) if bbox else 0
        y_max = max(p[1] for p in bbox) if bbox else 0
        lines.append({
            "text": txt.strip(),
            "confidence": round(conf, 4),
            "bbox": bbox,
            "_y_min": y_min,
            "_y_max": y_max,
            "_y_mid": (y_min + y_max) / 2.0,
        })
        raw_lines.append(txt.strip())

    # Sort by y-coordinate (top to bottom)
    lines.sort(key=lambda l: l['_y_min'])

    # Group adjacent lines whose y-centers are within ~50% of average text height
    # This merges "ITEM NAME  RM 8.50" patterns that OCR split across x
    avg_h = sum(l['_y_max'] - l['_y_min'] for l in lines) / max(len(lines), 1)
    tolerance = max(avg_h * 0.6, 8)  # merge if within 60% of text height

    grouped = []
    current_group = []
    last_y_mid = None
    for l in lines:
        if last_y_mid is None or abs(l['_y_mid'] - last_y_mid) <= tolerance:
            current_group.append(l)
            last_y_mid = l['_y_mid'] if last_y_mid is None else (last_y_mid + l['_y_mid']) / 2.0
        else:
            grouped.append(current_group)
            current_group = [l]
            last_y_mid = l['_y_mid']
    if current_group:
        grouped.append(current_group)

    # Within a group, sort left-to-right by bbox x, then concatenate with spaces
    raw_lines = []
    for grp in grouped:
        grp_sorted = sorted(grp, key=lambda l: min(p[0] for p in l['bbox']) if l['bbox'] else 0)
        # Drop the internal _y fields before returning
        for l in grp_sorted:
            l.pop('_y_min', None)
            l.pop('_y_max', None)
            l.pop('_y_mid', None)
        raw_lines.append(" ".join(l['text'] for l in grp_sorted))

    mean_conf = sum(l['confidence'] for l in lines) / max(len(lines), 1)

    return {
        "rawText": "\n".join(raw_lines),
        "confidence": round(mean_conf, 4),
        "lines": lines,
        "preprocessed": preprocessed,
        "preprocess_ms": int(preprocess_ms),
        "ocr_ms": int((t_ocr_end - t_ocr) * 1000),
        "elapsed_ms": int((time.time() - t_start) * 1000),
    }


def main():
    parser = argparse.ArgumentParser(description="RapidOCR server-side OCR with preprocessing")
    parser.add_argument("image_path", help="Path to image file (JPG, PNG, WebP)")
    parser.add_argument("--no-preprocess", action="store_true",
                        help="Skip preprocessing pipeline (raw OCR)")
    parser.add_argument("--pretty", action="store_true",
                        help="Pretty-print JSON output")
    args = parser.parse_args()

    if not os.path.exists(args.image_path):
        print(json.dumps({"error": f"File not found: {args.image_path}"}), file=sys.stderr)
        sys.exit(1)

    try:
        result = run_ocr(args.image_path, use_preprocess=not args.no_preprocess)
        indent = 2 if args.pretty else None
        print(json.dumps(result, indent=indent, ensure_ascii=False))
        sys.exit(0)
    except Exception as e:
        import traceback
        print(json.dumps({
            "error": str(e),
            "type": type(e).__name__,
            "traceback": traceback.format_exc(),
        }), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    import numpy as np  # ensure available
    main()