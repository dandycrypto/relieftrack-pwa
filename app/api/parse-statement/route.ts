import { NextRequest, NextResponse } from 'next/server'
import { parseStatement } from '@/lib/statement-parser'
import { batchFilter, countByConfidence } from '@/lib/relevance-filter'
import type { BankId } from '@/lib/statement-parser'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const bankHint = (formData.get('bank') as BankId | null) ?? 'generic'

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
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
