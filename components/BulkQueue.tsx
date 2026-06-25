"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Check, X, ChevronRight, FileText, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import { RELIEF_CATEGORIES } from "@/store"

interface ReviewData {
  vendor: string
  amount: string
  date: string
  category: string
  confidence: number
}

interface QueueItem {
  file: File
  previewUrl: string
  status: 'pending' | 'processing' | 'ready' | 'saved' | 'skipped'
  reviewData?: ReviewData
  error?: string
}

interface Props {
  files: File[]
  onDone: (saved: number, skipped: number) => void
  onCancel: () => void
  onSave: (data: ReviewData & { receiptUrl?: string; receiptFileName?: string }) => void
}

const MAX_CONCURRENT = 3

export function BulkQueue({ files, onDone, onCancel, onSave }: Props) {
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [savedCount, setSavedCount] = useState(0)
  const [skippedCount, setSkippedCount] = useState(0)
  const [dragX, setDragX] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [editData, setEditData] = useState<ReviewData | null>(null)
  const processingSet = useRef(new Set<number>())
  const dragStartX = useRef(0)
  const cardRef = useRef<HTMLDivElement>(null)

  // Initialize queue from files
  useEffect(() => {
    const items: QueueItem[] = files.map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
      status: 'pending',
    }))
    setQueue(items)
  }, [files])

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      queue.forEach((item) => URL.revokeObjectURL(item.previewUrl))
    }
  }, [queue])

  const processFile = useCallback(async (index: number) => {
    if (processingSet.current.has(index)) return
    processingSet.current.add(index)

    setQueue((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], status: 'processing' }
      return next
    })

    try {
      const formData = new FormData()
      formData.append("file", files[index])
      const res = await fetch("/api/ocr", { method: "POST", body: formData })
      const json = await res.json()

      const reviewData: ReviewData = {
        vendor: json.vendor || "",
        amount: json.amount != null ? String(json.amount) : "",
        date: json.date || new Date().toISOString().slice(0, 10),
        category: json.category || "lifestyle",
        confidence: json.confidence || 0,
      }

      setQueue((prev) => {
        const next = [...prev]
        next[index] = { ...next[index], status: 'ready', reviewData }
        return next
      })
    } catch {
      setQueue((prev) => {
        const next = [...prev]
        next[index] = { ...next[index], status: 'ready', reviewData: {
          vendor: "", amount: "", date: new Date().toISOString().slice(0, 10),
          category: "lifestyle", confidence: 0,
        }, error: "OCR failed" }
        return next
      })
    }
  }, [files])

  // Process up to MAX_CONCURRENT files ahead of current
  useEffect(() => {
    if (queue.length === 0) return
    for (let i = currentIndex; i < Math.min(currentIndex + MAX_CONCURRENT, queue.length); i++) {
      if (queue[i]?.status === 'pending') {
        processFile(i)
      }
    }
  }, [queue, currentIndex, processFile])

  // Sync editData when current card becomes ready
  useEffect(() => {
    const current = queue[currentIndex]
    if (current?.status === 'ready' && current.reviewData) {
      setEditData({ ...current.reviewData })
    }
  }, [queue, currentIndex])

  const advance = useCallback((action: 'saved' | 'skipped') => {
    setDragX(0)
    setIsDragging(false)
    setQueue((prev) => {
      const next = [...prev]
      next[currentIndex] = { ...next[currentIndex], status: action }
      return next
    })
    if (action === 'saved') setSavedCount((n) => n + 1)
    else setSkippedCount((n) => n + 1)

    const nextIdx = currentIndex + 1
    if (nextIdx >= files.length) {
      // Done — will trigger completion effect
    } else {
      setCurrentIndex(nextIdx)
    }
  }, [currentIndex, files.length])

  // Completion check
  useEffect(() => {
    if (queue.length === 0) return
    const allDone = queue.every((item) => item.status === 'saved' || item.status === 'skipped')
    if (allDone) {
      const s = queue.filter((i) => i.status === 'saved').length
      const sk = queue.filter((i) => i.status === 'skipped').length
      onDone(s, sk)
    }
  }, [queue, onDone])

  const handleSave = () => {
    if (!editData) return
    const current = queue[currentIndex]
    onSave({
      ...editData,
      receiptUrl: current.previewUrl,
      receiptFileName: current.file.name,
    })
    advance('saved')
  }

  const handleSkip = () => advance('skipped')

  // Pointer drag handlers
  const onPointerDown = (e: React.PointerEvent) => {
    dragStartX.current = e.clientX
    setIsDragging(true)
    cardRef.current?.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return
    setDragX(e.clientX - dragStartX.current)
  }

  const onPointerUp = () => {
    setIsDragging(false)
    if (dragX >= 80) handleSave()
    else if (dragX <= -80) handleSkip()
    else setDragX(0)
  }

  const current = queue[currentIndex]
  const readyCount = queue.filter((i) => i.status === 'ready' || i.status === 'processing').length
  const doneCount = queue.filter((i) => i.status === 'saved' || i.status === 'skipped').length
  const progressPct = queue.length > 0 ? (doneCount / queue.length) * 100 : 0

  // Summary view
  if (doneCount === queue.length && queue.length > 0) {
    return (
      <div className="flex flex-col items-center gap-6 px-6 py-10 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
          <Check className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div>
          <p className="text-xl font-bold">{savedCount} record{savedCount !== 1 ? 's' : ''} saved</p>
          {skippedCount > 0 && (
            <p className="mt-1 text-sm text-muted-foreground">{skippedCount} skipped</p>
          )}
        </div>
        <Button className="h-12 w-full" onClick={() => onDone(savedCount, skippedCount)}>Done</Button>
      </div>
    )
  }

  if (!current) return null

  const isProcessing = current.status === 'pending' || current.status === 'processing'
  const swipeRight = dragX >= 80
  const swipeLeft = dragX <= -80

  return (
    <div className="flex flex-col gap-4 px-4 pb-6">
      {/* Progress header */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{currentIndex + 1} of {queue.length}</span>
          <span>{savedCount} saved · {skippedCount} skipped</span>
        </div>
        <Progress value={progressPct} className="h-1.5" />
      </div>

      {/* Swipe card */}
      <div
        ref={cardRef}
        className={cn(
          "relative rounded-2xl border bg-card overflow-hidden select-none cursor-grab active:cursor-grabbing transition-shadow",
          swipeRight && "border-emerald-400 shadow-emerald-100 dark:shadow-emerald-900/20",
          swipeLeft && "border-red-400 shadow-red-100 dark:shadow-red-900/20",
        )}
        style={{
          transform: `translateX(${dragX}px) rotate(${dragX * 0.03}deg)`,
          transition: isDragging ? 'none' : 'transform 0.3s ease, border-color 0.15s',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* Swipe indicators */}
        {swipeRight && (
          <div className="absolute inset-0 flex items-center justify-start pl-8 bg-emerald-500/10 z-10 pointer-events-none">
            <div className="flex items-center gap-2 text-emerald-600 font-bold text-lg">
              <Check className="h-8 w-8" /> Save
            </div>
          </div>
        )}
        {swipeLeft && (
          <div className="absolute inset-0 flex items-center justify-end pr-8 bg-red-500/10 z-10 pointer-events-none">
            <div className="flex items-center gap-2 text-red-600 font-bold text-lg">
              Skip <X className="h-8 w-8" />
            </div>
          </div>
        )}

        {/* Receipt thumbnail */}
        <div className="h-36 bg-muted/40 flex items-center justify-center overflow-hidden">
          {current.previewUrl && current.file.type.startsWith('image/') ? (
            <img
              src={current.previewUrl}
              alt="Receipt"
              className="h-full w-full object-contain"
              draggable={false}
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <FileText className="h-10 w-10" />
              <p className="text-xs">{current.file.name}</p>
            </div>
          )}
        </div>

        {/* Fields */}
        <div className="space-y-3 p-4">
          {isProcessing ? (
            <div className="flex flex-col items-center gap-3 py-4 text-muted-foreground">
              <RefreshCw className="h-6 w-6 animate-spin" />
              <p className="text-sm">Extracting receipt data…</p>
            </div>
          ) : editData ? (
            <>
              <div className="space-y-1" onPointerDown={(e) => e.stopPropagation()}>
                <Label className="text-xs text-muted-foreground">Merchant</Label>
                <Input
                  value={editData.vendor}
                  onChange={(e) => setEditData({ ...editData, vendor: e.target.value })}
                  className="h-10"
                  placeholder="Merchant name"
                />
              </div>
              <div className="flex gap-2" onPointerDown={(e) => e.stopPropagation()}>
                <div className="flex-1 space-y-1">
                  <Label className="text-xs text-muted-foreground">Amount (RM)</Label>
                  <Input
                    type="number"
                    value={editData.amount}
                    onChange={(e) => setEditData({ ...editData, amount: e.target.value })}
                    className="h-10"
                    placeholder="0.00"
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <Label className="text-xs text-muted-foreground">Date</Label>
                  <Input
                    type="date"
                    value={editData.date}
                    onChange={(e) => setEditData({ ...editData, date: e.target.value })}
                    className="h-10"
                  />
                </div>
              </div>
              <div className="space-y-1" onPointerDown={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Category</Label>
                  {editData.confidence > 0 && (
                    <Badge variant="outline" className="text-xs h-4 px-1.5">
                      {Math.round(editData.confidence)}% conf.
                    </Badge>
                  )}
                </div>
                <Select value={editData.category} onValueChange={(v) => setEditData({ ...editData, category: v })}>
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
            </>
          ) : null}
        </div>
      </div>

      {/* Hint */}
      {!isProcessing && (
        <p className="text-center text-xs text-muted-foreground">
          Swipe right to save · Swipe left to skip
        </p>
      )}

      {/* Button fallbacks */}
      <div className="flex gap-3">
        <Button
          variant="outline"
          className="flex-1 h-12 text-red-600 border-red-200 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/30"
          onClick={handleSkip}
          disabled={isProcessing}
        >
          <X className="mr-1.5 h-4 w-4" /> Skip
        </Button>
        <Button
          className="flex-1 h-12 bg-emerald-600 hover:bg-emerald-700 text-white"
          onClick={handleSave}
          disabled={isProcessing || !editData?.vendor || !editData?.amount}
        >
          <Check className="mr-1.5 h-4 w-4" /> Save
        </Button>
      </div>

      <Button variant="ghost" className="text-muted-foreground" onClick={onCancel}>
        Cancel bulk upload
      </Button>
    </div>
  )
}
