/**
 * lib/relief-categories.ts — Static id/name metadata for LHDN relief categories.
 *
 * This is a *subset* mirror of `RELIEF_CATEGORIES` in `store/index.ts` (ids,
 * display names, subcategory ids/names only — no caps, icons, or colors).
 * It exists separately because `store/index.ts` creates a Zustand store with
 * the `persist` middleware, which touches `localStorage` at module-eval time
 * and cannot be safely imported into a Node.js API route or test file. Caps
 * still come from the single source of truth in `lib/lhdn-rules.ts`.
 *
 * If a relief category or subcategory is added/renamed, update both this
 * file and `store/index.ts` — a mismatch here only affects OCR
 * auto-categorisation (LLM prompt + validation), not the app's actual
 * relief totals or caps.
 */

export interface ReliefSubCategoryDef {
  id: string
  name: string
}

export interface ReliefCategoryDef {
  id: string
  name: string
  subcategories?: ReliefSubCategoryDef[]
}

export const RELIEF_CATEGORY_DEFS: ReliefCategoryDef[] = [
  { id: 'individual', name: 'Individual & Dependent Relatives' },
  {
    id: 'medical_self', name: 'Medical (Self, Spouse, Children)', subcategories: [
      { id: 'medical_diseases', name: 'Serious Diseases' },
      { id: 'medical_fertility', name: 'Fertility Treatment' },
      { id: 'medical_vaccination', name: 'Vaccination' },
      { id: 'medical_dental', name: 'Dental Examination' },
    ],
  },
  {
    id: 'parents_medical', name: 'Parents Medical & Carer', subcategories: [
      { id: 'parents_medical_treatment', name: 'Medical Treatment' },
      { id: 'parents_medical_checkup', name: 'Complete Medical Checkup' },
    ],
  },
  { id: 'disabled', name: 'Disabled Individual' },
  { id: 'disabled_equipment', name: 'Disabled Equipment' },
  { id: 'spouse', name: 'Spouse / Alimony' },
  { id: 'children_under18', name: 'Children (Under 18)' },
  { id: 'children_education', name: 'Children (Higher Education)' },
  {
    id: 'education_self', name: 'Education (Self)', subcategories: [
      { id: 'edu_professional', name: 'Professional Courses' },
      { id: 'edu_degree', name: 'Degree (Masters/Doctorate)' },
      { id: 'edu_upskilling', name: 'Upskilling Courses' },
    ],
  },
  {
    id: 'lifestyle', name: 'Lifestyle', subcategories: [
      { id: 'lifestyle_basic', name: 'Books, PC, Smartphone, Internet' },
      { id: 'lifestyle_sports', name: 'Sports & Gym' },
    ],
  },
  {
    id: 'epf_insurance', name: 'EPF / Life Insurance / Takaful', subcategories: [
      { id: 'epf_socso', name: 'SOCSO Contribution' },
      { id: 'epf_mandatory', name: 'EPF / Mandatory Contributions' },
      { id: 'epf_life', name: 'Life Insurance / Takaful' },
      { id: 'epf_deferred', name: 'Deferred Annuity / PRS' },
      { id: 'epf_edu_medical_insurance', name: 'Education & Medical Insurance' },
    ],
  },
  {
    id: 'housing_loan', name: 'First Home Housing Loan Interest', subcategories: [
      { id: 'housing_500k', name: 'House Price ≤ RM500,000' },
      { id: 'housing_750k', name: 'House Price RM500,001–750,000' },
    ],
  },
]

export const VALID_CATEGORY_IDS = new Set(RELIEF_CATEGORY_DEFS.map((c) => c.id))

export const VALID_SUBCATEGORY_IDS_BY_CATEGORY: Record<string, Set<string>> = Object.fromEntries(
  RELIEF_CATEGORY_DEFS.map((c) => [c.id, new Set((c.subcategories ?? []).map((s) => s.id))])
)

export function isValidCategory(id: string): boolean {
  return VALID_CATEGORY_IDS.has(id)
}

export function isValidSubCategory(categoryId: string, subId: string): boolean {
  return VALID_SUBCATEGORY_IDS_BY_CATEGORY[categoryId]?.has(subId) ?? false
}
