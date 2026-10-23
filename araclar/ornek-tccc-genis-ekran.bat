@echo off
rem Ornek UE5 paketini (TCCC) tek genis pencere olarak 3 ekrana yayma denemesi.
rem Kullanim:  ornek-tccc-genis-ekran.bat [paket klasoru] [genislik] [yukseklik]
rem Ornek:     ornek-tccc-genis-ekran.bat "C:\Users\Ad\Desktop\Windows" 5760 1080
rem Varsayilan: Masaustu\Windows klasoru, 5760x1080 (3 x 1920x1080, yan yana)
rem Not: Bu ornekte nDisplay YOK; -dc_cfg parametresi ise yaramaz. Ayrinti: docs\ornek-calisma-inceleme.md
rem Not: Oyun calisinca paket klasorundeki TCCC\Saved altina gunluk yazar; orijinali korumak icin kopyadan calistirin.
setlocal
set "PAKET=%~1"
if "%PAKET%"=="" set "PAKET=%USERPROFILE%\Desktop\Windows"
set "W=%~2"
if "%W%"=="" set "W=5760"
set "H=%~3"
if "%H%"=="" set "H=1080"

if not exist "%PAKET%\Engine\Binaries\Win64\UnrealGame.exe" (
  echo [HATA] UnrealGame.exe bulunamadi: "%PAKET%\Engine\Binaries\Win64\UnrealGame.exe"
  pause
  exit /b 1
)

echo Paket : %PAKET%
echo Pencere: %W%x%H%, sol-ust kose (0,0), cercevesiz
echo.
echo Secenekler:
echo   1 = Cercevesiz genis pencere (3 ekran "Genislet" modunda yan yana dizilmisken)
echo   2 = Tam ekran (NVIDIA Surround / AMD Eyefinity ile tek %W%x%H% ekran varken)
echo   3 = Sadece bu bilgisayarda deneme: 1920x1080 pencere + genis acili FOV ayari
echo   4 = Tek ekranda 48:9 on izleme: 1920x360 pencere (3 duvarin oranini tek ekranda gosterir)
echo   5 = Secenek 3 gibi, dusuk kalite (zayif GPU icin: sg.* 1, %%75 cozunurluk olcegi)
set /p SECIM="Secim (1/2/3/4/5): "

rem -ini:Engine:... satiri UE'nin ultra genis ekranda dikey gorus acisini kismasini onler (Hor+).
set "FOV=-ini:Engine:[/Script/Engine.LocalPlayer]:AspectRatioAxisConstraint=AspectRatio_MaintainYFOV"
rem Zayif GPU icin baslangicta calisan konsol komutlari (Development yapida gecerli, Shipping'de kapali).
set "DUSUK=-ExecCmds="sg.GlobalIlluminationQuality 1,sg.ReflectionQuality 1,sg.ShadowQuality 1,sg.PostProcessQuality 1,sg.EffectsQuality 2,r.ScreenPercentage 75""
set "UPROJ=..\..\..\TCCC\TCCC.uproject"

cd /d "%PAKET%\Engine\Binaries\Win64"
if "%SECIM%"=="1" start "" UnrealGame.exe %UPROJ% -windowed -ResX=%W% -ResY=%H% -WinX=0 -WinY=0 -ForceRes %FOV% -log
if "%SECIM%"=="2" start "" UnrealGame.exe %UPROJ% -fullscreen -ResX=%W% -ResY=%H% -ForceRes %FOV% -log
if "%SECIM%"=="3" start "" UnrealGame.exe %UPROJ% -windowed -ResX=1920 -ResY=1080 -WinX=0 -WinY=0 -ForceRes %FOV% -log
if "%SECIM%"=="4" start "" UnrealGame.exe %UPROJ% -windowed -ResX=1920 -ResY=360 -WinX=0 -WinY=0 -ForceRes %FOV% %DUSUK% -log
if "%SECIM%"=="5" start "" UnrealGame.exe %UPROJ% -windowed -ResX=1920 -ResY=1080 -WinX=0 -WinY=0 -ForceRes %FOV% %DUSUK% -log
endlocal
