/**
 * Panorama analizi (saf): ufuk bandı, parlaklık bantları, 2×2 küçültme. Bantlar açıyla tanımlı, kopya boyutundan
 * bağımsız; eski 128×64 düzeniyle (sahne3b'deki tuval yolu) aynı satırlar.
 */
import { describe, expect, it } from "vitest";
import { panoramaAnalizEt, parlaklikHesapla, ufukRengiHesapla, yariyaIndir } from "./panoramaAnalizi";

/** Satıra göre renk veren sentetik equirect (üst satır gök). */
function serit(w: number, h: number, renk: (y: number) => [number, number, number]): Uint8ClampedArray {
  const p = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const [r, g, b] = renk(y);
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      p[i] = r;
      p[i + 1] = g;
      p[i + 2] = b;
      p[i + 3] = 255;
    }
  }
  return p;
}
/** Satırın ufka göre yüksekliği (derece). */
const yukseklik = (y: number, h: number) => 90 - ((y + 0.5) / h) * 180;

describe("ufukRengiHesapla", () => {
  it("eski 128×64 düzenindeki 30–35. satırların ortalaması (ufkun hemen altı)", () => {
    const p = serit(128, 64, (y) => (y >= 30 && y < 36 ? [200, 100, 50] : [0, 0, 255]));
    const [r, g, b] = ufukRengiHesapla(p, 128, 64);
    expect(r).toBeCloseTo(200 / 255, 5);
    expect(g).toBeCloseTo(100 / 255, 5);
    expect(b).toBeCloseTo(50 / 255, 5);
  });
  it("256×128'de aynı açı bandı (60–71. satırlar)", () => {
    const p = serit(256, 128, (y) => (y >= 60 && y < 72 ? [10, 20, 30] : [250, 250, 250]));
    const [r, g, b] = ufukRengiHesapla(p, 256, 128);
    expect(r).toBeCloseTo(10 / 255, 5);
    expect(g).toBeCloseTo(20 / 255, 5);
    expect(b).toBeCloseTo(30 / 255, 5);
  });
});

describe("parlaklikHesapla", () => {
  it("zemin bandı (−8…−35°) ve gök bandı (+10…+60°) ayrı ölçülür; diğer satırlar sayılmaz", () => {
    const h = 128;
    const p = serit(256, h, (y) => {
      const e = yukseklik(y, h);
      if (e <= -8 && e >= -35) return [255, 255, 255];
      if (e >= 10 && e <= 60) return [0, 0, 0];
      return [128, 0, 0];
    });
    const s = parlaklikHesapla(p, 256, h);
    expect(s.zemin).toBeCloseTo(1, 5);
    expect(s.gok).toBeCloseTo(0, 5);
  });
  it("doğrusal (sRGB 128 → ~0,216)", () => {
    const s = parlaklikHesapla(serit(64, 32, () => [128, 128, 128]), 64, 32);
    expect(s.zemin).toBeCloseTo(0.2158, 3);
    expect(s.gok).toBeCloseTo(0.2158, 3);
  });
});

describe("yariyaIndir", () => {
  it("2×2 kutu ortalaması (sRGB değerleri, yuvarlamalı)", () => {
    const p = new Uint8ClampedArray(2 * 2 * 4);
    [0, 10, 20, 30].forEach((v, k) => {
      p[k * 4] = v;
      p[k * 4 + 1] = 255;
      p[k * 4 + 2] = 1;
      p[k * 4 + 3] = 255;
    });
    const k = yariyaIndir(p, 2, 2);
    expect(Array.from(k)).toEqual([15, 255, 1, 255]);
  });
});

describe("panoramaAnalizEt", () => {
  it("güneşi 256×128'den, ufuk ve parlaklığı 128×64'ten (yarı boy) ölçer", () => {
    const w = 256;
    const h = 128;
    const p = serit(w, h, (y) => (y < h / 2 ? [90, 140, 210] : [110, 90, 60]));
    // Orta duvarın üstünde, ~45° yükseklikte parlak disk
    for (let y = 28; y < 36; y++) {
      for (let x = 124; x < 132; x++) {
        const i = (y * w + x) * 4;
        p[i] = p[i + 1] = p[i + 2] = 255;
      }
    }
    const a = panoramaAnalizEt(p, w, h);
    expect(a.gunes).not.toBeNull();
    expect(Math.abs(a.gunes!.azimut)).toBeLessThan(3);
    expect(a.gunes!.yukseklik).toBeGreaterThan(35);
    // Ufuk bandı yarı boyda 30–35. satırlar (+5,6°…−11,3°): 2 satır gök + 4 satır zemin, eski koddaki gibi
    expect(a.ufuk[0]).toBeCloseTo((2 * 90 + 4 * 110) / 6 / 255, 3);
    expect(a.ufuk[2]).toBeCloseTo((2 * 210 + 4 * 60) / 6 / 255, 3);
    expect(a.parlaklik.gok).toBeGreaterThan(0);
    expect(a.parlaklik.zemin).toBeGreaterThan(0);
  });
});
