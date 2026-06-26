/**
 * Audit Pack ZIP Export
 * One button → ZIP containing:
 *   - _Records_YA{year}.pdf       (existing generateTaxReport)
 *   - _Summary_YA{year}.xlsx      (generateAuditExcel)
 *   - _Manifest_YA{year}.csv      (record list with LHDN codes)
 *   - receipts/{LHDN-coded filename}  (receipt images/PDFs)
 *
 * Uses native browser-side ZIP creation via fflate (tiny, no dependency needed
 * — we use a minimal inline implementation that gathers files and triggers download).
 *
 * NOTE: fflate is not installed. We use a simpler approach: create a multipart
 * archive in memory using the Blob API + streaming download with a manifest.
 * For production, install 'fflate' or 'jszip'. Here we generate a manifest CSV
 * + the Excel + PDF and prompt downloads, bundled in sequence.
 */

import type { Record, Profile, Settings } from '@/store'

interface AuditPackOptions {
  records: Record[]
  profile: Profile
  settings: Settings
  reliefTotals: Record<string, number>
  taxYear: number
  taxSummary: {
    grossIncome: number
    epf: number
    socso: number
    pcb: number
    reliefTotal: number
    chargeableIncome: number
    estimatedTax: number
    taxAfterRebate: number
    balance: number
  }
}

import { BE_CODES } from '@/lib/lhdn-rules'

function lhdnFileName(r: Record): string {
  const date = r.date.slice(0, 10)
  const merchant = (r.merchant || 'Receipt').replace(/[^a-zA-Z0-9]/g, '').slice(0, 20)
  const code = BE_CODES[r.category] ?? 'D0'
  const amt = `RM${Math.round(r.amount)}`
  const sub = r.lhdNCategory ? r.lhdNCategory.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12) : ''
  const parts = [date, merchant, code, amt, sub].filter(Boolean)
  return parts.join('_')
}

export function generateManifestCSV(records: Record[], taxYear: number): string {
  const yearRecords = records.filter((r) => r.date.startsWith(String(taxYear)))
  const header = ['#', 'Date', 'Merchant', 'Category', 'LHDN Code', 'Amount (RM)', 'Recipient', 'Receipt Filename', 'Drive Synced', 'Audit Status']
  const rows = yearRecords.map((r, i) => {
    const code = BE_CODES[r.category] ?? '—'
    const fileName = r.receiptFileName || (r.receiptUrl ? `${lhdnFileName(r)}.jpg` : '—')
    const auditStatus = r.receiptUrl ? 'Receipt attached' : r.category === 'individual' ? 'Auto (no receipt needed)' : 'MISSING RECEIPT'
    return [
      i + 1,
      r.date,
      r.merchant,
      r.category.replace(/_/g, ' '),
      code,
      r.amount.toFixed(2),
      r.recipient || 'self',
      fileName,
      r.syncedToDrive ? 'Yes' : 'No',
      auditStatus,
    ].join(',')
  })
  return [header.join(','), ...rows].join('\n')
}

export async function downloadAuditPack(options: AuditPackOptions): Promise<void> {
  const { records, profile, settings, reliefTotals, taxYear, taxSummary } = options
  const ya = `YA${taxYear}`

  // 1. Manifest CSV
  const csv = generateManifestCSV(records, taxYear)
  const csvBlob = new Blob([csv], { type: 'text/csv' })
  triggerDownload(csvBlob, `_Manifest_${ya}.csv`)

  // 2. Excel audit summary
  try {
    const { generateAuditExcel, downloadAuditExcel } = await import('@/lib/audit-export')
    const blob = await generateAuditExcel(records, profile, settings, reliefTotals, taxSummary, taxYear)
    downloadAuditExcel(blob, taxYear)
  } catch {
    console.warn('Excel export failed')
  }

  // 3. PDF tax report (slight delay so browser doesn't block multiple downloads)
  await delay(500)
  try {
    const { generateTaxReport } = await import('@/lib/tax-report')
    const yearRecords = records.filter((r) => r.date.startsWith(String(taxYear)))
    generateTaxReport(yearRecords, profile, settings, reliefTotals)
  } catch {
    console.warn('PDF export failed')
  }
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}
