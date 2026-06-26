"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  Upload, X, Check, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, XCircle,
  FileText, Loader2, CreditCard
} from "lucide-react"
import { BANK_LABELS } from "@/lib/statement-parser"
import type { BankId } from "@/lib/statement-parser"
import type { FilteredTransaction } from "@/lib/relevance-filter"
import { RELIEF_CATEGORIES } from "@/store"
import { toast } from "sonner"

const BANKS: { id: BankId; label: string }[] = [
  { id: 'maybank',    label: 'Maybank' },
  { id: 'cimb',       label: 'CIMB' },
  { id: 'publicbank', label: 'Public Bank' },
  { id: 'rhb',        label: 'RHB' },
  { id: 'hongleong',  label: 'HLB' },
  { id: 'ambank',     label: 'AmBank' },
  { id: 'generic',    label: 'Other' },
]

interface ParseResponse {
  bank: BankId
  accountNumber?: string
  period?: { from: string; to: string }
  rowsTotal: number
  rowsParsed: number
  parseErrors: string[]
  transactions: FilteredTransaction[]
  summary: { green: number; amber: number; red: number; total: number }
}

interface Props {
  onImport: (items: Array<{ date: string; merchant: string; category: string; amount: number; description: string }>) => void
  onClose: () => void
}

const CONF_COLORS = {
  green: 'border-emerald-400 bg-emerald-50/60 dark:bg-emerald-950/20',
  amber: 'border-amber-400 bg-amber-50/60 dark:bg-amber-950/20',
  red:   'border-red-300 bg-red-50/40 dark:bg-red-950/10 opacity-60',
}

const CONF_BADGE = {
  green: <Badge className="text-[10px] px-1.5 py-0 bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300"><CheckCircle2 className="h-2.5 w-2.5 mr-0.5"/>Likely</Badge>,
  amber: <Badge className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300"><AlertTriangle className="h-2.5 w-2.5 mr-0.5"/>Review</Badge>,
  red:   <Badge className="text-[10px] px-1.5 py-0 bg-red-100 text-red-600 border-red-300 dark:bg-red-900/40 dark:text-red-300"><XCircle className="h-2.5 w-2.5 mr-0.5"/>Excluded</Badge>,
}

export default function StatementImport({ onImport, onClose }: Props) {
  const [bank, setBank] = useState<BankId>('maybank')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ParseResponse | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [editCats, setEditCats] = useState<Record<number, string>>({})
  const [showExcluded, setShowExcluded] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    if (!file.name.endsWith('.csv') && !file.type.includes('csv') && !file.type.includes('text')) {
      toast.error('Please upload a CSV file exported from your bank')
      return
    }
    setLoading(true)
    setResult(null)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('bank', bank)
      const res = await fetch('/api/parse-statement', { method: 'POST', body: form })
      const data: ParseResponse = await res.json()
      if (!res.ok) { toast.error((data as any).error || 'Parse failed'); return }
      setResult(data)
      // Pre-select green + amber
      const preSelected = new Set(
        data.transactions
          .map((t, i) => ({ t, i }))
          .filter(({ t }) => t.relevance.confidence !== 'red' && t.relevance.relevant)
          .map(({ i }) => i)
      )
      setSelected(preSelected)
      setEditCats({})
      toast.success(`Found ${data.rowsParsed} transactions — ${data.summary.green} likely qualifying`)
    } catch {
      toast.error('Failed to parse statement')
    } finally {
      setLoading(false)
    }
  }

  function toggleRow(i: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  function handleImport() {
    if (!result) return
    const items = [...selected].map((i) => {
      const t = result.transactions[i]
      return {
        date: t.date,
        merchant: t.merchant,
        category: editCats[i] || t.relevance.suggestedCategory || 'lifestyle',
        amount: t.amount,
        description: t.description,
      }
    })
    onImport(items)
    toast.success(`${items.length} records imported from ${BANK_LABELS[result.bank]}`)
    onClose()
  }

  const qualifying = result?.transactions.filter((t) => t.relevance.relevant) ?? []
  const excluded   = result?.transactions.filter((t) => !t.relevance.relevant) ?? []

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">Import Bank Statement</h3>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Bank selector */}
      <div className="grid grid-cols-4 gap-1.5">
        {BANKS.map((b) => (
          <button
            key={b.id}
            onClick={() => setBank(b.id)}
            className={cn(
              "rounded-lg border py-2 text-xs font-medium transition-all",
              bank === b.id
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary/50"
            )}
          >
            {b.label}
          </button>
        ))}
      </div>

      {/* Upload area */}
      {!result && !loading && (
        <button
          className="h-24 w-full rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="h-6 w-6" />
          <span className="text-sm">Select CSV export from {BANK_LABELS[bank]}</span>
          <span className="text-xs opacity-60">Online banking → Statement → Export CSV</span>
        </button>
      )}

      {loading && (
        <div className="h-24 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="ml-2 text-sm text-muted-foreground">Parsing statement…</span>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-3">
          {/* Summary banner */}
          <div className="rounded-xl bg-muted/50 px-3 py-2.5 space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">
                {BANK_LABELS[result.bank]}{result.accountNumber ? ` ···${result.accountNumber.slice(-4)}` : ''}
              </span>
              {result.period && (
                <span className="text-xs text-muted-foreground">{result.period.from} → {result.period.to}</span>
              )}
            </div>
            <div className="flex gap-2 text-xs">
              <span className="text-emerald-600 font-medium">{result.summary.green} likely qualifying</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-amber-600 font-medium">{result.summary.amber} need review</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-red-500">{result.summary.red} excluded</span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between">
            <div className="flex gap-2 text-xs">
              <button
                className="text-primary hover:underline"
                onClick={() => setSelected(new Set(qualifying.map((_, i) => result.transactions.indexOf(qualifying[i]))))}
              >
                Select qualifying
              </button>
              <span className="text-muted-foreground">·</span>
              <button className="text-muted-foreground hover:underline" onClick={() => setSelected(new Set())}>
                Clear
              </button>
            </div>
            <span className="text-xs text-muted-foreground">{selected.size} selected</span>
          </div>

          {/* Transaction rows */}
          <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
            {result.transactions.map((t, i) => {
              if (!t.relevance.relevant && !showExcluded) return null
              const isSel = selected.has(i)
              return (
                <div
                  key={i}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors",
                    CONF_COLORS[t.relevance.confidence],
                    isSel && "ring-1 ring-primary/40"
                  )}
                  onClick={() => t.relevance.relevant && toggleRow(i)}
                >
                  <div className={cn(
                    "h-4 w-4 shrink-0 rounded border flex items-center justify-center",
                    isSel ? "border-primary bg-primary" : "border-muted-foreground"
                  )}>
                    {isSel && <Check className="h-2.5 w-2.5 text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{t.merchant}</p>
                    <p className="text-xs text-muted-foreground truncate">{t.date} · {t.relevance.reason}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-sm font-semibold">RM {t.amount.toFixed(2)}</span>
                    {CONF_BADGE[t.relevance.confidence]}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Category edit for selected */}
          {selected.size > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Adjust categories (optional)</p>
              {[...selected].slice(0, 5).map((i) => {
                const t = result.transactions[i]
                return (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="flex-1 truncate text-muted-foreground">{t.merchant}</span>
                    <select
                      value={editCats[i] || t.relevance.suggestedCategory || 'lifestyle'}
                      onChange={(e) => setEditCats((prev) => ({ ...prev, [i]: e.target.value }))}
                      className="text-xs rounded border border-border bg-background px-1.5 py-0.5"
                    >
                      {RELIEF_CATEGORIES.filter((c) => c.id !== 'individual').map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                )
              })}
              {selected.size > 5 && (
                <p className="text-xs text-muted-foreground">+{selected.size - 5} more (will use suggested categories)</p>
              )}
            </div>
          )}

          {/* Show/hide excluded */}
          {excluded.length > 0 && (
            <button
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setShowExcluded(!showExcluded)}
            >
              {showExcluded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {showExcluded ? 'Hide' : 'Show'} {excluded.length} excluded (non-qualifying)
            </button>
          )}

          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              className="flex-1 h-10"
              onClick={() => { setResult(null); setSelected(new Set()) }}
            >
              <FileText className="h-4 w-4 mr-1.5" /> New file
            </Button>
            <Button
              className="flex-1 h-10"
              disabled={selected.size === 0}
              onClick={handleImport}
            >
              Import {selected.size} records
            </Button>
          </div>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv,text/plain"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleFile(f)
          e.target.value = ''
        }}
      />
    </div>
  )
}
