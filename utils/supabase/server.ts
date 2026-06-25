/**
 * utils/supabase/server.ts
 * Server-side Supabase client for Next.js App Router
 * Used in: layouts, pages, API routes (server components)
 *
 * Handles: session from cookies, middleware refresh
 */

import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function createSupabaseServerClient() {
  const cookieStore = cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options })
          } catch {
            // Called from Server Component — cookies set via middleware
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options })
          } catch {
            // Called from Server Component — cookies handled via middleware
          }
        },
      },
    }
  )
}

/**
 * Get authenticated user from server session
 * Use in Server Components and API Route handlers
 */
export async function getAuthenticatedUser() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}
