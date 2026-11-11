import { describe, expect, it } from "vitest";
import { ROTOR_TOZU_PROFILLERI, rotorTozuSiddeti, rotorTozuTuru, type RotorTozuTuru } from "./rotorTozu";

const BOLGELER = ["kirsal_acik_arazi", "daglik", "ormanlik", "us_bolgesi", "meskun_mahal"];
const parlaklik = (r: [number, number, number]) => r[0] + r[1] + r[2];

describe("rotorTozuTuru", () => {
  it("kışın her bölgede kar savrulur", () => {
    for (const b of BOLGELER) expect(rotorTozuTuru(b, "kis")).toBe("kar");
  });

  it("yaz: kırsal/dağlık kuru toprak, ormanlık orman, üs ve meskûn mahal beton", () => {
    expect(rotorTozuTuru("kirsal_acik_arazi", "yaz")).toBe("toprak");
    expect(rotorTozuTuru("daglik", "yaz")).toBe("toprak");
    expect(rotorTozuTuru("ormanlik", "yaz")).toBe("orman");
    expect(rotorTozuTuru("us_bolgesi", "yaz")).toBe("beton");
    expect(rotorTozuTuru("meskun_mahal", "yaz")).toBe("beton");
  });

  it("bilinmeyen bölge kuru toprak sayılır", () => {
    expect(rotorTozuTuru("bilinmeyen", "yaz")).toBe("toprak");
  });
});

describe("ROTOR_TOZU_PROFILLERI", () => {
  const p = ROTOR_TOZU_PROFILLERI;

  it("renkler 0–1 aralığında, kırıntı listesi dolu", () => {
    for (const tur of Object.keys(p) as RotorTozuTuru[]) {
      for (const k of [p[tur].renk, ...p[tur].kirinti]) for (const c of k) expect(c >= 0 && c <= 1).toBe(true);
      expect(p[tur].kirinti.length).toBeGreaterThan(0);
    }
  });

  it("kar: daha parlak, ince, uzun asılı kalır ve parıldar", () => {
    expect(parlaklik(p.kar.renk)).toBeGreaterThan(parlaklik(p.toprak.renk));
    expect(p.kar.renk[2]).toBeGreaterThan(p.kar.renk[0]); // mavimsi
    expect(p.kar.boyut).toBeLessThan(p.toprak.boyut);
    expect(p.kar.omur).toBeGreaterThan(p.toprak.omur);
    expect(p.kar.parilti).toBeGreaterThan(0);
    expect(p.toprak.parilti).toBe(0);
  });

  it("orman: koyu toprak + bol, süzülen yaprak kırıntısı; beton: açık gri, az hacim", () => {
    expect(parlaklik(p.orman.renk)).toBeLessThan(parlaklik(p.toprak.renk));
    expect(p.orman.kirintiOrani).toBeGreaterThan(p.toprak.kirintiOrani);
    expect(p.orman.kirintiYercekimi).toBeLessThan(6);
    expect(p.beton.hacim).toBeLessThan(p.toprak.hacim);
    expect(Math.abs(p.beton.renk[0] - p.beton.renk[2])).toBeLessThan(0.05); // gri
  });
});

describe("rotorTozuSiddeti", () => {
  it("20 m ve üstünde yok, yere yaklaştıkça artar", () => {
    expect(rotorTozuSiddeti(20, 1)).toBe(0);
    expect(rotorTozuSiddeti(45, 1)).toBe(0);
    expect(rotorTozuSiddeti(0, 1)).toBeCloseTo(1);
    let onceki = -1;
    for (let h = 20; h >= 0; h -= 1) {
      const s = rotorTozuSiddeti(h, 1);
      expect(s).toBeGreaterThanOrEqual(onceki);
      onceki = s;
    }
    // Yer etkisi üstel: 10 m'de yarıdan az
    expect(rotorTozuSiddeti(10, 1)).toBeLessThan(0.5);
  });

  it("rotor gücüyle ölçeklenir ve sınırlanır", () => {
    expect(rotorTozuSiddeti(2, 0.5)).toBeCloseTo(rotorTozuSiddeti(2, 1) * 0.5);
    expect(rotorTozuSiddeti(0, 2)).toBeCloseTo(1);
    expect(rotorTozuSiddeti(0, -1)).toBe(0);
  });
});
