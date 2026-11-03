# İçerik ihtiyaç listesi (3 Kasım 2026)

Kendi modellerimize (Meshy AI) ve gerçek seslere geçiş için eksikler. Öncelik: **A** gösterimde göze batan / şartname,
**B** gerçekçiliği belirgin artırır, **C** sonra. "Kim" sütunu: **Sen** = Meshy / kayıt, **Ben** = kod ya da CC0 içerik
arama.

## Bugün elimizdeki (kısaca)

- Askerlerin hepsi aynı Quaternius SWAT modeli (haki boyalı) ya da düşük poligonlu Poly Pizza askerleri. Türk askeri yok,
  çeşit yok, kış kamuflajı yok.
- Tüfek tek, düşük poligonlu. Helikopter düşük poligonlu "Rescue Helicopter" (CC-BY). Tanklar düşük poligonlu.
- Sütreler: Quaternius/Kenney kum torbası, kaya, toprak yığını, jersey bariyer, sandık, çadır; HESCO prosedürel.
- Sesler: patlama ×5, uzak patlama ×4, tek atış ×8 (Mosin/SKS, yani eski tüfekler), bağırma ×3 (**İngilizce** yer
  tutucu), rotor, ortam döngüleri (kırsal, dağlık, ormanlık, meskûn, gece, kış rüzgârı, yağmur), telsiz paraziti.
  **Boş:** `cagirma`, `mermi_vizilti`, üs bölgesi ortamı (bunlar şu an sentezle çalıyor).
- Hava: yağmur ve kar ekrana düz çizilen 2B çizgi/nokta; sis dikey renk geçişi; bulut yalnız ekranı karartıyor. Şimşek,
  yağmur sıçraması, hareketli bulut, rüzgârda sallanan bitki yok. Manifestteki hava plakaları (`katmanlar`) boş.

## 1. Modeller (Meshy)

### Teknik şartlar (hepsi için)

- Biçim **GLB** (FBX de olur, ben dönüştürürüm). Ölçek **metre**, gerçek boy. Taban (ayak/teker) **orijinde**, Y yukarı.
- Üçgen: asker 20–30 bin, araç 30–50 bin, nesne 2–10 bin, küçük parça < 1 bin. Doku **2048**, PBR (renk, normal,
  pürüzlülük/metal). Meshy: 7.1 / Standart / PBR açık.
- **Logo, yazı, plaka, birlik arması yok** (gerekirse ben doku olarak eklerim). Ayna gibi parlak yüzey yok (projeksiyonda
  yanar); mat, hafif yıpranmış.
- **Hareketli parçalar ayrı dosya ya da ayrı düğüm**: helikopter rotorları, tank kulesi ve namlusu, araç tekerleri. Meshy
  tek parça üretir; parçaları ayrı ayrı üretip bana ver, ben birleştiririm.
- Her model için bir ön, bir yan ekran görüntüsü de at, sahnede karşılaştırırım.

### Figürler (iskelet + animasyon Mixamo'dan)

Asker **A-poz, silahsız, eller açık** (Mixamo böyle oturtuyor). Mixamo'dan **Without Skin** FBX, 30 fps; yürüme/koşma
klipleri **In Place** işaretli (figürü kod taşıyor). Bugünkü kod Quaternius kemik adlarına bağlı; Mixamo iskeleti için
uyarlamayı ben yazacağım.

| # | Model | Ö | Not |
|---|-------|---|-----|
| F1 | **Komando (temel)**: Türk dijital orman kamuflajı, kask (kılıflı), taktik yelek + şarjörlük, dizlik, eldiven, bot | A | Her şeyin temeli; önce bunu ver, iskeleti bununla kurarım |
| F2 | Komando varyant 2–3: bere / kask gözlüklü, sırt çantalı, telsizci (sırtta telsiz + anten) | A | Aynı yüzler yan yana kopya gibi duruyor |
| F3 | **Sıhhiyeci**: F1 + sırtta sıhhiye çantası, kolda kırmızı hilal bandı | A | TCCC senaryosunun merkezi |
| F4 | **Kış komandosu**: beyaz/kar kamuflajı, bere/kar maskesi | A | Kış panoramalarında yeşil asker sırıtıyor |
| F5 | Yaralı görünümlü asker: yırtık paça, turnikeli bacak (turnike modele gömülü) | B | Ayrı model kolaylık; yoksa F1 + T3 turnike |
| F6 | Karşı kuvvet (jenerik): sade haki/sivil karışık kıyafet, göğüs yeleği, belirli bir ülke/örgüt değil | C | Şu an düşman yalnız uzak namlu parıltısı |
| F7 | Pilot / kapı nişancısı (oturur) | C | Helikopter kapısı açıkken görünür |

**Mixamo animasyonları** (her biri ayrı FBX, Without Skin):

- Ayakta: Rifle Idle, Rifle Aiming Idle, Firing Rifle, Reloading
- Diz: Kneeling Idle (rifle), Kneel Firing, Stand To Kneel / Kneel To Stand
- Yatma: Prone Idle, Prone Firing, Prone Forward (sürünme), Stand To Prone / Prone To Stand
- Hareket: Rifle Walk, Rifle Run, Crouch Walk (çömelerek ilerleme), Sprint
- Vurulma: Hit Reaction, Death (öne / arkaya), Dying, Wounded Idle / Lying Wounded (yerde kıvranma)
- Yardım: Waving (yardım çağırma), Talking On Phone/Radio (telsiz), hand signals (Dur, Gel, İleri)
- Sıhhiye: Kneeling + Interacting, Picking Up, **Drag Body / Pulling** (yaralı sürükleme), **Fireman Carry** (omuzda taşıma)
- Diğer: Throw Grenade, Looking Around, Crouch Idle

### Silahlar (ayrı model, ele kod takar)

| # | Model | Ö | Not |
|---|-------|---|-----|
| S1 | **MPT-76 benzeri piyade tüfeği** (dürbünlü, ön tutamaklı) | A | Orijin kabza/tetik noktasında, namlu +Z, gerçek boy ~0,95 m |
| S2 | MG3 / PKM benzeri makineli tüfek, açık bipodlu | B | Mevzi ve sütre sahneleri |
| S3 | MPT-55 benzeri kısa karabina | C | Sıhhiyeci/telsizci çeşitliliği |
| S4 | Omuzdan atılan roketatar (boru) | C | |

### Araçlar

| # | Model | Ö | Not |
|---|-------|---|-----|
| V1 | **Genel maksat helikopteri (T-70 / Black Hawk benzeri)**, koyu yeşil | A | Oda 2'nin yıldızı ve en zayıf modelimiz. **Gövde, ana rotor, kuyruk rotoru ayrı**; yan kapı ayrıysa açılır yapar ve içini gösteririm |
| V2 | Zırhlı 4×4 (Kirpi / MRAP benzeri) | B | Üs ve meskûn mahal; tekerler ayrı |
| V3 | Ana muharebe tankı (Altay / Leopard 2 benzeri) | B | **Gövde, kule, namlu ayrı** (kod bunları döndürüyor) |
| V4 | Yanmış araç enkazı (sivil otomobil) | B | Meskûn mahal ön planı, sütre, içinden duman çıkarırım |
| V5 | Hafif taktik araç / askeri kamyon | C | Üs bölgesi dolgusu |

### Sütre, Oda 2 güvenli alan, TCCC nesneleri

| # | Model | Ö | Not |
|---|-------|---|-----|
| T1 | **Tek kum torbası** (dolu, hafif ezik) + 2 varyant | A | Tek torbadan istediğim biçimde duvar örerim (düz, L, yarım ay); hazır siperden çok daha esnek |
| T2 | Hazır kum torbası siperi (2 m düz, yarım ay) | B | T1 olmazsa yedek |
| T3 | **Turnike (CAT benzeri)**, sıhhiye çantası (açık ve kapalı), bandaj paketi | A | Yaralının yanında, eğitimin ta kendisi |
| T4 | **Katlanır askeri sedye** (açık) | A | Tahliye ve helikoptere taşıma |
| T5 | **Duman bombası** (silindir) | A | Helikopter iniş bölgesini işaretleme; renkli dumanı ben yaparım |
| T6 | Beton T-duvar (üs bariyeri), beton blok | B | Üs bölgesi |
| T7 | Gözetleme kulesi (ahşap ya da beton), nöbet kulübesi | B | Üs bölgesi |
| T8 | Yakıt varili, jeneratör, ISO konteyner | B | Üs dolgusu |
| T9 | Bayrak direği (bayrağı kumaş olarak ben dalgalandırırım) | B | |
| T10 | Yıkık duvar parçası, kerpiç duvar köşesi, beton moloz yığını, elektrik direği | B | Meskûn mahalde 3B zemin kapalı; bunlarla ön plan açılır |
| T11 | Kuru taş duvar (köy çiti), ahşap çit, saman balyası | C | Kırsal ön plan |
| T12 | Moloz parçaları: 6–8 küçük taş/beton/metal parça (her biri < 800 üçgen) | C | Patlamada fırlayan parçalar |

**Meshy'de yapma, ben bulurum/üretirim:** ağaçlar (yaprak kartı gerekir, Meshy'de top gibi çıkıyor; Eğirdir'e uygun
karaçam/kızılçam için CC0 ya da SpeedTree kaynağı ararım), dikenli tel / concertina (ince tel Meshy'de kopuyor,
prosedürel), kamuflaj ağı (saydam doku), helikopter iniş "H"si (zemin çıkartması).

## 2. Sesler

### Teknik şartlar

- **WAV 48 kHz, 24 bit**; nokta kaynak (bağırma, silah, telsiz) **mono**, ortam döngüsü **stereo**.
- **Kuru kayıt**: yankısız, müziksiz, sıkıştırmasız. Yakın/uzak, oda, dağ yankısı, ses düzeyi işini ben yaparım.
- Her repliği **2–3 kez**, farklı tonda; mümkünse **3–5 farklı kişi**. Ortam döngüleri en az 60 sn.

### İnsan sesi (Türkçe), en önemli eksik (şartname: bağırma/çağırma)

En iyisi okuldaki personelle telefona yakın, sessiz bir odada kayıt (gerçek komando sesi yapay zekâdan çok daha inandırıcı).
Yedek: ElevenLabs Türkçe ses (sakin cümlelerde iyi, bağırmada zayıf).

| Grup | Replikler (örnek) | Ö |
|------|-------------------|---|
| Temas | "Temas! Temas!", "Saat on ikiden ateş!", "Sağdan!", "Soldan!", "Siper al!", "Yere!" | A |
| Komuta | "Örtme ateşi!", "İleri!", "Geri çekil!", "Şarjör!", "Ateşi kes!", "Bomba!" | A |
| Yaralı | "Vuruldum!", "Yaralı var!", "Sıhhiye!", "Yardım edin!" + **inleme, acı çığlığı** (hafif, orta, ağır) | A |
| Sıhhiyeci | "Sakin ol, buradayım", "Turnike takıyorum", "Bana bak, uyuma!", "Nefes al" | A |
| Tahliye | "İniş bölgesi temiz!", "Sedyeyi getirin!", "Helikopter geliyor!", "Kaldır!", "Yürü yürü!" | A |
| Telsiz | "Kartal, burası Şahin, tamam", "Bir yaralı, acil tahliye, tamam", "Anlaşıldı, tamam" | B |
| Uzak | Aynı bağırmaların bir kısmı uzaktan duyulacak gibi, gerçekten uzaktan bağırılarak | B |

### Silah ve mermi (CC0 / telifsiz kütüphaneden; ben de ararım)

Bugünkü tek atışlar Mosin ve SKS, yani eski tüfekler. Modern otomatik silah sesi yok.

| # | Ses | Ö |
|---|-----|---|
| A1 | 7,62 piyade tüfeği: tek atış, 3–5'li seri, uzun seri; **yakın / orta / uzak**, açık arazi ve **dağ yankılı** | A |
| A2 | **Mermi vızıltısı ve "çat"** (ses hızını aşan mermi), 6–8 çeşit | A |
| A3 | Mermi çarpması: toprak, taş, metal, beton, her birinden 3–4 | A |
| A4 | Makineli tüfek uzun seri (yakın ve uzak) | B |
| A5 | Mekanik: şarjör değiştirme, kurma kolu, boş kovan düşmesi | C |

### Patlama ve ağır silah

| # | Ses | Ö |
|---|-----|---|
| P1 | **Havan: gelen ıslık + patlama** | A |
| P2 | El bombası (yakın ve orta) | A |
| P3 | Tank topu atışı (namlu ağzı) + uzak top | B |
| P4 | RPG: ateşleme, uçuş, patlama | B |
| P5 | Patlama sonrası toprak/moloz yağması, **kulak çınlaması** (yakın patlamada eğitimde çok etkili) | B |

### Araç, helikopter, ortam, efor

| # | Ses | Ö |
|---|-----|---|
| H1 | Helikopter: yakın türbin rölantisi, **kalkışta güç artışı**, rotorun yavaşlayıp durması, uzaktan geçiş (Doppler) | A |
| O1 | **Gök gürültüsü**: yakın çatlama ×3, uzak gürleme ×3 (şimşekle birlikte) | A |
| O2 | Ortam: üs bölgesi (jeneratör, uzak konuşma, araç), şiddetli yağmur, fırtına rüzgârı, kar sessizliği | A |
| O3 | Ortam: orman gecesi (baykuş, cırcır), uzak köy (köpek, horoz), dağ kartalı, yanan araç çıtırtısı | B |
| V1s | Tank motoru + palet döngüsü, zırhlı araç motoru | B |
| E1 | Efor/foley: **turnike cırt + sıkma**, sedye açma, duman bombası pimi + fısıltı, telsiz bip ("tamam" sonu) | B |
| E2 | Adım: çakıl, kar, çamur; sürünme | C |

**Ücretsiz kaynak önerisi:** Sonniss "GDC Game Audio Bundle" (her yıl ücretsiz, telifsiz, ticari kullanım serbest; silah,
patlama, helikopter, ortam dolu). Sen indirip klasörü verirsen ben ayıklar, keser, düzeyler, manifeste bağlarım. Freesound
CC0 aramasını ben de yapabilirim.

## 3. Hava ve efektler (kod işi, ben yaparım)

**3 Kasım durumu:** W1 (yeni panorama yerine gök maskesi + gök örtüsü), W2 (3B yağmur; sıçrama ve ıslak zemin yok),
W3 (şimşek: aydınlanma, DMX, gök gürültüsü; yıldırım çizgisi yok), W4 (3B kar ve tipi; zemin tozu ve nefes yok),
W5 (yükseklik sisi + akan kümeler; ışık huzmesi yok), W6 (akan bulut, kapalı havada güneş ve gölge; arazide bulut
gölgesi yok) yapıldı. Ayrıntı `docs/duvar-oynatici.md` "Hava".

| # | Eksik | Bugün | Yapılacak | Ö |
|---|-------|-------|-----------|---|
| W1 | **Hava panoramaları** | Yağmur/kar/sis güneşli gökyüzü panoramasının üstüne düşüyor; en büyük inandırıcılık sorunu bu | Her bölgeye kapalı / yağmurlu / sisli gök. Poly Haven CC0'da kapalı hava HDRI'ları var (ben indiririm); yoksa Skybox AI | A |
| W2 | **Yağmur** | Ekrana düz 2B çizgi, derinliksiz, duvar perspektifine uymuyor | 3B yağmur: yakın kalın/hızlı, uzak ince perde; rüzgârla eğim, zeminde sıçrama, **ıslak zemin** (koyulaşma + parlama), ufukta gri sağanak perdesi | A |
| W3 | **Şimşek** | Yok | Gökte çakma + sahnenin aydınlanması + DMX flaşı + mesafeye göre gecikmeli gök gürültüsü (O1) | A |
| W4 | **Kar** | Düz beyaz noktalar, hepsi aynı boyda | 3B kar: yakın büyük ve bulanık, uzak küçük; savrulma ve girdap, **tipi** (yatay kar, görüş düşer), zeminden kar tozu kalkması, figürlerde nefes buharı | A |
| W5 | **Sis** | Tüm ekranı eşit kaplayan renk geçişi ("beyaz perde") | Yükseklik sisi (vadide yoğun, tepeler açık), rüzgârla akan 3B sis kümeleri, mesafeye göre sise girip kaybolan figürler, sabah pusunda ışık huzmeleri | A |
| W6 | **Bulut** | Yalnız ekranı karartıyor | Gökte akan bulut katmanı, **arazide süzülen bulut gölgeleri**, güneş bulut arkasına girince ışığın ve gölgelerin yumuşaması | B |
| W7 | Rüzgâr | Bitkiler kıpırdamıyor | Ot, çalı, fidan rüzgâr yönü ve şiddetine göre sallanır; bayrak dalgalanır | B |
| W8 | Renkli duman (LZ işareti) | Yok | Yeşil/kırmızı/sarı duman, rüzgâra yatar; helikopter rotoruyla dağılır (T5 ile) | A |
| W9 | **Aydınlatma fişeği** (gece) | Yok | Paraşütle salınarak inen fişek, hareket eden gölgeler, söndükçe kararan sahne; gece eğitiminde çok etkili | B |
| W10 | Yanan araç / sürekli yangın | Patlamada kısa ateş var | V4 enkazından uzun süreli alev + kara duman | B |
| W11 | Gerçek VFX plakaları | Manifestte `patlama_yakin_1`, `asker_siper_ates`, `asker_yarali_yerde` kayıtlı ama dosyası yok; patlamalar parçacıkla | Alfa kanallı gerçek patlama/toz çekimleri (ücretsiz paket ya da çekim) | C |
| W12 | Yaralı altında kan izi | Yok | Zemine çıkartma (isteğe bağlı; eğitim birimine sorulmalı) | C |

## Önerilen sıra

1. **Sen:** F1 (komando) + Mixamo animasyonları → **Ben:** Mixamo iskelet uyarlaması, sahnede SWAT ile yan yana.
2. **Sen:** V1 (helikopter, rotorlar ayrı), S1 (tüfek), T1 (tek kum torbası), T3–T5 (turnike, sedye, duman bombası).
   **Ben:** aynı anda W1 + W2 + W3 (kapalı gök, 3B yağmur, şimşek), sonra W4 + W5.
3. **Sen:** Türkçe ses kaydı (yukarıdaki A satırları). **Ben:** silah/patlama/ortam seslerini CC0 kaynaktan toparlarım.
4. Kalan B ve C satırları.

Dosyaları `icerik/` altına değil, istediğin bir klasöre koyup yolunu söylemen yeter; adlandırma, dönüştürme, sıkıştırma
(Draco/KTX2) ve manifest satırları bende.
