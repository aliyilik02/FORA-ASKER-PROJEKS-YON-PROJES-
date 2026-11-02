/**
 * Klasik izli mermi akışı (CatismaSistemi.izliAtis) ve düşman ateşi istatistikleri: sahte parçacık sistemi ve seslerle,
 * tohumlu rastgelelik (her çalıştırmada aynı atışlar). İç yöntemler (izEkle, carpma, catlamaDenetle) ve yeniden
 * kullanılan yol nesnesi (yol) örnek üzerinde sarılıp okunur: doğan izler, son hedef, çarpmalar ve "çat"ların hangi ize
 * ait olduğu sayılır (yeniden adlandırılırlarsa test açıkça düşer).
 *  - Kaynak azimutu yöne göre: 0'da seçilen duvarın ortası (±10°); ±90'da komşu duvarın yönü, mermiler seçilen duvarın
 *    10–60 m önünden yandan geçer (kullanıcı kararı: yandan ateş böyle görünür).
 *  - 26 m içi çarpma (yakın zemin payı %20), iz başına en çok bir "çat", izli akışın sesleri ≤ ~1,5/sn (sekmeleri
 *    dâhil; görüntü aynı).
 *  - Engebeli arazide uzak kaynak yerden ≤ 12 m ve o yöndeki arazi ufkunun ≤ ~2° üstünde (izli akış, düşman ateşi).
 *  - Hedef yüksekliği döndürülmüş noktanın zemininden: eğimli arazide yandan geçen merminin hedefi kendi zemininin
 *    ofset kadar üstünde.
 */
import { Vector3 } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CatismaSistemi, type CatismaSesleri } from "./catisma";
import type { IzliYol } from "./izliYol";
import type { ParcacikSistemi } from "./parcaciklar";
import { yerKonumu, zeminFonksiyonu, zeminY } from "./uzay";

/** Tekrarlanabilir rastgelelik (mulberry32). */
function tohumluRastgele(tohum: number): () => number {
  let a = tohum >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Çizim yok: parçacık sistemi yerine boş yöntemler. */
const PARCACIKLAR = { parlama: () => undefined, duman: { ekle: () => undefined }, kivilcim: { ekle: () => undefined } } as unknown as ParcacikSistemi;

interface IcIz {
  p: Vector3;
  v: Vector3;
  dost: boolean;
  sekti: boolean;
  catladi: boolean;
}
interface IcSistem {
  izEkle(p: Vector3, v: Vector3, dost: boolean, sekti?: boolean, izli?: boolean): void;
  carpma(iz: IcIz): void;
  catlamaDenetle(iz: IcIz, x0: number, y0: number, z0: number): void;
  eklenecek: IcIz[];
  yol: IzliYol;
}
/** Doğan düşman/izli izi: kaynak, hız ve (izli akışta) son hedef (döndürülmüş, zemin eklenmiş). */
interface Dogan {
  p: Vector3;
  v: Vector3;
  hedef: { x: number; y: number; z: number };
}

/** Sistemi kurar; iç yöntemleri sayaçlarla sarar. */
function kur(dostlar: Vector3[] = []) {
  const s = { dogan: [] as Dogan[], ses: 0, cat: 0, fazlaCat: 0, yakinCarpma: 0 };
  const catSayisi = new Map<IcIz, number>();
  let catlayan: IcIz | null = null;
  const sesler: CatismaSesleri = {
    carpma: () => {
      s.ses++;
      if (!catlayan) return;
      // "Çat" (catlamaDenetle içinden): iz başına sayılır
      s.cat++;
      const n = (catSayisi.get(catlayan) ?? 0) + 1;
      catSayisi.set(catlayan, n);
      if (n > 1) s.fazlaCat++;
    },
    atis: () => undefined,
  };
  const sistem = new CatismaSistemi(PARCACIKLAR, sesler);
  sistem.dostlar = () => dostlar;
  const ic = sistem as unknown as IcSistem;
  const izEkle = ic.izEkle.bind(sistem);
  ic.izEkle = (p, v, dost, sekti = false, izli = false) => {
    izEkle(p, v, dost, sekti, izli);
    catSayisi.delete(ic.eklenecek[ic.eklenecek.length - 1]); // havuzdan dönen nesne yeni bir iz
    if (!dost && !sekti) s.dogan.push({ p: p.clone(), v: v.clone(), hedef: { x: ic.yol.hx, y: ic.yol.hy, z: ic.yol.hz } });
  };
  const catla = ic.catlamaDenetle.bind(sistem);
  ic.catlamaDenetle = (iz, x0, y0, z0) => {
    catlayan = iz;
    catla(iz, x0, y0, z0);
    catlayan = null;
  };
  const carp = ic.carpma.bind(sistem);
  ic.carpma = (iz) => {
    if (iz.p.length() < 26) s.yakinCarpma++;
    carp(iz);
  };
  return { sistem, s };
}

/** `sure` saniye, 60 kare/sn. */
function calistir(sistem: CatismaSistemi, sure: number) {
  for (let i = 0; i < sure * 60; i++) sistem.guncelle(1 / 60);
}
const azimut = (x: number, z: number) => (Math.atan2(x, -z) * 180) / Math.PI;
/** İki azimut arasındaki açı (0..180°). */
const aciFarki = (a: number, b: number) => Math.abs(((((a - b) % 360) + 540) % 360) - 180);
const yuzdelik = (d: number[], f: number) => [...d].sort((a, b) => a - b)[Math.floor(f * (d.length - 1))];
/** İzin yatayda izleyiciye en yakın geçişi (yatay hareket doğrusal): uzaklık ve azimut; geçiş önde değilse null. */
function gecis(d: Dogan): { m: number; az: number } | null {
  const t = -(d.p.x * d.v.x + d.p.z * d.v.z) / (d.v.x * d.v.x + d.v.z * d.v.z);
  if (t <= 0) return null;
  const x = d.p.x + d.v.x * t;
  const z = d.p.z + d.v.z * t;
  return { m: Math.hypot(x, z), az: azimut(x, z) };
}

beforeEach(() => {
  vi.spyOn(Math, "random").mockImplementation(tohumluRastgele(11));
});
afterEach(() => {
  vi.restoreAllMocks();
  zeminFonksiyonu(null);
});

describe("izli mermi akışı: yön, kaynak ve geçiş (düz zemin)", () => {
  it("yön 0: kaynak seçilen duvarın ortası yönünde (±10°), mermiler izleyiciye doğru gelir", () => {
    for (const duvar of [-90, 0, 90]) {
      const { sistem, s } = kur();
      sistem.izliAyarla({ aktif: true, azimut: duvar, yon: 0, siklik: 10 });
      calistir(sistem, 12);
      expect(s.dogan.length).toBeGreaterThan(100);
      for (const d of s.dogan) expect(aciFarki(azimut(d.p.x, d.p.z), duvar)).toBeLessThanOrEqual(10.5);
      const gecisler = s.dogan.map(gecis).filter((g) => g !== null);
      expect(yuzdelik(gecisler.map((g) => g.m), 0.9)).toBeLessThan(30);
    }
  });

  // [seçilen duvar, yön, kaynak azimutu ortancası aralığı, geçişin duvarı (azimut aralığı)]
  const yandan: Array<[number, number, [number, number], [number, number]]> = [
    [0, 90, [65, 90], [-45, 45]],
    [0, -90, [-90, -65], [-45, 45]],
    [90, -90, [0, 30], [45, 135]],
    [-90, 90, [-30, 0], [-135, -45]],
  ];
  for (const [duvar, yon, kaynakAraligi, gecisDuvari] of yandan) {
    it(`duvar ${duvar}°, yön ${yon}°: mermiler komşu duvar yönünden gelip seçilen duvarın 10–60 m önünden yandan geçer`, () => {
      const { sistem, s } = kur();
      sistem.izliAyarla({ aktif: true, azimut: duvar, yon, siklik: 10 });
      calistir(sistem, 30);
      expect(s.dogan.length).toBeGreaterThan(250);
      const kaynak = yuzdelik(
        s.dogan.map((d) => azimut(d.p.x, d.p.z)),
        0.5,
      );
      expect(kaynak).toBeGreaterThan(kaynakAraligi[0]);
      expect(kaynak).toBeLessThan(kaynakAraligi[1]);
      const gecisler = s.dogan.map(gecis).filter((g) => g !== null);
      expect(gecisler.length).toBeGreaterThan(0.95 * s.dogan.length);
      expect(yuzdelik(gecisler.map((g) => g.m), 0.1)).toBeGreaterThan(10);
      expect(yuzdelik(gecisler.map((g) => g.m), 0.9)).toBeLessThan(60);
      for (const f of [0.05, 0.95]) {
        const az = yuzdelik(gecisler.map((g) => g.az), f);
        expect(az).toBeGreaterThan(gecisDuvari[0]);
        expect(az).toBeLessThan(gecisDuvari[1]);
      }
      // Yandan geçen mermi yakına çarpmaz
      expect(s.yakinCarpma).toBeLessThan(0.02 * s.dogan.length);
    });
  }
});

describe("izli mermi akışı: yakın çarpma, 'çat' ve ses sınırı", () => {
  it("varsayılan sıklıkta (3/sn, yön 0) yakın (26 m) çarpma saniyede ~0,3–1 (yakın zemin payı %20; önce ~2,6); sesler ≤ 1,5/sn", () => {
    const { sistem, s } = kur();
    sistem.izliAyarla({ aktif: true, azimut: 0, yon: 0, siklik: 3 });
    calistir(sistem, 60);
    expect(s.yakinCarpma / 60).toBeGreaterThan(0.3);
    expect(s.yakinCarpma / 60).toBeLessThan(1);
    expect(s.ses).toBeLessThanOrEqual(1.5 * 60 + 2);
  });

  it("yoğun akışta (20/sn) çarpma/'çat' sesi saniyede en çok ~1,5 (jeton kovası), çarpmalar (görüntü) azalmaz", () => {
    const { sistem, s } = kur();
    sistem.izliAyarla({ aktif: true, azimut: 0, yon: 0, siklik: 20 });
    calistir(sistem, 30);
    expect(s.ses).toBeLessThanOrEqual(1.5 * 30 + 2);
    expect(s.ses).toBeGreaterThan(1.2 * 30); // sınıra dayanır
    expect(s.yakinCarpma).toBeGreaterThan(1.5 * s.ses);
  });

  it("yakın çarpmadan doğan sekme izli akışın işaretini taşır (sesi de sınıra tabi); düşman ateşinin sekmesi sınırsız", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1); // sekme olasılığı (< 0,3) tutar
    const { sistem } = kur();
    const ic = sistem as unknown as IcSistem & { eklenecek: Array<IcIz & { izli: boolean }> };
    for (const izli of [true, false]) {
      ic.izEkle(new Vector3(2, -1.7, -8), new Vector3(0, -20, 150), false, false, izli);
      const iz = ic.eklenecek.pop()!;
      ic.carpma(iz);
      const sekme = ic.eklenecek[ic.eklenecek.length - 1];
      expect(sekme.sekti).toBe(true);
      expect(sekme.izli).toBe(izli);
    }
  });

  it("figürler varken: başın yanından geçenler 'çat'lar, iz başına en çok bir kez", () => {
    const dostlar = [yerKonumu(-15, 6), yerKonumu(0, 7), yerKonumu(20, 5)];
    const { sistem, s } = kur(dostlar);
    sistem.izliAyarla({ aktif: true, azimut: 0, yon: 0, siklik: 3 });
    calistir(sistem, 60);
    expect(s.cat).toBeGreaterThan(5);
    expect(s.fazlaCat).toBe(0);
    expect(s.ses).toBeLessThanOrEqual(1.5 * 60 + 2);
  });
});

describe("engebeli arazide uzak kaynak: yerden ≤ 12 m, arazi ufkunun ≤ ~2° üstünde (gökten gelmez)", () => {
  /** Dağlık gibi: 125 m'de 20 m'lik halka sırt, solda 25 m'de 8 m'lik tepe, dalgalı zemin; izleyici çevresi düz. */
  const engebe = (x: number, z: number) => {
    const r = Math.hypot(x, z);
    const sirt = 20 * Math.exp(-((r - 125) ** 2) / (2 * 25 * 25));
    const tepe = 8 * Math.exp(-((x + 25) ** 2 + z * z) / (2 * 8 * 8));
    const dalga = 6 * Math.sin(x / 37) * Math.cos(z / 29);
    return (sirt + tepe + dalga) * Math.min(1, Math.max(0, (r - 9) / 17));
  };
  /** Gözden (y = 0) o yöndeki arazi ufku (derece): 20–320 m'de zeminin en büyük yükselme açısı. */
  const ufuk = (az: number) => {
    const a = (az * Math.PI) / 180;
    let enCok = -90;
    for (let d = 20; d <= 320; d += 5) enCok = Math.max(enCok, (Math.atan2(zeminY(Math.sin(a) * d, -Math.cos(a) * d), d) * 180) / Math.PI);
    return enCok;
  };
  function denetle(s: { dogan: Dogan[] }) {
    expect(s.dogan.length).toBeGreaterThan(50);
    const ustu: number[] = [];
    for (const d of s.dogan) {
      expect(d.p.y - zeminY(d.p.x, d.p.z)).toBeLessThanOrEqual(12 + 1e-6);
      ustu.push((Math.atan2(d.p.y, Math.hypot(d.p.x, d.p.z)) * 180) / Math.PI - ufuk(azimut(d.p.x, d.p.z)));
    }
    expect(yuzdelik(ustu, 0.9)).toBeLessThan(2);
  }

  for (const [duvar, yon] of [
    [-90, 0],
    [0, 0],
    [90, 0],
    [0, 60],
  ]) {
    it(`izli akış, duvar ${duvar}°, yön ${yon}°`, () => {
      zeminFonksiyonu(engebe);
      const { sistem, s } = kur();
      sistem.izliAyarla({ aktif: true, azimut: duvar, yon, siklik: 10 });
      calistir(sistem, 15);
      denetle(s);
    });
  }

  for (const cephe of [-60, 0]) {
    it(`düşman ateşi (çatışma), cephe ${cephe}°`, () => {
      zeminFonksiyonu(engebe);
      const { sistem, s } = kur();
      sistem.catismaAyarla({ aktif: true, siddet: 1, azimut: cephe, dostAtes: false });
      calistir(sistem, 40);
      denetle(s);
    });
  }
});

describe("kaynak sınırlı yükselince doğru kapalı kalırsa mermi yamaca çarpar (tepenin içinden geçmez)", () => {
  it("derin vadideki uzak kaynak: mermiler yükselerek gelir, vadinin yamacına çarpar; hiçbiri arazinin içinden akmaz", () => {
    // 150 m'den ötesi 14 m çukur vadi, 130–150 m'de dik yamaç: kaynak yerden en çok 12 m, göz hizasının altında kalır
    const vadi = (x: number, z: number) => -14 * Math.min(1, Math.max(0, (Math.hypot(x, z) - 130) / 20));
    zeminFonksiyonu(vadi);
    const { sistem, s } = kur();
    const carpanlar: number[] = [];
    const ic = sistem as unknown as IcSistem & { izler: IcIz[] };
    const carp = ic.carpma.bind(sistem);
    ic.carpma = (iz) => {
      if (!iz.sekti) carpanlar.push(Math.hypot(iz.p.x, iz.p.z));
      carp(iz);
    };
    sistem.izliAyarla({ aktif: true, azimut: 0, yon: 0, siklik: 10 });
    let icinde = 0;
    for (let i = 0; i < 15 * 60; i++) {
      sistem.guncelle(1 / 60);
      for (const iz of ic.izler) if (!iz.dost && !iz.sekti && iz.p.y < zeminY(iz.p.x, iz.p.z) - 0.05) icinde++;
    }
    expect(s.dogan.length).toBeGreaterThan(100);
    // Kaynak gökyüzüne kaldırılmadı (yerden ≤ 12 m): doğru yamaçla kapalı, mermiler yükselerek gelir
    for (const d of s.dogan) {
      expect(d.p.y - zeminY(d.p.x, d.p.z)).toBeLessThanOrEqual(12 + 1e-6);
      expect(d.v.y).toBeGreaterThan(0);
    }
    expect(icinde).toBe(0);
    const yamacta = carpanlar.filter((m) => m > 125 && m < 150).length;
    expect(yamacta).toBeGreaterThan(0.8 * s.dogan.length);
  });
});

describe("izli akışta hedef yüksekliği döndürülmüş noktanın zemininden", () => {
  it("eğimli arazide (yan duvara doğru yükselen) yandan geçen merminin hedefi kendi zemininin ofset kadar üstünde", () => {
    // 0,15 eğim: döndürme hedefi 30–70 m yana taşır, eski hesap (döndürmeden önceki zemin) 5–10 m şaşardı
    zeminFonksiyonu((x) => 0.15 * x);
    for (const yon of [-90, 90, 45]) {
      const { sistem, s } = kur();
      sistem.izliAyarla({ aktif: true, azimut: 0, yon, siklik: 10 });
      calistir(sistem, 10);
      expect(s.dogan.length).toBeGreaterThan(80);
      // Ofset: hedef türü (0 | üstten geçen 1,5–6) + yandan geçiş payı (|yön|/90 · 1,2–4,5)
      const enAz = (Math.abs(yon) / 90) * 1.2;
      for (const d of s.dogan) {
        const ofset = d.hedef.y - zeminY(d.hedef.x, d.hedef.z);
        expect(ofset).toBeGreaterThanOrEqual(enAz - 1e-6);
        expect(ofset).toBeLessThanOrEqual(6 + 4.5 + 1e-6);
      }
    }
  });
});
