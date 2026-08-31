# PowerShell script to download and set up FFmpeg for Windows

$ffmpegUrl = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
$ffmpegDir = ".\ffmpeg"
$ffmpegZip = ".\ffmpeg.zip"

Write-Host "Downloading FFmpeg..." -ForegroundColor Green
Invoke-WebRequest -Uri $ffmpegUrl -OutFile $ffmpegZip

Write-Host "Extracting FFmpeg..." -ForegroundColor Green
Expand-Archive -Path $ffmpegZip -DestinationPath $ffmpegDir -Force

# Find the ffmpeg.exe path
$ffmpegExe = Get-ChildItem -Path $ffmpegDir -Filter "ffmpeg.exe" -Recurse | Select-Object -First 1

if ($ffmpegExe) {
    $ffmpegPath = $ffmpegExe.DirectoryName
    Write-Host "FFmpeg found at: $ffmpegPath" -ForegroundColor Green
    
    # Create a batch file to run the app with FFmpeg in PATH
    $batchContent = @"
@echo off
set PATH=%PATH%;$ffmpegPath
npm run dev
"@
    
    Set-Content -Path ".\run-with-ffmpeg.bat" -Value $batchContent
    
    Write-Host "`nFFmpeg downloaded successfully!" -ForegroundColor Green
    Write-Host "Run the app using: .\run-with-ffmpeg.bat" -ForegroundColor Yellow
} else {
    Write-Host "Error: Could not find ffmpeg.exe" -ForegroundColor Red
}

# Clean up
Remove-Item $ffmpegZip