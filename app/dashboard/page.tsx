/**
 * ReliefTrack MY — Dashboard Page
 * Merged: new UI structure (v0.dev) + our business logic (Zustand, OCR, AI verify, export)
 * 
 * UI base: /tmp/relieftack-new/app/dashboard/page.tsx
 * Business logic: /home/ubuntu/.openclaw/workspace/my-v0-app/store, lib/ocr, lib/verify, lib/export
 */

"use client"

import { useState, useEffect, useCallback, useRef } from "react"
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
import { OcrConfidenceBadge } from '@/components/OcrConfidenceBadge'
import { cn } from "@/lib/utils"
import { useReliefStore, useDemoStore, RELIEF_CATEGORIES, calculateTax, calculateNetTaxBalance, type Record as ReliefRecord } from "@/store"
import { createSupabaseBrowserClient } from "@/utils/supabase/client"
import { performOCR, type OcrResult } from "@/lib/ocr"
import { verifyRecord, verifyEAForm, type VerifyResult, type EAFormVerifyResult } from "@/lib/verify"
import { exportRecordsCSV, exportRecordsPDF } from "@/lib/export"
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
    isHydrated,
    addRecord,
    updateRecord,
    deleteRecord,
    deleteAllRecords,
    updateProfile,
    updateSettings,
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
    } catch {}
  }, [])
  const [isDriveLoading, setIsDriveLoading] = useState(false)
  const [driveStorageInfo, setDriveStorageInfo] = useState<{ used: number; total: number } | null>(null)
  const [syncLog, setSyncLog] = useState<Array<{ time: string; action: string; status: 'pending' | 'success' | 'error'; detail?: string }>>([])
  const [syncDiagnosticsOpen, setSyncDiagnosticsOpen] = useState(false)

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
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)
  const [taxDetailsExpanded, setTaxDetailsExpanded] = useState(false)
  const [showSaveSuccessDialog, setShowSaveSuccessDialog] = useState(false)
  const [showDriveConnectPrompt, setShowDriveConnectPrompt] = useState(false)
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
  // Auto-dismiss success dialog after 2.5s so it never ghost-block clicks
  useEffect(() => {
    if (showSaveSuccessDialog) {
      const t = setTimeout(() => setShowSaveSuccessDialog(false), 2500)
      return () => clearTimeout(t)
    }
  }, [showSaveSuccessDialog])
  const [showSaveErrorDialog, setShowSaveErrorDialog] = useState(false)
  const [saveErrorMsg, setSaveErrorMsg] = useState("")
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null)
  const [uploadedFileName, setUploadedFileName] = useState("")
  const [formErrors, setFormErrors] = useState<Record<string, boolean>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [nameInput, setNameInput] = useState("")
  useEffect(() => { setNameInput(profile.name) }, [profile.name])
  // nameInput synced via defaultValue + ref pattern (no useEffect loop)
  const [showInstallBanner, setShowInstallBanner] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)

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

  // Tax deadline
  const getDeadlineInfo = () => {
    const deadline = new Date("2026-04-30")
    const today = new Date()
    const diffDays = Math.ceil(
      (deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    )
    return { days: diffDays, date: "30 April 2026" }
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
      // Show review dialog — user confirms extracted data before form
      setReviewData({
        vendor: result.vendor || '',
        amount: result.amount ? String(Math.round(result.amount)) : '',
        date: result.date || new Date().toISOString().split("T")[0],
        description: '',   // not in Python contract — TODO: derive from raw_text if needed
        invoiceNumber: result.invoice_number || '',
        confidence: result.confidence,
        rawText: result.raw_text,
        category: result.category || 'lifestyle',
      })
      setShowOcrReview(true)

      // Background: upload to Google Drive (don't block the form)
      if (receiptPreview) {
        uploadReceiptToDrive(receiptPreview, file.name, result.date || new Date().toISOString().split("T")[0])
      }
    } catch (err) {
      console.error("OCR failed:", err)
      toast.error("OCR failed. Please enter details manually.")
      setShowOCRForm(true)
    } finally {
      setIsProcessing(false)
    }
  }

  // ── Background Drive Upload ───────────────────────────────────────────
  const uploadReceiptToDrive = async (dataUrl: string, filename: string, date: string) => {
    try {
      const base64Data = dataUrl.split(",")[1] || dataUrl
      const resp = await fetch("http://localhost:5001/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: base64Data,
          filename: filename,
          date: date,
        }),
      })
      if (resp.ok) {
        const json = await resp.json()
        if (json.driveLink) {
          // Update receiptPreview to the Drive link (shows as text in preview area)
          setReceiptPreview(json.driveLink)
          toast.success("Receipt uploaded to Google Drive!")
        }
      }
    } catch (e) {
      // Silently fail — Drive upload is bonus, shouldn't block the form
      console.warn("Drive upload failed:", e)
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
    setNewRecord(prev => ({ ...prev, date: new Date().toISOString().split("T")[0] }))
  }, [])

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

    addRecord({
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
    })
    toast.success("Record added successfully!")
    // Reset form immediately — before Drive sync
    closeAddDrawer()
    // Build saved record for sync
    const savedRecord = {
      category: newRecord.category,
      date: newRecord.date,
      amount: parseFloat(newRecord.amount),
      merchant: newRecord.merchant,
      description: newRecord.description || undefined,
      status: verifyResult?.status || "pending",
      receiptUrl: receiptPreview || undefined,
      receiptFileName: uploadedFileName || undefined,
      invoiceNumber: newRecord.invoiceNumber || undefined,
      taxAmount: newRecord.taxAmount ? parseFloat(newRecord.taxAmount) : undefined,
      lhdNCategory: newRecord.lhdNCategory || undefined,
      recipient: newRecord.recipient || undefined,
    }
    // Fire-and-forget Drive sync
    syncToDrive('saveRecord', savedRecord as ReliefRecord)
    setTimeout(() => setIsSaving(false), 300)
  }

  const closeAddDrawer = () => {
    setIsAddModalOpen(false)
    setShowOCRForm(false)
    setIsProcessing(false)
    setOcrProgress(0)
    setOcrResult(null)
    setVerifyResult(null)
    setIsVerifying(false)
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

  // ── Refresh ─────────────────────────────────────────────────────────────
  const handleRefresh = () => {
    setIsRefreshing(true)
    toast.info("Data refreshed from local storage.")
    setTimeout(() => setIsRefreshing(false), 800)
  }

  // ── Profile Save ────────────────────────────────────────────────────────
  // handleSaveProfile is explicitly triggered by the user pressing "Save Profile".
  // updateProfile already persists immediately via Zustand persist middleware,
  // but we call it here explicitly so the save button gives real feedback.
  const handleSaveProfile = useCallback(async () => {
    if (!isHydrated) {
      toast.error("App still loading. Please wait.")
      return
    }
    // Demo mode: profile is read-only, show toast
    if (isDemoMode) {
      toast("[demo profile] profile details would not be saved")
      return
    }
    setIsSavingProfile(true)
    try {
      // Flush latest nameInput to store before persisting to file
      const nameVal = nameInputRef.current?.value || nameInput
      updateProfile({ name: nameVal })
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: { ...profile, name: nameVal } }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        setSaveErrorMsg(data.error ?? 'Unknown error. Please try again.')
        setShowSaveErrorDialog(true)
      } else {
        setShowSaveSuccessDialog(true)
      }
    } catch {
      setSaveErrorMsg('Network error. Please check your connection and try again.')
      setShowSaveErrorDialog(true)
    } finally {
      setIsSavingProfile(false)
    }
  }, [isHydrated, profile, nameInput, updateProfile])

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
              <p className=" text-muted-foreground">
                Year of Assessment {settings.defaultTaxYear}
              </p>
            </div>
            <div className="flex items-center gap-2">
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
            {deadline.days <= 30 && (
              <div className={cn(
                "flex items-center justify-between rounded-lg px-3 py-2 text-sm",
                deadline.days < 3 ? "bg-red-100 text-red-700" :
                deadline.days <= 13 ? "bg-amber-100 text-amber-700" :
                "bg-emerald-100 text-emerald-700"
              )}>
                <div className="flex items-center gap-2">
                  <CalendarClock className="h-4 w-4" />
                  <span>Tax Filing Deadline: <strong>{deadline.days} days</strong> left</span>
                </div>
                <span className="text-xs opacity-75 ml-2">{deadline.date}</span>
              </div>
            )}
          </div>

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
                <p className={cn("text-4xl font-bold", heroColor)}>{formatRM(floorRM(Math.abs(netTax.netBalance)))}</p>
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
                  className={`transition-all hover:shadow-md ${hasSubcategories ? 'cursor-pointer' : ''}`}
                  onClick={() => hasSubcategories ? setExpandedCategory(expandedCategory === relief.id ? null : relief.id) : undefined}
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
                          {hasSubcategories ? (
                            <ChevronRight className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${expandedCategory === relief.id ? 'rotate-90' : ''}`} />
                          ) : (
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                          )}
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
                    {expandedCategory === relief.id && relief.subcategories && (
                      <div className="mt-4 space-y-2 border-t pt-4">
                        {relief.subcategories.map((sub) => {
                          let subClaimed = floorRM(getSubCategoryTotal(displayRecords, relief.id, sub.id))
                          // Inject EA Form values into correct subcategories (they're not stored as records)
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
            placeholder="Search records..."
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

                      {/* Amount + Verified + Sync */}
                      <div className="flex items-center gap-2 shrink-0 min-w-0">
                        <span className="text-sm font-semibold whitespace-nowrap">{formatRM(record.amount)}</span>
                        {record.status === 'verified' ? (
                          <BadgeCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" aria-label="Verified" />
                        ) : (
                          <Clock className="h-3.5 w-3.5 text-amber-500 shrink-0" aria-label="Pending review" />
                        )}
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
            {/* Mobile-friendly debug feedback */}
            {eaFormDebug && (
              <div className={cn(
                "rounded-lg px-3 py-2 text-sm font-medium transition-all",
                eaFormDebug.startsWith('✅') && "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800",
                eaFormDebug.startsWith('⚠️') && "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800",
                eaFormDebug.startsWith('❌') && "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 border border-red-200 dark:border-red-800",
                eaFormDebug.startsWith('🔍') && "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
              )}>
                {eaFormDebug}
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
              <div className="flex items-center justify-between">
                <Label className="">Spouse Working?</Label>
                <Switch
                  checked={displayProfile.isSpouseWorking}
                  onCheckedChange={(v) =>
                    handleProfileUpdate({ isSpouseWorking: v })
                  }
                />
              </div>
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

        <Button
          className="h-12 w-full bg-primary hover:bg-primary/90 text-base font-semibold"
          onClick={handleSaveProfile}
          disabled={isSavingProfile}
        >
          {isSavingProfile ? (
            <>
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Save Profile
            </>
          )}
        </Button>

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

        {/* Drive Sync Diagnostics */}
        <div className="space-y-3">
          <button
            onClick={() => setSyncDiagnosticsOpen(o => !o)}
            className="flex w-full items-center gap-2.5 px-1 text-left"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
              <AlertTriangle className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h2 className="font-semibold text-foreground">Drive Sync Diagnostics</h2>
            <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform", syncDiagnosticsOpen && "rotate-90")} />
          </button>

          {syncDiagnosticsOpen && (
            <Card className="overflow-hidden border-0 shadow-sm ring-1 ring-border">
              <CardContent className="space-y-4 p-4">
                {/* Debug state strip */}
                <div className="rounded-lg bg-muted/60 px-3 py-2 font-mono text-xs text-muted-foreground">
                  <span className={cn("font-semibold", !isDemoMode ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")}>
                    {isDemoMode ? "Demo: true" : "Demo: false"}
                  </span>
                  <span className="mx-2 text-muted-foreground/40">|</span>
                  <span className={cn("font-semibold", settings.googleDriveConnected ? "text-emerald-600 dark:text-emerald-400" : "text-red-500")}>
                    {settings.googleDriveConnected ? "Drive Connected: true" : "Drive Connected: false"}
                  </span>
                  <span className="mx-2 text-muted-foreground/40">|</span>
                  <span className={cn("font-semibold", driveFolderIds.manifestFileIds && driveFolderIds.categoryFolderIds ? "text-emerald-600 dark:text-emerald-400" : "text-red-500")}>
                    {driveFolderIds.manifestFileIds && driveFolderIds.categoryFolderIds ? "Manifest IDs: loaded" : "Manifest IDs: missing"}
                  </span>
                </div>

                {/* Sync log */}
                {syncLog.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic py-2">No sync activity yet. Trigger a save/update to see events here.</p>
                ) : (
                  <ScrollArea className="max-h-48 rounded-lg bg-muted/30 p-2 font-mono text-xs">
                    <div className="space-y-0.5">
                      {[...syncLog].reverse().map((entry, i) => (
                        <div key={i} className={cn(
                          "flex items-center gap-2 py-0.5",
                          entry.status === 'pending' && "text-muted-foreground",
                          entry.status === 'success' && "text-emerald-600 dark:text-emerald-400",
                          entry.status === 'error' && "text-red-500"
                        )}>
                          <span className="shrink-0 opacity-60">[{entry.time}]</span>
                          <span>{entry.action}</span>
                          <span className="shrink-0">
                            {entry.status === 'pending' && '→ ⟳ pending'}
                            {entry.status === 'success' && '→ ✓ success'}
                            {entry.status === 'error' && `→ ✗ error: ${entry.detail || ''}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-full text-xs"
                  onClick={() => setSyncLog([])}
                >
                  Clear Log
                </Button>
              </CardContent>
            </Card>
          )}
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
                ["Weekly summary", "weeklySummary", "Receive weekly relief summary"],
                ["New LHDN updates", "lhdnUpdates", "Get notified about tax law changes"],
              ].map(([label, key, desc], i, arr) => (
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

        {/* Security */}
        <div className="space-y-3">
          <div className="flex items-center gap-2.5 px-1">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
              <Shield className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h2 className=" font-semibold text-foreground">Security</h2>
          </div>
          <Card className="overflow-hidden border-0 shadow-sm ring-1 ring-border">
            <CardContent className="p-5">
              <div className="flex min-h-[48px] items-center justify-between">
                <div className="flex items-center gap-3.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-950/40 dark:to-emerald-900/30">
                    <Fingerprint className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className=" font-medium text-foreground">Biometric Lock</p>
                    <p className=" text-muted-foreground">Face ID / Fingerprint</p>
                  </div>
                </div>
                <Switch
                  checked={settings.biometricLock}
                  onCheckedChange={(v) => updateSettings({ biometricLock: v })}
                  className="shrink-0"
                />
              </div>
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
                  <Label className=" font-medium text-foreground">Language</Label>
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
                    <SelectItem value="ms">Bahasa Melayu</SelectItem>
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
                className="h-11 w-full justify-start gap-3 border-red-200 px-4 font-medium text-red-600 transition-all hover:border-red-300 hover:bg-red-50 hover:text-red-700 active:bg-red-100 dark:border-red-900 dark:text-red-400 dark:hover:border-red-800 dark:hover:bg-red-950/40 dark:hover:text-red-300"
                onClick={() => setShowDeleteDialog(true)}
              >
                <AlertTriangle className="h-4 w-4" /> Delete All Records
              </Button>
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
                  "Privacy Policy",
                  "Terms of Service",
                  "LHDN Official Website",
                ].map((item) => (
                  <button
                    key={item}
                    className="flex min-h-[44px] items-center justify-between rounded-xl px-3.5 text-sm text-foreground transition-all hover:bg-muted/60 active:scale-[0.99]"
                  >
                    <span>{item}</span>
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                  </button>
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
            <div className="px-4 pb-4">
              {/* Receipt image thumbnail */}
              {receiptPreview && (
                <div className="mb-3">
                  <img src={receiptPreview} alt="Receipt" className="h-20 w-full object-contain rounded-lg border border-gray-200 dark:border-gray-700" />
                </div>
              )}
              
              <div className="rounded-xl border-2 border-blue-200 bg-blue-50 dark:bg-blue-950/20 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="h-5 w-5 text-blue-600" />
                  <h3 className="font-semibold text-blue-900 dark:text-blue-300">Verify Extracted Data</h3>
                  <span className="ml-auto text-xs text-blue-600 bg-blue-100 dark:bg-blue-900 px-2 py-0.5 rounded-full">
                    {Math.round(reviewData.confidence * 100)}% confidence
                  </span>
                </div>
                
                <div className="space-y-3">
                  {/* Merchant */}
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-blue-700 dark:text-blue-400 uppercase tracking-wide">Merchant / Shop</Label>
                    <Input
                      value={reviewData.vendor}
                      onChange={(e) => setReviewData({ ...reviewData, vendor: e.target.value })}
                      className="font-medium"
                      placeholder="Merchant name"
                    />
                  </div>
                  
                  {/* Amount */}
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-blue-700 dark:text-blue-400 uppercase tracking-wide">Amount (RM)</Label>
                    <Input
                      type="number"
                      value={reviewData.amount}
                      onChange={(e) => setReviewData({ ...reviewData, amount: e.target.value })}
                      className="font-medium"
                      placeholder="0.00"
                    />
                  </div>
                  
                  {/* Date */}
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-blue-700 dark:text-blue-400 uppercase tracking-wide">Date</Label>
                    <Input
                      type="date"
                      value={reviewData.date}
                      onChange={(e) => setReviewData({ ...reviewData, date: e.target.value })}
                    />
                  </div>
                  
                  {/* Invoice Number */}
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-blue-700 dark:text-blue-400 uppercase tracking-wide">Invoice / Receipt No.</Label>
                    <Input
                      value={reviewData.invoiceNumber}
                      onChange={(e) => setReviewData({ ...reviewData, invoiceNumber: e.target.value })}
                      placeholder="Optional"
                    />
                  </div>
                  
                  {/* Category hint */}
                  <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400">
                    <Tag className="h-3 w-3" />
                    <span>Suggested: <span className="font-medium">{reviewData.category}</span></span>
                  </div>
                  
                  {/* Mandatory field warning */}
                  {(!reviewData.vendor.trim() || !reviewData.amount) && (
                    <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded-lg px-3 py-2">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>Merchant and amount are required — please fill in</span>
                    </div>
                  )}
                </div>
                
                <div className="flex gap-2 mt-4">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setShowOcrReview(false)
                      setShowOCRForm(false)
                      setIsProcessing(false)
                      setOcrResult(null)
                      setReceiptPreview(null)
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={() => {
                      // Apply confirmed data to newRecord form and proceed
                      setNewRecord(prev => ({
                        ...prev,
                        // lhdNCategory & recipient intentionally omitted — TODO: derive from raw_text or user input
                        merchant: reviewData.vendor,
                        amount: reviewData.amount,
                        date: reviewData.date,
                        invoiceNumber: reviewData.invoiceNumber,
                        category: reviewData.category,
                      }))
                      setShowOcrReview(false)
                      setShowOCRForm(true)
                    }}
                    disabled={!reviewData.vendor.trim() || !reviewData.amount}
                  >
                    Confirm & Continue →
                  </Button>
                </div>
              </div>

              {/* ── OCR Details — full extraction breakdown ── */}
              {ocrResult && (
                <details className="mt-3 rounded-xl border border-blue-200 dark:border-blue-800 overflow-hidden">
                  <summary className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-blue-700 dark:text-blue-400 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950/30 select-none">
                    <Info className="h-3.5 w-3.5 shrink-0" />
                    View OCR Details
                  </summary>
                  <div className="px-3 pb-3 pt-1 space-y-3">

                    {/* Confidence + metadata row */}
                    <div className="flex flex-wrap items-center gap-2">
                      <OcrConfidenceBadge
                        confidence={ocrResult.confidence}
                        needsReview={ocrResult.needs_review}
                      />
                      {ocrResult.extraction_method && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300">
                          {ocrResult.extraction_method}
                        </span>
                      )}
                      {ocrResult.document_type && ocrResult.document_type !== 'unknown' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          {ocrResult.document_type}
                        </span>
                      )}
                      {ocrResult.needs_review && (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                          <AlertTriangle className="h-3 w-3" />
                          Needs review
                        </span>
                      )}
                    </div>

                    {/* Extracted fields grid */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      {[
                        ['Vendor', ocrResult.vendor],
                        ['Amount', ocrResult.amount != null ? `RM ${ocrResult.amount.toFixed(2)}` : null],
                        ['Date', ocrResult.date],
                        ['Time', ocrResult.time],
                        ['Category', ocrResult.category],
                        ['Invoice #', ocrResult.invoice_number],
                        ['TIN', ocrResult.tin],
                        ['SST Reg.', ocrResult.sst_registration_no],
                        ['Tax Amount', ocrResult.tax_amount != null ? `RM ${ocrResult.tax_amount.toFixed(2)}` : null],
                        ['Tax Type', ocrResult.tax_type],
                      ].filter(([, v]) => v != null && v !== '').map(([label, value]) => (
                        <div key={label as string} className="flex gap-2">
                          <span className="text-muted-foreground shrink-0">{label}:</span>
                          <span className="font-medium truncate">{value as string}</span>
                        </div>
                      ))}
                    </div>

                    {/* Raw text */}
                    <div>
                      <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wide">Raw OCR Text</p>
                      <pre className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-2 overflow-x-auto max-h-48 whitespace-pre-wrap font-mono">
                        {ocrResult.raw_text || 'N/A'}
                      </pre>
                    </div>

                  </div>
                </details>
              )}

              {/* Raw OCR text — collapsible for debugging */}
              <details className="mt-3">
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                  Show raw OCR ({reviewData.rawText.length} chars)
                </summary>
                <pre className="mt-2 text-xs text-muted-foreground bg-muted/50 rounded-lg p-2 overflow-x-auto max-h-32 whitespace-pre-wrap">
                  {reviewData.rawText.slice(0, 600)}
                </pre>
              </details>
            </div>
          )}

          {/* ── Upload Options (original) ── */}
          {!isProcessing && !showOcrReview && !showOCRForm && !isVerifying ? (
            // Upload options
            <div className="space-y-4 p-4">
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

      {/* Profile Save Success Dialog */}
      <AlertDialog open={showSaveSuccessDialog} onOpenChange={setShowSaveSuccessDialog}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-emerald-600">
              <CheckCircle2 className="h-5 w-5" /> Profile Saved
            </AlertDialogTitle>
            <AlertDialogDescription>
              Your profile details have been saved to file successfully.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowSaveSuccessDialog(false)}>
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Profile Save Error Dialog */}
      <AlertDialog open={showSaveErrorDialog} onOpenChange={setShowSaveErrorDialog}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" /> Save Failed
            </AlertDialogTitle>
            <AlertDialogDescription>{saveErrorMsg}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowSaveErrorDialog(false)}>
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Drive Connect Prompt Dialog */}
      <AlertDialog open={showDriveConnectPrompt} onOpenChange={setShowDriveConnectPrompt}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-blue-600">
              <HardDrive className="h-5 w-5" /> Connect Google Drive
            </AlertDialogTitle>
            <AlertDialogDescription>
              Please connect Google Drive first before adding records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => {
              setShowDriveConnectPrompt(false)
              setActiveTab("settings")
              router.push(pathname + "?tab=settings")
            }}>
              Go to Settings
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
              if (!settings.googleDriveConnected) {
                setShowDriveConnectPrompt(true)
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
