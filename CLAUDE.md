# Duvar Simülasyon Yazılımı – proje rehberi (Claude Code için)

Bu dosya projenin kararlarını, kurallarını ve mevcut durumunu tek yerde tutar. Yeni bir oturuma
başlarken önce bunu, sonra ihtiyaca göre `docs/` altındaki belgeleri oku. Kullanıcıyla **Türkçe**,
samimi ve dost canlısı konuş; önerilerde bulun.

## Proje nedir

Eğirdir Dağ Komando Okulu için iki eğitim odasına (Oda 1 "Ateş Altında Yaralıya Müdahale",
Oda 2 "Taktik Güvenli Alan ve Tahliye") 3 duvara projeksiyonla **fotogerçekçi arazi ortamı**
yansıtan, kontrol odasından yönetilen, internet gerektirmeyen yazılım. Şartname özeti ve
yaklaşım: `docs/sartname-analizi-ve-yaklasim.md`, uyumluluk matrisi: `docs/sartname-uyumluluk.md`.

Gereksinimlerin özü: ≥5 bölge (kırsal açık arazi, meskûn mahal, ormanlık, dağlık, üs bölgesi),
yaz/kış, gece/gündüz, hava durumu, patlama/gürültü/bağırma/çağırma/izli mermi efektleri, ortam
ışığı (DMX), Oda 2'de güvenli alan görüntüleri ve inen helikopter, uzak sesler.

## Alınan kararlar (tartışmaya açmadan uygula)

1. **Hibrit yol:** görüntüyü tarayıcı tabanlı **Duvar Oynatıcı** üretir (`apps/duvar-oynatici`).
   Unreal Engine çalışma zamanı değildir; UE, yapay zekâ ve gerçek çekim yalnızca **içerik
   kaynağıdır**. UE entegrasyonu (`UNREAL_MOD=gercek`, nDisplay) isteğe bağlı olarak durur.
2. **Görüntü aşırı gerçekçi olacak.** Parametrik/çizim sahne yalnızca yer tutucudur; kabul için
   360° panorama (yapay zekâ / UE render / 360° çekim), gerçek VFX plakaları ve yeşil perde asker
   klipleri kullanılır. Hat: `docs/fotogercekci-icerik-hatti.md`.
3. **Ortak içerik biçimi:** 360° equirectangular (resim 12K×6K, video 8K×4K); alfa klipler VP9
   alpha WebM (`-pix_fmt yuva420p`). Manifest: `apps/duvar-oynatici/public/icerik/manifest.json`.
4. **U duvar, 3 projektör, duvar başına 90°** varsayılan; gerçek ölçüler saha keşfinden sonra
   `?fov=` ile ayarlanır. İlk bölge: **kırsal açık arazi**.
5. Arayüz ve kod adlandırması **Türkçe** (dosya/sınıf/fonksiyon adları Türkçe, ASCII; örn.
   `FigurYoneticisi`, `klipler.ts`). İngilizce teknik terim gerekirse yorumla açıkla.

## Yapı ve komutlar

```
apps/kopru            Node 20+/Express/ws köprü sunucusu: HTTP API + WebSocket yayını, durum deposu,
                      senaryo motoru, Art-Net/DMX, UE Remote Control istemcisi (gercek|simulasyon),
                      figür/klip yöneticisi, örnek paket başlatıcı. Derlenmiş paneli (/) ve
                      oynatıcıyı (/oynatici/) 4000 portundan sunar.
apps/kontrol-paneli   React + Vite eğitmen paneli (tablet/PC).
apps/duvar-oynatici   Vanilla TS + Vite oynatıcı: Canvas 2D + WebGL (panorama), Web Audio.
unreal/               nDisplay yapılandırmaları (isteğe bağlı UE yolu).
docs/                 Belgeler (aşağıda).
araclar/              Yardımcı betikler (Art-Net dinleyici, test klibi üretici, örnek paket araçları).
demo.bat              Tek tıkla: kurulum → derleme → köprü → panel ve oynatıcı tarayıcıda.
```

```
npm install                 # bağımlılıklar
npm run build               # üç paket (tsc + vite)
npm start                   # köprü → http://localhost:4000 (panel), /oynatici/?hud=1
npm test                    # köprü (vitest) + oynatıcı (vitest) birim testleri
npm run typecheck
npm run dev:kopru / dev:panel / dev:oynatici   # geliştirme sunucuları (5173 panel, 5174 oynatıcı)
demo.bat yeniden            # Windows: yeniden derleyip başlat
```

## Kodlama kuralları

- `apps/kopru/src/tipler.ts` **tek kaynak**; değiştirince aynısını
  `apps/kontrol-paneli/src/tipler.ts` ve `apps/duvar-oynatici/src/tipler.ts` dosyalarına kopyala
  (`cp`), import etme.
- Köprü → istemci WS mesajları `SunucuMesaji` birliğindedir; yeni mesaj tipi eklerken üç uygulamayı
  birlikte güncelle, oynatıcı ve panel `switch` ile ayrıştırır.
- Windows `.bat` dosyalarında `if (...)` blokları içinde **parantez kullanma** (echo satırları
  dahil); `goto` etiketleriyle yaz. Kullanıcının makinesi Windows 11, Node 24.
- Medya dosyaları (`mp4/webm/ogg/mp3`) depoya girmez (`.gitignore`); yalnızca iki küçük sentetik
  test klibi istisnadır. İçerik `icerik/` klasörüne kopyalanır, manifeste satır eklenir.
- Değişiklikten sonra `npm run typecheck && npm test && npm run build` temiz olmalı.
- Commit mesajları Türkçe, açıklayıcı. Dal: `claude/festive-mayer-278or1` (PR #1, taslak).
  Oturuma başlarken `git pull`, bitirince commit + push. Bulut oturumu da aynı dalda kod yazıyor;
  aynı dosyada aynı anda çalışmamak için kullanıcıya hangi tarafın ne yaptığını sor.

## Oynatıcı kısa özet

Silindirik panorama; her nesnenin azimutu var (0 = orta duvar ortası, sola eksi, sağa artı).
Arka plan önceliği: 360° panorama (manifest `panorama`) > düz 5760×1080 döngü (`dongu`) >
parametrik yer tutucu. Üstüne: Oda 2 ön planları, **figür klipleri** (`klipler`, kategori
`figur`), sis, helikopter, hava, **efekt plakaları** (`klipler`, kategori `efekt`; adı
`patlama_*`, `toz_*`, `uzak_patlama_*` olanlar panel efektlerine otomatik bağlanır), izli mermi,
flaş. Tuşlar: H hud, K kalibrasyon, F tam ekran, M sessiz, 1/2/3 test. Sorgu: `?fov=`, `?panorama=`,
`?yaw=`, `?hud=1`, `?doldur=1`. Ayrıntı: `docs/duvar-oynatici.md`.

Panel API'si (`apps/kopru/src/api.ts`): `/api/durum`, `/oda`, `/bolge`, `/ortam`, `/isik`,
`/izli-mermi`, `/oda2`, `/efekt`, `/figur` (oynat/durdur/temizle), `/klipler`, `/figurler`,
`/senaryolar`, `/senaryo/*`, `/on-ayarlar`, `/unreal/son-istekler`, `/ornek/*`, `/baglanti`, `/gunluk`.

## Mevcut durum (22 Ekim 2026)

Çalışan: panel, köprü, oynatıcı (yer tutucu sahne + panorama ve klip katmanları), senaryo
editörü, ön ayarlar, Art-Net çıkışı (donanımsız doğrulandı), figür paneli, demo.bat (Windows'ta
doğrulandı). Gerçek içerik **henüz yok**: panoramalar, VFX plakaları, asker klipleri, Türkçe
sesler bekliyor. Donanım (render PC, projektörler, Art-Net node) yok; kullanıcının dizüstü GTX 1650.

## Sıradaki işler (öncelik sırasıyla)

1. Kırsal açık arazi için yapay zekâ 360° panorama: 6–10 aday → seçim → kış/alacakaranlık/gece
   varyantları → `icerik/kirsal_acik_arazi/` + manifest `panorama` satırı. Promptlar
   `docs/fotogercekci-icerik-hatti.md` §3'te.
2. VFX plaka paketi (patlama, toz, namlu alevi) → VP9 alpha → `icerik/klipler/` + manifest `klipler`.
3. Yeşil perde asker çekimi (okul personeli; klip listesi ve çekim düzeni §2.5) → keying → klipler.
4. Senaryo adımı tipi olarak figür komutu; 4 kanal ses; U duvar ölçüleri gelince `?fov=`.
5. İdareye 1 bölge + 4 varyant + 2 efekt + 3 asker ile "kabul standardı" gösterimi.

## Belgeler

- `docs/sartname-analizi-ve-yaklasim.md` – şartname maddeleri, hibrit yol gerekçesi, kabul matrisi
- `docs/fotogercekci-icerik-hatti.md` – içerik üretimi: AI panorama, UE5, 360° çekim, yeşil perde, FFmpeg
- `docs/duvar-oynatici.md` – oynatıcı katmanları, manifest alanları, köprü sözleşmesi
- `docs/mimari.md`, `docs/unreal-kurulum.md`, `docs/3-projeksiyon-tek-ekran.md`
- `docs/ornek-calisma-inceleme.md` – firmadan gelen TCCC örnek paketi incelemesi
- `docs/donanim-onerileri.md`, `docs/kaynak-proje-talebi.md`, `docs/sartname-uyumluluk.md`
