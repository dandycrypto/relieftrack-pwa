/**
 * Year-End Scenario Planner
 * "What if I top up PRS by RM 3,000? What if I max out my gym membership?"
 * Shows before/after tax impact for hypothetical additions
 */

import { computeTax } from '@/store'
import type { Profile, Settings } from '@/store'
import { getEffectiveCap } from '@/lib/lhdn-rules'

export interface ScenarioInput {
  categoryId: string
  additionalAmount: number   // RM to add on top of current claimed
}

export interface ScenarioResult {
  categoryId:       string
  label:            string
  currentClaimed:   number
  additionalAmount: number
  cappedAddition:   number   // min(additionalAmount, remaining cap)
  newClaimed:       number
  taxBefore:        number
  taxAfter:         number
  taxSaved:         number
  roiPercent:       number   // taxSaved / cappedAddition * 100
}

export interface PlannerResult {
  baseChargeableIncome: number
  baseTax:              number
  scenarios:            ScenarioResult[]
  combinedTaxSaved:     number   // if ALL scenarios applied (non-overlapping)
  combinedNewTax:       number
}

export function runScenarios(
  currentChargeableIncome: number,
  currentTax: number,
  reliefTotals: Record<string, number>,
  scenarios: ScenarioInput[],
  taxYear: number,
  profile: Profile
): PlannerResult {
  const CATEGORY_LABELS: Record<string, string> = {
    lifestyle:           'Lifestyle (Books/PC/Internet/Sports)',
    medical_self:        'Medical (Self/Spouse/Child)',
    parents_medical:     'Medical (Parents)',
    education_self:      'Education (Self)',
    epf_insurance:       'EPF / Life Insurance / Takaful',
    private_pension:     'PRS / Private Pension',
    housing_loan:        'Home Loan Interest',
    children_under18:    'Children Under 18',
    children_education:  'Children (Higher Education)',
    disabled:            'Disabled Individual',
    disabled_equipment:  'Disabled Equipment',
    spouse:              'Spouse Relief',
  }

  const scenarioResults: ScenarioResult[] = []
  let totalCappedAddition = 0

  for (const input of scenarios) {
    const childCount = input.categoryId === 'children_under18'
      ? (profile.childrenUnder18 || 1)
      : input.categoryId === 'children_education'
        ? (profile.childrenEducation || 1)
        : 1
    const cap        = getEffectiveCap(input.categoryId, taxYear, childCount)
    const current    = reliefTotals[input.categoryId] ?? 0
    const remaining  = Math.max(0, cap - current)
    const capped     = Math.min(input.additionalAmount, remaining)

    if (capped <= 0) continue

    const ciAfter  = Math.max(0, currentChargeableIncome - capped)
    const taxAfter = computeTax(ciAfter)
    const taxSaved = Math.max(0, currentTax - taxAfter)

    scenarioResults.push({
      categoryId:       input.categoryId,
      label:            CATEGORY_LABELS[input.categoryId] ?? input.categoryId,
      currentClaimed:   current,
      additionalAmount: input.additionalAmount,
      cappedAddition:   capped,
      newClaimed:       current + capped,
      taxBefore:        currentTax,
      taxAfter,
      taxSaved,
      roiPercent:       capped > 0 ? (taxSaved / capped) * 100 : 0,
    })

    totalCappedAddition += capped
  }

  const ciCombined  = Math.max(0, currentChargeableIncome - totalCappedAddition)
  const taxCombined = computeTax(ciCombined)

  return {
    baseChargeableIncome: currentChargeableIncome,
    baseTax:              currentTax,
    scenarios:            scenarioResults.sort((a, b) => b.taxSaved - a.taxSaved),
    combinedTaxSaved:     Math.max(0, currentTax - taxCombined),
    combinedNewTax:       taxCombined,
  }
}

// Quick scenarios the AI assistant or dashboard can suggest
export function getQuickScenarios(
  reliefTotals: Record<string, number>,
  taxYear: number,
  profile: Profile
): ScenarioInput[] {
  const scenarios: ScenarioInput[] = []

  const addIfRoom = (categoryId: string, amount: number) => {
    const childCount = categoryId === 'children_under18'
      ? (profile.childrenUnder18 || 1)
      : 1
    const cap = getEffectiveCap(categoryId, taxYear, childCount)
    const current = reliefTotals[categoryId] ?? 0
    if (current < cap && cap > 0) {
      scenarios.push({ categoryId, additionalAmount: Math.min(amount, cap - current) })
    }
  }

  addIfRoom('lifestyle',       1000)   // RM 1,000 extra lifestyle spend
  addIfRoom('epf_insurance',   3000)   // max out life insurance portion
  addIfRoom('education_self',  2000)   // upskilling sub-limit
  addIfRoom('medical_self',    1000)   // vaccination / checkup
  addIfRoom('parents_medical', 2000)   // parents' medical

  return scenarios
}
