// ==============================================================================
// E-TOLL CONTROL - INISIALISASI SUPABASE CLIENT (supabaseClient.js)
// ==============================================================================
import { SUPABASE_URL, SUPABASE_ANON_KEY, isConfigured } from './config.js';

let clientInstance = null;

export function initSupabase() {
    if (!isConfigured()) {
        console.warn("[e-Toll Control] Konfigurasi Supabase belum dilengkapi di js/config.js");
        return null;
    }

    if (!window.supabase) {
        console.error("[e-Toll Control] Supabase JS SDK belum termuat.");
        return null;
    }

    if (!clientInstance) {
        // Bersihkan akhiran /rest/v1 jika tidak sengaja terbawa saat copy-paste
        const cleanUrl = SUPABASE_URL.trim().replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
        const cleanKey = SUPABASE_ANON_KEY.trim();

        clientInstance = window.supabase.createClient(cleanUrl, cleanKey, {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true
            }
        });
    }

    return clientInstance;
}

export function getClient() {
    if (!clientInstance) {
        return initSupabase();
    }
    return clientInstance;
}
