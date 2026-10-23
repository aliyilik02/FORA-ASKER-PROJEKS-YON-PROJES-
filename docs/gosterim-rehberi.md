# Gösterim rehberi (idareye sunum)

Amaç: 5–10 dakikada, tek bilgisayarda, internet olmadan sistemin ne yaptığını göstermek.
Bu rehber eğitmen/sunucu içindir; teknik ayrıntı `docs/duvar-oynatici.md`'de.

## Hazırlık (sunumdan 15 dk önce)

1. `demo.bat` çalıştır (ilk kez: kurulum + derleme, 2–3 dk). Köprü penceresi açık kalsın.
2. Tarayıcıda **panel** `http://localhost:4000` ve **oynatıcı** (paneldeki "Oynatıcı" düğmesi)
   açılır. Oynatıcı penceresini projeksiyon ekranına taşı, **F** ile tam ekran yap.
3. **Tek oynatıcı penceresi** açık olsun: panel üst çubuğunda "Oynatıcı ×1" görünmeli. ×2/×3
   görünüyorsa fazla sekmeleri kapat (hepsi aynı ekran kartını kullanır, görüntü yavaşlar).
4. Dizüstü/entegre ekran kartında: panel **Sistem → Oynatıcı ayarları → Düşük** seç, oynatıcıyı
   kapatıp "Oynatıcı" düğmesiyle yeniden aç. Saha makinesinde (RTX) "Yüksek".
5. Ses: oynatıcı penceresine bir kez tıkla (tarayıcı sesi kullanıcı etkileşimi ister); **M** sessiz/açık.
6. Oynatıcı HUD kapalı açılır (**H** açar/kapar; fps ve tanı bilgisi). Kalibrasyon ızgarası **K** kapalı olsun.

Sunum öncesi ve gruplar arasında: canlı sahne kartındaki **Sahneyi sıfırla** (iki dokunuş) figürleri, çatışmayı,
izli mermiyi, helikopteri, kraterleri ve dumanı temizler. Kartın üstünde duvarın canlı önizlemesi ve altında
fps/kalite bilgisi görünür; kontrol odasından duvarı görmeden çalışılabilir.

## Seçenek A – Tek tuş: "Gösterim – Tam Tur (5 dk)"

Panel **Senaryo** sekmesi → "Gösterim – Tam Tur (5 dk)" → **Oynat**. Akış:

| Zaman | Duvarda ne olur | Anlatım notu |
|---|---|---|
| 0:00 | Kırsal açık arazi, yaz öğle (gerçek 360° çekim panoraması) | 5 bölge × mevsim × gece/gündüz; 23 gerçek çekim panorama |
| 0:04–0:16 | Üç asker mevziye girer (biri diz çökmüş), tank gelir, koşan asker geçer | Figürler sahnenin ışığıyla aydınlanır, gölgeleri güneşe göre düşer |
| 0:25 | Düşman ateşi başlar: izli mermiler, çarpma, askerler karşılık verir, tank top atar | Çatışma yönü/şiddeti panelden; dost ateşi |
| 0:32 / 0:40 | Patlamalar: ateş topu, toprak, moloz, **kalıcı krater** ve tüten duman | Hasar kalıcıdır; bölge değişene kadar kalır |
| 0:44 | **Asker vurulur**: yere düşer, nefes alır, kol kaldırıp yardım çağırır; 0:56 sıhhiyeci başına diz çöker | Oda 1 eğitimi: ateş altında bakım |
| 1:40 → 2:25 | Akşam, yağmur, gece (ay ışığı), kış sabahı | Aynı sahne, farklı mevsim/saat/hava |
| 3:30 | **Oda 2**: üs bölgesi güvenli alanı (HESCO, kum torbası), yaralı + sıhhiyeci | Oda 2 eğitimi: taktik güvenli alan |
| 3:48 → 5:00 | Helikopter yaklaşır, iner (rotor tozu, ses), yerde bekler, kalkar; Oda 1'e dönüş | Tahliye |

Senaryo sırasında paneldeki her şey kullanılabilir (ör. ek patlama tetikle); **Boşluk** duraklat/devam.

## Seçenek B – Elle, 3 dakika

1. **Sahne**: pusuladan yön seç; 1–5 tuşları hızlı efekt (1 patlama).
2. **Figürler**: "Cephe kur" (3 asker + düşman yönü) → **Çatışma** kartında şiddeti artır.
3. "Asker vuruldu!" → "Sıhhiyeci gönder".
4. **Sahne** → Ortam: saati 22:00 yap (gece), yağış "Şiddetli yağmur".
5. Üst çubuktan **Oda 2** → Güvenli alan "Operasyonel bölge" → Helikopter "Tam dizi".

## Sorulara hazır cevaplar

- **Gerçek çekim mi?** Panoramalar gerçek 360° çekim (CC0), figürler 3B model; kabul için yeşil perde
  asker çekimi ve gerçek VFX plakaları eklenebilir (`docs/fotogercekci-icerik-hatti.md`).
- **İnternet gerekir mi?** Hayır. Tüm içerik yerel klasörde (`icerik/`).
- **Donanım?** Saha: RTX 4060+ ve 3 projektör (`docs/donanim-onerileri.md`). Bu dizüstünde düşük kalite kademesiyle gösterim yapılabilir.
- **Unreal?** İsteğe bağlı yol; mevcut sistem tarayıcı tabanlı, kurulum tek `demo.bat`.

## Olası aksaklıklar

- Görüntü takılıyor → Sistem sekmesinde "Düşük"; fazla oynatıcı sekmelerini kapat; HUD'da fps ve "çizim/duvar" bak.
- Ses yok → oynatıcı penceresine tıkla, **M**'ye bas; Windows ses çıkışı projeksiyon/hoparlör mü kontrol et.
- Oynatıcı "köprü bekleniyor" diyor → köprü penceresi kapanmış; `demo.bat yeniden`.
- Figürler gelmiyor → panel üst çubuğunda "Oynatıcı" yeşil mi; oynatıcıyı yenile (F5), köprü aktif figürleri yeniden gönderir.
