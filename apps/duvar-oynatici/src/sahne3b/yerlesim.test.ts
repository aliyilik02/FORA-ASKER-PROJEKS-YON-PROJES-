import { describe, expect, it } from "vitest";
import { aralikta, noktaSec, yasakMi, yasaktanKacin, type YerlesimPlani } from "./yerlesim";

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
