/** Gökyüzü: saate göre renk, güneş/ay, yıldızlar, bulutlar (rüzgârla sürüklenir). */
import {
  alacakaranlik,
  azimutX,
  gunesKonumu,
  gunIsigi,
  karistir,
  mulberry32,
  rgb,
  type Renk,
  type Yerlesim,
} from "../projeksiyon";
import type { OrtamAyarlari } from "../tipler";

const GUNDUZ_UST: Renk = [66, 128, 205];
const GUNDUZ_UFUK: Renk = [178, 206, 232];
const ALACA_UST: Renk = [70, 60, 120];
const ALACA_UFUK: Renk = [245, 150, 80];
const GECE_UST: Renk = [4, 7, 22];
const GECE_UFUK: Renk = [18, 28, 58];
const BULUT_GRI: Renk = [150, 155, 165];

export interface GokyuzuRenkleri {
  ust: Renk;
  ufuk: Renk;
  isik: number;
}

export function gokyuzuRenkleri(ortam: OrtamAyarlari): GokyuzuRenkleri {
  const isik = gunIsigi(ortam.saat);
  const alaca = alacakaranlik(ortam.saat);
  let ust = karistir(GECE_UST, GUNDUZ_UST, isik);
  let ufuk = karistir(GECE_UFUK, GUNDUZ_UFUK, isik);
  ust = karistir(ust, ALACA_UST, alaca * 0.7);
  ufuk = karistir(ufuk, ALACA_UFUK, alaca * 0.85);
  // Bulut örtüsü gökyüzünü griye ve karanlığa çeker.
  const gri = karistir(BULUT_GRI, GECE_UST, 1 - isik);
  ust = karistir(ust, gri, ortam.bulut * 0.75);
  ufuk = karistir(ufuk, gri, ortam.bulut * 0.55);
  if (ortam.mevsim === "kis") ufuk = karistir(ufuk, [220, 225, 235], 0.25 * isik);
  return { ust, ufuk, isik };
}

/** Yıldız alanı: azimut/yükseklik uzayında deterministik noktalar. */
const yildizlar: Array<{ azimut: number; yuk: number; parlaklik: number }> = (() => {
  const r = mulberry32(42);
  return Array.from({ length: 420 }, () => ({ azimut: r() * 360 - 180, yuk: r() * 0.95 + 0.03, parlaklik: r() }));
})();

interface Bulut {
  azimut: number;
  yuk: number;
  genislik: number;
  parcalar: Array<{ dx: number; dy: number; r: number }>;
}

const bulutlar: Bulut[] = (() => {
  const r = mulberry32(7);
  return Array.from({ length: 26 }, () => ({
    azimut: r() * 360 - 180,
    yuk: 0.08 + r() * 0.42,
    genislik: 14 + r() * 26,
    parcalar: Array.from({ length: 5 + Math.floor(r() * 5) }, () => ({ dx: r() - 0.5, dy: (r() - 0.5) * 0.4, r: 0.25 + r() * 0.35 })),
  }));
})();

let bulutKaydirma = 0;

export function gokyuzuGuncelle(dt: number, ortam: OrtamAyarlari) {
  const yonIsareti = Math.cos((ortam.ruzgarYonu * Math.PI) / 180) >= 0 ? 1 : -1;
  bulutKaydirma += dt * (0.3 + ortam.ruzgarSiddeti * 3) * yonIsareti;
}

export function gokyuzuCiz(ctx: CanvasRenderingContext2D, y: Yerlesim, ufukY: number, ortam: OrtamAyarlari, renkler: GokyuzuRenkleri) {
  const { ust, ufuk, isik } = renkler;
  const g = ctx.createLinearGradient(0, 0, 0, ufukY);
  g.addColorStop(0, rgb(ust));
  g.addColorStop(1, rgb(ufuk));
  ctx.fillStyle = g;
  ctx.fillRect(y.x, 0, y.genislik, ufukY + 2);

  // Yıldızlar
  if (isik < 0.35) {
    const alfa = (0.35 - isik) / 0.35 * (1 - ortam.bulut * 0.8);
    ctx.fillStyle = `rgba(255,255,255,${alfa})`;
    for (const s of yildizlar) {
      const x = azimutX(s.azimut, y);
      if (x === null) continue;
      const r = 0.6 + s.parlaklik * 1.4;
      ctx.fillRect(x, s.yuk * ufukY, r, r);
    }
  }

  // Güneş ve ay
  const gunes = gunesKonumu(ortam.saat);
  const ufukUstu = (yuk: number) => ufukY - (yuk / 70) * ufukY * 0.95;
  const gx = azimutX(gunes.azimut, y, 6);
  if (gx !== null && gunes.yukseklik > -4) {
    const gy = ufukUstu(gunes.yukseklik);
    const r = y.genislik * 0.035;
    const hale = ctx.createRadialGradient(gx, gy, 0, gx, gy, r * 4);
    hale.addColorStop(0, `rgba(255,240,200,${0.55 * (1 - ortam.bulut * 0.7)})`);
    hale.addColorStop(1, "rgba(255,200,120,0)");
    ctx.fillStyle = hale;
    ctx.fillRect(gx - r * 4, gy - r * 4, r * 8, r * 8);
    ctx.fillStyle = `rgba(255,${235 - alacakaranlik(ortam.saat) * 90},${210 - alacakaranlik(ortam.saat) * 150},${1 - ortam.bulut * 0.6})`;
    ctx.beginPath();
    ctx.arc(gx, gy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const ayAz = gunes.azimut + 180;
  const ayYuk = -gunes.yukseklik;
  const ax = azimutX(ayAz, y, 6);
  if (ax !== null && ayYuk > 0 && isik < 0.6) {
    const ay = ufukUstu(ayYuk);
    const r = y.genislik * 0.022;
    ctx.fillStyle = `rgba(235,238,245,${(0.6 - isik) / 0.6 * (1 - ortam.bulut * 0.7)})`;
    ctx.beginPath();
    ctx.arc(ax, ay, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgb(ust, (0.6 - isik) / 0.6);
    ctx.beginPath();
    ctx.arc(ax + r * 0.4, ay - r * 0.2, r * 0.85, 0, Math.PI * 2);
    ctx.fill();
  }

  // Bulutlar: örtü arttıkça daha çok ve daha koyu
  const gorunenBulut = Math.round(bulutlar.length * Math.min(1, ortam.bulut * 1.3));
  const bulutRenk = karistir(karistir([250, 250, 252], [120, 125, 135], ortam.bulut), [20, 25, 45], 1 - isik);
  const altRenk = karistir(bulutRenk, [60, 65, 80], 0.35);
  for (let i = 0; i < gorunenBulut; i++) {
    const b = bulutlar[i];
    const az = ((b.azimut + bulutKaydirma + 180) % 360 + 360) % 360 - 180;
    const cx = azimutX(az, y, b.genislik);
    if (cx === null) continue;
    const cy = b.yuk * ufukY;
    const gen = (b.genislik / y.duvar.fov) * y.genislik;
    const alfa = 0.55 + ortam.bulut * 0.4;
    for (const p of b.parcalar) {
      const r = p.r * gen * 0.5;
      const px = cx + p.dx * gen;
      const py = cy + p.dy * gen * 0.5;
      const grad = ctx.createRadialGradient(px, py - r * 0.3, r * 0.2, px, py, r);
      grad.addColorStop(0, rgb(bulutRenk, alfa));
      grad.addColorStop(0.7, rgb(altRenk, alfa * 0.8));
      grad.addColorStop(1, rgb(altRenk, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(px, py, r, r * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
