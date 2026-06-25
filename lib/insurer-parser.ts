/**
 * Insurer & EPF Annual Statement Parser
 * Extracts contribution amounts for D12/D13 relief categories
 * Supports: EPF i-Akaun CSV export, life insurance annual statements (text/CSV)
 */

import type { ParsedTransaction } from '@/lib/ewallet-parser'

export type InsurerType = 'epf' | 'socso' | 'life_insurance' | 'medical_insurance' | 'prs' | 'takaful'

export interface InsurerRecord {
  type: InsurerType
  provider: string
  period: string    // YYYY or YYYY-MM
  amount: number
  description: string
  category: 'epf_insurance'
  lhdnCode: string
}

// ── EPF i-Akaun CSV export ───────────────────────────────────────────────────
// Headers: Date, Type, Amount, Running Balance (or similar)
export function parseEPFStatement(csvText: string): InsurerRecord[] {
  const lines = csvText.trim().split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) return []

  const headers = lines[0].toLowerCase().split(',').map((h) => h.trim().replace(/"/g, ''))
  const dateIdx   = headers.findIndex((h) => h.includes('date') || h.includes('tarikh'))
  const typeIdx   = headers.findIndex((h) => h.includes('type') || h.includes('jenis') || h.includes('description'))
  const amtIdx    = headers.findIndex((h) => h.includes('amount') || h.includes('jumlah') || h.includes('caruman') || h.includes('employee'))

  if (amtIdx < 0) return []

  const results: InsurerRecord[] = []
  for (const line of lines.slice(1)) {
    const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
    const rawDate  = dateIdx >= 0 ? cols[dateIdx] : ''
    const rawType  = typeIdx >= 0 ? cols[typeIdx] : ''
    const rawAmt   = cols[amtIdx] || ''
    const amount   = parseFloat(rawAmt.replace(/[^0-9.]/g, ''))

    if (!amount || amount <= 0) continue

    // Only employee-side contributions are claimable (not employer portion)
    if (/employer|majikan/i.test(rawType)) continue
    // Skip withdrawals
    if (/withdraw|pengeluaran|refund|balik/i.test(rawType)) continue

    const period = rawDate.slice(0, 7) || new Date().toISOString().slice(0, 7)

    results.push({
      type: 'epf',
      provider: 'EPF / KWSP',
      period,
      amount,
      description: `EPF Employee Contribution — ${period}`,
      category: 'epf_insurance',
      lhdnCode: 'D12',
    })
  }
  return results
}

// ── SOCSO / EIS Statement ─────────────────────────────────────────────────────
export function parseSOCSOStatement(csvText: string): InsurerRecord[] {
  const lines = csvText.trim().split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) return []

  const headers = lines[0].toLowerCase().split(',').map((h) => h.trim().replace(/"/g, ''))
  const dateIdx  = headers.findIndex((h) => h.includes('date') || h.includes('month'))
  const amtIdx   = headers.findIndex((h) => h.includes('employee') || h.includes('amount') || h.includes('caruman'))

  if (amtIdx < 0) return []

  const results: InsurerRecord[] = []
  for (const line of lines.slice(1)) {
    const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
    const rawDate = dateIdx >= 0 ? cols[dateIdx] : ''
    const amount  = parseFloat((cols[amtIdx] || '').replace(/[^0-9.]/g, ''))
    if (!amount || amount <= 0) continue

    results.push({
      type: 'socso',
      provider: 'SOCSO / PERKESO',
      period: rawDate.slice(0, 7) || new Date().toISOString().slice(0, 7),
      amount,
      description: `SOCSO Employee Contribution — ${rawDate.slice(0, 7)}`,
      category: 'epf_insurance',
      lhdnCode: 'D15',
    })
  }
  return results
}

// ── Life Insurance / Takaful Annual Statement (text extract) ─────────────────
// Detects provider + total premium paid for the year
export function parseInsurerStatement(text: string, year: number): InsurerRecord | null {
  const providers: Array<{ pattern: RegExp; name: string; type: InsurerType; code: string }> = [
    { pattern: /aia malaysia|aia bhd/i,                         name: 'AIA Malaysia',       type: 'life_insurance', code: 'D13' },
    { pattern: /allianz life|allianz general/i,                 name: 'Allianz',             type: 'life_insurance', code: 'D13' },
    { pattern: /great eastern/i,                                name: 'Great Eastern',       type: 'life_insurance', code: 'D13' },
    { pattern: /prudential bsn takaful|prudential/i,            name: 'Prudential',          type: 'life_insurance', code: 'D13' },
    { pattern: /etiqa|etiqa takaful/i,                          name: 'Etiqa',               type: 'takaful',        code: 'D13' },
    { pattern: /takaful malaysia|syarikat takaful malaysia/i,   name: 'Takaful Malaysia',    type: 'takaful',        code: 'D13' },
    { pattern: /zurich malaysia|zurich life/i,                  name: 'Zurich Malaysia',     type: 'life_insurance', code: 'D13' },
    { pattern: /sun life malaysia/i,                            name: 'Sun Life Malaysia',   type: 'life_insurance', code: 'D13' },
    { pattern: /manulife malaysia/i,                            name: 'Manulife Malaysia',   type: 'life_insurance', code: 'D13' },
    { pattern: /gibraltar bsg/i,                                name: 'Gibraltar BSG',       type: 'life_insurance', code: 'D13' },
    { pattern: /tokio marine/i,                                 name: 'Tokio Marine',        type: 'life_insurance', code: 'D13' },
    { pattern: /public mutual|public bank/i,                    name: 'Public Mutual',       type: 'prs',            code: 'D13' },
    { pattern: /principal.*prs|cimb.*prs|manulife.*prs|kenanga.*prs/i, name: 'PRS Fund',    type: 'prs',            code: 'D13' },
  ]

  let provider = 'Insurance Provider'
  let type: InsurerType = 'life_insurance'
  let code = 'D13'

  for (const p of providers) {
    if (p.pattern.test(text)) {
      provider = p.name; type = p.type; code = p.code
      break
    }
  }

  // Extract total premium for the year
  const amtPatterns = [
    /total\s+premium\s+paid.*?rm\s*([\d,]+\.?\d*)/i,
    /annual\s+premium.*?rm\s*([\d,]+\.?\d*)/i,
    /total\s+contribution.*?rm\s*([\d,]+\.?\d*)/i,
    /premium\s+(?:paid|payable).*?rm\s*([\d,]+\.?\d*)/i,
    /rm\s*([\d,]+\.?\d{2})/i,
  ]

  for (const pat of amtPatterns) {
    const m = text.match(pat)
    if (m) {
      const amt = parseFloat(m[1].replace(/,/g, ''))
      if (amt > 0 && amt < 50000) {
        return {
          type,
          provider,
          period: String(year),
          amount: amt,
          description: `${provider} — YA ${year} premium`,
          category: 'epf_insurance',
          lhdnCode: code,
        }
      }
    }
  }
  return null
}

// ── Convert to ParsedTransaction for the relevance queue ─────────────────────
export function insurerRecordToTransaction(record: InsurerRecord): ParsedTransaction {
  const date = record.period.length === 7
    ? `${record.period}-01`
    : `${record.period}-12-31`

  return {
    date,
    merchant: record.provider,
    amount: record.amount,
    category: record.category,
    rawRow: JSON.stringify(record),
  }
}
