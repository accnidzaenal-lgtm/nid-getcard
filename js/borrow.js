// ==============================================================================
// NID-GATECARD - LOGIKA PEMINJAMAN KARTU (borrow.js)
// ==============================================================================
import { getClient } from './supabaseClient.js';

/**
 * Mengajukan permohonan peminjaman kartu tanpa perlu login akun & tanpa nomor HP
 */
export async function submitGuestBorrow({ cardId, borrowerName, borrowerDepartment, purpose, borrowDate, honeypot }) {
    const supabase = getClient();
    if (!supabase) throw new Error("Koneksi Supabase tidak aktif.");

    if (!cardId) throw new Error("Kartu e-Toll belum teridentifikasi.");
    if (!borrowerName || borrowerName.trim() === '') throw new Error("Nama peminjam wajib diisi.");
    if (!borrowerDepartment || borrowerDepartment.trim() === '') throw new Error("Bagian / Divisi wajib diisi.");
    if (!purpose || purpose.trim() === '') throw new Error("Tujuan / Keperluan dinas wajib diisi.");

    const { data, error } = await supabase.rpc('submit_guest_borrow', {
        p_card_id: cardId,
        p_borrower_name: borrowerName.trim(),
        p_borrower_department: borrowerDepartment.trim(),
        p_purpose: purpose.trim(),
        p_borrower_phone: null, // Nomor HP dihilangkan sesuai permintaan
        p_borrow_date: borrowDate || new Date().toISOString().split('T')[0],
        p_honeypot: honeypot ? honeypot.trim() : null
    });

    if (error) {
        throw new Error(error.message);
    }

    return data; // Mengembalikan Transaction ID
}
