import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { AlanKatmani, ogeKonumu } from "./alan";
import { yerKonumu } from "./uzay";

/** Yükleyiciye gitmeden öğe yerleştirir: taban izi kutusu ve gruba ekleme yolu (yerlestir'in yüklemeden sonraki kısmı). */
function kutuEkle(k: AlanKatmani, min: [number, number], max: [number, number]) {
  const nesne = new THREE.Object3D();
  k.grup.add(nesne);
  (k as unknown as { izler: Array<{ nesne: THREE.Object3D; kutu: THREE.Box3 }> }).izler.push({
    nesne,
    kutu: new THREE.Box3(new THREE.Vector3(min[0], 0, min[1]), new THREE.Vector3(max[0], 10, max[1])),
  });
}

describe("alan katmanı", () => {
  it("öğe konumu: x/z verilmişse o, yoksa azimut + mesafe (sahne koordinatı)", () => {
    expect(ogeKonumu({ dosya: "a.glb", x: 3, z: -7 }).toArray()).toEqual([3, 0, -7]);
    const sag = ogeKonumu({ dosya: "a.glb", azimut: 90, mesafe: 10 });
    const beklenen = yerKonumu(90, 10);
    expect(sag.x).toBeCloseTo(beklenen.x);
    expect(sag.z).toBeCloseTo(beklenen.z);
  });

  it("doluMu taban izine payla bakar (asker binanın içine konmaz, cadde boş kalır)", () => {
    const k = new AlanKatmani();
    kutuEkle(k, [-22.7, -15.6], [-9, -2]); // sol köşe binası (bina_insaat_385)
    expect(k.doluMu(new THREE.Vector3(-15, 0, -8))).toBe(true);
    expect(k.doluMu(new THREE.Vector3(-8.7, 0, -8))).toBe(true); // 0,6 m pay içinde
    expect(k.doluMu(new THREE.Vector3(-8, 0, -3))).toBe(false); // "sol köşe" yerleşim noktası
    expect(k.doluMu(new THREE.Vector3(0, 0, -26))).toBe(false); // cadde ortası
    expect(k.ogeSayisi).toBe(1);
  });

  it("temizle bütün öğeleri ve izleri kaldırır; aynı plan yeniden kurulmaz", () => {
    const k = new AlanKatmani();
    const plan = { ogeler: [] };
    k.ayarla(plan, "/");
    expect(k.plan).toBe(plan);
    kutuEkle(k, [0, 0], [1, 1]);
    k.ayarla(plan, "/"); // aynı plan: dokunulmaz
    expect(k.ogeSayisi).toBe(1);
    k.ayarla(null, "/");
    expect(k.plan).toBeNull();
    expect(k.ogeSayisi).toBe(0);
    expect(k.grup.children.length).toBe(0);
  });
});
