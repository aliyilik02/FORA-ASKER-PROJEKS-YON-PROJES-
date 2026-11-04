@echo off
rem Duvar Simulasyon Yazilimi - kurulum (bir kez calistirilir, internet gerekir)
setlocal
cd /d "%~dp0"
title Duvar Simulasyonu - Kurulum

where node >nul 2>nul
if errorlevel 1 (
  echo [HATA] Node.js bulunamadi. https://nodejs.org adresinden LTS surumu kurun ^(20 veya ustu^).
  pause
  exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do echo Node.js %%v bulundu.

echo.
echo Bagimliliklar yukleniyor (npm install)...
call npm install
if errorlevel 1 (
  echo.
  echo [HATA] npm install basarisiz oldu. Yukaridaki mesajlari kontrol edin.
  pause
  exit /b 1
)

echo.
echo Kurulum tamam. Baslatmak icin baslat.bat dosyasini calistirin.
pause
endlocal