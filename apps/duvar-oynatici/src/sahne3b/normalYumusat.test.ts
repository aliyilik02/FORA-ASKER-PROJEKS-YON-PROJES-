import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { normalleriYumusat, yumusakNormalHesapla } from "./normalYumusat";

/** Parçalanmış (indekssiz, köşe paylaşmayan) geometri: Meshy pişirme çıktısı gibi. */
function parcala(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const p = g.index ? g.toNonIndexed() : g;
  p.computeVertexNormals(); // indekssizde = düz yüz normali
  return p;
}

describe("açı sınırlı yumuşak normaller", () => {
  it("parçalanmış kürede normaller merkezden dışa (düz gölge kalkar)", () => {
    const g = parcala(new THREE.SphereGeometry(2, 16, 12));
    normalleriYumusat(g, 70);
    const p = g.getAttribute("position");
    const n = g.getAttribute("normal");
    let enKotu = 1;
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)).normalize();
      const m = new THREE.Vector3(n.getX(i), n.getY(i), n.getZ(i));
      enKotu = Math.min(enKotu, v.dot(m));
    }
    expect(enKotu).toBeGreaterThan(0.97);
  });

  it("aynı konumdaki köşeler (UV dikişi) aynı normali alır", () => {
    const g = parcala(new THREE.IcosahedronGeometry(1, 2));
    normalleriYumusat(g, 80);
    const p = g.getAttribute("position");
    const n = g.getAttribute("normal");
    const ilk = new Map<string, THREE.Vector3>();
    let enBuyukFark = 0;
    for (let i = 0; i < p.count; i++) {
      const k = `${p.getX(i).toFixed(4)}|${p.getY(i).toFixed(4)}|${p.getZ(i).toFixed(4)}`;
      const m = new THREE.Vector3(n.getX(i), n.getY(i), n.getZ(i));
      const o = ilk.get(k);
      if (!o) ilk.set(k, m);
      else enBuyukFark = Math.max(enBuyukFark, o.distanceTo(m));
    }
    expect(enBuyukFark).toBeLessThan(1e-5);
  });

  it("kutunun 90° kenarları keskin kalır (eşik 70°)", () => {
    const g = parcala(new THREE.BoxGeometry(1, 1, 1));
    const once = Float32Array.from(g.getAttribute("normal").array as Float32Array);
    normalleriYumusat(g, 70);
    const sonra = g.getAttribute("normal").array as Float32Array;
    for (let i = 0; i < once.length; i++) expect(sonra[i]).toBeCloseTo(once[i], 5);
  });

  it("indeksli geometride UV/indeks değişmez, yalnız normal yazılır", () => {
    const g = new THREE.SphereGeometry(1, 8, 6);
    const indeks = Array.from(g.index!.array);
    const uv = Array.from(g.getAttribute("uv").array);
    normalleriYumusat(g, 70);
    expect(Array.from(g.index!.array)).toEqual(indeks);
    expect(Array.from(g.getAttribute("uv").array)).toEqual(uv);
  });

  it("saf hesap: tek üçgen kendi yüz normalini alır", () => {
    const n = yumusakNormalHesapla([0, 0, 0, 1, 0, 0, 0, 1, 0], null);
    expect(Array.from(n)).toEqual([0, 0, 1, 0, 0, 1, 0, 0, 1]);
  });
});
