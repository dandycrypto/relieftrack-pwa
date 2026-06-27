/**
 * lib/ocr-parsers.ts — Shared OCR parsing utilities.
 *
 * Canonical implementations of receipt/document text parsing functions
 * used by both the API route (server-side v1 fallback) and the client-side
 * lib/ocr.ts module. Extracted to eliminate ~800 lines of duplication.
 */

// ─── Category Keywords ─────────────────────────────────────────────────────────

export const CATEGORY_KEYWORDS: Record<string, string[]> = {
  "Food":          ["mamak","restaurant","cafe","coffee","kopitiam","nasi","laksa","satay","food","meal","lunch","dinner","breakfast","burger","pizza","sushi","mcdonald","kfc","starbucks","tealive","chedds","pasta","western","ayam","sirap","teh","roti","noodle","kueh","dessert"],
  "Transport":     ["petrol","parking","toll","lrt","mrt","bus","taxi","grab","car","motor","fuel","shell","petronas","caltex","ezca","touch n go","ticaet","single journey","simpang","heart centre","jalan","highway","mesra","plus","gamuda","mexp","bekal","kuching"],
  "Utilities":     ["electric","water","internet","phone","telco","maxis","unifi","tm","digi","celcom","utility","tenaga","air selangor"],
  "Office":        ["stationery","printer","ink","paper","office","amazon","shopee","lazada","shipping","courier","parcel","pos laju"],
  "Entertainment": ["netflix","spotify","movie","cinema","game","playstation","steam","youtube","disney","tiktok","instagram","whatsapp"],
  "Shopping":      ["shop","store","mall","parkson","sunway","midvalley","ikea","courts","harvey norman","guardian","watsons","a eon","yonex","victor","lining","mizuno","asics","badminton","tennis","grip","racket","sports","equipment","cycling","fitness","maju holdings","sports direct"],
  "Medical":       ["pharmacy","clinic","hospital","doctor","medical","guardian","watsons","ccm","dental","cancer","dialysis","fertility","ivf","vaccination","health screening"],
  "Insurance":     ["insurance","takaful","protect","coverage","prudent","aia","great eastern"],
}

// ─── Vendor Skip Patterns ──────────────────────────────────────────────────────

export const VENDOR_SKIP_PATTERNS = [
  /^(ssm|brn|sst|gst|tax|email|contact|tel|fax|addr|hp|handphone|mobile|phone|web|website)$/i,
  /^(http|www|www\.)/i,
  /^biz| business$/i,
  /^no\?:?\s*\d/i,
  /^table\s*\d/i,
  /^\+60\d/,
  /^6\d{9}/,
  /^\d{5,}/,
  /^\d{1,2}[/.\-]/,
  /^(processed|printed|powered|thank|visit|payment|cash|change|rounding|total|subtotal|tax|amt|quantity|qty|price|item)$/i,
  /^(bill\s*no|invoice|inv\.?|receipt|doc|no\.?|sr\.?|serial|reference|ref\.?|date|time|cashier|payment|change|balance|gain|cash\s+sales)$/i,
  /^[A-Z0-9][A-Z0-9\s]{1,15}[-/]\d{4,}$/,
  /^\d{6,}$/,
  /^(roc|bhd|ssm|co)$/i,
  /^(kuala lumpur|selangor|shah alam|pj|petaling|jaya|sungai|buloh|cyberjaya|putrajaya|johor|bahar|penang|melaka|ipoh|kd|kedah|kelantan|terengganu|pahang|perak|sarawak|sabah|labu|malaysia)$/i,
  /^\d{1,2}[,\-]\s*(jalan|jln|bandar|taman|lorong|tingkat|floor|bangunan|building|centre|center|plaza|mall)$/i,
  /^[a-z]\s+(jalan|jln|taman|bandar|lorong|persiaran|boulevard)$/i,
  /,\s*(sungai|buloh|shah alam|petaling|kuala lumpur|selangor|johor|penang|melaka|ipoh|kedah|kelantan|pahang|perak|sarawak|sabah|putrajaya|cyberjaya|40160|47000|50000)/i,
  /^[（(]?ROC[:\s]\d+[-]?\w*[)）]?$/,
  /^[A-Z][A-Z\s]{3,30},$/,
  /^.{4,50},$/,
]

// ─── Date Parsing (Tesseract-aware) ──────────────────────────────────────────

export function parseDate(text: string): { date: string | null, time: string | null } {
  const monthMap: Record<string, number> = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 }

  // DDMMYYYYhhmmssAMPM — RapidOCR concatenates date+time
  let m = text.match(/\b(\d{2})(\d{2})(\d{4})(\d{2}):(\d{2}):?(\d{2})?\s*(AM|PM)?/i)
  if (m) {
    try {
      const d = parseInt(m[1]), mo = parseInt(m[2]), yr = parseInt(m[3])
      if (!(1 <= mo && mo <= 12)) throw new Error("invalid month")
      let hr = parseInt(m[4]), mn = parseInt(m[5])
      const ap = (m[7] || "").toUpperCase()
      if (ap === "PM" && hr !== 12) hr += 12
      if (ap === "AM" && hr === 12) hr = 0
      return {
        date: `${yr}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        time: `${String(hr).padStart(2, '0')}:${String(mn).padStart(2, '0')}`
      }
    } catch {}
  }

  // Space-separated version from Tesseract
  m = text.match(/\b(\d)\s*(\d)\s*(\d)\s*(\d)\s*(\d)\s*(\d)\s*(\d)\s*(\d)\s*(\d)\s*(\d)\s*(\d)\s*(\d)\s*(AM|PM)?/i)
  if (m) {
    try {
      const mo = parseInt(m[3] + m[4])
      if (1 <= mo && mo <= 12) {
        const d = parseInt(m[1] + m[2])
        const yr = parseInt(m[5] + m[6] + m[7] + m[8])
        let hr = parseInt(m[9] + m[10]), mn = parseInt(m[11] + m[12])
        const ap = (m[13] || "").toUpperCase()
        if (ap === "PM" && hr !== 12) hr += 12
        if (ap === "AM" && hr === 12) hr = 0
        if (yr >= 2020 && yr <= 2030 && 1 <= d && d <= 31) {
          return {
            date: `${yr}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
            time: hr > 0 || mn > 0 ? `${String(hr).padStart(2, '0')}:${String(mn).padStart(2, '0')}` : null
          }
        }
      }
    } catch {}
  }

  // Standard separated date + time
  const patterns = [
    [/Invoice\s*Date[^0-9]*(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)?/i, "dmy_time"],
    [/(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})\s+(\d{1,2}):(\d{2})/i, "dmy_time2"],
    [/(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})/, "dmy"],
    [/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/, "ymd"],
    [/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})(?:\s+(\d{1,2}):(\d{2})\s*(am|pm))?/i, "dmy_text"],
    [/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),?\s+(\d{4})(?:\s+(\d{1,2}):(\d{2})\s*(am|pm))?/i, "mdy"],
  ]

  for (const [pattern, fmt] of patterns) {
    const match = text.match(pattern as RegExp)
    if (!match) continue
    try {
      if (fmt === "dmy_time") {
        let d = parseInt(match[1]), mo = parseInt(match[2]), yr = parseInt(match[3])
        if (yr < 100) yr += 2000
        let hr = parseInt(match[4]), mn = parseInt(match[5])
        const ap = (match[6] || "").toUpperCase()
        if (ap === "PM" && hr !== 12) hr += 12
        if (ap === "AM" && hr === 12) hr = 0
        return { date: `${yr}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`, time: `${String(hr).padStart(2,'0')}:${String(mn).padStart(2,'0')}` }
      } else if (fmt === "dmy_time2") {
        const d = parseInt(match[1]), mo = parseInt(match[2]), yr = parseInt(match[3])
        const hr = parseInt(match[4]), mn = parseInt(match[5])
        return { date: `${yr}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`, time: `${String(hr).padStart(2,'0')}:${String(mn).padStart(2,'0')}` }
      } else if (fmt === "dmy") {
        const parts = (match[0] as string).split(/[.\-/]/)
        const d = parseInt(parts[0]), mo = parseInt(parts[1]), yr = parseInt(parts[2])
        if (yr < 100) {
          return { date: `${yr + 2000}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`, time: null }
        }
        return { date: `${yr}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`, time: null }
      } else if (fmt === "ymd") {
        const parts = (match[0] as string).split(/[.\-/]/)
        const yr = parseInt(parts[0]), mo = parseInt(parts[1]), d = parseInt(parts[2])
        return { date: `${yr}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`, time: null }
      } else if (fmt === "dmy_text") {
        const d = parseInt(match[1]), yr = parseInt(match[3])
        const mo = monthMap[match[2].toLowerCase().slice(0,3)] || 1
        if (match[4] && match[5]) {
          let hr = parseInt(match[4]), mn = parseInt(match[5])
          const ap = (match[6] || "").toLowerCase()
          if (ap === "pm" && hr !== 12) hr += 12
          if (ap === "am" && hr === 12) hr = 0
          return { date: `${yr}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`, time: `${String(hr).padStart(2,'0')}:${String(mn).padStart(2,'0')}` }
        }
        return { date: `${yr}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`, time: null }
      } else if (fmt === "mdy") {
        const mo = monthMap[match[1].toLowerCase().slice(0,3)] || 1
        const d = parseInt(match[2]), yr = parseInt(match[3])
        if (match[4] && match[5]) {
          let hr = parseInt(match[4]), mn = parseInt(match[5])
          const ap = (match[6] || "").toLowerCase()
          if (ap === "pm" && hr !== 12) hr += 12
          if (ap === "am" && hr === 12) hr = 0
          return { date: `${yr}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`, time: `${String(hr).padStart(2,'0')}:${String(mn).padStart(2,'0')}` }
        }
        return { date: `${yr}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`, time: null }
      }
    } catch {}
  }

  return { date: null, time: null }
}

// ─── Amount Parsing (Tesseract-aware) ────────────────────────────────────────

export function extractAmount(text: string): number | null {
  // Shopee / digital receipt: "Total Paid" or "Amount Paid"
  let m = text.match(/(?:Total|Amount)\s*Paid[^0-9]*RM?\s*([\d,]+\.\d{2})/i)
  if (m) {
    const val = parseFloat(m[1].replace(/,/g, ''))
    if (!isNaN(val) && val > 0) return val
  }
  m = text.match(/(?:Total|Amount)[\s:]*Paid[\s\n]*RM?\s*([\d,]+\.\d{2})/i)
  if (m) {
    const val = parseFloat(m[1].replace(/,/g, ''))
    if (!isNaN(val) && val > 0) return val
  }

  // Medical/hospital receipts: TOTALBILL
  m = text.match(/TOTALBILL\s*:?\s*RM?\s*([\d,]+\.?\d*)/i)
  if (m) {
    const val = parseFloat(m[1].replace(/,/g, ''))
    if (val > 100) return val
  }

  // Shopee / LHDN e-invoice: Total Including Tax
  m = text.match(/Total\s*Including\s*Tax[^0-9]*([\d,]+\.\d{2})/i)
  if (m) {
    const val = parseFloat(m[1].replace(/,/g, ''))
    if (!isNaN(val) && val > 0) return val
  }

  // Shopee / LHDN e-invoice: Total Product/Service Amount
  m = text.match(/Total\s*Product[/ ]Service\s*Amount[^0-9]*([\d,]+\.\d{2})/i)
  if (m) {
    const val = parseFloat(m[1].replace(/,/g, ''))
    if (!isNaN(val) && val > 0) return val
  }

  // Shopee / LHDN e-invoice: Total Excluding Tax
  m = text.match(/Total\s*Excluding\s*Tax[^0-9]*([\d,]+\.\d{2})/i)
  if (m) {
    const val = parseFloat(m[1].replace(/,/g, ''))
    if (!isNaN(val) && val > 0) return val
  }

  // Grand Total
  m = text.match(/GRAND\s*TOTAL[^0-9]*([\d,]+\.\d{2})/i)
  if (m) {
    const val = parseFloat(m[1].replace(/,/g, ''))
    if (!isNaN(val) && val > 0) return val
  }

  // TOTAL / AMOUNT DUE / PAYABLE
  m = text.match(/(?:TOTAL|Total|AMOUNT\s*DUE|PAYABLE)[^0-9]*([\d,]+\.\d{2})/i)
  if (m) {
    const val = parseFloat(m[1].replace(/,/g, ''))
    if (!isNaN(val) && val > 0) return val
  }

  // RM/SGD/USD followed by amount
  m = text.match(/(?:RM|SGD|USD)\s*([\d,]+\.\d{2})/i)
  if (m) {
    const val = parseFloat(m[1].replace(/,/g, ''))
    if (!isNaN(val) && val > 0) return val
  }

  // Amount followed by currency
  m = text.match(/([\d,]+\.\d{2})\s*(?:RM|SGD|USD)/i)
  if (m) {
    const val = parseFloat(m[1].replace(/,/g, ''))
    if (!isNaN(val) && val > 0) return val
  }

  // Flex RM pattern — Tesseract quirk: "RM 2. 45" (space after dot)
  m = text.match(/RM\s*([\d,]+)\.?\s*(\d{2})/i)
  if (m) {
    try {
      const val = parseFloat(`${m[1]}.${m[2]}`)
      if (!isNaN(val) && val > 0 && val <= 9999) return val
    } catch {}
  }

  // Fallback: weighted keyword proximity scoring
  const KW_WEIGHTS: Array<[RegExp, number]> = [
    [/\bgrand\s*total\b/i, 100],
    [/\btotal\s*including\s*tax\b/i, 95],
    [/\btotal\s*billed\b/i, 90],
    [/\bamount\s*due\b/i, 85],
    [/\bpayable\b/i, 80],
    [/\bamount\s*payable\b/i, 80],
    [/\btotal\b/i, 75],
    [/\bnett?\b/i, 70],
    [/\bsubtotal\b/i, 50],
    [/\bsales\b/i, 45],
    [/\bcharge\b/i, 40],
    [/\bfee\b/i, 35],
    [/\brounding\b/i, 30],
    [/\bbayar\b/i, 65],
    [/\bjumlah\b/i, 70],
    [/\bbil\b/i, 60],
    [/\bresit\b/i, 25],
    [/\bbalance\b/i, 20],
    [/\bcredit\b/i, 15],
    [/\bpayment\b/i, 15],
    [/\bcash\b/i, 10],
    [/\btendered\b/i, 10],
    [/\bchange\b/i, 5],
    [/\bbaki\b/i, 5],
    [/\btunai\b/i, 10],
    [/\bRM\s/i, 8],
  ]

  interface Cand { val: number; weight: number; line: string }
  const candidates: Cand[] = []
  const amountRegex = /(?<![.\d])(\d{1,4}[,.]?\d{0,2}[,.]?\d{2})(?![.\d])/g
  while ((m = amountRegex.exec(text)) !== null) {
    try {
      const val = parseFloat(m[1].replace(/,/g, ''))
      if (isNaN(val) || val < 0.01 || val > 9999) continue
      const idx = m.index!
      const ctx = text.slice(Math.max(0, idx - 10), idx + 10)
      if (/\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}/.test(ctx)) continue
      const lineStart = text.lastIndexOf('\n', idx) + 1
      const lineEnd = text.indexOf('\n', idx)
      const line = text.slice(lineStart, lineEnd === -1 ? idx + 30 : lineEnd).toLowerCase()
      let bestWeight = 0
      for (const [pattern, weight] of KW_WEIGHTS) {
        if (pattern.test(line)) {
          if (weight > bestWeight) bestWeight = weight
        }
      }
      if (bestWeight > 0) {
        candidates.push({ val, weight: bestWeight, line })
      }
    } catch {}
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => b.weight - a.weight || b.val - a.val)
    return candidates[0].val
  }

  return null
}

// ─── Currency Detection ──────────────────────────────────────────────────────

export function detectCurrency(text: string): string {
  if (/\bSGD|S\$\s|SINGAPORE\b/i.test(text)) return "SGD"
  if (/\bUSD|\$\s*[0-9]/i.test(text)) return "USD"
  return "MYR"
}

// ─── Tax Exempt Detection ────────────────────────────────────────────────────

export function detectTaxExempt(text: string): boolean {
  if (/tax\s*exempt|sst\s*exempt|gst\s*exempt|no\s*(sst|gst|tax)/i.test(text)) return true
  if (!/sst|gst|tax|vat/i.test(text)) {
    if (/education|medical|health|consultation/i.test(text)) return true
  }
  return false
}

// ─── Vendor Extraction (Tesseract-aware) ─────────────────────────────────────

export function extractVendor(text: string): string {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

  // Priority 1: Shopee e-invoice
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const line = lines[i]
    if (line === 'E-Invoice') {
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1]
        if (/Order\s*number|Order\s*Number/i.test(nextLine)) {
          for (let j = i + 2; j < Math.min(i + 5, lines.length); j++) {
            const cand = lines[j]
            if (!cand) continue
            let skip = false
            for (const p of VENDOR_SKIP_PATTERNS) {
              if (p.test(cand)) { skip = true; break }
            }
            if (skip) continue
            const cleaned = cand.replace(/[^\w\s\-&()/.]/g, ' ').trim()
            if (cleaned.length >= 2) return cleaned.slice(0, 80)
          }
        } else if (nextLine && !/\b(selangor|kuala lumpur|shah alam|sungei|sungai buloh|petaling|pj|cyberjaya|putrajaya|johor bahru|penang|melaka|ipoh|kedah|kelantan|terengganu|pahang|perak|sarawak|sabah|malaysia|40160|47000|50000)\b/i.test(nextLine) && !/^[A-Z][A-Z\s]{3,30},$/.test(nextLine)) {
          let skip = false
          for (const p of VENDOR_SKIP_PATTERNS) {
            if (p.test(nextLine)) { skip = true; break }
          }
          if (!skip) {
            const cleaned = nextLine.replace(/[^\w\s\-&()/.]/g, ' ').trim()
            if (cleaned.length > 1) return cleaned.slice(0, 80)
          }
        }
      }
    }
  }

  // Priority 2: Shopee — Seller Username
  const sellerMatch = text.match(/Seller\s*Username:\s*([A-Za-z0-9._]{2,30})/i)
  if (sellerMatch) return sellerMatch[1].trim().slice(0, 80)

  // Priority 2b: Shopee multi-line — "Order number" on one line, seller name on NEXT
  let skipNext = false
  for (const line of lines) {
    if (/Order\s*number|Order\s*Number/i.test(line)) {
      skipNext = true
      continue
    }
    if (skipNext) {
      const cand = line.trim()
      if (cand) {
        let skip = false
        for (const p of VENDOR_SKIP_PATTERNS) {
          if (p.test(cand)) { skip = true; break }
        }
        if (!skip) {
          const cleaned = cand.replace(/[^\w\s\-&()/.]/g, ' ').trim()
          if (cleaned.length >= 2) return cleaned.slice(0, 80)
        }
      }
      break
    }
  }

  // Priority 3: fallback — first substantial text line with company suffix
  const COMPANY_SUFFIX = /\b(sdn\s*bhd|sdn\.?\s*bhd|berhad|bhd|inc\.?|llc|ltd\.?|pty|corp\.?|company|co\.?|group|holdings|enterprises|services|industries|trading|enterprise)\b/i
  for (let i = 0; i < Math.min(40, lines.length); i++) {
    const line = lines[i]
    if (/\b(selangor|kuala lumpur|shah alam|sungei|sungai buloh|petaling|pj|cyberjaya|putrajaya|johor bahru|penang|melaka|ipoh|kedah|kelantan|terengganu|pahang|perak|sarawak|sabah|malaysia|40160|47000|50000)\b/i.test(line)) continue
    if (/^[A-Z][A-Z\s]{3,30},$/.test(line)) continue
    if (/^(continue|submit|generate|cancel|ok|yes|no|next|back|close|done|accept|decline|open|save|share|download|print|view|more|less)\b/i.test(line)) continue
    if (line.length > 100) continue
    if (/^(generative|ai|user|guidelines?|welcome|loading|please|thank|thank\s*you|introduction|summary|description|instructions?)\b/i.test(line)) continue
    if (/\b(user\s*guidelines|generative\s*ai|continue\s*$|click\s*here|tap\s*to)\b/i.test(line)) continue
    let skip = false
    for (const p of VENDOR_SKIP_PATTERNS) {
      if (p.test(line)) { skip = true; break }
    }
    if (skip) continue
    const cleaned = line.replace(/[^\w\s\-&()/.]/g, ' ').trim()
    if (cleaned.length < 2) continue
    if (COMPANY_SUFFIX.test(line)) {
      const SUFFIX_PATTERNS: Array<[string, RegExp]> = [
        ['sdn bhd', /\bsdn\.?\s*bhd\b/i],
        ['berhad', /\bberhad\b/i],
        ['bhd', /\bbhd\b/i],
        ['inc.', /\binc\.?\b/i],
        ['llc', /\bllc\b/i],
        ['ltd.', /\bltd\.?\b/i],
        ['corp.', /\bcorp\.?\b/i],
        ['company', /\bcompany\b/i],
        ['holdings', /\bholdings\b/i],
        ['enterprises', /\benterprises?\b/i],
        ['industries', /\bindustries\b/i],
        ['trading', /\btrading\b/i],
        ['services', /\bservices\b/i],
        ['group', /\bgroup\b/i],
        ['pty.', /\bpty\.?\b/i],
      ]
      const SUFFIX_PRIORITY: Record<string, number> = {
        'sdn bhd': 100, 'berhad': 95, 'bhd': 90,
        'inc.': 80, 'llc': 80, 'ltd.': 80, 'corp.': 80, 'company': 80,
        'holdings': 60, 'enterprises': 55, 'industries': 50,
        'trading': 45, 'services': 40, 'group': 35, 'pty.': 30,
      }
      let bestStart = -1
      let bestSuffix = ''
      let bestPriority = -1
      for (const [name, pat] of SUFFIX_PATTERNS) {
        const sm = cleaned.match(pat)
        if (sm && sm.index !== undefined) {
          const pri = SUFFIX_PRIORITY[name] ?? 0
          if (pri > bestPriority || (pri === bestPriority && sm.index > bestStart)) {
            bestStart = sm.index
            bestSuffix = sm[0]
            bestPriority = pri
          }
        }
      }
      if (bestStart >= 0) {
        const before = cleaned.substring(0, bestStart).trim()
        const words = before.split(/\s+/)
        const junkWords = new Set(['pay', 'here', 'deposit', 'myr', 'rm', 'cash', 'bill', 'invoice', 'to', 'paying', 'at', 'from', 'the'])
        const amountPat = /^(myr|rm|rp|usd|sgd|eur|gbp)?\s*\d+([.,]\d+)?$/i
        const kept: string[] = []
        for (let wi = words.length - 1; wi >= 0; wi--) {
          const w = words[wi]
          const wLower = w.toLowerCase().replace(/[,\.]+$/, '')
          if (junkWords.has(wLower)) continue
          if (amountPat.test(w)) continue
          if (/^[^\w]+$/.test(w)) continue
          kept.unshift(w)
          if (kept.length >= 4) break
        }
        let companyName = (kept.length > 0 ? kept.join(' ') + ' ' + bestSuffix : cleaned.replace(/\s+\d.*$/, '').trim())
          .replace(/\s+/g, ' ').trim()
          .replace(/\s+\d.*$/, '').trim()
        return companyName.slice(0, 80) || cleaned.slice(0, 80)
      }
      return cleaned.replace(/\s+\d.*$/, '').trim().slice(0, 80) || cleaned.slice(0, 80)
    }
  }

  // Step B: fall back to first valid line
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    const line = lines[i]
    if (/\b(selangor|kuala lumpur|shah alam|sungei|sungai buloh|petaling|pj|cyberjaya|putrajaya|johor bahru|penang|melaka|ipoh|kedah|kelantan|terengganu|pahang|perak|sarawak|sabah|malaysia|40160|47000|50000)\b/i.test(line)) continue
    if (/^[A-Z][A-Z\s]{3,30},$/.test(line)) continue
    if (/^(continue|submit|generate|cancel|ok|yes|no|next|back|close|done|accept|decline|open|save|share|download|print|view|more|less)\b/i.test(line)) continue
    if (line.length > 60) continue
    if (/^(generative|ai|user|guidelines?|welcome|loading|please|thank|thank\s*you|introduction|summary|description|instructions?)\b/i.test(line)) continue
    if (/\b(user\s*guidelines|generative\s*ai|continue\s*$|click\s*here|tap\s*to)\b/i.test(line)) continue
    if (/^(invoice|inv\.?|receipt|receiptno|bill|doc|date|time|cashier|account|payment|change|balance|order|ref|reference)\b/i.test(line)) continue
    let skip = false
    for (const p of VENDOR_SKIP_PATTERNS) {
      if (p.test(line)) { skip = true; break }
    }
    if (skip) continue
    const cleaned = line.replace(/[^\w\s\-&()/.]/g, ' ').trim()
    if (cleaned.length >= 2) return cleaned.slice(0, 80)
  }

  return 'Unknown Merchant'
}

// ─── Invoice Number Extraction ───────────────────────────────────────────────

export function extractInvoiceNumber(text: string): string | null {
  let m = text.match(/Invoice\s*No\.?\/\s*Code[^A-Z0-9]*([A-Z0-9]{10,})/i)
  if (m) return m[1].toUpperCase().slice(0, 30)

  m = text.match(/Bill\s*No[.:]\s*([A-Z0-9][A-Z0-9/\-]{5,30})/i)
  if (m) return m[1].toUpperCase().slice(0, 30)

  m = text.match(/ReceiptNumber:\s*([A-Z0-9]{10,30})/i)
  if (m) return m[1].toUpperCase().slice(0, 30)

  m = text.match(/\b([A-Z]{2,}\d{4,}\s*INV\s*\d+)\b/i)
  if (m) return m[1].replace(/\s/g, '').toUpperCase().slice(0, 30)

  m = text.match(/\bINV(\d{4,})\b/i)
  if (m) return `INV${m[1]}`.toUpperCase().slice(0, 30)

  const patterns = [
    /Invoice\s*(?:No|Number|#|ID)?[.:]?\s*([A-Z0-9]{6,})/i,
    /\b(26\d{12,})\b/,
    /invoice\s*#?\s*:?\s*([A-Z0-9]{4,20})/i,
    /inv\s*#?\s*:?\s*([A-Z0-9]{4,20})/i,
    /receipt\s*#?\s*:?\s*([A-Z0-9]{4,20})/i,
    /doc\s*#?\s*:?\s*([A-Z0-9]{4,20})/i,
    /transaction\s*#?\s*:?\s*([A-Z0-9]{4,20})/i,
    /ref\s*#?\s*:?\s*([A-Z0-9]{4,20})/i,
    /([A-Z]{1,3}\d{4,15})/,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match && match[1]) {
      const cleaned = match[1].replace(/(PDF|JPG|JPEG|PNG|IMAGE|FILE|IMG|PHOTO|PIC|DOC|TIFF|BMP)$/i, '').toUpperCase().slice(0, 30)
      if (cleaned.length >= 4) return cleaned
    }
  }
  return null
}

// ─── Category Suggestion ─────────────────────────────────────────────────────

export function suggestCategory(text: string): string {
  const textLower = text.toLowerCase()
  const scores: Record<string, number> = {}

  for (const [cat, kws] of Object.entries(CATEGORY_KEYWORDS)) {
    scores[cat] = kws.filter(kw => textLower.includes(kw)).length
  }

  // Vendor-specific overrides (high confidence)
  const vendorPriority: Array<[RegExp, string]> = [
    [/guardian|caring\s*pharmacy|watsons|alpro\s*pharmacy|big\s*pharmacy/i, "medical_self"],
    [/^\s*tm\s|unifi|maxis\s|celcom\s|digi\s|time\.com/i, "utilities"],
    [/^\s*syabas\s|air\s*selangor|tenaga\s*nasional|tnb\s/i, "utilities"],
    [/^\s*aia\s|prudential|great\s*eastern|takaful\s/i, "insurance"],
    [/shell\s|petronas\s|caltex\s|bhp\s/i, "transport"],
    [/starbucks|mcdonald|kfc\s|pizza\s*hut|texas\s*chicken|tealive|chatime/i, "lifestyle"],
  ]
  for (const [pattern, category] of vendorPriority) {
    if (pattern.test(text)) return category
  }

  const maxCat = Object.entries(scores).sort(([,a], [,b]) => b - a)[0]
  if (maxCat && maxCat[1] > 0) {
    const map: Record<string, string> = {
      "Food": "lifestyle",
      "Transport": "transport",
      "Utilities": "utilities",
      "Office": "lifestyle",
      "Entertainment": "lifestyle",
      "Shopping": "lifestyle",
      "Medical": "medical_self",
      "Insurance": "insurance",
    }
    if (map[maxCat[0]]) return map[maxCat[0]]
  }

  if (/\b(hospital|clinic|pharmacy|pantai|gleneagles|sunway|medical|health)\b/i.test(text)) return "medical_self"
  if (/\b(epf|kwsp|protection|takaful|insurance|aia|allianz|greateastern|etiqa)\b/i.test(text)) return "epf_insurance"
  if (/\b(university|college|edu|tuition|udemy|coursera|skillshare)\b/i.test(text)) return "education_self"
  if (/\b(book|mph|kinokuniya|popular|bookstore)\b/i.test(text)) return "lifestyle"
  if (/\b(apple|macbook|iphone|samsung|phone|gadget)\b/i.test(text)) return "lifestyle"
  if (/\b(harvey norman|courts|lazada|shopee)\b/i.test(text)) return "lifestyle"
  if (/\b(sports|decathlon|nike|adidas|puma|asics|running)\b/i.test(text)) return "lifestyle"
  if (/\b(internet|unifi|maxis|celcom|digi)\b/i.test(text)) return "lifestyle"

  return "lifestyle"
}

// ─── Line Items Extraction ───────────────────────────────────────────────────

export function extractLineItems(text: string): string {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const items: string[] = []

  for (const line of lines) {
    const m = line.match(/^([A-Za-z0-9\s\-&()/.]{4,35})\s+(\d+)\s+(?:UNIT|UNITS|PCS|PC|ITEM|KG|PCE)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})/i)
    if (m) {
      items.push(m[1].trim())
      if (items.length >= 3) break
      continue
    }
    const m2 = line.match(/^([A-Za-z][A-Za-z0-9\s\-&()/.]{3,30})\s+(\d+)\s+([\d,]+\.\d{2})/i)
    if (m2 && !items.includes(m2[1].trim())) {
      items.push(m2[1].trim())
      if (items.length >= 3) break
    }
  }

  return items.slice(0, 3).join('; ')
}

// ─── Notes Extraction ────────────────────────────────────────────────────────

export function extractNotes(text: string, invoiceNumber: string | null, time: string | null): string {
  const parts: string[] = []
  const lines = text.split('\n')

  for (const line of lines) {
    const m1 = line.match(/(?:SUBTOTAL|Subtotal)[^0-9]*([\d,]+\.\d{2})/i)
    if (m1) { parts.push(`Subtotal:${m1[1]}`); continue }

    const m2 = line.match(/(?:SST|GST|TAX)[^0-9]*(?:(\d+)%)?[^0-9]*([\d,]+\.\d{2})/i)
    if (m2) {
      const label = m2[1] ? `Tax${m2[1]}%` : 'Tax'
      parts.push(`${label}:${m2[m2[2] ? 2 : 0]}`)
      continue
    }

    const m3 = line.match(/CASH[^0-9]*([\d,]+\.\d{2})/i)
    if (m3) { parts.push(`Cash:${m3[1]}`); continue }

    const m4 = line.match(/CHANGE[^0-9]*([\d,]+\.\d{2})/i)
    if (m4) { parts.push(`Change:${m4[1]}`); continue }
  }

  if (invoiceNumber) return `Inv#: ${invoiceNumber} | ${parts.join(' | ')}`
  if (time) return `Time: ${time} | ${parts.join(' | ')}`
  return parts.join(' | ')
}

// ─── Tax Amount Extraction ───────────────────────────────────────────────────

export function extractTaxAmount(text: string): number | null {
  const patterns = [
    /gst\s*:?\s*RM?\s*([\d,]+\.?\d*)/i,
    /sst\s*:?\s*RM?\s*([\d,]+\.?\d*)/i,
    /tax\s*:?\s*RM?\s*([\d,]+\.?\d*)/i,
    /vat\s*:?\s*RM?\s*([\d,]+\.?\d*)/i,
    /service\s*tax\s*:?\s*RM?\s*([\d,]+\.?\d*)/i,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      const num = parseFloat(match[1].replace(/,/g, ''))
      if (!isNaN(num) && num > 0 && num < 100000) return num
    }
  }
  return null
}

// ─── EA Form ID Pattern Matching ──────────────────────────────────────────────

export const KWSP_MEMBER_PATTERNS = [
  /No\.?\s*Kad\s*KWSP.*?([A-Z0-9]{10,12})/i,
  /Member\s*No[\.:]?\s*([A-Z0-9]{10,12})/i,
  /KWSP\s*ID[\.:]?\s*([A-Z0-9]{10,12})/i,
  /No\.?\s*Ahli[\.:]?\s*([A-Z0-9]{10,12})/i,
]

export const TIN_PATTERNS = [
  /TIN[\s:]*([0-9-]{10,20})/i,
  /NO\.?\s*TIN[\s:]*([0-9-]{10,20})/i,
  /NO\.?\s*CUKAI[\s:]*([0-9-]{10,20})/i,
]

export const EA_FORM_NUMBER_PATTERNS = [
  /EA\s*Form\s*(?:No[\.:]|Number|#)?\s*([A-Z0-9-]{5,20})/i,
  /EASY\s*II\s*ID[\.:]?\s*([A-Z0-9-]{5,15})/i,
]

/**
 * Extract a value using the first matching pattern from a list.
 */
export function extractFirstMatch(text: string, patterns: RegExp[]): string | undefined {
  for (const pat of patterns) {
    const m = text.match(pat)
    if (m) return m[1]
  }
  return undefined
}

// ─── floorRM — LHDN whole-number rule ────────────────────────────────────────

export const floorRM = (amount: number): number => Math.floor(amount)
