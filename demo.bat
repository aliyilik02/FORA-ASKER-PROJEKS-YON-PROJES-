@echo off
rem Duvar Simulasyonu - tek tikla DEMO:
rem   1^) gerekiyorsa npm install  2^) gerekiyorsa derleme  3^) kopru sunucusu ^(panel + oynatici tek port^)
rem   4^) tarayicida kontrol paneli ve duvar oynaticisini acar
rem Onkosul: Node.js 20.19+ ^(https://nodejs.org, LTS^). Internet yalnizca ilk kurulumda gerekir.
rem Not: cmd'de blok icindeki echo satirlarinda parantez kullanilmaz ^(blogu kapatir^).
setlocal
cd /d "%~dp0"
title Duvar Simulasyonu - Demo

where node >nul 2>nul
if errorlevel 1 (
  echo [HATA] Node.js bulunamadi. https://nodejs.org adresinden LTS surumunu kurun, sonra tekrar calistirin.
  pause
  exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do echo Node.js %%v

if exist "node_modules\" goto derlemeKontrol
echo Bagimliliklar yukleniyor - ilk kurulum, internet gerekir...
call npm install
if errorlevel 1 (
  echo [HATA] npm install basarisiz.
  pause
  exit /b 1
)

:derlemeKontrol
if "%~1"=="yeniden" goto derle
if not exist "apps\kontrol-paneli\dist\index.html" goto derle
if not exist "apps\duvar-oynatici\dist\index.html" goto derle
if not exist "apps\kopru\dist\index.js" goto derle
goto baslat

:derle
echo Derleniyor: panel + oynatici + kopru...
call npm run build
if errorlevel 1 (
  echo [HATA] Derleme basarisiz.
  pause
  exit /b 1
)

:baslat
rem Kopru zaten calisiyorsa ikinci bir kopru baslatma; "yeniden" verildiyse eskisini durdurup yeni derlemeyi yukle.
where curl >nul 2>nul
if errorlevel 1 goto eskiBaslat
curl -s -o NUL -m 2 http://localhost:4000/api/durum >nul 2>nul
if errorlevel 1 goto kopruBaslat
if "%~1"=="yeniden" goto kopruYenidenBaslat
echo Kopru zaten calisiyor - port 4000 yanit veriyor, yeni kopru baslatilmadi.
goto tarayici

:kopruYenidenBaslat
echo Calisan kopru durduruluyor - yeni derleme yuklenecek...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":4000 " ^| findstr LISTENING') do taskkill /PID %%p /F >nul 2>nul
timeout /t 2 /nobreak >nul

:kopruBaslat
echo Kopru sunucusu baslatiliyor - port 4000...
start "Duvar Simulasyonu - Kopru 4000" cmd /k "cd /d "%~dp0" && npm start"
set /a DENEME=0
:bekle
timeout /t 1 /nobreak >nul
curl -s -o NUL -m 2 http://localhost:4000/api/durum >nul 2>nul
if not errorlevel 1 goto hazir
set /a DENEME+=1
if %DENEME% lss 25 goto bekle
echo [UYARI] Kopru 25 saniyede yanit vermedi - "Kopru 4000" penceresindeki hataya bakin.
goto tarayici

:hazir
echo Kopru hazir.
goto tarayici

:eskiBaslat
echo Kopru sunucusu baslatiliyor - port 4000...
start "Duvar Simulasyonu - Kopru 4000" cmd /k "cd /d "%~dp0" && npm start"
echo Sunucu bekleniyor...
timeout /t 4 /nobreak >nul

:tarayici
echo Kontrol paneli:  http://localhost:4000
echo Duvar oynatici:  http://localhost:4000/oynatici/?hud=1
start "" "http://localhost:4000"
timeout /t 2 /nobreak >nul
start "" "http://localhost:4000/oynatici/?hud=1"
echo.
echo Oynatici penceresinde: H bilgi katmani, K kalibrasyon, F tam ekran, M sessiz.
echo Ayni agdaki tablet icin panel: http://^<bu-bilgisayarin-ip^>:4000
echo Durdurmak icin "Kopru 4000" penceresini kapatin.
echo Yeniden derleyip kopruyu yeni kodla baslatmak icin: demo.bat yeniden
timeout /t 10 >nul
endlocal
