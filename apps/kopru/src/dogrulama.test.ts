import { describe, expect, it } from "vitest";
import { CATISMA_SEMASI, ISIK_SEMASI, IZLI_MERMI_SEMASI, ORTAM_SEMASI, kismiDogrula, sayiYaDa, secenekYaDa, senaryoAdimlariniDogrula, MEVSIMLER } from "./dogrulama.js";

describe("kismiDogrula", () => {
  it("metin sayı NaN üretmez: hata satırı; sayısal metin kabul", () => {
    const s = kismiDogrula<{ r: number }>({ r: "abc" }, ISIK_SEMASI);
    expect(s.hatalar).toEqual(["r: sayı olmalı"]);
    expect(s.deger).toEqual({});
    expect(kismiDogrula<{ r: number }>({ r: "120" }, ISIK_SEMASI).deger).toEqual({ r: 120 });
    expect(kismiDogrula<{ r: number }>({ r: Number.NaN }, ISIK_SEMASI).hatalar).toHaveLength(1);
  });
  it("'false' metni true sayılmaz; seçenekler denetlenir; tanınmayan alan atılır", () => {
    const s = kismiDogrula<{ aktif: boolean }>({ aktif: "false", bilinmeyen: 1 }, CATISMA_SEMASI);
    expect(s.deger).toEqual({ aktif: false });
    expect(kismiDogrula({ aktif: "evet" }, CATISMA_SEMASI).hatalar).toEqual(["aktif: true/false olmalı"]);
    expect(kismiDogrula({ mevsim: "bahar" }, ORTAM_SEMASI).hatalar[0]).toContain("mevsim");
    expect(kismiDogrula({ mevsim: "kis", saat: 7.5 }, ORTAM_SEMASI)).toEqual({ deger: { mevsim: "kis", saat: 7.5 }, hatalar: [] });
  });
  it("sayısal seçenek (çıkış noktası) metin olarak da gelebilir; dizi/ilkel gövde reddedilir", () => {
    expect(kismiDogrula({ cikisNoktasi: "2" }, IZLI_MERMI_SEMASI).deger).toEqual({ cikisNoktasi: 2 });
    expect(kismiDogrula({ cikisNoktasi: 5 }, IZLI_MERMI_SEMASI).hatalar).toHaveLength(1);
    expect(kismiDogrula([1], ORTAM_SEMASI).hatalar).toEqual(["gövde bir nesne olmalı"]);
    expect(kismiDogrula(undefined, ORTAM_SEMASI)).toEqual({ deger: {}, hatalar: [] });
  });
  it("depo yardımcıları bozuk değerde eskiyi korur", () => {
    expect(sayiYaDa(Number.NaN, 12)).toBe(12);
    expect(sayiYaDa("x", 12)).toBe(12);
    expect(sayiYaDa("3", 12)).toBe(3);
    expect(secenekYaDa("bahar", MEVSIMLER, "yaz")).toBe("yaz");
    expect(secenekYaDa("kis", MEVSIMLER, "yaz")).toBe("kis");
  });
});

describe("senaryoAdimlariniDogrula", () => {
  it("yinelenen adım kimlikleri tekilleştirilir, eksik işlem ve gecikme hata verir", () => {
    const s = senaryoAdimlariniDogrula([
      { id: "a", gecikmeMs: 0, islem: { tip: "bolge", bolge: "daglik" } },
      { id: "a", gecikmeMs: "500", islem: { tip: "efekt", efekt: { tur: "patlama" } } },
      { id: "a", gecikmeMs: 1000, islem: { tip: "ortam" } },
      { gecikmeMs: "yok", islem: {} },
    ]);
    expect(s.adimlar.map((a) => a.id)).toEqual(["a", "a_2", "a_3", "adim_4"]);
    expect(s.adimlar[1].gecikmeMs).toBe(500);
    expect(s.hatalar).toEqual(["adım 4: islem.tip eksik", "adım 4: gecikmeMs sayı olmalı"]);
    expect(senaryoAdimlariniDogrula("x").hatalar).toEqual(["adimlar bir dizi olmalı"]);
  });
});
