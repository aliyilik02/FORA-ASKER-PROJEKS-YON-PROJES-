@echo off
rem Masaustune ve Baslat menusune iki kisayol koyar:
rem   "Duvar Simulasyonu - Demo"        -> bu klasorde demo.bat (kopru + panel + oynatici)
rem   "Duvar Simulasyonu - Claude Code" -> bu klasorde Claude Code terminali
rem Kullanim: kisayol-olustur.bat   (proje klasorunden calistirin; klasor tasinirsa tekrar calistirin)
setlocal
set "KOK=%~dp0"
set "KOK=%KOK:~0,-1%"

echo Proje klasoru: %KOK%
echo Kisayollar olusturuluyor...

powershell -NoProfile -ExecutionPolicy Bypass -Command "$w = New-Object -ComObject WScript.Shell; $simge = $env:SystemRoot + '\System32\cmd.exe,0'; foreach ($k in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) { $s = $w.CreateShortcut((Join-Path $k 'Duvar Simulasyonu - Demo.lnk')); $s.TargetPath = $env:ComSpec; $s.Arguments = '/k demo.bat'; $s.WorkingDirectory = '%KOK%'; $s.IconLocation = $simge; $s.Description = 'Kopru, panel ve oynaticiyi baslatir'; $s.Save(); $s = $w.CreateShortcut((Join-Path $k 'Duvar Simulasyonu - Claude Code.lnk')); $s.TargetPath = $env:ComSpec; $s.Arguments = '/k claude'; $s.WorkingDirectory = '%KOK%'; $s.IconLocation = $simge; $s.Description = 'Proje klasorunde Claude Code'; $s.Save(); Write-Host ('  ' + $k) }"

if errorlevel 1 goto hata
echo.
echo Tamam. Masaustunde ve Baslat menusunde:
echo   Duvar Simulasyonu - Demo         : demo.bat ile her seyi baslatir
echo   Duvar Simulasyonu - Claude Code  : proje klasorunde Claude Code acar
pause
exit /b 0

:hata
echo.
echo Kisayol olusturulamadi. PowerShell kapali olabilir; elle olusturmak icin:
echo   Sag tik - Yeni - Kisayol - Hedef: cmd /k demo.bat - "Baslangic yeri": %KOK%
pause
exit /b 1
