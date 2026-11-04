# Şartname analizi ve çözüm yaklaşımı (motor bağımsız)

Kaynak: İdare şartnamesi, sayfa 11 (fotoğraf, 21 Ekim 2026). Bu belge, daha önceki ön fizibilite
raporunun (Grit Teknoloji) yorumundan bağımsız olarak **idarenin kendi cümlelerini** esas alır;
Muayene Kabul bu cümleler üzerinden yapılacaktır.

## 1. Şartname metni (transkript)

> **1. Ateş Altında Yaralıya Müdahale Simülasyon Alanı:** 1 adet olacak, harekât esnasında
> yaralanmış olan personele yönelik olarak gerçekleştirilecek ilk yardım ve hayat kurtarma
> faaliyetlerine (hafif ve ağır silah yaralanmaları ve travmalar vs.) olanak sağlayacak bir oda
> olacaktır. Kontrol odasından görüntü yansıtma sistemi ile en az 3 duvara TSK personelinin görev
> yaptığı gerçek zorlu arazi şartlarının (en az 5 bölge, bunlar içerisinde Meskun Mahal, Ormanlık
> Alan, Dağlık Alan, Üs Bölgesi bulunacak, her bir bölgenin yaz-kış, gece-gündüz şartları
> sağlanacak şekilde olacaktır), çeşitli zaman dilimleri (gece/gündüz) ile iklim/hava şartlarının
> değiştirilebilecek şekilde görüntüsü yansıtılabilecektir. Kontrol odasından ortama ışık ve ses
> sistemi ile patlama, gürültü, bağırma/çağırma sesleri ve izli mermi ses ve görüntü efektleri
> verilebilecektir.
>
> **1.2. Taktik Güvenli ve Tahliye Alanında Yaralıya Müdahale Simülasyon Alanı:** 1 adet olacak,
> yaralının ateş altından güvenli ortama alındığında gerçekleştirilecek ilkyardım ve hayat kurtarma
> faaliyetlerinin ve tahliye bölgesinde yapılacak faaliyetlerin yapılmasına olanak sağlayacak bir
> oda olacaktır. Kontrol odasından ışık, ses ve görüntü efektleri aracılığı ile çeşitli güvenli
> alan efektleri (gerçek operasyonel bölge ve meskun mahal içi görüntüleri, kaya ve herhangi bir
> sütre arkası görüntüleri, çukur veya çeşitli taktik güvenli alan görüntüleri) verilebilecektir.
> Tahliye maksadıyla gerçek alanlara inen helikopter görüntü, ses ve efektleri verilebilecektir.
> Yine uzaktan gelen patlama, gürültü, bağırma/çağırma sesleri, mermi sesleri verilebilecektir.

## 2. Metinden çıkan gereksinimler ve "okuma" notları

| # | İdarenin cümlesi | Ne istiyor | Ne istemiyor / serbest bıraktığı |
|---|---|---|---|
| G1 | "görüntü yansıtma sistemi ile en az 3 duvara" | Projeksiyon, ≥3 duvar | Projektör tipi, çözünürlük, oyun motoru belirtilmemiş |
| G2 | "gerçek zorlu arazi şartlarının … görüntüsü" | **Görüntü** (görsel inandırıcılık) | "3 boyutlu", "gerçek zamanlı", "etkileşimli", "kamera hareketi" **yok**. Gerçek çekim video da, 3B render da kabul edilebilir |
| G3 | "en az 5 bölge; Meskun Mahal, Ormanlık, Dağlık, Üs Bölgesi bulunacak" | 4 adı verilen + en az 1 serbest bölge | 5. bölge bizim seçimimiz (kırsal açık arazi / kıyı / tepe) |
| G4 | "her bir bölgenin yaz-kış, gece-gündüz şartları" | Her bölge için 4 temel kombinasyon | Ara mevsimler istenmiyor |
| G5 | "çeşitli zaman dilimleri (gece/gündüz) ile iklim/hava şartlarının değiştirilebilecek" | Kontrol odasından değiştirilebilir zaman ve hava | Hava türleri sayılmamış; yağmur, kar, sis, bulut makul asgari |
| G6 | "ışık ve ses sistemi ile patlama, gürültü, bağırma/çağırma sesleri" | Odaya **ışık ve ses** efektleri | Işığın DMX olması vb. belirtilmemiş; "ışık sistemi" odadaki armatürleri kapsar |
| G7 | "izli mermi ses ve görüntü efektleri" | İzli mermi hem görüntüde hem seste | Yön/sıklık istenmemiş (bizim artı değerimiz) |
| G8 | Oda 2: "operasyonel bölge ve meskun mahal içi, kaya/sütre arkası, çukur veya çeşitli taktik güvenli alan görüntüleri" | En az 4 güvenli alan görüntü seti | Zaman/hava koşulu Oda 2 için **istenmemiş** (ama Oda 1 altyapısı bedava sağlar) |
| G9 | "gerçek alanlara inen helikopter görüntü, ses ve efektleri" | İniş yapan helikopter: görüntü + ses + efekt (toz/rüzgâr) | Kalkış, yaklaşma dizisi istenmemiş (artı değer) |
| G10 | "uzaktan gelen patlama, gürültü, bağırma/çağırma, mermi sesleri" | Oda 2'de uzak sesler | Mesafe/yön kontrolü istenmemiş (artı değer) |
| G11 | "Kontrol odasından" (her iki odada) | Tek kontrol noktası | Kontrol arayüzünün biçimi serbest (panelimiz uygun) |

Özet: Şartname **görsel-işitsel ortam** istiyor; **oyun motoru, gerçek zamanlı render, 3B etkileşim
istemiyor**. Fizibilite raporu bunu "UE5 + nDisplay + Niagara" ile çözmeyi önermiş; bu *bir* yol,
tek yol değil. Elimizdeki panel + köprü mimarisi motor bağımsızdır: panel ne gösterildiğini değil
"ne istendiğini" söyler; görüntüyü üreten uç değiştirilebilir.

## 3. Üç çözüm yolu

| Ölçüt | A) Gerçek zamanlı 3B (UE5 + nDisplay) | B) Medya sunucusu: önceden üretilmiş döngüler + katmanlı efektler | C) Gerçek çekim 360°/panoramik video + katmanlı efektler |
|---|---|---|---|
| Görsel inandırıcılık | Yüksek (Lumen, Nanite) ama GPU'ya bağlı | Yüksek: aynı sahneler **çevrimdışı** en yüksek kalitede render edilir (saatler sürebilir, sorun değil) | En yüksek "gerçek" hissi; ama sahada çekim, izin, mevsim/gece için çoklu çekim gerekir |
| Zaman/hava parametrik mi | Tam parametrik (saat 0–24, bulut %) | Kademeli: gündüz / alacakaranlık / gece × yaz / kış döngüleri; hava **katman** olarak (yağmur, kar, sis) her döngüye bindirilir; geçişler çapraz geçiş (crossfade) | Kademeli; kış ve gece için ayrı çekim şart |
| İzli mermi, patlama | Niagara (iyi) | WebGL parçacık (izli mermi yön/sıklık tam parametrik) + alfa kanallı efekt videoları (patlama, toz) | Aynı (B) |
| Helikopter inişi | Sequencer | Hazır render dizisi (45–60 sn) veya alfa video katmanı | Gerçek çekim (maliyetli) veya render katmanı |
| Donanım (oda başına) | RTX 4080/5080 sınıfı render PC (≈3.000 $) | Herhangi bir 3 çıkışlı PC (RTX 4060 / Arc, ≈1.000 $); video çözme yükü düşük | (B) ile aynı |
| Bağımlılık | TCCC **kaynak projesi** + Fab lisansları + UE uzmanlığı; kaynak gelmezse çalışmaz | Yok: içerik dosyadır (MP4/WebM); üretim aracı serbest (UE, Blender, Unity, gerçek çekim karışık olabilir) | Çekim ekibi, arazi izinleri |
| 7/24 güvenilirlik | Orta (sürücü, shader derleme, PSO takılmaları, ısı) | Yüksek (video oynatıcı + tarayıcı kiosk; yeniden başlatma saniyeler) | Yüksek |
| Kabul riski | Kaynak proje yoksa **yüksek**; performans gösterimi gerekir | Düşük: her şartname cümlesi için hazır klip/efekt gösterilir | Düşük–orta (çekim takvimi) |
| İçerik ekleme/güncelleme | UE bilen biri gerekir, yeniden paketleme | Yeni klip kopyalanır, manifest'e satır eklenir | Yeni çekim |
| Geliştirme süresi (yazılım) | Panel hazır; UE tarafı kaynak gelince 6–8 hafta | Panel hazır; oynatıcı 3–4 hafta; içerik üretimi paralel | (B) + çekim |

### Öneri: **B'yi omurga yap, A'yı içerik üretim aracı olarak kullan (hibrit)**

- **Çalışma zamanı** (sahadaki bilgisayar): bizim "Duvar Oynatıcı" (web tabanlı, tarayıcı kiosk
  modunda tam ekran, 3 duvar yan yana). Video döngüleri + hava katmanları + WebGL efektler +
  konumsal ses. Köprü sunucusu bugün UE'ye gönderdiği komutları aynen oynatıcıya gönderir; panel
  **değişmez**.
- **İçerik üretimi** (ofiste, bir kez): sahneler UE5'te (TCCC kaynak projesi gelirse ondan, gelmezse
  Fab/Megascans varlıklarıyla kendi sahnelerimizden) veya Blender'da **çevrimdışı** render edilir:
  3 duvar için 3 kamera, 5760×1080, 60–90 sn kusursuz döngü. Render süresi önemsiz, donanım
  önemsiz, kalite en üst düzey. Gerçek çekim klipler (ör. gerçek helikopter inişi, gerçek dağ
  manzarası) aynı oynatıcıda karışık kullanılabilir.
- **Kaynak proje gelirse** A yolu kapanmaz: köprüdeki `UNREAL_MOD=gercek` ile aynı panel UE'yi
  sürer. İki yol aynı anda ayakta tutulur; kabulde hangisi daha güçlüyse o gösterilir.

Neden "en iyi": şartnamenin her cümlesini **garantili** karşılar (klip hazır → gösterilir), vendor
ve donanım bağımlılığını kaldırır, oda başına donanım maliyetini üçte bire indirir, bakımı eğitmen
seviyesine indirir (klip kopyala), ve bugüne kadar yazdığımız panel/köprü/ışık kodunun tamamı
olduğu gibi kullanılır.

## 4. İçerik ihtiyacı (üretilecek varlık listesi)

### 4.1 Oda 1 – arazi döngüleri

5 bölge × 2 mevsim × 3 zaman dilimi = **30 temel döngü** (her biri 60–90 sn, 5760×1080, kusursuz
döngü, 3 duvar perspektifi doğru). Zaman dilimleri: gündüz, alacakaranlık (şafak/gün batımı), gece.
Şartname asgari "gece/gündüz" der; alacakaranlık, panel saat kaydırıcısındaki geçişi doğal kılar.

| Bölge | Not |
|---|---|
| Meskûn Mahal | Türkiye tipi yerleşim (kerpiç/beton, dar sokak); TCCC'deki `CitySuburbs`/HAVSIM varlıkları kullanılabilir |
| Ormanlık Alan | Karadeniz/Toros tipi orman |
| Dağlık Alan | Kayalık, karlı zirve (kış), yaz yaylası |
| Üs Bölgesi | Hesco bariyer, konteyner, kule, helikopter pisti (Oda 2 ile ortak) |
| 5. bölge (önerilen: Kırsal Açık Arazi / sınır hattı) | Düz tarla, taş duvar, uzak köy |

Hava katmanları (alfa kanallı, her döngüye bindirilir, **bölgeden bağımsız**): yağmur hafif/şiddetli,
kar, sis (yoğunluk ayarlı), bulut gölgesi/kararma. Toplam 5–6 katman. Rüzgâr: ağaç/ot hareketi
döngülerde zaten var; şiddeti ses katmanıyla verilir.

### 4.2 Efekt varlıkları (Oda 1 ve 2 ortak)

| Efekt | Üretim | Parametre |
|---|---|---|
| Patlama (yakın) | Alfa kanallı video, 3 varyant (toprak, beton, araç) | Duvar/konum, şiddet (ölçek + ışık flaşı) |
| Toz / duman bulutu | Alfa video, 2 varyant | Duvar, süre |
| İzli mermi | **Prosedürel WebGL** (çizgi + parlama + iz) | Çıkış duvarı, açı, sıklık, renk; tamamen panelden |
| Mermi çarpma (toz kalkması) | Alfa video, küçük | Konum |
| Helikopter inişi | 45–60 sn render dizisi: yaklaşma, iniş, rotor tozu; her Oda 2 sahnesi için 1 | Başlat/kalkış |
| Işık flaşı | DMX (var) | Şiddet |

### 4.3 Oda 2 – güvenli alan sahneleri

4 sahne × 2 zaman dilimi (gündüz/gece) = **8 döngü** + her sahne için helikopter iniş dizisi (4):
operasyonel bölge (üs / açık alan), meskûn mahal içi (bina içi, pencereden sokak), kaya/sütre arkası,
çukur/hendek. Şartname Oda 2 için hava istemiyor; Oda 1 katmanları istenirse bedava uygulanır.

### 4.4 Ses kütüphanesi

| Grup | İçerik | Kaynak |
|---|---|---|
| Ortam | 5 bölge × gündüz/gece × yaz/kış ambiyans döngüsü (rüzgâr, kuş, böcek, şehir) | Kütüphane + kayıt |
| Çatışma | Piyade tüfeği tek/seri, makineli, uzak çatışma döngüsü, sekme, vızıltı | Kütüphane (lisanslı) |
| Patlama | Yakın (3), orta, uzak (3), yankılı dağ varyantı | Kütüphane |
| **Bağırma / çağırma (Türkçe)** | "Yaralı var!", "Sıhhiye!", "Siper al!", "Geri çekil!", acı/inleme, komutlar; en az 30 kayıt, 3–4 farklı ses | **Stüdyo kaydı** (askerî danışmanla metin), kütüphanede yok |
| Helikopter | Yaklaşma, iniş, rölanti, kalkış (UH-60/Cougar benzeri) | Kütüphane |
| Hava | Yağmur, dolu, kar rüzgârı, gök gürültüsü | Kütüphane |

Konumsal yerleşim: 4 hoparlör (ön sol/sağ, arka sol/sağ) + subwoofer; patlama ve mermi sesleri
panelden verilen yöne göre panlanır; uzak sesler alçak geçiren filtre + yankı ile uzaklaştırılır.

## 5. Donanım ihtiyacı (iki oda + kontrol odası)

| Kalem | Adet | Not |
|---|---|---|
| Oynatıcı PC (3 video çıkışı, 16 GB RAM, RTX 4060 sınıfı veya Intel Arc, NVMe) | 2 (oda başına 1) | Video çözme + WebGL; render PC gerekmez. Kontrol PC ile aynı olabilir ama ayrı önerilir |
| Projektör (lazer, 1080p/WUXGA, ≥4000 lm, kısa mesafe) | 6 (oda başına 3) | `docs/donanim-onerileri.md` §4; U-duvar için kısa mesafe şart |
| Askı, HDMI/DP aktif kablo, adaptör | 6 set | 10 m üstü aktif optik kablo |
| Ses: 4 hoparlör + subwoofer + 5.1 alıcı veya 6 kanal USB ses kartı | 2 set | Konumsal ses için en az 4 kanal |
| DMX: Art-Net node + 4–6 RGBW PAR + 1–2 strobe + (isteğe bağlı) haze makinesi | 2 set | Köprü Art-Net üretiyor; "ışık sistemi" cümlesi bununla karşılanır |
| Ağ: gigabit switch, internetsiz Wi-Fi (tablet) | 1 | Kapalı ağ |
| Eğitmen tableti (10–12", Chrome) + kontrol odası PC | 1 + 1 | Panel tarayıcıda |
| UPS | 2–3 | Oynatıcı ve projektör için |
| Oda hazırlığı | 2 oda | Mat açık gri projeksiyon boyası, karartma, akustik yutucu, kablo kanalı |

Kabaca: donanım 15–20 bin $ (iki oda, KDV hariç); UE gerçek zamanlı yolda bunun üstüne 2 × 3.000 $
render PC ve ekstra soğutma gelirdi.

## 6. Yazılım: var olan + eklenecek

| Bileşen | Durum | Yapılacak |
|---|---|---|
| Kontrol paneli | Hazır | Değişiklik yok; "zaman dilimi" kaydırıcısı oynatıcıda 3 kademeye eşlenir |
| Köprü sunucusu | Hazır | Hedef soyutlaması: `HEDEF=unreal` (Remote Control) veya `HEDEF=oynatici` (WebSocket). Aynı fonksiyon adları |
| **Duvar Oynatıcı** (`apps/duvar-oynatici`) | **Yeni** | Tarayıcı kiosk; 3 duvar; video katmanları (temel döngü + hava + efekt), çapraz geçiş; WebGL izli mermi/parlama; Web Audio konumsal ses; köprüden WS komutları; içerik manifesti (`icerik/manifest.json`) |
| İçerik paketi | Yeni | `icerik/` klasörü: bölge/mevsim/zaman döngüleri, katmanlar, sesler; manifest ile eşleme; kopyala-çalıştır |
| Kiosk başlatıcı | Yeni | `oynatici-baslat.bat`: Chrome `--kiosk --window-size=5760,1080 --window-position=0,0 --autoplay-policy=no-user-gesture-required`; çökme izleyici (watchdog) |
| İçerik üretim hattı | Yeni (ofis) | UE Movie Render Queue / Blender: 3 kamera rig, döngü kesme, alfa efekt render; ses düzenleme |
| Kabul test betiği | Yeni | Panelden tüm matrisi sırayla oynatan "kabul senaryosu" (şartname maddesi → klip) |

Oynatıcı için doğrulanmış teknik notlar: Chrome 3×1080p H.264/H.265 donanım çözme sorunsuz; alfa
kanallı efekt için WebM (VP9 alpha) veya "ayrı maske video" yöntemi; WebGL ile 5760×1080'de 60 FPS
parçacık kolay; Web Audio `PannerNode` ile 4–6 kanal çıkış (5.1 cihaz seçiliyken) mümkün.

## 7. Muayene Kabul test matrisi (taslak)

| Şartname maddesi | Test adımı (panelden) | Beklenen |
|---|---|---|
| ≥3 duvara projeksiyon | Herhangi bir bölge aç | 3 duvarda kesintisiz, perspektifi doğru görüntü |
| 5 bölge (4 adlı + 1) | Bölge düğmelerine sırayla bas | Her biri 2 sn içinde geçer |
| Yaz-kış, gece-gündüz (her bölge) | 5 bölge × 4 kombinasyon düğmesi | 20 farklı görüntü |
| Zaman dilimi değişimi | Saat kaydırıcısını gündüz → gece çek | Alacakaranlık üzerinden yumuşak geçiş |
| İklim/hava değişimi | Yağmur, kar, sis, bulut seç | Katman görünür + ses + ışık kararması |
| Patlama (ışık + ses) | "Patlama" düğmesi | Duvarda patlama, odada flaş, konumsal ses |
| Gürültü, bağırma/çağırma | Düğmeler | Türkçe kayıtlar, yönlü |
| İzli mermi ses + görüntü | İzli mermi aç, duvar/yön/sıklık değiştir | Görüntüde izler, eş zamanlı vızıltı |
| Oda 2: 4 güvenli alan görüntüsü | Güvenli alan düğmeleri | Operasyonel bölge, meskûn mahal içi, kaya/sütre, çukur |
| Helikopter iniş (görüntü, ses, efekt) | "Yaklaş → İn" | Yaklaşma, iniş, rotor sesi, toz, ışık titremesi |
| Uzak patlama, gürültü, bağırma, mermi | Oda 2 uzak ses düğmeleri; mesafe/yön değiştir | Zayıflatılmış, yönlü sesler |
| Kontrol odasından yönetim | Tüm testler kontrol odasındaki tablet/PC'den | Odaya girmeden |

## 8. Yol haritası

| Faz | Süre | Çıktı |
|---|---|---|
| 0. Oynatıcı prototipi | 2–3 hafta | `apps/duvar-oynatici`: yer tutucu/ücretsiz kliplerle 3 duvar, hava katmanı, WebGL izli mermi, ses; panelden uçtan uca gösterim (dizüstü + 1 ekran bile yeter) |
| 1. İçerik üretimi (paralel) | 6–8 hafta | 30 + 8 döngü, efekt kütüphanesi, Türkçe ses kayıtları, helikopter dizileri |
| 2. Entegrasyon | 2 hafta | Manifest, çapraz geçişler, ışık senaryoları, kabul senaryosu |
| 3. Saha kurulumu | 2 hafta | Projektör hizalama, ses yerleşimi, DMX adresleme, kiosk/otomatik açılış, eğitim |
| 4. Muayene Kabul | 1 hafta | Test matrisi birlikte koşulur |

Toplam ≈ 3,5–4 ay; fizibilite raporundaki 15 haftalık planla uyumlu, ama kritik yol artık "kaynak
proje gelecek mi" değil, "içerik üretimi".

## 9. Riskler ve karşılıkları

| Risk | Karşılık |
|---|---|
| Render edilmiş döngülerde "tekrar" hissi | 60–90 sn döngü + rastgele başlangıç + hava katmanları + ses varyasyonu |
| U-şekilli duvarda köşe kırılması | Döngüler 3 kameralı rig ile duvar açılarına göre render edilir (nDisplay'in çevrimdışı eşdeğeri); gerçek çekimde 360° kamera + equirectangular → 3 perspektif dönüşümü (WebGL) |
| Alfa video performansı | VP9 alpha veya maske video; 1080p katman yeterli, ölçeklenir |
| Türkçe ses kayıtları | Askerî danışman + stüdyo; 1 gün kayıt |
| Projektör gölgesi (eğitmen/er duvara yakın) | Kısa mesafe projektör, tavan askı |
| "Gerçek" kelimesinin kabulde yoruma açık olması | Kabul öncesi idareyle örnek klip onayı (Faz 1 ortasında ara gösterim, fizibilitedeki risk önlemiyle aynı) |

## 10. Karar bekleyen noktalar

1. Çalışma zamanı: **hibrit (öneri)** mi, yalnız UE mi?
2. İçerik kaynağı: kendi render hattımız mı, TCCC kaynak projesi mi (gelirse ikisi birlikte), gerçek çekim ne kadar?
3. Duvar geometrisi: düz tek duvar mı, U şeklinde 3 duvar mı (projektör ve render rig'i buna göre)?
4. 5. bölge seçimi ve Oda 2 için hava desteği istenip istenmediği.
5. Bütçe tavanı (donanım + içerik üretimi + ses kaydı).
