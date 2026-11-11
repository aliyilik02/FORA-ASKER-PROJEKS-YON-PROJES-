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
4. **U duvar, 3 projektör, duvar başına 90°** varsayılan (ölçü girilmezse); geometrideki `yuk` yansıtılan görüntünün
   yüksekliğidir (16:9: ön genişlik × 9/16); %30'dan çok sapan geometri oynatıcıda reddedilir, panelde hata verir (3 Kasım:
   yuk=8 kaydı "panorama basık" şikâyetinin nedeniydi; kayıt adrese göre ayrıdır: localhost / 127.0.0.1 / IP). Gerçek ölçüler saha keşfinden sonra
   `?oda=` ile girilir (panel Sistem › Duvar geometrisi; duvar başına genelleştirilmiş perspektif, ufuk göz
   hizasında, K ızgarasıyla doğrulanır). `?fov=` yalnız ölçüsüz açı ayarıdır. İlk bölge: **kırsal açık arazi**.
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
Her duvar izleyicinin gözünden genelleştirilmiş perspektifle (Kooima, `projeksiyon.ts` + `sahne3b/duvarKamerasi.ts`)
çizilir; 3B, video panorama, 2B klipler/efektler ve K ızgarası aynı izdüşümü kullanır. Sorgu
`?oda=u,on=6,yan=4,yuk=3,alt=0.3,x=0,z=3,goz=1.7` ya da `?oda=duz,on=9,yuk=2.5,alt=0.3,z=4,goz=1.7` (metre; yerel
kayıtta kalır, `?oda=sifirla` siler; panel Sistem › Duvar geometrisi); yoksa duvar başına `?fov=` (90): 3B görüntü
eskisiyle aynı, 2B klip/efekt/yer tutucu perspektif eşlemeye geçti (azimuta doğrusal değil; manifest `genislikDerece`
gerekirse yeniden ayarlanır). Ölçülmüş odada 3B sis gerçek uzaklıkla (köşede kırılmaz), düz duvar için `?fov=40` değil `?oda=duz`.
Arka plan önceliği: 360° panorama (manifest `panorama`) > düz 5760×1080 döngü (`dongu`) >
parametrik yer tutucu. Üstüne: Oda 2 ön planları, **figür klipleri** (`klipler`, kategori
`figur`), sis, helikopter, hava, **efekt plakaları** (`klipler`, kategori `efekt`; adı
`patlama_*`, `toz_*`, `uzak_patlama_*` olanlar panel efektlerine otomatik bağlanır), izli mermi,
flaş. Tuşlar: H hud, K kalibrasyon, F tam ekran, M sessiz, 1/2/3 test (basılı tutma tekrar etmez), T hoparlör testi,
⇧0 sahneyi sıfırla (köprüye istek; köprü yoksa yalnız o oynatıcı). Sorgu: `?oda=`, `?fov=`, `?panorama=`,
`?yaw=`, `?hud=1`, `?doldur=1`, `?kalite=dusuk|orta|yuksek` (yerel kayıtta kalır) ya da `otomatik` (kaydı siler; hiçbiri
yoksa da otomatik: Intel entegre → orta, diğer → yuksek, `src/kaliteSecimi.ts`; panelin Oynatıcı düğmesinde varsayılan
Otomatik), `?ses=`, `?hoparlor=` (Ses, aşağıda), `?gecis=600` (sahne geçişinde solma, ms; 0 anlık). Kalite tek yerde
çözülür ve `Sahne3B.kalite` olur: gölge/parçacık/arazi kademesi ile geçişin küp yüzü ve çözme genişliği aynı değerden.
Ayrıntı: `docs/duvar-oynatici.md`.

Sahne geçişi (2 Kasım, `sahne3b/panoramaGecisi.ts`, `gecis.ts`): eski sahne yenisi hazır olana dek canlı çizilir; panorama
işçide çözülür (`panoramaIscisi.ts`), GPU'ya şeritlerle yüklenir, derinliksiz küp (dusuk 1024 / orta 1536 / yuksek 2048) +
1024'lük kopyadan PMREM (hedefler `dispose()`; eski yolda 8K geçişi başına 384 MiB sızıyordu). Bölge sıfırlaması, arazi,
kar, ışık ve helikopter iniş noktası takasa ertelenir; takasta eski kare `#tuvalGecis` örtüsüne kopyalanır, 0,6 sn'de solar
(bölge değiştiyse önce arazi dokuları beklenir: `AraziKatmani.dokularHazir`, en çok 1,2 sn). Yer tutucu yalnız hiç
panorama yokken (beklerken siyah). Eksik bölge/mevsim/zaman en yakın panoramaya düşer (`video.ts panoramaAdaylari`,
köprü günlüğüne yazılır). Foto panoramalar q90 4:2:0'a sıkıştırıldı (`araclar/panorama-sikistir.py`, özgünler
`icerik/_yedek_ozgun/`). Kalan takılma takas karesinde arazi işi (`koridorlariAyarla` 0,3–0,8 sn, örtü altında).
Geçiş sürerken sıfırlama: ekrandaki sahne hemen temizlenir, gelen panorama ve ertelenen bölge işleri yerinde kalır (takas
yeni bölgede bir kez daha temizler, sıfırlamayı geri almaz); örtü eski kareyi tutuyorsa yeni sahnenin ilk karesinde
solmadan kalkar (`GecisKatmani.sahneTemizlendi`).

Ses (`ses.ts` + saf hesap `sesYerlesimi.ts`): her ses sahne azimutuyla çalınır; stereoda eski StereoPanner yolu (pan =
sin azimut), 4 kanal / 5.1 / 7.1'de ChannelMerger (iki komşu hoparlöre sabit güçlü kaydırma, ön/arka ayrılır, uzak
sesler yayılır, patlama/top basları LFE'ye, ortam dağınık, 3B helikopter rotoru konumlu). Sorgu
`?ses=stereo|dortlu|5.1|7.1|otomatik` (varsayılan otomatik = cihazın kanal sayısı; yerel kayıtta kalır), `?hoparlor=`
kanal sırasıyla azimutlar (`-30,30,0,lfe,-110,110`); tuş **T** hoparlör testi; panel Sistem → Ses düzeni. Yeni ses
çağrıları sahne azimutu (derece) geçer, `azimutPan` değil; çatışma ses geri çağrıları markalı `AzimutDerece` alır
(`sesAzimutu(konum)` / `azimutDerece(derece)`; pan geçmek derleme hatası). Rotor sesi `Helikopter3B.sesKonumu`ndan.

Panel API'si (`apps/kopru/src/api.ts`): `/api/durum`, `/oda`, `/bolge`, `/ortam`, `/isik`,
`/izli-mermi`, `/oda2`, `/efekt`, `/figur` (oynat/durdur/temizle/poz), `/klipler`, `/figurler`,
`/senaryolar`, `/senaryo/*`, `/on-ayarlar`, `/unreal/son-istekler`, `/ornek/*`, `/baglanti`, `/gunluk`,
`/sahne/sifirla` (temel sahne, aşağıda; gövde `{kaynak?: panel|kisayol|oynatici}`, yanıt `{tamam, nesil, kaynak, ozet,
zaman, durum, senaryo}`). Köprü son durumu (sıfırlama nesli dahil) `apps/kopru/veri/son-durum.json`'a yazar ve açılışta
geri yükler (12 saat).

**Temel sahne (Sıfırla, 2 Kasım):** panel üst çubuğundaki **Sıfırla** (iki dokunuş) / **Esc, Esc** / oynatıcıda **⇧0**.
**8 Kasım:** senaryo **baştan** oynatılınca (duruyor → Oynat) köprü önce aynı sıfırlamayı kendiliğinden yapar (kaynak
`senaryo`, `SenaryoMotoru.sahneBagla`): eğitmenin elle çağırdığı her şey gider, senaryo temiz sahnede başlar; duraklatılmıştan
devam ederken sıfırlama yok (kullanıcı kararı; test `sahne.test.ts`).
KALIR: oda, bölge, ortam (mevsim/saat/hava/sis), ışık, Oda 2 güvenli alanı ve sütre, ayar değerleri (çatışma şiddet/yön,
izli mermi çıkış/sıklık, iniş yönü…), yüklü senaryo (durmuş, 00:00). GİDER: bütün figürler (yüklenmekte olanlar dahil),
efektler (2B/3B patlama, ateş, duman, toz, moloz, flaş, sarsıntı, uçuştaki iz ve tank mermisi), krater, çatışma, izli
mermi, helikopter, sesler (tek seferlikler, atış dizileri, konuşma kuyruğu; rotor hızla söner), senaryo oynatımı,
paneldeki helikopter iniş dizisi, DMX'te takılı flaş. Köprüde `SahneYoneticisi` (`apps/kopru/src/sahne.ts`): senaryo dur
→ figür temizle → tek durum yayını (`DurumDeposu.sahneyiTemeleDondur`) → `sahne/sifirla` (nesil++) → hemen kayıt → tek
günlük satırı; oynatıcıda `sahneTemizligi.ts` (adım başına try/catch); arazi kraterleri `AraziKatmani.kraterleriTemizle()`
ile yerinde geri alınır (ızgara yeniden kurulmaz). Bağlanan istemciye önce `sahne/senkron` (nesil; kaçırılan
sıfırlamada yerel temizlik), sonra `figur temizle`, sonra aktif figürler. Canlı önizleme en çok 5 sn'de bir ve yalnız
panel bağlıyken (`BaglantiDurumu.panel.sayi`); sıfırlamada (örtü eski kareyi tutuyorsa ilk temiz karede), yeni panel
bağlanınca ve sahne geçişi bitince hemen. Silah sesleri tek atışlık kesimler (`silah_tek_1..8.ogg`,
`araclar/silah-tek-atis.mjs`); lisans CC BY 3.0 (Vincent Sevedge), atıf gerekir.

**Yeni bilgisayar (9 Kasım 2026):** proje USB ile taşındı; kurulum, depo dışı içerik ve ilk yapılacaklar
`docs/yeni-bilgisayar-kurulumu.md` (devir notu). Yeni makinede ilk oturumda bunu oku, GPU'yu öğren, fps'i yeniden ölç.

## Mevcut durum (2 Kasım 2026)

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

**Eğitmen ekranı (10 Kasım, kullanıcı kararı: "teknolojiyi çok bilmeyen birine göre, sıfırdan"):** panel artık iki görünüm
(`Uygulama.tsx` `gorunum`, yerel kayıt `duvar.panel.gorunum`). **Eğitmen** (varsayılan) tek sayfa: üst çubuk (Oda 1/2, "Yer ve
hava" özeti, Senaryolar, tek bağlantı lambası "Duvar bağlı", Kilitle, Sahneyi temizle, Teknisyen) → **duvar şeridi**
(`egitmen/DuvarSeridi.tsx`: canlı önizlemeye dokun = yer seç, `oranAzimut` duvar başına perspektif eşleme; altta 5 yön düğmesi;
asker/yaralı/düşman işaretleri) → konu kartları (`egitmen/EgitmenEkrani.tsx`: Askerler, Yaralı + Durum (safha), Çatışma
(başlat/durdur, Az/Orta/Çok, izli mermi), Patlama ve ateş, Sesler, Hazır olaylar (makrolar); Oda 2'de Güvenli alan +
Helikopter). Çekmeceler (`egitmen/Cekmeceler.tsx`): Yer ve hava (bölge, Yaz/Kış, 4 saat, 6 hazır hava) ve Senaryolar (seç →
Oynat; "Test –" adlılar gizli). Oynayan senaryo üstte şerit (Duraklat/Devam/Bitir). Derece, kaydırıcı, teknik terim yok; stil
`egitmen.css` (Tema A belirteçleri, düğme ≥ 64 px). **Teknisyen** görünümü eski beş sekmeli panelin tamamı (ince ayar, senaryo
editörü, AAR, kurulum, günlük); F1–F5 ve M onu açar. Yeni eğitmen eylemi eklerken: sade Türkçe ad + bir satır ne olacağı,
seçili yere gitsin, teknik seçenek Teknisyen'de kalsın. Tarayıcı turu: `KOPRU=… node araclar/oyun-testi/panel-tur.mjs`.

**Panel Tema A (4 Kasım):** kullanıcı seçimi A + D2 + F (artifact "Eğitmen Paneli Tasarım Seçenekleri";
`tasarim-taslak/` depo dışı): `apps/kontrol-paneli/src/tema-a.css` stil.css'i ezer (cam kartlar, Manrope/JetBrains Mono
yerel `public/fonts`, bileşen durumları), `YonSecici.tsx` pusulanın yerine (Pusula.tsx silindi), `Simgeler.tsx` SVG grup
simgeleri (emoji yok). Tasarım sistemi `.interface-design/system.md` güncellendi; yeni bileşen ona uyar.
Önceki: **Kontrol paneli yeniden tasarlandı** (22 Ekim): "harekât masası" teması, sahne pusulası (yön seçimi
pusuladan; figür/patlama/helikopter/güneş/rüzgâr üzerinde), sol görev rayı (F1–F5), canlı sahne kartı +
hızlı efektler (1–5), bildirimler, gecikmeli kaydırıcılar, iki aşamalı onay, tablet düzeni. Tasarım
belirteçleri ve desenler `apps/kontrol-paneli/.interface-design/system.md`; yeni bileşen eklerken ona uy.

Kullanıcı UE öğrenmeye vakit ayıramıyor; "görsel şölen" için tam yetki verdi (ücretsiz içerik indir,
otonom çalış). Donanım yok; dizüstü GTX 1650 + Iris Xe (Chrome Iris Xe kullanıyor).

**Çatışma ve birlik (22 Ekim):** durum modelinde `catisma` (düşman yönü, şiddet, dost ateşi) ve
`oda2.helikopterYonu`; oynatıcıda `sahne3b/catisma.ts` (3B izli mermi, çarpma/sekme, dost ateşi, uzak
parıltı/patlama); figürler panelden yer seçilmeden hazır mevzi/tank noktalarına (`birlikNoktasiSec`,
boş nokta) yerleşir; panelde "Birlik çağır". Tank modelleri (CC-BY / CC0) manifestte; kuleli tank
(`kule`/`namlu`) düşmana döner ve top atar. Asker: Quaternius SWAT (CC0, `modeller/asker_swat.glb`)
Idle_Gun ↔ Idle_Gun_Shoot geçişi, elde tüfek (`silahModeli`, kemik adı GLTFLoader'da "WristR").
Oda 2 sütreleri: manifest `sutreler` (kum torbası, kaya, toprak yığını, bariyer; `modeller/sutre/`).
Bone/klip adları: GLTFLoader noktayı siler; kısa klip adı `klipBul` ile eşleşir.

**Helikopter ve izli mermi (27 Ekim):** helikopter hareketi saf uçuş modelinde (`sahne3b/helikopterUcusu.ts`,
testli: kavisli yaklaşma, virajda yatış, flare, kızakta sekme, 5 m askıdan burun aşağı kalkış, 80 m ileriye bakan
arazi kaçınması); rotor tozu zemine göre (`rotorTozu.ts`: kış kar, kırsal/dağlık toprak, ormanlık koyu toprak +
yaprak, üs/meskûn beton; `Helikopter3B.tozTuru` `araziAyarla`dan). İzli mermi "yön"ü artık iz doğrultusu: 0 seçilen
duvarın uzağından izleyiciye doğru, ±90 komşu duvar yönünden gelip seçilen duvarın önünden yandan geçer (kaynak da
kayar; kullanıcı kararı) (`catisma.ts` `izliAtis`, yardımcılar `izliYol.ts`); uzak iz ≥ 1,5 px kalın, başın 6 m
yakınından geçende "çat". **2 Kasım inceleme düzeltmeleri:** havadayken iniş noktası değişirse geçerli yaklaşmada
değilse pas geçme (35 m, yeni eksende 85–150 m'den yeniden yaklaşma), sahne noktayı yalnız plan/yaw/panel yönü
değişince seçer (sabit 12° yok); yeni resim panorama yüklenirken helikopter 3B'de uçmayı sürdürür (main.ts
`helikopter3B`, `panoramaYukleniyor`; önceden 2B siluete geçip baştan başlıyordu); belirirken yatış sarsıntısı yok;
kalkış iniş noktasının kendi yanından arkaya, "yok"ta 1,5 sn sönme; uzak kaynak yerden ≤ 12 m ve arazi ufkunun
≤ 1,5° üstü (`AraziUfku`; çatışmada da), kapalı doğruda mermi yamaca çarpar; izli akışta yakın zemin payı %20,
çarpma/"çat" sesi ≤ 1,5/sn; hedef yüksekliği döndürmeden sonra. Kırsal/dağlık hibritte önde ve sol önde
~115–205 m'deki sırt yüzünden orta duvarın izli mermilerinin çoğu sırtın arkasına çarpıyordu; 2 Kasım (stab/fps,
kullanıcı kararı) kaynak sırtın tepesine taşınır (`izliYol.sirtaTasi`: izleyiciden ≥ 80 m, sırt zemininin 1,5 m üstü;
çatışmada da; kırsal orta duvarda 60 m'ye ulaşan iz %25 → %96). Tarayıcıda gözle doğrulanmadı.

**Figür duruşları (23 Ekim):** `FigurKomutu.poz` (ayakta / comelmis / yarali) ve `islem: "poz"`;
yaralı = SWAT "HitRecieve" → "Death" (son karede kalır) + prosedürel nefes ve kol kaldırma (yardım
çağrısı, sesli), tüfek yere düşer; diz çökme prosedürel kemik ofseti (`figurler3b.ts`, Quaternius riginde
ayak kemikleri ayrı → ayaklar da taşınır; kuaterniyon normalize + klibin yazmadığı kemikler her kare
geri alınır). Manifest: `asker_yarali_3b`, `asker_diz_cokmus`, `animasyonlar.vurulma/dusme`. Panel:
"Yaralı asker", "Asker vuruldu!", "Sıhhiyeci gönder" (`yaninda=<id>`: yaralının yanına, ona dönük), satırda
Vuruldu / Diz çök / Yat / Kalk; duruşlar ayakta / comelmis / yatmis (prone, prosedürel) / yarali. Senaryo adımı `figur` (editörde
"Sahneye koy" → `senaryo_<adım>` kimliği, "Duruş değiştir" onu hedefler). Oynatıcı 3B hazır değilken
gelen figürler kuyruğa alınır (yeniden açılışta kaybolmaz). Tarayıcıda doğrulandı. Test için
`?fov=12`'den küçük değer 90'a düşer (`fov > 10` şartı); 3B kameralar `?fov=`'u izler.

**Performans (23 Ekim):** gölge haritası karede bir kez (`shadowMap.autoUpdate=false`, `ciz()` başında
`needsUpdate`), iskeletli mesh'ler tek Skeleton paylaşır (`iskeletleriPaylastir`), krater dumanı 3/sn + toplam
320 topak sınırı. Iris Xe, 1277×239: boş sahne 60 fps; 4 figür + çatışma + 16 krater ≈ 38 fps (önce 30).
HUD'da `çizim/duvar` sayısı var (2 Kasım FPS turu: aşağıda Stabilizasyon). **Ölçüm tuzağı:** Claude-in-Chrome
sekmesi/penceresi arka planda kalınca Chrome kareyi kısar (10–16 fps görünür); gerçek fps için normal Chrome penceresinde
HUD'a bak (PowerShell `CopyFromScreen` ile ekran yakalama işe yarar). Üst çubuktaki "Oynatıcı ×N" sayısı 1'den büyükse
birden çok oynatıcı sekmesi aynı GPU'yu paylaşıyor demektir; fazlasını kapat. Ölçerken başsız tarayıcı ve ağır CPU işi
(test, derleme) de olmamalı: Iris Xe güç bütçesini CPU ile paylaşır, uzun yükte ısınınca orta 52–60, yuksek ~48 fps.

**23 Ekim öğleden sonra (otonom tur):** güneş yüksekliği makullük sınırı (gündüz ≥18°), gece panoramasında
ay ışığı sınırı (zayıf/mavimsi), pusulada yaralı/diz çökmüş/yatmış işaretleri, örnek senaryolar
"Ateş Altında Yaralıya Müdahale (TCCC)" ve "Gösterim – Kırsal Tam Tur (4 dk)" (depo: mevcut kuruluma eksik
örnekler otomatik eklenir; değişen örnekler için `apps/kopru/veri/senaryolar.json` elle yenilenir), kalite
kademesi (oynatıcı `?kalite=`, panel Sistem > Oynatıcı ayarları), prosedürel HESCO, sıhhiyeci + `yaninda`,
prone duruşu, editörde "Yanına yerleş", açılışta durumun yeniden uygulanması (sütre/helikopter kaybolmuyordu).
Köprüyü yeniden başlatma: port 4000'i dinleyen süreci durdur, `Start-Process cmd /k npm start`. Sonra: canlı
duvar önizlemesi (oynatıcı → köprü → panel, `onizleme` mesajı), "Asker vuruldu" hızlı düğmesi (6), serbest
yerleşim (`serbestYerlesim`: yaralı/sıhhiyeci plan dışı; Oda 2'de 3,5 m), figür yükleme sırasında mevzi
rezervasyonu, panorama yüklenirken efekt kuyruğu, dağlık patlama noktaları ≤13 m, SWAT figürler haki tonlu,
fare imleci 3 sn'de gizlenir, `docs/gosterim-rehberi.md`. Köprü son durumu diske yazıp açılışta geri yükler;
"Sahneyi sıfırla" (`/sahne/sifirla` + `sahne` WS mesajı); oynatıcı uyarıları köprü günlüğüne (`gunluk` istemci
mesajı), önizleme fps/kalite bilgisi taşır; HUD varsayılan kapalı; panelde `figurYardimcilari.ts`.

**3B arazi (23–26 Ekim):** `sahne3b/arazi.ts` (yükseklik haritası, splat doku karışımı, krater deformasyonu, çimen demetleri, Poly Haven CC0 kaya/çalı/fidan LOD), `gokyuzu.ts` (tam kip), `uzay.ts` zeminY. Kip: `?arazi=kapali|hibrit|tam` (yerel kayıtta kalır); varsayılan (`main.ts` `ARAZI_VARSAYILAN`) kırsal/dağlık/ormanlık/üs hibrit, meskûn mahal kapalı (panoramada binalar 5–15 m'de, 3B zemin duvar diplerini gömüyor). 26 Ekim: 5 bölge profili (doku seti, bitki seti `BITKI_SETLERI`, hibrit görünür yarıçap `yaricap` 30–160 m + kenar çanağı `kenarCukuru`), ormanlık bitkileri (fidan/çalı/eğrelti/kütük), normal haritası teğet çerçevesi düzeltmesi, `sok()` GPU kaynaklarını bırakır, krater molozu çukurun yeni zeminine, arazi yeniden kurulunca figür/sütre `zemineOturt`, düşük kalitede 1K doku, eksik içerik uyarısı köprü günlüğüne. İçerik `icerik/arazi/` (depo dışı; `araclar/arazi-indir.mjs`, `araclar/arazi-sadelestir.mjs`, lisans `icerik/arazi/LISANS.txt`). **Kullanıcı bu katmanı değiştirmeyi, yeni modeller ve yeni alan eklemeyi planlıyor (26 Ekim): derin/çok ajanlı inceleme yapma, önce yönü sor.** Açık: orman ayarı (çimen 0,35, gölge lekesi, 2–3 m fidan) gözle doğrulanmadı ve yaz orman panoraması park çimi olduğundan 3B orman tabanıyla renk uyumsuz; tam kipte gök ufukta beyaza patlıyor (olası neden: three `Sky` HDR çıktı + `NoToneMapping`); Oda 2 düzlük kontrolü; belgeler.

**Stabilizasyon (2 Kasım; `stab/sifirla` + `stab/gecis` + `stab/fps` → `stab/birlesim`):** tek düğmeyle temel sahne
(yukarıda "Temel sahne"), eski sahne canlı kalan geçiş (yukarıda "Sahne geçişi"), FPS: bitki ayıklama (8 azimut sektörü,
`BitkiHucresi`), saydam yapraklar tek geçiş, ot/taş 50 m / çalı 80 m, kaya LOD, kısmi krater normali (`araziIzgara.ts`),
bölge değişiminde arazi malzemesi ve ortak dokular korunur, iz/parçacık yalnız canlı aralık; Iris Xe 1920×360 kırsal
hibrit yuksek 19 → 54 fps, orta 25 → 58, dusuk 40 → 60, 4 asker + çatışma orta 18 → 55–60 (stab/fps dalında ölçüldü,
birleşik dal yeniden ölçülmedi). Birleşimde: sıfırlama
araziyi `kraterleriTemizle()` ile yerinde düzeltir (ara katman kalktı, yeniden kurulum/takaslı geçiş yok); geçiş
sürerken sıfırlama gelen panoramayı ve ertelenen bölge işlerini bozmaz, örtüdeki eski kare ilk temiz karede kalkar;
önizleme 5 sn / panel koşulunu korur, örtüyü çizer, sıfırlamada temiz kareyi bekler, geçiş bitince hemen gider; kalite
tek yerde çözülür (panel varsayılanı Otomatik); arazi `dokularHazir` (solma bulunamayan dokuyu beklemez). Tarayıcıda
uçtan uca bakılmadı (birim test + derleme): Esc Esc / ⇧0, geçiş sırasında sıfırlama, krater geri dönüşü, sırt üstü
namlu parıltıları, "Gösterim – Kırsal Tam Tur" ve "Dağlık pusu" duvarda denenmeli. Ayrıntı ve kalan takılmalar:
`docs/duvar-oynatici.md` (Sahne geçişi, Bitki ayıklama, Köprü ile sözleşme, Sınırlamalar).

**Hava (3 Kasım):** 3B sahnede 2B sis/yağış/karartma kapalı. Panorama işçide çözülürken gök maskesi çıkarılır
(`sahne3b/gokMaskesi.ts`; manifest `"gok": false` kapatır, üs kış gündüz beton tavan). `sahne3b/gokOrtusu.ts` three arka
planının yerine çizer (`sahne.background` null): akan bulut ve kapalı gök, zemin tonlaması, yükseklik sisi (3B sisle aynı
doğrusal eğri; sis nesnesi artık her kipte sahnede), şimşek aydınlanması. Kapalı havada güneş söner, `dolgu` artar.
`sahne3b/yagis3b.ts` 3B yağmur/kar (gölgelendiricide, iki katman, 2,5 m'den yakında yok). Şimşek: efekt `simsek`
(`tipler.ts` EfektTuru), ortam `simsek?: boolean` → köprü `firtina.ts` 12–40 sn'de bir çaktırır, DMX çift flaş,
`ses.gokGurultusu` (mesafe/343 sn gecikme; manifest `sesler.gok_gurultusu` yoksa sentez); panel Ortam › Şimşek. Başsız
Chrome'da görüntüyle doğrulandı (kırsal, dağlık, gece, kar, tipi); duvarda bakılmadı. Ayrıntı `docs/duvar-oynatici.md`
"Hava". Kalan: yağmur sıçraması/ıslak zemin, bitki sallanması, renkli duman, aydınlatma fişeği, yıldırım çizgisi.

**Kendi askerimiz (3 Kasım):** `icerik/modeller/asker_komando.glb` = Meshy modeli (A-Poz açık, Remesh 30K) + Meshy rig'i
+ 38 Mixamo klibi (`araclar/mixamo-aktar.py`, Blender başsız; yön Mixamo'dan, kemik roll'u Meshy dinlenmesinden —
düz dünya-uzayı kopyası bacak/kol roll farkı yüzünden mesh'i "çöp adam" gibi inceltiyordu, 3 Kasım düzeltildi). **Mixamo otomatik rig bu
modeli reddediyor** (A/T-poz fark etmez); Meshy rig + aktarım yolu kullanılır. Manifest `komando_*` kayıtları;
`animasyonlar.comelmis/yatmis` klip tabanlı duruş (`figurler3b.ts` `aktifPoz`), `kemikler` Mixamo adları. Örnek senaryo
`sn_komando_gosterimi`. Tüfek ele kabaca oturuyor (konum/dönüş ince ayarı duvarda). **3 Kasım akşam duvarda görülen
"askerin vücudu zeminin altında" hatası:** Mixamo Without Skin FBX'inde armatür 0,01 ölçekli ama kemikler metre; kalça 1 cm'ye
inip 37 klipte gövde 0,97 m gömülüyordu. Betik artık kalça yüksekliğini birimden bağımsız ölçer, yatay kalça konumunu Meshy
dinlenmesinde sabit tutar (Mixamo klipleri in-place değil), "(N)" dosya ekini klip adından kırpar; GLB yeniden üretildi,
başsız tarayıcıda doğrulandı. Ayrıntı `docs/duvar-oynatici.md` "Kendi 3B askerimiz". Meshy'de aynı reçete diğer modeller
için: Image to 3D → Remesh; askerde Poz: A-Poz şart.

**Meshy A listesi (3 Kasım akşam, Meshy CLI ile API üretimi):** 13 model üretildi ve entegre edildi (≈ 505 kredi):
4 asker (`asker_komando_bere/telsizci/sihhiyeci/kis.glb`, API rig'i 24 öneksiz kemik + 38 Mixamo klibi; manifest
`komando_bere_*`, `telsizci_*`, `sihhiyeci_*`, `komando_kis_*`), piyade tüfeği (`nesneler/tufek_piyade.glb`, tüm
komando/bere/kış/telsizci kayıtlarında; konum/dönüş **ölçülür, tahmin edilmez**: `window.duvar.silahHizala(id, klipler)`
(`sahne3b/silahHizalama.ts`, skill `.claude/skills/silah-soketi`); API rig `[0.114,0.187,-0.111]/[156.4,-27.4,72.9]`,
web rig `[0.096,0.164,-0.144]/[155.6,-45.9,74.7]`; bekleyen/nişan/yürüyen kliplerde doğrulandı — önceki "nişan klibinde
kollar yana" bulgusu yanlış tahmin edilmiş dönüşten kaynaklanıyordu), palasız gövde + prosedürel rotorlu helikopter (`nesneler/helikopter_govde.glb`, manifest
`helikopter.rotor`), TCCC nesneleri (`nesne_*`: turnike, çantalar, sedye, duman bombası, kum torbaları; `olcekSabit`),
kum torbası duvarı (`sutre.ts` `torba_duvari`, Oda 2 operasyonel bölge). Araçlar: `araclar/meshy-uret.mjs` (plan →
üretim/indirme, kaldığı yerden), **`araclar/model-sadelestir.mjs`** (meshoptimizer, dikiş korur; Blender Decimate
`model-hazirla.py` UV'yi yırtıp "kırık porselen" görüntüsü verdi, kullanma), `araclar/helikopter-hazirla.py`,
`araclar/glb-bilgi.mjs`. `mixamo-aktar.py`: kemik adı eşlemesi, 85° eşik, GLB girdi. Tuzaklar ve kalanlar
`docs/duvar-oynatici.md` "Meshy üretim hattı". **Düzeltildi (4 Kasım):** açılışta bağlantıyla gelen figürlerin
kaybolması — WebSocket manifest isteğinden önce kurulunca `klipler.tanim()` boştu ve komut 2B yola düşüp atlanıyordu;
artık manifest gelene dek kuyrukta (`figurYonlendirme.ts`, testli; Playwright'ta manifest 4 sn geciktirilerek doğrulandı).
Ayrıca köprü eski klip adlarını (`asker_*`, `tank_eski` …) yenilerine çevirir (`figur.ts` ESKI_KLIPLER, günlüğe uyarı):
eğitmenin kayıtlı senaryoları ve geri yüklenen durum eski adlarla boş sahne veriyordu.
Bu oturumun kalan düzeltmesi: "askerin vücudu zeminin altında" (kalça yüksekliği, fb03730).

**Yangın, duman, panel (3 Kasım gece):** efekt `yangin` / `yangin_sondur` (`sahne3b/yangin.ts`: alev + kor + kara duman +
titreyen ışık, rüzgârla sürüklenir; senaryo adımı `efekt`), **yangın sesi** (4 Kasım: konumlu sentez uğultu + tıslama + çıtırtı, manifest `sesler.yangin` kaydı varsa döngü; docs "Yangın sesi"), duman topakları güneş yönüne göre gölgeli (parçacık
gölgelendiricisi `golgeleme`/`isikYonu`), `Parcacik.renkSon`. **4 Kasım duman/toz yenilemesi:** duman dokuları doğrusal (sRGB işareti bütün dumanı karartıyordu), 2×2 doku atlası (`kare`), parçacık başına `golge`, rüzgâra göre sürtünme (`surukle`), toz bulutu yoğun püskürme + tüten kaynak + 10–16 sn geniş yayılma, patlama sütunu alçak + toz eteği (docs "Duman ve toz yenilemesi"). Patlama kraterde 2,5–3,5 sn'lik küçük yangın bırakır (`YanginKatmani` `omur`; docs "Patlama artığı yangın"). Patlama 6 küçük varyanttan birini alır, ardışık aynı gelmez (`PATLAMA_VARYANTLARI`; docs "Patlama varyantları"). Panel: manifest `grup`/`simge`/`eski`; eski Quaternius
modeller gizli, hızlı düğmeler yeni Meshy modellerini kullanır. Kullanıcı kararı: **alan/yapı modülleri (meskûn mahal,
hangar) listesi şimdilik çıkarılmayacak**; ortam panoramada kalır. Ayrıntı docs "Yangın ve duman aydınlatması", "Panel".

**4 Kasım oturumu kapanış:** panel Tema A, açılış figür kuyruğu, eski klip eşlemesi, yangın sesi, duman/toz yenilemesi,
patlama artığı yangın ve 6 varyant bitti (son commit ec42dbc). Duvarda gözle/kulakla bakılmadı: toz yoğunluğu, yangın
sesi seviyesi, tablet paneli. Kredi bekleyen: T5/T9/T12 yeniden üretimi (kullanıcıya sor).

**Genel değerlendirme (8 Kasım):** `docs/degerlendirme-8-kasim.md` — oyun geliştirici + TCCC eğitim gözüyle 3 bağımsız inceleme
(oynatıcı 25, köprü/panel 25, figür/içerik 20 bulgu) + bizzat doğrulanan 8 bulgu, eksik sistemler ve öncelikli öneri listesi
(A: gösterim öncesi onarımlar — "Asker vuruldu" düğmesi `komando_*` adlarıyla çalışmıyor, köprü bozuk senaryo adımında çöküyor,
bozuk JSON eğitmen senaryolarını siliyor, çizim döngüsü hatada donuyor, her yangın yeni PointLight ile gölgelendirici yeniden
derletiyor, ortam sesi yarışı, uzak patlama sesinde mesafe gecikmesi yok). Bu belge kapanmadan yeni özellik yerine A listesi
yapılmalı. **A listesi 8 Kasım'da bitti**; **B listesinden 9–13 bitti** (API doğrulama `dogrulama.ts`, senaryo Durdur/1 Hz/`senaryolar` WS,
hata bildirimleri, ping/pong, kopukluk şeridi, 44 px, taslak kaydı; figür bakışı `sahne3b/bakis.ts`, idle varyasyonu, Mixamo geçiş
klipleri; senaryo adımları `bekle_onay` (Devam/Boşluk) ve `safha`; TCCC safhası `durum.safha` → sıhhiyeci ateş altında siperde
bekler, taktik sahada yaralıya yürür; canlı sahne kartında safha seçici). Kullanıcı kararı (8 Kasım): bakış önceliği düşman >
yaralı > son patlama, sıhhiyeci her zaman yaralıya; safha davranışı aktif. **B-14/15 de bitti**: parçacık kartları göze dönük + sis + sıralama, alev dokusu doğrusal; `?dpr=cihaz` ve DPR uyarısı, yan
duvar 16:9 uyarısı, fov ≤ 120. **B listesi tamam.** **C-16 AAR** (`kopru/olaylar.ts`, `veri/olaylar/<gün>.jsonl`, panel Senaryo sekmesi "Tatbikat günlüğü",
M tuşu not, CSV) ve **C-17 crack–thump** (`mesafeSesi.ts`) bitti. **C-18 havan** (efekt `havan`: ıslık 1,4 sn → patlama + gecikmeli DMX flaşı) ve **C-19 gece projeksiyon modu** (`geceModu.ts`,
`?gece=projeksiyon`) bitti. **Aydınlatma fişeği** (efekt `fisek`, `sahne3b/fisek.ts`) bitti. **C-20/21 kısmen**: figür/HESCO kaynak bırakma, iskeletli ağ ayıklaması (sınır küresi ×2,5),
matris güncellemesi karede bir, krater birikim sınırı. **AAR tekrar oynatma** (`kopru/tekrar.ts`), **TCCC sayaçları**, **makrolar** (`kopru/makro.ts`; helikopter dizisi
de köprüde), **kilit kipi**, `rastgele_bekle` + `beklenen` adım alanları bitti. **Oynatıcı turu (8 Kasım gece):** namlu flaşı telegrafı, kaynak sayaçları (HUD), WebGL bağlam kaybı, efekt
kotası, olay kuyruğu/sahne saati, `?tohum=`, tembel GLB, panorama küçültülmüş çözme, bitki sallanması, zemin eğimi, irkilme,
kademeli nişan, üst/alt gövde katmanı, dinamik kalite, `yang` yan görüntü genişliği bitti (başsız tarayıcıda hatasız; duvarda
gözle bakılmadı). Kod dışı/atlanan: VFX plakaları, yeşil perde, Türkçe kayıtlar; KTX2, animasyon kanal ayıklama/LOD, GPU zaman
sorgusu, kontrol sahipliği, ayak IK/ragdoll, ekipman sallanması. **Kullanıcı gözlemleri (8 Kasım gece, docs/degerlendirme-8-kasim.md son bölüm):** "İşlem başarısız" = eski köprü süreci → `SOZLESME_SURUMU` uyuşmazlık şeridi (sözleşme değişince artır); iç içe asker → `bosYereKaydir` + başka duvara atlamama; koşan asker duranlardan dolanır (`kacinmaSapmasi`), koşan/yürüyen seçilen yönden doğar; tanı: `window.duvar.figurler()`. Kaçınma kutupsal (`halkaKacinmasi`, hat yarıçapı sabit; ölçüm hareketli–duran ≥ 1,38 m). Test senaryosu **"Test – Figür Davranışları (4 dk)"** (`sn_figur_davranis_testi`) bütün figür davranışlarını onay adımlarıyla gösterir; eski test gösterimleri (Tam Tur, Kendi Komandomuz, Yeni/B Listesi) silindi. Bekleyen kalan: animasyon kanal ayıklama/LOD; AAR tekrar oynatma ve TCCC sayaçları;
`rastgele_sure`/`beklenen` adım alanları; yan duvar için kısmi görüntü alanı. Duvarda gözle bakılmadı (bakış genliği, yürüyüş hızı, geçiş klipleri, sisli parçacık, köşe). Domain bilgisi için skill `askeri-simulasyon-tasarimi` (`.claude/skills/`; değerlendirme/öneri işinde yükle);
dış skill'ler: threejs-*, create-game-vfx, build-game-audio-feedback, game-audio, game-design-theory, game-development, game-ui-design.

**3B meskûn mahal / alan katmanı (9 Kasım):** kullanıcı alan tasarımına Meshy topluluk modelleriyle (CC0, ücretsiz indirme)
başladı; ölçüt **Türkiye'ye uygunluk** (Amerikan banliyö evi, okul otobüsü vb. elenir). 515 aday tarandı, 122'si artifact
"Meshy Alan Modelleri"nde (onaylar db `secim/liste`), kullanıcı 80'ini seçti. `sahne3b/alan.ts` (`AlanKatmani`) manifest
`alanlar[bolge]` planını uygular: meskûn mahalde 18 m cadde, iki yanda hasarlı/ayakta apartmanlar, sonunda yıkık kule;
gök/dağlar/ışık dağlık panoramadan (`arkaPlanBolge`), arazi hibrit 130 m, sokağa özel yerleşim noktaları; `?alan=kapali`
eski görünüm. İçerik hattı `araclar/alan-modelleri.json` + `alan-modelleri-hazirla.mjs` (`--tasi`, sadeleştirme, gerçek
ölçü; çıktı `public/icerik/modeller/alan/` depo dışı). İndirme yalnız sitedeki İndir düğmesiyle (tarayıcı `.meshy` →
GLB); hızlı gönderi açmak Meshy güvenlik duvarında IP'yi 403'e düşürür (model başına ≥ 40 sn). 74 model indi (6'sının indirmesi kapalı) ve
işlendi: meskûn mahalde 64 öğe (14 bina, kontrol noktası, araçlar, moloz, lamba/direk, çatı ısıtıcısı), kırsalda taş
köy, dağlıkta iki taş ev. Plan v2 (figür/efekt): askerler bariyer arkasında 4–7 m, tank şeridi, boş iniş alanı, düşman
pencere/çatı mevzileri (`dusmanMevzileri`), izler yapıya çarpar, helikopter binaları aşar; denetim
`araclar/alan-plan-denetle.mjs`; toz/duman yapıdan geçmez (`parcacikIt`); asfalt yol, bordürlü kaldırım, parke meydan, orta çizgi (`sahne3b/sokak.ts`, Poly
Haven CC0, `araclar/sokak-doku-indir.mjs`). Ayrıntı `docs/duvar-oynatici.md` "3B meskûn mahal".

**Orman, dağ, kırsal bitki örtüsü ve kış (9 Kasım gece):** Meshy topluluğundan 60 CC0 ağaç/çalı/kaya (artifact "Meshy Orman
ve Dağ Modelleri", 66 seçim; #200 kenevir, #205 deniz yosunu çıktı ve elendi, #327/#330 indirilemedi, #243/#252 pişirmede kara döndü). Hat:
`araclar/bitki-modelleri.json` + `alan-modelleri-hazirla.mjs --yapilandirma` + `araclar/model-pisir.py` (Blender: Decimate,
takılırsa voksel; yeni UV'ye renk/normal pişirme; meshoptimizer Meshy atlasında takılıyordu). `arazi.ts`: `agac` sınıfı
(uzak kopya 40 m, gövde aralığı, alanca eşit dağılım, yol boyu kavak sırası `bitkiYerlesimi.ts`), kış seti (`KIS_YERINE`:
karlı iğne yapraklı, yapraksız ağaç; kışa girince arazi yeniden kurulur) + bitki/kaya/çimen kar gölgelendiricisi,
kışın çimen saman rengi ve dibi karda; orman zemini yeşile kayar (`yesillik`), çimen sık; ormanlık 3B alan (dağlık arka plan,
110 m). Ayrıntı `docs/duvar-oynatici.md` "Orman, dağ ve kırsal". Duvarda gözle bakış ve gerçek fps ölçümü bekliyor.

**Gerçekçilik turu (10 Kasım):** ağaçlar "üçgen/yapmacık"tı: Meshy ağaçları bizim hattımızda 1,5 M → 6 bin üçgene
inmiş, normal haritası atılmış, düz gölgeli (köşe/üçgen 3,00). Ağaçlar artık **ez-tree** (`@dgreenheck/ez-tree` MIT,
`sahne3b/ezAgac.ts`: gerçek dal + alfa yaprak kartı, bizim MeshStandard/kar/rüzgâr hattında; `ez_` klasör adları,
`~n` varyant, kışta yapraksız karşılık); Meshy kaya/kütük `normalYumusat.ts` ile yumuşak normal; çimen gürültü lekeli,
yukarı normalli; dağlık zemin `tasli_zemin`, kayalar yamaca oturur. **Görsel denetim:** `node araclar/goruntu-al.mjs
--sahneler "ormanlik:yaz:12" [--fov 30]` (Playwright + kurulu Chrome/NVIDIA, PNG `araclar/_goruntu/`; Claude görüntüyü
okuyup değerlendirir). Bedel: orman 1920×360 GTX 1650 121 → 82 fps. Ayrıntı `docs/duvar-oynatici.md` "Gerçekçilik turu".
**Meskûn performansı (10 Kasım):** yavaşlığın asıl nedeni ekran kartı belleğiydi (alan dokuları ≈ 1,2 GB, GTX 1650
4 GB); `alan.ts` `ALAN_DOKU_SINIRI` kaliteye göre küçültür; ayrıca 28 ağır alan modeli `araclar/model-sadelestir-izinli.mjs`
(meshoptimizer 1.1 Permissive) ile 7,8 M → 1,3 M üçgen (depo dışı içerik, yedek `meshy_output/alan_yedek_10kasim/`).
Meskûn 1920×360 yuksek 57 → 86 fps. Ayrıntı docs "Meskûn cadde performansı". Bu ölçüm öncesi:
**Projeksiyon PC (10 Kasım ölçümü, 5760×1080 tam yük):** GTX 1650'de meskûn 13–14, diğerleri 19–29 fps; öneri RTX 5070 Ti /
4070 Ti Super 16 GB (asgari 5070/4070 12 GB), oda başına bir PC. Chrome için Windows GPU tercihi "Yüksek performans" şart.

**Sonraki oturum (10 Kasım kararı): genel kontrol — hata ayıklama + geliştirme.** Önce `docs/devir-10-kasim.md`
(bugün değişenler, doğrulanmayan 10 madde, ölçüm araçları `araclar/olcum/`).

**Oynayarak test (10 Kasım akşam):** `araclar/oyun-testi/` (Playwright: sahneyi köprü API'siyle oynatır, kare çeker, figür
kemiklerini kare kare ölçer: sıçrama, ayak kayması, dönüş hızı). Meskûn mahal turu: 14 figür/ateş hatası düzeltildi
(çömelik "Hit Reaction" ayaktaki askerde 27 cm sıçrama → duruşa uyan klip + 3 ölüm çeşidi; dönüş hızı sınırı; hız klibin
doğal hızına uyar `KLIP_DOGAL_HIZI`/`hareketUyumu`: yürüyüş 1,3, koşu 3,45 m/sn; "Standing Up" kırpma `gecisAraligi`; namlu
gerçek tüfekten `atisNoktalari`; diz çökmüş nişan klibi; ateş klibi salvoyla eş zamanlı; sol el IK `solEliOturt`; ateş
kesilince son düşman yönüne bakar; nefes + çevre kollama). Düzeltilmeyen 14 bulgu ve öneriler: `docs/oyun-testi-10-kasim.md`
(açıkta dimdik ateş, yaralının önünün kapanması, Oda 2 sütre–alan iç içeliği, helikopter 58 m, kışta yalnız zemin karlı,
zayıf yağmur, fişek görüş alanı dışında). Figür/animasyon değişikliğinden sonra `node araclar/oyun-testi/meskun-figur.mjs`.
**Siper alma + yaralı görüş hattı (10 Kasım gece, kullanıcı onayı):** çatışmada sütre arkasındaki asker çöker, ateş için
doğrulup yeniden çöker, açıktakilerin yarısı diz çöker (`siperiGuncelle`; panel Çatışma › Siper al, `catisma.siperAl`
isteğe bağlı alan, varsayılan açık, `SOZLESME_SURUMU` 4); yaralının önündeki asker yana çekilir (`gorusHatlariniAc`). Test:
`araclar/oyun-testi/siper-ve-yarali.mjs`. Rapordaki açık bulgulardan 1 ve 2 kapandı; sıradaki 3–9.
**Gösterim senaryosu "Meskûn Mahal – Kuşatma (film sahnesi, 4 dk)"** (`sn_meskun_kusatma`, 57 adım, onaysız akar): akşamüstü
devriye → havanla temas, siper, yangın → yaralı + sıhhiyeci (safha) → gece, fırtına, fişek altında karşı taarruz → şafak.
Baştan sona izleme testi: `node araclar/oyun-testi/senaryo-izle.mjs --id <id> --kareler 22,47,...` (3840×720 başsız: en az
35,8 fps). Bu test bir donmayı yakaladı: yangın/fişek ışık havuzları boşta `visible=false` idi; three görünmeyen ışığı
saymadığından ilk yangın/fişekte 17–20 program yeniden derleniyor, 3+ sn donuyordu. Havuz ışıkları artık hep görünür
(boşta parlaklık 0): program sayısı sabit, en uzun kare 56 ms. **Yeni ışık eklerken havuzu hep görünür tut.**
**Sıhhiyeci müdahale döngüsü (10 Kasım, kullanıcı gözlemi: "çağırma loopunda kalıyor"):** `sihhiyeci_sihhiyeci` /
`komando_sihhiyeci` ("Kneeling Pointing" bekleme klibi + `yaninda`) artık döngüde: dik diz çökme ("Kneeling Idle", 2–6 sn)
↔ yaralının üstünde elle çalışma ("Administering Cpr" 0,6× hız, dik diz çökmeyle %50 harman: tek başına gövdeyi yere
yatırıyor), her üç turda bir tek işaret; ağırlıklar elle sürülür (`mudahaleyiGuncelle`, `MUDAHALE_KLIPLERI`). Sıhhiyeci
yaralının önüne değil yanına (izleyiciye göre yanal 1,35 × 0,6 m) yerleşir. Gerçek turnike/sargı klibi hâlâ yok.
**Aynı gün kullanıcı gözlemleri:** (1) koşan asker bariyerin içinden geçiyordu: `halkaKacinmasi` figürden kaçarken sabit
engele bakmıyordu (1,4 m dışa açılıp bariyer hattına giriyordu); artık her sapma adayı figür + sabit engel birlikte
değerlendirilir (`aciklik`), test `araclar/oyun-testi/kosan-engel.mjs` (5 geçişte engel içinde 0 kare). (2) "diz çökerek /
yatarak ateş eden yok": siper almada açıktaki askerler %40 diz çöküp, %30 yatıp (`siper.mod "yat"`), %30 ayakta ateş eder;
diz/yatan atışında göğüs geri teper. Sütre arkasındakiler bilerek ayağa kalkıp ateş eder (bariyer 1 m, diz çökmüş namlu
bariyerin altında kalır). **Ölçüm tuzağı:** kullanıcının oynatıcı sekmesi açıkken oyun testleri hem fps'i 3 kat düşük
ölçer hem kullanıcının sahnesini sıfırlar; `/api/baglanti` `oynatici.sayi` > 0 ise testleri **ayrı köprüde** koş:
`cd apps/kopru && PORT=4100 VERI_KLASORU=<geçici>/ node dist/index.js`, sonra `KOPRU=http://127.0.0.1:4100 node araclar/oyun-testi/...`.
**Üçüncü tur gözlemler:** aynı yaralıya gönderilen sıhhiyeciler iç içeydi (yerleşim yalnız sabit engele bakıyordu; artık
figür + başkasının ayırdığı müdahale/bekleme yeri de dolu sayılır, 12 aday nokta); koşan askerde çatışma sırasında üst gövde
ateş katmanı tüfeği havaya dikiyordu (katman yalnız ≤ 2 m/sn ve düşmana ± 35° yürüyen figürde); klip hız tavanı %30 → %20
(yürüyüş 1,2, koşu 3,18 m/sn); sol el IK hedefi bilek (merkezin 9 cm önü, 8 cm altı).
**Sıhhiyeci dağıtımı:** panel "Sıhhiyeci gönder" hep son yaralıyı seçiyordu (4–5 yaralıda hepsi tek askere toplanıyordu);
artık başında en az sıhhiyeci olan yaralı seçilir (`figurYardimcilari.sihhiyeBekleyenYarali`; hızlı dokunuş için bekleyen
görev listesi), düğme altında "N yaralı sıhhiyeci bekliyor".

**Sadeleştirme (11 Kasım, kullanıcı kararı):** mevsim yalnız **yaz/kış**, zaman yalnız **gündüz/gece**; saat kaydırıcısı ve ara
dilimler (şafak, sabah, akşamüstü, alacakaranlık, ilkbahar, sonbahar) panelden ve simülasyondan çıktı. `OrtamAyarlari.saat`
alanı duruyor ama yalnız 12 (gündüz) / 23 (gece) taşır (`tipler.ts` `GUN_ZAMANI_SAATI`, `gunZamani`, `ortamiIndir`); köprü eski
senaryo, ön ayar ve kayıtlı durumdaki ara değerleri indirir (06–19 gündüz). Panelde Gündüz/Gece tıklanır (Eğitmen çekmecesi,
Teknisyen › Ortam, senaryo editörü). Alacakaranlık panoramaları yalnız eksik gece birleşiminin yedeği. Yeni saat/mevsim
seçeneği ekleme. Ayrıntı docs/duvar-oynatici.md "Yalnız yaz/kış ve gündüz/gece".

**Film görünümü denemesi (11 Kasım; kullanıcı örnek Unreal paketindeki görüntüyü hedef gösterdi, "denemeyi yap" dedi):**
Film görünümü artık **varsayılan** (kullanıcı onayı; `?gorsel=sade` eskiye döner, düşük kalitede kendiliğinden sade; yerel kayıtta kalır). Karar noktası: bu deneme yetmezse görüntü Unreal'a
taşınır (panel/köprü kalır). İçerik: son işlem katmanı `sahne3b/sonIslem.ts` (temas gölgesi, parlama, ACES film tonu); manifest
`alanlar.<bolge>_film` eki (`alan.ts filmPlani`: `cikar`/`ekle`/`dokuntu`/`aracRotasi`/`yikilabilir`); Sketchfab CC-BY taramaları
(`araclar/sketchfab.mjs ara|indir`, anahtar `SKETCHFAB_TOKEN` ortam değişkeni; `glb-onizle.py`, `sketchfab-hazirla.py`,
`sketchfab-modelleri.json`; çıktı `icerik/modeller/alan/sf_*.glb` depo dışı, ham `sketchfab_indirilen/`, atıf `*.kaynak.json`);
`dokuntu.ts` (saçılmış kırıntı), `sokak.ts` kir + su birikintisi; efektler `zirhli_arac` (`aracOlayi.ts`: Kirpi gelir, durur, ateş
açar) ve `duvar_yik` (`yikilanDuvar.ts`), sözleşme 5, Eğitmen ekranında iki düğme. Test `araclar/oyun-testi/film-olaylar.mjs`,
görüntü `goruntu-al.mjs --gorsel film --bulut 0.55`. GTX 1650 3840×720 başsız: sade 49, film 40 fps. Örnek paketin meskûn haritası
referans: `araclar/_goruntu/ornek/meskun_2.png`. Açık: Kirpi tekerleği dönmez, duvar düz renkli tuğla, asker noktaları yeni
düzende denetlenmedi. Dağlıkta da var (`daglik_film`: kum torbası mevzi, cephane sandıkları, taranmış kayalar `ton` ile bozlaştırılmış,
sırtta gözetleme kulesi ve dalgalanan Türk bayrağı `bayrak.ts`); kışta alan modelleri karlanır (`alan.ts karEkle`: yukarı bakan yüzeyler); dağ mevzi noktaları `daglik_film.noktalar`; senaryolar `sn_film_gorunumu`, `sn_film_dag_mevzii`. Yıkılan duvar Poly Haven tuğla
dokulu. Görüntü/test **ayrı köprüde** (`--kopru http://127.0.0.1:4100`), kullanıcının sahnesini değiştirme. Meshy üretimi için önce sor.

**Amaç ve sonraki oturum (10 Kasım kapanış):** duvar, odada **gerçek mankenlerle** oynanan vakanın arkasına ortam ve tehdit
hissi verir (eğitimin kendisi değil); öneri ve öncelikler buna göre. Kullanıcı sesleri ekleyecek, sonra birlikte test.
Ardından sıra: (1) düşman silueti (pencere/çatı, namlu parıltısıyla), (2) tehdit baskısı (yakın mermi tozu, havan ıslığında
siper alma), (3) figür durum makinesi + klip ölçümünün içerik hattına alınması + tek yürünebilir zemin (askerler derinlemesine
hareket etsin), (4) duvarda yaralıyı sipere sürükleme. Sahne gerçeğini köprüye taşıma şimdilik yapılmayacak (kazancı düşük).

## Sıradaki işler (öncelik sırasıyla)

00. **3B alanlar duvarda (9 Kasım sonu):** meskûn cadde, 3B orman (yaz/kış), dağ yarları, kırsal kavak sırası duvarda gözle
   ve gerçek fps ile bakılmadı (başsız `ciz()` orman ≈ 10 ms, 3832×719 orta). Ayar noktaları: orman `yesillik`/`cimen`
   (`arazi.ts` profili), ağaç adetleri (`BITKI_SETLERI`), yakın ağaç üçgeni (`bitki-modelleri.json` `ucgen`). Meshy modelleri
   depo dışında (`icerik/arazi/modeller/m_*`, `icerik/modeller/alan/`): projeksiyon bilgisayarına `icerik/` kopyalanmalı.
0. **Gösterim hazır (2 Kasım):** örnek senaryo "Gösterim – Güncel Durum (5 dk)" (`sn_gosterim_guncel`; akış
   `docs/gosterim-rehberi.md` "Önerilen"), başsız Chrome'da baştan sona 60 fps. Kullanıcı bunu idareye gösterecek;
   gelecek önerilere göre geliştirme yönü belirlenecek. Değişen örnek senaryo mevcut kuruluma kendiliğinden gelmez:
   `DELETE /api/senaryolar/<id>` + köprüyü yeniden başlat.
1. Yerleşim planları: 24 panoramadan 15'i doğrulanmış (14 + varsayılan kırsal AI v2 + 2 gözden geçirici önerisi).
   Kalan 10'un son düzeltme sürümleri doğrulanmadı (dağlık kış/yaz gündüz, meskûn kış/yaz alacakaranlık, yaz gece, yaz
   gündüz, ormanlık kış alacakaranlık/gündüz, üs kış gündüz); dosyalar oturum scratchpad'inde (`plan3/oneri`), kalıcı
   değil — gerekirse `araclar/plan-onizleme.py` ile yeniden. Eksik 7 bölge/mevsim/zaman birleşimi en yakın panoramaya düşer.
   **Kendi 3B modellerimiz:** A ve B listeleri bitti (3 Kasım; B: 17 model, tank `araclar/tank-ayir.py` ile
   gövde/kule/namlu'ya ayrıldı, kule ekseni oynatıcıda otomatik; ayrıntı docs "B listesi modelleri"). C listesi
   aynı hatla: plan.json'a satır → `meshy-uret.mjs --kod` → `model-hazirla.py` → manifest. Meshy bakiyesi ~190 kredi.
   Yeniden üretim bekleyenler (30 kredi/parça, kullanıcı onayı): T5 açık çanta (haç → kızılay; doku Meshy atlası parça parça, `araclar/glb-doku.mjs` ile bakıldı, düzenlenemez), T9 duman bombası (silindir), T12 gözetleme kulesi (kum torbaları kabinde değil ayak dibinde, tek ağ).
2. HESCO artık prosedürel (`sutre.ts` `tip: "hesco"`, canvas doku: tel kafes + jeotekstil + kum; üs bölgesi
   diziliminde iki hat). Sıhhiyeci "Interact" klibiyle idare ediyor; gerçek
   müdahale animasyonu (turnike) için yeşil perde çekimi (docs §2.5). Yaralı taşıma (iki kişi) yok.
3. VFX plakaları (gerçek çekim, alfa). Helikopter inişi (uçuş modeli, pas geçme, zemine göre rotor tozu, konumlu
   rotor sesi) ve 3B izli mermi yazılımda, inceleme bulguları düzeltildi (2 Kasım); duvarda gözle/kulakla ayar bekliyor.
   Sırt üstü uzak kaynak (stab/fps, yukarıda "Helikopter ve izli mermi"): namlu parıltıları sırt çizgisinde, duvarda
   gözle bakılmalı.
4. Çok kanallı ses (4 kanal / 5.1 / 7.1) ve ölçülmüş duvar geometrisi (`?oda=`) yazılımda hazır; kalan saha ayarı:
   gerçek hoparlör açıları (`?hoparlor=`), T testi + kulak testi (LFE seviyesi), U duvar ölçüleri → `?oda=` (panel
   Sistem › Duvar geometrisi, sahada K ızgarasıyla doğrula). Türkçe bağırma/yaralı inleme kaydı.
5. İdareye gösterim: kırsal 4 varyant + patlama/krater + 3 asker + yaralı + helikopter.

## Belgeler

- `docs/sartname-analizi-ve-yaklasim.md` – şartname maddeleri, hibrit yol gerekçesi, kabul matrisi
- `docs/fotogercekci-icerik-hatti.md` – içerik üretimi: AI panorama, UE5, 360° çekim, yeşil perde, FFmpeg
- `docs/duvar-oynatici.md` – oynatıcı katmanları, manifest alanları, köprü sözleşmesi
- `docs/mimari.md`, `docs/unreal-kurulum.md`, `docs/3-projeksiyon-tek-ekran.md`
- `docs/ornek-calisma-inceleme.md` – firmadan gelen TCCC örnek paketi incelemesi
- `docs/donanim-onerileri.md`, `docs/kaynak-proje-talebi.md`, `docs/sartname-uyumluluk.md`
- `docs/icerik-ihtiyac-listesi.md` – Meshy modelleri, Türkçe/CC0 sesler, hava efekti eksikleri (3 Kasım), öncelikli
- `docs/meshy-model-listesi.md` – 43 modelin Meshy promptları, ayarlar, dosya adları, Mixamo animasyonları (kopyalanabilir sayfa: artifact "Meshy Model Listesi")
- `docs/oyun-testi-10-kasim.md` – meskûn mahal oynayarak test: düzeltilen 14 hata, açık 14 bulgu, öneriler, test aracı
- `docs/yeni-bilgisayar-kurulumu.md` – devir notu: kod nereden çekilir, USB içeriği nereye gider, ilk yapılacaklar
- `docs/gosterim-rehberi.md` – idareye sunum: hazırlık, tek tuş "Gösterim – Tam Tur" akışı, elle 3 dk, sorulara cevaplar, aksaklıklar
