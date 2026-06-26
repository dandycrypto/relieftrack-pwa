import { redirect } from 'next/navigation'

// Backwards-compat alias: /profile used to be a standalone route.
// Profile now lives as a tab inside the dashboard.
export default function ProfileRedirect() {
  redirect('/dashboard?tab=profile')
}