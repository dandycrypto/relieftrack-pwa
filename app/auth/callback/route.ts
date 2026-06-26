/**
 * app/auth/callback/route.ts
 * Handles OAuth callback from Supabase after Google sign-in.
 * Creates session + Drive folders (server-side) → redirects to app.
 */

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 60

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
// Must match LHDN_FOLDER_NAMES in lib/google-drive.ts — same names, same order
const CATEGORY_FOLDER_NAMES: Record<string, string> = {
  individual:           '01_Individual_Dependent',
  medical_self:         '02_Medical_Self_Spouse_Child',
  parents_medical:      '03_Medical_Parents',
  disabled:             '04_Disabled_Individual',
  disabled_equipment:   '05_Disabled_Equipment',
  spouse:               '06_Spouse_Alimony',
  children_under18:     '07_Children_Under18',
  children_education:   '08_Children_Higher_Education',
  education_self:       '09_Education_Self',
  lifestyle:            '10_Lifestyle',
  epf_insurance:        '11_EPF_Insurance_Takaful',
  housing_loan:         '12_First_Home_Loan_Interest',
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

async function createMultipart(token: string, folderId: string, manifest: object): Promise<void> {
  const boundary = `boundary_${Date.now()}`
  const metadata = { name: 'manifest.json', mimeType: 'application/json', parents: [folderId] }
  const content = new TextEncoder().encode(JSON.stringify(manifest, null, 2))
  const metadataBytes = new TextEncoder().encode(JSON.stringify(metadata))
  const parts: Uint8Array[] = []
  parts.push(new TextEncoder().encode(`--${boundary}\r\nContent-Type: application/json\r\n\r\n`))
  parts.push(metadataBytes)
  parts.push(new TextEncoder().encode(`\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`))
  parts.push(content)
  parts.push(new TextEncoder().encode(`\r\n--${boundary}--`))
  const flat = new Uint8Array(parts.reduce((s, b) => s + b.length, 0))
  let offset = 0
  for (const p of parts) { flat.set(p, offset); offset += p.length }
  const res = await fetch(`${DRIVE_UPLOAD}/files?uploadType=multipart`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: flat,
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`manifest upload failed: ${res.status} — ${body}`)
  }
}

async function findOrCreateFolder(token: string, name: string, parents: string[] = []): Promise<{ id: string; name: string }> {
  let query = `name="${name}" and mimeType="application/vnd.google-apps.folder" and trashed=false`
  if (parents.length > 0) query = `"${parents[0]}" in parents and ` + query
  const search = await fetch(
    `${DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=files(id,name)`,
    { headers: authHeaders(token) }
  ).then((r) => r.json())
  if (search.files?.length) return search.files[0]
  const created = await fetch(`${DRIVE_API}/files?fields=id,name,mimeType`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: parents.length ? parents : undefined }),
  }).then((r) => r.json())
  return created
}

async function setupDriveFolders(token: string, taxYear: number): Promise<void> {
  const root = await findOrCreateFolder(token, 'ReliefTrack MY')
  const ya = await findOrCreateFolder(token, `YA ${taxYear}`, [root.id])
  // Root manifest
  const rootMan = await fetch(`${DRIVE_API}/files?q=${encodeURIComponent(`"${root.id}" in parents and name="manifest.json" and trashed=false`)}&fields=files(id,name)`, { headers: authHeaders(token) }).then((r) => r.json())
  if (!rootMan.files?.length) await createMultipart(token, root.id, { version: '1.0', updatedAt: new Date().toISOString() })
  // YA manifest
  const yaMan = await fetch(`${DRIVE_API}/files?q=${encodeURIComponent(`"${ya.id}" in parents and name="manifest.json" and trashed=false`)}&fields=files(id,name)`, { headers: authHeaders(token) }).then((r) => r.json())
  if (!yaMan.files?.length) await createMultipart(token, ya.id, { version: '1.0', updatedAt: new Date().toISOString(), year: taxYear })
  // Category folders + manifests
  for (const folderName of Object.values(CATEGORY_FOLDER_NAMES)) {
    const catFolder = await findOrCreateFolder(token, folderName, [ya.id])
    const manSearch = await fetch(`${DRIVE_API}/files?q=${encodeURIComponent(`"${catFolder.id}" in parents and name="manifest.json" and trashed=false`)}&fields=files(id,name)`, { headers: authHeaders(token) }).then((r) => r.json())
    if (!manSearch.files?.length) await createMultipart(token, catFolder.id, { version: '1.0', updatedAt: new Date().toISOString(), records: [] })
  }
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const driveConnect = searchParams.get('drive_connect') === '1'
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || origin

  if (!code) return NextResponse.redirect(`${siteUrl}/login?error=no_code`)

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => request.cookies.get(name)?.value,
        set: (name: string, value: string, options: any) => { request.cookies.set({ name, value, ...options }) },
        remove: (name: string, options: any) => { request.cookies.set({ name, value: '', ...options }) },
      },
    }
  )

  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) return NextResponse.redirect(`${siteUrl}/login?error=auth_failed`)

  // Determine redirect based on whether this is a Drive connect OAuth
  let redirectPath = '/dashboard'
  let setupResult = '0'
  if (driveConnect) {
    redirectPath = '/dashboard?tab=settings'
    const { data: { session } } = await supabase.auth.getSession()
    const googleToken = session?.provider_token || null
    if (googleToken) {
      try {
        await setupDriveFolders(googleToken, new Date().getFullYear())
        setupResult = '1'
      } catch (err) {
        console.error('[Auth Callback] Drive folder setup failed:', err)
      }
    } else {
      console.warn('[Auth Callback] No provider_token in session — cannot create Drive folders')
    }
  }

  const separator = redirectPath.includes('?') ? '&' : '?'
  return NextResponse.redirect(`${siteUrl}${redirectPath}${separator}drive_setup=${setupResult}`)
}
