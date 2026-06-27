/**
 * lib/api-auth.ts — Shared authentication helpers for API routes.
 *
 * Consolidates the repeated pattern of creating a Supabase server client
 * from request cookies and extracting the authenticated user.
 */

import { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

/**
 * Create a Supabase server client scoped to the current request's cookies.
 * Read-only cookie adapter (appropriate for API route handlers).
 */
export function createRequestClient(request: NextRequest) {
  return createServerClient(
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
}

/**
 * Get the authenticated user from the request, or null if unauthenticated.
 * Use in API route handlers that require auth.
 */
export async function requireAuth(request: NextRequest) {
  const supabase = createRequestClient(request)
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return user
}

/**
 * Create a Supabase admin client (service role, bypasses RLS).
 * Returns null if the service role key is not configured.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
