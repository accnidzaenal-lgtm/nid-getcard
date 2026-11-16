// ==============================================================================
// NID-GATECARD - PANEL KENDALI ADMIN (admin.js)
// ==============================================================================
import { getClient } from './supabaseClient.js';

/**
 * Mengambil seluruh riwayat peminjaman dan pengembalian (Lengkap untuk tab Riwayat)
 */
export async function fetchAllTransactionHistory() {
    const supabase = getClient();
    if (!supabase) return [];

    const { data, error } = await supabase
        .from('transactions')
        .select(`
            id,
            card_id,
            borrower_name,
            borrower_department,
            borrow_date,
            purpose,
            status,
            requested_at,
            decision_at,
            decision_note,
            cards (
                id,
                label,
                card_identifier
            ),
            returns (
                id,
                topup_date,
                topup_amount,
                return_notes,
                status,
                submitted_at,
                reviewed_at,
                review_note
            )
        `)
        .order('requested_at', { ascending: false });

    if (error) {
        console.error("Gagal memuat riwayat transaksi:", error.message);
        throw error;
    }

    return data || [];
}

/**
 * Mengambil ringkasan statistik untuk dashboard admin (termasuk deteksi telat > 3 hari)
 */
export async function fetchDashboardStats() {
    const supabase = getClient();
    if (!supabase) return { total: 0, available: 0, borrowed: 0, pendingBorrow: 0, pendingReturn: 0, overdueCount: 0, overdueList: [] };

    try {
        const { data: cards } = await supabase.from('cards').select('status');
        const allCards = cards || [];
        const total = allCards.filter(c => c.status !== 'inactive').length;
        const available = allCards.filter(c => c.status === 'available').length;
        const borrowed = allCards.filter(c => c.status === 'borrowed').length;

        const { count: pendingBorrow } = await supabase
            .from('transactions')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending_approval');

        const { count: pendingReturn } = await supabase
            .from('returns')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending_review');

        // Deteksi peminjaman yang aktif (status 'borrowed') dan belum dikembalikan > 3 hari
        const { data: activeBorrows } = await supabase
            .from('transactions')
            .select(`
                id,
                borrower_name,
                borrower_department,
                borrow_date,
                purpose,
                requested_at,
                cards (
                    label,
                    card_identifier
                )
            `)
            .eq('status', 'borrowed');

        const today = new Date();
        const overdueList = [];

        if (activeBorrows && activeBorrows.length > 0) {
            activeBorrows.forEach(tx => {
                const borrowDate = new Date(tx.borrow_date || tx.requested_at);
                const diffTime = today - borrowDate;
                const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                if (diffDays > 3) {
                    overdueList.push({
                        ...tx,
                        diffDays
                    });
                }
            });
        }

        return {
            total,
            available,
            borrowed,
            pendingBorrow: pendingBorrow || 0,
            pendingReturn: pendingReturn || 0,
            overdueCount: overdueList.length,
            overdueList
        };
    } catch (err) {
        console.error("Gagal memuat statistik dashboard:", err);
        return { total: 0, available: 0, borrowed: 0, pendingBorrow: 0, pendingReturn: 0, overdueCount: 0, overdueList: [] };
    }
}

/**
 * Mengambil permohonan peminjaman yang menunggu persetujuan admin
 */
export async function fetchPendingBorrows() {
    const supabase = getClient();
    if (!supabase) return [];

    const { data, error } = await supabase
        .from('transactions')
        .select(`
            id,
            borrow_date,
            borrower_name,
            borrower_department,
            borrower_phone,
            purpose,
            status,
            requested_at,
            cards (
                id,
                label,
                card_identifier
            )
        `)
        .eq('status', 'pending_approval')
        .order('requested_at', { ascending: true });

    if (error) {
        console.error("Gagal memuat permohonan pinjam:", error.message);
        throw error;
    }

    return data || [];
}

/**
 * Admin mengambil keputusan peminjaman (Setuju / Tolak)
 */
export async function decideBorrow(transactionId, decision, note = '') {
    const supabase = getClient();
    if (!supabase) throw new Error("Koneksi Supabase tidak aktif.");

    if (decision === 'rejected' && (!note || note.trim() === '')) {
        throw new Error("Alasan penolakan wajib diisi.");
    }

    const { data, error } = await supabase.rpc('admin_decide_borrow', {
        p_transaction_id: transactionId,
        p_decision: decision,
        p_note: note.trim() || null
    });

    if (error) {
        throw new Error(error.message);
    }

    return data;
}

/**
 * Mengambil permohonan pengembalian yang menunggu verifikasi admin (Tanpa struk)
 */
export async function fetchPendingReturns() {
    const supabase = getClient();
    if (!supabase) return [];

    const { data, error } = await supabase
        .from('returns')
        .select(`
            id,
            transaction_id,
            topup_date,
            topup_amount,
            return_notes,
            status,
            submitted_at,
            transactions (
                id,
                borrower_name,
                borrower_department,
                borrow_date,
                purpose,
                cards (
                    id,
                    label,
                    card_identifier
                )
            )
        `)
        .eq('status', 'pending_review')
        .order('submitted_at', { ascending: true });

    if (error) {
        console.error("Gagal memuat pengembalian:", error.message);
        throw error;
    }

    return data || [];
}

/**
 * Admin memverifikasi pengembalian (Setuju / Tolak)
 */
export async function decideReturn(returnId, decision, note = '') {
    const supabase = getClient();
    if (!supabase) throw new Error("Koneksi Supabase tidak aktif.");

    if (decision === 'rejected' && (!note || note.trim() === '')) {
        throw new Error("Alasan penolakan pengembalian wajib diisi.");
    }

    const { data, error } = await supabase.rpc('admin_decide_return', {
        p_return_id: returnId,
        p_decision: decision,
        p_note: note.trim() || null
    });

    if (error) {
        throw new Error(error.message);
    }

    return data;
}

/**
 * Mengambil catatan log audit
 */
export async function fetchAuditLogs() {
    const supabase = getClient();
    if (!supabase) return [];

    const { data, error } = await supabase
        .from('audit_logs')
        .select(`
            id,
            action,
            entity_type,
            entity_id,
            details,
            created_at
        `)
        .order('created_at', { ascending: false })
        .limit(50);

    if (error) {
        console.error("Gagal memuat log audit:", error.message);
        return [];
    }

    return data || [];
}
