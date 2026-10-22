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

Çalışan: panel, köprü, oynatıcı, senaryo editörü, ön ayarlar, Art-Net çıkışı (donanımsız
doğrulandı), figür paneli, demo.bat. **Oynatıcıda 3B sahne katmanı** (`apps/duvar-oynatici/src/sahne3b/`,
Three.js): panorama = arka plan + ışık (IBL), güneş yönü panoramadan, gölgeli zemin, patlamada kalıcı
krater + moloz + tüten duman, parçacık efektleri, glTF figürler, 3B helikopter. Panorama başına **yerleşim planı**
(`noktalar`/`yasak`: patlama ve figür ağaç/bina içine düşmez, helikopter iniş noktası). Tarayıcıda
doğrulandı (figürler, patlama, krater, helikopter iniş/kalkış). Plan şimdilik yalnızca AI kırsal
panoramada; Poly Haven panoramaları için yazılacak. Ayrıntı `docs/duvar-oynatici.md`.

Gerçek içerik (kullanıcının makinesinde, depoda değil): kırsal yaz gündüz Skybox AI panoraması
(2912×1440 önizleme, varsayılan) + **23 Poly Haven CC0 gerçek çekim panorama** (5 bölge × mevsim ×
zaman, 8K, `pano_<mevsim>_<zaman>_foto_8k.jpg`), Mixkit/OGA sesler (`icerik/sesler/`), Kenney CC0
parçacık dokuları (`icerik/dokular/`). Depoda: asker modelleri (three.js Soldier, Poly Pizza CC-BY),
helikopter (OGA CC-BY). Kaynak/lisans notları manifestte `_kaynak`. Araştırma listeleri (128 HDRI,
modeller, VFX/ses adayları) oturum scratchpad'indeydi; yeniden gerekirse Poly Haven API ile üretilir.

**Kontrol paneli yeniden tasarlandı** (22 Ekim): "harekât masası" teması, sahne pusulası (yön seçimi
pusuladan; figür/patlama/helikopter/güneş/rüzgâr üzerinde), sol görev rayı (F1–F5), canlı sahne kartı +
hızlı efektler (1–5), bildirimler, gecikmeli kaydırıcılar, iki aşamalı onay, tablet düzeni. Tasarım
belirteçleri ve desenler `apps/kontrol-paneli/.interface-design/system.md`; yeni bileşen eklerken ona uy.

Kullanıcı UE öğrenmeye vakit ayıramıyor; "görsel şölen" için tam yetki verdi (ücretsiz içerik indir,
otonom çalış). Donanım yok; dizüstü GTX 1650 + Iris Xe (Chrome Iris Xe kullanıyor).

**Çatışma ve birlik (22 Ekim):** durum modelinde `catisma` (düşman yönü, şiddet, dost ateşi) ve
`oda2.helikopterYonu`; oynatıcıda `sahne3b/catisma.ts` (3B izli mermi, çarpma/sekme, dost ateşi, uzak
parıltı/patlama); figürler panelden yer seçilmeden hazır mevzi/tank noktalarına (`birlikNoktasiSec`,
boş nokta) yerleşir; panelde "Birlik çağır". Tank modelleri (CC-BY / CC0) manifestte.

## Sıradaki işler (öncelik sırasıyla)

1. Poly Haven panoramaları (23) için yerleşim planı + `yawKaydirma`; güneş tahmini ve gece karartması
   gözle kontrol. Oda 2 için 3B sütre/kum torbası modelleri (2B ön plan 3B'de kapalı).
2. Asker ateş/siper animasyonu (Mixamo Rifle klipleri; hesap gerekir) ve Oda 2 için 3B sütre/kum torbası;
   daha gerçekçi asker: Mixamo "Swat" + Rifle Idle/Walk/Run/Crouch/Crawl/Injured (Blender → GLB,
   Mixamo iskeleti) ya da yeşil perde çekimi (docs §2.5). Yaralı yerde / sürünen figür.
3. VFX plakaları (gerçek çekim, alfa) ve helikopter inişi için 3B toz + ses ayarı; izli mermiyi 3B'ye taşıma.
4. Senaryo adımı tipi olarak figür komutu; 4 kanal ses; Türkçe bağırma kaydı; U duvar ölçüleri → `?fov=`.
5. İdareye gösterim: kırsal 4 varyant + patlama/krater + 3 asker + helikopter.

## Belgeler

- `docs/sartname-analizi-ve-yaklasim.md` – şartname maddeleri, hibrit yol gerekçesi, kabul matrisi
- `docs/fotogercekci-icerik-hatti.md` – içerik üretimi: AI panorama, UE5, 360° çekim, yeşil perde, FFmpeg
- `docs/duvar-oynatici.md` – oynatıcı katmanları, manifest alanları, köprü sözleşmesi
- `docs/mimari.md`, `docs/unreal-kurulum.md`, `docs/3-projeksiyon-tek-ekran.md`
- `docs/ornek-calisma-inceleme.md` – firmadan gelen TCCC örnek paketi incelemesi
- `docs/donanim-onerileri.md`, `docs/kaynak-proje-talebi.md`, `docs/sartname-uyumluluk.md`
