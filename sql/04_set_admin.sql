-- ==============================================================================
-- E-TOLL CONTROL - PENETAPAN ADMIN UTAMA (04_set_admin.sql)
-- ==============================================================================
-- PETUNJUK:
-- 1. Daftarkan akun pertama Anda terlebih dahulu melalui antarmuka aplikasi atau
--    menu Authentication di Supabase.
-- 2. Ganti 'email_admin_anda@kantor.com' di bawah ini dengan email yang Anda daftarkan.
-- 3. Jalankan perintah di bawah ini di SQL Editor Supabase.

UPDATE public.profiles
SET role = 'admin', updated_at = now()
WHERE email = 'email_admin_anda@kantor.com';

-- Periksa apakah akun admin sudah berhasil ditetapkan:
SELECT id, email, full_name, role, created_at 
FROM public.profiles 
WHERE role = 'admin';

-- Catatan Keamanan:
-- Jika Anda mencoba menetapkan akun kedua sebagai admin, database secara otomatis
-- akan menolak karena indeks unik 'only_one_admin_idx' aktif menjaga integritas sistem.
