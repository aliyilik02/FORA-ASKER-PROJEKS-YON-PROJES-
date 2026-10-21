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
   izli mermi, namlu alevi, yağmur, kar, sis; alfa kanallı 4K). Oynatıcı bunları manifest `klipler`
   bölümünden (`patlama_*`, `toz_*`, `uzak_patlama_*`) panel efektlerine bağlı olarak otomatik oynatır;
   prosedürel efektler yalnızca yedek. Bir paket seçilip 5–8 patlama, 3–4 toz, 2 namlu alevi varyantı
   ile başlanır (bkz. §2.5 biçim).
4. **Askerler ve figürler:** okulda **yeşil perde** önünde gerçek personelle çekim (en inandırıcı ve
   en ucuz yol; §2.5). Yapay zekâ video ve UE MetaHuman yalnızca çekilemeyen durumlar için takviye.
5. **Helikopter inişi:** yapay zekâ video (panoramadan alınan kareyi başlangıç karesi yaparak,
   10–15 sn) veya stok helikopter plakası; rotor tozu VFX plakası.
6. **Ses:** profesyonel kütüphaneler (BOOM, Pro Sound Effects) + Türkçe bağırma/çağırma stüdyo kaydı.

### 2.5 Asker ve figür klipleri (yeşil perde çekimi)

Oynatıcı, alfa kanallı bir klibi sahneye **azimut + yükseklik + ölçek** ile yerleştirir
(`src/klipler.ts`; panelde **Figürler**). Gerçekçilik için en güçlü kaynak, okulun kendi personeliyle
yapılan yeşil perde çekimidir: üniforma, teçhizat, duruş ve hareket birebir doğru olur, yapay zekânın
"yabancı asker / yanlış teçhizat" sorunu olmaz, hiçbir lisans gerekmez.

**Çekim düzeni**

- Kapalı spor salonu / depo; 6×4 m yeşil perde (zemin de yeşil, figür yerde yatacaksa şart),
  perde ile oyuncu arası ≥ 2,5 m, perde eşit aydınlatılmış (2 softbox), oyuncuya arkadan hafif
  kenar ışığı (yeşil sızmayı azaltır).
- Kamera **1,7 m yükseklikte, yatay** (izleyicinin göz hizası; panoramalar da bu yükseklikten),
  4K, **50 fps** (ağır çekim/hız ayarı payı), düşük sıkıştırma (log profil varsa açık), sabit
  tripod; odak kilitli. Oyuncu 5–7 m mesafede, tam boy kadrajda.
- Her hareket **döngüye uygun** çekilir: başlangıç pozu = bitiş pozu (örn. siperde ateş: nişan →
  3 atış → nişan). Tek seferlik hareketler (yere düşme, koşup geçme) ayrı çekilir.
- Işık koşulu için iki set: "gündüz" (nötr, güçlü ana ışık) ve "alacakaranlık/gece" (sıcak, düşük);
  oynatıcı gece karartmasını kendi uygular, ama kontrast uyumu çekimde iyi olursa sonuç çok daha
  inandırıcıdır.

**Klip listesi (ilk set, Oda 1 "Ateş altında yaralıya müdahale")**

| Klip adı | İçerik | Döngü |
|---|---|---|
| `asker_yarali_yerde` | yaralı yerde, bacağını tutuyor, el kaldırıp yardım istiyor | evet |
| `asker_yarali_surunuyor` | yaralı siper yönüne sürünüyor | hayır |
| `asker_siper_ates` | siperden/diz üstü nişan alıp ateş ediyor | evet |
| `asker_koşuyor_sagdan_sola` | sütreden sütreye koşu (aynalama ile ters yön) | hayır |
| `asker_el_isareti_dur` / `_ilerle` | el-kol işaretleri | hayır |
| `sihhiyeci_turnike` | yaralının yanında diz çökmüş turnike uyguluyor | evet |
| `tahliye_ikili_tasima` | iki asker yaralıyı sürükleyerek/sırtta götürüyor | hayır |
| `asker_nobet_ayakta` | ayakta gözetleme, hafif hareket | evet |

**İşleme (keying → alfa WebM)**

1. DaVinci Resolve (ücretsiz) / After Effects: 3D keyer veya Keylight; yeşil sızma giderme
   (spill suppression), kenar yumuşatma 1–2 px, zemin gölgesini **ayrı katman** olarak koruyun ya da
   oynatıcının çizdiği gölgeye bırakın.
2. Kadrajı figüre göre kırpın (kenar boşluğu 5–10 px); yükseklik 1080–1440 px yeterlidir (duvarda
   figür en fazla ~900 px olur).
3. Dışa aktarma: ProRes 4444 (alfa) → FFmpeg ile VP9 alpha WebM (§6 tarifi). Dosya adı manifest
   anahtarıyla aynı; `genislikDerece` için figürün gerçek genişliği / hedef mesafe:
   `derece ≈ 2·atan(genişlik / (2·mesafe))` (0,6 m genişlik, 10 m → 3,4°; yerde yatan 1,8 m, 8 m → 12,8°).
4. Oynatıcıda deneme: panel → Figürler → klip, azimut, yükseklik (ufka göre; −6 ≈ 10 m, −12 ≈ 5 m),
   ölçek; gece/gündüz değiştirip kontrast uyumunu kontrol edin.

**Takviye kaynaklar (çekilemeyen durumlar için)**

- Yapay zekâ video (Kling, Veo, Runway) ile "yeşil arka planda, tam boy, sabit kamera, göz hizası"
  istemi; sonra aynı keying hattı. Türk askeri üniforma/teçhizat doğruluğu düşük kalır, referans
  görsel şart; kabul için gerçek çekim tercih edilir.
- UE5 MetaHuman + Fab asker varlıkları: istenen hareketi (Mixamo / motion capture) alfa kanallı
  render; teçhizat kontrolü tam, emek daha yüksek. Üs bölgesi gibi UE'de kurulan sahnelerde
  figürler doğrudan sahnenin içine konup panorama ile birlikte render edilebilir.

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

Alfa kanallı efekt plakası veya figür klibi (ProRes 4444 → VP9 alpha WebM, manifest `klipler`):

```
ffmpeg -i patlama_prores4444.mov -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 8M -auto-alt-ref 0 patlama_yakin_1.webm
ffmpeg -i asker_yarali_yerde_prores4444.mov -vf "scale=-2:1440" -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 6M -auto-alt-ref 0 asker_yarali_yerde.webm
```

Siyah arka planlı (alfasız) plakayı alfaya çevirme (parlaklık → alfa; patlama/ateş/duman gibi
ışık yayan efektler için yeterlidir):

```
ffmpeg -i patlama_siyah.mp4 -filter_complex "[0]split[c][a];[a]format=gray,geq=lum='clip(lum(X,Y)*1.4,0,255)'[al];[c][al]alphamerge" -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 8M -auto-alt-ref 0 patlama_1.webm
```

Yeşil perde kabaca keying (ince iş Resolve/AE'de; hızlı deneme için):

```
ffmpeg -i asker.mp4 -vf "chromakey=0x00b140:0.18:0.08,despill=type=green,crop=1000:1440:460:0" -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 6M -auto-alt-ref 0 asker_test.webm
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
- [ ] VFX plaka paketi seçimi ve lisans (patlama, toz, izli mermi, yağmur, kar, sis) → `klipler/`
- [ ] Yeşil perde çekim günü (okul personeli, §2.5 klip listesi) → keying → `klipler/asker_*.webm`
- [ ] Helikopter iniş klibi (AI i2v veya stok)
- [ ] Türkçe ses metni (30 cümle) + stüdyo günü
- [ ] Diğer 4 bölge; üs bölgesi için UE5 sahnesi kararı
