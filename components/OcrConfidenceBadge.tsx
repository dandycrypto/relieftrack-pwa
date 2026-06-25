'use client'

import { mapConfidenceToLevel, type OcrConfidenceLevel } from '@/types/ocr'

interface OcrConfidenceBadgeProps {
  confidence: number
  needsReview?: boolean
  className?: string
}

export function OcrConfidenceBadge({ confidence, needsReview, className }: OcrConfidenceBadgeProps) {
  const level = mapConfidenceToLevel(confidence)

  // Override to "review" if needs_review flag is set (even if score is green)
  const display: OcrConfidenceLevel = needsReview ? 'review' : level

  const config = {
    high: {
      bg: 'bg-emerald-100',
      text: 'text-emerald-800',
      label: `${Math.round(confidence * 100)}%`,
    },
    review: {
      bg: 'bg-amber-100',
      text: 'text-amber-800',
      label: needsReview
        ? `Review needed · ${Math.round(confidence * 100)}%`
        : `${Math.round(confidence * 100)}%`,
    },
    low: {
      bg: 'bg-red-100',
      text: 'text-red-800',
      label: `${Math.round(confidence * 100)}%`,
    },
  }[display]

  return (
    <span
      role="status"
      aria-label={`Extraction confidence: ${config.label}`}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text} ${className ?? ''}`}
    >
      {/* Dot indicator */}
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          display === 'high' ? 'bg-emerald-500' : display === 'review' ? 'bg-amber-500' : 'bg-red-500'
        }`}
      />
      {config.label}
    </span>
  )
}
