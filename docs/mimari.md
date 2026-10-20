# Mimari

## Bileşenler

### Kontrol paneli (`apps/kontrol-paneli`)
React + Vite, tamamen Türkçe, harici CDN bağımlılığı yok (çevrimdışı çalışır). Köprü
sunucusuna `/api` ile komut gönderir, `/ws` WebSocket'ten durum/senaryo/günlük akışını alır.
Birden fazla panel (tablet + kontrol odası PC) aynı anda bağlanabilir; hepsi aynı durumu görür.

Üst sekmeler odayı seçer. Oda 1'de efekt ve izli mermi paneli, Oda 2'de güvenli alan,
helikopter ve uzak ses paneli görünür. Bölge, ortam, ışık, senaryo, ön ayar ve günlük her iki
odada ortaktır.

### Köprü sunucusu (`apps/kopru`)
Node.js + Express + ws. Tek doğruluk kaynağı: `DurumDeposu` (`src/durum.ts`).

| Modül | Görev |
|---|---|
| `durum.ts` | Simülasyon durumu; her değişiklik → UE + Art-Net + WebSocket yayını |
| `unreal.ts` | Remote Control API istemcisi; `simulasyon` modunda ağ yerine günlüğe yazar |
| `artnet.ts` | ArtDmx paket üretimi, UDP gönderim, gün ışığı hesabı, patlama flaşı |
| `senaryo.ts` | Zaman çizelgesi motoru: oynat / duraklat / durdur / adımı anında tetikle |
| `depo.ts` | Ön ayar ve senaryoların JSON olarak diske yazılması |
| `ornek.ts` | Paketlenmiş örnek UE oyununu (`ORNEK_PAKET`) panelden başlatma/durdurma; komut satırı üretimi |
| `ayarlar.ts` | Ortam değişkenleri + `apps/kopru/.env` okuyucu (bağımlılık yok) |
| `api.ts` | HTTP uç noktaları |
| `index.ts` | Sunucu, WebSocket, UE bağlantı yoklaması, derlenmiş paneli sunma |

### Unreal Engine 5
Görüntü üretimi, efektler, ses ve nDisplay dağıtımı. Köprüden gelen fonksiyon çağrılarını
`BP_SimulasyonYoneticisi` karşılar. Ayrıntı: `docs/unreal-kurulum.md`.

## Veri akışı

```
Eğitmen tıklar → panel PATCH /api/ortam {saat: 22}
  → DurumDeposu.ortamGuncelle()
      → UnrealIstemci.ortamAyarla()       (PUT /remote/preset/.../function/OrtamAyarla)
      → gunIsigiHesapla() → ArtNet.gonder (ışık senaryoya bağlıysa)
      → yayinla() → WS {tip:"durum"} → tüm paneller güncellenir
```

Senaryo oynatılırken motor 50 ms'de bir tik atar; gecikmesi gelen adımlar aynı yoldan
uygulanır. Eğitmen, senaryo akarken herhangi bir adımı "Şimdi tetikle" ile öne alabilir ya da
efekt düğmeleriyle araya girebilir.

## Ağ ve güvenlik

- Tüm trafik kapalı yerel ağda (kontrol odası ↔ render bilgisayarı ↔ ışık kontrolcüsü).
- Köprü hiçbir dış adrese bağlanmaz; `npm install` yalnızca kurulum aşamasında gerekir,
  sonrasında `node_modules` ile birlikte taşınabilir ortamdan kurulur.
- Remote Control API kimlik doğrulaması olmadığından render bilgisayarının 30010 portu
  yalnızca kontrol odası alt ağına açık olmalıdır (Windows Güvenlik Duvarı kuralı).

## HTTP API özeti

| Yöntem | Yol | Açıklama |
|---|---|---|
| GET | `/api/durum` | Tüm simülasyon durumu |
| GET | `/api/baglanti` | UE ve Art-Net bağlantı durumu |
| GET | `/api/gunluk` | Son 200 günlük kaydı |
| POST | `/api/yeniden-senkron` | Durumu UE ve DMX'e baştan gönder |
| PUT | `/api/oda` | `{oda}` |
| PUT | `/api/bolge` | `{bolge}` |
| PATCH | `/api/ortam` | `OrtamAyarlari` alanlarından herhangi biri |
| PATCH | `/api/isik` | `OrtamIsigi` alanları |
| PATCH | `/api/izli-mermi` | `IzliMermiAyarlari` alanları |
| PATCH | `/api/oda2` | `Oda2Ayarlari` alanları |
| POST | `/api/efekt` | `{tur, siddet?, yon?, mesafe?}` |
| GET/POST/DELETE | `/api/senaryolar[/:id]` | Senaryo listesi, kaydet, sil |
| POST | `/api/senaryo/yukle` · `/oynat` · `/duraklat` · `/dur` · `/adim-tetikle` | Senaryo kontrolü |
| GET/POST/DELETE | `/api/on-ayarlar[/:id]` · POST `/api/on-ayarlar/:id/yukle` | Ön ayarlar |

| GET | `/api/unreal/son-istekler` | Köprünün UE'ye gönderdiği son 100 Remote Control çağrısı |
| GET | `/api/ornek/durum` | Örnek paketin durumu (yapılandırıldı mı, çalışıyor mu, komut satırı) |
| POST | `/api/ornek/baslat` · `/api/ornek/durdur` | Örnek paketi aç/kapat (`ORNEK_PAKET` ayarlıysa) |

## WebSocket mesajları (`/ws`, sunucu → panel)

| `tip` | İçerik | Ne zaman |
|---|---|---|
| `durum` | `SimulasyonDurumu` | Bağlanınca ve her değişiklikte |
| `senaryo` | `SenaryoDurumu` | Bağlanınca, oynat/duraklat/durdur ve her tikte |
| `baglanti` | `BaglantiDurumu` | Bağlanınca ve UE bağlantısı değişince |
| `gunluk` | seviye, mesaj, zaman | Her günlük kaydında |
| `unreal` | `UnrealIstekKaydi` | Her Remote Control çağrısından sonra (başarılı/başarısız) |
| `ornek` | `OrnekDurumu` | Bağlanınca, örnek paket açılınca/kapanınca |

Tipler: `apps/kopru/src/tipler.ts` (panelde birebir kopyası).
