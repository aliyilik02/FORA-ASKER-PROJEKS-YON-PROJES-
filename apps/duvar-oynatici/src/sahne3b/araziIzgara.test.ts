import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { konumlariYaz, kraterPenceresi, kraterUygula, pencereAraligi, pencereNormalleri, pencereyiYenile, type IzgaraDuzeni } from "./araziIzgara";

/** arazi.ts düzeninin küçük kopyası: 41×41 köşe, 1 m adım (YAKIN_BOYUT 40). */
const D: IzgaraDuzeni = { n: 41, adim: 1, yarim: 20 };
/** Dalgalı analitik zemin (arazi.ts analitik() yerine). */
const analitik = (x: number, z: number) => 2 * Math.sin(x / 7) * Math.cos(z / 5) + 0.3 * Math.sin(x * 1.3 + z * 0.7);

/** Arazi gibi kurulmuş geometri: PlaneGeometry.rotateX(−90°), y = analitik, normaller three ile. */
function kur() {
  const g = new THREE.PlaneGeometry(40, 40, D.n - 1, D.n - 1);
  g.rotateX(-Math.PI / 2);
  const h = new Float32Array(D.n * D.n);
  for (let iz = 0; iz < D.n; iz++) for (let ix = 0; ix < D.n; ix++) h[iz * D.n + ix] = analitik(ix - D.yarim, iz - D.yarim);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const ix = Math.round(pos.getX(i) + D.yarim);
    const iz = Math.round(pos.getZ(i) + D.yarim);
    expect(iz * D.n + ix).toBe(i); // köşe sırası = iz·n + ix (satır = z)
    pos.setY(i, h[i]);
  }
  g.computeVertexNormals();
  return { g, h, pos, nor: g.attributes.normal as THREE.BufferAttribute };
}

describe("pencereNormalleri", () => {
  it("krater sonrası pencere normalleri three'nin tam computeVertexNormals sonucuyla birebir aynı", () => {
    const { g, h, pos, nor } = kur();
    const p = kraterUygula(h, D, 3.3, -4.6, 4.2, 1)!;
    expect(p).not.toBeNull();
    konumlariYaz(pos.array as Float32Array, h, D.n, p);
    const kismi = (nor.array as Float32Array).slice();
    const v = pencereNormalleri(pos.array as Float32Array, kismi, D.n, p);
    expect(v).toEqual({ ix0: p.ix0 - 1, ix1: p.ix1 + 1, iz0: p.iz0 - 1, iz1: p.iz1 + 1 });
    g.computeVertexNormals();
    expect(Array.from(kismi)).toEqual(Array.from(nor.array as Float32Array));
  });

  it("ızgara kenarındaki pencere (kırpılan) de doğru", () => {
    const { g, h, pos, nor } = kur();
    const p = kraterUygula(h, D, -19.5, 19.2, 3, 1.5)!;
    expect(p.ix0).toBe(0);
    expect(p.iz1).toBe(D.n - 1);
    konumlariYaz(pos.array as Float32Array, h, D.n, p);
    const kismi = (nor.array as Float32Array).slice();
    pencereNormalleri(pos.array as Float32Array, kismi, D.n, p);
    g.computeVertexNormals();
    expect(Array.from(kismi)).toEqual(Array.from(nor.array as Float32Array));
  });
});

describe("krater temizliği (kraterleriTemizle'nin saf kısmı)", () => {
  it("üst üste binen kraterler analitik pencerelerle geri alınınca yükseklikler ve normaller ilk hâline döner", () => {
    const { g, h, pos, nor } = kur();
    const ilkH = h.slice();
    const ilkN = (nor.array as Float32Array).slice();
    const kraterler = [
      { x: 2, z: -3, r: 4.2, s: 1 },
      { x: 5, z: -1, r: 3, s: 0.6 },
      { x: -8, z: 9, r: 5.5, s: 1.5 },
    ];
    for (const k of kraterler) {
      const p = kraterUygula(h, D, k.x, k.z, k.r, k.s)!;
      konumlariYaz(pos.array as Float32Array, h, D.n, p);
      pencereNormalleri(pos.array as Float32Array, nor.array as Float32Array, D.n, p);
    }
    expect(Array.from(h)).not.toEqual(Array.from(ilkH));
    // Önce bütün pencerelerin yüksekliği, sonra normaller
    const pencereler = kraterler.map((k) => kraterPenceresi(k.x, k.z, k.r, D)!);
    for (const p of pencereler) {
      pencereyiYenile(h, D, p, analitik);
      konumlariYaz(pos.array as Float32Array, h, D.n, p);
    }
    for (const p of pencereler) pencereNormalleri(pos.array as Float32Array, nor.array as Float32Array, D.n, p);
    expect(Array.from(h)).toEqual(Array.from(ilkH));
    expect(Array.from(nor.array as Float32Array)).toEqual(Array.from(ilkN));
    // Tam hesapla da aynı
    g.computeVertexNormals();
    expect(Array.from(nor.array as Float32Array)).toEqual(Array.from(ilkN));
  });

  it("krater penceresi ±1,5 r; ızgara dışındaki krater null", () => {
    expect(kraterPenceresi(0, 0, 2, D)).toEqual({ ix0: 17, ix1: 23, iz0: 17, iz1: 23 });
    expect(kraterPenceresi(80, 0, 2, D)).toBeNull();
  });

  it("yükleme aralığı pencerenin bütün köşelerini kapsar", () => {
    const p = { ix0: 3, ix1: 6, iz0: 10, iz1: 12 };
    const a = pencereAraligi(p, D.n, 3);
    for (let iz = p.iz0; iz <= p.iz1; iz++)
      for (let ix = p.ix0; ix <= p.ix1; ix++) {
        const i = (iz * D.n + ix) * 3;
        expect(i).toBeGreaterThanOrEqual(a.start);
        expect(i + 2).toBeLessThan(a.start + a.count);
      }
    expect(a.count).toBe(((p.iz1 - p.iz0) * D.n + (p.ix1 - p.ix0) + 1) * 3);
  });
});
