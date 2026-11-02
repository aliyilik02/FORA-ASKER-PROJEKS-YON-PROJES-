import { describe, expect, it } from "vitest";
import {
  AraziUfku,
  KAYNAK_UFUK_PAYI,
  KAYNAK_YERDEN_EN_COK,
  VARSAYILAN_PIKSEL_ACISI,
  enYakinParametre,
  izKalinligi,
  izUzunlukCarpani,
  izliKaynakYuksekligi,
  izliYolu,
  kaynakYukseltmesi,
  yakinGecis,
  type IzliYol,
} from "./izliYol";

/** Yatay doğrunun (kaynak → hedef) başlangıca en yakın uzaklığı. */
function yatayYaklasim(y: IzliYol): number {
  const dx = y.hx - y.sx;
  const dz = y.hz - y.sz;
  return Math.abs(y.sx * dz - y.sz * dx) / Math.hypot(dx, dz);
}

/** Orta duvardan (−z) gelen, izleyicinin 10 m önüne düşen mermi. */
const ortaDuvar = (): IzliYol => ({ sx: 0, sy: 1, sz: -200, hx: 0, hy: -1.7, hz: -10 });

describe("izliYolu", () => {
  it("yon 0: doğru değişmez (izleyiciye doğru)", () => {
    expect(izliYolu(ortaDuvar(), 0, 30)).toEqual(ortaDuvar());
  });

  it("+90: izleyicinin eksen mesafesi kadar önünden sağdan sola dik geçer; kaynak uzakta kalır", () => {
    const y = izliYolu(ortaDuvar(), 90, 30);
    expect(yatayYaklasim(y)).toBeCloseTo(30, 5);
    expect(y.hx - y.sx).toBeLessThan(0); // −x: sağdan sola
    expect(Math.abs(y.hz - y.sz)).toBeLessThan(1e-6); // tam yanal
    expect(Math.hypot(y.sx, y.sz)).toBeGreaterThan(150);
    expect(y.sx).toBeGreaterThan(0); // kaynak sağa kaydı
    // Yükseklikler korunur
    expect(y.sy).toBe(1);
    expect(y.hy).toBe(-1.7);
  });

  it("−90: soldan sağa", () => {
    const y = izliYolu(ortaDuvar(), -90, 30);
    expect(yatayYaklasim(y)).toBeCloseTo(30, 5);
    expect(y.hx - y.sx).toBeGreaterThan(0);
  });

  it("ara açıda çapraz geçer: en yakın geçiş eksen mesafesi × sin(yon)", () => {
    const y = izliYolu(ortaDuvar(), 45, 30);
    expect(yatayYaklasim(y)).toBeCloseTo(30 * Math.sin(Math.PI / 4), 5);
    const y20 = izliYolu(ortaDuvar(), 20, 40);
    expect(yatayYaklasim(y20)).toBeCloseTo(40 * Math.sin((20 * Math.PI) / 180), 5);
  });

  it("yan duvarlarda da duvara göre sağdan sola: sağ duvarda (+x) +90 → −z yönü", () => {
    const y = izliYolu({ sx: 220, sy: 1, sz: 0, hx: 8, hy: -1.7, hz: 0 }, 90, 25);
    expect(y.hz - y.sz).toBeLessThan(0);
    expect(Math.abs(y.hx - y.sx)).toBeLessThan(1e-6);
    expect(yatayYaklasim(y)).toBeCloseTo(25, 5);
  });

  it("doğru eksen mesafesine yaklaşmıyorsa hedef etrafında döner", () => {
    const y = izliYolu({ sx: 0, sy: 1, sz: -200, hx: 0, hy: 0, hz: -80 }, 90, 20);
    expect(y.hx).toBeCloseTo(0, 6);
    expect(y.hz).toBeCloseTo(-80, 6);
    expect(yatayYaklasim(y)).toBeCloseTo(80, 5);
  });
});

describe("kaynakYukseltmesi", () => {
  const Z = -1.7;
  const duz = () => Z;
  /** Orta duvar yönünde 135 m'de 15 m'lik geniş sırt (kırsal hibrit arazideki gibi). */
  const sirt = (_x: number, z: number) => Z + 15 * Math.exp(-((-z - 135) ** 2) / (2 * 38 * 38));

  it("düz zeminde 0 (arazi kapalıyken davranış değişmez)", () => {
    for (const sy of [Z + 0.8, Z + 2, Z + 4]) {
      for (const hy of [Z, Z + 1.6, Z + 6]) {
        expect(kaynakYukseltmesi({ sx: 0, sy, sz: -280, hx: 4, hy, hz: -3 }, duz)).toBe(0);
        expect(kaynakYukseltmesi({ sx: 150, sy, sz: -100, hx: -60, hy, hz: -20 }, duz)).toBe(0);
      }
    }
  });

  it("sırt arkasındaki kaynak, mermi sırtı aşacak kadar kalkar; hedef ucu değişmez", () => {
    const y: IzliYol = { sx: 0, sy: sirt(0, -200) + 2, sz: -200, hx: 0, hy: Z, hz: -10 };
    const d = kaynakYukseltmesi(y, sirt);
    expect(d).toBeGreaterThan(5);
    expect(d).toBeLessThan(40);
    // Yükseltilmiş doğru, hedefe 30 m kalana kadar her yerde zeminin üstünde
    for (let f = 0; f <= 0.85; f += 0.01) {
      const z = y.sz + (y.hz - y.sz) * f;
      const h = y.sy + d + (y.hy - (y.sy + d)) * f;
      expect(h).toBeGreaterThan(sirt(0, z));
    }
  });

  it("aşırı yükseltme sınırlanır", () => {
    const dag = () => Z + 500;
    expect(kaynakYukseltmesi({ sx: 0, sy: Z + 2, sz: -200, hx: 0, hy: Z, hz: -10 }, dag)).toBe(80);
    expect(kaynakYukseltmesi({ sx: 0, sy: Z + 2, sz: -200, hx: 0, hy: Z, hz: -10 }, dag, 0.6, 30)).toBe(30);
  });
});

describe("AraziUfku (izleyicinin gözünden arazi ufku, yön kovası başına önbellek)", () => {
  const Z = -1.7;
  const derece = (tan: number) => (Math.atan(tan) * 180) / Math.PI;
  /** 120 m'de 20 m'lik halka sırt. */
  const sirt = (x: number, z: number) => Z + 20 * Math.exp(-((Math.hypot(x, z) - 120) ** 2) / (2 * 15 * 15));

  it("düz zeminde en uzak örnekten (320 m) hafif eksi; sırtta en yüksek yükselme açısı", () => {
    expect(new AraziUfku().tanjant(0, () => Z)).toBeCloseTo(Z / 320, 9);
    // Sırt tepesi 120 m'de 18,3 m göz üstünde: ~8,7°
    expect(derece(new AraziUfku().tanjant(30, sirt))).toBeCloseTo((Math.atan2(18.3, 120) * 180) / Math.PI, 0);
  });

  it("aynı kovada önbellekten; ömür dolunca yeniden örnekler (arazi değişince tazelenir); kovalar ayrı", () => {
    const u = new AraziUfku(2);
    let zemin: (x: number, z: number) => number = () => Z;
    let cagri = 0;
    const sayan = (x: number, z: number) => {
      cagri++;
      return zemin(x, z);
    };
    const duz = u.tanjant(10, sayan);
    const ilk = cagri;
    expect(ilk).toBeGreaterThan(20);
    zemin = sirt;
    expect(u.tanjant(10.5, sayan)).toBe(duz); // aynı 2°'lik kova, ömür dolmadı
    expect(cagri).toBe(ilk);
    expect(u.tanjant(-170, sayan)).toBeGreaterThan(0.1); // başka kova: yeni arazi
    u.ilerlet(2.1);
    expect(u.tanjant(10, sayan)).toBeGreaterThan(0.1);
  });
});

describe("izliKaynakYuksekligi (uzak kaynağın sınırlı yükseltmesi)", () => {
  const Z = -1.7;
  const RAD = Math.PI / 180;
  it("düz zeminde taban aynen (arazi kapalıyken davranış değişmez)", () => {
    for (const sy of [Z + 0.8, Z + 2.5, Z + 4]) {
      const y: IzliYol = { sx: 120, sy, sz: -180, hx: 3, hy: Z, hz: -8 };
      expect(izliKaynakYuksekligi(y, () => Z, Z / 320)).toBe(sy);
    }
  });

  it("sırt arkasında kaynak gerektiği kadar yükselir ama yerden ≤ 12 m ve ufkun ≤ 1,5° üstünde (gökten gelmez)", () => {
    // 100 m'de 30 m'lik sırt, kaynak 220 m'de (yerel zemin düz): araziyi aşmak için ~70 m gerekirdi
    const sirt = (_x: number, z: number) => Z + 30 * Math.exp(-((-z - 100) ** 2) / (2 * 20 * 20));
    const y: IzliYol = { sx: 0, sy: Z + 2, sz: -220, hx: 0, hy: Z, hz: -10 };
    expect(kaynakYukseltmesi(y, sirt)).toBeGreaterThan(40);
    const ufuk = new AraziUfku().tanjant(0, sirt);
    const sy = izliKaynakYuksekligi(y, sirt, ufuk);
    expect(sy - sirt(0, -220)).toBeLessThanOrEqual(KAYNAK_YERDEN_EN_COK + 1e-9);
    expect(sy).toBeGreaterThan(Z + 2); // yine de yükseldi
    expect((Math.atan2(sy, 220) - Math.atan(ufuk)) / RAD).toBeLessThanOrEqual(KAYNAK_UFUK_PAYI + 1e-9);
    // Açı sınırı bağlayıcıysa (ufuk 0° verilir, yerden sınır 12 m daha gevşek): göz hizasının tam 1,5° üstü
    expect(Math.atan2(izliKaynakYuksekligi(y, sirt, 0), 220) / RAD).toBeCloseTo(KAYNAK_UFUK_PAYI, 6);
    // Az yükseltme yetiyorsa o kadar (sınıra kadar çıkmaz)
    const tumsek = (_x: number, z: number) => Z + 3 * Math.exp(-((-z - 150) ** 2) / (2 * 10 * 10));
    const y2: IzliYol = { sx: 0, sy: Z + 1, sz: -220, hx: 0, hy: Z, hz: -10 };
    const gerek = kaynakYukseltmesi(y2, tumsek);
    expect(gerek).toBeGreaterThan(0);
    expect(izliKaynakYuksekligi(y2, tumsek, new AraziUfku().tanjant(0, tumsek))).toBeCloseTo(Z + 1 + gerek, 9);
  });

  it("derin çukurdaki kaynak yerel zeminden 12 m'yi aşmaz (taban düzlem yüksekliğinde verilse de)", () => {
    const cukur = () => Z - 20;
    const y: IzliYol = { sx: 0, sy: Z + 2, sz: -200, hx: 0, hy: Z, hz: -10 };
    expect(izliKaynakYuksekligi(y, cukur, 0)).toBeCloseTo(Z - 20 + KAYNAK_YERDEN_EN_COK, 9);
  });
});

describe("enYakinParametre", () => {
  it("parçanın başa en yakın noktası", () => {
    // (−10, 0, −5) → (10, 0, −5): orta noktada 5 m
    const t = enYakinParametre(-10, 0, -5, 20, 0, 0);
    expect(t).toBeCloseTo(0.5);
    expect(Math.hypot(-10 + 20 * t, 0, -5)).toBeCloseTo(5);
  });
  it("parça dışında kalırsa uca kenetlenir; sıfır uzunlukta 0", () => {
    expect(enYakinParametre(5, 0, -5, 3, 0, 0)).toBe(0);
    expect(enYakinParametre(-30, 0, -5, 10, 0, 0)).toBe(1);
    expect(enYakinParametre(1, 1, 1, 0, 0, 0)).toBe(0);
  });
});

describe("yakinGecis (ses hızı üstü çat)", () => {
  const ADIM = 160 / 60;
  /** 160 m/sn, 60 fps: 200 m'den gelip başın `yan` m yanından/üstünden geçen merminin kareleri. */
  function gecisKareleri(yan: number, yukseklik: number) {
    const sonuc: number[] = [];
    for (let i = 0; i < 100; i++) sonuc.push(yakinGecis(yan, yukseklik, -200 + i * ADIM, 0, 0, ADIM, 6));
    return sonuc;
  }

  it("başın 4 m yanından geçen mermi yanından geçtiği karede çatlar, öncesinde değil", () => {
    const k = gecisKareleri(4, 1);
    const ilk = k.findIndex((t) => t >= 0);
    const z0 = -200 + ilk * ADIM;
    expect(z0).toBeLessThanOrEqual(0);
    expect(z0 + ADIM).toBeGreaterThan(0);
    expect(k[ilk]).toBeLessThan(1);
  });

  it("6 m'den uzak geçen ya da hâlâ yaklaşan mermi çatlamaz", () => {
    expect(gecisKareleri(7, 0).every((t) => t < 0)).toBe(true);
    // Başa doğru gelip karenin sonunda en yakın (yere çarpmadan önceki son kare)
    expect(yakinGecis(0, -1.5, -10, 0, 0, 7, 6)).toBe(-1);
  });

  it("en yakın nokta tam kare sınırındaysa sonraki karenin başında (t = 0) yakalanır", () => {
    expect(yakinGecis(3, 0, -2, 0, 0, 2, 6)).toBe(-1); // bu kare z=0'da biter: yaklaşıyor
    expect(yakinGecis(3, 0, 0, 0, 0, 2, 6)).toBe(0); // sonraki kare uzaklaşıyor
  });
});

describe("iz görünürlüğü", () => {
  it("1080p duvarda uzak iz en az 1,5 piksel, yakında temel kalınlık", () => {
    expect(izKalinligi(10, 0.04, VARSAYILAN_PIKSEL_ACISI)).toBe(0.04);
    for (const d of [5, 30, 80, 150, 300, 400]) {
      const k = izKalinligi(d, 0.04, VARSAYILAN_PIKSEL_ACISI);
      expect(k / d / VARSAYILAN_PIKSEL_ACISI).toBeGreaterThanOrEqual(1.5 - 1e-9);
    }
    // 300 m'de ~0,42 m (1,5 px × 0,054°)
    expect(izKalinligi(300, 0.04, VARSAYILAN_PIKSEL_ACISI)).toBeCloseTo(0.424, 2);
  });

  it("uzunluk kalınlıkla biraz uzar, en çok 2,2 kat", () => {
    expect(izUzunlukCarpani(1)).toBe(1);
    expect(izUzunlukCarpani(0.5)).toBe(1);
    expect(izUzunlukCarpani(4)).toBeCloseTo(1.36);
    expect(izUzunlukCarpani(50)).toBe(2.2);
  });
});
