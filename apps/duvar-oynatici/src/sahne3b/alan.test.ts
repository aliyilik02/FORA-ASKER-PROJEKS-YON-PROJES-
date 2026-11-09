import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { AlanKatmani, carpismaKutusuMu, ogeKonumu, parcacigiKutudanIt, parcaKutuKesisimi } from "./alan";
import { yerKonumu } from "./uzay";

/** Yükleyiciye gitmeden öğe yerleştirir: taban izi kutusu ve gruba ekleme yolu (yerlestir'in yüklemeden sonraki kısmı). */
function kutuEkle(k: AlanKatmani, min: [number, number], max: [number, number], yukseklik = 10, catiY?: number) {
  const nesne = new THREE.Object3D();
  k.grup.add(nesne);
  (k as unknown as { izler: Array<{ nesne: THREE.Object3D; kutu: THREE.Box3; y?: number }> }).izler.push({
    nesne,
    kutu: new THREE.Box3(new THREE.Vector3(min[0], catiY ?? 0, min[1]), new THREE.Vector3(max[0], (catiY ?? 0) + yukseklik, max[1])),
    y: catiY,
  });
}

describe("alan katmanı: mermi izi, krater, helikopter", () => {
  const kutu = new THREE.Box3(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 2, 1));

  it("iz parçası kutuya ilk girdiği yerde kesilir; içinden başlayan ve ıskalayan parça kesişmez", () => {
    expect(parcaKutuKesisimi(kutu, -5, 1, 0, 5, 1, 0)).toBeCloseTo(0.4); // x = -1'de
    expect(parcaKutuKesisimi(kutu, 0, 1, 0, 5, 1, 0)).toBe(-1); // pencereden ateş: başlangıç içeride
    expect(parcaKutuKesisimi(kutu, -5, 3, 0, 5, 3, 0)).toBe(-1); // üstünden geçer
    expect(parcaKutuKesisimi(kutu, -5, 1, 0, -2, 1, 0)).toBe(-1); // bu karede ulaşmaz
  });

  it("direk/lamba (uzun, ince) ve çatı eşyası mermiyi durdurmaz; araç ve bina durdurur", () => {
    const direk = new THREE.Box3(new THREE.Vector3(-0.9, 0, -0.35), new THREE.Vector3(0.9, 9, 0.35));
    const arac = new THREE.Box3(new THREE.Vector3(-2, 0, -1), new THREE.Vector3(2, 1.5, 1));
    expect(carpismaKutusuMu(direk, false)).toBe(false);
    expect(carpismaKutusuMu(arac, false)).toBe(true);
    expect(carpismaKutusuMu(arac, true)).toBe(false);
    const k = new AlanKatmani();
    kutuEkle(k, [-0.9, -0.35], [0.9, 0.35], 9); // lamba
    kutuEkle(k, [3, -1], [5, 1], 1.5); // araç
    expect(k.kesisim(-10, 1, 0, 10, 1, 0)).toBeCloseTo(13 / 20); // lambadan geçer, araçta (x = 3) biter
  });

  it("en yakın öğe mesafesi krateri sınırlar; çatı eşyası zemin sayılmaz", () => {
    const k = new AlanKatmani();
    expect(k.enYakinMesafe(new THREE.Vector3(0, 0, 0))).toBe(Infinity);
    kutuEkle(k, [2, -1], [4, 1]);
    kutuEkle(k, [-1, -1], [1, 1], 1, 10); // çatıda ısıtıcı
    expect(k.enYakinMesafe(new THREE.Vector3(0, 0, 0))).toBeCloseTo(2);
    expect(k.enYakinMesafe(new THREE.Vector3(3, 0, 0))).toBe(0);
    expect(k.doluMu(new THREE.Vector3(0, 0, 0))).toBe(false);
  });

  it("toz/duman parçacığı yapının içinden geçmez: yandan itilir, duvar boyunca yükselir; tepenin üstünde serbest", () => {
    const bina = new THREE.Box3(new THREE.Vector3(-20, 0, -40), new THREE.Vector3(-9, 15, -20)); // sol cephe x = -9
    const duman = { x: -9.5, y: 5, z: -30, vx: -1, vy: 0, vz: 0, boyut: 4, yercekimi: 0 };
    expect(parcacigiKutudanIt(duman, bina)).toBe(true);
    expect(duman.x).toBeCloseTo(-9 + 0.4 * 4); // cephenin yarıçap kadar önünde
    expect(duman.vx).toBeGreaterThan(0); // duvardan hafif geri teper
    expect(duman.vy).toBeGreaterThan(0); // duvar boyunca yükselir
    const tepede = { x: -15, y: 15.1, z: -30, vx: 0, vy: -0.2, vz: 0, boyut: 2, yercekimi: 0 };
    parcacigiKutudanIt(tepede, bina);
    expect(tepede.y).toBeCloseTo(15 + 0.5 * 0.8); // en kısa yol yukarı: üstüne çıkar
    expect(tepede.vy).toBe(0);
    const ustunde = { x: -15, y: 20, z: -30, vx: 0, vy: 0.5, vz: 0, boyut: 6, yercekimi: 0 };
    expect(parcacigiKutudanIt(ustunde, bina)).toBe(false);
    const k = new AlanKatmani();
    kutuEkle(k, [-20, -40], [-9, -20], 15);
    const p = { x: -9.2, y: 3, z: -25, vx: 0, vy: 0, vz: 0, boyut: 3, yercekimi: 0 };
    k.parcacikIt(p);
    expect(p.x).toBeGreaterThan(-9);
  });

  it("helikopter için tepe yüksekliği: kutunun üstü, dışında -Infinity", () => {
    const k = new AlanKatmani();
    kutuEkle(k, [-13, -119], [13, -97], 34); // caddenin sonundaki kule
    expect(k.tepeYuksekligi(0, -100)).toBe(34);
    expect(k.tepeYuksekligi(0, -60)).toBe(-Infinity);
  });
});

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

describe("sokak: bitki dışlama alanı", () => {
  it("asfalt, kaldırım ve meydan içi (pay dahil) dışlanır; bina tarafı serbest", async () => {
    const { sokakIcindeMi } = await import("./sokak");
    const plan = {
      asfalt: [{ x0: -7.5, x1: 7.5, z0: 14, z1: -100 }],
      kaldirim: [{ x0: -9.6, x1: -7.5, z0: -12, z1: -98 }],
      meydan: [{ x0: 7.5, x1: 26, z0: 14, z1: -12 }],
    };
    expect(sokakIcindeMi(plan, 0, -40)).toBe(true);
    expect(sokakIcindeMi(plan, -9, -40)).toBe(true);
    expect(sokakIcindeMi(plan, 20, 0)).toBe(true);
    expect(sokakIcindeMi(plan, -12, -40)).toBe(false); // kaldırımın arkası (bina)
    expect(sokakIcindeMi(plan, 0, -101)).toBe(false); // yolun sonu + pay ötesi
  });
});
