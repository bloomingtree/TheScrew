# Pyodide 离线包下载脚本
# 从 SourceForge 下载完整的 pyodide-0.29.3.tar.bz2

$ErrorActionPreference = "Stop"

$url = "https://sourceforge.net/projects/pyodide.mirror/files/0.29.3/pyodide-0.29.3.tar.bz2/download"
$output = "pyodide-0.29.3.tar.bz2"

Write-Host "===================================="
Write-Host "Pyodide Offline Package Downloader"
Write-Host "===================================="
Write-Host ""
Write-Host "Downloading: pyodide-0.29.3.tar.bz2 (392.4 MB)"
Write-Host "From: SourceForge"
Write-Host ""
Write-Host "This may take several minutes..."
Write-Host ""

try {
    # 使用 WebClient 下载（支持进度显示）
    $webClient = New-Object System.Net.WebClient

    # 注册进度事件
    Register-ObjectEvent -InputObject $webClient -EventName DownloadProgressChanged -SourceIdentifier WebClient.DownloadProgressChanged -Action {
        global:progressData = $Event.SourceEventArgs
    } | Out-Null

    # 开始下载
    $webClient.DownloadFileAsync($url, $output)

    # 显示进度
    while ($webClient.IsBusy) {
        if ($global:progressData) {
            $percent = $global:progressData.ProgressPercentage
            $received = [math]::Round($global:progressData.BytesReceived / 1MB, 2)
            $total = [math]::Round($global:progressData.TotalBytesToReceive / 1MB, 2)
            Write-Progress -Activity "Downloading Pyodide" -Status "$received MB / $total MB" -PercentComplete $percent
        }
        Start-Sleep -Milliseconds 100
    }

    # 清理事件
    Unregister-Event -SourceIdentifier WebClient.DownloadProgressChanged -ErrorAction SilentlyContinue
    $webClient.Dispose()

    Write-Progress -Activity "Downloading Pyodide" -Completed

    if (Test-Path $output) {
        $size = [math]::Round((Get-Item $output).Length / 1MB, 2)
        Write-Host ""
        Write-Host "====================================" -ForegroundColor Green
        Write-Host "Download completed successfully!" -ForegroundColor Green
        Write-Host "====================================" -ForegroundColor Green
        Write-Host "File: $output"
        Write-Host "Size: $size MB"
        Write-Host ""
        Write-Host "Next steps:"
        Write-Host "1. Extract: tar -xjf pyodide-0.29.3.tar.bz2"
        Write-Host "2. Copy files: xcopy /E /I /Y pyodide-0.29.3\\* public\\pyodide-full\\"
    } else {
        Write-Host "Error: Download failed - file not created" -ForegroundColor Red
    }
} catch {
    Write-Host ""
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "You can download manually from:"
    Write-Host "https://sourceforge.net/projects/pyodide.mirror/files/0.29.3/pyodide-0.29.3.tar.bz2"
}
