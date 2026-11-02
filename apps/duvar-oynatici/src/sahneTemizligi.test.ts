/**
 * Oynatıcının sahne temizliği: adımlar sabit sırayla çalışır, biri hata atsa da sonrakiler çalışır, hatalar tek
 * satırda özetlenir; köprü yokken yerel temel durum yalnız aktif bayrakları kapatır.
 */
import { describe, expect, it } from "vitest";
import { TEMIZLIK_ADIMLARI, adimlariCalistir, hataOzeti, temelDurum, type TemizlikAdimi } from "./sahneTemizligi";
import { varsayilanDurum } from "./tipler";

function kayitli(hataVeren: TemizlikAdimi[] = []) {
  const sira: TemizlikAdimi[] = [];
  const islemler = Object.fromEntries(
    TEMIZLIK_ADIMLARI.map((a) => [
      a,
      () => {
        sira.push(a);
        if (hataVeren.includes(a)) throw new Error(`${a} bozuk`);
      },
    ]),
  ) as Record<TemizlikAdimi, () => void>;
  return { sira, islemler };
}

describe("adimlariCalistir", () => {
  it("sabit sıra: kuyruklar → 3B → 2B klipler → 2B efektler → 2B izli → sesler → önizleme", () => {
    const { sira, islemler } = kayitli();
    expect(adimlariCalistir(islemler)).toEqual([]);
    expect(sira).toEqual(["kuyruklar", "sahne3b", "klipler", "efektler", "izli", "sesler", "onizleme"]);
  });

  it("bir adım hata atsa da sonrakiler çalışır; hatalar sırayla döner ve tek satırda özetlenir", () => {
    const { sira, islemler } = kayitli(["sahne3b", "sesler"]);
    const hatalar = adimlariCalistir(islemler);
    expect(sira).toEqual([...TEMIZLIK_ADIMLARI]);
    expect(hatalar.map((h) => h.adim)).toEqual(["sahne3b", "sesler"]);
    expect(hataOzeti(hatalar)).toBe("3B sahne: sahne3b bozuk · sesler: sesler bozuk");
    expect(hataOzeti([{ adim: "izli", hata: "metin" }])).toBe("2B izli mermi: metin");
  });
});

describe("temelDurum (köprü yokken yerel sıfırlama)", () => {
  it("çatışma, izli mermi ve helikopter kapanır, son efektler boşalır; ayarlar, ortam, bölge ve oda aynı; girdi değişmez", () => {
    const d = varsayilanDurum();
    d.oda = "oda2";
    d.bolge = "us_bolgesi";
    d.catisma = { aktif: true, siddet: 0.9, yon: 200, dostAtes: false };
    d.izliMermi = { aktif: true, cikisNoktasi: 2, yon: -45, siklik: 8 };
    d.oda2 = { ...d.oda2, helikopter: "yerde", helikopterYonu: 90, guvenliAlan: "cukur" };
    d.sonEfektler = [{ tur: "patlama", zaman: 1 }];
    const t = temelDurum(d);
    expect(t.catisma).toEqual({ aktif: false, siddet: 0.9, yon: 200, dostAtes: false });
    expect(t.izliMermi).toEqual({ aktif: false, cikisNoktasi: 2, yon: -45, siklik: 8 });
    expect(t.oda2).toEqual({ ...d.oda2, helikopter: "yok" });
    expect(t.sonEfektler).toEqual([]);
    expect(t.oda).toBe("oda2");
    expect(t.bolge).toBe("us_bolgesi");
    expect(t.ortam).toEqual(d.ortam);
    expect(d.catisma.aktif).toBe(true);
    expect(d.oda2.helikopter).toBe("yerde");
  });
});
