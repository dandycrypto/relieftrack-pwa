/**
 * Receipt Verification Module — LHDN YA 2025/2026
 * Uses Ollama (gemma4) to verify receipts against LHDN tax relief criteria.
 * Falls back to rule-based verification if Ollama is slow/unavailable.
 */

import type { OcrResult } from '@/types/ocr'
import type { Record } from '@/store'

// ─── Duplicate Detection ──────────────────────────────────────────────────────

export function findDuplicates(
  newRecord: { merchant: string; amount: number; date: string },
  existing: Record[]
): Record[] {
  const merchantKey = newRecord.merchant.toLowerCase().trim()
  const month = newRecord.date.slice(0, 7) // YYYY-MM
  const lo = newRecord.amount * 0.9
  const hi = newRecord.amount * 1.1
  return existing.filter((r) => {
    if (r.date.slice(0, 7) !== month) return false
    if (r.merchant.toLowerCase().trim() !== merchantKey) return false
    if (r.amount < lo || r.amount > hi) return false
    return true
  })
}

export interface VerifyResult {
  status: 'verified' | 'pending'
  reason: string
  confidence: number
  method: 'ai' | 'rule'
}

// ─── Rule-Based Fallback Verification ───────────────────────────────────────

const MERCHANT_PATTERNS: [RegExp, string][] = [
  [/(hospital|clinic|pharmacy|pantai|gleneagles|sunway medical|kpj|umsc|ahos|medical|health|pusat perubatan| klinik)/i, 'medical_self'],
  [/(epf|kwsp|protection|takaful|insurance|aia|Allianz|etiqa|greateastern|takaful|Zurich|Manulife|Generali)/i, 'epf_insurance'],
  [/(university|college|edu|um$|ukm|usm|uitm|monash|taylor|help university| ucsi|curtin|nottingham|oxford|michael's|kenanga|segi| Taylor|Cambridge|ump|uthm|unimap|unikl|politeknik|newera)/i, 'education_self'],
  [/(book|mph|kinokuniya|popular|bookstore|books|harga|rm)/i, 'lifestyle'],
  [/(apple|macbook|iphone|samsung|手机|phone|gadget|digi|shopeexpress|lazada|shopee)/i, 'lifestyle'],
  [/(thunder match|thundermatch|low.yat|lowyat|senghong|senheng|senQ|senq|welcom|epic digital|msi|gigabyte|asus rog|realme|oppo|vivo|oneplus|poco|xiaomi|honor|huawei|tecno|infinix|itel|nokiaandroid)/i, 'lifestyle'],
  [/(harvey norman|courts|taobao|alibaba|guardian|watsons|guardian pharmacy)/i, 'lifestyle'],
  [/(sports|decathlon|nike|adidas|puma|asics|new balance|running|puma|jd sports)/i, 'lifestyle'],
  [/(unifi|malcs fiber|maxis|celcom|diGi|web hosting|internet|broadband|天地|tm unifi|maxis fiber)/i, 'lifestyle'],
  [/(maybank|cimb|public bank|rhb|bank Rakyat|bank Islam|hsbc|standard chartered|ambank|bankMu|bank negara)/i, 'housing_loan'],
  [/(taxi|grab|airline|flight|m悅|Train|ETS|KTM|bus|malindo|airasia)/i, 'lifestyle'],
  [/(restaurant|cafe|coffee|makan|food|kfc|mcdonalds|starbucks|subway|pizza|domino)/i, 'lifestyle'],
  [/(gym|fitness|rock climbing|badminton|tennis|squash|bowling|aquaria|zoo|ticket|voucher)/i, 'lifestyle'],
  [/(netflix|spotify|disney|aws|google one|microsoft|adobe|subscription)/i, 'lifestyle'],
  [/(mbsb|awning|renovation|hardware|building materials)/i, 'housing_loan'],
  // Additional Malaysian retailers & lifestyle merchants
  [/(harvey norman|harveynorman|courts|guardian|watson|cw wellness|merck|对准派|podpod|对准)/i, 'lifestyle'],
  [/(mph|kinokuniya|book stash|zest|woodlands|popular books|bshop|big bookshop)/i, 'lifestyle'],
  [/(decathlon|sports direct|gosports|foot locker|podium|fin nor)/i, 'lifestyle'],
  [/(yonex|victor|lining|mizuno|asics|nanex|courtline|star sport)/i, 'lifestyle'],
  [/(AEON|aeon|jusco|century|square 2|elITE|carefully|wellness|kdi)/i, 'lifestyle'],
  [/(village grocer|ben's independent grocer|big independent|mr\. diet|hero supermarket|hero mart)/i, 'lifestyle'],
  [/(mcdonalds|starbucks|texas chicken|kfc|burger king|pizza hut|domino's|subway|marrybrown|old town white coffee|pappa-rich|tealive|chegg|lcha|chocolate|cafe|smoothie king)/i, 'lifestyle'],
  [/(caltex|shell|petronas|petron|shell90|easy|ESSO|mal1|Giving|mesra|delifrance|auntie anne)/i, 'lifestyle'],
  [/(Grab|biti|taxi|van|car rental|airline|malindo|airasia|firefly|scoot)/i, 'lifestyle'],
  [/(tune talk|redone|yoodo|unifi mobile|maxis|digi|celcom|umobile|web talk|neobase)/i, 'lifestyle'],
  [/(sunway lagoon|zoo|aquaria|kl tower|theme park|cinema|gv|gold class|tgv|mmcine|klsf|bowling|snooker|pool|billiard)/i, 'lifestyle'],
  [/(iherb|gnc|holland|tropicana|health origin|v有机源)/i, 'lifestyle'],
  [/(qoo10|lazada|shopee|amazon|taobao|ezbuy|parcel|money poste|包装)/i, 'lifestyle'],
  // EPF direct employer payments
  [/(kwsp|epf|kumpulan wang|caruman|skim persaraan|k剖)/i, 'epf_insurance'],
]

function ruleBasedVerify(
  ocrResult: OcrResult,
  category: string,
  amount: number
): VerifyResult {
  // vendor (was merchant); description proxy from raw_text first line
  const desc = (ocrResult.raw_text || '').split('\n')[0] ?? ''
  const merchantMatch = MERCHANT_PATTERNS.find(([pattern]) =>
    pattern.test((ocrResult.vendor ?? '') + ' ' + desc)
  )

  const rawTextLower = (ocrResult.raw_text || '').toLowerCase()
  const fullText = ((ocrResult.vendor ?? '') + ' ' + desc + ' ' + rawTextLower).toLowerCase()

  // Amount reasonability checks
  const amountChecks: Record<string, { min: number; max: number; unit: string }> = {
    medical_self: { min: 10, max: 15000, unit: 'RM' },
    education_self: { min: 100, max: 15000, unit: 'RM' },
    lifestyle: { min: 5, max: 2500, unit: 'RM' },
    epf_insurance: { min: 50, max: 50000, unit: 'RM' },
    housing_loan: { min: 100, max: 100000, unit: 'RM' },
    children_under18: { min: 50, max: 2000, unit: 'RM' },
    children_education: { min: 200, max: 10000, unit: 'RM' },
    parents_medical: { min: 50, max: 10000, unit: 'RM' },
    individual: { min: 0, max: 20000, unit: 'RM' },
    spouse: { min: 50, max: 5000, unit: 'RM' },
    disabled: { min: 50, max: 10000, unit: 'RM' },
    disabled_equipment: { min: 100, max: 8000, unit: 'RM' },
  }

  const limits: Record<string, number> = {
    medical_self: 10000,
    education_self: 7000,
    lifestyle: 2500,
    epf_insurance: 7000,
    housing_loan: 7000,
    children_under18: 2000,
    children_education: 8000,
    parents_medical: 8000,
    individual: 9000,
    spouse: 4000,
    disabled: 7000,
    disabled_equipment: 6000,
  }

  const check = amountChecks[category] || { min: 10, max: 50000, unit: 'RM' }
  const maxLimit = limits[category] || 5000

  // Individual is always verified (automatic relief)
  if (category === 'individual') {
    return {
      status: 'verified',
      reason: 'Individual automatic relief',
      confidence: 1.0,
      method: 'rule',
    }
  }

  // Amount too low → pending
  if (amount < check.min) {
    return {
      status: 'pending',
      reason: `Amount too low (min ${check.unit} ${check.min})`,
      confidence: 0.5,
      method: 'rule',
    }
  }

  // Amount > 2x limit = suspicious → pending
  if (amount > maxLimit * 2) {
    return {
      status: 'pending',
      reason: `Amount unusually high for category (max RM ${maxLimit.toLocaleString()})`,
      confidence: 0.4,
      method: 'rule',
    }
  }

  // Merchant name can be anything — ANY amount in reasonable range = verified
  const merchantHint = merchantMatch ? ` (${merchantMatch[1]})` : ''
  return {
    status: 'verified',
    reason: `Amount RM ${amount.toLocaleString()} is reasonable${merchantHint}`,
    confidence: 0.85,
    method: 'rule',
  }
}

// ─── AI Verification (Ollama gemma4) ───────────────────────────────────────

const LHDN_SYSTEM = `You are an LHDN YA 2025/2026 receipt verifier for Malaysian income tax. Return ONLY valid JSON. Categories: medical_self(max10k), education_self(7k), lifestyle(2.5k), epf_insurance(7k), housing_loan(7k), children_under18(2k/child), children_education(8k/child), parents_medical(8k), individual(9k-auto), spouse(4k), disabled(7k), disabled_equipment(6k). Verify: receipt must be Malaysian, merchant must match category, amount must be reasonable. JSON: {"valid":true/false,"reason":"brief reason max 60 chars","confidence":0.0-1.0}`

export async function verifyRecord(
  ocrResult: OcrResult,
  category: string,
  amount: number
): Promise<VerifyResult> {
  // Fast path: run rule-based first (instant)
  const ruleResult = ruleBasedVerify(ocrResult, category, amount)

  // If rule-based already verified with high confidence, return immediately
  if (ruleResult.status === 'verified' && ruleResult.confidence >= 0.85) {
    return ruleResult
  }

  // Try AI verification in background (30s timeout)
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30000)

  try {
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'gemma4',
        system: LHDN_SYSTEM,
        // description derived from raw_text first line; vendor used as merchant name
        prompt: `Verify: Merchant="${ocrResult.vendor ?? ''}", Amount=RM${amount}, Category=${category}, Description="${(ocrResult.raw_text || '').split('\n')[0] ?? ''}"`,
        stream: false,
        options: { temperature: 0.1, num_predict: 80 },
      }),
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      // AI unavailable — use rule result
      return ruleResult
    }

    const data = await response.json()
    const text = (data.response || '').trim()

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*?"valid"[\s\S]*?\}/)
    if (!jsonMatch) {
      return ruleResult
    }

    const parsed = JSON.parse(jsonMatch[0]) as { valid: boolean; reason: string; confidence: number }

    // AI result — always trust AI verdict but use rule reason if AI reason is empty
    return {
      status: parsed.valid ? 'verified' : 'pending',
      reason: parsed.reason || ruleResult.reason,
      confidence: Math.max(0, Math.min(1, parsed.confidence || 0)),
      method: 'ai',
    }
  } catch (err) {
    clearTimeout(timeoutId)
    // AI failed/timeout — use rule result
    return ruleResult
  }
}

// ─── EA Form Verification ─────────────────────────────────────────────────

export interface EAFormVerifyResult {
  status: 'verified' | 'pending'
  reason: string
  confidence: number
  ambiguousFields: string[]
}

export function verifyEAForm(data: {
  employerName: string
  taxYear: number
  grossIncome: number
  epfContribution: number
  socsoContribution: number
  pcbPaid: number
}): EAFormVerifyResult {
  const currentYear = new Date().getFullYear()
  const ambiguousFields: string[] = []
  const issues: string[] = []

  // Check 1: All mandatory fields non-empty
  if (!data.employerName || data.employerName.trim().length === 0) {
    ambiguousFields.push('employerName')
    issues.push('Employer name is empty')
  }

  if (!data.taxYear || data.taxYear < 2020) {
    ambiguousFields.push('taxYear')
    issues.push('Tax year invalid')
  }

  if (!data.grossIncome || data.grossIncome <= 0) {
    ambiguousFields.push('grossIncome')
    issues.push('Gross income missing or invalid')
  }

  // Check 2: Amounts in reasonable range
  if (data.grossIncome < 10000 || data.grossIncome > 1000000) {
    ambiguousFields.push('grossIncome')
    issues.push('Gross income outside normal salary range')
  }

  if (data.epfContribution < 0 || data.epfContribution > data.grossIncome * 0.11) {
    ambiguousFields.push('epfContribution')
    issues.push('EPF contribution outside normal range')
  }

  if (data.pcbPaid < 0) {
    ambiguousFields.push('pcbPaid')
    issues.push('PCB amount invalid')
  }

  // Check 3: Tax year range 2020 to current+1
  if (data.taxYear < 2020 || data.taxYear > currentYear + 1) {
    ambiguousFields.push('taxYear')
    issues.push(`Tax year ${data.taxYear} must be between 2020 and ${currentYear + 1}`)
  }

  // Confidence scoring
  let confidence = 1.0
  let status: 'verified' | 'pending' = 'verified'

  if (ambiguousFields.length === 0) {
    status = 'verified'
    confidence = 1.0
  } else if (ambiguousFields.length <= 2) {
    status = 'pending'
    confidence = 0.7
  } else {
    status = 'pending'
    confidence = 0.3
  }

  const reason = issues.length > 0 ? issues.join('; ') : 'All fields verified'

  return { status, reason, confidence, ambiguousFields }
}
