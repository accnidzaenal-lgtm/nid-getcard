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
 * Mengambil status ketersediaan kartu beserta peminjam aktifnya untuk dashboard publik
 */
export async function fetchPublicCardsMonitoring() {
    const supabase = getClient();
    if (!supabase) return [];

    try {
        const { data: cards, error: cardErr } = await supabase
            .from('cards')
            .select('*')
            .order('label', { ascending: true });

        if (cardErr) throw cardErr;

        // Ambil transaksi aktif (borrowed) untuk kartu-kartu yang sedang dipinjam
        const { data: activeTx, error: txErr } = await supabase
            .from('transactions')
            .select('card_id, borrower_name, borrower_department, borrow_date, purpose, status')
            .in('status', ['borrowed', 'pending_approval', 'pending_return_review']);

        const txMap = {};
        if (activeTx) {
            activeTx.forEach(tx => {
                txMap[tx.card_id] = tx;
            });
        }

        const today = new Date();
        return (cards || []).map(card => {
            const tx = txMap[card.id];
            let isOverdue = false;
            let diffDays = 0;

            if (tx && tx.status === 'borrowed') {
                const bDate = new Date(tx.borrow_date);
                diffDays = Math.floor((today - bDate) / (1000 * 60 * 60 * 24));
                if (diffDays > 3) {
                    isOverdue = true;
                }
            }

            return {
                ...card,
                activeBorrower: tx ? tx.borrower_name : null,
                activeDepartment: tx ? tx.borrower_department : null,
                activeBorrowDate: tx ? tx.borrow_date : null,
                activePurpose: tx ? tx.purpose : null,
                isOverdue,
                diffDays
            };
        });
    } catch (err) {
        console.error("Gagal memuat monitoring kartu:", err);
        return [];
    }
}

/**
 * Mengambil detail satu kartu berdasarkan qr_token
 */
export async function getCardByToken(token) {
    const supabase = getClient();
    if (!supabase) return null;

    const cleanToken = token.trim();
    const { data, error } = await supabase
        .from('cards')
        .select('*')
        .eq('qr_token', cleanToken)
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
