/**
 * Export Module — CSV and PDF export for ReliefTrack MY records
 */

import { jsPDF } from 'jspdf'
import type { Record, Profile, ReliefCategory } from '@/store'
import { RELIEF_CATEGORIES } from '@/store'

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function formatRM(amount: number): string {
  return `RM ${amount.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function categoryName(id: string, categories: ReliefCategory[]): string {
  return categories.find((c) => c.id === id)?.name || id
}

// ─── CSV Export ─────────────────────────────────────────────────────────────

export function exportRecordsCSV(
  records: Record[],
  categories: ReliefCategory[]
): void {
  const headers = ['Date', 'Category', 'Merchant', 'Description', 'Amount (RM)', 'Status']

  const rows = records.map((rec) => [
    rec.date,
    categoryName(rec.category, categories),
    `"${rec.merchant.replace(/"/g, '""')}"`,
    `"${rec.description.replace(/"/g, '""')}"`,
    rec.amount.toFixed(2),
    rec.status,
  ])

  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `relieftack-records-${new Date().toISOString().split('T')[0]}.csv`)
}

// ─── PDF Export ─────────────────────────────────────────────────────────────

export function exportRecordsPDF(
  records: Record[],
  profile: Profile,
  categories: ReliefCategory[],
  totals: Record<string, number>,
  totalClaimed: number,
  totalPossible: number
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 20
  let y = margin

  // ── Header ──────────────────────────────────────────────────────────────

  // Emerald header bar
  doc.setFillColor(5, 150, 105) // emerald-600
  doc.rect(0, 0, pageWidth, 38, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text('ReliefTrack MY', margin, 18)

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(`Tax Relief Summary — ${profile.name}`, margin, 26)
  doc.text(`Year of Assessment ${new Date().getFullYear()} | Generated ${new Date().toLocaleDateString('en-MY')}`, margin, 32)

  // LHDN badge
  doc.setFillColor(255, 255, 255)
  doc.roundedRect(pageWidth - 55, 12, 45, 14, 3, 3, 'F')
  doc.setTextColor(5, 150, 105)
  doc.setFontSize(7)
  doc.text('Source: LHDN Official', pageWidth - 53, 18)
  doc.setFontSize(6)
  doc.text('For personal planning only', pageWidth - 53, 23)

  y = 48

  // ── Summary Cards ───────────────────────────────────────────────────────

  const colW = (pageWidth - margin * 2 - 8) / 3

  // Total Claimed
  doc.setFillColor(5, 150, 105)
  doc.roundedRect(margin, y, colW, 28, 3, 3, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(8)
  doc.text('TOTAL RELIEF CLAIMED', margin + 4, y + 8)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(formatRM(totalClaimed), margin + 4, y + 20)
  doc.setFont('helvetica', 'normal')

  // Total Possible
  doc.setFillColor(14, 139, 123)
  doc.roundedRect(margin + colW + 4, y, colW, 28, 3, 3, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(8)
  doc.text('MAXIMUM POSSIBLE', margin + colW + 8, y + 8)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(formatRM(totalPossible), margin + colW + 8, y + 20)
  doc.setFont('helvetica', 'normal')

  // Estimated Savings
  doc.setFillColor(245, 158, 11) // amber
  doc.roundedRect(margin + (colW + 4) * 2, y, colW, 28, 3, 3, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(8)
  doc.text('EST. TAX SAVINGS', margin + (colW + 4) * 2 + 4, y + 8)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(`~${formatRM(Math.round(totalClaimed * 0.2))}`, margin + (colW + 4) * 2 + 4, y + 20)
  doc.setFont('helvetica', 'normal')

  y += 36

  // ── Per-Category Breakdown ───────────────────────────────────────────────

  doc.setTextColor(40, 40, 40)
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('Relief Breakdown', margin, y)
  y += 6

  const applicableCats = categories.filter((cat) => {
    if (cat.alwaysShow) return true
    if (cat.profileKey === 'hasParents' && profile.hasParents) return true
    if (cat.profileKey === 'isDisabled' && (profile.isDisabled || profile.isSpouseDisabled || profile.isChildDisabled)) return true
    if (cat.profileKey === 'hasSpouseRelief' && profile.maritalStatus === 'married' && !profile.isSpouseWorking) return true
    if (cat.profileKey === 'hasChildrenUnder18' && profile.childrenUnder18 > 0) return true
    if (cat.profileKey === 'hasChildrenEducation' && profile.childrenEducation > 0) return true
    if (cat.profileKey === 'isFirstHomeOwner' && profile.isFirstHomeOwner) return true
    return false
  })

  // Table header
  doc.setFillColor(241, 245, 249)
  doc.rect(margin, y, pageWidth - margin * 2, 7, 'F')
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(100, 100, 100)
  doc.text('Category', margin + 2, y + 5)
  doc.text('Claimed', margin + 80, y + 5)
  doc.text('Max Limit', margin + 115, y + 5)
  doc.text('% Used', pageWidth - margin - 2, y + 5, { align: 'right' })
  y += 7

  doc.setFont('helvetica', 'normal')
  applicableCats.forEach((cat) => {
    const claimed = totals[cat.id] || 0
    const maxLimit = cat.perItem
      ? cat.id === 'children_under18' ? profile.childrenUnder18 * cat.maxLimit
      : profile.childrenEducation * cat.maxLimit
      : cat.maxLimit
    const pct = maxLimit > 0 ? Math.round((claimed / maxLimit) * 100) : 0

    if (y > 270) {
      doc.addPage()
      y = margin
    }

    doc.setTextColor(40, 40, 40)
    doc.setFontSize(8.5)
    doc.text(cat.name.slice(0, 45), margin + 2, y + 5)
    doc.setTextColor(5, 150, 105)
    doc.text(formatRM(claimed), margin + 80, y + 5)
    doc.setTextColor(100, 100, 100)
    doc.text(formatRM(maxLimit), margin + 115, y + 5)
    doc.setTextColor(pct >= 80 ? 5 : 100, pct >= 80 ? 150 : 100, pct >= 80 ? 105 : 100)
    doc.text(`${pct}%`, pageWidth - margin - 2, y + 5, { align: 'right' })
    y += 6
  })

  y += 8

  // ── Records Table ───────────────────────────────────────────────────────

  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(40, 40, 40)
  doc.text('Record Details', margin, y)
  y += 6

  // Table header
  doc.setFillColor(241, 245, 249)
  doc.rect(margin, y, pageWidth - margin * 2, 7, 'F')
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(100, 100, 100)
  doc.text('Date', margin + 2, y + 5)
  doc.text('Category', margin + 30, y + 5)
  doc.text('Merchant', margin + 90, y + 5)
  doc.text('Amount', pageWidth - margin - 2, y + 5, { align: 'right' })
  y += 7

  doc.setFont('helvetica', 'normal')
  records.forEach((rec, i) => {
    if (y > 275) {
      doc.addPage()
      y = margin
    }
    if (i % 2 === 0) {
      doc.setFillColor(250, 250, 250)
      doc.rect(margin, y, pageWidth - margin * 2, 6, 'F')
    }
    doc.setTextColor(60, 60, 60)
    doc.setFontSize(8)
    doc.text(rec.date, margin + 2, y + 4.5)
    doc.text(categoryName(rec.category, categories).split(' ').slice(0, 4).join(' '), margin + 30, y + 4.5)
    doc.text(rec.merchant.slice(0, 30), margin + 90, y + 4.5)
    doc.setTextColor(5, 150, 105)
    doc.text(formatRM(rec.amount), pageWidth - margin - 2, y + 4.5, { align: 'right' })
    y += 6
  })

  // ── Disclaimer ──────────────────────────────────────────────────────────

  y = Math.max(y + 10, 270)
  doc.setFillColor(255, 251, 235)
  doc.roundedRect(margin, y, pageWidth - margin * 2, 16, 2, 2, 'F')
  doc.setFontSize(7)
  doc.setTextColor(180, 140, 60)
  doc.setFont('helvetica', 'bold')
  doc.text('DISCLAIMER', margin + 3, y + 6)
  doc.setFont('helvetica', 'normal')
  doc.text('This summary is for personal tax planning purposes only. Relief eligibility and amounts are subject to LHDN verification. Always consult LHDN or a licensed tax agent for official tax filing.', margin + 3, y + 11)

  // Save
  doc.save(`relieftack-summary-${new Date().toISOString().split('T')[0]}.pdf`)
}

// ─── LHDN BE Form Reference Export ──────────────────────────────────────────

const LHDN_CODES: Record<string, string> = {
  individual: 'D1',
  medical_self: 'D7',
  parents_medical: 'D6',
  disabled: 'D2',
  disabled_equipment: 'D4',
  spouse: 'D8',
  children_under18: 'D9',
  children_education: 'D10',
  education_self: 'D11',
  lifestyle: 'D14',
  epf_insurance: 'D12/D13',
  housing_loan: 'D16',
}

export function exportLHDNReference(
  records: Record[],
  profile: Profile,
  reliefTotals: { [catId: string]: number },
  taxYear: string
): void {
  const lines: string[] = []

  lines.push(`LHDN BE FORM REFERENCE — YEAR OF ASSESSMENT ${taxYear}`)
  lines.push(`Name: ${profile.name}`)
  lines.push(`Generated: ${new Date().toLocaleDateString('en-MY')}`)
  lines.push(`Note: For personal reference only. Not an official LHDN document.`)
  lines.push('')
  lines.push('SECTION D — PERSONAL RELIEFS')
  lines.push('Code,Relief Category,Amount Claimed (RM),Eligible Limit (RM),Utilised %')

  RELIEF_CATEGORIES.forEach((cat) => {
    const claimed = reliefTotals[cat.id] || 0
    const limit = cat.perItem
      ? cat.id === 'children_under18' ? profile.childrenUnder18 * cat.maxLimit
      : profile.childrenEducation * cat.maxLimit
      : cat.maxLimit
    const pct = limit > 0 ? Math.round((claimed / limit) * 100) : 0
    const code = LHDN_CODES[cat.id] || '—'
    lines.push(`${code},"${cat.name}",${claimed.toFixed(2)},${limit.toFixed(2)},${pct}%`)
  })

  const total = Object.values(reliefTotals).reduce((s, v) => s + v, 0)
  lines.push(`,"TOTAL RELIEF",${total.toFixed(2)},,`)
  lines.push('')
  lines.push('RECORD DETAILS')
  lines.push('Date,Category,Merchant,Description,Amount (RM),Status')

  const yearRecords = records.filter((r) => r.date.startsWith(taxYear))
  yearRecords.forEach((rec) => {
    const catName = RELIEF_CATEGORIES.find((c) => c.id === rec.category)?.name || rec.category
    lines.push([
      rec.date,
      `"${catName}"`,
      `"${rec.merchant.replace(/"/g, '""')}"`,
      `"${rec.description.replace(/"/g, '""')}"`,
      rec.amount.toFixed(2),
      rec.status,
    ].join(','))
  })

  downloadBlob(
    new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' }),
    `lhdn-reference-ya${taxYear}-${new Date().toISOString().split('T')[0]}.csv`
  )
}

// ─── Blob Download ──────────────────────────────────────────────────────────

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
