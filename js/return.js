// ==============================================================================
// NID-GATECARD - LOGIKA PENGEMBALIAN KARTU & SKEMA SALDO (return.js)
// ==============================================================================
import { getClient } from './supabaseClient.js';

/**
 * Mengambil informasi saldo awal kartu yang sedang dipinjam
 */
export async function getActiveCardBalance(cardId) {
    const supabase = getClient();
    if (!supabase || !cardId) return 300000;

    try {
        const { data, error } = await supabase.rpc('get_active_card_balance', {
            p_card_id: cardId
        });

        if (!error && data && data.length > 0) {
            return Number(data[0].saldo_awal) || 300000;
        }
    } catch (e) {
        console.warn("Fallback saldo awal default:", e);
    }

    return 300000;
}

/**
 * Mengajukan pengembalian kartu e-Toll dengan Skema Saldo:
 * - pemakaian: nominal pemakaian oleh peminjam (0 <= pemakaian <= saldo_awal)
 * - foto struk top up: OPSIONAL (maks 2 MB, gambar saja, tidak memblokir proses)
 */
export async function submitGuestReturn({ cardId, usageAmount, returnNotes, returnDate, receiptFile }) {
    const supabase = getClient();
    if (!supabase) throw new Error("Koneksi Supabase tidak aktif.");

    if (!cardId) throw new Error("Kartu e-Toll belum teridentifikasi.");

    const pemakaianVal = Number(usageAmount);
    if (isNaN(pemakaianVal) || pemakaianVal < 0) {
        throw new Error("Nominal pemakaian wajib diisi angka minimal 0.");
    }

    let receiptStoragePath = null;

    // Proses upload struk jika pengguna memilih file (OPSIONAL & TIDAK MEMBLOKIR)
    if (receiptFile && receiptFile instanceof File && receiptFile.size > 0) {
        // Validasi ukuran (maksimal 2 MB = 2097152 bytes)
        if (receiptFile.size > 2097152) {
            throw new Error("Ukuran foto struk melebihi batas maksimal 2 MB.");
        }

        // Validasi format (gambar saja)
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowedTypes.includes(receiptFile.type)) {
            throw new Error("Format foto struk harus berupa gambar (JPG, PNG, atau WEBP).");
        }

        try {
            const ext = receiptFile.name.split('.').pop() || 'jpg';
            const fileName = `struk_${cardId}_${Date.now()}.${ext}`;

            const { data: uploadData, error: uploadErr } = await supabase.storage
                .from('receipts')
                .upload(fileName, receiptFile, {
                    cacheControl: '3600',
                    upsert: false
                });

            if (!uploadErr && uploadData) {
                receiptStoragePath = uploadData.path;
            } else {
                console.warn("Gagal mengunggah foto struk (tetap dilanjutkan):", uploadErr?.message);
            }
        } catch (uploadError) {
            console.warn("Kesalahan upload struk (tetap dilanjutkan):", uploadError);
        }
    }

    const dateVal = returnDate || new Date().toISOString().split('T')[0];

    const { data, error } = await supabase.rpc('submit_guest_return', {
        p_card_id: cardId,
        p_topup_amount: pemakaianVal,
        p_return_notes: returnNotes ? returnNotes.trim() : null,
        p_topup_date: dateVal
    });

    if (error) {
        throw new Error(error.message);
    }

    return data; // Mengembalikan Return ID
}
