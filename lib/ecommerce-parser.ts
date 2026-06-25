/**
 * E-commerce Order History Parser — Shopee & Lazada
 * Parses CSV exports from order history to find LHDN-qualifying purchases
 * (books, electronics, sports equipment) for Lifestyle D14 relief
 */

import type { ParsedTransaction } from '@/lib/ewallet-parser'
import { filterRelevance } from '@/lib/relevance-filter'

export type EcommercePlatform = 'shopee' | 'lazada' | 'generic'

export interface EcommerceItem {
  date: string
  orderId: string
  productName: string
  amount: number
  platform: EcommercePlatform
  relevantForLHDN: boolean
  suggestedCategory: string | null
  reason: string
}

// ── Qualifying product keywords for LHDN D14 ─────────────────────────────────
// These patterns match product names from Shopee/Lazada order exports

const QUALIFYING_PRODUCTS: Array<{ pattern: RegExp; category: string; reason: string }> = [
  // Books
  { pattern: /(book|buku|novel|magazine|textbook|reference book|dictionary|comic|manga|ebook reader|kindle)/i, category: 'lifestyle', reason: 'Books — D14 basic sub-limit' },
  // Electronics / PC
  { pattern: /(laptop|notebook|macbook|chromebook|computer|desktop|gaming pc|all-in-one)/i, category: 'lifestyle', reason: 'Personal computer — D14 basic sub-limit' },
  { pattern: /(tablet|ipad|galaxy tab|android tablet|surface go|drawing tablet|wacom)/i, category: 'lifestyle', reason: 'Tablet — D14 basic sub-limit' },
  { pattern: /(smartphone|iphone|samsung galaxy|realme|xiaomi|oppo|vivo|honor|poco|android phone|mobile phone)/i, category: 'lifestyle', reason: 'Smartphone — D14 basic sub-limit' },
  // Internet/networking (home use)
  { pattern: /(router|wifi router|mesh wifi|modem router|broadband router|tp-link|asus router|xiaomi router)/i, category: 'lifestyle', reason: 'Home networking — D14 basic sub-limit' },
  // Peripherals (qualifying)
  { pattern: /(printer|scanner|keyboard|mechanical keyboard|mouse wireless|webcam|monitor|external hdd|solid state drive|ssd|graphics card|gpu|ram memory)/i, category: 'lifestyle', reason: 'PC peripheral — D14 basic sub-limit' },
  // Sports equipment
  { pattern: /(badminton racket|tennis racket|squash racket|running shoes|sports shoes|cycling helmet|bicycle|swimming goggles|yoga mat|gym equipment|dumbbells|resistance band|kettlebell|pull-up bar|sports bag|gym bag|water bottle sport|protein shaker)/i, category: 'lifestyle', reason: 'Sports equipment — D14 sports sub-limit' },
  // Online course/learning
  { pattern: /(online course|e-learning|digital course|udemy|coursera|certification|tutorial|workbook|study guide)/i, category: 'education_self', reason: 'Online learning material — may qualify for D11 upskilling' },
]

const NON_QUALIFYING: RegExp[] = [
  /(food|drink|beverage|snack|supplement|vitamin|protein powder|groceries|skincare|beauty|makeup|perfume|fashion|clothing|shirt|pants|dress|shoes fashion|bag handbag|jewellery|watch fashion|home decor|furniture|bedding|curtain|kitchenware|cleaning|hygiene|pet|baby|toy game|gaming console game|entertainment)/i,
]

function isQualifying(productName: string): { qualifying: boolean; category: string | null; reason: string } {
  // Check non-qualifying first
  for (const pat of NON_QUALIFYING) {
    if (pat.test(productName)) return { qualifying: false, category: null, reason: 'Non-qualifying product category' }
  }
  // Check qualifying
  for (const { pattern, category, reason } of QUALIFYING_PRODUCTS) {
    if (pattern.test(productName)) return { qualifying: true, category, reason }
  }
  // Unknown — needs review
  return { qualifying: false, category: null, reason: 'Review needed — product type unclear' }
}

// ── Shopee Order CSV ─────────────────────────────────────────────────────────
// Shopee My Orders export columns (approximate):
// Order ID, Order Status, Order Creation Time, Product Name, Unit Price, Quantity, ...

export function parseShopeeCSV(csvText: string): EcommerceItem[] {
  const lines = csvText.trim().split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) return []

  const headers = lines[0].toLowerCase().split(',').map((h) => h.trim().replace(/"/g, ''))
  const dateIdx    = headers.findIndex((h) => h.includes('creation time') || h.includes('order date') || h.includes('date'))
  const orderIdx   = headers.findIndex((h) => h.includes('order id') || h.includes('order no'))
  const productIdx = headers.findIndex((h) => h.includes('product name') || h.includes('item name') || h.includes('product'))
  const priceIdx   = headers.findIndex((h) => h.includes('total') || h.includes('price') || h.includes('amount'))
  const statusIdx  = headers.findIndex((h) => h.includes('status') || h.includes('order status'))

  if (productIdx < 0 || priceIdx < 0) return []

  const results: EcommerceItem[] = []

  for (const line of lines.slice(1)) {
    const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''))

    // Only include completed orders
    if (statusIdx >= 0) {
      const status = cols[statusIdx]?.toLowerCase() ?? ''
      if (!/completed|delivered|received/i.test(status)) continue
    }

    const rawDate    = dateIdx >= 0 ? cols[dateIdx] : ''
    const orderId    = orderIdx >= 0 ? cols[orderIdx] : ''
    const product    = cols[productIdx] ?? ''
    const rawAmt     = cols[priceIdx] ?? ''
    const amount     = parseFloat(rawAmt.replace(/[^0-9.]/g, ''))

    if (!product || !amount || amount <= 0) continue

    let date = rawDate.slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}/.test(date)) {
      const d = new Date(rawDate)
      date = !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)
    }

    const { qualifying, category, reason } = isQualifying(product)

    results.push({
      date,
      orderId,
      productName: product,
      amount,
      platform: 'shopee',
      relevantForLHDN: qualifying,
      suggestedCategory: category,
      reason,
    })
  }

  return results
}

// ── Lazada Order CSV ─────────────────────────────────────────────────────────
// Lazada order history export columns (approximate):
// Order Date, Order Number, Item Description, Unit Price, Quantity, Total

export function parseLazadaCSV(csvText: string): EcommerceItem[] {
  const lines = csvText.trim().split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) return []

  const headers = lines[0].toLowerCase().split(',').map((h) => h.trim().replace(/"/g, ''))
  const dateIdx    = headers.findIndex((h) => h.includes('date') || h.includes('order date'))
  const orderIdx   = headers.findIndex((h) => h.includes('order number') || h.includes('order id'))
  const productIdx = headers.findIndex((h) => h.includes('item description') || h.includes('product') || h.includes('item name'))
  const priceIdx   = headers.findIndex((h) => h.includes('total') || h.includes('price') || h.includes('amount'))
  const statusIdx  = headers.findIndex((h) => h.includes('status'))

  if (productIdx < 0 || priceIdx < 0) return []

  const results: EcommerceItem[] = []

  for (const line of lines.slice(1)) {
    const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''))

    if (statusIdx >= 0) {
      const status = cols[statusIdx]?.toLowerCase() ?? ''
      if (!/delivered|completed|closed/i.test(status)) continue
    }

    const rawDate  = dateIdx >= 0 ? cols[dateIdx] : ''
    const orderId  = orderIdx >= 0 ? cols[orderIdx] : ''
    const product  = cols[productIdx] ?? ''
    const rawAmt   = cols[priceIdx] ?? ''
    const amount   = parseFloat(rawAmt.replace(/[^0-9.]/g, ''))

    if (!product || !amount || amount <= 0) continue

    let date = rawDate.slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}/.test(date)) {
      const d = new Date(rawDate)
      date = !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)
    }

    const { qualifying, category, reason } = isQualifying(product)

    results.push({
      date,
      orderId,
      productName: product,
      amount,
      platform: 'lazada',
      relevantForLHDN: qualifying,
      suggestedCategory: category,
      reason,
    })
  }

  return results
}

// ── Convert qualifying items to ParsedTransaction ─────────────────────────────

export function ecommerceItemsToTransactions(items: EcommerceItem[]): ParsedTransaction[] {
  return items
    .filter((i) => i.relevantForLHDN)
    .map((i) => ({
      date: i.date,
      merchant: `${i.platform === 'shopee' ? 'Shopee' : 'Lazada'} — ${i.productName.slice(0, 40)}`,
      amount: i.amount,
      category: i.suggestedCategory ?? 'lifestyle',
      rawRow: `${i.orderId}|${i.productName}|${i.amount}`,
    }))
}

export function parseEcommerceCSV(csvText: string, platform: EcommercePlatform): EcommerceItem[] {
  if (platform === 'shopee') return parseShopeeCSV(csvText)
  if (platform === 'lazada') return parseLazadaCSV(csvText)

  // Generic: try both
  const shopeeResult = parseShopeeCSV(csvText)
  if (shopeeResult.length > 0) return shopeeResult
  return parseLazadaCSV(csvText)
}
