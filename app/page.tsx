// This MUST be a Server Component for force-dynamic to work
export const dynamic = 'force-dynamic'

import LandingPageClient from './_landing-client'

export default function LandingPage() {
  return <LandingPageClient />
}
