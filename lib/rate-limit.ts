/**
 * lib/rate-limit.ts — In-memory sliding-window rate limiter for API routes.
 *
 * Per-server-instance only (a plain Map, not a shared store like Redis) —
 * fine for a single-instance/single-region deployment, but resets on
 * restart/redeploy and doesn't coordinate across multiple instances. If this
 * app scales to multiple server instances, replace with a shared store
 * (e.g. Upstash Redis) using the same isRateLimited(key, max, windowMs)
 * interface.
 */

const buckets = new Map<string, number[]>()

/**
 * Returns true if `key` has already made `maxRequests` or more requests
 * within the trailing `windowMs`, and records this call as a request if not.
 */
export function isRateLimited(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now()
  const recent = (buckets.get(key) ?? []).filter((t) => now - t < windowMs)

  if (recent.length >= maxRequests) {
    buckets.set(key, recent)
    return true
  }

  recent.push(now)
  buckets.set(key, recent)
  return false
}

/** Best-effort client IP from standard proxy headers. */
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) return forwardedFor.split(',')[0].trim()
  return request.headers.get('x-real-ip') ?? 'unknown'
}
