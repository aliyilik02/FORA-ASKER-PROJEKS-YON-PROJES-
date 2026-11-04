/**
 * Duvar Oynatıcı – giriş noktası.
 *
 * Köprüden gelen durum (bölge, ortam, izli mermi, Oda 2) ve efekt olaylarını 3 duvara çizer.
 * Sorgu parametreleri:
 *   ?fov=90      ölçü yokken duvar başına yatay açı (U duvar 90); düz tek duvara 3 projektör için ?oda=duz,...
 *   ?oda=u,on=6,yan=4,yuk=3,alt=0.3,x=0,z=3,goz=1.7   ölçülmüş oda (U ya da "duz"; metre), duvar başına doğru
 *                perspektif; yerel kayıtta kalır, "?oda=sifirla" siler (bkz. projeksiyon.ts odaGeometrisiCoz)
 *   ?doldur=1    48:9 oranını koruma, pencereyi tamamen doldur
 *   ?hud=1       hata ayıklama katmanı açık başlasın
 *   ?uc=0        3B sahne katmanını kapat (yalnızca 2B yol)
 *   ?gunes=1     3B sahnede güneş tahminini küreyle göster (panoramadaki güneşle çakışmalı)
 *   ?ses=5.1     ses düzeni stereo|dortlu|5.1|7.1|otomatik (varsayılan otomatik: cihazın kanal sayısı; yerel kayıtta kalır)
 *   ?hoparlor=-45,45,-135,135   kanal sırasıyla hoparlör azimutları, LFE için "lfe" (sahadaki gerçek açılar)
 *   ?gecis=600   sahne geçişinde eski karenin solma süresi (ms; 0 = anlık kesme)
 *   ?kalite=orta kademe dusuk|orta|yuksek (yerel kayıtta kalır) ya da "otomatik" (kaydı siler); hiçbiri yoksa da
 *                otomatik: Intel entegre → orta, diğer → yuksek (kaliteSecimi.ts)
 * Tuşlar: H hud · K kalibrasyon ızgarası · F tam ekran · M sessiz · 1 patlama · 2 toz · 3 izli mermi aç/kapa ·
 *   T hoparlör testi (her kanalda sırayla gürültü, kanal adı ekranda) · ⇧0 sahneyi temele döndür (köprüye istek; köprü
 *   yoksa yalnız bu oynatıcı). Efekt tuşlarında basılı tutma (tuş tekrarı) yok sayılır.
 */
import * as THREE from "three";
import { KopruBaglantisi, type BaglantiDurumu } from "./baglanti";
import { EfektSistemi } from "./efektler/patlama";
import { Helikopter } from "./efektler/helikopter";
import { IzliMermiSistemi } from "./efektler/izliMermi";
import { GecisKatmani, gecisSuresiCoz } from "./gecis";
import { hudCiz, kalibrasyonCiz, uyariCiz } from "./hud";
import { kaliteSec } from "./kaliteSecimi";
import { KlipKatmani } from "./klipler";
import { silahHizala } from "./sahne3b/silahHizalama";
import { duvarYerlesimleri, duvarlariOlustur, geometriOzeti, odaDuvarlari, odaGeometrisiCoz, odaGeometrisiYaz, type OdaGeometrisi, ufukSatiri, type Yerlesim, xAzimut, yonAzimut, zamanDilimi, type ZamanDilimi } from "./projeksiyon";
import { araziCiz, araziGuncelle, ufukY as bolgeUfukY } from "./sahne/arazi";
import { gokyuzuCiz, gokyuzuGuncelle, gokyuzuRenkleri } from "./sahne/gokyuzu";
import { HavaSistemi, kararmaCiz, sisCiz } from "./sahne/hava";
import { oda2OnPlanCiz } from "./sahne/oda2";
import { PanoramaKatmani } from "./panorama";
import { type Kalite, type PanoramaKaynagi, Sahne3B } from "./sahne3b/sahne3b";
import type { AraziModu } from "./sahne3b/arazi";
import { arkaPlanKarari } from "./sahne3b/panoramaGecisi";
import { adimlariCalistir, hataOzeti, temelDurum } from "./sahneTemizligi";
import { figurYolu } from "./figurYonlendirme";
import { SesMotoru } from "./ses";
import { sesAyariniCoz } from "./sesYerlesimi";
import { BOLGE_ETIKETLERI, GUVENLI_ALAN_ETIKETLERI, HELIKOPTER_ETIKETLERI, type EfektIstegi, type FigurKomutu, type SimulasyonDurumu, varsayilanDurum } from "./tipler";
import { panoramaAdaylari, type PanoramaAdayi, VideoKatmani } from "./video";

const tuval = document.getElementById("tuval") as HTMLCanvasElement;
const tuval3b = document.getElementById("tuval3b") as HTMLCanvasElement;
/** Geçiş örtüsü: 3B tuvalin üstünde, 2B tuvalin altında (index.html; eski sayfada yoksa burada kurulur). */
const tuvalGecis =
  (document.getElementById("tuvalGecis") as HTMLCanvasElement | null) ??
  (() => {
    const c = document.createElement("canvas");
    c.id = "tuvalGecis";
    c.style.cssText = "display:block;position:absolute;left:0;top:0;z-index:2;pointer-events:none";
    tuval3b.after(c);
    return c;
  })();
// 2B tuval saydam: 3B sahne aktifken altındaki tuval görünür
const ctx = tuval.getContext("2d", { alpha: true })!;
const uyariKutusu = document.getElementById("uyari")!;
const params = new URLSearchParams(location.search);
/** Sahne geçişi: eski 3B kare örtüye kopyalanır, yenisi arkada hazırlanıp çizilince örtü solar (`?gecis=` ms). */
const gecis = new GecisKatmani(tuvalGecis, gecisSuresiCoz(params.get("gecis")));
/** Manifest okundu (önce ekran siyah); en az bir kez arka plan (panorama) gösterildi: yer tutucu bir daha çizilmez. */
let manifestYuklendi = false;
let panoramaGosterildi = false;
/** Video panorama (2B yol) hazırlanıyor: 3B katman o oynatılabilir olunca kapanır, o zamana dek eski sahne kalır. */
let videoPanoramaBekleniyor = false;
/** Son karenin 2B arka plan kararı (HUD ve ölçüm: yer tutucu bir daha görünmemeli). */
let sonArkaPlan: ReturnType<typeof arkaPlanKarari> = "siyah";
const fov = Number(params.get("fov") ?? 90);
const doldur = params.get("doldur") === "1";
const ucBoyut = params.get("uc") !== "0";
/**
 * Duvar geometrisi: ?oda= (adres çubuğu > yerel kayıt > ölçüsüz varsayılan). Geçerli adres değeri kaydedilir;
 * "?oda=sifirla" kaydı siler. Geçersiz değer yok sayılır (uyarı HUD ve K ızgarasında), varsayılan kullanılır.
 * Ölçü yoksa eski yol: duvar başına ?fov= derece (varsayılan 90), döndürülmüş simetrik kameralar.
 */
const odaParam = params.get("oda");
let odaUyarisi = "";
let oda: OdaGeometrisi | null = null;
/**
 * Makullük: projektör görüntüsü 16:9'dur; ön duvar genişlik/yükseklik oranı bundan %30'dan çok sapıyorsa (ör. yuk=8 m)
 * görüntü duvara sığdırılırken ezilir/uzar. 3 Kasım: panelden yanlışlıkla girilen yüksekliği her açılış yeniden
 * uyguluyor, "panorama basık" görünüyordu. Böyle geometri kaydedilmez ve uygulanmaz; HUD uyarır.
 */
const geometriMakulMu = (g: OdaGeometrisi) => Math.abs(g.on / g.yukseklik / (16 / 9) - 1) <= 0.3;
if (odaParam === "sifirla") localStorage.removeItem("oda");
else if (odaParam) {
  oda = odaGeometrisiCoz(odaParam);
  if (oda && !geometriMakulMu(oda)) {
    odaUyarisi = `?oda= görüntü oranı 16:9 değil (${oda.on} × ${oda.yukseklik} m); yükseklik projektör görüntüsünün olmalı (≈ genişlik × 9/16). Ölçüsüz yerleşim kullanılıyor`;
    oda = null;
    localStorage.removeItem("oda");
  } else if (oda) localStorage.setItem("oda", odaGeometrisiYaz(oda));
  else odaUyarisi = `?oda=${odaParam} geçersiz; ölçüsüz yerleşim kullanılıyor`;
} else {
  const kayitli = localStorage.getItem("oda");
  oda = odaGeometrisiCoz(kayitli);
  if (oda && !geometriMakulMu(oda)) {
    odaUyarisi = "kayıtlı duvar geometrisi 16:9 değil, yok sayıldı";
    oda = null;
  }
  if (kayitli && !oda) localStorage.removeItem("oda");
}
if (odaUyarisi) console.warn(odaUyarisi);
const duvarlar = oda ? odaDuvarlari(oda) : duvarlariOlustur(Number.isFinite(fov) && fov > 10 ? fov : 90);
/** HUD ve K ızgarası için geometri özeti (iki satır). */
const duvarOzeti = geometriOzeti(oda, duvarlar);
if (odaUyarisi) duvarOzeti[0] = `${odaUyarisi} · ${duvarOzeti[0]}`;
const duvarAcilari = `${duvarlar.map((d) => d.fov.toFixed(0)).join("/")}°`;

let W = 0;
let H = 0;
let yerlesimler: Yerlesim[] = [];
let hud = params.get("hud") === "1";
let kalibrasyon = false;
let durum: SimulasyonDurumu = varsayilanDurum();
let durumGeldi = false;
let baglanti: BaglantiDurumu = "kopuk";
let fps = 0;

/**
 * Ses düzeni: ?ses= ve ?hoparlor= (adres çubuğu > yerel kayıt > otomatik: cihazın kanal sayısı). Stereoda eski
 * StereoPanner yolu; 4+ kanalda konumsal ses ve LFE (bkz. sesYerlesimi.ts, docs/duvar-oynatici.md).
 */
const ses = new SesMotoru(sesAyariniCoz({ ses: params.get("ses"), hoparlor: params.get("hoparlor") }, localStorage));
const izli = new IzliMermiSistemi((x) => ses.vizilti(tuvalAzimutu(x)));
/** 2B tuval x'i → sahne azimutu (2B izli mermi vızıltısı): x'in düştüğü duvarın izdüşümüyle (perspektif); kenar dışı en yakın duvardan. */
function tuvalAzimutu(x: number): number {
  const y = yerlesimler.find((d) => x < d.x + d.genislik) ?? yerlesimler[yerlesimler.length - 1];
  return y ? xAzimut(x, y) : 0;
}
const efektler = new EfektSistemi();
const heli = new Helikopter();
const hava = new HavaSistemi();
const video = new VideoKatmani("icerik/"); // belge tabanına göreli: /oynatici/icerik/ veya dev'de /icerik/
const panorama = new PanoramaKatmani();
const klipler = new KlipKatmani();
/** 3B sahne katmanı: panorama resmi arka plan + IBL, 3B figür/efekt/helikopter. Video panoramada 2B yol kalır. */
/**
 * Kalite kademesi: ?kalite=dusuk|orta|yuksek|otomatik (adres çubuğu > yerel kayıt > otomatik; "otomatik" kaydı siler).
 * Otomatik: Intel entegre kart (Iris Xe, UHD) "orta", diğerleri "yuksek" (bkz. kaliteSecimi.ts); HUD'da "kalite orta
 * (otomatik: …)", köprü günlüğüne bir kez. Tek çözüm noktası: Sahne3B'nin kademesi (gölge, parçacık, arazi) ve sahne
 * geçişinin küp yüzü / çözme genişliği (panoramaGecisi.ts) bu değerden gelir.
 */
const kaliteSecimi = kaliteSec(params.get("kalite"), localStorage);
const kalite: Kalite = kaliteSecimi.kalite;
const kaliteBilgisi = kaliteSecimi.otomatikKart ? `${kalite} (otomatik: ${kaliteSecimi.otomatikKart})` : kalite;
const sahne3b = new Sahne3B(tuval3b, params.get("gunes") === "1", kalite);
/**
 * 3B arazi kipi: ?arazi=kapali|hibrit|tam (adres çubuğu > yerel kayıt > bölgeye göre varsayılan).
 * Varsayılan: açık arazili bölgelerde "hibrit" (yakın alan 3B, uzak panorama). Meskûn mahalde kapalı: panoramada
 * binalar 5–15 m'de, 3B zemin duvar diplerini gömer (bkz. sahne3b/arazi.ts profil notu).
 */
const araziParam = params.get("arazi");
const araziSecimi: AraziModu | null = (["kapali", "hibrit", "tam"] as const).find((k) => k === (araziParam ?? localStorage.getItem("arazi"))) ?? null;
if (araziParam && araziSecimi) localStorage.setItem("arazi", araziSecimi);
const ARAZI_VARSAYILAN: Record<string, AraziModu> = { kirsal_acik_arazi: "hibrit", daglik: "hibrit", ormanlik: "hibrit", us_bolgesi: "hibrit", meskun_mahal: "kapali" };
function araziModuSec(bolge: string): AraziModu {
  if (araziSecimi) return araziSecimi;
  return ARAZI_VARSAYILAN[bolge] ?? "kapali";
}
const ucAktifOlabilir = ucBoyut && sahne3b.destekli;
// Çatışma sesleri sahne azimutuyla (derece) gelir; ses motoru stereo / çok kanala kendisi yerleştirir
sahne3b.catismaSesleriAyarla({
  carpma: (azimut) => ses.carpma(azimut),
  atis: (azimut, uzak) => ses.tekAtis(azimut, uzak),
  uzakPatlama: (azimut) => void ses.patlama(azimut, 0.7, true, 600),
  topAtisi: (azimut) => void ses.patlama(azimut, 0.55),
});
// Yaralı figür: vurulunca bağırma, yerde ara ara yardım çağrısı (figürün yönünden)
sahne3b.figurSesleriAyarla((tur, azimut) => {
  if (tur === "vuruldu") void ses.bagirma(azimut);
  else void ses.cagirma(azimut);
});
// Hata ayıklama: tarayıcı konsolundan sahneye erişim (window.duvar.sahne3b, window.duvar.THREE); geçiş ölçümü için
// örtü (window.duvar.gecis) ve son karenin arka plan kararı (window.duvar.arkaPlan(): "yok" | "siyah" | "yer_tutucu")
(window as unknown as { duvar: unknown }).duvar = {
  sahne3b,
  THREE,
  gecis,
  arkaPlan: () => sonArkaPlan,
  // Silah soketi ölçümü: await window.duvar.silahHizala("<figür id>", ["Rifle Idle", "Rifle Walk"], 0.95) → manifest konum/donus
  silahHizala: (id: string, klipler: string[], boy?: number) => {
    const a = sahne3b.figurAktifBul(id);
    if (!a) throw new Error(`figür yok: ${id}`);
    return silahHizala(a, klipler, boy);
  },
};
/** ?panorama=<url> ile hızlı deneme: manifestten bağımsız, her bölgede bu 360° kaynak gösterilir. */
const testPanorama = params.get("panorama");
const testYaw = Number(params.get("yaw") ?? 0);

function videoMu(dosya: string, tip?: string) {
  return tip === "video" || /\.(mp4|webm|mov)(\?|$)/i.test(dosya);
}

/** Manifest kaydı → 3B panorama kaynağı. Zamanı farklı yedekte zaman boş kalır: sahne onu saate göre karartır. */
function panoramaKaynagi(a: PanoramaAdayi): PanoramaKaynagi {
  const k = a.kayit;
  return {
    url: /^(https?:|data:|blob:|\/)/.test(k.dosya) ? k.dosya : video.kok + k.dosya,
    yawKaydirma: k.yawKaydirma ?? 0,
    yukseklikKaydirma: k.yukseklikKaydirma ?? 0,
    zaman: a.zamanFarkli ? undefined : k.zaman,
    plan: { noktalar: k.noktalar, yasak: k.yasak },
    gunes: k.gunes,
    gok: k.gok,
  };
}

/** Eksik birleşim (ör. dağlık · kış · gece) için kullanılan yedek panorama köprü günlüğüne birleşim başına bir kez yazılır. */
const bildirilenYedekler = new Set<string>();
function yedekBildir(a: PanoramaAdayi, zaman: ZamanDilimi) {
  const anahtar = `${durum.bolge}|${durum.ortam.mevsim === "kis" ? "kis" : "yaz"}|${zaman}`;
  if (bildirilenYedekler.has(anahtar)) return;
  const k = a.kayit;
  const mesaj = `Panorama eksik: ${BOLGE_ETIKETLERI[durum.bolge]} · ${durum.ortam.mevsim} · ${zaman} → ${k.dosya} (${k.mevsim ?? "her mevsim"} ${k.zaman ?? "her saat"}${a.zamanFarkli ? ", saate göre karartılıyor" : ""})`;
  console.info(mesaj);
  if (kopru.durum !== "bagli") return;
  bildirilenYedekler.add(anahtar);
  kopru.gonder({ tip: "gunluk", seviye: "uyari", mesaj });
}

/**
 * Bölge + mevsim + zaman → panorama. Tam eşleşme yoksa bölgenin en yakın panoraması (video.ts panoramaAdaylari: önce aynı
 * zaman, sonra aynı mevsim; gecede gece/alacakaranlık); kalan adaylar yükleme hatasında sırayla denenir. Ekrandaki sahne
 * yenisi hazır olana dek kalır (sahne3b), yer tutucu yalnız hiç panorama yoksa.
 */
function panoramayiGuncelle() {
  const zaman = zamanDilimi(durum.ortam.saat);
  const adaylar: PanoramaAdayi[] = testPanorama
    ? [{ kayit: { bolge: durum.bolge, dosya: testPanorama, yawKaydirma: testYaw, yukseklikKaydirma: 0 }, yedek: false, zamanFarkli: false, mevsimFarkli: false }]
    : panoramaAdaylari(video.manifest, durum.bolge, durum.ortam.mevsim, zaman);
  const secim = adaylar[0];
  if (!secim) {
    // Bölgede hiç panorama yok: ekrandaki kalır (hiç gösterilmediyse kare() yer tutucu çizer)
    videoPanoramaBekleniyor = false;
    sahne3b.panoramaAyarla(null);
    return;
  }
  if (secim.yedek) yedekBildir(secim, zaman);
  if (ucAktifOlabilir && !videoMu(secim.kayit.dosya, secim.kayit.tip)) {
    // Resim panorama → 3B katman (arka plan + ışık); 2B WebGL panorama katmanı 3B ekrana gelince kapanır (kare)
    videoPanoramaBekleniyor = false;
    const resimler = adaylar.filter((a) => !videoMu(a.kayit.dosya, a.kayit.tip)).map(panoramaKaynagi);
    sahne3b.panoramaAyarla(resimler[0], resimler.slice(1));
    return;
  }
  // Video panorama ya da 3B yok: 2B yol. 3B açıksa eski sahne video oynatılabilir olunca kapanır (kare)
  const k = secim.kayit;
  panorama.sec({ dosya: k.dosya, tip: k.tip, yawKaydirma: k.yawKaydirma, yukseklikKaydirma: k.yukseklikKaydirma }, video.kok);
  videoPanoramaBekleniyor = ucAktifOlabilir;
}

function boyutlandir() {
  const vw = innerWidth;
  const vh = innerHeight;
  const oran = 16 / 3; // 48:9
  let w = vw;
  let h = Math.round(vw / oran);
  if (h > vh) {
    h = vh;
    w = Math.round(vh * oran);
  }
  if (doldur) {
    w = vw;
    h = vh;
  }
  tuval.width = W = w;
  tuval.height = H = h;
  const sol = `${Math.floor((vw - w) / 2)}px`;
  const ust = `${Math.floor((vh - h) / 2)}px`;
  tuval.style.left = tuval3b.style.left = tuvalGecis.style.left = sol;
  tuval.style.top = tuval3b.style.top = tuvalGecis.style.top = ust;
  gecis.boyutlandir(W, H);
  yerlesimler = duvarYerlesimleri(W, H, duvarlar);
  hava.boyutlandir(W, H);
  sahne3b.boyutlandir(W, H, yerlesimler);
}
addEventListener("resize", boyutlandir);
boyutlandir();

function ufuk(): number {
  if (sahne3b.hazir) return sahne3b.ufukY;
  // 360° video panorama (WebGL): göz hizası satırı + ufuk kaydırması; yer tutucu sahne kendi ufkunu çizer
  const orta = yerlesimler[Math.floor(yerlesimler.length / 2)];
  if (panorama.aktif && orta) return ufukSatiri(orta, panorama.yukseklikKaydirma);
  return bolgeUfukY(durum.bolge, H);
}

/**
 * 3B sahne hazır değilken (ilk panorama yükleniyor) ya da bölge geçişi takası beklenirken gelen patlama/toz efektleri:
 * hazır olunca (yeni bölgenin planıyla) uygulanır (10 sn içinde). Eski bölgeye düşen krater takasta silinirdi.
 */
const bekleyenEfektler: Array<{ e: EfektIstegi; zaman: number }> = [];
function bekleyenEfektleriUygula() {
  if (!sahne3b.hazir || sahne3b.bolgeGecisiBekliyor || bekleyenEfektler.length === 0) return;
  const simdi = performance.now();
  const liste = bekleyenEfektler.splice(0);
  for (const b of liste) if (simdi - b.zaman < 10000) efektUygula(b.e);
}

function efektUygula(e: EfektIstegi) {
  if (ucAktifOlabilir && (!sahne3b.hazir || sahne3b.bolgeGecisiBekliyor) && (e.tur === "patlama" || e.tur === "toz_duman" || e.tur === "uzak_patlama" || e.tur === "yangin")) {
    bekleyenEfektler.push({ e, zaman: performance.now() });
    return;
  }
  const azimut = yonAzimut(e.yon ?? 0);
  const siddet = e.siddet ?? 1;
  // Gerçek plaka varsa (manifest "klipler": patlama_*, toz_*) onu kullan, yoksa prosedürel efekt.
  // 3B sahne açıkken "yedek" işaretli (sentetik test) plakalar atlanır; 3B efekt daha iyidir.
  const plaka = (onek: string, yukseklik: number, olcek: number) => {
    const ad = klipler.rastgele(onek, sahne3b.hazir);
    if (!ad) return false;
    // 2B plaka da yerleşim planına uyar (ağaç/bina içinde oynamasın)
    const tur = onek.startsWith("toz") ? "toz" : "patlama";
    const plakaAzimut = sahne3b.hazir ? sahne3b.noktaSec(azimut, tur, 0).azimut : azimut;
    klipler.oynat({ klip: ad, azimut: plakaAzimut, yukseklik, olcek, yansit: Math.random() < 0.5 });
    return true;
  };
  const uc = sahne3b.hazir;
  switch (e.tur) {
    case "patlama": {
      const plakaVar = plaka("patlama", -3, 0.7 + siddet * 0.6);
      if (uc) {
        // 3B: ateş/toprak/moloz (plaka yoksa), anlık ışık, kalıcı krater ve tüten duman; 2B: flaş + sarsıntı
        sahne3b.patlama(azimut, siddet, false, plakaVar);
        efektler.flasVeSarsinti(siddet);
      } else if (plakaVar) efektler.flasVeSarsinti(siddet);
      else efektler.patlama(azimut, siddet, yerlesimler, ufuk(), H);
      void ses.patlama(azimut, siddet);
      break;
    }
    case "toz_duman":
      if (uc) sahne3b.tozDuman(azimut, siddet);
      if (!plaka("toz", -3, 0.7 + siddet * 0.6) && !uc) efektler.tozDuman(azimut, siddet, yerlesimler, ufuk(), H);
      break;
    case "gurultu":
      void ses.gurultu(azimut, siddet);
      break;
    case "bagirma":
      void ses.bagirma(azimut);
      break;
    case "cagirma":
      void ses.cagirma(azimut);
      break;
    case "uzak_patlama": {
      const plakaVar = plaka("uzak_patlama", 0.5, 0.25 + siddet * 0.15);
      if (uc) {
        sahne3b.patlama(azimut, siddet, true, plakaVar);
        efektler.flasVeSarsinti(siddet * 0.2);
      } else if (plakaVar) efektler.flasVeSarsinti(siddet * 0.2);
      else efektler.uzakPatlama(azimut, siddet, yerlesimler, ufuk(), H);
      void ses.patlama(azimut, siddet, true, e.mesafe ?? 800);
      break;
    }
    case "uzak_mermi_sesi":
      void ses.mermi(azimut, true);
      break;
    case "yangin":
      if (uc) sahne3b.yangin(azimut, siddet);
      else efektler.flasVeSarsinti(siddet * 0.2);
      break;
    case "yangin_sondur":
      if (uc) sahne3b.yanginSondur();
      break;
    case "simsek": {
      // Çakma hemen (ışık), gök gürültüsü mesafe/343 sn sonra (ses motorunda)
      const mesafe = e.mesafe ?? 2000;
      const guc = siddet * Math.max(0.35, 1 - mesafe / 9000);
      if (uc) sahne3b.simsek(azimut, guc);
      else efektler.simsekFlasi(0.35 * guc);
      ses.gokGurultusu(azimut, mesafe, siddet);
      break;
    }
  }
}

/** Ortam ses döngüsü anahtarı (manifest `sesler.ortam`): yağmur > gece > kış > bölge. */
function ortamSesAnahtari(d: SimulasyonDurumu): string {
  if (d.ortam.yagis === "hafif_yagmur" || d.ortam.yagis === "siddetli_yagmur") return "yagmur";
  if (zamanDilimi(d.ortam.saat) === "gece") return "gece";
  if (d.ortam.mevsim === "kis") return "kis";
  return d.bolge;
}

/**
 * Helikopter 3B sahnede mi uçar: model hazır ve 3B sahne açık ya da yeni resim panorama yükleniyor (uçuş sırasında
 * saat/mevsim değişti). Yüklenirken 2B siluete geçmez: 3B uçuş sürer, yüklenince baştan başlamaz (yeni iniş noktasına
 * pas geçer ya da rotasını kurar); rotor sesi de kesilmez.
 */
function helikopter3B() {
  return sahne3b.helikopterHazir && (sahne3b.hazir || sahne3b.panoramaYukleniyor);
}

function durumUygula(d: SimulasyonDurumu) {
  const bolgeDegisti = d.bolge !== durum.bolge;
  durum = d;
  durumGeldi = true;
  // Panorama isteği önce: hazırlık başlar, ekrandaki sahne yenisi hazır olana dek kalır. Bölge sıfırlaması (kraterler,
  // duman), arazi, kar, ışık ve helikopter iniş noktası takasa ertelenir (sahne3b); eski görüntü bu sürede değişmez.
  video.secim(d.bolge, d.ortam.mevsim, zamanDilimi(d.ortam.saat));
  panoramayiGuncelle();
  if (bolgeDegisti) sahne3b.bolgeDegisti(); // kraterler ve duman bölgeyle birlikte gider (takasta)
  if (sahne3b.destekli) sahne3b.araziAyarla(araziModuSec(d.bolge), d.bolge, d.ortam.mevsim, video.kok);
  // İzli mermi ve çatışma: 3B sahne açıkken 3B izler, değilse 2B çizgiler
  const uc = sahne3b.hazir;
  izli.ayarla({ ...d.izliMermi, aktif: d.izliMermi.aktif && !uc });
  sahne3b.izliMermiAyarla(d.izliMermi, duvarlar.map((x) => x.yaw));
  const catisma = d.catisma ?? { aktif: false, siddet: 0.5, yon: 0, dostAtes: true };
  sahne3b.catismaAyarla(catisma, yonAzimut(catisma.yon));
  const heliDurumu = d.oda === "oda2" ? d.oda2.helikopter : "yok";
  const heliYon = yonAzimut(d.oda2.helikopterYonu ?? 12);
  // 3B model varsa helikopter 3B sahnede uçar (panorama yüklenirken de); yoksa 2B siluet
  if (helikopter3B()) {
    sahne3b.helikopterAyarla(heliDurumu, heliYon);
    heli.durumAyarla("yok");
  } else {
    // Yön 3B sahnede de saklanır: panorama değişince iniş noktası panelin yönüne göre seçilir
    sahne3b.helikopterAyarla("yok", heliYon);
    heli.azimutAyarla(heliYon);
    heli.durumAyarla(heliDurumu);
  }
  ses.ortamAyarla(d.ortam);
  void ses.ortamDongusu(ortamSesAnahtari(d));
  sahne3b.ortamAyarla(d.ortam, gokyuzuRenkleri(d.ortam).isik);
  // Oda 2 sütre (3B eşya dizilimi): manifest sutreler[guvenliAlan]
  const sutreTipi = d.oda === "oda2" ? d.oda2.guvenliAlan : null;
  sahne3b.sutreAyarla(sutreTipi, sutreTipi ? video.manifest.sutreler?.[sutreTipi] : undefined, video.kok);
}

function figurKomutu(k: FigurKomutu & { id: string }) {
  if (k.islem === "temizle") {
    bekleyenFigurler.clear();
    klipler.temizle();
    sahne3b.figurTemizle();
    return;
  }
  if (k.islem === "durdur") {
    bekleyenFigurler.delete(k.id);
    klipler.durdur(k.id);
    sahne3b.figurDurdur(k.id);
    return;
  }
  if (k.islem === "poz") {
    const bekleyen = bekleyenFigurler.get(k.id);
    if (bekleyen) bekleyen.poz = k.poz;
    else if (k.poz) sahne3b.figurPoz(k.id, k.poz);
    return;
  }
  if (!k.klip) return;
  const tanim = klipler.tanim(k.klip);
  const yol = figurYolu({ manifestYuklendi, tip: tanim?.tip, ucAktifOlabilir, sahneHazir: sahne3b.hazir, gecisBekliyor: sahne3b.bolgeGecisiBekliyor });
  if (yol === "manifest_bekle" || yol === "ucb_bekle") {
    // Manifest henüz gelmedi (bağlantı manifest isteğinden önce kurulabilir) ya da 3B sahne hazır değil / bölge geçişi
    // takas bekliyor: köprünün gönderdiği aktif figürler kaybolmasın; manifest gelince / sahne hazır olunca uygulanır
    bekleyenFigurler.set(k.id, k);
    return;
  }
  if (yol === "yok") return;
  if (yol === "ucb" && tanim) {
    sahne3b.figurOynat(tanim, { id: k.id, azimut: k.azimut ?? 0, yukseklik: k.yukseklik, olcek: k.olcek, yansit: k.yansit, dongu: k.dongu, poz: k.poz, yaninda: k.yaninda }, video.kok);
    return;
  }
  klipler.oynat({ id: k.id, klip: k.klip, azimut: k.azimut ?? 0, yukseklik: k.yukseklik, olcek: k.olcek, dongu: k.dongu, yansit: k.yansit });
}
/**
 * Açılışta durum, 3B sahne / helikopter modeli / manifest hazır olmadan gelir; bu parçalar hazır olunca
 * (geçiş anında) durum yeniden uygulanır: sütre dizilimi, 3B helikopter, panorama seçimi kaybolmaz.
 */
let oncekiHazirImzasi = "";
function hazirOluncaYenidenUygula() {
  const imza = `${sahne3b.hazir ? 1 : 0}${sahne3b.helikopterHazir ? 1 : 0}${video.manifest.sutreler ? 1 : 0}${video.manifest.klipler ? 1 : 0}`;
  if (imza === oncekiHazirImzasi) return;
  oncekiHazirImzasi = imza;
  if (durumGeldi) durumUygula(durum);
}
/** 3B sahne hazır olmadan gelen model figürleri (oynatıcı açılışında köprü aktif listeyi yollar). */
const bekleyenFigurler = new Map<string, FigurKomutu & { id: string }>();
function bekleyenFigurleriUygula() {
  if (!sahne3b.hazir || sahne3b.bolgeGecisiBekliyor || bekleyenFigurler.size === 0) return;
  const liste = [...bekleyenFigurler.values()];
  bekleyenFigurler.clear();
  for (const k of liste) figurKomutu(k);
}

// Projeksiyonda fare imleci görünmesin: 3 sn hareketsizlikte gizlenir, hareket edince döner
let imlecZamanlayici: number | null = null;
function imleciGoster() {
  document.body.style.cursor = "";
  if (imlecZamanlayici) clearTimeout(imlecZamanlayici);
  imlecZamanlayici = window.setTimeout(() => {
    document.body.style.cursor = "none";
  }, 3000);
}
window.addEventListener("mousemove", imleciGoster);
imleciGoster();

/**
 * Sahne sıfırlaması, oynatıcı tarafı (köprünün `sahne/sifirla` mesajı, kaçırılan sıfırlama, köprü yokken ⇧0): yerel
 * artıklar sabit sırayla temizlenir (sahneTemizligi.ts; her adım ayrı try/catch, hatalar tek satırda köprü günlüğüne).
 * Çatışma, izli mermi ve helikopterin açık/kapalı oluşu köprünün (bu mesajdan önce gelen) durum yayınından gelir.
 * Rotor yalnız durumda helikopter yoksa hızla söner (kaçırılan sıfırlamada helikopter hâlâ inmiş olabilir).
 */
function sahneyiTemizle(neden: string) {
  const heliYok = durum.oda !== "oda2" || durum.oda2.helikopter === "yok";
  const hatalar = adimlariCalistir({
    kuyruklar: () => {
      bekleyenFigurler.clear();
      bekleyenEfektler.length = 0;
    },
    sahne3b: () => sahne3b.temeleDondur(),
    klipler: () => klipler.temizle(),
    efektler: () => efektler.temizle(),
    izli: () => izli.temizle(),
    sesler: () => ses.efektleriSustur(heliYok),
    // Geçiş sürerken: örtüdeki eski kare (figür, duman, iz) yeni sahnenin ilk karesinde solmadan kalkar (kare)
    ortu: () => gecis.sahneTemizlendi(),
    // Temiz görüntü bir sonraki (örtü eski kareyi tutuyorsa ilk temiz) karede panele gitsin (5 sn beklemeden)
    onizleme: () => {
      sonOnizleme = 0;
    },
  });
  if (hatalar.length) {
    console.error("Sıfırlama hataları", hatalar);
    kopru.gonder({ tip: "gunluk", seviye: "hata", mesaj: `Sıfırlama (${neden}): ${hataOzeti(hatalar)}` });
  }
}
/** Bilinen son sıfırlama nesli (köprüden; null: henüz bilinmiyor, ilk senkron yalnız kaydeder). */
let sahneNesli: number | null = null;
/** Köprü yokken yerel sıfırlama yapıldı: köprü dönünce günlüğe tek satır. */
let yerelSifirlamaYapildi = false;

/** ⇧0: köprüden sahne sıfırlaması ister (bütün oynatıcılar ve paneller); köprüye ulaşılamazsa yalnız bu oynatıcı. */
function sifirlamaIste() {
  if (kopru.durum !== "bagli") {
    yerelSifirla();
    return;
  }
  const iptal = new AbortController();
  const zamanlayici = window.setTimeout(() => iptal.abort(), 2500);
  fetch("/api/sahne/sifirla", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kaynak: "oynatici" }), signal: iptal.signal })
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      // Temizlik köprünün `sahne/sifirla` yayınıyla gelir (bütün oynatıcılarda aynı anda)
    })
    .catch(() => yerelSifirla())
    .finally(() => window.clearTimeout(zamanlayici));
}
/** Köprü yokken: yerel temizlik + çatışma/izli/helikopter yalnız bu oynatıcıda kapanır; duvara yazı basılmaz. */
function yerelSifirla() {
  if (durumGeldi) durumUygula(temelDurum(durum));
  sahneyiTemizle("köprü yok, yalnız bu oynatıcı");
  yerelSifirlamaYapildi = true;
  console.warn("Köprüye ulaşılamadı: sahne yalnız bu oynatıcıda temizlendi (köprü dönünce onun durumu geçerli)");
}

const kopru = new KopruBaglantisi(
  (m) => {
    if (m.tip === "durum") durumUygula(m.durum);
    else if (m.tip === "efekt") efektUygula(m.efekt);
    else if (m.tip === "figur") figurKomutu(m.komut);
    else if (m.tip === "baglanti") {
      // Canlı önizleme yalnız panel bağlıyken (eski köprüde alan yok → açık); yeni bağlanan panel 5 sn beklemesin
      const istenir = (m.baglanti.panel?.sayi ?? 1) > 0;
      if (istenir && !onizlemeIstenir) sonOnizleme = 0;
      onizlemeIstenir = istenir;
    } else if (m.tip === "sahne") {
      if (m.islem === "sifirla") {
        sahneyiTemizle("sıfırlama");
        if (typeof m.nesil === "number") sahneNesli = m.nesil;
      } else if (m.islem === "senkron") {
        // Bağlanınca: kopukken sıfırlama kaçırıldıysa (nesil farklı) yerel artıklar da gitsin; figürler arkasından gelir
        if (sahneNesli !== null && sahneNesli !== m.nesil) sahneyiTemizle("kaçırılan sıfırlama");
        sahneNesli = m.nesil;
        if (yerelSifirlamaYapildi) {
          yerelSifirlamaYapildi = false;
          kopru.gonder({ tip: "gunluk", seviye: "uyari", mesaj: "Köprü yokken bu oynatıcıda ⇧0 ile yerel sıfırlama yapıldı; köprünün durumu uygulandı" });
        }
      }
    }
  },
  (d) => {
    baglanti = d;
    // "merhaba" gidip rol "oynatici" olduktan sonra (köprü günlüğü yalnız oynatıcıdan kabul eder)
    if (d === "bagli") window.setTimeout(sesUyarilariniGonder, 700);
  },
);

async function sesiAc() {
  const tamam = await ses.etkinlestir();
  if (tamam) {
    uyariKutusu.style.display = "none";
    ses.ortamAyarla(durum.ortam);
    void ses.ortamDongusu(ortamSesAnahtari(durum));
  }
}

function tamEkran() {
  if (!document.fullscreenElement) void document.documentElement.requestFullscreen().catch(() => undefined);
  else void document.exitFullscreen();
}

addEventListener("keydown", (e) => {
  // ⇧0: sahneyi temele döndür. e.code: Türkçe Q'da ⇧0 "=" yazar, fiziksel tuş aynı. Basılı tutmak tekrar istemez.
  if (e.code === "Digit0" && e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
    if (!e.repeat) sifirlamaIste();
    void sesiAc();
    return;
  }
  switch (e.key.toLowerCase()) {
    case "h":
      hud = !hud;
      break;
    case "k":
      kalibrasyon = !kalibrasyon;
      break;
    case "f":
      tamEkran();
      break;
    case "m":
      ses.sessizlik(!ses.sessiz);
      break;
    // Efekt tuşları: basılı tutunca (tuş tekrarı, saniyede ~30) efekt yağmuru olmasın
    case "1":
      if (!e.repeat) efektUygula({ tur: "patlama", siddet: 1, yon: 20 });
      break;
    case "2":
      if (!e.repeat) efektUygula({ tur: "toz_duman", siddet: 0.8, yon: -30 });
      break;
    case "3":
      if (!e.repeat) izli.ayarla({ ...durum.izliMermi, aktif: !izli.aktif });
      break;
    case "t":
      // Hoparlör testi: her kanalda sırayla gürültü, çalan kanalın adı ekranda; test sürerken T durdurur
      if (!e.repeat) void sesiAc().then(() => ses.hoparlorTesti());
      break;
  }
  void sesiAc();
});
addEventListener("pointerdown", () => void sesiAc());

// Kiosk: otomatik oynatma izni varsa ses hemen açılır; yoksa tıklama/tuş beklenir.
void ses.etkinlestir().then((tamam) => {
  if (!tamam) {
    uyariKutusu.textContent = "Sesi etkinleştirmek için ekrana dokunun veya bir tuşa basın";
    uyariKutusu.style.display = "block";
  }
});

void video.yukle().then((m) => {
  if (m.sesler) {
    ses.manifestAyarla(m.sesler, `${video.kok}sesler/`);
    void ses.ortamDongusu(ortamSesAnahtari(durum));
  }
  klipler.ayarla(m.klipler, video.kok);
  manifestYuklendi = true;
  // Manifest gelmeden kuyruğa alınan figürler (köprü bağlanır bağlanmaz yollar): 2B olanlar hemen oynar, 3B modeller
  // sahne hazır olunca (figurKomutu yeniden kuyruğa alır)
  const erkenGelenler = [...bekleyenFigurler.values()];
  bekleyenFigurler.clear();
  for (const k of erkenGelenler) figurKomutu(k);
  // 3B modeller: ön yükleme; "helikopter" adlı model Oda 2 helikopteri olur
  if (ucAktifOlabilir) {
    sahne3b.dokulariYukle(video.kok);
    for (const [ad, t] of Object.entries(klipler.tumTanimlar)) {
      if (t.tip !== "model") continue;
      const url = /^(https?:|data:|blob:|\/)/.test(t.dosya) ? t.dosya : video.kok + t.dosya;
      if (ad === "helikopter") sahne3b.helikopterYukle(url, t.boy, t.rotor, t.renk);
      else sahne3b.figurOnYukle(url);
    }
  }
  video.secim(durum.bolge, durum.ortam.mevsim, zamanDilimi(durum.ortam.saat));
  panoramayiGuncelle();
});

kopru.baslat();
// Oynatıcı uyarıları köprü günlüğüne (panelde görünür): model yüklenemedi, 3B katman hatası
sahne3b.uyari = (mesaj) => kopru.gonder({ tip: "gunluk", seviye: "uyari", mesaj });
if (sahne3b.hata) kopru.gonder({ tip: "gunluk", seviye: "hata", mesaj: `3B katman açılamadı: ${sahne3b.hata}` });
/**
 * Otomatik kalite seçimi köprü günlüğüne bir kez: bağlandıktan bir yoklama sonra (köprü oynatıcı günlüğünü 500 ms'de
 * bire sınırlar; ses uyarıları bağlanınca 700 ms'de gider). İstemci günlüğünde "bilgi" düzeyi yok: uyarı olarak düşer.
 */
function otomatikKaliteyiBildir(bagliGoruldu: boolean) {
  if (!kaliteSecimi.otomatikKart) return;
  if (kopru.durum !== "bagli" || !bagliGoruldu) {
    window.setTimeout(() => otomatikKaliteyiBildir(kopru.durum === "bagli"), 1500);
    return;
  }
  kopru.gonder({ tip: "gunluk", seviye: "uyari", mesaj: `kalite ${kaliteBilgisi}; panelden (Sistem › Oynatıcı ayarları) ya da ?kalite= ile değiştirilebilir` });
}
otomatikKaliteyiBildir(false);
/**
 * Ses düzeni uyarıları (istenen kanal sayısı cihazda yok, geçersiz ?ses= / ?hoparlor=): açılışta, köprü bağlanmadan
 * gelir; bekletilir, bağlanınca tek satırda köprü günlüğüne gider (köprü oynatıcı günlüğünü 500 ms'de bire sınırlar).
 */
const bekleyenSesUyarilari: string[] = [];
function sesUyarilariniGonder() {
  if (kopru.durum !== "bagli" || bekleyenSesUyarilari.length === 0) return;
  kopru.gonder({ tip: "gunluk", seviye: "uyari", mesaj: `Ses: ${bekleyenSesUyarilari.splice(0).join(" · ")}` });
}
ses.uyariDinle((mesaj) => {
  bekleyenSesUyarilari.push(mesaj);
  sesUyarilariniGonder();
});

/**
 * Panel için küçük önizleme: iki tuval (3B + 2B) ve aradaki geçiş örtüsü (duvardaki opaklığıyla) 384×(oran) JPEG'e
 * indirgenir, en çok ONIZLEME_ARALIGI_MS'de bir ve yalnız en az bir panel bağlıyken (köprü `baglanti.panel.sayi` ile
 * bildirir) köprüye gönderilir (köprü yalnızca panellere iletir). Kontrol odasında duvarı görmeyen eğitmen "duvarda şu
 * an ne var" sorusunu canlı sahne kartından yanıtlar. toDataURL ana iş parçacığını GPU'yu beklemeye zorlar (Iris Xe,
 * yüksek kalite: 160–200 ms takılma); bu yüzden seyrek ve izleyen yokken hiç. Bir sonraki kareyi hemen isteyenler:
 * sahne sıfırlaması (örtü eski kareyi tutuyorsa ilk temiz kare beklenir: panel "temizleniyor…" bayat görüntüyle
 * bitmesin), yeni bağlanan panel ve biten sahne geçişi (yeni panorama duvarda; panel 5 sn eski sahneyi göstermesin).
 */
const ONIZLEME_ARALIGI_MS = 5000;
const onizlemeTuval = document.createElement("canvas");
let sonOnizleme = 0;
/** En az bir panel bağlı mı (köprünün `baglanti` mesajından; bilinene kadar gönderilmez). */
let onizlemeIstenir = false;
/** Geçiş örtüsü önceki karede görünüyordu (kalktığı karede önizleme hemen gider). */
let ortuSuruyordu = false;
function onizlemeGonder(simdi: number) {
  if (kopru.durum !== "bagli" || !onizlemeIstenir || gecis.temizlikBekliyor || simdi - sonOnizleme < ONIZLEME_ARALIGI_MS || W === 0 || H === 0) return;
  sonOnizleme = simdi;
  try {
    const g = 384;
    const y = Math.max(24, Math.round((g * H) / W));
    if (onizlemeTuval.width !== g || onizlemeTuval.height !== y) {
      onizlemeTuval.width = g;
      onizlemeTuval.height = y;
    }
    const c = onizlemeTuval.getContext("2d");
    if (!c) return;
    c.fillStyle = "#000";
    c.fillRect(0, 0, g, y);
    if (tuval3b.style.visibility !== "hidden") c.drawImage(tuval3b, 0, 0, g, y);
    // Geçiş örtüsü duvardaki opaklığıyla (3B ile 2B arasında)
    const ortu = gecis.opaklik;
    if (ortu > 0.01) {
      c.globalAlpha = ortu;
      c.drawImage(tuvalGecis, 0, 0, g, y);
      c.globalAlpha = 1;
    }
    c.drawImage(tuval, 0, 0, g, y);
    const bilgi = `${fps.toFixed(0)} fps · ${W}×${H} · kalite ${sahne3b.kalite}${kaliteSecimi.otomatikKart ? " (otomatik)" : ""} · 3B ${sahne3b.hazir ? "açık" : "kapalı"} · figür ${sahne3b.figurSayisi} · krater ${sahne3b.kraterSayisi}${sahne3b.panoramaYukleniyor ? ` · ${sahne3b.gecisBilgisi}` : ""}`;
    kopru.gonder({ tip: "onizleme", veri: onizlemeTuval.toDataURL("image/jpeg", 0.55), bilgi });
  } catch {
    /* tuval okunamazsa (tainted) önizleme yok */
  }
}

let sonZaman = performance.now();
let fpsSayac = 0;
let fpsZaman = 0;

function kare(simdi: number) {
  const dt = Math.min(0.1, (simdi - sonZaman) / 1000);
  sonZaman = simdi;
  fpsSayac++;
  fpsZaman += dt;
  if (fpsZaman >= 1) {
    fps = fpsSayac / fpsZaman;
    fpsSayac = 0;
    fpsZaman = 0;
  }

  // Güncelle
  const ufukYy = ufuk();
  gokyuzuGuncelle(dt, durum.ortam);
  araziGuncelle(dt);
  hava.guncelle(dt, durum.ortam);
  izli.guncelle(dt, yerlesimler, ufukYy, H, W);
  efektler.guncelle(dt);
  heli.guncelle(dt);
  video.guncelle(dt);
  klipler.guncelle(dt);
  sahne3b.guncelle(dt);
  // 3B helikopterde rotor sesi modelin konumundan gelir (yön, mesafe, Doppler); 2B siluette yönsüz (eski davranış)
  if (helikopter3B()) ses.helikopter(durum.oda === "oda2" ? durum.oda2.helikopter : "yok", sahne3b.helikopterTozu, sahne3b.helikopterSesKonumu);
  else ses.helikopter(heli.mevcutDurum, heli.tozSiddeti);

  // Çiz
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const s = efektler.sallantiMiktari * (H / 1080);
  const sx = s > 0.5 ? (Math.random() - 0.5) * s : 0;
  const sy = s > 0.5 ? (Math.random() - 0.5) * s : 0;
  if (s > 0.5) ctx.translate(sx, sy);
  tuval3b.style.transform = s > 0.5 ? `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)` : "";
  const gok = gokyuzuRenkleri(durum.ortam);

  // Arka plan önceliği: 3B sahne (panorama resmi + 3B nesneler, alt tuval) → 360° panorama (WebGL) → düz video döngüsü → parametrik sahne
  const ucCizildi = sahne3b.ciz();
  // Sahne geçişi: yeni panorama hazır (ya da bölge, kar, yön değişti) → eski kare örtüye kopyalanır (ciz'den hemen sonra,
  // aynı görevde: çizim tamponu yalnız bu görevde geçerli), takas aynı karede yapılır; örtü yeni sahne çizilince solar.
  if (sahne3b.takasHazir && !gecis.suruyor) {
    if (sahne3b.buKareCizildi) gecis.yakala(tuval3b);
    else if (panoramaGosterildi) gecis.yakala(tuval); // 2B panorama ekrandaydı (önceki karenin 2B tuvali)
    else gecis.siyahla(); // ilk açılış: ilk sahne siyahtan solar
    sahne3b.takasYap(simdi);
  }
  if (gecis.solmaBekliyor && sahne3b.solmaHazir(simdi)) {
    gecis.solmaBaslat();
    sahne3b.solmaBasladi(simdi);
  }
  // Geçiş sürerken sahne sıfırlandıysa örtüdeki eski kare (figür, duman, iz) artık yanlış: yeni sahne bu karede
  // çizildiyse (ya da örtü zaten soluyorsa, 3B katman kapandıysa) örtü solmadan kalkar. Solma hiç başlamadıysa geçiş
  // ölçümü burada kapanır. Gelen panorama ve ertelenen bölge işleri (takas) etkilenmez.
  if (gecis.temizKaredeKaldir(sahne3b.buKareCizildi || !sahne3b.hazir) === "bekliyor") sahne3b.solmaBasladi(simdi);
  gecis.guncelle(tuval3b.style.transform);
  if (videoPanoramaBekleniyor && (panorama.aktif || panorama.hata)) {
    // Video panorama oynatılabilir: 3B katman kapanır (bir sonraki karede örtüyle)
    videoPanoramaBekleniyor = false;
    sahne3b.panoramaKapat();
  }
  if (ucCizildi) {
    tuval3b.style.visibility = "visible";
    ctx.clearRect(-50, -50, W + 100, H + 100);
    if (panorama.aktif && !videoPanoramaBekleniyor) panorama.sec(null, video.kok); // 3B ekranda: 2B panorama gereksiz
  } else tuval3b.style.visibility = "hidden";
  const arkaPlanVar = ucCizildi || (panorama.aktif && panorama.ciz(ctx, yerlesimler, W, H)) || (video.aktif && video.ciz(ctx, W, H));
  if (arkaPlanVar) panoramaGosterildi = true;
  // İlk panorama ya da manifest beklenirken siyah; parametrik yer tutucu yalnız hiç panorama yokken (panoramaGecisi.ts).
  // Takas karesinde (3B'de panorama var ama bu karede çizilmedi) ve örtü görünürken de siyah: yer tutucu bir kare bile çıkmaz.
  const bekleniyor = sahne3b.ilkPanoramaBekleniyor || sahne3b.hazir || gecis.suruyor || panorama.yukleniyor;
  const arkaPlan = arkaPlanKarari(arkaPlanVar, manifestYuklendi, bekleniyor, panoramaGosterildi);
  sonArkaPlan = arkaPlan;
  if (arkaPlan === "siyah") ctx.clearRect(-50, -50, W + 100, H + 100);
  for (const y of yerlesimler) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(y.x, 0, y.genislik, H);
    ctx.clip();
    if (arkaPlan === "yer_tutucu") {
      gokyuzuCiz(ctx, y, ufukYy, durum.ortam, gok);
      araziCiz(ctx, y, H, durum.bolge, durum.ortam, gok);
    }
    // Oda 2'nin 2B ön planı (kum torbası, kaya) 3B sahneyle uyuşmaz; 3B'de çizilmez (3B sütre modelleri gelecek)
    if (durum.oda === "oda2" && !ucCizildi && arkaPlan !== "siyah") oda2OnPlanCiz(ctx, y, H, durum.oda2.guvenliAlan, gok.isik);
    ctx.restore();
  }
  // Figürler ve diğer klipler sahnenin içinde: sisin altında kalır
  klipler.ciz(ctx, yerlesimler, ufukYy, H, gok.isik, ["figur", "diger", "hava"]);
  // 3B sahnede sis, bulut ve yağış gök örtüsünde ve 3B katmanda (sahne3b); 2B katmanlar yalnız 3B yokken
  if (!ucCizildi) {
    for (const y of yerlesimler) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(y.x, 0, y.genislik, H);
      ctx.clip();
      sisCiz(ctx, y, ufukYy, H, durum.ortam, gok);
      ctx.restore();
    }
  }
  heli.ciz(ctx, yerlesimler, ufukYy, H, gok.isik);
  if (!ucCizildi) {
    kararmaCiz(ctx, W, H, durum.ortam, gok.isik);
    hava.ciz(ctx, durum.ortam, gok.isik);
  }
  // Efekt plakaları (patlama, toz) kendi ışığıyla en üstte
  klipler.ciz(ctx, yerlesimler, ufukYy, H, gok.isik, ["efekt"]);
  efektler.ciz(ctx);
  izli.ciz(ctx, H);
  if (efektler.flasAlfa > 0.01) {
    ctx.fillStyle = `rgba(255,245,220,${efektler.flasAlfa})`;
    ctx.fillRect(-50, -50, W + 100, H + 100);
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  hazirOluncaYenidenUygula();
  bekleyenFigurleriUygula();
  bekleyenEfektleriUygula();
  // Sahne geçişi bitti (örtü kalktı, yeni sahne duvarda): panelin önizlemesi 5 sn beklemesin
  if (ortuSuruyordu && !gecis.suruyor) sonOnizleme = 0;
  ortuSuruyordu = gecis.suruyor;
  onizlemeGonder(simdi);
  if (kalibrasyon) kalibrasyonCiz(ctx, W, H, yerlesimler, duvarOzeti);
  const sesTesti = ses.testDurumu;
  if (sesTesti) uyariCiz(ctx, W, H, `Hoparlör testi: ${sesTesti.ad}`, `kanal ${sesTesti.kanal} / ${sesTesti.toplam} · ${ses.duzenBilgisi}${ses.sessiz ? " · SESSİZ (M ile aç)" : ""} · T durdurur`);
  else if (baglanti === "kopuk") uyariCiz(ctx, W, H, "Köprü sunucusu bekleniyor…", "Oynatıcı, köprüye (port 4000) bağlanınca panelden yönetilir");
  if (hud) {
    hudCiz(
      ctx,
      [
        `Duvar Oynatıcı · ${W}×${H} · ${fps.toFixed(0)} fps · köprü ${baglanti}${durumGeldi ? "" : " (durum bekleniyor)"} · ses ${ses.hazir ? (ses.sessiz ? "sessiz" : "açık") : "kapalı"}: ${ses.duzenBilgisi}`,
        `${durum.oda === "oda1" ? "Oda 1" : "Oda 2"} · ${BOLGE_ETIKETLERI[durum.bolge]} · ${durum.ortam.mevsim} · saat ${durum.ortam.saat.toFixed(2)} (${zamanDilimi(durum.ortam.saat)}) · ışık ${gok.isik.toFixed(2)}`,
        `bulut ${durum.ortam.bulut.toFixed(2)} · sis ${durum.ortam.sis.toFixed(2)} · yağış ${durum.ortam.yagis} · rüzgâr ${durum.ortam.ruzgarSiddeti.toFixed(2)} @ ${durum.ortam.ruzgarYonu}°`,
        `izli mermi ${durum.izliMermi.aktif ? `açık (duvar ${durum.izliMermi.cikisNoktasi}, ${durum.izliMermi.yon}°, ${durum.izliMermi.siklik}/sn)` : "kapalı"} · oda2 ${GUVENLI_ALAN_ETIKETLERI[durum.oda2.guvenliAlan]} · helikopter ${HELIKOPTER_ETIKETLERI[durum.oda2.helikopter]}`,
        `içerik: ${ucCizildi ? "3B sahne + panorama" : panorama.aktif ? `360° panorama (${panorama.kaynakAdi.split("/").pop()})` : video.aktif ? "video döngüsü" : arkaPlan === "siyah" ? "bekleniyor (siyah)" : "parametrik yer tutucu"}${panorama.hata ? ` · panorama hatası: ${panorama.hata}` : ""}${sahne3b.hata ? ` · 3B hatası: ${sahne3b.hata}` : ""} · aktif klip ${klipler.aktifSayisi} · duvar ${duvarAcilari} · H hud · K kalibrasyon · F tam ekran · M sessiz · T hoparlör testi · 1/2/3 test · ⇧0 sıfırla`,
        `geometri: ${duvarOzeti[0]} | ${duvarOzeti[1]}`,
        `3B: ${ucAktifOlabilir ? (sahne3b.hazir ? "açık" : "bekliyor") : ucBoyut ? "desteklenmiyor" : "kapalı (?uc=0)"} · kalite ${kaliteBilgisi} · arazi ${sahne3b.araziDurumu} · ${sahne3b.gunesBilgisi} · figür ${sahne3b.figurSayisi} · krater ${sahne3b.kraterSayisi} · parçacık ${sahne3b.parcacikSayisi} · çizim/duvar ${sahne3b.cizimCagrisi} · iz ${sahne3b.izSayisi} · çatışma ${durum.catisma?.aktif ? `%${Math.round(durum.catisma.siddet * 100)} @ ${durum.catisma.yon}°` : "kapalı"} · helikopter ${sahne3b.helikopterHazir ? `model, iniş ${sahne3b.helikopterAzimutu.toFixed(0)}°` : "siluet"}`,
        `${sahne3b.gecisBilgisi}${gecis.suruyor ? ` · örtü %${Math.round(gecis.opaklik * 100)}` : ""} · solma ${gecis.sureMs} ms (?gecis=)`,
      ],
      H,
    );
  }
  requestAnimationFrame(kare);
}
requestAnimationFrame(kare);
