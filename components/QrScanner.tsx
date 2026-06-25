"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { X, Camera, RefreshCw, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"

export interface QrScanResult {
  vendor: string
  amount: number | null
  date: string | null
  invoiceNumber: string | null
  uuid: string | null
  rawUrl: string
}

interface Props {
  onResult: (result: QrScanResult) => void
  onCancel: () => void
}

export function QrScanner({ onResult, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number>(0)
  const [status, setStatus] = useState<"starting" | "scanning" | "found" | "error">("starting")
  const [errorMsg, setErrorMsg] = useState("")
  const [isFetching, setIsFetching] = useState(false)

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }, [])

  const scanFrame = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(scanFrame)
      return
    }
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    ctx.drawImage(video, 0, 0)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

    // Dynamic import to avoid SSR issues
    import("jsqr").then(({ default: jsQR }) => {
      const code = jsQR(imageData.data, imageData.width, imageData.height)
      if (code?.data) {
        handleQrData(code.data)
      } else {
        rafRef.current = requestAnimationFrame(scanFrame)
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleQrData = useCallback(async (data: string) => {
    setStatus("found")
    stopCamera()

    // Extract UUID from LHDN MyInvois URL
    // Format: https://myinvois.hasil.gov.my/...?uuid=XXX or /XXX
    let uuid: string | null = null
    try {
      const url = new URL(data)
      uuid = url.searchParams.get("uuid")
        || url.searchParams.get("id")
        || url.pathname.split("/").filter(Boolean).pop()
        || null
    } catch {
      // Not a URL — might be raw UUID or other format
      if (/^[0-9a-f-]{32,36}$/i.test(data)) uuid = data
    }

    if (!uuid) {
      // Not an LHDN QR — return just the raw URL so caller can handle it
      onResult({ vendor: "", amount: null, date: null, invoiceNumber: null, uuid: null, rawUrl: data })
      return
    }

    // Fetch invoice data from our API route
    setIsFetching(true)
    try {
      const res = await fetch(`/api/einvoice?uuid=${encodeURIComponent(uuid)}`)
      const json = await res.json()
      if (res.ok && json.vendor) {
        onResult({
          vendor: json.vendor || "",
          amount: json.amount ?? null,
          date: json.date || null,
          invoiceNumber: json.invoiceNumber || uuid,
          uuid,
          rawUrl: data,
        })
      } else {
        // API failed — still pass UUID so user can review
        onResult({ vendor: "", amount: null, date: null, invoiceNumber: uuid, uuid, rawUrl: data })
      }
    } catch {
      onResult({ vendor: "", amount: null, date: null, invoiceNumber: uuid, uuid, rawUrl: data })
    } finally {
      setIsFetching(false)
    }
  }, [onResult, stopCamera])

  useEffect(() => {
    let cancelled = false
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play()
        }
        setStatus("scanning")
        rafRef.current = requestAnimationFrame(scanFrame)
      })
      .catch((err) => {
        setStatus("error")
        setErrorMsg(err?.message || "Camera access denied")
      })
    return () => {
      cancelled = true
      stopCamera()
    }
  }, [scanFrame, stopCamera])

  return (
    <div className="relative flex flex-col items-center justify-center bg-black" style={{ minHeight: "60vh" }}>
      {/* Close button */}
      <button
        onClick={() => { stopCamera(); onCancel() }}
        className="absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white"
      >
        <X className="h-5 w-5" />
      </button>

      {/* Camera feed */}
      <video
        ref={videoRef}
        playsInline
        muted
        className="h-full w-full object-cover"
        style={{ display: status === "scanning" ? "block" : "none" }}
      />
      <canvas ref={canvasRef} className="hidden" />

      {/* Scanning overlay */}
      {status === "scanning" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative h-56 w-56">
            {/* Corner brackets */}
            {["tl", "tr", "bl", "br"].map((pos) => (
              <div
                key={pos}
                className={cn(
                  "absolute h-8 w-8 border-white",
                  pos === "tl" && "left-0 top-0 border-l-2 border-t-2",
                  pos === "tr" && "right-0 top-0 border-r-2 border-t-2",
                  pos === "bl" && "bottom-0 left-0 border-b-2 border-l-2",
                  pos === "br" && "bottom-0 right-0 border-b-2 border-r-2"
                )}
              />
            ))}
            {/* Scanning line */}
            <div className="absolute inset-x-0 top-1/2 h-0.5 bg-emerald-400 opacity-80" />
          </div>
          <p className="absolute bottom-10 text-sm font-medium text-white/80">
            Point at an e-Invoice QR code
          </p>
        </div>
      )}

      {/* Starting state */}
      {status === "starting" && (
        <div className="flex flex-col items-center gap-3 text-white">
          <Camera className="h-10 w-10 animate-pulse" />
          <p className="text-sm">Starting camera…</p>
        </div>
      )}

      {/* Found / fetching */}
      {(status === "found" || isFetching) && (
        <div className="flex flex-col items-center gap-3 text-white">
          <RefreshCw className="h-10 w-10 animate-spin text-emerald-400" />
          <p className="text-sm">{isFetching ? "Fetching invoice data…" : "QR code detected"}</p>
        </div>
      )}

      {/* Error state */}
      {status === "error" && (
        <div className="flex flex-col items-center gap-4 px-6 text-center text-white">
          <AlertTriangle className="h-10 w-10 text-amber-400" />
          <p className="text-sm">{errorMsg || "Could not access camera"}</p>
          <Button variant="outline" onClick={() => { stopCamera(); onCancel() }}>
            Close
          </Button>
        </div>
      )}
    </div>
  )
}
