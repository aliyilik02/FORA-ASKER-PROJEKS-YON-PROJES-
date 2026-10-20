# Donanım önerileri ve "elimizdekilerle demo" planı

Tarih: 20 Ekim 2026. Durum: projektör yok, render bilgisayarı yok, ışık kontrolcüsü yok, duvar
ölçüleri ileride netleşecek. Elde olan: MONSTER ABRA A7 V12.1 dizüstü (i5-10300H, 16 GB RAM,
GTX 1650 4 GB, tek 1920×1080 ekran), örnek TCCC paketi (kaynak proje yok), köprü + kontrol paneli.

## 1. Mevcut dizüstü: örnek neden 8 FPS veriyor?

Örnek paket bu dizüstünde kopyadan çalıştırıldı (`docs/ornek-calisma-inceleme.md`, "Çalıştırma
sonucu"). Ölçümler (GTX 1650, `stat fps`):

| Ayar | Sahne | FPS |
|---|---|---|
| Paket varsayılanı: tüm kalite kademeleri 3 (Epic), 1920×1080 | Meskûn Mahal | ~8 |
| Düşük: `sg.*` 1, `r.ScreenPercentage 75`, 1920×1080 | Ana menü | ~46 |
| Düşük: `sg.*` 1, `r.ScreenPercentage 75`, 1920×1080 | Meskûn Mahal | ~7 (değişmedi) |
| En düşük: `sg.*` 0, `r.ScreenPercentage 60`, VSM kapalı, 1280×720 | Meskûn Mahal | ~19 (GPU 52 ms) |

Sebep "stabilizasyon" değil; paketin kullandığı özellikler + ekran kartı belleği:

- Paket **Lumen GI + Lumen yansıma + Virtual Shadow Maps + Nanite + TSR** ile, hepsi **Epic**
  kademede paketlenmiş. Bunlar UE5'in en pahalı özellikleri; gerçek zamanlı global aydınlatma
  her karede hesaplanır. RDR2 (RAGE motoru, 2018) ışığı önceden pişirilmiş (baked), konsol
  hedefli bir oyundur; GTX 1650 o oyunun hedef sınıfıdır, UE5 Lumen'in değil. Epic'in Lumen
  için önerdiği sınıf RTX 20xx/30xx ve üstüdür.
- **4 GB VRAM** yetmiyor. Ekranda "TEXTURE STREAMING POOL OVER 157.6 MiB BUDGET" uyarısı
  çıkıyor: Nanite, VSM ve Lumen tamponları belleği doldurunca dokulara 158 MB kalıyor, dokular
  her kare sistem belleğinden taşınıyor (log: "3935MB dedicated, 8086MB shared"). Kalite
  kademelerini düşürmek bu yüzden tek başına çözmüyor; darboğaz hesap gücü değil **bellek**.
  `stat unit` ölçümü (720p, en düşük): Game 5,7 ms, Draw 53 ms, GPU 52 ms → iş tamamen GPU tarafında.
- Ray tracing kapandı (log: "Ray tracing is disabled. Reason: not supported by current RHI")
  → Lumen yazılımsal (software) yolda; bu zaten daha ucuz, sorun değil.
- **Development yapı + PSO önbelleği yok** (log: `r.D3D12.PSO.DiskCache=0`): her açılışta
  50–100 yeni PSO derleniyor; ilk 1–2 dakika "takılma" bundan. Shipping + PSO cache ile
  paketlense ilk dakika da akıcı olurdu.

Hemen uygulanabilecekler (bu makinede sınırlı kazanç verir):

1. Oyun içi ayar menüsü: tüm kalite kademeleri 3 → **1**, "overall scalability" 100 → **70**.
2. Komut satırı (Development yapıda çalışır): `araclar/ornek-tccc-genis-ekran.bat` **seçenek 5**
   (`-ExecCmds="sg.GlobalIlluminationQuality 1,sg.ShadowQuality 1,...,r.ScreenPercentage 75"`).
3. Kalıcı: kopyadaki `TCCC\Saved\Config\Windows\GameUserSettings.ini` içine
   `[ScalabilityGroups]` bölümü (`sg.GlobalIlluminationQuality=1`, `sg.ShadowQuality=1`,
   `sg.ReflectionQuality=1`, `sg.PostProcessQuality=1`, `sg.TextureQuality=1`, `sg.ResolutionQuality=75`).
4. Dizüstü fişte; Windows güç modu "En iyi performans"; NVIDIA Control Panel → "Tercih edilen
   grafik işlemcisi: NVIDIA" (log GTX 1650'yi seçmiş, yine de kontrol edin); Chrome ve diğer
   GPU kullanan uygulamalar kapalı (VRAM paylaşılıyor).
5. İkinci açılış ilkinden akıcıdır (NVIDIA sürücü shader önbelleği).

Gerçek çözüm iki yoldan biri: (a) kaynak projede eğitim haritaları için Lumen yerine pişirilmiş
ışık (Lightmass) veya SSGI, VSM yerine CSM, dokular 2K, Shipping + PSO cache ile paketleme;
(b) asıl hedef olan RTX sınıfı render bilgisayarı (§3). GTX 1650 nihai sistem için uygun
değildir; menü, panel ve ışık demosu için kullanılabilir.

## 2. Elimizdekilerle demo: aşamalı plan

**Aşama 0 — bugün, bu dizüstüyle (hepsi hazır):**

1. `baslat.bat` → köprü (simülasyon modu) + panel. Panelde oda/bölge/ortam/efekt akışı
   gösterilir; her düğme köprü günlüğüne `[UE simülasyon] ...` yazar.
2. Örnek paket kopyadan: `araclar/ornek-tccc-genis-ekran.bat "<kopya klasörü>"` → seçenek
   **5** (düşük kalite, tek ekran) veya **4** (1920×360, üç duvarın oranını tek ekranda gösterir).
3. Işık zinciri, donanımsız: `node araclar/artnet-dinle.mjs` açık tutulur; köprü
   `ARTNET_AKTIF=1 ARTNET_HEDEF=127.0.0.1` ile başlatılır; panelde ortam ışığı veya Patlama →
   dinleyicide DMX kanalları (dimmer/R/G/B/strobe) ekranda akar.

Sınır: panel ile örnek paket **birbirine bağlı değil** (pakette Remote Control yok). İkisi yan
yana "konsept" olarak gösterilir.

**Aşama 1 — 1 projektör (veya büyük TV) + tablet:** dizüstü HDMI → projektör, örnek tam ekran
1080p; panel tablette (aynı Wi-Fi; internet gerekmez, basit bir router yeter). Dizüstünün HDMI
+ (varsa) USB-C DisplayPort çıkışı en fazla 2 harici ekran verir; 3 duvar bu makineyle olmaz.

**Aşama 2 — kaynak proje gelince (render PC olmadan da):** nDisplay + Remote Control açılır;
tek ekranda `unreal/nDisplay/uc-duvar-onizleme.ndisplay` (1920×360, üç 640×360 viewport) ile
3 duvar görüntüsü perspektifi doğru biçimde önizlenir; köprü `UNREAL_MOD=gercek` ile bağlanır.
Bu aşamada bile GTX 1650'de düşük kalite ve hafif bir test haritası gerekir.

**Aşama 3 — render PC + 3 projektör:** `uc-duvar.ndisplay`, saha ölçüleri, MPCDI gerekiyorsa
kalibrasyon.

## 3. Render bilgisayarı (önerilen özellikler)

Hedef: 5760×1080 (3 × 1080p), Lumen + VSM + Nanite, sabit 60 FPS, tek bilgisayar, 4 çıkış.

| Bileşen | Önerilen | Asgari (demo) | Neden |
|---|---|---|---|
| Ekran kartı | NVIDIA GeForce **RTX 5080 16 GB** (veya RTX 4080 Super 16 GB) | RTX 5070 Ti 16 GB / RTX 4070 Ti Super 16 GB | 3×1080p Lumen 60 FPS; 16 GB VRAM; 3×DP + 1×HDMI → 3 projektör + operatör ekranı; NVIDIA Surround |
| İşlemci | AMD Ryzen 7 9800X3D veya Intel Core Ultra 7 265K | Ryzen 7 7700 / Core i7-14700 | Blueprint, Niagara, ses ana iş parçacığında |
| Bellek | 64 GB DDR5 | 32 GB | Açık dünya haritaları + editör aynı makinede |
| Disk | 2 TB NVMe (PCIe 4.0) | 1 TB NVMe | Proje + paket + cache |
| Güç kaynağı | 1000 W 80+ Gold | 850 W | 5080 tepe çekişi |
| Video çıkışı | 3× DisplayPort 2.1 + 1× HDMI 2.1 (kart üzerinde) | aynı | Projektör HDMI ise aktif DP→HDMI 2.0 adaptör |
| Ağ | 2× Gigabit Ethernet | 1× | Biri kontrol/Art-Net LAN, biri yedek |
| İşletim sistemi | Windows 11 Pro | Windows 11 Pro | nDisplay/Switchboard Windows |
| Diğer | UPS 1000 VA, sessiz kasa, 24/7 soğutma | — | Eğitim günü boyunca açık |

Yaklaşık maliyet (Ekim 2026, KDV hariç, teyit edilmeli): önerilen 2.500–3.500 $, asgari 1.800–2.300 $.

- **Profesyonel kart gerekir mi?** NVIDIA RTX PRO 4500 Blackwell / RTX 4500 Ada: Mosaic (kenar
  bindirme sürücüde), Quadro Sync (birden fazla PC genlock). Tek PC + nDisplay MPCDI ile bunlara
  gerek yok; 2–3 kat fiyat. Sadece 2+ render PC gerekirse düşünülür.
- **Dizüstü olur mu?** RTX 5080/5090 dizüstü + Thunderbolt dock 3 çıkış verebilir ama termal
  kısıtlama ve dock kararsızlığı yüzünden önerilmez. Masaüstü alın.
- Mevcut GTX 1650 dizüstü **kontrol bilgisayarı** olarak kalır: köprü + panel + Art-Net bu
  makinede çalışır; render PC sadece UE.

## 4. Projektör

Mesafe formülü: **yansıtma mesafesi = throw oranı × görüntü genişliği**. 6 m genişliğinde duvar için:

| Projektör tipi | Throw oranı | Gerekli mesafe (6 m duvar) | Not |
|---|---|---|---|
| Standart lens | 1,3 – 2,0 | 7,8 – 12 m | Oda derin değilse olmaz; eğitmen/er gölgesi düşer |
| Kısa mesafe (ST) | 0,5 – 0,8 | 3,0 – 4,8 m | **Önerilen**: tavana askı, gölge az |
| Ultra kısa (UST) | 0,25 – 0,35 | 1,5 – 2,1 m | Gölge yok ama 6 m'lik görüntüde geometri zor, 3 adet hizalamak güç |

Parlaklık: duvar 6 × 3,375 m ≈ 20 m². 5000 lümen → ~250 lux (loş oda, mat boya, yeterli);
oda aydınlıksa 6000–7000 lümen.

Seçim ölçütleri (3 adet, **aynı model**):

- Lazer ışık kaynağı (20.000 saat, lamba değişimi yok, anında açılma)
- WUXGA 1920×1200 veya Full HD 1920×1080; 4K gereksiz (render yükü 4 kat)
- ≥ 5000 ANSI lümen (ST sınıfında 4000 kabul edilebilir, oda karartılırsa)
- Lens shift + keystone + 4 köşe/eğri düzeltme (ince hizalama nDisplay MPCDI ile de yapılır;
  projektörde kenar karıştırma **şart değil**, yazılım yapar)
- HDMI 2.0 girişi; "oyun/düşük gecikme" modu (giriş gecikmesi ≤ 50 ms; iş projektörlerinde
  100 ms'i geçebilir, simülasyonda rahatsız eder)
- 24/7 kullanım, ≤ 35 dB fan, tavan montaj kiti

Örnek modeller (sınıf göstermek için; 2026 güncel model ve özelliklerini satın almadan önce teyit edin):

| Sınıf | Örnekler | Yaklaşık birim fiyat |
|---|---|---|
| Kısa mesafe, lazer, 1080p/WUXGA, 3600–4200 lm | Epson EB-L210SF, Panasonic PT-TMZ400, Optoma ZH450ST, BenQ LH820ST | 1.500 – 2.500 $ |
| Standart mesafe, lazer, WUXGA, 5200–7000 lm | Epson EB-L530U / EB-L630U, Panasonic PT-VMZ61 / VMZ71, BenQ LU935, Optoma ZU606T | 2.000 – 3.500 $ |

- Alternatif (küçük oda / masaüstü demo): 3 × 75–85" 4K TV. Aydınlık odada daha net, kurulum
  kolay; ama 1,9 m genişlik "duvar" hissi vermez. Nihai sistem için projektör.
- Yüzey: mat beyaz veya açık gri projeksiyon boyası (kazanç 0,8–1,0); parlak/saten boya
  sıcak nokta yapar.
- Kablolama: 10 m üzeri HDMI için aktif optik (AOC) HDMI kablo veya HDBaseT çift; DP→HDMI
  aktif adaptörler; her projektöre ayrı priz.

## 5. Işık kontrolcüsü (DMX / Art-Net)

Köprü sunucusu zaten **Art-Net** (DMX over Ethernet) üretiyor (`apps/kopru/src/artnet.ts`).
Dolayısıyla ayrı bir ışık masası gerekmez; gereken şey **Art-Net → DMX node** + armatürler.

| Parça | Öneri | Adet | Yaklaşık fiyat |
|---|---|---|---|
| Art-Net → DMX node | **DMXking eDMX1 PRO** (1 evren, PoE) – alternatif ENTTEC ODE Mk3 | 1 | 130 – 300 $ |
| LED PAR RGBW (ortam rengi) | Chauvet DJ SlimPAR Pro QZ, Cameo FLAT PRO 7, ADJ/Stairville eşdeğeri | 6 (duvar başına 2) | 100 – 300 $ |
| LED strobe (patlama flaşı) | Chauvet DJ Shocker 90, ADJ Mega Flash | 1–2 | 150 – 400 $ |
| DMX sis/haze makinesi (`toz_duman` fiziksel) | Antari Z-1000 II / HZ-400 (DMX girişli) | 1 | 300 – 800 $ |
| DMX kablo 3-pin XLR (110 Ω), sonlandırıcı, askı kelepçesi | — | takım | 100 – 200 $ |

Başlangıç seti (node + 2 PAR + 1 strobe) ≈ 500–800 $ ile köprü → gerçek ışık zinciri hemen
gösterilebilir.

Kurulum notları:

- Kanal haritası (`artnet.ts` varsayılanı): 1 Dimmer, 2 R, 3 G, 4 B, 5 Strobe. Armatürleri
  bu sıraya uyan 5 kanallı moda alın (çoğu PAR'da "5CH" veya "4CH + strobe" modu vardır);
  farklı sıra varsa `isiktanDmxKanallari` düzenlenir.
- Tüm armatürler DMX adresi **1** ile başlarsa hepsi aynı ışığı verir (ilk demo için yeterli).
  Duvar başına farklı renk istenirse adresler 1 / 6 / 11 ve köprüde 3 bölge desteği (küçük
  kod işi).
- Node'lar fabrikadan 2.x.x.x / 10.x.x.x IP ile gelir; LAN'da sabit IP verin
  (ör. 192.168.10.30) ve köprüde `ARTNET_HEDEF=192.168.10.30` (unicast). Yayın (2.255.255.255)
  yalnızca node 2.x ağındaysa çalışır.
- Donanım gelmeden test: `node araclar/artnet-dinle.mjs` (bu depo) veya ücretsiz **QLC+**
  (Art-Net girişi + sanal armatür görünümü).

## 6. Ses (kısa)

Konumsal ses için en az 4 hoparlör (ön sol/sağ, arka sol/sağ) + subwoofer:

- Basit yol: 5.1 AV alıcı + HDMI (render PC HDMI → alıcı; alıcı HDMI çıkışı operatör ekranına);
  Windows'ta varsayılan çıkış 5.1 seçilince UE otomatik konumlandırır.
- Alternatif: 4+ çıkışlı USB ses kartı (ör. Focusrite Scarlett 4i4) + 4 aktif hoparlör.

## 7. Kapalı ağ

8 portlu gigabit switch + internetsiz Wi-Fi erişim noktası (tablet için). Sabit IP planı:

| Cihaz | IP |
|---|---|
| Render PC (UE, Remote Control 30010) | 192.168.10.10 |
| Kontrol PC (köprü 4000 + panel) | 192.168.10.20 |
| Art-Net node | 192.168.10.30 |
| Eğitmen tableti | DHCP 192.168.10.100–150 |

## 8. Alım sırası

1. **Art-Net node + 2 PAR + 1 strobe** (~500–800 $): ucuz, köprü → ışık zinciri hemen gerçek olur.
2. **Render PC** (~3.000 $): kaynak proje gelir gelmez nDisplay + Remote Control testi için şart.
3. **3 projektör + askı + kablo** (~6.000–10.000 $): duvar ölçüleri ve oda derinliği netleşince.
4. Ses, sis makinesi, UPS.

Toplam donanım kabaca 10–15 bin $ (KDV hariç, Ekim 2026, teyit edilmeli).

## 9. Hâlâ gereken bilgiler

- Oda derinliği ve tavan yüksekliği (throw oranı ve askı için), odanın ortam ışığı
- Duvarlar düz mü, U şeklinde mi; birbirine açısı; mat boyanabilir mi
- Tavana montaj mümkün mü; priz ve kablo kanalı durumu
- Kaynak proje kimden, ne zaman
