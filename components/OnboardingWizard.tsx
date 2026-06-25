"use client"

import { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { ChevronRight, SkipForward } from "lucide-react"
import { useReliefStore, RELIEF_CATEGORIES } from "@/store"

const STEPS = 4

export function OnboardingWizard() {
  const { profile, updateProfile, settings, updateSettings } = useReliefStore()
  const [step, setStep] = useState(1)
  const [name, setName] = useState(profile.name || "")
  const [income, setIncome] = useState(profile.grossIncome ? String(profile.grossIncome) : "")
  const [maritalStatus, setMaritalStatus] = useState<"single" | "married" | "divorced">(
    profile.maritalStatus || "single"
  )
  const [children, setChildren] = useState(profile.childrenUnder18 || 0)
  const [hasParents, setHasParents] = useState(profile.hasParents || false)

  const complete = useCallback(() => {
    updateSettings({ onboardingComplete: true })
  }, [updateSettings])

  const currentYear = settings.defaultTaxYear
  const totalRelief = RELIEF_CATEGORIES.reduce((sum, cat) => sum + cat.maxLimit, 0)

  const grossIncome = parseFloat(income) || 0
  const estimatedTaxSavings = Math.min(grossIncome * 0.24 * 0.15, 8000)

  const handleNext = () => {
    if (step === 1 && name.trim()) {
      updateProfile({ name: name.trim() })
    }
    if (step === 2 && income) {
      updateProfile({ grossIncome: parseFloat(income) || 0 })
    }
    if (step === 3) {
      updateProfile({ maritalStatus, childrenUnder18: children, hasParents })
    }
    if (step < STEPS) setStep(s => s + 1)
    else complete()
  }

  const handleBack = () => setStep(s => Math.max(1, s - 1))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm">
      <div className="flex w-full max-w-sm flex-col gap-6 px-6 py-8">
        {/* Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Step {step} of {STEPS}</span>
            <button
              onClick={complete}
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              <SkipForward className="h-3 w-3" />
              Skip setup
            </button>
          </div>
          <Progress value={(step / STEPS) * 100} className="h-1.5" />
        </div>

        {/* Step 1 — Welcome */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="space-y-2 text-center">
              <div className="flex justify-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-3xl shadow-lg">
                  🇲🇾
                </div>
              </div>
              <h1 className="text-2xl font-bold tracking-tight">ReliefTrack MY</h1>
              <p className="text-muted-foreground">
                Track your tax reliefs. Maximise your refund.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="onboard-name">What&apos;s your name?</Label>
              <Input
                id="onboard-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Ahmad"
                className="h-12 text-base"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && name.trim() && handleNext()}
              />
            </div>

            <Button
              className="h-12 w-full text-base font-semibold"
              onClick={handleNext}
              disabled={!name.trim()}
            >
              Next <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Step 2 — Income */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-xl font-bold">Your Annual Income</h2>
              <p className="text-sm text-muted-foreground">
                Used to estimate your tax bracket. Never shared.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="onboard-income">Annual gross income (RM)</Label>
              <Input
                id="onboard-income"
                type="number"
                value={income}
                onChange={(e) => setIncome(e.target.value)}
                placeholder="e.g. 60000"
                className="h-12 text-base"
                autoFocus
              />
              {grossIncome > 0 && (
                <p className="text-xs text-muted-foreground">
                  Estimated monthly: RM {Math.round(grossIncome / 12).toLocaleString()}
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="h-11 flex-1" onClick={handleBack}>
                Back
              </Button>
              <Button className="h-11 flex-1 font-semibold" onClick={handleNext}>
                Next <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
            <button
              onClick={() => setStep(s => s + 1)}
              className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Skip this step
            </button>
          </div>
        )}

        {/* Step 3 — About You */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-xl font-bold">About You</h2>
              <p className="text-sm text-muted-foreground">
                Helps us calculate your eligible reliefs.
              </p>
            </div>

            <div className="space-y-4">
              {/* Marital status */}
              <div className="space-y-2">
                <Label>Marital Status</Label>
                <div className="flex gap-2">
                  {(["single", "married", "divorced"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setMaritalStatus(s)}
                      className={cn(
                        "flex-1 rounded-lg border py-2 text-sm font-medium capitalize transition-all",
                        maritalStatus === s
                          ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300"
                          : "border-border bg-background text-muted-foreground hover:border-emerald-300"
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Children */}
              <div className="space-y-2">
                <Label>Children under 18</Label>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setChildren(Math.max(0, children - 1))}
                    className="flex h-10 w-10 items-center justify-center rounded-lg border text-lg font-medium hover:bg-muted"
                  >
                    −
                  </button>
                  <span className="w-8 text-center text-xl font-semibold">{children}</span>
                  <button
                    onClick={() => setChildren(Math.min(5, children + 1))}
                    className="flex h-10 w-10 items-center justify-center rounded-lg border text-lg font-medium hover:bg-muted"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Parents */}
              <div className="flex items-center justify-between">
                <Label>Dependent parents?</Label>
                <button
                  onClick={() => setHasParents(!hasParents)}
                  className={cn(
                    "rounded-lg border px-4 py-1.5 text-sm font-medium transition-all",
                    hasParents
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300"
                      : "border-border text-muted-foreground hover:border-emerald-300"
                  )}
                >
                  {hasParents ? "Yes" : "No"}
                </button>
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="h-11 flex-1" onClick={handleBack}>
                Back
              </Button>
              <Button className="h-11 flex-1 font-semibold" onClick={handleNext}>
                Next <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
            <button
              onClick={() => setStep(s => s + 1)}
              className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Skip this step
            </button>
          </div>
        )}

        {/* Step 4 — Relief Potential */}
        {step === 4 && (
          <div className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-xl font-bold">
                {profile.name ? `You're all set, ${profile.name.split(" ")[0]}!` : "You're all set!"}
              </h2>
              <p className="text-sm text-muted-foreground">
                Based on your profile, you can claim up to:
              </p>
            </div>

            <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-emerald-100 p-5 dark:from-emerald-950/40 dark:to-emerald-900/30">
              <p className="text-3xl font-bold text-emerald-700 dark:text-emerald-300">
                RM {totalRelief.toLocaleString()}
              </p>
              <p className="mt-1 text-sm text-emerald-600 dark:text-emerald-400">
                in total tax reliefs for YA {currentYear}
              </p>
              {grossIncome > 0 && estimatedTaxSavings > 0 && (
                <p className="mt-3 text-xs text-emerald-600 dark:text-emerald-400">
                  Estimated savings: up to RM {Math.round(estimatedTaxSavings).toLocaleString()}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Claimed so far</span>
                <span className="font-medium">RM 0 / RM {totalRelief.toLocaleString()}</span>
              </div>
              <Progress value={0} className="h-2" />
            </div>

            <Button
              className="h-12 w-full text-base font-semibold"
              onClick={complete}
            >
              Start Adding Receipts →
            </Button>
            <button
              onClick={complete}
              className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Go to dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
