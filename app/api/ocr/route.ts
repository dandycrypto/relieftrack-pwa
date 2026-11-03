import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import { requireAuth } from '@/lib/api-auth'
import { isRateLimited } from '@/lib/rate-limit'
import {
  parseDate,
  extractAmount,
  detectCurrency,
  extractVendor,
  extractInvoiceNumber,
  suggestCategory,
  extractTaxAmount,
  extractLineItems,
  KWSP_MEMBER_PATTERNS,
  TIN_PATTERNS,
  EA_FORM_NUMBER_PATTERNS,
  extractFirstMatch,
} from '@/lib/ocr-parsers'
import { extractReceiptFields } from '@/lib/ocr-llm-extract'

// OCR is compute-heavy (RapidOCR / pdftotext); cap requests per user.
const RATE_LIMIT_MAX = 20
const RATE_LIMIT_WINDOW_MS = 60_000

export const runtime = 'nodejs'
export const maxDuration = 60

// ── FastAPI OCR microservice — backend for images and scanned PDFs ──────────
// Handles image OCR (RapidOCR) and PDF-as-image OCR fallback, EA Form
// detection, and general receipt extraction. See ocr_service/ (run with
// `uvicorn ocr_service.main:app`).
const OCR_SERVICE_URL = process.env.OCR_SERVICE_URL || 'http://127.0.0.1:8001'
const OCR_SERVICE_TIMEOUT_MS = 30000

// ── pdftotext fast path for digital (text-layer) PDFs ────────────────────────
// `pdftotext -layout` preserves column alignment, which produces much
// cleaner text than a linear text-extraction library for government forms
// with dot-leader fill-in fields (e.g. Malaysian EA forms) — a plain reading-
// order extraction interleaves the leader dots with the digits it's meant to
// separate. Reads/writes via stdin/stdout so no temp files are needed. If the
// `pdftotext` binary isn't available on this host, it fails soft and the
// caller falls back to the OCR microservice's own PDF handling.
const PDFTOTEXT_TIMEOUT_MS = 15000
const MIN_PDFTOTEXT_CHARS = 100

function runPdfToText(buffer: Buffer): Promise<string> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (text: string) => {
      if (!settled) {
        settled = true
        resolve(text)
      }
    }
    try {
      const proc = spawn('pdftotext', ['-layout', '-', '-'], { timeout: PDFTOTEXT_TIMEOUT_MS })
      let stdout = ''
      proc.stdout.on('data', (d) => { stdout += d.toString('utf8') })
      proc.on('close', () => finish(stdout))
      proc.on('error', () => finish('')) // binary missing or failed to spawn
      proc.stdin.on('error', () => {}) // ignore EPIPE if the process exits early
      proc.stdin.write(buffer)
      proc.stdin.end()
    } catch {
      finish('')
    }
  })
}

interface OcrServiceResult {
  vendor: string | null
  date: string | null
  time: string | null
  amount: number | null
  tax_amount: number | null
  tax_type: string | null
  currency: string | null
  category: string | null
  invoice_number: string | null
  tin: string | null
  sst_registration_no: string | null
  raw_text: string
  confidence: number
  extraction_method: string | null
  needs_review: boolean
  document_type: string | null
  confidence_band?: string
  /** Human-readable plausibility problems from the OCR service, e.g.
   *  "invoice_number: '202S' mixes digits with letter(s) S". Empty when clean. */
  validation_issues?: string[]
  elapsed_ms?: number
}

async function runOcrService(buffer: Buffer, filename: string, mimeType: string): Promise<OcrServiceResult> {
  const blob = new Blob([buffer], { type: mimeType })
  const form = new FormData()
  form.append('file', blob, filename)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), OCR_SERVICE_TIMEOUT_MS)

  try {
    const res = await fetch(`${OCR_SERVICE_URL}/ocr`, {
      method: 'POST',
      body: form,
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`OCR service HTTP ${res.status}: ${body.slice(0, 200)}`)
    }
    return (await res.json()) as OcrServiceResult
  } catch (e) {
    clearTimeout(timeout)
    throw e instanceof Error ? e : new Error('OCR service request failed')
  }
}

// ── EA Form Detection ────────────────────────────────────────────────────────

interface EAFormData {
  employeeName: string
  icNumber: string
  employerName: string
  taxYear: number
  grossIncome: number
  epfContribution: number
  socsoContribution: number
  pcbPaid: number
  kwspMemberId?: string
  lhdnTin?: string
  eaFormNumber?: string
  uploadDate?: string
}

/**
 * Weighted keyword scoring to detect EA Form from OCR raw text.
 * Returns true if score >= 2 (at least 2 keyword groups matched).
 * Covers both English and Malay EA Form keywords.
 */
function isEAForm(rawText: string): { detected: boolean; score: number; matched: string[] } {
  const text = rawText.toUpperCase()
  const keywordGroups: Array<{ group: string; keywords: string[] }> = [
    { group: 'EA_FORM', keywords: ['EA FORM', 'EA-1', 'EA 1', 'FORM EA', 'EA1', 'EAFORM'] },
    { group: 'PCB_TAX', keywords: ['PCB', 'POTONGAN', 'CUKAI', 'PCB/CUKAI'] },
    { group: 'INCOME', keywords: ['PENDAPATAN', 'GAJI', 'GPK', 'EMOLUMEN', 'INCOME', 'SALARY', 'WAGES'] },
    { group: 'EMPLOYER', keywords: ['MAJIKAN', 'NAMA MAJIKAN', 'NAME OF EMPLOYER', 'EMPLOYER'] },
    { group: 'EMPLOYEE', keywords: ['PEKERJA', 'NAMA PEKERJA', 'NAME OF EMPLOYEE', 'EMPLOYEE'] },
    { group: 'KWSP', keywords: ['KWSP', 'EPF'] },
    { group: 'SOCSO', keywords: ['SOCSO', 'PERKESO'] },
    { group: 'SECTION_B', keywords: ['SECTION B', 'BAHAGIAN B', 'SEC B', 'SEKSYEN B'] },
    { group: 'YEAR_TAX', keywords: ['TAHUN', 'YEAR OF ASSESSMENT', 'YA', 'YEAR:'] },
    { group: 'TIN', keywords: ['TIN', 'NO. TIN', 'NO TIN', 'NO. CUKAI'] },
  ]

  let score = 0
  const matched: string[] = []

  for (const { group, keywords } of keywordGroups) {
    if (keywords.some(kw => text.includes(kw))) {
      score += 1
      matched.push(group)
    }
  }

  return { detected: score >= 2, score, matched }
}

// Format name: "TANWEIMING" → "TAN WEI MING"
function formatEAFormName(name: string): string {
  // Mixed-case names (e.g., "DandyLauJingHui")
  const mixed = name
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
  if (mixed.includes(' ')) return mixed

  // ALL CAPS names (e.g., "TANWEIMING")
  if (name === name.toUpperCase() && !name.includes(' ')) {
    // Strategy: find known Chinese name components, split around them
    // Common Chinese name parts: LAU, JING, HUI, WONG, TAN, LIM, etc.
    // Pattern: find these in the string and split
    const chineseNames = ['LAU', 'JING', 'HUI', 'WONG', 'TAN', 'LIM', 'CHEN', 'NG', 'HO', 'CHONG', 'LEE', 'ANG', 'TAY', 'HEE', 'PAU', 'KING', 'KIAN', 'YONG', 'SIA', 'OO', 'BE', 'GO', 'HUAT', 'SENG', 'HOW', 'LIAN', 'LIN', 'MIN', 'WEI', 'CHUN', 'QI', 'ZHEN', 'LEI', 'XIN', 'YAN', 'FENG', 'ZHANG', 'LIU', 'WANG', 'ZHAO', 'WU', 'ZHOU', 'XU', 'SHU', 'MEI', 'JIA', 'YI', 'LU', 'CAO', 'HAN', 'YANG', 'QIN', 'JUN', 'REN', 'TAO', 'KUN', 'NING', 'HAO', 'HONG', 'BIN', 'QIAN', 'PEI', 'LAN', 'QIN', 'XIU', 'LIU', 'YU', 'BIN', 'SI', 'FANG', 'YUN', 'QING', 'XIA', 'LING', 'FEI', 'ZHU', 'XIAO', 'MING', 'HUA', 'SHI', 'BAO', 'LIAN', 'NA', 'ER']
    const pattern = new RegExp(`(${chineseNames.join('|')})`, 'g')
    const parts = name.split(pattern).filter(Boolean)
    if (parts.length > 1) {
      return parts.join(' ')
    }

    // Fallback: split into 4-3-4-3 pattern (English name + Chinese names)
    // Take 4-5 chars as first part, remaining in 3-4 char chunks
    if (name.length > 8) {
      const first = name.slice(0, 5)
      const rest = name.slice(5)
      // Split remaining into 3-4 chunks
      const chunks: string[] = []
      let i = 0
      while (i < rest.length) {
        if (i + 4 <= rest.length && /^[A-Z]{4}$/.test(rest.slice(i, i + 4))) {
          chunks.push(rest.slice(i, i + 4))
          i += 4
        } else if (i + 3 <= rest.length) {
          chunks.push(rest.slice(i, i + 3))
          i += 3
        } else {
          chunks.push(rest.slice(i))
          break
        }
      }
      return [first, ...chunks].join(' ')
    }
  }

  return name
}

/**
 * Parse EA Form from pdftotext/pdfplumber -layout output.
 * The layout-formatted text has proper spaces, line breaks, and aligned columns.
 * Much cleaner than OCR — name already has proper spacing, amounts are clean.
 */
function parseEAFormFromPDF(rawText: string): EAFormData | null {
  const result: EAFormData = {
    employeeName: '',
    icNumber: '',
    employerName: '',
    taxYear: new Date().getFullYear(),
    grossIncome: 0,
    epfContribution: 0,
    socsoContribution: 0,
    pcbPaid: 0,
    kwspMemberId: '',
    lhdnTin: '',
    eaFormNumber: '',
    uploadDate: new Date().toISOString().split('T')[0],
  }

  // ── Tax Year ──
  // In pdftotext -layout, "2025" appears on the line ABOVE "BAGI TAHUN BERAKHIR"
  // e.g. "No. Majikan E ………….                                                                         2025"
  //                        "BAGI TAHUN BERAKHIR 31 DISEMBER ………….."
  // Strategy: find position of "TAHUN BERAKHIR", then look at the preceding 80 chars for a 4-digit year
  const tahunIdx = rawText.search(/TAHUN\s*BERAKHIR/i)
  if (tahunIdx >= 0) {
    const before = rawText.slice(Math.max(0, tahunIdx - 200), tahunIdx)
    const yearMatch = before.match(/\b(20[2-3]\d)\b/)
    if (yearMatch) result.taxYear = parseInt(yearMatch[1])
  }

  // ── Employee Name ──
  // pdftotext layout: the name appears after "1." and before "Nama Penuh Pekerja"
  // e.g. "1.   TAN WEI MING   Nama Penuh Pekerja / Pesara ..."
  // Strategy: find line that starts (after whitespace) with a number and then a name
  // The name is on a line that contains "Nama Penuh Pekerja" on the same line but the name comes BEFORE that label
  const nameMatch = rawText.match(/1\.\s+([A-Z][A-Z\s]{2,50}?)\s+Nama\s+Penuh\s+Pekerja/i)
  if (nameMatch) {
    result.employeeName = nameMatch[1].trim()
  } else {
    // Fallback: look for "Nama Penuh Pekerja" and grab the line above/before it
    const altMatch = rawText.match(/1\.\s+([A-Z][A-Za-z\s]{3,60})(?:\s+\n|\s+Nama)/i)
    if (altMatch) {
      result.employeeName = altMatch[1].trim()
    }
  }

  // ── IC Number ──
  // "No. K.P. Baru  880101-14-5566"
  const icMatch = rawText.match(/\b([0-9]{6}[-\s]?[0-9]{2}[-\s]?[0-9]{4})\b/)
  if (icMatch) {
    result.icNumber = icMatch[1].replace(/\s+/g, '').replace(/-/g, '').replace(/(\d{6})(\d{2})(\d{4})/, '$1-$2-$3')
  }

  // ── Gross Income (JUMLAH — Section C total) ──
  // "JUMLAH  198,940.00"
  const jumlahMatch = rawText.match(/JUMLAH\s+([0-9,]+\.\d{2})/i)
  if (jumlahMatch) {
    const num = parseFloat(jumlahMatch[1].replace(/,/g, ''))
    if (!isNaN(num) && num > 0) result.grossIncome = num
  }

  // ── PCB (Section D — Total Deductions) ──
  // "Potongan cukai bulanan (PCB) yang dibayar kepada LHDNM  28,632.05"
  const pcbMatch = rawText.match(/Potongan\s+cukai\s+bulanan\s*\(PCB\)[^0-9]*([0-9,]+\.\d{2})/i)
  if (pcbMatch) {
    const num = parseFloat(pcbMatch[1].replace(/,/g, ''))
    if (!isNaN(num) && num > 0) result.pcbPaid = num
  }

  // ── EPF Contribution (KWSP) — Section E ──
  // In pdftotext -layout, "Amaun caruman yang wajib dibayar..." and "RM 21,923.00" are on the SAME LINE.
  // Scope to the KWSP section (between "KWSP (EPF)" and "PERKESO:")
  const kwspStart = rawText.search(/KWSP\s*\(EPF\)/i)
  const perkesoStart = rawText.search(/PERKESO:/i)
  if (kwspStart >= 0 && perkesoStart > kwspStart) {
    const kwspSection = rawText.slice(kwspStart, perkesoStart)
    // "Amaun caruman" line has RM and amount at the end of the SAME line
    const epfMatch = kwspSection.match(/RM\s+([0-9,]+\.\d{2})/)
    if (epfMatch) {
      const num = parseFloat(epfMatch[1].replace(/,/g, ''))
      if (!isNaN(num) && num > 0) result.epfContribution = num
    }
    // Extract KWSP member ID
    const kwspId = extractFirstMatch(rawText, KWSP_MEMBER_PATTERNS)
    if (kwspId) result.kwspMemberId = kwspId
  }

  // ── SOCSO Contribution (PERKESO) — Section E ──
  // "PERKESO: Amaun caruman yang wajib dibayar...  RM  499.80" — same line
  if (perkesoStart >= 0) {
    const perkesoLineEnd = rawText.indexOf('\n', perkesoStart)
    const perkesoSection = rawText.slice(perkesoStart, perkesoLineEnd > 0 ? perkesoLineEnd : perkesoStart + 200)
    const socsoMatch = perkesoSection.match(/RM\s+([0-9,]+\.\d{2})/)
    if (socsoMatch) {
      const num = parseFloat(socsoMatch[1].replace(/,/g, ''))
      if (!isNaN(num) && num > 0) result.socsoContribution = num
    }
  }

  // ── Extract LHDN TIN ──
  const tinId = extractFirstMatch(rawText, TIN_PATTERNS)
  if (tinId) result.lhdnTin = tinId

  // ── Extract EA Form number ──
  const eaNum = extractFirstMatch(rawText, EA_FORM_NUMBER_PATTERNS)
  if (eaNum) result.eaFormNumber = eaNum

  // ── Employer Name ──
  // "Nama dan Alamat Majikan  ACME MANUFACTURING SDN BHD"
  // The employer name appears on the line(s) following "Nama dan Alamat Majikan"
  const majikanIdx = rawText.search(/Nama\s+dan\s+Alamat\s+Majikan/i)
  if (majikanIdx >= 0) {
    const afterMajikan = rawText.slice(majikanIdx, majikanIdx + 300)
    // Grab non-empty, non-dot lines (employer can be on same line as label or below)
    const lines = afterMajikan.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      // Skip if this is just the label-only line (no actual name content)
      if (line.match(/^Nama\s+dan\s+Alamat\s+Majikan$/i)) continue
      if (line && !/^\.+$/.test(line) && line.length > 5) {
        result.employerName = line
          .replace(/^Nama\s+dan\s+Alamat\s+Majikan\s+/i, '')
          .replace(/\.{3,}/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
        break
      }
    }
  }

  return result
}

function parseEAForm(rawText: string): EAFormData | null {
  const result: EAFormData = {
    employeeName: '',
    icNumber: '',
    employerName: '',
    taxYear: new Date().getFullYear(),
    grossIncome: 0,
    epfContribution: 0,
    socsoContribution: 0,
    pcbPaid: 0,
    kwspMemberId: '',
    lhdnTin: '',
    eaFormNumber: '',
    uploadDate: new Date().toISOString().split('T')[0],
  }

  // ── Tax Year ──
  // "BAGI TAHUN BERAKHIR 31 DISEMBER 2024" → extract 2024
  const yearMatch = rawText.match(/TAHUN\s*BERAKHIR[^0-9]*\d{2}[^0-9]*[A-Z]+[^0-9]*([0-9]{4})/i)
  if (yearMatch) {
    result.taxYear = parseInt(yearMatch[1])
  }

  // ── Employee Name ──
  // "BUTIRANPEKERJA\nTANWEIMING" — name on line after BUTIRANPEKERJA
  // Stop at newline or non-name chars (NamaPenuhPekerja label)
  const nameMatch = rawText.match(/BUTIRANPEKERJA\s*\n\s*([A-Z][A-Za-z\s]{3,60})/i)
  if (nameMatch) {
    const raw = nameMatch[1].trim()
    // Remove any trailing label fragments like "NamaPenuhPekerja"
    const cleaned = raw.split(/\s*Nama/i)[0].trim()
    result.employeeName = formatEAFormName(cleaned)
  }

  // ── IC Number ──
  const icMatch = rawText.match(/\b([0-9]{6}[-\s]?[0-9]{2}[-\s]?[0-9]{4})\b/)
  if (icMatch) {
    result.icNumber = icMatch[1].replace(/\s+/g, '').replace(/-/g, '').replace(/(\d{6})(\d{2})(\d{4})/, '$1-$2-$3')
  }

  // ── Gross Income ──
  // OCR: "JUMLAH\n168,206.45" — amount on line after JUMLAH
  const jumlahMatch = rawText.match(/JUMLAH\s*\n\s*([0-9,]+\.\d{2})/i)
  if (jumlahMatch) {
    const num = parseFloat(jumlahMatch[1].replace(/,/g, ''))
    if (!isNaN(num) && num > 0) result.grossIncome = num
  }

  // ── EPF Contribution (KWSP) ──
  // The CARUMAN section starts with "CARUMAN...KWSP...PERKESO" header.
  // We scope the search to this section to avoid matching "No.KWSP" (employee number field).
  // OCR layout: "CARUMAN...
  //   KWSP(EPF)
  //   1.
  //   Nama Kumpulan Wang ..
  //   18,505.00
  //   RM
  //   422.10
  //   RM
  //   2.
  //   0.00
  //   JUMLAHELAUN..."
  const carumanStart = rawText.search(/CARUMAN/i)
  const carumanEnd = rawText.search(/JUMLAHELAUN/i)
  if (carumanStart >= 0) {
    const carumanSection = rawText.slice(
      carumanStart,
      carumanEnd > carumanStart ? carumanEnd : carumanStart + 500
    )

    // KWSP(EPF) contribution: find "Nama Kumpulan Wang" then the amount after it
    const namaIdx = carumanSection.search(/Nama\s*Kumpulan\s*Wang/i)
    if (namaIdx >= 0) {
      const afterNama = carumanSection.slice(namaIdx, namaIdx + 100)
      const epfMatch = afterNama.match(/([0-9,]+\.\d{2})/)
      if (epfMatch) {
        const num = parseFloat(epfMatch[1].replace(/,/g, ''))
        if (num > 1000) result.epfContribution = num
      }
    }

    // SOCSO/PERKESO contribution: the second "RM" in the section marks the SOCSO amount.
    // First "RM" comes after KWSP amount, second "RM" comes after SOCSO amount.
    // So find the second RM in section and look backward for the SOCSO amount (take LAST amount before RM).
    const rmMatches = [...carumanSection.matchAll(/RM/g)]
    if (rmMatches.length >= 2) {
      // The second RM's position in carumanSection
      const secondRmPos = rmMatches[1].index!
      // Look backward from second RM for the SOCSO amount (before the RM label)
      const beforeSecondRm = carumanSection.slice(Math.max(0, secondRmPos - 30), secondRmPos)
      // Find ALL amounts and take the LAST one (closest to the RM marker)
      const allAmounts = beforeSecondRm.match(/([0-9,]+\.\d{2})/g) || []
      if (allAmounts.length > 0) {
        const lastAmt = allAmounts[allAmounts.length - 1]
        const num = parseFloat(lastAmt.replace(/,/g, ''))
        if (num > 0) result.socsoContribution = num
      }
    }
  }

  // ── PCB Paid (JUMLAHPOTONGAN = Total Deductions) ──
  // OCR: "JUMLAHPOTONGAN\n23,114.15" — amount on line after label
  const potMatch = rawText.match(/JUMLAHPOTONGAN\s*\n\s*([0-9,]+\.\d{2})/i)
  if (potMatch) {
    const num = parseFloat(potMatch[1].replace(/,/g, ''))
    if (!isNaN(num) && num > 0) result.pcbPaid = num
  }

  // ── Extract KWSP member ID ──
  const kwspId2 = extractFirstMatch(rawText, KWSP_MEMBER_PATTERNS)
  if (kwspId2) result.kwspMemberId = kwspId2

  // ── Extract LHDN TIN ──
  const tinId2 = extractFirstMatch(rawText, TIN_PATTERNS)
  if (tinId2) result.lhdnTin = tinId2

  // ── Extract EA Form number ──
  const eaNum2 = extractFirstMatch(rawText, EA_FORM_NUMBER_PATTERNS)
  if (eaNum2) result.eaFormNumber = eaNum2

  return result
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (isRateLimited(`ocr:${user.id}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
      return NextResponse.json({ error: 'Too many requests. Please slow down.' }, { status: 429 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg', 'application/pdf']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Invalid file type. Supported: JPEG, PNG, WebP, PDF' }, { status: 400 })
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'File too large. Max size: 10MB' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    // ── Magic bytes validation ───────────────────────────────────────────
    const isPDF = buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46
    const isJPEG = buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF
    const isPNG = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47
    if (!isPDF && !isJPEG && !isPNG) {
      return NextResponse.json({ error: 'Invalid file content. File does not appear to be a valid JPEG, PNG, or PDF.' }, { status: 400 })
    }

    // ── Extract text ──────────────────────────────────────────────────────
    // For PDFs, try the fast native-text-layer path first (pdftotext) — it's
    // more accurate for structured forms and doesn't need the OCR service at
    // all. Fall back to the OCR microservice (RapidOCR) for images and for
    // PDFs with no usable text layer (scanned documents).
    let rawText = ''
    let extractionMethod = 'unknown'
    let serviceResult: OcrServiceResult | null = null

    if (isPDF) {
      const pdfText = await runPdfToText(buffer)
      if (pdfText.trim().length >= MIN_PDFTOTEXT_CHARS) {
        rawText = pdfText
        extractionMethod = 'pdftotext'
      }
    }

    if (!rawText) {
      try {
        serviceResult = await runOcrService(buffer, file.name, file.type)
      } catch (e) {
        console.error('[OCR] service call failed:', e instanceof Error ? e.message : e)
        return NextResponse.json({ error: 'OCR service unavailable. Please try again shortly.' }, { status: 502 })
      }
      rawText = serviceResult.raw_text || ''
      extractionMethod = serviceResult.extraction_method || extractionMethod
    }

    // ── EA Form detection & structured parsing ────────────────────────────
    // The Python service's own EA-form extraction is tuned for generic
    // English-labeled forms; real Malaysian EA forms use Malay section
    // labels (KWSP, PERKESO, JUMLAH), so we re-parse the raw text here with
    // parsers tuned to that layout instead of trusting the service's fields.
    let eaFormData: EAFormData | null = null
    if (rawText.length > 50) {
      const eaCheck = isEAForm(rawText)
      if (eaCheck.detected) {
        eaFormData = extractionMethod === 'pdftotext' || extractionMethod === 'pdfplumber'
          ? parseEAFormFromPDF(rawText)
          : parseEAForm(rawText)
      }
    }

    if (eaFormData) {
      return NextResponse.json({
        vendor: eaFormData.employerName || 'Unknown Employer',
        date: `${eaFormData.taxYear}-12-31`,
        time: null,
        amount: eaFormData.grossIncome || null,
        tax_amount: null,
        tax_type: null,
        currency: 'MYR',
        category: 'lifestyle',
        invoice_number: null,
        tin: null,
        sst_registration_no: null,
        raw_text: rawText,
        confidence: serviceResult?.confidence ?? 1.0,
        extraction_method: extractionMethod,
        needs_review: false,
        document_type: 'ea_form',
        eaFormData,
      })
    }

    // ── Non-EA-form result ─────────────────────────────────────────────────
    // Regex/keyword field extraction (lib/ocr-parsers.ts) is brittle and
    // frequently mis-tags receipts (substring keyword matching, category
    // ids that aren't even valid relief categories). We run an LLM pass on
    // the raw text to get real field extraction + LHDN-aware categorisation,
    // and only fall back to the regex fields it couldn't fill in or if the
    // LLM call itself is unavailable (no API key, network error, etc.) —
    // see lib/ocr-llm-extract.ts.
    const llm = rawText.length > 20 ? await extractReceiptFields(rawText) : null

    if (serviceResult) {
      // Came from the OCR microservice — it already extracted structured
      // fields (works for receipt/invoice photos and scanned PDFs alike).
      return NextResponse.json({
        vendor: llm?.merchant || serviceResult.vendor,
        date: llm?.date || serviceResult.date,
        time: serviceResult.time,
        amount: llm?.amount ?? serviceResult.amount,
        tax_amount: serviceResult.tax_amount,
        tax_type: serviceResult.tax_type,
        currency: llm?.currency || serviceResult.currency || 'MYR',
        category: llm?.category || serviceResult.category,
        invoice_number: llm?.invoice_number || serviceResult.invoice_number,
        tin: serviceResult.tin,
        sst_registration_no: serviceResult.sst_registration_no,
        raw_text: rawText,
        confidence: llm ? llm.confidence : serviceResult.confidence,
        extraction_method: serviceResult.extraction_method,
        needs_review: serviceResult.needs_review,
        validation_issues: serviceResult.validation_issues ?? [],
        document_type: serviceResult.document_type,
        eaFormData: null,
        description: llm?.description || null,
        sub_category: llm?.category ? llm.sub_category : null,
        claimable: llm?.claimable,
      })
    }

    // Came from pdftotext. Regex parsers run on the clean digital text
    // layer as the baseline/fallback; the LLM extraction above supplies
    // the real merchant/category/subcategory/description when available.
    const regexDate = parseDate(rawText)
    return NextResponse.json({
      vendor: llm?.merchant || extractVendor(rawText),
      date: llm?.date || regexDate.date,
      time: regexDate.time,
      amount: llm?.amount ?? extractAmount(rawText),
      tax_amount: extractTaxAmount(rawText),
      tax_type: null,
      currency: llm?.currency || detectCurrency(rawText),
      category: llm?.category || suggestCategory(rawText),
      invoice_number: llm?.invoice_number || extractInvoiceNumber(rawText),
      tin: null,
      sst_registration_no: null,
      raw_text: rawText,
      // pdftotext has no OCR uncertainty, but field extraction can still be
      // wrong — confidence now reflects the LLM's grounded self-assessment
      // (see lib/ocr-llm-extract.ts) rather than always claiming certainty.
      confidence: llm ? llm.confidence : 1.0,
      extraction_method: 'pdftotext',
      needs_review: false,
      document_type: 'unknown',
      eaFormData: null,
      description: llm?.description || extractLineItems(rawText),
      sub_category: llm?.category ? llm.sub_category : null,
      claimable: llm?.claimable,
    })
  } catch (err) {
    console.error('[OCR] Route error:', err instanceof Error ? err.message : err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
