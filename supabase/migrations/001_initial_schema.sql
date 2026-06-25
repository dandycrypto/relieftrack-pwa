-- ============================================================================
-- ReliefTrack MY — Initial Supabase Schema
-- Migration: 001_initial_schema.sql
-- Purpose: Core tables for ReliefTrack expense tracking app
-- ============================================================================

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE verification_status AS ENUM ('verified', 'pending', 'flagged');
CREATE TYPE record_status AS ENUM ('verified', 'pending');
CREATE TYPE language_code AS ENUM ('en', 'ms', 'zh');
CREATE TYPE theme_pref AS ENUM ('light', 'dark', 'system');
CREATE TYPE marital_status AS ENUM ('single', 'married', 'divorced', 'widowed');
CREATE TYPE recipient_type AS ENUM ('self', 'spouse', 'child', 'parent', 'other');
CREATE TYPE currency_code AS ENUM ('MYR', 'SGD', 'USD', 'GBP', 'EUR');

-- ============================================================================
-- EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- PROFILES (extends auth.users)
-- One row per user, created automatically via trigger on auth.users insert
-- ============================================================================

CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Tax profile fields
    marital_status marital_status NOT NULL DEFAULT 'single',
    is_spouse_working BOOLEAN NOT NULL DEFAULT FALSE,
    children_under_18 INTEGER NOT NULL DEFAULT 0,
    children_education INTEGER NOT NULL DEFAULT 0,

    -- Disability flags
    is_disabled BOOLEAN NOT NULL DEFAULT FALSE,
    is_spouse_disabled BOOLEAN NOT NULL DEFAULT FALSE,
    is_child_disabled BOOLEAN NOT NULL DEFAULT FALSE,

    -- Parent relief
    has_parents BOOLEAN NOT NULL DEFAULT FALSE,
    parents_count INTEGER NOT NULL DEFAULT 0,

    -- Home ownership
    is_first_home_owner BOOLEAN NOT NULL DEFAULT FALSE,

    -- Avatar
    avatar_url TEXT,
    phone TEXT,

    CONSTRAINT email_not_empty CHECK (TRIM(email) <> '')
);

-- ============================================================================
-- RECORDS (expense/receipt entries)
-- ============================================================================

CREATE TABLE public.records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

    -- Core fields
    merchant TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL,  -- maps to ReliefCategory id
    date DATE NOT NULL,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
    currency currency_code NOT NULL DEFAULT 'MYR',
    description TEXT NOT NULL DEFAULT '',

    -- Receipt
    receipt_url TEXT,  -- Supabase Storage URL or Drive link
    receipt_file_name TEXT,
    receipt_stored_path TEXT,  -- Supabase Storage internal path

    -- Financial details
    invoice_number TEXT,
    tax_amount NUMERIC(12, 2) CHECK (tax_amount >= 0),
    payment_method TEXT,

    -- LHDN-specific
    lhdn_category TEXT,  -- e.g. "Medical-Parents", "Lifestyle-SportsEquipment"
    is_tax_exempt BOOLEAN NOT NULL DEFAULT FALSE,

    -- Verification
    status record_status NOT NULL DEFAULT 'pending',
    verification_status verification_status NOT NULL DEFAULT 'pending',
    verification_confidence NUMERIC(5, 4),  -- 0.0000 to 1.0000
    ocr_text TEXT,  -- raw OCR text for reference

    -- People
    recipient recipient_type NOT NULL DEFAULT 'self',

    -- Line items (semicolon-separated, max 3 items)
    line_items TEXT,

    -- Additional notes
    notes TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Soft delete (RLS handles access control, but soft delete for audit)
    deleted_at TIMESTAMPTZ,

    -- Constraints
    CONSTRAINT merchant_not_empty CHECK (TRIM(merchant) <> ''),
    CONSTRAINT category_not_empty CHECK (TRIM(category) <> ''),
    CONSTRAINT positive_amount CHECK (amount > 0 OR receipt_url IS NOT NULL)
);

-- ============================================================================
-- SETTINGS (user preferences)
-- One row per user (singleton pattern)
-- ============================================================================

CREATE TABLE public.settings (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,

    -- Google Drive connection
    google_drive_connected BOOLEAN NOT NULL DEFAULT FALSE,
    google_drive_email TEXT,
    google_drive_folder_id TEXT,  -- Drive folder ID for uploads
    last_sync_time TIMESTAMPTZ,

    -- Upload preferences
    auto_upload_receipts BOOLEAN NOT NULL DEFAULT TRUE,

    -- Storage tracking
    storage_used_bytes BIGINT NOT NULL DEFAULT 0,

    -- Notifications
    tax_deadline_reminders BOOLEAN NOT NULL DEFAULT TRUE,
    low_relief_alerts BOOLEAN NOT NULL DEFAULT TRUE,
    weekly_summary BOOLEAN NOT NULL DEFAULT FALSE,
    lhdn_updates BOOLEAN NOT NULL DEFAULT TRUE,
    biometric_lock BOOLEAN NOT NULL DEFAULT FALSE,

    -- App preferences
    language language_code NOT NULL DEFAULT 'en',
    themePreference theme_pref NOT NULL DEFAULT 'system',
    default_tax_year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM NOW()),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- DRIVE_CONNECTIONS (Google OAuth tokens — for real Google Sign-In)
-- ============================================================================

CREATE TABLE public.drive_connections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

    -- OAuth tokens
    access_token TEXT,
    refresh_token TEXT,
    token_type TEXT DEFAULT 'Bearer',
    expires_at TIMESTAMPTZ,
    scope TEXT,

    -- Connection metadata
    connected_email TEXT,
    connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    disconnected_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT one_active_connection UNIQUE (user_id) WHERE is_active = TRUE
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- records: user lookups (most common query)
CREATE INDEX idx_records_user_id ON public.records(user_id);
CREATE INDEX idx_records_user_date ON public.records(user_id, date DESC);
CREATE INDEX idx_records_user_category ON public.records(user_id, category);

-- records: status filtering
CREATE INDEX idx_records_status ON public.records(status) WHERE deleted_at IS NULL;

-- records: full-text search (optional, for future search feature)
CREATE INDEX idx_records_merchant_fts ON public.records USING gin(to_tsvector('english', merchant));

-- records: soft delete filter
CREATE INDEX idx_records_deleted ON public.records(deleted_at) WHERE deleted_at IS NOT NULL;

-- profiles: email lookups
CREATE UNIQUE INDEX idx_profiles_email ON public.profiles(email);

-- settings: user singleton
CREATE INDEX idx_settings_user ON public.settings(user_id);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drive_connections ENABLE ROW LEVEL SECURITY;

-- PROFILES: Users can only read/write their own profile
CREATE POLICY "Users can view own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
    ON public.profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

-- RECORDS: Users can only CRUD their own records
CREATE POLICY "Users can view own records"
    ON public.records FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own records"
    ON public.records FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own records"
    ON public.records FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own records"
    ON public.records FOR DELETE
    USING (auth.uid() = user_id);

-- SETTINGS: Singleton — users only see/edit their own
CREATE POLICY "Users can view own settings"
    ON public.settings FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings"
    ON public.settings FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings"
    ON public.settings FOR UPDATE
    USING (auth.uid() = user_id);

-- DRIVE_CONNECTIONS: Users only access their own connections
CREATE POLICY "Users can view own drive connections"
    ON public.drive_connections FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own drive connections"
    ON public.drive_connections FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own drive connections"
    ON public.drive_connections FOR UPDATE
    USING (auth.uid() = user_id);

-- ============================================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to all tables
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON public.records
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON public.settings
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON public.drive_connections
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Auto-create profile when user signs up via Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    -- Insert profile
    INSERT INTO public.profiles (id, email, name)
    VALUES (
        NEW.id,
        COALESCE(NEW.email, ''),
        COALESCE(NEW.raw_user_meta_data->>'name', '')
    );

    -- Insert default settings
    INSERT INTO public.settings (user_id)
    VALUES (NEW.id);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: after auth.users insert → create profile + settings
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Soft delete helper (sets deleted_at instead of hard delete)
CREATE OR REPLACE FUNCTION public.soft_delete_record()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.records
    SET deleted_at = NOW()
    WHERE id = OLD.id;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Calculate total relief amount for a user (for dashboard)
CREATE OR REPLACE FUNCTION public.get_user_total_relief(
    p_user_id UUID,
    p_tax_year INTEGER DEFAULT EXTRACT(YEAR FROM NOW())
)
RETURNS NUMERIC(12, 2) AS $$
DECLARE
    v_total NUMERIC(12, 2);
BEGIN
    SELECT COALESCE(SUM(amount), 0)
    INTO v_total
    FROM public.records
    WHERE user_id = p_user_id
      AND status = 'verified'
      AND EXTRACT(YEAR FROM date) = p_tax_year
      AND deleted_at IS NULL;

    RETURN v_total;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get relief breakdown by category for a user
CREATE OR REPLACE FUNCTION public.get_user_relief_by_category(
    p_user_id UUID,
    p_tax_year INTEGER DEFAULT EXTRACT(YEAR FROM NOW())
)
RETURNS TABLE(category TEXT, total NUMERIC(12, 2), count BIGINT) AS $$
BEGIN
    RETURN QUERY
    SELECT
        r.category,
        COALESCE(SUM(r.amount), 0)::NUMERIC(12, 2) AS total,
        COUNT(*)::BIGINT AS count
    FROM public.records r
    WHERE r.user_id = p_user_id
      AND EXTRACT(YEAR FROM r.date) = p_tax_year
      AND r.deleted_at IS NULL
    GROUP BY r.category
    ORDER BY total DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- STORAGE BUCKETS
-- ============================================================================

-- Create storage bucket for receipt images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'receipts',
    'receipts',
    FALSE,  -- private bucket
    10485760,  -- 10MB max
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policy: users can only access their own receipts
CREATE POLICY "Users can upload own receipts"
    ON storage.objects FOR INSERT
    WITH CHECK (auth.uid()::TEXT = (storage.foldername(name))[1]);

CREATE POLICY "Users can view own receipts"
    ON storage.objects FOR SELECT
    USING (auth.uid()::TEXT = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own receipts"
    ON storage.objects FOR DELETE
    USING (auth.uid()::TEXT = (storage.foldername(name))[1]);

-- ============================================================================
-- SUMMARY VIEW (for dashboard analytics)
-- ============================================================================

CREATE OR REPLACE VIEW public.dashboard_summary AS
SELECT
    r.user_id,
    EXTRACT(YEAR FROM r.date) AS tax_year,
    COUNT(*) AS total_records,
    COUNT(*) FILTER (WHERE r.status = 'verified') AS verified_records,
    SUM(r.amount) AS total_amount,
    SUM(r.amount) FILTER (WHERE r.status = 'verified') AS verified_amount,
    SUM(r.tax_amount) FILTER (WHERE r.tax_amount IS NOT NULL) AS total_tax,
    MAX(r.date) AS last_record_date
FROM public.records r
WHERE r.deleted_at IS NULL
GROUP BY r.user_id, EXTRACT(YEAR FROM r.date);

-- ============================================================================
-- SEED DATA: LHDN YA 2025 Relief Categories (reference table, not for auth)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.lhdn_categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    max_limit NUMERIC(12, 2) NOT NULL,
    icon TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    always_show BOOLEAN NOT NULL DEFAULT FALSE,
    profile_key TEXT,  -- references Profile fields
    per_item BOOLEAN NOT NULL DEFAULT FALSE,
    effective_from TEXT NOT NULL DEFAULT '2025',
    active BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO public.lhdn_categories (id, name, max_limit, icon, description, always_show, profile_key, per_item) VALUES
    ('individual', 'Individual & Dependent Relatives', 9000, 'User', 'Automatic relief for all taxpayers', TRUE, NULL, FALSE),
    ('medical_self', 'Medical (Self, Spouse, Children)', 10000, 'Stethoscope', 'Serious diseases, fertility treatment, vaccination', TRUE, NULL, FALSE),
    ('parents_medical', 'Parents Medical & Carer', 8000, 'Heart', 'Medical expenses for parents', FALSE, 'has_parents', FALSE),
    ('disabled', 'Disabled Individual', 7000, 'Users', 'Additional relief for disabled persons', FALSE, 'is_disabled', FALSE),
    ('disabled_equipment', 'Disabled Equipment', 6000, 'Users', 'Supporting equipment for disabled', FALSE, 'is_disabled', FALSE),
    ('spouse', 'Spouse / Alimony', 4000, 'Heart', 'For non-working spouse or alimony payments', FALSE, 'has_spouse_relief', FALSE),
    ('children_under18', 'Children (Under 18)', 2000, 'Users', 'Per child relief', FALSE, 'has_children_under_18', TRUE),
    ('children_education', 'Children (Higher Education)', 8000, 'GraduationCap', 'Children in tertiary education', FALSE, 'has_children_education', TRUE),
    ('education_self', 'Education (Self)', 7000, 'GraduationCap', 'Degree, Masters, professional courses', TRUE, NULL, FALSE),
    ('lifestyle', 'Lifestyle', 2500, 'Smartphone', 'Books, PC, smartphone, sports equipment, internet', TRUE, NULL, FALSE),
    ('epf_insurance', 'EPF / Life Insurance / Takaful', 7000, 'PiggyBank', 'Retirement and insurance contributions', TRUE, NULL, FALSE),
    ('housing_loan', 'First Home Housing Loan Interest', 7000, 'Building', 'Interest on first home loan', FALSE, 'is_first_home_owner', FALSE)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE public.records IS 'Individual expense/receipt records for LHDN tax relief tracking';
COMMENT ON TABLE public.profiles IS 'User profiles extending Supabase Auth users';
COMMENT ON TABLE public.settings IS 'User preferences and app settings (singleton per user)';
COMMENT ON TABLE public.drive_connections IS 'Google Drive OAuth connection tokens';
COMMENT ON TABLE public.lhdn_categories IS 'LHDN YA 2025 tax relief categories (read-only reference)';
COMMENT ON VIEW public.dashboard_summary IS 'Pre-computed dashboard aggregates per user per tax year';
