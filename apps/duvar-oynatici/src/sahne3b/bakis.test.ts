import { describe, expect, it } from "vitest";
import { bakisAcilari, yumusat } from "./bakis";

const der = (r: number) => (r * 180) / Math.PI;

describe("bakisAcilari", () => {
  it("tam karşıdaki hedef için 0; sağdaki hedef pozitif yaw, yukarıdaki pozitif pitch", () => {
    const goz = { x: 0, y: 1.6, z: 0 };
    expect(bakisAcilari(goz, 0, { x: 0, y: 1.6, z: 10 })).toEqual({ yaw: 0, pitch: 0 });
    const sag = bakisAcilari(goz, 0, { x: 10, y: 1.6, z: 10 });
    expect(der(sag.yaw)).toBeCloseTo(45, 5);
    const yukari = bakisAcilari(goz, 0, { x: 0, y: 1.6 + 10 * Math.tan((10 * Math.PI) / 180), z: 10 });
    expect(der(yukari.pitch)).toBeCloseTo(10, 5);
  });
  it("eklem sınırları: arkadaki hedef ±70°'ye, dik aşağı ±25°'ye kırpılır", () => {
    const goz = { x: 0, y: 1.6, z: 0 };
    expect(der(bakisAcilari(goz, 0, { x: 1, y: 1.6, z: -10 }).yaw)).toBeCloseTo(70, 5);
    expect(der(bakisAcilari(goz, 0, { x: -1, y: 1.6, z: -10 }).yaw)).toBeCloseTo(-70, 5);
    expect(der(bakisAcilari(goz, 0, { x: 0, y: -20, z: 1 }).pitch)).toBeCloseTo(-25, 5);
  });
  it("figürün yüzü dönükse ofset yüze göredir ve ±180 sarması doğru", () => {
    const goz = { x: 0, y: 1.6, z: 0 };
    // Yüzü -z'ye dönük (yaw π), hedef -z'de: ofset 0
    expect(bakisAcilari(goz, Math.PI, { x: 0, y: 1.6, z: -10 }).yaw).toBeCloseTo(0, 6);
    // Yüzü +x'e dönük (yaw π/2), hedef +z'de: sola 90° → -70'e kırpılır
    expect(der(bakisAcilari(goz, Math.PI / 2, { x: 0, y: 1.6, z: 10 }).yaw)).toBeCloseTo(-70, 5);
    // Hedef tam tepede: yaw 0
    expect(bakisAcilari(goz, 0, { x: 0, y: 30, z: 0 })).toEqual({ yaw: 0, pitch: 0 });
  });
  it("yumusat kare hızından bağımsız yaklaşır ve aşmaz", () => {
    let a = 0;
    for (let i = 0; i < 60; i++) a = yumusat(a, 1, 1 / 60, 0.35);
    expect(a).toBeGreaterThan(0.9);
    expect(a).toBeLessThanOrEqual(1);
    expect(yumusat(0, 1, 5, 0.35)).toBe(1);
  });
});
