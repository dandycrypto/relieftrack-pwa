import { describe, it, expect } from 'vitest'
import { parseFromRawText } from '../ocr'

describe('parseFromRawText', () => {
  it('extracts amount from a simple receipt with TOTAL', () => {
    const text = `GUARDIAN PHARMACY
Lot 123, Sunway Pyramid
Date: 15/03/2025

Item 1: RM 25.00
Item 2: RM 15.90

TOTAL: RM 40.90`

    const result = parseFromRawText(text)
    expect(result.amount).toBe(40.90)
    expect(result.merchant).toBeTruthy()
  })

  it('extracts amount from GRAND TOTAL', () => {
    const text = `KFC MALAYSIA
Invoice No: INV-123

Subtotal: RM 22.00
SST 6%: RM 1.32
GRAND TOTAL: RM 23.32`

    const result = parseFromRawText(text)
    expect(result.amount).toBe(23.32)
  })

  it('extracts date in DD/MM/YYYY format', () => {
    const text = `Some Store
Date: 15/03/2025
TOTAL: RM 50.00`

    const result = parseFromRawText(text)
    expect(result.date).toBe('2025-03-15')
  })

  it('extracts date in YYYY-MM-DD format', () => {
    const text = `Some Store
Date: 2025-03-15
TOTAL: RM 50.00`

    const result = parseFromRawText(text)
    expect(result.date).toBe('2025-03-15')
  })

  it('detects MYR currency by default', () => {
    const text = `Store
TOTAL: RM 50.00`

    const result = parseFromRawText(text)
    expect(result.currency).toBe('MYR')
  })

  it('detects SGD currency', () => {
    const text = `Singapore Store
TOTAL: SGD 50.00`

    const result = parseFromRawText(text)
    expect(result.currency).toBe('SGD')
  })

  it('detects tax exempt receipt', () => {
    const text = `Medical Centre
Consultation Fee
Tax Exempt
TOTAL: RM 150.00`

    const result = parseFromRawText(text)
    expect(result.taxExempt).toBe(true)
  })

  it('detects non-tax-exempt receipt with SST', () => {
    const text = `Electronics Store
SST 10%: RM 5.00
TOTAL: RM 55.00`

    const result = parseFromRawText(text)
    expect(result.taxExempt).toBe(false)
  })

  it('categorizes medical receipts', () => {
    const text = `PANTAI HOSPITAL
Patient: John
Consultation Fee
TOTAL: RM 250.00`

    const result = parseFromRawText(text)
    expect(result.suggestedCategory).toBe('medical_self')
  })

  it('categorizes education receipts', () => {
    const text = `UNIVERSITY OF MALAYA
Tuition Fee Semester 2
TOTAL: RM 5000.00`

    const result = parseFromRawText(text)
    expect(result.suggestedCategory).toBe('education_self')
  })

  it('categorizes lifestyle receipts (books)', () => {
    const text = `MPH BOOKSTORE
Professional Development Books
TOTAL: RM 89.00`

    const result = parseFromRawText(text)
    expect(result.suggestedCategory).toBe('lifestyle')
  })

  it('handles receipt with no amount', () => {
    const text = `Some random text without amounts`
    const result = parseFromRawText(text)
    expect(result.amount).toBeNull()
  })

  it('extracts invoice number', () => {
    const text = `STORE
Invoice No: INV-2025-001
TOTAL: RM 100.00`

    const result = parseFromRawText(text)
    expect(result.invoiceNumber).toBeTruthy()
  })

  it('detects LHDN tax deduction for dental receipts', () => {
    const text = `KLINIK GIGI SENYUM
Dental extraction
Patient: Self
TOTAL: RM 350.00`

    const result = parseFromRawText(text)
    expect(result.lhdNCategory).toContain('Medical')
  })

  it('detects LHDN tax deduction for sports equipment', () => {
    const text = `DECATHLON
Badminton racket Yonex
TOTAL: RM 250.00`

    const result = parseFromRawText(text)
    expect(result.lhdNCategory).toBeTruthy()
  })

  it('extracts amount from Shopee e-invoice with Total Including Tax', () => {
    const text = `Shopee Malaysia
Order #12345
Total Including Tax 89.90`

    const result = parseFromRawText(text)
    expect(result.amount).toBe(89.90)
  })

  it('handles TOTALBILL pattern for hospital receipts', () => {
    const text = `KPJ HEALTHCARE
Ward charges
TOTALBILL: RM 1500.00`

    const result = parseFromRawText(text)
    expect(result.amount).toBe(1500.00)
  })

  it('extracts date from text format (DD MMM YYYY)', () => {
    const text = `RECEIPT
20 April 2026 8:34 am
TOTAL: RM 50.00`

    const result = parseFromRawText(text)
    expect(result.date).toBe('2026-04-20')
    expect(result.time).toBe('08:34')
  })

  it('returns description field', () => {
    const text = `Test receipt content`
    const result = parseFromRawText(text)
    expect(result.description).toBeTruthy()
  })

  it('handles concatenated date format (DDMMYYYYHHMMSS)', () => {
    const text = `Invoice
InvoiceDate:1904202607:12PM
TOTAL: RM 50.00`

    const result = parseFromRawText(text)
    expect(result.date).toBe('2026-04-19')
    expect(result.time).toBe('19:12')
  })

  it('extracts amount from Amount Due pattern', () => {
    const text = `RECEIPT
Amount Due: RM 75.50`

    const result = parseFromRawText(text)
    expect(result.amount).toBe(75.50)
  })

  it('detects insurance-related tax category', () => {
    const text = `AIA INSURANCE
Life Insurance Premium
Policy No: LP-12345
TOTAL: RM 3000.00`

    const result = parseFromRawText(text)
    expect(result.suggestedCategory).toBe('insurance')
  })

  it('detects transport category', () => {
    const text = `SHELL PETROL STATION
Fuel RON95
TOTAL: RM 80.00`

    const result = parseFromRawText(text)
    expect(result.suggestedCategory).toBe('transport')
  })

  it('extracts amount with commas', () => {
    const text = `BIG STORE
GRAND TOTAL: RM 1,250.00`

    const result = parseFromRawText(text)
    expect(result.amount).toBe(1250.00)
  })
})
