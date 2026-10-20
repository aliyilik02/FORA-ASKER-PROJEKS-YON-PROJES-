# Örnek çalışma incelemesi – "TCCC" paketi

İncelenen klasör: `C:\Users\<kullanıcı>\Desktop\Windows` (20 Ekim 2026). Klasördeki hiçbir dosya
değiştirilmedi veya silinmedi; yalnızca okundu (manifest dosyaları, log, ini ve pak içindeki
metinler). `.exe` çalıştırılmadı.

## 1. Bu ne?

| Soru | Bulgu |
|---|---|
| Motor | **Unreal Engine 5.5.4** (`++UE5+Release-5.5-CL-40574608`), Windows 64-bit, DirectX 12 / SM6 |
| Tür | **Paketlenmiş (cooked) oyun**; kaynak proje değil. `.uproject` ve içerik `.pak/.ucas` içinde |
| Proje adı | `TCCC` (Tactical Combat Casualty Care – "ateş altında yaralıya müdahale") |
| Yapı türü | **Development** (Shipping değil): `~` konsol açık, `-log` ile log penceresi açılır, tüm komut satırı parametreleri çalışır, `Saved/` klasörü paketin içine yazılır |
| Çalıştırıcı | `TCCC.exe` (168 KB, *BootstrapPackagedGame*): yalnızca `Engine\Binaries\Win64\UnrealGame.exe ..\..\..\TCCC\TCCC.uproject` komutunu çalıştıran sarmalayıcı; kendisine verilen parametreleri aynen iletir. Proje **Blueprint-only** (projeye özel C++ exe yok) |
| Boyut | Engine 703 MB + içerik 2,6 GB (`pakchunk0-Windows.ucas`), toplam ≈ 3,3 GB |
| Haritalar | `Menu` (ana menü), `Mountain_5` (dağlık), `Orman` (ormanlık), `CitySuburbs` (meskûn mahal) |
| Gökyüzü/hava | **Ultra Dynamic Sky 9.0B** (mevsim, saat, bulut, sis, yağış, rüzgar parametrik) |
| Ses | XAudio2, OGG, Lyra tabanlı submix/reverb yapısı; konumsal ses eklentisi yok ("built-in") |
| Render ayarları | Lumen GI + Lumen yansıma, Virtual Shadow Maps, Nanite, Ray Tracing açık, TSR, scalability "Epic" (sg.* = 3) |

Klasör yapısı:

```
Windows\
  TCCC.exe                          bootstrap (UnrealGame.exe'yi başlatır)
  Manifest_*Files_Win64.txt         paketleme manifestleri (8.912 dosya listesi)
  Engine\Binaries\Win64\UnrealGame.exe   asıl oyun (300 MB) + .pdb
  Engine\Config\StagedBuild_TCCC.ini     boş
  TCCC\Content\Paks\pakchunk0-Windows.{pak,ucas,utoc}   tüm içerik (IoStore)
  TCCC\Saved\Logs\TCCC.log          son çalıştırma günlüğü (bu bilgisayarda 20.10.2026 12:13–12:16)
  TCCC\Saved\Config\Windows\GameUserSettings.ini
  TCCC\Saved\SaveGames\Panorama.sav
```

Çalıştırma akışı (logdan): `Menu` haritası → `TCCC_MainMenu` game mode (UMG menü, "Panorama" kaydı
yükleniyor) → kullanıcı sahne seçiyor → `Mountain_5` + `TCCCGameMode` + `TCCCPawn` (birinci şahıs
kamera). `Orman` ve `CitySuburbs` de aynı menüden açılıyor.

## 2. Eklentiler – bizim için kritik olanlar

| Eklenti | Pakette var mı? | Sonuç |
|---|---|---|
| **nDisplay** (DisplayCluster) | **Yok** | `-dc_cfg` parametresi çalışmaz; `unreal/nDisplay/uc-duvar.ndisplay` bu paketle kullanılamaz |
| **Remote Control API** | **Yok** | Köprü sunucusu (`UNREAL_MOD=gercek`) bu pakete bağlanamaz; port 30010 açılmaz |
| DMX / Art-Net | Yok | Işık köprü üzerinden sürülmeye devam eder (sorun değil) |
| Niagara, MetaSound, ResonanceAudio, LiveLink, Takes | Var (motor varsayılanı) | — |
| Proje eklentileri (`TCCC.uproject`) | `Cargo` (Fab/Megascans köprüsü), `ModelingToolsEditorMode` (yalnız editör) | — |

Özet: **örnek paket "sadece oynatılır"; kontrol paneli entegrasyonu ve nDisplay bu paket üzerinde
yapılamaz.** Bunun için kaynak proje (`TCCC.uproject`, `Content/`, `Config/`, `Plugins/`) gerekir.

## 3. Yapılandırma dosyaları

Pak içinden okunabilen `DefaultGameUserSettings.ini`:

```ini
[/Script/Engine.GameUserSettings]
ResolutionSizeX=1280
ResolutionSizeY=720
FullscreenMode=2            ; 2 = pencere
bUseVSync=False
bUseDesktopResolutionForFullscreen=False
[ScalabilityGroups]
sg.*Quality=3               ; Epic
```

`DefaultEngine.ini`'den logda görünenler: `r.setres=1280x720`, Lumen (`r.DynamicGlobalIlluminationMethod=1`,
`r.ReflectionMethod=1`), `r.Shadow.Virtual.Enable=1`, `r.RayTracing=1`, `r.AllowStaticLighting=0`,
`r.AntiAliasingMethod=4` (TSR), `r.MSAACount=2`, Enhanced Input. Çalıştırma sonrası
`Saved\Config\Windows\GameUserSettings.ini` tam ekran modunu `1` (kenarlıksız tam ekran) yapmış.

Komut satırı parametreleri (`-ResX -ResY -WinX -WinY -windowed -fullscreen -ForceRes -log`)
Development yapıda **kullanılabilir**; `-ini:Engine:[Bölüm]:Anahtar=Değer` ile ini değeri de
dosya değiştirmeden verilebilir. (Bu bilgisayarda henüz denenmedi – bkz. §5.)

## 4. Bu bilgisayar

| | |
|---|---|
| Makine | MONSTER ABRA A7 V12.1 dizüstü, i5-10300H, 16 GB RAM |
| GPU | NVIDIA GeForce GTX 1650 (4 GB) + Intel UHD; sürücü 32.0.16.1074 |
| Ekran | **1 adet**, 1920×1080 (`\\.\DISPLAY1`) |

Örnek bu makinede 20.10.2026 12:13'te çalıştırılmış; log hatasız kapanmış. 3 ekran bağlı olmadığı
için yayma testi yapılamadı. Notlar:

- GTX 1650, 3×1080p (5760×1080) + Lumen + VSM için yetersizdir; tek 1080p'de bile "Epic" ayarda
  düşük kare hızı beklenir. Demo için `sg.*` düşürülmeli (konsoldan `sg.GlobalIlluminationQuality 1` vb.).
- Dizüstü GPU'larda NVIDIA Surround genelde kapalıdır (Optimus). 3 projektör testi için masaüstü
  render bilgisayarı gerekir.

## 5. 3 projeksiyona yaymanın yolları (bu örnek için)

| Yol | Mümkün mü? | Komut |
|---|---|---|
| (a) NVIDIA Surround/Mosaic veya AMD Eyefinity ile tek 5760×1080 ekran, tam ekran | **Evet – en kısa yol** | `UnrealGame.exe ..\..\..\TCCC\TCCC.uproject -fullscreen -ResX=5760 -ResY=1080 -ForceRes` |
| (b) Windows "Genişlet" + çerçevesiz geniş pencere | Evet | `... -windowed -ResX=5760 -ResY=1080 -WinX=0 -WinY=0 -ForceRes` |
| (c) nDisplay (`uc-duvar.ndisplay`) | **Hayır** (eklenti pakette yok) | — |

Her iki yolda da şu parametre eklenmelidir, yoksa UE 48:9 oranında görüşü **dikeyde kırpar**
(Vert-):

```
-ini:Engine:[/Script/Engine.LocalPlayer]:AspectRatioAxisConstraint=AspectRatio_MaintainYFOV
```

Bununla 16:9'daki dikey görüş açısı korunur; yatay açı ≈ 143° olur. Alternatif: oyun içinde
`~` konsolu açıp `r.SetRes 5760x1080w` yazmak (Development yapı olduğu için konsol açıktır).

Hazır betik: `araclar/ornek-tccc-genis-ekran.bat` (paket klasörü, genişlik, yükseklik parametre
olarak verilir; 1 = geniş pencere, 2 = tam ekran, 3 = tek ekranda deneme). `-log` ile ayrı log
penceresi açılır, hata olursa oradan görülür. **Betik örnek klasöre hiçbir şey yazmaz; ancak UE
çalışırken `TCCC\Saved\` altına log/ayar yazar** – klasörü olduğu gibi korumak isterseniz önce
kopyasından çalıştırın.

Beklenen sınırlamalar:

- Tek düz projeksiyon: duvarlar U biçiminde (sol/sağ duvar 90°) ise köşelerde görüntü kırılır.
  Doğru çözüm nDisplay'de 3 viewport + 3 `screen` (`docs/3-projeksiyon-tek-ekran.md`).
- Ana menü ve HUD 16:9 için tasarlanmış; 48:9'da düğmeler kenarlara dağılır ya da ortada küçük kalır.
- 1280×720 isteyen `GameUserSettings.ini` ilk karede çözünürlüğü geri çekebilir; `-ForceRes` bunu önler.

## 6. Projemize taşınabilecekler

Eşleşme tablosu (şartname maddeleri → örnekteki varlıklar):

| İhtiyaç | Örnekte | Not |
|---|---|---|
| Bölge sahneleri (`daglik`, `ormanlik`, `meskun_mahal`) | `Mountain_5`, `Orman`, `CitySuburbs` haritaları | `us_bolgesi` ve `kirsal_acik_arazi` yok |
| Ortam (mevsim/saat/bulut/sis/yağış/rüzgar) | Ultra Dynamic Sky 9.0B | `OrtamAyarla` parametreleri UDS değişkenlerine doğrudan bağlanabilir |
| Patlama | `GrenadePack/Particles/VFX_GrenadeEXP_dirt`, `PyroParticlePack` ateş | |
| Toz / duman | `NS_Smoke_Granade`, `NS_Ambiance_Smoke_01_Small`, `MSFX_MilitaryWarFxPack/FX/Smoke` | |
| İzli mermi, mermi vızıltısı, namlu alevi | `BallisticsVFX` (Muzzle, Impacts, SFX/Impacts + attenuation'lar), `BulletImpactGenerator` | İzli mermi (tracer) emitter'ı ayrıca yapılmalı |
| Silah sesleri | `HAVSIM/SOUND/Gun_Sounds_Pro_HD_Remake`, `ACM_Assault_Rifle_Shot_Cue` | |
| Oda 2 helikopter | UH-60A modeli, `NS_Heli_Ground_Dust`, `NS_Helicopter_Propeller_PressureSmoke`, Sequencer: `HelicopterArrive`, `OrmanHelicopterArrive` | "yaklaşıyor / iniyor" durumları için hazır animasyon |
| Zırhlı araç | Kirpi modeli + `KirpiCome` sekansı | Tahliye senaryosu için |
| Askerler / AI | `Modular_soldier_01`, `AI_Soldier`, `BakedAnims` | |
| Meskûn mahal (Türkiye) | `HAVSIM` (virane, türbe, Ankara evi, kale köşe ev), `IstanbulStreets`, `MiddleEast`, `DBK` modüler binalar | |
| Ses mimarisi | `Audio/Submixes`, `Audio/Classes`, reverb IR | Konumsal ses için Spatialization ayarı eklenecek |

**Kısıt:** Paketteki varlıklar *cooked*'tır; UE editörüne geri alınamaz. Taşıma ancak kaynak
projeden yapılır. Pazar yeri paketleri (UDS, DBK, BallisticsVFX, MSFX, GrenadePack, Pyro,
Hollywood_Vol3, SpringLandscape, Poplar_Forest, DistantMountains, Megascans, VigilanteContent)
lisans sahibinin Epic/Fab hesabında olmalıdır.

## 7. Önerilen yol

1. Örneği hazırlayan taraftan **kaynak projeyi** isteyin (UE 5.5.4; `TCCC.uproject`, `Content`,
   `Config`, `Plugins`; Fab paketleri hesap üzerinden).
2. Kaynak projede **nDisplay** ve **Remote Control API** eklentilerini açın, `BP_SimulasyonYoneticisi`
   ve `DuvarSimulasyonu` preset'ini ekleyin (`docs/unreal-kurulum.md`). Menü yerine doğrudan sahne
   açılışı (varsayılan harita) ayarlayın; sahne seçimi panelden `BolgeYukle` ile yapılsın.
3. `unreal/nDisplay/uc-duvar.ndisplay` ile 3 viewport'u sahneye bağlayın; duvar ölçülerini girin.
4. Kaynak gelene kadar demo: Surround/Eyefinity + `araclar/ornek-tccc-genis-ekran.bat`.
5. Render bilgisayarı: en az RTX 4070 (12 GB) sınıfı, 3 video çıkışı; kenar bindirme/warp
   gerekiyorsa RTX A4000 + Mosaic ya da harici warp cihazı. Teslimatta **Shipping** paket.

## 8. Riskler

- **Kaynak proje yoksa** entegrasyon (panel, nDisplay, Remote Control) mümkün değildir; örnek
  yalnızca "nasıl görünecek" demosu olarak kullanılabilir.
- Development yapı: hata ayıklama kodu ve `.pdb` içerir, performansı Shipping'den düşüktür.
- Lumen + VSM + RT, 3×1080p'de ağırdır; `sg.*` düşürme, Lumen yerine SSGI/baked ışık ya da
  nDisplay `bufferRatio` < 1 gerekebilir.
- Tek düz projeksiyon U-şekilli duvarda perspektifi bozar; nihai teslimat nDisplay ister.
- UI 16:9; geniş ekranda yeniden düzenlenmeli (ya da eğitmen panelinden yönetildiği için kaldırılmalı).
- Pak şifresiz; içerik lisansları müşteriye devredilemez, hesap gerekir.
- `Saved/` paket klasörüne yazıldığı için salt okunur konumdan (ağ paylaşımı, USB) çalışmayabilir.

## 9. Çalıştırma sonucu (20 Ekim 2026, kopyadan, onayla)

Paket `robocopy` ile `Desktop\Projeler\ornek-tccc-kopya` klasörüne kopyalandı (3,24 GB, 15 sn);
orijinal klasöre dokunulmadı. Tüm denemeler kopyadaki `Engine\Binaries\Win64\UnrealGame.exe`
ile yapıldı; günlükler kopyanın `TCCC\Saved\Logs\` altına yazıldı.

**Komut satırı doğrulandı.** `UnrealGame.exe ..\..\..\TCCC\TCCC.uproject -windowed -ResX=1920
-ResY=1080 -WinX=0 -WinY=0 -ForceRes -ini:Engine:[/Script/Engine.LocalPlayer]:AspectRatioAxisConstraint=AspectRatio_MaintainYFOV -log`
ile açıldı; log `LogInit: Command Line:` satırında parametrelerin tamamını gösterdi, pencere
1920×1080 oldu, adaptör 0 (GTX 1650) seçildi, Menu haritası 0,5 sn'de yüklendi. Harita adı
parametre olarak verilince (`... TCCC.uproject /Game/Maps/CitySuburbs ...`) menüsüz doğrudan
eğitim haritası açıldı (1,1 sn). `-ExecCmds="stat fps,sg.GlobalIlluminationQuality 1,..."`
çalıştı (Development yapı; log: `[GlobalIlluminationQuality@1]`). Dolayısıyla betikteki
seçenek 1/2 sahada 3 ekranlı masaüstünde çalışacaktır.

**Oyunun içeriği (ekranda görülen):** ana menü "FORA GRUP EĞİTİM SİMÜLASYON" – Meskûn Mahal /
Dağlık Alan / Orman / Çıkış (sağ-sol ile seçim, Enter ile başlat; "model değişimi için yukarı
aşağı"), sürüm "OCTAGON 2025 V1B". Oyun içi efekt menüsü: Çatışma, Vurulma, Zırhlı Araç,
Helikopter (pasif), Sis Bombası, El Bombası, Döngü Süresi, Menü. Ayar menüsü: Current Res,
Overall Scalability, Post Process / VFX / Reflection / Texture / GI / View Distance / AA /
Foliage / Texture Stream Pool kademeleri. Bu liste panelimizdeki `EfektTetikle` türleriyle
doğrudan eşleşiyor: El Bombası → `patlama`, Sis Bombası → `toz_duman`, Çatışma → `gurultu`
(silah sesleri), Zırhlı Araç → Kirpi, Helikopter → Oda 2 `helikopter`.

**Performans (GTX 1650 4 GB, `stat fps` / `stat unit`):**

| Ayar | Sahne | FPS |
|---|---|---|
| Paket varsayılanı (tüm kademeler 3, 1920×1080) | Meskûn Mahal | ~8 |
| `sg.*` 1, `r.ScreenPercentage 75`, 1920×1080 | Ana menü | ~46 |
| `sg.*` 1, `r.ScreenPercentage 75`, 1920×1080 | Meskûn Mahal | ~7 |
| `sg.*` 0, `r.ScreenPercentage 60`, `r.Shadow.Virtual.Enable 0`, 1280×720 | Meskûn Mahal | ~19 (Game 5,7 ms, Draw 53 ms, GPU 52 ms, 816 draw, 1,25 M üçgen) |

Ekranda "TEXTURE STREAMING POOL OVER 157.6 MiB BUDGET" uyarısı; süreç Epic ayarda 6,2 GB
bellek kullandı. Darboğaz hesap gücü değil **ekran kartı belleği** (Nanite + VSM + Lumen
tamponları 4 GB'ı dolduruyor, dokulara 158 MB kalıyor). Kalite kademesi düşürmek bu yüzden
neredeyse hiç kazandırmıyor. Ayrıca `r.D3D12.PSO.DiskCache=0`: her açılışta 50–100 PSO derleniyor,
ilk 1–2 dakika takılma bundan. Sonuç ve donanım önerileri: `docs/donanim-onerileri.md`.

Ray tracing: "Ray tracing is disabled. Reason: not supported by current RHI" (GTX 1650'de DXR
yok) → Lumen yazılımsal yolda çalıştı; bu sorun değil, RTX kartta donanımsal yola geçer.

## 10. Kaynak proje olmadan kişiselleştirme (kopyada denendi)

Pak dosyasına dokunmadan, yalnızca diskteki gevşek dosyalarla yapılabilenler. Hepsi
`araclar/ornek-kisisellestir.ps1` ile tek komutta uygulanır (orijinal klasörü reddeder, kopyaya yazar).

| Dokunuş | Nasıl | Durum |
|---|---|---|
| Açılış splash görseli (kendi başlık/logomuz) | `TCCC\Content\Splash\Splash.bmp` (24 bit BMP; UE pak dışındaki bu dosyayı okur) | ✔ denendi, açılışta 3–4 sn görünüyor |
| Pencere başlığı | `TCCC\Saved\Config\Windows\Game.ini` → `[/Script/EngineSettings.GeneralProjectSettings] ProjectDisplayedTitle=...` | ✔ denendi: "Duvar Simülasyonu – Eğirdir Dağ Komando Okulu (64-bit Development PCD3D_SM6)" |
| Telif / açıklama metni | aynı dosyada `CopyrightNotice`, `Description` | ✔ yazılıyor (görünür yeri sınırlı) |
| Başlangıç grafik profili | `GameUserSettings.ini` `[ScalabilityGroups]` (epic / orta / düşük) | ✔ |
| Doğrudan eğitim haritasıyla açılış (menüsüz) | komut satırında `/Game/Maps/CitySuburbs` (veya `Mountain_5`, `Orman`) | ✔ denendi |
| Masaüstü kısayolu: kendi simgemiz + adımız + doğru parametreler | `.lnk` + üretilen `simge.ico` | ✔ (`-Kisayol`) |
| Panelden "Örneği başlat" düğmesi | köprü `POST /api/ornek/baslat` → `UnrealGame.exe` parametrelerle (aynı PC) | yapılabilir, ~1 saatlik iş |

Yapılamayanlar (kaynak proje gerekir): ana menü yazıları ve logosu ("FORA GRUP EĞİTİM
SİMÜLASYON" UMG widget'ı pak içinde), giriş videosu (WindowsMoviePlayer eklentisi pakette yok),
harita/efekt içeriği, pencere başlığındaki "(64-bit Development PCD3D_SM6)" eki (Shipping
paket gerekir). `TCCC.exe` simgesini değiştirmek binary düzenleme ister; kısayol simgesi yeterli.

## 11. "Kaliteyi düşürmeden" çalıştırma denemesi

Epic kademe korunup yalnızca TSR ölçekleme (`r.ScreenPercentage 67`) ve yarım doku
(`r.Streaming.MipBias 1`) verildi: yine ~8 FPS, anlık 3 sn'lik takılmalar. `stat rhi` GPU
bellek sayaçları (1920×1080, Meskûn Mahal):

| Sayaç | MB |
|---|---|
| UAV Texture Memory (Lumen / VSM / Nanite tamponları) | 2785 |
| Render Target 2D | 917 |
| Structured Buffer | 575 |
| Reserved Buffer (committed) | 528 |
| Reserved Texture (committed) | 512 |
| Texture 2D (dokular) | 173 |
| Vertex + Index + diğer | ~290 |
| **Toplam** | **≈ 5,7 GB** (kart: 3,9 GB) |

Sonuç: paketin bu haliyle GPU bellek ihtiyacı ≈ 6 GB; 4 GB kartta dokulara 173 MB kalıyor ve her
kare sistem belleğinden taşınıyor. Kalite kademesi, ölçekleme veya doku küçültme bunu çözmüyor;
Lumen/VSM/Nanite tamponları sabit. Kaynak olmadan "aynı görüntü, daha az gereksinim" mümkün
değil. Alt sınır: **8 GB VRAM** (ör. ikinci el RTX 3060 12 GB / RTX 4060 8 GB bile 1080p'de
bu paketi akıcı açar); kaynak proje gelirse pişirilmiş ışık + Nanite kapalı sürümle GTX 1650'de
de 1080p 60 FPS alınabilir.
