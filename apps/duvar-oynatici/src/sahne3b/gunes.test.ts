import { describe, expect, it } from "vitest";
import { gunesTahmin, panoramadanSahneAzimutu } from "./gunes";

/** Sentetik equirect: mavi gök, kahverengi zemin, (u,v)'de parlak disk. */
function panorama(w: number, h: number, u: number, v: number, yaricap: number, kapali = false): Uint8ClampedArray {
  const p = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const gok = y < h / 2;
      let r = gok ? 90 : 110;
      let g = gok ? 140 : 90;
      let b = gok ? 210 : 60;
      if (kapali && gok) {
        r = g = b = 200 + ((x * 7 + y * 3) % 20);
      }
      const dx = Math.min(Math.abs(x / w - u), 1 - Math.abs(x / w - u)) * w;
      const dy = (y / h - v) * h;
      if (!kapali && Math.hypot(dx, dy) < yaricap) r = g = b = 255;
      p[i] = r;
      p[i + 1] = g;
      p[i + 2] = b;
      p[i + 3] = 255;
    }
  }
  return p;
}

describe("gunesTahmin", () => {
  it("ortadaki güneşi azimut 0, yükseklik ~45° olarak bulur", () => {
    const t = gunesTahmin(panorama(256, 128, 0.5, 0.25, 4), 256, 128)!;
    expect(t).not.toBeNull();
    expect(Math.abs(t.azimut)).toBeLessThan(3);
    expect(t.yukseklik).toBeGreaterThan(40);
    expect(t.yukseklik).toBeLessThan(50);
    expect(t.guc).toBeGreaterThan(0.8);
    expect(t.yukseklikGuvenilir).toBe(true);
  });

  it("ufuktan zenite uzanan parlak sütunda azimut verir ama yüksekliği güvenilmez sayar", () => {
    const w = 256;
    const h = 128;
    const p = panorama(w, h, 0.5, 0.25, 0); // disksiz
    for (let y = 0; y < h / 2; y++) {
      for (let x = 240; x < 248; x++) {
        const i = (y * w + x) * 4;
        p[i] = p[i + 1] = p[i + 2] = 250;
      }
    }
    const t = gunesTahmin(p, w, h)!;
    expect(t).not.toBeNull();
    expect(t.azimut).toBeGreaterThan(150);
    expect(t.yukseklikGuvenilir).toBe(false);
  });

  it("sağdaki ve soldaki güneşi doğru işaretle bulur", () => {
    const sag = gunesTahmin(panorama(256, 128, 0.75, 0.3, 4), 256, 128)!;
    expect(sag.azimut).toBeGreaterThan(80);
    expect(sag.azimut).toBeLessThan(100);
    const sol = gunesTahmin(panorama(256, 128, 0.25, 0.3, 4), 256, 128)!;
    expect(sol.azimut).toBeLessThan(-80);
    expect(sol.azimut).toBeGreaterThan(-100);
  });

  it("kenardan taşan güneşte (u≈0) azimut ±180 civarıdır", () => {
    const t = gunesTahmin(panorama(256, 128, 0.0, 0.3, 4), 256, 128)!;
    expect(Math.abs(t.azimut)).toBeGreaterThan(170);
  });

  it("kapalı gökte güç düşük", () => {
    const t = gunesTahmin(panorama(256, 128, 0.5, 0.25, 4, true), 256, 128);
    expect(t === null || t.guc < 0.3).toBe(true);
  });

  it("çok küçük veya karanlık görüntüde null", () => {
    expect(gunesTahmin(new Uint8ClampedArray(4 * 4 * 4), 4, 4)).toBeNull();
    expect(gunesTahmin(new Uint8ClampedArray(64 * 32 * 4), 64, 32)).toBeNull();
  });
});

describe("panoramadanSahneAzimutu", () => {
  it("yaw kaydırması uygular ve -180..180 aralığına sarar", () => {
    expect(panoramadanSahneAzimutu(30, 0)).toBe(30);
    expect(panoramadanSahneAzimutu(30, 50)).toBe(-20);
    expect(panoramadanSahneAzimutu(-170, 30)).toBe(160);
  });
});
