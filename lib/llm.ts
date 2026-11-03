/**
 * lib/llm.ts — Shared OpenAI-compatible chat client for ReliefTrack.
 *
 * WHY THIS REPLACED lib/minimax.ts
 *
 * The previous implementation hard-coded MiniMax. That provider is no longer
 * usable here:
 *   - its configured model (abab6.5s-chat) was retired upstream (HTTP 404
 *     "no longer available"), and
 *   - every model the key still lists returns HTTP 402 "insufficient balance".
 *
 * The result was the AI assistant failing for every user, surfacing in the UI
 * as a generic network error.
 *
 * This client talks to any OpenAI-compatible `/chat/completions` endpoint and
 * is configured entirely by environment variables, so a provider outage is a
 * config change rather than a code change. It deliberately keeps the same
 * call signature and error type as the old module so existing callers and the
 * OCR field extractor continue to work untouched.
 *
 * Configuration (first provider with a key wins):
 *   LLM_BASE_URL / LLM_API_KEY / LLM_MODEL
 *   MINIMAX_BASE_URL / MINIMAX_API_KEY / MINIMAX_MODEL   (legacy names)
 */

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export class LLMError extends Error {}

/** Backwards-compatible alias so older imports keep type-checking. */
export { LLMError as MiniMaxError }

/**
 * Daily call budget for the shared relay.
 *
 * The relay key is shared with protocol90-meals. That service caps itself at
 * 40/day internally, but the relay has no per-consumer accounting and exposes
 * no balance endpoint, so ReliefTrack's calls spend the same upstream balance
 * while being invisible to that cap. Without a budget here, a busy ReliefTrack
 * silently starves protocol90 of its allowance.
 *
 * Process-local, like protocol90's own counter. If this app is ever run with
 * more than one worker, this must move to a shared store.
 */
const DAILY_CAP = (() => {
  const raw = process.env.LLM_DAILY_CAP
  if (raw === undefined || raw === '') return 200
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) ? n : 200
})()

let budgetDay = ''
let budgetUsed = 0

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function budgetRemaining(): number {
  if (DAILY_CAP <= 0) return Number.MAX_SAFE_INTEGER
  if (budgetDay !== today()) {
    budgetDay = today()
    budgetUsed = 0
  }
  return Math.max(0, DAILY_CAP - budgetUsed)
}

function consumeBudget(): void {
  if (budgetDay !== today()) {
    budgetDay = today()
    budgetUsed = 0
  }
  budgetUsed += 1
}

export function llmBudgetStats(): { cap: number; used: number; remaining: number } {
  return { cap: DAILY_CAP, used: budgetUsed, remaining: budgetRemaining() }
}

interface Provider {
  name: string
  baseUrl: string
  apiKey: string
  model: string
}

function resolveProvider(): Provider {
  const baseUrl = process.env.LLM_BASE_URL ?? process.env.MINIMAX_BASE_URL
  const apiKey = process.env.LLM_API_KEY ?? process.env.MINIMAX_API_KEY
  const model = process.env.LLM_MODEL ?? process.env.MINIMAX_MODEL

  const usableKey = apiKey && apiKey !== '***' ? apiKey : undefined

  if (!baseUrl || !usableKey) {
    throw new LLMError(
      'LLM not configured: set LLM_BASE_URL, LLM_API_KEY and LLM_MODEL'
    )
  }

  return {
    name: process.env.LLM_PROVIDER_NAME ?? 'openai-compatible',
    baseUrl: baseUrl.replace(/\/+$/, ''),
    apiKey: usableKey,
    // A model is required by every OpenAI-compatible endpoint. Falling back to
    // a wrong guess is worse than failing loudly, so default only if unset.
    model: model ?? 'deepseek-v4.1-flash',
  }
}

/**
 * Calls an OpenAI-compatible chat completions endpoint.
 * Throws LLMError if unconfigured or every attempt fails.
 *
 * Retries across a small set of candidate models: some relays reject a model id
 * with 404 while serving others, and a stale env value shouldn't take the whole
 * feature down.
 */
export async function callLLM(
  system: string,
  messages: LLMMessage[],
  opts?: { model?: string; maxTokens?: number; temperature?: number }
): Promise<string> {
  const provider = resolveProvider()

  if (budgetRemaining() <= 0) {
    throw new LLMError(
      `Daily LLM budget exhausted (${DAILY_CAP} calls). This cap protects the ` +
        `shared relay balance used by protocol90-meals; it resets at midnight UTC.`
    )
  }

  const candidates = Array.from(
    new Set(
      [
        opts?.model,
        provider.model,
        'deepseek-v4.1-flash',
        'gemini-3.8-flash',
      ].filter(Boolean) as string[]
    )
  )

  const url = `${provider.baseUrl}/chat/completions`
  let lastErr = ''

  for (const candidate of candidates) {
    const body: Record<string, unknown> = {
      model: candidate,
      messages: [{ role: 'system', content: system }, ...messages],
      max_tokens: opts?.maxTokens ?? 1024,
      temperature: opts?.temperature ?? 0.7,
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${provider.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        // Without a timeout a stalled upstream hangs the route until the
        // platform kills it, which the client sees as a bare network error.
        signal: AbortSignal.timeout(25_000),
      })

      consumeBudget()
      if (res.ok) {
        const data = await res.json()
        const reply = data?.choices?.[0]?.message?.content
        if (typeof reply === 'string' && reply.trim()) return reply
        lastErr = `${res.status}: empty completion`
      } else {
        lastErr = `${res.status}: ${await res.text()}`
      }
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err)
    }

    // Only model-availability failures are worth retrying with another id;
    // auth or billing errors will fail identically for every candidate.
    const retryable =
      lastErr.includes('404') ||
      lastErr.includes('no longer available') ||
      lastErr.includes('unknown model') ||
      lastErr.includes('2013')
    if (!retryable) break
  }

  throw new LLMError(`LLM API error: ${lastErr}`)
}

/** Backwards-compatible alias for the previous function name. */
export const callMiniMax = callLLM
