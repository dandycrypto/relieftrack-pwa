"""
preprocessor.py — Image preprocessing pipeline for receipt OCR.

Pipeline (6 steps):
  1. Detect document boundary (largest 4-point contour)
  2. Perspective-correct to rectangle (with sanity guards)
  3. Deskew (minAreaRect on text mask)
  4. Denoise (fastNlMeansDenoisingColored)
  5. CLAHE on L-channel of LAB (clip 2.0, tile 8×8) — helps faded thermal
  6. Border cleanup (remove thin black borders that confuse OCR)

Designed for: phone photos of Malaysian receipts (thermal, faded, skewed, low-DPI).
"""
from __future__ import annotations
import os
import io
import warnings
from typing import Optional, Tuple
import numpy as np
from PIL import Image, ImageOps

warnings.filterwarnings('ignore')
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'

import cv2


# ─── I/O helpers ───────────────────────────────────────────────────────────

def load_image(path: str) -> np.ndarray:
    """Load image file with EXIF rotation."""
    img = Image.open(path)
    img = ImageOps.exif_transpose(img)
    return np.array(img.convert('RGB'))


def load_image_bytes(b: bytes) -> np.ndarray:
    """Load image from bytes with EXIF rotation."""
    img = Image.open(io.BytesIO(b))
    img = ImageOps.exif_transpose(img)
    return np.array(img.convert('RGB'))


# ─── Geometry helpers ──────────────────────────────────────────────────────

def order_points(pts: np.ndarray) -> np.ndarray:
    """Order 4 points as TL, TR, BR, BL."""
    rect = np.zeros((4, 2), dtype="float32")
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]    # TL (smallest x+y)
    rect[2] = pts[np.argmax(s)]    # BR (largest x+y)
    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)] # TR (smallest x-y → high y, low x)
    rect[3] = pts[np.argmax(diff)] # BL (largest x-y → low y, high x)
    return rect


def find_document_corners(img: np.ndarray) -> Optional[np.ndarray]:
    """Find the 4 corners of the largest rectangular contour in the image.

    Returns None if no suitable 4-point contour is found.
    Filters: contour area must be ≥ 30% of image area (skip interior features).
    """
    try:
        h, w = img.shape[:2]
        # Scale down for speed (preserve aspect ratio)
        max_dim = max(w, h)
        scale = 800.0 / max_dim if max_dim > 800 else 1.0
        new_w, new_h = int(w * scale), int(h * scale)
        small = cv2.resize(img, (new_w, new_h))
        gray = cv2.cvtColor(small, cv2.COLOR_RGB2GRAY)
        gray = cv2.GaussianBlur(gray, (5, 5), 0)
        edges = cv2.Canny(gray, 75, 200)
        edges = cv2.dilate(edges, np.ones((3, 3), np.uint8), iterations=1)
        cnts, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not cnts:
            return None
        cnts = sorted(cnts, key=cv2.contourArea, reverse=True)[:10]
        small_area = new_w * new_h
        for c in cnts:
            # Skip contours that are too small (< 30% of image)
            if cv2.contourArea(c) < small_area * 0.30:
                continue
            peri = cv2.arcLength(c, True)
            approx = cv2.approxPolyDP(c, 0.02 * peri, True)
            if len(approx) == 4:
                # Rescale back to original coords
                pts = (approx.reshape(4, 2) / scale).astype("float32")
                # Final sanity: must be within image bounds
                if (pts[:, 0].min() >= -10 and pts[:, 0].max() <= w + 10 and
                    pts[:, 1].min() >= -10 and pts[:, 1].max() <= h + 10):
                    return pts
        return None
    except Exception:
        return None


def perspective_correct(img: np.ndarray, corners: np.ndarray) -> np.ndarray:
    """Apply 4-point perspective transform with strict sanity guards.

    Returns the original image unchanged if the corners would produce a
    suspiciously small, oddly-shaped, or out-of-bounds output.
    """
    rect = order_points(corners)
    (tl, tr, br, bl) = rect
    wA = np.linalg.norm(br - bl)
    wB = np.linalg.norm(tr - tl)
    hA = np.linalg.norm(tr - br)
    hB = np.linalg.norm(tl - bl)
    maxW = int(max(wA, wB))
    maxH = int(max(hA, hB))

    orig_h, orig_w = img.shape[:2]

    # Guard 1: minimum absolute size
    if maxW < 100 or maxH < 100:
        return img

    # Guard 2: must be ≥ 50% of original in both dims (else corners are wrong)
    if maxW < orig_w * 0.5 or maxH < orig_h * 0.5:
        return img

    # Guard 3: aspect ratio sanity (receipts are usually portrait, 0.3 to 8.0)
    aspect = maxH / maxW if maxW > 0 else 0
    if aspect < 0.3 or aspect > 8.0:
        return img

    dst = np.array([[0, 0], [maxW - 1, 0], [maxW - 1, maxH - 1], [0, maxH - 1]],
                   dtype="float32")
    M = cv2.getPerspectiveTransform(rect, dst)
    return cv2.warpPerspective(img, M, (maxW, maxH))


# ─── Enhancement steps ─────────────────────────────────────────────────────

def deskew(img: np.ndarray) -> np.ndarray:
    """Correct small rotation via minAreaRect on text mask."""
    try:
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
        # Only correct if skew is significant (avoid noise on straight images)
        if abs(angle) < 0.3:
            return img
        h, w = img.shape[:2]
        center = (w // 2, h // 2)
        M = cv2.getRotationMatrix2D(center, angle, 1.0)
        return cv2.warpAffine(img, M, (w, h), flags=cv2.INTER_CUBIC,
                              borderMode=cv2.BORDER_REPLICATE)
    except Exception:
        return img


def denoise(img: np.ndarray) -> np.ndarray:
    """Color-preserving denoise (fastNlMeansDenoisingColored, conservative)."""
    try:
        return cv2.fastNlMeansDenoisingColored(img, None, 10, 10, 7, 21)
    except Exception:
        return img


def clahe_contrast(img: np.ndarray) -> np.ndarray:
    """CLAHE on L-channel of LAB colorspace.

    Clip Limit 2.0, tile 8×8. Specifically helps faded thermal receipts where
    contrast is low and text is barely visible.
    """
    try:
        lab = cv2.cvtColor(img, cv2.COLOR_RGB2LAB)
        l, a, b = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        l = clahe.apply(l)
        return cv2.cvtColor(cv2.merge([l, a, b]), cv2.COLOR_LAB2RGB)
    except Exception:
        return img


def border_cleanup(img: np.ndarray, border_pixels: int = 2) -> np.ndarray:
    """Remove thin black borders from deskew/perspective that confuse OCR."""
    try:
        h, w = img.shape[:2]
        if h < 20 or w < 20:
            return img
        # Set border pixels to white
        cleaned = img.copy()
        cleaned[:border_pixels, :] = 255
        cleaned[-border_pixels:, :] = 255
        cleaned[:, :border_pixels] = 255
        cleaned[:, -border_pixels:] = 255
        return cleaned
    except Exception:
        return img


# ─── Main pipeline ─────────────────────────────────────────────────────────

def preprocess_image(img: np.ndarray) -> Tuple[np.ndarray, dict]:
    """Run full 6-step preprocessing pipeline.

    Returns:
        (preprocessed_image, stats_dict)
    """
    stats = {
        "perspective_applied": False,
        "deskew_applied": False,
        "denoise_applied": False,
        "clahe_applied": True,  # always
        "border_cleanup_applied": True,  # always
        "input_shape": img.shape[:2],
        "output_shape": None,
    }

    try:
        # Step 1+2: detect & perspective-correct
        corners = find_document_corners(img)
        if corners is not None:
            try:
                corrected = perspective_correct(img, corners)
                # Verify the result is actually different from input
                if corrected.shape != img.shape or corrected is not img:
                    img = corrected
                    stats["perspective_applied"] = True
            except Exception:
                pass

        # Step 3: deskew
        deskewed = deskew(img)
        if deskewed is not img:
            stats["deskew_applied"] = True
        img = deskewed

        # Step 4: denoise
        denoised = denoise(img)
        if denoised is not img:
            stats["denoise_applied"] = True
        img = denoised

        # Step 5: CLAHE contrast enhancement (NEW for v2 — helps faded thermal)
        img = clahe_contrast(img)

        # Step 6: border cleanup
        img = border_cleanup(img)

    except Exception:
        # If anything fails catastrophically, return original
        pass

    stats["output_shape"] = img.shape[:2]
    return img, stats
