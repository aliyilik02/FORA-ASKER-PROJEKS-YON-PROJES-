/** Hava katmanları: yağmur, kar, sis, bulut kararması. Manifestte alfa video varsa onlar kullanılır. */
import { rgb, type Yerlesim } from "../projeksiyon";
import type { OrtamAyarlari } from "../tipler";
import type { GokyuzuRenkleri } from "./gokyuzu";

interface Damla {
  x: number;
  y: number;
  hiz: number;
  boy: number;
  faz: number;
}

export class HavaSistemi {
  private damlalar: Damla[] = [];
  private W = 0;
  private H = 0;

  boyutlandir(W: number, H: number) {
    this.W = W;
    this.H = H;
    this.damlalar = [];
  }

  guncelle(dt: number, ortam: OrtamAyarlari) {
    const hedef = ortam.yagis === "yok" ? 0 : ortam.yagis === "hafif_yagmur" ? 500 : ortam.yagis === "siddetli_yagmur" ? 1600 : 900;
    const olcek = (this.W * this.H) / (5760 * 1080);
    const hedefAdet = Math.round(hedef * Math.max(0.2, olcek));
    while (this.damlalar.length < hedefAdet) {
      this.damlalar.push({ x: Math.random() * this.W, y: Math.random() * this.H, hiz: 0.6 + Math.random() * 0.8, boy: 0.5 + Math.random(), faz: Math.random() * 6.28 });
    }
    if (this.damlalar.length > hedefAdet) this.damlalar.length = hedefAdet;
    const kar = ortam.yagis === "kar";
    const yonIsareti = Math.cos((ortam.ruzgarYonu * Math.PI) / 180) >= 0 ? 1 : -1;
    const ruzgar = ortam.ruzgarSiddeti * yonIsareti;
    const hiz = kar ? this.H * 0.12 : this.H * 1.4;
    for (const d of this.damlalar) {
      d.y += d.hiz * hiz * dt;
      d.x += (ruzgar * this.H * (kar ? 0.25 : 0.6) + (kar ? Math.sin(d.y * 0.02 + d.faz) * 20 : 0)) * dt;
      if (d.y > this.H) {
        d.y = -10;
        d.x = Math.random() * this.W;
      }
      if (d.x > this.W) d.x -= this.W;
      if (d.x < 0) d.x += this.W;
    }
  }

  /** Duvar bağımsız, tüm tuvale çizilir (parçacıklar panoramadan bağımsız ön katman). */
  ciz(ctx: CanvasRenderingContext2D, ortam: OrtamAyarlari, isik: number) {
    if (this.damlalar.length === 0) return;
    const kar = ortam.yagis === "kar";
    const yonIsareti = Math.cos((ortam.ruzgarYonu * Math.PI) / 180) >= 0 ? 1 : -1;
    if (kar) {
      ctx.fillStyle = `rgba(255,255,255,${0.5 + isik * 0.4})`;
      for (const d of this.damlalar) {
        ctx.beginPath();
        ctx.arc(d.x, d.y, 1.2 + d.boy * 2.2 * (this.H / 1080), 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.strokeStyle = `rgba(200,215,235,${0.18 + isik * 0.22})`;
      ctx.lineWidth = Math.max(1, this.H / 900);
      ctx.beginPath();
      const egim = ortam.ruzgarSiddeti * 0.5 * yonIsareti;
      for (const d of this.damlalar) {
        const boy = (10 + d.boy * 18) * (this.H / 1080);
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x + egim * boy, d.y + boy);
      }
      ctx.stroke();
    }
  }
}

/** Sis: ufuktan yukarı ve aşağı yayılan yarı saydam katman; yoğunluğa göre uzağı siler. */
export function sisCiz(ctx: CanvasRenderingContext2D, y: Yerlesim, ufukY: number, H: number, ortam: OrtamAyarlari, gok: GokyuzuRenkleri) {
  if (ortam.sis <= 0.01) return;
  const renk = gok.ufuk;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, rgb(renk, ortam.sis * 0.35));
  g.addColorStop(ufukY / H, rgb(renk, Math.min(0.95, ortam.sis * 1.1)));
  g.addColorStop(1, rgb(renk, ortam.sis * 0.55));
  ctx.fillStyle = g;
  ctx.fillRect(y.x, 0, y.genislik, H);
}

/** Bulut örtüsü kararması + gece tonlaması (tüm tuval). */
export function kararmaCiz(ctx: CanvasRenderingContext2D, W: number, H: number, ortam: OrtamAyarlari, isik: number) {
  const bulutKararma = ortam.bulut * 0.22 * isik;
  if (bulutKararma > 0.01) {
    ctx.fillStyle = `rgba(20,24,34,${bulutKararma})`;
    ctx.fillRect(0, 0, W, H);
  }
  if (ortam.yagis === "siddetli_yagmur") {
    ctx.fillStyle = `rgba(40,50,70,${0.12 * isik})`;
    ctx.fillRect(0, 0, W, H);
  }
}
