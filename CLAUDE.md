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

**Kontrol paneli yeniden tasarlandı** (22 Ekim): "harekât masası" teması, sahne pusulası (yön seçimi
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
üretim/indirme, kaldığı yerden), `araclar/model-hazirla.py` (seyreltme/ölçek/orijin), `araclar/helikopter-hazirla.py`,
`araclar/glb-bilgi.mjs`. `mixamo-aktar.py`: kemik adı eşlemesi, 85° eşik, GLB girdi. Tuzaklar ve kalanlar
`docs/duvar-oynatici.md` "Meshy üretim hattı". **Açık hata:** sahne sıfırla + figür yerleştirip hemen sonra açılan
oynatıcı, bağlantıyla gelen figürleri bazen yüklemiyor (`figurler.aktifler` 0; aynı komutlar yeniden gönderilince
yükleniyor; başsız Chrome'da 3840×720, yavaş açılışta görüldü) — `bekleyenFigurler` / `sahne/senkron` sırası incelenmeli.
Bu oturumun kalan düzeltmesi: "askerin vücudu zeminin altında" (kalça yüksekliği, fb03730).

## Sıradaki işler (öncelik sırasıyla)

0. **Gösterim hazır (2 Kasım):** örnek senaryo "Gösterim – Güncel Durum (5 dk)" (`sn_gosterim_guncel`; akış
   `docs/gosterim-rehberi.md` "Önerilen"), başsız Chrome'da baştan sona 60 fps. Kullanıcı bunu idareye gösterecek;
   gelecek önerilere göre geliştirme yönü belirlenecek. Değişen örnek senaryo mevcut kuruluma kendiliğinden gelmez:
   `DELETE /api/senaryolar/<id>` + köprüyü yeniden başlat.
1. Yerleşim planları: 24 panoramadan 15'i doğrulanmış (14 + varsayılan kırsal AI v2 + 2 gözden geçirici önerisi).
   Kalan 10'un son düzeltme sürümleri doğrulanmadı (dağlık kış/yaz gündüz, meskûn kış/yaz alacakaranlık, yaz gece, yaz
   gündüz, ormanlık kış alacakaranlık/gündüz, üs kış gündüz); dosyalar oturum scratchpad'inde (`plan3/oneri`), kalıcı
   değil — gerekirse `araclar/plan-onizleme.py` ile yeniden. Eksik 7 bölge/mevsim/zaman birleşimi en yakın panoramaya düşer.
   **Kendi 3B modellerimiz:** A listesi bitti (yukarıda). Sırada B listesi (`docs/meshy-model-listesi.md`: ağır yük
   komandosu, yaralı turnikeli, MG3, Kirpi, tank gövde/kule, enkaz, T-duvar, gözetleme kulesi, yıkık duvarlar…) aynı
   hatla: `node araclar/meshy-uret.mjs --kod ...` (plan.json'a B satırları eklenir) → `model-hazirla.py` → manifest.
   T5 açık çantada haç yerine kızılay, T9 silindir duman bombası için yeniden üretim (30 kredi/parça) isteğe bağlı.
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
- `docs/gosterim-rehberi.md` – idareye sunum: hazırlık, tek tuş "Gösterim – Tam Tur" akışı, elle 3 dk, sorulara cevaplar, aksaklıklar
