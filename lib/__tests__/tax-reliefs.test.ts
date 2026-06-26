import { describe, it, expect } from 'vitest'
import {
  TAX_RELIEFS,
  getTaxReliefMax,
  getTaxReliefsForYear,
  AVAILABLE_YEARS,
} from '../tax-reliefs'

describe('TAX_RELIEFS data', () => {
  it('contains years 2019 through 2026', () => {
    const years = Object.keys(TAX_RELIEFS).map(Number).sort()
    expect(years).toEqual([2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026])
  })

  it('every year has at least 10 relief items', () => {
    for (const [year, items] of Object.entries(TAX_RELIEFS)) {
      expect(items.length).toBeGreaterThanOrEqual(10)
    }
  })

  it('every item has required fields', () => {
    for (const [, items] of Object.entries(TAX_RELIEFS)) {
      for (const item of items) {
        expect(item.category).toBeTruthy()
        expect(item.item).toBeTruthy()
        expect(typeof item.maxAmount).toBe('number')
        expect(item.maxAmount).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('individual relief is 9000 for all years', () => {
    for (const [, items] of Object.entries(TAX_RELIEFS)) {
      const individual = items.find((i) => i.category === 'individual')
      expect(individual).toBeDefined()
      expect(individual!.maxAmount).toBe(9000)
    }
  })
})

describe('getTaxReliefMax', () => {
  it('returns the correct max for a known category and year', () => {
    expect(getTaxReliefMax('individual', 2025)).toBe(9000)
    expect(getTaxReliefMax('medical_self', 2025)).toBe(10000)
    expect(getTaxReliefMax('lifestyle', 2024)).toBe(3500)
    expect(getTaxReliefMax('lifestyle', 2023)).toBe(2500)
    expect(getTaxReliefMax('lifestyle', 2019)).toBe(2000)
  })

  it('returns null for an unknown category', () => {
    expect(getTaxReliefMax('nonexistent', 2025)).toBeNull()
  })

  it('returns null for an unknown year', () => {
    expect(getTaxReliefMax('individual', 2010)).toBeNull()
  })

  it('returns 0 for categories with unlimited relief (zakat)', () => {
    expect(getTaxReliefMax('zakat', 2025)).toBe(0)
  })

  it('tracks SOCSO increase from 350 to 400 in 2023', () => {
    expect(getTaxReliefMax('socso', 2022)).toBe(350)
    expect(getTaxReliefMax('socso', 2023)).toBe(400)
  })

  it('tracks disabled individual increase from 6000 to 7000 in 2024', () => {
    expect(getTaxReliefMax('disabled', 2023)).toBe(6000)
    expect(getTaxReliefMax('disabled', 2024)).toBe(7000)
  })
})

describe('getTaxReliefsForYear', () => {
  it('returns all items for a valid year', () => {
    const items = getTaxReliefsForYear(2025)
    expect(items.length).toBeGreaterThan(0)
    expect(items.some((i) => i.category === 'individual')).toBe(true)
  })

  it('returns an empty array for an unknown year', () => {
    expect(getTaxReliefsForYear(2010)).toEqual([])
  })

  it('returns the correct number of categories per year', () => {
    expect(getTaxReliefsForYear(2019).length).toBe(14)
    expect(getTaxReliefsForYear(2022).length).toBe(14)
    expect(getTaxReliefsForYear(2025).length).toBe(17)
  })
})

describe('AVAILABLE_YEARS', () => {
  it('contains all years sorted newest first', () => {
    expect(AVAILABLE_YEARS).toEqual([2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019])
  })

  it('has 8 years', () => {
    expect(AVAILABLE_YEARS.length).toBe(8)
  })
})
