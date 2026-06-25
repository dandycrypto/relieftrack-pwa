# ReliefTrack MY — Deep Feature Research & Roadmap

> Goal: make ReliefTrack the **most comprehensive, most accurate, and most effortless**
> Malaysian personal tax-relief app. The north-star metric is **minutes of user effort
> per RM of relief captured** — drive it toward zero.
>
> Status of figures: relief limits below reflect LHDN **YA 2024 / YA 2025**. They change
> almost every Budget, so "self-updating relief rules" is itself a feature (see §6).
> Always reconcile against hasil.gov.my before a filing season.

---

## 1. Executive summary

The app already nails *single-receipt* capture (OCR, QR, EA form) and the *reporting*
layer (PDF, LHDN export, AI assistant). The remaining 80% of user pain is **bulk data
acquisition**: people hoard receipts all year (or lose them) and panic before April 30.

The strategic bet is a **"Receipt Autopilot"** pipeline that pulls transactions from the
sources where money is *actually* spent — **credit-card / bank statements, e-wallets,
e-commerce orders, telco & utility bills, insurer annual statements** — runs OCR/parse in
the background, **auto-filters to only the entries that qualify under LHDN**, and presents
a fast **swipe-to-approve** review. The user logs in / shares / drops files once, and the
year's reliefs assemble themselves.

Three design principles:

1. **Effort flows downhill.** Every feature should let the user do *less*, not configure more.
   Default to "import everything, auto-filter, you just confirm."
2. **Accuracy is the product.** A relief claimed wrongly is worse than one missed — it's an
   audit risk. The LHDN rules engine (§6) is the moat.
3. **Year-round, not April-only.** The app should quietly capture as money is spent, so
   filing season is a 5-minute review, not a weekend of archaeology.

---

## 2. Where we are today (baseline)

| Layer | Shipped |
|-------|---------|
| Single capture | Server OCR (RapidOCR + FastAPI v2 fallback), MyInvois QR scan, EA Form parse |
| Bulk capture | Multi-image swipe queue, e-wallet CSV (TnG / Grab / Boost), email forwarding |
| Classification | Keyword→category patterns (`lib/ocr.ts`, `lib/ewallet-parser.ts`), merchant memory |
| Sync/store | Supabase auth+sync, Google Drive, Zustand persist |
| Intelligence | AI assistant (Haiku), duplicate detection, "What's Missing?" action engine |
| Reporting | 7-section annual PDF, LHDN BE-form CSV, year comparison, notification center |

**Gaps this doc targets:** statement ingestion, screen-recording capture, share-target
capture, e-commerce/telco/insurer integrations, a real LHDN rules/eligibility engine,
reconciliation/dedup across sources, and audit-readiness.

---

## 3. The core problem, restated

Malaysians don't lack reliefs — they lack **captured evidence**. The money was spent
(laptop on Shopee, Unifi every month, parents' hospital bill, gym membership), but the
receipt is in an inbox, a chat, a card statement, or gone. The job is to **harvest what
already happened** from the digital trails everyone already has, and keep only what LHDN
will accept.

So the unit of work is not "scan a receipt" — it's **"connect a source once, harvest a
year."**

---

## 4. Flagship feature — "Receipt Autopilot"

A single pipeline that every source feeds into. Build the pipeline once; add sources over time.

```
 SOURCE  ──►  INGEST  ──►  EXTRACT  ──►  RELEVANCE  ──►  CATEGORISE  ──►  REVIEW  ──►  COMMIT
 (login/   (files/      (OCR/parse/   FILTER          (LHDN map +    (swipe     (dedupe +
  share/    frames/      LLM)         (qualifies?)     confidence)    queue)      records)
  upload)   rows)
```

### 4.1 Ingest methods (ranked by feasibility, all feed the same queue)

**Tier 1 — buildable now, no partnerships**

- **Bulk photo-library import** *(have)* — extend to 100+ images with background processing.
- **Screen-recording capture** *(NEW, high-value, exactly the user's idea):* user opens
  their banking app / Shopee orders / TnG history and **screen-records while scrolling**.
  Upload the `.mp4`; the app samples frames (scroll-stop detection via frame-diffing to skip
  near-duplicates), OCRs each unique frame, stitches transaction rows, dedupes overlaps, and
  emits candidate transactions. Works for *any* app with no API.
- **PWA Share Target** *(NEW):* register the app as a share target so "Share → ReliefTrack"
  works from Shopee/Lazada invoices, banking PDFs, gallery, WhatsApp receipts, browser. One
  tap from anywhere.
- **Email forwarding rules** *(extend existing inbound):* auto-detect telco bills, e-commerce
  tax invoices, insurer statements by sender/subject; parse without the user lifting a finger.
- **e-Wallet statement import** *(extend):* add ShopeePay, MAE, BigPay, Setel; accept PDF
  statements (not just CSV) and screenshots.
- **MyInvois / e-Invoice** *(extend QR):* let users paste a MyInvois portal link or sign in to
  pull *all* validated e-invoices issued to their TIN — the cleanest possible source as
  e-invoicing becomes mandatory (phased 2024→2025).

**Tier 2 — statement parsers (highest ROI per build)**

- **Bank & credit-card PDF e-statement parser** *(NEW, flagship):* credit-card statements are
  the **richest merchant ledger** a person has — every swipe, dated, with merchant name and
  amount. Support Maybank, CIMB, Public Bank, RHB, Hong Leong, AmBank, Bank Islam, UOB, HSBC,
  Standard Chartered, Citi/UOB cards. Parse the PDF table, classify each line, keep only
  relief-relevant rows. Handle password-protected PDFs (prompt for the statement password,
  decrypt client-side, never store).
- **Telco / utility bill auto-ingest** *(NEW):* Unifi/TM, Maxis, CelcomDigi, Time, Tenaga,
  Air Selangor. Internet portion → **Lifestyle (internet, RM2,500 sub-limit)**. Recurring, so
  one connection covers 12 months.
- **Insurer annual statement parser** *(NEW):* Great Eastern, AIA, Prudential, Etiqa, Allianz,
  AXA, Zurich, Takaful operators. The annual premium statement maps cleanly to **life/takaful,
  education & medical insurance, deferred annuity/PRS** reliefs — one document, several reliefs.
- **EPF/KWSP & PRS statements** *(NEW):* i-Akaun annual statement → EPF relief; PRS provider
  statements → deferred annuity/PRS (RM3,000).
- **E-commerce order history** *(NEW):* Shopee & Lazada let users download tax invoices / order
  history. Parse for books, PCs/phones/tablets, sports equipment → Lifestyle. Itemised, so
  line-level classification is possible (a single order can be partly relief-eligible).

**Tier 3 — aspirational / partnership / open-finance**

- **BNM Open Finance / DuitNow consent APIs** (when consumer-available) — true one-tap bank
  linking with read-only consent.
- **Direct merchant/loyalty hooks** (Watsons, Guardian, BookXcess, Decathlon) for itemised
  e-receipts.
- **Employer payroll / EA-form direct feed** for salaried users (EPF/SOCSO/PCB pre-filled).

### 4.2 Extract

- Reuse existing OCR for images/frames; add **table-structure parsing** for statement PDFs
  (column detection: date | description | amount).
- **Batch LLM extraction fallback** (Haiku) for messy layouts: feed raw OCR text, get
  structured `{date, merchant, amount, items}` JSON. Cheap, robust to format drift.
- **Frame de-duplication** for screen recordings (perceptual hash) so a 60-row scroll doesn't
  become 600 OCR calls.

### 4.3 Relevance filter (the part that saves the most effort)

Every extracted transaction is scored **qualifies / maybe / discard** *before* the user sees it:

- **Hard excludes:** top-ups, reloads, transfers, refunds, cashback, ATM withdrawals, bill
  payments to self, food & beverage, ride-hailing/transport, fuel, parking, groceries (none
  are reliefs). These never reach the review queue (but stay searchable in case the engine is wrong).
- **Category match:** merchant memory → keyword patterns → LLM classifier for the ambiguous tail.
- **Amount sanity:** RM6 mamak ≠ relief; RM2,499 at Harvey Norman = strong Lifestyle signal.
- **Date-in-YA gate:** only transactions inside the selected Year of Assessment.
- **Confidence bands** (green/amber/red) drive review order — green can be batch-accepted.

Net effect: from a 300-line card statement, the user reviews maybe 12 candidates, not 300.

### 4.4 Categorise → Review → Commit

- Pre-fill LHDN category + sub-category + recipient (self/spouse/child/parent) using the
  rules engine (§6).
- **Swipe queue** *(have)* with "Accept all green" and per-card edit.
- **Reconcile & dedupe across sources** *(NEW):* the same laptop may appear in the card
  statement *and* a Shopee invoice *and* a photo. Match on amount±, date±, merchant fuzzy →
  collapse to one record, prefer the source with the best evidence (itemised invoice > card line).

---

## 5. Integration catalog — mapped to relief categories

The fastest way to "comprehensive" is to ensure **every relief category has at least one
low-effort source**. This table is the build checklist.

| Relief (YA 2024/25) | Limit (RM) | Best low-effort source(s) | Notes |
|---|---|---|---|
| Individual & dependents | 9,000 | *automatic* | no evidence |
| Medical — serious disease / fertility | 10,000 (umbrella) | Hospital/clinic e-receipt, card statement, email | needs practitioner cert for serious disease |
| └ Vaccination (sub) | 1,000 | Pharmacy/clinic receipt | within 10k |
| └ Dental exam/treatment (sub) | 1,000 | Dental clinic receipt | within 10k (from YA2024) |
| └ Full medical check-up / mental health (sub) | 1,000 | Hospital receipt | within 10k |
| └ Child learning-disability dx/intervention (sub) | 4,000 | Therapy centre receipt | within 10k |
| Parents — medical / carer | 8,000 | Hospital receipt, card statement | carer needs cert |
| Disabled individual | 6,000 | OKU card | profile flag |
| Basic supporting equipment (disabled) | 6,000 | Equipment receipt | |
| Education (self) | 7,000 | University portal, e-commerce (courses), email | upskilling RM2,000 sub-limit |
| Lifestyle — books/PC/phone/internet | 2,500 | **Card statement, Shopee/Lazada, telco bill** | itemised invoices ideal |
| Lifestyle — sports/gym (additional) | 1,000 | Card statement, gym app, Decathlon | |
| Breastfeeding equipment | 1,000 | e-commerce / pharmacy | once / 2 yrs, child ≤2 |
| Childcare (TASKA/TADIKA) | 3,000 | Centre receipt, bank standing instruction | registered centres only |
| SSPN net deposit | 8,000 | SSPN/PNB statement | net deposit for the year |
| Spouse / alimony | 4,000 | *declared* | profile |
| Children <18 | 2,000/child | *declared* | profile |
| Children 18+ higher education | 8,000/child | *declared* + enrolment | profile |
| Life insurance / EPF | 4,000 EPF + 3,000 life | **KWSP i-Akaun, insurer statement** | split rules for civil servants |
| Education & medical insurance | 3,000 | Insurer annual statement | |
| Deferred annuity / PRS | 3,000 | PRS provider statement | |
| SOCSO / EIS | 350 | EA form / payslip | |
| EV charging equipment | 2,500 | Installer invoice, card statement | extended relief |
| First-home housing-loan interest | 7,000 / 5,000 | Bank loan interest statement | SPA 2024–25, tiered by price |

**Implication:** ~70% of the table is reachable from **card statements + e-commerce +
insurer/EPF annual statements + telco bills** — four parsers cover most of a typical filer's reliefs.

---

## 6. LHDN accuracy & compliance engine (the moat)

Capturing receipts is worthless if the claim is wrong. This is a dedicated rules engine, not
scattered `if` statements.

- **Versioned relief ruleset by YA.** A single source of truth (`lib/lhdn-rules.ts`) keyed by
  Year of Assessment: limits, sub-limits, umbrella caps, eligibility predicates, evidence
  requirements, BE-form codes. Update once per Budget; everything downstream recomputes.
- **Eligibility predicates per category.** e.g. *breastfeeding* requires `child.age ≤ 2` and
  not claimed in the prior YA; *housing-loan interest* requires `SPA date ∈ 2024–2025` and
  applies the price-tiered cap; *civil-servant* life-insurance rule differs from private sector.
- **Sub-limit & umbrella enforcement.** Medical is a RM10,000 umbrella with RM1,000 sub-caps
  inside it — the engine must cap correctly and warn before the user over-claims.
- **Evidence-requirement flags.** Each accepted record carries what LHDN expects to see on
  audit: official receipt, practitioner certification (serious disease), OKU registration,
  registered-centre number (childcare), TIN match (e-invoice). Surface a per-record
  "audit-ready ✓ / missing X" badge.
- **Date-in-YA + duplicate guards** *(dup guard partly built)*.
- **Recipient validation.** Parents' medical must be for a parent; child reliefs need a child
  on file — block mismatches.
- **Confidence + explainability.** Every auto-categorisation can show *why* ("matched
  'Watsons' → pharmacy → Medical-Vaccination sub-limit").
- **7-year evidence retention.** LHDN requires keeping documents 7 years; the app should
  guarantee receipt images are retained and exportable for that window (ties to Drive/Supabase).
- **e-Invoice / TIN readiness.** As e-invoicing becomes mandatory, prefer validated e-invoices
  (TIN-matched) over photos; flag records that lack a compliant e-invoice where one is expected.

---

## 7. Intelligence & optimisation features

- **Relief maximiser / "leave no RM behind."** Given profile + captured spend, compute the gap
  to each cap and the **marginal RM of tax saved** per additional RM claimed (uses bracket math
  already in `computeTax`). Rank suggestions by RM-saved, not RM-claimed.
- **Proactive nudges from real signals.** "You expensed Unifi 11 months — November is missing."
  "Your medical umbrella has RM3,200 unused and it's December." (recurring-template + calendar aware)
- **Scenario / what-if planner.** Slider: "If I top up SSPN by RM3,000 before Dec 31, you save
  RM570 in tax." Joint-vs-separate assessment comparison for married couples.
- **Spouse / household optimisation.** For married filers, model which spouse should claim child
  /parent reliefs and whether **joint vs separate assessment** is better — often worth hundreds of RM.
- **Next-year forecast & auto-budget.** Project next YA's reliefs from this year's recurring
  spend; set gentle monthly targets.
- **Anomaly & error catching.** Flag a "lifestyle" claim that's really groceries; flag a
  duplicate across sources; flag amounts that exceed a category cap.
- **Natural-language capture.** "Paid RM180 dental for my mum yesterday" → structured record via
  the existing AI endpoint.

---

## 8. Reporting, filing & audit-readiness

- **Pre-filled BE/e-BE worksheet** *(extend LHDN CSV):* output values aligned to the actual
  e-Filing field codes (D1, D7…), so transcription into MyTax is copy-paste, ideally in field order.
- **MyTax / e-Filing hand-off.** A clean, sectioned summary matching the e-Filing form layout;
  longer-term, explore deep-links / pre-fill where LHDN permits.
- **Audit pack export.** One ZIP per YA: summary PDF + every receipt image named
  `{category}_{date}_{merchant}_{amount}` + a manifest CSV. This is the "if LHDN asks" button.
- **Evidence completeness dashboard.** Per category: claimed RM, cap, and **% of claims with
  attached, audit-valid evidence**. Red where money is claimed but evidence is thin.
- **Multi-year vault** *(year comparison exists)* — keep 7 years, searchable, exportable.

---

## 9. Engagement, onboarding & retention

- **30-second onboarding → instant value.** Connect one source (e.g. upload last card
  statement) during onboarding and show "We found RM4,300 of potential reliefs" before asking
  for anything else.
- **Year-round passive capture.** Share-target + email rules mean records accrue without active
  sessions; the app messages only when there's a real win or a deadline.
- **Filing-season countdown & checklist.** Personalised: "RM2,100 still capturable, 3 receipts
  need evidence, deadline in 34 days."
- **Streaks / habit loop** kept tasteful — monthly "you captured RM X this month."
- **Referral & family plan** — one subscription covers a household; spouse data feeds joint optimisation.

---

## 10. Trust, security & privacy (non-negotiable for financial data)

- **Statement passwords & raw files never persisted.** Decrypt/parse client-side or in
  ephemeral memory; store only the structured result + the receipt image the user keeps.
- **Explicit, revocable consent per source.** Clear "what we read / what we store" per connection.
- **On-device option.** Offer a fully local mode (OCR + storage on-device, no cloud) for the
  privacy-conscious; cloud sync opt-in.
- **Biometric lock** *(setting exists)*, encrypted at rest, PDPA-aligned data handling, full
  export & delete-my-data.
- **Audit log** of what was imported from where, so the user can trust and trace.

---

## 11. The long list — prioritised backlog

**P0 — flagship effort-killers (build next)**
1. Receipt Autopilot pipeline skeleton (shared queue: ingest→extract→filter→review→commit)
2. Bank / credit-card **PDF statement parser** (top 6 MY banks) + password handling
3. **Screen-recording capture** (frame sample + dedupe + OCR)
4. **PWA Share Target** ("Share to ReliefTrack" from any app)
5. **Relevance filter** (hard-excludes + confidence bands) so review lists shrink 10×
6. **LHDN rules engine** `lib/lhdn-rules.ts` (versioned by YA, sub-limits, eligibility, evidence flags)

**P1 — coverage & accuracy**
7. Telco/utility bill auto-ingest (internet → Lifestyle)
8. Insurer annual-statement parser (life/medical/PRS reliefs)
9. EPF i-Akaun + PRS statement import
10. Shopee/Lazada order-history / tax-invoice parser (line-level)
11. Cross-source reconciliation & dedupe
12. Evidence-completeness dashboard + per-record audit-ready badge
13. Expand e-wallet support (ShopeePay, MAE, BigPay, Setel) + PDF/screenshot, not just CSV
14. MyInvois account sync (pull all TIN-matched e-invoices)

**P2 — optimisation & filing**
15. Relief maximiser ranked by marginal tax saved
16. Joint-vs-separate assessment + household optimisation
17. What-if / year-end scenario planner (SSPN, PRS top-ups)
18. Pre-filled e-BE worksheet in field order + MyTax hand-off
19. Audit-pack ZIP export (summary + named receipts + manifest)
20. Next-year forecast & monthly targets

**P3 — engagement, trust, reach**
21. 30-sec onboarding with instant "found RM X" moment
22. Filing-season countdown + personalised checklist
23. On-device privacy mode + consent/audit log
24. Natural-language capture ("paid RM180 dental for mum")
25. Family/household plan + referrals
26. BM (Bahasa Malaysia) localisation throughout *(language setting exists)*

**P4 — aspirational**
27. BNM Open Finance / DuitNow consent linking (when consumer-available)
28. Direct merchant/loyalty e-receipt hooks
29. Employer payroll / EA-form direct feed

---

## 12. Suggested build sequence

1. **Pipeline first.** Ship the Autopilot skeleton + relevance filter + LHDN rules engine.
   These are shared infrastructure every later source plugs into — building them first means
   each new parser is small.
2. **One killer source.** Credit-card PDF statement parser proves the whole loop end-to-end and
   delivers the biggest single "wow" (a year of reliefs from one upload).
3. **Two zero-effort channels.** Screen-recording + Share Target make capture ambient.
4. **Annual-statement parsers** (insurer, EPF, telco) — high relief-per-document, low frequency.
5. **Optimisation & filing** layer once data volume justifies it.
6. **Trust & reach** to scale (privacy mode, localisation, household).

---

### Accuracy caveat
All relief names, limits, sub-limits and eligibility rules above are for **YA 2024 / YA 2025**
and must be re-verified against the official LHDN site (hasil.gov.my) each Budget cycle. The
versioned rules engine (§6) is the mechanism that keeps this honest over time.
