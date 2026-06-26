import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 30

// ─── Demo Account Guard ──────────────────────────────────────────────────────
// Demo mode: restrict to 5 hardcoded prompts + 5 messages per session.
// Demo users have no real Supabase account — they come from ?demo=true URL.
// We identify them via the isDemo flag in the request body.

const DEMO_ALLOWED_PROMPTS = [
  'what relief am i missing',
  'how much tax will i owe',
  'explain lifestyle relief',
  'when is the filing deadline',
  'show me my relief summary',
  'what is individual relief',
  'how do i claim medical expenses',
  'what documents do i need',
]

const DEMO_MAX_MESSAGES = 5

function isDemoUser(context: Record<string, unknown>): boolean {
  // isDemo flag comes from the client (useDemoStore.isDemoMode)
  return context?.isDemo === true
}

function normalizePrompt(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim()
}

function isPromptAllowed(text: string): boolean {
  const normalized = normalizePrompt(text)
  return DEMO_ALLOWED_PROMPTS.some(
    (allowed) => normalized.includes(allowed) || allowed.includes(normalized)
  )
}

// In-memory session counter for demo users.
// Key: simple session id passed from client (cookie or generated).
// Production would use Redis or the DB.
const demoSessionMessages = new Map<string, number>()

function getDemoRemaining(sessionId: string): number {
  const used = demoSessionMessages.get(sessionId) ?? 0
  return Math.max(0, DEMO_MAX_MESSAGES - used)
}

function consumeDemoMessage(sessionId: string): boolean {
  const used = demoSessionMessages.get(sessionId) ?? 0
  if (used >= DEMO_MAX_MESSAGES) return false
  demoSessionMessages.set(sessionId, used + 1)
  return true
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface TaxContext {
  taxYear: string
  grossIncome: number
  totalClaimed: number
  totalPossible: number
  estimatedSavings: number
  reliefTotals: Record<string, number>
  profileName: string
  maritalStatus: string
  childrenUnder18: number
  childrenEducation: number
  hasParents: boolean
  isFirstHomeOwner: boolean
  recordCount: number
  pcbPaid?: number
  chargeableIncome?: number
  isDemo?: boolean
  demoSessionId?: string
}

// ─── System Prompt Builder ────────────────────────────────────────────────────

function buildSystemPrompt(ctx: TaxContext): string {
  const utilized = ctx.totalPossible > 0 ? Math.round((ctx.totalClaimed / ctx.totalPossible) * 100) : 0
  const reliefSummary = Object.entries(ctx.reliefTotals)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `  - ${k}: RM ${v.toLocaleString()}`)
    .join('\n')

  return `You are a friendly Malaysian income tax assistant for the ReliefTrack MY app. You help users maximise their LHDN YA ${ctx.taxYear} personal tax reliefs and save money on taxes.

User's current financial profile:
- Name: ${ctx.profileName}
- Marital status: ${ctx.maritalStatus}
- Children under 18: ${ctx.childrenUnder18}
- Children in higher education: ${ctx.childrenEducation}
- Has dependent parents: ${ctx.hasParents ? 'Yes' : 'No'}
- First home owner: ${ctx.isFirstHomeOwner ? 'Yes' : 'No'}
- Annual gross income: RM ${ctx.grossIncome.toLocaleString()}
- Chargeable income: RM ${(ctx.chargeableIncome || 0).toLocaleString()}
- PCB paid (monthly tax): RM ${(ctx.pcbPaid || 0).toLocaleString()}
- Total records: ${ctx.recordCount}

Current tax relief claimed for YA ${ctx.taxYear}:
- Total claimed: RM ${ctx.totalClaimed.toLocaleString()} of RM ${ctx.totalPossible.toLocaleString()} possible (${utilized}% utilized)
- Estimated tax savings: RM ${ctx.estimatedSavings.toLocaleString()}

Relief breakdown (claimed amounts):
${reliefSummary || '  (none claimed yet)'}

LHDN YA 2025 Relief Limits (for reference):
- Individual & Dependents: RM 9,000 (automatic)
- Medical Self/Spouse/Children: RM 10,000 (serious disease, fertility, vaccination, dental)
- Parents Medical & Carer: RM 8,000
- Disabled Individual: RM 7,000
- Disabled Equipment: RM 6,000
- Spouse Relief: RM 4,000 (non-working spouse)
- Children under 18: RM 2,000 per child
- Children Higher Education: RM 8,000 per child
- Education Self (Degree/Masters/Professional): RM 7,000
- Lifestyle (books, PC, smartphone, internet, sports): RM 3,500
- EPF/Life Insurance/Takaful: RM 14,350 total (EPF max RM 4,000)
- First Home Housing Loan Interest: RM 7,000

Important rules:
- Filing deadline: April 30 each year (BE form for salaried employees)
- Always give amounts in Malaysian Ringgit (RM)
- Be concise and practical — give specific, actionable advice
- If the user asks what relief they're missing, compare claimed amounts against limits and profile
- Do not provide legal advice; recommend consulting a licensed tax agent for complex cases
- Keep responses under 250 words unless a detailed breakdown is requested`
}

const PARSE_SYSTEM = `You are a Malaysian tax record parser. The user describes an expense in natural language. Extract: date (YYYY-MM-DD, default today if not given), merchant name, amount (number, RM), category (one of: individual, medical_self, parents_medical, education_self, lifestyle, epf_insurance, housing_loan, children_under18, children_education, disabled, disabled_equipment, spouse, private_pension, socso, zakat), description (brief).
Reply ONLY with valid JSON, no markdown: {"date":"YYYY-MM-DD","merchant":"...","amount":0,"category":"...","description":"..."}
Category hints: dental/medical/clinic → medical_self; mum/parents → parents_medical; books/laptop/internet/sports → lifestyle; insurance/EPF → epf_insurance; university/course → education_self; children → children_under18.`

// ─── MiniMax API Call ────────────────────────────────────────────────────────

async function callMiniMax(
  system: string,
  messages: ChatMessage[],
  model = 'abab6.5s-chat'
): Promise<string> {
  const apiKey = process.env.MINIMAX_API_KEY
  const baseUrl = process.env.MINIMAX_BASE_URL ?? 'https://api.minimax.io/v1'

  if (!apiKey || apiKey === '***') {
    throw new Error('MINIMAX_API_KEY not configured')
  }

  const url = `${baseUrl}/chat/completions`
  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: system },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ],
    max_tokens: 1024,
    temperature: 0.7,
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`MiniMax API error ${res.status}: ${err}`)
  }

  const data = await res.json()
  // OpenAI-compatible response shape
  return (
    data.choices?.[0]?.message?.content ||
    data.choices?.[0]?.text ||
    'Sorry, I could not generate a response. Please try again.'
  )
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: {
    messages: ChatMessage[]
    context: TaxContext
    parseMode?: boolean
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { messages, context, parseMode } = body

  // ── Demo Guard ───────────────────────────────────────────────────────────
  if (isDemoUser(context as Record<string, unknown>)) {
    const sessionId = context.demoSessionId ?? 'demo-default'
    const lastUserMsg = messages?.[messages.length - 1]?.content ?? ''

    // Check prompt allowlist
    if (!isPromptAllowed(lastUserMsg)) {
      return NextResponse.json(
        {
          error:
            'Demo mode: only certain questions are allowed. Try asking about your relief summary, filing deadline, or tax estimate.',
          demoBlocked: true,
          remaining: getDemoRemaining(sessionId),
        },
        { status: 403 }
      )
    }

    // Check message count
    if (!consumeDemoMessage(sessionId)) {
      return NextResponse.json(
        {
          error:
            'Demo session limit reached (5 messages). Sign up for a free account to unlock unlimited AI assistance.',
          demoLimitReached: true,
          remaining: 0,
        },
        { status: 429 }
      )
    }

    // Attach remaining count for the UI
    const remaining = getDemoRemaining(sessionId)
    ;(context as Record<string, unknown>).demoRemaining = remaining
  }

  // ── Parse mode: natural-language → structured record ─────────────────────
  if (parseMode) {
    const userText = messages?.[0]?.content || ''
    const today =
      (context as unknown as Record<string, string>)?.today ||
      new Date().toISOString().slice(0, 10)
    try {
      const reply = await callMiniMax(
        PARSE_SYSTEM,
        [{ role: 'user', content: `Today is ${today}. Parse: "${userText}"` }],
        'abab6.5s-chat'
      )
      const match = reply.match(/\{[\s\S]*\}/)
      if (!match) return NextResponse.json({ error: 'Parse failed' }, { status: 422 })
      const parsed = JSON.parse(match[0])
      return NextResponse.json({ parsed })
    } catch (err) {
      console.error('NLP parse error:', err)
      return NextResponse.json({ error: 'Parse error' }, { status: 500 })
    }
  }

  if (!messages?.length || !context) {
    return NextResponse.json({ error: 'Missing messages or context' }, { status: 400 })
  }

  // Keep last 12 messages to avoid token overrun
  const recentMessages = messages.slice(-12)

  try {
    const reply = await callMiniMax(buildSystemPrompt(context), recentMessages)
    return NextResponse.json({ reply })
  } catch (err) {
    console.error('ai-chat error:', err)
    return NextResponse.json({ error: 'AI service error' }, { status: 502 })
  }
}
