/**
 * Duvar Oynatıcı – giriş noktası.
 *
 * Köprüden gelen durum (bölge, ortam, izli mermi, Oda 2) ve efekt olaylarını 3 duvara çizer.
 * Sorgu parametreleri:
 *   ?fov=90      duvar başına yatay açı (U duvar 90; düz tek duvar 3 projektör ≈ 40)
 *   ?doldur=1    48:9 oranını koruma, pencereyi tamamen doldur
 *   ?hud=1       hata ayıklama katmanı açık başlasın
 *   ?uc=0        3B sahne katmanını kapat (yalnızca 2B yol)
 *   ?gunes=1     3B sahnede güneş tahminini küreyle göster (panoramadaki güneşle çakışmalı)
 * Tuşlar: H hud · K kalibrasyon ızgarası · F tam ekran · M sessiz · 1 patlama · 2 toz · 3 izli mermi aç/kapa
 */
import * as THREE from "three";
import { KopruBaglantisi, type BaglantiDurumu } from "./baglanti";
import { EfektSistemi } from "./efektler/patlama";
import { Helikopter } from "./efektler/helikopter";
import { IzliMermiSistemi } from "./efektler/izliMermi";
import { hudCiz, kalibrasyonCiz, uyariCiz } from "./hud";
import { KlipKatmani } from "./klipler";
import { azimutPan, duvarYerlesimleri, duvarlariOlustur, type Yerlesim, yonAzimut, zamanDilimi } from "./projeksiyon";
import { araziCiz, araziGuncelle, ufukY as bolgeUfukY } from "./sahne/arazi";
import { gokyuzuCiz, gokyuzuGuncelle, gokyuzuRenkleri } from "./sahne/gokyuzu";
import { HavaSistemi, kararmaCiz, sisCiz } from "./sahne/hava";
import { oda2OnPlanCiz } from "./sahne/oda2";
import { PanoramaKatmani } from "./panorama";
import { Sahne3B } from "./sahne3b/sahne3b";
import { SesMotoru } from "./ses";
import { BOLGE_ETIKETLERI, GUVENLI_ALAN_ETIKETLERI, HELIKOPTER_ETIKETLERI, type EfektIstegi, type SimulasyonDurumu, varsayilanDurum } from "./tipler";
import { panoramaSec, VideoKatmani } from "./video";

const tuval = document.getElementById("tuval") as HTMLCanvasElement;
const tuval3b = document.getElementById("tuval3b") as HTMLCanvasElement;
// 2B tuval saydam: 3B sahne aktifken altındaki tuval görünür
const ctx = tuval.getContext("2d", { alpha: true })!;
const uyariKutusu = document.getElementById("uyari")!;
const params = new URLSearchParams(location.search);
const fov = Number(params.get("fov") ?? 90);
const doldur = params.get("doldur") === "1";
const ucBoyut = params.get("uc") !== "0";
const duvarlar = duvarlariOlustur(Number.isFinite(fov) && fov > 10 ? fov : 90);

let W = 0;
let H = 0;
let yerlesimler: Yerlesim[] = [];
let hud = params.get("hud") === "1";
let kalibrasyon = false;
let durum: SimulasyonDurumu = varsayilanDurum();
let durumGeldi = false;
let baglanti: BaglantiDurumu = "kopuk";
let fps = 0;

const ses = new SesMotoru();
const izli = new IzliMermiSistemi((x, genislik) => ses.vizilti((x / genislik) * 2 - 1));
const efektler = new EfektSistemi();
const heli = new Helikopter();
const hava = new HavaSistemi();
const video = new VideoKatmani("icerik/"); // belge tabanına göreli: /oynatici/icerik/ veya dev'de /icerik/
const panorama = new PanoramaKatmani();
const klipler = new KlipKatmani();
/** 3B sahne katmanı: panorama resmi arka plan + IBL, 3B figür/efekt/helikopter. Video panoramada 2B yol kalır. */
const sahne3b = new Sahne3B(tuval3b, params.get("gunes") === "1");
const ucAktifOlabilir = ucBoyut && sahne3b.destekli;
// Hata ayıklama: tarayıcı konsolundan sahneye erişim (window.duvar.sahne3b, window.duvar.THREE)
(window as unknown as { duvar: unknown }).duvar = { sahne3b, THREE };
/** ?panorama=<url> ile hızlı deneme: manifestten bağımsız, her bölgede bu 360° kaynak gösterilir. */
const testPanorama = params.get("panorama");
const testYaw = Number(params.get("yaw") ?? 0);

function videoMu(dosya: string, tip?: string) {
  return tip === "video" || /\.(mp4|webm|mov)(\?|$)/i.test(dosya);
}

function panoramayiGuncelle() {
  const kayit = testPanorama
    ? { dosya: testPanorama, tip: undefined, yawKaydirma: testYaw, yukseklikKaydirma: 0, zaman: undefined }
    : panoramaSec(video.manifest, durum.bolge, durum.ortam.mevsim, zamanDilimi(durum.ortam.saat));
  if (!kayit) {
    panorama.sec(null, video.kok);
    sahne3b.panoramaAyarla(null);
    return;
  }
  if (ucAktifOlabilir && !videoMu(kayit.dosya, kayit.tip)) {
    // Resim panorama → 3B katman (arka plan + ışık); eski WebGL panorama katmanı kapalı
    panorama.sec(null, video.kok);
    const url = /^(https?:|data:|blob:|\/)/.test(kayit.dosya) ? kayit.dosya : video.kok + kayit.dosya;
    sahne3b.panoramaAyarla({ url, yawKaydirma: kayit.yawKaydirma ?? 0, yukseklikKaydirma: kayit.yukseklikKaydirma ?? 0, zaman: kayit.zaman });
    return;
  }
  sahne3b.panoramaAyarla(null);
  panorama.sec({ dosya: kayit.dosya, tip: kayit.tip, yawKaydirma: kayit.yawKaydirma, yukseklikKaydirma: kayit.yukseklikKaydirma }, video.kok);
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
  tuval.style.left = tuval3b.style.left = sol;
  tuval.style.top = tuval3b.style.top = ust;
  yerlesimler = duvarYerlesimleri(W, H, duvarlar);
  hava.boyutlandir(W, H);
  sahne3b.boyutlandir(W, H, yerlesimler);
}
addEventListener("resize", boyutlandir);
boyutlandir();

function ufuk(): number {
  return sahne3b.hazir ? sahne3b.ufukY : bolgeUfukY(durum.bolge, H);
}

function efektUygula(e: EfektIstegi) {
  const azimut = yonAzimut(e.yon ?? 0);
  const pan = azimutPan(azimut);
  const siddet = e.siddet ?? 1;
  // Gerçek plaka varsa (manifest "klipler": patlama_*, toz_*) onu kullan, yoksa prosedürel efekt.
  // 3B sahne açıkken "yedek" işaretli (sentetik test) plakalar atlanır; 3B efekt daha iyidir.
  const plaka = (onek: string, yukseklik: number, olcek: number) => {
    const ad = klipler.rastgele(onek, sahne3b.hazir);
    if (!ad) return false;
    klipler.oynat({ klip: ad, azimut, yukseklik, olcek, yansit: Math.random() < 0.5 });
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
      void ses.patlama(pan, siddet);
      break;
    }
    case "toz_duman":
      if (uc) sahne3b.tozDuman(azimut, siddet);
      if (!plaka("toz", -3, 0.7 + siddet * 0.6) && !uc) efektler.tozDuman(azimut, siddet, yerlesimler, ufuk(), H);
      break;
    case "gurultu":
      void ses.gurultu(pan, siddet);
      break;
    case "bagirma":
      void ses.bagirma(pan);
      break;
    case "cagirma":
      void ses.cagirma(pan);
      break;
    case "uzak_patlama": {
      const plakaVar = plaka("uzak_patlama", 0.5, 0.25 + siddet * 0.15);
      if (uc) {
        sahne3b.patlama(azimut, siddet, true, plakaVar);
        efektler.flasVeSarsinti(siddet * 0.2);
      } else if (plakaVar) efektler.flasVeSarsinti(siddet * 0.2);
      else efektler.uzakPatlama(azimut, siddet, yerlesimler, ufuk(), H);
      void ses.patlama(pan, siddet, true, e.mesafe ?? 800);
      break;
    }
    case "uzak_mermi_sesi":
      void ses.mermi(pan, true);
      break;
  }
}

/** Ortam ses döngüsü anahtarı (manifest `sesler.ortam`): yağmur > gece > kış > bölge. */
function ortamSesAnahtari(d: SimulasyonDurumu): string {
  if (d.ortam.yagis === "hafif_yagmur" || d.ortam.yagis === "siddetli_yagmur") return "yagmur";
  if (zamanDilimi(d.ortam.saat) === "gece") return "gece";
  if (d.ortam.mevsim === "kis") return "kis";
  return d.bolge;
}

function durumUygula(d: SimulasyonDurumu) {
  if (d.bolge !== durum.bolge) sahne3b.sahneyiSifirla(); // kraterler ve duman bölgeyle birlikte gider
  durum = d;
  durumGeldi = true;
  izli.ayarla(d.izliMermi);
  const heliDurumu = d.oda === "oda2" ? d.oda2.helikopter : "yok";
  // 3B model varsa helikopter 3B sahnede uçar; yoksa 2B siluet
  if (sahne3b.helikopterHazir && sahne3b.hazir) {
    sahne3b.helikopterAyarla(heliDurumu);
    heli.durumAyarla("yok");
  } else {
    sahne3b.helikopterAyarla("yok");
    heli.durumAyarla(heliDurumu);
  }
  ses.ortamAyarla(d.ortam);
  void ses.ortamDongusu(ortamSesAnahtari(d));
  sahne3b.ortamAyarla(d.ortam, gokyuzuRenkleri(d.ortam).isik);
  video.secim(d.bolge, d.ortam.mevsim, zamanDilimi(d.ortam.saat));
  panoramayiGuncelle();
}

function figurKomutu(k: { islem: string; id: string; klip?: string; azimut?: number; yukseklik?: number; olcek?: number; dongu?: boolean; yansit?: boolean }) {
  if (k.islem === "temizle") {
    klipler.temizle();
    sahne3b.figurTemizle();
    return;
  }
  if (k.islem === "durdur") {
    klipler.durdur(k.id);
    sahne3b.figurDurdur(k.id);
    return;
  }
  if (!k.klip) return;
  const tanim = klipler.tanim(k.klip);
  if (tanim?.tip === "model" && sahne3b.hazir) {
    sahne3b.figurOynat(tanim, { id: k.id, azimut: k.azimut ?? 0, yukseklik: k.yukseklik, olcek: k.olcek, yansit: k.yansit, dongu: k.dongu }, video.kok);
    return;
  }
  if (tanim?.tip === "model") return; // 3B katman yok: model gösterilemez
  klipler.oynat({ id: k.id, klip: k.klip, azimut: k.azimut ?? 0, yukseklik: k.yukseklik, olcek: k.olcek, dongu: k.dongu, yansit: k.yansit });
}

const kopru = new KopruBaglantisi(
  (m) => {
    if (m.tip === "durum") durumUygula(m.durum);
    else if (m.tip === "efekt") efektUygula(m.efekt);
    else if (m.tip === "figur") figurKomutu(m.komut);
  },
  (d) => {
    baglanti = d;
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
    case "1":
      efektUygula({ tur: "patlama", siddet: 1, yon: 20 });
      break;
    case "2":
      efektUygula({ tur: "toz_duman", siddet: 0.8, yon: -30 });
      break;
    case "3":
      izli.ayarla({ ...durum.izliMermi, aktif: !izli.aktif });
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
  // 3B modeller: ön yükleme; "helikopter" adlı model Oda 2 helikopteri olur
  if (ucAktifOlabilir) {
    sahne3b.dokulariYukle(video.kok);
    for (const [ad, t] of Object.entries(klipler.tumTanimlar)) {
      if (t.tip !== "model") continue;
      const url = /^(https?:|data:|blob:|\/)/.test(t.dosya) ? t.dosya : video.kok + t.dosya;
      if (ad === "helikopter") sahne3b.helikopterYukle(url, t.boy, t.rotor);
      else sahne3b.figurOnYukle(url);
    }
  }
  video.secim(durum.bolge, durum.ortam.mevsim, zamanDilimi(durum.ortam.saat));
  panoramayiGuncelle();
});

kopru.baslat();

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
  if (sahne3b.helikopterHazir && sahne3b.hazir) ses.helikopter(durum.oda === "oda2" ? durum.oda2.helikopter : "yok", sahne3b.helikopterTozu);
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
  if (ucCizildi) {
    tuval3b.style.visibility = "visible";
    ctx.clearRect(-50, -50, W + 100, H + 100);
  } else tuval3b.style.visibility = "hidden";
  const arkaPlanVar = ucCizildi || (panorama.aktif && panorama.ciz(ctx, yerlesimler, W, H)) || (video.aktif && video.ciz(ctx, W, H));
  for (const y of yerlesimler) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(y.x, 0, y.genislik, H);
    ctx.clip();
    if (!arkaPlanVar) {
      gokyuzuCiz(ctx, y, ufukYy, durum.ortam, gok);
      araziCiz(ctx, y, H, durum.bolge, durum.ortam, gok);
    }
    if (durum.oda === "oda2") oda2OnPlanCiz(ctx, y, H, durum.oda2.guvenliAlan, gok.isik);
    ctx.restore();
  }
  // Figürler ve diğer klipler sahnenin içinde: sisin altında kalır
  klipler.ciz(ctx, yerlesimler, ufukYy, H, gok.isik, ["figur", "diger", "hava"]);
  for (const y of yerlesimler) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(y.x, 0, y.genislik, H);
    ctx.clip();
    sisCiz(ctx, y, ufukYy, H, durum.ortam, gok);
    ctx.restore();
  }
  heli.ciz(ctx, yerlesimler, ufukYy, H, gok.isik);
  kararmaCiz(ctx, W, H, durum.ortam, gok.isik);
  hava.ciz(ctx, durum.ortam, gok.isik);
  // Efekt plakaları (patlama, toz) kendi ışığıyla en üstte
  klipler.ciz(ctx, yerlesimler, ufukYy, H, gok.isik, ["efekt"]);
  efektler.ciz(ctx);
  izli.ciz(ctx, H);
  if (efektler.flasAlfa > 0.01) {
    ctx.fillStyle = `rgba(255,245,220,${efektler.flasAlfa})`;
    ctx.fillRect(-50, -50, W + 100, H + 100);
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (kalibrasyon) kalibrasyonCiz(ctx, W, H, duvarlar.map((d) => d.ad));
  if (baglanti === "kopuk") uyariCiz(ctx, W, H, "Köprü sunucusu bekleniyor…", "Oynatıcı, köprüye (port 4000) bağlanınca panelden yönetilir");
  if (hud) {
    hudCiz(
      ctx,
      [
        `Duvar Oynatıcı · ${W}×${H} · ${fps.toFixed(0)} fps · köprü ${baglanti}${durumGeldi ? "" : " (durum bekleniyor)"} · ses ${ses.hazir ? (ses.sessiz ? "sessiz" : "açık") : "kapalı"}`,
        `${durum.oda === "oda1" ? "Oda 1" : "Oda 2"} · ${BOLGE_ETIKETLERI[durum.bolge]} · ${durum.ortam.mevsim} · saat ${durum.ortam.saat.toFixed(2)} (${zamanDilimi(durum.ortam.saat)}) · ışık ${gok.isik.toFixed(2)}`,
        `bulut ${durum.ortam.bulut.toFixed(2)} · sis ${durum.ortam.sis.toFixed(2)} · yağış ${durum.ortam.yagis} · rüzgâr ${durum.ortam.ruzgarSiddeti.toFixed(2)} @ ${durum.ortam.ruzgarYonu}°`,
        `izli mermi ${durum.izliMermi.aktif ? `açık (duvar ${durum.izliMermi.cikisNoktasi}, ${durum.izliMermi.yon}°, ${durum.izliMermi.siklik}/sn)` : "kapalı"} · oda2 ${GUVENLI_ALAN_ETIKETLERI[durum.oda2.guvenliAlan]} · helikopter ${HELIKOPTER_ETIKETLERI[durum.oda2.helikopter]}`,
        `içerik: ${ucCizildi ? "3B sahne + panorama" : panorama.aktif ? `360° panorama (${panorama.kaynakAdi.split("/").pop()})` : video.aktif ? "video döngüsü" : "parametrik yer tutucu"}${panorama.hata ? ` · panorama hatası: ${panorama.hata}` : ""}${sahne3b.hata ? ` · 3B hatası: ${sahne3b.hata}` : ""} · aktif klip ${klipler.aktifSayisi} · fov ${duvarlar[0].fov}° · H hud · K kalibrasyon · F tam ekran · M sessiz · 1/2/3 test`,
        `3B: ${ucAktifOlabilir ? (sahne3b.hazir ? "açık" : "bekliyor") : ucBoyut ? "desteklenmiyor" : "kapalı (?uc=0)"} · ${sahne3b.gunesBilgisi} · figür ${sahne3b.figurSayisi} · krater ${sahne3b.kraterSayisi} · parçacık ${sahne3b.parcacikSayisi} · helikopter modeli ${sahne3b.helikopterHazir ? "var" : "yok"}`,
      ],
      H,
    );
  }
  requestAnimationFrame(kare);
}
requestAnimationFrame(kare);
