/** Yürünebilir zemin: engel ızgarası, yol bulma (engelin çevresinden), siper yerleri, izleyici görüşü. */
import { describe, expect, it } from "vitest";
import { YurunebilirZemin, type EngelKutusu, type Nokta } from "./yurunebilir";

/** İzleyicinin 8 m önünde, 8 m genişliğinde 1 m boyunda bariyer; 14 m ötede 10 m boyunda bina. */
const BARIYER: EngelKutusu = { minX: -4, maxX: 4, minZ: -8.4, maxZ: -7.6, boy: 1 };
const BINA: EngelKutusu = { minX: -5, maxX: 5, minZ: -20, maxZ: -14, boy: 10 };
const kur = (kutular: EngelKutusu[] = [BARIYER, BINA], su: ((x: number, z: number) => boolean) | null = null, zemin: ((x: number, z: number) => number) | null = null) =>
  new YurunebilirZemin(kutular, su, zemin);

const icinden = (yol: Nokta[], bas: Nokta, k: EngelKutusu, pay = 0.2): boolean => {
  let p = bas;
  for (const q of yol) {
    const d = Math.hypot(q.x - p.x, q.z - p.z);
    for (let t = 0; t <= d; t += 0.1) {
      const x = p.x + ((q.x - p.x) * t) / d;
      const z = p.z + ((q.z - p.z) * t) / d;
      if (x > k.minX - pay && x < k.maxX + pay && z > k.minZ - pay && z < k.maxZ + pay) return true;
    }
    p = q;
  }
  return false;
};

describe("yürünebilir zemin", () => {
  it("engelin içi ve beden payı yürünmez; izleyicinin çevresi ve arka sektör yasak", () => {
    const z = kur();
    expect(z.bos(0, -8)).toBe(false); // bariyerin içi
    expect(z.bos(0, -7.25)).toBe(false); // bariyere sürtünür (< 0,42 m)
    expect(z.bos(0, -6.5)).toBe(true);
    expect(z.bos(0, -2)).toBe(false); // oda
    expect(z.bos(0, -5)).toBe(true);
    expect(z.bos(0, 8)).toBe(false); // izleyicinin arkası (duvar yok)
    expect(z.bos(8, 0.2)).toBe(true); // yan duvar önü
    expect(z.katiMi(0, -8)).toBe(true);
    expect(z.engelBoyu(0, -8)).toBe(1);
    expect(z.engelBoyu(0, -17)).toBe(10);
    expect(z.aciklik(0, -6)).toBeGreaterThan(1);
  });

  it("açık hatta tek noktalı yol; engel varsa çevresinden dolanır ve içinden geçmez", () => {
    const z = kur();
    const duz = z.yolBul({ x: -6, z: -5 }, { x: 6, z: -5 })!;
    expect(duz.length).toBe(1);
    expect(duz[0]).toEqual({ x: 6, z: -5 });
    // Bariyerin önünden arkasına (derinlemesine): düz hat bariyerden geçer, yol ucundan dolanır
    const bas = { x: 0, z: -6 };
    const son = { x: 0, z: -10.5 };
    expect(z.duzYol(bas, son)).toBe(false);
    const yol = z.yolBul(bas, son)!;
    expect(yol).not.toBeNull();
    expect(yol.length).toBeGreaterThan(1);
    expect(yol[yol.length - 1]).toEqual(son);
    expect(icinden(yol, bas, BARIYER)).toBe(false);
    // Dolanma makul: bariyerin yarı boyu (4 m) + pay kadar yana açılır
    const uzunluk = YurunebilirZemin.yolUzunlugu(bas, yol);
    expect(uzunluk).toBeGreaterThan(9);
    expect(uzunluk).toBeLessThan(16);
  });

  it("duran figürün çevresinden dolanır; uç noktadaki figür yolu kapatmaz", () => {
    const z = kur([]);
    const bas = { x: -5, z: -6 };
    const son = { x: 5, z: -6 };
    const figur = { x: 0, z: -6, r: 0.8 };
    expect(z.duzYol(bas, son, [figur])).toBe(false);
    const yol = z.yolBul(bas, son, [figur])!;
    expect(yol.length).toBeGreaterThan(1);
    let p: Nokta = bas;
    let enYakin = Infinity;
    for (const q of yol) {
      for (let t = 0; t <= 1; t += 0.02) enYakin = Math.min(enYakin, Math.hypot(p.x + (q.x - p.x) * t - figur.x, p.z + (q.z - p.z) * t - figur.z));
      p = q;
    }
    expect(enYakin).toBeGreaterThan(0.55);
    // Varış noktasının dibindeki figür (yaralının başına giden sıhhiyeci) aramayı kilitlemez
    expect(z.yolBul(bas, { x: 0.3, z: -6 }, [figur])).not.toBeNull();
  });

  it("kapalı avluya yol yok; yürünmez varış en yakın yürünür hücreye çekilir", () => {
    // Dört duvarla çevrili avlu (iç 4 × 4 m)
    const avlu: EngelKutusu[] = [
      { minX: 8, maxX: 14, minZ: -16, maxZ: -15, boy: 3 },
      { minX: 8, maxX: 14, minZ: -10, maxZ: -9, boy: 3 },
      { minX: 8, maxX: 9, minZ: -16, maxZ: -9, boy: 3 },
      { minX: 13, maxX: 14, minZ: -16, maxZ: -9, boy: 3 },
    ];
    const z = kur(avlu);
    expect(z.bos(11, -12.5)).toBe(true);
    expect(z.yolBul({ x: 0, z: -6 }, { x: 11, z: -12.5 })).toBeNull();
    // Varış duvarın içinde: dışındaki en yakın hücreye
    const yol = z.yolBul({ x: 0, z: -6 }, { x: 8.4, z: -8.8 })!;
    expect(yol).not.toBeNull();
    const son = yol[yol.length - 1];
    expect(z.bos(son.x, son.z)).toBe(true);
    expect(Math.hypot(son.x - 8.4, son.z + 8.8)).toBeLessThan(1.6);
  });

  it("su ve dik yamaç yürünmez", () => {
    const dere = (x: number, zz: number) => Math.abs(zz + 12) < 1 && Math.abs(x) < 30;
    const z = kur([], dere);
    expect(z.bos(0, -12)).toBe(false);
    expect(z.yolBul({ x: 0, z: -6 }, { x: 0, z: -16 })).toBeNull(); // dere bütün ızgarayı keser
    // 45°'den dik basamak (2 m'de 3 m yükselir): basamak hücreleri katı, düzlük yürünür
    const yamac = (x: number, zz: number) => (zz < -15 ? 3 : zz < -13 ? ((-13 - zz) / 2) * 3 : 0);
    const y = kur([], null, yamac);
    expect(y.bos(0, -14)).toBe(false);
    expect(y.bos(0, -10)).toBe(true);
    expect(y.bos(0, -18)).toBe(true);
    // Hafif eğim (10 m'de 2 m) yürünür
    const hafif = kur([], null, (_x, zz) => -zz * 0.2);
    expect(hafif.bos(0, -14)).toBe(true);
  });

  it("siper yerleri: alçak engelin düşmana göre arkası; yüksek duvarın dibi siper değil", () => {
    const z = kur();
    // Düşman önde (azimut 0 = −z): bariyerin izleyici tarafı siper
    const on = z.siperler(0);
    expect(on.length).toBeGreaterThan(8);
    for (const s of on) {
      expect(z.bos(s.x, s.z)).toBe(true);
      expect(s.boy).toBe(1);
      expect(s.z).toBeGreaterThan(-7.6);
      expect(s.z).toBeLessThan(-5.5);
      expect(Math.abs(s.x)).toBeLessThan(4.6);
    }
    // Binanın önü (10 m duvar) listede yok
    expect(on.some((s) => s.z < -9)).toBe(false);
    // Düşman arkada (azimut 180): bariyerin öte yanı siper olur
    const arka = z.siperler(180);
    expect(arka.length).toBeGreaterThan(8);
    expect(arka.every((s) => s.z < -8.4 && s.z > -10.6)).toBe(true);
    // Aynı dilim önbellekten (aynı dizi)
    expect(z.siperler(2)).toBe(on);
  });

  it("izleyici görüşü: alçak bariyerin arkası görünür, binanın arkası görünmez", () => {
    const z = kur();
    expect(z.izleyiciGorur(0, -10.5)).toBe(true);
    expect(z.izleyiciGorur(0, -24)).toBe(false);
    expect(z.izleyiciGorur(12, -24)).toBe(true); // binanın yanından
  });

  it("harita ve özet tanı çıktısı", () => {
    const z = kur();
    const o = z.ozet();
    expect(o.kati).toBeGreaterThan(200);
    expect(o.yurunur).toBeGreaterThan(5000);
    const h = z.harita([{ x: 0, z: -6, harf: "A" }], 2, 10);
    expect(h.some((s) => s.includes("A"))).toBe(true);
    expect(h.some((s) => s.includes("="))).toBe(true);
    expect(h.some((s) => s.includes("#"))).toBe(true);
  });
});
