# Şartname uyumluluk matrisi

Ön fizibilite raporu §2 tablosundaki maddelerin bu depoda nerede karşılandığı. "UE içerik"
sütunu Unreal projesinde üretilecek kısmı, "Bu depo" sütunu yazılım tarafını gösterir.
Örnek TCCC paketinde (bkz. `docs/ornek-calisma-inceleme.md`) hazır bulunan varlıklar son sütunda.

| No | Şartname maddesi | Bu depo | UE içerik | Durum | Örnekte (TCCC) |
|---|---|---|---|---|---|
| §1 | En az 3 duvara projeksiyon, sistem kontrol odasından yönetim | Panel + köprü; `unreal/nDisplay/uc-duvar.ndisplay` 3 viewport, `uc-duvar-onizleme.ndisplay` tek ekran önizleme | nDisplay Root Actor | Yazılım hazır, saha ölçüleri bekleniyor | nDisplay paketlenmemiş; kaynak projede açılacak |
| §2 | En az 5 bölge | `Bolge` tipi: meskûn mahal, ormanlık, dağlık, üs bölgesi, kırsal açık arazi; panelde tek tıkla geçiş | 5 streaming level | Yazılım hazır, içerik üretilecek | `CitySuburbs`, `Orman`, `Mountain_5` var; üs bölgesi ve kırsal açık arazi yok |
| §3 | Yaz/kış, gece/gündüz, hava durumu | `OrtamAyarlari`: mevsim, saat, bulut, sis, yağış, rüzgâr; `OrtamAyarla` çağrısı | Parametrik gökyüzü/hava sistemi | Yazılım hazır | Ultra Dynamic Sky 9.0B (tam parametrik) |
| §4 | Patlama, gürültü, bağırma, çağırma | `EfektTetikle` (tür, şiddet, yön); panel düğmeleri | Niagara + MetaSound | Yazılım hazır | El bombası, sis bombası, çatışma sesleri var; bağırma/çağırma sesleri eklenecek |
| §5 | İzli mermi ses + görüntü | `IzliMermiAyarla`: çıkış noktası (3 duvar), yön, sıklık | NS_IzliMermi + ses | Yazılım hazır | BallisticsVFX (namlu alevi, çarpma); izli mermi emitter'ı eklenecek |
| §6 | Ortam ışığı senaryoya göre | Art-Net gönderici, gün ışığı hesabı, patlama flaşı, elle/otomatik seçimi; `araclar/artnet-dinle.mjs` ile donanımsız test | – (isteğe bağlı UE DMX) | Yazılım hazır, armatür kanal haritası bekleniyor | – |
| §7 | Oda 2 güvenli alan görüntüleri | `GuvenliAlanTipi`: kaya/sütre arkası, çukur, meskûn mahal içi; tek tıkla geçiş | 3 görüntü seti | Yazılım hazır | Yok; üretilecek |
| §8 | Helikopter yaklaşma/iniş, rotor sesi, toz, rüzgâr | `HelikopterDurumu`: yaklaşıyor/iniyor/yerde/kalkıyor; "tam dizi" düğmesi | Sequencer animasyonu, NS_RotorTozu | Yazılım hazır | UH-60 modeli, `HelicopterArrive` sekansı, rotor tozu Niagara'sı var |
| §9 | Uzaktan patlama ve mermi sesi | `uzak_patlama`, `uzak_mermi_sesi` efektleri; mesafe ve yön ayarı, otomatik zayıflatma parametresi | Attenuation ayarlı sesler | Yazılım hazır | Silah sesi paketleri var; attenuation ayarlanacak |
| §10 | Çevrimdışı çalışma, Türkçe arayüz | Hiçbir dış bağlantı yok; tüm arayüz ve dokümantasyon Türkçe; `.env` ile saha ayarı | – | Hazır | – |

## Rapor §3 teknik mimari maddeleri

| Madde | Bu depo |
|---|---|
| Efekt ve senaryo motoru: zaman çizelgesi veya eğitmen tetiklemesi, ön ayarların tekrar kullanımı | Senaryo motoru (`senaryo.ts`), panelde senaryo editörü (adım ekle, mevcut ortamı adım yap), "Şimdi tetikle", ön ayar kaydet/yükle |
| Kontrol paneli React, Türkçe, Remote Control API ile bağlanır | `apps/kontrol-paneli` + `unreal.ts`; panelde "Unreal'a Giden Komutlar" canlı listesi (UE ekibi için) |
| Ağ: kapalı yerel ağ, taşınabilir güncelleme | Köprü dış adrese çıkmaz; `node_modules` ile birlikte kopyalanır; IP planı `docs/donanim-onerileri.md` §7 |
| Demo (kaynak proje gelene kadar) | Panelden örnek paketi başlatma (`ORNEK_PAKET`), `araclar/ornek-tccc-genis-ekran.bat`, `ornek-kisisellestir.ps1` |

## Test edilenler

- Art-Net ArtDmx paket yapısı (başlık, opcode, evren, uzunluk)
- Işık → DMX kanal dönüşümü ve gün ışığı eğrisi
- Senaryo motoru: sıralı tetikleme, duraklat/devam, durdur
- Durum deposu: değer sınırlama, Oda 2 uzak ses parametrelerinin otomatik doldurulması
- Örnek paket başlatıcı: komut satırı üretimi (pencere/tam ekran, FOV parametresi, tırnaklı ek parametreler), süreç başlat/durdur
- `.env` okuyucu: yorum satırları, tırnaklar, var olan değişkenin korunması
- Panelin UE olmadan ("simülasyon" modu) uçtan uca çalışması: bölge/ortam/efekt/senaryo/ön ayar/örnek başlatma akışı tarayıcıda
- Örnek TCCC paketinin komut satırı parametreleriyle açılması (Windows, yerel oturum)

## Açık kalemler (saha keşfi / müşteri)

- **Kaynak proje** (TCCC `.uproject` + Content + Config): nDisplay, Remote Control ve içerik düzenlemesi için şart. Talep belgesi: `docs/kaynak-proje-talebi.md`
- Render bilgisayarı (RTX sınıfı, 16 GB VRAM) ve 3 projektör: `docs/donanim-onerileri.md`
- Projektör sayısı, çözünürlük, yerleşim, warp/blend yöntemi (Risk: Yüksek)
- DMX armatür kanal haritası ve Art-Net kontrolcü IP'si
- Ses sistemi kanal sayısı ve yerleşimi (konumsal ses için)
- Bölge içeriklerinin görsel gerçekçilik düzeyi için eğitmen görüşmesi (Faz 2)
