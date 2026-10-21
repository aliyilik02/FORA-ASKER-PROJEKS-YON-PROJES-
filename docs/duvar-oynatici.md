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

Katmanlar (arkadan öne):

0. **360° panorama** (manifest `panorama`, en öncelikli): equirectangular resim veya video,
   WebGL ile her duvara doğru perspektif (`src/panorama.ts`). Gerçek çekim, yapay zekâ panoraması
   ve motor render'ı için ortak yol; `?panorama=dosya&yaw=0` ile anında deneme.
   Üretim hattı: `docs/fotogercekci-icerik-hatti.md`.
1. **Video döngüsü** (manifestte klip varsa) – 5760×1080, 3 duvar yan yana; çapraz geçişli.
2. Yoksa **parametrik sahne** (yalnızca geliştirme/yer tutucu): gökyüzü (saat → renk, güneş/ay/yıldız, bulut örtüsü), arazi
   (bölge ön ayarı: tepe profili, zemin, nesneler; mevsim paleti; rüzgârla salınan ot).
3. **Oda 2 ön planı**: operasyonel bölge (kum torbası hattı), kaya/sütre, çukur, meskûn mahal içi
   (pencere ve kapıdan dışarısı görünür).
4. **Sis** (ufuktan yayılan katman), **bulut kararması**, **gece tonlaması**.
5. **Helikopter** (yaklaşıyor → iniyor → yerde → kalkıyor; rotor tozu; gece konum ışığı).
6. **Yağmur / kar** parçacıkları (rüzgâr eğimi), **patlama** (ateş topu, kıvılcım, duman, flaş,
   sarsıntı), **toz/duman**, **izli mermi** (seçilen duvardan, yön ve sıklık panelden).

Ses (`src/ses.ts`, Web Audio): patlama (yakın/uzak, mesafeye göre zayıflatma + alçak geçiren),
çatışma gürültüsü, mermi vızıltısı/sekmesi, Türkçe bağırma/çağırma (manifestte kayıt yoksa
tarayıcının Türkçe konuşma sentezi), rotor döngüsü, rüzgâr/yağış ortam sesi. Konum: azimut →
stereo pan; sahada 4+ kanal için ChannelMerger'a geçilir.

## İçerik ekleme

`apps/duvar-oynatici/public/icerik/manifest.json` (bkz. `icerik/OKU.md`). `dongu` listesine
`{bolge, mevsim, zaman, dosya}` satırı eklenince oynatıcı o durum için videoyu kullanır; eksik
kombinasyonlar yer tutucuya düşer, yani içerik parça parça gelebilir. `sesler` altındaki listeler
dolunca sentez yerine kayıtlar çalar.

Klip üretim kuralı (U duvar): 3 kamera, her biri 90° yatay görüş, yaw -90/0/+90, aynı konum ve
yükseklik (1,6–1,7 m); 3 × 1920×1080 kareler yan yana birleştirilir (5760×1080); 60–90 sn, ilk ve
son kare aynı (kusursuz döngü). Duvar ölçüleri ve açıları saha keşfinde netleşince `?fov=` ve
kamera açıları buna göre güncellenir.

## Köprü ile sözleşme

- Bağlanınca `{tip:"merhaba", rol:"oynatici"}` gönderir; köprü `baglanti.oynatici` sayacını artırır.
- `durum` mesajı → tüm sahne parametreleri; `efekt` mesajı → anlık efekt (`EfektIstegi` + zaman).
- Oynatıcı hiçbir komut göndermez; tek yönlü ve durumsuzdur, yeniden bağlanınca son durumu alır.

## Sınırlamalar (prototip)

- Yer tutucu sahne stilizedir; kabul için gerçek döngüler (render/çekim) gerekir.
- Patlama, toz ve helikopter prosedüreldir; alfa kanallı video katmanları manifestle gelince
  onlar kullanılacak (kod yolu hazır: `katmanlar`).
- Ses çıkışı stereo; 4 kanal yerleşimi saha donanımına göre eklenecek.
- Tarayıcı: Chrome/Edge (kiosk bayrakları). 5760×1080'de 60 fps için RTX 4060 sınıfı yeterli.
