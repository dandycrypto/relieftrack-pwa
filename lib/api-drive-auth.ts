/**
 * lib/api-drive-auth.ts — Shared Google Drive token extraction for API routes.
 *
 * Consolidates the repeated pattern of extracting a Google access token from
 * either the Authorization header or falling back to the user's auth record.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from './api-auth'

export interface DriveAuthResult {
  accessToken: string
}

export interface DriveAuthError {
  response: NextResponse
}

/**
 * Extract Google Drive access token from the request.
 *
 * Strategy:
 * 1. If Authorization header contains a Bearer token, use it directly.
 * 2. Otherwise, authenticate the user via cookies and read the Google
 *    provider token from the user's auth record via the Admin API.
 *
 * Returns either { accessToken } on success or { response } with an
 * appropriate error NextResponse on failure.
 */
export async function extractDriveToken(
  request: NextRequest
): Promise<DriveAuthResult | DriveAuthError> {
  const authHeader = request.headers.get('Authorization')

  if (authHeader?.startsWith('Bearer ')) {
    return { accessToken: authHeader.slice(7) }
  }

  // Fallback: cookie-based auth + provider token from the auth record
  const user = await requireAuth(request)
  if (!user) {
    return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const admin = createAdminClient()
  if (!admin) {
    return { response: NextResponse.json({ error: 'Server configuration error' }, { status: 500 }) }
  }

  // Retrieve the Google provider token from the user's auth record.
  //
  // This MUST use the Admin API, not PostgREST. Identities live in the `auth`
  // schema, which Supabase does not expose to PostgREST (only `public` and
  // `graphql_public` are exposed). The previous `admin.from('identities')`
  // call resolved against `public.identities`, a table that does not exist, so
  // it always returned PGRST205/404 and Drive sync could never get a token.
  let accessToken: string | null = null

  try {
    const adminUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (adminUrl && serviceKey) {
      const res = await fetch(`${adminUrl}/auth/v1/admin/users/${user.id}`, {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
        cache: 'no-store',
      })

      if (res.ok) {
        const record = await res.json()
        const identities: Array<{
          provider?: string
          identity_data?: Record<string, unknown>
        }> = record?.identities ?? []

        const googleIdentity = identities.find((i) => i?.provider === 'google')
        const idData = googleIdentity?.identity_data ?? {}

        accessToken =
          (idData?.access_token as string) ||
          (idData?.provider_access_token as string) ||
          (idData?.provider_token as string) ||
          null
      }
    }
  } catch {
    // Fall through to the error response below.
  }

  if (!accessToken) {
    return {
      response: NextResponse.json(
        {
          error:
            'Google access token not found. Please sign out and sign in again to reconnect Drive.',
        },
        { status: 400 }
      ),
    }
  }

  return { accessToken }
}

/** Type guard: check if the result is an error */
export function isDriveAuthError(
  result: DriveAuthResult | DriveAuthError
): result is DriveAuthError {
  return 'response' in result
}
