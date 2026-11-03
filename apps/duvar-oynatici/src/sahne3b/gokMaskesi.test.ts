import { describe, expect, it } from "vitest";
import { gokMaskesiHesapla } from "./gokMaskesi";

/** Sentetik dik panorama: üstten ufka açılan mavi gök, kahverengi zemin; isteğe bağlı nesneler çizilir. */
function panorama(w: number, h: number, ciz?: (x: number, y: number) => [number, number, number] | null) {
  const v = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const yuk = 90 - ((y + 0.5) / h) * 180;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let r: number;
      let g: number;
      let b: number;
      if (yuk > 0) {
        const t = yuk / 90;
        r = 150 - 60 * t;
        g = 190 - 50 * t;
        b = 240 - 20 * t;
      } else {
        r = 120;
        g = 95;
        b = 70;
      }
      const o = ciz?.(x, y);
      if (o) [r, g, b] = o;
      v[i] = r;
      v[i + 1] = g;
      v[i + 2] = b;
      v[i + 3] = 255;
    }
  }
  return v;
}

const W = 256;
const H = 128;
const satir = (yuk: number) => Math.round(((90 - yuk) / 180) * H - 0.5);
const deger = (m: Uint8Array, x: number, yuk: number) => m[satir(yuk) * W + x];

describe("gök maskesi", () => {
  it("açık gökte ufkun üstü gök, altı zemin", () => {
    const m = gokMaskesiHesapla(panorama(W, H), W, H);
    expect(deger(m.veri, 10, 60)).toBe(255);
    expect(deger(m.veri, 200, 8)).toBe(255);
    expect(deger(m.veri, 10, -20)).toBe(0);
    expect(m.oran).toBeGreaterThan(0.95);
  });

  it("göğe yükselen koyu ağaç gök değil, gökle çevrili güneş diski gök", () => {
    const veri = panorama(W, H, (x, y) => {
      const yuk = 90 - ((y + 0.5) / H) * 180;
      if (x >= 60 && x < 80 && yuk > -10 && yuk < 35) return [40, 60, 30]; // ağaç (zemine değer)
      if ((x - 180) ** 2 + (yuk - 50) ** 2 < 16) return [255, 255, 250]; // güneş
      return null;
    });
    const m = gokMaskesiHesapla(veri, W, H);
    expect(deger(m.veri, 70, 20)).toBe(0);
    expect(deger(m.veri, 180, 50)).toBe(255);
    expect(deger(m.veri, 120, 20)).toBe(255);
  });

  it("ufka yakın, göğe yumuşak geçen puslu dağ satır profiliyle ayrılır", () => {
    const veri = panorama(W, H, (x, y) => {
      const yuk = 90 - ((y + 0.5) / H) * 180;
      // Kenarı birkaç piksele yayılmış, gökten belirgin koyu dağ (0–8°)
      const tepe = 8 * Math.max(0, Math.sin((x / W) * Math.PI * 2));
      if (yuk > 0 && yuk < tepe) return [95, 105, 120];
      return null;
    });
    const m = gokMaskesiHesapla(veri, W, H);
    const x = Math.round(W / 4);
    expect(deger(m.veri, x, 3)).toBe(0);
    expect(deger(m.veri, x, 20)).toBe(255);
  });

  it("gece: aydınlık bina gök sayılmaz", () => {
    const veri = panorama(W, H, (x, y) => {
      const yuk = 90 - ((y + 0.5) / H) * 180;
      if (x >= 100 && x < 140 && yuk > -20 && yuk < 25) return [180, 150, 110]; // ışıklı cephe (zeminden yükselir)
      if (yuk > 0) return [12, 14, 22];
      return [20, 18, 16];
    });
    const m = gokMaskesiHesapla(veri, W, H);
    expect(deger(m.veri, 120, 15)).toBe(0);
    expect(deger(m.veri, 30, 40)).toBe(255);
  });
});
