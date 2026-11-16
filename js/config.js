// ==============================================================================
// E-TOLL CONTROL - KONFIGURASI SUPABASE (config.js)
// ==============================================================================
// PANDUAN PENGGUNA:
// 1. Buka dashboard proyek Supabase Anda: https://supabase.com/dashboard
// 2. Pilih menu "Project Settings" (ikon gerigi) -> pilih submenu "API".
// 3. Salin "Project URL" dan tempelkan ke SUPABASE_URL di bawah.
// 4. Salin "anon public" Key dan tempelkan ke SUPABASE_ANON_KEY di bawah.
//
// PERHATIAN:
// JANGAN PERNAH menaruh "service_role" secret key di sini! 
// Hanya gunakan "anon public" key yang memang dirancang aman untuk browser.

export const SUPABASE_URL = "https://mymlstqyjdjfowvfalkl.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15bWxzdHF5amRqZm93dmZhbGtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1MDEzNzIsImV4cCI6MjEwODA3NzM3Mn0.ZDRlYkxoFT2JFoS_JVCEqUqkGmhbKwGsq3YlBle-JTc";

// Fungsi untuk memeriksa apakah kredensial sudah diisi dengan benar
export function isConfigured() {
    return (
        SUPABASE_URL &&
        SUPABASE_ANON_KEY &&
        !SUPABASE_URL.includes("GANTI_DENGAN") &&
        !SUPABASE_ANON_KEY.includes("GANTI_DENGAN")
    );
}
