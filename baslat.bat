@echo off
rem Duvar Simulasyon Yazilimi - gelistirme ortamini tek tikla baslatir:
rem   1) kopru sunucusu  (port 4000, Unreal yoksa "simulasyon" modu)
rem   2) kontrol paneli  (port 5173)
rem   3) tarayicida paneli acar
rem Pencereleri kapatmak sunuculari durdurur.
setlocal
cd /d "%~dp0"
title Duvar Simulasyonu - Baslatici

where node >nul 2>nul
if errorlevel 1 (
  echo [HATA] Node.js bulunamadi. Once kur.bat calistirin.
  pause
  exit /b 1
)
if not exist "node_modules\" (
  echo node_modules yok, kurulum yapiliyor...
  call npm install
  if errorlevel 1 (
    echo [HATA] Kurulum basarisiz.
    pause
    exit /b 1
  )
)

echo Kopru sunucusu baslatiliyor (port 4000)...
start "Duvar Simulasyonu - Kopru (4000)" cmd /k "cd /d "%~dp0" && npm run dev:kopru"

echo Kontrol paneli baslatiliyor (port 5173)...
start "Duvar Simulasyonu - Panel (5173)" cmd /k "cd /d "%~dp0" && npm run dev:panel"

echo Sunucularin ayaga kalkmasi bekleniyor...
timeout /t 5 /nobreak >nul

echo Tarayici aciliyor: http://localhost:5173
start "" "http://localhost:5173"

echo.
echo Panel:  http://localhost:5173   (ayni agdaki tablet icin: http://^<bu-bilgisayarin-ip^>:5173)
echo Kopru:  http://localhost:4000/api/durum
echo Durdurmak icin acilan iki komut penceresini kapatin.
timeout /t 8 >nul
endlocal