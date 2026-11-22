// ==============================================================================
// NID-GATECARD - LOGIKA PEMINJAMAN KARTU (borrow.js)
// ==============================================================================
import { getClient } from './supabaseClient.js';

export function normalizeTitleCase(str) {
    if (!str) return '';
    return str
        .trim()
        .toLowerCase()
        .replace(/(?:^|\s|-)\S/g, char => char.toUpperCase());
}

/**
 * Mengajukan permohonan peminjaman kartu tanpa perlu login akun & tanpa nomor HP
 * Nama peminjam dinormalisasi otomatis (Title Case)
 */
export async function submitGuestBorrow({ cardId, borrowerName, borrowerDepartment, purpose, borrowDate, honeypot }) {
    const supabase = getClient();
    if (!supabase) throw new Error("Koneksi Supabase tidak aktif.");

    if (!cardId) throw new Error("Kartu e-Toll belum teridentifikasi.");
    if (!borrowerName || borrowerName.trim() === '') throw new Error("Nama peminjam wajib diisi.");
    if (!borrowerDepartment || borrowerDepartment.trim() === '') throw new Error("Bagian / Divisi wajib diisi.");
    if (!purpose || purpose.trim() === '') throw new Error("Tujuan / Keperluan dinas wajib diisi.");

    // Proteksi Spam Honeypot di sisi client
    if (honeypot && honeypot.trim() !== '') {
        throw new Error("Aktivitas tidak valid terdeteksi (Proteksi Spam).");
    }

    const cleanName = normalizeTitleCase(borrowerName);
    const dateVal = borrowDate || new Date().toISOString().split('T')[0];

    // Coba panggilan RPC standar (6 parameter sesuai schema aktif di Supabase)
    let { data, error } = await supabase.rpc('submit_guest_borrow', {
        p_card_id: cardId,
        p_borrower_name: cleanName,
        p_borrower_department: borrowerDepartment.trim(),
        p_purpose: purpose.trim(),
        p_borrower_phone: null, // Tanpa nomor HP & Tanpa NIK
        p_borrow_date: dateVal
    });

    // Fallback otomatis jika skema Supabase mengharapkan 7 parameter (dengan p_honeypot)
    if (error && error.message && (error.message.includes('schema cache') || error.code === 'PGRST202')) {
        const retry = await supabase.rpc('submit_guest_borrow', {
            p_card_id: cardId,
            p_borrower_name: cleanName,
            p_borrower_department: borrowerDepartment.trim(),
            p_purpose: purpose.trim(),
            p_borrower_phone: null,
            p_borrow_date: dateVal,
            p_honeypot: null
        });
        if (!retry.error) {
            data = retry.data;
            error = null;
        }
    }

    if (error) {
        throw new Error(error.message);
    }

    return data; // Mengembalikan Transaction ID
}
