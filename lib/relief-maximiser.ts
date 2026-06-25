/**
 * Relief Maximiser — ranks unclaimed relief by marginal tax savings
 * "Which relief gives the most RM of tax reduction per RM of spend?"
 *
 * Formula: taxSaved = computeTax(CI) - computeTax(CI - remainingRelief)
 * where CI = current chargeable income
 */

import { computeTax, RELIEF_CATEGORIES } from '@/store'
import type { Profile, Settings, Record } from '@/store'
import { getEligibleRules, getEffectiveCap } from '@/lib/lhdn-rules'

export interface ReliefOpportunity {
  categoryId:    string
  label:         string
  beCode:        string
  claimed:       number     // RM already claimed
  cap:           number     // effective cap (per-child already multiplied)
  remaining:     number     // cap - claimed, capped to 0
  taxSaved:      number     // RM of additional tax if remaining is fully claimed
  marginalRate:  number     // percentage — taxSaved / remaining * 100
  utilisation:   number     // claimed / cap * 100
  priority:      'high' | 'medium' | 'low'
}

export interface MaximiserResult {
  chargeableIncome:   number
  currentTax:         number
  fullPotentialTax:   number
  potentialSaving:    number
  opportunities:      ReliefOpportunity[]
}

function chargeableIncome(profile: Profile, settings: Settings, records: Record[]): number {
  const taxYear = parseInt(settings.defaultTaxYear) || new Date().getFullYear()
  const ea = settings.eaFormByYear?.[taxYear]
  const gross = ea?.grossIncome ?? profile.grossIncome ?? 0
  const epf   = Math.min(ea?.epf   ?? 0, 4000)
  const reliefs = records
    .filter((r) => r.date.startsWith(String(taxYear)))
    .reduce((sum, r) => {
      // EPF/SOCSO already handled separately
      if (r.category === 'epf_insurance') return sum
      return sum + r.amount
    }, 0)
  const personalRelief = 9000
  return Math.max(0, gross - epf - personalRelief - reliefs)
}

export function computeMaximiser(
  profile:    Profile,
  settings:   Settings,
  records:    Record[],
  reliefTotals: Record<string, number>
): MaximiserResult {
  const taxYear = parseInt(settings.defaultTaxYear) || new Date().getFullYear()
  const eligibleRules = getEligibleRules(profile, taxYear)

  const ea = settings.eaFormByYear?.[taxYear]
  const gross  = ea?.grossIncome ?? profile.grossIncome ?? 0
  const epf    = Math.min(ea?.epf  ?? 0, 4000)
  const socso  = Math.min(ea?.socso ?? 0, 400)

  // Current state
  const ci = chargeableIncome(profile, settings, records)
  const currentTax = computeTax(ci)

  const opportunities: ReliefOpportunity[] = []

  for (const rule of eligibleRules) {
    if (rule.autoApply) continue  // individual D1 — always claimed, no action needed

    const catMeta = RELIEF_CATEGORIES.find((c) => c.id === rule.categoryId)
    const childCount = rule.categoryId === 'children_under18'
      ? (profile.childrenUnder18 || 0)
      : rule.categoryId === 'children_education'
        ? (profile.childrenEducation || 0)
        : 1

    const cap     = getEffectiveCap(rule.categoryId, taxYear, childCount)
    const claimed = reliefTotals[rule.categoryId] ?? 0
    const remaining = Math.max(0, cap - claimed)

    if (remaining <= 0) continue

    // Marginal tax saved from claiming the remaining amount
    const ciAfter = Math.max(0, ci - remaining)
    const taxAfter = computeTax(ciAfter)
    const taxSaved = Math.max(0, currentTax - taxAfter)

    const marginalRate = remaining > 0 ? (taxSaved / remaining) * 100 : 0
    const utilisation  = cap > 0 ? (claimed / cap) * 100 : 0

    opportunities.push({
      categoryId:   rule.categoryId,
      label:        catMeta?.name ?? rule.label,
      beCode:       rule.beCode,
      claimed,
      cap,
      remaining,
      taxSaved,
      marginalRate,
      utilisation,
      priority:     marginalRate >= 15 ? 'high' : marginalRate >= 8 ? 'medium' : 'low',
    })
  }

  // Sort by taxSaved descending
  opportunities.sort((a, b) => b.taxSaved - a.taxSaved)

  // Full-potential tax (if all remaining reliefs were claimed)
  const totalRemaining = opportunities.reduce((s, o) => s + o.remaining, 0)
  const ciFullPotential = Math.max(0, ci - totalRemaining)
  const fullPotentialTax = computeTax(ciFullPotential)

  return {
    chargeableIncome: ci,
    currentTax,
    fullPotentialTax,
    potentialSaving: Math.max(0, currentTax - fullPotentialTax),
    opportunities,
  }
}
