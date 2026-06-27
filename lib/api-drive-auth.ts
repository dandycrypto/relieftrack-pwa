/**
 * lib/api-drive-auth.ts — Shared Google Drive token extraction for API routes.
 *
 * Consolidates the repeated pattern of extracting a Google access token from
 * either the Authorization header or falling back to the identities table.
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
 * 2. Otherwise, authenticate the user via cookies and look up the Google
 *    identity's access token from the identities table (service role).
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

  // Fallback: cookie-based auth + identities table lookup
  const user = await requireAuth(request)
  if (!user) {
    return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const admin = createAdminClient()
  if (!admin) {
    return { response: NextResponse.json({ error: 'Server configuration error' }, { status: 500 }) }
  }

  const { data: identityData } = await admin
    .from('identities')
    .select('identity_data')
    .eq('user_id', user.id)
    .eq('provider', 'google')
    .single()

  const idData = (identityData?.identity_data as Record<string, unknown>) || {}
  const accessToken =
    (idData?.access_token as string) ||
    (idData?.provider_access_token as string) ||
    null

  if (!accessToken) {
    return {
      response: NextResponse.json(
        { error: 'Google access token not found. Please sign out and sign in again.' },
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
