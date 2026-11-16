<#
==============================================================================
E-TOLL CONTROL - LOKAL WEB SERVER RESPONSIF & AKSES HP (jalankan-aplikasi.ps1)
==============================================================================
Skrip ini menjalankan server lokal yang dapat diakses dari Laptop/PC 
maupun dari Ponsel/HP/Tablet Android yang terhubung ke jaringan Wi-Fi yang sama!
==============================================================================
#>

$port = 3000
$rootPath = $PSScriptRoot

# Ambil IP Address lokal komputer (Wi-Fi / LAN)
$localIPs = [System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName()) | 
    Where-Object { $_.AddressFamily -eq 'InterNetwork' -and $_.IPAddressToString -ne '127.0.0.1' } | 
    ForEach-Object { $_.IPAddressToString }

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Prefixes.Add("http://127.0.0.1:$port/")

$wifiUrl = ""
foreach ($ip in $localIPs) {
    $prefix = "http://$ip`:$port/"
    try {
        $listener.Prefixes.Add($prefix)
        if (-not $wifiUrl) { $wifiUrl = "http://$ip`:$port" }
    } catch {
        # abaikan jika prefix gagal
    }
}

try {
    $listener.Start()
} catch {
    Write-Host "Gagal memulai server di port $port. Kemungkinan port sedang digunakan aplikasi lain." -ForegroundColor Red
    Write-Host $_.Exception.Message
    Exit
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   e-Toll Control - Server Lokal Berjalan                " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Alamat di Laptop/PC  : http://localhost:$port/" -ForegroundColor Yellow
if ($wifiUrl) {
    Write-Host "Alamat Akses HP/WiFi : $wifiUrl/" -ForegroundColor Green
    Write-Host "(Pastikan HP dan Laptop terhubung ke Wi-Fi yang sama)" -ForegroundColor Gray
}
Write-Host "`nTekan CTRL + C di jendela ini untuk menghentikan server.`n" -ForegroundColor Gray

# Buka browser
if ($wifiUrl) {
    Start-Process "$wifiUrl/"
} else {
    Start-Process "http://localhost:$port/"
}

# Pemetaan tipe MIME file
$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".svg"  = "image/svg+xml"
    ".ico"  = "image/x-icon"
}

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $localPath = $request.Url.LocalPath.TrimStart('/')
        if ([string]::IsNullOrWhiteSpace($localPath)) {
            $localPath = "index.html"
        }

        # Hindari path traversal
        $filePath = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($rootPath, $localPath))
        if (-not $filePath.StartsWith($rootPath)) {
            $response.StatusCode = 403
            $response.Close()
            continue
        }

        if (Test-Path $filePath -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            $contentType = "application/octet-stream"
            if ($mimeTypes.ContainsKey($ext)) {
                $contentType = $mimeTypes[$ext]
            }

            $response.ContentType = $contentType
            $buffer = [System.IO.File]::ReadAllBytes($filePath)
            $response.ContentLength64 = $buffer.Length
            $response.OutputStream.Write($buffer, 0, $buffer.Length)
            $response.StatusCode = 200
        } else {
            $response.StatusCode = 404
            $notFoundBytes = [System.Text.Encoding]::UTF8.GetBytes("404 - File Not Found")
            $response.OutputStream.Write($notFoundBytes, 0, $notFoundBytes.Length)
        }

        $response.Close()
    }
} finally {
    $listener.Stop()
    $listener.Close()
}
