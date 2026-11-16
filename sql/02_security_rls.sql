-- ==============================================================================
-- E-TOLL CONTROL - ROW LEVEL SECURITY (RLS) & KEAMANAN (02_security_rls.sql)
-- ==============================================================================
-- Skrip ini mengaktifkan proteksi data di tingkat baris dan izin penyimpanan file.
-- Jalankan skrip ini setelah skrip 01_schema.sql selesai dijalankan.

-- 1. Fungsi Pembantu: Memeriksa apakah pengguna yang sedang login adalah Admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Mengaktifkan RLS pada seluruh tabel
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 3. Kebijakan Keamanan Tabel: PROFILES
DROP POLICY IF EXISTS "Profil dapat dibaca oleh pengguna login" ON public.profiles;
CREATE POLICY "Profil dapat dibaca oleh pengguna login"
ON public.profiles FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Pengguna hanya bisa memperbarui nama profil sendiri" ON public.profiles;
CREATE POLICY "Pengguna hanya bisa memperbarui nama profil sendiri"
ON public.profiles FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid() AND (role = (SELECT role FROM public.profiles WHERE id = auth.uid())));

-- 4. Kebijakan Keamanan Tabel: CARDS (Master Kartu)
DROP POLICY IF EXISTS "Semua pengguna login dapat melihat kartu" ON public.cards;
CREATE POLICY "Semua pengguna login dapat melihat kartu"
ON public.cards FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Hanya admin yang dapat menambah kartu" ON public.cards;
CREATE POLICY "Hanya admin yang dapat menambah kartu"
ON public.cards FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Hanya admin yang dapat mengubah data kartu secara langsung" ON public.cards;
CREATE POLICY "Hanya admin yang dapat mengubah data kartu secara langsung"
ON public.cards FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Hanya admin yang dapat menghapus kartu" ON public.cards;
CREATE POLICY "Hanya admin yang dapat menghapus kartu"
ON public.cards FOR DELETE
TO authenticated
USING (public.is_admin());

-- 5. Kebijakan Keamanan Tabel: TRANSACTIONS
DROP POLICY IF EXISTS "Pengguna melihat transaksi sendiri atau admin melihat semua" ON public.transactions;
CREATE POLICY "Pengguna melihat transaksi sendiri atau admin melihat semua"
ON public.transactions FOR SELECT
TO authenticated
USING (borrower_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Pengguna dapat mengajukan peminjaman kartu untuk diri sendiri" ON public.transactions;
CREATE POLICY "Pengguna dapat mengajukan peminjaman kartu untuk diri sendiri"
ON public.transactions FOR INSERT
TO authenticated
WITH CHECK (borrower_id = auth.uid() AND status = 'pending_approval');

DROP POLICY IF EXISTS "Hanya admin yang berhak memperbarui transaksi" ON public.transactions;
CREATE POLICY "Hanya admin yang berhak memperbarui transaksi"
ON public.transactions FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 6. Kebijakan Keamanan Tabel: RETURNS (Pengembalian & Struk)
DROP POLICY IF EXISTS "Pengguna melihat pengembalian sendiri atau admin melihat semua" ON public.returns;
CREATE POLICY "Pengguna melihat pengembalian sendiri atau admin melihat semua"
ON public.returns FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.transactions t 
        WHERE t.id = returns.transaction_id AND t.borrower_id = auth.uid()
    ) OR public.is_admin()
);

DROP POLICY IF EXISTS "Pengguna dapat mengirim pengembalian untuk transaksinya" ON public.returns;
CREATE POLICY "Pengguna dapat mengirim pengembalian untuk transaksinya"
ON public.returns FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.transactions t 
        WHERE t.id = transaction_id AND t.borrower_id = auth.uid() AND t.status = 'borrowed'
    ) AND status = 'pending_review'
);

DROP POLICY IF EXISTS "Hanya admin yang dapat memverifikasi pengembalian" ON public.returns;
CREATE POLICY "Hanya admin yang dapat memverifikasi pengembalian"
ON public.returns FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 7. Kebijakan Keamanan Tabel: AUDIT_LOGS
DROP POLICY IF EXISTS "Hanya admin yang dapat membaca catatan log audit" ON public.audit_logs;
CREATE POLICY "Hanya admin yang dapat membaca catatan log audit"
ON public.audit_logs FOR SELECT
TO authenticated
USING (public.is_admin());

-- 8. Kebijakan Supabase Storage (Bucket Privat: 'receipts')
-- Catatan: Bucket 'receipts' harus berstatus privat (public = false)
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "Pengguna login dapat mengunggah struk ke folder miliknya" ON storage.objects;
CREATE POLICY "Pengguna login dapat mengunggah struk ke folder miliknya"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'receipts' AND 
    (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Peminjam atau admin dapat membaca file struk privat" ON storage.objects;
CREATE POLICY "Peminjam atau admin dapat membaca file struk privat"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'receipts' AND (
        (storage.foldername(name))[1] = auth.uid()::text OR 
        public.is_admin()
    )
);
