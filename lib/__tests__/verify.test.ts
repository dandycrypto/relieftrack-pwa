import { describe, it, expect } from 'vitest'
import { verifyEAForm } from '../verify'

describe('verifyEAForm', () => {
  const validData = {
    employerName: 'Acme Sdn Bhd',
    taxYear: 2025,
    grossIncome: 72000,
    epfContribution: 7920,
    socsoContribution: 350,
    pcbPaid: 3500,
  }

  it('verifies a fully valid EA form', () => {
    const result = verifyEAForm(validData)
    expect(result.status).toBe('verified')
    expect(result.confidence).toBe(1.0)
    expect(result.ambiguousFields).toHaveLength(0)
    expect(result.reason).toBe('All fields verified')
  })

  it('flags empty employer name', () => {
    const result = verifyEAForm({ ...validData, employerName: '' })
    expect(result.status).toBe('pending')
    expect(result.ambiguousFields).toContain('employerName')
  })

  it('flags whitespace-only employer name', () => {
    const result = verifyEAForm({ ...validData, employerName: '   ' })
    expect(result.status).toBe('pending')
    expect(result.ambiguousFields).toContain('employerName')
  })

  it('flags invalid tax year (too old)', () => {
    const result = verifyEAForm({ ...validData, taxYear: 2015 })
    expect(result.status).toBe('pending')
    expect(result.ambiguousFields).toContain('taxYear')
  })

  it('flags zero tax year', () => {
    const result = verifyEAForm({ ...validData, taxYear: 0 })
    expect(result.status).toBe('pending')
    expect(result.ambiguousFields).toContain('taxYear')
  })

  it('flags zero gross income', () => {
    const result = verifyEAForm({ ...validData, grossIncome: 0 })
    expect(result.status).toBe('pending')
    expect(result.ambiguousFields).toContain('grossIncome')
  })

  it('flags negative gross income', () => {
    const result = verifyEAForm({ ...validData, grossIncome: -5000 })
    expect(result.status).toBe('pending')
    expect(result.ambiguousFields).toContain('grossIncome')
  })

  it('flags very low gross income as outside normal range', () => {
    const result = verifyEAForm({ ...validData, grossIncome: 5000 })
    expect(result.status).toBe('pending')
    expect(result.ambiguousFields).toContain('grossIncome')
  })

  it('flags very high gross income', () => {
    const result = verifyEAForm({ ...validData, grossIncome: 2000000 })
    expect(result.status).toBe('pending')
    expect(result.ambiguousFields).toContain('grossIncome')
  })

  it('flags negative EPF contribution', () => {
    const result = verifyEAForm({ ...validData, epfContribution: -100 })
    expect(result.status).toBe('pending')
    expect(result.ambiguousFields).toContain('epfContribution')
  })

  it('flags EPF exceeding 11% of gross', () => {
    const result = verifyEAForm({ ...validData, epfContribution: 10000 })
    expect(result.status).toBe('pending')
    expect(result.ambiguousFields).toContain('epfContribution')
  })

  it('flags negative PCB', () => {
    const result = verifyEAForm({ ...validData, pcbPaid: -100 })
    expect(result.status).toBe('pending')
    expect(result.ambiguousFields).toContain('pcbPaid')
  })

  it('gives low confidence when many fields are invalid', () => {
    const result = verifyEAForm({
      employerName: '',
      taxYear: 0,
      grossIncome: -1,
      epfContribution: -1,
      socsoContribution: 0,
      pcbPaid: -1,
    })
    expect(result.status).toBe('pending')
    expect(result.confidence).toBe(0.3)
    expect(result.ambiguousFields.length).toBeGreaterThan(2)
  })

  it('gives medium confidence when 1-2 fields are ambiguous', () => {
    const result = verifyEAForm({ ...validData, employerName: '' })
    expect(result.confidence).toBe(0.7)
  })

  it('verifies income within normal range boundaries', () => {
    const low = verifyEAForm({ ...validData, grossIncome: 10000 })
    expect(low.ambiguousFields).not.toContain('grossIncome')

    const high = verifyEAForm({ ...validData, grossIncome: 1000000 })
    expect(high.ambiguousFields).not.toContain('grossIncome')
  })
})
