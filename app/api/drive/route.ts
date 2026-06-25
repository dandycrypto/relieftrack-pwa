/**
 * app/api/drive/route.ts
 * Google Drive API operations — ALL server-side for security.
 * 
 * Google access token is retrieved from auth.identities table
 * (service role bypasses RLS). Drive API calls are made from server.
 */

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 60

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
const CATEGORIES = [
  'individual', 'medical_self', 'parents_medical', 'disabled', 'disabled_equipment',
  'spouse', 'children_under18', 'children_education', 'education_self',
  'lifestyle', 'epf_insurance', 'housing_loan',
]

// ── Supabase setup (lazy import to avoid build issues) ─────────────────────────

function getSupabaseAdmin() {
  const { createServerClient } = require('@supabase/ssr')
  // We need a way to create a server client with service role
  // Since this is an API route, we use the public anon key with
  // the user's session cookie, and access auth.identities via
  // a direct connection with service role key
  return null
}

// ── Drive API helpers (all server-side) ────────────────────────────────────

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

async function createMultipart(
  token: string,
  folderId: string,
  manifest: object
): Promise<void> {
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
    const text = await res.text()
    throw new Error(`manifest upload failed: ${res.status} ${text}`)
  }
}

async function updateMultipartFile(
  token: string,
  fileId: string,
  manifest: object
): Promise<void> {
  const boundary = `boundary_${Date.now()}`
  const metadata = { name: 'manifest.json', mimeType: 'application/json' }
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

  const res = await fetch(`${DRIVE_UPLOAD}/files/${fileId}?uploadType=multipart`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: flat,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`manifest update failed: ${res.status} ${text}`)
  }
}

async function findOrCreateFolder(
  token: string,
  name: string,
  parents: string[] = [],
  mimeType = 'application/vnd.google-apps.folder'
): Promise<{ id: string; name: string }> {
  let query = `name="${name}" and mimeType="${mimeType}" and trashed=false`
  if (parents.length > 0) {
    query = `"${parents[0]}" in parents and ` + query
  }
  const search = await fetch(
    `${DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=files(id,name)`,
    { headers: authHeaders(token) }
  ).then((r) => r.json())

  if (search.files?.length) return search.files[0]

  const created = await fetch(`${DRIVE_API}/files?fields=id,name,mimeType`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ name, mimeType, parents: parents.length ? parents : undefined }),
  }).then((r) => r.json())
  return created
}

async function setupFolders(token: string, taxYear: number) {
  // 1. Root folder
  const root = await findOrCreateFolder(token, 'ReliefTrack MY')

  // 2. YA folder
  const ya = await findOrCreateFolder(token, `YA ${taxYear}`, [root.id])

  // 3. Root manifest
  const rootMan = await fetch(
    `${DRIVE_API}/files?q=${encodeURIComponent(`"${root.id}" in parents and name="manifest.json" and trashed=false`)}&fields=files(id,name)`,
    { headers: authHeaders(token) }
  ).then((r) => r.json())
  if (!rootMan.files?.length) {
    await createMultipart(token, root.id, { version: '1.0', updatedAt: new Date().toISOString() })
  }

  // 4. YA manifest
  const yaMan = await fetch(
    `${DRIVE_API}/files?q=${encodeURIComponent(`"${ya.id}" in parents and name="manifest.json" and trashed=false`)}&fields=files(id,name)`,
    { headers: authHeaders(token) }
  ).then((r) => r.json())
  if (!yaMan.files?.length) {
    await createMultipart(token, ya.id, { version: '1.0', updatedAt: new Date().toISOString(), year: taxYear })
  }

  // 5. Category folders + manifests
  const categoryFolderIds: Record<string, string> = {}
  for (const catName of CATEGORIES) {
    const catFolder = await findOrCreateFolder(token, catName, [ya.id])
    categoryFolderIds[catName] = catFolder.id

    const manSearch = await fetch(
      `${DRIVE_API}/files?q=${encodeURIComponent(`"${catFolder.id}" in parents and name="manifest.json" and trashed=false`)}&fields=files(id,name)`,
      { headers: authHeaders(token) }
    ).then((r) => r.json())
    if (!manSearch.files?.length) {
      await createMultipart(token, catFolder.id, { version: '1.0', updatedAt: new Date().toISOString(), records: [] })
    }
  }

  return { rootFolderId: root.id, yaFolderId: ya.id, categoryFolderIds }
}

// ── GET: Load records OR setup folders ─────────────────────────────────────

// ── Helper: fetch with Google Drive error detection ───────────────────────────
async function driveFetch(url: string, token: string): Promise<any> {
  const res = await fetch(url, { headers: authHeaders(token) })
  if (!res.ok) {
    let errBody: any = {}
    try { errBody = await res.json() } catch { errBody = { message: await res.text() } }
    const message = errBody?.error?.message || errBody?.message || `Drive API ${res.status}`
    // Return special error object so caller can distinguish auth errors from not-found
    return { _driveError: { status: res.status, message } }
  }
  return res.json()
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')
    const taxYear = parseInt(searchParams.get('taxYear') || '') || new Date().getFullYear()

    // Get Google access token — client sends provider_token via Authorization header
    const authHeader = request.headers.get('Authorization')
    let accessToken: string | null = null

    if (authHeader?.startsWith('Bearer ')) {
      // Client passed provider_token directly (preferred method)
      accessToken = authHeader.slice(7)
    } else {
      // Fallback: get user from session cookie, then try identities table
      const { createServerClient } = require('@supabase/ssr')
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            get: (name: string) => request.cookies.get(name)?.value,
            set: () => {},
            remove: () => {},
          },
        }
      )
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      const { createClient } = require('@supabase/supabase-js')
      const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      )
      const { data: identityData } = await admin
        .from('identities')
        .select('identity_data')
        .eq('user_id', user.id)
        .eq('provider', 'google')
        .single()
      const idData = identityData?.identity_data as Record<string, any> || {}
      accessToken = idData?.access_token || idData?.provider_access_token || null
      if (!accessToken) {
        return NextResponse.json({ error: 'Google access token not found. Please sign out and sign in again.' }, { status: 400 })
      }
    }

    // Handle actions
    if (action === 'folderSetup') {
      const result = await setupFolders(accessToken, taxYear)
      return NextResponse.json({ success: true, ...result })
    }

    if (action === 'storageInfo') {
      const res = await fetch(`${DRIVE_API}/about?fields=storageQuota`, {
        headers: authHeaders(accessToken),
      })
      if (!res.ok) {
        return NextResponse.json({ error: `Drive API ${res.status}` }, { status: 502 })
      }
      const data = await res.json()
      return NextResponse.json({ storageQuota: data.storageQuota })
    }

    // Default: load records (GET /api/drive)
    // List root → YA → category folders → load manifests
    const rootSearch: any = await driveFetch(
      `${DRIVE_API}/files?q=${encodeURIComponent('name="ReliefTrack MY" and mimeType="application/vnd.google-apps.folder" and trashed=false')}&fields=files(id,name)`,
      accessToken
    )
    if (rootSearch._driveError) {
      if (rootSearch._driveError.status === 401) {
        return NextResponse.json({ error: 'Google token expired. Please reconnect Google Drive in Settings.' }, { status: 401 })
      }
      return NextResponse.json({ error: `Drive API error: ${rootSearch._driveError.message}` }, { status: 502 })
    }
    const rootFolder = rootSearch.files?.[0]
    if (!rootFolder) return NextResponse.json({ folders: null, records: [] })

    const yaSearch: any = await driveFetch(
      `${DRIVE_API}/files?q=${encodeURIComponent(`"${rootFolder.id}" in parents and name="YA ${taxYear}" and mimeType="application/vnd.google-apps.folder" and trashed=false`)}&fields=files(id,name)&orderBy=name desc`,
      accessToken
    )
    if (yaSearch._driveError) {
      if (yaSearch._driveError.status === 401) {
        return NextResponse.json({ error: 'Google token expired. Please reconnect Google Drive in Settings.' }, { status: 401 })
      }
      return NextResponse.json({ error: `Drive API error: ${yaSearch._driveError.message}` }, { status: 502 })
    }
    const yaFolder = yaSearch.files?.[0]
    if (!yaFolder) {
      // YA folder doesn't exist — trigger folder setup
      return NextResponse.json({ folders: { rootFolderId: rootFolder.id }, records: [], needsFolderSetup: true, message: `YA ${taxYear} folder not found. Click 'Backup Now' in Settings to create it.` })
    }

    const catRes: any = await driveFetch(
      `${DRIVE_API}/files?q=${encodeURIComponent(`"${yaFolder.id}" in parents and mimeType="application/vnd.google-apps.folder" and trashed=false`)}&fields=files(id,name)`,
      accessToken
    )
    if (catRes._driveError) {
      if (catRes._driveError.status === 401) {
        return NextResponse.json({ error: 'Google token expired. Please reconnect Google Drive in Settings.' }, { status: 401 })
      }
      return NextResponse.json({ error: `Drive API error: ${catRes._driveError.message}` }, { status: 502 })
    }
    const categoryFolders = catRes.files || []

    const manifestFileIds: Record<string, string> = {}
    const categoryFolderIds: Record<string, string> = {}
    const allRecords: any[] = []

    for (const catFolder of categoryFolders) {
      categoryFolderIds[catFolder.name] = catFolder.id
      const manifestRes: any = await driveFetch(
        `${DRIVE_API}/files?q=${encodeURIComponent(`"${catFolder.id}" in parents and name="manifest.json" and trashed=false`)}&fields=files(id,name)`,
        accessToken
      )
      if (manifestRes._driveError) {
        // Log but don't fail the whole request — skip this category
        console.warn(`[Drive GET] manifest search failed for ${catFolder.name}:`, manifestRes._driveError.message)
        continue
      }
      const manifestFile = manifestRes.files?.[0]
      if (!manifestFile) continue
      manifestFileIds[catFolder.name] = manifestFile.id

      const contentRes = await fetch(`${DRIVE_API}/files/${manifestFile.id}?alt=media`, {
        headers: authHeaders(accessToken),
      })
      if (!contentRes.ok) continue
      try {
        const manifest = await contentRes.json()
        if (manifest.records) {
          for (const rec of manifest.records) {
            allRecords.push({ ...rec, _category: catFolder.name })
          }
        }
      } catch {}
    }

    return NextResponse.json({
      folders: { rootFolderId: rootFolder.id, yaFolderId: yaFolder.id, categoryFolders, categoryFolderIds, manifestFileIds },
      records: allRecords,
    })
  } catch (err: any) {
    console.error('[Drive GET] Error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'An unexpected error occurred. Please try again.' }, { status: 500 })
  }
}

// ── POST: Write operations ────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, record, recordId, categoryFolderIds, manifestFileIds } = body

    const authHeader = request.headers.get('Authorization')
    let accessToken: string | null = null

    if (authHeader?.startsWith('Bearer ')) {
      accessToken = authHeader.slice(7)
    } else {
      const { createServerClient } = require('@supabase/ssr')
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            get: (name: string) => request.cookies.get(name)?.value,
            set: () => {},
            remove: () => {},
          },
        }
      )
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      const { createClient } = require('@supabase/supabase-js')
      const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      )
      const { data: identityData } = await admin
        .from('identities')
        .select('identity_data')
        .eq('user_id', user.id)
        .eq('provider', 'google')
        .single()
      const idData = identityData?.identity_data as Record<string, any> || {}
      accessToken = idData?.access_token || idData?.provider_access_token || null
      if (!accessToken) {
        return NextResponse.json({ error: 'Google access token not found' }, { status: 400 })
      }
    }

    if (!['saveRecord', 'updateRecord', 'deleteRecord'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    if (!categoryFolderIds || !manifestFileIds) {
      return NextResponse.json({ error: 'Missing folder/manifest IDs' }, { status: 400 })
    }

    async function loadManifest(category: string): Promise<{ version: string; updatedAt: string; records: any[] } | null> {
      const fileId = manifestFileIds[category]
      if (!fileId) return null
      const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
        headers: authHeaders(accessToken!),
      })
      if (!res.ok) return null
      try {
        return await res.json()
      } catch {
        return null
      }
    }

    let affectedCategory: string | null = null
    let affectedFileId: string | null = null

    if (action === 'saveRecord' && record) {
      affectedCategory = record.category
      affectedFileId = manifestFileIds[affectedCategory]
      if (!affectedFileId) return NextResponse.json({ error: `No manifest for category ${affectedCategory}` }, { status: 400 })

      const manifest = await loadManifest(affectedCategory)
      const records = manifest?.records || []
      records.push({ ...record, id: record.id || `rec_${Date.now()}`, savedAt: new Date().toISOString() })
      await updateMultipartFile(accessToken!, affectedFileId, {
        version: '1.0',
        updatedAt: new Date().toISOString(),
        records,
      })
      console.log('[Drive POST] saveRecord success:', record.id, record.category)
    } else if (action === 'updateRecord' && record) {
      affectedCategory = record.category
      affectedFileId = manifestFileIds[affectedCategory]
      if (!affectedFileId) return NextResponse.json({ error: `No manifest for category ${affectedCategory}` }, { status: 400 })

      const manifest = await loadManifest(affectedCategory)
      if (!manifest) return NextResponse.json({ error: 'Manifest not found' }, { status: 404 })
      const records = manifest.records.map((r: any) =>
        r.id === record.id ? { ...r, ...record, updatedAt: new Date().toISOString() } : r
      )
      await updateMultipartFile(accessToken!, affectedFileId, {
        ...manifest,
        updatedAt: new Date().toISOString(),
        records,
      })
      console.log('[Drive POST] updateRecord success:', record.id)
    } else if (action === 'deleteRecord' && recordId) {
      const categories = Object.keys(categoryFolderIds)
      for (const cat of categories) {
        const fileId = manifestFileIds[cat]
        if (!fileId) continue
        const manifest = await loadManifest(cat)
        if (!manifest) continue
        const idx = manifest.records.findIndex((r: any) => r.id === recordId)
        if (idx !== -1) {
          affectedCategory = cat
          affectedFileId = fileId
          const records = manifest.records.filter((r: any) => r.id !== recordId)
          await updateMultipartFile(accessToken!, fileId, {
            ...manifest,
            updatedAt: new Date().toISOString(),
            records,
          })
          console.log('[Drive POST] deleteRecord success:', recordId)
          break
        }
      }
      if (!affectedCategory) {
        return NextResponse.json({ error: 'Record not found in Drive' }, { status: 404 })
      }
    } else {
      return NextResponse.json({ error: 'Missing record/recordId' }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      action,
      category: affectedCategory,
      updatedAt: new Date().toISOString(),
    })
  } catch (err: any) {
    console.error('[Drive POST] Error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'An unexpected error occurred. Please try again.' }, { status: 500 })
  }
}
