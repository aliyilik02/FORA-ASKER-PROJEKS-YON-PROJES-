@echo off
rem Ornek UE5 paketini (TCCC) tek genis pencere olarak 3 ekrana yayma denemesi.
rem Kullanim:  ornek-tccc-genis-ekran.bat [paket klasoru] [genislik] [yukseklik]
rem Ornek:     ornek-tccc-genis-ekran.bat "C:\Users\Ad\Desktop\Windows" 5760 1080
rem Varsayilan: Masaustu\Windows klasoru, 5760x1080 (3 x 1920x1080, yan yana)
rem Not: Bu ornekte nDisplay YOK; -dc_cfg parametresi ise yaramaz. Ayrinti: docs\ornek-calisma-inceleme.md
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
set /p SECIM="Secim (1/2/3): "

rem -ini:Engine:... satiri UE'nin ultra genis ekranda dikey gorus acisini kismasini onler (Hor+).
set "FOV=-ini:Engine:[/Script/Engine.LocalPlayer]:AspectRatioAxisConstraint=AspectRatio_MaintainYFOV"
set "UPROJ=..\..\..\TCCC\TCCC.uproject"

cd /d "%PAKET%\Engine\Binaries\Win64"
if "%SECIM%"=="1" start "" UnrealGame.exe %UPROJ% -windowed -ResX=%W% -ResY=%H% -WinX=0 -WinY=0 -ForceRes %FOV% -log
if "%SECIM%"=="2" start "" UnrealGame.exe %UPROJ% -fullscreen -ResX=%W% -ResY=%H% -ForceRes %FOV% -log
if "%SECIM%"=="3" start "" UnrealGame.exe %UPROJ% -windowed -ResX=1920 -ResY=1080 -WinX=0 -WinY=0 -ForceRes %FOV% -log
endlocal