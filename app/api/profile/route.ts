import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import { requireAuth } from '@/lib/api-auth'

const PROFILE_DIR = '/tmp/relieftrack-profiles'

function profilePath(userId: string): string {
  // Sanitize userId to prevent path traversal
  const safe = userId.replace(/[^a-zA-Z0-9_-]/g, '')
  if (!safe) throw new Error('Invalid user id')
  return `${PROFILE_DIR}/${safe}.json`
}

export async function POST(request: NextRequest) {
  // Auth check
  const user = await requireAuth(request)
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { profile } = body

    if (!profile || typeof profile !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Invalid payload: missing or invalid profile object.' },
        { status: 400 }
      )
    }

    if (!fs.existsSync(PROFILE_DIR)) {
      fs.mkdirSync(PROFILE_DIR, { recursive: true })
    }
    fs.writeFileSync(profilePath(user.id), JSON.stringify(profile, null, 2), 'utf-8')

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error('[Profile API] Error:', err instanceof Error ? err.message : err)
    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    )
  }
}
