/**
 * İçerik manifesti ve video döngü katmanı. Eşleşen klip varsa iki <video> ile çapraz geçişli
 * oynatılır ve tuvale çizilir; yoksa çağıran taraf parametrik sahneye düşer.
 */
import type { SesManifesti } from "./ses";
import type { Bolge, Mevsim } from "./tipler";
import type { ZamanDilimi } from "./projeksiyon";

export interface DonguKaydi {
  bolge: Bolge;
  mevsim: Mevsim;
  zaman: ZamanDilimi;
  dosya: string;
  _ornek?: boolean;
}

export interface Manifest {
  dongu?: DonguKaydi[];
  katmanlar?: Record<string, string | null>;
  sesler?: SesManifesti;
}

interface Katman {
  video: HTMLVideoElement;
  anahtar: string;
  alfa: number;
  hazir: boolean;
}

export class VideoKatmani {
  manifest: Manifest = {};
  private katmanlar: Katman[] = [];
  private aktifAnahtar = "";
  readonly kok: string;

  constructor(kok = "icerik/") {
    this.kok = kok;
  }

  async yukle(): Promise<Manifest> {
    try {
      const yanit = await fetch(`${this.kok}manifest.json`, { cache: "no-store" });
      if (yanit.ok) this.manifest = (await yanit.json()) as Manifest;
    } catch {
      this.manifest = {};
    }
    return this.manifest;
  }

  /** Klip var mı? Varsa geçişi başlatır. Döngü eşleşmesi: bölge + mevsim (yaz/kış'a indirgenir) + zaman dilimi. */
  secim(bolge: Bolge, mevsim: Mevsim, zaman: ZamanDilimi): boolean {
    const m: Mevsim = mevsim === "kis" ? "kis" : "yaz";
    const kayit = (this.manifest.dongu ?? []).find((d) => !d._ornek && d.bolge === bolge && (d.mevsim === m || d.mevsim === mevsim) && d.zaman === zaman)
      ?? (this.manifest.dongu ?? []).find((d) => !d._ornek && d.bolge === bolge && (d.mevsim === m || d.mevsim === mevsim));
    if (!kayit) {
      this.aktifAnahtar = "";
      return false;
    }
    const anahtar = kayit.dosya;
    if (anahtar === this.aktifAnahtar) return true;
    this.aktifAnahtar = anahtar;
    if (!this.katmanlar.some((k) => k.anahtar === anahtar)) {
      const video = document.createElement("video");
      video.src = this.kok + kayit.dosya;
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      const katman: Katman = { video, anahtar, alfa: 0, hazir: false };
      video.addEventListener("canplay", () => {
        katman.hazir = true;
        void video.play().catch(() => undefined);
      });
      video.addEventListener("error", () => {
        this.katmanlar = this.katmanlar.filter((k) => k !== katman);
        if (this.aktifAnahtar === anahtar) this.aktifAnahtar = "";
      });
      this.katmanlar.push(katman);
    }
    return true;
  }

  get aktif() {
    return this.aktifAnahtar !== "" && this.katmanlar.some((k) => k.anahtar === this.aktifAnahtar && k.hazir);
  }

  /** Çapraz geçiş ilerletir; biten katmanları kaldırır. */
  guncelle(dt: number) {
    for (const k of this.katmanlar) {
      const hedef = k.anahtar === this.aktifAnahtar ? 1 : 0;
      k.alfa += (hedef - k.alfa) * Math.min(1, dt / 0.8);
      if (hedef === 0 && k.alfa < 0.02) {
        k.video.pause();
        k.video.src = "";
      }
    }
    this.katmanlar = this.katmanlar.filter((k) => k.anahtar === this.aktifAnahtar || k.alfa >= 0.02);
  }

  /** Tüm tuvale (3 duvar yan yana) çizer. Klip 5760x1080 düzeninde beklenir. */
  ciz(ctx: CanvasRenderingContext2D, W: number, H: number): boolean {
    let cizildi = false;
    for (const k of this.katmanlar) {
      if (!k.hazir || k.alfa <= 0.01) continue;
      ctx.globalAlpha = k.alfa;
      ctx.drawImage(k.video, 0, 0, W, H);
      ctx.globalAlpha = 1;
      cizildi = true;
    }
    return cizildi;
  }
}
