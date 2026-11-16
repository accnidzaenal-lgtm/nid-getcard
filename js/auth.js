// ==============================================================================
// E-TOLL CONTROL - MANAJEMEN AUTENTIKASI PENGGUNA (auth.js)
// ==============================================================================
import { getClient } from './supabaseClient.js';

/**
 * Mendaftarkan akun pengguna baru
 */
export async function registerUser(email, password, fullName) {
    const supabase = getClient();
    if (!supabase) throw new Error("Koneksi ke Supabase belum siap.");

    if (!fullName || fullName.trim().length < 3) {
        throw new Error("Nama lengkap minimal harus terdiri dari 3 karakter.");
    }

    const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password: password,
        options: {
            data: {
                full_name: fullName.trim()
            }
        }
    });

    if (error) throw error;
    return data;
}

/**
 * Masuk (Login) dengan email dan password
 */
export async function loginUser(email, password) {
    const supabase = getClient();
    if (!supabase) throw new Error("Koneksi ke Supabase belum siap.");

    const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password
    });

    if (error) throw error;
    return data;
}

/**
 * Keluar (Logout)
 */
export async function logoutUser() {
    const supabase = getClient();
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
}

/**
 * Mengambil profil pengguna yang sedang login (termasuk role: user atau admin)
 */
export async function getUserProfile(userId) {
    const supabase = getClient();
    if (!supabase) return null;

    const { data, error } = await supabase
        .from('profiles')
        .select('id, email, full_name, role, created_at')
        .eq('id', userId)
        .maybeSingle();

    if (error) {
        console.error("Gagal memuat profil pengguna:", error.message);
        return null;
    }

    return data;
}

/**
 * Mendapatkan sesi aktif saat ini
 */
export async function getCurrentSession() {
    const supabase = getClient();
    if (!supabase) return null;

    const { data, error } = await supabase.auth.getSession();
    if (error || !data || !data.session) return null;

    return data.session;
}

/**
 * Mendengarkan perubahan status login secara real-time
 */
export function subscribeAuthChange(callback) {
    const supabase = getClient();
    if (!supabase) return null;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        let profile = null;
        if (session && session.user) {
            profile = await getUserProfile(session.user.id);
        }
        callback(event, session, profile);
    });

    return subscription;
}
