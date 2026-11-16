// ==============================================================================
// NID-GATECARD - LOGIKA PENGEMBALIAN KARTU TANPA STRUK (return.js)
// ==============================================================================
import { getClient } from './supabaseClient.js';

/**
 * Mengambil transaksi aktif untuk kartu tertentu yang sedang berstatus 'borrowed'
 */
export async function getActiveBorrowInfoByCardId(cardId) {
    const supabase = getClient();
    if (!supabase || !cardId) return null;

    const { data, error } = await supabase
        .from('transactions')
        .select(`
            id,
            card_id,
            borrower_name,
            borrower_department,
            borrower_phone,
            borrow_date,
            purpose,
            status,
            requested_at
        `)
        .eq('card_id', cardId)
        .eq('status', 'borrowed')
        .maybeSingle();

    if (error) {
        console.error("Gagal memeriksa transaksi peminjaman:", error.message);
        return null;
    }

    return data;
}

/**
 * Mengajukan pengembalian kartu e-Toll (tanpa perlu upload foto struk)
 */
export async function submitGuestReturn({ cardId, topupAmount, returnNotes, topupDate }) {
    const supabase = getClient();
    if (!supabase) throw new Error("Koneksi Supabase tidak aktif.");

    if (!cardId) throw new Error("Kartu e-Toll belum teridentifikasi.");

    const { data, error } = await supabase.rpc('submit_guest_return', {
        p_card_id: cardId,
        p_topup_amount: Number(topupAmount) || 0,
        p_return_notes: returnNotes ? returnNotes.trim() : null,
        p_topup_date: topupDate || new Date().toISOString().split('T')[0]
    });

    if (error) {
        throw new Error(error.message);
    }

    return data; // Mengembalikan Return ID
}
