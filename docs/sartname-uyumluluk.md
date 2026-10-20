# Şartname uyumluluk matrisi

Ön fizibilite raporu §2 tablosundaki maddelerin bu depoda nerede karşılandığı. "UE içerik"
sütunu Unreal projesinde üretilecek kısmı, "Bu depo" sütunu yazılım tarafını gösterir.

| No | Şartname maddesi | Bu depo | UE içerik | Durum |
|---|---|---|---|---|
| §1 | En az 3 duvara projeksiyon, sistem kontrol odasından yönetim | Panel + köprü; `unreal/nDisplay/uc-duvar.ndisplay` 3 viewport | nDisplay Root Actor | Yazılım hazır, saha ölçüleri bekleniyor |
| §2 | En az 5 bölge | `Bolge` tipi: meskûn mahal, ormanlık, dağlık, üs bölgesi, kırsal açık arazi; panelde tek tıkla geçiş | 5 streaming level | Yazılım hazır, içerik üretilecek |
| §3 | Yaz/kış, gece/gündüz, hava durumu | `OrtamAyarlari`: mevsim, saat, bulut, sis, yağış, rüzgâr; `OrtamAyarla` çağrısı | Parametrik gökyüzü/hava sistemi | Yazılım hazır |
| §4 | Patlama, gürültü, bağırma, çağırma | `EfektTetikle` (tür, şiddet, yön); panel düğmeleri | Niagara + MetaSound | Yazılım hazır |
| §5 | İzli mermi ses + görüntü | `IzliMermiAyarla`: çıkış noktası (3 duvar), yön, sıklık | NS_IzliMermi + ses | Yazılım hazır |
| §6 | Ortam ışığı senaryoya göre | Art-Net gönderici, gün ışığı hesabı, patlama flaşı, elle/otomatik seçimi | – (isteğe bağlı UE DMX) | Yazılım hazır, armatür kanal haritası bekleniyor |
| §7 | Oda 2 güvenli alan görüntüleri | `GuvenliAlanTipi`: kaya/sütre arkası, çukur, meskûn mahal içi; tek tıkla geçiş | 3 görüntü seti | Yazılım hazır |
| §8 | Helikopter yaklaşma/iniş, rotor sesi, toz, rüzgâr | `HelikopterDurumu`: yaklaşıyor/iniyor/yerde/kalkıyor; "tam dizi" düğmesi | Sequencer animasyonu, NS_RotorTozu | Yazılım hazır |
| §9 | Uzaktan patlama ve mermi sesi | `uzak_patlama`, `uzak_mermi_sesi` efektleri; mesafe ve yön ayarı, otomatik zayıflatma parametresi | Attenuation ayarlı sesler | Yazılım hazır |
| §10 | Çevrimdışı çalışma, Türkçe arayüz | Hiçbir dış bağlantı yok; tüm arayüz ve dokümantasyon Türkçe | – | Hazır |

## Test edilenler

- Art-Net ArtDmx paket yapısı (başlık, opcode, evren, uzunluk)
- Işık → DMX kanal dönüşümü ve gün ışığı eğrisi
- Senaryo motoru: sıralı tetikleme, duraklat/devam, durdur
- Durum deposu: değer sınırlama, Oda 2 uzak ses parametrelerinin otomatik doldurulması
- Panelin UE olmadan ("simülasyon" modu) uçtan uca çalışması

## Açık kalemler (saha keşfi / müşteri)

- Projektör sayısı, çözünürlük, yerleşim, warp/blend yöntemi (Risk: Yüksek)
- DMX armatür kanal haritası ve Art-Net kontrolcü IP'si
- Ses sistemi kanal sayısı ve yerleşimi (konumsal ses için)
- Bölge içeriklerinin görsel gerçekçilik düzeyi için eğitmen görüşmesi (Faz 2)
