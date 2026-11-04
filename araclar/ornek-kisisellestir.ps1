<#
  Örnek UE paketinin KOPYASINA, kaynak proje olmadan yapılabilen küçük "bizim" dokunuşları uygular:
    1. Açılış splash görseli        -> <Paket>\TCCC\Content\Splash\Splash.bmp
    2. Pencere başlığı + telif       -> <Paket>\TCCC\Saved\Config\Windows\Game.ini
    3. Başlangıç grafik profili      -> <Paket>\TCCC\Saved\Config\Windows\GameUserSettings.ini  [ScalabilityGroups]
    4. (isteğe bağlı) masaüstü kısayolu: simge + ad + doğru başlatma parametreleri

  Kullanım (PowerShell):
    powershell -ExecutionPolicy Bypass -File araclar\ornek-kisisellestir.ps1
    powershell -ExecutionPolicy Bypass -File araclar\ornek-kisisellestir.ps1 -Paket "D:\ornek-kopya" -Profil dusuk -Kisayol

  Profiller: epic (paket varsayılanı), orta (kademe 2, %75 ölçek), dusuk (kademe 1, %67 ölçek).
  Orijinal örnek klasöre (Masaüstü\Windows) uygulanmaz; betik bunu reddeder.
#>
param(
  [string]$Paket = "$env:USERPROFILE\Desktop\Projeler\ornek-tccc-kopya",
  [string]$Baslik = "Duvar Simülasyonu – Eğirdir Dağ Komando Okulu",
  [string]$SplashBaslik = "DUVAR SİMÜLASYON YAZILIMI",
  [string]$SplashAlt = "Eğirdir Dağ Komando Okulu",
  [ValidateSet("epic", "orta", "dusuk")] [string]$Profil = "orta",
  [switch]$Kisayol
)

$ErrorActionPreference = "Stop"
$exe = Join-Path $Paket "Engine\Binaries\Win64\UnrealGame.exe"
if (-not (Test-Path $exe)) { Write-Error "UnrealGame.exe bulunamadı: $exe"; exit 1 }
if ((Resolve-Path $Paket).Path.TrimEnd('\') -ieq (Join-Path $env:USERPROFILE "Desktop\Windows")) {
  Write-Error "Bu orijinal örnek klasörü; önce kopyasını alın (robocopy) ve -Paket ile kopyayı verin."
  exit 1
}

Add-Type -AssemblyName System.Drawing

# 1) Splash.bmp (24 bit; UE GDI ile yükler)
$spDir = Join-Path $Paket "TCCC\Content\Splash"
New-Item -ItemType Directory -Force $spDir | Out-Null
$bmp = New-Object System.Drawing.Bitmap 720, 240, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = "AntiAlias"; $g.TextRenderingHint = "AntiAliasGridFit"
$g.Clear([System.Drawing.Color]::FromArgb(18, 28, 22))
$kirmizi = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(196, 30, 30))
$g.FillRectangle($kirmizi, 0, 0, 720, 8)
$gri = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(190, 200, 190))
$g.DrawString($SplashBaslik, (New-Object System.Drawing.Font("Segoe UI", 26, [System.Drawing.FontStyle]::Bold)), [System.Drawing.Brushes]::White, 28, 40)
$g.DrawString($SplashAlt, (New-Object System.Drawing.Font("Segoe UI", 15)), $gri, 30, 98)
$g.DrawString("Oda 1: Ateş Altında Yaralıya Müdahale   •   Oda 2: Taktik Güvenli Alan / Tahliye", (New-Object System.Drawing.Font("Segoe UI", 10)), $gri, 30, 138)
$g.DrawString("Demo yapısı – örnek paket üzerinde, $(Get-Date -Format 'dd.MM.yyyy')", (New-Object System.Drawing.Font("Segoe UI", 10)), $gri, 30, 200)
$bmp.Save((Join-Path $spDir "Splash.bmp"), [System.Drawing.Imaging.ImageFormat]::Bmp)
$g.Dispose(); $bmp.Dispose()
Write-Host "[1/4] Splash.bmp yazıldı"

# 2) Game.ini – pencere başlığı (Development yapıda sonuna '(64-bit Development ...)' eklenir; Shipping'de eklenmez)
$cfgDir = Join-Path $Paket "TCCC\Saved\Config\Windows"
New-Item -ItemType Directory -Force $cfgDir | Out-Null
@(
  "[/Script/EngineSettings.GeneralProjectSettings]",
  "ProjectDisplayedTitle=$Baslik",
  "CopyrightNotice=$SplashAlt – Duvar Simülasyon Yazılımı (demo)",
  "Description=3 duvar / 3 projektör simülasyon odası"
) | Set-Content -Path (Join-Path $cfgDir "Game.ini") -Encoding UTF8
Write-Host "[2/4] Game.ini yazıldı (başlık: $Baslik)"

# 3) GameUserSettings.ini – [ScalabilityGroups] bölümünü profile göre değiştir
$profiller = @{
  epic  = @{ sg = 3; coz = 100 }
  orta  = @{ sg = 2; coz = 75 }
  dusuk = @{ sg = 1; coz = 67 }
}
$p = $profiller[$Profil]
$sgSatirlar = @("[ScalabilityGroups]", "sg.ResolutionQuality=$($p.coz)") + (
  @("ViewDistance", "AntiAliasing", "Shadow", "GlobalIllumination", "Reflection", "PostProcess", "Texture", "Effects", "Foliage", "Shading", "Landscape") |
    ForEach-Object { "sg.${_}Quality=$($p.sg)" }
)
$gusYol = Join-Path $cfgDir "GameUserSettings.ini"
$eski = if (Test-Path $gusYol) { Get-Content $gusYol } else { @(";METADATA=(Diff=true, UseCommands=true)") }
$yeni = New-Object System.Collections.Generic.List[string]
$atla = $false
foreach ($satir in $eski) {
  if ($satir -match '^\[(.+)\]') { $atla = ($matches[1] -eq "ScalabilityGroups") }
  if (-not $atla) { $yeni.Add($satir) }
}
($yeni + @("") + $sgSatirlar) | Set-Content -Path $gusYol -Encoding UTF8
Write-Host "[3/4] GameUserSettings.ini profili: $Profil (sg.*=$($p.sg), ölçek %$($p.coz))"

# 4) Masaüstü kısayolu (isteğe bağlı)
if ($Kisayol) {
  $ico = Join-Path $spDir "simge.ico"
  $ib = New-Object System.Drawing.Bitmap 256, 256
  $ig = [System.Drawing.Graphics]::FromImage($ib)
  $ig.SmoothingMode = "AntiAlias"; $ig.TextRenderingHint = "AntiAliasGridFit"
  $ig.Clear([System.Drawing.Color]::FromArgb(18, 28, 22))
  $ig.FillRectangle($kirmizi, 0, 0, 256, 22)
  $ig.DrawString("DS", (New-Object System.Drawing.Font("Segoe UI", 110, [System.Drawing.FontStyle]::Bold)), [System.Drawing.Brushes]::White, 18, 50)
  $ig.Dispose()
  $icon = [System.Drawing.Icon]::FromHandle($ib.GetHicon())
  $fs = [System.IO.File]::Create($ico); $icon.Save($fs); $fs.Close(); $ib.Dispose()

  $fov = "-ini:Engine:[/Script/Engine.LocalPlayer]:AspectRatioAxisConstraint=AspectRatio_MaintainYFOV"
  $lnk = Join-Path ([Environment]::GetFolderPath("Desktop")) "Duvar Simülasyonu (demo).lnk"
  $ws = New-Object -ComObject WScript.Shell
  $s = $ws.CreateShortcut($lnk)
  $s.TargetPath = $exe
  $s.Arguments = "..\..\..\TCCC\TCCC.uproject -fullscreen -ResX=1920 -ResY=1080 -ForceRes $fov"
  $s.WorkingDirectory = Split-Path $exe
  $s.IconLocation = "$ico,0"
  $s.Description = $Baslik
  $s.Save()
  Write-Host "[4/4] Kısayol: $lnk"
} else {
  Write-Host "[4/4] Kısayol atlandı (-Kisayol ile eklenir)"
}
Write-Host "Bitti. Paket: $Paket"
