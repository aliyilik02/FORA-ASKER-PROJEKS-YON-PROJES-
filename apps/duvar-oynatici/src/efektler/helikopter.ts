/**
 * Oda 2 helikopter: yaklaşma → iniş → yerde → kalkış (idare 1.2: "gerçek alanlara inen helikopter
 * görüntü, ses ve efektleri"). Yer tutucu siluet; gerçek içerik alfa kanallı render dizisi olacak.
 */
import { azimutKonum, isikla, rgb, type Yerlesim } from "../projeksiyon";
import type { HelikopterDurumu } from "../tipler";

export class Helikopter {
  private durum: HelikopterDurumu = "yok";
  private faz = 0; // mevcut durumda geçen süre
  private rotor = 0;
  /** Görünür yükseklik 0 (yerde) – 1 (uzakta/yüksekte). */
  private irtifa = 1;
  private uzaklik = 1;
  private azimut = 10;

  durumAyarla(d: HelikopterDurumu) {
    if (d === this.durum) return;
    this.durum = d;
    this.faz = 0;
    if (d === "yaklasiyor") {
      this.irtifa = 1;
      this.uzaklik = 1;
    }
    if (d === "yerde") {
      this.irtifa = 0;
      this.uzaklik = 0.15;
    }
  }

  get mevcutDurum() {
    return this.durum;
  }
  /** Rotor tozu ve ses için 0–1 "yere yakınlık × motor gücü". */
  get tozSiddeti() {
    if (this.durum === "yok") return 0;
    const yakin = 1 - this.irtifa;
    return this.durum === "yerde" ? 0.5 : yakin * (1 - this.uzaklik * 0.8);
  }

  guncelle(dt: number) {
    if (this.durum === "yok") return;
    this.faz += dt;
    this.rotor += dt * 40;
    const ilerle = (hedef: number, deger: number, sure: number) => deger + (hedef - deger) * Math.min(1, dt / sure);
    switch (this.durum) {
      case "yaklasiyor":
        this.uzaklik = ilerle(0.15, this.uzaklik, 8);
        this.irtifa = ilerle(0.45, this.irtifa, 10);
        break;
      case "iniyor":
        this.uzaklik = ilerle(0.15, this.uzaklik, 3);
        this.irtifa = ilerle(0, this.irtifa, 6);
        break;
      case "yerde":
        this.irtifa = 0;
        break;
      case "kalkiyor":
        this.irtifa = ilerle(1, this.irtifa, 10);
        this.uzaklik = ilerle(1, this.uzaklik, 14);
        break;
    }
  }

  ciz(ctx: CanvasRenderingContext2D, yerlesimler: Yerlesim[], ufukY: number, H: number, isik: number) {
    if (this.durum === "yok") return;
    const konum = azimutKonum(this.azimut, yerlesimler, 5);
    if (!konum) return;
    const yakinlik = 1 - this.uzaklik;
    const olcek = (0.08 + yakinlik * 0.9) * (H / 1080);
    const yerY = ufukY + (H - ufukY) * (0.1 + yakinlik * 0.45);
    const cy = yerY - this.irtifa * H * 0.55 - olcek * 40;
    const cx = konum.x + Math.sin(this.faz * 1.3) * olcek * 6;
    const govde = rgb(isikla([62, 70, 58], isik));
    const koyu = rgb(isikla([35, 40, 34], isik));

    // Rotor tozu (yere yakınken)
    const toz = this.tozSiddeti;
    if (toz > 0.05) {
      const r = olcek * 260 * (0.5 + toz);
      const g = ctx.createRadialGradient(konum.x, yerY, 0, konum.x, yerY, r);
      g.addColorStop(0, `rgba(170,150,120,${0.45 * toz})`);
      g.addColorStop(1, "rgba(170,150,120,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(konum.x, yerY, r, r * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Gövde
    ctx.fillStyle = govde;
    ctx.beginPath();
    ctx.ellipse(cx, cy, olcek * 95, olcek * 36, 0, 0, Math.PI * 2);
    ctx.fill();
    // Kuyruk
    ctx.fillStyle = koyu;
    ctx.beginPath();
    ctx.moveTo(cx + olcek * 70, cy - olcek * 10);
    ctx.lineTo(cx + olcek * 230, cy - olcek * 30);
    ctx.lineTo(cx + olcek * 235, cy - olcek * 5);
    ctx.lineTo(cx + olcek * 70, cy + olcek * 14);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(cx + olcek * 215, cy - olcek * 70, olcek * 10, olcek * 45);
    // Kabin camı
    ctx.fillStyle = rgb(isikla([120, 160, 190], isik), 0.8);
    ctx.beginPath();
    ctx.ellipse(cx - olcek * 55, cy - olcek * 12, olcek * 30, olcek * 16, 0, 0, Math.PI * 2);
    ctx.fill();
    // Kızaklar
    ctx.strokeStyle = koyu;
    ctx.lineWidth = Math.max(1.5, olcek * 5);
    ctx.beginPath();
    ctx.moveTo(cx - olcek * 70, cy + olcek * 55);
    ctx.lineTo(cx + olcek * 60, cy + olcek * 55);
    ctx.moveTo(cx - olcek * 40, cy + olcek * 30);
    ctx.lineTo(cx - olcek * 45, cy + olcek * 55);
    ctx.moveTo(cx + olcek * 30, cy + olcek * 30);
    ctx.lineTo(cx + olcek * 35, cy + olcek * 55);
    ctx.stroke();
    // Rotor diski (bulanık) + palalar
    ctx.fillStyle = `rgba(30,32,30,${0.25})`;
    ctx.beginPath();
    ctx.ellipse(cx, cy - olcek * 50, olcek * 190, olcek * 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = koyu;
    ctx.lineWidth = Math.max(1, olcek * 4);
    ctx.beginPath();
    for (let k = 0; k < 2; k++) {
      const a = this.rotor + k * Math.PI;
      ctx.moveTo(cx, cy - olcek * 50);
      ctx.lineTo(cx + Math.cos(a) * olcek * 190, cy - olcek * 50 + Math.sin(a) * olcek * 12);
    }
    ctx.stroke();
    ctx.fillRect(cx - olcek * 4, cy - olcek * 60, olcek * 8, olcek * 24);
    // Gece: konum ışıkları
    if (isik < 0.5) {
      ctx.fillStyle = `rgba(255,60,60,${(0.5 - isik) * 2 * (Math.sin(this.faz * 8) > 0 ? 1 : 0.2)})`;
      ctx.beginPath();
      ctx.arc(cx + olcek * 225, cy - olcek * 70, olcek * 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
