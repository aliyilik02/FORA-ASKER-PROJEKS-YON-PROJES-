/** Tekerlek ayırma: tek ağdaki tekerlekler aks başına ayrılır, dönerken aks merkezinde kalır; yedek tekerlek sabit. */
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { tekerlekleriAyir } from "./tekerlek";

const AYAR = { malzeme: "wheels", yaricap: 0.575, y: 0.58, akslar: [2.25, -1.94], enAzX: 0.85 };

/** Dört tekerlek (ön/arka × sağ/sol) + arkada yüksekte yedek tekerlek + ortada şaft: hepsi tek ağda. */
function arac() {
  const parcalar: THREE.BufferGeometry[] = [];
  const kutu = (x: number, y: number, z: number, b = 0.5) => {
    const k = new THREE.BoxGeometry(0.4, b, b);
    k.translate(x, y, z);
    parcalar.push(k.toNonIndexed());
  };
  for (const z of [2.25, -1.94]) for (const x of [1.25, -1.25]) kutu(x, 0.58, z);
  kutu(-1.33, 1.82, -2.93); // yedek
  kutu(0, 0.58, 2.25, 0.2); // şaft (ortada: dönmemeli)
  const konum: number[] = [];
  for (const p of parcalar) konum.push(...(p.getAttribute("position").array as Float32Array));
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(konum), 3));
  const mal = new THREE.MeshStandardMaterial();
  mal.name = "wheels";
  const kok = new THREE.Group();
  const govde = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 6), new THREE.MeshStandardMaterial());
  // Ağ kendi düğüm dönüşümüyle gelir (glTF): ayırma kök koordinatında çalışmalı
  const tekerAgi = new THREE.Mesh(g.clone().translate(0, -0.3, 0), mal);
  tekerAgi.position.y = 0.3;
  kok.add(govde, tekerAgi);
  return kok;
}

describe("tekerlek ayırma", () => {
  it("aks başına bir eksen düğümü; yedek tekerlek ve şaft sabit ağda kalır", () => {
    const kok = arac();
    const t = tekerlekleriAyir(kok, AYAR)!;
    expect(t.akslar.length).toBe(2);
    expect(t.akslar.map((a) => a.position.z)).toEqual([2.25, -1.94]);
    // Her aksta iki tekerlek (2 kutu × 12 üçgen)
    for (const a of t.akslar) expect(((a.children[0] as THREE.Mesh).geometry.getIndex()!.count / 3)).toBe(24);
    const sabit = kok.getObjectByName("tekerlek_sabit") as THREE.Mesh;
    expect(sabit.geometry.getIndex()!.count / 3).toBe(24); // yedek + şaft
    // Özgün ağ sahneden çıkar
    expect(kok.children.some((c) => (c as THREE.Mesh).isMesh && ((c as THREE.Mesh).material as THREE.Material).name === "wheels" && c.name === "")).toBe(false);
  });

  it("dönen tekerlek aks merkezinde kalır", () => {
    const kok = arac();
    const t = tekerlekleriAyir(kok, AYAR)!;
    const on = t.akslar[0];
    const ag = on.children[0] as THREE.Mesh;
    const merkez = () => {
      kok.updateMatrixWorld(true);
      return new THREE.Box3().setFromObject(ag).getCenter(new THREE.Vector3());
    };
    const once = merkez();
    expect(once.y).toBeCloseTo(0.58, 2);
    expect(once.z).toBeCloseTo(2.25, 2);
    on.rotation.x = 1.3;
    const sonra = merkez();
    expect(sonra.y).toBeCloseTo(0.58, 1);
    expect(sonra.z).toBeCloseTo(2.25, 1);
  });

  it("tekerlek malzemesi yoksa null (araç tek parça kalır)", () => {
    const kok = new THREE.Group();
    kok.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
    expect(tekerlekleriAyir(kok, AYAR)).toBeNull();
  });
});
