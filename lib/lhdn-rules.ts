/**
 * LHDN Rules Engine — versioned by Year of Assessment
 * Sub-limits, eligibility predicates, evidence flags, BE form codes
 * Limits reflect YA 2024/2025; re-verify each Budget cycle at hasil.gov.my
 */

import type { Profile } from '@/store'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SubLimit {
  id: string
  label: string
  cap: number // 0 = within parent cap only
}

export interface EvidenceRequirement {
  required: boolean
  description: string
  requiresCertification?: boolean
}

export interface LHDNRule {
  categoryId: string
  beCode: string
  label: string
  totalCap: number  // 0 = unlimited (zakat)
  subLimits: SubLimit[]
  eligible: (profile: Profile) => boolean
  evidence: EvidenceRequirement
  autoApply?: boolean  // true = automatic, no receipt needed (e.g. individual D1)
  perChild?: boolean   // totalCap is per qualifying child
  notes?: string
}

// ─── BE Form Section Codes ───────────────────────────────────────────────────

export const BE_CODES: Record<string, string> = {
  individual:          'D1',
  medical_self:        'D7',
  parents_medical:     'D6',
  disabled:            'D2',
  disabled_equipment:  'D4',
  spouse:              'D8',
  children_under18:    'D9',
  children_education:  'D10',
  education_self:      'D11',
  epf_insurance:       'D12',
  housing_loan:        'D16',
  private_pension:     'D13',
  socso:               'D15',
  zakat:               'E2',
  cash_giving:         'B5',
  lifestyle:           'D14',
}

// ─── YA 2025 Rules ──────────────────────────────────────────────────────────

const RULES_2025: LHDNRule[] = [
  {
    categoryId: 'individual',
    beCode: 'D1',
    label: 'Individual & Dependent Relatives',
    totalCap: 9000,
    subLimits: [],
    eligible: () => true,
    evidence: { required: false, description: 'Automatic — no evidence needed' },
    autoApply: true,
  },
  {
    categoryId: 'medical_self',
    beCode: 'D7',
    label: 'Medical (Self, Spouse, Children)',
    totalCap: 10000,
    subLimits: [
      { id: 'vaccination',       label: 'Vaccination',                      cap: 1000 },
      { id: 'dental',            label: 'Dental Examination/Treatment',     cap: 1000 },
      { id: 'complete_checkup',  label: 'Complete Medical Checkup',         cap: 1000 },
      { id: 'mental_health',     label: 'Mental Health Consultation',       cap: 1000 },
    ],
    eligible: () => true,
    evidence: {
      required: true,
      description: 'Receipt from registered hospital/clinic. Serious disease requires specialist certification.',
      requiresCertification: true,
    },
  },
  {
    categoryId: 'parents_medical',
    beCode: 'D6',
    label: 'Medical (Parents)',
    totalCap: 8000,
    subLimits: [
      { id: 'checkup', label: 'Complete Medical Checkup (Parents)', cap: 1000 },
    ],
    eligible: (p) => p.hasParents,
    evidence: {
      required: true,
      description: 'Receipt from registered hospital/clinic showing parent as patient',
    },
  },
  {
    categoryId: 'disabled',
    beCode: 'D2',
    label: 'Disabled Individual',
    totalCap: 7000,
    subLimits: [],
    eligible: (p) => p.isDisabled || p.isSpouseDisabled || p.isChildDisabled,
    evidence: { required: true, description: 'OKU card or medical certificate of disability' },
  },
  {
    categoryId: 'disabled_equipment',
    beCode: 'D4',
    label: 'Disabled Equipment',
    totalCap: 6000,
    subLimits: [],
    eligible: (p) => p.isDisabled || p.isSpouseDisabled || p.isChildDisabled,
    evidence: { required: true, description: 'Receipt for supporting equipment (wheelchair, hearing aid, prosthetic, etc.)' },
  },
  {
    categoryId: 'spouse',
    beCode: 'D8',
    label: 'Spouse / Alimony',
    totalCap: 4000,
    subLimits: [],
    eligible: (p) => p.maritalStatus === 'married' && !p.isSpouseWorking,
    evidence: { required: false, description: 'Marriage certificate; spouse must be non-working or alimony order' },
  },
  {
    categoryId: 'children_under18',
    beCode: 'D9',
    label: 'Children Under 18',
    totalCap: 2000,
    subLimits: [],
    eligible: (p) => p.childrenUnder18 > 0,
    evidence: { required: false, description: 'Birth certificate of each qualifying child' },
    perChild: true,
    notes: 'RM 2,000 per qualifying child under 18',
  },
  {
    categoryId: 'children_education',
    beCode: 'D10',
    label: 'Children (Higher Education)',
    totalCap: 8000,
    subLimits: [],
    eligible: (p) => p.childrenEducation > 0,
    evidence: {
      required: true,
      description: 'Enrolment letter + tuition fee receipt (diploma and above at recognised institution)',
    },
    perChild: true,
    notes: 'RM 8,000 per child in diploma/degree programme',
  },
  {
    categoryId: 'education_self',
    beCode: 'D11',
    label: 'Education (Self)',
    totalCap: 7000,
    subLimits: [
      { id: 'upskilling', label: 'Upskilling / Self-Improvement Courses', cap: 2000 },
    ],
    eligible: () => true,
    evidence: {
      required: true,
      description: 'Official receipt from MQA/DOSH-recognised institution; upskilling courses cap RM 2,000',
    },
  },
  {
    categoryId: 'lifestyle',
    beCode: 'D14',
    label: 'Lifestyle',
    totalCap: 3500,
    subLimits: [
      { id: 'basic',  label: 'Books, PC, Smartphone, Internet, Streaming', cap: 2500 },
      { id: 'sports', label: 'Sports Equipment, Gym, Recreational Facility', cap: 1000 },
    ],
    eligible: () => true,
    evidence: { required: true, description: 'Official receipt for qualifying item from registered store/provider' },
  },
  {
    categoryId: 'epf_insurance',
    beCode: 'D12',
    label: 'EPF / Life Insurance / Takaful',
    totalCap: 7000,
    subLimits: [
      { id: 'epf',                  label: 'EPF Mandatory / Voluntary',         cap: 4000 },
      { id: 'life_takaful',         label: 'Life Insurance / Takaful',          cap: 3000 },
      { id: 'edu_medical_insurance',label: 'Education & Medical Insurance',     cap: 4000 },
      { id: 'prs',                  label: 'PRS / Deferred Annuity (D13)',      cap: 3000 },
      { id: 'socso',                label: 'SOCSO / PERKESO (D15)',             cap: 400  },
    ],
    eligible: () => true,
    evidence: {
      required: true,
      description: 'EPF annual statement, insurance premium receipt, or SOCSO statement',
    },
  },
  {
    categoryId: 'housing_loan',
    beCode: 'D16',
    label: 'First Home Housing Loan Interest',
    totalCap: 7000,
    subLimits: [
      { id: 'le500k', label: 'House ≤ RM 500,000',             cap: 7000 },
      { id: 'le750k', label: 'House RM 500,001–750,000',       cap: 5000 },
    ],
    eligible: (p) => p.isFirstHomeOwner,
    evidence: {
      required: true,
      description: 'Loan statement showing interest portion + SPA for first residential property',
    },
    notes: 'Only the interest portion is claimable, not principal repayment',
  },
]

// ─── Year-keyed registry ─────────────────────────────────────────────────────

const RULES_BY_YA: Record<number, LHDNRule[]> = {
  2024: RULES_2025,
  2025: RULES_2025,
  2026: RULES_2025,
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function getRulesForYA(ya: number): LHDNRule[] {
  return RULES_BY_YA[ya] ?? RULES_2025
}

export function getRuleForCategory(categoryId: string, ya: number): LHDNRule | undefined {
  return getRulesForYA(ya).find((r) => r.categoryId === categoryId)
}

export function getEligibleRules(profile: Profile, ya: number): LHDNRule[] {
  return getRulesForYA(ya).filter((r) => r.eligible(profile))
}

export function getBECode(categoryId: string): string {
  return BE_CODES[categoryId] ?? '—'
}

export function getEffectiveCap(categoryId: string, ya: number, childCount = 1): number {
  const rule = getRuleForCategory(categoryId, ya)
  if (!rule) return 0
  if (rule.perChild) return rule.totalCap * Math.max(1, childCount)
  return rule.totalCap
}

export function getSubLimitCap(categoryId: string, subLimitId: string, ya: number): number {
  const rule = getRuleForCategory(categoryId, ya)
  if (!rule) return 0
  const sub = rule.subLimits.find((s) => s.id === subLimitId)
  return sub ? sub.cap : rule.totalCap
}

export function getEvidenceRequirement(categoryId: string, ya: number): EvidenceRequirement {
  const rule = getRuleForCategory(categoryId, ya)
  return rule?.evidence ?? { required: false, description: 'No evidence required' }
}
