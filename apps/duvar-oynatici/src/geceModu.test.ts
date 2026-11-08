import { describe, expect, it } from "vitest";
import { geceFiltresi, geceModuSec } from "./geceModu";

function kayit(baslangic: Record<string, string> = {}) {
  const m = new Map(Object.entries(baslangic));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

describe("gece modu", () => {
  it("seçim: parametre > kayıt > fiziksel", () => {
    const k = kayit();
    expect(geceModuSec("projeksiyon", k)).toBe("projeksiyon");
    expect(k.m.get("gece")).toBe("projeksiyon");
    expect(geceModuSec(null, kayit({ gece: "projeksiyon" }))).toBe("projeksiyon");
    expect(geceModuSec("x", kayit())).toBe("fiziksel");
  });
  it("filtre: fizikselde ve gündüz boş; gece karanlık arttıkça güçlenir", () => {
    expect(geceFiltresi("fiziksel", 0.1)).toBe("");
    expect(geceFiltresi("projeksiyon", 0.8)).toBe("");
    expect(geceFiltresi("projeksiyon", 0)).toBe("brightness(1.300) contrast(0.880)");
    const yarim = geceFiltresi("projeksiyon", 0.225);
    expect(yarim).toContain("brightness(1.150)");
    expect(geceFiltresi("projeksiyon", Number.NaN)).toBe("");
  });
});
