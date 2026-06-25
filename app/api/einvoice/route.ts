import { NextRequest, NextResponse } from "next/server"

// LHDN MyInvois public portal base URL for fetching e-Invoice data
const MYINVOIS_BASE = "https://myinvois.hasil.gov.my"

interface EInvoiceResult {
  vendor: string
  amount: number | null
  date: string | null
  invoiceNumber: string | null
  tin: string | null
  lineItems: string[]
}

export async function GET(req: NextRequest) {
  const uuid = req.nextUrl.searchParams.get("uuid")
  if (!uuid || uuid.length < 8) {
    return NextResponse.json({ error: "Missing or invalid uuid" }, { status: 400 })
  }

  try {
    // Attempt to fetch the validated invoice JSON from LHDN's public API
    // LHDN MyInvois public endpoint (no auth required for validated invoices)
    const url = `${MYINVOIS_BASE}/api/v1.0/documents/${encodeURIComponent(uuid)}/details`
    const res = await fetch(url, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) {
      return NextResponse.json({ error: `MyInvois returned ${res.status}` }, { status: 502 })
    }

    const data = await res.json()
    const result = parseMyInvoisResponse(data, uuid)
    return NextResponse.json(result)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}

function parseMyInvoisResponse(data: any, uuid: string): EInvoiceResult {
  // MyInvois UBL-JSON response shape (simplified)
  const doc = data?.document || data?.invoice || data || {}

  const supplier = doc?.AccountingSupplierParty?.Party?.PartyName?.[0]?.Name?._ || ""
  const taxTotal = doc?.TaxTotal?.[0]?.TaxAmount?._ ?? null
  const legalTotal = doc?.LegalMonetaryTotal?.PayableAmount?._ ?? null
  const amount = legalTotal ?? taxTotal

  const dateStr = doc?.IssueDate?._ || doc?.issueDate || null
  const invNum = doc?.ID?._ || doc?.id || uuid

  const lines: string[] = (doc?.InvoiceLine || []).slice(0, 3).map((line: any) => {
    const name = line?.Item?.Name?._ || line?.item?.name || ""
    const qty = line?.InvoicedQuantity?._ || ""
    return [qty, name].filter(Boolean).join(" × ")
  })

  return {
    vendor: supplier,
    amount: amount != null ? parseFloat(String(amount)) : null,
    date: dateStr,
    invoiceNumber: invNum,
    tin: doc?.AccountingSupplierParty?.Party?.PartyTaxScheme?.[0]?.CompanyID?._ || null,
    lineItems: lines,
  }
}
