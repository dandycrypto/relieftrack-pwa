"use client"

import { useState, useEffect } from "react"
import { createSupabaseBrowserClient } from "@/utils/supabase/client"
import { toast } from "sonner"
import Link from "next/link"
import { useTheme } from "next-themes"
import {
  ScanLine,
  BarChart3,
  Cloud,
  Clock,
  FileDown,
  Shield,
  ChevronRight,
  Sun,
  Moon,
  Menu,
  X,
  Star,
  CheckCircle2,
  Sparkles,
  Receipt,
  TrendingUp,
  Smartphone,
  ArrowRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet"

// Google Logo SVG
const GoogleLogo = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" aria-label="Google">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
  </svg>
)

// LHDN Badge
const LHDNBadge = () => (
  <Badge variant="secondary" className="gap-1.5 bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400">
    <CheckCircle2 className="h-3 w-3" />
    LHDN Updated 2025
  </Badge>
)

// Phone Mockup Component
const PhoneMockup = () => (
  <div className="relative mx-auto w-full max-w-[300px]">
    {/* Phone Frame */}
    <div className="relative rounded-[3rem] border-[12px] border-gray-900 bg-gray-900 p-1 shadow-2xl dark:border-gray-700">
      {/* Notch */}
      <div className="absolute left-1/2 top-0 z-10 h-7 w-32 -translate-x-1/2 rounded-b-2xl bg-gray-900 dark:bg-gray-700" />
      
      {/* Screen */}
      <div className="relative overflow-hidden rounded-[2.25rem] bg-gradient-to-b from-emerald-50 to-white dark:from-emerald-950 dark:to-gray-900">
        {/* Status Bar */}
        <div className="flex items-center justify-between px-6 py-2 text-xs text-gray-600 dark:text-gray-400">
          <span>9:41</span>
          <div className="flex items-center gap-1">
            <div className="h-2 w-4 rounded-sm border border-current" />
          </div>
        </div>
        
        {/* App Content */}
        <div className="space-y-3 p-4 pt-2">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold text-gray-900 dark:text-white">ReliefTrack MY</span>
              </div>
              <p className="text-xs text-gray-500">Year of Assessment 2025</p>
            </div>
          </div>

          <p className="text-xs text-gray-700 dark:text-gray-300">Hi, <span className="font-semibold">Alex Tan</span></p>
          
          {/* Deadline Card */}
          <div className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 p-3 text-white shadow-lg">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              <div>
                <p className="text-xs opacity-90">Tax Filing Deadline</p>
                <p className="text-lg font-bold">18 days left</p>
              </div>
            </div>
          </div>
          
          {/* Total Card */}
          <div className="rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 p-3 text-white shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs opacity-90">Total Relief Claimed</p>
                <p className="text-xl font-bold">RM 14,850</p>
                <p className="text-xs opacity-75">of RM 42,000 maximum</p>
              </div>
              {/* Mini Progress Ring */}
              <div className="relative h-14 w-14">
                <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="3" />
                  <circle cx="18" cy="18" r="15" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeDasharray="94.2" strokeDashoffset="60" />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-xs font-bold">35%</span>
              </div>
            </div>
          </div>
          
          {/* Relief Categories Preview */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Your Reliefs</p>
            {[
              { name: "Individual", claimed: 9000, max: 9000, color: "bg-emerald-500" },
              { name: "Medical", claimed: 3500, max: 10000, color: "bg-blue-500" },
              { name: "Lifestyle", claimed: 1850, max: 2500, color: "bg-purple-500" },
            ].map((item) => (
              <div key={item.name} className="rounded-lg bg-white p-2 shadow-sm dark:bg-gray-800">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-700 dark:text-gray-300">{item.name}</span>
                  <span className="font-medium text-gray-900 dark:text-white">RM {item.claimed.toLocaleString()}</span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                  <div className={`h-full ${item.color}`} style={{ width: `${(item.claimed / item.max) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
    
    {/* Floating Elements */}
    <div className="absolute -left-3 top-16 animate-bounce rounded-xl bg-white p-2 shadow-lg dark:bg-gray-800" style={{ animationDelay: "0.5s", animationDuration: "3s" }}>
      <Receipt className="h-6 w-6 text-emerald-600" />
    </div>
    <div className="absolute -right-2 top-28 animate-bounce rounded-xl bg-white p-2 shadow-lg dark:bg-gray-800" style={{ animationDelay: "1s", animationDuration: "2.5s" }}>
      <TrendingUp className="h-6 w-6 text-blue-600" />
    </div>
    <div className="absolute -left-2 bottom-24 animate-bounce rounded-xl bg-white p-2 shadow-lg dark:bg-gray-800" style={{ animationDelay: "1.5s", animationDuration: "3.5s" }}>
      <Sparkles className="h-6 w-6 text-amber-500" />
    </div>
  </div>
)

// KL Skyline SVG
const KLSkyline = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 1200 200" className={className} preserveAspectRatio="xMidYMax slice">
    <defs>
      <linearGradient id="skylineGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="currentColor" stopOpacity="0.1" />
        <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
      </linearGradient>
    </defs>
    {/* Petronas Towers */}
    <path d="M500 200 L500 80 L510 40 L520 80 L520 200 M540 200 L540 80 L550 40 L560 80 L560 200 M520 100 L540 100" fill="url(#skylineGrad)" />
    {/* KL Tower */}
    <path d="M620 200 L625 120 L615 100 L630 60 L645 100 L635 120 L640 200" fill="url(#skylineGrad)" />
    {/* Buildings */}
    <rect x="100" y="140" width="40" height="60" fill="url(#skylineGrad)" />
    <rect x="160" y="120" width="30" height="80" fill="url(#skylineGrad)" />
    <rect x="210" y="150" width="50" height="50" fill="url(#skylineGrad)" />
    <rect x="280" y="130" width="35" height="70" fill="url(#skylineGrad)" />
    <rect x="340" y="160" width="45" height="40" fill="url(#skylineGrad)" />
    <rect x="400" y="140" width="30" height="60" fill="url(#skylineGrad)" />
    <rect x="700" y="150" width="40" height="50" fill="url(#skylineGrad)" />
    <rect x="760" y="130" width="50" height="70" fill="url(#skylineGrad)" />
    <rect x="830" y="160" width="35" height="40" fill="url(#skylineGrad)" />
    <rect x="900" y="140" width="45" height="60" fill="url(#skylineGrad)" />
    <rect x="970" y="155" width="30" height="45" fill="url(#skylineGrad)" />
    <rect x="1020" y="135" width="55" height="65" fill="url(#skylineGrad)" />
    <rect x="1100" y="150" width="40" height="50" fill="url(#skylineGrad)" />
  </svg>
)

// Feature Card Component
const FeatureCard = ({ 
  icon: Icon, 
  title, 
  description 
}: { 
  icon: React.ElementType
  title: string
  description: string 
}) => (
  <Card className="group relative overflow-hidden border-0 bg-white/80 shadow-lg backdrop-blur transition-all hover:shadow-xl dark:bg-gray-800/80">
    <CardContent className="p-6">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 transition-colors group-hover:bg-emerald-600 group-hover:text-white dark:bg-emerald-900/30 dark:text-emerald-400 dark:group-hover:bg-emerald-600 dark:group-hover:text-white">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="mb-2 font-semibold text-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </CardContent>
  </Card>
)

// Testimonial Card
const TestimonialCard = ({ 
  name, 
  role, 
  content, 
  rating 
}: { 
  name: string
  role: string
  content: string
  rating: number 
}) => (
  <Card className="border-0 bg-white/80 shadow-lg backdrop-blur dark:bg-gray-800/80">
    <CardContent className="p-6">
      <div className="mb-3 flex gap-1">
        {Array.from({ length: rating }).map((_, i) => (
          <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
        ))}
      </div>
      <p className="mb-4 text-sm text-muted-foreground">{`"${content}"`}</p>
      <div>
        <p className="font-semibold text-foreground">{name}</p>
        <p className="text-xs text-muted-foreground">{role}</p>
      </div>
    </CardContent>
  </Card>
)

export default function LandingPageClient() {
  const [mounted, setMounted] = useState(false)
  const [signInLoading, setSignInLoading] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [showInstallBanner, setShowInstallBanner] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const { theme, setTheme } = useTheme()

  // PWA Install Prompt
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setShowInstallBanner(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') setShowInstallBanner(false)
    setDeferredPrompt(null)
  }

  useEffect(() => {
    const supabase = createSupabaseBrowserClient()
    // Check if user is already logged in — runs on every mount (e.g., after OAuth callback)
    supabase.auth.getSession().then(({ data }) => {
      setIsLoggedIn(!!data.session)
      if (data.session) setMounted(true)
    })
    // Listen for auth state changes (login/logout) to update state in real-time
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(!!session)
      if (session) setMounted(true)
    })
    return () => subscription.unsubscribe()
  }, [])
  const handleGoogleSignIn = async () => {
    setSignInLoading(true)
    const supabase = createSupabaseBrowserClient()
    if (!supabase) {
      toast.error("Authentication not configured.")
      setSignInLoading(false)
      return
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { prompt: "consent", access_type: "offline" },
        skipScreenReady: true,
      },
    })
    if (error) {
      toast.error("Sign-in failed", { description: error.message })
    }
    setSignInLoading(false)
  }

  const navLinks = [
    { href: "#features", label: "Features" },
    { href: "#how-it-works", label: "How it Works" },
    { href: "#pricing", label: "Pricing" },
  ]

  const features = [
    {
      icon: ScanLine,
      title: "Smart Receipt OCR",
      description: "Snap a photo or upload PDF receipts. Our AI extracts date, amount, and merchant automatically.",
    },
    {
      icon: BarChart3,
      title: "Relief Dashboard",
      description: "Visual progress bars show exactly how much you've claimed for each LHDN relief category.",
    },
    {
      icon: Cloud,
      title: "Google Drive Backup",
      description: "Securely backup all your receipts and records to your personal Google Drive account.",
    },
    {
      icon: Clock,
      title: "Deadline Countdown",
      description: "Never miss the April 30 deadline with smart reminders and filing countdown alerts.",
    },
    {
      icon: FileDown,
      title: "Export for e-Filing",
      description: "Generate a summary report ready to use when filing your taxes on ezHASiL portal.",
    },
    {
      icon: Shield,
      title: "Private & Secure",
      description: "Your data stays on your device and personal cloud. We never access your financial info.",
    },
  ]

  const howItWorks = [
    {
      step: 1,
      title: "Sign in with Google",
      description: "Quick, secure login. No passwords to remember.",
    },
    {
      step: 2,
      title: "Set Your Profile",
      description: "Tell us about your eligibility (married, children, parents, etc.)",
    },
    {
      step: 3,
      title: "Scan Receipts",
      description: "Take photos or upload PDFs. OCR extracts the details automatically.",
    },
    {
      step: 4,
      title: "Track Progress",
      description: "Watch your relief amounts grow. Know exactly what you've claimed.",
    },
  ]

  const testimonials = [
    {
      name: "Ahmad Faiz",
      role: "Software Engineer, KL",
      content: "Finally, an app that makes tax relief tracking simple. Saved me hours during tax season!",
      rating: 5,
    },
    {
      name: "Siti Nurhaliza",
      role: "Business Owner, Penang",
      content: "The OCR feature is amazing. Just snap and done. Love the Google Drive backup too.",
      rating: 5,
    },
    {
      name: "Rajesh Kumar",
      role: "Accountant, JB",
      content: "Clean interface, accurate LHDN categories. I recommend this to all my clients now.",
      rating: 5,
    },
  ]

  return (
    <div className="min-h-[100svh] w-full overflow-x-hidden bg-gradient-to-b from-emerald-50/50 via-white to-white dark:from-emerald-950/20 dark:via-gray-900 dark:to-gray-900">
      {/* PWA Install Banner */}
      {showInstallBanner && (
        <div className="sticky top-0 z-50 flex items-center justify-between gap-2 border-b border-border bg-emerald-50 px-4 py-2 text-sm dark:bg-emerald-950">
          <span className="text-emerald-800 dark:text-emerald-200">Install ReliefTrack for the best experience</span>
          <button onClick={handleInstall}
            className="rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700 active:scale-95">
            Install
          </button>
        </div>
      )}

      {/* Navbar */}
      <header className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600">
              <Receipt className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-bold text-foreground">ReliefTrack MY</span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden items-center gap-8 md:flex">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.label}
              </a>
            ))}
          </nav>

          {/* Desktop CTA */}
          <div className="hidden items-center gap-3 md:flex">
            {mounted && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="h-9 w-9"
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
            )}
            {isLoggedIn ? (
              <Link href="/dashboard">
                <Button className="gap-2 bg-emerald-600 text-white shadow-md hover:bg-emerald-700">
                  Dashboard
                </Button>
              </Link>
            ) : (
              <Button
                onClick={handleGoogleSignIn}
                disabled={signInLoading}
                className="gap-2 bg-white text-foreground shadow-md hover:bg-gray-50 disabled:opacity-70 dark:bg-gray-800 dark:hover:bg-gray-700"
              >
                {signInLoading ? (
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
                ) : (
                  <GoogleLogo />
                )}
                Sign in with Google
              </Button>
            )}
          </div>

          {/* Mobile Menu */}
          <div className="flex items-center gap-2 md:hidden">
            {mounted && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="h-9 w-9"
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
            )}
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[280px]">
                <nav className="mt-8 flex flex-col gap-4">
                  {navLinks.map((link) => (
                    <a
                      key={link.href}
                      href={link.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className="text-lg font-medium text-foreground"
                    >
                      {link.label}
                    </a>
                  ))}
                  <Button
                  onClick={handleGoogleSignIn}
                  disabled={signInLoading}
                  className="mt-4 w-full gap-2 bg-white text-foreground shadow-md hover:bg-gray-50 disabled:opacity-70 dark:bg-gray-800 dark:hover:bg-gray-700"
                >
                  {signInLoading ? (
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
                  ) : (
                    <GoogleLogo />
                  )}
                  Sign in with Google
                </Button>
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Background Elements — pseudo-element gradients avoid layout/viewport inflation */}
        <div className="absolute inset-0 -z-10 overflow-hidden before:absolute before:inset-0 before:bg-[radial-gradient(ellipse_at_top_right,rgb(16,185,129)_/0.12,transparent_60%)] after:absolute after:inset-0 after:bg-[radial-gradient(ellipse_at_bottom_left,rgb(248,113,113)_/0.10,transparent_60%)]" />

        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-8">
            {/* Left Content */}
            <div className="text-center lg:text-left">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-emerald-100 px-4 py-1.5 text-sm font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                <Sparkles className="h-4 w-4" />
                Year of Assessment 2025/2026
              </div>
              
              <h1 className="mb-6 text-2xl font-bold tracking-tight text-foreground sm:text-3xl lg:text-4xl">
                Never Miss a{" "}
                <span className="bg-gradient-to-r from-emerald-600 to-emerald-500 bg-clip-text text-transparent">
                  Tax Relief
                </span>{" "}
                Again
              </h1>
              
              <p className="mb-8 text-lg text-muted-foreground sm:text-xl">
                Track all your Malaysia income tax reliefs & deductions in one place. 
                Know exactly how much you&apos;ve claimed before 30 April.
              </p>

              <div className="mb-8 flex flex-col items-center gap-4 sm:flex-row lg:justify-start">
                <Button
                  size="lg"
                  onClick={handleGoogleSignIn}
                  disabled={signInLoading}
                  className="gap-2 bg-white px-6 text-foreground shadow-lg hover:bg-gray-50 disabled:opacity-70 dark:bg-gray-800 dark:hover:bg-gray-700"
                >
                  {signInLoading ? (
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
                  ) : (
                    <GoogleLogo />
                  )}
                  Sign in with Google
                </Button>
                <Link href="/dashboard?demo=true">
                  <Button size="lg" variant="outline" className="gap-2 px-6">
                    Try Demo
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>

              <p className="text-sm text-muted-foreground">
                No credit card required • Your data stays private
              </p>

              {/* Trust Badges */}
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
                <LHDNBadge />
                <Badge variant="secondary" className="gap-1.5">
                  <Cloud className="h-3 w-3" />
                  Google Drive Integrated
                </Badge>
                <Badge variant="secondary" className="gap-1.5">
                  <Shield className="h-3 w-3" />
                  Secure
                </Badge>
              </div>
            </div>

            {/* Right - Phone Mockup */}
            <div className="flex justify-center lg:justify-end">
              <PhoneMockup />
            </div>
          </div>
        </div>
      </section>

      {/* App Info Section */}
      <section className="border-y border-border/40 bg-muted/30">
        <div className="mx-auto max-w-4xl px-4 py-12 text-center sm:px-6 lg:px-8">
          <div className="mb-4 inline-flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Built for Malaysians</span>
          </div>
          <p className="text-lg text-muted-foreground">
            ReliefTrack MY helps Malaysians easily scan receipts, track LHDN-approved reliefs 
            (medical, children, parents, EPF, lifestyle, etc.), and maximize their tax refund. 
            Built with official LHDN relief categories for Year of Assessment 2025/2026.
          </p>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="scroll-mt-20 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <Badge className="mb-4 bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400">
              Features
            </Badge>
            <h2 className="mb-4 text-3xl font-bold text-foreground sm:text-4xl">
              Everything You Need to Maximize Reliefs
            </h2>
            <p className="mx-auto max-w-2xl text-muted-foreground">
              From scanning receipts to tracking progress, we&apos;ve got you covered.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <FeatureCard key={feature.title} {...feature} />
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="scroll-mt-20 bg-muted/30 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <Badge className="mb-4 bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400">
              How It Works
            </Badge>
            <h2 className="mb-4 text-3xl font-bold text-foreground sm:text-4xl">
              Get Started in 4 Simple Steps
            </h2>
          </div>

          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {howItWorks.map((item) => (
              <div key={item.step} className="relative text-center">
                <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-xl font-bold text-white shadow-lg">
                  {item.step}
                </div>
                {item.step < 4 && (
                  <ChevronRight className="absolute right-0 top-6 hidden h-6 w-6 text-muted-foreground/40 lg:block" />
                )}
                <h3 className="mb-2 font-semibold text-foreground">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <Badge className="mb-4 bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400">
              Testimonials
            </Badge>
            <h2 className="mb-4 text-3xl font-bold text-foreground sm:text-4xl">
              Loved by Malaysians
            </h2>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {testimonials.map((testimonial) => (
              <TestimonialCard key={testimonial.name} {...testimonial} />
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="scroll-mt-20 bg-muted/30 py-20">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <Badge className="mb-4 bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400">
            Pricing
          </Badge>
          <h2 className="mb-4 text-3xl font-bold text-foreground sm:text-4xl">
            Completely Free
          </h2>
          <p className="mb-8 text-muted-foreground">
            ReliefTrack MY is free to use. We believe every Malaysian deserves easy access to tax relief tracking.
          </p>
          
          <Card className="mx-auto max-w-md border-2 border-emerald-500 bg-white shadow-xl dark:bg-gray-800">
            <CardContent className="p-8">
              <div className="mb-4 text-5xl font-bold text-foreground">RM 0</div>
              <p className="mb-6 text-muted-foreground">Forever free</p>
              
              <ul className="mb-8 space-y-3 text-left text-sm">
                {[
                  "Unlimited receipt scanning",
                  "All LHDN relief categories",
                  "Google Drive backup",
                  "Export reports (CSV, PDF)",
                  "Deadline reminders",
                  "No ads, no hidden fees",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                    {item}
                  </li>
                ))}
              </ul>
              
              <Link href="/dashboard?demo=true">
                <Button size="lg" className="w-full gap-2 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white hover:from-emerald-600 hover:to-emerald-700">
                  Get Started Free
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative overflow-hidden bg-gradient-to-br from-emerald-600 to-emerald-700 py-20 text-white">
        <div className="absolute inset-0 -z-10">
          <KLSkyline className="absolute bottom-0 w-full text-emerald-800" />
        </div>
        
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <Smartphone className="mx-auto mb-6 h-16 w-16 text-emerald-200" />
          <h2 className="mb-4 text-3xl font-bold sm:text-4xl">
            Start Tracking Your Tax Reliefs Today
          </h2>
          <p className="mb-8 text-emerald-100">
            Join thousands of Malaysians who are maximizing their tax refunds with ReliefTrack MY.
          </p>
          
          <Link href="/dashboard">
            <Button size="lg" className="gap-2 bg-white px-8 text-emerald-700 shadow-lg hover:bg-emerald-50">
              <GoogleLogo />
              Sign in with Google
            </Button>
          </Link>
          
          <p className="mt-4 text-sm text-emerald-200">
            No credit card required • Data stays private
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-background py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600">
                <Receipt className="h-4 w-4 text-white" />
              </div>
              <span className="font-semibold text-foreground">ReliefTrack MY</span>
            </div>
            
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <a href="#" className="transition-colors hover:text-foreground">Privacy Policy</a>
              <a href="#" className="transition-colors hover:text-foreground">Terms of Service</a>
              <a href="https://www.hasil.gov.my" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-foreground">
                LHDN Official
              </a>
            </div>
          </div>
          
          <div className="mt-8 border-t border-border pt-8 text-center text-sm text-muted-foreground">
            <p className="mb-2">
              This app is for personal tax planning purposes only. Tax relief categories and limits are based on LHDN guidelines.
              Always verify with LHDN for official eligibility and amounts.
            </p>
            <p>© {new Date().getFullYear()} ReliefTrack MY. Made with love in Malaysia.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
