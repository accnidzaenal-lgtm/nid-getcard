// ==============================================================================
// E-TOLL CONTROL - PEMINDAI QR CODE & INPUT MANUAL (scanner.js)
// ==============================================================================

let html5QrCode = null;
let isScannerRunning = false;

/**
 * Mengekstrak token kartu dari hasil scan (bisa berupa teks langsung atau URL)
 */
export function extractCardToken(rawText) {
    if (!rawText) return null;
    const trimmed = rawText.trim();

    // Jika hasil scan berupa URL (misal: http://localhost:3000/?card=ET-XXXX atau https://accnidzaenal-lgtm.github.io/nid-getcard/?card=ET-XXXX)
    if (trimmed.includes('?card=')) {
        try {
            const url = new URL(trimmed);
            const param = url.searchParams.get('card');
            if (param) return param.trim().toUpperCase();
        } catch (e) {
            const match = trimmed.match(/[?&]card=([^&#]+)/i);
            if (match && match[1]) {
                return decodeURIComponent(match[1]).trim().toUpperCase();
            }
        }
    }

    return trimmed.toUpperCase();
}

/**
 * Memulai kamera pemindai QR Code
 */
export async function startScanner(elementId, onSuccessCallback, onErrorCallback) {
    if (!window.Html5Qrcode) {
        throw new Error("Pustaka Html5Qrcode belum dimuat. Periksa koneksi internet.");
    }

    const qrElement = document.getElementById(elementId);
    if (!qrElement) return;

    if (isScannerRunning) {
        await stopScanner();
    }

    html5QrCode = new window.Html5Qrcode(elementId);

    const config = {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0
    };

    try {
        await html5QrCode.start(
            { facingMode: "environment" }, // Kamera belakang pada ponsel
            config,
            (decodedText) => {
                const token = extractCardToken(decodedText);
                stopScanner();
                if (onSuccessCallback) onSuccessCallback(token);
            },
            (errorMessage) => {
                // Diabaikan pada setiap frame yang belum menemukan QR
            }
        );
        isScannerRunning = true;
    } catch (err) {
        console.warn("Gagal membuka kamera:", err);
        if (onErrorCallback) onErrorCallback(err);
    }
}

/**
 * Menghentikan kamera pemindai
 */
export async function stopScanner() {
    if (html5QrCode && isScannerRunning) {
        try {
            await html5QrCode.stop();
        } catch (e) {
            console.warn("Gagal menghentikan scanner:", e);
        }
        isScannerRunning = false;
        html5QrCode = null;
    }
}
