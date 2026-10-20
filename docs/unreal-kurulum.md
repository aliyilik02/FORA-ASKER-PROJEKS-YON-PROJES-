# Unreal Engine 5 kurulumu

Köprü sunucusu UE'ye **Remote Control API** üzerinden ulaşır. UE projesinde yapılması gerekenler:

## 1. Eklentiler

Edit → Plugins:

| Eklenti | Amaç |
|---|---|
| **Remote Control API** | Panelin HTTP ile fonksiyon çağırması (port 30010) |
| **nDisplay** | 3 projektöre dağıtım (bkz. `docs/3-projeksiyon-tek-ekran.md`) |
| **Niagara** | Patlama, toz/duman, izli mermi efektleri |
| **DMX Engine / DMX Protocol** (isteğe bağlı) | Işığı köprü yerine doğrudan UE'den sürmek isterseniz |

Remote Control'ün uzak bağlantı kabul etmesi için `DefaultEngine.ini`:

```ini
[/Script/RemoteControl.RemoteControlSettings]
bRestrictServerAccess=False

[RemoteControl]
RemoteControlHttpServerPort=30010
```

Paketlenmiş (cooked) sürümde Remote Control'ün çalışması için **Project Settings → Plugins →
Remote Control → "Enable Remote Control in packaged builds"** açılmalıdır (UE 5.3+).

## 2. Remote Control Preset: `DuvarSimulasyonu`

Content Browser → Add → Remote Control → **Remote Control Preset**, adı `DuvarSimulasyonu`
(köprü `UNREAL_PRESET` değişkeniyle aynı). Sahnedeki `BP_SimulasyonYoneticisi` aktörünün
aşağıdaki fonksiyonları **Expose** edilir. Parametre adları köprü ile birebir aynıdır
(`apps/kopru/src/unreal.ts` → `UE_ISIMLERI`).

| Fonksiyon | Parametreler | Ne yapar |
|---|---|---|
| `OdaSec` | `Oda: String` (`oda1`/`oda2`) | Oda 1 ve Oda 2 içerik setleri arasında geçiş |
| `BolgeYukle` | `Bolge: String` | Level Streaming ile bölge sahnesini yükler (`meskun_mahal`, `ormanlik`, `daglik`, `us_bolgesi`, `kirsal_acik_arazi`) |
| `OrtamAyarla` | `Mevsim: String`, `Saat: Float`, `Bulut: Float`, `Sis: Float`, `Yagis: String`, `RuzgarSiddeti: Float`, `RuzgarYonu: Float` | Sky Atmosphere / Directional Light güneş açısı, Volumetric Cloud, Exponential Height Fog, yağış Niagara sistemi, Wind Direction |
| `EfektTetikle` | `Tur: String`, `Siddet: Float`, `Yon: Float`, `Mesafe: Float` | Niagara efektini + MetaSound/ses dalgasını `Yon` yönünde konumlandırarak oynatır; `Mesafe` > 0 ise attenuation uygular |
| `IzliMermiAyarla` | `Aktif: Bool`, `CikisNoktasi: Int`, `Yon: Float`, `Siklik: Float` | İzli mermi Niagara emitter'ını açar/kapatır, spawn noktasını ve hızını ayarlar |
| `Oda2Ayarla` | `GuvenliAlan: String`, `Helikopter: String`, `UzakSesMesafesi: Float`, `UzakSesYonu: Float` | Güvenli alan görüntüsü, helikopter animasyon durumu (Sequencer), uzak ses attenuation |

Her fonksiyon Blueprint'te **"Call in Editor"** değil, normal `BlueprintCallable` olmalıdır.

Köprü, UE'ye şu biçimde istek atar (test için `curl` ile doğrulayabilirsiniz):

```bash
curl -X PUT http://192.168.10.10:30010/remote/preset/DuvarSimulasyonu/function/EfektTetikle \
  -H "Content-Type: application/json" \
  -d '{"Parameters":{"Tur":"patlama","Siddet":1,"Yon":45,"Mesafe":0},"GenerateTransaction":false}'
```

Bağlantı yoklaması `GET /remote/info` ile yapılır.

## 3. İçerik yapısı önerisi

```
Content/
  Bolgeler/            MeskunMahal, Ormanlik, Daglik, UsBolgesi, KirsalAcikArazi (streaming level)
  Ortam/               BP_GokyuzuYoneticisi (Sky Atmosphere, Volumetric Cloud, Fog, güneş)
  Efektler/Niagara/    NS_Patlama, NS_TozDuman, NS_IzliMermi, NS_Yagmur, NS_Kar, NS_RotorTozu
  Ses/                 MetaSound: patlama, gürültü, bağırma, çağırma, mermi vızıltısı, rotor
  Oda2/                GuvenliAlan görüntüleri, BP_Helikopter + LS_HelikopterYaklasIn (Sequencer)
  Blueprints/          BP_SimulasyonYoneticisi (yukarıdaki fonksiyonlar)
  nDisplay/            UcDuvar config asset
```

- Tüm bölgeler aynı gökyüzü/hava sistemini kullanır; mevsim ve saat parametrik olduğu için
  her kombinasyon için ayrı sahne üretilmez (ön fizibilite §3).
- Konumsal ses: her efekt bir `Audio Component` ile `Yon` açısına göre kameranın etrafına
  yerleştirilir; çok kanallı çıkış için Project Settings → Audio → Spatialization.

## 4. Işık (DMX / Art-Net)

Varsayılan kurulumda ışığı **köprü sunucusu** sürer (`ARTNET_AKTIF=1`). Kanal haritası
`apps/kopru/src/artnet.ts` içinde: 1 dimmer, 2–4 RGB, 5 strobe. Armatürün gerçek haritasına
göre bu fonksiyon düzenlenir. Patlamalarda kısa beyaz flaş otomatik gönderilir.

Alternatif: UE DMX eklentisiyle ışığı doğrudan sahnedeki ışık kaynaklarına bağlayıp köprüde
`ARTNET_AKTIF=0` bırakmak. İki yöntem aynı anda kullanılmamalıdır.

## 5. Örnek (TCCC) kaynak projesine bağlama planı

Kaynak proje geldiğinde (`docs/kaynak-proje-talebi.md`) `BP_SimulasyonYoneticisi` fonksiyonları
örnekteki hazır sistemlere şöyle bağlanır. Varlık adları paketin manifestinden okundu
(`docs/ornek-calisma-inceleme.md` §6); Blueprint değişken adları kaynak gelince doğrulanacak.

| Köprü fonksiyonu | Örnekteki karşılığı | Not |
|---|---|---|
| `OdaSec` | Yok | Oda 2 için yeni içerik; Oda 1 mevcut haritalar |
| `BolgeYukle(meskun_mahal / ormanlik / daglik)` | `Open Level` → `CitySuburbs` / `Orman` / `Mountain_5` | `Level Streaming` ile geçiş süresi kısalır; `us_bolgesi`, `kirsal_acik_arazi` yeni harita |
| `OrtamAyarla` | **Ultra Dynamic Sky** aktörü (UDS 9.0B) | UDS değişkenleri: `Time of Day` (0–2400; köprüdeki `Saat`×100), `Season` (0–1 yıl döngüsü; mevsim → 0 kış, 0,25 ilkbahar, 0,5 yaz, 0,75 sonbahar), `Cloud Coverage` (0–10; `Bulut`×10), `Fog` (0–10; `Sis`×10), `Rain`/`Snow` (0–10; `Yagis`), **Ultra Dynamic Weather** varsa `Wind Intensity`, `Wind Direction`. Değer aralıkları UDS sürümüne göre teyit edilir |
| `EfektTetikle(patlama)` | Oyun içi "El Bombası" (`GrenadePack` `VFX_GrenadeEXP_dirt` + ses) | `Yon` → kameradan o açıda 15–30 m ileride spawn |
| `EfektTetikle(toz_duman)` | "Sis Bombası" (`NS_Smoke_Granade`) | |
| `EfektTetikle(gurultu)` | "Çatışma" (silah sesi döngüsü, `Gun_Sounds_Pro_HD_Remake`) | |
| `EfektTetikle(bagirma / cagirma)` | Yok | Türkçe ses kayıtları eklenecek (MetaSound, attenuation) |
| `IzliMermiAyarla` | `BallisticsVFX` namlu alevi + çarpma; izli mermi için yeni Niagara emitter (ribbon) | `CikisNoktasi` → duvar başına bir `Arrow` bileşeni |
| `Oda2Ayarla(helikopter)` | "Helikopter" menü öğesi: UH-60A + `HelicopterArrive` / `OrmanHelicopterArrive` sekansları, `NS_Heli_Ground_Dust` | `yaklasiyor` → sekans başlat; `iniyor` → iniş bölümü; `kalkiyor` → tersine oynat |
| `Oda2Ayarla(guvenliAlan)` | Yok | 3 görüntü seti üretilecek |
| `EfektTetikle(uzak_patlama / uzak_mermi_sesi)` | Mevcut sesler + `Mesafe`'ye göre attenuation | `Yon` konumlandırma, `Mesafe` ses seviyesi/alçak geçiren filtre |

Paket içindeki oyun menüsü (Çatışma, Vurulma, Zırhlı Araç, Helikopter, Sis Bombası, El Bombası,
Döngü Süresi) panelde zaten karşılığı olan işlevlerdir; kaynak projede bu menü kaldırılıp
`TCCCGameMode` doğrudan eğitim haritasıyla açılır ve her şey Remote Control üzerinden tetiklenir.

Performans notu: paket Lumen + VSM + Nanite + TSR "Epic" ile paketlenmiş (GTX 1650'de 8 FPS).
Kaynak projede eğitim haritaları için **Lightmass ile pişirilmiş ışık + CSM** profili hazırlanır;
Lumen yalnızca render PC'de (`docs/donanim-onerileri.md`) açılır. Teslimat **Shipping** paket,
PSO önbelleği ile.
