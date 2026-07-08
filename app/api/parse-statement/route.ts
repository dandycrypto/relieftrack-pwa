import { NextRequest, NextResponse } from 'next/server'
import { parseStatement } from '@/lib/statement-parser'
import { batchFilter, countByConfidence } from '@/lib/relevance-filter'
import type { BankId } from '@/lib/statement-parser'
import { requireAuth } from '@/lib/api-auth'
import { isRateLimited } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const maxDuration = 30

const RATE_LIMIT_MAX = 10
const RATE_LIMIT_WINDOW_MS = 60_000
const MAX_FILE_SIZE = 10 * 1024 * 1024 // bank/e-wallet statements are text; 10MB is generous

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (isRateLimited(`parse-statement:${user.id}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
      return NextResponse.json({ error: 'Too many requests. Please slow down.' }, { status: 429 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const bankHint = (formData.get('bank') as BankId | null) ?? 'generic'

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large. Max size: 10MB' }, { status: 400 })
    }

    const text = await file.text()
    if (!text.trim()) {
      return NextResponse.json({ error: 'File is empty' }, { status: 400 })
    }

    const parsed = parseStatement(text, bankHint === 'generic' ? undefined : bankHint)

    const filtered = batchFilter(
      parsed.transactions.map((t) => ({
        date: t.date,
        merchant: t.merchant,
        description: t.description,
        amount: t.amount,
        rawRow: t.rawRow,
      }))
    )

    const counts = countByConfidence(filtered)

    return NextResponse.json({
      bank: parsed.bank,
      accountNumber: parsed.accountNumber,
      period: parsed.period,
      rowsTotal: parsed.rowsTotal,
      rowsParsed: parsed.rowsParsed,
      parseErrors: parsed.parseErrors,
      transactions: filtered,
      summary: counts,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Parse error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
