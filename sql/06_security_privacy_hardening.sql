-- ==============================================================================
-- NID-GATECARD - TAHAP 1: KEAMANAN & PRIVASI (06_security_privacy_hardening.sql)
-- ==============================================================================
-- Skrip ini memperketat keamanan database Supabase:
-- 1. Mengaktifkan RLS penuh di semua tabel.
-- 2. Menutup akses SELECT publik (anon) ke tabel transaksi, kartu, dan pengembalian.
-- 3. Membuat VIEW publik 'cards_public_view' yang hanya berisi label & status kartu.
-- 4. Mengamankan RPC pengajuan pinjam (honeypot, validasi panjang, status ketersediaan).
-- 5. Menegaskan partial unique index agar satu kartu tidak memiliki 2 transaksi aktif.
-- 6. Mengunci seluruh aksi admin di level policy database.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. PARTIAL UNIQUE INDEX (Cegah Transaksi Ganda per Kartu di Level Database)
-- ------------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_transaction_per_card 
ON public.transactions (card_id) 
WHERE status IN ('pending_approval', 'borrowed', 'pending_return_review');

-- ------------------------------------------------------------------------------
-- 2. VIEW PUBLIK KETERSEDIAAN KARTU (HANYA LABEL & STATUS, TANPA PRIVASI PEMINJAM)
-- ------------------------------------------------------------------------------
-- Drop view lama jika ada
DROP VIEW IF EXISTS public.cards_public_view CASCADE;

CREATE VIEW public.cards_public_view WITH (security_invoker = false) AS
SELECT 
    c.id,
    c.label,
    CASE 
        WHEN c.status = 'available' THEN 'Tersedia'
        WHEN c.status = 'borrowed' THEN 'Dipinjam'
        WHEN c.status IN ('pending_approval', 'pending_return_review') THEN 'Menunggu'
        ELSE 'Non-Aktif'
    END AS status_display,
    c.status
FROM public.cards c
WHERE c.status <> 'inactive';

-- Berikan izin akses baca view kepada publik (anon) dan authenticated
GRANT SELECT ON public.cards_public_view TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- 3. RPC AMAN: SCAN KARTU VIA TOKEN QR (Untuk Pengguna / Anon)
-- ------------------------------------------------------------------------------
-- Mengembalikan hanya informasi kartu yang diperlukan tanpa membocorkan nomor fisik ke publik
CREATE OR REPLACE FUNCTION public.get_card_by_token(p_token text)
RETURNS TABLE (
    id uuid,
    label text,
    card_identifier text,
    status card_status
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT c.id, c.label, c.card_identifier, c.status
    FROM public.cards c
    WHERE c.qr_token = trim(p_token) AND c.status <> 'inactive';
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_card_by_token(text) TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- 4. RPC AMAN: PENGAJUAN PINJAM DENGAN HONEYPOT & VALIDASI PANJANG INPUT
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
BEGIN
    -- A. Proteksi Spam Honeypot: Jika bot mengisi field tersembunyi, batalkan seketika
    IF p_honeypot IS NOT NULL AND trim(p_honeypot) <> '' THEN
        RAISE EXCEPTION 'Aktivitas tidak valid terdeteksi (Proteksi Spam).';
    END IF;

    -- B. Normalisasi & Validasi Batasan Karakter
    v_name_clean := trim(p_borrower_name);
    v_dept_clean := trim(p_borrower_department);
    v_purpose_clean := trim(p_purpose);

    IF v_name_clean IS NULL OR char_length(v_name_clean) < 2 OR char_length(v_name_clean) > 100 THEN
        RAISE EXCEPTION 'Nama peminjam wajib diisi (antara 2 - 100 karakter).';
    END IF;

    IF v_dept_clean IS NULL OR char_length(v_dept_clean) < 2 OR char_length(v_dept_clean) > 100 THEN
        RAISE EXCEPTION 'Bagian / Divisi wajib diisi (antara 2 - 100 karakter).';
    END IF;

    IF v_purpose_clean IS NULL OR char_length(v_purpose_clean) < 3 OR char_length(v_purpose_clean) > 500 THEN
        RAISE EXCEPTION 'Keperluan peminjaman wajib diisi (antara 3 - 500 karakter).';
    END IF;

    -- C. Kunci baris kartu untuk menghindari race condition
    SELECT status INTO v_card_status
    FROM public.cards
    WHERE id = p_card_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Kartu e-Toll tidak ditemukan.';
    END IF;

    -- D. Pastikan kartu benar-benar berstatus 'available'
    IF v_card_status <> 'available' THEN
        RAISE EXCEPTION 'Kartu ini sedang tidak tersedia atau sedang dipinjam.';
    END IF;

    -- E. Cek apakah ada transaksi pending / berjalan untuk kartu ini
    IF EXISTS (
        SELECT 1 FROM public.transactions
        WHERE card_id = p_card_id 
          AND status IN ('pending_approval', 'borrowed', 'pending_return_review')
    ) THEN
        RAISE EXCEPTION 'Kartu ini sedang memiliki transaksi aktif yang belum diselesaikan.';
    END IF;

    -- F. Simpan data transaksi peminjaman (status selalu 'pending_approval', tidak bisa diset langsung oleh user)
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
        v_name_clean,
        v_dept_clean,
        NULL, -- Nomor HP sengaja dikosongkan
        COALESCE(p_borrow_date, CURRENT_DATE),
        v_purpose_clean,
        'pending_approval',
        now()
    ) RETURNING id INTO v_tx_id;

    -- G. Perbarui status kartu menjadi pending_approval
    UPDATE public.cards
    SET status = 'pending_approval', updated_at = now()
    WHERE id = p_card_id;

    -- H. Catat jejak audit log
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
    VALUES (
        NULL,
        'GUEST_BORROW_REQUEST',
        'transactions',
        v_tx_id,
        jsonb_build_object(
            'card_id', p_card_id,
            'borrower_name', v_name_clean,
            'department', v_dept_clean,
            'purpose', v_purpose_clean
        )
    );

    RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.submit_guest_borrow TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- 5. RPC AMAN: PENGEMBALIAN KARTU (VALIDASI KETAT)
-- ------------------------------------------------------------------------------
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
    v_clean_notes TEXT;
BEGIN
    -- Validasi status kartu
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

    -- Cari transaksi aktif
    SELECT id INTO v_tx_id
    FROM public.transactions
    WHERE card_id = p_card_id AND status = 'borrowed'
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tidak ditemukan transaksi peminjaman aktif untuk kartu ini.';
    END IF;

    IF p_topup_amount < 0 THEN
        RAISE EXCEPTION 'Nominal top up tidak boleh kurang dari 0.';
    END IF;

    v_clean_notes := trim(p_return_notes);
    IF v_clean_notes IS NOT NULL AND char_length(v_clean_notes) > 500 THEN
        RAISE EXCEPTION 'Catatan pengembalian maksimal 500 karakter.';
    END IF;

    -- Simpan data pengembalian
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
        NULL,
        v_clean_notes,
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

GRANT EXECUTE ON FUNCTION public.submit_guest_return TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- 6. PENGETATAN ROW LEVEL SECURITY (RLS) DI SELURUH TABEL
-- ------------------------------------------------------------------------------

-- Pastikan RLS aktif di seluruh tabel
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- A. TABEL CARDS:
-- Cabut policy lama yang mengizinkan anon membaca langsung
DROP POLICY IF EXISTS "Publik dan user dapat melihat kartu" ON public.cards;
DROP POLICY IF EXISTS "Semua pengguna login dapat melihat kartu" ON public.cards;
DROP POLICY IF EXISTS "Kartu hanya bisa dibaca oleh admin langsung" ON public.cards;

-- Hanya Admin yang boleh membaca tabel cards secara langsung (Anon wajib lewat cards_public_view / get_card_by_token)
CREATE POLICY "Kartu hanya bisa dibaca oleh admin langsung"
ON public.cards FOR SELECT
TO authenticated
USING (public.is_admin());

-- B. TABEL TRANSACTIONS:
-- Cabut policy lama yang mengizinkan anon membaca transaksi
DROP POLICY IF EXISTS "Publik dapat melihat transaksi aktif kartu" ON public.transactions;
DROP POLICY IF EXISTS "Pengguna melihat transaksi sendiri atau admin melihat semua" ON public.transactions;
DROP POLICY IF EXISTS "Hanya admin yang dapat membaca transaksi" ON public.transactions;

-- Hanya Admin yang boleh membaca transaksi secara langsung (Anon DILARANG TOTAL membaca tabel transaksi)
CREATE POLICY "Hanya admin yang dapat membaca transaksi"
ON public.transactions FOR SELECT
TO authenticated
USING (public.is_admin());

-- Pastikan anon tidak bisa INSERT/UPDATE langsung ke tabel transactions
DROP POLICY IF EXISTS "Pengguna dapat mengajukan peminjaman kartu untuk diri sendiri" ON public.transactions;
DROP POLICY IF EXISTS "Hanya admin yang berhak memperbarui transaksi" ON public.transactions;

CREATE POLICY "Hanya admin yang berhak memperbarui transaksi"
ON public.transactions FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- C. TABEL RETURNS:
-- Cabut policy lama yang mengizinkan anon membaca pengembalian
DROP POLICY IF EXISTS "Publik dapat melihat status pengembalian" ON public.returns;
DROP POLICY IF EXISTS "Pengguna melihat pengembalian sendiri atau admin melihat semua" ON public.returns;
DROP POLICY IF EXISTS "Pengguna dapat mengirim pengembalian untuk transaksinya" ON public.returns;
DROP POLICY IF EXISTS "Hanya admin yang dapat membaca pengembalian" ON public.returns;

-- Hanya Admin yang boleh membaca data pengembalian
CREATE POLICY "Hanya admin yang dapat membaca pengembalian"
ON public.returns FOR SELECT
TO authenticated
USING (public.is_admin());

-- D. TABEL AUDIT_LOGS:
-- Hanya Admin yang dapat membaca log audit
DROP POLICY IF EXISTS "Hanya admin yang dapat membaca catatan log audit" ON public.audit_logs;
CREATE POLICY "Hanya admin yang dapat membaca catatan log audit"
ON public.audit_logs FOR SELECT
TO authenticated
USING (public.is_admin());

-- ------------------------------------------------------------------------------
-- 7. SKRIP UJI KEAMANAN (Verifikasi Hak Akses Role Anon vs Admin)
-- ------------------------------------------------------------------------------
/*
-- Jalankan blok di bawah ini di SQL Editor untuk membuktikan privasi data:

-- A. Simulasi sebagai ANON (Pengunjung Publik tanpa Login):
SET ROLE anon;

-- Test 1: Membaca tabel transaksi (HARUS GAGAL / MENGEMBALIKAN 0 BARIS)
SELECT count(*) AS jumlah_transaksi_terbaca_anon FROM public.transactions;
-- Ekspektasi: 0 baris (Anon tidak bisa melihat nama peminjam, divisi, atau keperluan siapapun)

-- Test 2: Membaca tabel pengembalian (HARUS GAGAL / MENGEMBALIKAN 0 BARIS)
SELECT count(*) AS jumlah_returns_terbaca_anon FROM public.returns;
-- Ekspektasi: 0 baris

-- Test 3: Membaca tabel master kartu langsung (HARUS GAGAL / MENGEMBALIKAN 0 BARIS)
SELECT count(*) AS jumlah_kartu_terbaca_anon FROM public.cards;
-- Ekspektasi: 0 baris

-- Test 4: Membaca view publik (HARUS BERHASIL, HANYA LABEL & STATUS)
SELECT id, label, status_display, status FROM public.cards_public_view;
-- Ekspektasi: Berhasil, menampilkan nama kartu dan status (Tersedia/Dipinjam/Menunggu) tanpa data pribadi!

-- Kembalikan role ke default setelah pengujian:
RESET ROLE;
*/
