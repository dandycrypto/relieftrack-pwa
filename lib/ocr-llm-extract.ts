/**
 * lib/ocr-llm-extract.ts — LLM-based structured field extraction for receipts.
 *
 * The regex/keyword parsers in lib/ocr-parsers.ts (extractVendor,
 * suggestCategory, etc.) are brittle: substring keyword matching mis-tags
 * receipts constantly (e.g. "healthcare" contains "car" → Transport), and
 * the category ids they can return aren't even guaranteed to be valid LHDN
 * relief categories. This module replaces field extraction with one MiniMax
 * call that reasons about the receipt text and LHDN relief rules together,
 * with the app's actual category/subcategory ids passed in as a closed
 * enum so the model can't invent ids the UI doesn't understand.
 *
 * Returns null (never throws) when the API key isn't configured, the call
 * fails, or the response can't be parsed/validated — callers should fall
 * back to the regex parsers in that case, exactly as before this module
 * existed.
 */

import { z } from 'zod'
import { callMiniMax, MiniMaxError } from './minimax'
import { RELIEF_CATEGORY_DEFS, isValidCategory, isValidSubCategory } from './relief-categories'

export interface LLMReceiptExtraction {
  merchant: string
  date: string | null // YYYY-MM-DD
  amount: number | null
  currency: 'MYR' | 'USD' | 'SGD'
  invoice_number: string | null
  description: string
  category: string | null // one of RELIEF_CATEGORY_DEFS ids, or null if not claimable/uncertain
  sub_category: string | null
  claimable: boolean
  /** 0–1, conservative: min(model's self-reported confidence, cross-check score) */
  confidence: number
}

const ExtractionSchema = z.object({
  merchant: z.string().nullish().transform((v) => v ?? ''),
  date: z.string().nullish().transform((v) => v ?? null),
  amount: z.number().nullish().transform((v) => v ?? null),
  currency: z.enum(['MYR', 'USD', 'SGD']).nullish().transform((v) => v ?? 'MYR'),
  invoice_number: z.string().nullish().transform((v) => v ?? null),
  description: z.string().nullish().transform((v) => v ?? ''),
  category: z.string().nullish().transform((v) => v ?? null),
  sub_category: z.string().nullish().transform((v) => v ?? null),
  claimable: z.boolean().nullish().transform((v) => v ?? false),
  confidence: z.number().nullish().transform((v) => (typeof v === 'number' ? Math.min(1, Math.max(0, v)) : 0.5)),
})

const MAX_INPUT_CHARS = 6000
const MIN_TEXT_LENGTH = 20

function buildSystemPrompt(): string {
  const categoryLines = RELIEF_CATEGORY_DEFS.map((c) => {
    const subs = c.subcategories?.length
      ? ` — subcategories: ${c.subcategories.map((s) => `${s.id} (${s.name})`).join(', ')}`
      : ''
    return `- ${c.id}: ${c.name}${subs}`
  }).join('\n')

  return `You are a Malaysian income tax (LHDN) receipt classifier for the ReliefTrack MY app. Given raw text extracted from a receipt or invoice, extract structured fields.

Valid relief categories (use the id exactly, or null if the expense is not tax-deductible under any of these, e.g. groceries, fuel, transport, general shopping):
${categoryLines}

Rules:
- "claimable" is true only if the expense genuinely qualifies for one of the categories above under Malaysian LHDN personal tax relief rules. Everyday spending (food, fuel, parking, toll, general retail, entertainment subscriptions unrelated to lifestyle relief) is NOT claimable — set category and sub_category to null and claimable to false.
- Medical receipts: use medical_self for the patient being self/spouse/child, parents_medical if the patient is explicitly the taxpayer's parent. Use the dental/vaccination/checkup subcategories only when the receipt clearly shows that specific service; otherwise leave sub_category null (still set category and claimable).
- Lifestyle relief only covers: books, computers/smartphones/tablets, internet/broadband subscriptions, sports equipment, gym memberships, and skills courses — not general shopping.
- amount must be the final total actually paid (after any discount, matching "Total"/"Amount Paid"/"Grand Total" — not a subtotal before tax, not a due/outstanding balance).
- date must be YYYY-MM-DD. Use the invoice/transaction date, not a due date.
- description: one short phrase (under 60 chars) describing what was purchased, e.g. "Dental scaling, full mouth" — derived from line items, not the merchant name.
- confidence: your own estimate (0-1) of how certain you are about amount, date and category together. Use lower values when the text is ambiguous, truncated, or you had to guess.
- If a field cannot be determined, use null. Never invent a merchant, amount, or date not present in the text.

Reply ONLY with valid JSON, no markdown, matching exactly this shape:
{"merchant":"...","date":"YYYY-MM-DD"|null,"amount":0|null,"currency":"MYR"|"USD"|"SGD","invoice_number":"..."|null,"description":"...","category":"..."|null,"sub_category":"..."|null,"claimable":true|false,"confidence":0.0}`
}

function normalizeForSearch(text: string): string {
  return text.replace(/,/g, '').toLowerCase()
}

/** Loose check that the amount (with or without thousands separators) appears in the raw text. */
function isAmountGrounded(amount: number, rawText: string): boolean {
  const normalized = normalizeForSearch(rawText)
  const candidates = [amount.toFixed(2), String(Math.round(amount))]
  return candidates.some((c) => normalized.includes(c.toLowerCase()))
}

/** Loose check that the date's day and year both appear somewhere in the raw text. */
function isDateGrounded(isoDate: string, rawText: string): boolean {
  const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return false
  const [, year, , day] = m
  const dayNum = String(parseInt(day, 10))
  return rawText.includes(year) && (rawText.includes(day) || rawText.includes(dayNum))
}

/**
 * Extracts structured, LHDN-aware fields from raw receipt text via MiniMax.
 * Returns null on any failure (missing key, network error, unparseable or
 * invalid response) — callers should fall back to the regex parsers.
 */
export async function extractReceiptFields(rawText: string): Promise<LLMReceiptExtraction | null> {
  const trimmed = rawText.trim()
  if (trimmed.length < MIN_TEXT_LENGTH) return null

  let reply: string
  try {
    reply = await callMiniMax(
      buildSystemPrompt(),
      [{ role: 'user', content: trimmed.slice(0, MAX_INPUT_CHARS) }],
      { model: 'abab6.5s-chat', temperature: 0.1, maxTokens: 500 }
    )
  } catch (err) {
    if (!(err instanceof MiniMaxError)) {
      console.error('[ocr-llm-extract] unexpected error calling MiniMax:', err)
    }
    return null
  }

  const jsonMatch = reply.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null

  let raw: unknown
  try {
    raw = JSON.parse(jsonMatch[0])
  } catch {
    return null
  }

  const parsed = ExtractionSchema.safeParse(raw)
  if (!parsed.success) return null
  const data = parsed.data

  // ── Category/subcategory validation — never let an invalid id reach the UI ──
  let category = data.category
  let subCategory = data.sub_category
  let claimable = data.claimable
  if (category && !isValidCategory(category)) {
    category = null
    subCategory = null
    claimable = false
  }
  if (category && subCategory && !isValidSubCategory(category, subCategory)) {
    subCategory = null
  }
  if (!category) {
    subCategory = null
    claimable = false
  }

  // ── Date validation ──
  const date = data.date && /^\d{4}-\d{2}-\d{2}$/.test(data.date) ? data.date : null

  // ── Confidence: conservative combination of the model's self-report and
  // whether the amount/date it extracted are actually present in the source
  // text. This is the most important guardrail — a fabricated amount is the
  // most dangerous failure mode for a finance app, so any ungrounded amount
  // caps confidence well below the auto-save threshold. ──
  let validationConfidence = 1.0
  if (!data.merchant.trim()) validationConfidence = Math.min(validationConfidence, 0.4)
  if (data.amount === null || data.amount <= 0) {
    validationConfidence = Math.min(validationConfidence, 0.3)
  } else if (!isAmountGrounded(data.amount, trimmed)) {
    validationConfidence = Math.min(validationConfidence, 0.4)
  }
  if (date && !isDateGrounded(date, trimmed)) {
    validationConfidence = Math.min(validationConfidence, 0.6)
  }
  if (!category) validationConfidence = Math.min(validationConfidence, 0.6)

  const confidence = Math.min(data.confidence, validationConfidence)

  return {
    merchant: data.merchant.trim(),
    date,
    amount: data.amount !== null && data.amount > 0 ? data.amount : null,
    currency: data.currency,
    invoice_number: data.invoice_number,
    description: data.description.trim().slice(0, 200),
    category,
    sub_category: subCategory,
    claimable,
    confidence,
  }
}
