/**
 * utils/supabase/client.ts
 * Browser/client-side Supabase client for Next.js App Router
 * Used in: React components, hooks, event handlers
 *
 * Creates a new client per request (no singleton in browser!)
 */

import { createBrowserClient } from '@supabase/ssr'

/**
 * Shared cookie options for the browser auth client.
 *
 * WHY THIS MATTERS — OAuth login was failing with `pkce_code_verifier_not_found`.
 *
 * On `signInWithOAuth` the client stores a PKCE code verifier in a cookie
 * (`sb-<ref>-auth-token-code-verifier`). After Google authenticates the user it
 * redirects back to `/auth/callback`, and the server reads that cookie to
 * exchange the code for a session.
 *
 * @supabase/ssr defaults cookies to `sameSite: "lax"`. A redirect arriving from
 * `accounts.google.com` is a cross-site navigation, so the browser refuses to
 * send a Lax cookie on it. The verifier never reached the server, the exchange
 * failed with `pkce_code_verifier_not_found`, and the user was bounced to
 * /login?error=auth_failed — while Supabase itself recorded a successful
 * sign-in, which is why the failure looked so contradictory in the logs.
 *
 * `sameSite: "none"` is required for the cookie to survive that cross-site
 * return. Browsers mandate that SameSite=None cookies also be Secure, which is
 * always true here since the app is served over HTTPS.
 */
const AUTH_COOKIE_OPTIONS = {
  sameSite: 'none' as const,
  secure: true,
  path: '/',
}

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: AUTH_COOKIE_OPTIONS,
    }
  )
}
