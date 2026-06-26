export type EWalletProvider = 'tng' | 'grab' | 'boost' | 'shopeepay' | 'mae' | 'bigpay' | 'setel'

export interface ParsedTransaction {
  date: string       // YYYY-MM-DD
  merchant: string
  amount: number
  category: string   // RELIEF_CATEGORIES id
  rawRow: string
}

// Keyword → relief category mapping
const MERCHANT_CATEGORY_MAP: [RegExp, string][] = [
  [/pharmacy|farmasi|watsons|guardian|caring|alpro|duopharma|aeon wellness/i, 'medical_self'],
  [/hospital|clinic|klinik|dental|dentist|optician|optometrist|eye|health|medical|paediatric|paedriatric/i, 'medical_self'],
  [/gym|fitness|sports|badminton|futsal|swimming|yoga|pilates|marathon|running|cycle|bicycle|equipment/i, 'lifestyle'],
  [/book|mph|popular|kinokuniya|borders|novel|magazine|textbook/i, 'lifestyle'],
  [/computer|laptop|notebook|tablet|ipad|samsung|apple|huawei|lenovo|dell|hp|asus|microsoft/i, 'lifestyle'],
  [/internet|unifi|time fibre|maxis|celcom|digi|yes 4g|streamyx|broadband/i, 'lifestyle'],
  [/university|college|institute|tuition|course|seminar|workshop|certification|exam fee/i, 'education_self'],
  [/epf|kwsp|socso|perkeso|pcb|hrdf|hrdc/i, 'epf_insurance'],
  [/insurance|takaful|great eastern|allianz|prudential|aia|axa|zurich|tokio marine|mnrb/i, 'epf_insurance'],
  [/grab food|foodpanda|shopee food|tng merchant|restaurant|cafe|mamak|kopitiam|food|makan/i, 'lifestyle'],
]

function autoCategory(merchant: string): string {
  for (const [pattern, cat] of MERCHANT_CATEGORY_MAP) {
    if (pattern.test(merchant)) return cat
  }
  return 'lifestyle'
}

function parseDate(raw: string): string {
  // Handle common formats: DD/MM/YYYY, YYYY-MM-DD, DD-MM-YYYY, MM/DD/YYYY HH:MM:SS
  const s = raw.trim()
  // ISO already
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  // Try JS Date as fallback
  const d = new Date(s)
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  return new Date().toISOString().slice(0, 10)
}

function parseCSV(text: string): string[][] {
  const lines = text.trim().split(/\r?\n/)
  return lines.map((line) => {
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
  })
}

function colIndex(headers: string[], ...names: string[]): number {
  for (const name of names) {
    const idx = headers.findIndex((h) => h.toLowerCase().includes(name.toLowerCase()))
    if (idx >= 0) return idx
  }
  return -1
}

export function parseEWalletCSV(text: string, provider: EWalletProvider): ParsedTransaction[] {
  const rows = parseCSV(text)
  if (rows.length < 2) return []
  const headers = rows[0].map((h) => h.replace(/[^\w\s\/\(\)]/g, '').trim())
  const dataRows = rows.slice(1)

  if (provider === 'tng') {
    const dateCol = colIndex(headers, 'date', 'datetime', 'date/time')
    const descCol = colIndex(headers, 'description', 'transaction', 'detail')
    const amtCol  = colIndex(headers, 'amount', 'amount (rm)', 'debit')
    const statusCol = colIndex(headers, 'status')

    return dataRows.flatMap((row) => {
      const status = statusCol >= 0 ? row[statusCol] : ''
      if (status && !/successful|success|completed/i.test(status)) return []
      const desc = row[descCol] ?? ''
      // Skip top-ups, refunds, transfers in
      if (/^(top.?up|reload|refund|cashback|reward|point|transfer in)/i.test(desc)) return []
      const rawAmt = row[amtCol] ?? ''
      const amount = Math.abs(parseFloat(rawAmt.replace(/[^0-9.]/g, '')) || 0)
      if (amount <= 0) return []
      const date = parseDate(row[dateCol] ?? '')
      const merchant = desc || 'TnG Purchase'
      return [{ date, merchant, amount, category: autoCategory(merchant), rawRow: row.join(',') }]
    })
  }

  if (provider === 'grab') {
    const dateCol   = colIndex(headers, 'date', 'created', 'datetime')
    const descCol   = colIndex(headers, 'description', 'name', 'transaction')
    const amtCol    = colIndex(headers, 'amount', 'total')
    const statusCol = colIndex(headers, 'status', 'state')

    return dataRows.flatMap((row) => {
      const status = statusCol >= 0 ? row[statusCol] : ''
      if (status && !/completed|success/i.test(status)) return []
      const rawAmt = row[amtCol] ?? ''
      const amount = Math.abs(parseFloat(rawAmt.replace(/[^0-9.]/g, '')) || 0)
      if (amount <= 0) return []
      const desc = row[descCol] ?? ''
      if (/^(top.?up|reload|refund|cashback)/i.test(desc)) return []
      const date = parseDate(row[dateCol] ?? '')
      const merchant = desc || 'GrabPay Purchase'
      return [{ date, merchant, amount, category: autoCategory(merchant), rawRow: row.join(',') }]
    })
  }

  if (provider === 'boost') {
    const dateCol   = colIndex(headers, 'transaction date', 'date')
    const merchantCol = colIndex(headers, 'merchant name', 'merchant', 'description')
    const amtCol    = colIndex(headers, 'amount')
    const statusCol = colIndex(headers, 'status')

    return dataRows.flatMap((row) => {
      const status = statusCol >= 0 ? row[statusCol] : ''
      if (status && !/success/i.test(status)) return []
      const rawAmt = row[amtCol] ?? ''
      const amount = Math.abs(parseFloat(rawAmt.replace(/[^0-9.]/g, '')) || 0)
      if (amount <= 0) return []
      const merchant = row[merchantCol] ?? 'Boost Purchase'
      if (/^(reload|refund|cashback)/i.test(merchant)) return []
      const date = parseDate(row[dateCol] ?? '')
      return [{ date, merchant, amount, category: autoCategory(merchant), rawRow: row.join(',') }]
    })
  }

  if (provider === 'shopeepay') {
    // ShopeePay CSV: "Transaction Date", "Transaction Description", "Amount", "Type"
    const dateCol = colIndex(headers, 'transaction date', 'date', 'datetime')
    const descCol = colIndex(headers, 'transaction description', 'description', 'detail', 'remark')
    const amtCol  = colIndex(headers, 'amount', 'total')
    const typeCol = colIndex(headers, 'type', 'transaction type')

    return dataRows.flatMap((row) => {
      const type = typeCol >= 0 ? row[typeCol] : ''
      // Only outgoing payments; skip top-ups, cashback, refunds
      if (/top.?up|cashback|refund|reward|incentive|transfer in/i.test(type + ' ' + (row[descCol] ?? ''))) return []
      const rawAmt = row[amtCol] ?? ''
      const amount = Math.abs(parseFloat(rawAmt.replace(/[^0-9.]/g, '')) || 0)
      if (amount <= 0) return []
      const merchant = (row[descCol] ?? '').replace(/^payment to\s*/i, '') || 'ShopeePay Purchase'
      const date = parseDate(row[dateCol] ?? '')
      return [{ date, merchant, amount, category: autoCategory(merchant), rawRow: row.join(',') }]
    })
  }

  if (provider === 'mae') {
    // MAE (Maybank e-wallet) CSV: "Date", "Description", "Debit", "Credit", "Balance"
    const dateCol = colIndex(headers, 'date', 'transaction date')
    const descCol = colIndex(headers, 'description', 'details', 'merchant')
    const debitCol = colIndex(headers, 'debit', 'debit amount', 'withdrawal')
    const amtCol  = debitCol >= 0 ? debitCol : colIndex(headers, 'amount')

    return dataRows.flatMap((row) => {
      const desc = row[descCol] ?? ''
      if (/transfer|topup|top-up|reload|incoming|salary|interbank|duitnow in|received/i.test(desc)) return []
      const rawAmt = row[amtCol] ?? ''
      const amount = Math.abs(parseFloat(rawAmt.replace(/[^0-9.]/g, '')) || 0)
      if (amount <= 0) return []
      const date = parseDate(row[dateCol] ?? '')
      const merchant = desc || 'MAE Purchase'
      return [{ date, merchant, amount, category: autoCategory(merchant), rawRow: row.join(',') }]
    })
  }

  if (provider === 'bigpay') {
    // BigPay CSV: "Date", "Description", "Amount", "Currency", "Status"
    const dateCol   = colIndex(headers, 'date', 'transaction date', 'created')
    const descCol   = colIndex(headers, 'description', 'merchant', 'name')
    const amtCol    = colIndex(headers, 'amount', 'total')
    const statusCol = colIndex(headers, 'status')

    return dataRows.flatMap((row) => {
      const status = statusCol >= 0 ? row[statusCol] : ''
      if (status && !/completed|success|approved/i.test(status)) return []
      const desc = row[descCol] ?? ''
      if (/reload|refund|cashback|transfer from|topup/i.test(desc)) return []
      const rawAmt = row[amtCol] ?? ''
      // BigPay shows outflows as negative; take absolute
      const amount = Math.abs(parseFloat(rawAmt.replace(/[^0-9.\-]/g, '')) || 0)
      if (amount <= 0) return []
      const date = parseDate(row[dateCol] ?? '')
      const merchant = desc || 'BigPay Purchase'
      return [{ date, merchant, amount, category: autoCategory(merchant), rawRow: row.join(',') }]
    })
  }

  if (provider === 'setel') {
    // Setel CSV: "Date", "Type", "Description", "Amount"
    // Setel is mainly for Petronas fuel/Mesra, skip fuel (non-qualifying) but keep Mesra store purchases
    const dateCol = colIndex(headers, 'date', 'transaction date')
    const typeCol = colIndex(headers, 'type', 'category')
    const descCol = colIndex(headers, 'description', 'merchant', 'detail')
    const amtCol  = colIndex(headers, 'amount', 'total')

    return dataRows.flatMap((row) => {
      const type = (row[typeCol] ?? '').toLowerCase()
      const desc = row[descCol] ?? ''
      // Skip fuel purchases and top-ups (fuel not tax-deductible)
      if (/fuel|petrol|ron|top.?up|reload|refund|cashback/i.test(type + ' ' + desc)) return []
      const rawAmt = row[amtCol] ?? ''
      const amount = Math.abs(parseFloat(rawAmt.replace(/[^0-9.]/g, '')) || 0)
      if (amount <= 0) return []
      const date = parseDate(row[dateCol] ?? '')
      const merchant = desc || 'Setel Mesra Purchase'
      return [{ date, merchant, amount, category: autoCategory(merchant), rawRow: row.join(',') }]
    })
  }

  return []
}
