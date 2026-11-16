-- ==============================================================================
-- E-TOLL CONTROL - SKEMA DATABASE UTAMA (01_schema.sql)
-- ==============================================================================
-- Skrip ini membuat tipe data status, tabel utama, relasi, indeks, dan trigger otomatis.
-- Jalankan skrip ini di SQL Editor pada dashboard proyek Supabase Anda.

-- 1. Tipe Data Status (Enum)
DO $$ BEGIN
    CREATE TYPE card_status AS ENUM (
        'available',
        'pending_approval',
        'borrowed',
        'pending_return_review',
        'inactive'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE transaction_status AS ENUM (
        'pending_approval',
        'borrowed',
        'pending_return_review',
        'completed',
        'rejected'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE return_status AS ENUM (
        'pending_review',
        'approved',
        'rejected'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Tabel Profil Pengguna (Tersambung ke Supabase Auth)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Aturan Keamanan: Hanya boleh ada MAKSIMAL SATU akun dengan role 'admin' di seluruh sistem
CREATE UNIQUE INDEX IF NOT EXISTS only_one_admin_idx 
ON public.profiles (role) 
WHERE role = 'admin';

-- 3. Tabel Master Kartu e-Toll
CREATE TABLE IF NOT EXISTS public.cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    label TEXT NOT NULL,
    card_identifier TEXT NOT NULL,
    qr_token TEXT NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
    status card_status NOT NULL DEFAULT 'available',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. Tabel Transaksi Peminjaman
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id UUID NOT NULL REFERENCES public.cards(id) ON DELETE RESTRICT,
    borrower_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    borrow_date DATE NOT NULL DEFAULT CURRENT_DATE,
    purpose TEXT NOT NULL,
    status transaction_status NOT NULL DEFAULT 'pending_approval',
    requested_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    decision_by UUID REFERENCES public.profiles(id),
    decision_at TIMESTAMPTZ,
    decision_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Batasan Kritis: Satu kartu TIDAK BOLEH memiliki lebih dari satu transaksi yang aktif/berjalan
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_transaction_per_card 
ON public.transactions (card_id) 
WHERE status IN ('pending_approval', 'borrowed', 'pending_return_review');

-- 5. Tabel Pengembalian & Bukti Top Up
CREATE TABLE IF NOT EXISTS public.returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL UNIQUE REFERENCES public.transactions(id) ON DELETE RESTRICT,
    topup_date DATE NOT NULL,
    topup_amount NUMERIC(12, 2) NOT NULL CHECK (topup_amount >= 0),
    receipt_storage_path TEXT NOT NULL,
    status return_status NOT NULL DEFAULT 'pending_review',
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    reviewed_by UUID REFERENCES public.profiles(id),
    reviewed_at TIMESTAMPTZ,
    review_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 6. Tabel Audit Log (Catatan Jejak Aktivitas Penting)
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES public.profiles(id),
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Mencegah modifikasi atau penghapusan catatan log audit oleh siapa pun
CREATE OR REPLACE RULE no_update_audit_logs AS ON UPDATE TO public.audit_logs DO INSTEAD NOTHING;
CREATE OR REPLACE RULE no_delete_audit_logs AS ON DELETE TO public.audit_logs DO INSTEAD NOTHING;

-- 7. Trigger Otomatis: Buat Profil saat Pengguna Mendaftar
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        'user' -- Selalu 'user' secara default demi keamanan
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
