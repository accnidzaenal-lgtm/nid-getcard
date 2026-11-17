-- ==============================================================================
-- NID-GATECARD - TAHAP 2: DATA & FORM SKEMA SALDO, DIVISI & AUDIT LOG (07_data_form_balance_schema.sql)
-- ==============================================================================
-- 1. Tabel Divisi (Departments) dengan RLS & Izin Kelola Admin.
-- 2. Tabel Pengaturan Sistem (App Settings) untuk Saldo Awal Default (Rp300.000).
-- 3. Kolom Saldo di Transactions: saldo_awal, pemakaian, saldo_topup, is_corrected,
--    dan saldo_akhir (dihitung otomatis oleh mesin database: saldo_awal - pemakaian + saldo_topup).
-- 4. Audit Log otomatis dengan nilai sebelum & sesudah untuk persetujuan, penolakan, verifikasi, koreksi.
-- 5. Bucket Supabase Storage 'receipts' privat (foto struk opsional, maks 2MB, gambar saja).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. TABEL DIVISI (DEPARTMENTS)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Semua orang dapat membaca divisi aktif" ON public.departments;
CREATE POLICY "Semua orang dapat membaca divisi aktif"
ON public.departments FOR SELECT
TO anon, authenticated
USING (is_active = true OR public.is_admin());

DROP POLICY IF EXISTS "Hanya admin yang dapat mengelola divisi" ON public.departments;
CREATE POLICY "Hanya admin yang dapat mengelola divisi"
ON public.departments FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Masukkan daftar divisi bawaan (default)
INSERT INTO public.departments (name) VALUES
    ('Operasional'),
    ('General Affair (GA)'),
    ('Keuangan & Akuntansi'),
    ('Pemasaran & Penjualan'),
    ('Teknologi Informasi (IT)'),
    ('Logistik & Pengiriman'),
    ('Sumber Daya Manusia (HRD)'),
    ('Direksi / Manajemen')
ON CONFLICT (name) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 2. TABEL PENGATURAN APLIKASI (APP SETTINGS)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_by UUID REFERENCES public.profiles(id)
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Pengaturan dapat dibaca publik" ON public.app_settings;
CREATE POLICY "Pengaturan dapat dibaca publik"
ON public.app_settings FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Hanya admin yang dapat mengedit pengaturan" ON public.app_settings;
CREATE POLICY "Hanya admin yang dapat mengedit pengaturan"
ON public.app_settings FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

INSERT INTO public.app_settings (key, value, description)
VALUES (
    'default_initial_balance',
    '300000'::jsonb,
    'Saldo awal standar kartu e-Toll saat peminjaman pertama (Rp)'
)
ON CONFLICT (key) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 3. PERLUASAN TABEL TRANSACTIONS & RETURNS DENGAN SKEMA SALDO
-- ------------------------------------------------------------------------------
-- Tambahkan kolom saldo pada tabel transactions
ALTER TABLE public.transactions 
    ADD COLUMN IF NOT EXISTS saldo_awal NUMERIC(12, 2) NOT NULL DEFAULT 300000,
    ADD COLUMN IF NOT EXISTS pemakaian NUMERIC(12, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS saldo_topup NUMERIC(12, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS is_corrected BOOLEAN NOT NULL DEFAULT FALSE;

-- Tambahkan kolom saldo_akhir yang dihitung otomatis oleh database (GENERATED ALWAYS AS)
DO $$ BEGIN
    ALTER TABLE public.transactions 
        ADD COLUMN saldo_akhir NUMERIC(12, 2) 
        GENERATED ALWAYS AS (saldo_awal - pemakaian + saldo_topup) STORED;
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

-- Tambahkan kolom koreksi dan pemakaian pada returns
ALTER TABLE public.returns 
    ADD COLUMN IF NOT EXISTS pemakaian NUMERIC(12, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS is_corrected BOOLEAN NOT NULL DEFAULT FALSE;

-- ------------------------------------------------------------------------------
-- 4. PENYEMPURNAAN TABEL AUDIT_LOGS
-- ------------------------------------------------------------------------------
ALTER TABLE public.audit_logs 
    ADD COLUMN IF NOT EXISTS actor_name TEXT,
    ADD COLUMN IF NOT EXISTS card_id UUID REFERENCES public.cards(id),
    ADD COLUMN IF NOT EXISTS old_values JSONB,
    ADD COLUMN IF NOT EXISTS new_values JSONB;

-- ------------------------------------------------------------------------------
-- 5. KONFIGURASI BUCKET STORAGE 'receipts' (STRUK OPSIONAL, MAKS 2MB, PRIVAT)
-- ------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'receipts',
    'receipts',
    false, -- Bucket privat
    2097152, -- Maksimal 2 MB
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET 
    public = false,
    file_size_limit = 2097152,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- Policy: Publik/peminjam boleh upload struk saat pengembalian (INSERT only)
DROP POLICY IF EXISTS "Peminjam dapat mengunggah struk pengembalian" ON storage.objects;
CREATE POLICY "Peminjam dapat mengunggah struk pengembalian"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'receipts');

-- Policy: HANYA Admin yang boleh melihat/mengunduh file struk (SELECT admin only)
DROP POLICY IF EXISTS "Hanya admin yang dapat melihat foto struk" ON storage.objects;
CREATE POLICY "Hanya admin yang dapat melihat foto struk"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'receipts' AND public.is_admin());

-- ------------------------------------------------------------------------------
-- 6. RPC PEMINJAMAN DENGAN SALDO AWAL OTOMATIS & NORMALISASI NAMA
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_guest_borrow(
    p_card_id UUID,
    p_borrower_name TEXT,
    p_borrower_department TEXT,
    p_purpose TEXT,
    p_borrower_phone TEXT DEFAULT NULL,
    p_borrow_date DATE DEFAULT CURRENT_DATE,
    p_honeypot TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_card_status card_status;
    v_tx_id UUID;
    v_name_clean TEXT;
    v_dept_clean TEXT;
    v_purpose_clean TEXT;
    v_default_balance NUMERIC;
    v_last_balance NUMERIC;
    v_saldo_awal NUMERIC;
BEGIN
    -- 1. Proteksi Spam Honeypot
    IF p_honeypot IS NOT NULL AND trim(p_honeypot) <> '' THEN
        RAISE EXCEPTION 'Aktivitas tidak valid terdeteksi (Proteksi Spam).';
    END IF;

    -- 2. Normalisasi Nama (Kapitalisasi huruf awal kata / Title Case, trim, tanpa NIK)
    v_name_clean := initcap(trim(p_borrower_name));
    v_dept_clean := trim(p_borrower_department);
    v_purpose_clean := trim(p_purpose);

    IF v_name_clean IS NULL OR char_length(v_name_clean) < 2 OR char_length(v_name_clean) > 100 THEN
        RAISE EXCEPTION 'Nama peminjam wajib diisi (antara 2 - 100 karakter).';
    END IF;

    IF v_dept_clean IS NULL OR char_length(v_dept_clean) < 2 OR char_length(v_dept_clean) > 100 THEN
        RAISE EXCEPTION 'Bagian / Divisi wajib dipilih.';
    END IF;

    IF v_purpose_clean IS NULL OR char_length(v_purpose_clean) < 3 OR char_length(v_purpose_clean) > 500 THEN
        RAISE EXCEPTION 'Keperluan peminjaman wajib diisi (antara 3 - 500 karakter).';
    END IF;

    -- 3. Kunci baris kartu
    SELECT status INTO v_card_status
    FROM public.cards
    WHERE id = p_card_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Kartu e-Toll tidak ditemukan.';
    END IF;

    IF v_card_status <> 'available' THEN
        RAISE EXCEPTION 'Kartu ini sedang tidak tersedia atau sedang dipinjam.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.transactions
        WHERE card_id = p_card_id 
          AND status IN ('pending_approval', 'borrowed', 'pending_return_review')
    ) THEN
        RAISE EXCEPTION 'Kartu ini sedang memiliki transaksi aktif yang belum diselesaikan.';
    END IF;

    -- 4. Hitung Saldo Awal:
    -- A. Ambil nilai default dari pengaturan (fallback 300000)
    SELECT COALESCE((value #>> '{}')::NUMERIC, 300000)
    INTO v_default_balance
    FROM public.app_settings
    WHERE key = 'default_initial_balance';

    IF v_default_balance IS NULL THEN
        v_default_balance := 300000;
    END IF;

    -- B. Cek saldo akhir dari transaksi terakhir kartu yang sudah berstatus 'completed'
    SELECT saldo_akhir INTO v_last_balance
    FROM public.transactions
    WHERE card_id = p_card_id AND status = 'completed'
    ORDER BY requested_at DESC, created_at DESC
    LIMIT 1;

    -- C. Jika ada transaksi sebelumnya gunakan saldo_akhir, jika tidak gunakan default
    IF v_last_balance IS NOT NULL THEN
        v_saldo_awal := v_last_balance;
    ELSE
        v_saldo_awal := v_default_balance;
    END IF;

    -- 5. Simpan Transaksi Peminjaman
    INSERT INTO public.transactions (
        card_id,
        borrower_id,
        borrower_name,
        borrower_department,
        borrower_phone,
        borrow_date,
        purpose,
        status,
        saldo_awal,
        pemakaian,
        saldo_topup,
        requested_at
    ) VALUES (
        p_card_id,
        NULL,
        v_name_clean,
        v_dept_clean,
        NULL,
        COALESCE(p_borrow_date, CURRENT_DATE),
        v_purpose_clean,
        'pending_approval',
        v_saldo_awal,
        0,
        0,
        now()
    ) RETURNING id INTO v_tx_id;

    -- 6. Update status kartu
    UPDATE public.cards
    SET status = 'pending_approval', updated_at = now()
    WHERE id = p_card_id;

    -- 7. Audit Log
    INSERT INTO public.audit_logs (actor_id, actor_name, action, entity_type, entity_id, card_id, details)
    VALUES (
        NULL,
        v_name_clean,
        'GUEST_BORROW_REQUEST',
        'transactions',
        v_tx_id,
        p_card_id,
        jsonb_build_object(
            'borrower_name', v_name_clean,
            'department', v_dept_clean,
            'purpose', v_purpose_clean,
            'saldo_awal', v_saldo_awal
        )
    );

    RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ------------------------------------------------------------------------------
-- 7. RPC PENGEMBALIAN DENGAN VALIDASI PEMAKAIAN & STRUK OPSIONAL
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_guest_return(
    p_card_id UUID,
    p_pemakaian NUMERIC DEFAULT 0,
    p_return_notes TEXT DEFAULT NULL,
    p_topup_date DATE DEFAULT CURRENT_DATE,
    p_receipt_storage_path TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_tx_id UUID;
    v_return_id UUID;
    v_card_status card_status;
    v_saldo_awal NUMERIC;
    v_borrower_name TEXT;
    v_clean_notes TEXT;
BEGIN
    SELECT status INTO v_card_status
    FROM public.cards
    WHERE id = p_card_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Kartu e-Toll tidak ditemukan.';
    END IF;

    IF v_card_status <> 'borrowed' THEN
        RAISE EXCEPTION 'Kartu ini tidak sedang dalam status dipinjam.';
    END IF;

    -- Cari transaksi peminjaman aktif
    SELECT id, saldo_awal, borrower_name INTO v_tx_id, v_saldo_awal, v_borrower_name
    FROM public.transactions
    WHERE card_id = p_card_id AND status = 'borrowed'
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tidak ditemukan transaksi peminjaman aktif untuk kartu ini.';
    END IF;

    -- Validasi pemakaian: angka >= 0 dan <= saldo_awal
    IF p_pemakaian IS NULL OR p_pemakaian < 0 THEN
        RAISE EXCEPTION 'Nominal pemakaian tidak boleh kurang dari 0.';
    END IF;

    IF p_pemakaian > v_saldo_awal THEN
        RAISE EXCEPTION 'Nominal pemakaian (Rp%) tidak boleh melebihi saldo awal kartu (Rp%).',
            to_char(p_pemakaian, 'FM999,999,999'), to_char(v_saldo_awal, 'FM999,999,999');
    END IF;

    v_clean_notes := trim(p_return_notes);
    IF v_clean_notes IS NOT NULL AND char_length(v_clean_notes) > 500 THEN
        RAISE EXCEPTION 'Catatan pengembalian maksimal 500 karakter.';
    END IF;

    -- Update transactions: pemakaian diset, saldo_topup awal = pemakaian
    -- Saldo akhir otomatis dihitung oleh database: saldo_awal - pemakaian + saldo_topup
    UPDATE public.transactions
    SET pemakaian = p_pemakaian,
        saldo_topup = p_pemakaian, -- Nilai default top up sama dengan pemakaian
        status = 'pending_return_review',
        updated_at = now()
    WHERE id = v_tx_id;

    -- Simpan data return
    INSERT INTO public.returns (
        transaction_id,
        topup_date,
        topup_amount,
        pemakaian,
        receipt_storage_path,
        return_notes,
        status,
        submitted_at
    ) VALUES (
        v_tx_id,
        COALESCE(p_topup_date, CURRENT_DATE),
        p_pemakaian, -- Saldo top up awal = pemakaian
        p_pemakaian,
        p_receipt_storage_path, -- Opsional
        v_clean_notes,
        'pending_review',
        now()
    )
    ON CONFLICT (transaction_id) DO UPDATE SET
        topup_date = EXCLUDED.topup_date,
        topup_amount = EXCLUDED.topup_amount,
        pemakaian = EXCLUDED.pemakaian,
        receipt_storage_path = COALESCE(EXCLUDED.receipt_storage_path, public.returns.receipt_storage_path),
        return_notes = EXCLUDED.return_notes,
        status = 'pending_review',
        submitted_at = now()
    RETURNING id INTO v_return_id;

    -- Update kartu menjadi pending_return_review
    UPDATE public.cards
    SET status = 'pending_return_review', updated_at = now()
    WHERE id = p_card_id;

    -- Audit Log
    INSERT INTO public.audit_logs (actor_id, actor_name, action, entity_type, entity_id, card_id, details)
    VALUES (
        NULL,
        v_borrower_name,
        'GUEST_RETURN_REQUEST',
        'returns',
        v_return_id,
        p_card_id,
        jsonb_build_object(
            'transaction_id', v_tx_id,
            'pemakaian', p_pemakaian,
            'saldo_topup_auto', p_pemakaian,
            'has_receipt', (p_receipt_storage_path IS NOT NULL)
        )
    );

    RETURN v_return_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ------------------------------------------------------------------------------
-- 8. RPC VERIFIKASI ADMIN DENGAN FITUR KOREKSI SALDO TOP UP & AUDIT LENGKAP
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_decide_return(
    p_return_id UUID,
    p_decision TEXT, -- 'approved' atau 'rejected'
    p_note TEXT DEFAULT NULL,
    p_corrected_topup NUMERIC DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_admin_id UUID;
    v_admin_name TEXT;
    v_tx_id UUID;
    v_card_id UUID;
    v_pemakaian NUMERIC;
    v_old_topup NUMERIC;
    v_final_topup NUMERIC;
    v_is_corrected BOOLEAN := FALSE;
    v_clean_note TEXT;
BEGIN
    v_admin_id := auth.uid();
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Akses ditolak: Hanya Admin Utama yang berwenang.';
    END IF;

    SELECT full_name INTO v_admin_name FROM public.profiles WHERE id = v_admin_id;

    SELECT r.transaction_id, r.topup_amount, t.card_id, t.pemakaian
    INTO v_tx_id, v_old_topup, v_card_id, v_pemakaian
    FROM public.returns r
    JOIN public.transactions t ON t.id = r.transaction_id
    WHERE r.id = p_return_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Data pengembalian tidak ditemukan.';
    END IF;

    v_clean_note := trim(p_note);

    -- Tentukan nominal top up final
    IF p_corrected_topup IS NOT NULL THEN
        IF p_corrected_topup < 0 THEN
            RAISE EXCEPTION 'Nominal top up tidak boleh kurang dari 0.';
        END IF;
        v_final_topup := p_corrected_topup;
    ELSE
        v_final_topup := v_old_topup;
    END IF;

    -- Jika admin mengubah saldo_topup sehingga berbeda dari pemakaian:
    IF v_final_topup <> v_pemakaian THEN
        v_is_corrected := TRUE;
        IF v_clean_note IS NULL OR v_clean_note = '' THEN
            RAISE EXCEPTION 'Catatan Admin wajib diisi jika saldo top up fisik dikoreksi (berbeda dari pemakaian).';
        END IF;
    END IF;

    IF p_decision = 'approved' THEN
        -- Update transactions
        UPDATE public.transactions
        SET status = 'completed',
            saldo_topup = v_final_topup,
            is_corrected = v_is_corrected,
            decision_by = v_admin_id,
            decision_at = now(),
            decision_note = v_clean_note,
            updated_at = now()
        WHERE id = v_tx_id;

        -- Update returns
        UPDATE public.returns
        SET status = 'approved',
            topup_amount = v_final_topup,
            is_corrected = v_is_corrected,
            reviewed_by = v_admin_id,
            reviewed_at = now(),
            review_note = v_clean_note,
            updated_at = now()
        WHERE id = p_return_id;

        -- Kartu kembali 'available'
        UPDATE public.cards
        SET status = 'available', updated_at = now()
        WHERE id = v_card_id;

        -- Audit log koreksi jika nominal diubah
        IF v_is_corrected THEN
            INSERT INTO public.audit_logs (actor_id, actor_name, action, entity_type, entity_id, card_id, old_values, new_values, details)
            VALUES (
                v_admin_id,
                v_admin_name,
                'CORRECT_TOPUP_AMOUNT',
                'transactions',
                v_tx_id,
                v_card_id,
                jsonb_build_object('saldo_topup', v_old_topup, 'pemakaian', v_pemakaian),
                jsonb_build_object('saldo_topup', v_final_topup),
                jsonb_build_object('note', v_clean_note)
            );
        END IF;

        -- Audit log persetujuan pengembalian
        INSERT INTO public.audit_logs (actor_id, actor_name, action, entity_type, entity_id, card_id, details)
        VALUES (
            v_admin_id,
            v_admin_name,
            'APPROVE_RETURN',
            'returns',
            p_return_id,
            v_card_id,
            jsonb_build_object('final_topup', v_final_topup, 'note', v_clean_note, 'is_corrected', v_is_corrected)
        );

    ELSIF p_decision = 'rejected' THEN
        IF v_clean_note IS NULL OR v_clean_note = '' THEN
            RAISE EXCEPTION 'Alasan penolakan pengembalian wajib diisi.';
        END IF;

        UPDATE public.transactions
        SET status = 'borrowed',
            decision_by = v_admin_id,
            decision_at = now(),
            decision_note = v_clean_note,
            updated_at = now()
        WHERE id = v_tx_id;

        UPDATE public.returns
        SET status = 'rejected',
            reviewed_by = v_admin_id,
            reviewed_at = now(),
            review_note = v_clean_note,
            updated_at = now()
        WHERE id = p_return_id;

        UPDATE public.cards
        SET status = 'borrowed', updated_at = now()
        WHERE id = v_card_id;

        INSERT INTO public.audit_logs (actor_id, actor_name, action, entity_type, entity_id, card_id, details)
        VALUES (
            v_admin_id,
            v_admin_name,
            'REJECT_RETURN',
            'returns',
            p_return_id,
            v_card_id,
            jsonb_build_object('note', v_clean_note)
        );
    ELSE
        RAISE EXCEPTION 'Keputusan tidak valid (harus approved atau rejected).';
    END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ------------------------------------------------------------------------------
-- 9. RPC PERSETUJUAN / PENOLAKAN PINJAM DENGAN AUDIT LOG
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_decide_borrow(
    p_transaction_id UUID,
    p_decision TEXT,
    p_note TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_admin_id UUID;
    v_admin_name TEXT;
    v_card_id UUID;
    v_current_status transaction_status;
    v_clean_note TEXT;
BEGIN
    v_admin_id := auth.uid();
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Akses ditolak: Hanya Admin Utama yang berwenang.';
    END IF;

    SELECT full_name INTO v_admin_name FROM public.profiles WHERE id = v_admin_id;

    SELECT card_id, status INTO v_card_id, v_current_status
    FROM public.transactions
    WHERE id = p_transaction_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Transaksi peminjaman tidak ditemukan.';
    END IF;

    IF v_current_status <> 'pending_approval' THEN
        RAISE EXCEPTION 'Transaksi ini tidak sedang menunggu persetujuan (status: %).', v_current_status;
    END IF;

    v_clean_note := trim(p_note);

    IF p_decision = 'approved' THEN
        UPDATE public.transactions
        SET status = 'borrowed',
            decision_by = v_admin_id,
            decision_at = now(),
            decision_note = v_clean_note,
            updated_at = now()
        WHERE id = p_transaction_id;

        UPDATE public.cards
        SET status = 'borrowed', updated_at = now()
        WHERE id = v_card_id;

        INSERT INTO public.audit_logs (actor_id, actor_name, action, entity_type, entity_id, card_id, details)
        VALUES (
            v_admin_id,
            v_admin_name,
            'APPROVE_BORROW',
            'transactions',
            p_transaction_id,
            v_card_id,
            jsonb_build_object('note', v_clean_note)
        );

    ELSIF p_decision = 'rejected' THEN
        IF v_clean_note IS NULL OR v_clean_note = '' THEN
            RAISE EXCEPTION 'Alasan penolakan peminjaman wajib diisi.';
        END IF;

        UPDATE public.transactions
        SET status = 'rejected',
            decision_by = v_admin_id,
            decision_at = now(),
            decision_note = v_clean_note,
            updated_at = now()
        WHERE id = p_transaction_id;

        UPDATE public.cards
        SET status = 'available', updated_at = now()
        WHERE id = v_card_id;

        INSERT INTO public.audit_logs (actor_id, actor_name, action, entity_type, entity_id, card_id, details)
        VALUES (
            v_admin_id,
            v_admin_name,
            'REJECT_BORROW',
            'transactions',
            p_transaction_id,
            v_card_id,
            jsonb_build_object('note', v_clean_note)
        );
    ELSE
        RAISE EXCEPTION 'Keputusan tidak valid (harus approved atau rejected).';
    END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ------------------------------------------------------------------------------
-- 10. FUNGSI AMBIL SALDO AWAL KARTU UNTUK TAMPILAN PENGEMBALIAN
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_active_card_balance(p_card_id UUID)
RETURNS TABLE (
    saldo_awal NUMERIC,
    borrower_name TEXT,
    borrow_date DATE
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT t.saldo_awal, t.borrower_name, t.borrow_date
    FROM public.transactions t
    WHERE t.card_id = p_card_id AND t.status = 'borrowed'
    LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_card_balance(UUID) TO anon, authenticated;
