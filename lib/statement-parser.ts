/**
 * Bank Statement Parser — top 6 MY banks + generic CSV fallback
 * Supports: Maybank, CIMB, Public Bank, RHB, Hong Leong Bank, AmBank
 * Input: CSV text (exported from online banking)
 * Output: structured debit transactions for LHDN review
 */

export type BankId = 'maybank' | 'cimb' | 'publicbank' | 'rhb' | 'hongleong' | 'ambank' | 'generic'

export interface BankTransaction {
  date: string        // YYYY-MM-DD
  description: string
  merchant: string    // cleaned merchant name
  amount: number      // positive = debit (expense paid)
  balance?: number
  reference?: string
  rawRow: string
}

export interface ParseResult {
  bank: BankId
  accountNumber?: string
  period?: { from: string; to: string }
  transactions: BankTransaction[]
  parseErrors: string[]
  rowsTotal: number
  rowsParsed: number
}

// ─── CSV helpers ──────────────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const cols: string[] = []
  let cur = ''
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') { inQuote = !inQuote; continue }
    if (ch === ',' && !inQuote) { cols.push(cur.trim()); cur = ''; continue }
    cur += ch
  }
  cols.push(cur.trim())
  return cols
}

function parseCSV(text: string): string[][] {
  return text.trim().split(/\r?\n/).filter(Boolean).map(parseCSVLine)
}

function colIdx(headers: string[], ...names: string[]): number {
  for (const name of names) {
    const idx = headers.findIndex((h) => h.toLowerCase().replace(/[^a-z0-9]/g, '').includes(name.toLowerCase().replace(/[^a-z0-9]/g, '')))
    if (idx >= 0) return idx
  }
  return -1
}

function parseDate(raw: string): string {
  const s = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  const mdy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/)
  if (mdy) {
    const year = mdy[3].length === 2 ? `20${mdy[3]}` : mdy[3]
    return `${year}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`
  }
  // Try natural-language dates e.g. "14 Mar 2025"
  const d = new Date(s)
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  return new Date().toISOString().slice(0, 10)
}

function parseAmount(raw: string): number {
  if (!raw) return 0
  const n = parseFloat(raw.replace(/[^0-9.\-]/g, ''))
  return isNaN(n) ? 0 : Math.abs(n)
}

function cleanMerchant(desc: string): string {
  return desc
    .replace(/^\d{6,}[\s\-]*/g, '')           // strip leading transaction IDs
    .replace(/\s{2,}/g, ' ')                   // collapse whitespace
    .replace(/(pos |pos\/|visa |mc |amex |master )/gi, '') // strip card prefixes
    .trim()
    .slice(0, 80)
}

// ─── Bank-specific parsers ────────────────────────────────────────────────────

function parseMaybank(rows: string[][]): Omit<ParseResult, 'bank'> {
  const errors: string[] = []
  const transactions: BankTransaction[] = []
  if (rows.length < 2) return { transactions, parseErrors: ['No data rows'], rowsTotal: 0, rowsParsed: 0 }

  const headers = rows[0].map((h) => h.toLowerCase())
  const dateCol = colIdx(headers, 'date', 'transaction date')
  const descCol = colIdx(headers, 'description', 'transaction description', 'particulars')
  const debitCol = colIdx(headers, 'debit', 'withdrawal', 'amount (debit)', 'amount')
  const balCol = colIdx(headers, 'balance', 'running balance')
  const refCol = colIdx(headers, 'reference', 'ref', 'cheque no')

  let rowsParsed = 0
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row[dateCol]?.trim()) continue
    const amtRaw = row[debitCol] ?? ''
    if (!amtRaw.trim()) continue // skip credit rows (income)
    const amount = parseAmount(amtRaw)
    if (amount <= 0) continue

    const desc = row[descCol] ?? ''
    transactions.push({
      date: parseDate(row[dateCol] ?? ''),
      description: desc,
      merchant: cleanMerchant(desc),
      amount,
      balance: balCol >= 0 ? parseAmount(row[balCol] ?? '') : undefined,
      reference: refCol >= 0 ? row[refCol] : undefined,
      rawRow: row.join(','),
    })
    rowsParsed++
  }

  return { transactions, parseErrors: errors, rowsTotal: rows.length - 1, rowsParsed }
}

function parseCIMB(rows: string[][]): Omit<ParseResult, 'bank'> {
  const errors: string[] = []
  const transactions: BankTransaction[] = []
  if (rows.length < 2) return { transactions, parseErrors: ['No data rows'], rowsTotal: 0, rowsParsed: 0 }

  // CIMB CSV header row often contains "Transaction Date", "Description", "Amount", "Balance"
  const headers = rows[0].map((h) => h.toLowerCase())
  const dateCol = colIdx(headers, 'date', 'transdate', 'transaction date')
  const descCol = colIdx(headers, 'description', 'narration', 'particulars')
  const amtCol  = colIdx(headers, 'amount', 'debit', 'withdrawal')
  const typeCol = colIdx(headers, 'type', 'dr/cr', 'transaction type', 'credit/debit')
  const balCol  = colIdx(headers, 'balance')

  let rowsParsed = 0
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row[dateCol]?.trim()) continue

    // Skip credits if there's a type column
    if (typeCol >= 0) {
      const type = (row[typeCol] ?? '').toUpperCase()
      if (type === 'CR' || type === 'CREDIT') continue
    }

    const amtRaw = row[amtCol] ?? ''
    if (!amtRaw.trim()) continue
    const amount = parseAmount(amtRaw)
    if (amount <= 0) continue

    const desc = row[descCol] ?? ''
    transactions.push({
      date: parseDate(row[dateCol] ?? ''),
      description: desc,
      merchant: cleanMerchant(desc),
      amount,
      balance: balCol >= 0 ? parseAmount(row[balCol] ?? '') : undefined,
      rawRow: row.join(','),
    })
    rowsParsed++
  }

  return { transactions, parseErrors: errors, rowsTotal: rows.length - 1, rowsParsed }
}

function parsePublicBank(rows: string[][]): Omit<ParseResult, 'bank'> {
  const errors: string[] = []
  const transactions: BankTransaction[] = []
  if (rows.length < 2) return { transactions, parseErrors: ['No data rows'], rowsTotal: 0, rowsParsed: 0 }

  // Public Bank exports often: Date, Description, Withdrawal, Deposit, Balance
  const headers = rows[0].map((h) => h.toLowerCase())
  const dateCol = colIdx(headers, 'date', 'value date')
  const descCol = colIdx(headers, 'description', 'transaction', 'particulars', 'detail')
  const wdCol   = colIdx(headers, 'withdrawal', 'debit', 'dr')
  const balCol  = colIdx(headers, 'balance')

  let rowsParsed = 0
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row[dateCol]?.trim()) continue
    const wdRaw = wdCol >= 0 ? row[wdCol] : ''
    if (!wdRaw?.trim()) continue
    const amount = parseAmount(wdRaw)
    if (amount <= 0) continue

    const desc = row[descCol] ?? ''
    transactions.push({
      date: parseDate(row[dateCol] ?? ''),
      description: desc,
      merchant: cleanMerchant(desc),
      amount,
      balance: balCol >= 0 ? parseAmount(row[balCol] ?? '') : undefined,
      rawRow: row.join(','),
    })
    rowsParsed++
  }

  return { transactions, parseErrors: errors, rowsTotal: rows.length - 1, rowsParsed }
}

function parseRHB(rows: string[][]): Omit<ParseResult, 'bank'> {
  return parseCIMB(rows) // RHB export format is very similar to CIMB
}

function parseHongLeong(rows: string[][]): Omit<ParseResult, 'bank'> {
  return parsePublicBank(rows) // HLB format mirrors Public Bank structure
}

function parseAmBank(rows: string[][]): Omit<ParseResult, 'bank'> {
  return parseMaybank(rows) // AmBank closely follows Maybank export format
}

// ─── Bank Auto-Detection ──────────────────────────────────────────────────────

function detectBank(text: string, headers: string[]): BankId {
  const upper = text.slice(0, 500).toUpperCase()
  const hdr = headers.join(' ').toUpperCase()
  if (/MAYBANK|MAE |M2U/.test(upper)) return 'maybank'
  if (/CIMB BANK|CIMBCLICKS|CIMB PREFERRED/.test(upper)) return 'cimb'
  if (/PUBLIC BANK|PBB |PUBLICBANK/.test(upper)) return 'publicbank'
  if (/RHB BANK|RHBBANK|RHB NOW/.test(upper)) return 'rhb'
  if (/HONG LEONG|HLB|HLONLINE/.test(upper)) return 'hongleong'
  if (/AMBANK|AMACCESS|AM ONLINE/.test(upper)) return 'ambank'
  // Fallback by header patterns
  if (/NARRATION|NARR/.test(hdr)) return 'cimb'
  if (/WITHDRAWAL.*DEPOSIT|DR.*CR/.test(hdr)) return 'publicbank'
  return 'generic'
}

// ─── Generic CSV Parser (fallback) ───────────────────────────────────────────

function parseGeneric(rows: string[][]): Omit<ParseResult, 'bank'> {
  const errors: string[] = []
  const transactions: BankTransaction[] = []
  if (rows.length < 2) return { transactions, parseErrors: ['No data rows'], rowsTotal: 0, rowsParsed: 0 }

  const headers = rows[0].map((h) => h.toLowerCase())
  const dateCol = colIdx(headers, 'date', 'transaction date', 'value date', 'posted date')
  const descCol = colIdx(headers, 'description', 'narration', 'particulars', 'merchant', 'detail', 'transaction')
  const amtCol  = colIdx(headers, 'debit', 'withdrawal', 'dr', 'amount')

  if (dateCol < 0 || descCol < 0 || amtCol < 0) {
    errors.push(`Could not find required columns (date:${dateCol}, desc:${descCol}, amount:${amtCol})`)
    return { transactions, parseErrors: errors, rowsTotal: rows.length - 1, rowsParsed: 0 }
  }

  let rowsParsed = 0
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row[dateCol]?.trim()) continue
    const amount = parseAmount(row[amtCol] ?? '')
    if (amount <= 0) continue

    const desc = row[descCol] ?? ''
    transactions.push({
      date: parseDate(row[dateCol] ?? ''),
      description: desc,
      merchant: cleanMerchant(desc),
      amount,
      rawRow: row.join(','),
    })
    rowsParsed++
  }

  return { transactions, parseErrors: errors, rowsTotal: rows.length - 1, rowsParsed }
}

// ─── Main Parse Entry Point ───────────────────────────────────────────────────

export function parseStatement(csvText: string, bankHint?: BankId): ParseResult {
  const rows = parseCSV(csvText)
  if (rows.length === 0) {
    return { bank: 'generic', transactions: [], parseErrors: ['Empty file'], rowsTotal: 0, rowsParsed: 0 }
  }

  const headers = rows[0]
  const bank = bankHint && bankHint !== 'generic' ? bankHint : detectBank(csvText, headers)

  let result: Omit<ParseResult, 'bank'>
  switch (bank) {
    case 'maybank':    result = parseMaybank(rows);    break
    case 'cimb':       result = parseCIMB(rows);       break
    case 'publicbank': result = parsePublicBank(rows); break
    case 'rhb':        result = parseRHB(rows);        break
    case 'hongleong':  result = parseHongLeong(rows);  break
    case 'ambank':     result = parseAmBank(rows);     break
    default:           result = parseGeneric(rows);    break
  }

  // Extract account number from the first few lines (common pattern: "Account No: xxxx")
  const accountMatch = csvText.match(/account\s*(?:no|number|#)[:\s]+([0-9\-\s]{8,20})/i)

  // Extract period
  const periodMatch = csvText.match(/(?:from|period)[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})\s*(?:to|[-–])\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i)

  return {
    bank,
    accountNumber: accountMatch ? accountMatch[1].trim() : undefined,
    period: periodMatch
      ? { from: parseDate(periodMatch[1]), to: parseDate(periodMatch[2]) }
      : undefined,
    ...result,
  }
}

export const BANK_LABELS: Record<BankId, string> = {
  maybank:    'Maybank',
  cimb:       'CIMB Bank',
  publicbank: 'Public Bank',
  rhb:        'RHB Bank',
  hongleong:  'Hong Leong Bank',
  ambank:     'AmBank',
  generic:    'Other Bank (Generic)',
}
