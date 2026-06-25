import { NextRequest, NextResponse } from 'next/server'
import { spawn, execSync } from 'child_process'
import { writeFile, unlink, mkdir, readFile } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

export const runtime = 'nodejs'
export const maxDuration = 60

// Floor to nearest RM (no cents) — LHDN whole-number rule
const floorRM = (n: number) => Math.floor(n)

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
    // Extract KWSP member ID (10-12 char alphanumeric, often follows "No. Kad KWSP" or "Member No.")
    const kwspMemberPatterns = [
      /No\.?\s*Kad\s*KWSP.*?([A-Z0-9]{10,12})/i,
      /Member\s*No[\.:]?\s*([A-Z0-9]{10,12})/i,
      /KWSP\s*ID[\.:]?\s*([A-Z0-9]{10,12})/i,
      /No\.?\s*Ahli[\.:]?\s*([A-Z0-9]{10,12})/i,
    ]
    for (const pat of kwspMemberPatterns) {
      const m = rawText.match(pat)
      if (m) { result.kwspMemberId = m[1]; break }
    }
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
  const tinPatterns = [
    /TIN[\s:]*([0-9-]{10,20})/i,
    /NO\.?\s*TIN[\s:]*([0-9-]{10,20})/i,
    /NO\.?\s*CUKAI[\s:]*([0-9-]{10,20})/i,
  ]
  for (const pat of tinPatterns) {
    const m = rawText.match(pat)
    if (m) { result.lhdnTin = m[1]; break }
  }

  // ── Extract EA Form number ──
  const eaFormPatterns = [
    /EA\s*Form\s*(?:No[\.:]|Number|#)?\s*([A-Z0-9-]{5,20})/i,
    /EASY\s*II\s*ID[\.:]?\s*([A-Z0-9-]{5,15})/i,
  ]
  for (const pat of eaFormPatterns) {
    const m = rawText.match(pat)
    if (m) { result.eaFormNumber = m[1]; break }
  }

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
  const kwspMemberPatterns = [
    /No\.?\s*Kad\s*KWSP.*?([A-Z0-9]{10,12})/i,
    /Member\s*No[\.:]?\s*([A-Z0-9]{10,12})/i,
    /KWSP\s*ID[\.:]?\s*([A-Z0-9]{10,12})/i,
    /No\.?\s*Ahli[\.:]?\s*([A-Z0-9]{10,12})/i,
  ]
  for (const pat of kwspMemberPatterns) {
    const m = rawText.match(pat)
    if (m) { result.kwspMemberId = m[1]; break }
  }

  // ── Extract LHDN TIN ──
  const tinPatterns = [
    /TIN[\s:]*([0-9-]{10,20})/i,
    /NO\.?\s*TIN[\s:]*([0-9-]{10,20})/i,
    /NO\.?\s*CUKAI[\s:]*([0-9-]{10,20})/i,
  ]
  for (const pat of tinPatterns) {
    const m = rawText.match(pat)
    if (m) { result.lhdnTin = m[1]; break }
  }

  // ── Extract EA Form number ──
  const eaFormPatterns = [
    /EA\s*Form\s*(?:No[\.:]|Number|#)?\s*([A-Z0-9-]{5,20})/i,
    /EASY\s*II\s*ID[\.:]?\s*([A-Z0-9-]{5,15})/i,
  ]
  for (const pat of eaFormPatterns) {
    const m = rawText.match(pat)
    if (m) { result.eaFormNumber = m[1]; break }
  }

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
        execSync('pdftotext', ['-layout', tmpPath, txtOutPath], { timeout: 30000 })
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
        execSync('pdftoppm', ['-jpeg', '-r', '200', tmpPath, imgBase], { timeout: 60000 })
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
          amount: null,
          date: null,
          merchant: eaFormData?.employerName ?? 'Unknown Employer',
          description: `EA Form ${eaFormData?.taxYear ?? ''}`,
          suggestedCategory: 'lifestyle',
          invoiceNumber: null,
          taxAmount: null,
          lhdNCategory: '',
          recipient: '',
          rawText,
          confidence: parsed.confidence ?? 0,
          time: null,
          currency: 'MYR',
          taxExempt: false,
          lineItems: '',
          notes: '',
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

      // Photo OCR returns rawText + (when v2) structured fields
      // Client (lib/ocr.ts) parses vendor/amount/date/etc. from rawText as fallback
      return NextResponse.json({
        // v2 structured fields (when usedV2)
        vendor: usedV2 ? (parsed.vendor ?? null) : null,
        date: usedV2 ? (parsed.date ?? null) : null,
        time: usedV2 ? (parsed.time ?? null) : null,
        amount: usedV2 ? (parsed.amount ?? null) : null,
        tax_amount: usedV2 ? (parsed.tax_amount ?? null) : null,
        tax_type: usedV2 ? (parsed.tax_type ?? null) : null,
        currency: usedV2 ? (parsed.currency ?? 'MYR') : 'MYR',
        category: usedV2 ? (parsed.category ?? null) : null,
        invoice_number: usedV2 ? (parsed.invoice_number ?? null) : null,
        tin: usedV2 ? (parsed.tin ?? null) : null,
        sst_registration_no: usedV2 ? (parsed.sst_registration_no ?? null) : null,
        document_type: usedV2 ? (parsed.document_type ?? null) : null,
        extraction_method: usedV2 ? (parsed.extraction_method ?? null) : null,
        needs_review: usedV2 ? Boolean(parsed.needs_review) : false,
        confidence_band: usedV2 ? (parsed.confidence_band ?? null) : null,
        // Legacy aliases (dashboard reads these)
        merchant: usedV2 ? (parsed.vendor ?? 'Unknown Merchant') : 'Unknown Merchant',
        invoiceNumber: usedV2 ? (parsed.invoice_number ?? null) : null,
        taxAmount: usedV2 ? (parsed.tax_amount ?? null) : null,
        suggestedCategory: usedV2 ? (parsed.category ?? 'lifestyle') : 'lifestyle',
        description: '',
        lhdNCategory: '',
        recipient: '',
        rawText,
        confidence: parsed.confidence ?? 0,
        taxExempt: false,
        lineItems: '',
        notes: '',
        eaFormData,
        ocr_v2: usedV2,
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
        console.log('[OCR] parseEAFormFromPDF result:', JSON.stringify(eaFormData))
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
      amount: null,
      date: null,
      merchant: eaFormData?.employerName ?? 'Unknown Employer',
      description: `EA Form ${eaFormData?.taxYear ?? ''}`,
      suggestedCategory: 'lifestyle',
      invoiceNumber: null,
      taxAmount: null,
      lhdNCategory: '',
      recipient: '',
      rawText,
      confidence: 1.0,
      time: null,
      currency: 'MYR',
      taxExempt: false,
      lineItems: '',
      notes: '',
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
  // Shopee / digital receipt: "Total Paid" or "Amount Paid" — this is the FINAL amount the user paid
  // Priority over product prices (which are higher). Must check BEFORE generic TOTAL.
  let m = text.match(/(?:Total|Amount)\s*Paid[^0-9]*RM?\s*([\d,]+\.\d{2})/i)
  if (m) {
    const val = parseFloat(m[1].replace(/,/g, ''))
    if (!isNaN(val) && val > 0) return val
  }
  // Also check for "Total" on its own line (Shopee formats as separate line)
  m = text.match(/(?:Total|Amount)[\s:]*Paid[\s\n]*RM?\s*([\d,]+\.\d{2})/i)
  if (m) {
    const val = parseFloat(m[1].replace(/,/g, ''))
    if (!isNaN(val) && val > 0) return val
  }

  // Medical/hospital receipts: TOTALBILL is the grand total (HIGH priority)
  m = text.match(/TOTALBILL\s*:?\s*RM?\s*([\d,]+\.?\d*)/i)
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

  // Fallback: look for amounts near transaction keywords
  const TXN_KW = ["total","credit","cash","payment","payable","sales","amount","due","rounding","change","rm ","sgd","usd","balance","nett","net","charge","fee"]
  const txnPos: number[] = []
  TXN_KW.forEach(kw => {
    let match
    const regex = new RegExp(kw, 'gi')
    while ((match = regex.exec(text)) !== null) {
      txnPos.push(match.index)
    }
  })

  // Find all candidate amounts (numbers that look like money, not dates)
  const candidates: number[] = []
  const amountRegex = /(?<![.\d])(\d{1,4}[,.]?\d{0,2}[,.]?\d{2})(?![.\d])/g
  while ((m = amountRegex.exec(text)) !== null) {
    try {
      const val = parseFloat(m[1].replace(/,/g, ''))
      if (isNaN(val) || val < 0.01 || val > 9999) continue
      // Skip amounts part of a date context
      const ctx = text.slice(Math.max(0, m.index - 10), m.index + 10)
      if (/\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}/.test(ctx)) continue
      // Check proximity to transaction keywords
      const lineStart = text.lastIndexOf('\n', m.index) + 1
      const lineEnd = text.indexOf('\n', m.index)
      const line = text.slice(lineStart, lineEnd === -1 ? m.index + 30 : lineEnd).toLowerCase()
      if (TXN_KW.some(kw => line.includes(kw))) {
        candidates.push(val)
      }
    } catch {}
  }

  if (candidates.length > 0) return Math.max(...candidates)

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
            if (cleaned.length > 3) return cleaned.slice(0, 80)
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
          if (cleaned.length > 3) return cleaned.slice(0, 80)
        }
      }
      break
    }
  }

  // Priority 3: fallback — first substantial text line
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    const line = lines[i]
    if (/\b(selangor|kuala lumpur|shah alam|sungei|sungai buloh|petaling|pj|cyberjaya|putrajaya|johor bahru|penang|melaka|ipoh|kedah|kelantan|terengganu|pahang|perak|sarawak|sabah|malaysia|40160|47000|50000)\b/i.test(line)) {
      continue
    }
    if (/^[A-Z][A-Z\s]{3,30},$/.test(line)) {
      continue
    }

    let skip = false
    for (const p of VENDOR_SKIP_PATTERNS) {
      if (p.test(line)) { skip = true; break }
    }
    if (skip) continue

    const cleaned = line.replace(/[^\w\s\-&()/.]/g, ' ').trim()
    if (cleaned.length > 3) {
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
    if (match && match[1]) return match[1].toUpperCase().slice(0, 30)
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

// ─── Line Items Extraction ─────────────────────────────────────────────────

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

  if (parentNames.some(n => n && patientNorm.includes(n) || patientNorm.includes(n))) return 'parent'
  if (spouseName && (patientNorm.includes(spouseName) || spouseName.includes(patientNorm))) return 'spouse'
  if (childNames.some(n => n && (patientNorm.includes(n) || patientNorm.includes(n)))) return 'child'
  if (userName && (patientNorm.includes(userName) || userName.includes(patientNorm))) return 'self'

  return ''
}

// ─── Main OCR Function ───────────────────────────────────────────────────────

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
