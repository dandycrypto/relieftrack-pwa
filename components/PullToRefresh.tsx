'use client'

import { useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'

export function PullToRefresh({ children }: { children: React.ReactNode }) {
  const [pullDistance, setPullDistance] = useState(0)
  const scrollContainer = useRef<HTMLDivElement>(null)
  const startYRef = useRef<number>(0)
  const isDraggingDownRef = useRef<boolean>(false)
  const THRESHOLD = 80

  useEffect(() => {
    const el = scrollContainer.current
    if (!el) return

    const onTouchStart = (e: TouchEvent) => {
      // Reset drag state on each new touch sequence
      isDraggingDownRef.current = false
      // Only capture start Y when scrolled to top
      if (el.scrollTop <= 2) {
        startYRef.current = e.touches[0].clientY
      }
    }

    const onTouchMove = (e: TouchEvent) => {
      const scrollTop = el.scrollTop

      // If NOT at top, reset and do NOT prevent default — let native scroll work
      if (scrollTop > 2) {
        isDraggingDownRef.current = false
        return
      }

      const diff = e.touches[0].clientY - startYRef.current

      // User is pulling DOWN (toward bottom of screen) — this is a pull-to-refresh gesture
      if (diff > 10) {
        e.preventDefault() // Only preventDefault when genuinely pulling down past threshold
        isDraggingDownRef.current = true

        // Show indicator proportional to pull distance
        const distance = Math.min(diff * 0.5, 120)
        setPullDistance(distance)

        // Update touch start so each subsequent touchmove is relative to current position
        // This prevents cumulative drift
      } else if (diff > 0 && isDraggingDownRef.current) {
        // Still in drag-down gesture
        e.preventDefault()
        const distance = Math.min(diff * 0.5, 120)
        setPullDistance(distance)
      }
      // If diff <= 0 (swiping up at top), do NOT preventDefault — native scroll works
    }

    const onTouchEnd = () => {
      const wasDragging = isDraggingDownRef.current
      const distance = pullDistance

      // Reset state
      isDraggingDownRef.current = false
      setPullDistance(0)

      // Only reload if we were dragging down AND past threshold
      if (wasDragging && distance >= THRESHOLD) {
        window.location.reload()
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: true })

    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, []) // Empty deps — runs once

  return (
    <div
      ref={scrollContainer}
      className="flex flex-col flex-1 min-h-0 overscroll-none overflow-y-auto"
    >
      {/* Pull indicator — shows at top when pulling */}
      <div
        className="w-full flex items-center justify-center pointer-events-none transition-all duration-200"
        style={{
          height: `${pullDistance}px`,
          opacity: pullDistance > 8 ? 1 : 0,
        }}
      >
        <RefreshCw
          className={`h-5 w-5 text-muted-foreground ${pullDistance >= THRESHOLD ? 'animate-spin' : ''}`}
        />
      </div>
      {children}
    </div>
  )
}
