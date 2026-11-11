# Kaynak proje talebi (örneği yapan firmadan ne, nasıl istenecek)

## Masaüstündeki `Windows` klasörü neden yetmiyor?

O klasör **paketlenmiş oyun** (cooked build): Blueprint'ler derlenmiş, tüm varlıklar
`pakchunk0-Windows.pak/.ucas` içine sıkıştırılmış, Unreal Editor ile açılamaz. Üzerinde
yalnızca komut satırı, ini ve splash gibi dış dosyalarla oynanabiliyor (bkz. inceleme §10).
Panel entegrasyonu (Remote Control), 3 projektör (nDisplay), menü/efekt değişikliği ve
performans düzenlemesi için editörde açılabilen **kaynak proje** gerekir: geliştiricinin
bilgisayarındaki `TCCC` proje klasörü.

Kaynak proje = şu klasör yapısı (yaklaşık 20–60 GB):

```
TCCC/
  TCCC.uproject          ← proje tanımı (zorunlu)
  Config/                ← DefaultEngine.ini, DefaultGame.ini, DefaultInput.ini ...
  Content/               ← .uasset / .umap (pişmemiş, editörde düzenlenebilir)
  Plugins/               ← projeye özel eklentiler (varsa)
  Source/                ← (Blueprint-only projede yoktur; yoksa sorun değil)
```

`Saved/`, `Intermediate/`, `DerivedDataCache/`, `Binaries/` klasörleri **gerekmez** (yeniden üretilir).

## Talep listesi (hepsi tek seferde)

| # | Ne | Neden | Öncelik |
|---|---|---|---|
| 1 | Kaynak proje klasörü (`TCCC.uproject` + `Config` + `Content` + `Plugins`) | Her şeyin temeli | Zorunlu |
| 2 | Unreal sürümü ve türü: 5.5.4 Launcher mı, kaynak derlemesi mi; motorda değişiklik var mı | Aynı sürümle açılmalı; özel motor varsa o da gerekir | Zorunlu |
| 3 | Üçüncü parti varlık listesi + Fab/Marketplace bağlantıları + hangi hesapla alındığı (Ultra Dynamic Sky, BallisticsVFX, GrenadePack, HAVSIM paketleri, UH-60, Kirpi, Modular Soldier, DBK, KitBash3D/Cargo, ses paketleri) | Lisanslar alıcı hesaba bağlı; geliştirmeyi biz sürdüreceksek bize de lisans gerekebilir, bütçeyi etkiler | Zorunlu |
| 4 | Fikri mülkiyet / kullanım izni yazılı: projeyi değiştirme, okula teslim etme, "FORA GRUP" marka ve logolarının durumu | Sonradan anlaşmazlık olmasın | Zorunlu |
| 5 | Paketleme yöntemi: Development/Shipping, kullanılan komut veya ayarlar, bilinen paketleme sorunları | Aynı sonucu üretebilmek için | Yüksek |
| 6 | Kısa teknik not: harita listesi, efektlerin nasıl tetiklendiği (hangi Blueprint/fonksiyon), menü akışı, tuş/kontrol listesi, AI asker davranışı, zamanlayıcılar | Panel fonksiyonlarını (OdaSec, BolgeYukle, OrtamAyarla, EfektTetikle...) doğru yere bağlamak için | Yüksek |
| 7 | Ham kaynaklar: logo/afiş (PNG/SVG), UI fontu ve lisansı, kendi yaptıkları model/doku/ses dosyaları (FBX, WAV, PSD) | Marka ve içerik değişikliği için | Orta |
| 8 | Sürüm geçmişi (git/Perforce/SVN deposu) varsa | Kim neyi neden değiştirmiş; geri dönüş | Orta |
| 9 | Test ettikleri donanım: ekran kartı, çözünürlük (ayar dosyasında 3000×500 ve 1920×1080 görülüyor), hangi FPS | Performans beklentisi ve hedef | Orta |
| 10 | Bilinen hatalar, eksikler, "V1B" sürüm notu, yol haritası | Çift iş yapmamak | Düşük |
| 11 | 1–2 saatlik devir toplantısı + soru sorabileceğimiz bir geliştirici iletişimi | Blueprint mantığı için en hızlı yol | Yüksek |

İstenmeyecekler: paketlenmiş yeni sürüm (elimizde var), `Saved`/`Intermediate`/`DDC` klasörleri.

## Teslim biçimi

- Harici SSD (1 TB) veya kurum içi dosya paylaşımı; zip yerine klasörün kendisi (uzun yol adları zip'te bozulabilir).
- Yanında `SHA256` özeti veya dosya sayısı/boyut bilgisi (eksik kopya anlaşılsın).
- Teslim öncesi kendilerinde doğrulama: proje temiz bir bilgisayarda UE 5.5.4 ile açılıyor mu,
  eksik varlık uyarısı veriyor mu (Fab varlıkları o hesaptan yeniden indirilmesi gerekiyorsa not düşsünler).
- Kaynak projeyi **açmak için** bizim tarafta: Unreal Engine 5.5.4 (Epic Games Launcher), ~100 GB boş disk,
  tercihen RTX sınıfı ekran kartı (GTX 1650 ile editör açılır ama Lumen sahneleri çok yavaş olur).

## Hazır mesaj (kopyala-gönder)

> Merhaba,
>
> Elimizdeki paketlenmiş sürüm (TCCC, UE 5.5.4, Development, "OCTAGON 2025 V1B") üzerinde incelememizi
> tamamladık. Projeyi 3 projektörlü duvar simülasyonu olarak sürdürebilmek için (nDisplay, Remote Control
> ile kontrol paneli entegrasyonu, performans ve içerik düzenlemeleri) paketlenmiş sürüm yetmiyor; Unreal
> Editor'de açılabilen kaynak projeye ihtiyacımız var. Her şeyi tek seferde tamamlayabilmek için aşağıdakileri
> rica ediyoruz:
>
> 1. Kaynak proje klasörü: `TCCC.uproject`, `Config`, `Content`, `Plugins` (Saved/Intermediate/DDC gerekmez).
> 2. Kullandığınız Unreal sürümü ve türü (5.5.4 Launcher sürümü mü, kaynaktan derleme mi; motorda değişiklik var mı).
> 3. Projedeki üçüncü parti varlıkların listesi, Fab/Marketplace bağlantıları ve hangi hesapla alındığı
>    (Ultra Dynamic Sky, BallisticsVFX, GrenadePack, HAVSIM paketleri, UH-60, Kirpi, Modular Soldier, DBK,
>    KitBash3D/Cargo, ses paketleri vb.). Lisans tarafını netleştirip gerekirse kendi hesabımıza alacağız.
> 4. Projeyi değiştirme ve kuruma teslim etme konusunda yazılı kullanım izni; FORA GRUP marka/logo kullanımına
>    ilişkin beklentiniz.
> 5. Paketleme yönteminiz (Development/Shipping, kullandığınız ayar veya komut) ve bilinen paketleme sorunları.
> 6. Kısa bir teknik not: harita listesi, efektlerin hangi Blueprint/fonksiyonla tetiklendiği, menü akışı,
>    kontrol tuşları, AI asker davranışı ve zamanlayıcılar.
> 7. Kendi ürettiğiniz ham kaynaklar: logo/afiş dosyaları, UI fontu ve lisansı, model/doku/ses kaynak dosyaları.
> 8. Varsa sürüm geçmişi (git/Perforce/SVN).
> 9. Test ettiğiniz donanım (ekran kartı, çözünürlük) ve aldığınız kare hızı.
> 10. Bilinen hatalar, eksikler ve V1B sürüm notları.
>
> Teslim için harici bir SSD veya dosya paylaşımı uygundur; zip yerine klasörün kendisi ve yanında dosya
> sayısı/boyut bilgisi olursa eksik kopyayı hemen fark ederiz. Göndermeden önce projenin temiz bir
> bilgisayarda UE 5.5.4 ile açıldığını ve eksik varlık uyarısı vermediğini kontrol etmenizi rica ederiz.
> Ayrıca Blueprint mantığını hızlıca devralmak için 1–2 saatlik bir devir görüşmesi ve sonrasında soru
> sorabileceğimiz bir geliştirici iletişimi bizim için çok değerli olur.
>
> Teşekkürler.
