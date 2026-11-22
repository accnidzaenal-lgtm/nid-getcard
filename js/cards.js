// ==============================================================================
// NID-GATECARD - KELOLA MASTER KARTU & MONITORING KETERSEDIAAN (cards.js)
// ==============================================================================
import { getClient } from './supabaseClient.js';

/**
 * Mengambil seluruh daftar kartu (untuk Admin & Monitoring Publik)
 */
export async function fetchAllCards() {
    const supabase = getClient();
    if (!supabase) return [];

    const { data, error } = await supabase
        .from('cards')
        .select('*')
        .order('created_at', { ascending: true });

    if (error) {
        console.error("Gagal memuat daftar kartu:", error.message);
        throw error;
    }

    return data || [];
}

/**
 * Mengambil status ketersediaan kartu untuk dashboard publik (Murni dari VIEW publik)
 * Mengutamakan privasi: TIDAK MEMUAT nama peminjam, divisi, keperluan, atau tanggal pinjam
 */
export async function fetchPublicCardsMonitoring() {
    const supabase = getClient();
    if (!supabase) return [];

    try {
        // Coba ambil dari VIEW publik yang dilindungi
        const { data: viewData, error: viewErr } = await supabase
            .from('cards_public_view')
            .select('id, label, status, status_display')
            .order('label', { ascending: true });

        if (!viewErr && viewData) {
            return viewData;
        }

        // Fallback jika view belum dibuat di DB: ambil hanya label & status
        const { data: cards, error: cardErr } = await supabase
            .from('cards')
            .select('id, label, status')
            .order('label', { ascending: true });

        if (cardErr) throw cardErr;

        return (cards || []).map(c => ({
            ...c,
            status_display: c.status === 'available' ? 'Tersedia' : (c.status === 'borrowed' ? 'Dipinjam' : 'Menunggu')
        }));
    } catch (err) {
        console.error("Gagal memuat monitoring kartu:", err);
        return [];
    }
}

/**
 * Mengambil detail satu kartu berdasarkan qr_token
 * Menggunakan RPC get_card_by_token yang aman untuk anon
 */
export async function getCardByToken(token) {
    const supabase = getClient();
    if (!supabase || !token) return null;

    const cleanToken = token.trim().toUpperCase();

    try {
        // 1. Coba melalui RPC get_card_by_token jika tersedia
        const { data: rpcData, error: rpcErr } = await supabase.rpc('get_card_by_token', {
            p_token: cleanToken
        });

        if (!rpcErr && rpcData && rpcData.length > 0) {
            return rpcData[0];
        }
    } catch (e) {
        // Abaikan jika RPC belum terpasang, lanjut ke fallback
    }

    // 2. Direct select dengan ilike (case-insensitive) agar aman jika input lowercase
    const { data, error } = await supabase
        .from('cards')
        .select('*')
        .ilike('qr_token', cleanToken)
        .maybeSingle();

    if (error) {
        console.error("Gagal mencari kartu:", error.message);
        throw error;
    }

    return data;
}

/**
 * Menambahkan kartu e-Toll baru (Khusus Admin)
 */
export async function createCard(label, cardIdentifier) {
    const supabase = getClient();
    if (!supabase) throw new Error("Koneksi Supabase tidak aktif.");

    if (!label || label.trim() === '') {
        throw new Error("Label kartu wajib diisi (misal: Mandiri e-Toll 01).");
    }

    if (!cardIdentifier || cardIdentifier.trim() === '') {
        throw new Error("Nomor identitas fisik kartu wajib diisi.");
    }

    const qrToken = 'ET-' + Math.random().toString(36).substring(2, 8).toUpperCase() + '-' + Date.now().toString(36).toUpperCase();

    const { data, error } = await supabase
        .from('cards')
        .insert({
            label: label.trim(),
            card_identifier: cardIdentifier.trim(),
            qr_token: qrToken,
            status: 'available'
        })
        .select()
        .single();

    if (error) {
        throw new Error("Gagal menambahkan kartu: " + error.message);
    }

    return data;
}

/**
 * Mengubah status kartu secara langsung oleh admin (misal: kartu hilang/rusak -> inactive)
 */
export async function updateCardStatus(cardId, newStatus) {
    const supabase = getClient();
    if (!supabase) throw new Error("Koneksi Supabase tidak aktif.");

    const { data, error } = await supabase
        .from('cards')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', cardId)
        .select()
        .single();

    if (error) {
        throw new Error("Gagal memperbarui status kartu: " + error.message);
    }

    return data;
}
