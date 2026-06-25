/**
 * LHDN Tax Relief Categories — Years of Assessment 2019–2025
 * Sourced from official LHDN guidelines (hasil.gov.my)
 *
 * Each year's record maps to ReliefCategory.id via the `category` field.
 * The app's RELIEF_CATEGORIES in store/index.ts defines the current YA 2025 categories.
 * This file provides historical limits for reference and cross-validation.
 */

export interface TaxReliefItem {
  category: string   // maps to ReliefCategory.id
  item: string       // human-readable item name
  maxAmount: number  // maximum deductible amount (RM)
  notes?: string    // eligibility notes, source reference
}

export const TAX_RELIEFS: Record<number, TaxReliefItem[]> = {
  // ── Year of Assessment 2019 ──────────────────────────────────────────────
  2019: [
    { category: 'individual', item: 'Individual & Dependent Relatives', maxAmount: 9000, notes: 'Automatic for all taxpayers' },
    { category: 'medical_self', item: 'Medical (Self, Spouse, Children)', maxAmount: 10000, notes: 'Serious diseases, fertility, dental, vaccination' },
    { category: 'parents_medical', item: 'Parents Medical & Carer', maxAmount: 8000, notes: 'Medical expenses for parents (father/mother/grandparents)' },
    { category: 'disabled', item: 'Disabled Individual', maxAmount: 6000, notes: 'Disabled person self/spouse/child' },
    { category: 'disabled_equipment', item: 'Disabled Equipment', maxAmount: 6000, notes: 'Supporting equipment for disabled person' },
    { category: 'spouse', item: 'Spouse / Alimony', maxAmount: 4000, notes: 'Non-working spouse or alimony payments' },
    { category: 'children_under18', item: 'Children (Under 18)', maxAmount: 2000, notes: 'Per child, max RM 2,000 each' },
    { category: 'children_education', item: 'Children (Higher Education)', maxAmount: 8000, notes: 'Diploma and above in Malaysia' },
    { category: 'education_self', item: 'Education (Self)', maxAmount: 7000, notes: 'Degree, Masters, professional qualification (max 3 years)' },
    { category: 'lifestyle', item: 'Lifestyle (Reading, Sports, PC, Mobile)', maxAmount: 2000, notes: 'Books, newspapers, sporting equipment, PC, smartphone, internet' },
    { category: 'epf_insurance', item: 'EPF / Life Insurance', maxAmount: 7000, notes: 'EPF voluntary contributions, life insurance, takaful' },
    { category: 'housing_loan', item: 'Housing Loan Interest', maxAmount: 7000, notes: 'First residential property, interest portion only' },
    { category: 'pspp', item: 'Portable Retirement Benefits (PSP)', maxAmount: 2500, notes: 'Deferment of portable retirement benefits ( YA 2019 last year)' },
    { category: 'socso', item: 'SOCSO / PERKESO', maxAmount: 350, notes: 'Employee and employer SOCSO contributions' },
  ],

  // ── Year of Assessment 2020 ──────────────────────────────────────────────
  2020: [
    { category: 'individual', item: 'Individual & Dependent Relatives', maxAmount: 9000, notes: 'Automatic for all taxpayers' },
    { category: 'medical_self', item: 'Medical (Self, Spouse, Children)', maxAmount: 10000, notes: 'Serious diseases, fertility, dental, vaccination' },
    { category: 'parents_medical', item: 'Parents Medical & Carer', maxAmount: 8000, notes: 'Medical expenses for parents' },
    { category: 'disabled', item: 'Disabled Individual', maxAmount: 6000, notes: 'Disabled person self/spouse/child' },
    { category: 'disabled_equipment', item: 'Disabled Equipment', maxAmount: 6000, notes: 'Supporting equipment for disabled person' },
    { category: 'spouse', item: 'Spouse / Alimony', maxAmount: 4000, notes: 'Non-working spouse or alimony payments' },
    { category: 'children_under18', item: 'Children (Under 18)', maxAmount: 2000, notes: 'Per child, max RM 2,000 each' },
    { category: 'children_education', item: 'Children (Higher Education)', maxAmount: 8000, notes: 'Diploma and above in Malaysia' },
    { category: 'education_self', item: 'Education (Self)', maxAmount: 7000, notes: 'Degree, Masters, professional qualification' },
    { category: 'lifestyle', item: 'Lifestyle (Reading, Sports, PC, Mobile)', maxAmount: 2000, notes: 'Books, newspapers, sporting equipment, PC, smartphone, internet' },
    { category: 'epf_insurance', item: 'EPF / Life Insurance', maxAmount: 7000, notes: 'EPF voluntary contributions, life insurance, takaful' },
    { category: 'housing_loan', item: 'Housing Loan Interest', maxAmount: 7000, notes: 'First residential property' },
    { category: 'socso', item: 'SOCSO / PERKESO', maxAmount: 350, notes: 'Employee and employer SOCSO contributions' },
  ],

  // ── Year of Assessment 2021 ──────────────────────────────────────────────
  2021: [
    { category: 'individual', item: 'Individual & Dependent Relatives', maxAmount: 9000, notes: 'Automatic for all taxpayers' },
    { category: 'medical_self', item: 'Medical (Self, Spouse, Children)', maxAmount: 10000, notes: 'Serious diseases, fertility, dental, vaccination' },
    { category: 'parents_medical', item: 'Parents Medical & Carer', maxAmount: 8000, notes: 'Medical expenses for parents' },
    { category: 'disabled', item: 'Disabled Individual', maxAmount: 6000, notes: 'Disabled person self/spouse/child' },
    { category: 'disabled_equipment', item: 'Disabled Equipment', maxAmount: 6000, notes: 'Supporting equipment for disabled person' },
    { category: 'spouse', item: 'Spouse / Alimony', maxAmount: 4000, notes: 'Non-working spouse or alimony payments' },
    { category: 'children_under18', item: 'Children (Under 18)', maxAmount: 2000, notes: 'Per child, max RM 2,000 each' },
    { category: 'children_education', item: 'Children (Higher Education)', maxAmount: 8000, notes: 'Diploma and above in Malaysia' },
    { category: 'education_self', item: 'Education (Self)', maxAmount: 7000, notes: 'Degree, Masters, professional qualification' },
    { category: 'lifestyle', item: 'Lifestyle (Reading, Sports, PC, Mobile)', maxAmount: 2000, notes: 'Books, newspapers, sporting equipment, PC, smartphone, internet' },
    { category: 'epf_insurance', item: 'EPF / Life Insurance', maxAmount: 7000, notes: 'EPF voluntary contributions, life insurance, takaful' },
    { category: 'housing_loan', item: 'Housing Loan Interest', maxAmount: 7000, notes: 'First residential property' },
    { category: 'socso', item: 'SOCSO / PERKESO', maxAmount: 350, notes: 'Employee and employer SOCSO contributions' },
  ],

  // ── Year of Assessment 2022 ──────────────────────────────────────────────
  2022: [
    { category: 'individual', item: 'Individual & Dependent Relatives', maxAmount: 9000, notes: 'Automatic for all taxpayers' },
    { category: 'medical_self', item: 'Medical (Self, Spouse, Children)', maxAmount: 10000, notes: 'Serious diseases, fertility, dental, vaccination' },
    { category: 'parents_medical', item: 'Parents Medical & Carer', maxAmount: 8000, notes: 'Medical expenses for parents' },
    { category: 'disabled', item: 'Disabled Individual', maxAmount: 6000, notes: 'Disabled person self/spouse/child' },
    { category: 'disabled_equipment', item: 'Disabled Equipment', maxAmount: 6000, notes: 'Supporting equipment for disabled person' },
    { category: 'spouse', item: 'Spouse / Alimony', maxAmount: 4000, notes: 'Non-working spouse or alimony payments' },
    { category: 'children_under18', item: 'Children (Under 18)', maxAmount: 2000, notes: 'Per child, max RM 2,000 each' },
    { category: 'children_education', item: 'Children (Higher Education)', maxAmount: 8000, notes: 'Diploma and above in Malaysia' },
    { category: 'education_self', item: 'Education (Self)', maxAmount: 7000, notes: 'Degree, Masters, professional qualification' },
    { category: 'lifestyle', item: 'Lifestyle (Reading, Sports, PC, Mobile)', maxAmount: 2000, notes: 'Books, newspapers, sporting equipment, PC, smartphone, internet' },
    { category: 'epf_insurance', item: 'EPF / Life Insurance / Takaful', maxAmount: 7000, notes: 'EPF contributions, life insurance, takaful' },
    { category: 'housing_loan', item: 'Housing Loan Interest', maxAmount: 7000, notes: 'First residential property' },
    { category: 'socso', item: 'SOCSO / PERKESO', maxAmount: 350, notes: 'Employee and employer SOCSO contributions' },
    { category: 'private_pension', item: 'Private Pension / PRS', maxAmount: 3000, notes: 'Contributions to private pension funds (introduced YA 2012, continued)' },
  ],

  // ── Year of Assessment 2023 ──────────────────────────────────────────────
  2023: [
    { category: 'individual', item: 'Individual & Dependent Relatives', maxAmount: 9000, notes: 'Automatic for all taxpayers' },
    { category: 'medical_self', item: 'Medical (Self, Spouse, Children)', maxAmount: 10000, notes: 'Serious diseases, fertility, dental, vaccination' },
    { category: 'parents_medical', item: 'Parents Medical & Carer', maxAmount: 8000, notes: 'Medical expenses for parents' },
    { category: 'disabled', item: 'Disabled Individual', maxAmount: 6000, notes: 'Disabled person self/spouse/child' },
    { category: 'disabled_equipment', item: 'Disabled Equipment', maxAmount: 6000, notes: 'Supporting equipment for disabled person' },
    { category: 'spouse', item: 'Spouse / Alimony', maxAmount: 4000, notes: 'Non-working spouse or alimony payments' },
    { category: 'children_under18', item: 'Children (Under 18)', maxAmount: 2000, notes: 'Per child, max RM 2,000 each' },
    { category: 'children_education', item: 'Children (Higher Education)', maxAmount: 8000, notes: 'Diploma and above in Malaysia' },
    { category: 'education_self', item: 'Education (Self)', maxAmount: 7000, notes: 'Degree, Masters, professional qualification' },
    { category: 'lifestyle', item: 'Lifestyle', maxAmount: 2500, notes: 'Expanded: books, newspapers, sporting equipment, PC, smartphone, internet, gym, courses (from YA 2023)' },
    { category: 'epf_insurance', item: 'EPF / Life Insurance / Takaful', maxAmount: 7000, notes: 'EPF contributions, life insurance, takaful (EPF relief capped at RM 4,000 from YA 2023)' },
    { category: 'housing_loan', item: 'Housing Loan Interest', maxAmount: 7000, notes: 'First residential property' },
    { category: 'socso', item: 'SOCSO / PERKESO', maxAmount: 400, notes: 'Increased from RM 350 (budget 2023 announcement)' },
    { category: 'private_pension', item: 'Private Pension / PRS', maxAmount: 3000, notes: 'PRS contributions' },
  ],

  // ── Year of Assessment 2024 ──────────────────────────────────────────────
  2024: [
    { category: 'individual', item: 'Individual & Dependent Relatives', maxAmount: 9000, notes: 'Automatic for all taxpayers' },
    { category: 'medical_self', item: 'Medical (Self, Spouse, Children)', maxAmount: 10000, notes: 'Serious diseases, fertility, dental, vaccination, mental health consultation' },
    { category: 'parents_medical', item: 'Parents Medical & Carer', maxAmount: 8000, notes: 'Medical expenses for parents (father/mother/grandparents)' },
    { category: 'disabled', item: 'Disabled Individual', maxAmount: 7000, notes: 'Increased from RM 6,000 (YA 2024)' },
    { category: 'disabled_equipment', item: 'Disabled Equipment', maxAmount: 6000, notes: 'Supporting equipment for disabled person' },
    { category: 'spouse', item: 'Spouse / Alimony', maxAmount: 4000, notes: 'Non-working spouse or alimony payments' },
    { category: 'children_under18', item: 'Children (Under 18)', maxAmount: 2000, notes: 'Per child, max RM 2,000 each' },
    { category: 'children_education', item: 'Children (Higher Education)', maxAmount: 8000, notes: 'Diploma and above in Malaysia' },
    { category: 'education_self', item: 'Education (Self)', maxAmount: 7000, notes: 'Degree, Masters, professional qualification (max 3 consecutive years)' },
    { category: 'lifestyle', item: 'Lifestyle', maxAmount: 3500, notes: 'Further expanded from YA 2024: books, sports, PC, smartphone, internet, streaming, gym, recreational activities' },
    { category: 'epf_insurance', item: 'EPF / Life Insurance / Takaful', maxAmount: 7000, notes: 'EPF contributions, life insurance, takaful; EPF cap RM 4,000 + insurance/takaful cap RM 3,000' },
    { category: 'housing_loan', item: 'Housing Loan Interest', maxAmount: 7000, notes: 'First residential property' },
    { category: 'socso', item: 'SOCSO / PERKESO', maxAmount: 400, notes: 'Employee and employer SOCSO contributions' },
    { category: 'private_pension', item: 'Private Pension / PRS', maxAmount: 3000, notes: 'PRS contributions' },
    { category: 'retirement_savings', item: 'Net Savings in Private Retirement Scheme', maxAmount: 3000, notes: 'New from YA 2024 — net savings in PRS fund (encashment exempt from tax)' },
  ],

  // ── Year of Assessment 2025 ──────────────────────────────────────────────
  2025: [
    { category: 'individual', item: 'Individual & Dependent Relatives', maxAmount: 9000, notes: 'Automatic for all taxpayers' },
    { category: 'medical_self', item: 'Medical (Self, Spouse, Children)', maxAmount: 10000, notes: 'Serious diseases, fertility, dental, vaccination, mental health, complete health检查' },
    { category: 'parents_medical', item: 'Parents Medical & Carer', maxAmount: 8000, notes: 'Medical expenses for parents (father/mother/grandparents)' },
    { category: 'disabled', item: 'Disabled Individual', maxAmount: 7000, notes: 'Disabled person self/spouse/child' },
    { category: 'disabled_equipment', item: 'Disabled Equipment', maxAmount: 6000, notes: 'Supporting equipment for disabled person' },
    { category: 'spouse', item: 'Spouse / Alimony', maxAmount: 4000, notes: 'Non-working spouse or alimony payments' },
    { category: 'children_under18', item: 'Children (Under 18)', maxAmount: 2000, notes: 'Per child, max RM 2,000 each' },
    { category: 'children_education', item: 'Children (Higher Education)', maxAmount: 8000, notes: 'Diploma and above in Malaysia; exam fees also claimable' },
    { category: 'education_self', item: 'Education (Self)', maxAmount: 7000, notes: 'Degree, Masters, professional qualification (max 3 consecutive years)' },
    { category: 'lifestyle', item: 'Lifestyle', maxAmount: 3500, notes: 'Books, newspapers, sporting equipment, PC, smartphone, internet, streaming subscriptions, gym, courses, e-learning' },
    { category: 'epf_insurance', item: 'EPF / Life Insurance / Takaful', maxAmount: 7000, notes: 'EPF contributions (cap RM 4,000) + life insurance/takaful (cap RM 3,000)' },
    { category: 'housing_loan', item: 'Housing Loan Interest', maxAmount: 7000, notes: 'First residential property; also applies to cooperative housing loans' },
    { category: 'socso', item: 'SOCSO / PERKESO', maxAmount: 400, notes: 'Employee and employer SOCSO contributions' },
    { category: 'private_pension', item: 'Private Pension / PRS', maxAmount: 3000, notes: 'PRS contributions' },
    { category: 'retirement_savings', item: 'Net Savings in Private Retirement Scheme', maxAmount: 3000, notes: 'Net savings in PRS fund withdrawn for retirement (exempt from tax)' },
    { category: 'zakat', item: 'Zakat / Tithes', maxAmount: 0, notes: 'Unlimited (subject to total income); paid to Pusat Zakat or mosque authorities' },
    { category: 'cash_giving', item: 'Cash Gifts to Family / Religious Institution', maxAmount: 0, notes: 'Deductible if recipient is registered organization; amount based on actual payment' },
  ],
}

/**
 * Get the maximum relief amount for a given category and year.
 * Returns null if the category doesn't exist for that year.
 */
export function getTaxReliefMax(categoryId: string, year: number): number | null {
  const yearData = TAX_RELIEFS[year]
  if (!yearData) return null
  const item = yearData.find((r) => r.category === categoryId)
  return item ? item.maxAmount : null
}

/**
 * Get all relief items for a given year.
 */
export function getTaxReliefsForYear(year: number): TaxReliefItem[] {
  return TAX_RELIEFS[year] ?? []
}

/**
 * Available years of assessment in this dataset.
 */
export const AVAILABLE_YEARS = Object.keys(TAX_RELIEFS)
  .map(Number)
  .sort((a, b) => b - a) // newest first
