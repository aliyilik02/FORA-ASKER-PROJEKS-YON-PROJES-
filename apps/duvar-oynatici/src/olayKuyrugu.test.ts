import { describe, expect, it } from "vitest";
import { OlayKuyrugu } from "./olayKuyrugu";

describe("OlayKuyrugu", () => {
  it("olaylar sahne saatiyle vadesinde ve sırayla çalışır; iptal ve temizle çalıştırmaz", () => {
    const k = new OlayKuyrugu();
    const g: string[] = [];
    k.ekle(1, () => g.push("b"));
    k.ekle(0.5, () => g.push("a"));
    const iptal = k.ekle(0.7, () => g.push("x"));
    iptal();
    k.guncelle(0.3);
    expect(g).toEqual([]);
    k.guncelle(0.3);
    expect(g).toEqual(["a"]);
    k.guncelle(0.5);
    expect(g).toEqual(["a", "b"]);
    expect(k.bekleyen).toBe(0);
    k.ekle(0.1, () => g.push("c"));
    k.temizle();
    k.guncelle(1);
    expect(g).toEqual(["a", "b"]);
    expect(k.saat).toBeCloseTo(2.1, 6);
  });
  it("hata veren olay diğerlerini engellemez; dt ≤ 0 saati ilerletmez", () => {
    const k = new OlayKuyrugu();
    const g: string[] = [];
    k.ekle(0, () => {
      throw new Error("patla");
    });
    k.ekle(0, () => g.push("ok"));
    k.guncelle(0);
    expect(k.saat).toBe(0);
    k.guncelle(0.01);
    expect(g).toEqual(["ok"]);
  });
});
