/**
 * lib/ocr.ts — Thin client for the ReliefTrack FastAPI OCR microservice.
 *
 * Calls app/api/ocr (Next.js route) which proxies to the Python FastAPI service
 * on port 8001. Python is the source of truth; no client-side parsing here.
 *
 * Returns the structured OcrResult matching the Python contract.
 */

import type { OcrResult } from '@/types/ocr'

// Re-export the type so callers don't need a separate import
export type { OcrResult } from '@/types/ocr'
export { mapConfidenceToLevel } from '@/types/ocr'
export type { OcrConfidenceLevel } from '@/types/ocr'

// ─── Errors ──────────────────────────────────────────────────────────────────

export class OcrClientError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean = false,
    public readonly statusCode?: number
  ) {
    super(message)
    this.name = 'OcrClientError'
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** True if the extraction needs human review before accepting. */
export function needsReview(result: OcrResult): boolean {
  return result.needs_review
}

// ─── Core OCR ─────────────────────────────────────────────────────────────────

const OCR_TIMEOUT_MS = 15_000

/**
 * Perform OCR on a file by posting to the Next.js /api/ocr route.
 * The route proxies to the Python FastAPI microservice (port 8001).
 *
 * @throws OcrClientError on network failure or HTTP error (retryable=true on 5xx)
 * @throws Error on timeout (15s), bad response, or unexpected failure
 */
export async function performOCR(
  file: File,
  onProgress?: (pct: number) => void
): Promise<OcrResult> {
  if (onProgress) onProgress(10)

  const formData = new FormData()
  formData.append('file', file)

  if (onProgress) onProgress(30)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), OCR_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch('/api/ocr', {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timeout)
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`OCR request timed out after ${OCR_TIMEOUT_MS / 1000}s`)
    }
    throw err
  } finally {
    clearTimeout(timeout)
  }

  if (onProgress) onProgress(80)

  if (!response.ok) {
    let errorMessage = `OCR request failed: HTTP ${response.status}`
    let retryable = response.status >= 500

    try {
      const body = await response.json()
      if (body?.error) errorMessage = String(body.error)
    } catch {
      // ignore parse error
    }

    throw new OcrClientError(errorMessage, retryable, response.status)
  }

  let data: Record<string, unknown>
  try {
    data = await response.json()
  } catch {
    throw new Error('OCR response was not valid JSON')
  }

  if (onProgress) onProgress(100)

  // Map the API response (which may contain legacy aliases) to the strict OcrResult shape.
  // Python FastAPI adds legacy aliases: vendor→merchant, invoice_number→invoiceNumber,
  // tax_amount→taxAmount, category→suggestedCategory.
  // We normalize everything to the snake_case Python contract names.
  const result: OcrResult = {
    // vendor: prefer the snake_case field from Python; fall back to legacy alias
    vendor: (data.vendor as string | null) ?? (data.merchant as string | null) ?? null,
    date: (data.date as string | null) ?? null,
    time: (data.time as string | null) ?? null,
    amount: toNumber(data.amount ?? data.amount ?? null),
    tax_amount: toNumber(data.tax_amount ?? data.taxAmount ?? null),
    tax_type: toTaxType(data.tax_type ?? data.taxType ?? null),
    currency: 'MYR',
    category: (data.category as string | null) ?? (data.suggestedCategory as string | null) ?? null,
    invoice_number: (data.invoice_number as string | null) ?? (data.invoiceNumber as string | null) ?? null,
    tin: (data.tin as string | null) ?? null,
    sst_registration_no:
      (data.sst_registration_no as string | null) ??
      (data.sstRegistrationNo as string | null) ??
      null,
    raw_text: (data.raw_text as string | null) ?? (data.rawText as string | null) ?? '',
    confidence: toNumber(data.confidence ?? 0) ?? 0,
    extraction_method:
      (data.extraction_method as OcrResult['extraction_method']) ??
      (data.extractionMethod as OcrResult['extraction_method']) ??
      null,
    needs_review: Boolean(data.needs_review ?? false),
    document_type: (data.document_type as OcrResult['document_type']) ??
      (data.documentType as OcrResult['document_type']) ??
      'unknown',
  }

  return result
}

// ─── Type coercions ──────────────────────────────────────────────────────────

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return isNaN(n) ? null : n
}

function toTaxType(v: unknown): OcrResult['tax_type'] {
  if (v === 'SST' || v === 'GST' || v === 'SERVICE_CHARGE') return v
  return null
}
