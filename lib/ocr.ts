/**
 * OCR Module — Server-side RapidOCR via Next.js API route.
 * Supports: images (jpg, png, webp) and PDF.
 * Parsing done server-side with RapidOCR (PP-OCRv4 ONNX); client gets pre-parsed JSON.
 */

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

export interface OCRResult {
  amount: number | null
  date: string | null
  merchant: string
  description: string
  suggestedCategory: string
  invoiceNumber: string | null
  taxAmount: number | null
  rawText: string
  confidence: number
  // New fields from receipt-tracker
  time: string | null          // HH:MM
  currency: string              // default "MYR"
  taxExempt: boolean
  lhdNCategory: string         // e.g. "Medical-Parents", "Lifestyle-SportsEquipment", "" if none
  recipient: string             // "self" | "spouse" | "child" | "parent" | ""
  lineItems: string             // short description of items
  notes: string                 // invoice ID + SST/GST + time
  // v2 OCR (FastAPI microservice) fields — optional, populated when ocr_v2=true
  vendor?: string | null
  tax_amount?: number | null
  tax_type?: string | null
  category?: string | null
  invoice_number?: string | null
  tin?: string | null
  sst_registration_no?: string | null
  document_type?: string | null
  extraction_method?: string | null
  needs_review?: boolean
  confidence_band?: 'green' | 'amber' | 'red' | null
  ocr_v2?: boolean
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

function detectTaxDeduction(text: string, data: { category: string }, inferredRecipient?: string): { lhdNCategory: string, recipient: string } {
  if (data.category === "Transport") {
    return { lhdNCategory: "", recipient: "" }
  }
  for (const [pattern, taxType, recipientHint] of TAX_DEDUCTION_PATTERNS) {
    if (pattern.test(text)) {
      const recipient = (inferredRecipient && inferredRecipient !== "" && inferredRecipient !== "self")
        ? inferredRecipient
        : recipientHint
      return { lhdNCategory: taxType, recipient }
    }
  }
  return { lhdNCategory: "", recipient: "" }
}

// ─── Supabase Profile Types ───────────────────────────────────────────────────

interface UserProfile {
  name: string | null
  parent_names: string | null
  spouse_name: string | null
  child_names: string | null
}

// ─── Fetch User Profile ─────────────────────────────────────────────────────

async function fetchUserProfile(supabase: import('@supabase/supabase-js').SupabaseClient): Promise<UserProfile | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles')
    .select('name, parent_names, spouse_name, child_names')
    .eq('id', user.id)
    .single()
  return profile as UserProfile | null
}

// ─── Infer Recipient ─────────────────────────────────────────────────────────

function inferRecipient(ocrText: string, profile: UserProfile | null): string {
  let patientName: string | null = null
  const patientMatch = ocrText.match(/PATIENT:\s*(\w+\s+\w+)/i)
  if (patientMatch) {
    patientName = patientMatch[1].trim()
  } else {
    const customerMatch = ocrText.match(/CustomerName:\s*(\w+\s+\w+)/i)
    if (customerMatch) patientName = customerMatch[1].trim()
  }

  if (!patientName || !profile) return ''

  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
  const patientNorm = norm(patientName)

  const parentNames = profile.parent_names ? profile.parent_names.split(',').map(n => norm(n)) : []
  const spouseName = profile.spouse_name ? norm(profile.spouse_name) : ''
  const childNames = profile.child_names ? profile.child_names.split(',').map(n => norm(n)) : []
  const userName = profile.name ? norm(profile.name) : ''

  if (parentNames.some(n => n && (patientNorm.includes(n) || n.includes(patientNorm)))) return 'parent'
  if (spouseName && (patientNorm.includes(spouseName) || spouseName.includes(patientNorm))) return 'spouse'
  if (childNames.some(n => n && (patientNorm.includes(n) || patientNorm.includes(n)))) return 'child'
  if (userName && (patientNorm.includes(userName) || userName.includes(patientNorm))) return 'self'

  return ''
}

// ─── Main OCR Function ───────────────────────────────────────────────────────

/**
 * Parse all structured fields from raw OCR text.
 * Used by performOCR after server returns minimal {rawText, confidence} payload.
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

export async function performOCR(
  file: File,
  onProgress?: (pct: number) => void
): Promise<OCRResult> {
  if (onProgress) onProgress(10)

  const formData = new FormData()
  formData.append('file', file)

  if (onProgress) onProgress(30)

  const response = await fetch('/api/ocr', {
    method: 'POST',
    body: formData,
  })

  if (onProgress) onProgress(80)

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Upload failed' }))
    throw new Error(error.error || 'OCR request failed')
  }

  const result: OCRResult = await response.json()

  // ── Client-side parsing (server only returns rawText + confidence) ──
  if (result.rawText && result.rawText.length > 0) {
    const parsed = parseFromRawText(result.rawText)
    const serverHasRealCategory = result.suggestedCategory && result.suggestedCategory !== 'lifestyle'
    const serverHasRealMerchant = result.merchant && result.merchant !== 'Unknown Merchant'
    const serverHasRealAmount = result.amount != null && result.amount > 0

    result.amount = serverHasRealAmount ? result.amount : parsed.amount
    result.date = result.date ?? parsed.date
    result.time = result.time ?? parsed.time
    result.merchant = serverHasRealMerchant ? result.merchant : parsed.merchant
    result.description = result.description || parsed.description
    result.suggestedCategory = serverHasRealCategory ? result.suggestedCategory : parsed.suggestedCategory
    result.invoiceNumber = result.invoiceNumber ?? parsed.invoiceNumber
    result.taxAmount = result.taxAmount ?? parsed.taxAmount
    result.currency = result.currency || parsed.currency
    result.taxExempt = result.taxExempt || parsed.taxExempt
    result.lineItems = result.lineItems || parsed.lineItems
    result.notes = result.notes || parsed.notes
    if (!result.lhdNCategory) result.lhdNCategory = parsed.lhdNCategory
    if (!result.recipient) result.recipient = parsed.recipient
  }

  // ── Recipient inference (PART 2) ──────────────────────────────────────────
  if (
    result.suggestedCategory.startsWith('medical_') ||
    result.suggestedCategory === 'ChildCare'
  ) {
    const { supabase } = await import('@/lib/supabase')
    const profile = await fetchUserProfile(supabase)
    const inferredRecipient = profile ? inferRecipient(result.rawText, profile) : ''
    if (inferredRecipient) {
      result.recipient = inferredRecipient
      const { lhdNCategory } = detectTaxDeduction(
        result.rawText,
        { category: result.suggestedCategory },
        inferredRecipient
      )
      if (lhdNCategory) result.lhdNCategory = lhdNCategory
    }
  }

  if (onProgress) onProgress(100)

  return result
}
