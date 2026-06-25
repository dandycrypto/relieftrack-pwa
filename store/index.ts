/**
 * ReliefTrack MY — Global Zustand Store
 * Persists records, profile, and settings to localStorage.
 * All computed values (relief totals, applicable reliefs) are derived
 * from the store state — no separate state needed in components.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ─── Types ─────────────────────────────────────────────────────────────────

export type TaxYear = '2025' | '2026'
export type Language = 'en' | 'ms'
export type ThemePreference = 'light' | 'dark' | 'system'
export type MaritalStatus = 'single' | 'married' | 'divorced'

export interface ReliefSubCategory {
  id: string
  name: string
  maxLimit: number // 0 = no sub-limit (within parent cap)
  description?: string
}

export interface ReliefCategory {
  id: string
  name: string
  maxLimit: number
  icon: string // lucide icon name
  description: string
  alwaysShow?: boolean
  profileKey?: string
  perItem?: boolean
  color?: string // Tailwind color prefix e.g. "emerald", "blue", "rose"
  subcategories?: ReliefSubCategory[]
}

export const floorRM = (amount: number): number => Math.floor(amount)

export interface Record {
  id: string
  category: string
  date: string
  amount: number
  merchant: string
  description: string
  status: 'verified' | 'pending'
  receiptUrl?: string // base64 data URL or blob URL or Google Drive link
  receiptFileName?: string
  invoiceNumber?: string
  taxAmount?: number
  // New fields from receipt-tracker
  time?: string // HH:MM from receipt
  currency?: string // MYR/SGD/USD
  taxExempt?: boolean // Is this purchase tax-exempt?
  lhdNCategory?: string // LHDN tax deduction type e.g. "Medical-Parents", "Lifestyle-SportsEquipment", "Lifestyle-BooksPCPhone"
  recipient?: string // "self" | "spouse" | "child" | "parent"
  lineItems?: string // Short description of line items (semicolon-separated, max 3)
  notes?: string // Additional notes (invoice ID, SST/GST info)
  syncedToDrive?: boolean // true once Drive sync succeeds for this record
  rawText?: string // original OCR text for re-verification on edit
}

export interface Profile {
  name: string
  maritalStatus: MaritalStatus
  grossIncome: number          // annual gross income in RM (for tax bracket calculation)
  isSpouseWorking: boolean
  childrenUnder18: number
  childrenEducation: number
  isDisabled: boolean
  isSpouseDisabled: boolean
  isChildDisabled: boolean
  hasParents: boolean
  parentsCount: number
  isFirstHomeOwner: boolean
}

export interface Settings {
  googleDriveConnected: boolean
  googleDriveEmail: string
  lastSyncTime: string
  lastSyncedAt?: string // ISO timestamp of last Drive sync
  autoUploadReceipts: boolean
  storageUsed: number
  taxDeadlineReminders: boolean
  lowReliefAlerts: boolean
  weeklySummary: boolean
  lhdnUpdates: boolean
  biometricLock: boolean
  language: Language
  themePreference: ThemePreference
  defaultTaxYear: TaxYear
  // EA Form data per Year of Assessment (set when user confirms EA Form)
  eaFormByYear?: Record<number, {
    confirmed: boolean
    grossIncome: number
    employerName: string
    employeeName: string
    epf: number
    socso: number
    pcb: number
    taxYear: number
    kwspMemberId?: string
    lhdnTin?: string
    eaFormNumber?: string
    uploadDate?: string
  }>
}

// ─── Relief Categories (LHDN YA 2025) ─────────────────────────────────────

export const RELIEF_CATEGORIES: ReliefCategory[] = [
  { id: 'individual', name: 'Individual & Dependent Relatives', maxLimit: 9000, icon: 'User', description: 'Automatic relief for all taxpayers', alwaysShow: true, color: 'emerald' },
  { id: 'medical_self', name: 'Medical (Self, Spouse, Children)', maxLimit: 10000, icon: 'Stethoscope', description: 'Serious diseases, fertility treatment, vaccination', alwaysShow: true, color: 'blue', subcategories: [
    { id: 'medical_diseases', name: 'Serious Diseases', maxLimit: 0, description: 'Self, spouse or child' },
    { id: 'medical_fertility', name: 'Fertility Treatment', maxLimit: 0, description: 'Self or spouse' },
    { id: 'medical_vaccination', name: 'Vaccination', maxLimit: 1000, description: 'Self, spouse or child' },
    { id: 'medical_dental', name: 'Dental Examination', maxLimit: 1000, description: 'Self, spouse or child' },
  ] },
  { id: 'parents_medical', name: 'Parents Medical & Carer', maxLimit: 8000, icon: 'Heart', description: 'Medical expenses for parents', profileKey: 'hasParents', color: 'rose', subcategories: [
    { id: 'parents_medical_treatment', name: 'Medical Treatment', maxLimit: 0, description: 'Medical, dental, special needs, carer (certified)' },
    { id: 'parents_medical_checkup', name: 'Complete Medical Checkup', maxLimit: 1000 },
  ] },
  { id: 'disabled', name: 'Disabled Individual', maxLimit: 7000, icon: 'Users', description: 'Additional relief for disabled persons', profileKey: 'isDisabled', color: 'violet' },
  { id: 'disabled_equipment', name: 'Disabled Equipment', maxLimit: 6000, icon: 'Users', description: 'Supporting equipment for disabled', profileKey: 'isDisabled', color: 'orange' },
  { id: 'spouse', name: 'Spouse / Alimony', maxLimit: 4000, icon: 'Heart', description: 'For non-working spouse or alimony payments', profileKey: 'hasSpouseRelief', color: 'pink' },
  { id: 'children_under18', name: 'Children (Under 18)', maxLimit: 2000, icon: 'Users', description: 'Per child relief', profileKey: 'hasChildrenUnder18', perItem: true, color: 'cyan' },
  { id: 'children_education', name: 'Children (Higher Education)', maxLimit: 8000, icon: 'GraduationCap', description: 'Children in tertiary education', profileKey: 'hasChildrenEducation', perItem: true, color: 'teal' },
  { id: 'education_self', name: 'Education (Self)', maxLimit: 7000, icon: 'GraduationCap', description: 'Degree, Masters, professional courses', alwaysShow: true, color: 'amber', subcategories: [
    { id: 'edu_professional', name: 'Professional Courses', maxLimit: 0, description: 'Law, accounting, technical, vocational' },
    { id: 'edu_degree', name: 'Degree (Masters/Doctorate)', maxLimit: 0 },
    { id: 'edu_upskilling', name: 'Upskilling Courses', maxLimit: 2000 },
  ] },
  { id: 'lifestyle', name: 'Lifestyle', maxLimit: 3500, icon: 'Smartphone', description: 'Books, PC, smartphone, sports equipment, internet', alwaysShow: true, color: 'red', subcategories: [
    { id: 'lifestyle_basic', name: 'Books, PC, Smartphone, Internet', maxLimit: 2500, description: 'Books, PC/smartphone/tablet, internet, courses' },
    { id: 'lifestyle_sports', name: 'Sports & Gym', maxLimit: 1000, description: 'Sports equipment, facility, competition, gym' },
  ] },
  { id: 'epf_insurance', name: 'EPF / Life Insurance / Takaful', maxLimit: 14350, icon: 'PiggyBank', description: 'Retirement and insurance contributions', alwaysShow: true, color: 'indigo', subcategories: [
    { id: 'epf_socso', name: 'SOCSO Contribution', maxLimit: 350 },
    { id: 'epf_mandatory', name: 'EPF / Mandatory Contributions', maxLimit: 4000 },
    { id: 'epf_life', name: 'Life Insurance / Takaful', maxLimit: 3000 },
    { id: 'epf_deferred', name: 'Deferred Annuity / PRS', maxLimit: 3000 },
    { id: 'epf_edu_medical_insurance', name: 'Education & Medical Insurance', maxLimit: 4000 },
  ] },
  { id: 'housing_loan', name: 'First Home Housing Loan Interest', maxLimit: 7000, icon: 'Building', description: 'Interest on first home loan', profileKey: 'isFirstHomeOwner', color: 'sky', subcategories: [
    { id: 'housing_500k', name: 'House Price ≤ RM500,000', maxLimit: 7000 },
    { id: 'housing_750k', name: 'House Price RM500,001–750,000', maxLimit: 5000 },
  ] },
]

// ─── LHDN Income Tax Computation (YA 2024) ───────────────────────────────
// Malaysian resident individual tax brackets (official from hasil.gov.my).
// Used to calculate marginal tax savings from deductible reliefs.

export const TAX_BRACKETS = [
  { max: 5000,   rate: 0,    base: 0 },
  { max: 20000,  rate: 0.01, base: 0 },
  { max: 35000,  rate: 0.03, base: 150 },
  { max: 50000,  rate: 0.06, base: 600 },
  { max: 70000,  rate: 0.11, base: 1500 },
  { max: 100000, rate: 0.19, base: 3700 },
  { max: 400000, rate: 0.25, base: 9400 },
  { max: 600000, rate: 0.26, base: 84400 },
  { max: 2000000,rate: 0.28, base: 136400 },
  { max: Infinity,rate: 0.30, base: 528400 },
]

export function computeTax(chargeableIncome: number): number {
  if (chargeableIncome <= 0) return 0
  let tax = 0
  let remaining = chargeableIncome
  let prevMax = 0
  for (const bracket of TAX_BRACKETS) {
    const taxableInBracket = Math.min(remaining, bracket.max - prevMax)
    if (taxableInBracket <= 0) break
    tax += taxableInBracket * bracket.rate
    remaining -= taxableInBracket
    prevMax = bracket.max
    if (remaining <= 0) break
  }
  return Math.floor(tax)
}

export function calculateTax(chargeableIncome: number) {
  if (chargeableIncome <= 0) return { taxBeforeRebate: 0, taxAfterRebate: 0, effectiveRate: 0 }
  let tax = 0
  let remaining = chargeableIncome
  let prevMax = 0
  for (const bracket of TAX_BRACKETS) {
    const taxableInBracket = Math.min(remaining, bracket.max - prevMax)
    if (taxableInBracket <= 0) break
    tax += taxableInBracket * bracket.rate
    remaining -= taxableInBracket
    prevMax = bracket.max
    if (remaining <= 0) break
  }
  const rebate = chargeableIncome <= 35000 ? 400 : 0
  const taxAfterRebate = Math.max(0, tax - rebate)
  return {
    taxBeforeRebate: Math.floor(tax),
    taxAfterRebate: Math.floor(taxAfterRebate),
    effectiveRate: chargeableIncome > 0 ? (taxAfterRebate / chargeableIncome * 100) : 0,
  }
}

/**
 * Calculate net tax balance after PCB prepayment.
 * Returns { annualTax, pcbPaid, netBalance, status }
 * status: 'owe' | 'breakeven' | 'refund'
 */
export function calculateNetTaxBalance(chargeableIncome: number, pcbPaid: number) {
  const annualTax = computeTax(chargeableIncome)
  const netBalance = annualTax - pcbPaid
  let status: 'owe' | 'breakeven' | 'refund'
  if (netBalance > 0) status = 'owe'
  else if (netBalance === 0) status = 'breakeven'
  else status = 'refund'
  return { annualTax, pcbPaid, netBalance, status }
}

// ─── Initial Seed Data ─────────────────────────────────────────────────────

// DEMO_PROFILE — separate from real profile, never touches useReliefStore
export const DEMO_PROFILE: Profile = {
  name: 'Alex Tan',
  maritalStatus: 'married',
  grossIncome: 72000,
  isSpouseWorking: false,
  childrenUnder18: 2,
  childrenEducation: 1,
  isDisabled: false,
  isSpouseDisabled: false,
  isChildDisabled: false,
  hasParents: true,
  parentsCount: 2,
  isFirstHomeOwner: false,
}

// DEMO_RECORDS — only loaded when ?demo=true, never for real new users
export const DEMO_RECORDS: Record[] = [
  { id: 'seed-1', category: 'lifestyle', date: '2025-03-15', amount: 2499, merchant: 'Harvey Norman', description: 'MacBook Air M3', status: 'verified', syncedToDrive: true },
  { id: 'seed-2', category: 'medical_self', date: '2025-02-28', amount: 850, merchant: 'Pantai Hospital', description: 'Medical checkup', status: 'verified', syncedToDrive: true },
  { id: 'seed-3', category: 'epf_insurance', date: '2025-01-31', amount: 4200, merchant: 'EPF Contribution', description: 'Annual EPF statement', status: 'verified', syncedToDrive: true },
  { id: 'seed-4', category: 'education_self', date: '2025-03-01', amount: 3500, merchant: 'Open University', description: 'MBA Semester 2', status: 'pending', syncedToDrive: true },
  { id: 'seed-5', category: 'parents_medical', date: '2025-02-15', amount: 1200, merchant: 'Gleneagles Hospital', description: 'Father medical checkup', status: 'verified', syncedToDrive: true },
  { id: 'seed-6', category: 'parents_medical', date: '2025-04-10', amount: 800, merchant: 'Prince Court Medical', description: 'Mother medical checkup', status: 'verified', syncedToDrive: true },
  { id: 'seed-7', category: 'children_under18', date: '2025-03-10', amount: 2000, merchant: 'Annual Relief', description: 'Child relief - Adam', status: 'verified', syncedToDrive: true },
  { id: 'seed-8', category: 'children_under18', date: '2025-03-11', amount: 2000, merchant: 'Annual Relief', description: 'Child relief - Sue', status: 'verified', syncedToDrive: true },
  { id: 'seed-9', category: 'children_education', date: '2025-02-20', amount: 8000, merchant: 'University Malaya', description: 'Bethany tuition fee', status: 'verified', syncedToDrive: true },
  { id: 'seed-10', category: 'lifestyle', date: '2025-01-20', amount: 350, merchant: 'MPH Bookstore', description: 'Professional books', status: 'verified', syncedToDrive: true },
]

export const INITIAL_PROFILE: Profile = {
  name: 'Dandy',
  maritalStatus: 'married',
  grossIncome: 60000,         // RM 60,000 annual — default for demo
  isSpouseWorking: true,
  childrenUnder18: 2,
  childrenEducation: 1,
  isDisabled: false,
  isSpouseDisabled: false,
  isChildDisabled: false,
  hasParents: true,
  parentsCount: 2,
  isFirstHomeOwner: false,
}

export const INITIAL_SETTINGS: Settings = {
  googleDriveConnected: false,
  googleDriveEmail: '',
  lastSyncTime: '',
  autoUploadReceipts: true,
  storageUsed: 45,
  taxDeadlineReminders: true,
  lowReliefAlerts: true,
  weeklySummary: false,
  lhdnUpdates: true,
  biometricLock: false,
  language: 'en',
  themePreference: 'system',
  defaultTaxYear: '2025',
  eaFormByYear: {},
}

// ─── Demo Store (NOT persisted — demo records never touch localStorage) ─────

export interface DemoStore {
  demoRecords: Record[]
  demoProfile: Profile
  isDemoMode: boolean
  driveConnected: boolean
  loadDemoRecords: () => void
  clearDemoRecords: () => void
}

export const useDemoStore = create<DemoStore>((set) => ({
  demoRecords: [],
  demoProfile: DEMO_PROFILE,
  isDemoMode: false,
  driveConnected: false,
  loadDemoRecords: () => {
    // Spread to create FRESH COPY every time — never mutate original DEMO_RECORDS
    set({ demoRecords: [...DEMO_RECORDS], demoProfile: { ...DEMO_PROFILE }, isDemoMode: true, driveConnected: false })
  },
  clearDemoRecords: () => {
    set({ demoRecords: [], demoProfile: DEMO_PROFILE, isDemoMode: false, driveConnected: false })
  },
}))

// ─── Store Interface ─────────────────────────────────────────────────────────

interface ReliefStore {
  // State
  records: Record[]
  profile: Profile
  settings: Settings
  isHydrated: boolean

  // Record Actions
  addRecord: (record: Omit<Record, 'id'>) => void
  updateRecord: (id: string, updates: Partial<Record>) => void
  deleteRecord: (id: string) => void
  deleteAllRecords: () => void

  // Profile Actions
  updateProfile: (updates: Partial<Profile>) => void
  resetProfile: () => void

  // Settings Actions
  updateSettings: (updates: Partial<Settings>) => void

  // Computed helpers (called from components)
  getReliefTotals: () => Record<string, number>
  getApplicableReliefs: () => ReliefCategory[]
  getTotalClaimed: () => number
  getTotalPossible: () => number
  getEstimatedTaxSavings: () => number

  // Hydration flag
  setHydrated: (val: boolean) => void
}

// ─── Store Implementation ────────────────────────────────────────────────────

export const useReliefStore = create<ReliefStore>()(
  persist(
    (set, get) => ({
      records: [], // New users start with blank records; DEMO_RECORDS loaded only via ?demo=true
      profile: INITIAL_PROFILE,
      settings: INITIAL_SETTINGS,
      isHydrated: false,

      setHydrated: (val) => set({ isHydrated: val }),

      // ── Record Actions (real records only — demo records use separate store) ─

      addRecord: (record) => {
        const newId = `rec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
        set((state) => ({
          records: [{ ...record, id: newId, syncedToDrive: false }, ...state.records],
        }))
      },

      updateRecord: (id, updates) => {
        set((state) => ({
          records: state.records.map((r) => (r.id === id ? { ...r, ...updates } : r)),
        }))
      },

      deleteRecord: (id) => {
        set((state) => ({
          records: state.records.filter((r) => r.id !== id),
        }))
      },

      deleteAllRecords: () => set({ records: [] }),

      // ── Profile Actions ───────────────────────────────────────────────────

      updateProfile: (updates) => {
        set((state) => ({
          profile: { ...state.profile, ...updates },
        }))
      },

      resetProfile: () => set({ profile: INITIAL_PROFILE }),

      // ── Settings Actions ─────────────────────────────────────────────────

      updateSettings: (updates) => {
        set((state) => ({
          settings: { ...state.settings, ...updates },
        }))
      },

      // ── Computed Helpers ─────────────────────────────────────────────────

      getReliefTotals: () => {
        const { records, profile, settings } = get()
        const totals: Record<string, number> = {}

        RELIEF_CATEGORIES.forEach((cat) => { totals[cat.id] = 0 })
        totals['individual'] = 9000 // Always automatic

        // Children per-item: cap at per-person maximums
        const childrenUnder18Records = records.filter((r) => r.category === 'children_under18')
        if (profile.childrenUnder18 > 0) {
          const maxTotal = profile.childrenUnder18 * 2000
          const claimed = childrenUnder18Records.reduce((s, r) => s + floorRM(r.amount), 0)
          // If no records, use max. If records exist, use claimed (capped at max)
          totals['children_under18'] = childrenUnder18Records.length === 0 ? maxTotal : Math.min(claimed, maxTotal)
        }

        const childrenEducationRecords = records.filter((r) => r.category === 'children_education')
        if (profile.childrenEducation > 0) {
          const maxTotal = profile.childrenEducation * 8000
          const claimed = childrenEducationRecords.reduce((s, r) => s + floorRM(r.amount), 0)
          // If no records, use max. If records exist, use claimed (capped at max)
          totals['children_education'] = childrenEducationRecords.length === 0 ? maxTotal : Math.min(claimed, maxTotal)
        }

        // Sum up other records
        records.forEach((rec) => {
          if (rec.category !== 'children_under18' && rec.category !== 'children_education') {
            totals[rec.category] = (totals[rec.category] || 0) + floorRM(rec.amount)
          }
        })

        // Add EA Form EPF/SOCSO to epf_insurance category (auto-filled, not manual receipts)
        const taxYear = parseInt(settings.defaultTaxYear) || new Date().getFullYear()
        const currentEA = settings.eaFormByYear?.[taxYear]
        if (currentEA?.confirmed) {
          const eaFormEpfAmt = Math.min(currentEA.epf || 0, 4000) // capped at EPF sublimit
          const eaFormSocsoAmt = Math.min(currentEA.socso || 0, 350) // capped at SOCSO sublimit
          const currentEpfInsurance = totals['epf_insurance'] || 0
          totals['epf_insurance'] = Math.min(currentEpfInsurance + eaFormEpfAmt + eaFormSocsoAmt, 14350)
        }

        // Cap at limits
        RELIEF_CATEGORIES.forEach((cat) => {
          if (!cat.perItem) {
            totals[cat.id] = Math.min(totals[cat.id] || 0, cat.maxLimit)
          }
        })

        return totals
      },

      getApplicableReliefs: () => {
        const { profile } = get()
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
      },

      getTotalClaimed: () => {
        const store = get()
        const totals = store.getReliefTotals()
        const applicable = store.getApplicableReliefs()
        return Object.entries(totals)
          .filter(([key]) => applicable.some((r) => r.id === key))
          .reduce((sum, [, val]) => sum + val, 0)
      },

      // Excludes EPF/SOCSO so they are NOT double-deducted in chargeable income calc
      // (they are subtracted explicitly as epfRelief in getEstimatedTaxSavings)
      getTotalClaimedExcludingEpfSocso: () => {
        const store = get()
        const totals = store.getReliefTotals()
        const applicable = store.getApplicableReliefs()
        return Object.entries(totals)
          .filter(([key]) => {
            if (!applicable.some((r) => r.id === key)) return false
            // Skip epf_insurance because its EPF/SOCSO sub-amounts are already
            // subtracted explicitly as epfRelief in getEstimatedTaxSavings
            if (key === 'epf_insurance') return false
            return true
          })
          .reduce((sum, [, val]) => sum + val, 0)
      },

      getTotalPossible: () => {
        const store = get()
        const applicable = store.getApplicableReliefs()
        const { profile } = store
        return applicable.reduce((sum, cat) => {
          if (cat.perItem) {
            if (cat.id === 'children_under18') return sum + profile.childrenUnder18 * cat.maxLimit
            if (cat.id === 'children_education') return sum + profile.childrenEducation * cat.maxLimit
          }
          return sum + cat.maxLimit
        }, 0)
      },

      getEstimatedTaxSavings: () => {
        const { profile, settings } = get()
        // Use version EXCLUDING EPF/SOCSO so they are NOT double-deducted
        // (they are subtracted explicitly below as epfRelief)
        const totalClaimedExclEpfSocso = get().getTotalClaimedExcludingEpfSocso()
        const taxYear = parseInt(settings.defaultTaxYear) || new Date().getFullYear()
        const currentEA = settings.eaFormByYear?.[taxYear]
        const epfRelief = Math.min(currentEA?.epf || 0, 4000)
        const personalRelief = 9000
        // Use per-YA EA Form gross income if available, fallback to profile gross income
        const grossIncome = currentEA?.grossIncome ?? profile.grossIncome
        // Chargeable income before relief = gross - EPF - personal
        const chargeableBefore = Math.max(0, grossIncome - epfRelief - personalRelief)
        // Chargeable income after relief = gross - EPF - personal - reliefs (excl. EPF/SOCSO which are already sub'd)
        const chargeableAfter = Math.max(0, grossIncome - epfRelief - personalRelief - totalClaimedExclEpfSocso)
        const taxBefore = computeTax(chargeableBefore)
        const taxAfter = computeTax(chargeableAfter)
        return Math.max(0, taxBefore - taxAfter)
      },
    }),
    {
      name: 'relieftack-my-store',
      onRehydrateStorage: (state) => {
        // state here IS the full store in Zustand v5 (unlike the inner callback)
        // Return inner callback that will be called after rehydration
        return (persistedState, err) => {
          if (err) console.warn('ReliefTrack rehydrate error:', err)
          // Use the full state object to call setHydrated
          state?.setHydrated(true)
        }
      },
      onHydrate: () => {
        // No-op: onRehydrateStorage handles all hydration completion
      },
      partialize: (state) => ({
        records: state.records,
        profile: state.profile,
        settings: state.settings,
      }),
    }
  )
)
