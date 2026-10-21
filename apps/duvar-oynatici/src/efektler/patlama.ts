/** Patlama, toz/duman, uzak patlama ve ekran sarsıntısı. Manifestte alfa video varsa onlar tercih edilir. */
import { azimutKonum, type Yerlesim } from "../projeksiyon";

interface Parcacik {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  t: number;
  sure: number;
  renk: [number, number, number];
}

interface Patlama {
  x: number;
  y: number;
  t: number;
  siddet: number;
  olcek: number;
  uzak: boolean;
}

export class EfektSistemi {
  private parcaciklar: Parcacik[] = [];
  private patlamalar: Patlama[] = [];
  private flas = 0;
  private sallanti = 0;

  /** Ekran sarsıntısı (piksel). */
  get sallantiMiktari() {
    return this.sallanti;
  }
  get flasAlfa() {
    return Math.min(0.85, this.flas);
  }

  patlama(azimut: number, siddet: number, yerlesimler: Yerlesim[], ufukY: number, H: number) {
    const konum = azimutKonum(azimut, yerlesimler, 20);
    const olcek = (0.7 + siddet * 0.8) * (H / 1080);
    const x = konum ? konum.x : azimut > 0 ? yerlesimler[yerlesimler.length - 1].x + yerlesimler[0].genislik : 0;
    const y = ufukY + (H - ufukY) * 0.25;
    this.patlamalar.push({ x, y, t: 0, siddet, olcek, uzak: false });
    this.flas = Math.max(this.flas, 0.5 + siddet * 0.4);
    this.sallanti = Math.max(this.sallanti, 8 + siddet * 20);
    this.dumanEkle(x, y, 10 + Math.round(siddet * 16), 60 * olcek, [60, 55, 50], siddet);
    // Kıvılcımlar
    for (let i = 0; i < 40 * siddet; i++) {
      const a = Math.random() * Math.PI * 2;
      const h = (200 + Math.random() * 500) * olcek;
      this.parcaciklar.push({ x, y, vx: Math.cos(a) * h, vy: Math.sin(a) * h - 300 * olcek, r: 2 * olcek, t: 0, sure: 0.5 + Math.random() * 0.6, renk: [255, 200, 90] });
    }
  }

  uzakPatlama(azimut: number, siddet: number, yerlesimler: Yerlesim[], ufukY: number, H: number) {
    const konum = azimutKonum(azimut, yerlesimler, 20);
    if (!konum) {
      this.flas = Math.max(this.flas, 0.15 * siddet);
      return;
    }
    const olcek = (0.15 + siddet * 0.15) * (H / 1080);
    this.patlamalar.push({ x: konum.x, y: ufukY - H * 0.01, t: 0, siddet, olcek, uzak: true });
    this.flas = Math.max(this.flas, 0.12 * siddet);
    this.dumanEkle(konum.x, ufukY, 6, 25 * olcek * 4, [80, 75, 70], siddet * 0.5);
  }

  tozDuman(azimut: number, siddet: number, yerlesimler: Yerlesim[], ufukY: number, H: number) {
    const konum = azimutKonum(azimut, yerlesimler, 20);
    const x = konum ? konum.x : yerlesimler[1].x + yerlesimler[1].genislik / 2;
    const y = ufukY + (H - ufukY) * 0.35;
    this.dumanEkle(x, y, 18 + Math.round(siddet * 20), 70 * (H / 1080), [150, 140, 120], siddet, 6);
  }

  private dumanEkle(x: number, y: number, adet: number, r: number, renk: [number, number, number], siddet: number, sure = 4) {
    for (let i = 0; i < adet; i++) {
      this.parcaciklar.push({
        x: x + (Math.random() - 0.5) * r,
        y: y + (Math.random() - 0.5) * r * 0.4,
        vx: (Math.random() - 0.5) * r * 0.8,
        vy: -(20 + Math.random() * 60) * (0.5 + siddet),
        r: r * (0.5 + Math.random()),
        t: 0,
        sure: sure * (0.6 + Math.random() * 0.8),
        renk,
      });
    }
  }

  guncelle(dt: number) {
    for (const p of this.parcaciklar) {
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.renk[0] > 200) p.vy += 900 * dt; // kıvılcımlar düşer
      else {
        p.vx *= 1 - dt * 0.4;
        p.r += dt * p.r * 0.35; // duman genişler
      }
    }
    this.parcaciklar = this.parcaciklar.filter((p) => p.t < p.sure);
    for (const p of this.patlamalar) p.t += dt;
    this.patlamalar = this.patlamalar.filter((p) => p.t < (p.uzak ? 1.2 : 1.0));
    this.flas = Math.max(0, this.flas - dt * 2.5);
    this.sallanti = Math.max(0, this.sallanti - dt * 50);
  }

  ciz(ctx: CanvasRenderingContext2D) {
    // Duman (normal karışım)
    for (const p of this.parcaciklar) {
      if (p.renk[0] > 200) continue;
      const alfa = (1 - p.t / p.sure) * 0.55;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      g.addColorStop(0, `rgba(${p.renk.join(",")},${alfa})`);
      g.addColorStop(1, `rgba(${p.renk.join(",")},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
    }
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    // Ateş topu
    for (const p of this.patlamalar) {
      const t = p.t / (p.uzak ? 1.2 : 1.0);
      const r = (p.uzak ? 60 : 160) * p.olcek * (0.3 + Math.pow(t, 0.4) * 1.4);
      const alfa = Math.pow(1 - t, 1.6) * (p.uzak ? 0.7 : 1);
      const g = ctx.createRadialGradient(p.x, p.y - r * 0.3, 0, p.x, p.y - r * 0.3, r);
      g.addColorStop(0, `rgba(255,250,210,${alfa})`);
      g.addColorStop(0.3, `rgba(255,170,50,${alfa * 0.9})`);
      g.addColorStop(0.7, `rgba(200,60,10,${alfa * 0.5})`);
      g.addColorStop(1, "rgba(60,20,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - r * 0.3, r, r * (1 + t * 0.6), 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Kıvılcımlar
    for (const p of this.parcaciklar) {
      if (p.renk[0] <= 200) continue;
      ctx.fillStyle = `rgba(${p.renk.join(",")},${1 - p.t / p.sure})`;
      ctx.fillRect(p.x, p.y, p.r, p.r);
    }
    ctx.restore();
  }
}
