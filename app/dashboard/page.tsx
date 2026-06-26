/**
 * ReliefTrack MY — Dashboard Page
 * Merged: new UI structure (v0.dev) + our business logic (Zustand, OCR, AI verify, export)
 * 
 * UI base: /tmp/relieftack-new/app/dashboard/page.tsx
 * Business logic: /home/ubuntu/.openclaw/workspace/my-v0-app/store, lib/ocr, lib/verify, lib/export
 */

"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import {
  Home,
  FileText,
  Plus,
  User,
  Camera,
  Upload,
  Search,
  Filter,
  ChevronRight,
  ChevronDown,
  Check,
  Clock,
  Sun,
  Moon,
  Heart,
  Stethoscope,
  Users,
  GraduationCap,
  Smartphone,
  PiggyBank,
  Building,
  BadgeCheck,
  Info,
  BarChart3,
  PieChart,
  RefreshCw,
  ZoomIn,
  Settings,
  Cloud,
  CloudOff,
  LogOut,
  Bell,
  Shield,
  Globe,
  Palette,
  Pencil,
  Calendar,
  Download,
  Trash2,
  HardDrive,
  AlertCircle,
  Tag,
  AlertTriangle,
  ExternalLink,
  Fingerprint,
  CalendarClock,
  TrendingDown,
  Edit2,
  X,
  CheckCircle2,
  CameraOff,
  BrainCircuit,
  GitCompare,
  Sparkles,
  TrendingUp,
  Target,
} from "lucide-react"
import { useTheme } from "next-themes"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
  DrawerFooter,
} from "@/components/ui/drawer"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { OnboardingWizard } from "@/components/OnboardingWizard"
import { QrScanner, type QrScanResult } from "@/components/QrScanner"
import { BulkQueue } from "@/components/BulkQueue"
import TaxAssistant from "@/components/TaxAssistant"
import { parseEWalletCSV, type EWalletProvider, type ParsedTransaction } from "@/lib/ewallet-parser"
import StatementImport from "@/components/StatementImport"
import type { DbRecord } from "@/lib/supabase"
import { useReliefStore, useDemoStore, RELIEF_CATEGORIES, computeTax, calculateTax, calculateNetTaxBalance, type Record as ReliefRecord } from "@/store"
import { createSupabaseBrowserClient } from "@/utils/supabase/client"
import { performOCR, type OcrResult } from "@/lib/ocr"
import { verifyRecord, verifyEAForm, findDuplicates, type VerifyResult, type EAFormVerifyResult } from "@/lib/verify"
import { exportRecordsCSV, exportRecordsPDF, exportLHDNReference, downloadBEWorksheet } from "@/lib/export"
import { computeMaximiser } from "@/lib/relief-maximiser"
import { runScenarios, getQuickScenarios } from "@/lib/scenario-planner"
import { generateTaxReport } from "@/lib/tax-report"
import { useT } from "@/lib/i18n"
import {
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import { toast } from "sonner"
import { v4 as uuidv4 } from "uuid"
import { formatDistanceToNow } from "date-fns"

// LHDN Badge Component
function LHDNBadge() {
  return (
    <a
      href="https://www.hasil.gov.my/en/individual/individual-life-cycle/income-declaration/tax-reliefs/?pg"
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1 text-sm text-white/90 hover:bg-white/30 transition-colors"
    >
      <span className="text-sm">🇲🇾</span>
      <span>Source: LHDN Official</span>
      <BadgeCheck className="h-3 w-3" />
    </a>
  )
}

// ─── Format Currency ─────────────────────────────────────────────────────────

function formatRM(amount: number) {
  return `RM ${amount.toLocaleString()}`
}

const floorRM = (amount: number): number => Math.floor(amount)

// ─── Household Optimiser Card ─────────────────────────────────────────────────

function HouseholdOptimiserCard({
  spouseIncomeInput,
  setSpouseIncomeInput,
  selectedYear,
  settings,
  displayProfile,
  totalClaimed,
}: {
  spouseIncomeInput: string
  setSpouseIncomeInput: (v: string) => void
  selectedYear: number
  settings: import('@/store').Settings
  displayProfile: import('@/store').Profile
  totalClaimed: number
}) {
  const spouseIncome = parseFloat(spouseIncomeInput) || 0
  const eaData = settings.eaFormByYear?.[selectedYear]
  const gross = eaData?.grossIncome ?? displayProfile.grossIncome ?? 0

  const getResult = () => {
    if (spouseIncome <= 0 || gross <= 0) return null
    const CHILD_RELIEF = (displayProfile.childrenUnder18 || 0) * 2000 + (displayProfile.childrenEducation || 0) * 8000
    const epf = Math.min(eaData?.epf ?? 0, 4000)
    // ciPrimary: totalClaimed already includes all reliefs (child, spouse, individual)
    const ciPrimary = Math.max(0, gross - epf - 9000 - totalClaimed)
    const taxPrimary = computeTax(ciPrimary)
    const ciSpouse = Math.max(0, spouseIncome - Math.min(spouseIncome * 0.11, 4000) - 9000)
    const taxSpouse = computeTax(ciSpouse)
    const totalSeparate = taxPrimary + taxSpouse
    // Joint: combined income, one personal relief, same reliefs as primary
    const ciJoint = Math.max(0, gross + spouseIncome - Math.min((gross + spouseIncome) * 0.11, 8000) - 9000 - totalClaimed)
    const totalJoint = computeTax(ciJoint)
    const jointSaving = totalSeparate - totalJoint
    // Child relief: which spouse saves more? Primary baseline adds back child relief (already in totalClaimed)
    const ciPrimaryNoChild = Math.max(0, ciPrimary + CHILD_RELIEF)
    const primaryChildSaving = CHILD_RELIEF > 0 ? computeTax(ciPrimaryNoChild) - taxPrimary : 0
    const ciSpouseWithChild = Math.max(0, ciSpouse - CHILD_RELIEF)
    const spouseChildSaving = CHILD_RELIEF > 0 ? taxSpouse - computeTax(ciSpouseWithChild) : 0
    const claimWith = spouseChildSaving > primaryChildSaving ? 'spouse' : 'primary'
    const childSaved = Math.max(primaryChildSaving, spouseChildSaving)
    return { totalSeparate, totalJoint, jointSaving, claimWith, childSaved,
      recommendation: jointSaving > 200 ? 'joint' : 'separate' as const,
      rationale: jointSaving > 200 ? `Joint saves RM ${jointSaving.toLocaleString()} combined`
        : jointSaving > 0 ? `Joint marginally better (RM ${jointSaving.toLocaleString()})` : 'Separate assessment recommended' }
  }
  const result = getResult()

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/50 dark:border-violet-900 dark:bg-violet-950/20 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-violet-700 dark:text-violet-400 shrink-0">Joint vs Separate</p>
        <Input
          type="number"
          placeholder="Spouse gross income (RM)"
          value={spouseIncomeInput}
          onChange={e => setSpouseIncomeInput(e.target.value)}
          className="h-7 text-xs"
        />
      </div>
      {result && (
        <>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className={`rounded-lg border p-2 ${result.recommendation === 'separate' ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30' : 'border-border'}`}>
              <p className="font-semibold">Separate</p>
              <p className="text-muted-foreground">RM {result.totalSeparate.toLocaleString()}</p>
            </div>
            <div className={`rounded-lg border p-2 ${result.recommendation === 'joint' ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30' : 'border-border'}`}>
              <p className="font-semibold">Joint</p>
              <p className="text-muted-foreground">RM {result.totalJoint.toLocaleString()}</p>
            </div>
          </div>
          <p className="text-xs text-violet-700 dark:text-violet-400">{result.rationale}</p>
          {result.childSaved > 0 && (
            <p className="text-xs text-muted-foreground">
              Claim children&apos;s relief under <strong>{result.claimWith}</strong> — saves RM {result.childSaved.toLocaleString()}
            </p>
          )}
        </>
      )}
    </div>
  )
}

const getSubCategoryTotal = (records: ReliefRecord[], categoryId: string, subId: string): number => {
  return records
    .filter(r => r.category === categoryId && r.lhdNCategory === subId)
    .reduce((sum, r) => sum + floorRM(r.amount), 0)
}

// ─── Circular Progress ───────────────────────────────────────────────────────

function CircularProgress({
  value,
  max,
  size = 120,
}: {
  value: number
  max: number
  size?: number
}) {
  const pct = Math.min((value / max) * 100, 100)
  const strokeWidth = 8
  const r = (size - strokeWidth) / 2
  const circ = r * 2 * Math.PI
  const offset = circ - (pct / 100) * circ
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="rotate-[-90deg]" width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-white/20"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="text-white transition-all duration-500 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-white">{Math.round(pct)}%</span>
        <span className="text-sm text-white/80">utilised</span>
      </div>
    </div>
  )
}

// ─── Edit Record Modal ───────────────────────────────────────────────────────

function EditRecordModal({
  record,
  onClose,
  onSave,
  onDelete,
}: {
  record: ReliefRecord
  onClose: () => void
  onSave: (updates: Partial<ReliefRecord>) => void
  onDelete: () => void
}) {
  const [form, setForm] = useState({
    category: record.category,
    date: record.date,
    amount: String(record.amount),
    merchant: record.merchant,
    description: record.description,
  })
  const [editImageFile, setEditImageFile] = useState<File | null>(null)
  const [editImagePreview, setEditImagePreview] = useState<string | null>(record.receiptUrl || null)
  const [editErrors, setEditErrors] = useState<Record<string, boolean>>({})
  const [isSaving, setIsSaving] = useState(false)

  const handleEditImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setEditImageFile(file)
    const reader = new FileReader()
    reader.onload = (ev) => setEditImagePreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  const handleSaveWithValidation = async () => {
    if (isSaving) return
    const errs: Record<string, boolean> = {}
    if (!form.merchant.trim()) errs.merchant = true
    if (!form.amount || parseFloat(form.amount) <= 0) errs.amount = true
    if (Object.keys(errs).length > 0) { setEditErrors(errs); return }
    setEditErrors({})
    setIsSaving(true)

    let finalRecord: Partial<ReliefRecord> = {
      category: form.category,
      date: form.date,
      amount: parseFloat(form.amount) || 0,
      merchant: form.merchant,
      description: form.description,
    }

    // Always re-verify on save (with synthetic rawText for merchant matching)
    try {
      const rawText = `${form.merchant} ${form.description || ''} receipt purchase ${form.merchant} ${form.category}`.toLowerCase()
      const verification = await verifyRecord(
        { vendor: form.merchant, amount: parseFloat(form.amount) || 0, date: form.date, raw_text: rawText, tax_type: null, currency: 'MYR', invoice_number: null, tin: null, sst_registration_no: null, extraction_method: null, needs_review: false, document_type: 'unknown' as const, category: null, time: null, tax_amount: null } as OcrResult,
        form.category,
        parseFloat(form.amount) || 0
      )
      finalRecord.status = verification.status
    } catch {
      // Fallback: auto-verify if mandatory fields are filled
      finalRecord.status = "verified"
    }

    if (editImageFile) {
      // Upload new image directly — no OCR
      const supabase = createSupabaseBrowserClient()
      const filePath = `receipts/${Date.now()}-${editImageFile.name}`
      const { data, error } = await supabase.storage.from('receipts').upload(filePath, editImageFile)
      if (!error && data) {
        const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(filePath)
        finalRecord.receiptUrl = urlData.publicUrl
      }
    }

    onSave(finalRecord)
    setTimeout(() => setIsSaving(false), 300)
  }

  return (
    <Drawer open onOpenChange={(o) => !o && onClose()}>
      <DrawerContent className="max-h-[90vh] flex flex-col">
        <DrawerHeader className="text-left">
          <DrawerTitle>Edit Record</DrawerTitle>
        </DrawerHeader>
        <div className="flex-1 overflow-y-auto px-4">
          <div className="space-y-3 pb-4">
            {/* Image upload — two separate options: camera and gallery */}
            <div className="space-y-1">
              <Label className="">Receipt Image</Label>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                id="edit-camera-upload"
                onChange={handleEditImageChange}
              />
              <input
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                id="edit-gallery-upload"
                onChange={handleEditImageChange}
              />
              {editImagePreview ? (
                <div className="space-y-2">
                  <img src={editImagePreview} alt="Receipt" className="h-32 w-full object-contain rounded-lg border border-dashed border-gray-300" />
                  <div className="flex gap-2">
                    <label
                      htmlFor="edit-camera-upload"
                      className="flex-1 flex items-center justify-center gap-2 h-10 rounded-lg border border-gray-300 bg-white text-sm cursor-pointer hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-700"
                    >
                      <Camera className="h-4 w-4" /> Take Photo
                    </label>
                    <label
                      htmlFor="edit-gallery-upload"
                      className="flex-1 flex items-center justify-center gap-2 h-10 rounded-lg border border-gray-300 bg-white text-sm cursor-pointer hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-700"
                    >
                      <Upload className="h-4 w-4" /> Gallery
                    </label>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="edit-camera-upload"
                    className="flex flex-col items-center justify-center w-full h-20 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    <Camera className="h-6 w-6 text-gray-400" />
                    <span className="text-sm text-gray-500 mt-1">Take Photo</span>
                  </label>
                  <label
                    htmlFor="edit-gallery-upload"
                    className="flex flex-col items-center justify-center w-full h-20 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    <Upload className="h-6 w-6 text-gray-400" />
                    <span className="text-sm text-gray-500 mt-1">Upload from Gallery</span>
                  </label>
                </div>
              )}
            </div>
            <div className="space-y-1">
              <Label className="">Category</Label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm({ ...form, category: v })}
              >
                <SelectTrigger>
                  <SelectValue />
              </SelectTrigger>
                <SelectContent>
                  {RELIEF_CATEGORIES.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="">Date</Label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="">Amount (RM)</Label>
              <Input
                type="number"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className={editErrors.amount ? 'border-2 border-red-500' : ''}
              />
            </div>
            <div className="space-y-1">
              <Label className="">Merchant</Label>
              <Input
                value={form.merchant}
                onChange={(e) => setForm({ ...form, merchant: e.target.value })}
                className={editErrors.merchant ? 'border-2 border-red-500' : ''}
              />
            </div>
            <div className="space-y-1">
              <Label className="">Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
              />
            </div>
          </div>
        </div>
        <DrawerFooter className="shrink-0 flex gap-2">
          <Button
            variant="destructive"
            onClick={onDelete}
            className="h-12 text-base font-medium flex-1"
          >
            <Trash2 className="mr-1 h-4 w-4" /> Delete
          </Button>
          <Button
            onClick={handleSaveWithValidation}
            className="h-12 text-base font-medium flex-1"
          >
            Save Changes
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

// ─── Get Category Icon ────────────────────────────────────────────────────────

const ICON_MAP: Record<string, any> = {
  User, Stethoscope, Heart, Users, GraduationCap, Smartphone, PiggyBank, Building, FileText, CalendarClock, TrendingDown,
}

function getCategoryIcon(id: string) {
  const cat = RELIEF_CATEGORIES.find((c) => c.id === id)
  const iconName = cat?.icon || "FileText"
  return ICON_MAP[iconName] || FileText
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function ReliefTrackApp() {
  const {
    records,
    profile,
    settings,
    recurringTemplates,
    isHydrated,
    addRecord,
    updateRecord,
    deleteRecord,
    deleteAllRecords,
    updateProfile,
    updateSettings,
    addTemplate,
    updateTemplate,
    deleteTemplate,
    fireTemplates,
    merchantMemory,
    notifications,
    learnMerchant,
    recallCategory,
    addNotification,
    markNotificationRead,
    markAllNotificationsRead,
    clearNotifications,
    getReliefTotals,
    getApplicableReliefs,
    getTotalClaimed,
    getTotalPossible,
    getEstimatedTaxSavings,
  } = useReliefStore()

  // Demo store — demo records go here, NEVER persisted
  const { demoRecords, demoProfile, isDemoMode, loadDemoRecords, clearDemoRecords } = useDemoStore()

  // Unified records view: demo records OR real records (never both)
  const displayRecords: ReliefRecord[] = isDemoMode ? demoRecords : records
  // Demo mode: use demo profile so real profile is never modified
  const displayProfile = isDemoMode ? demoProfile : profile

  // Privacy-aware RM formatter (masks amounts when privacyMode is on)
  const fmt = (amount: number) => settings.privacyMode ? 'RM ████' : formatRM(amount)

  // i18n translation helper
  const t = useT(settings.language ?? 'en')

  // Get EA Form data for the CURRENT selected YA
  const getCurrentYearEAForm = () => {
    const year = parseInt(settings.defaultTaxYear) || new Date().getFullYear()
    return settings.eaFormByYear?.[year] ?? null
  }

  // Get most recent previous YA with confirmed EA Form (for defaulting new YA)
  const getPreviousYearEAForm = () => {
    const currentYear = parseInt(settings.defaultTaxYear) || new Date().getFullYear()
    if (!settings.eaFormByYear) return null
    const entries = Object.entries(settings.eaFormByYear)
      .map(([y, data]) => ({ year: Number(y), data }))
      .filter((e) => e.year < currentYear && e.data.confirmed)
      .sort((a, b) => b.year - a.year)
    return entries.length > 0 ? entries[0].data : null
  }

  // ── Local UI State ──────────────────────────────────────────────────────
  
// URL-driven navigation for proper browser back/forward support
const router = useRouter()
const pathname = usePathname()

const [activeTab, setActiveTab] = useState<
    "dashboard" | "records" | "profile" | "settings"
  >("dashboard")

// Sync activeTab with URL search params for back/forward support
useEffect(() => {
  const syncTab = () => {
    const params = new URLSearchParams(window.location.search)
    const tab = params.get("tab")
    if (tab && ["dashboard","records","profile","settings"].includes(tab)) {
      setActiveTab(tab as typeof activeTab)
    }
  }
  // Sync on mount
  syncTab()
  // Sync on browser back/forward (popstate)
  window.addEventListener("popstate", syncTab)
  return () => window.removeEventListener("popstate", syncTab)
}, [])

// Update URL when tab changes

  // Load demo records into the NON-persisted demo store when ?demo=true
  // NOTE: isDemoMode NOT in dependency array — adding it causes re-render loops
  // because loadDemoRecords sets isDemoMode, which would re-trigger this effect
  useEffect(() => {
    if (!isHydrated) return
    const params = new URLSearchParams(window.location.search)
    const isDemo = params.get('demo') === 'true'
    if (isDemo && !isDemoMode) {
      loadDemoRecords()
    }
    // Clear demo records when leaving demo mode (e.g., user logs out)
    const handleLeave = () => clearDemoRecords()
    window.addEventListener('beforeunload', handleLeave)
    return () => window.removeEventListener('beforeunload', handleLeave)
  }, [isHydrated])

  // Demo mode: close add drawer if it opens (defensive)
  useEffect(() => {
    if (isDemoMode && isAddModalOpen) {
      closeAddDrawer()
    }
  }, [isDemoMode])

  // Handle post-OAuth redirect: ?drive_setup=1 means Drive folders were created server-side
  // ?drive_setup=0 means Drive connect attempted but folders creation failed
  useEffect(() => {
    if (!isHydrated) return
    const params = new URLSearchParams(window.location.search)
    const justSetup = params.get('drive_setup')
    if (justSetup === '1') {
      // Clean URL
      const url = new URL(window.location.href)
      url.searchParams.delete('drive_setup')
      window.history.replaceState({}, '', url.pathname + url.search)
      // Mark Drive as connected (folders created in callback)
      updateSettings({ googleDriveConnected: true, lastSyncTime: new Date().toLocaleString(), lastSyncedAt: new Date().toISOString() })
      toast.success('Google Drive connected! Folders created.')
      // Fetch and save folder IDs
      loadDriveRecords()
    } else if (justSetup === '0') {
      // Clean URL
      const url = new URL(window.location.href)
      url.searchParams.delete('drive_setup')
      window.history.replaceState({}, '', url.pathname + url.search)
      // Folders weren't created — prompt user to retry from Settings
      toast.error('Google Drive connected but folders could not be created. Please try again from Settings.')
    }
  }, [isHydrated])

  // ── PWA Share Target pickup ───────────────────────────────────────────────
  // When another app shares a file/image to ReliefTrack, the share-target route
  // sets a short-lived cookie. On dashboard mount, we read it and open the add drawer.
  useEffect(() => {
    if (!isHydrated) return
    const params = new URLSearchParams(window.location.search)
    if (params.get('shared') !== '1') return
    // Clean URL
    const url = new URL(window.location.href)
    url.searchParams.delete('shared')
    window.history.replaceState({}, '', url.pathname + url.search)
    // Read shared file from cookie
    const getCookie = (name: string) => {
      const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
      return match ? decodeURIComponent(match[1]) : null
    }
    const metaRaw = getCookie('shared_file_meta')
    const dataRaw = getCookie('shared_file_data')
    // Clear cookies
    document.cookie = 'shared_file_meta=; max-age=0; path=/'
    document.cookie = 'shared_file_data=; max-age=0; path=/'
    if (metaRaw && dataRaw) {
      try {
        const meta = JSON.parse(metaRaw)
        const byteStr = atob(dataRaw)
        const bytes = new Uint8Array(byteStr.length)
        for (let i = 0; i < byteStr.length; i++) bytes[i] = byteStr.charCodeAt(i)
        const blob = new Blob([bytes], { type: meta.type })
        const file = new File([blob], meta.name, { type: meta.type })
        // If it's a CSV, open statement import
        if (meta.type.includes('csv') || meta.name.endsWith('.csv')) {
          setIsAddModalOpen(true)
          setShowStatementImport(true)
          toast.info('CSV file received — select your bank and import')
        } else {
          // It's an image/PDF — trigger OCR
          setIsAddModalOpen(true)
          setTimeout(() => {
            setBulkFiles([file])
            setShowBulkQueue(true)
          }, 300)
        }
      } catch {
        toast.error('Could not process shared file')
      }
    }
  }, [isHydrated])

  // ── Drive sync state (folder IDs needed for write operations) ──
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [driveFolderIds, setDriveFolderIds] = useState<{
    rootFolderId?: string
    yaFolderId?: string
    categoryFolderIds?: Record<string, string>
    manifestFileIds?: Record<string, string>
  }>({ rootFolderId: "", yaFolderId: "", categoryFolderIds: {}, manifestFileIds: {} })
  useEffect(() => {
    try {
      const saved = localStorage.getItem('relief-drive-folder-ids')
      if (saved) setDriveFolderIds(JSON.parse(saved))
    } catch (err) {
      console.warn('[Dashboard] Failed to parse saved Drive folder IDs from localStorage:', err)
    }
  }, [])
  const [isDriveLoading, setIsDriveLoading] = useState(false)
  const [driveStorageInfo, setDriveStorageInfo] = useState<{ used: number; total: number } | null>(null)
  const [syncLog, setSyncLog] = useState<Array<{ time: string; action: string; status: 'pending' | 'success' | 'error'; detail?: string }>>([])

  // Fetch Google Drive storage quota via server-side API route
  // Calculate local records size as fallback when Drive storage info is unavailable
  const getLocalStorageSize = () => {
    try {
      const records = localStorage.getItem('relief-records') || '[]'
      const bytes = new Blob([records]).size
      if (bytes > 1024 * 1024) return `~${(bytes / 1024 / 1024).toFixed(1)} MB`
      if (bytes > 1024) return `~${(bytes / 1024).toFixed(0)} KB`
      return `~${bytes} B`
    } catch {
      return 'Unavailable'
    }
  }

  const fetchDriveStorage = useCallback(async () => {
    if (!settings.googleDriveConnected) return
    const supabase = createSupabaseBrowserClient()
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.provider_token || ''
    try {
      const res = await fetch('/api/drive?action=storageInfo', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const data = await res.json()
      if (data.storageQuota) {
        const used = parseInt(data.storageQuota.usageInDrive || '0') / (1024 * 1024)
        const total = parseInt(data.storageQuota.limit || '15728640') / (1024 * 1024)
        setDriveStorageInfo({ used: Math.round(used), total: Math.round(total) })
      }
    } catch { /* non-critical */ }
  }, [settings.googleDriveConnected])

  // Load all records from Google Drive on app start (when Drive is connected)
  const loadDriveRecords = useCallback(async () => {
    if (!settings.googleDriveConnected) return
    const supabase = createSupabaseBrowserClient()
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.provider_token || ''
    setIsDriveLoading(true)
    try {
      const res = await fetch("/api/drive", {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()

      // Handle HTTP-level errors (401 = token expired, etc.)
      if (!res.ok) {
        const isTokenExpired = res.status === 401 ||
          (data.error && data.error.toLowerCase().includes('token expired'))
        if (isTokenExpired) {
          toast.error('Google token expired — please reconnect Google Drive in Settings', {
            description: 'Your Google session has expired. Please reconnect to continue syncing.',
          })
        } else {
          toast.error('Failed to load records from Google Drive', { description: data.error || `HTTP ${res.status}` })
        }
        setIsDriveLoading(false)
        return
      }

      // Handle API-level errors
      if (data.error) {
        const isTokenError = data.error.toLowerCase().includes('token expired') ||
          data.error.toLowerCase().includes('google access token not found')
        if (isTokenError) {
          toast.error('Token expired — reconnect Google Drive in Settings', {
            description: 'Your Google session has expired. Please reconnect to continue syncing.',
          })
        } else {
          toast.error(data.error)
        }
        setIsDriveLoading(false)
        return
      }

      // Handle missing YA folder — prompt to run folder setup
      if (data.needsFolderSetup) {
        toast.info(data.message || 'Drive folders need to be set up. Click "Backup Now" in Settings.')
        setIsDriveLoading(false)
        return
      }

      // Store folder IDs for future writes + persist to localStorage
      // Only update if API returned complete IDs (not partial data like when YA folder is missing)
      if (data.folders?.yaFolderId && data.folders?.categoryFolderIds && data.folders?.manifestFileIds) {
        const newIds = {
          rootFolderId: data.folders.rootFolderId,
          yaFolderId: data.folders.yaFolderId,
          categoryFolderIds: data.folders.categoryFolderIds,
          manifestFileIds: data.folders.manifestFileIds,
        }
        setDriveFolderIds(newIds)
        localStorage.setItem('relief-drive-folder-ids', JSON.stringify(newIds))
      }

      // Clear local records and load from Drive
      if (data.records && data.records.length > 0) {
        // Replace local store records with Drive records
        const { deleteAllRecords, addRecord } = useReliefStore.getState()
        deleteAllRecords()
        for (const rec of data.records) {
          addRecord({
            id: rec.id,
            category: rec.category,
            date: rec.date,
            amount: rec.amount,
            merchant: rec.merchant,
            description: rec.description,
            status: rec.status || "pending",
            receiptUrl: rec.receiptUrl,
            receiptFileName: rec.receiptFileName,
            invoiceNumber: rec.invoiceNumber,
            taxAmount: rec.taxAmount,
            time: rec.time,
            currency: rec.currency || "MYR",
            taxExempt: rec.taxExempt,
            lhdNCategory: rec.lhdNCategory,
            recipient: rec.recipient,
            lineItems: rec.lineItems,
            notes: rec.notes,
          })
        }
        toast.success(`Loaded ${data.records.length} records from Google Drive`)
      }
    } catch (err: any) {
      console.warn("[Drive] Load failed:", err)
      toast.error('Failed to load records from Google Drive', { description: err.message })
    } finally {
      setIsDriveLoading(false)
    }
  }, [settings.googleDriveConnected])

  // Load from Drive on first hydration (only if not demo mode and Drive is connected)
  useEffect(() => {
    if (!isHydrated) return
    if (isDemoMode) return
    if (settings.googleDriveConnected) {
      loadDriveRecords()
    }
  }, [isHydrated])

  // ── Supabase DB sync: pull records on sign-in ────────────────────────────
  useEffect(() => {
    if (isDemoMode) return
    const supabase = createSupabaseBrowserClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user) {
        const userId = session.user.id
        const shortId = userId.replace(/-/g, '').slice(0, 8)
        const emailAddr = `receipts+${shortId}@receipts.relieftrack.my`
        updateSettings({ supabaseUserId: userId, emailForwardingAddress: emailAddr })
        // Fetch remote records and merge (remote wins on conflict by ID)
        try {
          const { fetchRecords } = await import('@/lib/supabase')
          const { data: remoteRecords } = await fetchRecords(userId)
          if (remoteRecords && remoteRecords.length > 0) {
            const { addRecord: storeAdd, records: localRecords, updateRecord: storeUpdate } = useReliefStore.getState()
            const localIds = new Set(localRecords.map((r) => r.id))
            let added = 0
            for (const r of remoteRecords) {
              if (!r.id) continue
              const mapped = {
                id: r.id,
                category: r.category || 'lifestyle',
                date: r.date || new Date().toISOString().slice(0, 10),
                amount: r.amount || 0,
                merchant: r.merchant || '',
                description: r.description || '',
                status: (r.status || 'pending') as 'verified' | 'pending',
                receiptUrl: r.receipt_url || undefined,
                receiptFileName: r.receipt_file_name || undefined,
                invoiceNumber: r.invoice_number || undefined,
                notes: r.notes || undefined,
              }
              if (localIds.has(r.id)) {
                storeUpdate(r.id, mapped)
              } else {
                storeAdd(mapped)
                added++
              }
            }
            if (added > 0) toast(`Synced ${added} record${added !== 1 ? 's' : ''} from cloud`)
          }
        } catch { /* non-critical */ }
      }
      if (event === 'SIGNED_OUT') {
        updateSettings({ supabaseUserId: null, emailForwardingAddress: '' })
      }
    })
    return () => subscription.unsubscribe()
  }, [isDemoMode])

  // ── Fire recurring templates after hydration ─────────────────────────────
  useEffect(() => {
    if (!isHydrated || isDemoMode) return
    const fired = fireTemplates()
    if (fired.length > 0) {
      const month = new Date().toLocaleString('default', { month: 'long', year: 'numeric' })
      toast(`${fired.length} recurring record${fired.length !== 1 ? 's' : ''} added for ${month}`, {
        description: fired.slice(0, 3).join(', ') + (fired.length > 3 ? '…' : ''),
      })
      addNotification({
        type: 'recurring',
        title: `${fired.length} recurring record${fired.length !== 1 ? 's' : ''} added`,
        body: `${fired.slice(0, 3).join(', ')}${fired.length > 3 ? ` +${fired.length - 3} more` : ''} — ${month}`,
        actionTab: 'records',
      })
    }
    // Deadline reminder: push once if < 30 days to April 30
    const taxYr = parseInt(settings.defaultTaxYear) || new Date().getFullYear()
    const filingDeadline = new Date(`${taxYr + 1}-04-30`)
    const daysToDeadline = Math.ceil((filingDeadline.getTime() - Date.now()) / 86400000)
    const reminderKey = `deadline-notif-${taxYr}`
    if (daysToDeadline > 0 && daysToDeadline <= 30 && !localStorage.getItem(reminderKey)) {
      localStorage.setItem(reminderKey, '1')
      addNotification({
        type: 'reminder',
        title: `Tax filing deadline in ${daysToDeadline} days`,
        body: `YA ${taxYr} BE form due by 30 April ${taxYr + 1}. Make sure all records are complete.`,
        actionTab: 'dashboard',
      })
    }
  }, [isHydrated])

  // Reload Drive folder IDs on startup if Drive is connected but IDs are empty
  // (handles app remount / navigation back where driveFolderIds state was lost)
  useEffect(() => {
    if (!isHydrated) return
    if (isDemoMode) return
    if (settings.googleDriveConnected && !driveFolderIds.manifestFileIds) {
      loadDriveRecords()
    }
  }, [isHydrated])

  // Fetch Drive storage info when Settings tab is active
  useEffect(() => {
    if (activeTab === 'settings' && settings.googleDriveConnected) {
      fetchDriveStorage()
    }
  }, [activeTab, settings.googleDriveConnected, fetchDriveStorage])
  const [showQrScanner, setShowQrScanner] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [ocrProgress, setOcrProgress] = useState(0)
  const [showOCRForm, setShowOCRForm] = useState(false)
  const [showOcrReview, setShowOcrReview] = useState(false)
  const [reviewData, setReviewData] = useState<{
    vendor: string
    amount: string
    date: string
    description: string
    invoiceNumber: string
    confidence: number
    rawText: string
    category: string
  } | null>(null)
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null)
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null)
  const [isVerifying, setIsVerifying] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [filterCategory, setFilterCategory] = useState("all")
  const [recordsView, setRecordsView] = useState<"list" | "chart">("list")
  const [selectedRecord, setSelectedRecord] = useState<ReliefRecord | null>(null)
  const [editingRecord, setEditingRecord] = useState<ReliefRecord | null>(null)
  const [previewImage, setPreviewImage] = useState<string | null>(null) // fullscreen image preview

  // Fix 1: Clear image preview when leaving Records tab
  useEffect(() => {
    if (activeTab !== 'records') {
      setPreviewImage(null)
    }
  }, [activeTab])
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteOneId, setDeleteOneId] = useState<string | null>(null)
  const [profileSavedMsg, setProfileSavedMsg] = useState('')
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)
  const [taxDetailsExpanded, setTaxDetailsExpanded] = useState(false)
  const [yearPickerOpen, setYearPickerOpen] = useState(false)
  const [eaFormDialogOpen, setEaFormDialogOpen] = useState(false)
  const [eaFormData, setEaFormData] = useState<{
    employeeName: string; icNumber: string; employerName: string
    taxYear: number; grossIncome: number; epfContribution: number
    socsoContribution: number; pcbPaid: number
  } | null>(null)
  const [isProcessingEAForm, setIsProcessingEAForm] = useState(false)
  const [eaFormVerifyResult, setEaFormVerifyResult] = useState<EAFormVerifyResult | null>(null)
  const [eaFormDebug, setEaFormDebug] = useState('')
  const eaFormFileRef = useRef<HTMLInputElement>(null)

  // Re-verify EA Form when user edits fields (handles grossIncome selection and field corrections)
  useEffect(() => {
    if (eaFormData) {
      const v = verifyEAForm({
        employerName: eaFormData.employerName || '',
        taxYear: eaFormData.taxYear || new Date().getFullYear(),
        grossIncome: eaFormData.grossIncome || 0,
        epfContribution: eaFormData.epfContribution || 0,
        socsoContribution: eaFormData.socsoContribution || 0,
        pcbPaid: eaFormData.pcbPaid || 0,
      })
      setEaFormVerifyResult(v)
    }
  }, [eaFormData?.grossIncome, eaFormData?.employerName, eaFormData?.epfContribution, eaFormData?.socsoContribution, eaFormData?.pcbPaid])
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null)
  const [uploadedFileName, setUploadedFileName] = useState("")
  const [formErrors, setFormErrors] = useState<Record<string, boolean>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [nameInput, setNameInput] = useState("")
  useEffect(() => { setNameInput(profile.name) }, [profile.name])
  // nameInput synced via defaultValue + ref pattern (no useEffect loop)
  const [showInstallBanner, setShowInstallBanner] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)

  // ── Bulk Queue state ──────────────────────────────────────────────────────
  const [showBulkQueue, setShowBulkQueue] = useState(false)
  const [bulkFiles, setBulkFiles] = useState<File[]>([])
  const bulkInputRef = useRef<HTMLInputElement>(null)

  // ── e-Wallet Import state ─────────────────────────────────────────────────
  const [showStatementImport, setShowStatementImport] = useState(false)
  const [showEWalletImport, setShowEWalletImport] = useState(false)
  const [ewalletProvider, setEwalletProvider] = useState<EWalletProvider>('tng')
  const [ewalletRows, setEwalletRows] = useState<ParsedTransaction[]>([])
  const [ewalletSelected, setEwalletSelected] = useState<Set<number>>(new Set())
  const [ewalletEditCategories, setEwalletEditCategories] = useState<Record<number, string>>({})
  const ewalletFileRef = useRef<HTMLInputElement>(null)

  // ── Recurring Templates UI state ──────────────────────────────────────────
  const [showAddTemplate, setShowAddTemplate] = useState(false)
  const [newTemplate, setNewTemplate] = useState({
    merchant: '', amount: '', category: 'lifestyle', dayOfMonth: 1, description: '',
  })

  // ── Natural-language quick capture ───────────────────────────────────────
  const [nlpInput, setNlpInput] = useState('')
  const [isNlpParsing, setIsNlpParsing] = useState(false)

  // ── Household optimiser ───────────────────────────────────────────────────
  const [spouseIncomeInput, setSpouseIncomeInput] = useState('')

  // ── Phase 3 feature state ─────────────────────────────────────────────────
  const [showTaxAssistant, setShowTaxAssistant] = useState(false)
  // Stable session ID for demo message counter — generated once per browser session
  const [demoSessionId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const stored = sessionStorage.getItem('demo-session-id')
      if (stored) return stored
      const id = `demo-${Date.now()}-${Math.random().toString(36).slice(2)}`
      sessionStorage.setItem('demo-session-id', id)
      return id
    }
    return 'demo-server'
  })
  const [showYearComparison, setShowYearComparison] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [duplicateWarning, setDuplicateWarning] = useState<{
    dupes: ReliefRecord[]
    pendingFn: () => void
  } | null>(null)

  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const { theme, setTheme } = useTheme()

  // ── PWA Install Prompt ─────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setShowInstallBanner(true)
    }
    window.addEventListener("beforeinstallprompt", handler)
    return () => window.removeEventListener("beforeinstallprompt", handler)
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === "accepted") setShowInstallBanner(false)
    setDeferredPrompt(null)
  }

  useEffect(() => {
    setMounted(true)
  }, [])

  // Apply theme from settings
  useEffect(() => {
    if (mounted && settings.themePreference !== "system") {
      setTheme(settings.themePreference)
    }
  }, [mounted, settings.themePreference])

  // ── Computed ────────────────────────────────────────────────────────────
  const reliefTotals = getReliefTotals()
  const applicableReliefs = getApplicableReliefs()
  // Distinct colors per category (day + dark mode safe)
  const colorMap: Record<string, { light: string; dark: string; hex: string }> = {
    emerald:  { light: 'text-emerald-600',    dark: 'dark:text-emerald-400',    hex: '#059669' },
    blue:     { light: 'text-blue-600',        dark: 'dark:text-blue-400',        hex: '#2563eb' },
    rose:     { light: 'text-rose-600',        dark: 'dark:text-rose-400',        hex: '#e11d48' },
    violet:   { light: 'text-violet-600',     dark: 'dark:text-violet-400',     hex: '#7c3aed' },
    orange:   { light: 'text-orange-600',      dark: 'dark:text-orange-400',      hex: '#ea580c' },
    pink:     { light: 'text-pink-600',       dark: 'dark:text-pink-400',       hex: '#db2777' },
    cyan:     { light: 'text-cyan-600',        dark: 'dark:text-cyan-400',        hex: '#0891b2' },
    teal:     { light: 'text-teal-600',        dark: 'dark:text-teal-400',        hex: '#0d9488' },
    amber:    { light: 'text-amber-600',       dark: 'dark:text-amber-400',       hex: '#d97706' },
    red:      { light: 'text-red-600',         dark: 'dark:text-red-400',         hex: '#dc2626' },
    indigo:   { light: 'text-indigo-600',     dark: 'dark:text-indigo-400',     hex: '#4f46e5' },
    sky:      { light: 'text-sky-600',         dark: 'dark:text-sky-400',         hex: '#0284c7' },
  }
  const getColor = (colorId?: string) => colorMap[colorId || 'blue'] || colorMap['blue']
  const getCategoryColor = (categoryId: string) => {
    const cat = RELIEF_CATEGORIES.find((c) => c.id === categoryId)
    return getColor(cat?.color)
  }
  const totalClaimed = getTotalClaimed()
  const totalPossible = getTotalPossible()
  const estimatedSavings = getEstimatedTaxSavings()

  // Tax deadline — dynamic based on selected assessment year
  const getDeadlineInfo = () => {
    const taxYear = parseInt(settings.defaultTaxYear) || new Date().getFullYear()
    const deadline = new Date(`${taxYear + 1}-04-30`)
    const today = new Date()
    const diffDays = Math.ceil(
      (deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    )
    return { days: diffDays, date: `30 April ${taxYear + 1}` }
  }

  // Filtered records (uses displayRecords — either demo or real)
  const selectedYear = parseInt(settings.defaultTaxYear) || new Date().getFullYear()
  const filteredRecords = displayRecords.filter((r) => {
    const recordYear = new Date(r.date).getFullYear()
    const matchYear = recordYear === selectedYear
    const matchSearch =
      r.merchant.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.description.toLowerCase().includes(searchQuery.toLowerCase())
    const matchCat = filterCategory === "all" || r.category === filterCategory
    return matchYear && matchSearch && matchCat
  })

  // Chart data
  const pieData = applicableReliefs.slice(0, 6).map((cat, i) => ({
    name: cat.name.split(" ")[0],
    value: reliefTotals[cat.id] || 0,
    color: ["#059669", "#0d9488", "#0284c7", "#7c3aed", "#db2777", "#d97706"][
      i
    ],
  })).filter((d) => d.value > 0)

  const monthlyData = (() => {
    const months: Record<string, number> = {}
    displayRecords.forEach((r) => {
      const m = r.date.slice(0, 7) // YYYY-MM
      months[m] = (months[m] || 0) + r.amount
    })
    const sorted = Object.entries(months).sort()
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ]
    return sorted
      .slice(-6)
      .map(([m, val]) => ({
        month: monthNames[parseInt(m.split("-")[1]) - 1] || m,
        amount: val,
      }))
  })()

  // ── File Upload Handler (real OCR) ─────────────────────────────────────
  const handleFileUpload = async (file: File) => {
    if (!file) return

    // Show preview
    const reader = new FileReader()
    reader.onload = (e) => setReceiptPreview(e.target?.result as string)
    reader.readAsDataURL(file)
    setUploadedFileName(file.name)

    setIsProcessing(true)
    setOcrProgress(0)
    setShowOCRForm(false)

    try {
      const result = await performOCR(file, setOcrProgress)
      setOcrResult(result)
      setIsVerifying(false)
      setVerifyResult(null)
      const reviewPayload = {
        vendor: result.vendor || '',
        amount: result.amount ? String(Math.round(result.amount)) : '',
        date: result.date || `${settings.defaultTaxYear}-${new Date().toISOString().slice(5, 10)}`,
        description: '',
        invoiceNumber: result.invoice_number || '',
        confidence: result.confidence,
        rawText: result.raw_text,
        category: result.category || 'lifestyle',
      }
      // High-confidence auto-save: skip review screen if ≥85% and data is complete
      if (result.confidence >= 85 && reviewPayload.vendor && reviewPayload.amount) {
        addRecord({
          category: reviewPayload.category,
          date: reviewPayload.date,
          amount: parseFloat(reviewPayload.amount),
          merchant: reviewPayload.vendor,
          status: 'verified',
          receiptUrl: receiptPreview || undefined,
          receiptFileName: uploadedFileName || undefined,
          invoiceNumber: reviewPayload.invoiceNumber || undefined,
        })
        toast.success("Saved — tap to review", {
          description: `${reviewPayload.vendor} · RM ${reviewPayload.amount}`,
          duration: 3000,
        })
        if (!settings.googleDriveConnected) {
          setTimeout(() => toast("Connect Google Drive in Settings to back up your records."), 1500)
        }
        closeAddDrawer()
      } else {
        setReviewData(reviewPayload)
        setShowOcrReview(true)
      }
    } catch (err) {
      console.error("OCR failed:", err)
      toast.error("OCR failed. Please enter details manually.")
      setShowOCRForm(true)
    } finally {
      setIsProcessing(false)
    }
  }

  // ── EA Form Upload Handler ──────────────────────────────────────────
  const handleEAFormUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsProcessingEAForm(true)
    setEaFormDebug('🔍 Uploading EA Form...')
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/ocr', { method: 'POST', body: formData })
      const data = await res.json()
      console.error('[EA Form] upload success, eaFormData:', JSON.stringify(data.eaFormData))
      if (data.eaFormData) {
        setEaFormDebug('✅ EA Form detected — check dialog')
        setEaFormData(data.eaFormData)
        const eaVerify = verifyEAForm({
          employerName: data.eaFormData.employerName || '',
          taxYear: data.eaFormData.taxYear || 0,
          grossIncome: data.eaFormData.grossIncome || 0,
          epfContribution: data.eaFormData.epfContribution || 0,
          socsoContribution: data.eaFormData.socsoContribution || 0,
          pcbPaid: data.eaFormData.pcbPaid || 0,
        })
        setEaFormVerifyResult(eaVerify)
        setEaFormDialogOpen(true)
      } else {
        setEaFormDebug('⚠️ No EA Form data found — try again')
        toast.error('Could not read EA Form. Please enter details manually.')
      }
    } catch (err) {
      console.error('[EA Form] upload failed:', err)
      setEaFormDebug('❌ Upload failed — check connection')
      toast.error('EA Form upload failed. Please try again.')
    } finally {
      setIsProcessingEAForm(false)
      // Reset file input so same file can be re-uploaded
      if (eaFormFileRef.current) eaFormFileRef.current.value = ''
    }
  }

  const confirmEAFormData = () => {
    if (!eaFormData) {
      toast.error('No EA Form data. Please upload first.')
      return
    }
    console.log('[confirmEAFormData] saving eaFormData:', JSON.stringify(eaFormData))
    const taxYear = eaFormData.taxYear

    const yaEntry = {
      confirmed: true,
      grossIncome: eaFormData.grossIncome,
      employerName: eaFormData.employerName || '',
      employeeName: eaFormData.employeeName || '',
      epf: eaFormData.epfContribution,
      socso: eaFormData.socsoContribution,
      pcb: eaFormData.pcbPaid,
      taxYear,
      kwspMemberId: eaFormData.kwspMemberId || '',
      lhdnTin: eaFormData.lhdnTin || '',
      eaFormNumber: eaFormData.eaFormNumber || '',
      uploadDate: eaFormData.uploadDate || new Date().toISOString().split('T')[0],
    }

    const currentMap = settings.eaFormByYear || {}
    const updatedMap = { ...currentMap, [taxYear]: yaEntry }
    console.log('[confirmEAFormData] updatedMap keys:', Object.keys(updatedMap), 'taxYear:', taxYear)

    updateSettings({ eaFormByYear: updatedMap })
    handleProfileUpdate({ grossIncome: eaFormData.grossIncome, employerName: eaFormData.employerName || '' })
    console.log('[confirmEAFormData] settings updated, eaFormByYear:', Object.keys(settings.eaFormByYear || {}))

    setEaFormDialogOpen(false)
    toast.success(`EA Form ${taxYear} applied: ${formatRM(eaFormData.grossIncome)}`)
  }

  // ── New Record Form ─────────────────────────────────────────────────────
  const [newRecord, setNewRecord] = useState({
    category: "lifestyle",
    date: "",
    amount: "",
    merchant: "",
    description: "",
    invoiceNumber: "",
    taxAmount: "",
    lhdNCategory: "",
    recipient: "auto",
  })
  useEffect(() => {
    const today = new Date()
    const selectedYA = parseInt(settings.defaultTaxYear) || today.getFullYear()
    const dateStr = today.getFullYear() === selectedYA
      ? today.toISOString().split("T")[0]
      : `${selectedYA}-12-31`
    setNewRecord(prev => ({ ...prev, date: dateStr }))
  }, [settings.defaultTaxYear])

  const formScrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll form into focused input when keyboard opens (mobile)
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('visualViewport' in window)) return

    const handleViewportChange = () => {
      const viewport = window.visualViewport!
      if (viewport.height < window.innerHeight * 0.6) {
        const focused = document.activeElement as HTMLElement
        if (focused && formScrollRef.current?.contains(focused)) {
          setTimeout(() => {
            focused.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }, 150)
        }
      }
    }

    const viewport = window.visualViewport!
    viewport.addEventListener('resize', handleViewportChange)
    return () => viewport.removeEventListener('resize', handleViewportChange)
  }, [])

  const handleSaveRecord = async () => {
    if (isSaving) return
    const errs: Record<string, boolean> = {}
    if (!newRecord.merchant.trim()) errs.merchant = true
    if (!newRecord.amount || parseFloat(newRecord.amount) <= 0) errs.amount = true
    const selectedCat = RELIEF_CATEGORIES.find(c => c.id === newRecord.category)
    if (selectedCat?.subcategories && selectedCat.subcategories.length > 0 && !newRecord.lhdNCategory) {
      errs.lhdNCategory = true
    }
    if (Object.keys(errs).length > 0) {
      setFormErrors(errs)
      toast.error("Please fill in all required fields (marked with *).")
      return
    }
    setFormErrors({})
    setIsSaving(true)

    // Re-verify with current form data (handles OCR corrections applied by user)
    const reVerifyController = new AbortController()
    const reVerifyTimeout = setTimeout(() => reVerifyController.abort(), 5000)
    let recordStatus: 'verified' | 'pending' = 'verified' // default for manual entry
    try {
      const rawText2 = `${newRecord.merchant} ${newRecord.description || ''} receipt purchase ${newRecord.merchant}`.toLowerCase()
      const reVerifyResult = await verifyRecord(
        { vendor: newRecord.merchant, amount: parseFloat(newRecord.amount) || 0, date: newRecord.date, raw_text: rawText2, tax_type: null, currency: 'MYR', invoice_number: null, tin: null, sst_registration_no: null, extraction_method: null, needs_review: false, document_type: 'unknown' as const, category: null, time: null, tax_amount: null } as OcrResult,
        newRecord.category,
        parseFloat(newRecord.amount) || 0
      )
      recordStatus = reVerifyResult.status
    } catch {
      // Auto-verify on error (e.g., timeout)
      recordStatus = 'verified'
    } finally {
      clearTimeout(reVerifyTimeout)
    }

    const recPayload = {
      category: newRecord.category,
      date: newRecord.date,
      amount: parseFloat(newRecord.amount),
      merchant: newRecord.merchant,
      description: newRecord.description || undefined,
      status: recordStatus,
      receiptUrl: receiptPreview || undefined,
      receiptFileName: uploadedFileName || undefined,
      invoiceNumber: newRecord.invoiceNumber || undefined,
      taxAmount: newRecord.taxAmount ? parseFloat(newRecord.taxAmount) : undefined,
      lhdNCategory: newRecord.lhdNCategory || undefined,
      recipient: newRecord.recipient || undefined,
    }

    // Duplicate detection
    const dupes = findDuplicates(
      { merchant: recPayload.merchant, amount: recPayload.amount, date: recPayload.date },
      records
    )
    if (dupes.length > 0) {
      setIsSaving(false)
      setDuplicateWarning({
        dupes,
        pendingFn: () => {
          const newId = addRecord(recPayload)
          learnMerchant(recPayload.merchant, recPayload.category)
          toast.success("Record added successfully!")
          closeAddDrawer()
          syncToDrive('saveRecord', { ...recPayload, id: newId } as ReliefRecord)
          syncNewRecordToSupabase(newId, recPayload)
        },
      })
      return
    }

    const newId = addRecord(recPayload)
    learnMerchant(recPayload.merchant, recPayload.category)
    toast.success("Record added successfully!")
    if (!settings.googleDriveConnected && !settings.supabaseUserId) {
      setTimeout(() => toast("Connect Google Drive in Settings to back up your records."), 1200)
    }
    // Reset form immediately — before Drive/DB sync
    closeAddDrawer()
    // Fire-and-forget Drive sync
    syncToDrive('saveRecord', { ...recPayload, id: newId } as ReliefRecord)
    // Fire-and-forget Supabase sync
    syncNewRecordToSupabase(newId, recPayload)
    setTimeout(() => setIsSaving(false), 300)
  }

  const handleSaveFromReview = () => {
    if (!reviewData) return
    if (!reviewData.vendor.trim() || !reviewData.amount) return
    const recPayload = {
      category: reviewData.category,
      date: reviewData.date,
      amount: parseFloat(reviewData.amount),
      merchant: reviewData.vendor,
      status: 'verified' as const,
      receiptUrl: receiptPreview || undefined,
      receiptFileName: uploadedFileName || undefined,
      invoiceNumber: reviewData.invoiceNumber || undefined,
    }

    // Duplicate detection
    const dupes = findDuplicates(
      { merchant: recPayload.merchant, amount: recPayload.amount, date: recPayload.date },
      records
    )
    if (dupes.length > 0) {
      setDuplicateWarning({
        dupes,
        pendingFn: () => {
          const newId = addRecord(recPayload)
          learnMerchant(recPayload.merchant, recPayload.category)
          toast.success("Record added successfully!")
          syncNewRecordToSupabase(newId, recPayload)
          closeAddDrawer()
        },
      })
      return
    }

    const newId = addRecord(recPayload)
    learnMerchant(recPayload.merchant, recPayload.category)
    toast.success("Record added successfully!")
    if (!settings.googleDriveConnected && !settings.supabaseUserId) {
      setTimeout(() => toast("Connect Google Drive in Settings to back up your records."), 1200)
    }
    syncNewRecordToSupabase(newId, recPayload)
    closeAddDrawer()
  }

  // Fire-and-forget Supabase insert for a saved record
  const syncNewRecordToSupabase = useCallback(async (id: string, record: Partial<ReliefRecord>) => {
    const userId = settings.supabaseUserId
    if (!userId || isDemoMode) return
    try {
      const { insertRecord } = await import('@/lib/supabase')
      await insertRecord({
        user_id: userId,
        merchant: record.merchant || '',
        category: record.category || 'lifestyle',
        date: record.date || new Date().toISOString().slice(0, 10),
        amount: record.amount || 0,
        status: record.status || 'pending',
        description: record.description || undefined,
        receipt_url: record.receiptUrl || undefined,
        receipt_file_name: record.receiptFileName || undefined,
        invoice_number: record.invoiceNumber || undefined,
        lhdn_category: record.lhdNCategory || undefined,
        recipient: record.recipient || undefined,
        notes: record.notes || undefined,
      } as Omit<DbRecord, 'id' | 'created_at' | 'updated_at'>)
    } catch { /* non-critical */ }
  }, [settings.supabaseUserId, isDemoMode])

  const closeAddDrawer = () => {
    setIsAddModalOpen(false)
    setShowOCRForm(false)
    setIsProcessing(false)
    setOcrProgress(0)
    setOcrResult(null)
    setVerifyResult(null)
    setIsVerifying(false)
    setShowOcrReview(false)
    setShowQrScanner(false)
    setReceiptPreview(null)
    setUploadedFileName("")
    setFormErrors({})
    setNewRecord({
      category: "lifestyle",
      date: new Date().toISOString().split("T")[0],
      amount: "",
      merchant: "",
      description: "",
      invoiceNumber: "",
      taxAmount: "",
      lhdNCategory: "",
      recipient: "auto",
    })
    setShowBulkQueue(false)
    setBulkFiles([])
    setShowEWalletImport(false)
    setEwalletRows([])
    setEwalletSelected(new Set())
    setShowStatementImport(false)
  }

  // ── Export Handlers ────────────────────────────────────────────────────
  const handleExportCSV = () => {
    try {
      exportRecordsCSV(displayRecords, RELIEF_CATEGORIES)
      toast.success("CSV exported!")
    } catch {
      toast.error("Export failed.")
    }
  }

  const handleExportPDF = () => {
    try {
      exportRecordsPDF(
        displayRecords,
        profile,
        RELIEF_CATEGORIES,
        reliefTotals,
        totalClaimed,
        totalPossible
      )
      toast.success("PDF summary exported!")
    } catch {
      toast.error("Export failed.")
    }
  }

  const handleExportTaxReport = () => {
    try {
      generateTaxReport(displayRecords, profile, settings, reliefTotals)
      toast.success("Annual tax report downloaded!")
    } catch {
      toast.error("Report generation failed.")
    }
  }

  const handleExportLHDN = () => {
    try {
      exportLHDNReference(displayRecords, profile, reliefTotals, settings.defaultTaxYear)
      toast.success("LHDN reference CSV downloaded!")
    } catch {
      toast.error("Export failed.")
    }
  }

  const handleBEWorksheet = () => {
    try {
      const taxYear = parseInt(settings.defaultTaxYear) || new Date().getFullYear()
      const eaData = settings.eaFormByYear?.[taxYear]
      const grossIncome = eaData?.grossIncome ?? profile.grossIncome ?? 0
      const epf = Math.min(eaData?.epf ?? 0, 4000)
      const socso = Math.min(eaData?.socso ?? 0, 400)
      const pcb = eaData?.pcb ?? 0
      const chargeableIncome = Math.max(0, grossIncome - epf - 9000 - totalClaimed)
      const taxResult = calculateTax(chargeableIncome)
      downloadBEWorksheet(profile, reliefTotals, {
        grossIncome, epf, socso, pcb,
        chargeableIncome,
        estimatedTax: taxResult.taxBeforeRebate,
        taxAfterRebate: taxResult.taxAfterRebate,
        balance: taxResult.taxAfterRebate - pcb,
      }, String(taxYear))
      toast.success("e-BE Worksheet opened in new tab — ready to print or copy into MyTax")
    } catch {
      toast.error("Failed to generate worksheet.")
    }
  }

  const handleNlpCapture = async () => {
    if (!nlpInput.trim() || isNlpParsing) return
    setIsNlpParsing(true)
    try {
      const today = new Date().toISOString().slice(0, 10)
      const catList = RELIEF_CATEGORIES.map(c => `${c.id}="${c.name}"`).join(', ')
      const res = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: nlpInput }],
          context: { mode: 'parse_record', today, categories: catList },
          parseMode: true,
        }),
      })
      if (!res.ok) throw new Error('API error')
      const data = await res.json()
      // Expect: { date, merchant, amount, category, description }
      const parsed = data.parsed ?? data
      if (parsed.amount && parsed.merchant) {
        setNewRecord((prev) => ({
          ...prev,
          date: parsed.date || today,
          merchant: parsed.merchant,
          amount: String(parsed.amount),
          category: parsed.category || 'lifestyle',
          description: parsed.description || nlpInput,
        }))
        setNlpInput('')
      } else {
        toast.error("Couldn't parse — try: 'paid RM180 dental for mum on 15 Jan'")
      }
    } catch {
      toast.error("AI parse failed — try manual entry")
    } finally {
      setIsNlpParsing(false)
    }
  }

  const getAuditTaxSummary = () => {
    const taxYear = parseInt(settings.defaultTaxYear) || new Date().getFullYear()
    const eaData = settings.eaFormByYear?.[taxYear]
    const grossIncome = eaData?.grossIncome ?? profile.grossIncome ?? 0
    const epf = eaData?.epf ?? 0
    const socso = eaData?.socso ?? 0
    const pcb = eaData?.pcb ?? 0
    const chargeableIncome = Math.max(0, grossIncome - Math.min(epf, 4000) - 9000 - totalClaimed)
    const estimatedTax = 0 // computed in audit-export
    return { grossIncome, epf, socso, pcb, reliefTotal: totalClaimed, chargeableIncome, estimatedTax, taxAfterRebate: estimatedTax, balance: estimatedTax - pcb }
  }

  const handleExportAuditExcel = async () => {
    try {
      const { generateAuditExcel, downloadAuditExcel } = await import('@/lib/audit-export')
      const taxYear = parseInt(settings.defaultTaxYear) || new Date().getFullYear()
      const yearRecords = records.filter((r) => r.date.startsWith(String(taxYear)))
      const blob = await generateAuditExcel(yearRecords, profile, settings, reliefTotals, getAuditTaxSummary(), taxYear)
      downloadAuditExcel(blob, taxYear)
      toast.success(`Audit Excel for YA ${taxYear} downloaded!`)
    } catch {
      toast.error("Excel export failed.")
    }
  }

  const handleDownloadAuditPack = async () => {
    try {
      const { downloadAuditPack } = await import('@/lib/audit-pack')
      const taxYear = parseInt(settings.defaultTaxYear) || new Date().getFullYear()
      await downloadAuditPack({ records, profile, settings, reliefTotals, taxYear, taxSummary: getAuditTaxSummary() })
      toast.success(`YA ${taxYear} audit pack downloaded (3 files)`)
    } catch {
      toast.error("Audit pack export failed.")
    }
  }

  // ── Refresh ─────────────────────────────────────────────────────────────
  const handleRefresh = () => {
    setIsRefreshing(true)
    toast.info("Data refreshed from local storage.")
    setTimeout(() => setIsRefreshing(false), 800)
  }

  // ── Profile Save ────────────────────────────────────────────────────────
  // ── Google Drive Mock ──────────────────────────────────────────────────
  const handleConnectDrive = async () => {
    const supabase = createSupabaseBrowserClient()
    // Trigger Google OAuth with Drive scope — user will see re-consent if already signed in
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=%2Fdashboard%3Ftab%3Dsettings&drive_connect=1`,
        queryParams: {
          prompt: "consent",
          access_type: "offline",
          scope: "email https://www.googleapis.com/auth/drive.file",
        },
        skipScreenReady: true,
      },
    })
    if (error) toast.error("Google sign-in failed", { description: error.message })
  }

  const handleDisconnectDrive = () => {
    updateSettings({
      googleDriveConnected: false,
      googleDriveEmail: "",
      lastSyncTime: "",
      lastSyncedAt: undefined,
    })
    localStorage.removeItem('relief-drive-folder-ids')
    toast.info("Google Drive disconnected. Your local records are unchanged.")
  }

  const handleBackupNow = async () => {
    if (!settings.googleDriveConnected) {
      toast.error("Google Drive not connected.")
      return
    }
    try {
      const taxYear = parseInt(settings.defaultTaxYear) || new Date().getFullYear()
      // Ensure folder structure exists (server-side)
      const res = await fetch(`/api/drive?action=folderSetup&taxYear=${taxYear}`)
      if (!res.ok) throw new Error('Folder setup failed')
      const data = await res.json()
      setDriveFolderIds({
        rootFolderId: data.rootFolderId,
        yaFolderId: data.yaFolderId,
        categoryFolderIds: data.categoryFolderIds,
      })
      updateSettings({ lastSyncTime: new Date().toLocaleString(), lastSyncedAt: new Date().toISOString() })
      toast.success('Backup folder structure verified!')
    } catch (err: any) {
      toast.error('Backup failed', { description: err.message })
    }
  }

  // ── Drive Sync Helpers ─────────────────────────────────────────────────
  // Best-effort: local state (Zustand) is source of truth; Drive sync failures show toast but don't roll back
  const syncToDrive = (action: 'saveRecord' | 'updateRecord' | 'deleteRecord', record?: ReliefRecord, recordId?: string) => {
    const hasManifestIds = !!(driveFolderIds.manifestFileIds && driveFolderIds.categoryFolderIds)
    console.log('[syncToDrive] START', { action, isDemoMode, googleDriveConnected: settings.googleDriveConnected, hasManifestIds })
    // Add pending log entry
    const logEntry = { time: new Date().toLocaleTimeString(), action, status: 'pending' as const, detail: `Syncing ${action}...` }
    setSyncLog(prev => [...prev.slice(-49), logEntry])
    if (!settings.googleDriveConnected) {
      console.log('[syncToDrive] skipped: not connected')
      setSyncLog(prev => prev.map((e, i) => i === prev.length - 1 ? { ...e, status: 'error', detail: 'Drive not connected' } : e))
      toast.error('Drive sync failed: Google Drive not connected')
      return
    }
    if (!driveFolderIds.manifestFileIds || !driveFolderIds.categoryFolderIds) {
      console.log('[syncToDrive] skipped: missing manifest IDs')
      setSyncLog(prev => prev.map((e, i) => i === prev.length - 1 ? { ...e, status: 'error', detail: 'Manifest IDs not loaded' } : e))
      toast.error('Drive sync failed: Manifest IDs not loaded. Try refreshing.')
      return
    }
    if (isDemoMode) {
      console.log('[syncToDrive] skipped: demo mode')
      setSyncLog(prev => prev.map((e, i) => i === prev.length - 1 ? { ...e, status: 'error', detail: 'Demo mode — sync skipped' } : e))
      return
    }
    toast.info(`Syncing to Drive: ${action}...`)
    createSupabaseBrowserClient().auth.getSession().then(({ data: { session } }) => {
      const token = session?.provider_token || ''
      if (!token) {
        console.log('[syncToDrive] skipped: no provider_token')
        setSyncLog(prev => prev.map((e, i) => i === prev.length - 1 ? { ...e, status: 'error', detail: 'Missing provider_token (re-authenticate with Google)' } : e))
        toast.error('Drive sync failed: Missing Google token. Please reconnect Google Drive.')
        return
      }
      console.log('[syncToDrive] fetching /api/drive...')
      fetch('/api/drive', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          record,
          recordId,
          categoryFolderIds: driveFolderIds.categoryFolderIds,
          manifestFileIds: driveFolderIds.manifestFileIds,
        }),
      })
        .then(res => {
          if (!res.ok) {
            return res.json().then(err => {
              const isTokenExpired = res.status === 401 || (err?.error && err.error.toLowerCase().includes('token expired'))
              return Promise.reject({ ...err, _isTokenExpired: isTokenExpired, _status: res.status })
            })
          }
          return res.json()
        })
        .then(data => {
          if (data.error) {
            console.error('[syncToDrive] ERROR', data.error)
            setSyncLog(prev => prev.map((e, i) => i === prev.length - 1 ? { ...e, status: 'error', detail: data.error } : e))
            toast.error(`Drive sync failed: ${data.error}`)
          } else {
            console.log('[syncToDrive] SUCCESS', data)
            setSyncLog(prev => prev.map((e, i) => i === prev.length - 1 ? { ...e, status: 'success', detail: 'Synced successfully' } : e))
            toast.success(`Synced: ${action}`)
            // Update lastSyncedAt timestamp
            updateSettings({ lastSyncedAt: new Date().toISOString(), lastSyncTime: new Date().toLocaleString() })
            // Mark record as synced
            if (record?.id) {
              updateRecord(record.id, { syncedToDrive: true })
            }
          }
        })
        .catch(err => {
          console.error('[syncToDrive] ERROR', err)
          const detail = err.error || err.message || 'Unknown error'
          setSyncLog(prev => prev.map((e, i) => i === prev.length - 1 ? { ...e, status: 'error', detail } : e))
          if (err._isTokenExpired) {
            toast.error('Google token expired — please reconnect Google Drive in Settings')
          } else {
            toast.error(`Sync failed: ${detail}`)
          }
        })
    })
  }

  // ── Delete All ─────────────────────────────────────────────────────────
  const handleDeleteAll = () => {
    deleteAllRecords()
    setShowDeleteDialog(false)
    toast.success("All records deleted.")
  }

  // ── Delete One ──────────────────────────────────────────────────────────
  const handleDeleteOne = (id: string) => {
    setDeleteOneId(id)
  }
  const confirmDeleteOne = () => {
    if (deleteOneId) {
      deleteRecord(deleteOneId)
      setSelectedRecord(null)
      setEditingRecord(null)
      setDeleteOneId(null)
      toast.success("Record deleted.")
      syncToDrive('deleteRecord', undefined, deleteOneId)
    }
  }

  if (!isHydrated) {
    return (
      <div className="flex min-h-[100svh] w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className=" text-muted-foreground">Loading ReliefTrack MY...</p>
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════
  // DASHBOARD TAB
  // ═══════════════════════════════════════════════════════════════════════
  const DashboardTab = () => {
    const deadline = getDeadlineInfo()
    return (
      <ScrollArea className="flex-1 min-h-0">
        <div className="space-y-4 px-3 sm:px-4 pb-8 w-full overflow-x-hidden">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-foreground">ReliefTrack MY</h1>
                <span className="text-base">🇲🇾</span>
              </div>
              <button
                onClick={() => setYearPickerOpen(true)}
                className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
              >
                <span>Year of Assessment {settings.defaultTaxYear}</span>
                <ChevronDown className="h-3 w-3" />
              </button>
            </div>
            <div className="flex items-center gap-1">
              {/* Notification Bell */}
              <Button
                variant="ghost"
                size="icon"
                className="relative h-9 w-9"
                onClick={() => setShowNotifications(true)}
              >
                <Bell className="h-4 w-4" />
                {notifications.filter((n) => !n.read).length > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                    {Math.min(notifications.filter((n) => !n.read).length, 9)}
                  </span>
                )}
              </Button>
              {mounted && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    setTheme(theme === "dark" ? "light" : "dark")
                  }
                  className="h-9 w-9"
                >
                  {theme === "dark" ? (
                    <Sun className="h-4 w-4" />
                  ) : (
                    <Moon className="h-4 w-4" />
                  )}
                </Button>
              )}
            </div>
          </div>

          <p className="text-lg text-foreground">
            Hi, <span className="font-semibold text-emerald-600 dark:text-emerald-400">{displayProfile.name}</span>
          </p>

          {/* Last synced indicator — always show */}
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            {settings.lastSyncedAt ? (
              <>
                <Cloud className="h-3.5 w-3.5 text-emerald-500" />
                <span>Synced {formatDistanceToNow(new Date(settings.lastSyncedAt), { addSuffix: true })}</span>
              </>
            ) : (
              <>
                <CloudOff className="h-3.5 w-3.5 text-muted-foreground/50" />
                <span>Never synced</span>
              </>
            )}
          </div>

          {/* Top chips row: Deadline only (LHDN bracket moved into Tax Details) */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Deadline Chip */}
            {deadline.days <= 90 && (
              <div className={cn(
                "flex items-center justify-between rounded-lg px-3 py-2 text-sm",
                deadline.days < 0 ? "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400" :
                deadline.days < 3 ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                deadline.days <= 13 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
              )}>
                <div className="flex items-center gap-2">
                  <CalendarClock className="h-4 w-4" />
                  {deadline.days < 0
                    ? <span>YA {settings.defaultTaxYear} filing deadline passed ({deadline.date})</span>
                    : <span>Tax Filing Deadline: <strong>{deadline.days} days</strong> left</span>
                  }
                </div>
                {deadline.days >= 0 && <span className="text-xs opacity-75 ml-2">{deadline.date}</span>}
              </div>
            )}
          </div>

          {/* Filing Checklist — personalised items */}
          {(() => {
            const yearRecs = displayRecords.filter(r => r.date.startsWith(String(selectedYear)))
            const missingReceipts = yearRecs.filter(r => !r.receiptUrl && r.category !== 'individual').length
            const hasEA = !!(settings.eaFormByYear?.[selectedYear]?.grossIncome)
            const maxResult = computeMaximiser(displayProfile, settings, displayRecords, reliefTotals)
            const capturable = Math.round(maxResult.potentialSaving)
            const unclaimedCats = maxResult.opportunities.filter(o => o.claimed === 0).length
            const items = [
              !hasEA && { icon: '⚠️', text: 'Add your EA Form income', urgent: true },
              missingReceipts > 0 && { icon: '📎', text: `${missingReceipts} receipt${missingReceipts > 1 ? 's' : ''} missing`, urgent: missingReceipts > 3 },
              unclaimedCats > 0 && { icon: '💡', text: `${unclaimedCats} relief categor${unclaimedCats > 1 ? 'ies' : 'y'} not yet claimed`, urgent: false },
              capturable > 0 && { icon: '💰', text: `RM ${capturable.toLocaleString()} more tax savings available`, urgent: false },
            ].filter(Boolean) as { icon: string; text: string; urgent: boolean }[]
            if (items.length === 0) return null
            return (
              <div className="rounded-xl border border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20 px-4 py-3 space-y-1.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <CalendarClock className="h-3.5 w-3.5 text-amber-600" />
                  <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">Filing Checklist — YA {selectedYear}</span>
                </div>
                {items.map((item, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span>{item.icon}</span>
                    <span className={item.urgent ? 'font-semibold text-amber-800 dark:text-amber-300' : 'text-amber-700 dark:text-amber-400'}>{item.text}</span>
                  </div>
                ))}
              </div>
            )
          })()}

          {/* TaxSavingsHero — shows Net Tax Balance */}
          {(() => {
            const grossIncome = settings.eaFormByYear?.[selectedYear]?.grossIncome ?? displayProfile.grossIncome ?? 0
            if (grossIncome <= 0) return (
              <div className="rounded-xl border border-dashed border-muted-foreground/30 bg-muted/20 p-6 text-center">
                <p className="text-muted-foreground">Add your gross income in Profile to see tax savings</p>
              </div>
            )
            const currentEA = getCurrentYearEAForm()
            const epfAmt = currentEA?.epf || 0
            const socsoAmt = currentEA?.socso || 0
            const pcbPaid = currentEA?.pcb || 0
            const taxableIncome = Math.max(0, grossIncome - epfAmt - socsoAmt)
            const chargeableIncome = Math.max(0, taxableIncome - totalClaimed)
            const taxResult = calculateTax(chargeableIncome)
            const netTax = calculateNetTaxBalance(chargeableIncome, pcbPaid)
            const effectiveRate = chargeableIncome > 0 ? Math.round((taxResult.taxAfterRebate / chargeableIncome) * 100) : 0
            // Hero color: green (refund) / red (owe) / amber (breakeven)
            const heroColor = netTax.status === 'refund' ? 'text-emerald-600 dark:text-emerald-400' : netTax.status === 'owe' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'
            const heroLabel = netTax.status === 'refund' ? 'Expected Tax Refund' : netTax.status === 'owe' ? 'Expected Tax to Pay' : 'Tax Fully Paid ✓'
            return (
              <div className="space-y-1">
                <p className={cn("text-4xl font-bold", heroColor)}>{fmt(floorRM(Math.abs(netTax.netBalance)))}</p>
                <p className={cn("text-sm font-medium", heroColor)}>{heroLabel}</p>
              </div>
            )
          })()}

          {/* Collapsible Tax Details — contains all breakdown, collapsed by default */}
          {(() => {
            const grossIncome = settings.eaFormByYear?.[selectedYear]?.grossIncome ?? displayProfile.grossIncome ?? 0
            if (grossIncome <= 0) return null
            const currentEA = getCurrentYearEAForm()
            const epfAmt = currentEA?.epf || 0
            const socsoAmt = currentEA?.socso || 0
            const pcbPaid = currentEA?.pcb || 0
            const taxableIncome = Math.max(0, grossIncome - epfAmt - socsoAmt)
            // totalClaimed includes Individual (auto 9000) + other reliefs + EA Form EPF/SOCSO
            const chargeableIncome = Math.max(0, taxableIncome - totalClaimed)
            const taxResult = calculateTax(chargeableIncome)
            const netTax = calculateNetTaxBalance(chargeableIncome, pcbPaid)
            let bracket = "0%"
            if (chargeableIncome > 100000) bracket = "30%"
            else if (chargeableIncome > 70000) bracket = "25%"
            else if (chargeableIncome > 35000) bracket = "21%"
            else if (chargeableIncome > 15000) bracket = "14%"
            else if (chargeableIncome > 5000) bracket = "8%"
            else bracket = "0%"
            const netTaxColor = netTax.status === 'refund' ? 'text-emerald-600 dark:text-emerald-400' : netTax.status === 'owe' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'
            const netTaxMsg = netTax.status === 'refund' ? 'PCB Dikembalikan — Refund' : netTax.status === 'owe' ? 'Balance Due to LHDN' : 'Tax Fully Paid ✓'
            return (
              <div className="rounded-lg bg-muted p-3 text-sm space-y-1">
                <button
                  onClick={() => setTaxDetailsExpanded(!taxDetailsExpanded)}
                  className="flex items-center justify-between w-full text-left"
                  aria-expanded={taxDetailsExpanded}
                >
                  <span className="font-medium text-foreground">
                    {taxDetailsExpanded ? '▲' : '▼'} Tax Details
                  </span>
                  <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", taxDetailsExpanded && "rotate-180")} />
                </button>
                {taxDetailsExpanded && (
                  <div className="space-y-1 pt-2 border-t border-border/50">
                    {/* QuickStatsRow — 3-column summary */}
                    <div className="grid grid-cols-3 gap-2 text-center mb-2">
                      <div className="rounded-lg bg-muted/70 p-2">
                        <p className="text-xs text-muted-foreground">Gross Income</p>
                        <p className="text-sm font-bold text-foreground">{formatRM(floorRM(grossIncome))}</p>
                      </div>
                      <div className="rounded-lg bg-muted/70 p-2">
                        <p className="text-xs text-muted-foreground">Total Reliefs</p>
                        <p className="text-sm font-bold text-foreground">{formatRM(floorRM(totalClaimed))}</p>
                      </div>
                      <div className="rounded-lg bg-muted/70 p-2">
                        <p className="text-xs text-muted-foreground">Chargeable Income</p>
                        <p className="text-sm font-bold text-foreground">{formatRM(floorRM(chargeableIncome))}</p>
                      </div>
                    </div>
                    {/* LHDN Bracket chip inside Tax Details */}
                    {currentEA?.confirmed && (
                      <div className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-sm text-primary mb-2">
                        <BadgeCheck className="h-3.5 w-3.5" />
                        <span>{bracket} Bracket (EA Form {currentEA?.taxYear || ''})</span>
                      </div>
                    )}
                    {!currentEA?.confirmed && (
                      <div className="flex justify-between"><span className="text-muted-foreground">Tax Bracket</span><span className="font-medium">{bracket}</span></div>
                    )}

                    {/* ── Income Flow ── */}
                    <div className="flex justify-between"><span className="text-muted-foreground">Gross Income</span><span className="font-medium">{formatRM(floorRM(grossIncome))}</span></div>
                    {epfAmt > 0 && <div className="flex justify-between"><span className="text-muted-foreground">  − EPF (EA Form)</span><span className="font-medium text-emerald-600 dark:text-emerald-400">−{formatRM(floorRM(epfAmt))}</span></div>}
                    {socsoAmt > 0 && <div className="flex justify-between"><span className="text-muted-foreground">  − SOCSO (EA Form)</span><span className="font-medium text-emerald-600 dark:text-emerald-400">−{formatRM(floorRM(socsoAmt))}</span></div>}
                    <div className="border-t border-border/50 my-0.5" />
                    <div className="flex justify-between"><span className="text-muted-foreground">Taxable Income</span><span className="font-medium">{formatRM(floorRM(taxableIncome))}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">  − Individual Relief</span><span className="font-medium text-emerald-600 dark:text-emerald-400">−{formatRM(9000)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">  − Your Reliefs</span><span className="font-medium text-emerald-600 dark:text-emerald-400">−{formatRM(floorRM(Math.max(0, totalClaimed - 9000)))}</span></div>
                    <div className="border-t border-border/50 my-0.5" />
                    <div className="flex justify-between font-semibold"><span>Chargeable Income</span><span className="text-foreground">{formatRM(floorRM(chargeableIncome))}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Gross Tax</span><span className="font-medium">{formatRM(floorRM(taxResult.taxBeforeRebate))}</span></div>
                    {taxResult.rebate > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Rebates</span><span className="font-medium text-emerald-500">−{formatRM(taxResult.rebate)}</span></div>}
                    <div className="flex justify-between font-semibold border-t border-border/50 pt-1">
                      <span>Annual Tax Payable</span>
                      <span className="text-foreground">{formatRM(floorRM(taxResult.taxAfterRebate))}</span>
                    </div>


                  </div>
                )}
              </div>
            )
          })()}

          {/* What's Missing — Relief Maximiser (ranked by marginal tax saved) */}
          {(() => {
            const maxResult = computeMaximiser(displayProfile, settings, displayRecords, reliefTotals)
            const topOps = maxResult.opportunities.slice(0, 5)
            if (topOps.length === 0) return null
            return (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h2 className="font-semibold text-foreground">{t('reliefMaximiser')}</h2>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Save up to RM {maxResult.potentialSaving.toLocaleString()} more
                  </span>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                  {topOps.map((op) => (
                    <button
                      key={op.categoryId}
                      onClick={() => {
                        setNewRecord((prev) => ({ ...prev, category: op.categoryId }))
                        setIsAddModalOpen(true)
                      }}
                      className={`flex shrink-0 flex-col items-start gap-1.5 rounded-xl border px-3 py-2.5 text-left transition-all hover:opacity-90 w-[170px] ${
                        op.priority === 'high'
                          ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30'
                          : op.priority === 'medium'
                            ? 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30'
                            : 'border-border bg-muted/30'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="text-[10px] font-semibold text-muted-foreground">{op.beCode}</span>
                        <span className={`text-[10px] font-bold ${
                          op.priority === 'high' ? 'text-emerald-600' : op.priority === 'medium' ? 'text-amber-600' : 'text-muted-foreground'
                        }`}>
                          {op.marginalRate >= 1 ? `${Math.round(op.marginalRate)}¢/RM` : 'low rate'}
                        </span>
                      </div>
                      <span className="text-sm font-medium text-foreground leading-tight line-clamp-2">{op.label}</span>
                      <div>
                        <p className="text-xs text-muted-foreground">RM {op.remaining.toLocaleString()} remaining</p>
                        {op.taxSaved > 0 && (
                          <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                            → save RM {op.taxSaved.toLocaleString()} tax
                          </p>
                        )}
                      </div>
                      <span className="flex items-center gap-1 text-xs text-primary mt-0.5">
                        <Plus className="h-3 w-3" />
                        {t('addRecord')}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* What-If Scenario Planner */}
          {(() => {
            const ea = settings.eaFormByYear?.[selectedYear]
            const gross = ea?.grossIncome ?? displayProfile.grossIncome ?? 0
            if (gross <= 0) return null
            const quickInputs = getQuickScenarios(reliefTotals, selectedYear, displayProfile)
            if (quickInputs.length === 0) return null
            const ciNow = Math.max(0,
              gross
              - Math.min(ea?.epf ?? 0, 4000)
              - 9000
              - (Object.values(reliefTotals) as number[]).reduce((s: number, v: number) => s + v, 0)
            )
            const { scenarios } = runScenarios(ciNow, calculateTax(ciNow).taxAfterRebate, reliefTotals, quickInputs, selectedYear, displayProfile)
            if (scenarios.length === 0) return null
            return (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <BrainCircuit className="h-4 w-4 text-violet-500" />
                  <h2 className="font-semibold text-foreground">{t('whatIfScenarios')}</h2>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                  {scenarios.map((s) => (
                    <div
                      key={s.categoryId}
                      className="flex shrink-0 flex-col items-start gap-1.5 rounded-xl border border-violet-200 bg-violet-50 dark:border-violet-900 dark:bg-violet-950/20 px-3 py-2.5 w-[165px]"
                    >
                      <span className="text-[10px] font-semibold text-violet-600 dark:text-violet-400">+RM {s.cappedAddition.toLocaleString()}</span>
                      <span className="text-sm font-medium text-foreground leading-tight line-clamp-2">{s.label}</span>
                      <div>
                        <p className="text-xs text-muted-foreground">ROI: {s.roiPercent.toFixed(0)}¢ tax / RM spent</p>
                        {s.taxSaved > 0 && (
                          <p className="text-xs font-bold text-violet-600 dark:text-violet-400">
                            Save RM {s.taxSaved.toLocaleString()}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          setNewRecord((prev) => ({ ...prev, category: s.categoryId }))
                          setIsAddModalOpen(true)
                        }}
                        className="flex items-center gap-1 text-xs text-violet-600 dark:text-violet-400 hover:underline mt-0.5"
                      >
                        <Plus className="h-3 w-3" />
                        {t('addRecord')}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* Monthly Targets & Next-Year Forecast */}
          {(() => {
            const now = new Date()
            const yr = selectedYear
            const isCurrentYear = yr === now.getFullYear()
            const monthsElapsed = isCurrentYear ? Math.max(1, now.getMonth() + 1) : 12
            const totalClaimed = (Object.values(reliefTotals) as number[]).reduce((s: number, v: number) => s + v, 0)
            const monthlyPace = totalClaimed / monthsElapsed
            const projectedYearEnd = isCurrentYear ? monthlyPace * 12 : totalClaimed
            const monthsLeft = isCurrentYear ? Math.max(0, 12 - now.getMonth()) : 0
            // April 30 deadline
            const deadline = new Date(yr + 1, 3, 30)
            const daysToDeadline = Math.ceil((deadline.getTime() - now.getTime()) / 86400000)
            const weeksLeft = Math.max(1, Math.ceil(daysToDeadline / 7))
            // Top unclaimed categories with remaining potential
            const topTargets = applicableReliefs
              .map((cat) => {
                const claimed = reliefTotals[cat.id] || 0
                const limit = cat.perItem
                  ? cat.id === 'children_under18' ? (displayProfile.childrenUnder18 || 0) * cat.maxLimit
                  : cat.id === 'children_education' ? (displayProfile.childrenEducation || 0) * cat.maxLimit
                  : cat.maxLimit
                  : cat.maxLimit
                const remaining = Math.max(0, limit - claimed)
                const weeklyTarget = remaining / weeksLeft
                return { cat, claimed, limit, remaining, weeklyTarget }
              })
              .filter((t) => t.remaining > 0)
              .sort((a, b) => b.remaining - a.remaining)
              .slice(0, 3)

            if (topTargets.length === 0) return null
            return (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium">
                    <Target className="h-4 w-4 text-sky-500" />
                    {t('monthlyTargets')}
                    {isCurrentYear && (
                      <span className="ml-auto text-xs font-normal text-muted-foreground">
                        {t('monthsLeft', { n: monthsLeft, year: yr })}
                      </span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Pace row */}
                  <div className="flex items-center justify-between rounded-lg bg-sky-50 dark:bg-sky-950/20 border border-sky-200 dark:border-sky-800 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                      <span className="text-xs text-sky-700 dark:text-sky-300">{t('monthlyPace')}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-semibold text-sky-700 dark:text-sky-300">{fmt(Math.round(monthlyPace))}/mo</span>
                      {isCurrentYear && (
                        <p className="text-xs text-muted-foreground">{t('projectedByDec', { amt: fmt(Math.round(projectedYearEnd)) })}</p>
                      )}
                    </div>
                  </div>
                  {/* Per-category weekly targets */}
                  <div className="space-y-2">
                    {topTargets.map(({ cat, claimed, limit, remaining, weeklyTarget }) => (
                      <div key={cat.id}>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xs text-foreground truncate max-w-[55%]">{cat.name.split(' (')[0]}</span>
                          <span className="text-xs text-muted-foreground">
                            {fmt(claimed)} / {fmt(limit)}
                          </span>
                        </div>
                        <Progress value={limit > 0 ? (claimed / limit) * 100 : 0} className="h-1.5" />
                        {isCurrentYear && weeklyTarget > 0 && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {t('addPerWeek', { amt: fmt(Math.ceil(weeklyTarget)) })}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )
          })()}

          {/* Year Comparison Toggle */}
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-foreground">{t('overview')}</h2>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs text-muted-foreground"
              onClick={() => setShowYearComparison(!showYearComparison)}
            >
              <GitCompare className="h-3.5 w-3.5" />
              {t('compareYears')}
            </Button>
          </div>

          {/* Year Comparison View */}
          {showYearComparison && (() => {
            const currentYr = parseInt(settings.defaultTaxYear) || new Date().getFullYear()
            const prevYr = currentYr - 1
            const currentRecs = displayRecords.filter((r) => r.date.startsWith(String(currentYr)))
            const prevRecs = displayRecords.filter((r) => r.date.startsWith(String(prevYr)))
            const sumRecs = (recs: ReliefRecord[]) => recs.reduce((s, r) => s + r.amount, 0)
            const catCounts = (recs: ReliefRecord[]) => {
              const cnt: Record<string, number> = {}
              recs.forEach((r) => { cnt[r.category] = (cnt[r.category] || 0) + r.amount })
              const top = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]
              return { total: sumRecs(recs), count: recs.length, topCat: top ? RELIEF_CATEGORIES.find(c => c.id === top[0])?.name?.split(' ')[0] : '—' }
            }
            const curr = catCounts(currentRecs)
            const prev = catCounts(prevRecs)
            return (
              <div className="grid grid-cols-2 gap-3">
                {[{ yr: currentYr, data: curr, primary: true }, { yr: prevYr, data: prev, primary: false }].map(({ yr, data, primary }) => (
                  <div key={yr} className={`rounded-xl border p-3 space-y-1.5 ${primary ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/20' : 'border-muted bg-muted/30'}`}>
                    <p className={`text-xs font-semibold ${primary ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>YA {yr}</p>
                    <p className="text-lg font-bold text-foreground">RM {data.total.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">{data.count} records</p>
                    <p className="text-xs text-muted-foreground">Top: {data.topCat}</p>
                  </div>
                ))}
              </div>
            )
          })()}

          {/* LHDN Badge — always visible below tax section */}
          <LHDNBadge />

          {/* Relief Breakdown Chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2  font-medium">
                <BarChart3 className="h-4 w-4 text-primary" />
                Relief Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {applicableReliefs.slice(0, 5).map((relief) => {
                const claimed = reliefTotals[relief.id] || 0
                const maxLimit = relief.perItem
                  ? relief.id === "children_under18"
                    ? profile.childrenUnder18 * relief.maxLimit
                    : profile.childrenEducation * relief.maxLimit
                  : relief.maxLimit
                const pct = (claimed / maxLimit) * 100
                return (
                  <div key={relief.id} className="flex items-center gap-3">
                    <div className="w-24 truncate text-sm text-muted-foreground">
                      {relief.name.split(" ")[0]}
                    </div>
                    <div className="flex-1">
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: getColor(relief.color).hex }}
                        />
                      </div>
                    </div>
                    <div className="min-w-[4.5rem] text-right text-sm font-medium">
                      {formatRM(claimed)}
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>

          {/* Smart Insight Cards */}
          {(() => {
            const today = new Date()
            const yearEnd = new Date(`${settings.defaultTaxYear}-12-31`)
            const daysLeft = Math.ceil((yearEnd.getTime() - today.getTime()) / 86400000)
            const insights: Array<{ type: 'unclaimed' | 'near-limit' | 'maxed' | 'deadline' | 'income'; reliefId?: string; reliefName?: string; claimed?: number; limit?: number; remaining?: number }> = []

            // Income prompt (highest priority if no income set)
            const grossIncome = settings.eaFormByYear?.[parseInt(settings.defaultTaxYear)]?.grossIncome ?? displayProfile.grossIncome ?? 0
            if (grossIncome <= 0) {
              insights.push({ type: 'income' })
            }

            // Per-category insights
            applicableReliefs.forEach((relief) => {
              if (relief.alwaysShow) return // Skip auto-reliefs (individual)
              const claimed = reliefTotals[relief.id] || 0
              const maxLimit = relief.perItem
                ? relief.id === "children_under18"
                  ? displayProfile.childrenUnder18 * relief.maxLimit
                  : displayProfile.childrenEducation * relief.maxLimit
                : relief.maxLimit
              const pct = maxLimit > 0 ? (claimed / maxLimit) * 100 : 0
              if (claimed === 0) {
                insights.push({ type: 'unclaimed', reliefId: relief.id, reliefName: relief.name, claimed: 0, limit: maxLimit })
              } else if (pct >= 100) {
                insights.push({ type: 'maxed', reliefId: relief.id, reliefName: relief.name, claimed, limit: maxLimit })
              } else if (pct >= 80) {
                insights.push({ type: 'near-limit', reliefId: relief.id, reliefName: relief.name, claimed, limit: maxLimit, remaining: maxLimit - claimed })
              }
            })

            // Deadline alert (only if within 90 days)
            if (daysLeft > 0 && daysLeft <= 90) {
              insights.push({ type: 'deadline' })
            }

            if (insights.length === 0) return null

            // Show at most 3 insights
            const shown = insights.slice(0, 3)
            return (
              <div className="space-y-2">
                <h2 className="font-semibold text-foreground">Insights</h2>
                {shown.map((ins, i) => {
                  if (ins.type === 'income') return (
                    <button
                      key="income"
                      onClick={() => { setActiveTab("profile"); router.push(pathname + "?tab=profile") }}
                      className="flex w-full items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left transition-all hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/30 dark:hover:bg-amber-950/50"
                    >
                      <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-amber-800 dark:text-amber-200">Add your income</p>
                        <p className="text-sm text-amber-700 dark:text-amber-300">See your estimated tax savings →</p>
                      </div>
                    </button>
                  )
                  if (ins.type === 'unclaimed') return (
                    <button
                      key={`unclaimed-${ins.reliefId}`}
                      onClick={() => {
                        setNewRecord(prev => ({ ...prev, category: ins.reliefId! }))
                        setIsAddModalOpen(true)
                      }}
                      className="flex w-full items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-left transition-all hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/30 dark:hover:bg-blue-950/50"
                    >
                      <AlertCircle className="h-5 w-5 shrink-0 text-blue-500" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-blue-800 dark:text-blue-200 truncate">{ins.reliefName} — nothing claimed yet</p>
                        <p className="text-sm text-blue-700 dark:text-blue-300">Add receipt →</p>
                      </div>
                    </button>
                  )
                  if (ins.type === 'near-limit') return (
                    <div key={`near-${ins.reliefId}`} className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/30">
                      <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-amber-800 dark:text-amber-200 truncate">{ins.reliefName} almost maxed</p>
                        <p className="text-sm text-amber-700 dark:text-amber-300">{formatRM(ins.remaining!)} remaining before limit</p>
                      </div>
                    </div>
                  )
                  if (ins.type === 'maxed') return (
                    <div key={`maxed-${ins.reliefId}`} className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-800 dark:bg-emerald-950/30">
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-emerald-800 dark:text-emerald-200 truncate">{ins.reliefName} maxed</p>
                        <p className="text-sm text-emerald-700 dark:text-emerald-300">{formatRM(ins.limit!)} claimed — great job!</p>
                      </div>
                    </div>
                  )
                  if (ins.type === 'deadline') return (
                    <div key="deadline" className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-800 dark:bg-red-950/30">
                      <AlertTriangle className="h-5 w-5 shrink-0 text-red-500" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-red-800 dark:text-red-200">Only {daysLeft} days left in YA {settings.defaultTaxYear}</p>
                        <p className="text-sm text-red-700 dark:text-red-300">Add receipts before 31 Dec</p>
                      </div>
                    </div>
                  )
                  return null
                })}
              </div>
            )
          })()}

          {/* Applicable Reliefs */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-foreground">
                Your Applicable Reliefs
              </h2>
              <Badge variant="secondary" className="text-sm">
                {applicableReliefs.length} categories
              </Badge>
            </div>
            {applicableReliefs.map((relief) => {
              const Icon = getCategoryIcon(relief.id)
              const claimed = floorRM(reliefTotals[relief.id] || 0)
              const maxLimit = relief.perItem
                ? relief.id === "children_under18"
                  ? profile.childrenUnder18 * relief.maxLimit
                  : profile.childrenEducation * relief.maxLimit
                : relief.maxLimit
              const pct = Math.min(Math.round((claimed / maxLimit) * 100), 100)
              const hasSubcategories = !!relief.subcategories && relief.subcategories.length > 0
              return (
                <Card
                  key={relief.id}
                  className="cursor-pointer transition-all hover:shadow-md"
                  onClick={() => setExpandedCategory(expandedCategory === relief.id ? null : relief.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: getColor(relief.color).hex + '1a' }}>
                        <Icon className="h-5 w-5" style={{ color: getColor(relief.color).hex }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="truncate  font-medium text-foreground">
                              {relief.name}
                            </h3>
                            <p className=" text-muted-foreground">
                              {relief.description}
                            </p>
                          </div>
                          <ChevronRight className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${expandedCategory === relief.id ? 'rotate-90' : ''}`} />
                        </div>
                        <div className="mt-2 space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">
                              {formatRM(claimed)} claimed
                            </span>
                            <span className="font-semibold text-primary">
                              {pct}% utilised
                            </span>
                          </div>
                          <Progress value={pct} className="h-2" />
                          <p className=" text-muted-foreground">
                            Max: {formatRM(maxLimit)}
                            {relief.perItem && " total"}
                          </p>
                        </div>
                      </div>
                    </div>
                    {expandedCategory === relief.id && (
                      <div className="mt-4 space-y-3 border-t pt-4">
                        {/* Subcategory breakdown */}
                        {relief.subcategories && (
                          <div className="space-y-2">
                            {relief.subcategories.map((sub) => {
                              let subClaimed = floorRM(getSubCategoryTotal(displayRecords, relief.id, sub.id))
                              const currentEA = getCurrentYearEAForm()
                              if (relief.id === 'epf_insurance' && currentEA?.confirmed) {
                                if (sub.id === 'epf_mandatory') subClaimed += floorRM(Math.min(currentEA.epf || 0, 4000))
                                if (sub.id === 'epf_socso') subClaimed += floorRM(Math.min(currentEA.socso || 0, 350))
                              }
                              const effectiveMax = sub.maxLimit || maxLimit
                              const subPct = Math.min(Math.round((subClaimed / effectiveMax) * 100), 100)
                              return (
                                <div key={sub.id} className="flex items-center gap-3">
                                  <div className="w-36 text-sm text-muted-foreground truncate">{sub.name}</div>
                                  <div className="flex-1">
                                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                                      <div className="h-full rounded-full transition-all" style={{ width: `${subPct}%`, backgroundColor: getColor(relief.color).hex }} />
                                    </div>
                                  </div>
                                  <div className="text-sm font-medium min-w-[4rem] text-right">
                                    {formatRM(subClaimed)} <span className="text-muted-foreground text-xs">/ {effectiveMax > 0 && effectiveMax < maxLimit ? formatRM(effectiveMax) : 'unlimited'}</span>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                        {/* What qualifies? */}
                        <div className="rounded-lg bg-muted/50 px-3 py-2.5">
                          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">What qualifies?</p>
                          <p className="text-sm text-foreground leading-relaxed">{relief.description}</p>
                          {relief.subcategories && (
                            <ul className="mt-2 space-y-0.5">
                              {relief.subcategories.map(sub => (
                                <li key={sub.id} className="flex items-start gap-1.5 text-sm text-muted-foreground">
                                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/60" />
                                  <span>{sub.name}{sub.description ? ` — ${sub.description}` : ''}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        {/* Add receipt CTA */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setNewRecord(prev => ({ ...prev, category: relief.id }))
                            setIsAddModalOpen(true)
                          }}
                          className="flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 py-2 text-sm font-medium text-emerald-700 transition-all hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Add Receipt for {relief.name.split(" ")[0]}
                        </button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      </ScrollArea>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════
  // RECORDS TAB
  // ═══════════════════════════════════════════════════════════════════════
  const RecordsTab = () => (
    <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
      {/* Search and Filter */}
      <div className="space-y-3 border-b border-border bg-background p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('searchRecords')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="h-9 w-[140px]">
              <Filter className="mr-2 h-3 w-3" />
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {RELIEF_CATEGORIES.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.name.split(" ")[0]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex rounded-lg border border-input bg-background p-1">
            <Button
              variant={recordsView === "list" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2"
              onClick={() => setRecordsView("list")}
            >
              <FileText className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant={recordsView === "chart" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2"
              onClick={() => setRecordsView("chart")}
            >
              <PieChart className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-9"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw
              className={cn("h-4 w-4", isRefreshing && "animate-spin")}
            />
          </Button>
        </div>
      </div>

      {/* Records List or Chart */}
      <ScrollArea className="flex-1">
          {recordsView === "list" ? (
            <div className="overflow-hidden divide-y divide-border">
            {filteredRecords.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <FileText className="h-12 w-12 text-muted-foreground/50" />
                <p className="mt-3  text-muted-foreground">
                  No records for YA {settings.defaultTaxYear}
                </p>
                <p className=" text-muted-foreground">
                  Add your first receipt to get started
                </p>
              </div>
            ) : (
              filteredRecords.map((record) => {
                const Icon = getCategoryIcon(record.category)
                return (
                  <button
                    key={record.id}
                    className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-muted/50 overflow-hidden"
                    onClick={() => setSelectedRecord(record)}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0 overflow-hidden">
                      {/* Icon with receipt dot */}
                      <div className="relative shrink-0">
                        <div
                          className="flex h-10 w-10 items-center justify-center rounded-full"
                          style={{ backgroundColor: getCategoryColor(record.category).hex + '1a' }}
                        >
                          <Icon className="h-5 w-5" style={{ color: getCategoryColor(record.category).hex }} />
                        </div>
                        {record.receiptUrl && (
                          <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 border-2 border-background" title="Has receipt" />
                        )}
                      </div>

                      {/* Description + Merchant stacked vertically */}
                      <div className="flex-1 min-w-0 overflow-hidden">
                        {/* Description — rolling if long */}
                        <div className={cn("overflow-hidden", record.description?.length > 30 && "marquee-wrapper")}>
                          <p
                            className={cn(
                              "text-sm font-medium",
                              record.description?.length > 30
                                ? "marquee-text whitespace-nowrap"
                                : "truncate whitespace-nowrap"
                            )}
                            title={record.description}
                          >
                            {record.description}
                          </p>
                        </div>
                        {/* Merchant — rolling if long */}
                        <div className={cn("overflow-hidden", record.merchant?.length > 25 && "marquee-wrapper")}>
                          <p
                            className={cn(
                              "text-xs text-muted-foreground",
                              record.merchant?.length > 25
                                ? "marquee-text whitespace-nowrap"
                                : "truncate whitespace-nowrap"
                            )}
                            title={record.merchant}
                          >
                            {record.merchant}
                          </p>
                        </div>
                      </div>

                      {/* Amount + Verified + Evidence + Sync */}
                      <div className="flex items-center gap-2 shrink-0 min-w-0">
                        <span className="text-sm font-semibold whitespace-nowrap">{formatRM(record.amount)}</span>
                        {record.status === 'verified' ? (
                          <BadgeCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" aria-label="Verified" />
                        ) : (
                          <Clock className="h-3.5 w-3.5 text-amber-500 shrink-0" aria-label="Pending review" />
                        )}
                        {record.receiptUrl ? (
                          <Shield className="h-3 w-3 text-emerald-500 shrink-0" aria-label="Receipt attached — audit ready" />
                        ) : record.category !== 'individual' ? (
                          <AlertCircle className="h-3 w-3 text-red-400 shrink-0" aria-label="No receipt — not audit ready" />
                        ) : null}
                        {record.syncedToDrive ? (
                          <Cloud className="h-3 w-3 text-sky-500 shrink-0" aria-label="Synced to Google Drive" />
                        ) : (
                          <RefreshCw className="h-3 w-3 text-amber-500 shrink-0 animate-spin" aria-label="Pending sync" />
                        )}
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        ) : (
          <div className="space-y-4 p-4">
            {/* Recharts Pie */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  Relief Breakdown by Category
                </CardTitle>
              </CardHeader>
              <CardContent>
                {pieData.length > 0 ? (
                  <div className="flex items-center justify-center gap-4">
                    <ResponsiveContainer width="100%" height={160}>
                      <RechartsPieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={45}
                          outerRadius={70}
                          dataKey="value"
                          paddingAngle={2}
                        >
                          {pieData.map((entry, i) => (
                            <Cell key={i} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: number) => formatRM(v)} />
                      </RechartsPieChart>
                    </ResponsiveContainer>
                    <div className="flex flex-col gap-2">
                      {pieData.map((d) => (
                        <div key={d.name} className="flex items-center gap-2">
                          <div
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: d.color }}
                          />
                          <span className=" text-muted-foreground">
                            {d.name}
                          </span>
                          <span className=" font-medium">
                            {formatRM(d.value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex h-40 items-center justify-center  text-muted-foreground">
                    No data to display
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Monthly Bar Chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Monthly Spending</CardTitle>
              </CardHeader>
              <CardContent>
                {monthlyData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={140}>
                    <BarChart
                      data={monthlyData}
                      margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
                    >
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v) => `RM${(v / 1000).toFixed(0)}k`}
                      />
                      <Tooltip formatter={(v: number) => formatRM(v)} />
                      <Bar
                        dataKey="amount"
                        fill="var(--primary)"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-32 items-center justify-center  text-muted-foreground">
                    No monthly data
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </ScrollArea>

      {/* Record Detail Modal */}
      <Drawer
        open={!!selectedRecord}
        onOpenChange={(o) => !o && setSelectedRecord(null)}
      >
        <DrawerContent className="max-h-[90vh] flex flex-col">
          <DrawerHeader className="text-left">
            <DrawerTitle>Record Details</DrawerTitle>
          </DrawerHeader>
          <div className="flex-1 overflow-y-auto px-4">
            {selectedRecord && (
              <div className="space-y-4 pb-4">
                {/* Receipt preview */}
                <div className="aspect-video overflow-hidden rounded-lg bg-muted">
                  {selectedRecord.receiptUrl ? (
                    <img
                      src={selectedRecord.receiptUrl}
                      alt="Receipt"
                      className="h-full w-full object-contain cursor-pointer hover:opacity-90"
                      onClick={() => setPreviewImage(selectedRecord.receiptUrl!)}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <div className="text-center">
                        <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
                        <p className="mt-2  text-muted-foreground">
                          No receipt attached
                        </p>
                      </div>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  {[
                    [
                      "Category",
                      RELIEF_CATEGORIES.find((c) => c.id === selectedRecord.category)?.name,
                    ],
                    ["Date", selectedRecord.date],
                    ["Amount", formatRM(selectedRecord.amount)],
                    ["Merchant", selectedRecord.merchant],
                    ["Description", selectedRecord.description],
                    ["Status", selectedRecord.status],
                  ].map(([label, value], i) => (
                    <div key={i}>
                      <div className="flex justify-between py-1.5">
                        <span className=" text-muted-foreground">
                          {label}
                        </span>
                        <span className=" font-medium text-foreground">
                          {value}
                        </span>
                      </div>
                      {i < 5 && <Separator />}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DrawerFooter className="shrink-0 flex gap-2">
            <Button
              variant="outline"
              className="h-12 text-base font-medium flex-1"
              onClick={() => {
                if (isDemoMode) {
                  toast("Cannot edit records in demo mode")
                  return
                }
                setSelectedRecord(null)
                setEditingRecord(selectedRecord)
              }}
            >
              <Edit2 className="mr-1 h-4 w-4" /> Edit
            </Button>
            <Button
              variant="destructive"
              className="h-12 text-base font-medium flex-1"
              onClick={() => {
                if (isDemoMode) {
                  toast("Cannot delete records in demo mode")
                  return
                }
                setDeleteOneId(selectedRecord!.id)
              }}
              disabled={isDemoMode}
            >
              <Trash2 className="mr-1 h-4 w-4" /> Delete
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Edit Record Modal */}
      {editingRecord && (
        <EditRecordModal
          record={editingRecord}
          onClose={() => setEditingRecord(null)}
          onSave={(updates) => {
            updateRecord(editingRecord.id, updates)
            syncToDrive('updateRecord', { ...editingRecord, ...updates } as ReliefRecord)
            setEditingRecord(null)
            setSelectedRecord(null)
            toast.success("Record updated!")
          }}
          onDelete={() => { setDeleteOneId(editingRecord.id) }}
        />
      )}

      {/* Fullscreen Image Preview */}
      {previewImage && (
        <div
          className="fixed inset-0 z-[99999] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <img
            src={previewImage}
            alt="Fullscreen preview"
            className="max-w-full max-h-full object-contain"
          />
          <button
            onClick={() => setPreviewImage(null)}
            className="absolute top-4 right-4 text-white text-2xl hover:text-gray-300"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )

  // ═══════════════════════════════════════════════════════════════════════
  // PROFILE TAB
  // ═══════════════════════════════════════════════════════════════════════
  const ProfileTab = () => {
    // Route profile updates: demo store (non-persisted) vs real store
    const handleProfileUpdate = (updates: Record<string, unknown>) => {
      if (isDemoMode) {
        const current = useDemoStore.getState().demoProfile
        useDemoStore.setState({ demoProfile: { ...current, ...updates } })
      } else {
        updateProfile(updates as any)
      }
      setProfileSavedMsg('Saved')
      setTimeout(() => setProfileSavedMsg(''), 2000)
    }

    // EA Form data for this YA
    const currentEA = getCurrentYearEAForm()
    const previousEA = getPreviousYearEAForm()

    return (
    <ScrollArea className="flex-1 min-h-0">
      <div className="space-y-6 px-3 sm:px-4 pb-8 w-full overflow-x-hidden">
        <div className="flex items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 text-2xl font-bold text-white">
            {displayProfile.name.charAt(0)}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {displayProfile.name}
            </h2>
            <p className=" text-muted-foreground">Tax Resident — Malaysia</p>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="h-4 w-4 text-primary" />
              Personal Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="">Full Name</Label>
              <Input
                ref={nameInputRef}
                defaultValue={displayProfile.name}
                onBlur={() => {
                  const v = nameInputRef.current?.value || displayProfile.name
                  handleProfileUpdate({ name: v })
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const v = nameInputRef.current?.value || displayProfile.name
                    handleProfileUpdate({ name: v })
                  }
                }}
              />
            </div>

            <div className="space-y-2">
              <Label className="">Annual Gross Income (RM)</Label>
              {/* If EA Form confirmed: locked display with re-upload option */}
              {currentEA?.confirmed ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-800 dark:bg-emerald-950/30">
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                      <FileText className="h-3.5 w-3.5" />
                      {formatRM(currentEA.grossIncome)}
                    </div>
                    <div className="mt-0.5 text-xs text-emerald-600 dark:text-emerald-400">
                      EA Form {currentEA.taxYear}{currentEA.employerName ? ` — ${currentEA.employerName}` : ''}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 h-9 text-emerald-600 border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950"
                    onClick={() => eaFormFileRef.current?.click()}
                    disabled={isProcessingEAForm}
                  >
                    <RefreshCw className="h-3.5 w-3.5 mr-1" />
                    Re-upload
                  </Button>
                </div>
              ) : (
                <Input
                  type="number"
                  placeholder="e.g. 60000"
                  defaultValue={currentEA?.grossIncome ?? getPreviousYearEAForm()?.grossIncome ?? ''}
                  onBlur={(e) => {
                    const v = parseFloat(e.target.value) || 0
                    if (v !== (currentEA?.grossIncome ?? getPreviousYearEAForm()?.grossIncome)) {
                      handleProfileUpdate({ grossIncome: v })
                    }
                  }}
                />
              )}
              <p className="text-xs text-muted-foreground">
                For accurate tax bracket and savings estimates
              </p>
            </div>

            {/* EA Form upload — shown when no EA Form confirmed yet */}
            {!currentEA?.confirmed && (
              <div className="space-y-2">
                <Label className="">Upload EA Form for YA {settings.defaultTaxYear} (Optional)</Label>
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2 h-11"
                  onClick={() => eaFormFileRef.current?.click()}
                  disabled={isProcessingEAForm}
                >
                  {isProcessingEAForm ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileText className="h-4 w-4" />
                  )}
                  {isProcessingEAForm ? 'Processing...' : 'Upload EA Form'}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Scan your EA Form to auto-fill gross income & employer
                </p>
              </div>
            )}
            {/* Hidden file input — always mounted so re-upload works */}
            <input
              ref={eaFormFileRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={handleEAFormUpload}
            />
            {/* EA Form status feedback */}
            {eaFormDebug && (
              <div className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                eaFormDebug.startsWith('✅') && "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800",
                eaFormDebug.startsWith('⚠️') && "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800",
                eaFormDebug.startsWith('❌') && "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 border border-red-200 dark:border-red-800",
                eaFormDebug.startsWith('🔍') && "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
              )}>
                {eaFormDebug.startsWith('🔍') && <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin" />}
                {eaFormDebug.startsWith('✅') && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
                {eaFormDebug.startsWith('⚠️') && <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
                {eaFormDebug.startsWith('❌') && <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
                <span>{eaFormDebug.replace(/^[🔍✅⚠️❌]\s*/, '')}</span>
              </div>
            )}

            <div className="space-y-2">
              <Label className="">Marital Status</Label>
              <Select
                value={displayProfile.maritalStatus}
                onValueChange={(v) =>
                  handleProfileUpdate({ maritalStatus: v as any })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">Single</SelectItem>
                  <SelectItem value="married">Married</SelectItem>
                  <SelectItem value="divorced">Divorced</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {displayProfile.maritalStatus === "married" && (
              <>
                <div className="flex items-center justify-between">
                  <Label className="">Spouse Working?</Label>
                  <Switch
                    checked={displayProfile.isSpouseWorking}
                    onCheckedChange={(v) =>
                      handleProfileUpdate({ isSpouseWorking: v })
                    }
                  />
                </div>
                {/* Household Assessment Optimiser */}
                {displayProfile.isSpouseWorking && <HouseholdOptimiserCard
                  spouseIncomeInput={spouseIncomeInput}
                  setSpouseIncomeInput={setSpouseIncomeInput}
                  selectedYear={selectedYear}
                  settings={settings}
                  displayProfile={displayProfile}
                  totalClaimed={totalClaimed}
                />}
              </>
            )}

            <Separator />

            <div className="space-y-2">
              <Label className="">Children (Under 18)</Label>
              <Select
                value={String(displayProfile.childrenUnder18)}
                onValueChange={(v) =>
                  handleProfileUpdate({ childrenUnder18: parseInt(v) })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[0, 1, 2, 3, 4, 5].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="">Children in Higher Education</Label>
              <Select
                value={String(displayProfile.childrenEducation)}
                onValueChange={(v) =>
                  handleProfileUpdate({ childrenEducation: parseInt(v) })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[0, 1, 2, 3, 4, 5].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            <div className="space-y-3">
              <Label className=" font-medium">Disability Status</Label>
              {[
                ["Self", "isDisabled"],
                ...(displayProfile.maritalStatus === "married"
                  ? [["Spouse", "isSpouseDisabled"] as const]
                  : []),
                ["Child", "isChildDisabled"],
              ].map(([label, key]) => (
                <div key={key} className="flex items-center justify-between">
                  <Label className=" font-normal text-muted-foreground">
                    {label}
                  </Label>
                  <Switch
                    checked={profile[key as keyof typeof profile] as boolean}
                    onCheckedChange={(v) => handleProfileUpdate({ [key]: v })}
                  />
                </div>
              ))}
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <Label className="">Dependent Parents / Grandparents?</Label>
              <Switch
                checked={displayProfile.hasParents}
                onCheckedChange={(v) => handleProfileUpdate({ hasParents: v })}
              />
            </div>

            {displayProfile.hasParents && (
              <div className="space-y-2">
                <Label className="">Number of Dependents</Label>
                <Select
                  value={String(displayProfile.parentsCount)}
                  onValueChange={(v) =>
                    handleProfileUpdate({ parentsCount: parseInt(v) })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <Separator />

            <div className="flex items-center justify-between">
              <div>
                <Label className="">First-Time Home Owner?</Label>
                <p className=" text-muted-foreground">
                  For housing loan interest relief
                </p>
              </div>
              <Switch
                checked={displayProfile.isFirstHomeOwner}
                onCheckedChange={(v) =>
                  handleProfileUpdate({ isFirstHomeOwner: v })
                }
              />
            </div>
          </CardContent>
        </Card>

        {profileSavedMsg && (
          <p className="flex items-center justify-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400 transition-all">
            <CheckCircle2 className="h-4 w-4" />
            {profileSavedMsg}
          </p>
        )}

        {/* Sign Out — red button, same style as Save Profile */}
        <button
          onClick={async () => {
            const supabase = createSupabaseBrowserClient()
            if (isDemoMode) clearDemoRecords()
            await supabase.auth.signOut()
            router.push("/")
          }}
          className="h-12 w-full flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 text-base font-semibold text-red-600 transition-colors hover:bg-red-100 hover:border-red-300 dark:border-red-800 dark:bg-red-950 dark:text-red-400 dark:hover:bg-red-900"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </ScrollArea>
  )}

  // ═══════════════════════════════════════════════════════════════════════
  // SETTINGS TAB
  // ═══════════════════════════════════════════════════════════════════════
  const SettingsTab = () => (
    <ScrollArea className="flex-1 min-h-0">
      <div className="space-y-5 px-3 sm:px-4 pb-8 w-full overflow-x-hidden">
        {/* Storage & Backup */}
        <div className="space-y-3">
          <div className="flex items-center gap-2.5 px-1">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
              <HardDrive className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h2 className=" font-semibold text-foreground">Storage & Backup</h2>
          </div>
          <Card className="overflow-hidden border-0 shadow-sm ring-1 ring-border">
            <CardContent className="space-y-5 p-5">
              {isDemoMode ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                    <Info className="h-4 w-4 shrink-0" />
                    Drive sync is disabled in demo mode. Sign in to connect Google Drive.
                  </div>
                  <div className="flex items-center gap-3 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                    <HardDrive className="h-4 w-4 shrink-0 opacity-50" />
                    <span>Demo mode — no cloud sync available</span>
                  </div>
                </div>
              ) : !settings.googleDriveConnected ? (
                <button
                  onClick={handleConnectDrive}
                  className="flex w-full cursor-pointer items-center justify-center gap-3 rounded-lg border border-input bg-white px-5 py-3 text-sm font-medium text-[#1F1F1F] shadow-sm transition-all hover:bg-[#F8F8F8] hover:shadow-md active:scale-[0.99] dark:bg-[#131314] dark:text-white dark:hover:bg-[#1E1E1F]"
                  style={{ minHeight: "48px" }}
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" aria-label="Google Drive">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  <span>Connect Google Drive</span>
                </button>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3.5">
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-sm">
                        <Check className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <p className=" font-semibold text-foreground">Connected</p>
                        <p className=" text-muted-foreground">{settings.googleDriveEmail}</p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 text-red-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                      onClick={handleDisconnectDrive}
                    >
                      <CloudOff className="mr-1.5 h-4 w-4" /> Disconnect
                    </Button>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                    <RefreshCw className="h-3 w-3 shrink-0" />
                    <span>Last synced: {settings.lastSyncTime || "Never"}</span>
                  </div>
                </div>
              )}
              {!isDemoMode && settings.googleDriveConnected && (
                <>
                  <Separator className="bg-border/60" />
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Storage used</span>
                      <span className="font-semibold tabular-nums text-foreground">
                        {driveStorageInfo
                          ? `${driveStorageInfo.used.toLocaleString()} MB / ${driveStorageInfo.total.toLocaleString()} MB`
                          : 'Calculating...'}
                      </span>
                    </div>
                    {driveStorageInfo && (
                      <Progress
                        value={(driveStorageInfo.used / driveStorageInfo.total) * 100}
                        className="h-2.5 bg-muted"
                        indicatorClassName="bg-gradient-to-r from-emerald-400 to-emerald-600"
                      />
                    )}
                    {!driveStorageInfo && (
                      <p className="text-xs text-muted-foreground">
                        Local records: {getLocalStorageSize()}
                      </p>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Notifications */}
        <div className="space-y-3">
          <div className="flex items-center gap-2.5 px-1">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
              <Bell className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h2 className=" font-semibold text-foreground">Notifications</h2>
          </div>
          <Card className="overflow-hidden border-0 shadow-sm ring-1 ring-border">
            <CardContent className="p-0">
              {[
                ["Tax deadline reminders", "taxDeadlineReminders", "Get notified before filing deadlines"],
                ["Low relief utilization alerts", "lowReliefAlerts", "Alert when reliefs are underutilized"],
              ].map(([label, key, desc], i) => (
                <div key={key} className={`${i > 0 ? "border-t border-border/60" : ""}`}>
                  <div className="flex min-h-[56px] items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-muted/30">
                    <div className="min-w-0 flex-1">
                      <p className=" font-medium text-foreground">{label}</p>
                      <p className="mt-0.5 text-sm leading-tight text-muted-foreground">{desc}</p>
                    </div>
                    <Switch
                      checked={settings[key as keyof typeof settings] as boolean}
                      onCheckedChange={(v) => updateSettings({ [key]: v })}
                      className="shrink-0"
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Preferences */}
        <div className="space-y-3">
          <div className="flex items-center gap-2.5 px-1">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
              <Palette className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h2 className=" font-semibold text-foreground">Preferences</h2>
          </div>
          <Card className="overflow-hidden border-0 shadow-sm ring-1 ring-border">
            <CardContent className="space-y-0 p-0">
              {/* Language */}
              <div className="px-5 py-4">
                <div className="flex items-center gap-2.5">
                  <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <Label className=" font-medium text-foreground">{t('language')}</Label>
                </div>
                <Select
                  value={settings.language}
                  onValueChange={(v: any) => updateSettings({ language: v })}
                >
                  <SelectTrigger className="mt-2 h-11 border-border/70 bg-transparent">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="ms">Bahasa Malaysia</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Separator className="bg-border/60" />
              {/* Theme */}
              <div className="px-5 py-4">
                <div className="flex items-center gap-2.5">
                  {mounted &&
                    (settings.themePreference === "dark" ||
                    (settings.themePreference === "system" && theme === "dark") ? (
                      <Moon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <Sun className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ))}
                  <Label className=" font-medium text-foreground">Theme</Label>
                </div>
                <Select
                  value={settings.themePreference}
                  onValueChange={(v: any) => {
                    updateSettings({ themePreference: v })
                    setTheme(v)
                  }}
                >
                  <SelectTrigger className="mt-2 h-11 border-border/70 bg-transparent">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                    <SelectItem value="system">System</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Separator className="bg-border/60" />
              {/* Privacy Mode */}
              <div className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-2.5">
                  <Fingerprint className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div>
                    <Label className="font-medium text-foreground">{t('privacyMode')}</Label>
                    <p className="text-xs text-muted-foreground">{t('privacyModeDesc')}</p>
                  </div>
                </div>
                <Switch
                  checked={settings.privacyMode ?? false}
                  onCheckedChange={(v) => updateSettings({ privacyMode: v })}
                />
              </div>
              <Separator className="bg-border/60" />
              {/* Default Tax Year */}
              <div className="px-5 py-4">
                <div className="flex items-center gap-2.5">
                  <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <Label className=" font-medium text-foreground">Default Tax Year</Label>
                </div>
                <Select
                  value={settings.defaultTaxYear}
                  onValueChange={(v: any) => updateSettings({ defaultTaxYear: v })}
                >
                  <SelectTrigger className="mt-2 h-11 border-border/70 bg-transparent">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: new Date().getFullYear() - 2020 + 1 }, (_, i) => {
                      const year = new Date().getFullYear() - i
                      return (
                        <SelectItem key={year} value={String(year)}>
                          {year}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Data Management */}
        <div className="space-y-3">
          <div className="flex items-center gap-2.5 px-1">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
              <Trash2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h2 className=" font-semibold text-foreground">Data Management</h2>
          </div>
          <Card className="overflow-hidden border-0 shadow-sm ring-1 ring-border">
            <CardContent className="space-y-3 p-5">
              <Button
                variant="outline"
                className="h-11 w-full justify-start gap-3 border-border/70 px-4 font-medium transition-all hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-400"
                onClick={handleExportCSV}
              >
                <Download className="h-4 w-4" /> Export CSV
              </Button>
              <Button
                variant="outline"
                className="h-11 w-full justify-start gap-3 border-border/70 px-4 font-medium transition-all hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-400"
                onClick={handleExportPDF}
              >
                <Download className="h-4 w-4" /> Export PDF Summary
              </Button>
              <Button
                variant="outline"
                className="h-11 w-full justify-start gap-3 border-purple-200 px-4 font-medium text-purple-700 transition-all hover:border-purple-300 hover:bg-purple-50 dark:border-purple-900 dark:text-purple-400 dark:hover:bg-purple-950/30"
                onClick={handleExportTaxReport}
              >
                <FileText className="h-4 w-4" /> Download Tax Report (PDF)
              </Button>
              <Button
                variant="outline"
                className="h-11 w-full justify-start gap-3 border-blue-200 px-4 font-medium text-blue-700 transition-all hover:border-blue-300 hover:bg-blue-50 dark:border-blue-900 dark:text-blue-400 dark:hover:bg-blue-950/30"
                onClick={handleExportLHDN}
              >
                <Download className="h-4 w-4" /> LHDN BE Form Reference (CSV)
              </Button>
              <Button
                variant="outline"
                className="h-11 w-full justify-start gap-3 border-violet-200 px-4 font-medium text-violet-700 transition-all hover:border-violet-300 hover:bg-violet-50 dark:border-violet-900 dark:text-violet-400 dark:hover:bg-violet-950/30"
                onClick={handleBEWorksheet}
              >
                <ExternalLink className="h-4 w-4" /> e-BE Worksheet (MyTax ready)
              </Button>
              <Button
                variant="outline"
                className="h-11 w-full justify-start gap-3 border-emerald-200 px-4 font-medium text-emerald-700 transition-all hover:border-emerald-300 hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
                onClick={handleExportAuditExcel}
              >
                <Download className="h-4 w-4" /> Audit Summary Excel (4-sheet)
              </Button>
              <Button
                variant="outline"
                className="h-11 w-full justify-start gap-3 border-sky-200 px-4 font-medium text-sky-700 transition-all hover:border-sky-300 hover:bg-sky-50 dark:border-sky-900 dark:text-sky-400 dark:hover:bg-sky-950/30"
                onClick={handleDownloadAuditPack}
              >
                <HardDrive className="h-4 w-4" /> Download Audit Pack (PDF + Excel + CSV)
              </Button>
              <Button
                variant="outline"
                className="h-11 w-full justify-start gap-3 border-red-200 px-4 font-medium text-red-600 transition-all hover:border-red-300 hover:bg-red-50 hover:text-red-700 active:bg-red-100 dark:border-red-900 dark:text-red-400 dark:hover:border-red-800 dark:hover:bg-red-950/40 dark:hover:text-red-300"
                onClick={() => setShowDeleteDialog(true)}
              >
                <AlertTriangle className="h-4 w-4" /> Delete All Records
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Audit Vault */}
        <div className="space-y-3">
          <div className="flex items-center gap-2.5 px-1">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/40">
              <Shield className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
            </div>
            <h2 className="font-semibold text-foreground">7-Year Audit Vault</h2>
          </div>
          <Card className="overflow-hidden border-0 shadow-sm ring-1 ring-border">
            <CardContent className="p-5 space-y-3">
              <p className="text-sm text-muted-foreground">
                LHDN requires tax records to be retained for 7 years. Keep your evidence organised and audit-ready.
              </p>
              {/* Per-YA vault cards */}
              <div className="space-y-2">
                {Array.from({ length: 4 }, (_, i) => {
                  const yr = new Date().getFullYear() - i
                  const yrRecords = records.filter((r) => r.date.startsWith(String(yr)))
                  const withReceipt = yrRecords.filter((r) => r.receiptUrl).length
                  const completeness = yrRecords.length > 0 ? Math.round((withReceipt / yrRecords.length) * 100) : 100
                  const retainUntil = `${yr + 7}-04-30`
                  const isCurrentYear = yr === parseInt(settings.defaultTaxYear || String(new Date().getFullYear()))
                  return (
                    <div key={yr} className={cn(
                      "rounded-xl border p-3 space-y-2",
                      isCurrentYear ? "border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20" : "border-border"
                    )}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm">YA {yr}</span>
                          {isCurrentYear && <Badge className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">Current</Badge>}
                        </div>
                        <span className="text-xs text-muted-foreground">Retain until {retainUntil}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{yrRecords.length} records</span>
                        <span>·</span>
                        <span className={completeness === 100 ? 'text-emerald-600' : completeness >= 60 ? 'text-amber-600' : 'text-red-500'}>
                          {completeness}% evidence complete
                        </span>
                      </div>
                      {yrRecords.length > 0 && (
                        <Progress value={completeness} className="h-1.5" />
                      )}
                      {isCurrentYear && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs w-full"
                          onClick={handleExportAuditExcel}
                        >
                          <Download className="h-3.5 w-3.5 mr-1.5" /> Export Excel Audit Summary
                        </Button>
                      )}
                    </div>
                  )
                })}
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Drive sync uploads receipts with LHDN-coded filenames for easy auditor access
              </p>
            </CardContent>
          </Card>
        </div>

        {/* About */}
        <div className="space-y-3">
          <div className="flex items-center gap-2.5 px-1">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
              <Info className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h2 className=" font-semibold text-foreground">About</h2>
          </div>
          {/* ── Email Receipt Forwarding ── */}
          {settings.supabaseUserId && settings.emailForwardingAddress && (
            <Card className="overflow-hidden border-0 shadow-sm ring-1 ring-border">
              <CardHeader className="pb-3 pt-5 px-5">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Bell className="h-4 w-4 text-emerald-500" />
                  Email Receipt Forwarding
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 px-5 pb-5">
                <p className="text-sm text-muted-foreground">
                  Forward any receipt email to this address — attachments are automatically extracted and added as pending records.
                </p>
                <div className="flex items-center gap-2 rounded-xl border bg-muted/40 px-3 py-2.5">
                  <code className="flex-1 text-xs font-mono text-foreground break-all">
                    {settings.emailForwardingAddress}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(settings.emailForwardingAddress)
                      toast("Email address copied!")
                    }}
                    className="shrink-0 rounded-lg border px-2.5 py-1 text-xs font-medium hover:bg-muted"
                  >
                    Copy
                  </button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Recurring Expense Templates ── */}
          <Card className="overflow-hidden border-0 shadow-sm ring-1 ring-border">
            <CardHeader className="pb-3 pt-5 px-5">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarClock className="h-4 w-4 text-indigo-500" />
                  Recurring Expenses
                </CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={() => setShowAddTemplate(true)}
                >
                  <Plus className="mr-1 h-3 w-3" /> Add
                </Button>
              </div>
            </CardHeader>
            <CardContent className="px-5 pb-5 space-y-3">
              {recurringTemplates.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-3">
                  No recurring expenses yet. Add subscriptions, insurance, or gym fees to auto-record them monthly.
                </p>
              ) : (
                <div className="space-y-2">
                  {recurringTemplates.map((t) => {
                    const cat = RELIEF_CATEGORIES.find((c) => c.id === t.category)
                    const nextDate = new Date()
                    nextDate.setDate(t.dayOfMonth)
                    if (nextDate < new Date()) nextDate.setMonth(nextDate.getMonth() + 1)
                    return (
                      <div key={t.id} className="flex items-center gap-3 rounded-xl border px-3.5 py-3">
                        <Switch
                          checked={t.active}
                          onCheckedChange={(v) => updateTemplate(t.id, { active: v })}
                          className="shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{t.merchant}</p>
                          <p className="text-xs text-muted-foreground">
                            RM {t.amount} · {cat?.name || t.category} · day {t.dayOfMonth}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-xs shrink-0">
                          Next: {nextDate.toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })}
                        </Badge>
                        <button
                          onClick={() => deleteTemplate(t.id)}
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}

              {showAddTemplate && (
                <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
                  <p className="text-sm font-medium">New Recurring Expense</p>
                  <div className="space-y-2">
                    <Input
                      placeholder="Merchant (e.g. Netflix, Gym)"
                      value={newTemplate.merchant}
                      onChange={(e) => setNewTemplate({ ...newTemplate, merchant: e.target.value })}
                      className="h-10"
                    />
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        placeholder="Amount (RM)"
                        value={newTemplate.amount}
                        onChange={(e) => setNewTemplate({ ...newTemplate, amount: e.target.value })}
                        className="h-10 flex-1"
                      />
                      <Select
                        value={String(newTemplate.dayOfMonth)}
                        onValueChange={(v) => setNewTemplate({ ...newTemplate, dayOfMonth: parseInt(v) })}
                      >
                        <SelectTrigger className="h-10 w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                            <SelectItem key={d} value={String(d)}>Day {d}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Select
                      value={newTemplate.category}
                      onValueChange={(v) => setNewTemplate({ ...newTemplate, category: v })}
                    >
                      <SelectTrigger className="h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RELIEF_CATEGORIES.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1 h-10"
                      onClick={() => { setShowAddTemplate(false); setNewTemplate({ merchant: '', amount: '', category: 'lifestyle', dayOfMonth: 1, description: '' }) }}
                    >
                      Cancel
                    </Button>
                    <Button
                      className="flex-1 h-10"
                      disabled={!newTemplate.merchant.trim() || !newTemplate.amount}
                      onClick={() => {
                        addTemplate({
                          merchant: newTemplate.merchant.trim(),
                          amount: parseFloat(newTemplate.amount) || 0,
                          category: newTemplate.category,
                          dayOfMonth: newTemplate.dayOfMonth,
                          description: newTemplate.description,
                          active: true,
                        })
                        setShowAddTemplate(false)
                        setNewTemplate({ merchant: '', amount: '', category: 'lifestyle', dayOfMonth: 1, description: '' })
                        toast("Recurring expense added")
                      }}
                    >
                      Save Template
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-0 shadow-sm ring-1 ring-border">
            <CardContent className="space-y-5 p-5">
              <div className="flex items-center gap-3.5">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-md">
                  <span className="text-2xl">🇲🇾</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground">ReliefTrack MY</p>
                  <p className=" text-muted-foreground">Version 1.0.0</p>
                </div>
              </div>
              <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-yellow-50 p-4 dark:border-amber-800/50 dark:from-amber-950/40 dark:to-yellow-950/30">
                <div className="flex items-start gap-3">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-200 dark:bg-amber-800/60">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-700 dark:text-amber-300" />
                  </div>
                  <p className="text-sm leading-relaxed text-amber-800 dark:text-amber-200">
                    This app is for personal tax planning purposes only. Tax relief categories and limits are based on LHDN guidelines. Always verify with LHDN for official eligibility and amounts.
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                {[
                  { label: "Privacy Policy", href: "/privacy" },
                  { label: "Terms of Service", href: "/terms" },
                  { label: "LHDN Official Website", href: "https://www.hasil.gov.my" },
                ].map(({ label, href }) => (
                  <a
                    key={label}
                    href={href}
                    target={href.startsWith("http") ? "_blank" : undefined}
                    rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
                    className="flex min-h-[44px] items-center justify-between rounded-xl px-3.5 text-sm text-foreground transition-all hover:bg-muted/60 active:scale-[0.99]"
                  >
                    <span>{label}</span>
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                  </a>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </ScrollArea>
  )

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════
  return (
    <div className="flex h-[100svh] w-full flex-col bg-background">

      {/* First-run onboarding wizard — shown once, skipped for demo and returning users */}
      {isHydrated && !settings.onboardingComplete && records.length === 0 && !isDemoMode && (
        <OnboardingWizard />
      )}

      {/* Main Content */}
      <main className="flex-1 pt-2 pb-[env(safe-area-inset-bottom)] w-full overflow-y-auto overscroll-contain">
        {activeTab === "dashboard" && <DashboardTab />}
        {activeTab === "records" && <RecordsTab />}
        {activeTab === "profile" && <ProfileTab />}
        {activeTab === "settings" && <SettingsTab />}
      </main>

      {/* ── Add Record Drawer ─────────────────────────────────────────── */}
      <Drawer
        open={isAddModalOpen}
        onOpenChange={(o) => o || closeAddDrawer()}
      >
        <DrawerContent className="max-h-[90vh]">
          <DrawerHeader className="text-left">
            <DrawerTitle>Add New Record</DrawerTitle>
          </DrawerHeader>

          {/* Hidden file inputs — camera and gallery separated */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleFileUpload(f)
              e.target.value = ""
            }}
          />
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleFileUpload(f)
              e.target.value = ""
            }}
          />

          {/* ── OCR Review Dialog ── */}
          {showOcrReview && reviewData && (
            <div className="space-y-4 px-4 pb-4">
              {/* Receipt thumbnail */}
              {receiptPreview && (
                <img
                  src={receiptPreview}
                  alt="Receipt"
                  className="h-20 w-full rounded-xl border border-border object-contain"
                />
              )}

              {/* 3 primary fields */}
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Merchant</Label>
                    {reviewData.vendor && recallCategory(reviewData.vendor) && recallCategory(reviewData.vendor) !== reviewData.category && (
                      <span className="text-xs text-purple-600 dark:text-purple-400">Memory: {RELIEF_CATEGORIES.find(c => c.id === recallCategory(reviewData.vendor))?.name?.split(' ')[0]}</span>
                    )}
                  </div>
                  <Input
                    value={reviewData.vendor}
                    onChange={(e) => {
                      const vendor = e.target.value
                      const remembered = recallCategory(vendor)
                      setReviewData({ ...reviewData, vendor, ...(remembered ? { category: remembered } : {}) })
                    }}
                    className="h-11 font-medium"
                    placeholder="Merchant name"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Amount (RM)</Label>
                  <Input
                    type="number"
                    value={reviewData.amount}
                    onChange={(e) => setReviewData({ ...reviewData, amount: e.target.value })}
                    className="h-11 font-medium"
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Date</Label>
                  <Input
                    type="date"
                    value={reviewData.date}
                    onChange={(e) => setReviewData({ ...reviewData, date: e.target.value })}
                    className="h-11"
                  />
                </div>
              </div>

              {/* Category chip + confidence */}
              <div className="flex items-center justify-between">
                <Select
                  value={reviewData.category}
                  onValueChange={(v) => setReviewData({ ...reviewData, category: v })}
                >
                  <SelectTrigger className="h-8 w-auto gap-1.5 border-emerald-200 bg-emerald-50 px-2.5 text-xs text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                    <Tag className="h-3 w-3 shrink-0" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RELIEF_CATEGORIES.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground">
                  {Math.round(reviewData.confidence * 100)}% confidence
                </span>
              </div>

              {/* Validation warning */}
              {(!reviewData.vendor.trim() || !reviewData.amount) && (
                <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-600 dark:bg-amber-950/30 dark:text-amber-400">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>Merchant and amount are required</span>
                </div>
              )}

              {/* Action buttons */}
              <Button
                className="h-12 w-full text-base font-semibold"
                onClick={handleSaveFromReview}
                disabled={!reviewData.vendor.trim() || !reviewData.amount}
              >
                Save Record
              </Button>
              <Button
                variant="ghost"
                className="h-10 w-full text-sm text-muted-foreground"
                onClick={() => {
                  setNewRecord(prev => ({
                    ...prev,
                    merchant: reviewData.vendor,
                    amount: reviewData.amount,
                    date: reviewData.date,
                    invoiceNumber: reviewData.invoiceNumber,
                    category: reviewData.category,
                  }))
                  setShowOcrReview(false)
                  setShowOCRForm(true)
                }}
              >
                Edit Details ›
              </Button>
            </div>
          )}

          {/* ── QR Scanner overlay ── */}
          {showQrScanner && (
            <QrScanner
              onCancel={() => setShowQrScanner(false)}
              onResult={(result: QrScanResult) => {
                setShowQrScanner(false)
                setReviewData({
                  vendor: result.vendor || '',
                  amount: result.amount ? String(result.amount) : '',
                  date: result.date || `${settings.defaultTaxYear}-${new Date().toISOString().slice(5, 10)}`,
                  description: '',
                  invoiceNumber: result.invoiceNumber || '',
                  confidence: result.uuid ? 100 : 50,
                  rawText: result.rawUrl,
                  category: 'lifestyle',
                })
                setShowOcrReview(true)
              }}
            />
          )}

          {/* Hidden bulk file input */}
          <input
            ref={bulkInputRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files || [])
              if (files.length > 1) {
                setBulkFiles(files)
                setShowBulkQueue(true)
              } else if (files.length === 1) {
                handleFileUpload(files[0])
              }
              e.target.value = ""
            }}
          />

          {/* ── Bulk Queue ── */}
          {showBulkQueue && bulkFiles.length > 0 && (
            <BulkQueue
              files={bulkFiles}
              recallCategory={recallCategory}
              onCancel={() => { setShowBulkQueue(false); setBulkFiles([]) }}
              onDone={(saved, skipped) => {
                setShowBulkQueue(false)
                setBulkFiles([])
                setIsAddModalOpen(false)
                toast.success(`${saved} record${saved !== 1 ? 's' : ''} saved`, {
                  description: skipped > 0 ? `${skipped} skipped` : undefined,
                })
              }}
              onSave={(data) => {
                const id = addRecord({
                  category: data.category,
                  date: data.date,
                  amount: parseFloat(data.amount) || 0,
                  merchant: data.vendor,
                  description: '',
                  status: 'verified',
                  receiptUrl: data.receiptUrl,
                  receiptFileName: data.receiptFileName,
                })
                syncNewRecordToSupabase(id, {
                  category: data.category, date: data.date,
                  amount: parseFloat(data.amount) || 0, merchant: data.vendor,
                  status: 'verified', receiptUrl: data.receiptUrl,
                  receiptFileName: data.receiptFileName,
                })
              }}
            />
          )}

          {/* ── Bank Statement Import ── */}
          {showStatementImport && !showBulkQueue && !showEWalletImport && (
            <StatementImport
              onClose={() => setShowStatementImport(false)}
              onImport={(items) => {
                let count = 0
                let skipped = 0
                items.forEach((item) => {
                  const dupes = findDuplicates({ merchant: item.merchant, amount: item.amount, date: item.date }, displayRecords)
                  if (dupes.length > 0) { skipped++; return }
                  addRecord({
                    category: item.category,
                    date: item.date,
                    amount: item.amount,
                    merchant: item.merchant,
                    description: item.description || 'Bank statement import',
                    status: 'pending',
                    notes: 'Imported from bank statement',
                  })
                  learnMerchant(item.merchant, item.category)
                  count++
                })
                addNotification({
                  type: 'email_receipt',
                  title: `${count} statement records imported`,
                  body: `${count} transactions imported${skipped > 0 ? `, ${skipped} duplicates skipped` : ''}. Review and verify each one.`,
                  actionTab: 'records',
                })
                setIsAddModalOpen(false)
              }}
            />
          )}

          {/* ── e-Wallet Import ── */}
          {showEWalletImport && !showBulkQueue && (
            <div className="space-y-4 p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Import e-Wallet</h3>
                <button onClick={() => setShowEWalletImport(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
              {/* Provider selector */}
              <div className="grid grid-cols-4 gap-1.5">
                {([
                  { id: 'tng',       label: 'TnG' },
                  { id: 'grab',      label: 'GrabPay' },
                  { id: 'boost',     label: 'Boost' },
                  { id: 'shopeepay', label: 'ShopeePay' },
                  { id: 'mae',       label: 'MAE' },
                  { id: 'bigpay',    label: 'BigPay' },
                  { id: 'setel',     label: 'Setel' },
                ] as { id: EWalletProvider; label: string }[]).map(({ id, label }) => (
                  <button
                    key={id}
                    onClick={() => setEwalletProvider(id)}
                    className={cn(
                      "rounded-lg border py-1.5 text-xs font-medium transition-all",
                      ewalletProvider === id
                        ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300"
                        : "border-border text-muted-foreground hover:border-emerald-300"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {/* CSV upload */}
              {ewalletRows.length === 0 ? (
                <Button
                  variant="outline"
                  className="h-20 w-full flex-col gap-2"
                  onClick={() => ewalletFileRef.current?.click()}
                >
                  <Upload className="h-6 w-6 text-primary" />
                  <span className="text-sm">Select CSV export file</span>
                </Button>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{ewalletRows.length} transactions found</span>
                    <button
                      onClick={() => setEwalletSelected(new Set(ewalletRows.map((_, i) => i)))}
                      className="text-emerald-600 hover:underline text-xs"
                    >
                      Select all
                    </button>
                  </div>
                  <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
                    {ewalletRows.map((row, i) => (
                      <div
                        key={i}
                        className={cn(
                          "flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors",
                          ewalletSelected.has(i) ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20" : "border-border"
                        )}
                        onClick={() => {
                          setEwalletSelected((prev) => {
                            const next = new Set(prev)
                            next.has(i) ? next.delete(i) : next.add(i)
                            return next
                          })
                        }}
                      >
                        <div className={cn(
                          "h-4 w-4 shrink-0 rounded border flex items-center justify-center",
                          ewalletSelected.has(i) ? "border-emerald-500 bg-emerald-500" : "border-muted-foreground"
                        )}>
                          {ewalletSelected.has(i) && <Check className="h-2.5 w-2.5 text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{row.merchant}</p>
                          <p className="text-xs text-muted-foreground">{row.date}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold">RM {row.amount.toFixed(2)}</p>
                          <select
                            className="text-xs text-muted-foreground bg-transparent border-none cursor-pointer"
                            value={ewalletEditCategories[i] || row.category}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              e.stopPropagation()
                              setEwalletEditCategories((prev) => ({ ...prev, [i]: e.target.value }))
                            }}
                          >
                            {RELIEF_CATEGORIES.map((cat) => (
                              <option key={cat.id} value={cat.id}>{cat.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Button
                    className="w-full h-11"
                    disabled={ewalletSelected.size === 0}
                    onClick={() => {
                      let count = 0
                      let skipped = 0
                      ewalletSelected.forEach((i) => {
                        const row = ewalletRows[i]
                        const cat = ewalletEditCategories[i] || row.category
                        const dupes = findDuplicates({ merchant: row.merchant, amount: row.amount, date: row.date }, displayRecords)
                        if (dupes.length > 0) { skipped++; return }
                        const id = addRecord({
                          category: cat,
                          date: row.date,
                          amount: row.amount,
                          merchant: row.merchant,
                          description: 'Imported from e-wallet',
                          status: 'verified',
                        })
                        syncNewRecordToSupabase(id, {
                          category: cat, date: row.date, amount: row.amount,
                          merchant: row.merchant, status: 'verified',
                        })
                        count++
                      })
                      toast.success(`${count} records imported${skipped > 0 ? ` · ${skipped} duplicates skipped` : ''}`)
                      setShowEWalletImport(false)
                      setEwalletRows([])
                      setEwalletSelected(new Set())
                      setIsAddModalOpen(false)
                    }}
                  >
                    Import {ewalletSelected.size} Selected
                  </Button>
                </div>
              )}
              <input
                ref={ewalletFileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  const reader = new FileReader()
                  reader.onload = (ev) => {
                    const text = ev.target?.result as string
                    const rows = parseEWalletCSV(text, ewalletProvider)
                    setEwalletRows(rows)
                    setEwalletSelected(new Set(rows.map((_, i) => i)))
                  }
                  reader.readAsText(f)
                  e.target.value = ""
                }}
              />
            </div>
          )}

          {/* ── Upload Options ── */}
          {!isProcessing && !showOcrReview && !showOCRForm && !isVerifying && !showQrScanner && !showBulkQueue && !showEWalletImport && !showStatementImport ? (
            // Upload options
            <div className="space-y-4 p-4">
              {/* Natural-language quick capture */}
              <div className="relative">
                <input
                  type="text"
                  value={nlpInput}
                  onChange={(e) => setNlpInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleNlpCapture() }}
                  placeholder='Try: "paid RM180 dental for mum" or "RM2400 laptop Shopee"'
                  className="w-full rounded-xl border border-violet-200 bg-violet-50/60 px-4 py-3 pr-12 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-violet-400 dark:border-violet-900 dark:bg-violet-950/20"
                />
                <button
                  onClick={handleNlpCapture}
                  disabled={!nlpInput.trim() || isNlpParsing}
                  className="absolute right-3 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500 text-white disabled:opacity-40 hover:bg-violet-600 transition-colors"
                >
                  {isNlpParsing
                    ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    : <Sparkles className="h-3.5 w-3.5" />
                  }
                </button>
              </div>
              <div className="relative">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">or upload</span></div>
              </div>
              <Button
                variant="outline"
                className="h-24 w-full flex-col gap-2"
                onClick={() => cameraInputRef.current?.click()}
              >
                <Camera className="h-8 w-8 text-primary" />
                <span>Take Photo</span>
              </Button>
              <Button
                variant="outline"
                className="h-24 w-full flex-col gap-2"
                onClick={() => galleryInputRef.current?.click()}
              >
                <Upload className="h-8 w-8 text-primary" />
                <span>Upload Image or PDF</span>
              </Button>
              <Button
                variant="outline"
                className="h-24 w-full flex-col gap-2"
                onClick={() => bulkInputRef.current?.click()}
              >
                <div className="relative">
                  <Upload className="h-8 w-8 text-primary" />
                  <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">+</span>
                </div>
                <span>Bulk Upload (Multiple)</span>
              </Button>
              <Button
                variant="outline"
                className="h-24 w-full flex-col gap-2"
                onClick={() => setShowQrScanner(true)}
              >
                <svg className="h-8 w-8 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <path d="M14 14h2v2h-2zM18 14h3M14 18h3M18 18v3M21 18v.01" />
                </svg>
                <span>Scan e-Invoice QR</span>
              </Button>
              <Button
                variant="outline"
                className="h-16 w-full flex-col gap-1"
                onClick={() => setShowEWalletImport(true)}
              >
                <div className="flex items-center gap-2">
                  <svg className="h-5 w-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                    <line x1="1" y1="10" x2="23" y2="10" />
                  </svg>
                  <span className="text-sm">Import e-Wallet CSV</span>
                </div>
                <span className="text-xs text-muted-foreground">TnG · GrabPay · Boost · ShopeePay · MAE · BigPay · Setel</span>
              </Button>
              <Button
                variant="outline"
                className="h-16 w-full flex-col gap-1"
                onClick={() => setShowStatementImport(true)}
              >
                <div className="flex items-center gap-2">
                  <svg className="h-5 w-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="5" width="20" height="14" rx="2" />
                    <path d="M2 10h20M6 15h4M6 13h2" />
                  </svg>
                  <span className="text-sm">Import Bank Statement</span>
                </div>
                <span className="text-xs text-muted-foreground">Maybank · CIMB · Public Bank · RHB · HLB · AmBank</span>
              </Button>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">or</span>
                </div>
              </div>
              <Button
                variant="ghost"
                className="w-full h-12"
                onClick={() => {
                  setNewRecord({
                    category: "lifestyle",
                    date: new Date().toISOString().split("T")[0],
                    amount: "",
                    merchant: "",
                    description: "",
                    invoiceNumber: "",
                    taxAmount: "",
                    lhdNCategory: "",
                    recipient: "",
                  })
                  setShowOCRForm(true)
                }}
              >
                <Pencil className="mr-2 h-4 w-4" /> Enter Manually
              </Button>
            </div>
          ) : isProcessing ? (
            // OCR processing
            <div className="flex flex-col items-center justify-center gap-4 py-12">
              <div className="relative h-20 w-20">
                <div className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
                <div className="absolute inset-2 animate-pulse rounded-full bg-primary/40" />
                <div className="absolute inset-4 flex items-center justify-center rounded-full bg-primary">
                  <FileText className="h-8 w-8 text-primary-foreground" />
                </div>
              </div>
              <div className="text-center">
                <p className="font-medium text-foreground">
                  OCR Processing... {ocrProgress}%
                </p>
                <p className=" text-muted-foreground">
                  Extracting receipt data
                </p>
              </div>
              <Progress value={ocrProgress} className="mx-8 h-2" />
              {ocrResult && (
                <p className="mx-4 text-sm text-muted-foreground">
                  Confidence: {Math.round(ocrResult.confidence)}% —{" "}
                  {ocrResult.raw_text.slice(0, 60)}...
                </p>
              )}
            </div>
          ) : isVerifying ? (
            // Verification in progress
            <div className="flex flex-col items-center justify-center gap-4 py-12">
              <div className="relative h-20 w-20">
                <div className="absolute inset-0 animate-ping rounded-full bg-emerald-500/20" />
                <div className="absolute inset-2 animate-pulse rounded-full bg-emerald-500/40" />
                <div className="absolute inset-4 flex items-center justify-center rounded-full bg-emerald-500">
                  <Shield className="h-8 w-8 text-white" />
                </div>
              </div>
              <div className="text-center">
                <p className="font-medium text-foreground">
                  Verifying with LHDN AI...
                </p>
                <p className=" text-muted-foreground">
                  Checking receipt validity
                </p>
              </div>
              <div className="mx-8 flex items-center gap-2 rounded-lg bg-muted/50 px-4 py-2 text-sm text-muted-foreground">
                Ollama gemma4 • LHDN YA 2025/2026 criteria
              </div>
            </div>
          ) : (
            // OCR result form
            <>
            <div ref={formScrollRef} className="max-h-[60vh] overflow-y-auto px-4">
              <div className="space-y-4 pb-4">
                {/* Verification Result */}
                {verifyResult && (
                  <div
                    className={cn(
                      "flex items-center gap-3 rounded-lg border p-3 text-sm",
                      verifyResult.status === "verified"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
                        : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
                    )}
                  >
                    {verifyResult.status === "verified" ? (
                      <BadgeCheck className="h-5 w-5 shrink-0 text-emerald-500" aria-label="Verified" />
                    ) : (
                      <Clock className="h-5 w-5 shrink-0 text-amber-500" aria-label="Pending review" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {verifyResult.status === "verified"
                          ? "AI Verified"
                          : "Pending Review"}
                        {verifyResult.confidence > 0 && (
                          <span className="ml-2 text-sm font-normal opacity-70">
                            ({Math.round(verifyResult.confidence * 100)}%
                            confidence)
                          </span>
                        )}
                      </p>
                      <p className="truncate text-sm opacity-80">
                        {verifyResult.reason}
                      </p>
                    </div>
                  </div>
                )}

                {/* Receipt preview — camera/gallery split matching Edit Receipt */}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  id="add-camera-upload"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    const reader = new FileReader()
                    reader.onload = (ev) => setReceiptPreview(ev.target?.result as string)
                    reader.readAsDataURL(file)
                    setUploadedFileName(file.name)
                    e.target.value = ""
                  }}
                />
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  id="add-gallery-upload"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    const reader = new FileReader()
                    reader.onload = (ev) => setReceiptPreview(ev.target?.result as string)
                    reader.readAsDataURL(file)
                    setUploadedFileName(file.name)
                    e.target.value = ""
                  }}
                />
                {receiptPreview ? (
                  <div className="space-y-2">
                    <img src={receiptPreview} alt="Receipt" className="h-32 w-full object-contain rounded-lg border border-dashed border-gray-300" />
                    <div className="flex gap-2">
                      <label
                        htmlFor="add-camera-upload"
                        className="flex-1 flex items-center justify-center gap-2 h-10 rounded-lg border border-gray-300 bg-white text-sm cursor-pointer hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-700"
                      >
                        <Camera className="h-4 w-4" /> Take Photo
                      </label>
                      <label
                        htmlFor="add-gallery-upload"
                        className="flex-1 flex items-center justify-center gap-2 h-10 rounded-lg border border-gray-300 bg-white text-sm cursor-pointer hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-700"
                      >
                        <Upload className="h-4 w-4" /> Gallery
                      </label>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <label
                      htmlFor="add-camera-upload"
                      className="flex flex-col items-center justify-center w-full h-20 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <Camera className="h-6 w-6 text-gray-400" />
                      <span className="text-sm text-gray-500 mt-1">Take Photo</span>
                    </label>
                    <label
                      htmlFor="add-gallery-upload"
                      className="flex flex-col items-center justify-center w-full h-20 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <Upload className="h-6 w-6 text-gray-400" />
                      <span className="text-sm text-gray-500 mt-1">Upload from Gallery</span>
                    </label>
                  </div>
                )}

                {/* Category */}
                <div className="space-y-1">
                  <Label className="">Category <span className="text-red-500">*</span></Label>
                  <Select
                    value={newRecord.category}
                    onValueChange={(v) =>
                      setNewRecord({ ...newRecord, category: v, lhdNCategory: "" })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RELIEF_CATEGORIES.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Subcategory (required for categories with sub-items) */}
                {RELIEF_CATEGORIES.find(c => c.id === newRecord.category)?.subcategories && RELIEF_CATEGORIES.find(c => c.id === newRecord.category)!.subcategories!.length > 0 && (
                  <div className="space-y-1">
                    <Label className="">Subcategory <span className="text-red-500">*</span></Label>
                    <Select
                      value={newRecord.lhdNCategory || ""}
                      onValueChange={(v) =>
                        setNewRecord({ ...newRecord, lhdNCategory: v })
                      }
                    >
                      <SelectTrigger className={!newRecord.lhdNCategory ? 'border-2 border-red-500' : ''}>
                        <SelectValue placeholder="Select subcategory" />
                      </SelectTrigger>
                      <SelectContent>
                        {RELIEF_CATEGORIES.find(c => c.id === newRecord.category)!.subcategories!.map((sub) => (
                          <SelectItem key={sub.id} value={sub.id}>
                            {sub.name}{sub.maxLimit > 0 ? ` (Max RM ${sub.maxLimit.toLocaleString()})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Date */}
                <div className="space-y-1">
                  <Label className="">Date</Label>
                  <Input
                    type="date"
                    value={newRecord.date}
                    onChange={(e) =>
                      setNewRecord({ ...newRecord, date: e.target.value })
                    }
                  />
                </div>

                {/* Amount */}
                <div className="space-y-1">
                  <Label className="">Amount (RM) <span className="text-red-500">*</span></Label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={newRecord.amount}
                    onChange={(e) => {
                      setNewRecord({ ...newRecord, amount: e.target.value })
                      if (formErrors.amount) setFormErrors({ ...formErrors, amount: false })
                    }}
                    className={formErrors.amount ? 'border-2 border-red-500' : ''}
                  />
                </div>

                {/* Merchant */}
                <div className="space-y-1">
                  <Label className="">Merchant / Provider <span className="text-red-500">*</span></Label>
                  <Input
                    placeholder="Enter merchant name"
                    value={newRecord.merchant}
                    onChange={(e) => {
                      setNewRecord({ ...newRecord, merchant: e.target.value })
                      if (formErrors.merchant) setFormErrors({ ...formErrors, merchant: false })
                    }}
                    className={formErrors.merchant ? 'border-2 border-red-500' : ''}
                  />
                </div>

                {/* Description */}
                <div className="space-y-1">
                  <Label className="">Description / Notes</Label>
                  <Input
                    placeholder="Additional details (optional)"
                    value={newRecord.description || ''}
                    onChange={(e) => setNewRecord({ ...newRecord, description: e.target.value })}
                  />
                </div>

                {/* Invoice Number */}
                <div className="space-y-1">
                  <Label className="">Invoice / Receipt No.</Label>
                  <Input
                    placeholder="INV-00001"
                    value={newRecord.invoiceNumber}
                    onChange={(e) =>
                      setNewRecord({ ...newRecord, invoiceNumber: e.target.value })
                    }
                    className="font-mono text-sm"
                  />
                </div>

                {/* EPF/SOCSO — contribution type selector */}
                {newRecord.category === 'epf_insurance' && (
                  <div className="space-y-1">
                    <Label className="">Contribution Type</Label>
                    <Select
                      value={newRecord.recipient || 'auto'}
                      onValueChange={(v) => setNewRecord({ ...newRecord, recipient: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="employer">Employer Contribution</SelectItem>
                        <SelectItem value="employee">Employee / Self</SelectItem>
                        <SelectItem value="voluntary">Voluntary / PRS</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Medical — patient name when serious disease or fertility */}
                {(newRecord.lhdNCategory === 'medical_diseases' || newRecord.lhdNCategory === 'medical_fertility') && (
                  <div className="space-y-1">
                    <Label className="">Patient Name</Label>
                    <Input
                      placeholder="Who received treatment?"
                      value={newRecord.description || ''}
                      onChange={(e) => setNewRecord({ ...newRecord, description: e.target.value })}
                    />
                  </div>
                )}

                {/* Housing loan — bank name as merchant */}
                {newRecord.category === 'housing_loan' && (
                  <div className="space-y-1">
                    <Label className="">Bank / Loan Provider</Label>
                    <Input
                      placeholder="e.g. Bank Islam, Maybank"
                      value={newRecord.merchant}
                      onChange={(e) => setNewRecord({ ...newRecord, merchant: e.target.value })}
                    />
                  </div>
                )}

                {/* Tax Amount */}
                <div className="space-y-1">
                  <Label className="">Tax (RM)</Label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={newRecord.taxAmount}
                    onChange={(e) =>
                      setNewRecord({ ...newRecord, taxAmount: e.target.value })
                    }
                  />
                </div>

                {/* Recipient */}
                <div className="space-y-1">
                  <Label className="">Recipient</Label>
                  <Select
                    value={newRecord.recipient}
                    onValueChange={(v) =>
                      setNewRecord({ ...newRecord, recipient: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Auto-detected" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto-detect</SelectItem>
                      <SelectItem value="self">Self</SelectItem>
                      <SelectItem value="spouse">Spouse</SelectItem>
                      <SelectItem value="child">Child</SelectItem>
                      <SelectItem value="parent">Parent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* LHDN Category Badge (auto-detected, prominent) */}
                {newRecord.lhdNCategory && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-950/30">
                    <div className="flex items-center gap-2">
                      <BadgeCheck className="h-4 w-4 text-emerald-500" />
                      <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                        LHDN Tax Deduction:
                      </span>
                      <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300">
                        {newRecord.lhdNCategory}
                      </Badge>
                    </div>
                    {newRecord.recipient && (
                      <p className="mt-1 text-sm text-emerald-600 dark:text-emerald-400">
                        For: {newRecord.recipient}
                      </p>
                    )}
                  </div>
                )}

              </div>
            </div>
            {/* Sticky footer - always visible */}
            <DrawerFooter className="flex gap-2 border-t bg-background p-4">
              <DrawerClose asChild>
                <Button variant="outline" className="flex-1" onClick={closeAddDrawer}>
                  Cancel
                </Button>
              </DrawerClose>
              <Button className="flex-1" onClick={handleSaveRecord}>
                Save to Records
              </Button>
            </DrawerFooter>
            </>
          )}
        </DrawerContent>
      </Drawer>

      {/* Delete All Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" /> Delete All Records
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. All your tax relief records and
              receipts will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleDeleteAll}
            >
              Delete All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete One Confirmation Dialog */}
      <AlertDialog open={!!deleteOneId} onOpenChange={(o) => !o && setDeleteOneId(null)}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" /> Delete Record
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This tax relief record will be
              permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteOneId(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={confirmDeleteOne}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Year of Assessment Picker ── */}
      <Dialog open={yearPickerOpen} onOpenChange={setYearPickerOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Select Year of Assessment</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-2">
            {['2023', '2024', '2025', '2026', '2027'].map((yr) => (
              <button
                key={yr}
                onClick={() => {
                  updateSettings({ defaultTaxYear: yr })
                  setYearPickerOpen(false)
                }}
                className={cn(
                  "flex items-center justify-between rounded-lg border px-4 py-3 text-sm font-medium transition-colors",
                  settings.defaultTaxYear === yr
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                    : "border-border hover:bg-muted"
                )}
              >
                <span>YA {yr}</span>
                {settings.defaultTaxYear === yr && <Check className="h-4 w-4" />}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground pb-1">Records and tax calculations update to match the selected year.</p>
        </DialogContent>
      </Dialog>

      {/* ── EA Form Confirmation Drawer ── */}
      <Drawer open={eaFormDialogOpen} onOpenChange={(open) => { setEaFormDialogOpen(open); if (!open) setEaFormVerifyResult(null) }}>
        <DrawerContent className="max-h-[85vh] flex flex-col">
          <DrawerHeader className="text-left border-b pb-4">
            <DrawerTitle className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <FileText className="h-5 w-5" />
              EA Form Detected
            </DrawerTitle>
          </DrawerHeader>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {/* Verification banner */}
            {eaFormData && eaFormVerifyResult && (
              eaFormVerifyResult.status === 'verified' ? (
                <div className="mx-2 flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
                  <BadgeCheck className="h-5 w-5 shrink-0 text-emerald-500" aria-label="Verified" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">EA Form Verified</p>
                    <p className="text-xs opacity-80">All fields check out · {Math.round(eaFormVerifyResult.confidence * 100)}% confidence</p>
                  </div>
                </div>
              ) : (
                <div className="mx-2 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                  <AlertCircle className="h-5 w-5 shrink-0 text-amber-500 mt-0.5" aria-label="Needs review" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">Some fields need review</p>
                    <p className="text-xs opacity-80">{eaFormVerifyResult.reason}</p>
                  </div>
                </div>
              )
            )}
            {/* Detected amounts — tappable list */}
            {eaFormData && eaFormData._debugAmounts && eaFormData._debugAmounts.length > 0 && (
              <div className="space-y-1">
                <Label className="text-sm font-medium">Select Annual Gross Income</Label>
                <p className="text-xs text-muted-foreground">Tap the correct amount</p>
                <div className="mt-2 space-y-1">
                  {eaFormData._debugAmounts.slice(0, 8).map((a: { amount: number; raw: string }, i: number) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        if (eaFormData) {
                          setEaFormData({ ...eaFormData, grossIncome: a.amount })
                        }
                      }}
                      className={cn(
                        "w-full flex items-center justify-between rounded-lg border px-3 py-3 text-sm transition-all active:scale-95",
                        a.amount === eaFormData?.grossIncome
                          ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 font-semibold"
                          : "border-gray-200 hover:border-emerald-300 hover:bg-emerald-50/50 dark:border-gray-700 dark:hover:bg-emerald-950/20"
                      )}
                    >
                      <span className="font-mono text-xs text-muted-foreground">{a.raw}</span>
                      <span className="font-medium">RM {a.amount.toLocaleString()}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Detected details */}
            {eaFormData && (
              <div className="rounded-lg bg-muted/50 p-3 space-y-2 text-sm">
                <div className={cn("flex justify-between", eaFormVerifyResult?.ambiguousFields.includes('taxYear') && "bg-amber-50 dark:bg-amber-950/20 -mx-2 px-2 rounded")}>
                  <span className="text-muted-foreground">Tax Year</span>
                  <span className="font-medium">{eaFormData.taxYear || new Date().getFullYear()}</span>
                </div>
                {/* Captured deductions — highlighted for verification */}
                {eaFormData.epfContribution > 0 && (
                  <div className={cn("flex justify-between", eaFormVerifyResult?.ambiguousFields.includes('epfContribution') && "bg-amber-50 dark:bg-amber-950/20 -mx-2 px-2 rounded")}>
                    <span className="text-muted-foreground">EPF (Employee)</span>
                    <span className="font-medium text-indigo-600 dark:text-indigo-400">{formatRM(eaFormData.epfContribution)}</span>
                  </div>
                )}
                {eaFormData.socsoContribution > 0 && (
                  <div className={cn("flex justify-between", eaFormVerifyResult?.ambiguousFields.includes('socsoContribution') && "bg-amber-50 dark:bg-amber-950/20 -mx-2 px-2 rounded")}>
                    <span className="text-muted-foreground">SOCSO</span>
                    <span className="font-medium text-indigo-600 dark:text-indigo-400">{formatRM(eaFormData.socsoContribution)}</span>
                  </div>
                )}
                {eaFormData.pcbPaid > 0 && (
                  <div className={cn("flex justify-between", eaFormVerifyResult?.ambiguousFields.includes('pcbPaid') && "bg-amber-50 dark:bg-amber-950/20 -mx-2 px-2 rounded")}>
                    <span className="text-muted-foreground">PCB Paid</span>
                    <span className="font-medium text-indigo-600 dark:text-indigo-400">{formatRM(eaFormData.pcbPaid)}</span>
                  </div>
                )}
                {eaFormData.kwspMemberId && eaFormData.kwspMemberId.trim() && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">KWSP Member ID</span>
                    <span className="font-mono font-medium">{eaFormData.kwspMemberId}</span>
                  </div>
                )}
                {eaFormData.lhdnTin && eaFormData.lhdnTin.trim() && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">LHDN TIN</span>
                    <span className="font-mono font-medium">{eaFormData.lhdnTin}</span>
                  </div>
                )}
                {eaFormData.eaFormNumber && eaFormData.eaFormNumber.trim() && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">EA Form No.</span>
                    <span className="font-mono font-medium">{eaFormData.eaFormNumber}</span>
                  </div>
                )}
                <div className={cn("flex justify-between border-t pt-2 mt-2", eaFormVerifyResult?.ambiguousFields.includes('grossIncome') && "bg-amber-50 dark:bg-amber-950/20 -mx-2 px-2 rounded")}>
                  <span className="text-muted-foreground font-semibold">Gross Income</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    {eaFormData.grossIncome ? formatRM(eaFormData.grossIncome) : '—'}
                  </span>
                </div>
              </div>
            )}



            <p className="text-xs text-muted-foreground px-1">
              This will auto-fill your gross income in the profile. EPF and SOCSO are used for tax calculation.
            </p>
          </div>

          <DrawerFooter className="shrink-0 flex gap-2 border-t pt-4">
            <DrawerClose asChild>
              <Button variant="outline" className="flex-1 h-12 text-base">
                Cancel
              </Button>
            </DrawerClose>
            <Button
              onClick={confirmEAFormData}
              className="flex-1 h-12 text-base bg-emerald-600 hover:bg-emerald-700"
            >
              <BadgeCheck className="h-4 w-4 mr-1" />
              Confirm & Apply
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* ── Notification Center Sheet ── */}
      <Sheet open={showNotifications} onOpenChange={(v) => !v && setShowNotifications(false)}>
        <SheetContent side="right" className="w-full sm:w-[380px] p-0 flex flex-col">
          <SheetHeader className="px-4 py-3 border-b">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-base font-semibold">Notifications</SheetTitle>
              {notifications.length > 0 && (
                <button
                  onClick={markAllNotificationsRead}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Mark all read
                </button>
              )}
            </div>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground py-16">
                <Bell className="h-10 w-10 opacity-30" />
                <p className="text-sm font-medium">All caught up</p>
                <p className="text-xs opacity-70">No notifications yet</p>
              </div>
            ) : (
              <div className="divide-y">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`flex items-start gap-3 px-4 py-3 transition-colors ${n.read ? '' : 'bg-blue-50 dark:bg-blue-950/20'}`}
                  >
                    <div className="mt-0.5 text-lg shrink-0">
                      {n.type === 'milestone' ? '🏆' : n.type === 'reminder' ? '📅' : n.type === 'recurring' ? '🔄' : n.type === 'tip' ? '💡' : '📬'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${n.read ? 'text-foreground' : 'text-foreground'}`}>{n.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{n.body}</p>
                      <p className="text-[10px] text-muted-foreground/60 mt-1">
                        {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                    <button
                      onClick={() => markNotificationRead(n.id)}
                      className="text-muted-foreground/40 hover:text-muted-foreground shrink-0 mt-0.5"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {notifications.length > 0 && (
            <div className="px-4 py-3 border-t">
              <button
                onClick={clearNotifications}
                className="text-xs text-red-400 hover:text-red-600 w-full text-center"
              >
                Clear all notifications
              </button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Duplicate Warning AlertDialog ── */}
      <AlertDialog open={!!duplicateWarning} onOpenChange={(o) => !o && setDuplicateWarning(null)}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" /> Possible Duplicate
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p>This looks similar to an existing record:</p>
                <div className="mt-2 space-y-1">
                  {(duplicateWarning?.dupes ?? []).slice(0, 3).map((d) => (
                    <div key={d.id} className="rounded-md bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs">
                      <span className="font-medium">{d.merchant}</span>
                      {' · '}{formatRM(d.amount)}{' · '}{d.date}
                    </div>
                  ))}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDuplicateWarning(null)}>Discard</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 hover:bg-amber-700"
              onClick={() => {
                duplicateWarning?.pendingFn()
                setDuplicateWarning(null)
              }}
            >
              Save Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── AI Tax Assistant ── */}
      <TaxAssistant
        open={showTaxAssistant}
        onClose={() => setShowTaxAssistant(false)}
        context={{
          taxYear: settings.defaultTaxYear,
          grossIncome: displayProfile.grossIncome || 0,
          totalClaimed: totalClaimed,
          totalPossible: totalPossible,
          estimatedSavings: estimatedSavings,
          reliefTotals: reliefTotals,
          profileName: displayProfile.name || 'there',
          maritalStatus: displayProfile.maritalStatus || 'single',
          childrenUnder18: displayProfile.childrenUnder18 || 0,
          childrenEducation: displayProfile.childrenEducation || 0,
          hasParents: !!displayProfile.hasParents,
          isFirstHomeOwner: !!displayProfile.isFirstHomeOwner,
          recordCount: displayRecords.filter(r => r.date.startsWith(settings.defaultTaxYear)).length,
          pcbPaid: displayProfile.pcbPaid || 0,
          chargeableIncome: Math.max(0, (displayProfile.grossIncome || 0) - (displayProfile.epfContribution || 0) - totalClaimed),
          isDemo: isDemoMode,
          demoSessionId,
        }}
      />

      {/* ── Floating Ask AI Button (dashboard tab only) ── */}
      {activeTab === 'dashboard' && (
        <button
          onClick={() => setShowTaxAssistant(true)}
          className="fixed bottom-[calc(8vh+env(safe-area-inset-bottom)+12px)] right-4 z-40 flex items-center gap-2 rounded-full bg-gradient-to-r from-purple-600 to-violet-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
        >
          <BrainCircuit className="h-4 w-4" />
          Ask AI
        </button>
      )}

      {/* ── Bottom Navigation ── */}
      <nav className="sticky bottom-0 border-t border-border bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        <div className="relative flex h-[8vh] min-h-[56px] flex-row items-center px-2 sm:px-4">
          {/* Dashboard */}
          <button
            onClick={() => { setActiveTab("dashboard"); router.push(pathname + "?tab=dashboard") }}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 flex-1 py-2 transition-colors",
              activeTab === "dashboard"
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Home className="h-5 w-5 sm:h-6 sm:w-6" />
            <span className="text-[10px] font-medium leading-tight sm:text-xs">Dashboard</span>
          </button>

          {/* Records */}
          <button
            onClick={() => { setActiveTab("records"); router.push(pathname + "?tab=records") }}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 flex-1 py-2 transition-colors",
              activeTab === "records"
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <FileText className="h-5 w-5 sm:h-6 sm:w-6" />
            <span className="text-[10px] font-medium leading-tight sm:text-xs">Records</span>
          </button>

          {/* FAB — centered, as part of the flex row */}
          <button
            onClick={() => {
              if (isDemoMode) {
                toast("Cannot add records in demo mode")
                return
              }
              setIsAddModalOpen(true)
            }}
            className={cn(
              "flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg transition-transform hover:scale-105 active:scale-95 flex-1 sm:max-w-[64px]",
              isDemoMode ? "opacity-40 cursor-not-allowed" : ""
            )}
            aria-label="Add new record"
          >
            <Plus className="h-6 w-6" />
          </button>

          {/* Profile */}
          <button
            onClick={() => { setActiveTab("profile"); router.push(pathname + "?tab=profile") }}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 flex-1 py-2 transition-colors",
              activeTab === "profile"
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <User className="h-5 w-5 sm:h-6 sm:w-6" />
            <span className="text-[10px] font-medium leading-tight sm:text-xs">Profile</span>
          </button>

          {/* Settings */}
          <button
            onClick={() => { setActiveTab("settings"); router.push(pathname + "?tab=settings") }}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 flex-1 py-2 transition-colors",
              activeTab === "settings"
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Settings className="h-5 w-5 sm:h-6 sm:w-6" />
            <span className="text-[10px] font-medium leading-tight sm:text-xs">Settings</span>
          </button>
        </div>
      </nav>
    </div>
  )
}
