# Genel değerlendirme – 8 Kasım 2026 (oyun geliştirici + askeri eğitim gözüyle)

Bu belge projenin bugünkü durumunu üç açıdan değerlendirir: **hatalar/riskler**, **eksik sistemler**, **geliştirme
önerileri** (panel, simülasyon, figürler). Perspektif: gerçek zamanlı grafik/oyun geliştirici, teknik animatör, eğitmen
aracı geliştiricisi ve TCCC/TMYB eğitim tasarımı. Dayanak: 8 Kasım araştırması (`.claude/skills/askeri-simulasyon-tasarimi/`,
kaynaklar orada) + üç bağımsız kod incelemesi (oynatıcı 3B/efekt, köprü+panel, figür/içerik hattı) + bizzat doğrulanan noktalar.

Önem: **K** kritik (eğitimi/gösterimi bozar), **Y** yüksek, **O** orta, **D** düşük/iyileştirme.

## 0. Yönetici özeti

- Mimari sağlam: tek kaynak durum modeli, köprü sözleşmesi, sahne sıfırlaması, senaryo motoru, 3B katman ve içerik hattı
  oturmuş. Oyun motoru disiplinine en yakın olmayan kısım **"eğitim döngüsü"**: eğitmen için canlı müdahale, olay günlüğü,
  tekrar oynatma (AAR), ölçülebilir hedefler henüz yok.
- Gerçekçilik en çok **sesin zamanlamasında** ve **figür davranışında** kaybediliyor: uzak patlama sesi ışıkla aynı anda
  geliyor, figürler tehdide bakmıyor, idle tek düze. Bunlar ucuz ve etkisi büyük düzeltmeler.
- **Kamera sarsıntısı** projeksiyon odası için tartışmalı (vection); eğitmen ayarına bağlanmalı.
- TCCC doğruluğu için senaryo adımlarına **safha** kavramı (ateş altında / taktik saha / tahliye) ve bunun oynatıcı
  davranışına etkisi eklenmeli (sıhhiyeci ateş altında açıkta müdahale etmemeli).

## 1. Bizzat doğrulanan bulgular (kod okunarak)

| # | Önem | Yer | Bulgu | Öneri |
|---|---|---|---|---|
| 1 | **Y** | `apps/duvar-oynatici/src/main.ts:358`, `ses.ts:424` | Uzak patlama sesi görüntüyle **aynı anda** çalıyor; `mesafe` yalnız zayıflatma için kullanılıyor (800 m'de 2,3 sn gecikme olmalı). Gök gürültüsünde gecikme var (`ses.ts:462`), patlamada yok. | `ses.patlama(..., mesafe)` içinde `mesafe/343` sn gecikme (üst sınır 6 sn); yakın patlamada 0. Tank topu ve çatışma uzak patlaması da aynı yoldan. |
| 2 | **Y** | `main.ts:796-797`, `efektler/patlama.ts:56` | Sarsıntı **bütün tuvali ve 3B tuvali** kaydırıyor = dünya sarsıntısı. CAVE araştırması: izleyicinin kontrol etmediği dünya hareketi vection/rahatsızlık yapar; yerde yaralıyla uğraşan öğrenci için yön duygusunu bozabilir. | Varsayılanı kısa tut (≤ 250 ms, ≤ 6 px), panel Sistem'e "Sarsıntı: kapalı / hafif / tam" anahtarı; enerjiyi flaş + toz + yakın nesne titreşimine kaydır. |
| 3 | **Y** | `sahne3b/figurler3b.ts` | Figürlerde **bakış/baş yönelimi yok**; tek `lookAt` kullanımı tüfeğin yere düşüşünde rastgele dönüş. Çatışmada asker düşmana değil klibin yönüne bakar; yaralıya kimse bakmaz. | Baş + üst gövde kemiğine prosedürel yönelim (mixer.update sonrası, 60–90° sınır, 0,3 sn yumuşatma): çatışmada düşman yönü, sıhhiyeci yaralı, aksi hâlde en son patlama. |
| 4 | **O** | `ses.ts` (`uzak_mermi_sesi`, çatışma) | Uzak çatışma için ayrı crack–thump modeli yok: namlu sesi mesafeye göre gecikmiyor, alçak geçiren kesim sabit. | Çatışma kaynağı mesafesinden (`izliYol.sirtaTasi` ≥ 80 m) gecikme + kesim (300 m → 6 kHz, 1 km → 2 kHz). "Çat" yalnız yakın geçişte (var, iyi). |
| 5 | **O** | `apps/kopru/src/tipler.ts:128-138` | Senaryo adımı türleri yalnız "şunu yap"; **bekle/koşul/dal/eğitmen onayı** yok, safha bilgisi yok. TCCC lane tasarımı "ateş kesilince taşı" gibi koşullu akış ister. | Adım türleri: `bekle_onay` (eğitmen "devam" basana dek), `rastgele_sure`, `safha` (CUF/TFC/TACEVAC → oynatıcıda sıhhiyeci davranışı ve çatışma tavanı), `not` (AAR'a düşen gözlem). |
| 6 | **O** | `apps/kopru/src/ornekSenaryolar.ts` | TCCC örnek senaryosu MARCH sırasına ve safha geçişine açıkça bağlı değil; eğitmen anlatımı için "beklenen davranış" alanı yok. | Her adıma `beklenen?: string` (öğrenciden beklenen) ve `safha?`; panel senaryo kartında göster. |
| 7 | **D** | `efektler/patlama.ts`, `sahne3b/patlama*` | Patlamanın **telegraf** evresi yok (ıslık/uzak flaş → temas). Eğitim için tepki penceresi en değerli evre. | `patlama` efektine `onUyari?: boolean`: 0,8–1,5 sn önce havan ıslığı (Doppler'li) + uzak namlu flaşı; Oda 2 "yaklaşan havan" senaryosu. |
| 8 | **D** | gece panoramaları, `gokOrtusu.ts` | Gece sahnesi fiziksel doğruya yakın (ay ışığı sınırı) ama projektör siyahı yansıtamaz; duvarda gri çamura dönme riski. | Gece için ayrı "projeksiyon ton eğrisi" (gölge tabanı kaldırılmış, mavimsi), panelde "Projektör modu" ön ayarı; sahada ölçülüp sabitlenir. |

## 2. Oynatıcı (3B sahne, efektler, ses, projeksiyon) – inceleme bulguları

Kaynak: bağımsız inceleme (gerçek zamanlı grafik geliştiricisi bakışı; three 0.186.1 kaynağıyla karşılaştırıldı). 1, 2 ve 3 bizzat
teyit edildi. Satırlar `apps/duvar-oynatici/src/` altında.

| # | Önem | Yer | Bulgu → Öneri |
|---|---|---|---|
| 1 | **K** | `main.ts:763-906` `kare` | Çizim döngüsünde try/catch yok, `requestAnimationFrame` en sonda → herhangi bir hata **duvarı kalıcı dondurur, ses sürer**. Olası tetik: AudioParam'a NaN (çatışma azimutu NaN → `p.pan.value = NaN` TypeError; helikopter konumu NaN → `setTargetAtTime`). → rAF'ı başa al; güncelle/çiz/ses ayrı try/catch; hatayı köprü günlüğüne bir kez; `cikis`/`stereoPan` girişinde `Number.isFinite`. |
| 2 | **K** | `sahne3b/yangin.ts:56` | Her yangın yeni `PointLight` ekliyor; three ışık sayısını gölgelendirici anahtarına katıyor → **her patlama artığı yangın bütün standart malzemeleri yeniden derletiyor** (önceden giderilen "ilk patlama takılması" 4 Kasım'dan beri geri gelmiş olabilir); yangın sayısı sınırsız. → Sahnede hep duran 2–4 ışıklık havuz (boşta parlaklık 0), en yakın yangınlar atanır. |
| 3 | **Y** | `ses.ts:710-733` `ortamDongusu` | Yarış: `ortamDosya` ancak `await tampon()` sonrası atanıyor; açılışta aynı anahtarla birden çok çağrı (manifest, durum, `sesiAc`, kaydırıcı) → **ortam sesi 2–3 kat, oturum boyunca sızar**. → Yükleniyor işareti / nesil; eski kaynak hemen dursun. |
| 4 | **Y** | `main.ts:308-311` | 3B hazır değilken patlama/toz/uzak patlama/yangın kuyruğa alınıyor ve `return`; **ses de kuyruğa takılıyor**, 10 sn sonra atılıyor; panorama yoksa 1 tuşu ne görüntü ne ses verir, 2B yedek çalışmaz. → Sesi hemen çal; 3B hazırlığı sürmüyorsa 2B yola düş. |
| 5 | **Y** | `sahne3b/sutre.ts:131-134,220-226` | `temizle()`/`tip=null` `nesil`i artırmıyor: Oda 2 sütresi yüklenirken Oda 1'e geçilirse sütre Oda 1'e eklenir, sonraki `ayarla(null)` erken döner; HESCO geometri/malzeme `dispose` yok. → `++nesil`, kaldırırken bırak. |
| 6 | **Y** | `baglanti.ts:29-34` | try/catch hem JSON çözmeyi hem `onMesaj`ı sarıyor: `durumUygula` içinde hata olursa `durum = d` atanmış ama panorama/ses/helikopter uygulanmamış kalır, iz yok. → Çözme ile işlemeyi ayır, hatayı günlüğe. |
| 7 | **Y** | genel | `webglcontextlost/restored` dinleyicisi yok: sürücü sıfırlanırsa (Iris Xe 8K yük, TDR) arka plan küpü/PMREM/ham GL dokusu geri gelmez, siyah kalır. → `restored`ta geçişi sıfırla, panoramayı yeniden iste. |
| 8 | **Y** | `sahne3b/parcaciklar.ts:34` | Parçacık kartları görüş uzayında kameraya dönük; her duvar kamerası farklı baktığından **köşeye denk gelen duman/toz iki duvarda farklı yönlü kart** → köşede kopukluk. → Kartı dünya uzayında göze (orijine) dönük kur (`normalize(-dünyaKonumu)`), üç kamerada aynı. |
| 9 | **O** | `sahne3b/figurler3b.ts:383` | Bütün figür ağları `frustumCulled=false`; three iskeleti her `render()`da yeniden günceller → 30K üçgenli asker 3 duvar + gölge = 4 geçişte derilir, kemik dokusu 4 kez yüklenir; asker sayısıyla doğrusal düşüş. → Bind pose'tan büyütülmüş sınır küresi, ayıklama açık. |
| 10 | **O** | `sahne3b/parcaciklar.ts:149-157` | Parçacık malzemesi sis almıyor, sıralanmıyor: sis 1'de (görüş 35 m) 260–560 m'deki uzak patlama sisin içinden net görünür; uzak duman yakın dumanın üstüne çizilir. → Sis hesabı (gök örtüsü eğrisi), grup başına uzaklık sıralaması. |
| 11 | **O** | `sahne3b/sahne3b.ts:341,356` | Renk uzayı tutarsız: duman dokusu doğrusal, alev dokusu sRGB; parçacık gölgelendiricisi sRGB'ye çevirmiyor → alev ince ve koyu, `renkOlcek` yanlış. → Hepsi NoColorSpace ya da gölgelendiricide dönüşüm. |
| 12 | **O** | `main.ts:259-283`, `sahne3b.ts:276` | Tuval CSS pikseliyle, `setPixelRatio(1)`: Windows ölçeği %125–150'de görüntü %67–80 çözünürlükte çizilip büyütülür, **projeksiyonda bulanık**. → Arka tamponu DPR ile çarp ya da DPR ≠ 1'de HUD/günlük uyarısı. |
| 13 | **O** | `main.ts:89`, `projeksiyon.ts:64-80,166-185` | 16:9 denetimi yalnız ön duvar; `on=6,yan=4,yuk=3` örneğinde yan 16:9 görüntü 5,33 m olmalı ama Kooima tam alanı 4 m'ye eşler → köşede perspektif kırılır; `?fov=` üst sınırsız (≥180 dejenere, 120–180 duvarlar üst üste). → `yan ≈ yuk·16/9` denetimi ya da kısmi görüntü alanı; fov ≤ 120. |
| 14 | **O** | `ses.ts:314-327` `tampon` | Yükleme sürerken aynı dosya için istekler birleştirilmiyor, başarısızlar önbelleğe girmiyor, ön yükleme yok → ilk salvoda aynı dosya N kez paralel indirilip çözülür, eksik dosya her atışta 404; ilk patlama/bağırma görüntüden gecikir. → `Map<string, Promise<AudioBuffer\|null>>`, manifestte ön yükleme. |
| 15 | **O** | `panorama.ts:228-244` | 2B video panoramada her rAF'ta tam boy `texImage2D` (video kare değişmese bile): 8K×4K video için kare başına ~100 MB, Iris Xe'de oynatılamaz. → `texStorage2D`+`texSubImage2D`, `requestVideoFrameCallback`; 4K sınırı ya da VideoTexture. |
| 16 | **O** | `sahne3b/panoramaGecisi.ts:88,105` | Yüklenemeyen dosya oturum boyunca kara listede: köprü restart/kopyalama sırasında tek hata panoramayı sayfa yenilenene dek kapatır. → Geri çekilmeli yeniden deneme; köprü yeniden bağlanınca temizle. |
| 17 | **O** | `sahne3b/arazi.ts:1078-1083`, `araziIzgara.ts:51-58` | Arazi kraterleri sınırsız birikir, derinlikler toplanır (`patlamaYeri` en yakın plan noktası, ±%8): aynı yöne 10 patlama metrelerce çukur; koridor güncellemesinde hepsi yeniden uygulanır. → En büyük derinliği kırp, krater sayısı sınırı. |
| 18 | **O** | `sahne3b/sahne3b.ts:1393-1397` | Kare başına 3 `render()` her biri bütün dünya matrislerini yeniden hesaplıyor (arazi hücreleri, kemikler dahil). → Döngü öncesi `updateMatrixWorld()` bir kez, duvar çizimlerinde `matrixWorldAutoUpdate=false`. |
| 19 | **O** | `sahne3b/figurler3b.ts:802-814` | Figür kaldırılırken `skeleton.dispose`, kopya malzeme `dispose`, `uncacheRoot` yok → gün boyu tekrarlarda sürekli sızıntı. → Tek kaldırma yardımcısı. |
| 20 | **D** | `sahne3b/sahne3b.ts:283-288` | Gölge kamerası sabit ±45 m; hibrit yarıçap 160 m → uzak kaya/çalı gölgesi kare sınırda kesilir (yan duvarlarda göze batar). → Sınırı profil yarıçapına bağla ya da gölgeyi sisle söndür. |
| 21 | **D** | `main.ts:764-771` | `dt` yalnız üstten sınırlı (ilk karede eksi olabilir); FPS sınırlanmış `dt` ile → 10 fps altında HUD/önizleme gerçeğin üstünü gösterir. → `Math.max(0,…)`, FPS ham süreyle. |
| 22 | **D** | `sesYerlesimi.ts:310-321` | Yangın ses anahtarı grubun ilk elemanının yuvarlanmış konumundan: ilk yangın sönünce anahtar değişir, ses 1,5 sn söner/yeniden kurulur. → Anahtar yangın kimliğinden. |
| 23 | **D** | `ses.ts` AudioContext | `onstatechange` yok; yeniden açma yalnız tuş/dokunuşla → HDMI ses aygıtı değişince kiosk sessiz kalabilir (olası). → Durumu izle, `resume` dene, günlüğe yaz. |
| 24 | **D** | `catisma.ts:505-528`, `figurler3b.ts:228` | Dost/tank sayaçları dizi indeksiyle (figür eklenip çıkınca salvo zamanlaması başka figüre kayar); her karede Vector3 kopyalı yeni diziler (GC baskısı). → Kimliğe bağla, geçici nesneler modül düzeyinde. |
| 25 | **D** | `sahne3b/panoramaCozucu.ts:44-55` | Panorama tam çözünürlükte çözülüp sonra küçültülüyor: 12K×6K ≈ 288 MB RGBA tepe; ara hatada `tam` bitmap kapatılmıyor. → `createImageBitmap(blob,{resizeWidth})`, try/finally. |

### Mimarinin güçlü yönleri (korunacaklar)

1. Panorama geçişi gerçek bir durum makinesi (nesil, iptal, işçide çözme, `fenceSync` şeritli yükleme, sabit PMREM, `dispose`).
2. Kooima genelleştirilmiş perspektifi 3B, 2B panorama, klipler ve K ızgarasında ortak; ölçülmüş odada sis gerçek uzaklıkla.
3. Kare hızı için yerinde çözümler: gölge haritası karede bir, iskelet paylaşımı, bitki hücreleri dışbükey kabukla ayıklama,
   parçacıklarda yalnız canlı aralık, izli mermi/parçacık havuzları, kısmi krater normali.
4. Sahne sıfırlaması nesil tabanlı, adım başına try/catch; seslerde nesil denetimi; köprü ile senkron nesli.
5. Saf (three'siz) modüller birim testli: `panoramaGecisi`, `sesYerlesimi`, `izliYol`, `helikopterUcusu`, `araziIzgara`,
   `bitkiSektorleri`; ses yerleşimi (sabit güçlü kaydırma, LFE, dağınık ortam) iyi soyutlanmış.

## 3. Köprü ve eğitmen paneli – inceleme bulguları

Kaynak: bağımsız inceleme (eğitmen aracı / live-ops geliştiricisi bakışı); 2, 6, "unhandledRejection yok" ve "ping yok" bizzat
teyit edildi.

| # | Önem | Yer | Bulgu → Öneri |
|---|---|---|---|
| 1 | **K** | `kopru/senaryo.ts` `tik` (try/finally, catch yok); `index.ts`'te `unhandledRejection` yok | Bozuk bir senaryo adımı (ör. elle düzeltilmiş `senaryolar.json`'da `ortam` alanı eksik) `ortamGuncelle(undefined)` → TypeError → **köprü süreci kapanır**; flaş anında olursa DMX beyazda kalır. → Adım başına try/catch + günlük; kaydederken/yüklerken şema doğrulama; genel `unhandledRejection` günlükçüsü. |
| 2 | **K** | `kopru/depo.ts:17-28` | Bozuk JSON sessizce `[]` sayılır, sonraki kayıtta dosyanın üstüne yazılır → **eğitmenin bütün senaryoları/ön ayarları gider**; yazım atomik değil. → Ayrıştırma hatasında dosyayı `.bozuk-<zaman>.json` diye kenara al, yazmayı reddet, günlüğe hata; geçici dosya + rename. |
| 3 | **Y** | `kopru/durum.ts` ayarlayıcılar (olası, yalnız `UNREAL_MOD=gercek`) | Yayın UE çağrısını bekliyor; UE ulaşılamazsa her komut duvara 8 sn gecikir; bu beklemede sıfırlama gelirse efekt sıfırlamadan sonra yayınlanır. → Önce yayınla, UE'ye beklemeden/kısa zaman aşımıyla gönder; `!bagli` iken atla; efekt sonrası sıfırlama neslini kontrol et. |
| 4 | **Y** | `kopru/index.ts` WS | Kalp atışı (ping/pong) yok: tablet uyuyunca `panel.sayi` düşmez, oynatıcılar 5 sn'de bir 65–100 ms'lik önizleme üretmeyi sürdürür; çöken oynatıcı sekmesi yeşil kalır. → 10 sn ping/pong, yanıtsıza `terminate()`. |
| 5 | **Y** | `kopru/index.ts:74-78`, `depo.ts:61-66` | Geri yükleme etkin çatışma/izli/helikopteri de geri getiriyor; çökme sonrası duvar senaryosuz ateş eder; saat geri alınırsa 12 saat kuralı işlemez. → Geri yüklemede temel sahne mantığı (ortam kalsın, etkinler gitsin) ya da panelde "Kaldığı yerden / Temel sahne" sorusu; `zaman > now` kaydını reddet. |
| 6 | **Y** | `kopru/figur.ts:128` | `tekSeferlikleriKaldir` hiçbir yerden çağrılmıyor: döngüsüz klip aktif listede sonsuza dek kalır, yeniden bağlanan oynatıcıda yeniden oynar, Sıfırla rozeti sayar. → Oynatıcı `bitti` bildirsin ya da manifest süresinden yaşam süresi. |
| 7 | **Y** | `kopru/figur.ts:82-100` | Klip adı doğrulanmıyor (panelde var, duvarda yok); `Number("x")` → NaN azimut/ölçek; aynı kimlik sessizce üstüne yazılır (editör `senaryo_<adım>` kimlikleri senaryolar arası çakışır); her `oynat`ta 192 KB manifest eşzamanlı okunuyor. → Manifest önbelleği + klip doğrulama, `Number.isFinite`, çakışan kimliği reddet ya da senaryo kimliğini önek yap. |
| 8 | **Y** | `kopru/durum.ts:92-166`, `api.ts:101-139` | PATCH gövdeleri doğrulanmıyor: metin değer NaN üretir (`isik.r` NaN → DMX 0, oda kararır; NaN `son-durum.json`'a null yazılıp geri yüklenir); sıralı alanlar serbest metin; `aktif:"false"` truthy. → API'de şema doğrulama + 400; `sinirla` sonlu olmayanda eski değeri korusun. |
| 9 | **Y** | `kopru/senaryo.ts:180-184`, `api.ts` adım-tetikle | Hatalar eğitmene görünmüyor: figür adımı başarısız olsa "Şimdi" `{tamam:true}` döner; UE/oynatıcı/DMX hataları yalnız Sistem rozetinde. → `{tamam:false, uyari}`; uyarı/hata satırları sınırlı sayıda bildirim olarak panelde. |
| 10 | **O** | `kopru/artnet.ts:110-133`, `UstCubuk.tsx:82` | DMX hataları yutuluyor (boş hata işleyici); lamba `artnet.aktif` ayarına bakıyor, gönderim başarısına değil; paket yalnız değişimde gidiyor (düğüm sinyal kaybında söner/donar). → Seyrekleştirilmiş günlük, lambayı son başarılı gönderime bağla, 1–2 sn'de bir yeniden gönder. |
| 11 | **O** | `panel/Oda2Paneli.tsx:68,81`, `heliDizisi.ts` | Elle helikopter komutu süren iniş dizisini iptal etmiyor (10. sn'de "Kalkış" dersen 20. sn'de dizi "iniyor" gönderir); dizi tablette çalışır, ekran kapanınca takılır; hatalar yutulur. → Elle değişimde `heliDizisiIptal()`; diziyi köprüye makro olarak taşı. |
| 12 | **O** | `panel/Uygulama.tsx:175,93`, `SenaryoPaneli.tsx:13` | `key={sekme}` sağ sütunu yeniden kuruyor: F1–F5 kaydedilmemiş senaryo taslağını onaysız siler; kısayol filtresi yalnız INPUT/SELECT/TEXTAREA → "+ Adım ekle"den sonra odak düğmede, "5" tuşu duvarda gerçek efekt tetikler. → Taslağı bağlama/yerel kayda taşı; editör açıkken canlı kısayolları kapat. |
| 13 | **O** | `panel/ortak.tsx:135-156`, `Uygulama.tsx:60-80` | İki aşamalı onayda en kısa bekleme yok: çift dokunuş/dokunma sıçraması Sıfırla ve Sil'i anında uygular; Esc "vazgeç" tuşuyken yıkıcı onay olarak kullanılıyor. → İkinci dokunuş < 400 ms yok sayılsın; Sıfırla için basılı tutma (~800 ms). |
| 14 | **O** | `kopru/senaryo.ts:214` | Senaryo durumu her tikte (50 ms) yayınlanıyor → saniyede 20 mesaj tüm istemcilere, panelde bütün gövde 20 kez/sn yeniden çizilir (tablette takılma/pil). → Adım değişiminde + 1 Hz; panel konumu kendisi hesaplasın. |
| 15 | **O** | `panel/SenaryoPaneli.tsx:15-18` | Senaryo listesi yalnız açılışta çekiliyor; başka panel senaryo ekler/siler → `yuklu` tanımsız, Oynat/Duraklat denetimleri kaybolur. → Liste değişimi WS ile; `SenaryoDurumu` yüklü senaryonun adını/adımlarını taşısın. |
| 16 | **O** | `kopru/api.ts:183-194`, `senaryo.ts:199,207` | Kayıtta kimlik/adım kimliği doğrulanmıyor: istemci `id`'si örnek senaryoların üstüne yazar; aynı adım kimliği iki kez geçerse ikincisi hiç çalışmaz ve senaryo **hiç bitmez**. → Benzersiz adım kimliği; üstüne yazmak için `surum`/onay. |
| 17 | **O** | `kopru/senaryo.ts:120-145` | Durdur/Duraklat senaryonun açtığı çatışma/izli/helikopteri kapatmıyor; `dur()` `tamamlanan`ı sıfırlamıyor (00:00'da adımlar tamamlanmış görünür). → Durdur sürekli efektleri kapatsın (ya da seçenek), Duraklat dondursun, `tamamlanan` sıfırlansın. |
| 18 | **O** | `kopru/senaryo.ts:196` (olası) | Zaman duvar saatinden (`Date.now()`); NTP düzeltmesi/elle saat değişimi adımları topluca ateşler ya da durdurur. → `performance.now()`; yığılmayı günlüğe yaz. |
| 19 | **O** | `panel/FigurPaneli.tsx:79,109,115,138` | İstek düşse de başarı bildirimi çıkıyor (`.then(() => bildir())`). → `.then((r) => r && bildir())`. |
| 20 | **O** | `panel/ortak.tsx:53-62` Kaydirici | Sürükleme boyunca değer gitmiyor (120 ms bekleme sonrası); son dokunuştan sonraki 500 ms'de gelen sunucu yanıtı yok sayılır; hata/sınırlamada kaydırıcı sunucuda olmayan değeri gösterir. → Sürüklerken ~100 ms'de bir gönder, parmak kalkınca kesin değer; hatada sunucu değerine dön. |
| 21 | **O** | `kopru/unreal.ts:128`, `gunluk.ts` (200 halka) | Simülasyon kipinde her UE çağrısı bilgi satırı → hata satırları halkadan itilir, Sistem rozeti sıfırlanır. → Simülasyon kayıtları ayrı düzey/halka; hatalar için ayrı halka. |
| 22 | **O** | `tema-a.css:173,276,867`, `stil.css:1646` | Dokunma hedefleri 44 px altında: `button.kucuk` 32 px (Sıfırla, Kaldır, **Vuruldu**, Şimdi, Sil), bildirim kapat ~22 px, seçenek grubu 36 px, hızlı zaman 34 px; "Vuruldu" "Kalk/Diz çök"ün dibinde. → `@media (pointer: coarse) { button { min-height: 44px } }`, yıkıcı düğmeleri ayır. |
| 23 | **O** | `panel/Bildirimler.tsx:9`, `arayuz.tsx:126` | Hata bildirimi 6 sn'de kaybolur, `aria-live="polite"`; devre dışı düğme metinleri ~3:1 karşıtlık. → Hata kapatılana dek kalsın, `role="alert"`; ≥ 4,5:1. |
| 24 | **O** | `panel/useKopru.ts:105-107,135-142` | Bağlantı kopunca yalnız lamba sarı; denetimler eski durumla açık; yeniden deneme sabit 2 sn; `sifirlamaUygula` HTTP yanıtı daha yeni WS durumunun üstüne yazabilir (olası). → "BAĞLANTI YOK – görüntü güncel değil" şeridi + denetim kilidi; duruma tekdüze `surum`, eskiyen yanıtı at. |
| 25 | **D** | `kopru/durum.ts:194` | Şimşeğin ikinci flaşı `setTimeout`; `flasiIptal`/sıfırlama iptal etmiyor (sıfırlamadan 170 ms sonra flaş). → Zamanlayıcıyı `ArtNetGonderici`de tut, `flasiIptal` temizlesin. |

### Eğitmen paneline bir oyun aracı geliştiricisinin ekleyecekleri

1. **Olay günlüğü + yeniden oynatma (AAR):** her komut kaynak/panel/zaman damgasıyla JSONL'e; tatbikat sonrası zaman çizelgesi,
   olay işaretleri, eğitmen notları, CSV/PDF dışa aktarım; "yeniden oynat" aynı komut akışını duvara gönderir.
2. **Zaman çizelgesinde gezinme ve "buradan başlat":** belli saniyeye atlama (adımların etkileri katlanarak o anın durumu kurulur),
   adımı tekrarla, eğitmen "devam" diyene dek bekleyen `bekle` adımı (kursiyerin hızına göre ilerleme).
3. **Makro (cue) düğmeleri:** eğitmenin tanımladığı tek dokunuşluk diziler ("Pusu" = çatışma + patlama + bağırma; helikopter iniş
   dizisi) köprüde çalışır, tablet kapansa da sürer, geri sayımı ve iptali olur.
4. **Kilit kipi ve kontrol sahipliği:** gösterim kilidinde yalnız oynat/duraklat/sıfırla; iki panelde biri sahip, diğeri devralma
   ister; fazladan tabletler salt-okunur.
5. **Önizleme/prova kanalı:** editörde adım "dene" duvara gitmeden küçük önizlemede çalışır.
6. **Sağlık paneli ve gözcü:** oynatıcı fps, son kare yaşı, WS gidiş-dönüş, son DMX gönderimi, UE gecikmesi, disk; sınır aşımında
   bildirim + sesli uyarı; donan oynatıcı kendini yeniler.
7. **Durum sürümü, iyimser arayüz, geri al:** her değişikliğe `surum`; düğmede bekleyen istek göstergesi; son 10 komut için "Geri al".
8. **Kursiyer işaretleme ve TCCC ölçümü:** tek tuşla zaman damgalı not; turnike süresi, sütreye çekme süresi gibi sayaçlar senaryo
   adımlarına bağlanır, sonuçlar AAR raporuna akar.

## 4. Figürler, animasyon ve içerik hattı – inceleme bulguları

Kaynak: bağımsız inceleme (teknik animatör / içerik hattı bakışı). Manifest tutarlılığı betikle denetlendi: 79 model kaydında dosya,
klip, kemik, kule/namlu referanslarının hepsi yerinde (eksik görünen iki dosya yalnız `_ornek` kayıtları). 1 ve 13 bizzat teyit edildi.

| # | Önem | Yer | Bulgu → Öneri |
|---|---|---|---|
| 1 | **K** | `panel/figurYardimcilari.ts:8` | `vurulabilirAskerler` yalnız `^asker_(bekleyen\|taktik\|diz_cokmus\|kamuflaj)` tanıyor; manifestte artık `komando_*`, `telsizci_*` var. **"Asker vuruldu!" düğmesi, canlı sahne düğmesi ve 6 tuşu çalışmıyor** (Oda 1'in en önemli tek dokunuşu; gösterimde patlar). → Manifest `grup === "asker"` + `_(kosan\|yuruyen\|comelerek\|surunen)` dışlaması; testi yeni adlarla. |
| 2 | **Y** | `kopru/figur.ts:95,108`, `figurler3b.ts:592` | "ayakta" duruşu saklanmıyor (`delete mevcut.poz`); oynatıcı `s.poz ?? tanim.poz`. Diz çökmüş/yaralı figüre "Kalk" dendikten sonra yeniden bağlanma/yeni sekme/köprü restart → figür eski duruşa döner. → `poz: "ayakta"` açıkça saklansın. |
| 3 | **Y** | `figurler3b.ts:511-516` | Silah soketinde `kemikOlcek = getWorldScale().x` zaten `olcek`'i içeriyor ama konum/boy bir kez daha `/olcek`'e bölünüyor; `yansit: true`'da dünya ölçeği negatif → tüfek ters/öbür ele (örnek senaryolarda `komando_yuruyen yansit:true` kullanılıyor); panel Ölçek kaydırıcısı tüfeği 1/ölçek küçültür. → `Math.abs(kemikOlcek)`, tek bölme; 3B'de `yansit` yalnız yürüme yönü, `scale.x` aynalaması kalksın. (Çalışırken doğrulanmalı.) |
| 4 | **Y** | `figurler3b.ts:640-656` | Duruş geçişleri ani; GLB'de geçiş klipleri var ve kullanılmıyor (`Rifle Stand To Kneel`, `Kneel To Stand`, `Crouch To Prone`, `Standing Up`, `Kneeling Down`). Yaralı→Kalk tek karede sıçrar; yaralı→diz çök'te durmuş eyleme `crossFadeTo` → 0,4 sn A-poz görünür; ayakta↔yatmış 0,4 sn düz karışımda "süzülme". → Geçiş klibi `LoopOnce` + `finished`te döngüye geçen küçük durum makinesi. |
| 5 | **O** | `figurler3b.ts:835-844`, `kopru/figur.ts:102-111` | Hareketli figür (`hiz > 0`) duruş değiştirince kaymaya devam eder (editör/API engellemiyor): diz çökmüş/ölü asker 1,5–4,5 m/sn kayar, \|azimut\| > 165°'de silinir. `azimut`/`yukseklik` NaN geçiyor, `dongu` tipi denetimsiz. → Duruş değişiminde `hiz = 0`; doğrulama. |
| 6 | **O** | `figurler3b.ts:843-847`, `figur.ts:128` | Ekrandan çıkan koşan/yürüyen figür köprüye bildirilmiyor; `dongu: true` olduğundan listede sonsuza dek kalır, her yeniden bağlanmada baştan koşar. → Oynatıcı `bitti` bildirsin (köprü/panel 6 ile ortak). |
| 7 | **O** | `figurler3b.ts:598-601`, `main.ts:449-453` | Model yüklenirken gelen `poz` komutu kayboluyor (kuyruk yalnız `bekleyenFigurler`'de): ilk kez çağrılan asker (6–7,5 MB) hemen "Vuruldu" alırsa ayakta kalır. → `bekleyenPoz` haritası, yükleme bitince uygula. |
| 8 | **O** | `figurler3b.ts:459-463` | Bekleme klibi her örnekte 0. sn'den aynı hızla → aynı anda çağrılan askerler eşzamanlı nefes alır ("klon ordusu"). → `time = random*duration`, `timeScale` 0,95–1,05. |
| 9 | **O** | `catisma.ts:390-392`, `figurler3b.ts:229` | Dost ateşi namlu noktası duruştan bağımsız (ayak + 1,35 m + 0,6 m ileri): yatan askerin 1 m üstünde parlama; atış zamanlaması ile 0,3 sn `Firing Rifle` döngüsü bağımsız (geri tepme–parlama–ses senkronsuz); yatmış/diz çökmüşte ateş klibine geçilmiyor ama atış görünüyor. → Namlu soketi `silahNesne`den, atış animasyon olayıyla. |
| 10 | **O** | `araclar/mixamo-aktar.py:156` | Her klipte kalça yatayı sabit, kök hareket atılıyor: `Dying`/`Hit Reaction` geriye düşerken ayaklar öne kayar; manifest `hiz` değerleri adım uzunluğundan ölçülmemiş (ayak kayması olası). → Kök yer değiştirmesini klip başına ölç, hızı manifeste yaz; tek seferliklerde kök hareketi sarmala uygula. |
| 11 | **O** | `figurler3b.ts:269,421`, `sutre.ts:214` | Zemine oturtma tek noktadan: 7,7 m tank ve yatan yaralı yokuşta bir ucu gömülü, öbür ucu havada; normale hizalama ve ayak IK yok; torba duvarı da tek nokta. → Sınır kutusu köşelerinden eğim, normale yatış. |
| 12 | **O** | `figurler3b.ts:828-834,335` | Silahlı figür düşmana yerinde üstel döner (`dt*3`), yatan gövde kalça etrafında "saat ibresi" gibi süpürür; kule hız sınırsız (180° ~1 sn; gerçek ~40°/sn). → Dönüş hızı sınırı, yatan/diz çökmüşte yalnız üst gövde. |
| 13 | **O** | `figurler3b.ts:383` | `frustumCulled = false` her mesh'te (tank 70K, zırhlı 60K, enkaz 40K üçgen) → her nesne 3 duvar geçişinin hepsinde çizilir. → Yalnız `SkinnedMesh` için kapat ya da genişletilmiş sınır küresi. |
| 14 | **O** | `main.ts:670-676`, `figurler3b.ts:215,339-346` | Açılışta 30 GLB ön yükleniyor (83 MB), önbellek boşalmıyor, KTX2 yok; açılmış dokular ~1 GB (Iris Xe paylaşımlı bellek baskısı olası); 0,95 m tüfekte 12K üçgen + 3×2K doku; ilk askerde gölgelendirici derleme takılması (`compileAsync`/`initTexture` yok). → Tembel yükleme + LRU, KTX2/Basis, tüfek dokusu 1K, ısınma derlemesi. |
| 15 | **D** | `asker_komando.glb` | Animasyonda 198 kanal (66 kemik × T/R/S, sabit kanallar atılmamış; API rig'lerinde 72). → gltf-transform `resample` + sabit kanal ayıkla; uzak asker için 8K LOD. |
| 16 | **D** | `figurler3b.ts:434-447,783` (olası) | "yanında" yerleşimi kök noktasına göre; `Dying` sonrası beden geriye uzandığından sıhhiyeci/CPR ayak ucunda kalabilir; "yardım" kol hareketi sarmal eksenine göre (yatan pozda kol yere girebilir). → Etkileşim soketi (göğüs kemiği dünya konumu + gövde yönü). |
| 17 | **D** | `mixamo-aktar.py:115-117,143,35-39` | Eşleşmeyen hedef kemik sessizce dinlenmede kalır; malzeme ayarı yalnız ilk mesh'e; `im.scale(2048,2048)` kare olmayan dokuyu ezer. |
| 18 | **D** | `araclar/tank-ayir.py:36-38,108-112,143` | Varsayılan `--ucgen 60000` Decimate çalıştırıyor (belgelenen UV yırtılması); güvertenin %2 üstündeki gövde parçaları kuleye düşer; pivot kule kutusu merkezi (eksantrik dönüş olası); namlu yükseliş pivotu yok. |
| 19 | **D** | `araclar/meshy-uret.mjs:60-85` | `create` başarılı, `project init` başarısızsa görev kimliği kaydedilmiyor → yeniden çalıştırmada aynı adım ikinci kez ödenir; rig FAILED olunca geometri yedek yolu tekrar denenmiyor. |
| 20 | **D** | `figurler3b.ts:802-814,846`, `sutre.ts:96-134` | `dispose`/`uncacheRoot` yok; HESCO `BoxGeometry`/malzeme her dizilim değişiminde sızıyor. |

### AAA oyunlarda askeri inandırıcı kılan, burada eksik 10 teknik

1. **Animasyon durum makinesi + geçiş klipleri** (GLB'de duruyor: Stand↔Kneel, Crouch→Prone, Standing Up, 3 ölüm varyantı).
2. **Üst/alt gövde katmanlama** (kemik maskeli eylem: ateş/şarjör değiştirme diz çökme/yatma/yürümenin üstüne).
3. **Bakış ve baş IK, nişan ofseti** (omurga + baş düşmana/patlamaya/yaralıya).
4. **Ayak IK ve zemin normaline hizalama** (asker, tank, yatan beden).
5. **Kök hareket ve hız eşleme** (klipten ölçülen hız, stride warping, yerinde dönme klipleri).
6. **Bekleme varyasyonu** (rastgele faz/hız, ara sıra `Look Around`, eklemeli nefes ve ağırlık aktarma).
7. **Tepki animasyonları ve ragdoll karışımı** (yakın patlamada sinme, yöne göre isabet tepkisi, fizik karışımlı düşüş).
8. **Ses–animasyon senkronu** (animasyon olayıyla namlu parlaması + ses, ayak sesi, teçhizat hışırtısı).
9. **İkincil hareket** (anten, çanta, kayış için yaylı kemikler).
10. **Grup davranışı** (ateş ve hareket, aralık koruma, kademeli tepki, el işaretleri: `Beckoning`/`Pointing` klipleri mevcut;
    sıhhiyecinin yürüyüp diz çökerek müdahale sekansı).

## 5. Eksik sistemler (oyun geliştirici gözüyle)

| Sistem | Bugün | Neden gerek |
|---|---|---|
| **Eğitim döngüsü (AAR):** olay günlüğü (JSONL, zaman damgalı), tekrar oynatma, eğitmen notu, rapor | Yalnız 200 satırlık halka günlük | Simülatör sektöründe eğitmen istasyonunun (IOS) asıl değeri brifing–uygulama–değerlendirme döngüsüdür; bugün uygulama var, değerlendirme yok |
| **Safha modeli:** CUF / TFC / TACEVAC senaryo ve oynatıcı davranışında | Yok | TCCC doğruluğu: ateş altında sıhhiyeci açıkta müdahale etmez, çatışma şiddeti safhaya bağlı tavanlanır, Oda 2 tahliye adımları (LZ, duman, helikopter) safhaya bağlanır |
| **Koşullu/bekleyen senaryo adımları:** `bekle_onay`, `rastgele_sure`, dal | Adımlar yalnız sabit zamanlı | Kursiyerin hızına göre ilerleme; crawl–walk–run kademeleri aynı senaryodan türetilir |
| **Figür davranış katmanı:** durum makinesi, bakış IK, üst/alt gövde, idle varyasyonu, tepki | Klip oynatma + prosedürel ofset | İnandırıcılık yüzden çok davranıştan gelir; GLB'deki geçiş klipleri kullanılmıyor |
| **Merkezî kaynak/yaşam döngüsü yöneticisi:** tek `dispose`, GPU bütçesi, `renderer.info` izleme, bağlam kaybı | Yerel ve eksik dispose | Gün boyu açık kiosk; sızıntı ve TDR birikir |
| **Işık ve efekt bütçesi:** ışık havuzu, öncelikli efekt kotası (N yangın/krater/parçacık), önceden derlenmiş program çeşitleri | Sınırsız yangın ışığı, sınırsız krater | Gölgelendirici yeniden derleme takılmaları ve kare hızı çöküşü |
| **Tek sahne saati + iptal edilebilir olay kuyruğu** | `dt`, `sahneSaati`, `AudioContext.currentTime`, `setTimeout` karışık | Ses–görüntü senkronu (flash-to-bang, crack–thump), duraklat/sıfırlamada tek yerden iptal |
| **Deterministik rastgelelik (oturum tohumu)** | `mulberry32` var ama efektler `Math.random` | Senaryo tekrarı, hata yeniden üretimi, gösterim provası |
| **Profil/metrik kanalı + dinamik kalite** | HUD fps, önizleme bilgisi | CPU/GPU kare süresi, çizim/üçgen, bellek, derleme olayları köprüye; kare süresine göre çözünürlük/gölge/parçacık kademesi |
| **Sağlık gözcüsü** | Lambalar | Oynatıcı fps/son kare yaşı, WS gidiş-dönüş, DMX son gönderim; donan oynatıcıyı yenile |
| **Doğrulama katmanı** (API şema, manifest/klip, senaryo adımı) | Yok | Bugünkü K bulgularının (köprü çökmesi, veri kaybı, NaN) ortak kökü |

## 6. Geliştirme önerileri (öncelik sırasıyla)

### A. Gösterim öncesi (1–3 gün; küçük, yüksek etkili) — ✓ 8 Kasım, hepsi yapıldı (ayrıntı aşağıdaki maddelerde)
1. ✓ **"Asker vuruldu" düğmesini onar** (§4-1): `figurYardimcilari.ts` manifest `grup` tabanlı süzgeç (liste yoksa `komando_*`/`telsizci_*` adları), hareketli klipler hariç.
2. ✓ **Köprüyü çökmez yap** (§3-1, §3-2): `senaryo.ts` adım başına try/catch + bozuk işlem denetimi, `index.ts` `unhandledRejection`/`uncaughtException` günlüğe, `depo.ts` bozuk JSON `.bozuk-<zaman>.json` yedeği + uyarı, `.tmp` + rename atomik yazım (testler `senaryoHata.test.ts`, `depoBozuk.test.ts`).
3. ✓ **Çizim döngüsünü koru** (§2-1): `main.ts` rAF başta, güncelle/çiz ayrı try/catch, hata 10 sn'de bir köprü günlüğüne; `ses.ts` `cikis` ve rotor pan'da NaN koruması; `dt ≥ 0`.
4. ✓ **Yangın ışık havuzu** (§2-2): `yangin.ts` 3 sabit `PointLight` (boşta görünmez), en güçlü/yakın yangınlara atanır (`yanginIsik.test.ts`).
5. ✓ **Ortam sesi yarışı** (§2-3: `ortamNesli`, tek kaynak) ve **3B hazır değilken ses hemen** (§2-4: kuyruğa alınan patlama/uzak patlamanın sesi beklemez, görüntü sonra; `efektUygula(e, sesCalindi)`).
6. ✓ **Uzak patlama sesine mesafe gecikmesi** (§1-1): `ses.patlama` uzakta `mesafe/343` sn (≤ 6 sn) bekler, sıfırlamada iptal.
7. ✓ **Sarsıntı anahtarı** (§1-2): `?sarsinti=kapali|hafif|tam` (`sarsintiSecimi.ts`, yerel kayıt, varsayılan hafif = genlik %35), panel Sistem › Oynatıcı ayarları.
8. ✓ **"Ayakta" duruşunun saklanması** (§4-2: `figur.ts` poz her zaman saklanır) ve **yürüyen figürün `bitti` bildirimi** (§3-6/§4-6: oynatıcı `{tip:"figur", islem:"bitti", id}` → köprü `bittiBildir` → `durdur` yayını; `figurBitti.test.ts`).

### B. Kısa vade (1–2 hafta) — ✓ 8 Kasım, hepsi yapıldı (ayrıntı maddelerde)
9. ✓ **Figür bakış/baş yönelimi** (§1-3: `sahne3b/bakis.ts` saf hesap + `FigurKatmani.bakisiUygula`; öncelik yanındaki/yaralı (sıhhiyeci)
   > düşman yönü > 12 m içindeki yaralı > 4 sn içindeki son patlama; göğüs %35 + baş %65 yaw, baş pitch; ±70°/±25°, 0,35 sn yumuşatma)
   + ✓ **idle faz/hız rastgeleliği** (§4-8: döngü klibinde rastgele `time`, ±%5 `timeScale`) + ✓ **duruş geçiş klipleri** (§4-4:
   `GECIS_KLIPLERI` — Rifle Stand To Kneel / Kneel To Stand / Crouch To Prone / Standing Up; LoopOnce → bitince hedef döngüye
   0,25 sn çapraz geçiş; yaralı→kalk "Standing Up"). Başsız tarayıcıda doğrulandı (diz çökme geçişi, bakış açıları).
10. ✓ **Senaryo adımları:** `bekle_onay` (senaryo "bekliyor"a düşer, eğitmen Devam/Boşluk; sonraki adımlar bekleme kadar kayar,
    `SenaryoMotoru.devamEt`, `POST /senaryo/devam`) ve `safha` (`durum.safha`: ateş altında / taktik saha / tahliye; `PUT /safha`;
    canlı sahne kartında rozet + seçici; oynatıcıda sıhhiyeci "ateş altında"da yaralıdan ~4,5 m izleyici tarafında siperde diz çöker,
    taktik sahaya geçince yürüyüp (Rifle Crouch Walk) yaralının başına gider). `rastgele_sure` ve `beklenen` alanı bekliyor.
    Testler `senaryoBekle.test.ts`; başsız tarayıcıda sıhhiyeci siper→yürüyüş→müdahale doğrulandı. ✓ Durdur
    senaryonun açtığı çatışma/izli/helikopteri kapatır ve `tamamlanan` sıfırlanır (§3-17, `DurumDeposu.sureklileriKapat`);
    ✓ senaryo yayını adım değişiminde + 1 Hz (§3-14); ✓ liste değişimi `senaryolar` WS mesajıyla, `SenaryoDurumu.ad` (§3-15);
    ✓ adım kimlikleri kayıtta tekilleştirilir, işlem/gecikme denetimi (§3-16, `dogrulama.ts`).
11. ✓ **API doğrulama** (§3-8: `dogrulama.ts` şemaları, PATCH/efekt 400 + hata listesi; depo NaN/seçenek koruması, eski değer kalır)
    ve ✓ **hataların eğitmene görünmesi** (§3-9 `adim-tetikle` `{tamam:false, uyari}` → bildirim; köprü HATA satırları 3 sn'de bir
    bildirim; §3-19 FigurPaneli başarısız istekte başarı bildirimi yok; §3-23 hata bildirimi kapatılana dek kalır, `role=alert`,
    devre dışı metin karşıtlığı ≥ 4,5:1). Figür komutu doğrulaması (§3-7, §4-5) bekliyor.
12. ✓ **Bağlantı sağlamlığı:** WS ping/pong 10 sn (§3-4), "BAĞLANTI YOK" şeridi (§3-24), geri yüklemede etkin çatışma/izli/
    helikopter kapalı başlatılır + gelecek tarihli kayıt reddedilir (§3-5); şimşek ikinci flaşı iptal edilebilir (§3-25).
13. ✓ **Tablet ergonomisi:** `pointer: coarse`'ta 44 px dokunma hedefleri, yıkıcı düğme aralığı, iki aşamalı onayda 400 ms (§3-13,
    §3-22); editör açıkken canlı kısayollar kapalı, taslak yerel kayıtta sürer (§3-12); elle helikopter komutu diziyi iptal eder
    (§3-11; diziyi köprüye taşıma bekliyor); kaydırıcı sürüklerken gönderir (§3-20).
14. ✓ **Köşe sürekliliği:** parçacık kartları dünya uzayında göze (`cameraPosition`) dönük, üç kamerada aynı kart (§2-8);
    parçacık gölgelendiricisi sahnenin doğrusal sisini alır (normal karışımda renk sis rengine, katkıda alfa söner) ve
    normal karışımlı gruplar arkadan öne sıralanır (§2-10); alev dokusu da doğrusal (§2-11). `parcaciklar.test.ts`. **Gerileme ve düzeltme (8 Kasım gece):** ilk
    sürümde kart normali gözden uzağa çıkıyor, FrontSide ayıklaması bütün parçacıkları yutuyordu (kullanıcı: "dumanları
    kaldırmışsın"); normal göz − merkez, malzeme DoubleSide, `parcacikKart.test.ts`. Canlı A/B: eski görüş-uzayı kartıyla toz
    yoğunluğu aynı, yani başka gerileme yok.
15. ✓ **Projeksiyon doğruluğu:** `?dpr=cihaz` 3B tuvali cihaz çözünürlüğünde çizer, varsayılan 1 ve DPR ≠ 1'de HUD + köprü
    günlüğü uyarısı (§2-12); U odada yan duvar 16:9 sapması > %30 ise HUD uyarısı (reddedilmez; kısmi görüntü alanı desteği
    bekliyor), `?fov=` 120 ile sınırlı (§2-13).

### C. Orta vade (3–6 hafta) — 16 ve 17 ✓ 8 Kasım gece (AAR tekrar oynatma hariç)
16. ✓ **AAR:** `kopru/olaylar.ts` — her anlamlı olay (durum farkı `durumFarki`, efekt, figür, senaryo durumu/adımı, sıfırlama,
    eğitmen notu, oynatıcı hatası) `veri/olaylar/<gün>.jsonl`; tatbikat kimliği senaryo baştan oynatılınca ya da panelden
    "Tatbikat başlat" ile; API `GET /olaylar`, `/olaylar/gunler`, `/olaylar/csv`, `POST /olay/not`, `/tatbikat/baslat|bitir`; WS `olay`,
    `tatbikat`; panel Senaryo sekmesinde "Tatbikat günlüğü (AAR)" kartı (canlı liste, tatbikat süresine göre zaman, M tuşu not alanı,
    CSV indir). Bekleyen: tekrar oynatma (komut akışını duvara yeniden gönderme), TCCC sayaçları (turnike süresi vb.), PDF.
17. ✓ **Crack–thump ve mesafe ses modeli** (§1-4): `mesafeSesi.ts` (gecikme mesafe/343 ≤ 4 sn; kesim 300 m 6 kHz → 1 km 2 kHz →
    2 km 800 Hz; kazanç −6 dB/2×, 150 m referans) — uzak düşman atışının namlu sesi parıltıdan gecikmeli, boğuk ve mesafeyle
    kısık gelir (`CatismaSesleri.atis(azimut, uzak, mesafe)`, `SesMotoru.tekAtis`); yakın geçişin "çat"ı beklemez. Silah sesi
    katmanları (mekanik/bas/kuyruk) bekliyor.
18. **Telegraf evresi** (§1-7): havan ıslığı + uzak namlu flaşı; **aydınlatma fişeği** (paraşüt, salınımlı gölge, 20–35 sn); yağmur
    sıçraması/ıslak zemin; bitki sallanması (docs "Kalan").
19. **Gece projeksiyon modu** (§1-8): gölge tabanı kaldırılmış ton eğrisi, sahada sabitlenir.
20. **Kaynak yöneticisi + ışık/efekt bütçesi + tek sahne saati + oturum tohumu** (§5).
21. **Performans:** figür sınır küresi ve ayıklama (§2-9), matris güncellemesi bir kez (§2-18), tembel GLB yükleme + KTX2 (§4-14),
    animasyon kanal ayıklama ve LOD (§4-15), krater sınırı (§2-17), panorama küçültülmüş çözme (§2-25).

### D. Uzun vade (gelecek sürüm)
22. Üst/alt gövde katmanlama, ayak IK ve zemin normaline hizalama, tepki animasyonları/ragdoll karışımı, grup davranışı (ateş ve
    hareket, el işaretleri), ikincil hareket; etkileşim soketleri (sıhhiyeci–yaralı).
23. Gerçek VFX plakaları ve yeşil perde klipleri, Türkçe bağırma/inleme kayıtları (docs §2.5, icerik-ihtiyac-listesi).
24. Dinamik kalite, GPU zaman sorgusu, metrik kanalı; kilit kipi ve kontrol sahipliği; makro düğmeleri; önizleme/prova kanalı.

## 7. Sıradaki adımlar için önerilen sıra

1. A-1…A-8'i tek dalda ("gosterim-onarim") yap, her biri için birim test; duvarda "Gösterim – Güncel Durum" ile uçtan uca dene.
2. B-9 (figür davranış turu) ve B-10 (senaryo adımları) kullanıcı kararı ister: bakış hedefi önceliği (düşman > yaralı > patlama) ve
   `safha`nın oynatıcıya etkisi (sıhhiyeci ateş altında bekler mi?) netleştirilmeli.
3. C-16 (AAR) için önce veri modeli: hangi olaylar, hangi alanlar, nereye yazılır (`apps/kopru/veri/olaylar/<tarih>.jsonl`).
4. Bu belgedeki her bulgu kapanınca satırı "✓ (commit)" ile işaretle; CLAUDE.md "Sıradaki işler" bu belgeye işaret eder.
