/**
 * Parametrik arazi: bölge ön ayarı (tepe profili, zemin, nesneler) + mevsim + ışık.
 * İlk hedef bölge "kırsal açık arazi" en ayrıntılısıdır; diğerleri aynı üreteçle stilize edilir.
 * Gerçek içerik (video döngüsü) manifestte varsa bu katman çizilmez.
 */
import { azimutX, isikla, karistir, mesafeYerlesimi, mulberry32, rgb, xAzimut, type Renk, type Yerlesim } from "../projeksiyon";
import type { Bolge, Mevsim, OrtamAyarlari } from "../tipler";
import type { GokyuzuRenkleri } from "./gokyuzu";

interface Tepe {
  genlik: number;
  frekans: number;
  faz: number;
  taban: number;
}

type NesneTipi = "kavak" | "cam" | "mese" | "cit" | "direk" | "saman" | "ev" | "koy" | "bina" | "minare" | "kaya" | "hesco" | "konteyner" | "kule" | "bayrak";

interface Nesne {
  tip: NesneTipi;
  azimut: number;
  mesafe: number;
  boyut: number;
  tohum: number;
}

interface BolgeOnayari {
  ufukOrani: number;
  uzakTepeler: Tepe[];
  yakinTepeler: Tepe[];
  uzakRenk: Renk;
  yakinRenk: Renk;
  zeminUst: Renk;
  zeminAlt: Renk;
  kisUzakRenk: Renk;
  kisYakinRenk: Renk;
  kisZeminUst: Renk;
  kisZeminAlt: Renk;
  tarlaSeritleri: boolean;
  yol: boolean;
  karZirve: boolean;
  otluk: boolean;
  nesneler: Nesne[];
}

function nesneUret(tohum: number, uret: (r: () => number, ekle: (n: Omit<Nesne, "tohum">) => void) => void): Nesne[] {
  const r = mulberry32(tohum);
  const liste: Nesne[] = [];
  uret(r, (n) => liste.push({ ...n, tohum: Math.floor(r() * 1e6) }));
  return liste.sort((a, b) => b.mesafe - a.mesafe);
}

const ONAYARLAR: Record<Bolge, BolgeOnayari> = {
  kirsal_acik_arazi: {
    ufukOrani: 0.56,
    uzakTepeler: [{ genlik: 0.05, frekans: 1.1, faz: 0.4, taban: 0.03 }, { genlik: 0.03, frekans: 2.7, faz: 2.1, taban: 0 }],
    yakinTepeler: [{ genlik: 0.02, frekans: 1.9, faz: 1.0, taban: 0.005 }],
    uzakRenk: [118, 138, 118],
    yakinRenk: [142, 150, 92],
    zeminUst: [158, 150, 78],
    zeminAlt: [112, 128, 52],
    kisUzakRenk: [182, 192, 205],
    kisYakinRenk: [214, 220, 228],
    kisZeminUst: [226, 230, 236],
    kisZeminAlt: [236, 240, 245],
    tarlaSeritleri: true,
    yol: true,
    karZirve: false,
    otluk: true,
    nesneler: nesneUret(11, (r, ekle) => {
      for (let i = 0; i < 9; i++) ekle({ tip: "kavak", azimut: -130 + i * 30 + (r() - 0.5) * 18, mesafe: 0.35 + r() * 0.55, boyut: 0.8 + r() * 0.5 });
      for (let az = -38; az <= 38; az += 5) ekle({ tip: "cit", azimut: az, mesafe: 0.42 + Math.abs(az) * 0.004, boyut: 1 });
      for (let i = 0; i < 6; i++) ekle({ tip: "direk", azimut: -120 + i * 48 + (r() - 0.5) * 10, mesafe: 0.5 + r() * 0.35, boyut: 1 });
      for (let i = 0; i < 7; i++) ekle({ tip: "saman", azimut: -100 + i * 32 + (r() - 0.5) * 20, mesafe: 0.25 + r() * 0.5, boyut: 0.7 + r() * 0.5 });
      ekle({ tip: "koy", azimut: 62, mesafe: 0.95, boyut: 1 });
      ekle({ tip: "ev", azimut: -72, mesafe: 0.8, boyut: 1 });
      ekle({ tip: "mese", azimut: 108, mesafe: 0.55, boyut: 1.3 });
      ekle({ tip: "mese", azimut: -20, mesafe: 0.88, boyut: 0.9 });
    }),
  },
  ormanlik: {
    ufukOrani: 0.5,
    uzakTepeler: [{ genlik: 0.12, frekans: 1.3, faz: 0.2, taban: 0.06 }, { genlik: 0.05, frekans: 3.1, faz: 1.3, taban: 0 }],
    yakinTepeler: [{ genlik: 0.07, frekans: 2.2, faz: 2.4, taban: 0.03 }],
    uzakRenk: [70, 98, 88],
    yakinRenk: [52, 84, 54],
    zeminUst: [66, 92, 46],
    zeminAlt: [44, 66, 34],
    kisUzakRenk: [150, 165, 178],
    kisYakinRenk: [120, 140, 150],
    kisZeminUst: [205, 212, 222],
    kisZeminAlt: [222, 228, 236],
    tarlaSeritleri: false,
    yol: false,
    karZirve: false,
    otluk: true,
    nesneler: nesneUret(23, (r, ekle) => {
      for (let i = 0; i < 70; i++) ekle({ tip: r() < 0.6 ? "cam" : "mese", azimut: r() * 290 - 145, mesafe: 0.12 + r() * 0.85, boyut: 0.8 + r() * 0.8 });
    }),
  },
  daglik: {
    ufukOrani: 0.58,
    uzakTepeler: [{ genlik: 0.3, frekans: 1.6, faz: 0.9, taban: 0.1 }, { genlik: 0.12, frekans: 4.3, faz: 0.3, taban: 0 }],
    yakinTepeler: [{ genlik: 0.16, frekans: 2.4, faz: 2.0, taban: 0.04 }, { genlik: 0.06, frekans: 6.1, faz: 1.1, taban: 0 }],
    uzakRenk: [112, 118, 132],
    yakinRenk: [96, 102, 88],
    zeminUst: [128, 118, 96],
    zeminAlt: [104, 98, 82],
    kisUzakRenk: [205, 212, 225],
    kisYakinRenk: [185, 192, 205],
    kisZeminUst: [228, 232, 240],
    kisZeminAlt: [238, 241, 247],
    tarlaSeritleri: false,
    yol: false,
    karZirve: true,
    otluk: false,
    nesneler: nesneUret(31, (r, ekle) => {
      for (let i = 0; i < 16; i++) ekle({ tip: "kaya", azimut: r() * 280 - 140, mesafe: 0.1 + r() * 0.7, boyut: 0.6 + r() * 1.2 });
      for (let i = 0; i < 12; i++) ekle({ tip: "cam", azimut: r() * 280 - 140, mesafe: 0.3 + r() * 0.6, boyut: 0.5 + r() * 0.6 });
    }),
  },
  meskun_mahal: {
    ufukOrani: 0.55,
    uzakTepeler: [{ genlik: 0.06, frekans: 1.4, faz: 0.5, taban: 0.02 }],
    yakinTepeler: [],
    uzakRenk: [128, 132, 140],
    yakinRenk: [120, 118, 110],
    zeminUst: [140, 132, 118],
    zeminAlt: [112, 106, 96],
    kisUzakRenk: [188, 195, 208],
    kisYakinRenk: [170, 175, 185],
    kisZeminUst: [215, 218, 225],
    kisZeminAlt: [228, 231, 238],
    tarlaSeritleri: false,
    yol: true,
    karZirve: false,
    otluk: false,
    nesneler: nesneUret(47, (r, ekle) => {
      for (let i = 0; i < 24; i++) ekle({ tip: "bina", azimut: -140 + i * 12 + (r() - 0.5) * 8, mesafe: 0.3 + r() * 0.6, boyut: 0.7 + r() * 1.1 });
      ekle({ tip: "minare", azimut: 28, mesafe: 0.82, boyut: 1 });
      for (let i = 0; i < 6; i++) ekle({ tip: "direk", azimut: -100 + i * 40, mesafe: 0.35 + r() * 0.3, boyut: 1 });
      for (let i = 0; i < 5; i++) ekle({ tip: "mese", azimut: -120 + i * 55 + (r() - 0.5) * 20, mesafe: 0.4 + r() * 0.4, boyut: 0.8 });
    }),
  },
  us_bolgesi: {
    ufukOrani: 0.57,
    uzakTepeler: [{ genlik: 0.07, frekans: 1.2, faz: 1.7, taban: 0.03 }],
    yakinTepeler: [],
    uzakRenk: [125, 128, 118],
    yakinRenk: [138, 132, 108],
    zeminUst: [150, 140, 112],
    zeminAlt: [128, 120, 98],
    kisUzakRenk: [190, 196, 208],
    kisYakinRenk: [205, 210, 218],
    kisZeminUst: [222, 225, 232],
    kisZeminAlt: [232, 235, 242],
    tarlaSeritleri: false,
    yol: true,
    karZirve: false,
    otluk: false,
    nesneler: nesneUret(59, (r, ekle) => {
      for (let az = -135; az <= 135; az += 7) ekle({ tip: "hesco", azimut: az, mesafe: 0.36, boyut: 1 });
      for (let i = 0; i < 7; i++) ekle({ tip: "konteyner", azimut: -120 + i * 40 + (r() - 0.5) * 14, mesafe: 0.45 + r() * 0.3, boyut: 0.9 + r() * 0.4 });
      ekle({ tip: "kule", azimut: -78, mesafe: 0.6, boyut: 1 });
      ekle({ tip: "kule", azimut: 82, mesafe: 0.62, boyut: 1 });
      ekle({ tip: "bayrak", azimut: 8, mesafe: 0.5, boyut: 1 });
    }),
  },
};

export function ufukY(bolge: Bolge, H: number): number {
  return H * ONAYARLAR[bolge].ufukOrani;
}

function tepeYuksekligi(tepeler: Tepe[], azimut: number): number {
  let h = 0;
  for (const t of tepeler) h += t.taban + t.genlik * (0.5 + 0.5 * Math.sin((azimut * t.frekans * Math.PI) / 180 + t.faz)) * (0.7 + 0.3 * Math.sin(azimut * 0.21 + t.faz * 3));
  return h;
}

function tepeCiz(ctx: CanvasRenderingContext2D, y: Yerlesim, ufuk: number, H: number, tepeler: Tepe[], renk: Renk, karZirve: boolean, isik: number, mevsim: Mevsim) {
  if (tepeler.length === 0) return;
  ctx.beginPath();
  ctx.moveTo(y.x, ufuk + 2);
  const adim = Math.max(3, y.genislik / 480);
  const noktalar: Array<[number, number]> = [];
  for (let x = y.x; x <= y.x + y.genislik + adim; x += adim) {
    const az = xAzimut(Math.min(x, y.x + y.genislik), y);
    const yy = ufuk - tepeYuksekligi(tepeler, az) * H;
    noktalar.push([x, yy]);
    ctx.lineTo(x, yy);
  }
  ctx.lineTo(y.x + y.genislik, ufuk + 2);
  ctx.closePath();
  ctx.fillStyle = rgb(isikla(renk, isik));
  ctx.fill();
  if (karZirve || mevsim === "kis") {
    // Zirvelere kar: tepe çizgisinin belirli yüksekliğin üstü beyaz.
    const esik = ufuk - H * (mevsim === "kis" ? 0.05 : 0.18);
    ctx.beginPath();
    let acik = false;
    for (const [x, yy] of noktalar) {
      if (yy < esik) {
        if (!acik) {
          ctx.moveTo(x, esik);
          acik = true;
        }
        ctx.lineTo(x, yy);
      } else if (acik) {
        ctx.lineTo(x, esik);
        acik = false;
      }
    }
    if (acik) ctx.lineTo(noktalar[noktalar.length - 1][0], esik);
    ctx.closePath();
    ctx.fillStyle = rgb(isikla([236, 240, 246], isik), 0.9);
    ctx.fill();
  }
}

function nesneCiz(ctx: CanvasRenderingContext2D, n: Nesne, x: number, taban: number, olcek: number, isik: number, mevsim: Mevsim, y: Yerlesim) {
  const r = mulberry32(n.tohum);
  const birim = y.genislik * 0.04 * olcek * n.boyut; // temel boy
  const kis = mevsim === "kis";
  const govde = rgb(isikla([74, 54, 36], isik));
  const yaprak = rgb(isikla(kis ? [120, 100, 80] : [52, 96, 44], isik));
  const kar = rgb(isikla([240, 243, 248], isik));
  switch (n.tip) {
    case "kavak": {
      ctx.fillStyle = govde;
      ctx.fillRect(x - birim * 0.05, taban - birim * 2.2, birim * 0.1, birim * 2.2);
      ctx.fillStyle = kis ? rgb(isikla([110, 95, 85], isik), 0.8) : yaprak;
      ctx.beginPath();
      ctx.ellipse(x, taban - birim * 1.5, birim * 0.28, birim * 1.3, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "mese": {
      ctx.fillStyle = govde;
      ctx.fillRect(x - birim * 0.08, taban - birim * 1.1, birim * 0.16, birim * 1.1);
      ctx.fillStyle = kis ? rgb(isikla([105, 90, 78], isik), 0.75) : yaprak;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(x + (r() - 0.5) * birim * 0.9, taban - birim * (1.2 + r() * 0.6), birim * (0.35 + r() * 0.3), 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "cam": {
      ctx.fillStyle = govde;
      ctx.fillRect(x - birim * 0.05, taban - birim * 0.5, birim * 0.1, birim * 0.5);
      ctx.fillStyle = rgb(isikla([34, 72, 44], isik));
      for (let k = 0; k < 3; k++) {
        const w = birim * (0.6 - k * 0.14);
        const yy = taban - birim * (0.4 + k * 0.55);
        ctx.beginPath();
        ctx.moveTo(x - w, yy);
        ctx.lineTo(x, yy - birim * 0.8);
        ctx.lineTo(x + w, yy);
        ctx.closePath();
        ctx.fill();
        if (kis) {
          ctx.fillStyle = kar;
          ctx.fillRect(x - w * 0.8, yy - birim * 0.08, w * 1.6, birim * 0.08);
          ctx.fillStyle = rgb(isikla([34, 72, 44], isik));
        }
      }
      break;
    }
    case "cit": {
      ctx.fillStyle = govde;
      ctx.fillRect(x - birim * 0.06, taban - birim * 0.7, birim * 0.12, birim * 0.7);
      ctx.strokeStyle = rgb(isikla([90, 80, 70], isik), 0.8);
      ctx.lineWidth = Math.max(1, birim * 0.03);
      ctx.beginPath();
      ctx.moveTo(x - birim * 1.2, taban - birim * 0.5);
      ctx.lineTo(x + birim * 1.2, taban - birim * 0.5);
      ctx.moveTo(x - birim * 1.2, taban - birim * 0.25);
      ctx.lineTo(x + birim * 1.2, taban - birim * 0.25);
      ctx.stroke();
      break;
    }
    case "direk": {
      ctx.fillStyle = rgb(isikla([60, 55, 50], isik));
      ctx.fillRect(x - birim * 0.04, taban - birim * 2.6, birim * 0.08, birim * 2.6);
      ctx.fillRect(x - birim * 0.45, taban - birim * 2.4, birim * 0.9, birim * 0.06);
      break;
    }
    case "saman": {
      if (kis) break;
      ctx.fillStyle = rgb(isikla([196, 170, 90], isik));
      ctx.beginPath();
      ctx.ellipse(x, taban - birim * 0.3, birim * 0.42, birim * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = rgb(isikla([150, 125, 60], isik));
      ctx.lineWidth = Math.max(1, birim * 0.02);
      ctx.stroke();
      break;
    }
    case "ev":
    case "koy": {
      const adet = n.tip === "koy" ? 7 : 1;
      for (let i = 0; i < adet; i++) {
        const bx = x + (i - adet / 2) * birim * 1.4 + (r() - 0.5) * birim;
        const bw = birim * (0.9 + r() * 0.5);
        const bh = birim * (0.6 + r() * 0.3);
        ctx.fillStyle = rgb(isikla([205, 195, 175], isik));
        ctx.fillRect(bx - bw / 2, taban - bh, bw, bh);
        ctx.fillStyle = rgb(isikla(kis ? [225, 228, 235] : [140, 60, 45], isik));
        ctx.beginPath();
        ctx.moveTo(bx - bw * 0.6, taban - bh);
        ctx.lineTo(bx, taban - bh - bw * 0.4);
        ctx.lineTo(bx + bw * 0.6, taban - bh);
        ctx.closePath();
        ctx.fill();
        if (isik < 0.45) {
          ctx.fillStyle = `rgba(255,220,140,${(0.45 - isik) * 2})`;
          ctx.fillRect(bx - bw * 0.2, taban - bh * 0.7, bw * 0.15, bh * 0.25);
        }
      }
      break;
    }
    case "bina": {
      const bw = birim * (1.2 + r() * 1.2);
      const bh = birim * (1.2 + r() * 2.2);
      ctx.fillStyle = rgb(isikla([188, 178, 160], isik));
      ctx.fillRect(x - bw / 2, taban - bh, bw, bh);
      ctx.fillStyle = rgb(isikla([150, 140, 125], isik));
      ctx.fillRect(x - bw / 2, taban - bh, bw, bh * 0.06);
      const katlar = Math.max(1, Math.floor(bh / (birim * 0.5)));
      for (let k = 0; k < katlar; k++) {
        for (let p = 0; p < 3; p++) {
          const yanik = r() < 0.5;
          ctx.fillStyle = isik < 0.5 && yanik ? `rgba(255,215,130,${(0.5 - isik) * 1.8})` : rgb(isikla([60, 70, 90], isik));
          ctx.fillRect(x - bw / 2 + bw * (0.15 + p * 0.3), taban - bh + bh * 0.12 + k * birim * 0.5, bw * 0.14, birim * 0.25);
        }
      }
      break;
    }
    case "minare": {
      ctx.fillStyle = rgb(isikla([215, 210, 200], isik));
      ctx.fillRect(x - birim * 0.12, taban - birim * 4, birim * 0.24, birim * 4);
      ctx.beginPath();
      ctx.moveTo(x - birim * 0.2, taban - birim * 4);
      ctx.lineTo(x, taban - birim * 4.7);
      ctx.lineTo(x + birim * 0.2, taban - birim * 4);
      ctx.fill();
      ctx.fillRect(x - birim * 0.3, taban - birim * 3.1, birim * 0.6, birim * 0.1);
      break;
    }
    case "kaya": {
      ctx.fillStyle = rgb(isikla([118, 112, 104], isik));
      ctx.beginPath();
      ctx.moveTo(x - birim * 0.7, taban);
      ctx.lineTo(x - birim * 0.4, taban - birim * 0.6);
      ctx.lineTo(x + birim * 0.1, taban - birim * 0.8);
      ctx.lineTo(x + birim * 0.6, taban - birim * 0.35);
      ctx.lineTo(x + birim * 0.75, taban);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = rgb(isikla([150, 144, 136], isik), 0.6);
      ctx.beginPath();
      ctx.moveTo(x - birim * 0.4, taban - birim * 0.6);
      ctx.lineTo(x + birim * 0.1, taban - birim * 0.8);
      ctx.lineTo(x + birim * 0.05, taban - birim * 0.45);
      ctx.closePath();
      ctx.fill();
      if (kis) {
        ctx.fillStyle = kar;
        ctx.fillRect(x - birim * 0.35, taban - birim * 0.78, birim * 0.5, birim * 0.08);
      }
      break;
    }
    case "hesco": {
      const w = birim * 1.3;
      const h = birim * 0.9;
      ctx.fillStyle = rgb(isikla([168, 150, 110], isik));
      ctx.fillRect(x - w / 2, taban - h, w, h);
      ctx.strokeStyle = rgb(isikla([110, 100, 80], isik), 0.7);
      ctx.lineWidth = Math.max(1, birim * 0.025);
      ctx.strokeRect(x - w / 2, taban - h, w, h);
      ctx.beginPath();
      for (let k = 1; k < 4; k++) {
        ctx.moveTo(x - w / 2 + (w * k) / 4, taban - h);
        ctx.lineTo(x - w / 2 + (w * k) / 4, taban);
      }
      ctx.stroke();
      break;
    }
    case "konteyner": {
      const w = birim * 2.2;
      const h = birim * 0.9;
      ctx.fillStyle = rgb(isikla(r() < 0.5 ? [90, 110, 90] : [120, 80, 60], isik));
      ctx.fillRect(x - w / 2, taban - h, w, h);
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.lineWidth = Math.max(1, birim * 0.02);
      for (let k = 0; k < 8; k++) {
        ctx.beginPath();
        ctx.moveTo(x - w / 2 + (w * k) / 8, taban - h);
        ctx.lineTo(x - w / 2 + (w * k) / 8, taban);
        ctx.stroke();
      }
      break;
    }
    case "kule": {
      ctx.strokeStyle = rgb(isikla([70, 65, 60], isik));
      ctx.lineWidth = Math.max(1.5, birim * 0.06);
      ctx.beginPath();
      ctx.moveTo(x - birim * 0.5, taban);
      ctx.lineTo(x - birim * 0.25, taban - birim * 3);
      ctx.moveTo(x + birim * 0.5, taban);
      ctx.lineTo(x + birim * 0.25, taban - birim * 3);
      for (let k = 1; k < 5; k++) {
        ctx.moveTo(x - birim * (0.5 - k * 0.05), taban - birim * k * 0.6);
        ctx.lineTo(x + birim * (0.5 - k * 0.05), taban - birim * k * 0.6);
      }
      ctx.stroke();
      ctx.fillStyle = rgb(isikla([95, 90, 80], isik));
      ctx.fillRect(x - birim * 0.5, taban - birim * 3.7, birim, birim * 0.7);
      break;
    }
    case "bayrak": {
      ctx.fillStyle = rgb(isikla([200, 200, 205], isik));
      ctx.fillRect(x - birim * 0.03, taban - birim * 3.5, birim * 0.06, birim * 3.5);
      ctx.fillStyle = rgb(isikla([200, 30, 40], isik));
      ctx.beginPath();
      ctx.moveTo(x, taban - birim * 3.5);
      ctx.lineTo(x + birim * 0.9, taban - birim * 3.3);
      ctx.lineTo(x, taban - birim * 2.95);
      ctx.closePath();
      ctx.fill();
      break;
    }
  }
}

let otZaman = 0;
export function araziGuncelle(dt: number) {
  otZaman += dt;
}

export function araziCiz(
  ctx: CanvasRenderingContext2D,
  y: Yerlesim,
  H: number,
  bolge: Bolge,
  ortam: OrtamAyarlari,
  gok: GokyuzuRenkleri,
) {
  const o = ONAYARLAR[bolge];
  const ufuk = H * o.ufukOrani;
  const kis = ortam.mevsim === "kis";
  const isik = gok.isik;
  const sonbahar = ortam.mevsim === "sonbahar";

  // Uzak tepeler (atmosfer pusuyla ufuk rengine yaklaşır)
  const uzak = karistir(kis ? o.kisUzakRenk : o.uzakRenk, gok.ufuk, 0.45 + ortam.sis * 0.4);
  tepeCiz(ctx, y, ufuk, H, o.uzakTepeler, uzak, o.karZirve, isik, ortam.mevsim);
  const yakin = karistir(kis ? o.kisYakinRenk : o.yakinRenk, gok.ufuk, 0.15 + ortam.sis * 0.3);
  tepeCiz(ctx, y, ufuk, H, o.yakinTepeler, yakin, false, isik, ortam.mevsim);

  // Zemin
  let zUst = kis ? o.kisZeminUst : o.zeminUst;
  let zAlt = kis ? o.kisZeminAlt : o.zeminAlt;
  if (sonbahar && !kis) {
    zUst = karistir(zUst, [170, 120, 60], 0.35);
    zAlt = karistir(zAlt, [140, 100, 50], 0.3);
  }
  const g = ctx.createLinearGradient(0, ufuk, 0, H);
  g.addColorStop(0, rgb(isikla(karistir(zUst, gok.ufuk, 0.35), isik)));
  g.addColorStop(0.25, rgb(isikla(zUst, isik)));
  g.addColorStop(1, rgb(isikla(zAlt, isik)));
  ctx.fillStyle = g;
  ctx.fillRect(y.x, ufuk, y.genislik, H - ufuk);

  // Tarla şeritleri (perspektif bantlar)
  if (o.tarlaSeritleri && !kis) {
    ctx.fillStyle = `rgba(${isik > 0.5 ? "255,240,160" : "0,0,0"},0.07)`;
    for (let k = 0; k < 9; k++) {
      const t0 = Math.pow(k / 9, 2.2);
      const t1 = Math.pow((k + 0.5) / 9, 2.2);
      ctx.fillRect(y.x, ufuk + t0 * (H - ufuk), y.genislik, (t1 - t0) * (H - ufuk));
    }
  }

  // Toprak yol: orta duvarda uzaktan öne doğru genişler
  if (o.yol && y.duvar.ad === "orta") {
    const cx = y.x + y.genislik * 0.52;
    ctx.fillStyle = rgb(isikla(kis ? [200, 198, 192] : [150, 128, 96], isik));
    ctx.beginPath();
    ctx.moveTo(cx - y.genislik * 0.012, ufuk + 2);
    ctx.lineTo(cx + y.genislik * 0.012, ufuk + 2);
    ctx.lineTo(cx + y.genislik * 0.34, H);
    ctx.lineTo(cx - y.genislik * 0.26, H);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = rgb(isikla([110, 92, 70], isik), 0.5);
    ctx.lineWidth = Math.max(1, y.genislik * 0.003);
    ctx.beginPath();
    ctx.moveTo(cx, ufuk + 2);
    ctx.lineTo(cx + y.genislik * 0.05, H);
    ctx.stroke();
  }

  // Nesneler (uzaktan yakına)
  for (const n of o.nesneler) {
    const x = azimutX(n.azimut, y, 8);
    if (x === null) continue;
    const { y: taban, olcek } = mesafeYerlesimi(n.mesafe, ufuk, H);
    nesneCiz(ctx, n, x, taban, olcek, isik, ortam.mevsim, y);
  }

  // Ön plan otları: rüzgârla salınır
  if (o.otluk) {
    const adet = Math.floor(y.genislik / 9);
    const r = mulberry32(y.indeks * 97 + 5);
    const renk = rgb(isikla(kis ? [205, 210, 218] : sonbahar ? [150, 120, 60] : [70, 110, 48], isik));
    ctx.strokeStyle = renk;
    ctx.lineWidth = Math.max(1, y.genislik * 0.0012);
    ctx.beginPath();
    const yonIsareti = Math.cos((ortam.ruzgarYonu * Math.PI) / 180) >= 0 ? 1 : -1;
    for (let i = 0; i < adet; i++) {
      const bx = y.x + r() * y.genislik;
      const boy = H * (0.03 + r() * 0.08) * (kis ? 0.5 : 1);
      const faz = r() * 6.28;
      const sal = Math.sin(otZaman * (1.5 + ortam.ruzgarSiddeti * 4) + faz) * ortam.ruzgarSiddeti * boy * 0.8 * yonIsareti + Math.sin(faz) * boy * 0.15;
      ctx.moveTo(bx, H);
      ctx.quadraticCurveTo(bx + sal * 0.4, H - boy * 0.6, bx + sal, H - boy);
    }
    ctx.stroke();
  }
}
