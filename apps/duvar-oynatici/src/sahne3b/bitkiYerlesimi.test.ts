import { describe, expect, it } from "vitest";
import { bitkiListesi, KIS_ESIGI } from "./arazi";
import { AralikIzgarasi, karistir, yolDizisi } from "./bitkiYerlesimi";

/** Tekrarlanabilir rastgele (mulberry32). */
function tohumlu(tohum: number) {
  let a = tohum >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("yol boyu dizi (kavak sırası)", () => {
  const yol = (x: number) => -32 + 9 * Math.sin(x / 70) + 3 * Math.sin(x / 23);

  it("yolun iki yanında, merkez çizgisinden `pay` kadar açıkta, adım arayla", () => {
    const d = yolDizisi(yol, -100, 100, 24, 0, 6.5, 0, tohumlu(1));
    expect(d.length).toBe(2 * 9); // x = -96 … 96, iki yan
    for (const p of d) {
      // Yola dik uzaklık ≈ pay (±%8 kayma, eğrilik payı)
      const enYakin = Math.min(...Array.from({ length: 81 }, (_, i) => p.x - 20 + i * 0.5).map((x) => Math.hypot(p.x - x, p.z - yol(x))));
      expect(enYakin).toBeGreaterThan(5.6);
      expect(enYakin).toBeLessThan(7.3);
    }
    const ust = d.filter((p) => p.z > yol(p.x)).length;
    expect(ust).toBe(9);
  });

  it("farklı fazlı türler iç içe tek sıra olur; boşluk olasılığı adayları seyreltir", () => {
    const a = yolDizisi(yol, -100, 100, 24, 0, 6.5, 0, tohumlu(2));
    const b = yolDizisi(yol, -100, 100, 24, 8, 6.5, 0, tohumlu(3));
    const enYakinFark = Math.min(...a.flatMap((p) => b.map((q) => Math.hypot(p.x - q.x, p.z - q.z))));
    expect(enYakinFark).toBeGreaterThan(4); // aynı noktaya iki ağaç yok
    const seyrek = yolDizisi(yol, -100, 100, 24, 0, 6.5, 0.5, tohumlu(4));
    expect(seyrek.length).toBeGreaterThan(3);
    expect(seyrek.length).toBeLessThan(15);
  });

  it("geçersiz adımda boş", () => {
    expect(yolDizisi(yol, -10, 10, 0, 0, 6, 0, Math.random)).toEqual([]);
  });
});

describe("gövdeler arası aralık", () => {
  it("aralık içinde dolu, dışında boş; iki gövdenin aralığından büyüğü geçerli", () => {
    const iz = new AralikIzgarasi(4);
    expect(iz.bosMu(0, 0, 3)).toBe(true);
    iz.ekle(0, 0, 3);
    expect(iz.bosMu(2, 0, 3)).toBe(false);
    expect(iz.bosMu(3.5, 0, 3)).toBe(true);
    iz.ekle(10, 10, 6); // geniş tepeli meşe
    expect(iz.bosMu(14.5, 10, 2)).toBe(false); // genç çam (2 m) meşenin 6 m'sine giremez
    expect(iz.bosMu(16.5, 10, 2)).toBe(true);
    expect(iz.sayi).toBe(2);
  });

  it("hücre sınırını aşan komşular da bulunur", () => {
    const iz = new AralikIzgarasi(4);
    iz.ekle(3.9, 3.9, 3);
    expect(iz.bosMu(4.1, 4.1, 3)).toBe(false);
    iz.ekle(0.2, 2, 3);
    expect(iz.bosMu(-0.5, 2, 3)).toBe(false); // komşu hücre (-1, 0)
  });
});

describe("karıştırma", () => {
  it("aynı öğeler, girdi değişmez", () => {
    const girdi = [1, 2, 3, 4, 5, 6];
    const k = karistir(girdi, tohumlu(5));
    expect([...k].sort()).toEqual(girdi);
    expect(girdi).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe("bitki setleri: yaz ve kış", () => {
  const adlar = (set: Parameters<typeof bitkiListesi>[0], kar: number) => bitkiListesi(set, kar).map((b) => b.klasor);

  it("orman yazın karaçam, çam, ladin; kışın iğne yapraklılar kalır (kar gölgelendiricide), meşe yapraksız, eğrelti ve ot yok", () => {
    const yaz = adlar("orman", 0);
    expect(yaz).toContain("ez_karacam~1");
    expect(yaz).toContain("ez_mese");
    expect(yaz).toContain("m_egrelti_234");
    const kis = adlar("orman", 1);
    expect(kis).toContain("ez_karacam~1"); // her dem yeşil: kalır, üstü gölgelendiricide karlanır
    expect(kis).toContain("ez_sedir");
    expect(kis).toContain("ez_kis_mese");
    expect(kis).not.toContain("ez_mese");
    expect(kis.filter((k) => k === "ez_cali_2").length).toBe(2); // yaz çalısı + kışın eklenen karlı çalı
    expect(kis).not.toContain("m_egrelti_234");
    expect(kis).not.toContain("cimen_1");
  });

  it("kavak sırası kışın yapraksız ağaç sırası olur (dizi ve varyant korunur, çıplak dal az sallanır)", () => {
    const kis = bitkiListesi("bozkir", 1).filter((b) => b.dizi);
    expect(kis.map((b) => b.klasor)).toEqual(["ez_kis_kavak~1", "ez_kis_kavak~2", "ez_kis_kavak~3"]);
    expect(kis.every((b) => b.ruzgar === 0.03)).toBe(true);
  });

  it("sonbaharın hafif kırağısı yaz setinde kalır; eşik kışta", () => {
    expect(adlar("orman", 0.15)).toContain("ez_mese");
    expect(adlar("orman", KIS_ESIGI)).toContain("ez_kis_mese");
  });

  it("ağaçlar uzak kopyalı, izleyiciden uzakta ve gövde aralıklı", () => {
    for (const set of ["orman", "dag", "bozkir"] as const) {
      for (const b of bitkiListesi(set, 0).filter((b) => b.sinif === "agac")) {
        expect(b.uzak).toBe(true);
        expect(b.enYakin).toBeGreaterThanOrEqual(9);
        expect(b.aralik).toBeGreaterThan(0);
      }
    }
  });
});
