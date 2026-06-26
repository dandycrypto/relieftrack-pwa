import { NextRequest, NextResponse } from 'next/server'

// PWA Share Target handler — registered via manifest.json share_target
// Receives shared images/PDFs/CSVs from other apps and redirects to dashboard with the file
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get('receipt') as File | null
    const title = form.get('title') as string | null
    const text = form.get('text') as string | null
    const url = form.get('url') as string | null

    // Store shared payload in a server-side session cookie so the dashboard can pick it up
    // We use a simple query-param redirect with type info; the actual file is too large for URL
    // Instead, store the file as base64 in a short-lived cookie
    if (file && file.size > 0) {
      const bytes = await file.arrayBuffer()
      const base64 = Buffer.from(bytes).toString('base64')
      const meta = JSON.stringify({
        name: file.name,
        type: file.type,
        size: file.size,
        title: title || file.name,
      })

      // Set a short-lived cookie with file data (max ~4KB for name+meta; full file in separate cookie)
      const response = NextResponse.redirect(new URL('/dashboard?action=add&shared=1', req.url))
      response.cookies.set('shared_file_meta', meta, { maxAge: 300, path: '/' })
      response.cookies.set('shared_file_data', base64, { maxAge: 300, path: '/' })
      return response
    }

    // Text/URL share — redirect to add with pre-filled note
    const note = [title, text, url].filter(Boolean).join(' ')
    const encoded = encodeURIComponent(note.slice(0, 200))
    return NextResponse.redirect(new URL(`/dashboard?action=add&note=${encoded}`, req.url))
  } catch {
    return NextResponse.redirect(new URL('/dashboard?action=add', req.url))
  }
}
