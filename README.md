# Duvar Simülasyon Yazılımı

Eğirdir Dağ Komando Okulu – **"Ateş Altında Yaralıya Müdahale"** (Oda 1) ve **"Taktik Güvenli
Alan / Tahliye"** (Oda 2) simülasyon odaları için duvar simülasyon yazılımı. Ön fizibilite
raporundaki (Grit Teknoloji, 7 Eylül 2026) teknik mimariyi uygular.

```
┌──────────────────┐   HTTP/WS    ┌──────────────────┐   Remote Control API   ┌──────────────────┐
│  Kontrol Paneli  │ ───────────► │  Köprü Sunucusu  │ ─────────────────────► │  Unreal Engine 5 │
│  (React, Türkçe) │ ◄─────────── │  (Node.js)       │                        │  + nDisplay      │──► 3 projektör
└──────────────────┘              │                  │   Art-Net (UDP)        └──────────────────┘
                                  │                  │ ─────────────────────► DMX ışık kontrolcüsü
                                  └──────────────────┘
```

| Bileşen | Klasör | Açıklama |
|---|---|---|
| Kontrol paneli | `apps/kontrol-paneli` | Eğitmenin tablet/bilgisayardan kullandığı Türkçe web arayüzü |
| Köprü sunucusu | `apps/kopru` | Paneli UE5 Remote Control API'ye ve DMX/Art-Net'e bağlar; senaryo motoru, ön ayarlar |
| Unreal yapılandırması | `unreal/` | nDisplay (3 projektör) örnek konfigürasyonu ve Remote Control preset tanımı |
| Dokümantasyon | `docs/` | Mimari, UE kurulumu, 3 projeksiyona tek ekran yayma, örnek çalışma incelemesi, şartname uyumluluk matrisi |
| Yardımcı betikler | `kur.bat`, `baslat.bat`, `araclar/` | Tek tıkla kurulum/başlatma; örnek paketi geniş ekranda açma |

## Hızlı başlangıç

Windows'ta tek tıkla: önce **`kur.bat`** (bir kez, `npm install`), sonra **`baslat.bat`**
(köprü + panel ayrı pencerelerde açılır, tarayıcı http://localhost:5173 adresine gider).

Elle:

```bash
npm install
npm run dev:kopru     # köprü sunucusu → http://localhost:4000 (UE olmadan "simülasyon" modunda)
npm run dev:panel     # kontrol paneli → http://localhost:5173
```

Üretim (sistem kontrol odası bilgisayarı):

```bash
npm run build
UNREAL_MOD=gercek UNREAL_ADRES=http://192.168.10.10:30010 ARTNET_AKTIF=1 npm start
# panel + API aynı porttan sunulur → http://<kontrol-odasi-ip>:4000
```

Tüm ayarlar için `apps/kopru/.env.example` dosyasına bakın. Sistem internet bağlantısı olmadan,
kapalı yerel ağda çalışır (şartname §10).

## Testler

```bash
npm test          # köprü sunucusu birim testleri (Art-Net paketi, senaryo motoru, durum deposu)
npm run typecheck
```

## Belgeler

- [Mimari](docs/mimari.md)
- [Unreal Engine kurulumu ve Remote Control preset](docs/unreal-kurulum.md)
- [Tek ekranı 3 projeksiyona yayma](docs/3-projeksiyon-tek-ekran.md)
- [Örnek çalışma (TCCC paketi) incelemesi](docs/ornek-calisma-inceleme.md)
- [Donanım önerileri ve elimizdekilerle demo planı](docs/donanim-onerileri.md)
- [Kaynak proje talebi: ne, neden, nasıl istenir + hazır mesaj](docs/kaynak-proje-talebi.md)
- [Şartname uyumluluk matrisi](docs/sartname-uyumluluk.md)

`araclar/` klasörü:

- `ornek-tccc-genis-ekran.bat` – örnek UE paketini geniş ekranda / tek ekranda / düşük kalitede açar
- `ornek-kisisellestir.ps1` – örnek paketin kopyasına kendi splash görselimizi, pencere başlığını,
  grafik profilini ve masaüstü kısayolunu ekler (kaynak proje gerekmez)
- `artnet-dinle.mjs` – ışık kontrolcüsü olmadan köprünün Art-Net (DMX) çıkışını ekranda gösterir:
  `node araclar/artnet-dinle.mjs` + köprü `ARTNET_AKTIF=1 ARTNET_HEDEF=127.0.0.1` ile
