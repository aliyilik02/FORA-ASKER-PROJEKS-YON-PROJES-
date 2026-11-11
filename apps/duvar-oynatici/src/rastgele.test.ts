import { afterEach, describe, expect, it } from "vitest";
import { mulberry32, rastgele, rastgeleAralik, tohum, tohumAyarla } from "./rastgele";

afterEach(() => tohumAyarla(null));

describe("tohumlu rastgelelik", () => {
  it("aynı tohum aynı diziyi üretir, farklı tohum farklı", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const c = mulberry32(43);
    const da = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(da);
    expect([c(), c(), c()]).not.toEqual(da);
    for (const v of da) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it("tohumAyarla: sayı ve metin tohum; null Math.random'a döner", () => {
    tohumAyarla(7);
    const x = [rastgele(), rastgele()];
    tohumAyarla(7);
    expect([rastgele(), rastgele()]).toEqual(x);
    tohumAyarla("prova-1");
    expect(tohum()).not.toBeNull();
    const m1 = rastgele();
    tohumAyarla("prova-1");
    expect(rastgele()).toBe(m1);
    tohumAyarla(null);
    expect(tohum()).toBeNull();
    const r = rastgeleAralik(5, 10);
    expect(r).toBeGreaterThanOrEqual(5);
    expect(r).toBeLessThan(10);
  });
});
