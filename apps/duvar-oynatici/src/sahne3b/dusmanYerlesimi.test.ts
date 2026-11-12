/** Düşman atıcılarının mevzi seçimi ve kalıcılığı (dusmanYerlesimi.ts saf hesap + dusman.ts atıcı durumu, modelsiz). */
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { DusmanKatmani, type DusmanMevzisi } from "./dusman";
import { aciFarki, acikAraziMevzileriBul, araziMevzileriBul, aticiSayisi, izliAticiSayisi, koniAdaylari, mevziSec, type MevziKonumu } from "./dusmanYerlesimi";
import { ZEMIN_Y } from "./uzay";

const konum = (no: number, x: number, z: number): MevziKonumu => ({ no, x, z, azimut: (Math.atan2(x, -z) * 180) / Math.PI, mesafe: Math.hypot(x, z) });

describe("mevzi seçimi (saf)", () => {
  it("açı farkı ±180 aralığında, sarmalı doğru", () => {
    expect(aciFarki(170, -170)).toBeCloseTo(-20);
    expect(aciFarki(-10, 20)).toBeCloseTo(-30);
  });

  it("koni: yön, açı, taraf ve en az mesafe süzgeci", () => {
    const m = [konum(0, -9, -30), konum(1, 9, -30), konum(2, 2, -8), konum(3, 60, -5)];
    expect(koniAdaylari(m, 0, 30).map((k) => k.no)).toEqual([0, 1]);
    expect(koniAdaylari(m, 0, 30, 1).map((k) => k.no)).toEqual([1]);
    expect(koniAdaylari(m, 85, 30).map((k) => k.no)).toEqual([3]);
  });

  it("atıcı sayısı şiddetle 2–4, izli makineli 1–2", () => {
    expect([0, 0.5, 1].map(aticiSayisi)).toEqual([2, 3, 4]);
    expect([1, 3, 6].map(izliAticiSayisi)).toEqual([1, 1, 2]);
  });

  it("yeni mevzi dolu olanlardan ayrık seçilir, az önce bırakılan başka aday varken seçilmez", () => {
    const bos = [konum(1, -9, -32), konum(2, 9, -40), konum(3, -9, -34)];
    const dolu = [konum(0, -9, -30)];
    for (let i = 0; i < 30; i++) expect(mevziSec(bos, dolu, null, Math.random)!.no).toBe(2);
    for (let i = 0; i < 30; i++) expect(mevziSec(bos, [], 2, Math.random)!.no).not.toBe(2);
    expect(mevziSec([bos[1]], [], 2, Math.random)!.no).toBe(2);
    expect(mevziSec([], dolu, null, Math.random)).toBeNull();
  });
});

const MEVZILER: DusmanMevzisi[] = [
  { x: -10, y: 6, z: -30 },
  { x: 10, y: 6, z: -36 },
  { x: -10, y: 9, z: -55 },
  { x: 10, y: 9, z: -60 },
  { x: 0, y: 20, z: -97 },
  { x: -20, y: 5, z: 4 },
];

function kur() {
  const d = new DusmanKatmani();
  d.mevzileriAyarla(MEVZILER);
  return d;
}

/** Salvo iste, atışları bildir, atıcı çökene kadar ilerlet. */
function salvo(d: DusmanKatmani, azimut = 0, siddet = 0.5) {
  const a = d.aticiIste(azimut, 30, 0, "salvo", siddet);
  if (a && a !== "sustu") for (let i = 0; i < 4; i++) d.atisOldu(a.no);
  for (let i = 0; i < 40; i++) d.guncelle(0.05);
  return a;
}

describe("düşman atıcıları", () => {
  it("o yönde mevzi yoksa null; varsa namlu mevzinin ateş noktası", () => {
    const d = kur();
    expect(d.aticiIste(180, 30, 0, "salvo", 0.5)).toBeNull();
    const a = d.aticiIste(-90, 30, 0, "salvo", 0.5);
    expect(a).not.toBeNull();
    if (!a || a === "sustu") throw new Error("atıcı yok");
    expect(a.konum.distanceTo(new THREE.Vector3(-20, ZEMIN_Y + 5, 4))).toBeLessThan(1e-6);
    expect(a.hazir).toBe(true); // siluetsiz mevzi doğrulmayı beklemez
  });

  it("aynı anda mevzi tutan atıcı sayısı şiddete göre sınırlı; atıcılar sırayla ateş eder", () => {
    const d = kur();
    const kullanilan = new Set<number>();
    for (let i = 0; i < 6; i++) {
      salvo(d, 0, 0);
      for (const x of d.durum()) kullanilan.add(x.mevzi);
      expect(d.durum().filter((x) => x.kanal === "salvo").length).toBeLessThanOrEqual(2);
    }
    // Şiddet 0: iki atıcı; 6 salvoda (her atıcı en az 3 salvo kalır) en çok 4 ayrı mevzi görülür
    expect(kullanilan.size).toBeGreaterThanOrEqual(2);
    expect(kullanilan.size).toBeLessThanOrEqual(4);
  });

  it("atıcı 3–6 salvodan sonra mevziyi bırakır, yerine başka mevzide atıcı gelir", () => {
    const d = kur();
    const gorulen = new Set<number>();
    for (let i = 0; i < 40; i++) {
      salvo(d, 0, 0);
      for (const x of d.durum()) gorulen.add(x.mevzi);
    }
    // 40 salvo, iki atıcı, atıcı başına ≤ 6 salvo: konideki beş mevzinin çoğu kullanılmış olmalı
    expect(gorulen.size).toBeGreaterThanOrEqual(4);
    expect(gorulen.has(5)).toBe(false); // koni dışındaki (sol duvar) mevzi kullanılmaz
  });

  it("patlama yakındaki mevzileri susturur; hepsi susunca 'sustu', süre dolunca yeniden ateş", () => {
    const d = kur();
    salvo(d);
    // Zemindeki patlama 16 m'den yüksek mevziyi (kule tepesi, 20 m) susturmaz; 6 m yukarıdaki hepsini
    expect(d.patlamaOldu(new THREE.Vector3(0, ZEMIN_Y, -45), 200)).toBe(MEVZILER.length - 1);
    expect(d.patlamaOldu(new THREE.Vector3(0, ZEMIN_Y + 6, -45), 200)).toBe(MEVZILER.length);
    expect(d.aticiIste(0, 30, 0, "salvo", 0.5)).toBe("sustu");
    expect(d.durum().every((x) => x.yukselme === 0 || x.kanal !== "salvo")).toBe(true);
    for (let i = 0; i < 50 * 20; i++) d.guncelle(0.05); // 50 sn
    expect(d.aticiIste(0, 30, 0, "salvo", 0.5)).not.toBe("sustu");
  });

  it("baskı altındaki atıcı ateş edemez; tek atıcı baskıdaysa 'sustu'", () => {
    const d = new DusmanKatmani();
    d.mevzileriAyarla([MEVZILER[0]]);
    const a = d.aticiIste(-18, 30, 0, "salvo", 0.5);
    if (!a || a === "sustu") throw new Error("atıcı yok");
    d.baskila(a.konum.clone(), 1.5, 3);
    expect(d.atisOldu(a.no)).toBe(false);
    expect(d.aticiIste(-18, 30, 0, "salvo", 0.5)).toBe("sustu");
    for (let i = 0; i < 70; i++) d.guncelle(0.05);
    expect(d.aticiIste(-18, 30, 0, "salvo", 0.5)).not.toBe("sustu");
  });

  it("izli makineli aynı mevzide kalır (14–26 sn), sonra yer değiştirir; istek kesilince bırakılır", () => {
    const d = kur();
    const mevziler: number[] = [];
    for (let i = 0; i < 20 * 30; i++) {
      const a = d.aticiIste(0, 30, 0, "izli", 3);
      if (a && a !== "sustu" && a.hazir) {
        d.atisOldu(a.no);
        const m = d.durum().find((x) => x.no === a.no)!.mevzi;
        if (mevziler[mevziler.length - 1] !== m) mevziler.push(m);
      }
      d.guncelle(0.05);
    }
    // 30 sn: en az bir yer değiştirme, en çok üç (14–26 sn'de bir)
    expect(mevziler.length).toBeGreaterThanOrEqual(2);
    expect(mevziler.length).toBeLessThanOrEqual(4);
    for (let i = 0; i < 100; i++) d.guncelle(0.05);
    expect(d.durum().length).toBe(0);
  });

  it("temizle atıcıları ve susturmaları siler; mevzi listesi kalır", () => {
    const d = kur();
    salvo(d);
    d.patlamaOldu(new THREE.Vector3(-10, ZEMIN_Y, -30), 3);
    d.temizle();
    expect(d.durum().length).toBe(0);
    expect(Object.keys(d.ozet().etkisiz).length).toBe(0);
    expect(d.mevziSayisi).toBe(MEVZILER.length);
  });
});

describe("arazi mevzileri (sırt gerisi)", () => {
  /** 70 m'de 6 m yükselen sırt (göz y = 0, düzlük −1,7). */
  const sirt = (x: number, z: number) => -1.7 + 6 * Math.exp(-(((Math.hypot(x, z) - 70) / 12) ** 2));
  /** Gözden (x, y, z) noktası görünüyor mu (0,5 m adımlı arazi örneklemesi). */
  const gorunur = (zemin: (x: number, z: number) => number, x: number, y: number, z: number) => {
    const d = Math.hypot(x, z);
    for (let m = 1; m < d - 0.3; m += 0.5) if ((y * m) / d < zemin((x * m) / d, (z * m) / d) - 1e-3) return false;
    return true;
  };

  it("düz arazide mevzi yok", () => {
    expect(araziMevzileriBul(() => -1.7, 0, 30)).toEqual([]);
  });

  it("sırtın gerisinde, göğüs hizasına kadar örtülü yerler bulur", () => {
    const m = araziMevzileriBul(sirt, 0, 30);
    expect(m.length).toBeGreaterThanOrEqual(3);
    for (const p of m) {
      expect(p.mesafe).toBeGreaterThan(70);
      expect(p.mesafe).toBeLessThan(90);
      expect(p.y).toBeGreaterThan(0.7);
      expect(p.y).toBeLessThan(1.35);
      expect(Math.abs(aciFarki(p.azimut, 0))).toBeLessThanOrEqual(30);
      const g = sirt(p.x, p.z);
      // Örtü çizgisinin altı kapalı (bel), üstü açık (baş ve namlu)
      expect(gorunur(sirt, p.x, g + p.y - 0.25, p.z)).toBe(false);
      expect(gorunur(sirt, p.x, g + p.y + 0.3, p.z)).toBe(true);
    }
    // Mevziler birbirinden ayrık
    for (let i = 0; i < m.length; i++) for (let j = i + 1; j < m.length; j++) expect(Math.hypot(m[i].x - m[j].x, m[i].z - m[j].z)).toBeGreaterThanOrEqual(9);
  });

  it("uzak sınırın ötesindeki sırt sayılmaz", () => {
    expect(araziMevzileriBul(sirt, 0, 30, 40, 65)).toEqual([]);
  });

  it("açık arazi: görünen yamaçta mevzi, örtü zeminde; ters yamaçta (görünmeyen zemin) yok", () => {
    const yamac = (x: number, z: number) => -1.7 + Math.hypot(x, z) * 0.06;
    const m = acikAraziMevzileriBul(yamac, 0, 30);
    expect(m.length).toBeGreaterThanOrEqual(3);
    for (const p of m) {
      expect(p.mesafe).toBeGreaterThanOrEqual(55);
      expect(p.mesafe).toBeLessThanOrEqual(95);
      expect(p.y).toBeLessThan(0.2);
      expect(gorunur(yamac, p.x, yamac(p.x, p.z) + 0.3, p.z)).toBe(true);
    }
    // Aynı arazi aynı mevzileri verir (karma yöne bağlı, rastgele değil)
    expect(acikAraziMevzileriBul(yamac, 0, 30)).toEqual(m);
    // 40 m'deki sırtın gerisi (55–95 m) alçalıyor: görünen zemin yok
    const tersYamac = (x: number, z: number) => -1.7 + 5 * Math.exp(-(((Math.hypot(x, z) - 40) / 10) ** 2));
    expect(acikAraziMevzileriBul(tersYamac, 0, 30)).toEqual([]);
  });

  it("katman: arazi kapalıyken arazi mevzisi yok (uzak kaynağa düşülür)", () => {
    const d = new DusmanKatmani();
    d.mevzileriAyarla([{ x: -20, y: 5, z: 4 }]);
    expect(d.aticiIste(0, 30, 0, "salvo", 0.5)).toBeNull();
    d.araziBilgisi = () => null;
    expect(d.aticiIste(0, 30, 0, "salvo", 0.5)).toBeNull();
    expect(d.ozet().arazi).toBe(0);
  });

  it("katman: plan mevzisi olmayan yönde arazi mevzisi kullanılır (düz zeminde açık arazi, en çok dört); çaprazlama akışta kullanılmaz", () => {
    const d = new DusmanKatmani();
    d.araziBilgisi = () => ({ yaricap: 160 });
    d.mevzileriAyarla([{ x: -20, y: 5, z: 4 }]);
    // Test zemini: uzay.ts zeminY düzdür (arazi bağlı değil) → sırt yok → açık arazi mevzileri
    const a = d.aticiIste(0, 30, 0, "salvo", 0.5);
    expect(a).not.toBeNull();
    if (!a || a === "sustu") throw new Error("atıcı yok");
    expect(Math.hypot(a.konum.x, a.konum.z)).toBeGreaterThanOrEqual(55);
    expect(d.ozet().arazi).toBeGreaterThanOrEqual(1);
    expect(d.ozet().arazi).toBeLessThanOrEqual(4);
    // Aynı dilim yeniden hesaplanmaz
    const n = d.ozet().arazi;
    d.aticiIste(2, 30, 0, "salvo", 0.5);
    expect(d.ozet().arazi).toBe(n);
    // Çaprazlama izli mermi (taraf ≠ 0) arazi mevzisini kullanmaz
    expect(d.aticiIste(0, 45, 1, "izli", 3)).toBeNull();
    // Görüş hattı yapıya takılan yer mevzi olmaz
    const e = new DusmanKatmani();
    e.araziBilgisi = () => ({ yaricap: 160 });
    e.gorusEngeli = () => true;
    expect(e.aticiIste(0, 30, 0, "salvo", 0.5)).toBeNull();
    // Arazi yeniden kurulunca arazi mevzileri sıfırlanır, plan mevzisi kalır
    d.araziDegisti();
    expect(d.ozet().arazi).toBe(0);
    expect(d.mevziSayisi).toBe(1);
  });
});

describe("dost yapıları", () => {
  it("bayrak/kule çevresindeki plan mevzisi kullanılmaz", () => {
    const d = new DusmanKatmani();
    d.mevzileriAyarla(MEVZILER, [{ x: -10, z: -32, yaricap: 5 }]);
    expect(d.mevziSayisi).toBe(MEVZILER.length - 1);
    expect(d.mevziListesi().some((m) => m.x === -10 && m.z === -30)).toBe(false);
    // Dost bölgesi kalkınca mevzi geri gelir
    d.mevzileriAyarla(MEVZILER, []);
    expect(d.mevziSayisi).toBe(MEVZILER.length);
  });
});
