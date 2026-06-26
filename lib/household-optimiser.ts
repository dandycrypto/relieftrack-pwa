/**
 * Household / Spouse Assessment Optimiser
 * Models joint vs separate assessment and which spouse should claim shared reliefs
 * (children, spouse, parents) to minimise total household tax.
 */

import { computeTax } from '@/store'

export interface SpouseProfile {
  grossIncome: number
  epf: number        // employee EPF, capped at 4000
  personalRelief: number  // always 9000 for individual
  existingReliefs: number  // all other reliefs already claimed (not children/spouse)
}

export interface HouseholdOptimisation {
  primarySeparate: number     // primary filer tax under separate assessment
  spouseSeparate:  number     // spouse tax under separate assessment
  totalSeparate:   number     // sum
  totalJoint:      number     // primary tax under joint assessment
  jointSaving:     number     // totalSeparate - totalJoint (positive = joint is better)
  recommendation:  'separate' | 'joint'
  rationale:       string
  childRelief:     { claimWith: 'primary' | 'spouse'; taxSaved: number }
  spouseRelief:    { worthClaiming: boolean; taxSaved: number }
}

/**
 * Estimate tax for separate assessment (standard path — primary claims spouse + child reliefs).
 * Returns the combined household tax if filing separately with optimal allocation.
 */
export function optimiseHousehold(
  primary: SpouseProfile,
  spouseIncome: number,      // spouse's gross income for the year
  childrenUnder18: number,
  childrenEducation: number,
  hasSpouseRelief: boolean   // primary has non-working / low-income spouse
): HouseholdOptimisation {
  const SPOUSE_RELIEF = 4000
  const CHILD_UNDER18_RELIEF = 2000
  const CHILD_EDU_RELIEF = 8000

  const sharedRelief =
    (hasSpouseRelief ? SPOUSE_RELIEF : 0) +
    childrenUnder18 * CHILD_UNDER18_RELIEF +
    childrenEducation * CHILD_EDU_RELIEF

  // Primary chargeable income with all shared reliefs on their side
  const ciPrimary = Math.max(0, primary.grossIncome - primary.epf - primary.personalRelief - primary.existingReliefs - sharedRelief)
  const taxPrimary = computeTax(ciPrimary)

  // Spouse chargeable income (claiming their own personal RM9000)
  const ciSpouse = Math.max(0, spouseIncome - Math.min(spouseIncome * 0.11, 4000) - 9000)
  const taxSpouse = computeTax(ciSpouse)

  const totalSeparate = taxPrimary + taxSpouse

  // Joint assessment: primary claims spouse income too, but loses spouse's personal relief
  // and pays tax on combined income. Joint is only for married (no longer common post-2016
  // reform but some still benefit). Approximate here as combined CI with single personal relief.
  const combinedGross = primary.grossIncome + spouseIncome
  const combinedEPF   = Math.min((primary.grossIncome * 0.11) + (spouseIncome * 0.11), 8000)
  const ciJoint       = Math.max(0, combinedGross - combinedEPF - 9000 - primary.existingReliefs - sharedRelief)
  const totalJoint    = computeTax(ciJoint)

  const jointSaving = totalSeparate - totalJoint

  // Child relief allocation: which spouse gets more tax benefit per RM of child relief?
  const ciPrimaryNoChild = Math.max(0, ciPrimary + childrenUnder18 * CHILD_UNDER18_RELIEF + childrenEducation * CHILD_EDU_RELIEF)
  const ciSpouseWithChild = Math.max(0, ciSpouse - childrenUnder18 * CHILD_UNDER18_RELIEF - childrenEducation * CHILD_EDU_RELIEF)
  const primaryChildSaving = computeTax(ciPrimaryNoChild) - taxPrimary
  const spouseChildSaving  = taxSpouse - computeTax(ciSpouseWithChild)
  const claimWith: 'primary' | 'spouse' = spouseChildSaving > primaryChildSaving ? 'spouse' : 'primary'
  const childReliefSaved = Math.max(primaryChildSaving, spouseChildSaving)

  // Spouse relief check: is it worth primary claiming RM4,000 spouse relief?
  const ciPrimaryNoSpouse = Math.max(0, ciPrimary + SPOUSE_RELIEF)
  const spouseReliefSaved = hasSpouseRelief ? computeTax(ciPrimaryNoSpouse) - taxPrimary : 0

  return {
    primarySeparate:  taxPrimary,
    spouseSeparate:   taxSpouse,
    totalSeparate,
    totalJoint,
    jointSaving,
    recommendation:   jointSaving > 200 ? 'joint' : 'separate',
    rationale: jointSaving > 200
      ? `Joint assessment saves RM ${jointSaving.toLocaleString()} for your household`
      : jointSaving > 0
        ? `Joint is marginally better (RM ${jointSaving.toLocaleString()}), but separate is simpler`
        : 'Separate assessment is more beneficial (spouse has own income that gets taxed higher jointly)',
    childRelief: { claimWith, taxSaved: Math.max(0, childReliefSaved) },
    spouseRelief: { worthClaiming: spouseReliefSaved > 0, taxSaved: Math.max(0, spouseReliefSaved) },
  }
}
