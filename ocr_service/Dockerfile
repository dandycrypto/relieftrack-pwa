# ReliefTrack OCR microservice — FastAPI + RapidOCR
#
# Build (from the repo root, so requirements.txt and ocr_service/ are both in
# the build context):
#   docker build -f ocr_service/Dockerfile -t relieftrack-ocr .
# Run:
#   docker run -p 8001:8001 relieftrack-ocr
#
# The Next.js app talks to this service over HTTP via OCR_SERVICE_URL
# (see app/api/ocr/route.ts), so it can be deployed and scaled independently
# of the Next.js app.

FROM python:3.11-slim

# poppler-utils: required by pdf2image (scanned-PDF-to-image fallback).
# libgl1/libglib2.0-0: runtime shared libs some opencv-python-headless
# builds still dlopen even though they don't need a display.
RUN apt-get update && apt-get install -y --no-install-recommends \
    poppler-utils \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY ocr_service/ ./ocr_service/

EXPOSE 8001

# Pre-download/cache OCR models at build time so the first real request
# isn't slowed down by a model download.
RUN python -c "from ocr_service.ocr_engine import get_engine; get_engine()"

CMD ["uvicorn", "ocr_service.main:app", "--host", "0.0.0.0", "--port", "8001"]
