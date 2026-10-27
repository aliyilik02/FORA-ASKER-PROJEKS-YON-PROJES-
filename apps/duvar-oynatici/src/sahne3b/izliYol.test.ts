import { describe, expect, it } from "vitest";
import { VARSAYILAN_PIKSEL_ACISI, enYakinParametre, izKalinligi, izUzunlukCarpani, izliYolu, kaynakYukseltmesi, yakinGecis, type IzliYol } from "./izliYol";

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
