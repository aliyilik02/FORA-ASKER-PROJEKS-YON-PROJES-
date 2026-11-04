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

Tuşlar: **H** hata ayıklama katmanı · **K** kalibrasyon ızgarası (azimut/yükseklik çizgileri, göz hizası ufuk,
duvar açıları; aşağıda) · **F** tam ekran · **M** sessiz · **T** hoparlör testi · **1 / 2 / 3** patlama / toz /
izli mermi testi (basılı tutma tekrar etmez) · **⇧0** sahneyi temele döndür: köprüye `POST /api/sahne/sifirla
{kaynak:"oynatici"}` gider, bütün oynatıcılar ve paneller sıfırlanır; köprüye ulaşılamazsa yalnız bu oynatıcı yerel
temizlenir (duvara yazı basılmaz, konsola not). `e.code` kullanılır: Türkçe Q klavyede ⇧0 "=" yazsa da çalışır.

Sorgu parametreleri: `?oda=` ölçülmüş oda — U duvar ya da 3 projektörlü düz duvar (`?oda=duz,...`), metre;
aşağıda "Duvar geometrisi ve kalibrasyon" —, `?fov=90` ölçü yokken duvar başına yatay açı (U duvar 90; düz tek
duvar için `?fov=40` değil `?oda=duz,...`: döndürülmüş kameralar düz duvarda yan görüntüleri bozar), `?doldur=1`
pencereyi 48:9 oranını korumadan doldur (kiosk), `?hud=1` HUD açık başlasın, `?kalite=dusuk|orta|yuksek|otomatik`
(aşağıda "Kalite kademesi"; panelin Oynatıcı düğmesi varsayılan `otomatik` verir), `?gecis=600` sahne geçişinde solma
süresi (ms, 0 anlık; aşağıda "Sahne geçişi").

Ses: `?ses=stereo|dortlu|5.1|7.1|otomatik` hoparlör düzeni (varsayılan otomatik: ses cihazının kanal sayısı),
`?hoparlor=` kanal sırasıyla hoparlör azimutları, **T** hoparlör testi (ayrıntı: aşağıda "Çok kanallı ses"). İkisi de
`?kalite=` gibi yerel kayıtta kalır; `otomatik` kaydı siler.

## Duvar geometrisi ve kalibrasyon

Gerçek oda ideal değildir: ön duvar genişliği, yan duvar boyu, görüntünün yüksekliği ve alt kenarı, izleyicinin
konumu ve göz yüksekliği her duvarın izleyiciden görünen açısını belirler. Oynatıcı her duvarı izleyicinin
gözünden **genelleştirilmiş perspektif izdüşümüyle** (Kooima; UE nDisplay'in duvar ekranlarıyla aynı fikir) çizer:
duvar düzleminin eksenleri + simetrik olmak zorunda olmayan (off-axis) kesik piramit. Ufuk göz hizasındadır; U odada
yan duvarlar, 3 projektörlü düz duvarda üçte birler aynı matematikle doğru çizilir. 3B sahne, 360° video panorama,
2B klipler, efektler ve K ızgarası aynı izdüşümü kullanır (`src/projeksiyon.ts`, `sahne3b/duvarKamerasi.ts`).

**Ölçü alma (saha keşfi, metre):**

| Alan | `?oda=` anahtarı | Ölçü |
|---|---|---|
| Tip | `u` / `duz` | U: sol + ön + sağ duvar (yanlar öne dik). Düz: tek duvar, 3 projektör eşit üçte birlere |
| Ön / düz duvar genişliği | `on` | Yansıyan görüntünün genişliği (ön duvar köşeden köşeye) |
| Yan duvar boyu | `yan` | Yalnız U: ön köşeden izleyiciye doğru, yan duvardaki görüntünün boyu |
| Görüntü yüksekliği | `yuk` | Yansıyan görüntünün dikey boyu (tüm duvarlarda aynı varsayılır) |
| Alt kenar | `alt` | Görüntünün alt kenarının yerden yüksekliği (varsayılan 0) |
| İzleyici uzaklığı | `z` | Eğitim alanının ortası (izleyici) ile ön duvar arası |
| Yanal kayma | `x` | İzleyicinin ön duvarın ortasından sağa (+) / sola (−) kayması (varsayılan 0) |
| Göz yüksekliği | `goz` | Ayakta ≈ 1,7 m (varsayılan), diz çökmüş ≈ 1,0 m |

Örnekler: `?oda=u,on=6,yan=4,yuk=3,alt=0.3,x=0,z=3,goz=1.7` (U oda; yan duvarlar −45° … −108,4° ve 45° … 108,4°,
ön duvar ±45°) · `?oda=duz,on=9,yuk=2.5,alt=0.3,z=4,goz=1.7` (düz duvar; üç görüntü 27,8° / 41,1° / 27,8°). Ondalık
nokta kullanılır. Geçersiz değer (eksik zorunlu alan `on`, `yuk`, `z` — U'da `yan` —, bilinmeyen anahtar, izleyici yan
duvarın dışında vb.) yok sayılır, HUD ve K ızgarasında uyarı görünür, ölçüsüz yerleşim kullanılır.

**Öncelik:** adres çubuğu > yerel kayıt (`localStorage` "oda") > ölçüsüz varsayılan. Geçerli `?oda=` kaydedilir,
sonraki açılışlarda adres vermeden de kullanılır; `?oda=sifirla` kaydı siler. Kiosk oynatıcı
(`oynatici-baslat.bat`) ayrı tarayıcı profili kullandığından kendi kaydını tutar: bir kez `&oda=...` ile açmak
(ör. bat dosyasındaki adresin sonuna geçici olarak eklemek) yeterlidir. Panelde **Sistem › Duvar geometrisi**
formu ölçüleri alır, duvar açılarını ve kuş bakışı planı gösterir, değeri "Oynatıcı" düğmesinin adresine yazar
("Varsayılan" seçimi `oda=sifirla` gönderir).

**Ölçüsüz yerleşim** (`?oda=` yok): 3B görüntü öncekiyle birebir aynı; duvar başına `?fov=` derece (varsayılan
90), yaw (i−1)·fov kadar döndürülmüş simetrik kameralar, dikey açı duvarın piksel oranından, ufuk ortada. `?oda=`
verilince `?fov=` yok sayılır. 2B katmanlar ise ölçüsüzde de perspektif eşlemeye geçti (3B ile aynı yer; önceden
azimuta doğrusaldı): 90° duvarın ortasında derece başına piksel ≈ %21 az, kenarında ≈ %57 fazla — 20°'lik klip
ortada ≈ %21 küçük, kenara yakın daha büyük görünür; manifestteki `genislikDerece` değerleri gerekirse yeniden
ayarlanır. 360° video panoramada (2B WebGL yolu) 2B klip ve efektlerin ufku bölgenin yer tutucu ufku (H·0,50–0,58)
yerine panoramanın gerçek ufkudur (göz hizası satırı, ölçüsüzde H/2 + `yukseklikKaydirma`).

**Köşede 2B katman:** köşeye taşan klip iki duvarda kendi izdüşümüyle kırpılarak çizilir (kaynak köşe azimutunda
bölünür). Kenarı aşan yer tutucu sprite'lar (bulut, güneş/ay, ağaç/kaya) ve figür gölgesi kenarın ötesinde komşu
duvarın izdüşümünü kullanır: iki duvarda aynı yere çizilir, her duvar kendi parçasını gösterir (köşede boşluk ya da
sıçrama yok). Gölge klibin parçalarından önce çizilir.

**Sis (3B):** three.js sisi kamera derinliğiyle hesaplar; ölçülmüş U odada izleyici ön ve yan duvara eşit uzaklıkta
değilse aynı nokta iki duvar kamerasında farklı derinlikte kalır ve köşede sis tonu kırılırdı. Ölçülmüş odada
(`?oda=`) sis gerçek uzaklıkla hesaplanır (`duvarKamerasi.ts` `sisUzakligiAyarla`); ölçüsüzde görüntü değişmez.

**K ızgarası ile doğrulama:** oynatıcıda **K**. Her duvarda 10°'de bir azimut çizgisi (30°'de bir etiketli), sarı
ufuk çizgisi (göz hizası), −20/−10/+10/+20° yükseklik eğrileri (düz duvarda kenara doğru eğilir; izleyici
noktasından bakınca düz görünür), duvar adları ve açı aralıkları, altta geometri özeti. Kontrol:

- Sarı ufuk çizgisi her duvarda **yerden göz yüksekliğinde** olmalı (metreyle ölçülür; ör. 1,70 m).
- 0° çizgisi izleyicinin tam karşısında; ön duvarda θ çizgisi bu noktadan z·tan θ uzakta (z = 3 m, 30° → 1,73 m).
- İzleyici noktasında göz hizasında durup bakınca çizgiler düz görünmeli, köşelerde kırılmadan (dirsek yapmadan)
  devam etmeli; 10°'lik aralıklar köşenin iki yanında eşit görünmeli.
- Göz görüntünün altında ya da üstündeyse (ör. alt kenar 2 m, göz 0,5 m) sarı çizgi tuvale düşmez; duvar adlarının
  yanında "ufuk (göz hizası) görüntünün altında/üstünde" notu çıkar. Adlar ve açılar her durumda görünür kalır.

Aralık köşede sıçrıyorsa duvar genişliği / yan duvar boyu / izleyici uzaklığı; ufuk göz hizasında değilse ya da
yükseklik eğrileri köşede dirsek yapıyorsa görüntü yüksekliği, alt kenar ya da göz yüksekliği yanlış girilmiştir.

## Nasıl çiziyor

Dünya, izleyicinin etrafında silindirik bir panoramadır; her nesnenin bir **azimutu** ve ufka göre **yüksekliği**
vardır (0° = orta duvarın ortası, sola eksi, sağa artı). Her duvar, izleyicinin gözünden görülen bir dikdörtgendir
(yukarıdaki genelleştirilmiş perspektif); köşelerde görüntü kesintisiz devam eder (`src/projeksiyon.ts`, testleri
`projeksiyon.test.ts`). 2B klipler ve efektler de bu perspektifle yerleşir (duvar kenarına doğru derece başına
piksel artar; 3B katmanla birebir aynı yer). Köşeye taşan klip iki duvarda da kendi izdüşümüyle kırpılarak çizilir;
kenarı aşan sprite köşe ötesinde komşu duvarın izdüşümünü kullanır (yukarıda "Köşede 2B katman").

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
- **Figür duruşları** (`poz`: ayakta / comelmis / yarali; panel komutu `{islem:"poz", id, poz}` ya da
  `oynat` ile başlangıç duruşu, manifestte `poz`): **yaralı** = `animasyonlar.vurulma` (tek sefer, isabet
  tepkisi) → `animasyonlar.dusme` (tek sefer, son karede kalır; Quaternius "HitRecieve"/"Death") → yerde:
  göğüs nefesle inip kalkar, 6–12 sn'de bir sağ kol yardım ister gibi kalkar (ses: vurulunca bağırma,
  kol kalkınca çağırma, figürün yönünden). Tüfek elden çıkıp yanına düşer; kalkınca ele döner. Yaralı
  çatışmada düşmana dönmez ve `silahliKonumlar` listesine girmez. **Diz çökme** prosedüreldir: karıştırıcıdan
  sonra kemiklere dünya eksenli ofset (sol uyluk öne 85°, baldır dik; sağ diz yerde; gövde 0,42 m iner).
  Quaternius riginde ayaklar (Foot.L/R) uyluk zincirinin dışında ayrı kemiktir (IK hedefi) → ayaklar da
  taşınır. Kemik adları `kemikler` ile değiştirilebilir (varsayılan Quaternius: Torso, Chest,
  UpperLeg/LowerLeg.L/R, UpperArm.R, Foot.L/R). Dikkat: dünya eksenli döndürmede kuaterniyonlar
  normalize edilmeli (ebeveyn ölçeği 100 ve kayma var; yoksa model şişer) ve klibin yazmadığı kemikler
  (Torso) her kare temel poza geri alınmalı (`kemikTemel`), yoksa ofset birikir.
- **HESCO** (`sutre.ts`): manifest `sutreler` eşyasında `tip: "hesco"`, `adet`, `hucre: [gen, yük]` → prosedürel
  bastion hattı (kutu hücreler, canvas dokusu: bej jeotekstil + 14 gözlü tel kafes + kum üstü; her hücre hafif
  farklı yükseklik). glTF gerekmez; CC0.
- **Kalite kademesi** (`?kalite=dusuk|orta|yuksek`, `KALITE_AYARLARI`): gölge haritası 1024/1536/2048, kenar
  yumuşatma (düşükte kapalı), parçacık kapasitesi ×0,5/0,75/1 ve krater dumanı üst sınırı. Adres çubuğundan
  verilince `localStorage`'a yazılır, sonraki açılışlarda kalır; HUD'da görünür. Gölge haritası güneşe bağlı
  olduğundan karede bir kez çizilir (`shadowMap.autoUpdate=false`); iskeletli mesh'ler tek Skeleton paylaşır.
  **Otomatik varsayılan** (2 Kasım, `src/kaliteSecimi.ts`): ne `?kalite=` ne yerel kayıt varsa ekran kartı geçici bir
  WebGL bağlamından okunur (WEBGL_debug_renderer_info, sonra WEBGL_lose_context): Intel entegre (Iris Xe, UHD) →
  `orta`, yazılım çizici → `dusuk`, diğerleri (RTX) → `yuksek`. Otomatik değer kaydedilmez (kart değişirse yeniden
  seçilir), HUD'da "kalite orta (otomatik: Intel(R) Iris(R) Xe Graphics)", önizleme bilgisinde "kalite orta
  (otomatik)", köprü günlüğüne bağlanınca bir kez (istemci günlüğünde bilgi düzeyi olmadığından uyarı satırı). Elle
  seçim önceliklidir. `?kalite=otomatik` yerel kaydı siler ve otomatiğe döner: panelin "Oynatıcı" düğmesi varsayılan
  olarak bunu verir (Sistem › Oynatıcı ayarları: Otomatik / Düşük / Orta / Yüksek; eskiden hep `?kalite=yuksek`
  verip kaydettiği için otomatik seçim panelden açılışta hiç devreye girmiyordu). Çözülen değer tektir
  (`Sahne3B.kalite`): bu kademe tablosu, arazi kademesi (`ARAZI_KALITE`) ve sahne geçişinin küp yüzü / çözme genişliği
  (`panoramaGecisi.ts` `KUP_YUZU`, aşağıda "Sahne geçişi") aynı değerden gelir.
- **Bitki ayıklama ve arazi performansı** (2 Kasım, `arazi.ts`, `bitkiSektorleri.ts`, `araziIzgara.ts`, testli): bitki
  türleri tek InstancedMesh ve `frustumCulled=false` olduğu için her duvar ve gölge geçişi 360°'deki bütün örnekleri
  çiziyordu (Iris Xe'de karenin ~%75'i). Şimdi: model alt mesh'leri malzemeye göre tek geometride birleşir (çimen
  modelinin 17 alt mesh'i tek çizim; LOD dosyaları iç içe tampon olduğundan önce ayrılır), örnekler 8 azimut sektörüne
  bölünür (22,5° kaydırılmış: ölçüsüz U odada duvar başına 3 hücre), her hücre `BitkiHucresi`: three duvar ve gölge
  kamerası başına `intersectsFrustum` ile ayıklar; sınır küre değil, örneklerin halka dilimini saran dışbükey kabuk
  (45°, 8–148 m'lik dilimin küresi izleyiciyi neredeyse içine alıyor, hiç ayıklanmıyordu). Saydam iki yüzlü ot/yaprak
  malzemeleri tek geçişte (`forceSinglePass`); fotogrametri ot ve taş 50 m'de, çalı/dal/kütük 80 m'de biter (yakındaki
  yoğunluk aynı, adet kesik dağılımla azalır), kayalar profil yarıçapına kadar; `kaya_buyuk` LOD'u 56,5 k → 9 k üçgen
  (`araclar/arazi-sadelestir.mjs`: yüz normalli modelde normaller atılıp konum+uv ile kaynaklanır, sonra yumuşak
  normal; eski dosya `icerik/arazi/yedek/`). Gölge geçişi sektörleri ayıklayamaz (gölge kutusu ±45 m her sektöre değer).
  Krater yalnız kendi ızgara penceresinin normallerini hesaplar (three'nin computeVertexNormals'ıyla birebir aynı) ve
  yalnız o aralığı yükler (`addUpdateRange`): patlama başına 50–130 ms → 1–5 ms; kraterdeki ot/çalı/taş silinir, kaya
  yeni zemine iner. `kraterleriTemizle()` (sahneyi sıfırla) pencereleri analitik yüksekliğe döndürür, yanık boyasını
  kurulumdaki splat kopyasından geri çizer, bitki/çimen matrislerini yedekten geri koyar (~17 ms, birebir ilk hâli).
  Bölge değişiminde arazi ve çimen malzemesi (splat gölgelendiricisi) ve ortak dokular korunur: geçişte 3–5 doku
  indirilir (önce ~11–12), program yeniden derlenmez. Çatışma izleri ve parçacıklar yalnız canlı aralığı yükler, boşken
  hiç yüklemez.
- **Yere yatma** (`poz: "yatmis"`): gövde ayak ekseninden 90° öne yatırılır (yüzü yere, başı ileri), baş ve
  göğüs kemiği ileri bakacak şekilde döndürülür; bekleme/ateş klibi sürdüğünden tüfek yerde ileri bakar
  (prone atış). **Sıhhiyeci** (`asker_sihhiyeci`: Interact klibi + diz çökme, silahsız) figür komutundaki
  `yaninda=<id>` ile hedef figürün 0,9 m izleyici tarafına, 0,6 m yana ve ona dönük yerleşir; yerleşim planı
  atlanır, çatışmada düşmana dönmez. Panel: "Sıhhiyeci gönder" son yaralıyı hedefler.
- **Bekleyen figürler** (`main.ts`): 3B sahne hazır olmadan (ilk panorama yükleniyor) ya da bölge geçişinin takası
  beklenirken gelen model figür komutları kuyruğa alınır, sahne hazır olunca (yeni bölgenin planıyla) uygulanır —
  oynatıcı yeniden açılınca köprünün yolladığı aktif figürler kaybolmaz.
- **Helikopter** (`helikopter3b.ts`): `klipler.helikopter` modeli; yaklaşma → iniş → yerde → kalkış
  (iniş noktası azimut 12°, 38 m; `inisNoktasi(azimut, mesafe)`), modelin kendi animasyonu + `rotor` düğümleri
  döner. Model yoksa 2B siluet. Hareket saf uçuş modelinden (`helikopterUcusu.ts`, testli; gövde pivotu ağırlık
  merkezinde, burun modelin −z'si): "yaklaşıyor" 420 m / 70 m'den karşı yandan, yanal sapması iniş noktasına
  yaklaştıkça sönen kavisli rotayla gelir (virajda 3–5° yatış), sabit yavaşlayıp ~17 sn'de iniş kapısında
  (~60 m kala, ~24 m, ~11 m/sn); "iniyor" gelmezse noktanın ~17 m önünde 22 m'de askıda bekler. "İniyor": son
  ~25 m'de burun yukarı (5–10°) "flare", noktanın üstünde 2,5 m askı, askıda burun kalkış tarafına döner (yerde
  yandan görünür), dikey iniş, kızakta küçük sekme (~10 cm); "iniyor"dan ~8–16 sn sonra yerde. Noktayı geçerse
  yavaşça geri döner; dikey iniş yalnız noktanın üstünde (±4 m) başlar. Yerde 25 sn sonra rotor yavaşlar.
  "Kalkıyor": rotor devir alır, ~5 m askıya dikey yükselir, burun aşağı (~12°) hızlanıp tırmanırken iniş noktasının
  kendi yanında arkaya viraj alır (son burun yönü yan · 165°: sağdaki noktadan sağ arkaya, soldakinden sol arkaya) ve
  karşı yan duvarı kesmeden izleyicinin ~30–40 m yanından görünmez arka bölgeye (U duvarın ±135° dışı) geçer: yan
  noktalarda (−117°, 100°, −80°) ~7–12 sn'de, öndeki noktalarda (0°/50 m, 12°/38 m) ~13–16 sn'de görüş dışında
  (yerde rotor yavaşladıysa devir alması 1–2 sn ekler; arkadaki 150° zaten görünmez bölgede; manifestteki 17 noktanın
  hiçbirinde karşı duvara girmez). "Yok" geldiğinde hâlâ görünüyorsa birden kaybolmaz: o anki hızıyla
  süzülürken 1,5 sn'de söner (opak malzemelerde `alphaHash`, sönmenin yarısında gölge kalkar; rotor sesi de söner).
  **Havadayken iniş noktası değişirse** (uçuş sırasında saat/mevsim değişip panorama ve planı değişti ya da paneldeki
  yön değişti): helikopter yeni noktaya geçerli bir yaklaşmadaysa (noktayı geçmemiş, yanal sapması küçük, noktaya
  doğru uçuyor; noktaya yakınken birkaç derecelik kayma da) rota buradan kurulur, askıdaysa yakındaki (≤ 40 m) yeni
  noktaya alçakta ≤ 5 m/sn yanal hızla yer değiştirir; değilse **pas geçer**: 35 m'ye tırmanır, yeni eksende
  85–150 m dışarıdaki giriş noktasına gider, orada askıda burnunu noktaya çevirip yeniden yaklaşır (noktadan uzakta
  alçalmaz, yeni noktaya iner; yavaşken burun önce döner, yan yan kaymaz; değişimden ~30–60 sn, çoğunlukla 35–50 sn
  sonra yerde). Belirdiği karede (aynı durum mesajında panorama da değişti) değişirse yeni eksende baştan belirir. Yeni
  resim panorama hazırlanırken eski sahne çizilmeye devam eder (bkz. "Sahne geçişi"); helikopter 3B'de uçmayı sürdürür
  (`panoramaYukleniyor`, main.ts `helikopter3B`), iniş noktası takasta yeni plandan seçilir (havadaysa pas geçer ya da
  rotasını kurar), rotor sesi kesilmez. Uçuş yüksekliği iniş
  noktası zeminine göre olduğundan nokta ya da arazi (görüş koridoru, bölge) değişince havadaki helikopterin dünya
  yüksekliği korunur. Sahne iniş noktasını yalnız plan, `yawKaydirma` ya da panelin yönü değişince yeniden seçer
  (panelin yönüne en yakın plan noktası, yoksa o yön + 38 m); her durum mesajında sabit 12°'ye dönmez. Arazide
  (hibrit/tam kip) uçarken 80 m ilerisine bakar, önündeki en yüksek zeminden en az 8 m (inişte 6 m) yukarıda kalır:
  dağlık profildeki 40 m'lik sırta dibine gelmeden yükselir, aştıktan sonra iniş noktasına alçalır.
  **Rotor tozu** (`parcaciklar.rotorTozu`, profiller `rotorTozu.ts`, testli): diskin altından (yarıçap modelden,
  ~5–6,5 m) zemine yapışık 8–15 m/sn radyal akış, yavaşladıkça kıvrılıp 1–2 rotor çapında yükselen halka; halkanın
  üstü diske geri emilir; hızlı kırıntı (taş, topak, yaprak). Şiddet kızaklar ~20 m'nin altına inince üstel artar,
  rotor devriyle ölçeklenir. Zemin türü `araziAyarla`daki bölge + mevsimden (`Helikopter3B.tozTuru`): **kış** kar
  savrulması (beyaz-mavi, ince, uzun asılı, güneşte parıltı), **kırsal/dağlık** kuru toprak, **ormanlık** koyu toprak
  + süzülen yaprak/çimen, **üs/meskûn mahal** açık gri beton tozu (az hacim). Yayım saniye başına sınırlı (tam
  şiddette ~200, karda ~350 canlı parçacık), parçacık nesneleri havuzdan; yeni çizim çağrısı yok.
- **Çatışma ve izli mermi** (`catisma.ts`, yardımcılar `izliYol.ts` testli): izler tek instanced kutu (katkı karışımı;
  köşe rengiyle baş beyazımsı, kuyruk sönük kızıl). Uzaktaki iz piksel altına inip titremesin diye kalınlık
  mesafeyle büyür (1080p duvarda en az ~1,5 px; piksel açısı çizilen duvar kameralarının izdüşümünden ölçülür,
  ölçülmüş odada duvarların ve yatay/dikeyin en büyüğü: duvar uzaklığı ve piksel en/boyu farklı olabilir), uzunluk da
  biraz uzar. Panelin **izli mermi** akışı: kaynak seçilen duvarın ortası yönünde (±10°) 150–300 m'de, yerden
  0,8–4 m; **yön** iz doğrultusunu döndürür: 0° mermiler seçilen duvarın uzağından izleyiciye doğru gelir (hedef
  payları: figür varsa %50 figür yakını; yakın zemin 3–24 m %20, çarpar ve seker; %15 başın üstünden/yanından
  arkaya; kalanı 28–60 m önde kısa düşer), ±90° mermiler komşu duvar yönünden gelip seçilen duvarın 10–60 m
  önünden yandan geçer ve görüş dışına uçar (+ sağdan sola, − soldan sağa; yan duvarlarda da duvara göre). Doğru
  izleyicinin önündeki bir eksen noktası etrafında döndüğünden kaynak da yana, ±90°'de komşu duvarın yönüne kayar
  (yandan ateş böyle görünür; yan duvarda bir yönde komşu duvar yoktur: sağ duvarda +, sol duvarda − yönde kaynak
  izleyicinin arkasında, ~165°'de kalır, mermiler arkadan gelir); ara açılar çapraz. Hedef yüksekliği döndürülmüş
  noktanın zemininden (ofsetler korunur). Kaynak sırt/tepe arkasında kalırsa sınırlı yükselir
  (`izliKaynakYuksekligi`: yerel zeminden en çok 12 m ve izleyiciden bakınca o yöndeki arazi ufkunun en çok 1,5°
  üstü; ufuk `AraziUfku`: 2°'lik yön kovası başına 20–320 m zemin örneği, 2 sn önbellek, kare başına nesne yok).
  Doğru yine kapalıysa ve engel izleyiciden ≥ 80 m'deyse kaynak **sırtın tepesine** taşınır (`sirtaTasi`, 2 Kasım
  kullanıcı kararı): doğru üzerinde hedeften bakınca en yüksek görünen nokta, sırt zemininin 1,5 m üstü (düşman sırt
  çizgisinden ateş eder, namlu parıltısı sırtta görünür); daha yakın bir tümsek hâlâ kapatıyorsa sınırlı yükseltme
  oradan yeniden uygulanır (12 m sınırı sırt zeminine göre). Yalnız 80 m'den yakın tümsek kapatıyorsa kaynak yerinde
  kalır, mermi o tümseğe çarpar. Gökten (50–80 m'den) gelmez. Aynısı çatışma ateşinde de (`dusmanAtis`).
  Başın ~6 m yakınından geçen düşman mermisi bir kez ses hızı üstü "çat" (çarpma sesi geri çağrısı, en yakın geçiş
  noktasının yönünden; yere çarpacak mermi çatlamaz). İzli akışın çarpma ve "çat" sesleri jeton kovasıyla saniyede
  en çok ~1,5 (toz, kıvılcım, sekme her çarpmada; çatışma ateşi sınırsız).
- **Yerleşim planı** (`yerlesim.ts`, testli): panorama kaydında `noktalar` (azimut, mesafe, tür:
  patlama/figur/helikopter/toz) ve `yasak` açı aralıkları (ağaç kümesi, bina). Panelden gelen yön en
  yakın uygun noktaya yapışır (patlama 55°, figür 35° tolerans); nokta yoksa yön yasak aralığın
  dışına itilir. 2B plakalar da aynı plana uyar; helikopter iniş noktası `helikopter` türünden gelir.
  Her yeni panorama için plan yazılmalı (ağaç/bina azimutları: equirect x → (x/genişlik − 0,5)·360).
- Üç duvar, üç duvar kamerası (`duvarKamerasi.ts`: duvar düzleminin eksenleri + simetrik olmayan kesik piramit,
  `makePerspective(sol, sağ, üst, alt)`; ölçüsüzde yaw -90/0/+90, dikey açı duvar oranından) aynı tuvale
  viewport/scissor ile çizilir; `yawKaydirma` arka plan + ortam dönüşü, `yukseklikKaydirma` duvarın sağ ekseni
  çevresinde ek eğim (ufuk k·H/2 kayar).
- HUD'da "3B:" satırı (güneş tahmini, figür/krater/parçacık sayısı). Konsoldan `window.duvar.sahne3b`.

### Sahne geçişi (panorama değişimi, 2 Kasım 2026)

Eskiden `panoramaAyarla` yeni dosyayı yüklemeden önce eski panoramayı kapatıyordu: birkaç saniye parametrik yer tutucu
("ilk demo") görünüyor, 8K JPEG ana iş parçacığında çözülüyor (1,3–1,9 sn), 8K'dan PMREM ve derinlikli 4096 küp kuruluyor,
güneş/ufuk ölçümü 8K resmi üç kez daha tuvale çiziyordu (en uzun kare 1,8–4,6 sn). Şimdi (`sahne3b/panoramaGecisi.ts` durum
makinesi, `panoramaCozucu.ts` + `panoramaIscisi.ts` işçi, `panoramaDokulari.ts` GPU adımları, `gecis.ts` örtü):

- **Eski sahne yenisi hazır olana dek canlı** çizilir (`hazir` açık kalır). Bölge sıfırlaması (krater, duman), arazi
  kurulumu, kar, ışık (saat/bulut/yağış) ve helikopter iniş noktası **takasa ertelenir**; bölge geçişi beklerken gelen
  patlama/toz ve model figürler kuyruğa alınır, takastan sonra yeni bölgenin planıyla uygulanır (`bolgeGecisiBekliyor`).
- **Hazırlık** (ekrandakine dokunmaz, karede en çok bir GPU adımı): işçide fetch → Blob → `createImageBitmap`
  (`imageOrientation: "flipY"`, sRGB; çözme ana iş parçacığı dışında), 1024×512 kopya (PMREM girdisi), 256×128 analiz
  (güneş, ufuk rengi, gece parlaklığı; eski tuval yoluyla 24 panoramada karşılaştırıldı, güneş ≤ 0,8°), tam görüntü en çok
  4×küp yüzü genişliğine küçülür. Ana iş parçacığında equirect `texStorage2D` + 8 MiB şeritler (GPU'da en çok 2 şerit
  bekler, fenceSync), kalıcı dönüştürücüyle **derinliksiz küp** (yüz dusuk 1024 / orta 1536 / yuksek 2048, kaynak
  yüksekliğini aşmaz; equirect hemen silinir), **PMREM 1024'lük kopyadan** (256 küp; tek üreteç, tam kipte gökyüzüyle
  ortak), takastan önce yeni ortam ve sisle `compileAsync` (programlar paralel derlenmeye başlar).
- **Takas** tek karede: `ciz()`den hemen sonra 3B karesi `#tuvalGecis` örtüsüne kopyalanır (3B'nin üstü, 2B katmanın
  altı), `takasYap` yeni panoramayı, araziyi ve ışığı uygular, eskinin küp ve PMREM **hedefleri** `dispose()` edilir. Sonra
  `compileAsync` bitene dek 3B çizilmez (örtü eski kareyi tutar), bölge değiştiyse arazi dokuları gelene dek
  (`AraziKatmani.dokularHazir`: yüklemesi süren doku kalmadı; bulunamayan doku beklenmez, önbellekteki ortak dokular
  hazırdır; en çok 1,2 sn) beklenir ve örtü **0,6 sn'de compositor'da solar** (Web Animations; `?gecis=ms`, 0 = anlık
  kesme). Küp yüzü ve çözme genişliği `Sahne3B.kalite`den (otomatik kalite dahil; dizüstünde otomatik `orta`: küp 1536).
- **Geçiş sürerken sahne sıfırlaması** (`sahne/sifirla`): ekrandaki sahne hemen temizlenir (`temeleDondur`); süren
  hazırlık (gelen panorama) bırakılmaz, bölge geçişinin ertelenen işleri (`bekleyenSifirla`, arazi) yerinde kalır, yani
  bölge geçişi beklerken sıfırlamadan sonra gelen figür/efektler yine takası bekler, öncekiler kuyruktan silinir; takas
  yeni bölgede sahneyiSifirla'yı bir kez daha çalıştırır (geri almaz). Örtü takastaki eski karenin anlık görüntüsünü
  tutuyorsa (figür, duman, iz) yeni sahnenin ilk çizilen karesinde (soluyorsa hemen) solmadan kalkar
  (`GecisKatmani.sahneTemizlendi` / `temizKaredeKaldir`); panel önizlemesi o temiz kareyi bekler. Takastan önce gelen
  sıfırlamada takas zaten temiz kareyi yakalar; siyah ilk açılış örtüsü etkilenmez.
- Ardışık isteklerde yenisi eskisini geçersiz kılar (nesil numarası: işçi durdurulur, geç gelen bitmapler kapatılır, GPU
  kaynakları bırakılır); A→B→A'da geçiş olmaz; aynı dosyada yalnız yaw/plan/güneş/zaman değişirse yeniden yükleme yok.
- **Yer tutucu** (gokyuzuCiz/araziCiz) yalnız hiç panorama gösterilmemişken ve gösterilecek panorama yokken; ilk açılışta
  manifest/ilk panorama beklenirken ekran siyah, ilk sahne siyahtan solar.
- **Eksik birleşim** (Kasım 2026'da 7: kırsal kış gece, dağlık kış alacakaranlık/gece, meskûn kış gündüz, ormanlık kış
  gece, üs yaz/kış gece): `video.ts panoramaAdaylari` bölgenin en yakın panoramasını seçer (önce aynı zaman başka mevsim,
  sonra aynı mevsimde en yakın zaman; gecede alacakaranlık, sonra gündüz). Zamanı farklı yedekte `zaman` boş kalır, sahne
  onu saate göre karartır. Seçim köprü günlüğüne birleşim başına bir kez yazılır ("Panorama eksik: Dağlık · kis · gece →
  daglik/pano_yaz_gece_foto_8k_gece.jpg (yaz gece)"); dosya yüklenemezse sıradaki aday, hiçbiri olmazsa ekrandaki kalır.
- HUD son satırı `geçiş: yükleniyor <dosya> 0,4 sn` / `son geçiş 2,3 sn` ve örtü opaklığı; önizlemede örtü de görünür
  (duvardaki opaklığıyla), geçiş bitince (örtü kalkınca) panele önizleme 5 sn beklemeden gider. 2 sn'yi aşan geçiş köprü
  günlüğüne adım süreleriyle yazılır. Konsol: `window.duvar.sahne3b.sonGecis`, `window.duvar.gecis`,
  `window.duvar.arkaPlan()`.

Bellek (panorama başına GPU): eski yol 8K'da ~1,6 GiB (küp 384 + derinlik 384, PMREM 2 × 384, equirect 128 MiB) ve her
geçişte +384 MiB sızıntı (yalnız `.texture.dispose()`; aynı kalıp `gokyuzu.ts`'te de vardı, ikisi de düzeltildi). Şimdi küp
96 / 54 / 24 MiB (yuksek / orta / dusuk) + PMREM 6 MiB; geçiş anında ek olarak equirect 128 / 72 / 32 MiB (küpten hemen
sonra silinir). Her durum mesajında yeni `THREE.Fog` yerine tek sis nesnesi güncellenir.

Ölçüm (2 Kasım, başsız Chrome, Iris Xe, 1920×360; durum isteğinden solmanın başlamasına; önizlemenin toDataURL'ı ölçümde
kapalı, o FPS işinin konusu; q90'a sıkıştırılmış panoramalar):

| | eski yol | yeni, dusuk | yeni, yuksek |
|---|---|---|---|
| istekten görünmeye | 2,4–5,7 sn, arada yer tutucu | 1,9–3,3 sn | 3,4–3,8 sn |
| hazırlık sırasında en uzun kare | 1,8–4,6 sn | ≤ 0,12 sn | ≤ 0,18 sn |
| takas karesi (örtünün altında) | — | 0,33–0,7 sn | 0,33–0,48 sn |
| bellek | +384 MiB / geçiş | 10 geçişte doku 51, geometri 63, program 18 sabit; GPU süreci ~660 MB sabit | 4 geçişte doku 53, geometri 64, program 21 sabit |

Takas karesinin çoğu arazi işidir: aynı bölgede yeni planın görüş koridorları (`arazi.koridorlariAyarla` yerinde, ızgara +
normaller, 0,3–0,8 sn) ya da bölge değişiminde `arazi.kur` (~0,33 sn). Örtünün altında kalır ama ana iş parçacığını tutar
(hazırlık sırasında hesaplanıp takasta uygulanabilir ya da Worker'a alınabilir; geçiş turunda arazi.ts'e dokunulmadı,
yukarıdaki süreler FPS turundan önceki arazi koduyla). FPS turundan beri bölge değişiminde arazi/çimen malzemesi ve ortak
dokular korunur (3–5 doku indirilir, program yeniden derlenmez); bitki modellerinin ilk yüklemesi solmadan sonra yine
0,4–0,7 sn'lik kareler bırakabilir (birleşik ölçüm yapılmadı).
İlk patlama artık program derlemiyor (patlama/krater/moloz malzemelerinin gizli ön derleme kopyaları): en uzun kare
0,23 sn (eskiden 1,28 sn). Yön doğrulaması: yeni küp ile eski otomatik küp aynı kameradan çizilip karşılaştırıldı, ortalama
piksel farkı 1,05/255 (5° kayma 12,5; 180° 37; ters çevrik 55).

Katmanlar (arkadan öne):

0. **360° panorama** (manifest `panorama`, en öncelikli): equirectangular resim veya video,
   WebGL ile her duvara doğru perspektif (`src/panorama.ts`; resimlerde 3B katman bunu devralır).
   Gerçek çekim, yapay zekâ panoraması ve motor render'ı için ortak yol; `?panorama=dosya&yaw=0`
   ile anında deneme. Üretim hattı: `docs/fotogercekci-icerik-hatti.md`. Depoda 5 bölge ×
   mevsim/zaman için 23 Poly Haven CC0 gerçek çekim (8K JPG, manifestte `_kaynak`) + kırsal yaz
   gündüz için Skybox AI panoraması (varsayılan) kayıtlıdır; dosyalar depoya girmez.
1. **Video döngüsü** (manifestte klip varsa) – 5760×1080, 3 duvar yan yana; çapraz geçişli.
2. Yoksa **parametrik sahne** (yalnızca geliştirme/yer tutucu): gökyüzü (saat → renk, güneş/ay/yıldız, bulut örtüsü), arazi
   (bölge ön ayarı: tepe profili, zemin, nesneler; mevsim paleti; rüzgârla salınan ot). Yalnız hiç panorama
   gösterilmemişken ve gösterilecek panorama yokken çizilir; içerik beklenirken ekran siyahtır (bkz. "Sahne geçişi").
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
çapraz geçişli). Konum: her ses sahne azimutuyla gelir; stereo düzende pan = sin(azimut), 4+ kanalda
çok kanallı yerleşim (aşağıda). Depodaki kayıtlar Mixkit Free ve OpenGameArt CC0 (manifest `sesler._kaynak`).

### Hava: gök örtüsü, 3B yağış, sis, şimşek (3 Kasım 2026)

Eskiden yağmur/kar ekrana düz 2B çizgi ve nokta, sis tüm ekranı eşit kaplayan renk geçişi, bulut yalnız karartmaydı;
yağmur güneşli panoramanın üstüne yağıyordu. Şimdi 3B sahne açıkken (2B yol yalnız 3B yokken, `main.ts`):

- **Gök maskesi** (`sahne3b/gokMaskesi.ts`, saf, testli): panorama işçide çözülürken 2048×1024 (düşük kalitede 1024)
  kopyadan gök pikselleri bulunur (~0,4 sn, işçide). Zenit bandından kenarda duran taşma doldurma, kenar haritası (iki
  piksel açıklık), yaprak/gece ışığı dışlama, satır gök profili (puslu uzak dağ ve güneşli cephe dışarıda), gökle çevrili
  delikler (güneş, bulut) göğe katılır, siluet şeridi profile yakınsa geri büyütülür. 24 panoramada denendi; beton
  tavanlı üs kış gündüz panoraması manifestte `"gok": false` (maske çıkarılmaz). Bilinen: ağaçlarla çevrili, zenite
  bağlanmayan küçük gök parçaları ve ufka değen bulutlar maskede yok; gece sırt çizgisinde ince açık çizgi kalabiliyor.
- **Gök örtüsü** (`sahne3b/gokOrtusu.ts`): three'nin arka plan kutusunun yerini alır (`sahne.background` null; aynı küp,
  aynı döndürme ve parlaklık; hava açıkken çıktı aynı). Gökte rüzgârla akan bulut (düzlem izdüşümü, ufka doğru küçülür;
  örtü `bulut` ya da yağıştan: hafif yağmur ≥ 0,8, şiddetli ≥ 0,95, kar ≥ 0,85), kapalı havada zemin doygunluğu düşer;
  güneş/ay diski (manifestteki ya da güvenilir tahmin) bulutun arkasında kalır. Bulut rengi panoramanın gök
  parlaklığından ve ufuk tonundan; parçalı bulut güneşte beyaz. Kapalı havada güneş söner, gölge yumuşar, yerine yaygın
  gök ışığı (`dolgu`) gelir. Maskeyi görmek: konsolda `duvar.sahne3b.gokOrtusu.u.maskeGoster.value = 1`.
- **Sis**: tek three sisi (doğrusal) her kipte sahnede; hibrit arazi kenarı (ufuk rengi) ile ortam sisi birleşir
  (görüş: sis 1 → 35 m, 0,5 → 385 m). Gök örtüsü panoramayı aynı eğriyle sisler: zemin pikselinin uzaklığı göz
  yüksekliğinden, gökte sis katmanı içindeki yol (40–200 m kalınlık); rüzgârla kayan kümeler yer yer koyulaştırır.
- **3B yağış** (`sahne3b/yagis3b.ts`): konumlar gölgelendiricide (CPU işi yok), iki katman (yakın 26 m kutu, uzak 110 m),
  kalite 0,35/0,6/1 × 9000 + 9000. Yağmur hareket bulanık çizgi (1/30 sn yol), kar salınan yumuşak tane; rüzgâr
  "nereden" esiyorsa ters yöne savrulur (karda güçlü rüzgâr tipi). İzleyiciden 2,5 m'ye dek damla yok (duvarın önü,
  odanın içi). Çizgi en az ~1 piksel, incesi karekök saydamlıkla.
- **Şimşek**: efekt `simsek` (yön, mesafe); ortamda `simsek: true` iken köprü 12–40 sn'de bir rastgele çaktırır
  (`kopru/src/firtina.ts`, şiddetli yağmur yoksa 1,6 kat seyrek). Oynatıcıda gökte çakma yönünde aydınlanma + sahne
  ışığında 2–4 darbe (`Sahne3B.simsek`), DMX'te çift flaş (ışık senaryoya bağlıyken), gök gürültüsü mesafe/343 sn sonra
  (`ses.gokGurultusu`: manifest `sesler.gok_gurultusu` kaydı ya da sentez: yakında çatırtı + yuvarlanan gürleme, LFE).
  Panelde Ortam › "Şimşek" anahtarı ve Efektler › Şimşek. Gökte görünen yıldırım çizgisi yok (yalnız aydınlanma).

Ölçüm (başsız Chrome, Iris Xe, 3840×720 yüksek): açık hava ile kapalı + şiddetli yağmur + sis arasında fark ölçüm
gürültüsünün içinde (21–26 fps, aynı dalgalanma). Henüz yok: yağmur sıçraması ve ıslak zemin, rüzgârda bitki
sallanması, renkli duman, aydınlatma fişeği (docs/icerik-ihtiyac-listesi.md W7–W10).

### Kendi 3B askerimiz: Meshy modeli + Mixamo hareketleri (3 Kasım 2026)

`icerik/modeller/asker_komando.glb` (7,7 MB, depoda): Meshy AI ile üretilen Türk komando modeli (Image to 3D, Meshy 7.1,
**Poz: A-Poz** açık, Remesh 30K üçgen, doku 2K; Meshy'nin kendi rig'i, 65 Mixamo adlı kemik) + 38 Mixamo klibi. Üretim
reçetesi `docs/meshy-model-listesi.md`.

**Mixamo'nun otomatik rig'i bu modeli kabul etmedi** ("Unknown error while generating motion"; A-poz, T-poz, parmaksız
iskelet denendi; aynı modelin kolları yapışık ilk sürümü rig olmuştu). Çözüm: Meshy'nin rig'i kullanılır, Mixamo
animasyonları Mixamo'daki herhangi bir karakterden **Without Skin** FBX olarak indirilir ve `araclar/mixamo-aktar.py`
(Blender 5.1, başsız) ile aktarılır. İki iskeletin kemik **roll**'ları farklı (bacak ~175°, kol ~120°): dönüşü aynen
kopyalamak uzuvları kendi ekseninde burkuyor ve mesh "çöp adam" gibi inceliyordu (3 Kasım ilk sürüm). Şimdi kemik başına
`hedef = kaynak_poz · kaynak_dinlenme⁻¹ · hizala · hedef_dinlenme`: yön Mixamo klibinden, roll Meshy dinlenmesinden; kalça
konumu boy oranıyla; dinlenme yönü 60°'den farklı kemikler (ayak ucu, parmak uçları) dinlenmede kalır. Matrislerle kemik
başına keyframe (kısıt/pişirme yok). Her klip bir NLA izi → glTF'te ayrı animasyon (ad = dosya adı, ör. "Rifle Idle").

**Kalça yüksekliği tuzağı (3 Kasım akşam, duvarda görüldü: "askerin vücudu zeminin altında"):** Mixamo **Without Skin**
FBX'inde armatür 0,01 ölçekli gelir ama kemik verisi zaten metredir; `matrix_world` ile çarpınca kalça 1 cm'ye iner, oran
koruması 1,0'da kalır ve 37 klipte kalça yere yazılır (gövde 0,97 m gömülü; yalnız cm birimli "Kneeling Down" doğruydu).
Betik artık kalça yüksekliğini hangi dönüşüm makul (0,4–2 m) veriyorsa onunla ölçer (ölçekli / yalnız dönüş), oran şüpheliyse
uyarı basar. Ayrıca yalnız **yükseklik** kaynaktan alınır; yatay kalça konumu Meshy dinlenmesinde sabittir, çünkü Mixamo
klipleri "in place" değil ("Rifle Run To Dying" 3,9 m ilerler, CPR çifti 0,8 m yana kayar) ve oynatıcı figürü demirde
bekler. Yeni modelde ilk iş: `node`/Blender ile GLB'de `mixamorig:Hips` çeviri kanalının ilk karesine bak (ayakta ≈ 0,95 m).

```
blender -b --python araclar/mixamo-aktar.py -- <meshy_rigli.fbx> <cikis.glb> <klip1.fbx> [klip2.fbx ...] [--render <png_klasoru>]
```

Mixamo'dan toplu indirme: sayfadaki JS ile `/api/v1/products?query=` → `/api/v1/products/<id>?character_id=` (gms_hash) →
`POST /api/v1/animations/export` (skin false, 30 fps) → `/characters/<id>/monitor` → `job_result` adresi indirilir (bu
oturumda Claude-in-Chrome ile yapıldı; betik scratchpad'de kalıcı değil, akış burada). Yürüme/koşma klipleri **In Place**
(`inplace: true`), figürü kod taşır.

Manifest (`klipler`, `komando_*`): `animasyonlar` artık `comelmis` / `yatmis` klip adı alır (ör. "Rifle Kneel Idle",
"Prone Idle"); varsa `figurler3b.ts` prosedürel kemik ofsetleri yerine klibe çapraz geçer (`aktifPoz`), çatışmada ateş
klibine geçmez. `kemikler` Mixamo adlarıyla (Spine, Spine2, Head, LeftUpLeg…; GLTFLoader ":"yi siler, iki biçim de
denenir). `silahModeli.kemik` "mixamorig:RightHand", konum [0, 0.08, 0.02], dönüş [0, 0, −90] (gözle kabaca; ince ayar
duvarda). Kayıtlar: bekleyen, nişan, diz çökmüş, yatan, yaralı (Hit Reaction → Dying), koşan, yürüyen, çömelerek, sürünen,
sıhhiyeci (Kneeling Pointing), CPR, yaralı masaj alıyor (Receiving Cpr), el sallayan, telsiz, bomba, etrafa bakan. Örnek
senaryo "Gösterim – Kendi Komandomuz (2 dk)" (`sn_komando_gosterimi`).

Kaynak dosyalar (depo dışı, kullanıcının makinesinde `İndirilenler/mixamo_icin/`): Meshy FBX (rigli, dokulu),
`animasyonlar/*.fbx` (Mixamo, Without Skin), OBJ denemeleri. GLB'yi yeniden üretmek için yukarıdaki komut.

### Meshy üretim hattı ve A listesi modelleri (3 Kasım 2026 akşam)

`docs/meshy-model-listesi.md`'deki **A öncelikli 13 model** Meshy API'siyle (Meshy CLI 0.4.0, kullanıcının Pro hesabına
cihaz girişi: `npm exec --yes --package=meshy-cli@0.4.0 -- meshy auth login --device`) üretildi; toplam ≈ 505 kredi
(nesne 30: preview 20 + doku 10; asker 49: görsel 9 + Image to 3D 30 + remesh 5 + rig 5; helikopter ikinci kez 39).

- **Sürücü:** `node araclar/meshy-uret.mjs [--kod F2,T1] [--eszamanli 4]`; plan `meshy_output/plan.json` (listeden
  `Ö == A` satırları), durum model başına `meshy_output/<kod>/durum.json` (kaldığı yerden sürer, adımı iki kez ödemez),
  günlük `meshy_output/gunluk.txt`. `meshy_output/` depoda değil.
  - nesne: `text-to-3d preview` → `refine` (PBR, 2K) → GLB + önizleme. **`target_polycount` API'de uygulanmıyor**
    (satır içi JSON da `@dosya` da denendi; 150 bin–2,6 milyon üçgen geliyor) → seyreltme yerelde.
  - asker: `text-to-image` (gpt-image-2, `--pose-mode a-pose`, prompt + "Görsel eki (asker)") → `image-to-3d`
    (`--input-task-id`, standard, PBR 2K, `--pose-mode a-pose`) → `remesh` 30K üçgen → `rigging` (`--height-meters`)
    → rigli GLB + **FBX**. API rig'i **24 kemik, öneksiz** (Hips, Spine02→Spine01→Spine→neck→Head, LeftArm…,
    LeftToeBase); web rig'i 65 "mixamorig:" kemikti.
- **Yerel hazırlama — DİKKAT (3 Kasım gece, kullanıcı duvarda gördü: "kırılıp yapıştırılmış porselen gibi"):** Blender
  Decimate (`model-hazirla.py`) üçgen sayısını 100 kat düşürürken UV adalarını yırtıyor, her dikişte koyu çatlak ve
  yüzey kırıkları çıkıyor. Artık **`node araclar/model-sadelestir.mjs <girdi> <cikti> --ucgen N --boy M [--eksen] [--doku]`**
  (meshoptimizer, `lockBorder` → dikişler sabit; ölçek/taban kök düğüm dönüşümüyle; dokular sharp ile JPEG). Helikopter ve
  tank da önce bununla sadeleştirilip Blender betiklerine `--ucgen 9999999` ile verilir (Decimate atlanır). Çok parçalı
  modelde (moloz, binlerce ayrık parça) kilitli sınırlar sadeleşmeyi engeller → Meshy `remesh` (5 kredi) sonra sadeleştir.
  `model-hazirla.py` yalnız referans; yeni modelde kullanma.
- **(Eski) Blender hazırlama:** `araclar/model-hazirla.py <girdi> <cikti> --ucgen N --boy M
  [--eksen uzun|yukseklik] [--doku 1024] [--render png]`: Decimate (UV korunur), en uzun kenar ya da yükseklik = boy,
  orijin taban merkezi, JPEG dokular. Çıktılar `icerik/modeller/nesneler/` (depoda; 0,3–1,5 MB).
  Helikopter: `araclar/helikopter-hazirla.py`: Meshy'ye "palasız gövde" referans görseli (gpt-image-2) → Image to 3D
  (ilk text-to-3d denemesi palalı ve kızaklı geldi, palaları gövdeden ayırmak geometriyle mümkün olmadı); palalar
  prosedürel: "rotor" (4 pala, yarıçap gövde boyunun %54'ü, göbek = gövde ortasındaki (|x| < L/4) en üst %4 nokta kümesi,
  palalar tepeden %3 yukarıda; kuyruk = tepesi yüksek olan uç — 3 Kasım gece iki tuzak: köşe kaydırmasından sonra Blender
  `bound_box` güncellenmiyor (noktalardan hesapla), kuyruk kanadı tepesi direğe yakın yükseklikte olduğundan bütün modelin
  üst dilimi göbeği kuyruğa kaydırıyordu) ve "kuyruk_rotor" (yerel x
  ekseni yanal; oynatıcı `rotation.x`), manifest `helikopter.rotor: ["rotor", "kuyruk_rotor"]`, `renk` kaldırıldı
  (boya Meshy dokusunu ezerdi).
- **Mixamo aktarımı** (`araclar/mixamo-aktar.py`) API rig'i için: kemik adı eşlemesi `kaynak_adi()` (öneksiz ad →
  "mixamorig:" + ad; Spine02→Spine, Spine01→Spine1, Spine→Spine2, neck→Neck, head_end→HeadTop_End), girdi FBX ya da
  GLB, çıkış adı mesh adı. **Atlama eşiği 60° → 85°:** A-pozdaki kollar T-poza 65–74° uzak olduğundan kol/el kemikleri
  dinlenmede kalıyordu (kollar düz aşağı, baş yana eğik). Kalça: yükseklik kaynaktan, yatay sabit (yukarıdaki tuzak).
- **Manifest:** `komando_bere_*`, `telsizci_*`, `sihhiyeci_*`, `komando_kis_*` (komando_* şablonlarından alt küme;
  `kemikler` API adlarıyla: govde Spine02, gogus Spine, bas Head…; `silahModeli.kemik` "RightHand"), `nesne_*` (turnike,
  açık/kapalı sıhhiye çantası, sedye, duman bombası, iki kum torbası; `olcekSabit: true`, `animasyon: "yok"`,
  `serbestYerlesim`, "yanında" ile yaralının yanına konur), komando tüfeği `modeller/nesneler/tufek_piyade.glb`.
  `figurler3b.ts` `ModelTanimi.olcekSabit`: boy normalizasyonu atlanır (yassı nesneleri 1,8 m'ye büyütmesin).
- **Kum torbası duvarı** (`sutre.ts` `tip: "torba_duvari"`): `dosyalar` (iki torba çeşidi), `genislik` m, `sira` kat,
  `kavis` derece; katlar yarım torba şaşırtmalı, çeşit ve ±7° dönüş tohumlu rastgele; torbalar bastırılır
  (1,12 × 0,62 × 0,62) ki tombul Meshy torbası dolu torba oranına gelsin ve aralık kalmasın. Oda 2 `operasyonel_bolge`
  Quaternius siperleri bununla değişti.
- Eksik/geliştirme: T5 açık çantada kızılay yerine beyaz haç çıktı (doku elle düzeltilebilir ya da yeniden üretim 30
  kredi); T9 duman bombası silindir değil el bombası biçiminde; tüfek MPT-76'dan çok M4 benzeri (dürbünlü), tamam.
  Asker varyantlarında tüfek konumu/dönüşü duvarda ince ayar ister.

### Silah soketi: tüfeğin ele oturtulması ölçüyle (3 Kasım 2026 gece)

Deneme-yanılma (`donus` tahmini + ekran görüntüsü) her rig/tüfekte yeniden başa dönüyordu. Artık ölçülüyor
(`sahne3b/silahHizalama.ts`, oyun motorlarındaki "weapon socket" yaklaşımı):

1. **Namlu doğrultusu** Mixamo tüfek kliplerinden: sağ el tutamakta, sol el kundakta → sağ elden sol ele vektör; tüfek
   yatık taşınmadığından "yukarı" = dünya yukarısının bu doğrultuya dik bileşeni. 6 klip × 4 kare örneklenir (Rifle Idle,
   Walk, Firing, Aiming Idle, Kneel Idle, Crouch Walk), kuaterniyonlar ortalanır; her örneğin ortalamadan sapması raporlanır
   (sapma > 25° → o klipte el yönelimi tutarsız, aktarım/rig sorunu).
2. **Tüfek modelinin kendi ekseni** geometriden: en uzun kenar = eksen; dar kesitli uç = namlu ağzı; eksen boyunca 12
   dilimde dik eksenin min/max'ı — namlu hattından en çok çıkıntı yapan taraf (şarjör + tutamak) aşağı (nokta yoğunluğu
   yanıltır: dürbünlü tüfekte üst yarıda daha çok köşe var, ilk sürüm "yukarı"yı ters bulmuştu). Kavrama noktası: en derin
   çıkıntı (şarjör) diliminden dipçiğe doğru bir dilim (tutamak), tutamağın altından yüksekliğin %12'si yukarı.
3. **Avuç** = bilek kemiği + önkol→el doğrultusunda 7 cm. Silah orijini = avuç − R·kavrama; kemik uzayına çevrilir.
   Çıktı doğrudan manifest biçimi: `konum` metre (kemik yönelimiyle; oynatıcı olcek·kemikOlcek ile kemik birimine çevirir),
   `donus` three.js Euler XYZ derece.

Kullanım: figürü sahneye koy (silahlı kayıt), tarayıcı konsolunda
`await window.duvar.silahHizala("<figür id>", ["Rifle Idle", "Rifle Walk", "Rifle Aiming Idle"], 0.95)` → `konum`,
`donus`, `tufek` (eksen/namlu/yukarı tespiti), `ornekler` (sapmalar), `uyari`. Sonucu o rig'in bütün kayıtlarına yaz.
3 Kasım ölçümü (tufek_piyade.glb): Meshy API rig'i (RightHand) `konum [0.114, 0.187, -0.111]`, `donus [156.4, -27.4, 72.9]`,
sapma ≤ 8°; web rig'i (mixamorig:RightHand) `konum [0.096, 0.164, -0.144]`, `donus [155.6, -45.9, 74.7]`, sapma ≤ 11°.
Başsız tarayıcıda bekleyen (göğüs önünde taşıma), nişan (dürbün gözde, izleyiciye), yürüyen kliplerde doğrulandı.
Yeni tüfek ya da yeni rig geldiğinde aynı çağrı; elle değer tahmin etme. Proje skill'i: `.claude/skills/silah-soketi/SKILL.md`.

### B listesi modelleri (3 Kasım 2026 gece)

17 model aynı hatla (≈ 560 kredi; bakiye ~190): ağır yüklü dağ komandosu (`asker_agir_yuk.glb`, `komando_agir_*`),
turnikeli yaralı asker (`asker_yarali.glb`, `yarali_asker_*`; `yarali_asker_yuruyen` = Mixamo "Injured Walk", 0,7 m/s);
nesneler `nesne_*`: makineli tüfek (MG3 istendi, üretici kısa namlulu tüfek verdi), Kirpi benzeri zırhlı araç, yanmış
enkaz, bandaj paketleri, T-duvar, gözetleme kulesi (kum torbaları havada asılı çıktı, 6 m'de fark edilmiyor), nöbet
kulübesi, yakıt varili, jeneratör, konteyner, yıkık duvar, kerpiç ev köşesi, moloz yığını (7,6 M üçgen, binlerce ayrık
parça; Decimate 147 bin'e kadar indi, 11 MB). Sütre dizilimleri: operasyonel bölgeye konteyner/jeneratör/variller/kulübe,
meskûn mahale yıkık duvar/kerpiç köşe/moloz/enkaz eklendi. Örnek senaryo "Gösterim – B Listesi Modelleri (2 dk)".

**Tank (`nesneler/tank_altay.glb`, manifest `tank_altay`):** Meshy "kulesiz gövde" ve "namlusuz kule" promptlarına rağmen
tam tank üretti (V3 = tam tank, V4 = yine tam tank). `araclar/tank-ayir.py` tam tankı ayırır: uzun eksen x, ön = dik
kesiti küçük (namlu taşan) uç → −x; güverte yüksekliği = gövdenin arka dış köşelerindeki (x arka %30, |y| > %30 W) tepe
hücrelerinin ortancası (dilim tepeleri kule kuyruğu/anten, genişlik profili kule darlığı yüzünden yanılttı); güvertenin
%2 H üstündeki yüzler kule, bunların burun ötesine taşan ya da kule ön kenarından ileri uzanan ince kısmı namlu.
Kule/namlu düğümleri dönüşsüz, orijin bilezikte (glTF dışa aktarımı nesne dönüşünü taşımadı, ilk sürümde kule tepede
yan yatmıştı). `figurler3b.ts kuleyiDondur`: dönme ekseni artık düğümün dünya yukarısına denk gelen yerel ekseninden
seçilir (`Aktif.kuleEksen`; Quaternius z, Meshy y). Başsız tarayıcıda düşman 20° → namlu 20° ölçüldü.
`araclar/tank-birlestir.py` (ayrı gövde + kule birleştirme) yazıldı ama Meshy ayrı parça vermediğinden kullanılmadı.

### Yangın ve duman aydınlatması (3 Kasım 2026 gece)

- **Efekt `yangin`** (panel Efektler, API `/efekt {tur:"yangin", siddet, yon}`): seçilen yöndeki patlama noktasında kalıcı
  yangın (`sahne3b/yangin.ts` `YanginKatmani`): tabandan yükselen kısa ömürlü alevler (katkılı, sarı çekirdek → turuncu →
  koyu kızıl, `renkSon` ile ömür boyu renk geçişi), savrulan korlar, üstte kara → gri rüzgârla sürüklenen duman sütunu
  (`ParcacikSistemi.yangin`, saniye başına oranla, kalite kapasitesiyle), titreyen turuncu `PointLight` (60 cd·yarıçap;
  520 zemini turuncuya boyuyordu). Aynı noktaya ikinci yangın büyütür. **`yangin_sondur`** hepsini söndürür: alev 2,5 sn'de
  iner, beyazımsı duman tüter, kayıt silinir. Sahne sıfırlama (`temeleDondur`) anında kaldırır. Panorama yüklenirken
  gelen `yangin` kuyruğa alınır (patlama gibi). Ses yok (yangın çıtırtısı manifest `sesler.yangin` ile eklenebilir, kod
  bağlanmadı).
- **Duman aydınlatması:** parçacık gölgelendiricisi duman topağını kart düzleminde sanal yarım küre sayar, güneş yönüne
  (`isikYonu` uniform, `isikYonuAyarla` her kare güneşten) göre aydınlık/koyu tonlar (`golgeleme` uniform: duman 1,
  ateş/kıvılcım 0). Patlama ve krater dumanı da aynı yoldan daha hacimli görünür.
- `Parcacik.renkSon`: ömür boyu renk geçişi (havuzdan dönen nesnede sıfırlanır).

### Panel: gruplar, simgeler, eski modeller (3 Kasım gece)

Manifest `klipler` kayıtlarında `grup` (asker | sihhiye | yarali | tank | arac | silah | nesne | yapi | heli), `simge`
(emoji) ve `eski` (Quaternius/test yer tutucuları: asker_swat/kamuflaj/taktik/mixamo, tank_mbt/quaternius, webm
siluetler) alanları; köprü `klipleriOku` bunları `KlipOzeti`ye geçirir. Figür paneli: hızlı düğmeler ve "Gelişmiş" listesi
gruplara göre simgeli; `eski` kayıtlar varsayılan gizli ("Eski modelleri göster" anahtarı), hızlı düğmeler (asker çağır,
tank, koşan, yaralı, sıhhiyeci) yalnız yeni modelleri kullanır (eski yalnız hiç yenisi yoksa). Sahnedeki birlik listesinde
simge; Vuruldu/Diz çök/Yat düğmeleri grup asker/yarali/sihhiye için. Örnek senaryolar eski adlarla (asker_bekleyen vb.)
çalışmaya devam eder (gizli ama yüklenir).

### Çok kanallı ses (26 Ekim 2026)

Sahada U odada 4 hoparlör (ön sol/sağ, arka sol/sağ) + subwoofer beklenir, büyük olasılıkla 5.1 / 7.1 AV alıcı
üzerinden (`docs/donanim-onerileri.md` §6). Oynatıcı bunun için Web Audio çıkışını çok kanallı açar
(`src/ses.ts`; hesaplar `src/sesYerlesimi.ts`, testleri `sesYerlesimi.test.ts`):

| Düzen (`?ses=`) | Kanal sırası (Windows/Chrome ayrık sıra) | Varsayılan azimutlar (°) |
|---|---|---|
| `stereo` | Sol, Sağ | – (StereoPanner, pan = sin(azimut); önceki davranış aynen) |
| `dortlu` | Ön sol, Ön sağ, Arka sol, Arka sağ | -45, 45, -135, 135 |
| `5.1` | Ön sol, Ön sağ, Orta, Bas (LFE), Arka sol, Arka sağ | -30, 30, 0, lfe, -110, 110 |
| `7.1` | Ön sol, Ön sağ, Orta, Bas (LFE), Arka sol, Arka sağ, Yan sol, Yan sağ | -30, 30, 0, lfe, -150, 150, -90, 90 |

- **Seçim:** `?ses=` > yerel kayıt > otomatik. Otomatik, ses cihazının kanal sayısına bakar
  (`AudioDestinationNode.maxChannelCount`: 8 → 7.1, 6 → 5.1, 4 → 4 kanal, değilse stereo; dizüstünde stereo kalır).
  İstenen düzen cihaza sığmazsa otomatiğe düşer ve köprü günlüğüne uyarı yazar ("5.1 istendi ama ses cihazı 2 kanal
  veriyor …"). Panel: Sistem → Ses düzeni (oynatıcı adresine `?ses=` ekler; "Otomatik" `?ses=otomatik` gönderir,
  oynatıcı her açılışta kayıtlı düzeni siler). Panelde seçim yokken oynatıcının kendi kaydındaki düzen gösterilir
  (aynı kökende, köprü port 4000; oynatıcı elle `?ses=` ile açılmış olabilir).
- **`?hoparlor=`:** sahadaki gerçek açılar, kanal sırasıyla, LFE için `lfe` (ör. `?hoparlor=-40,40,0,lfe,-120,120`;
  0 = orta duvar, sağa artı, ±180 eğitim alanının arkası). Yalnız 4, 6 ya da 8 kanal (stereo açı kullanmaz); kanal
  sayısı düzene uymalı, `?ses=` yoksa düzeni kanal sayısı belirler (4 → 4 kanal, 6 → 5.1, 8 → 7.1). Geçersiz değer
  kayda yazılmaz, uyarı verir; açılar kullanılamazsa (stereo düzen, kanal sayısı tutmuyor) köprü günlüğüne
  "?hoparlor= kullanılmadı" yazılır, varsayılan açılar geçerli olur. `?hoparlor=otomatik` kaydı siler.
  5.1 / 7.1'de `lfe` 4. sırada kalmalı: Windows'un 5.1 / 7.1 yapılandırmasında 4. kanal (indeks 3) bas kanalıdır,
  AV alıcı onu subwoofer'a verir ve ~120 Hz'de keser; oraya açı yazılırsa o yöndeki sesler yalnız bas olarak duyulur
  (köprü günlüğüne "?hoparlor= 4. kanalda açı var" uyarısı yazılır). LFE'siz 6/8 tam hoparlör yalnız LFE işlemesi
  olmayan ayrık çıkışlı çok kanallı ses kartında anlamlıdır.
- **Yerleşim:** kaynak, açısal olarak kendisini çevreleyen iki komşu hoparlör arasında sabit güçlü (cos/sin) kaydırılır;
  ±180 üzerinden sarma dâhil, kareler toplamı 1 (her yönde aynı ses gücü). Stereodan farkı: 30° ile 150° artık
  ayrı (önde / arkada). Stereo kayıtlar tek noktaya indirilir (+3 dB telafi).
- **Uzak sesler** (uzak patlama, uzak atış, uzak mermi): 600 Hz alçak geçiren + %35 yayılım (tüm hoparlörlere kısmen
  dağılır, yön yine sezilir).
- **LFE:** patlama, uzak patlama ve tank topu 120 Hz alçak geçirenden geçen kopyayı bas kanalına da gönderir
  (yalnız LFE'li düzende: 5.1 / 7.1 ya da `?hoparlor=` içinde `lfe`).
- **Ortam** (rüzgâr sentezi, manifest ortam döngüsü): dağınık; stereo döngünün sol kanalı soldaki, sağ kanalı sağdaki
  hoparlörlere gider, ön/arka ortadaki hoparlör ikisini yarım kazançla alır (giriş gücü korunur). Rüzgâr çok kanalda
  iki bağımsız gürültü kanalından üretilir (sol ve sağ grup ilintisiz; tek gürültü her hoparlörde aynı olur, odanın
  ortasında hayalet kaynak gibi duyulurdu); stereoda eski tek kanallı gürültü.
- **Çatışma ve izli mermi sesleri** (`sahne3b/catisma.ts`): atış atıcının / mermi kaynağının, çarpma çarpma
  noktasının, ses hızı üstü "çat" en yakın geçiş noktasının azimutundan. Panelin izli mermi akışında çarpma ve "çat"
  saniyede en çok ~1,5 (jeton kovası; yoğun akışta ses bastırmasın, görüntü aynı). Geri çağrılar (`CatismaSesleri`)
  markalı `AzimutDerece` (sahne azimutu, derece) alır: değer `sesAzimutu(konum)` ya da `azimutDerece(derece)` ile
  üretilir, düz sayı ya da `Math.sin(...)` gibi pan değeri derleme hatası verir (çalışma anı denetimi
  `catismaSesleri.test.ts`).
- **Helikopter:** 3B uçuş modelinin konumundan (`Helikopter3B.sesKonumu`: sahne azimutu, izleyiciden yatay mesafe,
  yerel zeminden irtifa), kalıcı bir düğüm zinciriyle (kare başına düğüm üretmeden, en çok 20 Hz güncelleme): 40 m'ye
  kadar tam seviye, ötesinde 1/r (taban %12), uzakta alçak geçiren (boğuk), yaklaşırken / uzaklaşırken ±%5 Doppler.
  Kalkıştan sonra görüş sınırı (1500 m) aşılırsa son konumda taban seviyede kalır, "yok" gelince söner. 2B siluette
  (model yok) eski yönsüz ses.
- **Konuşma sentezi** (manifestte bağırma/çağırma kaydı yoksa) Web Audio'dan geçmez, konumlanamaz; kayıtlar konumludur.
- **Hoparlör testi (T):** kanal sırasıyla her hoparlörde ~0,7 sn pembe gürültü (LFE'de 30–120 Hz bant), ekranda
  "Hoparlör testi: Ön sol · kanal 1 / 6"; test sürerken T durdurur. Ana kazançtan geçer, sessiz kipte (M) duyulmaz.
- HUD (H) ilk satırı: "ses açık: 5.1 (6 kanal)"; istenen düzen cihazda yoksa "istenen 7.1, cihaz 2 kanal". "T hoparlör
  testi" tuş ipucu satırında (H hud · K kalibrasyon · … ile birlikte).
- Windows'ta hoparlör yapılandırması 5.1 / 7.1 seçilmezse Chrome 2 kanal görür; kurulum ve test adımları
  `docs/donanim-onerileri.md` §6.

## İçerik ekleme

İçerik klasörü `apps/duvar-oynatici/public/icerik/`; köprü bu klasörü doğrudan
`/oynatici/icerik/` yolundan sunar, yani dosya koyup manifesti düzenleyince **derleme gerekmez**,
oynatıcıyı yenilemek yeter (köprü, `ICERIK_KLASORU` ortam değişkeni verilirse önce onu, sonra
`public/icerik`, en son derleme kopyası `dist/icerik` klasörünü kullanır; sahada içerik ayrı diskte
tutulabilir). Manifest:
`apps/duvar-oynatici/public/icerik/manifest.json` (bkz. `icerik/OKU.md`). `dongu` listesine
`{bolge, mevsim, zaman, dosya}` satırı eklenince oynatıcı o durum için videoyu kullanır. Panoramada eksik birleşim
bölgenin en yakın panoramasına düşer (önce aynı zaman, sonra aynı mevsim; köprü günlüğüne yazılır), yer tutucu yalnız
bölgede hiç panorama yokken; yani içerik parça parça gelebilir. Yeni panorama JPEG'i q90 4:2:0 baseline olmalı
(`araclar/panorama-sikistir.py`, bkz. `docs/fotogercekci-icerik-hatti.md` §6.1). `sesler` altındaki listeler dolunca
sentez yerine kayıtlar çalar.

Klip üretim kuralı (U duvar): 3 kamera, her biri 90° yatay görüş, yaw -90/0/+90, aynı konum ve
yükseklik (1,6–1,7 m); 3 × 1920×1080 kareler yan yana birleştirilir (5760×1080); 60–90 sn, ilk ve
son kare aynı (kusursuz döngü). Duvar ölçüleri ve açıları saha keşfinde netleşince oynatıcıya `?oda=`
ile girilir (360° panorama ve 3B içerik yeniden üretilmez); düz 5760×1080 video döngüleri ise ölçülmüş kamera
açılarıyla (duvar başına açı aralıkları K ızgarasının altında) yeniden alınmalıdır.

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

Panelden gelen figür komutları (`POST /api/figur`, `{islem: oynat|durdur|temizle|poz, id, klip, azimut,
yukseklik, olcek, dongu, yansit, poz}`) köprüde tutulur ve `figur` WebSocket mesajıyla tüm oynatıcılara
gider; yeniden bağlanan oynatıcıya köprü aktif figürleri (duruşlarıyla) bağlantı anında yeniden gönderir
(sahne kaldığı yerden devam eder). Senaryo adımı `{tip:"figur", figur: FigurKomutu}` aynı komutu zaman
çizelgesinden tetikler; editörde "Sahneye koy" adımı `senaryo_<adım>` kimliği üretir, sonraki "Duruş
değiştir" adımı (vuruldu / diz çök / kalk) bu kimliği hedefler. Panelde "Yaralı asker" (yakına yerde),
"Asker vuruldu!" (pusulaya en yakın ayakta asker düşer) ve figür satırında Vuruldu / Diz çök / Kalk var.

## Köprü ile sözleşme

- Bağlanınca `{tip:"merhaba", rol:"oynatici"}` gönderir; köprü `baglanti.oynatici` sayacını artırır.
- `durum` mesajı → tüm sahne parametreleri; `efekt` mesajı → anlık efekt (`EfektIstegi` + zaman);
  `figur` mesajı → figür komutu + aktif figür listesi.
- Oynatıcı komut göndermez (durumsuz; yeniden bağlanınca son durumu alır). İstisnalar: **önizleme** — iki tuvali ve
  aradaki geçiş örtüsünü (duvardaki opaklığıyla) 384 px JPEG'e indirip `{tip:"onizleme", veri, bilgi}` yollar, en çok
  5 sn'de bir ve yalnız en az bir panel bağlıyken (köprü `baglanti` mesajında `panel.sayi` bildirir; toDataURL ana iş
  parçacığını ~0,1–0,2 sn bekletir); köprü yalnızca panellere iletir, canlı sahne kartı pusulanın üstünde gösterir (15
  sn'den eskiyse gizler; sıfırlamadan önceki görüntü "temizleniyor…" diye soluk). Bir sonraki kare hemen gider:
  sıfırlamadan sonra (örtü eski kareyi tutuyorsa ilk temiz karede; yoksa panel sıfırlamadan sonra damgalanmış bayat
  bir görüntüyü 5 sn gösterirdi), yeni panel bağlanınca ve sahne geçişi bitince. `bilgi`: fps, boyut, kalite
  ("otomatik" işaretiyle), 3B, figür/krater sayısı, geçiş sürerken geçiş durumu. **Günlük** (`gunluk`) ve **⇧0**
  sıfırlama isteği.
- **Sahne sıfırlaması** (`POST /api/sahne/sifirla {kaynak?}`, köprüde `SahneYoneticisi`): köprü sırayla senaryoyu
  durdurur (await yok; bekleyen adım dönünce uygulanmaz), `figur temizle` yayınlar, çatışma/izli mermi/helikopteri
  kapatan TEK `durum` yayınını yollar (UE çağrıları sonra, beklenmeden, 3 sn zaman aşımı; DMX flaşı kesilip temel ışık
  gider), en son `{tip:"sahne", islem:"sifirla", nesil, kaynak, ozet, zaman}`. Oynatıcı bu mesajda yerel artıkları
  sabit sırayla temizler (`sahneTemizligi.ts`, adım başına try/catch, hatalar tek satırda köprü günlüğüne): bekleyen
  figür/efekt kuyrukları → 3B (`Sahne3B.temeleDondur`: figürler ve yüklenmekte olanlar, krater/moloz/duman,
  parçacıklar, uçuştaki iz ve tank mermisi, patlama ışığı, arazi kraterleri: `AraziKatmani.kraterleriTemizle()` çukuru,
  yanığı ve silinen bitkiyi yerinde geri alır, ızgara yeniden kurulmaz) → 2B klipler → 2B efektler (flaş, sarsıntı) →
  2B izli mermi → sesler (`efektleriSustur`: tek seferlikler 30 ms'de söner, atış dizileri ve tampon bekleyenler iptal,
  konuşma kuyruğu silinir, rotor hızla söner) → geçiş örtüsü (geçiş sürerken eski kare ilk temiz karede kalkar; gelen
  panorama ve ertelenen bölge işleri etkilenmez, bkz. "Sahne geçişi") → önizleme. Çatışma/izli/helikopterin açık-kapalı
  oluşu durumdan gelir, temizlik ona dokunmaz. Ortam sesi, sütre, ortam ve bölge kalır. Eski oynatıcı yalnız
  `tip`/`islem`'e bakar, çalışmaya devam eder.
- Bağlanan istemciye sırayla: `durum`, `senaryo`, `baglanti`, `ornek`, `{tip:"sahne", islem:"senkron", nesil}`,
  `figur temizle` (aktif listeyle), aktif figürler (`oynat`). Oynatıcının bildiği nesil farklıysa (kopukken sıfırlama
  kaçırıldı) yerel temizlik yapar; ilk bağlantıda yalnız kaydeder. Nesil son durumla diske yazılır: köprü yeniden
  açılınca bağlı oynatıcılar boşuna temizlenmez.
- Köprü son durumu `veri/son-durum.json`'a yazar (1 sn gecikmeli; sıfırlamada hemen) ve açılışta geri yükler (12
  saatten eskiyse yok sayar); oynatıcı yeniden bağlanınca bu durumu ve figürleri alır.

## Sınırlamalar (prototip)

- Yer tutucu sahne stilizedir; kabul için gerçek panoramalar (depoda var) ve içerik gerekir.
- Patlama, toz ve helikopter 3B katmanda prosedürel/parçacık tabanlıdır; manifest `klipler` bölümüne
  gerçek VFX plakaları (`patlama_*`, `toz_*`, `uzak_patlama_*`) konunca oynatıcı onları kullanır,
  3B katman krater/moloz/ışık eklemeye devam eder. Depodaki test klipleri sentetiktir ve `yedek`
  işaretlidir (3B açıkken kullanılmaz).
- 3B asker modelleri stilize (three.js Soldier, Poly Pizza); kabul için Mixamo "Swat" karakteri +
  Rifle animasyonları (ücretsiz Adobe hesabı, Blender → GLB) ya da yeşil perde çekimi önerilir.
- Helikopter modeli düşük poligonlu (OGA CC-BY); uçuş modeli ve rotor tozu birim testli, tarayıcıda gözle
  doğrulanmadı (27 Ekim: yaklaşma kavisi, flare, kalkış virajı, toz renkleri ve izli mermi kalınlığı duvarda
  bakılmalı; 2 Kasım: pas geçme, yan/arka noktalardan kalkış çıkışı, "yok"ta sönme, panorama yüklenirken uçuşun
  sürmesi).
- Kırsal ve dağlık hibritte önde ve sol önde ~115–205 m'de sırt var (`ARAZI_PROFILLERI.sirt`: kırsal 18 m, dağlık
  40 m). Kaynak sırtın arkasında kalırsa artık sırtın tepesine taşınır (yukarıda `sirtaTasi`). Ölçüm (2 Kasım, gerçek
  hibrit arazi, ayrı CatismaSistemi örneği, 240 iz): izleyicinin 60 m yakınına ulaşan izli mermi kırsalda orta duvar
  yön 0 %25 → %96, sol %45 → %65, sağ %82 → %100; dağlıkta orta %94, sol %82, sağ %97; çatışma ateşi (cephe 0)
  kırsal %30 → %97, dağlık %99. Taşınan kaynaklar ~110–120 m'de, zeminin 1,5 m üstünde. Duvarda gözle bakılmalı
  (namlu parıltıları sırt çizgisinde).
- Performans (2 Kasım, Iris Xe, başsız Chrome, 1920×360, kırsal yaz 12:00 hibrit; önce → sonra): yuksek 19 → 54 fps
  (GPU 48 → 17 ms, 12,6 M → 2,9 M üçgen, 244 → 87 çizim), orta 25 → 58 fps (37 → 13 ms), dusuk 40 → 60 fps (vsync);
  4 asker + çatışma orta 18 → 55–60, dusuk 25 → 60. Makine uzun süre tam yükte ısınınca (aynı sabit iş yükü serinken
  11,4 ms, ısınınca 14 ms; Iris Xe güç bütçesini CPU ile paylaşır) yuksek ~48, orta 52–60, 4 asker + çatışma orta ~49;
  bitki yerleşimi her açılışta rastgele olduğundan üçgen sayısı da ±%10 oynar. Bitki gölgesini kapatmak orta'da 2–3 ms
  kazandırır (yalnız çalılarınki ~1 ms); görüntü kaybı yüzünden kademelere uygulanmadı. Kalan takılmalar: panel
  önizlemesi (toDataURL 65–100 ms; birleşimden sonra en çok 5 sn'de bir ve yalnız panel bağlıyken, sıfırlama/geçiş
  sonunda bir kez daha; PBO ile eşzamansız okuma yapılmadı) ve sahne geçişinin takas karesi (0,33–0,8 sn, örtünün
  altında; "Sahne geçişi"). İlk patlamadaki gölgelendirici derlemesi geçiş turunun ön derleme kopyalarıyla kalktı
  (0,23 sn). Bu sayılar üç izin ayrı ölçümleri; birleşik dal tarayıcıda yeniden ölçülmedi. Ölçerken aynı GPU'da başka
  bir oynatıcı sekmesi/başsız tarayıcı çizmemeli ve ağır CPU işi (test, derleme) olmamalı: paylaşımlı Iris Xe'de GPU
  süresi %25–100 uzar. 5760×1080 için hedef makine (RTX 4060+). Parçacık üst sınırı 2100×kalite çarpanı.
- Yaralı/diz çökme Quaternius rigine göre ayarlandı; Poly Pizza/Mixamo modellerde düşme klibi yok, klipsiz
  model yaralı olunca gövde yere yatırılır (kaba). Yere yatıp ateş (prone) duruşu yok.
- Çok kanallı ses (4 kanal / 5.1 / 7.1, LFE) yazılımda hazır ve birim testli; gerçek hoparlörlerle kulak testi yapılmadı
  (donanım yok). Sahada hoparlör açıları `?hoparlor=` ile girilmeli, T testiyle kanal eşlemesi doğrulanmalı.
- Tarayıcı: Chrome/Edge (kiosk bayrakları). 5760×1080'de 60 fps için RTX 4060 sınıfı yeterli.

## Açılışta figür teslimi ve eski klip adları (4 Kasım 2026)

Köprü, bağlanan oynatıcıya önce `sahne/senkron`, sonra `figur temizle`, sonra aktif figürleri yollar. Oynatıcıda
WebSocket bağlantısı manifest (`icerik/manifest.json`) isteğinden önce kurulabildiğinden bu figürler `klipler.tanim()`
boşken gelebiliyordu; eski kod tanımsız klibi 2B yola düşürüp sessizce atlıyordu (duvarda "figür 0", aynı komut yeniden
gönderilince yükleniyordu). Yönlendirme artık saf `figurYonlendirme.ts`'te: manifest gelmeden gelen her figür
`bekleyenFigurler`'e alınır; manifest gelince 2B klipler hemen oynar, 3B modeller sahne hazır olunca (bölge geçişi
takası dahil). Doğrulama: Playwright'ta manifest isteği 4 sn geciktirildi; sonuç gecikmesiz açılışla aynı.

Köprü tarafı: kaldırılan modellerin klip adları (`asker_bekleyen`, `asker_taktik`, `asker_sihhiyeci`, `asker_yarali_3b`,
`asker_kosan`, `tank_eski` …) `FigurYoneticisi.klipAdiCevir` ile yeni Meshy modellerine çevrilir (manifestte
bulunmayanlar için; ESKI_KLIPLER tablosu). Eğitmenin kaydettiği eski senaryolar ve açılışta geri yüklenen durum böylece
boş sahne vermez; günlüğe adı başına bir uyarı düşer ("senaryo/kayıt güncellenmeli").
