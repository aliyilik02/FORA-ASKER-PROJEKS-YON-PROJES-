@echo off
rem Duvar Oynatici'yi kiosk modunda acar (hibrit yol: goruntuyu tarayici uretir).
rem Kullanim:  oynatici-baslat.bat [genislik] [yukseklik] [kopru-adresi]
rem Ornek:     oynatici-baslat.bat 5760 1080 http://localhost:4000      (3 projektor yan yana)
rem            oynatici-baslat.bat 1920 360                             (tek ekranda onizleme)
rem Onkosul: kopru sunucusu calisiyor ve oynatici derlenmis (npm run build) olmali;
rem          gelistirmede bunun yerine "npm run dev:oynatici" + http://localhost:5174 kullanin.
setlocal
set "W=%~1"
if "%W%"=="" set "W=5760"
set "H=%~2"
if "%H%"=="" set "H=1080"
set "KOPRU=%~3"
if "%KOPRU%"=="" set "KOPRU=http://localhost:4000"

set "CHROME="
for %%p in ("%ProgramFiles%\Google\Chrome\Application\chrome.exe" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" "%LocalAppData%\Google\Chrome\Application\chrome.exe" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe") do (
  if not defined CHROME if exist %%p set "CHROME=%%~p"
)
if not defined CHROME (
  echo [HATA] Chrome veya Edge bulunamadi.
  pause
  exit /b 1
)

echo Oynatici aciliyor: %KOPRU%/oynatici/  (%W%x%H%)
rem --kiosk: cerceve yok, tam ekran. --window-position=0,0: 3 ekranli masaustunde sol ust kose.
rem --autoplay-policy: ses icin tiklama gerekmesin. --user-data-dir: ayri profil (uzanti/guncelleme yok).
start "" "%CHROME%" --kiosk --window-position=0,0 --window-size=%W%,%H% ^
  --autoplay-policy=no-user-gesture-required --disable-session-crashed-bubble --noerrdialogs ^
  --disable-infobars --no-first-run --user-data-dir="%LocalAppData%\DuvarOynatici" ^
  "%KOPRU%/oynatici/?doldur=1"
endlocal
