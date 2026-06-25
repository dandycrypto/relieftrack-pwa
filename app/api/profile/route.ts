import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'

const PROFILE_FILE = '/tmp/relieftack-profile.json'

// ── Auth helper (mirrors /api/drive pattern) ─────────────────────────────────
async function requireAuth(request: NextRequest) {
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
  if (authError || !user) return null
  return user
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

    fs.writeFileSync(PROFILE_FILE, JSON.stringify(profile, null, 2), 'utf-8')

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error('[Profile API] Error:', err instanceof Error ? err.message : err)
    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    )
  }
}
