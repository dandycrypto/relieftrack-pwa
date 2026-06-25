import { describe, it, expect } from 'vitest'
import { formatRM } from '../export'

describe('formatRM', () => {
  it('formats a whole number', () => {
    const result = formatRM(1000)
    expect(result).toContain('1,000.00')
    expect(result).toMatch(/^RM\s/)
  })

  it('formats a decimal amount', () => {
    const result = formatRM(1234.56)
    expect(result).toContain('1,234.56')
  })

  it('formats zero', () => {
    const result = formatRM(0)
    expect(result).toContain('0.00')
  })

  it('formats a large number with commas', () => {
    const result = formatRM(1000000)
    expect(result).toContain('1,000,000.00')
  })

  it('formats a small decimal', () => {
    const result = formatRM(0.50)
    expect(result).toContain('0.50')
  })

  it('always shows exactly 2 decimal places', () => {
    const result = formatRM(100)
    expect(result).toMatch(/\d+\.\d{2}$/)
  })
})
