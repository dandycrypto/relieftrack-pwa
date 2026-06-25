/**
 * Relevance Filter — determines LHDN claimability of a transaction
 * Green: likely qualifies, auto-categorise and pre-approve
 * Amber: review needed — may qualify but needs user confirmation
 * Red:   hard-exclude — definitely not claimable
 */

export type RelevanceConfidence = 'green' | 'amber' | 'red'

export interface RelevanceResult {
  relevant: boolean
  confidence: RelevanceConfidence
  suggestedCategory: string | null
  reason: string
}

export interface FilteredTransaction {
  date: string
  merchant: string
  description: string
  amount: number
  rawRow: string
  relevance: RelevanceResult
}

// ─── Hard Excludes ───────────────────────────────────────────────────────────
// These categories are definitively non-claimable under any LHDN relief

const HARD_EXCLUDES: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /(^petrol|fuel pump|caltex|shell station|petronas pump|petron|bhp petrol|esso station|mesra pump)/i, reason: 'Fuel/petrol — not claimable' },
  { pattern: /(grab food|foodpanda|shopee food|airfood|food delivery|tapau|mamak|kopitiam|restoran|restaurant|cafe|kafe|coffee bean|starbucks|oldtown|old town white|tealive|chatime|gong cha|mcdonald|mcdonalds|kfc|subway|pizza hut|domino|burger king|marrybrown|texas chicken|papa john|jollibee)/i, reason: 'Food & beverage — not claimable' },
  { pattern: /(grab car|grabcar|mycar|taxi|indriver|airasia ride|uber|komuter|lrt |mrt |monorail|ktm ets|ktm komuter|intercity bus|ets ticket|plus expressway|smart tunnel)/i, reason: 'Transportation — not claimable' },
  { pattern: /(top.?up|reload pulsa|reload digi|maxis reload|celcom reload|u mobile reload|yoodo reload|unifi air reload|add credit|phone credit)/i, reason: 'Telco top-up — not claimable' },
  { pattern: /(parking fee|car park|autopay toll|touch n go toll|plus toll|sprint toll|nkve toll|lke toll|mex toll|linkedua toll|kesas toll)/i, reason: 'Parking/toll — not claimable' },
  { pattern: /(tenaga nasional|tnb electric|syabas|air selangor|sada air|pengurusan air|gas supply|petronas gas|domestic gas)/i, reason: 'Utilities (electricity/water/gas) — not claimable' },
  { pattern: /(ibg transfer|interbank transfer|duitnow transfer|funds transfer|payment to account|send money|pindahan wang|ewallet transfer)/i, reason: 'Money transfer — not a claimable expense' },
  { pattern: /(atm cash|atm withdrawal|cash advance|bank charge|service fee|admin fee|late payment|penalty charge|annual fee card|credit card fee)/i, reason: 'Bank/card fees — not claimable' },
  { pattern: /(tesco|giant|mydin|econsave|aeon big|aeon superstore|cold storage|village grocer|jaya grocer|hero supermarket|99 speedmart|speedmart|kedai runcit|pasar|wet market|hypermarket grocery)/i, reason: 'Groceries/supermarket — not claimable' },
  { pattern: /(karaoke|bar |nightclub|pub |alcohol|beer|wine|spirit|tobacco|cigarette|vape)/i, reason: 'Entertainment/vice — not claimable' },
  { pattern: /(lottery|toto|magnum|damacai|sports toto|casino|slots|gambling|genting|4d ticket)/i, reason: 'Gambling — not claimable' },
  { pattern: /(hotel|motel|airbnb|agoda|booking\.com stay|resort room|homestay)/i, reason: 'Accommodation — not claimable' },
]

// ─── Relief Patterns ─────────────────────────────────────────────────────────

interface ReliefPattern {
  pattern: RegExp
  category: string
  confidence: RelevanceConfidence
  reason: string
}

const RELIEF_PATTERNS: ReliefPattern[] = [
  // ── Medical (Green) ──────────────────────────────────────────────────────
  { pattern: /(hospital|klinik kesihatan|poliklinik|klinik|clinic|pusat perubatan|pusat dialysis|pantai|gleneagles|sunway medical|kpj|umsc|columbia asia|prince court|ampang puteri|damansara specialist|subang jaya medical|assunta|tawakal|selayang hospital|putrajaya hospital)/i,        category: 'medical_self',      confidence: 'green', reason: 'Hospital/clinic — qualifies for D7' },
  { pattern: /(specialist|paediatric|paediatric|orthopedic|orthopaedic|ophthalmolog|optometrist|neurolog|cardiolog|oncolog|urolog|dermatolog|psychiatrist|psycholog|radiolog|physiotherap|occupational therap)/i, category: 'medical_self',      confidence: 'green', reason: 'Medical specialist — qualifies for D7' },
  { pattern: /(dental|dentist|pergigian|orthodontic|braces|scaling|tooth extraction|root canal)/i,                                                                                                                  category: 'medical_self',      confidence: 'green', reason: 'Dental — qualifies for D7 (sub-limit RM 1,000)' },
  { pattern: /(pharmacy|farmasi|guardian pharmacy|watson pharmacy|caring pharmacy|alpro pharmacy|duopharma|aeon wellness pharmacy|big pharmacy|biovit)/i,                                                           category: 'medical_self',      confidence: 'amber', reason: 'Pharmacy — prescription/medical items qualify; OTC cosmetics/vitamins do not' },
  { pattern: /(vaksin|vaccination|imunisasi|immunisation|travel vaccine|vaccine clinic|klinik vaksin)/i,                                                                                                            category: 'medical_self',      confidence: 'green', reason: 'Vaccination — qualifies for D7 (sub-limit RM 1,000)' },
  { pattern: /(mental health|therapy session|counselling|psychotherapy|kaunseling|kaunselor)/i,                                                                                                                     category: 'medical_self',      confidence: 'green', reason: 'Mental health consultation — qualifies for D7' },
  { pattern: /(home nursing|caretaker|jururawat|carer service|ambulance|perkhidmatan penjagaan)/i,                                                                                                                  category: 'parents_medical',   confidence: 'amber', reason: 'Home care — may qualify for D6 if patient is parent; verify' },

  // ── Education (Green) ────────────────────────────────────────────────────
  { pattern: /(universiti|university|kolej|college|polytechnic|politeknik|maktab|institute of technology|community college|tafe)/i,                                                                                category: 'education_self',    confidence: 'green', reason: 'Higher education institution — qualifies for D11' },
  { pattern: /(tuition fee|yuran pengajian|course fee|exam fee|registration fee|enrolment fee|semester fee|ielts|toefl|acca|cpa|cfa|icas|hrdc|hrdf|cmsb|icsa|cima|micpa)/i,                                       category: 'education_self',    confidence: 'green', reason: 'Education fee — qualifies for D11' },
  { pattern: /(coursera|udemy|linkedin learning|pluralsight|skillshare|edx|google certificate|aws training|microsoft learn|adobe learn|mooc|e-learning platform)/i,                                               category: 'education_self',    confidence: 'amber', reason: 'Online learning — may qualify for D11 upskilling sub-limit (cap RM 2,000)' },

  // ── EPF / Insurance (Green) ──────────────────────────────────────────────
  { pattern: /(kwsp|kumpulan wang simpanan pekerja|employees provident fund|caruman kwsp|kwsp contribution)/i,                                                                                                     category: 'epf_insurance',    confidence: 'green', reason: 'EPF contribution — qualifies for D12 (cap RM 4,000)' },
  { pattern: /(socso|perkeso|eis contribution|caruman socso|social security)/i,                                                                                                                                    category: 'epf_insurance',    confidence: 'green', reason: 'SOCSO/EIS — qualifies for D15 (cap RM 400)' },
  { pattern: /(aia malaysia|allianz life|prudential bsn|great eastern|etiqa|takaful malaysia|syarikat takaful|sun life malaysia|manulife malaysia|generali|gibraltar bsg|tokio marine|mnrb|zurich malaysia|rhb insurance|public mutual|axa affin)/i, category: 'epf_insurance',    confidence: 'green', reason: 'Life insurance/takaful — qualifies for D12/D13' },
  { pattern: /(prs contribution|private retirement scheme|amanah saham prs|cimb prs|affin hwang prs|manulife prs|principal prs|kenanga prs|fund contribution|deferred annuity)/i,                                 category: 'epf_insurance',    confidence: 'green', reason: 'PRS/deferred annuity — qualifies for D13 (cap RM 3,000)' },

  // ── Lifestyle: Books / PC / Internet (Green) ─────────────────────────────
  { pattern: /(mph bookstore|kinokuniya|popular bookstore|book excess|bookxcess|harris books|times bookstore|buku|textbook|reference book|novel|magazine subscription)/i,                                          category: 'lifestyle',        confidence: 'green', reason: 'Books/reading material — qualifies for D14 basic sub-limit' },
  { pattern: /(laptop|notebook computer|desktop pc|gaming pc|imac|mac mini|macbook|chromebook|surface pro|lenovo laptop|dell laptop|hp laptop|asus laptop|acer laptop)/i,                                         category: 'lifestyle',        confidence: 'green', reason: 'Personal computer — qualifies for D14 basic sub-limit' },
  { pattern: /(ipad|tablet|samsung galaxy tab|huawei matepad|xiaomi pad|lenovo tab|surface go)/i,                                                                                                                  category: 'lifestyle',        confidence: 'green', reason: 'Tablet — qualifies for D14 basic sub-limit' },
  { pattern: /(iphone|samsung galaxy s|samsung galaxy a|google pixel|oneplus|realme|xiaomi mi|xiaomi redmi|poco|oppo|vivo|honor|huawei p|huawei nova|tecno|infinix|itel|motorola|nokia android)/i,               category: 'lifestyle',        confidence: 'green', reason: 'Smartphone — qualifies for D14 basic sub-limit' },
  { pattern: /(unifi home|time fibre|maxis fibre|celcom home|broadband subscription|internet subscription|tm unifi|streamyx|yes 4g home|wireless broadband home)/i,                                               category: 'lifestyle',        confidence: 'green', reason: 'Internet subscription — qualifies for D14 basic sub-limit' },
  { pattern: /(netflix|disney\+|viu subscription|astro subscription|spotify|youtube premium|apple tv\+|hbo go|amazon prime video|iflix|mewatch)/i,                                                               category: 'lifestyle',        confidence: 'green', reason: 'Streaming subscription — qualifies for D14 basic sub-limit' },
  { pattern: /(lowyat|senq|senheng|harvey norman|courts mammoth|thunder match|gadget corner|epic digital|pc image|viewnet|biztech)/i,                                                                              category: 'lifestyle',        confidence: 'amber', reason: 'Electronics retailer — qualifying item (PC/phone/tablet) needed; verify receipt' },

  // ── Lifestyle: Sports / Gym (Green) ──────────────────────────────────────
  { pattern: /(decathlon|sports direct|jd sports|foot locker|podium sport|gosports|rebel sport|marathon sport|winner sport)/i,                                                                                    category: 'lifestyle',        confidence: 'green', reason: 'Sports equipment retailer — qualifies for D14 sports sub-limit' },
  { pattern: /(celebrity fitness|true fitness|fitness first|anytime fitness|ff gym|fitzone|energy station|the fit lab|snap fitness|f45|crossfit|gym membership|yuran gym)/i,                                      category: 'lifestyle',        confidence: 'green', reason: 'Gym membership — qualifies for D14 sports sub-limit (cap RM 1,000)' },
  { pattern: /(badminton court|futsal court|squash court|tennis court|swimming pool|dewan sukan|kolam renang|sports complex|court rental|lane rental)/i,                                                          category: 'lifestyle',        confidence: 'green', reason: 'Sports facility rental — qualifies for D14 sports sub-limit' },
  { pattern: /(yonex|victor|li-ning|wilson badminton|carlton|babolat|prince racket|speedo|arena swim|asics running|new balance running|adidas running|nike running|skechers)/i,                                   category: 'lifestyle',        confidence: 'amber', reason: 'Sports brand — qualifying sports item qualifies for D14; verify item type' },
  { pattern: /(yoga studio|pilates studio|muay thai|taekwondo|martial arts|rock climbing|klcc park run|parkrun|marathon registration|triathlon registration)/i,                                                   category: 'lifestyle',        confidence: 'green', reason: 'Sports activity — qualifies for D14 sports sub-limit' },

  // ── Housing Loan Interest (Amber — hard to distinguish from statement row) ─
  { pattern: /(housing loan interest|home loan interest|mortgage interest|rumah loan|pinjaman perumahan faedah)/i,                                                                                                  category: 'housing_loan',     confidence: 'green', reason: 'Housing loan interest — qualifies for D16 (first home only)' },
  { pattern: /(maybank home|cimb home|hlb home|public bank home|rhb home|ambank home|affin home|bank islam home|bank rakyat home)/i,                                                                              category: 'housing_loan',     confidence: 'amber', reason: 'Home loan — interest portion may qualify for D16; verify statement details' },
]

// ─── Core Filter Function ─────────────────────────────────────────────────────

export function filterRelevance(merchant: string, description = '', amount = 0): RelevanceResult {
  const text = `${merchant} ${description}`.trim()

  // 1. Hard exclude check (runs first — definitive non-qualifying)
  for (const { pattern, reason } of HARD_EXCLUDES) {
    if (pattern.test(text)) {
      return { relevant: false, confidence: 'red', suggestedCategory: null, reason }
    }
  }

  // 2. Relief pattern match
  for (const entry of RELIEF_PATTERNS) {
    if (entry.pattern.test(text)) {
      return {
        relevant: true,
        confidence: entry.confidence,
        suggestedCategory: entry.category,
        reason: entry.reason,
      }
    }
  }

  // 3. Amount floor — very small amounts are noise
  if (amount > 0 && amount < 5) {
    return { relevant: false, confidence: 'red', suggestedCategory: null, reason: 'Amount below RM 5 — noise' }
  }

  // 4. Unknown merchant — surface for manual review
  return {
    relevant: true,
    confidence: 'amber',
    suggestedCategory: null,
    reason: 'Unknown merchant — review required',
  }
}

export function batchFilter(
  transactions: Array<{ merchant: string; description?: string; amount?: number; date: string; rawRow: string }>
): FilteredTransaction[] {
  return transactions.map((t) => ({
    date: t.date,
    merchant: t.merchant,
    description: t.description ?? '',
    amount: t.amount ?? 0,
    rawRow: t.rawRow,
    relevance: filterRelevance(t.merchant, t.description, t.amount),
  }))
}

export function countByConfidence(results: FilteredTransaction[]) {
  return {
    green: results.filter((r) => r.relevance.confidence === 'green').length,
    amber: results.filter((r) => r.relevance.confidence === 'amber').length,
    red:   results.filter((r) => r.relevance.confidence === 'red').length,
    total: results.length,
  }
}
