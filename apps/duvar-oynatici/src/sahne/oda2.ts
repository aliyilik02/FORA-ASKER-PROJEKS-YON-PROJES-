/**
 * Oda 2 – güvenli alan ön planları. Arka planda seçili bölge arazisi kalır; önüne
 * sütre/çukur/iç mekân çizilir (idare metni 1.2: operasyonel bölge, meskûn mahal içi,
 * kaya/sütre arkası, çukur).
 */
import { isikla, mulberry32, rgb, type Yerlesim } from "../projeksiyon";
import type { GuvenliAlanTipi } from "../tipler";

export function oda2OnPlanCiz(ctx: CanvasRenderingContext2D, y: Yerlesim, H: number, tip: GuvenliAlanTipi, isik: number) {
  const r = mulberry32(y.indeks * 31 + 3);
  switch (tip) {
    case "operasyonel_bolge": {
      // Açık alan: önde alçak kum torbası hattı
      const yy = H * 0.86;
      for (let i = 0; i < 3; i++) {
        for (let x = y.x - 20; x < y.x + y.genislik + 20; x += y.genislik * 0.07) {
          ctx.fillStyle = rgb(isikla([150 + (i % 2) * 12, 135, 100], isik));
          ctx.beginPath();
          ctx.ellipse(x + (i % 2) * y.genislik * 0.035, yy + i * H * 0.05, y.genislik * 0.036, H * 0.028, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
    case "kaya_sutre_arkasi": {
      // Alt yarıyı kaplayan büyük kaya kütleleri
      const taban = H;
      const koyu = rgb(isikla([78, 74, 70], isik));
      const acik = rgb(isikla([118, 112, 104], isik));
      ctx.fillStyle = koyu;
      ctx.beginPath();
      ctx.moveTo(y.x, taban);
      let x = y.x;
      let seviye = H * (0.58 + r() * 0.08);
      ctx.lineTo(x, seviye);
      while (x < y.x + y.genislik) {
        x += y.genislik * (0.08 + r() * 0.12);
        seviye = H * (0.5 + r() * 0.2);
        ctx.lineTo(x, seviye);
      }
      ctx.lineTo(y.x + y.genislik, taban);
      ctx.closePath();
      ctx.fill();
      // Işık alan yüzler
      ctx.fillStyle = acik;
      for (let i = 0; i < 6; i++) {
        const bx = y.x + r() * y.genislik;
        const by = H * (0.62 + r() * 0.3);
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + y.genislik * 0.08, by - H * 0.05);
        ctx.lineTo(bx + y.genislik * 0.12, by + H * 0.06);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case "cukur": {
      // Hendek: toprak duvarlar + kum torbası üst sırası; gökyüzü üstte görünür
      const ust = H * 0.46;
      const g = ctx.createLinearGradient(0, ust, 0, H);
      g.addColorStop(0, rgb(isikla([120, 98, 70], isik)));
      g.addColorStop(1, rgb(isikla([70, 56, 40], isik)));
      ctx.fillStyle = g;
      ctx.fillRect(y.x, ust, y.genislik, H - ust);
      for (let x = y.x - 10; x < y.x + y.genislik + 10; x += y.genislik * 0.075) {
        ctx.fillStyle = rgb(isikla([165, 150, 112], isik));
        ctx.beginPath();
        ctx.ellipse(x, ust, y.genislik * 0.04, H * 0.03, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // Toprak dokusu çizgileri
      ctx.strokeStyle = "rgba(0,0,0,0.15)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < 40; i++) {
        const bx = y.x + r() * y.genislik;
        const by = ust + H * 0.06 + r() * (H - ust - H * 0.06);
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + (r() - 0.5) * y.genislik * 0.05, by + (r() - 0.5) * H * 0.02);
      }
      ctx.stroke();
      break;
    }
    case "meskun_mahal_ici": {
      // İç mekân: sıvalı duvarlar; orta duvarda pencere ve kapı aralığından dışarısı görünür
      const duvar = rgb(isikla([200, 190, 170], isik * 0.8 + 0.1));
      ctx.fillStyle = duvar;
      if (y.duvar.ad === "orta") {
        const pw = y.genislik * 0.26;
        const ph = H * 0.34;
        const px = y.x + y.genislik * 0.3;
        const py = H * 0.22;
        const kx = y.x + y.genislik * 0.72;
        const kw = y.genislik * 0.14;
        const ky = H * 0.3;
        // Duvarı pencere ve kapı hariç doldur
        ctx.beginPath();
        ctx.rect(y.x, 0, y.genislik, H);
        ctx.rect(px, py, pw, ph);
        ctx.rect(kx, ky, kw, H - ky);
        ctx.fill("evenodd");
        // Pencere kasası ve parmaklık
        ctx.strokeStyle = rgb(isikla([90, 70, 50], isik));
        ctx.lineWidth = Math.max(2, y.genislik * 0.008);
        ctx.strokeRect(px, py, pw, ph);
        ctx.beginPath();
        ctx.moveTo(px + pw / 2, py);
        ctx.lineTo(px + pw / 2, py + ph);
        ctx.moveTo(px, py + ph / 2);
        ctx.lineTo(px + pw, py + ph / 2);
        ctx.stroke();
        ctx.strokeRect(kx, ky, kw, H - ky);
      } else {
        ctx.fillRect(y.x, 0, y.genislik, H);
        // Yan duvarda raf, çatlak, poster izi
        ctx.fillStyle = rgb(isikla([150, 140, 125], isik * 0.8 + 0.1));
        ctx.fillRect(y.x + y.genislik * 0.2, H * 0.4, y.genislik * 0.35, H * 0.02);
        ctx.fillRect(y.x + y.genislik * 0.6, H * 0.25, y.genislik * 0.2, H * 0.28);
      }
      // Zemin
      ctx.fillStyle = rgb(isikla([120, 110, 95], isik * 0.8 + 0.1));
      ctx.fillRect(y.x, H * 0.82, y.genislik, H * 0.18);
      // Sıva lekeleri
      ctx.fillStyle = "rgba(0,0,0,0.08)";
      for (let i = 0; i < 12; i++) {
        ctx.beginPath();
        ctx.arc(y.x + r() * y.genislik, r() * H * 0.8, y.genislik * (0.01 + r() * 0.03), 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
  }
}
