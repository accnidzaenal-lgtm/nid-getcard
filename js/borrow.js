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

    // Coba panggil RPC versi baru (dengan p_honeypot)
    let res = await supabase.rpc('submit_guest_borrow', {
        p_card_id: cardId,
        p_borrower_name: cleanName,
        p_borrower_department: borrowerDepartment.trim(),
        p_purpose: purpose.trim(),
        p_borrower_phone: null, // Tanpa nomor HP & Tanpa NIK
        p_borrow_date: dateVal,
        p_honeypot: null
    });

    // Fallback jika database Supabase belum dimigrasi ke fungsi baru (tanpa p_honeypot)
    if (res.error && res.error.message && res.error.message.includes('Could not find the function')) {
        res = await supabase.rpc('submit_guest_borrow', {
            p_card_id: cardId,
            p_borrower_name: cleanName,
            p_borrower_department: borrowerDepartment.trim(),
            p_purpose: purpose.trim(),
            p_borrower_phone: null,
            p_borrow_date: dateVal
        });
    }

    if (res.error) {
        throw new Error(res.error.message);
    }

    return res.data; // Mengembalikan Transaction ID
}
