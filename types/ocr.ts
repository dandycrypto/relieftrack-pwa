/**
 * types/ocr.ts — OcrResult type matching the Python FastAPI microservice contract.
 *
 * Python endpoint: POST /ocr  →  OcrResult JSON
 * All field names match the Python snake_case contract exactly.
 */

export type OcrTaxType = 'SST' | 'GST' | 'SERVICE_CHARGE' | null

export type OcrDocumentType = 'receipt' | 'invoice' | 'ea_form' | 'unknown'

export type OcrExtractionMethod =
  | 'paddleocr_rule'
  | 'paddleocr_llm'
  | 'pdfplumber'
  | 'template_ea'
  | null

/** Official LHDN YA 2025/2026 categories surfaced by the Python extractor */
export type OcrCategory =
  | 'Food'
  | 'Transport'
  | 'Utilities'
  | 'Medical'
  | 'Insurance'
  | 'Education'
  | 'Sports'
  | 'Lifestyle'
  | 'ChildCare'
  | 'BreastfeedingEquipment'
  | 'EV-Charging'
  | 'HousingLoanInterest'
  | string   // allow any string; Python extractor may return unseen categories
  | null

export type OcrConfidenceLevel = 'high' | 'review' | 'low'

/** Matches the JSON returned by ocr_service/main.py */
export interface OcrResult {
  vendor: string | null
  date: string | null          // ISO 8601: YYYY-MM-DD
  time: string | null         // HH:MM
  amount: number | null
  tax_amount: number | null
  tax_type: OcrTaxType
  currency: 'MYR'             // always MYR for this app
  category: OcrCategory
  invoice_number: string | null
  tin: string | null
  sst_registration_no: string | null
  raw_text: string
  confidence: number           // 0.0 – 1.0
  extraction_method: OcrExtractionMethod
  needs_review: boolean
  document_type: OcrDocumentType
}

/**
 * Maps a raw confidence float to a named level.
 * >= 0.85 : high      (green — auto-accept)
 * 0.70–0.84: review   (amber — verify before accept)
 * < 0.70 : low       (red — manual entry required)
 */
export function mapConfidenceToLevel(c: number): OcrConfidenceLevel {
  if (c >= 0.85) return 'high'
  if (c >= 0.70) return 'review'
  return 'low'
}
