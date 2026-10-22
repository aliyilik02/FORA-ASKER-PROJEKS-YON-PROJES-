/**
 * Alfa kanallı klip katmanı: panoramaya yerleştirilen "billboard"lar.
 *
 * Aynı mekanizma üç şeyi taşır:
 *  - efekt plakaları (gerçek çekilmiş patlama, toz, namlu alevi; VP9 alfa WebM),
 *  - figürler (yeşil perdede çekilmiş asker/araç klipleri, yapay zekâ ile üretilip keylenmiş klipler),
 *  - sprite sayfaları (PNG ızgara; birçok VFX paketi böyle gelir).
 * Konum azimut + ufka göre yükseklik; boyut manifestteki "genislikDerece" (görsel açı) ile verilir,
 * böylece farklı duvar açılarında ve çözünürlüklerde ölçek tutarlı kalır.
 */
import { azimutKonum, type Yerlesim } from "./projeksiyon";

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
   * aşamalarda çizilebilir (figürler sisin altında, efektler üstünde).
   */
  ciz(ctx: CanvasRenderingContext2D, yerlesimler: Yerlesim[], ufukY: number, H: number, isik: number, kategoriler?: Array<KlipTanimi["kategori"]>) {
    for (const a of this.aktifler) {
      if (!a.hazir) continue;
      const kategori = a.tanim.kategori ?? "diger";
      if (kategoriler && !kategoriler.includes(kategori)) continue;
      const konum = azimutKonum(a.azimut, yerlesimler, a.tanim.genislikDerece * a.olcek);
      if (!konum) continue;
      const y = konum.yerlesim;
      const genislik = (a.tanim.genislikDerece * a.olcek * y.genislik) / y.duvar.fov;
      // Dikey görüş açısı (yaklaşık): derece başına piksel
      const dikeyFov = (2 * Math.atan(Math.tan((y.duvar.fov * Math.PI) / 360) * (H / y.genislik)) * 180) / Math.PI;
      const pxDerece = H / dikeyFov;
      const kayitY = ufukY - a.yukseklik * pxDerece;

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
      const yukseklik = genislik * (sh / sw);
      const x0 = konum.x - genislik / 2;
      const y0 = (a.tanim.taban ?? "zemin") === "zemin" ? kayitY - yukseklik : kayitY - yukseklik / 2;

      ctx.save();
      // Zemin gölgesi (figürler): temas hissi
      if ((a.tanim.golge ?? kategori === "figur") && (a.tanim.taban ?? "zemin") === "zemin") {
        ctx.fillStyle = `rgba(0,0,0,${0.12 + 0.25 * isik})`;
        ctx.beginPath();
        ctx.ellipse(konum.x, kayitY, genislik * 0.42, genislik * 0.1, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // Gece karartması ve mavi tonlama (efektler kendi ışığını yayar, karartılmaz)
      if (kategori !== "efekt" && isik < 0.98) {
        ctx.filter = `brightness(${(0.22 + 0.78 * isik).toFixed(3)}) saturate(${(0.6 + 0.4 * isik).toFixed(3)})`;
      }
      if (kategori === "efekt") ctx.globalCompositeOperation = "source-over";
      if (a.yansit) {
        ctx.translate(konum.x * 2, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(kaynak, sx, sy, sw, sh, x0, y0, genislik, yukseklik);
      ctx.restore();
    }
  }
}
