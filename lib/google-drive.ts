/**
 * lib/google-drive.ts
 * Google Drive API v3 utilities for ReliefTrack.
 * ALL these functions run CLIENT-SIDE only (browser).
 * They use the Google access token from Supabase's in-memory session.
 */

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
const SCOPES = 'email https://www.googleapis.com/auth/drive.file'

export interface DriveFolderResult {
  rootFolderId: string
  yaFolderId: string
  categoryFolderIds: Record<string, string>
}

// LHDN-readable numbered category folder names (for auditors without app access)
// Format: {##}_{LHDN-name} — mirrors BE form section order
export const LHDN_FOLDER_NAMES: Record<string, string> = {
  individual:          '01_Individual_Dependent',
  medical_self:        '02_Medical_Self_Spouse_Child',
  parents_medical:     '03_Medical_Parents',
  disabled:            '04_Disabled_Individual',
  disabled_equipment:  '05_Disabled_Equipment',
  spouse:              '06_Spouse_Alimony',
  children_under18:    '07_Children_Under18',
  children_education:  '08_Children_Higher_Education',
  education_self:      '09_Education_Self',
  lifestyle:           '10_Lifestyle',
  epf_insurance:       '11_EPF_Insurance_Takaful',
  housing_loan:        '12_First_Home_Loan_Interest',
}

const CATEGORIES = Object.keys(LHDN_FOLDER_NAMES)

function authHeaders(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
}

async function createMultipart(
  accessToken: string,
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
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: flat,
  })
  if (!res.ok) throw new Error(`manifest upload failed: ${res.status}`)
}

/** Find or create the ReliefTrack MY root folder */
export async function findOrCreateRootFolder(accessToken: string): Promise<string> {
  const q = encodeURIComponent('name="ReliefTrack MY" and mimeType="application/vnd.google-apps.folder" and trashed=false')
  const search = await fetch(`${DRIVE_API}/files?q=${q}&fields=files(id,name)`, {
    headers: authHeaders(accessToken),
  }).then((r) => r.json())

  if (search.files?.length) return search.files[0].id

  const created = await fetch(`${DRIVE_API}/files?fields=id,name,mimeType`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ name: 'ReliefTrack MY', mimeType: 'application/vnd.google-apps.folder' }),
  }).then((r) => r.json())
  return created.id
}

/** Find or create YA folder under root */
export async function findOrCreateYAFolder(accessToken: string, rootId: string, taxYear: number): Promise<string> {
  const q = encodeURIComponent(`"${rootId}" in parents and name="YA ${taxYear}" and mimeType="application/vnd.google-apps.folder" and trashed=false`)
  const search = await fetch(`${DRIVE_API}/files?q=${q}&fields=files(id,name)`, {
    headers: authHeaders(accessToken),
  }).then((r) => r.json())

  if (search.files?.length) return search.files[0].id

  const created = await fetch(`${DRIVE_API}/files?fields=id,name,mimeType`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ name: `YA ${taxYear}`, mimeType: 'application/vnd.google-apps.folder', parents: [rootId] }),
  }).then((r) => r.json())
  return created.id
}

/** Full folder structure setup — returns folder IDs */
export async function setupDriveFolderStructure(
  accessToken: string,
  taxYear: number = new Date().getFullYear()
): Promise<DriveFolderResult> {
  // 1. Root
  const rootId = await findOrCreateRootFolder(accessToken)

  // 2. YA folder
  const yaId = await findOrCreateYAFolder(accessToken, rootId, taxYear)

  // 3. Root manifest
  const rootManSearch = await fetch(
    `${DRIVE_API}/files?q=${encodeURIComponent(`"${rootId}" in parents and name="manifest.json" and trashed=false`)}&fields=files(id,name)`,
    { headers: authHeaders(accessToken) }
  ).then((r) => r.json())
  if (!rootManSearch.files?.length) {
    await createMultipart(accessToken, rootId, { version: '1.0', updatedAt: new Date().toISOString() })
  }

  // 4. YA manifest
  const yaManSearch = await fetch(
    `${DRIVE_API}/files?q=${encodeURIComponent(`"${yaId}" in parents and name="manifest.json" and trashed=false`)}&fields=files(id,name)`,
    { headers: authHeaders(accessToken) }
  ).then((r) => r.json())
  if (!yaManSearch.files?.length) {
    await createMultipart(accessToken, yaId, { version: '1.0', updatedAt: new Date().toISOString(), year: taxYear })
  }

  // 5. Category folders + manifests (using LHDN-readable numbered names)
  const categoryFolderIds: Record<string, string> = {}
  for (const catId of CATEGORIES) {
    const folderName = LHDN_FOLDER_NAMES[catId] ?? catId
    const catSearch = await fetch(
      `${DRIVE_API}/files?q=${encodeURIComponent(`"${yaId}" in parents and name="${folderName}" and mimeType="application/vnd.google-apps.folder" and trashed=false`)}&fields=files(id,name)`,
      { headers: authHeaders(accessToken) }
    ).then((r) => r.json())

    let catFolderId: string
    if (catSearch.files?.length) {
      catFolderId = catSearch.files[0].id
    } else {
      const created = await fetch(`${DRIVE_API}/files?fields=id,name,mimeType`, {
        method: 'POST',
        headers: authHeaders(accessToken),
        body: JSON.stringify({ name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [yaId] }),
      }).then((r) => r.json())
      catFolderId = created.id
    }
    categoryFolderIds[catId] = catFolderId

    const manSearch = await fetch(
      `${DRIVE_API}/files?q=${encodeURIComponent(`"${catFolderId}" in parents and name="manifest.json" and trashed=false`)}&fields=files(id,name)`,
      { headers: authHeaders(accessToken) }
    ).then((r) => r.json())
    if (!manSearch.files?.length) {
      await createMultipart(accessToken, catFolderId, { version: '1.0', updatedAt: new Date().toISOString(), records: [] })
    }
  }

  return { rootFolderId: rootId, yaFolderId: yaId, categoryFolderIds }
}

/** Load all records from all category manifests */
export async function loadAllDriveRecords(accessToken: string): Promise<{ folders: any; records: any[] }> {
  const rootId = await findOrCreateRootFolder(accessToken)
  const taxYear = new Date().getFullYear()
  const yaId = await findOrCreateYAFolder(accessToken, rootId, taxYear)

  // List category folders
  const catRes = await fetch(
    `${DRIVE_API}/files?q=${encodeURIComponent(`"${yaId}" in parents and mimeType="application/vnd.google-apps.folder" and trashed=false`)}&fields=files(id,name)`,
    { headers: authHeaders(accessToken) }
  ).then((r) => r.json())
  const categoryFolders = catRes.files || []

  const manifestFileIds: Record<string, string> = {}
  const allRecords: any[] = []

  for (const catFolder of categoryFolders) {
    manifestFileIds[catFolder.name] = catFolder.id
    const manifestRes = await fetch(
      `${DRIVE_API}/files?q=${encodeURIComponent(`"${catFolder.id}" in parents and name="manifest.json" and trashed=false`)}&fields=files(id,name)`,
      { headers: authHeaders(accessToken) }
    ).then((r) => r.json())
    const manifestFile = manifestRes.files?.[0]
    if (!manifestFile) continue

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

  return {
    folders: { rootFolderId: rootId, yaFolderId: yaId, categoryFolderIds: manifestFileIds },
    records: allRecords,
  }
}

/** Save a manifest.json for a given category folder */
export async function saveCategoryManifest(
  accessToken: string,
  categoryFolderId: string,
  records: any[]
): Promise<void> {
  // Check if manifest exists
  const search = await fetch(
    `${DRIVE_API}/files?q=${encodeURIComponent(`"${categoryFolderId}" in parents and name="manifest.json" and trashed=false`)}&fields=files(id,name)`,
    { headers: authHeaders(accessToken) }
  ).then((r) => r.json())

  const manifest = { version: '1.0', updatedAt: new Date().toISOString(), records }

  if (search.files?.length) {
    // PATCH existing file content (no metadata change needed)
    const fileId = search.files[0].id
    const content = new TextEncoder().encode(JSON.stringify(manifest, null, 2))
    const res = await fetch(`${DRIVE_UPLOAD}/files/${fileId}?uploadType=media`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: content,
    })
    if (!res.ok) throw new Error(`manifest update failed: ${res.status}`)
  } else {
    await createMultipart(accessToken, categoryFolderId, manifest)
  }
}

/** Upload a receipt file using LHDN-coded filename convention
 *  Format: YYYY-MM-DD_Merchant_D7_RM850[_SubCat].ext
 */
export async function uploadReceiptFile(
  accessToken: string,
  folderId: string,
  file: File,
  date: string,
  merchant: string,
  amount: number,
  beCode?: string,
  subCat?: string
): Promise<string> {
  const ext = file.name.split('.').pop() || 'jpg'
  const safeDate = date.replace(/\//g, '-').slice(0, 10)
  const safeMerchant = merchant.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20) || 'Receipt'
  const amtStr = `RM${Math.round(amount)}`
  const parts = [safeDate, safeMerchant, beCode || '', amtStr, subCat ? subCat.replace(/[^a-zA-Z0-9]/g, '') : ''].filter(Boolean)
  const fileName = `${parts.join('_')}.${ext}`

  const boundary = `boundary_${Date.now()}`
  const metadataBytes = new TextEncoder().encode(
    JSON.stringify({ name: fileName, mimeType: file.type, parents: [folderId] })
  )
  const fileBytes = await file.arrayBuffer()

  const parts: Uint8Array[] = []
  parts.push(new TextEncoder().encode(`--${boundary}\r\nContent-Type: application/json\r\n\r\n`))
  parts.push(metadataBytes)
  parts.push(new TextEncoder().encode(`\r\n--${boundary}\r\nContent-Type: ${file.type}\r\n\r\n`))
  parts.push(new Uint8Array(fileBytes))
  parts.push(new TextEncoder().encode(`\r\n--${boundary}--`))

  const flat = new Uint8Array(parts.reduce((s, b) => s + b.length, 0))
  let offset = 0
  for (const p of parts) { flat.set(p, offset); offset += p.length }

  const res = await fetch(`${DRIVE_UPLOAD}/files?uploadType=multipart`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: flat,
  })
  if (!res.ok) throw new Error(`file upload failed: ${res.status}`)
  const data = await res.json()
  return data.id
}
