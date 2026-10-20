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
