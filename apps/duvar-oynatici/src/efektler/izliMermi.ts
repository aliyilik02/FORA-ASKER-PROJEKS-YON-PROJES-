/**
 * İzli mermi: seçilen duvardaki uzak bir noktadan izleyiciye doğru süzülen parlak izler.
 * Çıkış duvarı, yön ve sıklık panelden gelir (şartname §5 / idare 1: "izli mermi ses ve görüntü efektleri").
 */
import { azimutX, type Yerlesim } from "../projeksiyon";
import type { IzliMermiAyarlari } from "../tipler";

interface Iz {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  t: number;
  sure: number;
  renk: string;
}

export class IzliMermiSistemi {
  private ayar: IzliMermiAyarlari = { aktif: false, cikisNoktasi: 1, yon: 0, siklik: 3 };
  private izler: Iz[] = [];
  private birikim = 0;

  constructor(private readonly sesCal: (x: number, W: number) => void) {}

  ayarla(a: IzliMermiAyarlari) {
    this.ayar = a;
  }

  get aktif() {
    return this.ayar.aktif;
  }

  guncelle(dt: number, yerlesimler: Yerlesim[], ufukY: number, H: number, W: number) {
    for (const iz of this.izler) iz.t += dt;
    this.izler = this.izler.filter((iz) => iz.t < iz.sure);
    if (!this.ayar.aktif) return;
    this.birikim += dt * this.ayar.siklik;
    const y = yerlesimler[this.ayar.cikisNoktasi] ?? yerlesimler[1];
    while (this.birikim >= 1) {
      this.birikim -= 1;
      // Çıkış: duvarın ufuk hattında, yöne göre kaydırılmış uzak nokta (biraz rastgele dağılım)
      const az = y.duvar.yaw + this.ayar.yon * 0.45 + (Math.random() - 0.5) * 6;
      const x0 = azimutX(az, y, 10) ?? y.x + y.genislik / 2;
      const y0 = ufukY - H * (0.02 + Math.random() * 0.08);
      // Hedef: izleyicinin yanından geçer → duvarın alt kenarına doğru, yönün tersine açılarak
      const sapma = (Math.random() - 0.5) * y.genislik * 1.3 - (this.ayar.yon / 90) * y.genislik * 0.4;
      const x1 = x0 + sapma;
      const y1 = H * (0.95 + Math.random() * 0.3);
      const seken = Math.random() < 0.15;
      this.izler.push({
        x0,
        y0,
        x1: seken ? x0 + sapma * 0.5 : x1,
        y1: seken ? ufukY + H * 0.2 : y1,
        t: 0,
        sure: 0.35 + Math.random() * 0.2,
        renk: Math.random() < 0.8 ? "255,150,60" : "150,255,120",
      });
      this.sesCal(x0, W);
    }
  }

  ciz(ctx: CanvasRenderingContext2D, H: number) {
    if (this.izler.length === 0) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    for (const iz of this.izler) {
      const p = iz.t / iz.sure;
      const kuyruk = Math.max(0, p - 0.18);
      const bx = iz.x0 + (iz.x1 - iz.x0) * p;
      const by = iz.y0 + (iz.y1 - iz.y0) * p;
      const ax = iz.x0 + (iz.x1 - iz.x0) * kuyruk;
      const ay = iz.y0 + (iz.y1 - iz.y0) * kuyruk;
      const kalinlik = (1 + p * 5) * (H / 1080);
      const g = ctx.createLinearGradient(ax, ay, bx, by);
      g.addColorStop(0, `rgba(${iz.renk},0)`);
      g.addColorStop(0.7, `rgba(${iz.renk},0.7)`);
      g.addColorStop(1, `rgba(255,255,230,1)`);
      ctx.strokeStyle = g;
      ctx.lineWidth = kalinlik;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      // Parlama
      ctx.fillStyle = `rgba(${iz.renk},${0.35 * (1 - p)})`;
      ctx.beginPath();
      ctx.arc(bx, by, kalinlik * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
