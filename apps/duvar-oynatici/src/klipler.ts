/**
 * Alfa kanallı klip katmanı: panoramaya yerleştirilen "billboard"lar.
 *
 * Aynı mekanizma üç şeyi taşır:
 *  - efekt plakaları (gerçek çekilmiş patlama, toz, namlu alevi; VP9 alfa WebM),
 *  - figürler (yeşil perdede çekilmiş asker/araç klipleri, yapay zekâ ile üretilip keylenmiş klipler),
 *  - sprite sayfaları (PNG ızgara; birçok VFX paketi böyle gelir).
 * Konum azimut + ufka göre yükseklik; boyut manifestteki "genislikDerece" (görsel açı) ile verilir,
 * böylece farklı duvar açılarında ve çözünürlüklerde ölçek tutarlı kalır. Yerleşim 3B kameralarla aynı
 * perspektif izdüşümüyle yapılır (projeksiyon.ts); köşeye taşan klibin her duvar kendi parçasını çizer.
 */
import { aciGenisligi, aciNormalize, azimutGorunur, azimutX, type TuvalNoktasi, ufukSatiri, yonuIzdusur, type Yerlesim } from "./projeksiyon";

/** Kare döngüsünde ayırma olmasın diye ortak ara nesneler (parçalar duvar sayısına bir kez büyür). */
const nokta: TuvalNoktasi = { x: 0, y: 0 };
const parcalar: KlipParcasi[] = [];
const parcaDuvarlari: number[] = [];

/** Klibin bir duvardaki parçası: tuval dikdörtgeni + kaynakta görünen sütun aralığı. */
export interface KlipParcasi {
  xSol: number;
  xSag: number;
  yUst: number;
  yAlt: number;
  /** Kaynak sütun aralığı (0–1, klibin solundan; aynalama çizimde uygulanır). */
  f0: number;
  f1: number;
}

/**
 * Klibin `y` duvarındaki parçası. Klip `azimut` ± genişlik/2 aralığını kaplar; duvarın açı aralığıyla kesişimi
 * çizilir (köşede kesilir), kaynak sütunları azimutla doğrusal. Satırlar klibin ortasında; köşede kesilen parçada
 * kesim azimutunda: iki duvarın parçaları köşede aynı sütun ve satırda birleşir (boşluk, tekrar ya da basamak yok).
 * `kaydirma`: sahne ufku − izdüşümün göz hizası satırı (piksel). Parça yoksa false; sonuç `cikti`ya yazılır.
 */
export function klipParcasi(azimut: number, acisalGenislik: number, altAci: number, acisalYukseklik: number, y: Yerlesim, kaydirma: number, cikti: KlipParcasi): boolean {
  if (!azimutGorunur(azimut, y.duvar, acisalGenislik / 2)) return false;
  const azSol = azimut - acisalGenislik / 2;
  const s0 = aciNormalize(y.duvar.solAzimut - azSol); // duvarın sol kenarı, klibin sol kenarından derece
  const p0 = Math.max(0, s0);
  const p1 = Math.min(acisalGenislik, s0 + y.duvar.fov);
  if (p1 <= p0) return false;
  const xSol = azimutX(azSol + p0, y, 180, altAci);
  const xSag = azimutX(azSol + p1, y, 180, altAci);
  if (xSol === null || xSag === null || xSag - xSol < 0.5) return false;
  const kesikSol = p0 > 0;
  const kesikSag = p1 < acisalGenislik;
  const azSatir = azSol + (kesikSol === kesikSag ? (p0 + p1) / 2 : kesikSol ? p0 : p1);
  if (!yonuIzdusur(azSatir, altAci, y, nokta, 180)) return false;
  const yAlt = nokta.y + kaydirma;
  if (!yonuIzdusur(azSatir, altAci + acisalYukseklik, y, nokta, 180)) return false;
  const yUst = nokta.y + kaydirma;
  if (yAlt - yUst < 0.5) return false;
  cikti.xSol = xSol;
  cikti.xSag = xSag;
  cikti.yUst = yUst;
  cikti.yAlt = yAlt;
  cikti.f0 = p0 / acisalGenislik;
  cikti.f1 = p1 / acisalGenislik;
  return true;
}

export interface KlipTanimi {
  dosya: string;
  kategori?: "efekt" | "figur" | "hava" | "diger";
  ad?: string;
  /** video / sprite: 2B klip katmanı; model: glTF, 3B sahne katmanı (sahne3b/figurler3b.ts). */
  tip?: "video" | "sprite" | "model";
  /** 3B model alanları (tip "model"): animasyon adı, hedef boy (m), yön düzeltmesi, yana hız (m/s), varsayılan mesafe, yatık. */
  animasyon?: string;
  boy?: number;
  yonDerece?: number;
  hiz?: number;
  mesafe?: number;
  yatik?: boolean;
  /** Helikopter modeli: döndürülecek rotor düğüm adları (ilki ana rotor). */
  rotor?: string[];
  /** Model malzemelerini tek renge boya (ör. "#55603f" haki); sivil modeller için. */
  renk?: string;
  /** Klibin kapladığı yatay görsel açı (derece), ölçek 1 için. */
  genislikDerece: number;
  /** Kayıt noktası: zemin (alt kenar) veya merkez. */
  taban?: "zemin" | "merkez";
  dongu?: boolean;
  /** Sprite sayfası: toplam kare, sütun sayısı, kare hızı. */
  kareler?: number;
  sutun?: number;
  fps?: number;
  /** Zemin gölgesi çizilsin mi (figürler için). */
  golge?: boolean;
  /** Yalnızca 3B sahne yokken kullanılacak yedek (ör. sentetik test plakası). */
  yedek?: boolean;
  _ornek?: boolean;
}

export interface OynatSecenekleri {
  id?: string;
  klip: string;
  azimut: number;
  yukseklik?: number;
  olcek?: number;
  dongu?: boolean;
  yansit?: boolean;
}

interface Aktif {
  id: string;
  ad: string;
  tanim: KlipTanimi;
  azimut: number;
  yukseklik: number;
  olcek: number;
  dongu: boolean;
  yansit: boolean;
  video?: HTMLVideoElement;
  resim?: HTMLImageElement;
  kare: number;
  zaman: number;
  hazir: boolean;
  bitti: boolean;
}

export class KlipKatmani {
  private tanimlar: Record<string, KlipTanimi> = {};
  private kok = "icerik/";
  private aktifler: Aktif[] = [];
  private sayac = 0;

  ayarla(tanimlar: Record<string, KlipTanimi> | undefined, kok: string) {
    this.tanimlar = Object.fromEntries(Object.entries(tanimlar ?? {}).filter(([ad, t]) => !ad.startsWith("_") && !t._ornek && typeof t.dosya === "string"));
    this.kok = kok;
  }

  var(ad: string): boolean {
    return ad in this.tanimlar;
  }

  tanim(ad: string): KlipTanimi | undefined {
    return this.tanimlar[ad];
  }

  /** Tüm tanımlar (3B modellerin ön yüklemesi için). */
  get tumTanimlar(): Record<string, KlipTanimi> {
    return this.tanimlar;
  }

  /** Verilen önekle başlayan kliplerden rastgele biri (ör. "patlama" → patlama_toprak_2). `yedekleriAtla`: "yedek" işaretliler hariç. */
  rastgele(onek: string, yedekleriAtla = false): string | null {
    const adaylar = Object.keys(this.tanimlar).filter((a) => (a === onek || a.startsWith(onek + "_")) && !(yedekleriAtla && this.tanimlar[a].yedek));
    return adaylar.length ? adaylar[Math.floor(Math.random() * adaylar.length)] : null;
  }

  get aktifSayisi() {
    return this.aktifler.length;
  }

  oynat(s: OynatSecenekleri): string | null {
    const tanim = this.tanimlar[s.klip];
    if (!tanim) return null;
    const id = s.id ?? `k${++this.sayac}`;
    this.durdur(id);
    const aktif: Aktif = {
      id,
      ad: s.klip,
      tanim,
      azimut: s.azimut,
      yukseklik: s.yukseklik ?? -4,
      olcek: s.olcek ?? 1,
      dongu: s.dongu ?? tanim.dongu ?? false,
      yansit: Boolean(s.yansit),
      kare: 0,
      zaman: 0,
      hazir: false,
      bitti: false,
    };
    const url = /^(https?:|data:|blob:|\/)/.test(tanim.dosya) ? tanim.dosya : this.kok + tanim.dosya;
    if (tanim.tip === "sprite" || /\.(png|webp|jpg|jpeg)$/i.test(tanim.dosya)) {
      const img = new Image();
      img.onload = () => {
        aktif.hazir = true;
      };
      img.onerror = () => {
        aktif.bitti = true;
      };
      img.src = url;
      aktif.resim = img;
    } else {
      const v = document.createElement("video");
      v.src = url;
      v.muted = true;
      v.playsInline = true;
      v.loop = aktif.dongu;
      v.preload = "auto";
      v.addEventListener("canplay", () => {
        if (aktif.hazir) return;
        aktif.hazir = true;
        void v.play().catch(() => undefined);
      });
      v.addEventListener("ended", () => {
        if (!aktif.dongu) aktif.bitti = true;
      });
      v.addEventListener("error", () => {
        aktif.bitti = true;
      });
      aktif.video = v;
    }
    this.aktifler.push(aktif);
    return id;
  }

  durdur(id: string) {
    for (const a of this.aktifler) if (a.id === id) this.kapat(a);
    this.aktifler = this.aktifler.filter((a) => a.id !== id);
  }

  temizle() {
    for (const a of this.aktifler) this.kapat(a);
    this.aktifler = [];
  }

  private kapat(a: Aktif) {
    if (a.video) {
      a.video.pause();
      a.video.removeAttribute("src");
      a.video.load();
    }
  }

  guncelle(dt: number) {
    for (const a of this.aktifler) {
      a.zaman += dt;
      if (a.resim && a.tanim.kareler) {
        const fps = a.tanim.fps ?? 24;
        const kare = Math.floor(a.zaman * fps);
        if (kare >= a.tanim.kareler) {
          if (a.dongu) a.kare = kare % a.tanim.kareler;
          else a.bitti = true;
        } else a.kare = kare;
      }
    }
    for (const a of this.aktifler) if (a.bitti) this.kapat(a);
    this.aktifler = this.aktifler.filter((a) => !a.bitti);
  }

  /**
   * Çizim. `isik` gece karartması için (0–1). Kategori süzgeci ile figürler ve efektler ayrı
   * aşamalarda çizilebilir (figürler sisin altında, efektler üstünde). `ufukY`: sahnenin ufuk satırı; izdüşümün
   * göz hizası satırından farklıysa (yer tutucu sahne, düz video döngüsü) klipler o kadar kaydırılır.
   */
  ciz(ctx: CanvasRenderingContext2D, yerlesimler: Yerlesim[], ufukY: number, H: number, isik: number, kategoriler?: Array<KlipTanimi["kategori"]>) {
    for (const a of this.aktifler) {
      if (!a.hazir) continue;
      const kategori = a.tanim.kategori ?? "diger";
      if (kategoriler && !kategoriler.includes(kategori)) continue;

      let kaynak: CanvasImageSource;
      let sx = 0;
      let sy = 0;
      let sw: number;
      let sh: number;
      if (a.video) {
        if (a.video.readyState < 2) continue;
        kaynak = a.video;
        sw = a.video.videoWidth;
        sh = a.video.videoHeight;
      } else if (a.resim) {
        kaynak = a.resim;
        if (a.tanim.kareler) {
          const sutun = a.tanim.sutun ?? a.tanim.kareler;
          const satir = Math.ceil(a.tanim.kareler / sutun);
          sw = a.resim.naturalWidth / sutun;
          sh = a.resim.naturalHeight / satir;
          sx = (a.kare % sutun) * sw;
          sy = Math.floor(a.kare / sutun) * sh;
        } else {
          sw = a.resim.naturalWidth;
          sh = a.resim.naturalHeight;
        }
      } else continue;
      if (!sw || !sh) continue;
      // Açısal boyut: genişlik manifestten, yükseklik klibin en/boy oranından; ikisi de duvara izdüşürülür
      // (kenara yakın klip perspektifle büyür, izleyici noktasından bakınca oranı korunur)
      const acisalGenislik = a.tanim.genislikDerece * a.olcek;
      const acisalYukseklik = acisalGenislik * (sh / sw);
      const zemin = (a.tanim.taban ?? "zemin") === "zemin";
      const altAci = zemin ? a.yukseklik : a.yukseklik - acisalYukseklik / 2;
      const golge = (a.tanim.golge ?? kategori === "figur") && zemin;

      // Önce duvar parçaları (köşeye taşan klip iki duvarda); `ev`: klibin ortasını gösteren duvarın parçası
      let n = 0;
      let ev = -1;
      for (let i = 0; i < yerlesimler.length; i++) {
        const y = yerlesimler[i];
        if (n === parcalar.length) parcalar.push({ xSol: 0, xSag: 0, yUst: 0, yAlt: 0, f0: 0, f1: 1 });
        if (!klipParcasi(a.azimut, acisalGenislik, altAci, acisalYukseklik, y, ufukY - ufukSatiri(y), parcalar[n])) continue;
        parcaDuvarlari[n] = i;
        if (ev < 0 && azimutGorunur(a.azimut, y.duvar)) ev = n;
        n++;
      }
      if (n === 0) continue;

      // Zemin gölgesi (figürler): temas hissi. Klibin tüm parçalarından önce (köşede bacakların üstüne düşmez),
      // değdiği her duvarda o duvara kırpılır; köşe ötesi izdüşüm komşu duvarınkiyle aynı noktayı verdiğinden
      // (projeksiyon.ts cizenYerlesim) elips iki duvarda aynı yerde birleşir.
      if (golge && ev >= 0) {
        const evDuvari = yerlesimler[parcaDuvarlari[ev]];
        const xOrta = azimutX(a.azimut, evDuvari, 0, altAci);
        if (xOrta !== null) {
          const g = aciGenisligi(a.azimut, acisalGenislik, evDuvari, altAci);
          const rx = g * 0.42;
          const yAlt = parcalar[ev].yAlt;
          for (const y of yerlesimler) {
            if (xOrta + rx < y.x || xOrta - rx > y.x + y.genislik) continue;
            ctx.save();
            ctx.beginPath();
            ctx.rect(y.x, 0, y.genislik, H);
            ctx.clip();
            ctx.fillStyle = `rgba(0,0,0,${0.12 + 0.25 * isik})`;
            ctx.beginPath();
            ctx.ellipse(xOrta, yAlt, rx, g * 0.1, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }
      }

      for (let k = 0; k < n; k++) {
        const { xSol, xSag, yUst, yAlt, f0, f1 } = parcalar[k];
        ctx.save();
        // Gece karartması ve mavi tonlama (efektler kendi ışığını yayar, karartılmaz)
        if (kategori !== "efekt" && isik < 0.98) {
          ctx.filter = `brightness(${(0.22 + 0.78 * isik).toFixed(3)}) saturate(${(0.6 + 0.4 * isik).toFixed(3)})`;
        }
        if (kategori === "efekt") ctx.globalCompositeOperation = "source-over";
        // Aynalı klipte konum p, kaynağın 1 − p/genişlik sütununu gösterir
        const kx = sx + (a.yansit ? 1 - f1 : f0) * sw;
        if (a.yansit) {
          ctx.translate(xSol + xSag, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(kaynak, kx, sy, (f1 - f0) * sw, sh, xSol, yUst, xSag - xSol, yAlt - yUst);
        ctx.restore();
      }
    }
  }
}
