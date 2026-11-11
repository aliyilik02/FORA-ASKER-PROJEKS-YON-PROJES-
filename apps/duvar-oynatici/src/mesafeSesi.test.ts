import { describe, expect, it } from "vitest";
import { mesafeGecikmesi, mesafeKazanci, mesafeKesimi } from "./mesafeSesi";

describe("mesafe sesi (crack–thump)", () => {
  it("gecikme mesafe/343, 4 sn'de kırpılır, geçersizde 0", () => {
    expect(mesafeGecikmesi(343)).toBeCloseTo(1, 6);
    expect(mesafeGecikmesi(800)).toBeCloseTo(2.33, 2);
    expect(mesafeGecikmesi(5000)).toBe(4);
    expect(mesafeGecikmesi(Number.NaN)).toBe(0);
    expect(mesafeGecikmesi(-5)).toBe(0);
  });
  it("kesim: 300 m 6 kHz, 1 km 2 kHz, 2 km+ 800 Hz, arada logaritmik ve azalan", () => {
    expect(mesafeKesimi(300)).toBeCloseTo(6000, 0);
    expect(mesafeKesimi(1000)).toBeCloseTo(2000, 0);
    expect(mesafeKesimi(2000)).toBe(800);
    expect(mesafeKesimi(3000)).toBe(800);
    expect(mesafeKesimi(50)).toBe(9000);
    const a = mesafeKesimi(500);
    expect(a).toBeLessThan(6000);
    expect(a).toBeGreaterThan(2000);
  });
  it("kazanç: 100 m'de 1, 200 m'de 0,5 (−6 dB), tabanı 0,04", () => {
    expect(mesafeKazanci(80)).toBe(1);
    expect(mesafeKazanci(200)).toBeCloseTo(0.5, 6);
    expect(mesafeKazanci(400)).toBeCloseTo(0.25, 6);
    expect(mesafeKazanci(100000)).toBe(0.04);
  });
});
