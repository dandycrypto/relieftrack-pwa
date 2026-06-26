/**
 * Telco & Utility Bill Parser — auto-ingest internet bills for Lifestyle D14
 * Handles: Unifi, Time Fibre, Maxis Fibre, Celcom Home, Yes 4G, Streamyx
 * Input: CSV text or plain-text bill extract
 * Returns: ParsedTransaction for the relevance queue
 */

import type { ParsedTransaction } from '@/lib/ewallet-parser'

export type TelcoProvider = 'unifi' | 'time' | 'maxis' | 'celcom' | 'yes' | 'digi' | 'generic'

export interface TelcoBill {
  provider: TelcoProvider
  accountNumber?: string
  period: string         // YYYY-MM
  amount: number         // RM
  description: string
  category: 'lifestyle'  // always Lifestyle D14 — internet
  subCategory: 'lifestyle_basic'
}

const PROVIDER_PATTERNS: Array<{ pattern: RegExp; provider: TelcoProvider; label: string }> = [
  { pattern: /unifi|tm net|streamyx|telekom malaysia/i,       provider: 'unifi',   label: 'Unifi / TM' },
  { pattern: /time fibre|time dotcom|time internet/i,         provider: 'time',    label: 'TIME Fibre' },
  { pattern: /maxis.*home|maxis.*fibre|maxis.*broadband/i,    provider: 'maxis',   label: 'Maxis Home' },
  { pattern: /celcom.*home|celcom.*fibre|celcom.*broadband/i, provider: 'celcom',  label: 'Celcom Home' },
  { pattern: /yes 4g|yes wireless|yes broadband/i,            provider: 'yes',     label: 'YES 4G' },
  { pattern: /digi home|digi broadband|digi internet/i,       provider: 'digi',    label: 'Digi' },
]

function detectProvider(text: string): { provider: TelcoProvider; label: string } {
  for (const { pattern, provider, label } of PROVIDER_PATTERNS) {
    if (pattern.test(text)) return { provider, label }
  }
  return { provider: 'generic', label: 'Internet Subscription' }
}

function extractAmount(text: string): number {
  // Look for "Total Due: RM XX.XX" or "Amount: RM XX.XX" or "RM XX.XX"
  const patterns = [
    /total\s+(?:due|payable|amount)[:\s]+rm\s*([\d,]+\.?\d*)/i,
    /amount\s+(?:due|payable)[:\s]+rm\s*([\d,]+\.?\d*)/i,
    /rm\s*([\d,]+\.?\d{2})/i,
  ]
  for (const pat of patterns) {
    const m = text.match(pat)
    if (m) {
      const amt = parseFloat(m[1].replace(/,/g, ''))
      if (amt > 0 && amt < 10000) return amt
    }
  }
  return 0
}

function extractPeriod(text: string): string {
  // "Invoice Date: 01 Mar 2025" or "Bill Period: Feb 2025"
  const monthNames = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']
  const patterns = [
    /bill\s+period[:\s]+(\w{3,9})\s+(\d{4})/i,
    /invoice\s+date[:\s]+\d{1,2}\s+(\w{3,9})\s+(\d{4})/i,
    /statement\s+date[:\s]+\d{1,2}[\/\-](\d{1,2})[\/\-](\d{4})/i,
  ]
  for (const pat of patterns) {
    const m = text.match(pat)
    if (m) {
      const monthStr = m[1].toLowerCase().slice(0, 3)
      const yearStr = m[2]
      const monthIdx = monthNames.indexOf(monthStr)
      if (monthIdx >= 0) {
        return `${yearStr}-${String(monthIdx + 1).padStart(2, '0')}`
      }
      // Numeric month
      const numMonth = parseInt(m[1])
      if (numMonth >= 1 && numMonth <= 12) {
        return `${m[2]}-${String(numMonth).padStart(2, '0')}`
      }
    }
  }
  // Fallback: current month
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function extractAccountNumber(text: string): string | undefined {
  const m = text.match(/account\s*(?:no|number|#)[:\s]+([A-Z0-9\-\s]{6,20})/i)
  return m ? m[1].trim() : undefined
}

export function parseTelcoBill(text: string): TelcoBill | null {
  const { provider, label } = detectProvider(text)
  const amount = extractAmount(text)
  if (amount === 0) return null

  const period = extractPeriod(text)
  const accountNumber = extractAccountNumber(text)

  return {
    provider,
    accountNumber,
    period,
    amount,
    description: `${label} — ${period} internet subscription`,
    category: 'lifestyle',
    subCategory: 'lifestyle_basic',
  }
}

export function telcoBillToTransaction(bill: TelcoBill): ParsedTransaction {
  return {
    date: `${bill.period}-01`, // use first of month as date
    merchant: bill.description.split(' — ')[0],
    amount: bill.amount,
    category: bill.category,
    rawRow: JSON.stringify(bill),
  }
}

// Parse multiple bills from a CSV (one row = one month's bill)
// Format expected: Date, Provider, Amount
export function parseTelcoCSV(text: string): ParsedTransaction[] {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return []

  const headers = lines[0].toLowerCase().split(',')
  const dateIdx = headers.findIndex((h) => h.includes('date') || h.includes('period'))
  const providerIdx = headers.findIndex((h) => h.includes('provider') || h.includes('name') || h.includes('merchant'))
  const amtIdx = headers.findIndex((h) => h.includes('amount') || h.includes('rm'))

  if (dateIdx < 0 || amtIdx < 0) return []

  return lines.slice(1).flatMap((line) => {
    const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
    const rawDate = cols[dateIdx] || ''
    const provider = providerIdx >= 0 ? (cols[providerIdx] || 'Internet') : 'Internet Subscription'
    const amtRaw = cols[amtIdx] || ''
    const amount = parseFloat(amtRaw.replace(/[^0-9.]/g, ''))
    if (!amount || amount <= 0) return []

    const { label } = detectProvider(provider)

    // Parse date
    let date = rawDate.slice(0, 10)
    if (!/^\d{4}-\d{2}/.test(date)) {
      const d = new Date(rawDate)
      if (!isNaN(d.getTime())) date = d.toISOString().slice(0, 10)
      else date = new Date().toISOString().slice(0, 10)
    }

    return [{
      date,
      merchant: label || provider,
      amount,
      category: 'lifestyle',
      rawRow: line,
    }]
  })
}
