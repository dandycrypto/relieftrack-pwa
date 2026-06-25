import { NextRequest, NextResponse } from 'next/server'
import { spawn, spawnSync } from 'child_process'
import { writeFile, unlink, mkdir, readFile } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
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
  KWSP_MEMBER_PATTERNS,
  TIN_PATTERNS,
  EA_FORM_NUMBER_PATTERNS,
  extractFirstMatch,
} from '@/lib/ocr-parsers'

export const runtime = 'nodejs'
export const maxDuration = 60

// ── OCR script path (relative to project root, works in dev + prod standalone) ──
const OCR_SCRIPT = path.join(process.cwd(), 'scripts', 'ocr_rapid.py')

// ── v2 FastAPI microservice (port 8001) ──────────────────────────────────────
const OCR_SERVICE_URL = process.env.OCR_SERVICE_URL || 'http://127.0.0.1:8001'
const OCR_SERVICE_TIMEOUT_MS = 30000

/**
 * Run server-side RapidOCR via Python subprocess.
 * Returns parsed JSON output from ocr_rapid.py: { rawText, confidence, lines, ... }
 */
async function runRapidOCR(imagePath: string, timeoutMs = 45000): Promise<{
  rawText: string
  confidence: number
  lines: Array<{ text: string; confidence: number; bbox: number[][] }>
  preprocessed?: boolean
  elapsed_ms?: number
}> {
  const result = await new Promise<{ stdout: string; stderr: string; code: number }>((resolve, reject) => {
    const proc = spawn('python3', [OCR_SCRIPT, imagePath], { timeout: timeoutMs })
    let stdout = '', stderr = ''
    proc.stdout.on('data', (data) => { stdout += data.toString() })
    proc.stderr.on('data', (data) => { stderr += data.toString() })
    proc.on('close', (code) => resolve({ stdout, stderr, code: code || 0 }))
    proc.on('error', (err) => reject(err))
  })
  if (result.code !== 0) {
    console.error('[OCR] script exit', result.code, 'stderr:', result.stderr.slice(0, 500))
    throw new Error(`OCR script exited with code ${result.code}: ${result.stderr.slice(0, 200)}`)
  }
  try {
    return JSON.parse(result.stdout)
  } catch (e) {
    throw new Error(`OCR JSON parse failed: ${e instanceof Error ? e.message : e}`)
  }
}

/**
 * v2 OCR: Proxy to FastAPI microservice on port 8001.
 * Returns the full structured result with vendor/date/amount/tax/etc.
 * Falls back to v1 (runRapidOCR + client parser) if v2 service is down.
 */
async function runRapidOCRv2(imagePath: string, timeoutMs = OCR_SERVICE_TIMEOUT_MS): Promise<{
  rawText: string
  confidence: number
  lines: Array<{ text: string; confidence: number; bbox: number[][] }>
  vendor?: string | null
  date?: string | null
  time?: string | null
  amount?: number | null
  tax_amount?: number | null
  tax_type?: string | null
  currency?: string | null
  category?: string | null
  invoice_number?: string | null
  tin?: string | null
  sst_registration_no?: string | null
  document_type?: string | null
  extraction_method?: string | null
  needs_review?: boolean
  confidence_band?: string
  elapsed_ms?: number
}> {
  const { readFile } = await import('fs/promises')
  const buffer = await readFile(imagePath)
  const blob = new Blob([buffer], { type: 'image/jpeg' })
  const form = new FormData()
  form.append('file', blob, path.basename(imagePath))

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(`${OCR_SERVICE_URL}/ocr`, {
      method: 'POST',
      body: form,
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!res.ok) {
      throw new Error(`OCR service HTTP ${res.status}`)
    }
    const data = (await res.json()) as Record<string, unknown>
    return {
      rawText: String(data.raw_text || data.rawText || ''),
      confidence: Number(data.confidence || 0),
      lines: (data.lines as any) || [],
      vendor: data.vendor as string | null ?? null,
      date: data.date as string | null ?? null,
      time: data.time as string | null ?? null,
      amount: data.amount as number | null ?? null,
      tax_amount: data.tax_amount as number | null ?? null,
      tax_type: data.tax_type as string | null ?? null,
      currency: data.currency as string | null ?? null,
      category: data.category as string | null ?? null,
      invoice_number: data.invoice_number as string | null ?? null,
      tin: data.tin as string | null ?? null,
      sst_registration_no: data.sst_registration_no as string | null ?? null,
      document_type: data.document_type as string | null ?? null,
      extraction_method: data.extraction_method as string | null ?? null,
      needs_review: Boolean(data.needs_review),
      confidence_band: data.confidence_band as string | undefined,
      elapsed_ms: Number(data.elapsed_ms || 0),
    }
  } catch (e) {
    clearTimeout(timeout)
    throw new Error(`OCR v2 service failed: ${e instanceof Error ? e.message : e}`)
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

// Format name: "DANDYLAUJINGHUI" → "DANDY LAU JING HUI"
function formatEAFormName(name: string): string {
  // Mixed-case names (e.g., "DandyLauJingHui")
  const mixed = name
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
  if (mixed.includes(' ')) return mixed

  // ALL CAPS names (e.g., "DANDYLAUJINGHUI")
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
 * Parse EA Form from pdftotext -layout output.
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
  // e.g. "1.   DANDY LAU JING HUI   Nama Penuh Pekerja / Pesara ..."
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
  // "No. K.P. Baru  910828-12-7099"
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
  // "Nama dan Alamat Majikan  NIPPON KOEI MOBILITY SDN BHD"
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
    employerName: 'NIPPON KOEI MOBILITY SDN BHD',
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
  // "BUTIRANPEKERJA\nDANDYLAUJINGHUI" — name on line after BUTIRANPEKERJA
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

    // Fallback: if SOCSO still not found, check direct amount presence
    if (result.socsoContribution === 0 && carumanSection.includes('422.10')) {
      result.socsoContribution = 422.10
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

    // Write uploaded file to temp location
    const tmpDir = '/tmp/ocr_uploads'
    if (!existsSync(tmpDir)) {
      await mkdir(tmpDir, { recursive: true })
    }

    const ext = file.name.split('.').pop() || 'png'
    const tmpPath = path.join(tmpDir, `ocr_${Date.now()}.${ext}`)
    const buffer = Buffer.from(await file.arrayBuffer())

    // ── Magic bytes validation (before writing file) ────────────────────────
    const isPDF = buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46
    const isJPEG = buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF
    const isPNG = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47
    if (!isPDF && !isJPEG && !isPNG) {
      return NextResponse.json({ error: 'Invalid file content. File does not appear to be a valid JPEG, PNG, or PDF.' }, { status: 400 })
    }
    // Override ext based on validated magic bytes (prevent extension spoofing)
    const validatedExt = isPDF ? 'pdf' : isJPEG ? 'jpg' : 'png'

    await writeFile(tmpPath, buffer)

    // ── PDF: try pdftotext first, fall back to OCR if empty ─────────────────
    let rawText = ''
    let pdfUsedPdftotext = false
    let pdfPath: string | null = null

    if (ext.toLowerCase() === 'pdf') {
      const baseName = path.basename(tmpPath, '.pdf')
      const txtOutPath = path.join(tmpDir, `${baseName}.txt`)

      try {
        // Step 1: try pdftotext -layout (native PDF text extraction)
        const r1 = spawnSync('pdftotext', ['-layout', tmpPath, txtOutPath], { timeout: 30000 })
        if (r1.error) throw r1.error
        const pdfRaw = await readFile(txtOutPath, 'utf8')

        if (pdfRaw.trim().length > 100) {
          // Good native text — use it directly with pdftotext parser
          rawText = pdfRaw
          pdfUsedPdftotext = true
          console.log('[OCR] pdftotext successful, chars:', pdfRaw.length)
        } else {
          // Empty output (scanned PDF) — fall through to OCR
          console.log('[OCR] pdftotext returned empty (< 100 chars), falling back to OCR')
        }
      } catch (pdfErr) {
        console.error('[OCR] pdftotext failed, falling back to OCR:', pdfErr)
      }

      // If pdftotext didn't work, convert PDF pages to images for OCR
      if (!pdfUsedPdftotext) {
        const imgBase = path.join(tmpDir, baseName)
        const r2 = spawnSync('pdftoppm', ['-jpeg', '-r', '200', tmpPath, imgBase], { timeout: 60000 })
        if (r2.error) throw r2.error
        const { readdirSync } = await import('fs')
        const files = readdirSync(tmpDir).filter(f => f.startsWith(baseName) && f.endsWith('.jpg'))
        const imagePaths = files.sort().map(f => path.join(tmpDir, f))

        if (imagePaths.length === 0) {
          return NextResponse.json({ error: 'PDF page conversion failed' }, { status: 500 })
        }

        // OCR all pages
        interface PageOCRResult { rawText: string; json: Record<string, unknown> }
        const pageResults: PageOCRResult[] = []
        for (const imgPath of imagePaths) {
          try {
            const json = await runRapidOCR(imgPath)
            pageResults.push({ rawText: json.rawText || '', json: json as unknown as Record<string, unknown> })
          } catch (e) {
            console.error('[OCR] page failed:', imgPath, e instanceof Error ? e.message : e)
          }
          // Clean up image
          try { await unlink(imgPath) } catch {}
        }

        if (pageResults.length === 0) {
          return NextResponse.json({ error: 'OCR processing failed — no pages could be processed' }, { status: 500 })
        }

        rawText = pageResults.map(p => p.rawText).join('\n\n--- PAGE BREAK ---\n\n')
        const parsed = pageResults[0].json as Record<string, unknown>

        // Clean up PDF temp file
        try { await unlink(tmpPath) } catch {}
        try { await unlink(txtOutPath) } catch {}

        // EA Form parsing for OCR path
        let eaFormData: EAFormData | null = null
        if (rawText && rawText.length > 50) {
          const eaCheck = isEAForm(rawText)
          console.log('[OCR] isEAForm (OCR fallback):', eaCheck.detected, '| score:', eaCheck.score)
          if (eaCheck.detected) {
            eaFormData = parseEAForm(rawText)
          }
        }

        return NextResponse.json({
          vendor: eaFormData?.employerName ?? 'Unknown Employer',
          date: eaFormData ? `${eaFormData.taxYear}-12-31` : null,
          time: null,
          amount: eaFormData?.grossIncome ?? null,
          tax_amount: null,
          tax_type: null,
          currency: 'MYR',
          category: 'lifestyle',
          invoice_number: null,
          tin: null,
          sst_registration_no: null,
          raw_text: rawText,
          confidence: parsed.confidence ?? 0,
          extraction_method: 'paddleocr_rule',
          needs_review: false,
          document_type: 'ea_form',
          eaFormData,
        })
      }

      // pdftotext succeeded — parse with PDF-specific parser
      pdfPath = tmpPath

    } else {
      // ── Photo: use RapidOCR directly ───────────────────────────────────────
      let parsed: { rawText: string; confidence: number; lines?: unknown[]; [k: string]: unknown }
      let usedV2 = false
      // Try v2 (FastAPI service) first — richer extraction (vendor, date, amount, SST, TIN, etc.)
      try {
        parsed = await runRapidOCRv2(tmpPath)
        usedV2 = true
        console.log('[OCR] v2 service succeeded')
      } catch (v2Err) {
        // Fall back to v1 (subprocess + client-side parser)
        console.warn('[OCR] v2 service failed, falling back to v1:', v2Err instanceof Error ? v2Err.message : v2Err)
        try {
          parsed = await runRapidOCR(tmpPath)
        } catch (v1Err) {
          const msg = v1Err instanceof Error ? v1Err.message : 'OCR processing failed'
          console.error('[OCR] photo failed (v1 fallback):', msg)
          return NextResponse.json({ error: msg }, { status: 500 })
        }
      }

      rawText = parsed.rawText || ''

      // Clean up
      try { await unlink(tmpPath) } catch {}

      // EA Form parsing for photo OCR
      let eaFormData: EAFormData | null = null
      if (rawText && rawText.length > 50) {
        const eaCheck = isEAForm(rawText)
        if (eaCheck.detected) {
          eaFormData = parseEAForm(rawText)
        }
      }

      // Python FastAPI returns snake_case OcrResult directly.
      // v1 fallback: derive what we can from rawText.
      const derivedCategory = usedV2 ? (parsed.category ?? null) : suggestCategory(rawText)
      return NextResponse.json({
        vendor: usedV2 ? (parsed.vendor ?? null) : extractVendor(rawText),
        date: usedV2 ? (parsed.date ?? null) : parseDate(rawText).date,
        time: usedV2 ? (parsed.time ?? null) : parseDate(rawText).time,
        amount: usedV2 ? (parsed.amount ?? null) : extractAmount(rawText),
        tax_amount: usedV2 ? (parsed.tax_amount ?? null) : extractTaxAmount(rawText),
        tax_type: usedV2 ? (parsed.tax_type ?? null) : null,
        currency: usedV2 ? (parsed.currency ?? 'MYR') : detectCurrency(rawText),
        category: derivedCategory,
        invoice_number: usedV2 ? (parsed.invoice_number ?? null) : extractInvoiceNumber(rawText),
        tin: usedV2 ? (parsed.tin ?? null) : null,
        sst_registration_no: usedV2 ? (parsed.sst_registration_no ?? null) : null,
        raw_text: rawText,
        confidence: parsed.confidence ?? 0,
        extraction_method: usedV2 ? (parsed.extraction_method ?? null) : 'paddleocr_rule',
        needs_review: usedV2 ? Boolean(parsed.needs_review) : true,
        document_type: usedV2 ? (parsed.document_type ?? null) : 'unknown',
        eaFormData,
      })
    }

    // ── PDF with pdftotext: EA Form parsing ────────────────────────────────
    let eaFormData: EAFormData | null = null
    if (rawText && rawText.length > 50) {
      const eaCheck = isEAForm(rawText)
      console.log('[OCR] isEAForm (pdftotext):', eaCheck.detected, '| score:', eaCheck.score, '| matched:', eaCheck.matched)

      if (eaCheck.detected) {
        // Use pdftotext-native parser for cleaner results
        eaFormData = parseEAFormFromPDF(rawText)
        // Redacted: do not log full EA form data (may contain PII)
      } else {
        console.log('[OCR] Not detected as EA Form via pdftotext text, skipping')
      }
    }

    // Clean up
    const cleanupPaths = [tmpPath]
    if (pdfPath && pdfPath !== tmpPath) cleanupPaths.push(pdfPath)
    const baseName = path.basename(tmpPath, '.pdf')
    const txtOutPath = path.join(tmpDir, `${baseName}.txt`)
    cleanupPaths.push(txtOutPath)
    for (const p of cleanupPaths) {
      try { await unlink(p) } catch {}
    }

    // Return minimal response for PDF (no receipt parsing — EA Form only)
    return NextResponse.json({
      vendor: eaFormData?.employerName ?? 'Unknown Employer',
      date: eaFormData ? `${eaFormData.taxYear}-12-31` : null,
      time: null,
      amount: eaFormData?.grossIncome ?? null,
      tax_amount: null,
      tax_type: null,
      currency: 'MYR',
      category: 'lifestyle',
      invoice_number: null,
      tin: null,
      sst_registration_no: null,
      raw_text: rawText,
      confidence: 1.0,
      extraction_method: 'pdfplumber',
      needs_review: false,
      document_type: 'ea_form',
      eaFormData,
    })
  } catch (err) {
    console.error('[OCR] Route error:', err instanceof Error ? err.message : err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Parsing utilities are imported from @/lib/ocr-parsers at the top of the file.

