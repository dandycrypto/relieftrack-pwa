/**
 * Tax Report Generator — Full LHDN YA annual PDF report
 * Produces a multi-section PDF: cover, personal details, income summary,
 * tax computation waterfall, relief breakdown, missed opportunities, and
 * a full record appendix.
 */

import { jsPDF } from 'jspdf'
import type { Record, Profile, Settings, ReliefCategory } from '@/store'
import { RELIEF_CATEGORIES, computeTax, calculateTax } from '@/store'
import { formatRM } from '@/lib/export'

// LHDN BE form section code mapping
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

function getApplicable(profile: Profile): ReliefCategory[] {
  return RELIEF_CATEGORIES.filter((cat) => {
    if (cat.alwaysShow) return true
    if (cat.profileKey === 'hasParents' && profile.hasParents) return true
    if (cat.profileKey === 'isDisabled' && (profile.isDisabled || profile.isSpouseDisabled || profile.isChildDisabled)) return true
    if (cat.profileKey === 'hasSpouseRelief' && profile.maritalStatus === 'married' && !profile.isSpouseWorking) return true
    if (cat.profileKey === 'hasChildrenUnder18' && profile.childrenUnder18 > 0) return true
    if (cat.profileKey === 'hasChildrenEducation' && profile.childrenEducation > 0) return true
    if (cat.profileKey === 'isFirstHomeOwner' && profile.isFirstHomeOwner) return true
    return false
  })
}

function catLimit(cat: ReliefCategory, profile: Profile): number {
  if (!cat.perItem) return cat.maxLimit
  if (cat.id === 'children_under18') return profile.childrenUnder18 * cat.maxLimit
  if (cat.id === 'children_education') return profile.childrenEducation * cat.maxLimit
  return cat.maxLimit
}

function drawHRule(doc: jsPDF, y: number, margin: number, pageWidth: number, color = [220, 220, 220]): void {
  doc.setDrawColor(color[0], color[1], color[2])
  doc.setLineWidth(0.3)
  doc.line(margin, y, pageWidth - margin, y)
}

function checkPage(doc: jsPDF, y: number, margin: number): number {
  if (y > 270) {
    doc.addPage()
    return margin
  }
  return y
}

export function generateTaxReport(
  records: Record[],
  profile: Profile,
  settings: Settings,
  reliefTotals: { [catId: string]: number }
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 18
  const taxYear = settings.defaultTaxYear || String(new Date().getFullYear())
  const taxYearNum = parseInt(taxYear)
  const currentEA = settings.eaFormByYear?.[taxYearNum]
  const grossIncome = currentEA?.grossIncome ?? profile.grossIncome
  const epfPaid = currentEA?.epf ?? 0
  const socsoPaid = currentEA?.socso ?? 0
  const pcbPaid = currentEA?.pcb ?? 0
  const today = new Date().toLocaleDateString('en-MY', { day: '2-digit', month: 'long', year: 'numeric' })

  // ── Cover Page ─────────────────────────────────────────────────────────────

  // Emerald gradient top banner
  doc.setFillColor(5, 150, 105)
  doc.rect(0, 0, pageWidth, 60, 'F')
  doc.setFillColor(4, 120, 87)
  doc.rect(0, 42, pageWidth, 18, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.text('ReliefTrack MY', margin, 22)
  doc.setFontSize(13)
  doc.setFont('helvetica', 'normal')
  doc.text(`Year of Assessment ${taxYear} — Annual Tax Report`, margin, 33)
  doc.setFontSize(9)
  doc.text(`Prepared for: ${profile.name}  |  Generated: ${today}`, margin, 46)
  doc.text('For personal tax planning only. Not an official LHDN document.', margin, 53)

  // LHDN badge
  doc.setFillColor(255, 255, 255)
  doc.roundedRect(pageWidth - 58, 12, 50, 15, 3, 3, 'F')
  doc.setTextColor(5, 150, 105)
  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'bold')
  doc.text('LHDN REFERENCE', pageWidth - 55, 19)
  doc.setFont('helvetica', 'normal')
  doc.text('hasil.gov.my', pageWidth - 55, 25)

  let y = 72

  // ── Section 1: Personal Details ────────────────────────────────────────────

  doc.setTextColor(5, 150, 105)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('1. Personal Details', margin, y)
  drawHRule(doc, y + 2, margin, pageWidth)
  y += 9

  const details: [string, string][] = [
    ['Full Name', profile.name || '—'],
    ['Marital Status', profile.maritalStatus.charAt(0).toUpperCase() + profile.maritalStatus.slice(1)],
    ['Children (Under 18)', String(profile.childrenUnder18)],
    ['Children (Higher Ed.)', String(profile.childrenEducation)],
    ['Has Dependent Parents', profile.hasParents ? `Yes (${profile.parentsCount})` : 'No'],
    ['First Home Owner', profile.isFirstHomeOwner ? 'Yes' : 'No'],
    ['Year of Assessment', taxYear],
  ]

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(60, 60, 60)
  details.forEach(([label, value]) => {
    doc.setFont('helvetica', 'bold')
    doc.text(label + ':', margin + 2, y)
    doc.setFont('helvetica', 'normal')
    doc.text(value, margin + 60, y)
    y += 6
  })
  y += 4

  // ── Section 2: Income Summary ──────────────────────────────────────────────

  y = checkPage(doc, y, margin)
  doc.setTextColor(5, 150, 105)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('2. Income Summary', margin, y)
  drawHRule(doc, y + 2, margin, pageWidth)
  y += 9

  const epfRelief = Math.min(epfPaid, 4000)
  const socsoRelief = Math.min(socsoPaid, 350)
  const personalRelief = 9000
  const otherRelief = Object.entries(reliefTotals)
    .filter(([k]) => k !== 'individual' && k !== 'epf_insurance')
    .reduce((s, [, v]) => s + v, 0)
  const epfInsuranceRelief = reliefTotals['epf_insurance'] || 0
  const totalRelief = Object.values(reliefTotals).reduce((s, v) => s + v, 0)
  const chargeableIncome = Math.max(0, grossIncome - epfRelief - personalRelief - otherRelief - Math.max(0, epfInsuranceRelief - epfRelief - socsoRelief))

  const incomeRows: [string, number, string][] = [
    ['Gross Employment Income', grossIncome, ''],
    ['Less: EPF Contribution', -epfRelief, `Capped at RM 4,000 (actual: ${formatRM(epfPaid)})`],
    ['Less: Individual Relief', -personalRelief, 'Automatic — all taxpayers'],
    ['Less: Other Relief Claims', -(totalRelief - personalRelief - epfRelief), ''],
    ['= Chargeable Income', chargeableIncome, ''],
  ]

  // Table header
  doc.setFillColor(241, 245, 249)
  doc.rect(margin, y, pageWidth - margin * 2, 7, 'F')
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(100, 100, 100)
  doc.text('Item', margin + 3, y + 5)
  doc.text('Amount (RM)', pageWidth - margin - 3, y + 5, { align: 'right' })
  y += 7

  doc.setFont('helvetica', 'normal')
  incomeRows.forEach(([label, amount, note], i) => {
    y = checkPage(doc, y, margin)
    if (i % 2 === 1) {
      doc.setFillColor(248, 250, 252)
      doc.rect(margin, y, pageWidth - margin * 2, 7, 'F')
    }
    const isTotal = label.startsWith('=')
    doc.setFont('helvetica', isTotal ? 'bold' : 'normal')
    doc.setTextColor(isTotal ? 5 : 60, isTotal ? 150 : 60, isTotal ? 105 : 60)
    doc.text(label, margin + 3, y + 5)
    if (note) {
      doc.setFontSize(7)
      doc.setTextColor(140, 140, 140)
      doc.text(note, margin + 3, y + 9)
      doc.setFontSize(8)
    }
    doc.setTextColor(amount < 0 ? 220 : (isTotal ? 5 : 60), amount < 0 ? 50 : (isTotal ? 150 : 60), amount < 0 ? 50 : (isTotal ? 105 : 60))
    doc.setFont('helvetica', isTotal ? 'bold' : 'normal')
    doc.text(formatRM(Math.abs(amount)), pageWidth - margin - 3, y + 5, { align: 'right' })
    y += note ? 11 : 7
  })
  y += 6

  // ── Section 3: Tax Computation ─────────────────────────────────────────────

  y = checkPage(doc, y, margin)
  doc.setTextColor(5, 150, 105)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('3. Tax Computation', margin, y)
  drawHRule(doc, y + 2, margin, pageWidth)
  y += 9

  const { taxBeforeRebate, taxAfterRebate } = calculateTax(chargeableIncome)
  const rebate = chargeableIncome <= 35000 ? 400 : 0
  const netBalance = taxAfterRebate - pcbPaid
  const netStatus = netBalance > 0 ? 'Tax Payable (Owe)' : netBalance < 0 ? 'Refund Due' : 'Break Even'
  const netColor: [number, number, number] = netBalance > 0 ? [220, 50, 50] : netBalance < 0 ? [5, 150, 105] : [100, 100, 100]

  const taxRows: [string, number | null, boolean][] = [
    ['Chargeable Income', chargeableIncome, false],
    ['Gross Tax (before rebate)', taxBeforeRebate, false],
    ['Less: Individual Rebate', rebate > 0 ? -rebate : null, false],
    ['Annual Tax Payable', taxAfterRebate, true],
    ['Less: PCB (Monthly Tax Deduction)', pcbPaid > 0 ? -pcbPaid : null, false],
    ['Net Tax Balance', netBalance, true],
  ]

  doc.setFillColor(241, 245, 249)
  doc.rect(margin, y, pageWidth - margin * 2, 7, 'F')
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(100, 100, 100)
  doc.text('Computation Item', margin + 3, y + 5)
  doc.text('Amount (RM)', pageWidth - margin - 3, y + 5, { align: 'right' })
  y += 7

  taxRows.forEach(([label, amount, highlight]) => {
    if (amount === null) return
    y = checkPage(doc, y, margin)
    if (highlight) {
      doc.setFillColor(236, 253, 245)
      doc.rect(margin, y, pageWidth - margin * 2, 7, 'F')
    }
    doc.setFont('helvetica', highlight ? 'bold' : 'normal')
    doc.setTextColor(60, 60, 60)
    doc.text(label, margin + 3, y + 5)
    const isNeg = typeof amount === 'number' && amount < 0
    doc.setTextColor(isNeg ? 220 : (highlight ? 5 : 60), isNeg ? 50 : (highlight ? 150 : 60), isNeg ? 50 : (highlight ? 105 : 60))
    doc.text(formatRM(Math.abs(amount as number)), pageWidth - margin - 3, y + 5, { align: 'right' })
    y += 7
  })

  // Net status box
  y += 2
  doc.setFillColor(...netColor)
  doc.roundedRect(margin, y, pageWidth - margin * 2, 12, 2, 2, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text(`${netStatus}: ${formatRM(Math.abs(netBalance))}`, margin + 4, y + 8)
  y += 18

  // ── Section 4: Relief Breakdown ────────────────────────────────────────────

  y = checkPage(doc, y, margin)
  doc.setTextColor(5, 150, 105)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('4. Relief Breakdown', margin, y)
  drawHRule(doc, y + 2, margin, pageWidth)
  y += 9

  const applicable = getApplicable(profile)

  doc.setFillColor(241, 245, 249)
  doc.rect(margin, y, pageWidth - margin * 2, 7, 'F')
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(100, 100, 100)
  doc.text('Category', margin + 3, y + 5)
  doc.text('Code', margin + 90, y + 5)
  doc.text('Claimed', margin + 108, y + 5)
  doc.text('Limit', margin + 130, y + 5)
  doc.text('%', pageWidth - margin - 3, y + 5, { align: 'right' })
  y += 7

  let reliefSubTotal = 0
  applicable.forEach((cat, i) => {
    y = checkPage(doc, y, margin)
    const claimed = reliefTotals[cat.id] || 0
    const limit = catLimit(cat, profile)
    const pct = limit > 0 ? Math.round((claimed / limit) * 100) : 0
    reliefSubTotal += claimed
    if (i % 2 === 0) {
      doc.setFillColor(250, 250, 250)
      doc.rect(margin, y, pageWidth - margin * 2, 6, 'F')
    }
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(60, 60, 60)
    doc.setFontSize(8)
    doc.text(cat.name.slice(0, 38), margin + 3, y + 4.5)
    doc.setTextColor(140, 140, 140)
    doc.text(LHDN_CODES[cat.id] || '—', margin + 90, y + 4.5)
    doc.setTextColor(5, 150, 105)
    doc.text(formatRM(claimed), margin + 108, y + 4.5)
    doc.setTextColor(100, 100, 100)
    doc.text(formatRM(limit), margin + 130, y + 4.5)
    doc.setTextColor(pct >= 80 ? 5 : pct >= 50 ? 200 : 180, pct >= 80 ? 150 : pct >= 50 ? 120 : 50, pct >= 80 ? 105 : 50)
    doc.text(`${pct}%`, pageWidth - margin - 3, y + 4.5, { align: 'right' })
    y += 6
  })

  // Subtotal row
  y = checkPage(doc, y, margin)
  doc.setFillColor(236, 253, 245)
  doc.rect(margin, y, pageWidth - margin * 2, 7, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(5, 150, 105)
  doc.text('TOTAL RELIEF CLAIMED', margin + 3, y + 5)
  doc.text(formatRM(reliefSubTotal), margin + 108, y + 5)
  y += 12

  // ── Section 5: Missed Opportunities ───────────────────────────────────────

  const missed = applicable.filter((cat) => (reliefTotals[cat.id] || 0) === 0 && cat.id !== 'individual')
  if (missed.length > 0) {
    y = checkPage(doc, y, margin)
    doc.setTextColor(245, 158, 11)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('5. Missed Relief Opportunities', margin, y)
    drawHRule(doc, y + 2, margin, pageWidth, [245, 158, 11])
    y += 9

    doc.setFillColor(255, 251, 235)
    doc.roundedRect(margin, y, pageWidth - margin * 2, 8 + missed.length * 6, 2, 2, 'F')
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(120, 80, 0)
    doc.text('The following reliefs have RM 0 claimed but you may be eligible:', margin + 3, y + 6)
    y += 10

    missed.forEach((cat) => {
      y = checkPage(doc, y, margin)
      const limit = catLimit(cat, profile)
      doc.setTextColor(120, 80, 0)
      doc.text(`• ${cat.name} — up to ${formatRM(limit)} (Code: ${LHDN_CODES[cat.id] || '—'})`, margin + 5, y)
      y += 6
    })
    y += 6
  }

  // ── Section 6: Record Appendix ────────────────────────────────────────────

  const yearRecords = records.filter((r) => r.date.startsWith(taxYear))
  if (yearRecords.length > 0) {
    doc.addPage()
    y = margin
    doc.setTextColor(5, 150, 105)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text(`6. Record Appendix — YA ${taxYear} (${yearRecords.length} records)`, margin, y)
    drawHRule(doc, y + 2, margin, pageWidth)
    y += 9

    doc.setFillColor(241, 245, 249)
    doc.rect(margin, y, pageWidth - margin * 2, 7, 'F')
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(100, 100, 100)
    doc.text('Date', margin + 2, y + 5)
    doc.text('Category', margin + 24, y + 5)
    doc.text('Merchant', margin + 80, y + 5)
    doc.text('Status', margin + 130, y + 5)
    doc.text('Amount', pageWidth - margin - 2, y + 5, { align: 'right' })
    y += 7

    doc.setFont('helvetica', 'normal')
    yearRecords.forEach((rec, i) => {
      y = checkPage(doc, y, margin)
      if (i % 2 === 0) {
        doc.setFillColor(250, 250, 250)
        doc.rect(margin, y, pageWidth - margin * 2, 6, 'F')
      }
      doc.setTextColor(60, 60, 60)
      doc.setFontSize(7.5)
      doc.text(rec.date, margin + 2, y + 4.5)
      const catObj = RELIEF_CATEGORIES.find((c) => c.id === rec.category)
      doc.text((catObj?.name || rec.category).slice(0, 22), margin + 24, y + 4.5)
      doc.text(rec.merchant.slice(0, 26), margin + 80, y + 4.5)
      doc.setTextColor(rec.status === 'verified' ? 5 : 180, rec.status === 'verified' ? 150 : 100, rec.status === 'verified' ? 105 : 50)
      doc.text(rec.status, margin + 130, y + 4.5)
      doc.setTextColor(5, 150, 105)
      doc.text(formatRM(rec.amount), pageWidth - margin - 2, y + 4.5, { align: 'right' })
      y += 6
    })
  }

  // ── Disclaimer ─────────────────────────────────────────────────────────────

  y = checkPage(doc, Math.max(y + 10, 268), margin)
  doc.setFillColor(255, 251, 235)
  doc.roundedRect(margin, y, pageWidth - margin * 2, 18, 2, 2, 'F')
  doc.setFontSize(7)
  doc.setTextColor(180, 140, 60)
  doc.setFont('helvetica', 'bold')
  doc.text('DISCLAIMER', margin + 3, y + 6)
  doc.setFont('helvetica', 'normal')
  const disclaimer = 'This report is for personal tax planning only and is not an official LHDN document. Relief eligibility and amounts are subject to LHDN review and verification. Always refer to the official LHDN e-Filing portal (ezHASiL) or consult a licensed tax agent when filing your tax return.'
  const lines = doc.splitTextToSize(disclaimer, pageWidth - margin * 2 - 6)
  doc.text(lines, margin + 3, y + 12)

  doc.save(`relieftrack-ya${taxYear}-report-${new Date().toISOString().split('T')[0]}.pdf`)
}
