/**
 * lib/minimax.ts — Shared MiniMax chat-completion client.
 *
 * Extracted from app/api/ai-chat/route.ts so other server routes (e.g. OCR
 * field extraction) can call the same LLM without duplicating the
 * request/fallback logic.
 */

export interface MiniMaxMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export class MiniMaxError extends Error {}

/**
 * Calls MiniMax's OpenAI-compatible chat completions endpoint.
 * Tries `model` (or MINIMAX_MODEL env var) first, then falls back to known
 * MiniMax model ids if the requested one is unrecognised.
 * Throws MiniMaxError if the API key is missing or every candidate fails.
 */
export async function callMiniMax(
  system: string,
  messages: MiniMaxMessage[],
  opts?: { model?: string; maxTokens?: number; temperature?: number }
): Promise<string> {
  const apiKey = process.env.MINIMAX_API_KEY
  const baseUrl = process.env.MINIMAX_BASE_URL ?? 'https://api.minimax.io/v1'

  if (!apiKey || apiKey === '***') {
    throw new MiniMaxError('MINIMAX_API_KEY not configured')
  }

  const candidates = [opts?.model ?? process.env.MINIMAX_MODEL, 'MiniMax-Text-01', 'abab7-chat'].filter(
    Boolean
  ) as string[]

  const url = `${baseUrl}/chat/completions`
  let lastErr = ''
  for (const candidate of candidates) {
    const body: Record<string, unknown> = {
      model: candidate,
      messages: [{ role: 'system', content: system }, ...messages],
      max_tokens: opts?.maxTokens ?? 1024,
      temperature: opts?.temperature ?? 0.7,
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (res.ok) {
      const data = await res.json()
      const reply = data?.choices?.[0]?.message?.content
      if (reply) return reply
    }
    lastErr = `${res.status}: ${await res.text()}`
    if (!lastErr.includes('unknown model') && !lastErr.includes('2013')) break
  }
  throw new MiniMaxError(`MiniMax API error ${lastErr}`)
}
