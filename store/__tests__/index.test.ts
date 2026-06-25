import { describe, it, expect } from 'vitest'
import {
  computeTax,
  calculateTax,
  calculateNetTaxBalance,
  floorRM,
  RELIEF_CATEGORIES,
  TAX_BRACKETS,
  INITIAL_PROFILE,
  INITIAL_SETTINGS,
  DEMO_PROFILE,
  DEMO_RECORDS,
} from '../index'

describe('floorRM', () => {
  it('floors a positive decimal to integer', () => {
    expect(floorRM(100.99)).toBe(100)
    expect(floorRM(100.01)).toBe(100)
    expect(floorRM(100.0)).toBe(100)
  })

  it('handles zero', () => {
    expect(floorRM(0)).toBe(0)
  })

  it('handles negative values', () => {
    expect(floorRM(-10.5)).toBe(-11)
  })
})

describe('computeTax', () => {
  it('returns 0 for zero income', () => {
    expect(computeTax(0)).toBe(0)
  })

  it('returns 0 for negative income', () => {
    expect(computeTax(-1000)).toBe(0)
  })

  it('returns 0 for income in 0% bracket (0–5000)', () => {
    expect(computeTax(5000)).toBe(0)
  })

  it('calculates tax for 1% bracket (5001–20000)', () => {
    // First 5000 at 0%, next 10000 at 1% = 100
    expect(computeTax(15000)).toBe(100)
  })

  it('calculates tax for income at 20000', () => {
    // 5000 at 0% + 15000 at 1% = 150
    expect(computeTax(20000)).toBe(150)
  })

  it('calculates tax for income at 35000', () => {
    // 5000 at 0% + 15000 at 1% + 15000 at 3% = 0 + 150 + 450 = 600
    expect(computeTax(35000)).toBe(600)
  })

  it('calculates tax for income at 50000', () => {
    // 5000@0% + 15000@1% + 15000@3% + 15000@6% = 0+150+450+900 = 1500
    expect(computeTax(50000)).toBe(1500)
  })

  it('calculates tax for income at 70000', () => {
    // 5000@0% + 15000@1% + 15000@3% + 15000@6% + 20000@11% = 0+150+450+900+2200 = 3700
    expect(computeTax(70000)).toBe(3700)
  })

  it('calculates tax for income at 100000', () => {
    // Up to 70000 = 3700, next 30000@19% = 5700 → 9400
    expect(computeTax(100000)).toBe(9400)
  })

  it('floors the tax amount', () => {
    // Verify the result is always a whole number
    const tax = computeTax(75123)
    expect(tax).toBe(Math.floor(tax))
  })
})

describe('calculateTax', () => {
  it('returns all zeros for zero income', () => {
    const result = calculateTax(0)
    expect(result.taxBeforeRebate).toBe(0)
    expect(result.taxAfterRebate).toBe(0)
    expect(result.effectiveRate).toBe(0)
  })

  it('applies RM400 rebate for income <= 35000', () => {
    const result = calculateTax(35000)
    expect(result.taxBeforeRebate).toBe(600)
    expect(result.taxAfterRebate).toBe(200) // 600 - 400 rebate
  })

  it('does NOT apply rebate for income > 35000', () => {
    const result = calculateTax(50000)
    expect(result.taxBeforeRebate).toBe(1500)
    expect(result.taxAfterRebate).toBe(1500)
  })

  it('rebate does not make tax negative', () => {
    const result = calculateTax(10000)
    // Tax = 50, rebate = 400 → should be max(0, 50-400) = 0
    expect(result.taxAfterRebate).toBe(0)
  })

  it('calculates effective rate correctly', () => {
    const result = calculateTax(100000)
    expect(result.effectiveRate).toBeCloseTo(9.4, 1)
  })

  it('returns correct values for negative income', () => {
    const result = calculateTax(-5000)
    expect(result.taxBeforeRebate).toBe(0)
    expect(result.taxAfterRebate).toBe(0)
    expect(result.effectiveRate).toBe(0)
  })
})

describe('calculateNetTaxBalance', () => {
  it('returns owe when tax > PCB paid', () => {
    const result = calculateNetTaxBalance(100000, 5000)
    expect(result.annualTax).toBe(9400)
    expect(result.pcbPaid).toBe(5000)
    expect(result.netBalance).toBe(4400)
    expect(result.status).toBe('owe')
  })

  it('returns refund when PCB > tax', () => {
    const result = calculateNetTaxBalance(50000, 5000)
    expect(result.annualTax).toBe(1500)
    expect(result.netBalance).toBe(-3500)
    expect(result.status).toBe('refund')
  })

  it('returns breakeven when PCB equals tax', () => {
    const result = calculateNetTaxBalance(100000, 9400)
    expect(result.netBalance).toBe(0)
    expect(result.status).toBe('breakeven')
  })

  it('handles zero chargeable income', () => {
    const result = calculateNetTaxBalance(0, 1000)
    expect(result.annualTax).toBe(0)
    expect(result.netBalance).toBe(-1000)
    expect(result.status).toBe('refund')
  })
})

describe('TAX_BRACKETS', () => {
  it('has 10 brackets', () => {
    expect(TAX_BRACKETS).toHaveLength(10)
  })

  it('starts at 0% and ends at 30%', () => {
    expect(TAX_BRACKETS[0].rate).toBe(0)
    expect(TAX_BRACKETS[TAX_BRACKETS.length - 1].rate).toBe(0.30)
  })

  it('max values are ascending', () => {
    for (let i = 1; i < TAX_BRACKETS.length - 1; i++) {
      expect(TAX_BRACKETS[i].max).toBeGreaterThan(TAX_BRACKETS[i - 1].max)
    }
  })
})

describe('RELIEF_CATEGORIES', () => {
  it('contains essential categories', () => {
    const ids = RELIEF_CATEGORIES.map((c) => c.id)
    expect(ids).toContain('individual')
    expect(ids).toContain('medical_self')
    expect(ids).toContain('lifestyle')
    expect(ids).toContain('epf_insurance')
    expect(ids).toContain('education_self')
  })

  it('individual relief is always shown', () => {
    const individual = RELIEF_CATEGORIES.find((c) => c.id === 'individual')
    expect(individual?.alwaysShow).toBe(true)
    expect(individual?.maxLimit).toBe(9000)
  })

  it('all categories have required fields', () => {
    for (const cat of RELIEF_CATEGORIES) {
      expect(cat.id).toBeTruthy()
      expect(cat.name).toBeTruthy()
      expect(typeof cat.maxLimit).toBe('number')
      expect(cat.icon).toBeTruthy()
      expect(cat.description).toBeTruthy()
    }
  })

  it('per-item categories are children_under18 and children_education', () => {
    const perItemCats = RELIEF_CATEGORIES.filter((c) => c.perItem)
    expect(perItemCats.map((c) => c.id).sort()).toEqual(['children_education', 'children_under18'])
  })
})

describe('INITIAL_PROFILE', () => {
  it('has all required fields', () => {
    expect(INITIAL_PROFILE.name).toBeTruthy()
    expect(typeof INITIAL_PROFILE.grossIncome).toBe('number')
    expect(typeof INITIAL_PROFILE.childrenUnder18).toBe('number')
    expect(typeof INITIAL_PROFILE.childrenEducation).toBe('number')
  })
})

describe('INITIAL_SETTINGS', () => {
  it('starts with onboarding incomplete', () => {
    expect(INITIAL_SETTINGS.onboardingComplete).toBe(false)
  })

  it('defaults to English', () => {
    expect(INITIAL_SETTINGS.language).toBe('en')
  })

  it('defaults to system theme', () => {
    expect(INITIAL_SETTINGS.themePreference).toBe('system')
  })
})

describe('DEMO_PROFILE', () => {
  it('has a name', () => {
    expect(DEMO_PROFILE.name).toBe('Alex Tan')
  })

  it('is married', () => {
    expect(DEMO_PROFILE.maritalStatus).toBe('married')
  })
})

describe('DEMO_RECORDS', () => {
  it('has 10 seed records', () => {
    expect(DEMO_RECORDS).toHaveLength(10)
  })

  it('all records have required fields', () => {
    for (const rec of DEMO_RECORDS) {
      expect(rec.id).toBeTruthy()
      expect(rec.category).toBeTruthy()
      expect(rec.date).toBeTruthy()
      expect(typeof rec.amount).toBe('number')
      expect(rec.merchant).toBeTruthy()
    }
  })

  it('all seed records are synced to Drive', () => {
    expect(DEMO_RECORDS.every((r) => r.syncedToDrive)).toBe(true)
  })
})
