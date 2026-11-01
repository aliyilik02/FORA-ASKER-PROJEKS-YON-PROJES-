import { describe, expect, it } from "vitest";
import {
  type AnahtarDeposu,
  duzenSec,
  hoparlorAyristir,
  hoparlorDuzeni,
  kanalEtiketleri,
  kanalKazanclari,
  kanalSayisi,
  ortamKazanclari,
  SES_DUZENLERI,
  sesAyariniCoz,
  sesDuzeniAyristir,
  stereoPan,
  VARSAYILAN_HOPARLORLER,
} from "./sesYerlesimi";

const enerji = (g: number[]) => g.reduce((s, x) => s + x * x, 0);
const KOK2 = Math.SQRT1_2;

describe("varsayılan düzenler", () => {
  it("kanal sayıları ve Windows/Chrome kanal sırası", () => {
    expect(SES_DUZENLERI.map(kanalSayisi)).toEqual([2, 4, 6, 8]);
    expect(VARSAYILAN_HOPARLORLER.dortlu).toEqual([-45, 45, -135, 135]);
    expect(VARSAYILAN_HOPARLORLER["5.1"][3]).toBeNull(); // FL FR C LFE SL SR
    expect(VARSAYILAN_HOPARLORLER["7.1"]).toEqual([-30, 30, 0, null, -150, 150, -90, 90]);
  });

  it("Türkçe kanal adları", () => {
    expect(kanalEtiketleri(hoparlorDuzeni("stereo"))).toEqual(["Sol", "Sağ"]);
    expect(kanalEtiketleri(hoparlorDuzeni("5.1"))).toEqual(["Ön sol", "Ön sağ", "Orta", "Bas (LFE)", "Arka sol", "Arka sağ"]);
    expect(kanalEtiketleri(hoparlorDuzeni("7.1")).slice(6)).toEqual(["Yan sol", "Yan sağ"]);
    // Özel yerleşimde ad azimuttan
    expect(kanalEtiketleri(hoparlorDuzeni("dortlu", hoparlorAyristir("-60,60,-100,180")))).toEqual(["Ön sol (-60°)", "Ön sağ (60°)", "Yan sol (-100°)", "Arka orta (-180°)"]);
  });

  it("stereo pan eski yasayla aynı: sin(azimut)", () => {
    expect(stereoPan(0)).toBeCloseTo(0);
    expect(stereoPan(90)).toBeCloseTo(1);
    expect(stereoPan(-30)).toBeCloseTo(-0.5);
    expect(stereoPan(180)).toBeCloseTo(0); // arka ortaya düşer
  });
});

describe("kanal kazançları", () => {
  const dortlu = hoparlorDuzeni("dortlu");
  const bes = hoparlorDuzeni("5.1");
  const yedi = hoparlorDuzeni("7.1");

  it("enerji korunur (kareler toplamı 1), her düzen, her yön, her yayılım", () => {
    for (const d of SES_DUZENLERI) {
      const duzen = hoparlorDuzeni(d);
      for (let az = -360; az <= 360; az += 7.5) {
        for (const y of [0, 0.35, 1]) expect(enerji(kanalKazanclari(duzen, az, y))).toBeCloseTo(1, 10);
      }
    }
  });

  it("tam hoparlör yönündeki kaynak yalnızca o hoparlörde", () => {
    expect(kanalKazanclari(dortlu, -45)).toEqual([1, 0, 0, 0]);
    expect(kanalKazanclari(dortlu, 135)).toEqual([0, 0, 0, 1]);
    const g = kanalKazanclari(bes, 0);
    expect(g[2]).toBeCloseTo(1);
    expect(enerji(g) - g[2] * g[2]).toBeCloseTo(0);
  });

  it("FL(-45) ile FR(45) arasında 0° → ikisi de 0,7071", () => {
    const g = kanalKazanclari(dortlu, 0);
    expect(g[0]).toBeCloseTo(KOK2);
    expect(g[1]).toBeCloseTo(KOK2);
    expect(g[2]).toBe(0);
    expect(g[3]).toBe(0);
  });

  it("4 kanalda 180° → arka sol ve arka sağ eşit (180 üzerinden sarma)", () => {
    for (const az of [180, -180, 540]) {
      const g = kanalKazanclari(dortlu, az);
      expect(g[2]).toBeCloseTo(KOK2);
      expect(g[3]).toBeCloseTo(KOK2);
      expect(g[0] + g[1]).toBe(0);
    }
  });

  it("ön/arka ayrımı: 30° öndeki hoparlörlerde, 150° arkadakilerde", () => {
    const on = kanalKazanclari(dortlu, 30);
    const arka = kanalKazanclari(dortlu, 150);
    expect(on[0] ** 2 + on[1] ** 2).toBeCloseTo(1);
    expect(on[1]).toBeGreaterThan(on[0]); // sağa yakın
    expect(arka[2] ** 2 + arka[3] ** 2).toBeCloseTo(1);
    expect(arka[3]).toBeGreaterThan(arka[2]);
    // stereo pan yasası ikisini ayırt edemez (sin 30 = sin 150)
    expect(stereoPan(30)).toBeCloseTo(stereoPan(150));
  });

  it("sarma çiftleri: 5.1'de 180° → arka sol/sağ (±110) eşit; 7.1'de 170° → BR ile BL", () => {
    const g = kanalKazanclari(bes, 180);
    expect(g[4]).toBeCloseTo(KOK2);
    expect(g[5]).toBeCloseTo(KOK2);
    const h = kanalKazanclari(yedi, 170);
    expect(h[5]).toBeGreaterThan(h[4]); // BR(150) daha yakın
    expect(h[4]).toBeGreaterThan(0); // BL(-150) sarmanın öbür ucu
    expect(h[4] ** 2 + h[5] ** 2).toBeCloseTo(1);
  });

  it("yayılım 1 → tüm hoparlörler eşit, LFE her zaman 0", () => {
    const g = kanalKazanclari(bes, 37, 1);
    const tam = g.filter((_, i) => i !== 3);
    for (const x of tam) expect(x).toBeCloseTo(1 / Math.sqrt(5));
    for (let az = -180; az < 180; az += 15) {
      for (const y of [0, 0.35, 1]) {
        expect(kanalKazanclari(bes, az, y)[3]).toBe(0);
        expect(kanalKazanclari(yedi, az, y)[3]).toBe(0);
      }
    }
  });

  it("yayılım arada: yönlü bileşen baskın, diğerleri sıfırdan büyük", () => {
    const g = kanalKazanclari(dortlu, 0, 0.35);
    expect(g[0]).toBeGreaterThan(g[2]);
    expect(g[2]).toBeGreaterThan(0);
  });

  it("hedef dizisine ayırmasız yazar", () => {
    const hedef: number[] = [];
    const g = kanalKazanclari(dortlu, 0, 0, hedef);
    expect(g).toBe(hedef);
    expect(hedef).toHaveLength(4);
    kanalKazanclari(dortlu, 135, 0, hedef);
    expect(hedef).toEqual([0, 0, 0, 1]);
  });

  it("ortam (stereo döngü): sol kanal sol hoparlörlere, sağ sağa, orta ikisini yarım; giriş gücü korunur", () => {
    const d = ortamKazanclari(dortlu);
    const beklenen = [
      [KOK2, 0],
      [0, KOK2],
      [KOK2, 0],
      [0, KOK2],
    ];
    d.forEach((k, i) => {
      expect(k[0]).toBeCloseTo(beklenen[i][0]);
      expect(k[1]).toBeCloseTo(beklenen[i][1]);
    });
    const b = ortamKazanclari(bes);
    expect(b[3]).toEqual([0, 0]); // LFE
    expect(b[2][0]).toBeCloseTo(b[0][0] / 2); // orta yarım kazanç
    expect(b[2][0]).toBeCloseTo(b[2][1]);
    for (const k of [0, 1] as const) {
      expect(b.reduce((s, x) => s + x[k] * x[k], 0)).toBeCloseTo(1);
      expect(ortamKazanclari(yedi).reduce((s, x) => s + x[k] * x[k], 0)).toBeCloseTo(1);
    }
  });
});

describe("düzen seçimi", () => {
  it("otomatik: cihazın kanal sayısına göre", () => {
    expect(duzenSec(2)).toBe("stereo");
    expect(duzenSec(1)).toBe("stereo");
    expect(duzenSec(0)).toBe("stereo");
    expect(duzenSec(4)).toBe("dortlu");
    expect(duzenSec(5)).toBe("dortlu");
    expect(duzenSec(6)).toBe("5.1");
    expect(duzenSec(8)).toBe("7.1");
    expect(duzenSec(32)).toBe("7.1");
    expect(duzenSec(Number.NaN)).toBe("stereo");
  });

  it("istenen düzen cihaz destekliyorsa kazanır, desteklemiyorsa otomatik", () => {
    expect(duzenSec(8, "dortlu")).toBe("dortlu");
    expect(duzenSec(8, "stereo")).toBe("stereo");
    expect(duzenSec(6, "5.1")).toBe("5.1");
    expect(duzenSec(6, "7.1")).toBe("5.1");
    expect(duzenSec(2, "5.1")).toBe("stereo");
    expect(duzenSec(4, "7.1")).toBe("dortlu");
    expect(duzenSec(8, null)).toBe("7.1");
  });
});

describe("adres değerleri", () => {
  it("?ses= ayrıştırma ve kısaltmalar", () => {
    expect(sesDuzeniAyristir("5.1")).toBe("5.1");
    expect(sesDuzeniAyristir(" 71 ")).toBe("7.1");
    expect(sesDuzeniAyristir("quad")).toBe("dortlu");
    expect(sesDuzeniAyristir("STEREO")).toBe("stereo");
    expect(sesDuzeniAyristir("otomatik")).toBeNull();
    expect(sesDuzeniAyristir("9.2")).toBeNull();
    expect(sesDuzeniAyristir(null)).toBeNull();
  });

  it("?hoparlor= geçerli değerler (4, 6, 8 kanal)", () => {
    expect(hoparlorAyristir("-45,45,-135,135")).toEqual([-45, 45, -135, 135]);
    expect(hoparlorAyristir("-30, 30, 0, LFE, -110, 110")).toEqual([-30, 30, 0, null, -110, 110]);
    expect(hoparlorAyristir("+20;340;-160;160")).toEqual([20, -20, -160, 160]); // 340 → -20
    expect(hoparlorAyristir("-60,60,-120,180")).toEqual([-60, 60, -120, -180]);
    expect(hoparlorAyristir("-30,30,0,lfe,-150,150,-90,90")).toEqual([-30, 30, 0, null, -150, 150, -90, 90]);
  });

  it("?hoparlor= geçersiz değerler null", () => {
    const kotuler = [
      "",
      "45",
      "a,b",
      "-45,45,lfe,lfe", // iki LFE
      "30,30,-135,135", // aynı yöne iki hoparlör
      "180,-180,45,-45", // 180 ile -180 aynı yön
      "1e3,4,90,-90",
      "0x10,20,90,-90",
      "-45,45,,135",
      "400,10,90,-90",
      "-90,90", // 2 kanal: stereo hoparlör açısı kullanmaz
      "-45,45,180", // 3, 5, 7 kanal hiçbir düzene uymaz
      "-30,30,0,-110,110",
      "-30,30,0,lfe,-150,150,-90",
      "1,2,3,4,5,6,7,8,9",
    ];
    for (const kotu of kotuler) expect(hoparlorAyristir(kotu), kotu).toBeNull();
    expect(hoparlorAyristir(null)).toBeNull();
  });

  it("özel azimutlar yalnızca kanal sayısı tutarsa ve çok kanalda", () => {
    expect(hoparlorDuzeni("dortlu", [-60, 60, -120, 120])).toEqual({ duzen: "dortlu", azimutlar: [-60, 60, -120, 120], ozel: true });
    expect(hoparlorDuzeni("5.1", [-60, 60, -120, 120]).ozel).toBe(false);
    expect(hoparlorDuzeni("stereo", [-90, 90]).ozel).toBe(false);
  });
});

describe("?ses= / ?hoparlor= çözümü (adres > yerel kayıt > otomatik)", () => {
  const depo = (ilk: Record<string, string> = {}): AnahtarDeposu & { veri: Record<string, string> } => {
    const veri = { ...ilk };
    return {
      veri,
      getItem: (k) => veri[k] ?? null,
      setItem: (k, v) => {
        veri[k] = v;
      },
      removeItem: (k) => {
        delete veri[k];
      },
    };
  };

  it("adresteki değer kazanır ve kayda yazılır", () => {
    const d = depo({ ses: "stereo" });
    const a = sesAyariniCoz({ ses: "5.1", hoparlor: "-30,30,0,lfe,-120,120" }, d);
    expect(a).toEqual({ duzen: "5.1", hoparlor: [-30, 30, 0, null, -120, 120], uyarilar: [] });
    expect(d.veri).toEqual({ ses: "5.1", hoparlor: "-30,30,0,lfe,-120,120" });
  });

  it("adres yoksa kayıt, kayıt da yoksa otomatik (null)", () => {
    expect(sesAyariniCoz({ ses: null, hoparlor: null }, depo({ ses: "7.1" })).duzen).toBe("7.1");
    expect(sesAyariniCoz({ ses: null, hoparlor: null }, depo())).toEqual({ duzen: null, hoparlor: null, uyarilar: [] });
    expect(sesAyariniCoz({ ses: null, hoparlor: null }, null).duzen).toBeNull();
  });

  it("otomatik kaydı siler", () => {
    const d = depo({ ses: "5.1", hoparlor: "-45,45,-135,135" });
    expect(sesAyariniCoz({ ses: "otomatik", hoparlor: "otomatik" }, d)).toEqual({ duzen: null, hoparlor: null, uyarilar: [] });
    expect(d.veri).toEqual({});
  });

  it("tanınmayan adres değeri uyarı verir, kayıt geçerli kalır", () => {
    const d = depo({ ses: "dortlu" });
    const a = sesAyariniCoz({ ses: "9.1", hoparlor: "a,b" }, d);
    expect(a.duzen).toBe("dortlu");
    expect(a.hoparlor).toBeNull();
    expect(a.uyarilar).toHaveLength(2);
    expect(d.veri).toEqual({ ses: "dortlu" });
  });

  it("hiçbir düzene uymayan kanal sayısı (3, 5) kayda yazılmaz, eski kayıt kalır", () => {
    for (const kotu of ["-45,45,180", "-30,30,0,-110,110"]) {
      const d = depo({ hoparlor: "-60,60,-120,120" });
      const a = sesAyariniCoz({ ses: null, hoparlor: kotu }, d);
      expect(a.hoparlor).toEqual([-60, 60, -120, 120]);
      expect(a.uyarilar[0]).toContain("4, 6 ya da 8 kanal");
      expect(d.veri).toEqual({ hoparlor: "-60,60,-120,120" });
    }
  });

  it("kayıt erişimi hata verirse (özel pencere) otomatiğe düşer", () => {
    const bozuk: AnahtarDeposu = {
      getItem: () => {
        throw new Error("engelli");
      },
      setItem: () => {
        throw new Error("engelli");
      },
      removeItem: () => {
        throw new Error("engelli");
      },
    };
    expect(sesAyariniCoz({ ses: null, hoparlor: null }, bozuk).duzen).toBeNull();
    expect(sesAyariniCoz({ ses: "dortlu", hoparlor: null }, bozuk).duzen).toBe("dortlu");
  });
});
