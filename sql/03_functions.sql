-- ==============================================================================
-- E-TOLL CONTROL - LOGIKA TRANSAKSI DATABASE ATOMIK (03_functions.sql)
-- ==============================================================================
-- Skrip ini menyediakan fungsi (RPC) untuk memproses peminjaman dan pengembalian
-- secara aman di sisi database sehingga mencegah bentrok permohonan (race condition).

-- 1. Pengajuan Peminjaman Kartu (Atomic & Safe)
CREATE OR REPLACE FUNCTION public.submit_borrow_request(
    p_card_id UUID,
    p_purpose TEXT,
    p_borrow_date DATE
)
RETURNS UUID AS $$
DECLARE
    v_card_status card_status;
    v_tx_id UUID;
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Akses ditolak: Pengguna harus login terlebih dahulu.';
    END IF;

    IF trim(p_purpose) = '' OR p_purpose IS NULL THEN
        RAISE EXCEPTION 'Tujuan peminjaman wajib diisi.';
    END IF;

    -- Kunci baris kartu untuk mencegah modifikasi konkuren di saat bersamaan
    SELECT status INTO v_card_status
    FROM public.cards
    WHERE id = p_card_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Kartu e-Toll tidak ditemukan.';
    END IF;

    IF v_card_status <> 'available' THEN
        RAISE EXCEPTION 'Kartu ini sedang tidak tersedia atau sedang menunggu persetujuan lain.';
    END IF;

    -- Catat transaksi peminjaman
    INSERT INTO public.transactions (
        card_id,
        borrower_id,
        borrow_date,
        purpose,
        status,
        requested_at
    ) VALUES (
        p_card_id,
        v_user_id,
        COALESCE(p_borrow_date, CURRENT_DATE),
        p_purpose,
        'pending_approval',
        now()
    ) RETURNING id INTO v_tx_id;

    -- Perbarui status kartu menjadi pending_approval
    UPDATE public.cards
    SET status = 'pending_approval', updated_at = now()
    WHERE id = p_card_id;

    -- Rekam jejak audit
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
    VALUES (
        v_user_id,
        'SUBMIT_BORROW_REQUEST',
        'transactions',
        v_tx_id,
        jsonb_build_object('card_id', p_card_id, 'purpose', p_purpose)
    );

    RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Keputusan Admin untuk Permohonan Peminjaman (Approve / Reject)
CREATE OR REPLACE FUNCTION public.admin_decide_borrow(
    p_transaction_id UUID,
    p_decision TEXT, -- 'approved' atau 'rejected'
    p_note TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_admin_id UUID;
    v_card_id UUID;
    v_current_status transaction_status;
BEGIN
    v_admin_id := auth.uid();
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Akses ditolak: Hanya Admin Utama yang berwenang mengambil keputusan ini.';
    END IF;

    -- Kunci transaksi
    SELECT card_id, status INTO v_card_id, v_current_status
    FROM public.transactions
    WHERE id = p_transaction_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Transaksi peminjaman tidak ditemukan.';
    END IF;

    IF v_current_status <> 'pending_approval' THEN
        RAISE EXCEPTION 'Transaksi ini sudah diproses sebelumnya dan tidak dapat diubah lagi.';
    END IF;

    IF p_decision = 'approved' THEN
        UPDATE public.transactions
        SET status = 'borrowed',
            decision_by = v_admin_id,
            decision_at = now(),
            decision_note = p_note,
            updated_at = now()
        WHERE id = p_transaction_id;

        UPDATE public.cards
        SET status = 'borrowed', updated_at = now()
        WHERE id = v_card_id;

        INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
        VALUES (v_admin_id, 'APPROVE_BORROW', 'transactions', p_transaction_id, jsonb_build_object('note', p_note));

    ELSIF p_decision = 'rejected' THEN
        UPDATE public.transactions
        SET status = 'rejected',
            decision_by = v_admin_id,
            decision_at = now(),
            decision_note = p_note,
            updated_at = now()
        WHERE id = p_transaction_id;

        -- Kembalikan kartu menjadi available
        UPDATE public.cards
        SET status = 'available', updated_at = now()
        WHERE id = v_card_id;

        INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
        VALUES (v_admin_id, 'REJECT_BORROW', 'transactions', p_transaction_id, jsonb_build_object('note', p_note));
    ELSE
        RAISE EXCEPTION 'Keputusan tidak valid. Pilihan: approved atau rejected.';
    END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. Pengajuan Pengembalian Kartu oleh Pengguna
CREATE OR REPLACE FUNCTION public.submit_return_request(
    p_transaction_id UUID,
    p_topup_date DATE,
    p_topup_amount NUMERIC,
    p_receipt_path TEXT
)
RETURNS UUID AS $$
DECLARE
    v_user_id UUID;
    v_card_id UUID;
    v_tx_status transaction_status;
    v_borrower_id UUID;
    v_return_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Akses ditolak: Pengguna harus login terlebih dahulu.';
    END IF;

    IF p_topup_amount < 0 THEN
        RAISE EXCEPTION 'Nominal top up tidak boleh negatif.';
    END IF;

    IF trim(p_receipt_path) = '' OR p_receipt_path IS NULL THEN
        RAISE EXCEPTION 'Foto struk top up wajib disertakan.';
    END IF;

    -- Kunci transaksi
    SELECT card_id, borrower_id, status INTO v_card_id, v_borrower_id, v_tx_status
    FROM public.transactions
    WHERE id = p_transaction_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Transaksi tidak ditemukan.';
    END IF;

    IF v_borrower_id <> v_user_id THEN
        RAISE EXCEPTION 'Akses ditolak: Anda hanya dapat mengembalikan transaksi milik Anda sendiri.';
    END IF;

    IF v_tx_status <> 'borrowed' THEN
        RAISE EXCEPTION 'Hanya transaksi berstatus sedang dipinjam yang dapat diajukan pengembalian.';
    END IF;

    -- Buat atau perbarui catatan pengembalian (jika sebelumnya pernah ditolak lalu diajukan ulang)
    INSERT INTO public.returns (
        transaction_id,
        topup_date,
        topup_amount,
        receipt_storage_path,
        status,
        submitted_at
    ) VALUES (
        p_transaction_id,
        COALESCE(p_topup_date, CURRENT_DATE),
        p_topup_amount,
        p_receipt_path,
        'pending_review',
        now()
    )
    ON CONFLICT (transaction_id) DO UPDATE SET
        topup_date = EXCLUDED.topup_date,
        topup_amount = EXCLUDED.topup_amount,
        receipt_storage_path = EXCLUDED.receipt_storage_path,
        status = 'pending_review',
        submitted_at = now(),
        review_note = NULL,
        reviewed_by = NULL,
        reviewed_at = NULL
    RETURNING id INTO v_return_id;

    -- Perbarui status transaksi dan kartu
    UPDATE public.transactions
    SET status = 'pending_return_review', updated_at = now()
    WHERE id = p_transaction_id;

    UPDATE public.cards
    SET status = 'pending_return_review', updated_at = now()
    WHERE id = v_card_id;

    -- Log jejak audit
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
    VALUES (
        v_user_id,
        'SUBMIT_RETURN_REQUEST',
        'returns',
        v_return_id,
        jsonb_build_object('transaction_id', p_transaction_id, 'amount', p_topup_amount)
    );

    RETURN v_return_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. Keputusan Admin untuk Pengembalian (Approve / Reject)
CREATE OR REPLACE FUNCTION public.admin_decide_return(
    p_return_id UUID,
    p_decision TEXT, -- 'approved' atau 'rejected'
    p_note TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_admin_id UUID;
    v_tx_id UUID;
    v_card_id UUID;
    v_ret_status return_status;
BEGIN
    v_admin_id := auth.uid();
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Akses ditolak: Hanya Admin Utama yang berwenang memverifikasi pengembalian.';
    END IF;

    -- Kunci data pengembalian
    SELECT transaction_id, status INTO v_tx_id, v_ret_status
    FROM public.returns
    WHERE id = p_return_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Data pengembalian tidak ditemukan.';
    END IF;

    IF v_ret_status <> 'pending_review' THEN
        RAISE EXCEPTION 'Pengembalian ini sudah diverifikasi sebelumnya.';
    END IF;

    SELECT card_id INTO v_card_id
    FROM public.transactions
    WHERE id = v_tx_id;

    IF p_decision = 'approved' THEN
        -- Catat verifikasi pengembalian berhasil
        UPDATE public.returns
        SET status = 'approved',
            reviewed_by = v_admin_id,
            reviewed_at = now(),
            review_note = p_note,
            updated_at = now()
        WHERE id = p_return_id;

        -- Transaksi selesai
        UPDATE public.transactions
        SET status = 'completed', updated_at = now()
        WHERE id = v_tx_id;

        -- Kartu kembali tersedia untuk dipinjam
        UPDATE public.cards
        SET status = 'available', updated_at = now()
        WHERE id = v_card_id;

        INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
        VALUES (v_admin_id, 'APPROVE_RETURN', 'returns', p_return_id, jsonb_build_object('note', p_note));

    ELSIF p_decision = 'rejected' THEN
        -- Catat penolakan verifikasi (misal foto buram / nominal tidak sesuai)
        UPDATE public.returns
        SET status = 'rejected',
            reviewed_by = v_admin_id,
            reviewed_at = now(),
            review_note = p_note,
            updated_at = now()
        WHERE id = p_return_id;

        -- Transaksi dan kartu dikembalikan ke status 'borrowed' agar peminjam bisa mengirim ulang bukti yang benar
        UPDATE public.transactions
        SET status = 'borrowed', updated_at = now()
        WHERE id = v_tx_id;

        UPDATE public.cards
        SET status = 'borrowed', updated_at = now()
        WHERE id = v_card_id;

        INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
        VALUES (v_admin_id, 'REJECT_RETURN', 'returns', p_return_id, jsonb_build_object('note', p_note));
    ELSE
        RAISE EXCEPTION 'Keputusan tidak valid. Pilihan: approved atau rejected.';
    END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
