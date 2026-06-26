import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 30

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
}

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

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'AI assistant not configured' }, { status: 503 })
  }

  let body: { messages: ChatMessage[]; context: TaxContext; parseMode?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { messages, context, parseMode } = body

  // ── Parse mode: natural-language → structured record ──────────────────────
  if (parseMode) {
    const userText = messages?.[0]?.content || ''
    const today = (context as unknown as Record<string, string>)?.today || new Date().toISOString().slice(0, 10)
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 200,
          system: PARSE_SYSTEM,
          messages: [{ role: 'user', content: `Today is ${today}. Parse: "${userText}"` }],
        }),
      })
      if (!res.ok) return NextResponse.json({ error: 'AI error' }, { status: 502 })
      const data = await res.json()
      const text = (data.content?.[0]?.text || '').trim()
      const match = text.match(/\{[\s\S]*\}/)
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
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: buildSystemPrompt(context),
        messages: recentMessages,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('Anthropic API error:', res.status, err)
      return NextResponse.json({ error: 'AI service error' }, { status: 502 })
    }

    const data = await res.json()
    const reply = data.content?.[0]?.text || 'Sorry, I could not generate a response. Please try again.'

    return NextResponse.json({ reply })
  } catch (err) {
    console.error('ai-chat error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
