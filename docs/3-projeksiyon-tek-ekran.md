# Tek ekranı 3 projeksiyona yayma

Üç duvara (sol – orta – sağ) tek bir sahneyi kesintisiz yaymanın üç yolu vardır. Projede
**Yöntem 1 (nDisplay)** hedeflenir; Yöntem 2 hızlı demo/prototip için, Yöntem 3 ise harici
warp cihazı olan sahalar için uygundur.

## Yöntem 1 – Unreal Engine nDisplay (hedef çözüm)

Tek render bilgisayarı, 3 projektör, her projektör ayrı bir **viewport**. Kamera tektir;
her viewport kendi duvarının fiziksel konumuna göre perspektifi hesaplar, bu yüzden köşelerde
görüntü kırılmaz (sıradan "geniş masaüstü" yönteminden farkı budur).

1. UE5 projesinde **Edit → Plugins → nDisplay** eklentisini açın, editörü yeniden başlatın.
2. `unreal/nDisplay/uc-duvar.ndisplay` dosyasını Content Browser'a sürükleyin (nDisplay Config
   Asset olarak içe aktarılır) ve sahneye **nDisplay Root Actor** olarak ekleyin.
3. Config içindeki `screens` bloğunda duvar ölçülerini (cm) ve kameraya uzaklıkları saha keşfi
   sonrasına göre düzeltin. Varsayılan: 6 m × 3,375 m duvarlar, kamera 1,7 m yükseklikte.
4. `nodes.Render1.window` penceresi 3 projektörün toplam çözünürlüğüdür (3 × 1920 = 5760 × 1080).
   Windows'ta projektörlerin aynı sanal masaüstünde yan yana olduğundan emin olun
   (NVIDIA Mosaic / Surround ile tek 5760×1080 ekran yapmak en kararlı yoldur).
5. Switchboard veya komut satırı ile çalıştırın:

   ```
   DuvarSimulasyonu.exe -dc_cfg="C:\DuvarSimulasyonu\uc-duvar.ndisplay" -dc_node=Render1 -fullscreen -windowed=0
   ```

6. Projektörler duvara eğik bakıyor veya kenarları bindiriyorsa `simple` politikasını
   `mpcdi` ile değiştirin: bkz. `unreal/nDisplay/uc-duvar-mpcdi.ndisplay-notlar.md`.

İki veya daha fazla render bilgisayarı gerekirse (ör. her duvara bir GPU), `nodes` altına
`Render2`, `Render3` eklenir; her birine kendi `host` IP'si ve viewport'u verilir. nDisplay
kareleri ağ üzerinden senkronlar (`renderSyncPolicy: ethernet`; NVIDIA Quadro Sync varsa
`nvidia`).

## Yöntem 2 – Windows / GPU sürücüsü ile tek geniş ekran (demo)

Masaüstündeki örnek çalışma gibi tek bir uygulama penceresini 3 projektöre yaymak için
UE'ye hiç dokunmadan:

- **NVIDIA:** Control Panel → *Configure Surround, PhysX* → *Span displays with Surround* →
  3 projektörü seçin → 5760×1080 tek ekran oluşur. Uygulamayı tam ekran açın.
  Profesyonel kartlarda (RTX A serisi) aynı iş **Mosaic** ile yapılır ve kenar bindirme
  (overlap) değeri de girilebilir.
- **AMD:** Radeon Software → *Eyefinity* → *Quick Setup*.
- **Intel / genel:** Windows Ekran Ayarları'nda "Genişlet" ile 3 ekran yan yana dizilir;
  uygulama penceresi `-WinX=0 -WinY=0 -ResX=5760 -ResY=1080 -windowed -ForceRes`
  parametreleriyle elle 3 ekrana yayılır (çerçevesiz pencere).

Paketlenmiş bir UE oyununu bu şekilde başlatırken (örnek çalışmadan öğrenilenler, ayrıntı:
`docs/ornek-calisma-inceleme.md`):

```
Engine\Binaries\Win64\UnrealGame.exe ..\..\..\<Proje>\<Proje>.uproject ^
  -fullscreen -ResX=5760 -ResY=1080 -ForceRes -log ^
  -ini:Engine:[/Script/Engine.LocalPlayer]:AspectRatioAxisConstraint=AspectRatio_MaintainYFOV
```

- Blueprint-only projelerde kökteki `<Proje>.exe` yalnızca bir *bootstrap*'tır; parametreleri
  `UnrealGame.exe`'ye aynen iletir, dolayısıyla ikisine de aynı parametreler verilebilir.
- `-ForceRes` şarttır: `GameUserSettings.ini` içindeki eski çözünürlük (örnekte 1280×720) ilk
  karede pencereyi geri küçültür.
- `AspectRatioAxisConstraint=AspectRatio_MaintainYFOV` olmadan UE, 48:9 oranında yatay görüş
  açısını sabit tutup **dikeyi kırpar** (Vert-); bu satırla dikey açı korunur, yatay ≈ 143° olur.
  `-ini:Engine:...` biçimi dosya değiştirmeden ini değeri verir; kalıcı yapmak için aynı satır
  `Saved\Config\Windows\Engine.ini` (veya kaynak projede `DefaultEngine.ini`) içine yazılır.
- Development yapılarda `~` konsolu açıktır: `r.SetRes 5760x1080w` (pencere) veya
  `r.SetRes 5760x1080f` (tam ekran) ile çalışırken de geçiş yapılabilir. Shipping yapıda konsol kapalıdır.
- UMG menü/HUD 16:9 için tasarlandıysa 48:9'da bozulur; simülasyonda menü yerine doğrudan sahne
  açılışı ve panelden kontrol tercih edilmelidir.
- Hazır betik: `araclar/ornek-tccc-genis-ekran.bat` (geniş pencere / tam ekran / tek ekran deneme).

Bu yöntem perspektifi düzeltmez: duvarlar kameraya açılı duruyorsa köşelerde görüntü
"kırılır". Düz tek duvar veya hızlı demo için yeterlidir, nihai teslimat için nDisplay gerekir.

## Yöntem 3 – Harici warp/blend cihazı

Müşterinin mevcut bir warp cihazı varsa (ön fizibilite, risk tablosu): UE tek geniş görüntü
üretir (Yöntem 1 `simple` veya Yöntem 2), cihaz görüntüyü 3 çıkışa böler, geometriyi düzeltir
ve kenarları karıştırır. Cihazın beklediği giriş çözünürlüğü nDisplay `window` değerine yazılır.

## Örnek çalışmadan öğrenilenler (TCCC paketi, UE 5.5.4)

Masaüstündeki örnek paket incelendi (`docs/ornek-calisma-inceleme.md`). Bu projeye etkileri:

| Bulgu | Sonuç |
|---|---|
| Pakette **nDisplay yok** | Yöntem 1 örnekle denenemez; `-dc_cfg` yok sayılır. Kaynak projede eklenti açılıp yeniden paketlenmeli |
| Pakette **Remote Control API yok** | Köprü bağlanamaz; aynı şekilde kaynak projede açılmalı ("Enable in packaged builds") |
| Development yapı, Blueprint-only | Komut satırı parametreleri ve konsol çalışır → Yöntem 2 demo hemen yapılabilir |
| Tek kamera, birinci şahıs pawn | Yöntem 2'de FOV kısıtı (`MaintainYFOV`) zorunlu; U-şekilli duvarda nDisplay şart |
| Lumen + VSM + Ray Tracing açık | 3×1080p için RTX 4070 sınıfı ve üstü; nDisplay `bufferRatio` ile ölçeklenebilir |
| Ultra Dynamic Sky, Niagara efektleri, helikopter sekansları mevcut | Kaynak proje alınırsa `OrtamAyarla`, `EfektTetikle`, `Oda2Ayarla` doğrudan bunlara bağlanır |

Paketin nDisplay içerip içermediğini anlamak için `Manifest_UFSFiles_Win64.txt` içinde
`Engine/Plugins/Runtime/nDisplay` ve `Engine/Plugins/VirtualProduction/RemoteControl` satırları
aranır; yoksa eklenti paketlenmemiştir.

## Kontrol listesi (saha)

- [ ] Paket **Shipping** olarak alındı; manifestte nDisplay ve Remote Control eklentileri var
- [ ] Yöntem 2 kullanılacaksa `-ForceRes` ve `AspectRatioAxisConstraint=AspectRatio_MaintainYFOV` verildi
- [ ] Projektör sayısı, çözünürlük ve çıkış tipi (HDMI/DP) alındı
- [ ] Duvar ölçüleri ve kameraya mesafeler cm olarak config'e girildi
- [ ] 3 projektör Windows'ta tek masaüstünde, doğru sırada (sol-orta-sağ)
- [ ] GPU saniyede 60 kare veriyor (`stat fps`), gerekirse `bufferRatio` düşürülür
- [ ] Kenar bindirmesi varsa MPCDI dosyası alındı ve `region` adları eşleşti
- [ ] Köprü sunucusu `UNREAL_MOD=gercek` ile UE'ye bağlanıyor (panelde "Unreal bağlı")
