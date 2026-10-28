import { describe, expect, it } from "vitest";
import { aralikta, birlikNoktasiSec, noktaSec, yasakMi, yasaktanKacin, type YerlesimPlani } from "./yerlesim";

const plan: YerlesimPlani = {
  noktalar: [
    { ad: "tarla sol", azimut: -40, mesafe: 18, tur: ["patlama", "figur"] },
    { ad: "yol", azimut: 4, mesafe: 24, tur: ["figur"] },
    { ad: "sağ bozkır", azimut: 100, mesafe: 16, tur: ["patlama"] },
    { ad: "iniş", azimut: -75, mesafe: 40, tur: ["helikopter"] },
  ],
  yasak: [
    { ad: "kavaklar", baslangic: 7, bitis: 68 },
    { ad: "arka", baslangic: 170, bitis: -170 },
  ],
};

describe("aralıklar", () => {
  it("basit aralık ve sarmalı aralık", () => {
    expect(aralikta(30, { baslangic: 7, bitis: 68 })).toBe(true);
    expect(aralikta(70, { baslangic: 7, bitis: 68 })).toBe(false);
    expect(aralikta(175, { baslangic: 170, bitis: -170 })).toBe(true);
    expect(aralikta(-175, { baslangic: 170, bitis: -170 })).toBe(true);
    expect(aralikta(0, { baslangic: 170, bitis: -170 })).toBe(false);
    expect(yasakMi(30, plan.yasak)).toBe(true);
    expect(yasakMi(-30, plan.yasak)).toBe(false);
  });

  it("yasaktan kaçınma en yakın kenara iter", () => {
    expect(yasaktanKacin(12, plan.yasak)).toBe(3);
    expect(yasaktanKacin(60, plan.yasak)).toBe(72);
    expect(yasaktanKacin(-30, plan.yasak)).toBe(-30);
  });
});

describe("noktaSec", () => {
  it("tolerans içindeki en yakın uygun türde noktaya yapışır", () => {
    const s = noktaSec(plan, -25, "patlama", 14);
    expect(s.nokta?.ad).toBe("tarla sol");
    expect(s.mesafe).toBe(18);
    expect(s.degisti).toBe(true);
  });

  it("tür filtresi uygular: figür için 'yol' noktası, patlama için değil", () => {
    expect(noktaSec(plan, 10, "figur", 14).nokta?.ad).toBe("yol");
    const p = noktaSec(plan, 10, "patlama", 14);
    expect(p.nokta?.ad).toBe("tarla sol"); // 50° uzakta, tolerans 55 içinde
  });

  it("tolerans dışındaysa yönü korur ama yasak aralıktan kaçırır", () => {
    const s = noktaSec(plan, 40, "toz", 12);
    expect(s.nokta).toBeUndefined();
    expect(s.mesafe).toBe(12);
    expect([3, 72]).toContain(s.azimut);
  });

  it("plan yoksa isteneni aynen döner", () => {
    const s = noktaSec(undefined, 33, "patlama", 20);
    expect(s).toEqual({ azimut: 33, mesafe: 20, degisti: false });
  });

  it("helikopter noktası", () => {
    expect(noktaSec(plan, 12, "helikopter", 38, 180).nokta?.ad).toBe("iniş");
  });
});

describe("birlikNoktasiSec", () => {
  const p: YerlesimPlani = {
    noktalar: [
      { ad: "mevzi 1", azimut: -30, mesafe: 14, tur: ["asker", "figur"] },
      { ad: "mevzi 2", azimut: 10, mesafe: 16, tur: ["asker", "figur"] },
      { ad: "tank yeri", azimut: 40, mesafe: 30, tur: ["tank"] },
    ],
  };
  it("türü sırayla dener: tank için tank noktası, yoksa figür", () => {
    expect(birlikNoktasiSec(p, 0, ["tank", "figur"], 20, () => false).nokta?.ad).toBe("tank yeri");
    expect(birlikNoktasiSec({ noktalar: p.noktalar!.slice(0, 2) }, 0, ["tank", "figur"], 20, () => false).nokta?.ad).toBe("mevzi 2");
  });
  it("dolu noktayı atlar, hepsi doluysa yana kaydırır", () => {
    const dolu = (az: number) => Math.abs(az - 10) < 0.5;
    expect(birlikNoktasiSec(p, 5, ["asker"], 20, dolu).nokta?.ad).toBe("mevzi 1");
    const hepsiDolu = birlikNoktasiSec(p, 5, ["asker"], 20, (az, m) => Math.abs(az - 10) < 0.5 && Math.abs(m - 16) < 0.1 || Math.abs(az + 30) < 0.5);
    expect(hepsiDolu.nokta?.ad).toBe("mevzi 2");
    expect(Math.abs(hepsiDolu.azimut - 10)).toBeGreaterThan(5);
    expect(hepsiDolu.mesafe).toBeGreaterThan(16);
  });
  it("plan yoksa serbest yön", () => {
    expect(birlikNoktasiSec(undefined, 33, ["asker"], 18, () => false)).toEqual({ azimut: 33, mesafe: 18, degisti: false });
  });
});
