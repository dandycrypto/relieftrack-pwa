import { describe, it, expect } from 'vitest'
import { parseEWalletCSV } from '../ewallet-parser'
import type { ParsedTransaction } from '../ewallet-parser'

describe('parseEWalletCSV', () => {
  describe('TnG provider', () => {
    it('parses a valid TnG CSV with successful transactions', () => {
      const csv = `Date,Description,Amount (RM),Status
2025-03-15,Guardian Pharmacy,-45.90,Successful
2025-03-16,MPH Bookstore,-89.00,Successful`

      const result = parseEWalletCSV(csv, 'tng')
      expect(result).toHaveLength(2)
      expect(result[0].merchant).toBe('Guardian Pharmacy')
      expect(result[0].amount).toBe(45.90)
      expect(result[0].category).toBe('medical_self')
      expect(result[0].date).toBe('2025-03-15')
      expect(result[1].merchant).toBe('MPH Bookstore')
      expect(result[1].category).toBe('lifestyle')
    })

    it('skips top-up and refund transactions', () => {
      const csv = `Date,Description,Amount (RM),Status
2025-03-15,Top-Up via Maybank,100.00,Successful
2025-03-16,Refund from Grab,25.00,Successful
2025-03-17,Cashback Reward,5.00,Successful
2025-03-18,Decathlon KL,-150.00,Successful`

      const result = parseEWalletCSV(csv, 'tng')
      expect(result).toHaveLength(1)
      expect(result[0].merchant).toBe('Decathlon KL')
    })

    it('skips failed transactions', () => {
      const csv = `Date,Description,Amount (RM),Status
2025-03-15,Guardian Pharmacy,-45.90,Failed
2025-03-16,MPH Bookstore,-89.00,Successful`

      const result = parseEWalletCSV(csv, 'tng')
      expect(result).toHaveLength(1)
      expect(result[0].merchant).toBe('MPH Bookstore')
    })

    it('skips zero-amount rows', () => {
      const csv = `Date,Description,Amount (RM),Status
2025-03-15,Guardian Pharmacy,0.00,Successful`

      const result = parseEWalletCSV(csv, 'tng')
      expect(result).toHaveLength(0)
    })

    it('returns empty array for CSV with only headers', () => {
      const csv = `Date,Description,Amount (RM),Status`
      const result = parseEWalletCSV(csv, 'tng')
      expect(result).toHaveLength(0)
    })

    it('returns empty for a single-line CSV', () => {
      const result = parseEWalletCSV('just one line', 'tng')
      expect(result).toHaveLength(0)
    })
  })

  describe('Grab provider', () => {
    it('parses a valid Grab CSV', () => {
      const csv = `Date,Description,Amount,Status
2025-03-15,Grab Food Order,-35.50,Completed
2025-03-16,Pharmacy Purchase,-22.00,Completed`

      const result = parseEWalletCSV(csv, 'grab')
      expect(result).toHaveLength(2)
      expect(result[0].merchant).toBe('Grab Food Order')
      expect(result[0].amount).toBe(35.50)
    })

    it('skips top-ups and refunds for Grab', () => {
      const csv = `Date,Description,Amount,Status
2025-03-15,Top-Up,100.00,Completed
2025-03-16,Cashback,5.00,Completed
2025-03-17,Starbucks,-15.00,Completed`

      const result = parseEWalletCSV(csv, 'grab')
      expect(result).toHaveLength(1)
      expect(result[0].merchant).toBe('Starbucks')
    })
  })

  describe('Boost provider', () => {
    it('parses a valid Boost CSV', () => {
      const csv = `Transaction Date,Merchant Name,Amount,Status
2025-03-15,KFC Malaysia,-25.90,Success
2025-03-16,Petronas,-80.00,Success`

      const result = parseEWalletCSV(csv, 'boost')
      expect(result).toHaveLength(2)
      expect(result[0].merchant).toBe('KFC Malaysia')
      expect(result[0].amount).toBe(25.90)
    })

    it('skips reload and refund for Boost', () => {
      const csv = `Transaction Date,Merchant Name,Amount,Status
2025-03-15,Reload via Bank,100.00,Success
2025-03-16,Refund Order,25.00,Success
2025-03-17,Popular Bookstore,-35.00,Success`

      const result = parseEWalletCSV(csv, 'boost')
      expect(result).toHaveLength(1)
      expect(result[0].merchant).toBe('Popular Bookstore')
    })
  })

  describe('auto-category detection', () => {
    it('categorizes pharmacy as medical_self', () => {
      const csv = `Date,Description,Amount (RM),Status
2025-03-15,Watsons Pharmacy,-30.00,Successful`
      const result = parseEWalletCSV(csv, 'tng')
      expect(result[0].category).toBe('medical_self')
    })

    it('categorizes gym as lifestyle', () => {
      const csv = `Date,Description,Amount (RM),Status
2025-03-15,Celebrity Fitness Gym,-120.00,Successful`
      const result = parseEWalletCSV(csv, 'tng')
      expect(result[0].category).toBe('lifestyle')
    })

    it('categorizes university as education_self', () => {
      const csv = `Date,Description,Amount (RM),Status
2025-03-15,University of Malaya Tuition,-5000.00,Successful`
      const result = parseEWalletCSV(csv, 'tng')
      expect(result[0].category).toBe('education_self')
    })

    it('categorizes EPF as epf_insurance', () => {
      const csv = `Date,Description,Amount (RM),Status
2025-03-15,EPF Contribution,-500.00,Successful`
      const result = parseEWalletCSV(csv, 'tng')
      expect(result[0].category).toBe('epf_insurance')
    })

    it('defaults to lifestyle for unknown merchants', () => {
      const csv = `Date,Description,Amount (RM),Status
2025-03-15,Random Store XYZ,-50.00,Successful`
      const result = parseEWalletCSV(csv, 'tng')
      expect(result[0].category).toBe('lifestyle')
    })
  })

  describe('date parsing', () => {
    it('handles DD/MM/YYYY format', () => {
      const csv = `Date,Description,Amount (RM),Status
15/03/2025,Test Store,-10.00,Successful`
      const result = parseEWalletCSV(csv, 'tng')
      expect(result[0].date).toBe('2025-03-15')
    })

    it('handles ISO YYYY-MM-DD format', () => {
      const csv = `Date,Description,Amount (RM),Status
2025-03-15,Test Store,-10.00,Successful`
      const result = parseEWalletCSV(csv, 'tng')
      expect(result[0].date).toBe('2025-03-15')
    })

    it('handles DD-MM-YYYY format', () => {
      const csv = `Date,Description,Amount (RM),Status
15-03-2025,Test Store,-10.00,Successful`
      const result = parseEWalletCSV(csv, 'tng')
      expect(result[0].date).toBe('2025-03-15')
    })
  })

  describe('unknown provider', () => {
    it('returns empty for unknown provider', () => {
      const csv = `Date,Description,Amount,Status
2025-03-15,Test,-10.00,Success`
      const result = parseEWalletCSV(csv, 'unknown' as any)
      expect(result).toHaveLength(0)
    })
  })

  describe('CSV parsing edge cases', () => {
    it('handles quoted fields with commas', () => {
      const csv = `Date,Description,Amount (RM),Status
2025-03-15,"Guardian, Sunway Pyramid",-45.90,Successful`

      const result = parseEWalletCSV(csv, 'tng')
      expect(result).toHaveLength(1)
      expect(result[0].merchant).toBe('Guardian, Sunway Pyramid')
    })
  })
})
