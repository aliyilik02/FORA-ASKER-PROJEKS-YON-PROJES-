# Duvar Oynatıcı (hibrit yol – çalışma zamanı)

`apps/duvar-oynatici`: tarayıcıda çalışan, 3 duvara görüntü üreten oynatıcı. Köprü sunucusuna
WebSocket ile bağlanır, panelden gelen her değişikliği (bölge, mevsim, saat, hava, izli mermi,
Oda 2, efektler) anında uygular. Unreal Engine gerekmez; Unreal yalnızca içerik üretmek için
(çevrimdışı render) kullanılır. Karar ve gerekçe: `docs/sartname-analizi-ve-yaklasim.md`.

## Çalıştırma

| Durum | Komut | Adres |
|---|---|---|
| Geliştirme | `npm run dev:kopru` + `npm run dev:oynatici` | http://localhost:5174/?hud=1 |
| Saha / üretim | `npm run build` + `npm start`, sonra `oynatici-baslat.bat 5760 1080` | http://localhost:4000/oynatici/ |
| Tek ekranda önizleme | `oynatici-baslat.bat 1920 360` veya tarayıcıda pencereyi 48:9 yap | aynı |

Panelin üst çubuğunda **Oynatıcı bağlı (1)** rozeti görünür; birden fazla oynatıcı (ör. iki oda)
aynı köprüye bağlanabilir.

Tuşlar: **H** hata ayıklama katmanı · **K** kalibrasyon ızgarası (duvar sınırları, köşe çarpıları) ·
**F** tam ekran · **M** sessiz · **1 / 2 / 3** patlama / toz / izli mermi testi.

Sorgu parametreleri: `?fov=90` duvar başına yatay açı (U duvar 90; düz tek duvara 3 projektör ≈ 40),
`?doldur=1` pencereyi 48:9 oranını korumadan doldur (kiosk), `?hud=1` HUD açık başlasın.

## Nasıl çiziyor

Dünya, izleyicinin etrafında silindirik bir panoramadır; her nesnenin bir **azimutu** vardır
(0° = orta duvarın ortası, sola eksi, sağa artı). Her duvar bir yaw + fov dilimi gösterir; köşelerde
görüntü kesintisiz devam eder (`src/projeksiyon.ts`, testleri `projeksiyon.test.ts`).

İki tuval üst üste: altta **3B sahne tuvali** (`#tuval3b`, Three.js), üstte saydam **2B tuval**
(klipler, sis, yağış, HUD). 3B katman yalnızca resim panoramalarda devreye girer; video panorama ve
yer tutucu sahnede eski 2B yol çalışır. `?uc=0` ile 3B katman kapatılır.

### 3B sahne katmanı (`src/sahne3b/`, 22 Ekim 2026)

Neden: 2B bindirmelerde figür ve efekt "yapıştırma" gibi durur, patlama zemini değiştirmez. 3B
katmanda:

- **Panorama hem arka plan hem ışık kaynağıdır** (IBL, PMREM). 3B nesneler panoramanın renk ve
  parlaklığıyla aydınlanır; gece panoramasında kendiliğinden kararır.
- **Güneş yönü panoramadan tahmin edilir** (`gunes.ts`, testli): gökyüzündeki en parlak, çevresine
  göre belirgin bölgenin ağırlıklı merkezi. Disk yoksa yalnızca ışıma sütunu varsa yön panoramadan,
  yükseklik saatten alınır. `?gunes=1` sarı küreyle gösterir; küre panoramadaki güneşle çakışmalı.
- **Gölge**: yönlü ışık + yalnızca gölge alan saydam zemin düzlemi (`ShadowMaterial`); figürler ve
  moloz zemine gölge düşürür, temas hissi buradan gelir.
- **Patlama** (`parcaciklar.ts`, `hasar.ts`): ateş topu (katkı karışımı), toprak sütunu, kıvılcım/moloz
  (yer çekimi), anlık nokta ışığı (figürleri ve zemini aydınlatır), ardından **kalıcı krater**
  çıkartması (yanık toprak × Kenney scorch maskesi; yoksa prosedürel) + çevresine 3B toprak kesekleri +
  30–90 sn tüten duman. Bölge değişince kraterler silinir. Manifestte gerçek plaka varsa (`patlama_*`,
  `yedek` değil) 2B plaka oynar, 3B yalnızca krater/moloz/ışık ekler.
- **Parçacıklar**: doku başına tek instanced billboard mesh'i (tek çizim çağrısı; `gl_PointSize`
  sınırı yok). Dokular `icerik/dokular/` altından (Kenney CC0 smoke/flame/scorch, Poly Haven yanık
  toprak); dosya yoksa prosedürel.
- **3B figürler** (`figurler3b.ts`): manifest `klipler` içinde `tip: "model"` girdileri (glTF/GLB).
  Panelin Figür komutu aynen gelir: azimut, yükseklik → mesafe (`uzay.ts`), ölçek, yansıt (ayna / sola
  yürü). `animasyon` (Idle/Walk/Run), `boy` (m; iskeletli modellerde `precise` sınır kutusu şart),
  `hiz` (yana yürüme m/s), `mesafe`, `yatik`. Mixamo iskeletli modellere Mixamo klipleri retarget'sız uyar.
- **Helikopter** (`helikopter3b.ts`): `klipler.helikopter` modeli; yaklaşma → iniş → yerde → kalkış
  (iniş noktası azimut 12°, 38 m), modelin kendi animasyonu + `rotor` düğümleri döner, yere yakınken
  rotor tozu. Model yoksa 2B siluet.
- Üç duvar, üç perspektif kamera (yaw -90/0/+90, dikey fov duvar oranından) aynı tuvale
  viewport/scissor ile çizilir; `yawKaydirma` arka plan + ortam dönüşü, `yukseklikKaydirma` kamera eğimi.
- HUD'da "3B:" satırı (güneş tahmini, figür/krater/parçacık sayısı). Konsoldan `window.duvar.sahne3b`.

Katmanlar (arkadan öne):

0. **360° panorama** (manifest `panorama`, en öncelikli): equirectangular resim veya video,
   WebGL ile her duvara doğru perspektif (`src/panorama.ts`; resimlerde 3B katman bunu devralır).
   Gerçek çekim, yapay zekâ panoraması ve motor render'ı için ortak yol; `?panorama=dosya&yaw=0`
   ile anında deneme. Üretim hattı: `docs/fotogercekci-icerik-hatti.md`. Depoda 5 bölge ×
   mevsim/zaman için 23 Poly Haven CC0 gerçek çekim (8K JPG, manifestte `_kaynak`) + kırsal yaz
   gündüz için Skybox AI panoraması (varsayılan) kayıtlıdır; dosyalar depoya girmez.
1. **Video döngüsü** (manifestte klip varsa) – 5760×1080, 3 duvar yan yana; çapraz geçişli.
2. Yoksa **parametrik sahne** (yalnızca geliştirme/yer tutucu): gökyüzü (saat → renk, güneş/ay/yıldız, bulut örtüsü), arazi
   (bölge ön ayarı: tepe profili, zemin, nesneler; mevsim paleti; rüzgârla salınan ot).
3. **Oda 2 ön planı**: operasyonel bölge (kum torbası hattı), kaya/sütre, çukur, meskûn mahal içi
   (pencere ve kapıdan dışarısı görünür).
4. **Figür klipleri** (`src/klipler.ts`, manifest `klipler`, kategori `figur`/`diger`/`hava`):
   alfa kanallı video (VP9 WebM) ya da sprite sayfası; panelin **Figürler** bölümünden azimut,
   yükseklik, ölçek ve aynalama ile sahneye konur. Alt kenar zemine oturur, zemin gölgesi çizilir,
   gece karartması ve mavi tonlama sahneyle birlikte uygulanır. Asker klipleri (yeşil perde
   çekimi) buradan gelir.
5. **Sis** (ufuktan yayılan katman), **bulut kararması**, **gece tonlaması**.
6. **Helikopter** (yaklaşıyor → iniyor → yerde → kalkıyor; rotor tozu; gece konum ışığı).
7. **Yağmur / kar** parçacıkları (rüzgâr eğimi), **efekt plakaları** (manifest `klipler`,
   kategori `efekt`: panelden "patlama" gelince adı `patlama_*` olan kliplerden rastgele biri o
   yönde oynar; `toz_*`, `uzak_patlama_*` aynı şekilde; plaka yoksa prosedürel **patlama** (ateş
   topu, kıvılcım, duman), **toz/duman**), flaş + sarsıntı, **izli mermi** (seçilen duvardan, yön ve
   sıklık panelden). Efekt plakaları kendi ışığını yaydığından gece karartılmaz.

Ses (`src/ses.ts`, Web Audio): patlama (yakın/uzak, mesafeye göre zayıflatma + alçak geçiren),
çatışma gürültüsü (manifestte tek atış kaydı varsa 6–10 kez art arda), mermi vızıltısı/sekmesi,
Türkçe bağırma/çağırma (manifestte kayıt yoksa tarayıcının Türkçe konuşma sentezi), rotor döngüsü
(`helikopter_rotor` kaydı varsa o, yoksa sentez), rüzgâr/yağış sentezi + **ortam döngüsü kaydı**
(manifest `ortam` sözlüğü: bölge adı, `gece`, `kis`, `yagmur`; öncelik yağmur > gece > kış > bölge,
çapraz geçişli). Konum: azimut → stereo pan; sahada 4+ kanal için ChannelMerger'a geçilir.
Depodaki kayıtlar Mixkit Free ve OpenGameArt CC0 (manifest `sesler._kaynak`).

## İçerik ekleme

İçerik klasörü `apps/duvar-oynatici/public/icerik/`; köprü bu klasörü doğrudan
`/oynatici/icerik/` yolundan sunar, yani dosya koyup manifesti düzenleyince **derleme gerekmez**,
oynatıcıyı yenilemek yeter (köprü, `ICERIK_KLASORU` ortam değişkeni verilirse önce onu, sonra
`public/icerik`, en son derleme kopyası `dist/icerik` klasörünü kullanır; sahada içerik ayrı diskte
tutulabilir). Manifest:
`apps/duvar-oynatici/public/icerik/manifest.json` (bkz. `icerik/OKU.md`). `dongu` listesine
`{bolge, mevsim, zaman, dosya}` satırı eklenince oynatıcı o durum için videoyu kullanır; eksik
kombinasyonlar yer tutucuya düşer, yani içerik parça parça gelebilir. `sesler` altındaki listeler
dolunca sentez yerine kayıtlar çalar.

Klip üretim kuralı (U duvar): 3 kamera, her biri 90° yatay görüş, yaw -90/0/+90, aynı konum ve
yükseklik (1,6–1,7 m); 3 × 1920×1080 kareler yan yana birleştirilir (5760×1080); 60–90 sn, ilk ve
son kare aynı (kusursuz döngü). Duvar ölçüleri ve açıları saha keşfinde netleşince `?fov=` ve
kamera açıları buna göre güncellenir.

### Alfa klipler (figür ve efekt plakaları)

`manifest.json` → `klipler` bölümü; her kayıt:

| Alan | Anlam |
|---|---|
| `dosya` | `icerik/` köküne göre yol (`klipler/asker_yarali_yerde.webm`) |
| `kategori` | `figur` (panelde listelenir, gece karartılır, gölge), `efekt` (panel efektleriyle otomatik, karartılmaz), `hava`, `diger` |
| `ad` | Panelde görünen başlık |
| `genislikDerece` | Ölçek 1 iken duvarda kapladığı yatay açı; 1,7 m boyunda insan 12 m uzakta ≈ 8°, 25 m'de ≈ 4° |
| `taban` | `zemin`: alt kenar zemine oturur (yükseklik eksiye indikçe yaklaşır); `merkez`: klibin ortası verilen yüksekliğe gelir |
| `dongu` | `true` ise sürekli oynar; yoksa bitince kaldırılır (patlama gibi tek seferlik) |
| `golge` | Zemin gölgesi (figürlerde varsayılan açık) |
| `tip` | `video` (varsayılan) ya da `sprite` (`kareler`, `sutun`, `fps` ile PNG sayfası) |

Biçim: **VP9 alpha WebM** (`-pix_fmt yuva420p`), alfa dışı bölge tamamen saydam, kare kenarında
içerik bitmeli (kesik kenar duvarda dikdörtgen olarak görünür). Üretim ve çekim rehberi:
`docs/fotogercekci-icerik-hatti.md` §2.5 ve §6. Depodaki `klipler/*_test_*.webm` dosyaları sentetik
test içeriğidir (`araclar/test-klipleri-uret.sh`).

Panelden gelen figür komutları (`POST /api/figur`, `{islem: oynat|durdur|temizle, klip, azimut,
yukseklik, olcek, dongu, yansit}`) köprüde tutulur ve `figur` WebSocket mesajıyla tüm oynatıcılara
gider; yeniden bağlanan oynatıcıya köprü aktif figürleri bağlantı anında yeniden gönderir (sahne
kaldığı yerden devam eder). Senaryo adımı olarak figür komutu bir sonraki adımda eklenecek.

## Köprü ile sözleşme

- Bağlanınca `{tip:"merhaba", rol:"oynatici"}` gönderir; köprü `baglanti.oynatici` sayacını artırır.
- `durum` mesajı → tüm sahne parametreleri; `efekt` mesajı → anlık efekt (`EfektIstegi` + zaman);
  `figur` mesajı → figür komutu + aktif figür listesi.
- Oynatıcı hiçbir komut göndermez; tek yönlü ve durumsuzdur, yeniden bağlanınca son durumu alır.

## Sınırlamalar (prototip)

- Yer tutucu sahne stilizedir; kabul için gerçek panoramalar (depoda var) ve içerik gerekir.
- Patlama, toz ve helikopter 3B katmanda prosedürel/parçacık tabanlıdır; manifest `klipler` bölümüne
  gerçek VFX plakaları (`patlama_*`, `toz_*`, `uzak_patlama_*`) konunca oynatıcı onları kullanır,
  3B katman krater/moloz/ışık eklemeye devam eder. Depodaki test klipleri sentetiktir ve `yedek`
  işaretlidir (3B açıkken kullanılmaz).
- 3B asker modelleri stilize (three.js Soldier, Poly Pizza); kabul için Mixamo "Swat" karakteri +
  Rifle animasyonları (ücretsiz Adobe hesabı, Blender → GLB) ya da yeşil perde çekimi önerilir.
- Helikopter modeli düşük poligonlu (OGA CC-BY); 3B görsel testi henüz yapılmadı.
- Performans: dizüstünde (Iris Xe) 1920×360'ta 20–30 fps ölçüldü; 5760×1080'de hedef makine
  (RTX 4060+) gerekir. Gölge haritası 2048, parçacık üst sınırı ~2000.
- Figür klipleri sahneye panelden elle konur; senaryo adımı tipi olarak henüz yok.
- Ses çıkışı stereo; 4 kanal yerleşimi saha donanımına göre eklenecek.
- Tarayıcı: Chrome/Edge (kiosk bayrakları). 5760×1080'de 60 fps için RTX 4060 sınıfı yeterli.
