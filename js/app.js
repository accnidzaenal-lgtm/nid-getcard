// ==============================================================================
// NID-GATECARD - PENGATUR ALUR APLIKASI UTAMA (app.js)
// ==============================================================================
import { isConfigured } from './config.js';
import { initSupabase } from './supabaseClient.js';
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
    getActiveBorrowInfoByCardId, 
    submitGuestReturn 
} from './return.js';
import { 
    fetchDashboardStats, 
    fetchPendingBorrows, 
    decideBorrow, 
    fetchPendingReturns, 
    decideReturn, 
    fetchAllTransactionHistory 
} from './admin.js';

// Status Global Aplikasi
let currentUserProfile = null;
let currentIdentifiedCard = null;
let decisionTargetCategory = 'borrow'; // 'borrow' atau 'return'
let allHistoryCache = [];

// Elemen DOM Header & Auth
const guestHeaderActionEl = document.getElementById('guest-header-action');
const btnOpenAdminLoginEl = document.getElementById('btn-open-admin-login');
const authHeaderInfoEl = document.getElementById('auth-header-info');
const userDisplayNameEl = document.getElementById('user-display-name');
const btnLogoutEl = document.getElementById('btn-logout');
const adminNavEl = document.getElementById('admin-nav');
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

// Form Kembali Cepat (Guest - Tanpa Struk)
const formGuestReturnEl = document.getElementById('form-guest-return');
const returnCardIdEl = document.getElementById('return-card-id');
const returnBorrowerInfoEl = document.getElementById('return-borrower-info');
const returnPurposeInfoEl = document.getElementById('return-purpose-info');
const returnOverdueAlertEl = document.getElementById('return-overdue-alert');
const returnOverdueTextEl = document.getElementById('return-overdue-text');
const inputReturnDateEl = document.getElementById('input-return-date');
const inputTopupAmountEl = document.getElementById('input-topup-amount');
const topupAmountFormattedEl = document.getElementById('topup-amount-formatted');
const inputReturnNotesEl = document.getElementById('input-return-notes');
const btnSubmitReturnEl = document.getElementById('btn-submit-return');
const cardStatusInfoBoxEl = document.getElementById('card-status-info-box');

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
const btnRefreshAdminDashboardEl = document.getElementById('btn-refresh-admin-dashboard');

const adminBorrowsTbodyEl = document.getElementById('admin-borrows-tbody');
const btnRefreshAdminBorrowsEl = document.getElementById('btn-refresh-admin-borrows');

const adminReturnsTbodyEl = document.getElementById('admin-returns-tbody');
const btnRefreshAdminReturnsEl = document.getElementById('btn-refresh-admin-returns');

const formCreateCardEl = document.getElementById('form-create-card');
const newCardLabelEl = document.getElementById('new-card-label');
const newCardIdentifierEl = document.getElementById('new-card-identifier');
const adminCardsTbodyEl = document.getElementById('admin-cards-tbody');
const btnRefreshAdminCardsEl = document.getElementById('btn-refresh-admin-cards');

// Elemen Tab Riwayat Peminjaman & Pengembalian (Baru)
const adminHistoryTbodyEl = document.getElementById('admin-history-tbody');
const btnRefreshAdminHistoryEl = document.getElementById('btn-refresh-admin-history');
const btnExportHistoryCsvEl = document.getElementById('btn-export-history-csv');
const inputHistorySearchEl = document.getElementById('input-history-search');
const selectHistoryStatusEl = document.getElementById('select-history-status');

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

// Modal QR Meja (Monitoring Karyawan)
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
}

/**
 * Tab switcher untuk Admin
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
            if (targetTabId === 'tab-admin-borrows') refreshAdminBorrows();
            if (targetTabId === 'tab-admin-returns') refreshAdminReturns();
            if (targetTabId === 'tab-admin-cards') refreshAdminCards();
            if (targetTabId === 'tab-admin-history') refreshAdminHistory();
        });
    });
}

// ==============================================================================
// MONITORING KETERSEDIAAN KARTU PUBLIK (UNTUK MEJA)
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
                actionBtn = `<button class="btn btn-primary btn-sm btn-quick-select-card" data-token="${c.qr_token}" style="margin-top: 0.5rem; width: 100%;">🚀 Pinjam Kartu Ini</button>`;
            } else if (c.status === 'borrowed') {
                if (c.isOverdue) {
                    cardClass += ' overdue';
                    statusText = `<span class="status-badge status-overdue">⚠️ Telat (${c.diffDays} Hari)</span>`;
                } else {
                    cardClass += ' borrowed';
                    statusText = '<span class="status-badge status-borrowed">🔵 Sedang Dipinjam</span>';
                }
                actionBtn = `<button class="btn btn-secondary btn-sm btn-quick-select-card" data-token="${c.qr_token}" style="margin-top: 0.5rem; width: 100%;">🔄 Kembalikan Kartu</button>`;
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
                                <div class="monitor-card-num">${c.card_identifier}</div>
                            </div>
                            <div>${statusText}</div>
                        </div>
                        <div class="monitor-card-body">
                            ${c.status === 'borrowed' ? `
                                <div style="font-size: 0.85rem; background: rgba(15, 23, 42, 0.6); padding: 0.5rem 0.75rem; border-radius: 6px; border: 1px solid var(--border-subtle);">
                                    <strong style="color: #ffffff;">Peminjam:</strong> ${c.activeBorrower || '-'} (${c.activeDepartment || 'Divisi'})<br>
                                    <strong style="color: #ffffff;">Dipinjam Sejak:</strong> ${formatDateOnly(c.activeBorrowDate)}
                                    ${c.isOverdue ? `<br><span style="color: #f87171; font-weight: 700;">⚠️ Melebihi 3 hari (${c.diffDays} hari)</span>` : ''}
                                </div>
                            ` : (c.status === 'available' ? '<p style="color: #34d399; font-size: 0.85rem;">Siap digunakan untuk keperluan dinas kantor.</p>' : '<p style="color: var(--text-muted); font-size: 0.85rem;">Sedang diproses.</p>')}
                        </div>
                    </div>
                    ${actionBtn}
                </div>
            `;
        }).join('');

        // Pasang event tombol cepat pinjam/kembalikan
        publicCardsMonitoringGridEl.querySelectorAll('.btn-quick-select-card').forEach(b => {
            b.addEventListener('click', () => {
                inputManualTokenEl.value = b.dataset.token;
                handleIdentifyCard(b.dataset.token);
                // Scroll ke form identifikasi
                cardIdentifiedBoxEl.scrollIntoView({ behavior: 'smooth' });
            });
        });
    } catch (err) {
        publicCardsMonitoringGridEl.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--danger); padding: 1.5rem;">Gagal memuat status: ${err.message}</div>`;
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
        cardStatusInfoBoxEl.classList.add('hidden');
        returnOverdueAlertEl.classList.add('hidden');

        if (card.status === 'available') {
            formGuestBorrowEl.classList.remove('hidden');
            borrowCardIdEl.value = card.id;
            borrowDateEl.value = new Date().toISOString().split('T')[0];
            borrowBorrowerNameEl.focus();
        } else if (card.status === 'borrowed') {
            const activeBorrow = await getActiveBorrowInfoByCardId(card.id);
            formGuestReturnEl.classList.remove('hidden');
            returnCardIdEl.value = card.id;
            inputReturnDateEl.value = new Date().toISOString().split('T')[0];

            if (activeBorrow) {
                returnBorrowerInfoEl.textContent = `${activeBorrow.borrower_name} (${activeBorrow.borrower_department || 'Divisi'}) - Dipinjam: ${formatDateOnly(activeBorrow.borrow_date)}`;
                returnPurposeInfoEl.textContent = activeBorrow.purpose || '-';

                // Cek keterlambatan (> 3 hari)
                const today = new Date();
                const bDate = new Date(activeBorrow.borrow_date);
                const diffDays = Math.floor((today - bDate) / (1000 * 60 * 60 * 24));
                if (diffDays > 3) {
                    returnOverdueAlertEl.classList.remove('hidden');
                    returnOverdueTextEl.textContent = `Peminjaman kartu ini telah berjalan selama ${diffDays} hari (melebihi batas toleransi kantor 3 hari). Harap segera selesaikan pengembalian.`;
                }
            }
        } else if (card.status === 'pending_approval') {
            cardStatusInfoBoxEl.className = 'alert alert-warning';
            cardStatusInfoBoxEl.innerHTML = '<strong>⏳ Menunggu Persetujuan:</strong> Permohonan peminjaman untuk kartu ini sedang menunggu konfirmasi Admin.';
            cardStatusInfoBoxEl.classList.remove('hidden');
        } else if (card.status === 'pending_return_review') {
            cardStatusInfoBoxEl.className = 'alert alert-info';
            cardStatusInfoBoxEl.innerHTML = '<strong>🔍 Menunggu Verifikasi:</strong> Kartu ini telah diajukan pengembalian dan sedang diverifikasi oleh Admin.';
            cardStatusInfoBoxEl.classList.remove('hidden');
        } else if (card.status === 'inactive') {
            cardStatusInfoBoxEl.className = 'alert alert-danger';
            cardStatusInfoBoxEl.innerHTML = '<strong>⚠️ Kartu Non-Aktif:</strong> Kartu ini dinonaktifkan oleh Admin (rusak atau hilang).';
            cardStatusInfoBoxEl.classList.remove('hidden');
        }
    } catch (err) {
        showAlert("Gagal memeriksa kartu: " + err.message, "danger");
    }
}

// ==============================================================================
// LOGIKA DASHBOARD, OVERDUE & RIWAYAT ADMIN
// ==============================================================================

async function refreshAdminDashboard() {
    const stats = await fetchDashboardStats();
    if (statTotalCardsEl) statTotalCardsEl.textContent = stats.total;
    if (statAvailableCardsEl) statAvailableCardsEl.textContent = stats.available;
    if (statBorrowedCardsEl) statBorrowedCardsEl.textContent = stats.borrowed;
    if (statOverdueCardsEl) statOverdueCardsEl.textContent = stats.overdueCount;
    if (statPendingApprovalEl) statPendingApprovalEl.textContent = stats.pendingBorrow;
    if (statPendingReturnsEl) statPendingReturnsEl.textContent = stats.pendingReturn;

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
    adminBorrowsTbodyEl.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Memuat data permohonan...</td></tr>';

    try {
        const list = await fetchPendingBorrows();
        if (list.length === 0) {
            adminBorrowsTbodyEl.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); font-style: italic;">Tidak ada permohonan peminjaman yang menunggu persetujuan.</td></tr>';
            return;
        }

        adminBorrowsTbodyEl.innerHTML = list.map(tx => `
            <tr>
                <td>${formatDateTime(tx.requested_at)}</td>
                <td>
                    <strong style="color: #ffffff;">${tx.borrower_name}</strong><br>
                    <small style="color: var(--cyan);">${tx.borrower_department || 'Divisi'}</small>
                </td>
                <td><strong>${tx.cards?.label || '-'}</strong><br><small style="color: var(--text-muted);">${tx.cards?.card_identifier || ''}</small></td>
                <td>${formatDateOnly(tx.borrow_date)}</td>
                <td>${tx.purpose}</td>
                <td>
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
    adminReturnsTbodyEl.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">Memuat pengembalian...</td></tr>';

    try {
        const list = await fetchPendingReturns();
        if (list.length === 0) {
            adminReturnsTbodyEl.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); font-style: italic;">Tidak ada pengembalian yang menunggu verifikasi.</td></tr>';
            return;
        }

        adminReturnsTbodyEl.innerHTML = list.map(ret => {
            const tx = ret.transactions;
            const card = tx?.cards;
            return `
                <tr>
                    <td>${formatDateTime(ret.submitted_at)}</td>
                    <td>
                        <strong style="color: #ffffff;">${tx?.borrower_name || 'Karyawan'}</strong><br>
                        <small style="color: var(--cyan);">${tx?.borrower_department || 'Divisi'}</small>
                    </td>
                    <td><strong>${card?.label || '-'}</strong><br><small style="color: var(--text-muted);">${card?.card_identifier || ''}</small></td>
                    <td>${formatDateOnly(ret.topup_date)}</td>
                    <td><strong style="color: var(--cyan);">${formatRupiah(ret.topup_amount)}</strong></td>
                    <td><small style="color: var(--text-secondary);">${ret.return_notes || 'Tidak ada catatan'}</small></td>
                    <td>
                        <div style="display: flex; gap: 0.35rem;">
                            <button class="btn btn-success btn-sm btn-action-approve-return" 
                                data-id="${ret.id}" 
                                data-name="${tx?.borrower_name || 'Karyawan'}" 
                                data-card="${card?.label || 'Kartu'}"
                                data-amount="${ret.topup_amount}">
                                Setujui
                            </button>
                            <button class="btn btn-danger btn-sm btn-action-reject-return" 
                                data-id="${ret.id}" 
                                data-name="${tx?.borrower_name || 'Karyawan'}" 
                                data-card="${card?.label || 'Kartu'}"
                                data-amount="${ret.topup_amount}">
                                Tolak
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        adminReturnsTbodyEl.querySelectorAll('.btn-action-approve-return').forEach(b => {
            b.addEventListener('click', () => {
                openDecisionModal(b.dataset.id, 'approved', b.dataset.name, b.dataset.card, 'return', `Top Up: ${formatRupiah(b.dataset.amount)}`);
            });
        });
        adminReturnsTbodyEl.querySelectorAll('.btn-action-reject-return').forEach(b => {
            b.addEventListener('click', () => {
                openDecisionModal(b.dataset.id, 'rejected', b.dataset.name, b.dataset.card, 'return', `Top Up: ${formatRupiah(b.dataset.amount)}`);
            });
        });
    } catch (err) {
        adminReturnsTbodyEl.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--danger);">Gagal memuat: ${err.message}</td></tr>`;
    }
}

async function refreshAdminCards() {
    if (!adminCardsTbodyEl) return;
    adminCardsTbodyEl.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">Memuat kartu...</td></tr>';

    try {
        const cards = await fetchAllCards();
        if (cards.length === 0) {
            adminCardsTbodyEl.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); font-style: italic;">Belum ada master kartu. Silakan tambah kartu pertama di atas.</td></tr>';
            return;
        }

        adminCardsTbodyEl.innerHTML = cards.map(c => `
            <tr>
                <td><strong>${c.label}</strong></td>
                <td>${c.card_identifier}</td>
                <td>${renderStatusBadge(c.status)}</td>
                <td><code style="font-size: 0.8rem; background: rgba(15, 23, 42, 0.8); color: var(--cyan); padding: 3px 6px; border-radius: 4px; border: 1px solid var(--border-subtle);">${c.qr_token}</code></td>
                <td>
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
// TAB RIWAYAT TRANSAKSI LENGKAP (PENGGANTI LOG AUDIT)
// ==============================================================================

async function refreshAdminHistory() {
    if (!adminHistoryTbodyEl) return;
    adminHistoryTbodyEl.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">Memuat riwayat transaksi...</td></tr>';

    try {
        allHistoryCache = await fetchAllTransactionHistory();
        renderFilteredHistory();
    } catch (err) {
        adminHistoryTbodyEl.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--danger);">Gagal memuat riwayat: ${err.message}</td></tr>`;
    }
}

function renderFilteredHistory() {
    if (!adminHistoryTbodyEl) return;

    const searchTerm = (inputHistorySearchEl?.value || '').toLowerCase().trim();
    const statusFilter = selectHistoryStatusEl?.value || 'all';
    const today = new Date();

    let filtered = allHistoryCache.filter(tx => {
        // Cek search term
        const matchSearch = 
            (tx.borrower_name || '').toLowerCase().includes(searchTerm) ||
            (tx.borrower_department || '').toLowerCase().includes(searchTerm) ||
            (tx.cards?.label || '').toLowerCase().includes(searchTerm) ||
            (tx.purpose || '').toLowerCase().includes(searchTerm);

        if (!matchSearch) return false;

        // Cek status filter
        if (statusFilter === 'all') return true;

        if (statusFilter === 'overdue') {
            if (tx.status !== 'borrowed') return false;
            const bDate = new Date(tx.borrow_date || tx.requested_at);
            const diffDays = Math.floor((today - bDate) / (1000 * 60 * 60 * 24));
            return diffDays > 3;
        }

        return tx.status === statusFilter;
    });

    if (filtered.length === 0) {
        adminHistoryTbodyEl.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); font-style: italic;">Tidak ada data transaksi yang cocok dengan filter.</td></tr>';
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

        let returnDetails = '-';
        if (ret) {
            returnDetails = `
                <div style="font-size: 0.8rem;">
                    <strong>Kembali:</strong> ${formatDateOnly(ret.topup_date)}<br>
                    <strong>Top Up:</strong> <span style="color: var(--cyan);">${formatRupiah(ret.topup_amount)}</span>
                    ${ret.return_notes ? `<br><small style="color: var(--text-muted);">${ret.return_notes}</small>` : ''}
                </div>
            `;
        }

        return `
            <tr>
                <td>
                    <strong style="color: #ffffff;">${formatDateOnly(tx.borrow_date)}</strong><br>
                    <small style="color: var(--text-muted);">${formatDateTime(tx.requested_at)}</small>
                </td>
                <td>
                    <strong style="color: #ffffff;">${tx.borrower_name}</strong><br>
                    <small style="color: var(--cyan);">${tx.borrower_department || 'Divisi'}</small>
                </td>
                <td>
                    <strong>${tx.cards?.label || '-'}</strong><br>
                    <small style="color: var(--text-muted);">${tx.cards?.card_identifier || ''}</small>
                </td>
                <td>${tx.purpose}</td>
                <td>${renderStatusBadge(tx.status, isOverdue, diffDays)}</td>
                <td>${returnDetails}</td>
                <td><small style="color: var(--text-secondary);">${tx.decision_note || ret?.review_note || '-'}</small></td>
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
        "Tanggal Pengembalian",
        "Nominal Top Up (Rp)",
        "Catatan Pengembalian",
        "Catatan Keputusan Admin"
    ];

    const rows = allHistoryCache.map(tx => {
        const ret = tx.returns?.[0];
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
            `"${ret ? formatDateOnly(ret.topup_date) : '-'}"`,
            `"${ret ? (ret.topup_amount || 0) : 0}"`,
            `"${(ret?.return_notes || '').replace(/"/g, '""')}"`,
            `"${(tx.decision_note || ret?.review_note || '').replace(/"/g, '""')}"`
        ];
    });

    const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
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
// MODAL POPUP (QR KARTU, QR MEJA, KEPUTUSAN ADMIN)
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
            // Otomatis deteksi base URL lengkap (termasuk sub-path seperti GitHub Pages /repo-name/)
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
            // Otomatis deteksi base URL lengkap (termasuk sub-path seperti GitHub Pages /repo-name/)
            const cleanPath = window.location.pathname.replace(/\/[^\/]*\.html$/, '').replace(/\/$/, '');
            savedBaseUrl = window.location.origin + cleanPath;
        }
    }

    const deskUrl = savedBaseUrl.replace(/\/$/, '') + '/';
    deskQrUrlTextEl.textContent = deskUrl;
    renderQrCode(deskQrCanvasWrapperEl, deskUrl, 250);
    modalDeskQrEl.classList.remove('hidden');
}

function openDecisionModal(targetId, actionType, borrowerName, cardLabel, category = 'borrow', extraDetail = '') {
    decisionTxIdEl.value = targetId;
    decisionActionTypeEl.value = actionType;
    decisionTargetCategory = category;
    decisionNoteEl.value = '';

    if (category === 'borrow') {
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
        if (actionType === 'approved') {
            modalDecisionTitleEl.textContent = 'Setujui Verifikasi Pengembalian';
            modalDecisionDescEl.textContent = `Anda akan menyetujui pengembalian kartu "${cardLabel}" dari ${borrowerName} (${extraDetail}).`;
            labelDecisionNoteEl.textContent = 'Catatan Verifikasi (Opsional):';
            decisionNoteEl.required = false;
            decisionNoteEl.placeholder = 'Contoh: Fisik kartu sudah diterima di GA';
        } else {
            modalDecisionTitleEl.textContent = 'Tolak Verifikasi Pengembalian';
            modalDecisionDescEl.textContent = `Anda akan menolak pengembalian kartu "${cardLabel}" dari ${borrowerName}. Kartu tetap berstatus dipinjam.`;
            labelDecisionNoteEl.textContent = 'Alasan Penolakan (Wajib Diisi):';
            decisionNoteEl.required = true;
            decisionNoteEl.placeholder = 'Contoh: Fisik kartu belum diserahkan ke meja GA';
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

    // 3. Tab Admin Setup
    setupAdminTabs();

    // 4. Monitoring Meja Publik (Cetak QR Meja & Refresh)
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

    // 7. Form Peminjaman Cepat (Tanpa Nomor HP)
    formGuestBorrowEl.addEventListener('submit', async (e) => {
        e.preventDefault();
        const cardId = borrowCardIdEl.value;
        const borrowerName = borrowBorrowerNameEl.value;
        const borrowerDepartment = borrowDepartmentEl.value;
        const borrowDate = borrowDateEl.value;
        const purpose = borrowPurposeEl.value;

        btnSubmitBorrowEl.disabled = true;
        btnSubmitBorrowEl.textContent = 'Mengirim Permohonan...';

        try {
            await submitGuestBorrow({
                cardId,
                borrowerName,
                borrowerDepartment,
                purpose,
                borrowDate
            });

            showAlert(`Permohonan peminjaman atas nama ${borrowerName} (${borrowerDepartment}) berhasil diajukan! Menunggu persetujuan Admin.`, "success", 7000);
            
            formGuestBorrowEl.reset();
            cardIdentifiedBoxEl.classList.add('hidden');
            inputManualTokenEl.value = '';
            await refreshPublicMonitoring();
        } catch (err) {
            showAlert("Gagal mengajukan peminjaman: " + err.message, "danger", 8000);
        } finally {
            btnSubmitBorrowEl.disabled = false;
            btnSubmitBorrowEl.textContent = '🚀 Ajukan Peminjaman Kartu';
        }
    });

    // 8. Form Pengembalian Cepat (Tanpa Struk)
    if (inputTopupAmountEl) {
        inputTopupAmountEl.addEventListener('input', (e) => {
            const val = e.target.value;
            topupAmountFormattedEl.textContent = val && Number(val) > 0 ? formatRupiah(val) : '';
        });
    }

    formGuestReturnEl.addEventListener('submit', async (e) => {
        e.preventDefault();
        const cardId = returnCardIdEl.value;
        const topupAmount = inputTopupAmountEl.value;
        const returnNotes = inputReturnNotesEl.value;
        const topupDate = inputReturnDateEl.value;

        btnSubmitReturnEl.disabled = true;
        btnSubmitReturnEl.textContent = 'Memproses Pengembalian...';

        try {
            await submitGuestReturn({
                cardId,
                topupAmount,
                returnNotes,
                topupDate
            });

            showAlert("Pengembalian kartu berhasil dikirim! Menunggu verifikasi Admin Utama.", "success", 7000);

            formGuestReturnEl.reset();
            cardIdentifiedBoxEl.classList.add('hidden');
            inputManualTokenEl.value = '';
            topupAmountFormattedEl.textContent = '';
            await refreshPublicMonitoring();
        } catch (err) {
            showAlert("Gagal mengirim pengembalian: " + err.message, "danger", 8000);
        } finally {
            btnSubmitReturnEl.disabled = false;
            btnSubmitReturnEl.textContent = '🔄 Kembalikan Kartu e-Toll';
        }
    });

    // 9. Admin Tambah Kartu Baru
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

    // 10. Admin Refresh Buttons
    if (btnRefreshAdminDashboardEl) btnRefreshAdminDashboardEl.addEventListener('click', refreshAdminDashboard);
    if (btnRefreshAdminBorrowsEl) btnRefreshAdminBorrowsEl.addEventListener('click', refreshAdminBorrows);
    if (btnRefreshAdminReturnsEl) btnRefreshAdminReturnsEl.addEventListener('click', refreshAdminReturns);
    if (btnRefreshAdminCardsEl) btnRefreshAdminCardsEl.addEventListener('click', refreshAdminCards);
    if (btnRefreshAdminHistoryEl) btnRefreshAdminHistoryEl.addEventListener('click', refreshAdminHistory);

    // 11. Search & Filter Riwayat Transaksi
    if (inputHistorySearchEl) {
        inputHistorySearchEl.addEventListener('input', renderFilteredHistory);
    }
    if (selectHistoryStatusEl) {
        selectHistoryStatusEl.addEventListener('change', renderFilteredHistory);
    }
    if (btnExportHistoryCsvEl) {
        btnExportHistoryCsvEl.addEventListener('click', exportHistoryToCSV);
    }

    // 12. Modal QR Code Kartu
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

    // 13. Modal Keputusan Admin Submit (Approve / Reject)
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
                await decideReturn(targetId, actionType, note);
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

    // 14. Cek Parameter URL (?card=TOKEN) saat scan otomatis
    const urlParams = new URLSearchParams(window.location.search);
    const cardParam = urlParams.get('card');

    // 15. Inisialisasi Sesi Admin Awal & Monitoring Publik
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
            inputManualTokenEl.value = cardParam;
            handleIdentifyCard(cardParam);
        }
    } catch (err) {
        console.error("Gagal memeriksa sesi awal:", err);
        await updateUIForUser(null);
    }

    // 16. Real-time Auth Subscription
    subscribeAuthChange(async (event, session, profile) => {
        if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
            await updateUIForUser(profile);
        } else if (event === 'SIGNED_OUT') {
            await updateUIForUser(null);
        }
    });
}

window.addEventListener('DOMContentLoaded', initApp);
