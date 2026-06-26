import { describe, it, expect } from 'vitest'
import { mapConfidenceToLevel } from '../ocr'

describe('mapConfidenceToLevel', () => {
  it('returns "high" for confidence >= 0.85', () => {
    expect(mapConfidenceToLevel(0.85)).toBe('high')
    expect(mapConfidenceToLevel(0.90)).toBe('high')
    expect(mapConfidenceToLevel(1.0)).toBe('high')
    expect(mapConfidenceToLevel(0.95)).toBe('high')
  })

  it('returns "review" for confidence 0.70–0.84', () => {
    expect(mapConfidenceToLevel(0.70)).toBe('review')
    expect(mapConfidenceToLevel(0.75)).toBe('review')
    expect(mapConfidenceToLevel(0.84)).toBe('review')
    expect(mapConfidenceToLevel(0.849)).toBe('review')
  })

  it('returns "low" for confidence < 0.70', () => {
    expect(mapConfidenceToLevel(0.69)).toBe('low')
    expect(mapConfidenceToLevel(0.5)).toBe('low')
    expect(mapConfidenceToLevel(0.0)).toBe('low')
    expect(mapConfidenceToLevel(0.1)).toBe('low')
  })

  it('handles edge cases at boundaries', () => {
    expect(mapConfidenceToLevel(0.6999)).toBe('low')
    expect(mapConfidenceToLevel(0.7)).toBe('review')
    expect(mapConfidenceToLevel(0.8499)).toBe('review')
    expect(mapConfidenceToLevel(0.85)).toBe('high')
  })
})
