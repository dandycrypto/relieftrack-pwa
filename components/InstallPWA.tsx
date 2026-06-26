'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { X, Download } from 'lucide-react'

/**
 * InstallPWA — non-intrusive install banner + iOS hint
 *
 * Android/Chrome: listens for beforeinstallprompt, shows "Install ReliefTrack" banner.
 * iOS Safari: detects no beforeinstallprompt, shows one-time tooltip
 * "Tap Share → Add to Home Screen".
 *
 * Dismiss state is persisted in localStorage key: 'pwa-install-dismissed'.
 * Only shows on mobile/tablet viewports (max-width 1024px).
 */
const DISMISS_KEY = 'pwa-install-dismissed'

export default function InstallPWA() {
  const [deferredPrompt, setDeferredPrompt] = useState<Event | null>(null)
  const [showBanner, setShowBanner] = useState(false)
  const [showiOSHint, setShowiOSHint] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [isMobileOrTablet, setIsMobileOrTablet] = useState(false)

  useEffect(() => {
    // Only show on mobile/tablet
    const mql = window.matchMedia('(max-width: 1024px)')
    setIsMobileOrTablet(mql.matches)
    const onChange = () => setIsMobileOrTablet(window.innerWidth <= 1024)
    mql.addEventListener('change', onChange)
    window.addEventListener('resize', onChange)
    return () => {
      mql.removeEventListener('change', onChange)
      window.removeEventListener('resize', onChange)
    }
  }, [])

  useEffect(() => {
    // Restore dismissed state
    setDismissed(localStorage.getItem(DISMISS_KEY) === 'true')
  }, [])

  // Android/Chrome: beforeinstallprompt event
  useEffect(() => {
    if (!isMobileOrTablet || dismissed) return
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setShowBanner(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [isMobileOrTablet, dismissed])

  // iOS Safari: detect no beforeinstallprompt support
  useEffect(() => {
    if (!isMobileOrTablet || dismissed) return
    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

    if (isIOS) {
      // Only show iOS hint once (session only — no dismiss persistence needed)
      setShowiOSHint(true)
    }
  }, [isMobileOrTablet, dismissed])

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, 'true')
    setDismissed(true)
    setShowBanner(false)
    setShowiOSHint(false)
  }

  const handleInstall = async () => {
    if (!deferredPrompt) return
    deferredPrompt.preventDefault()
    const result = await (
      deferredPrompt as BeforeInstallPromptEvent
    ).prompt()
    if (result.outcome === 'accepted') {
      setShowBanner(false)
      setDeferredPrompt(null)
    }
  }

  if (!isMobileOrTablet || dismissed) return null

  return (
    <>
      {/* Android/Chrome install banner */}
      {showBanner && (
        <div className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-between gap-3 bg-emerald-600 px-4 py-2.5 text-white shadow-lg"
          role="banner"
          aria-label="Install ReliefTrack PWA"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Download className="h-4 w-4 shrink-0" />
            <span className="text-sm font-medium truncate">
              Install ReliefTrack for faster access
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-white hover:bg-emerald-700 hover:text-white px-2 text-xs"
              onClick={handleInstall}
            >
              Install
            </Button>
            <button
              onClick={handleDismiss}
              className="text-white/80 hover:text-white p-1"
              aria-label="Dismiss install banner"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* iOS Safari: one-time tooltip */}
      {showiOSHint && !showBanner && (
        <div className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-between gap-3 bg-violet-600 px-4 py-2.5 text-white shadow-lg"
          role="banner"
          aria-label="iOS Install hint"
        >
          <span className="text-sm">
            <strong>Tip:</strong> Tap <span className="text-violet-200">Share</span> → <span className="text-violet-200">Add to Home Screen</span> to install ReliefTrack
          </span>
          <button
            onClick={handleDismiss}
            className="text-white/80 hover:text-white p-1 shrink-0"
            aria-label="Dismiss iOS hint"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </>
  )
}

// Extend BeforeInstallPromptEvent for TypeScript
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed'
    platform: string
  }>
  prompt(): Promise<{
    userChoice: { outcome: 'accepted' | 'dismissed'; platform: string }
  }>
}
