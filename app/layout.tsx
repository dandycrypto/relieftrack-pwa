import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import Script from 'next/script'

// Only load Vercel Analytics when deployed on Vercel infrastructure
// On Oracle Cloud VPS (localhost/149.118.x.x), skip to avoid 404
const isVercel = !!process.env.VERCEL_URL && !process.env.VERCEL_URL.includes('localhost')
import { ThemeProvider } from '@/components/theme-provider'
import './globals.css'

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: 'ReliefTrack MY - Malaysia Income Tax Relief Tracker',
  description: 'Track your LHDN income tax reliefs for Year of Assessment 2025/2026',
  generator: 'v0.app',
  manifest: '/manifest.json',
  themeColor: '#059669',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'ReliefTrack MY',
  },
  icons: {
    icon: [
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-touch-icon.png',
    other: [
      {
        url: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        url: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  minimumScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="bg-background w-full overflow-x-hidden">
      <head>
        <meta name="theme-color" content="#059669" />
        <meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=5, viewport-fit=cover" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="ReliefTrack MY" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <style dangerouslySetInnerHTML={{ __html: `
          html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; overflow-x: hidden; }
          body { overflow-x: hidden; }
          input, select, textarea { font-size: 16px; }
        `}} />
      </head>
      <body className={`${inter.variable} font-sans antialiased w-full overflow-x-hidden`}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
        >
          Skip to main content
        </a>
        <div id="main-content" className="w-full min-h-svh flex flex-col">
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            {children}
          </ThemeProvider>
        </div>
        {isVercel && process.env.NODE_ENV === 'production' && <Analytics />}
        <Script id="sw-register" strategy="lazyOnload">{`if ('serviceWorker' in navigator) { window.addEventListener('load', function() { navigator.serviceWorker.register('/sw.js').then(function(registration) { console.log('SW registered:', registration.scope); }).catch(function(error) { console.log('SW registration failed:', error); }); }); }`}</Script>
      </body>
    </html>
  )
}
