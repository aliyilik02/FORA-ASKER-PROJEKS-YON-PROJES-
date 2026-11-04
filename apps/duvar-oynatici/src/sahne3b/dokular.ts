/**
 * Prosedürel dokular: dış dosya gelmeden de çalışan duman, ateş, kıvılcım ve krater görselleri.
 * Manifestte gerçek plaka/doku varsa (ör. klipler "hasar_*" PNG) o tercih edilir; bunlar yedek.
 */
import * as THREE from "three";

function tuval(boyut: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = c.height = boyut;
  return [c, c.getContext("2d")!];
}

/** Deterministik değer gürültüsü (0..1), ızgara üzerinde yumuşak. */
function gurultu(x: number, y: number, tohum: number): number {
  const h = (ix: number, iy: number) => {
    let n = ix * 374761393 + iy * 668265263 + tohum * 982451653;
    n = (n ^ (n >>> 13)) * 1274126177;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = h(x0, y0);
  const b = h(x0 + 1, y0);
  const c = h(x0, y0 + 1);
  const d = h(x0 + 1, y0 + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function fbm(x: number, y: number, tohum: number, oktav = 4): number {
  let t = 0;
  let g = 0.5;
  let f = 1;
  for (let i = 0; i < oktav; i++) {
    t += gurultu(x * f, y * f, tohum + i) * g;
    g *= 0.5;
    f *= 2;
  }
  return t;
}

/** Yumuşak duman topağı: kenarı gürültüyle düzensiz, merkezi yoğun. */
export function dumanDokusu(boyut = 128, tohum = 1): THREE.Texture {
  const [c, ctx] = tuval(boyut);
  const img = ctx.createImageData(boyut, boyut);
  for (let y = 0; y < boyut; y++) {
    for (let x = 0; x < boyut; x++) {
      const dx = (x + 0.5) / boyut - 0.5;
      const dy = (y + 0.5) / boyut - 0.5;
      const r = Math.hypot(dx, dy) * 2; // 0 merkez, 1 kenar
      const n = fbm(x / 20, y / 20, tohum, 4);
      const kenar = 0.75 + (n - 0.5) * 0.6;
      let a = 1 - r / kenar;
      a = Math.max(0, Math.min(1, a));
      a = a * a * (3 - 2 * a) * (0.55 + n * 0.45);
      const i = (y * boyut + x) * 4;
      const ton = 200 + (n - 0.5) * 60;
      img.data[i] = ton;
      img.data[i + 1] = ton;
      img.data[i + 2] = ton;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Ateş topu / alev: sıcak merkez, turuncu kenar, katkı karışımı için. */
export function atesDokusu(boyut = 128, tohum = 7): THREE.Texture {
  const [c, ctx] = tuval(boyut);
  const img = ctx.createImageData(boyut, boyut);
  for (let y = 0; y < boyut; y++) {
    for (let x = 0; x < boyut; x++) {
      const dx = (x + 0.5) / boyut - 0.5;
      const dy = (y + 0.5) / boyut - 0.5;
      const n = fbm(x / 14, y / 14, tohum, 3);
      const r = Math.hypot(dx, dy) * 2 * (0.85 + (n - 0.5) * 0.5);
      const a = Math.max(0, Math.min(1, 1 - r));
      const sicak = Math.pow(a, 2.2);
      const i = (y * boyut + x) * 4;
      img.data[i] = Math.round(255 * Math.min(1, a * 1.3));
      img.data[i + 1] = Math.round(255 * (0.25 * a + 0.75 * sicak));
      img.data[i + 2] = Math.round(255 * (0.05 * a + 0.9 * sicak * sicak));
      img.data[i + 3] = Math.round(255 * a * a * (0.8 + n * 0.2));
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Kıvılcım / moloz parçası: küçük parlak nokta. */
export function kivilcimDokusu(boyut = 32): THREE.Texture {
  const [c, ctx] = tuval(boyut);
  const g = ctx.createRadialGradient(boyut / 2, boyut / 2, 0, boyut / 2, boyut / 2, boyut / 2);
  g.addColorStop(0, "rgba(255,240,200,1)");
  g.addColorStop(0.4, "rgba(255,180,80,0.9)");
  g.addColorStop(1, "rgba(255,120,30,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, boyut, boyut);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Krater çıkartması: üstten bakış; merkez kararmış toprak, düzensiz yanık halka, dışa doğru
 * saçılmış koyu lekeler. Zemin düzlemine yatırılıp perspektifle doğal şekilde basıklaşır.
 */
export function kraterDokusu(boyut = 256, tohum = 3): THREE.Texture {
  const [c, ctx] = tuval(boyut);
  const img = ctx.createImageData(boyut, boyut);
  for (let y = 0; y < boyut; y++) {
    for (let x = 0; x < boyut; x++) {
      const dx = (x + 0.5) / boyut - 0.5;
      const dy = (y + 0.5) / boyut - 0.5;
      const aci = Math.atan2(dy, dx);
      const n1 = fbm(Math.cos(aci) * 3 + 5, Math.sin(aci) * 3 + 5, tohum, 3); // açısal düzensizlik
      const n2 = fbm(x / 18, y / 18, tohum + 11, 4); // doku
      const r = (Math.hypot(dx, dy) * 2) / (0.78 + (n1 - 0.5) * 0.5);
      // Merkez (0–0.35): koyu, yanık. Halka (0.35–0.7): kabarık toprak, daha açık. Dış (0.7–1): saçılma.
      let a: number;
      let ton: number;
      if (r < 0.38) {
        a = 0.95;
        ton = 28 + n2 * 30;
      } else if (r < 0.7) {
        const t = (r - 0.38) / 0.32;
        a = 0.9 - t * 0.35;
        ton = 60 + t * 50 + (n2 - 0.5) * 50;
      } else {
        const t = (r - 0.7) / 0.3;
        a = Math.max(0, (1 - t) * (0.5 + (n2 - 0.5) * 1.2)) * 0.7;
        ton = 50 + n2 * 40;
      }
      if (r > 1.05) a = 0;
      const i = (y * boyut + x) * 4;
      img.data[i] = Math.round(ton * 1.05);
      img.data[i + 1] = Math.round(ton * 0.92);
      img.data[i + 2] = Math.round(ton * 0.75);
      img.data[i + 3] = Math.round(Math.max(0, Math.min(1, a)) * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Yumuşak dairesel gölge/kararma (temas gölgesi, rotor tozu tabanı). */
export function yumusakDaireDokusu(boyut = 128): THREE.Texture {
  const [c, ctx] = tuval(boyut);
  const g = ctx.createRadialGradient(boyut / 2, boyut / 2, 0, boyut / 2, boyut / 2, boyut / 2);
  g.addColorStop(0, "rgba(0,0,0,1)");
  g.addColorStop(0.5, "rgba(0,0,0,0.6)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, boyut, boyut);
  return new THREE.CanvasTexture(c);
}
