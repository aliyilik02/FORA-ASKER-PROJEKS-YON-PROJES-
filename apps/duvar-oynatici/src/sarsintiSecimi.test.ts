import { describe, expect, it } from "vitest";
import { SARSINTI_CARPANI, sarsintiSec } from "./sarsintiSecimi";

function kayit(baslangic: Record<string, string> = {}) {
  const m = new Map(Object.entries(baslangic));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

describe("sarsintiSec", () => {
  it("geçerli ?sarsinti= yerel kayda yazılır ve döner", () => {
    const k = kayit();
    expect(sarsintiSec("kapali", k)).toBe("kapali");
    expect(k.m.get("sarsinti")).toBe("kapali");
  });
  it("parametre yoksa yerel kayıt, o da yoksa hafif", () => {
    expect(sarsintiSec(null, kayit({ sarsinti: "tam" }))).toBe("tam");
    expect(sarsintiSec(null, kayit())).toBe("hafif");
    expect(sarsintiSec("saçma", kayit({ sarsinti: "bozuk" }))).toBe("hafif");
  });
  it("kapalı genliği sıfırlar, hafif tamdan küçük", () => {
    expect(SARSINTI_CARPANI.kapali).toBe(0);
    expect(SARSINTI_CARPANI.hafif).toBeLessThan(SARSINTI_CARPANI.tam);
  });
});
