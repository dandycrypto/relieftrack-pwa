import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase"

// Shared secret set in your email provider webhook config
const WEBHOOK_SECRET = process.env.EMAIL_WEBHOOK_SECRET ?? ""

interface PostmarkAttachment {
  Name: string
  Content: string   // base64
  ContentType: string
  ContentLength: number
}

interface PostmarkPayload {
  From: string
  Subject: string
  TextBody?: string
  Attachments?: PostmarkAttachment[]
  ToFull?: { Email: string }[]
}

// Extract userId from the To address: receipts+{userId}@receipts.relieftrack.my
function extractUserId(payload: PostmarkPayload): string | null {
  const toAddresses = payload.ToFull?.map((t) => t.Email) ?? []
  for (const addr of toAddresses) {
    const match = addr.match(/receipts\+([a-f0-9]{8,36})@/i)
    if (match) return match[1]
  }
  return null
}

export async function POST(req: NextRequest) {
  // Validate shared secret — always require it in production
  if (!WEBHOOK_SECRET) {
    console.error('[email-inbound] EMAIL_WEBHOOK_SECRET is not configured')
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 })
  }
  const secret = req.headers.get("x-webhook-secret")
  if (!secret || secret !== WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let payload: PostmarkPayload
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const userId = extractUserId(payload)
  if (!userId) {
    return NextResponse.json({ error: "Could not identify user from To address" }, { status: 400 })
  }

  const attachments = (payload.Attachments ?? []).filter(
    (a) => /image\/(jpeg|png|webp|gif)|application\/pdf/i.test(a.ContentType)
  )

  if (attachments.length === 0) {
    return NextResponse.json({ processed: 0, message: "No image/PDF attachments found" })
  }

  let processed = 0
  const errors: string[] = []

  for (const attachment of attachments) {
    try {
      // Decode base64 to binary buffer
      const binary = Buffer.from(attachment.Content, "base64")
      const blob = new Blob([binary], { type: attachment.ContentType })
      const file = new File([blob], attachment.Name, { type: attachment.ContentType })

      // Call OCR API internally
      const formData = new FormData()
      formData.append("file", file)
      const ocrRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:5577"}/api/ocr`, {
        method: "POST",
        body: formData,
      })

      if (!ocrRes.ok) {
        errors.push(`OCR failed for ${attachment.Name}: HTTP ${ocrRes.status}`)
        continue
      }

      const ocrData = await ocrRes.json()

      // Insert pending record into Supabase
      if (supabaseAdmin) {
        // Look up the full user_id from the short ID prefix
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .ilike("id", `${userId}%`)
          .limit(1)
          .maybeSingle()

        if (profile?.id) {
          await supabaseAdmin.from("records").insert({
            user_id: profile.id,
            merchant: ocrData.vendor || payload.Subject || "Email Receipt",
            category: "lifestyle",
            date: ocrData.date || new Date().toISOString().slice(0, 10),
            amount: ocrData.amount || 0,
            status: "pending",
            notes: `Forwarded from: ${payload.From}`,
            invoice_number: ocrData.invoice_number || undefined,
            ocr_text: ocrData.raw_text || undefined,
          })
          processed++
        }
      }
    } catch (err) {
      errors.push(`Error processing ${attachment.Name}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return NextResponse.json({
    processed,
    errors: errors.length > 0 ? errors : undefined,
    message: `Processed ${processed} of ${attachments.length} attachments`,
  })
}
