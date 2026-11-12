/** Figür durum makinesi: bayraklardan tek durum, etkinlik başlama kuralları. */
import { describe, expect, it } from "vitest";
import { atesEdebilir, baslayabilir, durumCoz, mesgul, type DurumGirdisi } from "./figurDurumu";

const TEMEL: DurumGirdisi = {
  poz: "ayakta",
  asama: "normal",
  gecis: false,
  yuruyus: false,
  kosu: false,
  hiz: 0,
  tehdit: false,
  siperdeCokmus: false,
  eylem: "yok",
  surukleme: "yok",
  mudahale: false,
  agirSilah: false,
};
const d = (ek: Partial<DurumGirdisi>) => durumCoz({ ...TEMEL, ...ek });

describe("figür durumu", () => {
  it("temel durumlar", () => {
    expect(d({})).toBe("bekliyor");
    expect(d({ tehdit: true })).toBe("nisanda");
    expect(d({ tehdit: true, poz: "comelmis", siperdeCokmus: true })).toBe("siperde");
    expect(d({ tehdit: true, poz: "comelmis" })).toBe("nisanda"); // açıkta diz çökmüş ateş eder
    expect(d({ gecis: true, tehdit: true })).toBe("gecis");
    expect(d({ yuruyus: true, kosu: true, tehdit: true })).toBe("kosuyor");
    expect(d({ yuruyus: true })).toBe("yuruyor");
    expect(d({ hiz: 1.4 })).toBe("devriye");
    expect(d({ mudahale: true, poz: "comelmis" })).toBe("mudahale");
    expect(d({ agirSilah: true, tehdit: true })).toBe("arac");
  });

  it("öncelik: yaralanma her şeyi ezer; sürüklenen yaralı ayrı durum", () => {
    expect(d({ asama: "vuruluyor", yuruyus: true, kosu: true, eylem: "sarjor" })).toBe("vuruluyor");
    expect(d({ poz: "yarali", asama: "yerde", tehdit: true })).toBe("yarali");
    expect(d({ poz: "yarali", asama: "yerde", surukleme: "cekilen" })).toBe("suruklenen");
    // Çeken asker koşarken de, çekerken de "sürüklüyor"
    expect(d({ surukleme: "ceken", yuruyus: true, kosu: true, tehdit: true })).toBe("surukluyor");
    expect(d({ surukleme: "ceken", tehdit: true })).toBe("surukluyor");
    // Etkinlik geçişten sonra gelir: geçiş bitmeden şarjör durumu görünmez
    expect(d({ eylem: "sarjor", gecis: true, tehdit: true })).toBe("gecis");
    expect(d({ eylem: "sarjor", tehdit: true })).toBe("sarjor");
    expect(d({ eylem: "jest", tehdit: true })).toBe("jest");
  });

  it("yalnız nişandaki figür ateş eder", () => {
    expect(atesEdebilir(d({ tehdit: true }))).toBe(true);
    for (const ek of [{ eylem: "sarjor" as const }, { gecis: true }, { yuruyus: true, kosu: true }, { siperdeCokmus: true, poz: "comelmis" as const }, { surukleme: "ceken" as const }])
      expect(atesEdebilir(d({ tehdit: true, ...ek }))).toBe(false);
    expect(atesEdebilir(d({}))).toBe(false);
  });

  it("etkinlikler yalnız sakin durumdan başlar", () => {
    const nisanda = d({ tehdit: true });
    const siperde = d({ tehdit: true, poz: "comelmis", siperdeCokmus: true });
    for (const e of ["mevziDegistir", "sarjor", "jest", "suruklemeyeGit", "siperKarari"] as const) {
      expect(baslayabilir(e, nisanda)).toBe(true);
      expect(baslayabilir(e, siperde)).toBe(true);
      expect(baslayabilir(e, d({ gecis: true, tehdit: true }))).toBe(false);
      expect(baslayabilir(e, d({ eylem: "sarjor", tehdit: true }))).toBe(false);
      expect(baslayabilir(e, d({ poz: "yarali", asama: "yerde" }))).toBe(false);
      expect(baslayabilir(e, d({ surukleme: "ceken" }))).toBe(false);
    }
    // Çatışma yokken: şarjör/mevzi değiştirme başlamaz; yaralıyı çekmeye gidilebilir
    expect(baslayabilir("sarjor", d({}))).toBe(false);
    expect(baslayabilir("mevziDegistir", d({}))).toBe(false);
    expect(baslayabilir("suruklemeyeGit", d({}))).toBe(true);
  });

  it("meşgul: nişanda / siperde / bekliyor dışındaki her durum", () => {
    expect(mesgul("nisanda")).toBe(false);
    expect(mesgul("siperde")).toBe(false);
    expect(mesgul("bekliyor")).toBe(false);
    for (const x of ["gecis", "kosuyor", "yuruyor", "sarjor", "jest", "surukluyor", "suruklenen", "mudahale", "vuruluyor", "yarali", "devriye", "arac"] as const) expect(mesgul(x)).toBe(true);
  });
});
