// ==============================================================================
// NID-GATECARD - PENGATUR ALUR APLIKASI UTAMA (app.js)
// ==============================================================================
import { isConfigured } from './config.js';
import { initSupabase, getClient } from './supabaseClient.js';
import { 
    loginUser, 
    logoutUser, 
    getCurrentSession, 
    getUserProfile, 
    subscribeAuthChange 
} from './auth.js';
import { 
    fetchAllCards, 
    fetchPublicCardsMonitoring,
    getCardByToken, 
    createCard, 
    updateCardStatus 
} from './cards.js';
import { 
    startScanner, 
    stopScanner 
} from './scanner.js';
import { 
    submitGuestBorrow 
} from './borrow.js';
import { 
    getActiveCardBalance, 
    submitGuestReturn 
} from './return.js';
import { 
    fetchDashboardStats, 
    fetchPendingBorrows, 
    decideBorrow, 
    fetchPendingReturns, 
    decideReturn, 
    fetchAllTransactionHistory,
    getReceiptSignedUrl,
    fetchDepartments
} from './admin.js';

// Status Global Aplikasi
let currentUserProfile = null;
let currentIdentifiedCard = null;
let decisionTargetCategory = 'borrow'; // 'borrow' atau 'return'
let currentDecisionPemakaian = 0;
let currentDecisionSaldoAwal = 300000;
let allHistoryCache = [];
let realtimeChannel = null;
let pollingIntervalId = null;

// Elemen DOM Header & Auth
const guestHeaderActionEl = document.getElementById('guest-header-action');
const btnOpenAdminLoginEl = document.getElementById('btn-open-admin-login');
const authHeaderInfoEl = document.getElementById('auth-header-info');
const userDisplayNameEl = document.getElementById('user-display-name');
const btnLogoutEl = document.getElementById('btn-logout');
const adminNavEl = document.getElementById('admin-nav');
const badgeTotalVerifikasiEl = document.getElementById('badge-total-verifikasi');
const alertContainerEl = document.getElementById('alert-container');

// Elemen Tampilan Kiosk (Peminjam)
const kioskSectionEl = document.getElementById('kiosk-section');
const publicCardsMonitoringGridEl = document.getElementById('public-cards-monitoring-grid');
const btnRefreshMonitoringEl = document.getElementById('btn-refresh-monitoring');
const btnOpenDeskQrModalEl = document.getElementById('btn-open-desk-qr-modal');

const btnStartCameraEl = document.getElementById('btn-start-camera');
const btnStopCameraEl = document.getElementById('btn-stop-camera');
const qrReaderEl = document.getElementById('qr-reader');
const inputManualTokenEl = document.getElementById('input-manual-token');
const btnCheckManualTokenEl = document.getElementById('btn-check-manual-token');

const cardIdentifiedBoxEl = document.getElementById('card-identified-box');
const identifiedCardLabelEl = document.getElementById('identified-card-label');
const identifiedCardNumberEl = document.getElementById('identified-card-number');
const identifiedCardBadgeEl = document.getElementById('identified-card-badge');

// Form Pinjam Cepat (Guest - Tanpa HP)
const formGuestBorrowEl = document.getElementById('form-guest-borrow');
const borrowCardIdEl = document.getElementById('borrow-card-id');
const borrowBorrowerNameEl = document.getElementById('borrow-borrower-name');
const borrowDepartmentEl = document.getElementById('borrow-department');
const borrowDateEl = document.getElementById('borrow-date');
const borrowPurposeEl = document.getElementById('borrow-purpose');
const btnSubmitBorrowEl = document.getElementById('btn-submit-borrow');

// Form Kembali Cepat (Guest - Skema Saldo)
const formGuestReturnEl = document.getElementById('form-guest-return');
const returnCardIdEl = document.getElementById('return-card-id');
const displayReturnSaldoAwalEl = document.getElementById('display-return-saldo-awal');
const returnOverdueAlertEl = document.getElementById('return-overdue-alert');
const returnOverdueTextEl = document.getElementById('return-overdue-text');
const inputReturnDateEl = document.getElementById('input-return-date');
const inputUsageAmountEl = document.getElementById('input-usage-amount');
const usageAmountFormattedEl = document.getElementById('usage-amount-formatted');
const inputTopupAmountEl = document.getElementById('input-topup-amount');
const topupAmountFormattedEl = document.getElementById('topup-amount-formatted');
const inputReceiptFileEl = document.getElementById('input-receipt-file');
const inputReturnNotesEl = document.getElementById('input-return-notes');
const btnSubmitReturnEl = document.getElementById('btn-submit-return');
const cardStatusInfoBoxEl = document.getElementById('card-status-info-box');

let currentActiveCardSaldoAwal = 300000;

// Elemen Tampilan Admin Dashboard & Overdue
const adminViewEl = document.getElementById('admin-view');
const adminOverdueBannerEl = document.getElementById('admin-overdue-banner');
const overdueItemsContainerEl = document.getElementById('overdue-items-container');
const statTotalCardsEl = document.getElementById('stat-total-cards');
const statAvailableCardsEl = document.getElementById('stat-available-cards');
const statBorrowedCardsEl = document.getElementById('stat-borrowed-cards');
const statOverdueCardsEl = document.getElementById('stat-overdue-cards');
const statPendingApprovalEl = document.getElementById('stat-pending-approval');
const statPendingReturnsEl = document.getElementById('stat-pending-returns');
const cardStatPendingApprovalEl = document.getElementById('card-stat-pending-approval');
const cardStatPendingReturnsEl = document.getElementById('card-stat-pending-returns');
const btnRefreshAdminDashboardEl = document.getElementById('btn-refresh-admin-dashboard');

// Elemen Tab Admin Verifikasi (Gabungan Peminjaman & Pengembalian)
const btnSubtabBorrowsEl = document.getElementById('btn-subtab-borrows');
const btnSubtabReturnsEl = document.getElementById('btn-subtab-returns');
const badgeSubtabBorrowsEl = document.getElementById('badge-subtab-borrows');
const badgeSubtabReturnsEl = document.getElementById('badge-subtab-returns');
const subtabContentBorrowsEl = document.getElementById('subtab-content-borrows');
const subtabContentReturnsEl = document.getElementById('subtab-content-returns');
const realtimeStatusIndicatorEl = document.getElementById('realtime-status-indicator');

const adminBorrowsTbodyEl = document.getElementById('admin-borrows-tbody');
const adminReturnsTbodyEl = document.getElementById('admin-returns-tbody');

// Elemen Tab Master Kartu
const formCreateCardEl = document.getElementById('form-create-card');
const newCardLabelEl = document.getElementById('new-card-label');
const newCardIdentifierEl = document.getElementById('new-card-identifier');
const adminCardsTbodyEl = document.getElementById('admin-cards-tbody');
const btnRefreshAdminCardsEl = document.getElementById('btn-refresh-admin-cards');

// Elemen Tab Riwayat
const adminHistoryTbodyEl = document.getElementById('admin-history-tbody');
const btnRefreshAdminHistoryEl = document.getElementById('btn-refresh-admin-history');
const btnExportHistoryCsvEl = document.getElementById('btn-export-history-csv');
const inputHistorySearchEl = document.getElementById('input-history-search');
const selectHistoryStatusEl = document.getElementById('select-history-status');
const historyTotalUsageEl = document.getElementById('history-total-usage');
const historyTotalTopupEl = document.getElementById('history-total-topup');
const historyTotalCountEl = document.getElementById('history-total-count');

// Modal Admin Login
const modalAdminLoginEl = document.getElementById('modal-admin-login');
const formAdminLoginEl = document.getElementById('form-admin-login');
const loginEmailEl = document.getElementById('login-email');
const loginPasswordEl = document.getElementById('login-password');
const btnCloseAdminLoginEl = document.getElementById('btn-close-admin-login');
const btnSubmitAdminLoginEl = document.getElementById('btn-submit-admin-login');

// Modal QR Kartu Fisik
const modalQrEl = document.getElementById('modal-qr');
const modalQrTitleEl = document.getElementById('modal-qr-title');
const modalQrSubtitleEl = document.getElementById('modal-qr-subtitle');
const modalQrCanvasWrapperEl = document.getElementById('modal-qr-canvas-wrapper');
const modalQrTokenTextEl = document.getElementById('modal-qr-token-text');
const qrBaseUrlInputEl = document.getElementById('qr-base-url-input');
const btnUpdateQrUrlEl = document.getElementById('btn-update-qr-url');
const btnPrintQrEl = document.getElementById('btn-print-qr');
const btnCloseQrModalEl = document.getElementById('btn-close-qr-modal');
let currentQrTokenForModal = '';

// Modal QR Monitoring (Monitoring Karyawan)
const modalDeskQrEl = document.getElementById('modal-desk-qr');
const deskQrCanvasWrapperEl = document.getElementById('desk-qr-canvas-wrapper');
const deskQrUrlTextEl = document.getElementById('desk-qr-url-text');
const btnPrintDeskQrEl = document.getElementById('btn-print-desk-qr');
const btnCloseDeskQrEl = document.getElementById('btn-close-desk-qr');

// Modal Keputusan Admin
const modalDecisionEl = document.getElementById('modal-decision');
const modalDecisionTitleEl = document.getElementById('modal-decision-title');
const modalDecisionDescEl = document.getElementById('modal-decision-desc');
const formDecisionEl = document.getElementById('form-decision');
const decisionTxIdEl = document.getElementById('decision-tx-id');
const decisionActionTypeEl = document.getElementById('decision-action-type');
const decisionNoteEl = document.getElementById('decision-note');
const labelDecisionNoteEl = document.getElementById('label-decision-note');
const btnCancelDecisionEl = document.getElementById('btn-cancel-decision');

const decisionCorrectionBoxEl = document.getElementById('decision-correction-box');
const decisionPemakaianTextEl = document.getElementById('decision-pemakaian-text');
const decisionSaldoAwalTextEl = document.getElementById('decision-saldo-awal-text');
const decisionCorrectedTopupEl = document.getElementById('decision-corrected-topup');
const decisionCorrectionNoteHintEl = document.getElementById('decision-correction-note-hint');

/**
 * Menampilkan pesan notifikasi
 */
export function showAlert(message, type = 'info', duration = 5000) {
    if (!alertContainerEl) return;
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.innerHTML = `<span>${message}</span>`;
    alertContainerEl.appendChild(alertDiv);
    if (duration > 0) {
        setTimeout(() => alertDiv.remove(), duration);
    }
}

export function formatRupiah(amount) {
    const num = Number(amount);
    if (isNaN(num)) return 'Rp 0';
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(num);
}

export function renderStatusBadge(status, isOverdue = false, diffDays = 0) {
    if (status === 'borrowed' && isOverdue) {
        return `<span class="status-badge status-overdue">⚠️ Telat (${diffDays} Hari)</span>`;
    }

    const labels = {
        'available': { text: 'Tersedia', class: 'status-available' },
        'pending_approval': { text: 'Menunggu Persetujuan', class: 'status-pending_approval' },
        'borrowed': { text: 'Sedang Dipinjam', class: 'status-borrowed' },
        'pending_return_review': { text: 'Menunggu Verifikasi', class: 'status-pending_return_review' },
        'completed': { text: 'Selesai', class: 'status-completed' },
        'rejected': { text: 'Ditolak', class: 'status-rejected' },
        'inactive': { text: 'Nonaktif', class: 'status-inactive' }
    };
    const s = labels[status] || { text: status, class: 'status-inactive' };
    return `<span class="status-badge ${s.class}">${s.text}</span>`;
}

function formatDateTime(isoString) {
    if (!isoString) return '-';
    const date = new Date(isoString);
    return date.toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatDateOnly(isoString) {
    if (!isoString) return '-';
    const date = new Date(isoString);
    return date.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
}

/**
 * Update UI saat status Admin login / logout
 */
async function updateUIForUser(profile) {
    currentUserProfile = profile;

    if (!profile || profile.role !== 'admin') {
        guestHeaderActionEl.classList.remove('hidden');
        authHeaderInfoEl.classList.add('hidden');
        adminNavEl.classList.add('hidden');
        adminViewEl.classList.add('hidden');
        kioskSectionEl.classList.remove('hidden');
        teardownRealtimeSubscriptions();
        await refreshPublicMonitoring();
        return;
    }

    // Mode Admin Utama
    guestHeaderActionEl.classList.add('hidden');
    authHeaderInfoEl.classList.remove('hidden');
    userDisplayNameEl.textContent = profile.full_name || profile.email;

    adminNavEl.classList.remove('hidden');
    adminViewEl.classList.remove('hidden');

    const defaultTab = adminNavEl.querySelector('[data-tab="tab-admin-dashboard"]');
    if (defaultTab) defaultTab.click();

    await refreshAdminDashboard();
    await refreshAdminBorrows();
    await refreshAdminReturns();
    await refreshAdminCards();
    await refreshAdminHistory();

    setupRealtimeSubscriptions();
}

/**
 * Tab switcher untuk Admin (5 Menu Utama)
 */
function setupAdminTabs() {
    if (!adminNavEl) return;
    const tabButtons = adminNavEl.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            tabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const targetTabId = btn.getAttribute('data-tab');

            if (targetTabId === 'tab-kiosk-view') {
                adminViewEl.classList.add('hidden');
                kioskSectionEl.classList.remove('hidden');
                refreshPublicMonitoring();
                return;
            }

            kioskSectionEl.classList.add('hidden');
            adminViewEl.classList.remove('hidden');

            const tabContents = adminViewEl.querySelectorAll('.tab-content');
            tabContents.forEach(content => {
                if (content.id === targetTabId) {
                    content.classList.remove('hidden');
                } else {
                    content.classList.add('hidden');
                }
            });

            if (targetTabId === 'tab-admin-dashboard') refreshAdminDashboard();
            if (targetTabId === 'tab-admin-verification') {
                refreshAdminBorrows();
                refreshAdminReturns();
            }
            if (targetTabId === 'tab-admin-cards') refreshAdminCards();
            if (targetTabId === 'tab-admin-history') refreshAdminHistory();
        });
    });
}

/**
 * Sub-nav switcher dalam Menu Verifikasi (Peminjaman & Pengembalian)
 */
function setupVerificationSubtabs() {
    if (btnSubtabBorrowsEl) {
        btnSubtabBorrowsEl.addEventListener('click', () => {
            btnSubtabBorrowsEl.classList.add('active');
            btnSubtabReturnsEl.classList.remove('active');
            subtabContentBorrowsEl.classList.remove('hidden');
            subtabContentReturnsEl.classList.add('hidden');
        });
    }

    if (btnSubtabReturnsEl) {
        btnSubtabReturnsEl.addEventListener('click', () => {
            btnSubtabReturnsEl.classList.add('active');
            btnSubtabBorrowsEl.classList.remove('active');
            subtabContentReturnsEl.classList.remove('hidden');
            subtabContentBorrowsEl.classList.add('hidden');
        });
    }

    // Klik kartu dashboard untuk langsung menuju subtab Verifikasi
    if (cardStatPendingApprovalEl) {
        cardStatPendingApprovalEl.addEventListener('click', () => {
            const navVerif = document.getElementById('nav-btn-verification');
            if (navVerif) navVerif.click();
            if (btnSubtabBorrowsEl) btnSubtabBorrowsEl.click();
        });
    }

    if (cardStatPendingReturnsEl) {
        cardStatPendingReturnsEl.addEventListener('click', () => {
            const navVerif = document.getElementById('nav-btn-verification');
            if (navVerif) navVerif.click();
            if (btnSubtabReturnsEl) btnSubtabReturnsEl.click();
        });
    }
}

/**
 * Realtime Subscription untuk Admin (postgres_changes pada transactions & returns)
 * Fallback polling 30 detik
 */
function setupRealtimeSubscriptions() {
    teardownRealtimeSubscriptions();

    const supabase = getClient();
    if (!supabase || !currentUserProfile) return;

    try {
        realtimeChannel = supabase
            .channel('admin-verification-channel')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, (payload) => {
                handleRealtimeUpdate('transactions');
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'returns' }, (payload) => {
                handleRealtimeUpdate('returns');
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'cards' }, (payload) => {
                handleRealtimeUpdate('cards');
            })
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    setRealtimeStatus(true);
                } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                    setRealtimeStatus(false);
                }
            });
    } catch (err) {
        console.warn("Gagal inisialisasi Supabase Realtime:", err);
        setRealtimeStatus(false);
    }

    // Fallback polling setiap 30 detik
    pollingIntervalId = setInterval(() => {
        if (currentUserProfile && currentUserProfile.role === 'admin') {
            handleRealtimeUpdate('polling');
        }
    }, 30000);
}

function teardownRealtimeSubscriptions() {
    if (realtimeChannel) {
        const supabase = getClient();
        if (supabase) {
            try {
                supabase.removeChannel(realtimeChannel);
            } catch (e) {
                // ignore
            }
        }
        realtimeChannel = null;
    }
    if (pollingIntervalId) {
        clearInterval(pollingIntervalId);
        pollingIntervalId = null;
    }
}

function setRealtimeStatus(isOnline) {
    if (!realtimeStatusIndicatorEl) return;
    if (isOnline) {
        realtimeStatusIndicatorEl.className = 'realtime-indicator online';
        realtimeStatusIndicatorEl.innerHTML = '<span class="status-dot"></span> Realtime Aktif';
    } else {
        realtimeStatusIndicatorEl.className = 'realtime-indicator offline';
        realtimeStatusIndicatorEl.innerHTML = '<span class="status-dot"></span> Polling 30s';
    }
}

/**
 * Eksekusi update otomatis tanpa mengganggu form modal keputusan admin jika sedang terbuka
 */
async function handleRealtimeUpdate(source) {
    if (!currentUserProfile || currentUserProfile.role !== 'admin') return;

    // Jangan refresh modal jika sedang terbuka untuk mencegah ketikan admin hilang
    const isModalOpen = modalDecisionEl && !modalDecisionEl.classList.contains('hidden');

    try {
        await refreshAdminDashboard();
        if (!isModalOpen) {
            await refreshAdminBorrows();
            await refreshAdminReturns();
        }
        await refreshAdminCards();
        await refreshAdminHistory();
    } catch (err) {
        console.warn("Gagal refresh data realtime:", err);
    }
}

// ==============================================================================
// MONITORING KETERSEDIAAN KARTU PUBLIK (UNTUK QR MONITORING)
// ==============================================================================

async function refreshPublicMonitoring() {
    if (!publicCardsMonitoringGridEl) return;
    publicCardsMonitoringGridEl.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 1.5rem;">Memuat data ketersediaan kartu...</div>';

    try {
        const cards = await fetchPublicCardsMonitoring();
        if (cards.length === 0) {
            publicCardsMonitoringGridEl.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 1.5rem;">Belum ada kartu e-Toll yang terdaftar di sistem.</div>';
            return;
        }

        publicCardsMonitoringGridEl.innerHTML = cards.map(c => {
            let cardClass = 'monitor-card';
            let statusText = '';
            let actionBtn = '';

            if (c.status === 'available') {
                cardClass += ' available';
                statusText = '<span class="status-badge status-available">🟢 Tersedia</span>';
                actionBtn = `<button class="btn btn-primary btn-sm btn-quick-select-card" data-id="${c.id}" data-label="${c.label}" data-status="available" style="margin-top: 0.5rem; width: 100%;">🚀 Pinjam Kartu Ini</button>`;
            } else if (c.status === 'borrowed') {
                cardClass += ' borrowed';
                statusText = '<span class="status-badge status-borrowed">🔵 Sedang Dipinjam</span>';
                actionBtn = `<button class="btn btn-secondary btn-sm btn-quick-select-card" data-id="${c.id}" data-label="${c.label}" data-status="borrowed" style="margin-top: 0.5rem; width: 100%;">🔄 Kembalikan Kartu</button>`;
            } else if (c.status === 'pending_approval') {
                statusText = '<span class="status-badge status-pending_approval">⏳ Menunggu Persetujuan</span>';
            } else if (c.status === 'pending_return_review') {
                statusText = '<span class="status-badge status-pending_return_review">🔍 Menunggu Verifikasi</span>';
            } else {
                statusText = '<span class="status-badge status-inactive">Non-aktif</span>';
            }

            return `
                <div class="${cardClass}">
                    <div>
                        <div class="monitor-card-header">
                            <div>
                                <div class="monitor-card-title">${c.label}</div>
                            </div>
                            <div>${statusText}</div>
                        </div>
                        <div class="monitor-card-body">
                            ${c.status === 'available' 
                                ? '<p style="color: #34d399; font-size: 0.85rem; margin: 0;">Kartu tersedia di kantor dan siap digunakan.</p>' 
                                : (c.status === 'borrowed' 
                                    ? '<p style="color: var(--cyan); font-size: 0.85rem; margin: 0;">Kartu sedang dipinjam untuk dinas operasional.</p>' 
                                    : '<p style="color: var(--text-muted); font-size: 0.85rem; margin: 0;">Sedang dalam proses verifikasi admin.</p>')}
                        </div>
                    </div>
                    ${actionBtn}
                </div>
            `;
        }).join('');

        // Pasang event tombol cepat pinjam/kembalikan
        publicCardsMonitoringGridEl.querySelectorAll('.btn-quick-select-card').forEach(b => {
            b.addEventListener('click', async () => {
                const cardId = b.dataset.id;
                const cardLabel = b.dataset.label;
                const cardStatus = b.dataset.status;

                currentIdentifiedCard = { id: cardId, label: cardLabel, status: cardStatus };
                identifiedCardLabelEl.textContent = cardLabel;
                identifiedCardNumberEl.textContent = '';
                identifiedCardBadgeEl.innerHTML = renderStatusBadge(cardStatus);
                cardIdentifiedBoxEl.classList.remove('hidden');

                formGuestBorrowEl.classList.add('hidden');
                formGuestReturnEl.classList.add('hidden');
                if (cardStatusInfoBoxEl) cardStatusInfoBoxEl.classList.add('hidden');
                if (returnOverdueAlertEl) returnOverdueAlertEl.classList.add('hidden');

                if (cardStatus === 'available') {
                    formGuestBorrowEl.classList.remove('hidden');
                    borrowCardIdEl.value = cardId;
                    borrowDateEl.value = new Date().toISOString().split('T')[0];
                    borrowBorrowerNameEl.focus();
                } else if (cardStatus === 'borrowed') {
                    formGuestReturnEl.classList.remove('hidden');
                    returnCardIdEl.value = cardId;
                    inputReturnDateEl.value = new Date().toISOString().split('T')[0];

                    // Ambil saldo awal kartu
                    try {
                        const sAwal = await getActiveCardBalance(cardId);
                        currentActiveCardSaldoAwal = sAwal;
                        displayReturnSaldoAwalEl.textContent = formatRupiah(sAwal);
                    } catch (e) {
                        currentActiveCardSaldoAwal = 300000;
                        displayReturnSaldoAwalEl.textContent = formatRupiah(300000);
                    }
                    inputUsageAmountEl.value = '';
                    usageAmountFormattedEl.textContent = 'Rp 0';
                    inputTopupAmountEl.value = '';
                    topupAmountFormattedEl.textContent = 'Otomatis = Pemakaian';
                    if (inputReceiptFileEl) inputReceiptFileEl.value = '';
                }

                cardIdentifiedBoxEl.scrollIntoView({ behavior: 'smooth' });
            });
        });
    } catch (err) {
        publicCardsMonitoringGridEl.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--danger); padding: 1.5rem;">Gagal memuat status: ${err.message}. Periksa koneksi internet Anda.</div>`;
    }
}

// ==============================================================================
// LOGIKA IDENTIFIKASI KARTU & FORM PINJAM/KEMBALI
// ==============================================================================

async function handleIdentifyCard(token) {
    if (!token) {
        showAlert("Kode token kartu tidak boleh kosong.", "danger");
        return;
    }

    // Jika admin sedang login dan kiosk-section tersembunyi, alihkan ke tab kiosk agar form terlihat
    if (kioskSectionEl && kioskSectionEl.classList.contains('hidden')) {
        const kioskTab = adminNavEl?.querySelector('[data-tab="tab-kiosk-view"]');
        if (kioskTab) {
            kioskTab.click();
        } else {
            adminViewEl.classList.add('hidden');
            kioskSectionEl.classList.remove('hidden');
        }
    }

    try {
        showAlert("Memeriksa data kartu...", "info", 1500);
        const card = await getCardByToken(token);
        if (!card) {
            showAlert(`Kartu dengan kode "${token}" tidak terdaftar di sistem.`, "danger");
            cardIdentifiedBoxEl.classList.add('hidden');
            return;
        }

        currentIdentifiedCard = card;
        identifiedCardLabelEl.textContent = card.label;
        identifiedCardNumberEl.textContent = `Nomor Fisik: ${card.card_identifier}`;
        identifiedCardBadgeEl.innerHTML = renderStatusBadge(card.status);
        cardIdentifiedBoxEl.classList.remove('hidden');

        formGuestBorrowEl.classList.add('hidden');
        formGuestReturnEl.classList.add('hidden');
        if (cardStatusInfoBoxEl) cardStatusInfoBoxEl.classList.add('hidden');
        if (returnOverdueAlertEl) returnOverdueAlertEl.classList.add('hidden');

        if (card.status === 'available') {
            formGuestBorrowEl.classList.remove('hidden');
            borrowCardIdEl.value = card.id;
            borrowDateEl.value = new Date().toISOString().split('T')[0];
            borrowBorrowerNameEl.focus();
        } else if (card.status === 'borrowed') {
            formGuestReturnEl.classList.remove('hidden');
            returnCardIdEl.value = card.id;
            inputReturnDateEl.value = new Date().toISOString().split('T')[0];

            try {
                const sAwal = await getActiveCardBalance(card.id);
                currentActiveCardSaldoAwal = sAwal;
                displayReturnSaldoAwalEl.textContent = formatRupiah(sAwal);
            } catch (e) {
                currentActiveCardSaldoAwal = 300000;
                displayReturnSaldoAwalEl.textContent = formatRupiah(300000);
            }
            inputUsageAmountEl.value = '';
            usageAmountFormattedEl.textContent = 'Rp 0';
            inputTopupAmountEl.value = '';
            topupAmountFormattedEl.textContent = 'Otomatis = Pemakaian';
            if (inputReceiptFileEl) inputReceiptFileEl.value = '';
        } else if (card.status === 'pending_approval') {
            if (cardStatusInfoBoxEl) {
                cardStatusInfoBoxEl.className = 'alert alert-warning';
                cardStatusInfoBoxEl.innerHTML = '<strong>⏳ Menunggu Persetujuan:</strong> Permohonan peminjaman untuk kartu ini sedang menunggu konfirmasi Admin.';
                cardStatusInfoBoxEl.classList.remove('hidden');
            }
        } else if (card.status === 'pending_return_review') {
            if (cardStatusInfoBoxEl) {
                cardStatusInfoBoxEl.className = 'alert alert-info';
                cardStatusInfoBoxEl.innerHTML = '<strong>🔍 Menunggu Verifikasi:</strong> Kartu ini telah diajukan pengembalian dan sedang diverifikasi oleh Admin.';
                cardStatusInfoBoxEl.classList.remove('hidden');
            }
        } else if (card.status === 'inactive') {
            if (cardStatusInfoBoxEl) {
                cardStatusInfoBoxEl.className = 'alert alert-danger';
                cardStatusInfoBoxEl.innerHTML = '<strong>⚠️ Kartu Non-Aktif:</strong> Kartu ini dinonaktifkan oleh Admin (rusak atau hilang).';
                cardStatusInfoBoxEl.classList.remove('hidden');
            }
        }

        if (cardIdentifiedBoxEl) {
            setTimeout(() => {
                cardIdentifiedBoxEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
        }
    } catch (err) {
        showAlert("Gagal memeriksa kartu: " + err.message, "danger");
    }
}

// ==============================================================================
// LOGIKA DASHBOARD, OVERDUE & VERIFIKASI ADMIN
// ==============================================================================

async function refreshAdminDashboard() {
    const stats = await fetchDashboardStats();
    if (statTotalCardsEl) statTotalCardsEl.textContent = stats.total;
    if (statAvailableCardsEl) statAvailableCardsEl.textContent = stats.available;
    if (statBorrowedCardsEl) statBorrowedCardsEl.textContent = stats.borrowed;
    if (statOverdueCardsEl) statOverdueCardsEl.textContent = stats.overdueCount;
    if (statPendingApprovalEl) statPendingApprovalEl.textContent = stats.pendingBorrow;
    if (statPendingReturnsEl) statPendingReturnsEl.textContent = stats.pendingReturn;

    // Update Badges di Menu Verifikasi & Subnav
    if (badgeSubtabBorrowsEl) badgeSubtabBorrowsEl.textContent = stats.pendingBorrow;
    if (badgeSubtabReturnsEl) badgeSubtabReturnsEl.textContent = stats.pendingReturn;
    
    const totalVerifikasi = (stats.pendingBorrow || 0) + (stats.pendingReturn || 0);
    if (badgeTotalVerifikasiEl) {
        badgeTotalVerifikasiEl.textContent = totalVerifikasi;
        if (totalVerifikasi > 0) {
            badgeTotalVerifikasiEl.classList.remove('hidden');
        } else {
            badgeTotalVerifikasiEl.classList.add('hidden');
        }
    }

    // Render Banner Peringatan Keterlambatan (> 3 Hari)
    if (stats.overdueCount > 0 && adminOverdueBannerEl && overdueItemsContainerEl) {
        adminOverdueBannerEl.classList.remove('hidden');
        overdueItemsContainerEl.innerHTML = stats.overdueList.map(item => `
            <div class="overdue-item-card">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.35rem;">
                    <strong style="color: #ffffff;">${item.cards?.label}</strong>
                    <span class="status-badge status-overdue" style="font-size: 0.7rem; padding: 0.15rem 0.5rem;">${item.diffDays} Hari</span>
                </div>
                <div style="color: var(--text-secondary); font-size: 0.8rem;">
                    Peminjam: <strong style="color: #fca5a5;">${item.borrower_name}</strong> (${item.borrower_department || 'Divisi'})<br>
                    Tgl Pinjam: ${formatDateOnly(item.borrow_date)}
                </div>
            </div>
        `).join('');
    } else if (adminOverdueBannerEl) {
        adminOverdueBannerEl.classList.add('hidden');
    }
}

async function refreshAdminBorrows() {
    if (!adminBorrowsTbodyEl) return;

    try {
        const list = await fetchPendingBorrows();
        if (list.length === 0) {
            adminBorrowsTbodyEl.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); font-style: italic;">Tidak ada permohonan peminjaman yang menunggu persetujuan.</td></tr>';
            return;
        }

        adminBorrowsTbodyEl.innerHTML = list.map(tx => `
            <tr>
                <td data-label="Waktu Pengajuan">${formatDateTime(tx.requested_at)}</td>
                <td data-label="Peminjam & Divisi">
                    <strong style="color: #ffffff;">${tx.borrower_name}</strong><br>
                    <small style="color: var(--cyan);">${tx.borrower_department || 'Divisi'}</small>
                </td>
                <td data-label="Kartu e-Toll"><strong>${tx.cards?.label || '-'}</strong><br><small style="color: var(--text-muted);">${tx.cards?.card_identifier || ''}</small></td>
                <td data-label="Tanggal Pinjam">${formatDateOnly(tx.borrow_date)}</td>
                <td data-label="Keperluan">${tx.purpose}</td>
                <td data-label="Aksi Keputusan">
                    <div style="display: flex; gap: 0.35rem;">
                        <button class="btn btn-success btn-sm btn-action-approve-borrow" data-id="${tx.id}" data-name="${tx.borrower_name}" data-card="${tx.cards?.label || 'Kartu'}">Setujui</button>
                        <button class="btn btn-danger btn-sm btn-action-reject-borrow" data-id="${tx.id}" data-name="${tx.borrower_name}" data-card="${tx.cards?.label || 'Kartu'}">Tolak</button>
                    </div>
                </td>
            </tr>
        `).join('');

        adminBorrowsTbodyEl.querySelectorAll('.btn-action-approve-borrow').forEach(b => {
            b.addEventListener('click', () => openDecisionModal(b.dataset.id, 'approved', b.dataset.name, b.dataset.card, 'borrow'));
        });
        adminBorrowsTbodyEl.querySelectorAll('.btn-action-reject-borrow').forEach(b => {
            b.addEventListener('click', () => openDecisionModal(b.dataset.id, 'rejected', b.dataset.name, b.dataset.card, 'borrow'));
        });
    } catch (err) {
        adminBorrowsTbodyEl.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--danger);">Gagal memuat: ${err.message}</td></tr>`;
    }
}

async function refreshAdminReturns() {
    if (!adminReturnsTbodyEl) return;

    try {
        const list = await fetchPendingReturns();
        if (list.length === 0) {
            adminReturnsTbodyEl.innerHTML = '<tr><td colspan="9" style="text-align: center; color: var(--text-muted); font-style: italic;">Tidak ada pengembalian yang menunggu verifikasi.</td></tr>';
            return;
        }

        adminReturnsTbodyEl.innerHTML = list.map(ret => {
            const tx = ret.transactions;
            const card = tx?.cards;
            const sAwal = tx?.saldo_awal !== undefined ? tx.saldo_awal : 300000;
            const pemakaian = ret.pemakaian !== undefined ? ret.pemakaian : (tx?.pemakaian || 0);
            const topup = ret.topup_amount !== undefined ? ret.topup_amount : pemakaian;

            const receiptBtn = ret.receipt_storage_path ? 
                `<button type="button" class="btn btn-secondary btn-sm btn-view-receipt" data-path="${ret.receipt_storage_path}" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;">🧾 Lihat</button>` : 
                `<span style="color: var(--text-muted); font-size: 0.8rem;">-</span>`;

            return `
                <tr>
                    <td data-label="Waktu Pengajuan">${formatDateTime(ret.submitted_at)}</td>
                    <td data-label="Peminjam & Divisi">
                        <strong style="color: #ffffff;">${tx?.borrower_name || 'Karyawan'}</strong><br>
                        <small style="color: var(--cyan);">${tx?.borrower_department || 'Divisi'}</small>
                    </td>
                    <td data-label="Kartu e-Toll"><strong>${card?.label || '-'}</strong><br><small style="color: var(--text-muted);">${card?.card_identifier || ''}</small></td>
                    <td data-label="Saldo Awal"><span style="color: var(--cyan); font-weight: 600;">${formatRupiah(sAwal)}</span></td>
                    <td data-label="Pemakaian"><strong style="color: #f87171;">${formatRupiah(pemakaian)}</strong></td>
                    <td data-label="Saldo Top Up"><strong style="color: var(--cyan);">${formatRupiah(topup)}</strong></td>
                    <td data-label="Struk">${receiptBtn}</td>
                    <td data-label="Catatan Peminjam"><small style="color: var(--text-secondary);">${ret.return_notes || '-'}</small></td>
                    <td data-label="Aksi Verifikasi">
                        <div style="display: flex; gap: 0.35rem;">
                            <button class="btn btn-success btn-sm btn-action-approve-return" 
                                data-id="${ret.id}" 
                                data-name="${tx?.borrower_name || 'Karyawan'}" 
                                data-card="${card?.label || 'Kartu'}"
                                data-saldo-awal="${sAwal}"
                                data-pemakaian="${pemakaian}"
                                data-topup="${topup}">
                                Setujui
                            </button>
                            <button class="btn btn-danger btn-sm btn-action-reject-return" 
                                data-id="${ret.id}" 
                                data-name="${tx?.borrower_name || 'Karyawan'}" 
                                data-card="${card?.label || 'Kartu'}">
                                Tolak
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        // Event listener lihat struk
        adminReturnsTbodyEl.querySelectorAll('.btn-view-receipt').forEach(b => {
            b.addEventListener('click', async () => {
                const path = b.dataset.path;
                b.disabled = true;
                b.textContent = 'Memuat...';
                try {
                    const signedUrl = await getReceiptSignedUrl(path);
                    if (signedUrl) {
                        window.open(signedUrl, '_blank');
                    } else {
                        showAlert("Tidak dapat mengakses foto struk.", "warning");
                    }
                } catch (e) {
                    showAlert("Gagal membuka struk: " + e.message, "danger");
                } finally {
                    b.disabled = false;
                    b.textContent = '🧾 Lihat';
                }
            });
        });

        // Event listener setujui / tolak
        adminReturnsTbodyEl.querySelectorAll('.btn-action-approve-return').forEach(b => {
            b.addEventListener('click', () => {
                openDecisionModal(b.dataset.id, 'approved', b.dataset.name, b.dataset.card, 'return', {
                    saldoAwal: Number(b.dataset.saldoAwal),
                    pemakaian: Number(b.dataset.pemakaian),
                    topup: Number(b.dataset.topup)
                });
            });
        });
        adminReturnsTbodyEl.querySelectorAll('.btn-action-reject-return').forEach(b => {
            b.addEventListener('click', () => {
                openDecisionModal(b.dataset.id, 'rejected', b.dataset.name, b.dataset.card, 'return');
            });
        });
    } catch (err) {
        adminReturnsTbodyEl.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--danger);">Gagal memuat: ${err.message}</td></tr>`;
    }
}

// ==============================================================================
// TAB MASTER KARTU
// ==============================================================================

async function refreshAdminCards() {
    if (!adminCardsTbodyEl) return;

    try {
        const cards = await fetchAllCards();
        if (cards.length === 0) {
            adminCardsTbodyEl.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); font-style: italic;">Belum ada master kartu. Silakan tambah kartu pertama di atas.</td></tr>';
            return;
        }

        adminCardsTbodyEl.innerHTML = cards.map(c => `
            <tr>
                <td data-label="Label Kartu"><strong>${c.label}</strong></td>
                <td data-label="Nomor Fisik">${c.card_identifier}</td>
                <td data-label="Status">${renderStatusBadge(c.status)}</td>
                <td data-label="Token QR"><code style="font-size: 0.8rem; background: rgba(15, 23, 42, 0.8); color: var(--cyan); padding: 3px 6px; border-radius: 4px; border: 1px solid var(--border-subtle);">${c.qr_token}</code></td>
                <td data-label="Aksi">
                    <div style="display: flex; gap: 0.35rem;">
                        <button class="btn btn-secondary btn-sm btn-view-qr" data-label="${c.label}" data-num="${c.card_identifier}" data-token="${c.qr_token}">📱 QR Kartu</button>
                        ${c.status === 'inactive' ? 
                            `<button class="btn btn-success btn-sm btn-toggle-card-status" data-id="${c.id}" data-status="available">Aktifkan</button>` :
                            (c.status === 'available' ? `<button class="btn btn-secondary btn-sm btn-toggle-card-status" data-id="${c.id}" data-status="inactive">Nonaktifkan</button>` : '')
                        }
                    </div>
                </td>
            </tr>
        `).join('');

        adminCardsTbodyEl.querySelectorAll('.btn-view-qr').forEach(b => {
            b.addEventListener('click', () => showQrModal(b.dataset.label, b.dataset.num, b.dataset.token));
        });

        adminCardsTbodyEl.querySelectorAll('.btn-toggle-card-status').forEach(b => {
            b.addEventListener('click', async () => {
                try {
                    await updateCardStatus(b.dataset.id, b.dataset.status);
                    showAlert("Status kartu diperbarui.", "success");
                    await refreshAdminCards();
                    await refreshAdminDashboard();
                    await refreshPublicMonitoring();
                } catch (err) {
                    showAlert(err.message, "danger");
                }
            });
        });
    } catch (err) {
        adminCardsTbodyEl.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--danger);">Gagal memuat: ${err.message}</td></tr>`;
    }
}

// ==============================================================================
// TAB RIWAYAT TRANSAKSI LENGKAP
// ==============================================================================

async function refreshAdminHistory() {
    if (!adminHistoryTbodyEl) return;

    try {
        allHistoryCache = await fetchAllTransactionHistory();
        renderFilteredHistory();
    } catch (err) {
        adminHistoryTbodyEl.innerHTML = `<tr><td colspan="10" style="text-align: center; color: var(--danger);">Gagal memuat riwayat: ${err.message}</td></tr>`;
    }
}

function renderFilteredHistory() {
    if (!adminHistoryTbodyEl) return;

    const searchTerm = (inputHistorySearchEl?.value || '').toLowerCase().trim();
    const statusFilter = selectHistoryStatusEl?.value || 'all';
    const today = new Date();

    let filtered = allHistoryCache.filter(tx => {
        const matchSearch = 
            (tx.borrower_name || '').toLowerCase().includes(searchTerm) ||
            (tx.borrower_department || '').toLowerCase().includes(searchTerm) ||
            (tx.cards?.label || '').toLowerCase().includes(searchTerm) ||
            (tx.purpose || '').toLowerCase().includes(searchTerm);

        if (!matchSearch) return false;

        if (statusFilter === 'all') return true;

        if (statusFilter === 'overdue') {
            if (tx.status !== 'borrowed') return false;
            const bDate = new Date(tx.borrow_date || tx.requested_at);
            const diffDays = Math.floor((today - bDate) / (1000 * 60 * 60 * 24));
            return diffDays > 3;
        }

        return tx.status === statusFilter;
    });

    // Hitung Total Pemakaian & Top Up
    let totalUsage = 0;
    let totalTopup = 0;
    let completedCount = 0;

    allHistoryCache.forEach(tx => {
        if (tx.status === 'completed') {
            totalUsage += Number(tx.pemakaian || 0);
            totalTopup += Number(tx.saldo_topup || 0);
            completedCount++;
        }
    });

    if (historyTotalUsageEl) historyTotalUsageEl.textContent = formatRupiah(totalUsage);
    if (historyTotalTopupEl) historyTotalTopupEl.textContent = formatRupiah(totalTopup);
    if (historyTotalCountEl) historyTotalCountEl.textContent = completedCount;

    if (filtered.length === 0) {
        adminHistoryTbodyEl.innerHTML = '<tr><td colspan="10" style="text-align: center; color: var(--text-muted); font-style: italic;">Tidak ada data transaksi yang cocok dengan filter.</td></tr>';
        return;
    }

    adminHistoryTbodyEl.innerHTML = filtered.map(tx => {
        const ret = tx.returns?.[0];
        const isBorrowed = tx.status === 'borrowed';
        let isOverdue = false;
        let diffDays = 0;

        if (isBorrowed) {
            const bDate = new Date(tx.borrow_date || tx.requested_at);
            diffDays = Math.floor((today - bDate) / (1000 * 60 * 60 * 24));
            if (diffDays > 3) isOverdue = true;
        }

        const saldoAwal = tx.saldo_awal !== undefined && tx.saldo_awal !== null ? tx.saldo_awal : 300000;
        const pemakaian = tx.pemakaian !== undefined && tx.pemakaian !== null ? tx.pemakaian : (ret?.pemakaian || 0);
        const topup = tx.saldo_topup !== undefined && tx.saldo_topup !== null ? tx.saldo_topup : (ret?.topup_amount || 0);
        const saldoAkhir = tx.saldo_akhir !== undefined && tx.saldo_akhir !== null ? tx.saldo_akhir : (saldoAwal - pemakaian + topup);

        const correctionBadge = (tx.is_corrected || ret?.is_corrected) ? 
            `<br><span class="status-badge" style="background: rgba(245, 158, 11, 0.2); color: #fbbf24; font-size: 0.7rem; padding: 1px 5px; margin-top: 2px; display: inline-block;">Dikoreksi Admin</span>` : '';

        return `
            <tr>
                <td data-label="Waktu & Tanggal Pinjam">
                    <strong style="color: #ffffff;">${formatDateOnly(tx.borrow_date)}</strong><br>
                    <small style="color: var(--text-muted);">${formatDateTime(tx.requested_at)}</small>
                </td>
                <td data-label="Peminjam & Divisi">
                    <strong style="color: #ffffff;">${tx.borrower_name}</strong><br>
                    <small style="color: var(--cyan);">${tx.borrower_department || 'Divisi'}</small>
                </td>
                <td data-label="Kartu e-Toll">
                    <strong>${tx.cards?.label || '-'}</strong><br>
                    <small style="color: var(--text-muted);">${tx.cards?.card_identifier || ''}</small>
                </td>
                <td data-label="Keperluan">${tx.purpose}</td>
                <td data-label="Saldo Awal"><span style="color: var(--cyan); font-weight: 600;">${formatRupiah(saldoAwal)}</span></td>
                <td data-label="Pemakaian"><strong style="color: #f87171;">${formatRupiah(pemakaian)}</strong></td>
                <td data-label="Saldo Top Up">
                    <strong style="color: var(--cyan);">${formatRupiah(topup)}</strong>
                    ${correctionBadge}
                </td>
                <td data-label="Saldo Akhir"><strong style="color: #34d399;">${formatRupiah(saldoAkhir)}</strong></td>
                <td data-label="Status">${renderStatusBadge(tx.status, isOverdue, diffDays)}</td>
                <td data-label="Catatan Admin"><small style="color: var(--text-secondary);">${tx.decision_note || ret?.review_note || '-'}</small></td>
            </tr>
        `;
    }).join('');
}

function exportHistoryToCSV() {
    if (!allHistoryCache || allHistoryCache.length === 0) {
        showAlert("Tidak ada data riwayat untuk diekspor.", "warning");
        return;
    }

    const headers = [
        "ID Transaksi",
        "Tanggal Pinjam",
        "Waktu Pengajuan",
        "Nama Peminjam",
        "Bagian / Divisi",
        "Kartu e-Toll",
        "Nomor Fisik Kartu",
        "Keperluan",
        "Status Transaksi",
        "Saldo Awal (Rp)",
        "Pemakaian (Rp)",
        "Saldo Top Up (Rp)",
        "Saldo Akhir (Rp)",
        "Status Koreksi",
        "Tanggal Pengembalian",
        "Catatan Pengembalian",
        "Catatan Admin"
    ];

    let totalPemakaian = 0;
    let totalTopup = 0;

    const rows = allHistoryCache.map(tx => {
        const ret = tx.returns?.[0];
        const saldoAwal = tx.saldo_awal !== undefined && tx.saldo_awal !== null ? tx.saldo_awal : 300000;
        const pemakaian = tx.pemakaian !== undefined && tx.pemakaian !== null ? tx.pemakaian : (ret?.pemakaian || 0);
        const topup = tx.saldo_topup !== undefined && tx.saldo_topup !== null ? tx.saldo_topup : (ret?.topup_amount || 0);
        const saldoAkhir = tx.saldo_akhir !== undefined && tx.saldo_akhir !== null ? tx.saldo_akhir : (saldoAwal - pemakaian + topup);

        if (tx.status === 'completed') {
            totalPemakaian += Number(pemakaian);
            totalTopup += Number(topup);
        }

        const isCorrected = (tx.is_corrected || ret?.is_corrected) ? 'Dikoreksi admin' : 'Sesuai pemakaian';

        return [
            `"${tx.id}"`,
            `"${formatDateOnly(tx.borrow_date)}"`,
            `"${formatDateTime(tx.requested_at)}"`,
            `"${(tx.borrower_name || '').replace(/"/g, '""')}"`,
            `"${(tx.borrower_department || '').replace(/"/g, '""')}"`,
            `"${(tx.cards?.label || '').replace(/"/g, '""')}"`,
            `"${(tx.cards?.card_identifier || '').replace(/"/g, '""')}"`,
            `"${(tx.purpose || '').replace(/"/g, '""')}"`,
            `"${tx.status}"`,
            `"${formatRupiah(saldoAwal)}"`,
            `"${formatRupiah(pemakaian)}"`,
            `"${formatRupiah(topup)}"`,
            `"${formatRupiah(saldoAkhir)}"`,
            `"${isCorrected}"`,
            `"${ret ? formatDateOnly(ret.topup_date) : '-'}"`,
            `"${(ret?.return_notes || '').replace(/"/g, '""')}"`,
            `"${(tx.decision_note || ret?.review_note || '').replace(/"/g, '""')}"`
        ];
    });

    // Baris Total Ringkasan
    const summaryRow = [
        `"TOTAL RINGKASAN"`,
        `""`,
        `""`,
        `""`,
        `""`,
        `""`,
        `""`,
        `""`,
        `"Selesai"`,
        `""`,
        `"${formatRupiah(totalPemakaian)}"`,
        `"${formatRupiah(totalTopup)}"`,
        `""`,
        `""`,
        `""`,
        `""`,
        `""`
    ];

    const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(e => e.join(',')), summaryRow.join(',')].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `NID-Gatecard_Riwayat_Transaksi_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showAlert("File CSV Riwayat Transaksi berhasil diunduh!", "success");
}

// ==============================================================================
// MODAL POPUP (QR KARTU, QR MONITORING, KEPUTUSAN ADMIN)
// ==============================================================================

function renderQrCode(element, text, size = 220) {
    element.innerHTML = '';
    if (window.QRCode) {
        new window.QRCode(element, {
            text: text,
            width: size,
            height: size,
            colorDark: "#080c16",
            colorLight: "#ffffff",
            correctLevel: window.QRCode.CorrectLevel.H
        });
    } else {
        element.innerHTML = `<p style="color: var(--danger);">Pustaka QRCode belum termuat.</p>`;
    }
}

function showQrModal(label, identifier, token) {
    currentQrTokenForModal = token;
    modalQrTitleEl.textContent = label;
    modalQrSubtitleEl.textContent = `Nomor Fisik: ${identifier}`;
    modalQrTokenTextEl.textContent = `KODE: ${token}`;

    let savedBaseUrl = localStorage.getItem('etoll_qr_base_url');
    if (!savedBaseUrl) {
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            savedBaseUrl = 'http://192.168.1.8:3000';
        } else {
            const cleanPath = window.location.pathname.replace(/\/[^\/]*\.html$/, '').replace(/\/$/, '');
            savedBaseUrl = window.location.origin + cleanPath;
        }
    }

    if (qrBaseUrlInputEl) {
        qrBaseUrlInputEl.value = savedBaseUrl;
    }

    const appUrl = `${savedBaseUrl.replace(/\/$/, '')}/?card=${encodeURIComponent(token)}`;
    renderQrCode(modalQrCanvasWrapperEl, appUrl);
    modalQrEl.classList.remove('hidden');
}

function showDeskQrModal() {
    let savedBaseUrl = localStorage.getItem('etoll_qr_base_url');
    if (!savedBaseUrl) {
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            savedBaseUrl = 'http://192.168.1.8:3000';
        } else {
            const cleanPath = window.location.pathname.replace(/\/[^\/]*\.html$/, '').replace(/\/$/, '');
            savedBaseUrl = window.location.origin + cleanPath;
        }
    }

    const deskUrl = savedBaseUrl.replace(/\/$/, '') + '/';
    deskQrUrlTextEl.textContent = deskUrl;
    renderQrCode(deskQrCanvasWrapperEl, deskUrl, 250);
    modalDeskQrEl.classList.remove('hidden');
}

function openDecisionModal(targetId, actionType, borrowerName, cardLabel, category = 'borrow', extraData = null) {
    decisionTxIdEl.value = targetId;
    decisionActionTypeEl.value = actionType;
    decisionTargetCategory = category;
    decisionNoteEl.value = '';

    if (category === 'borrow') {
        if (decisionCorrectionBoxEl) decisionCorrectionBoxEl.classList.add('hidden');
        if (actionType === 'approved') {
            modalDecisionTitleEl.textContent = 'Setujui Permohonan Peminjaman';
            modalDecisionDescEl.textContent = `Anda akan menyetujui peminjaman kartu "${cardLabel}" untuk ${borrowerName}.`;
            labelDecisionNoteEl.textContent = 'Catatan Persetujuan (Opsional):';
            decisionNoteEl.required = false;
            decisionNoteEl.placeholder = 'Contoh: Disetujui untuk dinas operasional';
        } else {
            modalDecisionTitleEl.textContent = 'Tolak Permohonan Peminjaman';
            modalDecisionDescEl.textContent = `Anda akan menolak permohonan peminjaman kartu "${cardLabel}" dari ${borrowerName}.`;
            labelDecisionNoteEl.textContent = 'Alasan Penolakan (Wajib Diisi):';
            decisionNoteEl.required = true;
            decisionNoteEl.placeholder = 'Contoh: Kartu sedang dipersiapkan untuk dinas pimpinan';
        }
    } else {
        // Kategori Pengembalian
        if (actionType === 'approved') {
            modalDecisionTitleEl.textContent = 'Setujui Verifikasi Pengembalian';
            modalDecisionDescEl.textContent = `Verifikasi pengembalian kartu "${cardLabel}" dari ${borrowerName}.`;

            if (extraData && decisionCorrectionBoxEl) {
                decisionCorrectionBoxEl.classList.remove('hidden');
                currentDecisionPemakaian = Number(extraData.pemakaian || 0);
                currentDecisionSaldoAwal = Number(extraData.saldoAwal || 300000);

                if (decisionPemakaianTextEl) decisionPemakaianTextEl.textContent = formatRupiah(currentDecisionPemakaian);
                if (decisionSaldoAwalTextEl) decisionSaldoAwalTextEl.textContent = formatRupiah(currentDecisionSaldoAwal);
                if (decisionCorrectedTopupEl) decisionCorrectedTopupEl.value = extraData.topup !== undefined ? extraData.topup : currentDecisionPemakaian;
            }

            labelDecisionNoteEl.textContent = 'Catatan Admin:';
            decisionNoteEl.required = false;
            decisionNoteEl.placeholder = 'Tambahkan catatan jika diperlukan...';
        } else {
            if (decisionCorrectionBoxEl) decisionCorrectionBoxEl.classList.add('hidden');
            modalDecisionTitleEl.textContent = 'Tolak Verifikasi Pengembalian';
            modalDecisionDescEl.textContent = `Anda akan menolak pengembalian kartu "${cardLabel}" dari ${borrowerName}. Kartu tetap berstatus dipinjam.`;
            labelDecisionNoteEl.textContent = 'Alasan Penolakan (Wajib Diisi):';
            decisionNoteEl.required = true;
            decisionNoteEl.placeholder = 'Contoh: Fisik kartu belum diserahkan';
        }
    }

    modalDecisionEl.classList.remove('hidden');
}

// ==============================================================================
// INISIALISASI & EVENT LISTENERS
// ==============================================================================

async function initApp() {
    if (!isConfigured()) {
        showAlert("Konfigurasi Supabase belum lengkap di js/config.js.", "warning");
        return;
    }

    initSupabase();

    // 1. Modal Admin Login
    if (btnOpenAdminLoginEl) {
        btnOpenAdminLoginEl.addEventListener('click', () => {
            modalAdminLoginEl.classList.remove('hidden');
            loginEmailEl.focus();
        });
    }

    if (btnCloseAdminLoginEl) {
        btnCloseAdminLoginEl.addEventListener('click', () => {
            modalAdminLoginEl.classList.add('hidden');
        });
    }

    if (formAdminLoginEl) {
        formAdminLoginEl.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = loginEmailEl.value;
            const password = loginPasswordEl.value;

            btnSubmitAdminLoginEl.disabled = true;
            btnSubmitAdminLoginEl.textContent = 'Memverifikasi...';

            try {
                await loginUser(email, password);
                showAlert("Berhasil masuk sebagai Admin Utama!", "success");
                modalAdminLoginEl.classList.add('hidden');
                formAdminLoginEl.reset();
            } catch (err) {
                showAlert("Gagal login: " + err.message, "danger");
            } finally {
                btnSubmitAdminLoginEl.disabled = false;
                btnSubmitAdminLoginEl.textContent = 'Masuk';
            }
        });
    }

    // 2. Logout Admin
    if (btnLogoutEl) {
        btnLogoutEl.addEventListener('click', async () => {
            try {
                await logoutUser();
                showAlert("Admin telah keluar dari sistem.", "info");
                updateUIForUser(null);
            } catch (err) {
                showAlert("Gagal keluar: " + err.message, "danger");
            }
        });
    }

    // 3. Tab Admin & Sub-tab Setup
    setupAdminTabs();
    setupVerificationSubtabs();

    // 4. Monitoring Publik (Cetak QR Monitoring & Refresh)
    if (btnRefreshMonitoringEl) {
        btnRefreshMonitoringEl.addEventListener('click', refreshPublicMonitoring);
    }

    if (btnOpenDeskQrModalEl) {
        btnOpenDeskQrModalEl.addEventListener('click', showDeskQrModal);
    }

    if (btnCloseDeskQrEl) {
        btnCloseDeskQrEl.addEventListener('click', () => modalDeskQrEl.classList.add('hidden'));
    }

    if (btnPrintDeskQrEl) {
        btnPrintDeskQrEl.addEventListener('click', () => window.print());
    }

    // 5. Scanner QR Kamera
    btnStartCameraEl.addEventListener('click', async () => {
        qrReaderEl.classList.remove('hidden');
        btnStartCameraEl.classList.add('hidden');
        btnStopCameraEl.classList.remove('hidden');

        try {
            await startScanner(
                'qr-reader',
                (token) => {
                    btnStartCameraEl.classList.remove('hidden');
                    btnStopCameraEl.classList.add('hidden');
                    qrReaderEl.classList.add('hidden');
                    inputManualTokenEl.value = token;
                    handleIdentifyCard(token);
                },
                (err) => {
                    showAlert("Tidak dapat mengakses kamera: " + err.message, "warning");
                    btnStartCameraEl.classList.remove('hidden');
                    btnStopCameraEl.classList.add('hidden');
                    qrReaderEl.classList.add('hidden');
                }
            );
        } catch (err) {
            showAlert(err.message, "danger");
        }
    });

    btnStopCameraEl.addEventListener('click', async () => {
        await stopScanner();
        btnStartCameraEl.classList.remove('hidden');
        btnStopCameraEl.classList.add('hidden');
        qrReaderEl.classList.add('hidden');
    });

    // 6. Cek Token Manual
    btnCheckManualTokenEl.addEventListener('click', () => {
        const token = inputManualTokenEl.value.trim();
        handleIdentifyCard(token);
    });

    // 7. Muat Master Divisi ke Form Pinjam
    try {
        const depts = await fetchDepartments();
        if (borrowDepartmentEl && depts && depts.length > 0) {
            const currentSelected = borrowDepartmentEl.value;
            borrowDepartmentEl.innerHTML = '<option value="">-- Pilih Bagian / Divisi --</option>' + 
                depts.map(d => `<option value="${d}">${d}</option>`).join('');
            if (currentSelected) borrowDepartmentEl.value = currentSelected;
        }
    } catch (e) {
        console.warn("Gagal memuat daftar divisi:", e);
    }

    // 8. Form Peminjaman Cepat (Tanpa Nomor HP, Dilindungi Honeypot)
    formGuestBorrowEl.addEventListener('submit', async (e) => {
        e.preventDefault();
        const cardId = borrowCardIdEl.value || currentIdentifiedCard?.id;
        const borrowerName = (borrowBorrowerNameEl.value || '').trim();
        const borrowerDepartment = (borrowDepartmentEl.value || '').trim();
        const borrowDate = borrowDateEl.value || new Date().toISOString().split('T')[0];
        const purpose = (borrowPurposeEl.value || '').trim();
        const honeypotVal = document.getElementById('borrow-honeypot')?.value || null;

        if (!cardId) {
            showAlert("Kartu e-Toll belum teridentifikasi. Silakan scan ulang QR Code atau masukkan kode token kartu.", "danger");
            return;
        }

        btnSubmitBorrowEl.disabled = true;
        btnSubmitBorrowEl.textContent = 'Mengirim Permohonan...';

        try {
            await submitGuestBorrow({
                cardId,
                borrowerName,
                borrowerDepartment,
                purpose,
                borrowDate,
                honeypot: honeypotVal
            });

            showAlert(`Permohonan peminjaman atas nama ${borrowerName} (${borrowerDepartment}) berhasil diajukan! Menunggu persetujuan Admin.`, "success", 7000);
            
            formGuestBorrowEl.reset();
            cardIdentifiedBoxEl.classList.add('hidden');
            inputManualTokenEl.value = '';
            currentIdentifiedCard = null;
            await refreshPublicMonitoring();
        } catch (err) {
            console.error("Gagal mengajukan peminjaman:", err);
            showAlert("Gagal mengajukan peminjaman: " + err.message, "danger", 8000);
        } finally {
            btnSubmitBorrowEl.disabled = false;
            btnSubmitBorrowEl.textContent = '🚀 Ajukan Peminjaman Kartu';
        }
    });

    // 9. Input Pemakaian Saldo & Auto-Top Up di Form Pengembalian
    if (inputUsageAmountEl) {
        inputUsageAmountEl.addEventListener('input', (e) => {
            const rawVal = e.target.value;
            const valNum = Number(rawVal);

            if (!rawVal || isNaN(valNum) || valNum < 0) {
                usageAmountFormattedEl.textContent = 'Rp 0';
                usageAmountFormattedEl.style.color = '#f87171';
                inputTopupAmountEl.value = '';
                topupAmountFormattedEl.textContent = 'Otomatis = Pemakaian';
                return;
            }

            if (valNum > currentActiveCardSaldoAwal) {
                usageAmountFormattedEl.innerHTML = `${formatRupiah(valNum)} <span style="font-size: 0.75rem;">(⚠️ Melebihi Saldo Awal!)</span>`;
                usageAmountFormattedEl.style.color = '#ef4444';
            } else {
                usageAmountFormattedEl.textContent = formatRupiah(valNum);
                usageAmountFormattedEl.style.color = '#f87171';
            }

            // Saldo Top Up otomatis = Pemakaian
            inputTopupAmountEl.value = valNum;
            topupAmountFormattedEl.textContent = `Otomatis = ${formatRupiah(valNum)}`;
        });
    }

    // 10. Form Pengembalian Cepat (Dengan Skema Saldo & Upload Struk Opsional)
    formGuestReturnEl.addEventListener('submit', async (e) => {
        e.preventDefault();
        const cardId = returnCardIdEl.value;
        const usageVal = Number(inputUsageAmountEl.value);
        const returnNotes = inputReturnNotesEl.value;
        const returnDate = inputReturnDateEl.value;
        const receiptFile = inputReceiptFileEl?.files?.[0] || null;

        if (isNaN(usageVal) || usageVal < 0) {
            showAlert("Nominal pemakaian wajib diisi angka minimal 0.", "danger");
            return;
        }

        if (usageVal > currentActiveCardSaldoAwal) {
            showAlert(`Nominal pemakaian (${formatRupiah(usageVal)}) tidak boleh melebihi Saldo Awal kartu (${formatRupiah(currentActiveCardSaldoAwal)}).`, "danger");
            return;
        }

        // Validasi struk jika ada
        if (receiptFile) {
            if (receiptFile.size > 2 * 1024 * 1024) {
                showAlert("Ukuran file struk tidak boleh melebihi 2 MB.", "danger");
                return;
            }
            if (!receiptFile.type.startsWith('image/')) {
                showAlert("File struk harus berupa format gambar (JPG, PNG, WEBP).", "danger");
                return;
            }
        }

        btnSubmitReturnEl.disabled = true;
        btnSubmitReturnEl.textContent = 'Memproses Pengembalian...';

        try {
            await submitGuestReturn({
                cardId,
                usageAmount: usageVal,
                returnNotes,
                returnDate,
                receiptFile
            });

            showAlert("Pengembalian kartu berhasil dikirim! Menunggu verifikasi Admin Utama.", "success", 7000);

            formGuestReturnEl.reset();
            cardIdentifiedBoxEl.classList.add('hidden');
            inputManualTokenEl.value = '';
            usageAmountFormattedEl.textContent = 'Rp 0';
            topupAmountFormattedEl.textContent = 'Otomatis = Pemakaian';
            await refreshPublicMonitoring();
        } catch (err) {
            showAlert("Gagal mengirim pengembalian: " + err.message, "danger", 8000);
        } finally {
            btnSubmitReturnEl.disabled = false;
            btnSubmitReturnEl.textContent = '🔄 Kembalikan Kartu e-Toll';
        }
    });

    // 11. Admin Tambah Kartu Baru
    if (formCreateCardEl) {
        formCreateCardEl.addEventListener('submit', async (e) => {
            e.preventDefault();
            const label = newCardLabelEl.value;
            const identifier = newCardIdentifierEl.value;

            const btnSave = document.getElementById('btn-submit-create-card');
            btnSave.disabled = true;
            btnSave.textContent = 'Menyimpan...';

            try {
                await createCard(label, identifier);
                showAlert(`Kartu "${label}" berhasil ditambahkan!`, "success");
                newCardLabelEl.value = '';
                newCardIdentifierEl.value = '';
                await refreshAdminCards();
                await refreshAdminDashboard();
                await refreshPublicMonitoring();
            } catch (err) {
                showAlert(err.message, "danger");
            } finally {
                btnSave.disabled = false;
                btnSave.textContent = 'Simpan Kartu';
            }
        });
    }

    // 12. Admin Refresh Buttons
    if (btnRefreshAdminDashboardEl) btnRefreshAdminDashboardEl.addEventListener('click', refreshAdminDashboard);
    if (btnRefreshAdminCardsEl) btnRefreshAdminCardsEl.addEventListener('click', refreshAdminCards);
    if (btnRefreshAdminHistoryEl) btnRefreshAdminHistoryEl.addEventListener('click', refreshAdminHistory);

    // 13. Search & Filter Riwayat Transaksi
    if (inputHistorySearchEl) {
        inputHistorySearchEl.addEventListener('input', renderFilteredHistory);
    }
    if (selectHistoryStatusEl) {
        selectHistoryStatusEl.addEventListener('change', renderFilteredHistory);
    }
    if (btnExportHistoryCsvEl) {
        btnExportHistoryCsvEl.addEventListener('click', exportHistoryToCSV);
    }

    // 14. Modal QR Code Kartu
    btnCloseQrModalEl.addEventListener('click', () => modalQrEl.classList.add('hidden'));
    btnPrintQrEl.addEventListener('click', () => window.print());
    if (btnUpdateQrUrlEl && qrBaseUrlInputEl) {
        btnUpdateQrUrlEl.addEventListener('click', () => {
            const customUrl = qrBaseUrlInputEl.value.trim();
            if (customUrl) {
                localStorage.setItem('etoll_qr_base_url', customUrl);
                const appUrl = `${customUrl.replace(/\/$/, '')}/?card=${encodeURIComponent(currentQrTokenForModal)}`;
                renderQrCode(modalQrCanvasWrapperEl, appUrl);
                showAlert("QR Code diperbarui dengan URL: " + customUrl, "info");
            }
        });
    }

    // 15. Realtime listener koreksi saldo top up di modal keputusan
    if (decisionCorrectedTopupEl) {
        decisionCorrectedTopupEl.addEventListener('input', (e) => {
            const corrected = Number(e.target.value);
            if (!isNaN(corrected) && corrected !== currentDecisionPemakaian) {
                decisionNoteEl.required = true;
                decisionNoteEl.placeholder = 'Wajib: Jelaskan alasan koreksi saldo top up fisik...';
                if (decisionCorrectionNoteHintEl) {
                    decisionCorrectionNoteHintEl.style.color = '#ef4444';
                    decisionCorrectionNoteHintEl.style.fontWeight = '700';
                }
            } else {
                decisionNoteEl.required = false;
                decisionNoteEl.placeholder = 'Tambahkan catatan jika diperlukan...';
                if (decisionCorrectionNoteHintEl) {
                    decisionCorrectionNoteHintEl.style.color = 'var(--warning)';
                    decisionCorrectionNoteHintEl.style.fontWeight = 'normal';
                }
            }
        });
    }

    // 16. Modal Keputusan Admin Submit (Approve / Reject)
    btnCancelDecisionEl.addEventListener('click', () => modalDecisionEl.classList.add('hidden'));
    formDecisionEl.addEventListener('submit', async (e) => {
        e.preventDefault();
        const targetId = decisionTxIdEl.value;
        const actionType = decisionActionTypeEl.value;
        const note = decisionNoteEl.value;

        const btnConfirm = document.getElementById('btn-confirm-decision');
        btnConfirm.disabled = true;
        btnConfirm.textContent = 'Memproses...';

        try {
            if (decisionTargetCategory === 'borrow') {
                await decideBorrow(targetId, actionType, note);
                showAlert(`Permohonan peminjaman berhasil ${actionType === 'approved' ? 'disetujui' : 'ditolak'}.`, "success");
                await refreshAdminBorrows();
            } else {
                let correctedVal = null;
                if (actionType === 'approved' && decisionCorrectedTopupEl) {
                    const rawCorrected = decisionCorrectedTopupEl.value;
                    if (rawCorrected !== '') {
                        correctedVal = Number(rawCorrected);
                        if (correctedVal !== currentDecisionPemakaian && (!note || !note.trim())) {
                            showAlert("Catatan Admin WAJIB diisi jika nominal top up dikoreksi berbeda dari pemakaian!", "danger");
                            btnConfirm.disabled = false;
                            btnConfirm.textContent = 'Konfirmasi';
                            decisionNoteEl.focus();
                            return;
                        }
                    }
                }

                await decideReturn(targetId, actionType, note, correctedVal);
                showAlert(`Verifikasi pengembalian berhasil ${actionType === 'approved' ? 'disetujui' : 'ditolak'}.`, "success");
                await refreshAdminReturns();
            }

            modalDecisionEl.classList.add('hidden');
            await refreshAdminDashboard();
            await refreshAdminCards();
            await refreshAdminHistory();
            await refreshPublicMonitoring();
        } catch (err) {
            showAlert("Gagal memproses keputusan: " + err.message, "danger");
        } finally {
            btnConfirm.disabled = false;
            btnConfirm.textContent = 'Konfirmasi';
        }
    });

    // 17. Cek Parameter URL (?card=TOKEN) saat scan otomatis
    const urlParams = new URLSearchParams(window.location.search);
    const cardParam = urlParams.get('card');

    // 18. Inisialisasi Sesi Admin Awal & Monitoring Publik
    await refreshPublicMonitoring();

    try {
        const session = await getCurrentSession();
        if (session && session.user) {
            const profile = await getUserProfile(session.user.id);
            await updateUIForUser(profile);
        } else {
            await updateUIForUser(null);
        }

        if (cardParam) {
            const cleanToken = cardParam.trim().toUpperCase();
            if (currentUserProfile && currentUserProfile.role === 'admin') {
                const kioskTab = adminNavEl?.querySelector('[data-tab="tab-kiosk-view"]');
                if (kioskTab) {
                    kioskTab.click();
                } else {
                    adminViewEl.classList.add('hidden');
                    kioskSectionEl.classList.remove('hidden');
                }
            }
            inputManualTokenEl.value = cleanToken;
            await handleIdentifyCard(cleanToken);
        }
    } catch (err) {
        console.error("Gagal memeriksa sesi awal:", err);
        await updateUIForUser(null);
    }

    // 19. Real-time Auth Subscription
    subscribeAuthChange(async (event, session, profile) => {
        if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
            await updateUIForUser(profile);
        } else if (event === 'SIGNED_OUT') {
            await updateUIForUser(null);
        }
    });

    // 20. Public Polling Fallback (setiap 30 detik jika tidak sedang login admin)
    setInterval(() => {
        if (!currentUserProfile || currentUserProfile.role !== 'admin') {
            refreshPublicMonitoring();
        }
    }, 30000);
}

window.addEventListener('DOMContentLoaded', initApp);
