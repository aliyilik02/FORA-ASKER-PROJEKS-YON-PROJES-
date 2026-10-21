# Fotogerçekçi içerik hattı

Karar (21 Ekim 2026): görüntü **aşırı gerçekçi** olacak; yer tutucu çizimler yalnızca oynatıcıyı
test etmek içindi. İçerik üç kaynaktan gelebilir (yapay zekâ, oyun motoru, gerçek çekim); hepsi
**aynı dosya biçimine** indirgenir ve aynı oynatıcıda gösterilir.

## 1. Ortak biçim: 360° equirectangular

Her sahne bir **equirectangular panorama** (2:1; resim 12K×6K, video 8K×4K) olarak üretilir.
Oynatıcı bunu U duvarın gerçek geometrisine göre 3 perspektife böler (`apps/duvar-oynatici/src/panorama.ts`,
WebGL). Avantajları:

- Gerçek çekim (360° kamera), yapay zekâ panoraması ve motor render'ı **aynı yolu** kullanır.
- Duvar açıları saha keşfinde değişirse içerik yeniden üretilmez; `?fov=` ve `yawKaydirma` ayarlanır.
- Köşelerde perspektif kırılmaz (düz 5760×1080 kliplerde bu ancak 3 kameralı render ile sağlanır).
- `?panorama=<dosya>` ile her kaynak dakikalar içinde duvarda denenir; manifest `panorama` listesi
  bölge/mevsim/zaman eşlemesini yapar.

Hareket için iki seviye: (a) **360° video** döngüsü (en iyisi), (b) 360° **resim** + oynatıcının
canlı katmanları (hava, ışık, efektler, ses). Sabit bakış noktalı bir odada (b) bile inandırıcıdır;
(a) içerik geldikçe yerine geçer.

## 2. Üç kaynak

| | Yapay zekâ | Oyun motoru (UE5, çevrimdışı render) | Gerçek çekim (360° kamera) |
|---|---|---|---|
| Gerçekçilik | Çok yüksek (sabit kare); hareketli uzun döngülerde henüz zayıf | Çok yüksek (Megascans, path tracer); "render" hissi riski | En yüksek; şartnamedeki "gerçek arazi" ifadesini birebir karşılar |
| Aynı sahnenin kış/gece/yağmur varyantı | Düzenleme modelleriyle (geometri korunur) kolay | Tam kontrol, en tutarlı | Her koşul için ayrı çekim (kış için kış beklenir) |
| Üs bölgesi gibi Türkiye'ye özgü düzen | Prompt + referans fotoğrafla iyi; küçük hatalar olabilir | Tam kontrol | Gerçek üs çekimi izne tabi |
| Hareket (ot, ağaç, bulut, su) | 5–15 sn kliplerde iyi; 60–90 sn kusursuz döngü için ek iş | Doğal, istenen uzunlukta | Doğal |
| Hız / maliyet | Günler; yüzlerce $ kredi + seçme/kürasyon emeği | Haftalar; 3B sanatçı | Çekim günleri, seyahat, izin; gece ve kış takvimi |
| Bağımlılık | Hizmet hesapları | UE bilgisi (kaynak proje şart değil; kendi sahnemiz) | Hava ve mevsim |

**Önerilen karışım**

1. **Temel sahneler:** yapay zekâ 360° panoramaları (hızlı, fotogerçekçi) + aynı panoramanın
   düzenleme modeliyle kış / alacakaranlık / gece / yağmurlu varyantları → 5 bölge × varyantlar
   birkaç günde. Gerçek 360° çekim mümkün olan bölgeler (ör. dağlık, ormanlık) çekimle **değiştirilir**;
   çekim en güçlü kabul argümanıdır.
2. **Üs bölgesi ve meskûn mahal içi:** düzen önemli olduğundan UE5'te kendi sahnemiz (Megascans +
   Türkiye'ye özgü varlıklar) → equirect render; varyantlar motorda.
3. **Efektler:** gerçek çekilmiş VFX plakaları (ActionVFX, ProductionCrate, BigFilms: patlama, toz,
   izli mermi, namlu alevi, yağmur, kar, sis; alfa kanallı 4K). Oynatıcı bunları katman olarak oynatır.
   Prosedürel efektler yalnızca yedek.
4. **Helikopter inişi:** yapay zekâ video (panoramadan alınan kareyi başlangıç karesi yaparak,
   10–15 sn) veya stok helikopter plakası; rotor tozu VFX plakası.
5. **Ses:** profesyonel kütüphaneler (BOOM, Pro Sound Effects) + Türkçe bağırma/çağırma stüdyo kaydı.

## 3. Yapay zekâ ile panorama üretimi (adım adım)

Araç adları Ekim 2026 itibarıyla; sürüm ve fiyatları satın almadan önce teyit edin.

1. **Referans toplama:** her bölge için 5–10 gerçek fotoğraf (İç Anadolu bozkırı, Toros ormanı,
   Hakkâri dağları, Türkiye tipi köy, üs bölgesi). Modeller İngilizce prompt ile daha iyi çalışır.
2. **360° panorama üretimi:** doğrudan equirectangular üreten araçlar (Blockade Labs **Skybox AI**,
   8K; Higgsfield/Midjourney/Flux ile `2:1` ultra geniş kare + outpainting). Her bölge için 6–10
   aday üretilir, en iyisi seçilir.
3. **Kalite kontrolü (reddetme ölçütleri):** ufuk düz ve ortada; dikiş yok (sol kenar sağ kenarla
   birleşmeli); insan, araç, yazı yok; ölçek doğru (ağaç/ev boyu); gökyüzü ile zemin ayrımı net.
4. **Varyantlar:** aynı panorama, **düzenleme modeliyle** (Flux Kontext, Nano Banana / Gemini image
   edit, Seedream edit) geometri korunarak: kış (kar), alacakaranlık, gece, bulutlu/yağmurlu.
   Bu, gerçek çekime göre en büyük avantaj: 5 bölge × 2 mevsim × 3 zaman = 30 sahne, 5 üretim + 25 düzenleme.
5. **Büyütme:** Topaz Gigapixel / Magnific ile 12K×6K; dikiş kontrolü tekrar.
6. **Hareket (isteğe bağlı, kademeli):** gökyüzü için gerçek bulut timelapse plakası (oynatıcı
   katmanı); ot/ağaç için duvar başına 5–10 sn **image-to-video döngü** (Kling, Veo, Seedance,
   Runway "loop" / başlangıç = bitiş karesi) ve equirect'e geri dikiş; ya da panoramayı sabit
   tutup canlı efektlerle yetinme. Önce sabit panorama ile kabul standardı yakalanır.
7. **Oynatıcıda deneme:** dosyayı `icerik/` altına koy, `?panorama=…` ile aç, `K` ile duvar
   sınırlarını kontrol et; `yawKaydirma` ile ilgi çeken yönü orta duvara al; sonra manifeste yaz.

Örnek prompt (kırsal açık arazi, yaz, öğle):

> Equirectangular 360° panorama, 2:1, photorealistic. Central Anatolian steppe in Turkey, late
> summer midday: rolling dry wheat fields and pale grassland, a dirt track leading away, a few
> poplar trees, distant low hills with haze, a small village far on the horizon, clear blue sky
> with scattered cumulus. Eye level 1.7 m, no people, no vehicles, no text, no lens flare,
> seamless left-right edges, natural colors, 8K.

Varyant promptu (aynı görsel, düzenleme modeli):

> Keep the exact same scene and composition. Change to winter: snow-covered fields and road,
> bare poplar trees, overcast grey sky, cold light, light haze. Photorealistic, seamless edges.

## 4. Oyun motoru ile üretim (UE5)

- Kendi projemiz: Megascans/Fab varlıkları, Ultra Dynamic Sky, Landscape. TCCC kaynak projesi
  gelirse sahneleri oradan alırız; gelmezse bağımsız ilerleriz.
- Render: **Panoramic Capture** eklentisi veya 6 kameralı küp → equirect; sabit kare için **Path
  Tracer** (saatler sürebilir, önemsiz), video için Movie Render Queue 8K×4K, 30 s döngü.
- Varyantlar: aynı sahne, farklı UDS ayarı; tüm kombinasyonlar betikle toplu render.

## 5. Gerçek çekim

- 360° kamera (8K: Insta360 X5 / Pro 2 sınıfı), 1,7 m tripod, kamera görünmez (nadir yaması).
- Her bölge için gündüz + alacakaranlık + gece; kış için ayrı seyahat. Rüzgârlı günde ot hareketi.
- Çıktı doğrudan equirect; renk eşleme ve döngü kesimi (sonraki bölüm).
- İleri seçenek: drone çekiminden **Gaussian Splatting** (3DGS) ile arazinin 3B kopyası → istenen
  bakış noktasından render (gerçek arazi, serbest kamera).

## 6. FFmpeg tarifleri

Equirect → tek duvar düz görüntü (90°, yaw -90/0/+90), kontrol veya düz klip üretimi için:

```
ffmpeg -i pano.mp4 -vf "v360=e:flat:h_fov=90:v_fov=50.5:yaw=0:w=1920:h=1080" orta.mp4
ffmpeg -i pano.mp4 -vf "v360=e:flat:h_fov=90:v_fov=50.5:yaw=-90:w=1920:h=1080" sol.mp4
ffmpeg -i pano.mp4 -vf "v360=e:flat:h_fov=90:v_fov=50.5:yaw=90:w=1920:h=1080" sag.mp4
ffmpeg -i sol.mp4 -i orta.mp4 -i sag.mp4 -filter_complex "hstack=3" -c:v libx264 -crf 16 dongu_5760.mp4
```

(`v_fov` = duvar en-boy oranına göre: 1920×1080 ve 90° yatay için ≈ 50,5°.)

Kusursuz döngü (başı-sonu çapraz geçişle birleştirme, 60 sn klip, 2 sn geçiş):

```
ffmpeg -i klip.mp4 -filter_complex "[0]split[a][b];[a]trim=0:58,setpts=PTS-STARTPTS[a1];[b]trim=58:60,setpts=PTS-STARTPTS[b1];[a1][b1]xfade=transition=fade:duration=2:offset=56" dongu.mp4
```

Alfa kanallı efekt plakası (ProRes 4444 → VP9 alpha WebM, oynatıcı katmanı):

```
ffmpeg -i patlama_prores4444.mov -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 8M patlama.webm
```

## 7. Kabul stratejisi

- Faz 1 ortasında idareye **örnek set** (1 bölge, 4 varyant, 2 efekt) gösterilir; "gerçek" algısı
  onaylanır. Fizibilitedeki ara gösterim önlemi ile aynı.
- Her bölge için "ret ölçütleri" (madde 3.3) yazılı tutulur; kürasyon buna göre yapılır.
- Kabul test matrisi: `docs/sartname-analizi-ve-yaklasim.md` §7.

## 8. Yapılacaklar (içerik)

- [ ] Bölge referans fotoğrafları (5 bölge)
- [ ] Kırsal açık arazi: 6–10 AI panorama adayı → seçim → 5 varyant → 12K
- [ ] Oynatıcıda deneme (`?panorama=`), yaw/ufuk ayarı, manifeste kayıt
- [ ] VFX plaka paketi seçimi ve lisans (patlama, toz, izli mermi, yağmur, kar, sis)
- [ ] Helikopter iniş klibi (AI i2v veya stok)
- [ ] Türkçe ses metni (30 cümle) + stüdyo günü
- [ ] Diğer 4 bölge; üs bölgesi için UE5 sahnesi kararı
