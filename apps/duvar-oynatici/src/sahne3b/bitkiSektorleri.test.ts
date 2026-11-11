import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { duvarYerlesimleri, odaDuvarlari, type OdaGeometrisi } from "../projeksiyon";
import { halkaIndeksi, kabukPiramitte, kamaKabugu, kesikPay, sektorIndeksi, sektorlereBol, type OrnekKuresi } from "./bitkiSektorleri";
import { DuvarKamerasi } from "./duvarKamerasi";

/** Tekrarlanabilir rastgelelik (mulberry32). */
function tohumlu(tohum: number): () => number {
  let a = tohum >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** arazi.ts bitkileriYukle dağılımı: r = 8 + u^1,35·(148 − 8), her yönde; yükseklik ve yarıçap rastgele. */
function ornekler(adet: number, rnd: () => number, rEnCok = 148): OrnekKuresi[] {
  const d: OrnekKuresi[] = [];
  for (let i = 0; i < adet; i++) {
    const r = 8 + Math.pow(rnd(), 1.35) * (rEnCok - 8);
    const a = rnd() * Math.PI * 2;
    d.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, y: -1.7 + rnd() * 4 - 2, r: 0.3 + rnd() * 2.7 });
  }
  return d;
}

/** Ölçüsüz U oda: 16:9 duvar, yatay 90°, sol/orta/sağ (yaw +90/0/−90: azimut −90/0/+90). */
function duvarPiramitleri(): THREE.Frustum[] {
  return [90, 0, -90].map((yaw) => {
    const k = new THREE.PerspectiveCamera((2 * Math.atan(Math.tan(Math.PI / 4) * (9 / 16)) * 180) / Math.PI, 16 / 9, 0.1, 3000);
    k.rotation.set(0, (yaw * Math.PI) / 180, 0);
    k.updateMatrixWorld(true);
    return new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(k.projectionMatrix, k.matrixWorldInverse));
  });
}

describe("sektorlereBol", () => {
  it("her örnek tam bir hücrede, toplam korunur, hücre sektör ve halkayla uyumlu", () => {
    const d = ornekler(500, tohumlu(3));
    for (const kayma of [0, 22.5]) {
      const hucreler = sektorlereBol(d, 8, kayma, [45]);
      expect(hucreler).toHaveLength(16);
      expect(hucreler.reduce((t, h) => t + h.length, 0)).toBe(500);
      const gorulen = new Set<OrnekKuresi>();
      hucreler.forEach((h, i) => {
        for (const o of h) {
          expect(gorulen.has(o)).toBe(false);
          gorulen.add(o);
          expect(sektorIndeksi(o.x, o.z, 8, kayma)).toBe(i % 8);
          expect(halkaIndeksi(Math.hypot(o.x, o.z), [45])).toBe(Math.floor(i / 8));
        }
      });
      expect(gorulen.size).toBe(500);
    }
  });

  it("sektör sınırları: 0 = −z (orta duvar) sektör 3/4 sınırında; −180° ilk, +180°'ye yakın son sektör; kayma sınırları kaydırır", () => {
    expect(sektorIndeksi(0, -10, 8)).toBe(4); // azimut 0 → [0°, 45°)
    expect(sektorIndeksi(-0.01, -10, 8)).toBe(3);
    expect(sektorIndeksi(10, 0, 8)).toBe(6); // +90°
    expect(sektorIndeksi(-10, 0, 8)).toBe(2); // −90°
    expect(sektorIndeksi(-1e-9, 10, 8)).toBe(0); // −180°'ye yakın
    expect(sektorIndeksi(1e-9, 10, 8)).toBe(7);
    // 22,5° kayma: orta duvarın ortası (0°) bir sektörün ortasında, ±22,5° sınırlar
    const az = (d: number) => [Math.sin((d * Math.PI) / 180) * 10, -Math.cos((d * Math.PI) / 180) * 10] as const;
    expect(sektorIndeksi(...az(0), 8, 22.5)).toBe(sektorIndeksi(...az(22), 8, 22.5));
    expect(sektorIndeksi(...az(0), 8, 22.5)).toBe(sektorIndeksi(...az(-22), 8, 22.5));
    expect(sektorIndeksi(...az(23), 8, 22.5)).not.toBe(sektorIndeksi(...az(22), 8, 22.5));
    expect(sektorIndeksi(...az(179), 8, 22.5)).toBe(sektorIndeksi(...az(-179), 8, 22.5)); // arka sektör ±180°'yi kapsar
    expect(halkaIndeksi(10, [20, 60])).toBe(0);
    expect(halkaIndeksi(20, [20, 60])).toBe(1);
    expect(halkaIndeksi(200, [20, 60])).toBe(2);
    expect(sektorlereBol([], 8)).toHaveLength(8);
  });
});

describe("kamaKabugu (tutucu: kabuk bir düzlemin dışındaysa bütün küreler de dışında)", () => {
  it("rastgele hücreler ve düzlemler: yanlış ayıklama yok", () => {
    const rnd = tohumlu(7);
    const hucreler = sektorlereBol(ornekler(500, rnd), 8, 22.5, [45]);
    const p = new THREE.Plane();
    const n = new THREE.Vector3();
    const nokta = new THREE.Vector3();
    let deneme = 0;
    let disarida = 0;
    let yanlis = 0;
    for (const h of hucreler) {
      const k = kamaKabugu(h);
      if (h.length === 0) {
        expect(k).toBeNull();
        continue;
      }
      expect(k).not.toBeNull();
      for (let j = 0; j < 150; j++) {
        n.set(rnd() - 0.5, (rnd() - 0.5) * 0.6, rnd() - 0.5).normalize();
        p.setFromNormalAndCoplanarPoint(n, nokta.set((rnd() - 0.5) * 300, (rnd() - 0.5) * 10, (rnd() - 0.5) * 300));
        deneme++;
        if (kabukPiramitte([p], k!)) continue;
        disarida++;
        // Kabuk dışarıdaysa her küre de tamamen dışarıda olmalı (n·c + sabit < −r)
        for (const o of h) if (p.normal.x * o.x + p.normal.y * o.y + p.normal.z * o.z + p.constant >= -o.r + 1e-9) yanlis++;
      }
    }
    expect(yanlis).toBe(0);
    expect(disarida).toBeGreaterThan(0.1 * deneme); // denetim gerçekten bir şey ayıkladı
  });

  it("izleyicinin dikey eksenini içeren küre ya da yarım düzlemden geniş dilim: null (küre denetimine düşer)", () => {
    expect(kamaKabugu([{ x: 1, y: 0, z: -1, r: 2 }])).toBeNull();
    expect(kamaKabugu([{ x: 0, y: 0, z: -20, r: 1 }, { x: 0, y: 0, z: 20, r: 1 }])).toBeNull();
    expect(kamaKabugu([])).toBeNull();
  });
});

describe("duvar kameralarıyla ayıklama", () => {
  it("8 sektör, 22,5° kayma: her duvar 3 hücre (örneklerin ~%40'ı) çizer; aynı hücrelerin sınır küresi 5'ini geçirirdi", () => {
    const rnd = tohumlu(11);
    const d = ornekler(600, rnd);
    const hucreler = sektorlereBol(d, 8, 22.5).filter((h) => h.length > 0);
    expect(hucreler).toHaveLength(8);
    const piramitler = duvarPiramitleri();
    const kure = (h: OrnekKuresi[]) => {
      const s = new THREE.Sphere().makeEmpty();
      for (const o of h) s.union(new THREE.Sphere(new THREE.Vector3(o.x, o.y, o.z), o.r));
      return s;
    };
    for (const f of piramitler) {
      const gorunen = hucreler.filter((h) => kabukPiramitte(f.planes, kamaKabugu(h)!));
      const kureyle = hucreler.filter((h) => f.intersectsSphere(kure(h))).length;
      expect(gorunen.length).toBe(3);
      expect(gorunen.reduce((t, h) => t + h.length, 0) / d.length).toBeLessThan(0.45);
      expect(kureyle).toBeGreaterThanOrEqual(5);
    }
  });

  it("görünen hücre ayıklanmaz: piramidin içindeki her örnek kendi hücresiyle çizilir", () => {
    const rnd = tohumlu(5);
    const d = ornekler(600, rnd);
    const hucreler = sektorlereBol(d, 8, 22.5, [45]);
    const kabuklar = hucreler.map((h) => (h.length ? kamaKabugu(h) : null));
    for (const f of duvarPiramitleri()) {
      hucreler.forEach((h, i) => {
        const gorunen = h.some((o) => f.intersectsSphere(new THREE.Sphere(new THREE.Vector3(o.x, o.y, o.z), o.r)));
        if (gorunen) expect(kabukPiramitte(f.planes, kabuklar[i]!)).toBe(true);
      });
    }
  });

  it("ölçülmüş U odada (simetrik olmayan duvar piramidi, kaymış izleyici) de görünen hücre ayıklanmaz", () => {
    const oda: OdaGeometrisi = { tip: "u", on: 6, yan: 4, yukseklik: 3, alt: 0.3, izleyiciX: 0.8, izleyiciZ: 2.2, goz: 1.7 };
    const yer = duvarYerlesimleri(5760, 1080, odaDuvarlari(oda));
    const piramitler = yer.map((y) => {
      const k = new DuvarKamerasi(0.1, 3000);
      k.duvaraAyarla(y.izdusum);
      k.updateMatrixWorld(true);
      return new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(k.projectionMatrix, k.matrixWorldInverse));
    });
    const d = ornekler(800, tohumlu(21));
    const hucreler = sektorlereBol(d, 8, 22.5);
    let ayiklanan = 0;
    for (const f of piramitler) {
      for (const h of hucreler) {
        if (!h.length) continue;
        const gorunen = h.some((o) => f.intersectsSphere(new THREE.Sphere(new THREE.Vector3(o.x, o.y, o.z), o.r)));
        const gecer = kabukPiramitte(f.planes, kamaKabugu(h)!);
        if (gorunen) expect(gecer).toBe(true);
        if (!gecer) ayiklanan++;
      }
    }
    expect(ayiklanan).toBeGreaterThanOrEqual(3 * 4); // her duvar en az 4 sektörü ayıklar
  });

  it("gölge kamerası (±45 m dik izdüşüm): bütün sektörler gölge kutusuna değer, kutunun dışındaki halka ayıklanır", () => {
    // Bu yüzden halka bölmesi yok: sektörler izleyicinin 8 m yakınından başlar, gölge kutusu her sektöre değer;
    // uzak halka (60 m+) da kutunun güneş ekseni boyunca uzanan izdüşümüne çoğunlukla girer (kazanç küçük).
    const rnd = tohumlu(9);
    const hucreler = sektorlereBol(ornekler(600, rnd), 8, 22.5, [60]);
    const g = new THREE.OrthographicCamera(-45, 45, 45, -45, 1, 260);
    // Güneş güneybatıda, 50° yükseklikte; hedef zeminde
    const yon = new THREE.Vector3(Math.sin(-2.4) * Math.cos(0.87), Math.sin(0.87), -Math.cos(-2.4) * Math.cos(0.87));
    g.position.copy(yon.multiplyScalar(120)).add(new THREE.Vector3(0, -1.7, 0));
    g.lookAt(0, -1.7, 0);
    g.updateMatrixWorld(true);
    const f = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(g.projectionMatrix, g.matrixWorldInverse));
    for (const h of hucreler.slice(0, 8)) if (h.length) expect(kabukPiramitte(f.planes, kamaKabugu(h)!)).toBe(true);
    // 200 m'deki uzak bir küme gölge kutusunun dışında kalır
    const uzakKume = [{ x: 0, y: -1.7, z: 200, r: 2 }, { x: 10, y: -1.7, z: 205, r: 2 }];
    expect(kabukPiramitte(f.planes, kamaKabugu(uzakKume)!)).toBe(false);
  });
});

describe("kesikPay (sınıfın en uzak mesafesi)", () => {
  it("yakın yoğunluk aynı kalır: sınır içindeki örnek sayısı payla aynı", () => {
    const rnd = tohumlu(1);
    const N = 20000;
    let icerde = 0;
    for (let i = 0; i < N; i++) if (8 + Math.pow(rnd(), 1.35) * 140 <= 50) icerde++;
    expect(kesikPay(8, 148, 50, 1.35)).toBeCloseTo(icerde / N, 2);
    expect(kesikPay(8, 148, 200, 1.35)).toBe(1);
    expect(kesikPay(8, 148, 5, 1.35)).toBe(0);
    expect(kesikPay(8, 44, 80, 1.35)).toBe(1); // orman: profil yarıçapı zaten küçük
  });
});
