/**
 * middleware.ts
 * Supabase session refresh middleware
 * Runs on every request to keep auth session fresh
 *
 * Next.js App Router: place at project root (same level as package.json)
 */

import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // A single response instance is created once and reused below. Previously
  // this handler built a brand-new NextResponse inside every cookie mutation,
  // which discarded any cookies already set on the earlier response object.
  // Supabase writes several cookies when it refreshes a session (access token,
  // refresh token, chunked variants), so rebuilding the response silently
  // dropped all but the last — causing intermittent "logged out" states.
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  // Create Supabase server client
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          // Keep the request view in sync so downstream server components see it
          request.cookies.set({ name, value, ...options })
          // Set on the SAME response so previously-set cookies survive
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options })
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  // Refresh session if expired — this also updates the auth cookies
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // ── Auth gate ─────────────────────────────────────────────────────────────
  // Routes that require a signed-in user. Demo mode (?demo=true) is a
  // deliberate, non-persisted showcase and stays reachable without an account.
  const path = request.nextUrl.pathname
  const isDemo = request.nextUrl.searchParams.get('demo') === 'true'
  const isProtected = path === '/dashboard' || path === '/profile'

  if (isProtected && !user && !isDemo) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    // Preserve where the user was heading so they can be returned post-login.
    if (path !== '/dashboard') url.searchParams.set('next', path)

    // Build the redirect on top of `response` so any cookies Supabase just
    // refreshed during getUser() are carried over rather than dropped.
    const redirect = NextResponse.redirect(url)
    response.cookies.getAll().forEach((cookie) => {
      redirect.cookies.set(cookie)
    })
    return redirect
  }

  return response
}

// Configure which routes the middleware runs on
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (favicon)
     * - public folder
     * - api routes that don't need auth
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
