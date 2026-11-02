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
pencereyi 48:9 oranını korumadan doldur (kiosk), `?hud=1` HUD açık başlasın.

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
  Doğru yine kapalıysa mermi yine atılır ve engellendiği yerde yamaca çarpar: gökten (50–80 m'den) gelmez (sonucu
  bkz. bilinen sınırlar: kırsal/dağlık sırt). Aynı sınır çatışma ateşinde de (`dusmanAtis`).
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
  `compileAsync` bitene dek 3B çizilmez (örtü eski kareyi tutar), bölge değiştiyse arazi dokuları gelene dek (en çok
  1,2 sn) beklenir ve örtü **0,6 sn'de compositor'da solar** (Web Animations; `?gecis=ms`, 0 = anlık kesme).
- Ardışık isteklerde yenisi eskisini geçersiz kılar (nesil numarası: işçi durdurulur, geç gelen bitmapler kapatılır, GPU
  kaynakları bırakılır); A→B→A'da geçiş olmaz; aynı dosyada yalnız yaw/plan/güneş/zaman değişirse yeniden yükleme yok.
- **Yer tutucu** (gokyuzuCiz/araziCiz) yalnız hiç panorama gösterilmemişken ve gösterilecek panorama yokken; ilk açılışta
  manifest/ilk panorama beklenirken ekran siyah, ilk sahne siyahtan solar.
- **Eksik birleşim** (Kasım 2026'da 7: kırsal kış gece, dağlık kış alacakaranlık/gece, meskûn kış gündüz, ormanlık kış
  gece, üs yaz/kış gece): `video.ts panoramaAdaylari` bölgenin en yakın panoramasını seçer (önce aynı zaman başka mevsim,
  sonra aynı mevsimde en yakın zaman; gecede alacakaranlık, sonra gündüz). Zamanı farklı yedekte `zaman` boş kalır, sahne
  onu saate göre karartır. Seçim köprü günlüğüne birleşim başına bir kez yazılır ("Panorama eksik: Dağlık · kis · gece →
  daglik/pano_yaz_gece_foto_8k_gece.jpg (yaz gece)"); dosya yüklenemezse sıradaki aday, hiçbiri olmazsa ekrandaki kalır.
- HUD son satırı `geçiş: yükleniyor <dosya> 0,4 sn` / `son geçiş 2,3 sn` ve örtü opaklığı; önizlemede örtü de görünür.
  2 sn'yi aşan geçiş köprü günlüğüne adım süreleriyle yazılır. Konsol: `window.duvar.sahne3b.sonGecis`,
  `window.duvar.gecis`, `window.duvar.arkaPlan()`.

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
normaller, 0,3–0,8 sn) ya da bölge değişiminde `arazi.kur` (~0,33 sn). Örtünün altında kalır ama ana iş parçacığını tutar;
arazi.ts'e dokunulmadı (hazırlık sırasında hesaplanıp takasta uygulanabilir ya da Worker'a alınabilir). Bölge değişiminden
sonra bitki modellerinin ve dokularının ilk yüklemesi solmadan sonra 0,4–0,7 sn'lik kareler bırakabiliyor (arazi.ts).
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
- Oynatıcı komut göndermez (durumsuz; yeniden bağlanınca son durumu alır). İstisnalar: **önizleme** — iki tuvali
  384 px JPEG'e indirip `{tip:"onizleme", veri}` yollar, en çok 5 sn'de bir ve yalnız en az bir panel bağlıyken
  (köprü `baglanti` mesajında `panel.sayi` bildirir; toDataURL ana iş parçacığını ~0,1–0,2 sn bekletir); köprü
  yalnızca panellere iletir, canlı sahne kartı pusulanın üstünde gösterir (15 sn'den eskiyse gizler). Sıfırlamadan
  sonra ve yeni panel bağlanınca bir sonraki kare hemen gider. **Günlük** (`gunluk`) ve **⇧0** sıfırlama isteği.
- **Sahne sıfırlaması** (`POST /api/sahne/sifirla {kaynak?}`, köprüde `SahneYoneticisi`): köprü sırayla senaryoyu
  durdurur (await yok; bekleyen adım dönünce uygulanmaz), `figur temizle` yayınlar, çatışma/izli mermi/helikopteri
  kapatan TEK `durum` yayınını yollar (UE çağrıları sonra, beklenmeden, 3 sn zaman aşımı; DMX flaşı kesilip temel ışık
  gider), en son `{tip:"sahne", islem:"sifirla", nesil, kaynak, ozet, zaman}`. Oynatıcı bu mesajda yerel artıkları
  sabit sırayla temizler (`sahneTemizligi.ts`, adım başına try/catch, hatalar tek satırda köprü günlüğüne): bekleyen
  figür/efekt kuyrukları → 3B (`Sahne3B.temeleDondur`: figürler ve yüklenmekte olanlar, krater/moloz/duman,
  parçacıklar, uçuştaki iz ve tank mermisi, patlama ışığı, arazi kraterleri) → 2B klipler → 2B efektler (flaş,
  sarsıntı) → 2B izli mermi → sesler (`efektleriSustur`: tek seferlikler 30 ms'de söner, atış dizileri ve tampon
  bekleyenler iptal, konuşma kuyruğu silinir, rotor hızla söner) → önizleme. Çatışma/izli/helikopterin açık-kapalı
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
  40 m; dağlıkta izleyicinin 20–40 m çevresinde 9–13 m'lik tepeler de). Bu yönlerde uzak izli mermi ve çatışma
  kaynakları sırtın arkasında kalır; kaynak en çok yerden 12 m yükseldiğinden (bilerek gökyüzüne kaldırılmıyor)
  mermilerin çoğu sırtın arka yamacına çarpar ve duvarda seyrek görünür. Ölçüm (2 Kasım, arazi analitik yüksekliği,
  koridorsuz): izleyicinin 60 m yakınına ulaşan izli mermi kırsalda orta duvar yön 0 %17, sol %48, sağ %82; dağlıkta
  orta %8, sol %50, sağ %62; çatışma ateşi kırsal 0° %23, −60° %7, dağlık 0° %12, −60° %0 (sınırsız yükseltmeyle
  kırsal orta %88; dal öncesi kodda kaynak düz zemin yüksekliğindeydi, kırsal orta %4). Ormanlık ve üs bölgesinde
  %85–97. Duvarda bakılmalı; gerekirse kaynak engelleyen sırtın üstüne (sırt hattına) alınabilir ya da sınır bölgeye
  göre gevşetilebilir.
- Performans (23 Ekim, Iris Xe, 1277×239): boş sahne 60 fps; 4 figür + çatışma + 16 krater ≈ 38 fps (kalite yüksek).
  Darboğazlar figür iskeletleri ve krater dumanıydı (düzeltildi). 5760×1080 için hedef makine (RTX 4060+)
  gerekir; dizüstünde `?kalite=dusuk`. Parçacık üst sınırı 2100×kalite çarpanı.
- Yaralı/diz çökme Quaternius rigine göre ayarlandı; Poly Pizza/Mixamo modellerde düşme klibi yok, klipsiz
  model yaralı olunca gövde yere yatırılır (kaba). Yere yatıp ateş (prone) duruşu yok.
- Çok kanallı ses (4 kanal / 5.1 / 7.1, LFE) yazılımda hazır ve birim testli; gerçek hoparlörlerle kulak testi yapılmadı
  (donanım yok). Sahada hoparlör açıları `?hoparlor=` ile girilmeli, T testiyle kanal eşlemesi doğrulanmalı.
- Tarayıcı: Chrome/Edge (kiosk bayrakları). 5760×1080'de 60 fps için RTX 4060 sınıfı yeterli.
