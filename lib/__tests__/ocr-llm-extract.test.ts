import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { extractReceiptFields } from '../ocr-llm-extract'

const DENTAL_RECEIPT_TEXT = `
Metro Perdana Dental Clinic
G32 Healthcare Sdn Bhd
Invoice ID: INV-42120
Invoice Date: 24 January 2024

Item                                          Qty   Unit Price   Amount (RM)
Scaling, Full Mouth, Wednesday, 24 January 2024  1      130.00       130.00
                                                       Subtotal      130.00
                                                          Total      130.00
`

function mockMiniMaxReply(content: string, ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: async () => ({ choices: [{ message: { content } }] }),
    text: async () => 'error',
  })
}

describe('extractReceiptFields', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env.MINIMAX_API_KEY = 'test-key'
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.unstubAllGlobals()
  })

  it('returns null when MINIMAX_API_KEY is not configured (fallback to regex)', async () => {
    delete process.env.MINIMAX_API_KEY
    vi.stubGlobal('fetch', vi.fn())
    const result = await extractReceiptFields(DENTAL_RECEIPT_TEXT)
    expect(result).toBeNull()
  })

  it('returns null for very short text', async () => {
    vi.stubGlobal('fetch', mockMiniMaxReply('{}'))
    const result = await extractReceiptFields('hi')
    expect(result).toBeNull()
  })

  it('extracts a well-grounded dental receipt correctly', async () => {
    const reply = JSON.stringify({
      merchant: 'Metro Perdana Dental Clinic',
      date: '2024-01-24',
      amount: 130.0,
      currency: 'MYR',
      invoice_number: 'INV-42120',
      description: 'Scaling, full mouth',
      category: 'medical_self',
      sub_category: 'medical_dental',
      claimable: true,
      confidence: 0.95,
    })
    vi.stubGlobal('fetch', mockMiniMaxReply(reply))
    const result = await extractReceiptFields(DENTAL_RECEIPT_TEXT)
    expect(result).not.toBeNull()
    expect(result!.merchant).toBe('Metro Perdana Dental Clinic')
    expect(result!.amount).toBe(130)
    expect(result!.date).toBe('2024-01-24')
    expect(result!.category).toBe('medical_self')
    expect(result!.sub_category).toBe('medical_dental')
    expect(result!.claimable).toBe(true)
    expect(result!.confidence).toBeGreaterThanOrEqual(0.85)
  })

  it('caps confidence when the amount is not grounded in the raw text (fabrication guard)', async () => {
    const reply = JSON.stringify({
      merchant: 'Metro Perdana Dental Clinic',
      date: '2024-01-24',
      amount: 999.99, // not present anywhere in DENTAL_RECEIPT_TEXT
      currency: 'MYR',
      invoice_number: 'INV-42120',
      description: 'Scaling, full mouth',
      category: 'medical_self',
      sub_category: 'medical_dental',
      claimable: true,
      confidence: 0.95,
    })
    vi.stubGlobal('fetch', mockMiniMaxReply(reply))
    const result = await extractReceiptFields(DENTAL_RECEIPT_TEXT)
    expect(result).not.toBeNull()
    expect(result!.confidence).toBeLessThan(0.85)
  })

  it('discards an invalid category id rather than passing it through to the UI', async () => {
    const reply = JSON.stringify({
      merchant: 'Shell Station',
      date: '2024-01-24',
      amount: 130.0,
      currency: 'MYR',
      invoice_number: null,
      description: 'Fuel',
      category: 'transport', // not a valid RELIEF_CATEGORY_DEFS id
      sub_category: null,
      claimable: true,
      confidence: 0.9,
    })
    vi.stubGlobal('fetch', mockMiniMaxReply(reply))
    const result = await extractReceiptFields(DENTAL_RECEIPT_TEXT)
    expect(result).not.toBeNull()
    expect(result!.category).toBeNull()
    expect(result!.claimable).toBe(false)
  })

  it('discards a subcategory id that does not belong to the chosen category', async () => {
    const reply = JSON.stringify({
      merchant: 'Metro Perdana Dental Clinic',
      date: '2024-01-24',
      amount: 130.0,
      currency: 'MYR',
      invoice_number: null,
      description: 'Scaling',
      category: 'medical_self',
      sub_category: 'housing_500k', // belongs to a different category
      claimable: true,
      confidence: 0.9,
    })
    vi.stubGlobal('fetch', mockMiniMaxReply(reply))
    const result = await extractReceiptFields(DENTAL_RECEIPT_TEXT)
    expect(result).not.toBeNull()
    expect(result!.category).toBe('medical_self')
    expect(result!.sub_category).toBeNull()
  })

  it('correctly classifies a non-claimable everyday purchase', async () => {
    const reply = JSON.stringify({
      merchant: '99 Speedmart',
      date: '2024-01-24',
      amount: 45.6,
      currency: 'MYR',
      invoice_number: null,
      description: 'Groceries',
      category: null,
      sub_category: null,
      claimable: false,
      confidence: 0.9,
    })
    const groceryText = 'RECEIPT\n99 Speedmart\nDate: 24/01/2024\nTOTAL: RM 45.60\nThank you'
    vi.stubGlobal('fetch', mockMiniMaxReply(reply))
    const result = await extractReceiptFields(groceryText)
    expect(result).not.toBeNull()
    expect(result!.category).toBeNull()
    expect(result!.claimable).toBe(false)
  })

  it('returns null when the model reply is not valid JSON', async () => {
    vi.stubGlobal('fetch', mockMiniMaxReply('Sorry, I cannot help with that.'))
    const result = await extractReceiptFields(DENTAL_RECEIPT_TEXT)
    expect(result).toBeNull()
  })

  it('returns null when the API call fails outright', async () => {
    vi.stubGlobal('fetch', mockMiniMaxReply('', false))
    const result = await extractReceiptFields(DENTAL_RECEIPT_TEXT)
    expect(result).toBeNull()
  })

  it('caps confidence when amount is missing entirely', async () => {
    const reply = JSON.stringify({
      merchant: 'Metro Perdana Dental Clinic',
      date: '2024-01-24',
      amount: null,
      currency: 'MYR',
      invoice_number: null,
      description: 'Scaling',
      category: 'medical_self',
      sub_category: 'medical_dental',
      claimable: true,
      confidence: 0.95,
    })
    vi.stubGlobal('fetch', mockMiniMaxReply(reply))
    const result = await extractReceiptFields(DENTAL_RECEIPT_TEXT)
    expect(result).not.toBeNull()
    expect(result!.amount).toBeNull()
    expect(result!.confidence).toBeLessThanOrEqual(0.3)
  })
})
