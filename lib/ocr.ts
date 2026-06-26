/**
 * OCR Module — Server-side RapidOCR via Next.js API route.
 * Supports: images (jpg, png, webp) and PDF.
 * Parsing done server-side with RapidOCR (PP-OCRv4 ONNX); client gets pre-parsed JSON.
 */

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

// ─── Category Keywords (from receipt_processor.py) ──────────────────────────
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  "Food":          ["mamak","restaurant","cafe","coffee","kopitiam","nasi","laksa","satay","food","meal","lunch","dinner","breakfast","burger","pizza","sushi","mcdonald","kfc","starbucks","tealive","chedds","pasta","western","ayam","sirap","teh","roti","noodle","kueh","dessert"],
  "Transport":     ["petrol","parking","toll","lrt","mrt","bus","taxi","grab","car","motor","fuel","shell","petronas","caltex","ezca","touch n go","ticaet","single journey","simpang","heart centre","jalan","highway","mesra","plus","gamuda","mexp","bekal","kuching"],
  "Utilities":     ["electric","water","internet","phone","telco","maxis","unifi","tm","digi","celcom","utility","tenaga","air selangor"],
  "Office":        ["stationery","printer","ink","paper","office","amazon","shopee","lazada","shipping","courier","parcel","pos laju"],
  "Entertainment": ["netflix","spotify","movie","cinema","game","playstation","steam","youtube","disney","tiktok","instagram","whatsapp"],
  "Shopping":      ["shop","store","mall","parkson","sunway","midvalley","ikea","courts","harvey norman","guardian","watsons","a eon","yonex","victor","lining","mizuno","asics","badminton","tennis","grip","racket","sports","equipment","cycling","fitness","maju holdings","sports direct"],
  "Medical":       ["pharmacy","clinic","hospital","doctor","medical","guardian","watsons","ccm","dental","cancer","dialysis","fertility","ivf","vaccination","health screening"],
  "Insurance":     ["insurance","takaful","protect","coverage","prudent","aia","great eastern"],
}

// ─── Tax Deduction Detection ─────────────────────────────────────────────────

function detectTaxDeduction(text: string, data: { category: string }, inferredRecipient?: string): { lhdNCategory: string, recipient: string } {
  // Transport/toll items are never tax-deductible
  if (data.category === "Transport") {
    return { lhdNCategory: "", recipient: "" }
  }
  for (const [pattern, taxType, recipientHint] of TAX_DEDUCTION_PATTERNS) {
    if (pattern.test(text)) {
      // If actual inferred recipient != self, use it instead of pattern hint
      const recipient = (inferredRecipient && inferredRecipient !== "" && inferredRecipient !== "self")
        ? inferredRecipient
        : recipientHint
      return { lhdNCategory: taxType, recipient }
    }
  }
  return { lhdNCategory: "", recipient: "" }
}

// ─── Date Parsing (Tesseract-aware) ─────────────────────────────────────────

function parseDate(text: string): { date: string | null, time: string | null } {
  const monthMap: Record<string, number> = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 }

  // DDMMYYYYhhmmssAMPM — RapidOCR concatenates date+time, e.g. "InvoiceDate:1904202607:12PM"
  // Tesseract may produce spaces like "Invoice Date : 1 9 0 4 2 0 2 6 0 7 : 1 2 PM"
  // Pattern: 2 digits + 2 digits + 4 digits + 2 digits + : + 2 digits + optional :SS + AM/PM
  let m = text.match(/\b(\d{2})(\d{2})(\d{4})(\d{2}):(\d{2}):?(\d{2})?\s*(AM|PM)?/i)
  if (m) {
    try {
      const d = parseInt(m[1]), mo = parseInt(m[2]), yr = parseInt(m[3])
      if (!(1 <= mo && mo <= 12)) throw new Error("invalid month")
      let hr = parseInt(m[4]), mn = parseInt(m[5])
      const ss = m[6] ? parseInt(m[6]) : 0
      const ap = (m[7] || "").toUpperCase()
      if (ap === "PM" && hr !== 12) hr += 12
      if (ap === "AM" && hr === 12) hr = 0
      return {
        date: `${yr}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        time: `${String(hr).padStart(2, '0')}:${String(mn).padStart(2, '0')}`
      }
    } catch {}
  }

  // Also try space-separated version from Tesseract: "1 9 0 4 2 0 2 6 0 7 : 1 2 PM"
  m = text.match(/\b(\d)\s*(\d)\s*(\d)\s*(\d)\s*(\d)\s*(\d)\s*(\d)\s*(\d)\s*(\d)\s*(\d)\s*(\d)\s*(\d)\s*(AM|PM)?/i)
  if (m) {
    try {
      // Could be dd mm yyyy or just a phone number — validate month
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
    // Invoice Date DD/MM/YYYY HH:MM AM/PM
    [/Invoice\s*Date[^0-9]*(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)?/i, "dmy_time"],
    // DD/MM/YYYY HH:MM
    [/(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})\s+(\d{1,2}):(\d{2})/i, "dmy_time2"],
    // DD/MM/YYYY or DD-MM-YYYY
    [/(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})/, "dmy"],
    // YYYY-MM-DD
    [/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/, "ymd"],
    // DD MMM YYYY HH:MM AM/PM e.g. "20 April 2026 8:34 am"
    [/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})(?:\s+(\d{1,2}):(\d{2})\s*(am|pm))?/i, "dmy_text"],
    // MMM DD, YYYY
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

// ─── Amount Parsing (Tesseract-aware) ───────────────────────────────────────

function extractAmount(text: string): number | null {
  // Medical/hospital receipts: TOTALBILL is the grand total (HIGH priority)
  let m = text.match(/TOTALBILL\s*:?\s*RM?\s*([\d,]+\.?\d*)/i)
  if (m) {
    const val = parseFloat(m[1].replace(/,/g, ''))
    if (val > 100) return val // Medical bills are never < 100
  }

  // Shopee / LHDN e-invoice: Total Including Tax (high priority)
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

  // Fallback: look for amounts near transaction keywords with priority weights
  // Priority: GRAND TOTAL > TOTAL > NETT/NET > AMOUNT DUE/PAYABLE > SUBTOTAL > SALES > CHARGE/FEE > BALANCE > CASH > CHANGE
  // (CASH/CHANGE are often LARGER than the actual total, so we don't pick by max value)
  const KW_WEIGHTS: Array<[string, number]> = [
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
    [/\bbayar\b/i, 65],          // Malay: amount to pay
    [/\bjumlah\b/i, 70],         // Malay: total
    [/\bbil\b/i, 60],            // Malay: bill
    [/\bresit\b/i, 25],          // Malay: receipt (low priority)
    [/\bbalance\b/i, 20],
    [/\bcredit\b/i, 15],
    [/\bpayment\b/i, 15],
    [/\bcash\b/i, 10],           // CASH tendered is usually >= TOTAL but not the total itself
    [/\btendered\b/i, 10],
    [/\bchange\b/i, 5],          // CHANGE is always leftover, lowest
    [/\bbaki\b/i, 5],            // Malay: balance/change
    [/\btunai\b/i, 10],          // Malay: cash
    [/\bRM\s/i, 8],              // generic RM prefix
  ]

  interface Cand { val: number; weight: number; line: string }
  const candidates: Cand[] = []
  const amountRegex = /(?<![.\d])(\d{1,4}[,.]?\d{0,2}[,.]?\d{2})(?![.\d])/g
  while ((m = amountRegex.exec(text)) !== null) {
    try {
      const val = parseFloat(m[1].replace(/,/g, ''))
      if (isNaN(val) || val < 0.01 || val > 9999) continue
      // Skip amounts part of a date context
      const ctx = text.slice(Math.max(0, m.index - 10), m.index + 10)
      if (/\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}/.test(ctx)) continue
      // Get the full line containing this amount
      const lineStart = text.lastIndexOf('\n', m.index) + 1
      const lineEnd = text.indexOf('\n', m.index)
      const line = text.slice(lineStart, lineEnd === -1 ? m.index + 30 : lineEnd).toLowerCase()
      // Find best matching keyword weight
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
    // Pick highest-weight candidate; tiebreak by larger amount (prefer total over subtotal)
    candidates.sort((a, b) => b.weight - a.weight || b.val - a.val)
    return candidates[0].val
  }

  return null
}

// ─── Currency Detection ──────────────────────────────────────────────────────

function detectCurrency(text: string): string {
  if (/\bSGD|S\$\s|SINGAPORE\b/i.test(text)) return "SGD"
  if (/\bUSD|\$\s*[0-9]/i.test(text)) return "USD"
  return "MYR"
}

// ─── Tax Exempt Detection ────────────────────────────────────────────────────

function detectTaxExempt(text: string): boolean {
  // If SST or GST is explicitly mentioned as 0 or "exempt", or no tax on receipt
  if (/tax\s*exempt|sst\s*exempt|gst\s*exempt|no\s*(sst|gst|tax)/i.test(text)) return true
  // If "sst" or "gst" doesn't appear anywhere, could be tax-exempt category
  if (!/sst|gst|tax|vat/i.test(text)) {
    // Check for categories that are typically tax-exempt
    if (/education|medical|health|consultation/i.test(text)) return true
  }
  return false
}

// ─── Vendor Extraction (Tesseract-aware) ────────────────────────────────────

const VENDOR_SKIP_PATTERNS = [
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
  // Malaysian city/state names
  /^(kuala lumpur|selangor|shah alam|pj|petaling|jaya|sungai|buloh|cyberjaya|putrajaya|johor|bahar|penang|melaka|ipoh|kd|kedah|kelantan|terengganu|pahang|perak|sarawak|sabah|labu|malaysia)$/i,
  /^\d{1,2}[,\-]\s*(jalan|jln|bandar|taman|lorong|tingkat|floor|bangunan|building|centre|center|plaza|mall)$/i,
  /^[a-z]\s+(jalan|jln|taman|bandar|lorong|persiaran|boulevard)$/i,
  // Lines with comma + Malaysian city/state/area name
  /,\s*(sungai|buloh|shah alam|petaling|kuala lumpur|selangor|johor|penang|melaka|ipoh|kedah|kelantan|pahang|perak|sarawak|sabah|putrajaya|cyberjaya|40160|47000|50000)/i,
  // ROC / company registration number lines
  /^[（(]?ROC[:\s]\d+[-]?\w*[)）]?$/,
  // All-uppercase address fragments ending in comma
  /^[A-Z][A-Z\s]{3,30},$/,
  // Lines that are just location descriptors with commas
  /^.{4,50},$/,
]

function extractVendor(text: string): string {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

  // Priority 1: Shopee e-invoice — E-Invoice header + shop username on next line
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const line = lines[i]
    if (line === 'E-Invoice') {
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1]
        // If next line is "Order number" (label), skip label + order ID and take the shop name
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

  // Priority 2: Shopee — Seller Username: ijsports.n
  const sellerMatch = text.match(/Seller\s*Username:\s*([A-Za-z0-9._]{2,30})/i)
  if (sellerMatch) return sellerMatch[1].trim().slice(0, 80)

  // Priority 2b: Shopee multi-line — "Order number" on one line, seller/shop name on NEXT line
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

  // Priority 3: fallback — first substantial text line
  // Step A: prefer lines with company suffix (Sdn Bhd, Berhad, Bhd, Inc, LLC, etc.)
  const COMPANY_SUFFIX = /\b(sdn\s*bhd|sdn\.?\s*bhd|berhad|bhd|inc\.?|llc|ltd\.?|pty|corp\.?|company|co\.?|group|holdings|enterprises|services|industries|trading|enterprise)\b/i
  for (let i = 0; i < Math.min(40, lines.length); i++) {
    const line = lines[i]
    if (/\b(selangor|kuala lumpur|shah alam|sungei|sungai buloh|petaling|pj|cyberjaya|putrajaya|johor bahru|penang|melaka|ipoh|kedah|kelantan|terengganu|pahang|perak|sarawak|sabah|malaysia|40160|47000|50000)\b/i.test(line)) {
      continue
    }
    if (/^[A-Z][A-Z\s]{3,30},$/.test(line)) {
      continue
    }
    // Skip UI/browser noise (e.g. "Continue", "Submit", "Generate", button labels)
    if (/^(continue|submit|generate|cancel|ok|yes|no|next|back|close|done|accept|decline|open|save|share|download|print|view|more|less)\b/i.test(line)) {
      continue
    }
    // Skip lines that look like prompts/headings (start with capital, end with period, very long)
    if (line.length > 100) {
      continue
    }
    // Skip lines that start with very generic words that suggest UI text
    if (/^(generative|ai|user|guidelines?|welcome|loading|please|thank|thank\s*you|introduction|summary|description|instructions?)\b/i.test(line)) {
      continue
    }
    if (/\b(user\s*guidelines|generative\s*ai|continue\s*$|click\s*here|tap\s*to)\b/i.test(line)) {
      continue
    }
    let skip = false
    for (const p of VENDOR_SKIP_PATTERNS) {
      if (p.test(line)) { skip = true; break }
    }
    if (skip) continue
    const cleaned = line.replace(/[^\w\s\-&()/.]/g, ' ').trim()
    if (cleaned.length < 2) continue
    if (COMPANY_SUFFIX.test(line)) {
      // Extract just the company name: pick highest-priority legal suffix, then walk back 1–4 brand words.
      // Handles: "TT dotCom Sdn Bhd 197901008085(5z37-A)" → "TT dotCom Sdn Bhd"
      //          "Deposit MYR0.00 Pay here TT dotCom Scn Bhd 197901008085 (52371-A)" → "TT dotCom Scn Bhd"
      //          "Shell Malaysia Trading Sdn Bhd" → "Shell Malaysia Trading Sdn Bhd" (prefers "Sdn Bhd" over "Trading")
      //          "Mydin Mohamed Holdings Berhad" → "Mydin Mohamed Holdings Berhad"
      //          "7-Eleven Malaysia Sdn Bhd" → "7-Eleven Malaysia Sdn Bhd"
      //          "AEON Co. (M) Bhd 12345-X" → "AEON Co. (M) Bhd"
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
        const m = cleaned.match(pat)
        if (m && m.index !== undefined) {
          const pri = SUFFIX_PRIORITY[name] ?? 0
          if (pri > bestPriority || (pri === bestPriority && m.index > bestStart)) {
            bestStart = m.index
            bestSuffix = m[0]
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
        for (let i = words.length - 1; i >= 0; i--) {
          const w = words[i]
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
  // Step B: fall back to first valid line (without company suffix requirement)
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    const line = lines[i]
    if (/\b(selangor|kuala lumpur|shah alam|sungei|sungai buloh|petaling|pj|cyberjaya|putrajaya|johor bahru|penang|melaka|ipoh|kedah|kelantan|terengganu|pahang|perak|sarawak|sabah|malaysia|40160|47000|50000)\b/i.test(line)) {
      continue
    }
    if (/^[A-Z][A-Z\s]{3,30},$/.test(line)) {
      continue
    }
    if (/^(continue|submit|generate|cancel|ok|yes|no|next|back|close|done|accept|decline|open|save|share|download|print|view|more|less)\b/i.test(line)) {
      continue
    }
    if (line.length > 60) {
      continue
    }
    if (/^(generative|ai|user|guidelines?|welcome|loading|please|thank|thank\s*you|introduction|summary|description|instructions?)\b\b/i.test(line)) {
      continue
    }
    if (/\b(user\s*guidelines|generative\s*ai|continue\s*$|click\s*here|tap\s*to)\b/i.test(line)) {
      continue
    }
    // Skip lines that START with receipt/document keywords (not just equal to)
    if (/^(invoice|inv\.?|receipt|receiptno|bill|doc|date|time|cashier|account|payment|change|balance|order|ref|reference)\b/i.test(line)) {
      continue
    }
    let skip = false
    for (const p of VENDOR_SKIP_PATTERNS) {
      if (p.test(line)) { skip = true; break }
    }
    if (skip) continue
    const cleaned = line.replace(/[^\w\s\-&()/.]/g, ' ').trim()
    if (cleaned.length >= 2) {
      return cleaned.slice(0, 80)
    }
  }

  return 'Unknown Merchant'
}

// ─── Invoice Number Extraction ───────────────────────────────────────────────

function extractInvoiceNumber(text: string): string | null {
  // Shopee / LHDN e-invoice: Invoice No./ Code pattern (label on one line, value on next/same)
  let m = text.match(/Invoice\s*No\.?\/\s*Code[^A-Z0-9]*([A-Z0-9]{10,})/i)
  if (m) return m[1].toUpperCase().slice(0, 30)

  // Bill No: C2-KPG-2604/01840 format (Yonex / retail invoice style)
  m = text.match(/Bill\s*No[.:]\s*([A-Z0-9][A-Z0-9/\-]{5,30})/i)
  if (m) return m[1].toUpperCase().slice(0, 30)

  // ReceiptNumber: 2603034U43V155 (Thunder Match style)
  m = text.match(/ReceiptNumber:\s*([A-Z0-9]{10,30})/i)
  if (m) return m[1].toUpperCase().slice(0, 30)

  // Shopee / LHDN e-invoice: MYMKTODR20251231INV0006004 — alphanumeric INV pattern
  m = text.match(/\b([A-Z]{2,}\d{4,}\s*INV\s*\d+)\b/i)
  if (m) return m[1].replace(/\s/g, '').toUpperCase().slice(0, 30)

  // Standalone INV pattern: INV + digits (LHDN format)
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
      // Strip common OCR-injected file format suffixes
      const cleaned = match[1].replace(/(PDF|JPG|JPEG|PNG|IMAGE|FILE|IMG|PHOTO|PIC|DOC|TIFF|BMP)$/i, '').toUpperCase().slice(0, 30)
      if (cleaned.length >= 4) return cleaned
    }
  }
  return null
}

// ─── Category Suggestion ─────────────────────────────────────────────────────

function suggestCategory(text: string): string {
  const textLower = text.toLowerCase()
  const scores: Record<string, number> = {}

  for (const [cat, kws] of Object.entries(CATEGORY_KEYWORDS)) {
    scores[cat] = kws.filter(kw => textLower.includes(kw)).length
  }

  // Vendor-specific overrides (high confidence based on well-known names)
  // These take priority over keyword scoring
  const vendorPriority: Array<[RegExp, string]> = [
    [/guardian|caring\s*pharmacy|watsons|alpro\s*pharmacy|big\s*pharmacy/i, "medical_self"],
    [/^\s*tm\s|unifi|maxis\s|celcom\s|digi\s|time\.com/i, "utilities"],
    [/^\s*syabas\s|air\s*selangor|tenaga\s*nasional|tnb\s/i, "utilities"],
    [/^\s*aia\s|prudential|great\s*eastern|takaful\s/i, "insurance"],
    [/shell\s|petronas\s|caltex\s|bhp\s/i, "transport"],
    [/starbucks|mcdonald|kfc\s|pizza\s*hut|texas\s*chicken|tealive|chatime/i, "lifestyle"], // food
  ]
  for (const [pattern, category] of vendorPriority) {
    if (pattern.test(text)) {
      return category
    }
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

  // Additional patterns
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

function extractLineItems(text: string): string {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const items: string[] = []

  for (const line of lines) {
    // Pattern: name qty unit price total
    const m = line.match(/^([A-Za-z0-9\s\-&()/.]{4,35})\s+(\d+)\s+(?:UNIT|UNITS|PCS|PC|ITEM|KG|PCE)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})/i)
    if (m) {
      items.push(m[1].trim())
      if (items.length >= 3) break
      continue
    }
    // Simpler pattern: name qty price
    const m2 = line.match(/^([A-Za-z][A-Za-z0-9\s\-&()/.]{3,30})\s+(\d+)\s+([\d,]+\.\d{2})/i)
    if (m2 && !items.includes(m2[1].trim())) {
      items.push(m2[1].trim())
      if (items.length >= 3) break
    }
  }

  return items.slice(0, 3).join('; ')
}

// ─── Notes Extraction ────────────────────────────────────────────────────────

function extractNotes(text: string, invoiceNumber: string | null, time: string | null): string {
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

  if (invoiceNumber) {
    return `Inv#: ${invoiceNumber} | ${parts.join(' | ')}`
  }
  if (time) {
    return `Time: ${time} | ${parts.join(' | ')}`
  }
  return parts.join(' | ')
}

// ─── Tax Amount Extraction ────────────────────────────────────────────────────

function extractTaxAmount(text: string): number | null {
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
  // Extract patient/recipient name from OCR text
  let patientName: string | null = null
  const patientMatch = ocrText.match(/PATIENT:\s*(\w+\s+\w+)/i)
  if (patientMatch) {
    patientName = patientMatch[1].trim()
  } else {
    const customerMatch = ocrText.match(/CustomerName:\s*(\w+\s+\w+)/i)
    if (customerMatch) patientName = customerMatch[1].trim()
  }

  if (!patientName || !profile) return ''

  // Normalize for comparison
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
  const patientNorm = norm(patientName)

  // Build comparison list
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
  const suggestedCategory = suggestCategory(rawText)
  const taxAmount = extractTaxAmount(rawText)
  const currency = detectCurrency(rawText)
  const taxExempt = detectTaxExempt(rawText)
  const lineItems = extractLineItems(rawText)
  const notes = extractNotes(rawText, invoiceNumber, time)
  const { lhdNCategory, recipient } = detectTaxDeduction(rawText, { category: suggestedCategory })

  return {
    amount,
    date,
    time,
    merchant,
    description: lineItems || merchant,
    suggestedCategory,
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
  // Parse vendor, amount, date, category, etc. from raw OCR text on the client
  // so the dashboard review form is pre-populated even with our minimal server response.
  if (result.rawText && result.rawText.length > 0) {
    const parsed = parseFromRawText(result.rawText)
    // Server-provided fields win when present and meaningful (e.g. EA form override, PDF with metadata).
    // We only trust server values if they're not the default stub values (null/'lifestyle'/'Unknown Merchant').
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
  // Only infer for medical/childcare categories
  if (
    result.suggestedCategory.startsWith('medical_') ||
    result.suggestedCategory === 'ChildCare'
  ) {
    // Dynamically import supabase to avoid top-level import issues
    const { supabase } = await import('@/lib/supabase')
    const profile = await fetchUserProfile(supabase)
    const inferredRecipient = profile ? inferRecipient(result.rawText, profile) : ''
    if (inferredRecipient) {
      result.recipient = inferredRecipient
      // Re-run tax deduction with actual recipient to get correct category
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
