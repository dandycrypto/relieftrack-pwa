/**
 * lib/supabase.ts — Supabase client singleton
 *
 * Usage:
 *   import { supabase } from '@/lib/supabase'
 *
 * For server-side (API routes):   use supabase (anon key, respects RLS)
 * For admin operations:            use supabaseAdmin (service role, bypasses RLS)
 */

import { createClient } from '@supabase/supabase-js'

// ─── Environment ────────────────────────────────────────────────────────────

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// ─── Validate env ────────────────────────────────────────────────────────────

if (!supabaseUrl || !supabaseAnonKey) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Missing Supabase environment variables. ' +
      'Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local'
    )
  }
  // In dev without Supabase, provide graceful fallback (localStorage mode)
  console.warn(
    '[Supabase] Environment variables not set. ' +
    'Running in localStorage fallback mode. ' +
    'See .env.local.example for setup instructions.'
  )
}

// ─── Client ─────────────────────────────────────────────────────────────────

/**
 * Browser/client-side Supabase client
 * Uses anon key — RLS policies enforce data access rules
 */
export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        // Auto-refresh session before expiry
        autoRefreshToken: true,
        // Detect session from URL (for OAuth callbacks)
        detectSessionInUrl: true,
        // Persist session in localStorage
        persistSession: true,
        // Storage key prefix to avoid conflicts
        storageKey: 'reliefttrack-auth',
        // Cookie options (for server-side session sync)
        cookieOptions: {
          name: 'reliefttrack-auth-token',
          lifetime: 60 * 60 * 8, // 8 hours
          domain: undefined,
          path: '/',
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
        },
      },
    })
  : null

/**
 * Server-side Supabase client with service role
 * Bypasses RLS — use ONLY in trusted server-side API routes
 * Never import this in client-side code!
 */
export const supabaseAdmin = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null

// ─── Type helpers ─────────────────────────────────────────────────────────────

/** Get current authenticated user ID from client session */
export async function getCurrentUserId(): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

/** Get current session (for client-side checks) */
export async function getCurrentSession() {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session
}

// ─── Record helpers ───────────────────────────────────────────────────────────

export interface DbRecord {
  id?: string
  user_id: string
  merchant: string
  category: string
  date: string
  amount: number
  currency?: string
  description?: string
  receipt_url?: string
  receipt_file_name?: string
  invoice_number?: string
  tax_amount?: number
  payment_method?: string
  lhdn_category?: string
  is_tax_exempt?: boolean
  status?: 'verified' | 'pending'
  verification_status?: 'verified' | 'pending' | 'flagged'
  verification_confidence?: number
  ocr_text?: string
  recipient?: string
  line_items?: string
  notes?: string
  created_at?: string
  updated_at?: string
}

/** Fetch all records for current user */
export async function fetchRecords(userId: string) {
  if (!supabase) return { data: [], error: 'Supabase not configured' }
  const { data, error } = await supabase
    .from('records')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('date', { ascending: false })
  return { data: data as DbRecord[] | null, error }
}

/** Insert a new record */
export async function insertRecord(record: Omit<DbRecord, 'id' | 'created_at' | 'updated_at'>) {
  if (!supabase) return { data: null, error: 'Supabase not configured' }
  const { data, error } = await supabase
    .from('records')
    .insert(record)
    .select()
    .single()
  return { data: data as DbRecord | null, error }
}

/** Update an existing record */
export async function updateRecord(id: string, updates: Partial<DbRecord>) {
  if (!supabase) return { data: null, error: 'Supabase not configured' }
  const { data, error } = await supabase
    .from('records')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  return { data: data as DbRecord | null, error }
}

/** Soft-delete a record */
export async function deleteRecord(id: string) {
  if (!supabase) return { error: 'Supabase not configured' }
  const { error } = await supabase
    .from('records')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  return { error }
}

/** Upload receipt image to Supabase Storage */
export async function uploadReceipt(
  userId: string,
  file: File | Blob,
  fileName: string
) {
  if (!supabase) return { data: null, error: 'Supabase not configured' }

  const ext = fileName.split('.').pop() ?? 'jpg'
  const path = `${userId}/${Date.now()}.${ext}`

  const { data, error } = await supabase.storage
    .from('receipts')
    .upload(path, file, {
      contentType: file.type || 'image/jpeg',
      upsert: false,
    })

  if (error) return { data: null, error }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from('receipts')
    .getPublicUrl(data.path)

  return { data: { path: data.path, url: urlData.publicUrl }, error: null }
}

// ─── Profile helpers ─────────────────────────────────────────────────────────

export interface DbProfile {
  id: string
  email: string
  name: string
  marital_status?: string
  is_spouse_working?: boolean
  children_under_18?: number
  children_education?: number
  is_disabled?: boolean
  is_spouse_disabled?: boolean
  is_child_disabled?: boolean
  has_parents?: boolean
  parents_count?: number
  is_first_home_owner?: boolean
  avatar_url?: string
  phone?: string
  created_at?: string
  updated_at?: string
}

export async function fetchProfile(userId: string) {
  if (!supabase) return { data: null, error: 'Supabase not configured' }
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  return { data: data as DbProfile | null, error }
}

export async function updateProfile(userId: string, updates: Partial<DbProfile>) {
  if (!supabase) return { data: null, error: 'Supabase not configured' }
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select()
    .single()
  return { data: data as DbProfile | null, error }
}

// ─── Settings helpers ────────────────────────────────────────────────────────

export interface DbSettings {
  user_id: string
  google_drive_connected: boolean
  google_drive_email?: string
  google_drive_folder_id?: string
  last_sync_time?: string
  auto_upload_receipts: boolean
  storage_used_bytes: number
  tax_deadline_reminders: boolean
  low_relief_alerts: boolean
  weekly_summary: boolean
  lhdn_updates: boolean
  biometric_lock: boolean
  language: string
  theme_preference: string
  default_tax_year: number
}

export async function fetchSettings(userId: string) {
  if (!supabase) return { data: null, error: 'Supabase not configured' }
  const { data, error } = await supabase
    .from('settings')
    .select('*')
    .eq('user_id', userId)
    .single()
  return { data: data as DbSettings | null, error }
}

export async function updateSettings(userId: string, updates: Partial<DbSettings>) {
  if (!supabase) return { data: null, error: 'Supabase not configured' }
  const { data, error } = await supabase
    .from('settings')
    .update(updates)
    .eq('user_id', userId)
    .select()
    .single()
  return { data: data as DbSettings | null, error }
}

// ─── Dashboard aggregation ────────────────────────────────────────────────────

export async function fetchDashboardSummary(userId: string, taxYear?: number) {
  if (!supabase) return { data: null, error: 'Supabase not configured' }
  const year = taxYear ?? new Date().getFullYear()
  const { data, error } = await supabase
    .from('dashboard_summary')
    .select('*')
    .eq('user_id', userId)
    .eq('tax_year', year)
    .single()
  return { data, error }
}

export async function fetchReliefByCategory(userId: string, taxYear?: number) {
  if (!supabaseAdmin) return { data: [], error: 'Supabase admin not configured' }
  const year = taxYear ?? new Date().getFullYear()
  const { data, error } = await supabaseAdmin
    .rpc('get_user_relief_by_category', {
      p_user_id: userId,
      p_tax_year: year,
    })
  return { data, error }
}
