/**
 * OCR Module — client entry point for the receipt/EA-form OCR pipeline.
 *
 * The server (`/api/ocr`) does all extraction and returns the structured
 * snake_case `OcrResult` contract defined in `@/types/ocr`. `performOCR` is a
 * thin typed fetch wrapper over that endpoint — the server already runs the
 * parsers, so there is no client-side re-parsing of the OCR response.
 *
 * `parseFromRawText` remains exported as a standalone, unit-tested helper for
 * turning a block of receipt text into structured fields (used by tests and
 * any caller that already holds raw text).
 *
 * Confidence is on a 0–1 scale everywhere (server, `mapConfidenceToLevel`, and
 * the confidence badge). Multiply by 100 only at display time.
 */

import type { OcrResult } from '@/types/ocr'
import {
  parseDate,
  extractAmount,
  detectCurrency,
  detectTaxExempt,
  extractVendor,
  extractInvoiceNumber,
  suggestCategory,
  extractLineItems,
  extractNotes,
  extractTaxAmount,
} from './ocr-parsers'

// Re-export so callers can import the single shared type from either location.
export type { OcrResult } from '@/types/ocr'

/** Extra payload the EA-form path attaches alongside the standard result. */
export interface OcrResponse extends OcrResult {
  eaFormData?: unknown
}

// ─── LHDN Tax Deduction Patterns (from receipt_processor.py) ────────────────
const TAX_DEDUCTION_PATTERNS: [RegExp, string, string][] = [
  // [regex, tax_type, recipient_hint]
  [/parent|mother|father|mum|dad|mama|papa|opah|abah| nenek| undi/i, "Medical-Parents", "parent"],
  [/fertility|ivf|assisted conception/i, "Medical-Fertility", "self/spouse/child"],
  [/cancer|oncolog|kemo| dialysis |hepati|sickness|chemo/i, "Medical-SeriousDisease", "self/spouse/child"],
  [/dental|tooth extraction|orthodonic|periodon|gigi|klinik gigi|dentist/i, "Medical-Dental", "self/spouse/child"],
  [/autism|adhd|hyperactiv|intellectual disability|down syndrome|speech therapy|occupational therapy|early intervention|learning disability|special needs/i, "Medical-ChildDisability", "child"],
  [/health screening|medical checkup|health check|medical exam|blood test|x.ray|ultrasound|ct scan|mri|mammogram|pap smear|colonoscopy|gastroscopy|vaccination|vaksin|vaccine|immunisation|klinik 1 malaysia|kk1m|covid.test|swab test|antigen|mental health/i, "Medical-GeneralCheckup", "self/spouse/child"],
  [/hospital|clinic|medical centre|private hospital|healthcare|specialist|surgery|operation|ward|consultation|panel clinic|klinik/i, "Medical-SelfSpouseChild", "self/spouse/child"],
  [/unifi|maxis|fiber|streamyx|broadband|internet|celcom|digi|yes 4g|tm net|webmail|internet bill/i, "Lifestyle-BroadbandInternet", "self/spouse/child"],
  [/yonex|victor|lining|mizuno|asics|badminton|racket|shuttlecock|grip|tape|sports equipment|sport equipment|gym gear|fitness equipment|cycling|sport shoe|running shoe|sports direct|puma|nike|adidas|new balance|under armour|maju holdings/i, "Lifestyle-SportsEquipment", "self/spouse/child"],
  [/gym membership|fitness membership|celebrity fitness|gold.s gym|anytime fitness|fit zone|gym fee|crossfit|bootcamp|yoga studio|pilates studio|zumba|muay thai|boxing gym|martial arts/i, "Sports-GymMembership", "self/spouse/child"],
  [/badminton court|tennis court|futsal|minisoccer|basketball court|swimming|pool entry|ice skating|climbing wall|sports facility|entry fee|court rental|booking fee|game session|league fee/i, "Sports-FacilityRental", "self/spouse/child"],
  [/marathon|triathlon|cycling event| race |sponsorship|license fee|official fee|competition reg|registration fee|tournament/i, "Sports-CompetitionFee", "self/spouse/child"],
  [/book|jurnal|magazine|newspaper|ebook|ereader|kindle|personal computer|laptop|macbook|iphone|samsung|pixel|oppo|vivo|oneplus|huawei|xiaomi|realme|nokia|tablet|ipad|surface|galaxy tab/i, "Lifestyle-BooksPCPhone", "self/spouse/child"],
  [/udemy|coursera|edx|skillshare|udacity|linkedin learning|professional cert|training|workshop|masterclass|tuition|exam fee|online learning/i, "Lifestyle-SkillsEnhancement", "self"],
  [/insurance premium|medical insurance|life insurance|takaful|prudential|aia|great eastern|axa|tune protect|etiqa|insurance co|insurance policy|family takaful|medical card|hospitalisation/i, "Education-MedicalInsurance", "self/spouse/child"],
  [/childcare|kindergarten|nursery|playgroup|daycare|preschool|early education|tadika|taska/i, "ChildCare", "child"],
  [/breast pump|breastfeeding|nipple shield|lactation|breast pad|feeding bottle|milk storage bag|nursing bra/i, "BreastfeedingEquipment", "self"],
  [/ev charging|electric vehicle charger|tesla supercharger|charging station|food waste composter|composting machine/i, "EV-Charging", "self"],
  [/housing loan|home loan|mortgage|loan interest|property loan|principal housing/i, "HousingLoanInterest", "self"],
]

// ─── Tax Deduction Detection ─────────────────────────────────────────────────

function detectTaxDeduction(text: string, data: { category: string }): { lhdNCategory: string, recipient: string } {
  if (data.category === "Transport") {
    return { lhdNCategory: "", recipient: "" }
  }
  for (const [pattern, taxType, recipientHint] of TAX_DEDUCTION_PATTERNS) {
    if (pattern.test(text)) {
      return { lhdNCategory: taxType, recipient: recipientHint }
    }
  }
  return { lhdNCategory: "", recipient: "" }
}

/**
 * Parse all structured fields from a block of raw receipt text.
 * Pure helper — no network, no side effects. Exercised directly by unit tests.
 */
export function parseFromRawText(rawText: string): {
  amount: number | null
  date: string | null
  time: string | null
  merchant: string
  description: string
  suggestedCategory: string
  invoiceNumber: string | null
  taxAmount: number | null
  currency: string
  taxExempt: boolean
  lineItems: string
  notes: string
  lhdNCategory: string
  recipient: string
} {
  const { date, time } = parseDate(rawText)
  const amount = extractAmount(rawText)
  const merchant = extractVendor(rawText)
  const invoiceNumber = extractInvoiceNumber(rawText)
  const category = suggestCategory(rawText)
  const taxAmount = extractTaxAmount(rawText)
  const currency = detectCurrency(rawText)
  const taxExempt = detectTaxExempt(rawText)
  const lineItems = extractLineItems(rawText)
  const notes = extractNotes(rawText, invoiceNumber, time)
  const { lhdNCategory, recipient } = detectTaxDeduction(rawText, { category })

  return {
    amount,
    date,
    time,
    merchant,
    description: lineItems || merchant,
    suggestedCategory: category,
    invoiceNumber,
    taxAmount,
    currency,
    taxExempt,
    lineItems,
    notes,
    lhdNCategory,
    recipient,
  }
}

// ─── Main OCR Function ───────────────────────────────────────────────────────

export async function performOCR(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<OcrResponse> {
  onProgress?.(10)

  const formData = new FormData()
  formData.append('file', file)

  onProgress?.(30)

  const response = await fetch('/api/ocr', {
    method: 'POST',
    body: formData,
  })

  onProgress?.(80)

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Upload failed' }))
    throw new Error(error.error || 'OCR request failed')
  }

  const result = (await response.json()) as OcrResponse

  onProgress?.(100)

  return result
}
