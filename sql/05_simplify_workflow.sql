-- ==============================================================================
-- NID-GATECARD - PENYEDERHANAAN ALUR (05_simplify_workflow.sql)
-- ==============================================================================
-- 1. Peminjam TIDAK PERLU DAFTAR/LOGIN: Data nama & divisi disimpan langsung di transaksi
-- 2. Pengembalian TIDAK PERLU UPLOAD STRUK: Cukup nominal top up (jika ada) & catatan
-- 3. Akses publik (anon) diizinkan untuk scan QR & ajukan pinjam/kembali
-- 4. Hak persetujuan & kelola kartu TETAP DIKUNCI HANYA UNTUK ADMIN UTAMA
-- ==============================================================================

-- 1. Penyesuaian Tabel TRANSACTIONS (Peminjam tanpa akun)
ALTER TABLE public.transactions 
    ALTER COLUMN borrower_id DROP NOT NULL;

ALTER TABLE public.transactions 
    ADD COLUMN IF NOT EXISTS borrower_name TEXT,
    ADD COLUMN IF NOT EXISTS borrower_department TEXT,
    ADD COLUMN IF NOT EXISTS borrower_phone TEXT;

-- 2. Penyesuaian Tabel RETURNS (Hapus kewajiban upload foto struk)
ALTER TABLE public.returns 
    ALTER COLUMN receipt_storage_path DROP NOT NULL,
    ALTER COLUMN topup_amount SET DEFAULT 0;

ALTER TABLE public.returns 
    ADD COLUMN IF NOT EXISTS return_notes TEXT;

-- 3. Izin Akses Publik (Row Level Security untuk anonim/karyawan tanpa login)

-- Publik bisa melihat master kartu (agar kamera HP bisa mendeteksi kartu via QR)
DROP POLICY IF EXISTS "Publik dan user dapat melihat kartu" ON public.cards;
CREATE POLICY "Publik dan user dapat melihat kartu"
ON public.cards FOR SELECT
TO anon, authenticated
USING (true);

-- Publik bisa melihat transaksi aktif kartu yang sedang dipinjam (untuk alur pengembalian cepat)
DROP POLICY IF EXISTS "Publik dapat melihat transaksi aktif kartu" ON public.transactions;
CREATE POLICY "Publik dapat melihat transaksi aktif kartu"
ON public.transactions FOR SELECT
TO anon, authenticated
USING (
    status IN ('pending_approval', 'borrowed', 'pending_return_review') 
    OR public.is_admin()
);

-- Publik bisa melihat pengembalian aktif untuk verifikasi
DROP POLICY IF EXISTS "Publik dapat melihat status pengembalian" ON public.returns;
CREATE POLICY "Publik dapat melihat status pengembalian"
ON public.returns FOR SELECT
TO anon, authenticated
USING (true);

-- 4. Fungsi Atomik Pengajuan Pinjam Tanpa Login (Guest Borrow)
CREATE OR REPLACE FUNCTION public.submit_guest_borrow(
    p_card_id UUID,
    p_borrower_name TEXT,
    p_borrower_department TEXT,
    p_purpose TEXT,
    p_borrower_phone TEXT DEFAULT NULL,
    p_borrow_date DATE DEFAULT CURRENT_DATE
)
RETURNS UUID AS $$
DECLARE
    v_card_status card_status;
    v_tx_id UUID;
BEGIN
    IF trim(p_borrower_name) = '' OR p_borrower_name IS NULL THEN
        RAISE EXCEPTION 'Nama peminjam wajib diisi.';
    END IF;

    IF trim(p_borrower_department) = '' OR p_borrower_department IS NULL THEN
        RAISE EXCEPTION 'Bagian / Divisi wajib diisi.';
    END IF;

    IF trim(p_purpose) = '' OR p_purpose IS NULL THEN
        RAISE EXCEPTION 'Keperluan / Tujuan peminjaman wajib diisi.';
    END IF;

    -- Kunci baris kartu untuk mencegah bentrok peminjaman ganda
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

    -- Simpan data transaksi peminjaman
    INSERT INTO public.transactions (
        card_id,
        borrower_id,
        borrower_name,
        borrower_department,
        borrower_phone,
        borrow_date,
        purpose,
        status,
        requested_at
    ) VALUES (
        p_card_id,
        NULL,
        trim(p_borrower_name),
        trim(p_borrower_department),
        trim(p_borrower_phone),
        COALESCE(p_borrow_date, CURRENT_DATE),
        trim(p_purpose),
        'pending_approval',
        now()
    ) RETURNING id INTO v_tx_id;

    -- Ubah status kartu menjadi pending_approval
    UPDATE public.cards
    SET status = 'pending_approval', updated_at = now()
    WHERE id = p_card_id;

    -- Rekam audit log
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
    VALUES (
        NULL,
        'GUEST_BORROW_REQUEST',
        'transactions',
        v_tx_id,
        jsonb_build_object(
            'card_id', p_card_id,
            'borrower_name', p_borrower_name,
            'department', p_borrower_department,
            'purpose', p_purpose
        )
    );

    RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 5. Fungsi Atomik Pengembalian Tanpa Upload Struk (Guest Return)
CREATE OR REPLACE FUNCTION public.submit_guest_return(
    p_card_id UUID,
    p_topup_amount NUMERIC DEFAULT 0,
    p_return_notes TEXT DEFAULT NULL,
    p_topup_date DATE DEFAULT CURRENT_DATE
)
RETURNS UUID AS $$
DECLARE
    v_tx_id UUID;
    v_return_id UUID;
    v_card_status card_status;
BEGIN
    -- Cari transaksi peminjaman yang sedang aktif untuk kartu ini
    SELECT id INTO v_tx_id
    FROM public.transactions
    WHERE card_id = p_card_id AND status = 'borrowed'
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tidak ditemukan data peminjaman aktif untuk kartu ini.';
    END IF;

    IF p_topup_amount < 0 THEN
        RAISE EXCEPTION 'Nominal top up tidak boleh kurang dari 0.';
    END IF;

    -- Simpan atau perbarui data pengembalian
    INSERT INTO public.returns (
        transaction_id,
        topup_date,
        topup_amount,
        receipt_storage_path,
        return_notes,
        status,
        submitted_at
    ) VALUES (
        v_tx_id,
        COALESCE(p_topup_date, CURRENT_DATE),
        COALESCE(p_topup_amount, 0),
        NULL, -- Tanpa file struk
        trim(p_return_notes),
        'pending_review',
        now()
    )
    ON CONFLICT (transaction_id) DO UPDATE SET
        topup_date = EXCLUDED.topup_date,
        topup_amount = EXCLUDED.topup_amount,
        return_notes = EXCLUDED.return_notes,
        status = 'pending_review',
        submitted_at = now()
    RETURNING id INTO v_return_id;

    -- Perbarui status transaksi dan kartu menjadi 'pending_return_review'
    UPDATE public.transactions
    SET status = 'pending_return_review', updated_at = now()
    WHERE id = v_tx_id;

    UPDATE public.cards
    SET status = 'pending_return_review', updated_at = now()
    WHERE id = p_card_id;

    -- Catat log audit
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
    VALUES (
        NULL,
        'GUEST_RETURN_REQUEST',
        'returns',
        v_return_id,
        jsonb_build_object('transaction_id', v_tx_id, 'topup_amount', p_topup_amount)
    );

    RETURN v_return_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Berikan izin pemanggilan fungsi aman ini kepada publik dan user
GRANT EXECUTE ON FUNCTION public.submit_guest_borrow TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_guest_return TO anon, authenticated;
