import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { duvarlariOlustur, duvarYerlesimleri, odaDuvarlari, type OdaGeometrisi, type TuvalNoktasi, ufukSatiri, type Yerlesim, yonuIzdusur } from "../projeksiyon";
import { DuvarKamerasi, sisUzakligiAyarla, uzaklikSisiGerekir } from "./duvarKamerasi";
import { dikeyFov, radyan } from "./uzay";

/** Yön (azimut, yükseklik; derece) → sahne koordinatında nokta (göz başlangıçta), `uzaklik` metre ötede. */
function yonNoktasi(azimut: number, yukseklik: number, uzaklik = 25): THREE.Vector3 {
  const a = radyan(azimut);
  const e = radyan(yukseklik);
  return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)).multiplyScalar(uzaklik);
}

/** 3B kameranın çizdiği tuval noktası: viewport duvarın bölgesi (sahne3b.ciz ile aynı). */
function kameradanTuvale(p: THREE.Vector3, kam: THREE.Camera, y: Yerlesim): TuvalNoktasi {
  const ndc = p.clone().project(kam);
  return { x: y.x + ((ndc.x + 1) / 2) * y.genislik, y: ((1 - ndc.y) / 2) * y.yukseklik };
}

function kameraKur(y: Yerlesim, kaydirma = 0): DuvarKamerasi {
  const kam = new DuvarKamerasi(0.1, 3000);
  kam.duvaraAyarla(y.izdusum, kaydirma);
  kam.updateMatrixWorld(true);
  return kam;
}

describe("duvar kamerası (3B)", () => {
  it("ölçüsüz yerleşimde eski kamerayla birebir aynı: yaw döndürme, simetrik piramit, yukseklikKaydirma eğimi", () => {
    for (const [W, H, fov] of [
      [5760, 1080, 90],
      [1920, 360, 60],
    ]) {
      for (const y of duvarYerlesimleri(W, H, duvarlariOlustur(fov))) {
        for (const k of [0, 0.2, -0.15]) {
          // Önceki sahne3b: PerspectiveCamera(dikey fov), YXZ, rotation.y = −yaw, rotation.x = atan(k·tan(dikeyFov/2))
          const eski = new THREE.PerspectiveCamera(dikeyFov(y.duvar.fov, y.genislik, H), y.genislik / H, 0.1, 3000);
          eski.rotation.order = "YXZ";
          eski.rotation.y = -radyan(y.duvar.yaw);
          eski.rotation.x = Math.atan(k * Math.tan(radyan(eski.fov) / 2));
          eski.updateMatrixWorld(true);
          const yeni = kameraKur(y, k);
          yeni.projectionMatrix.elements.forEach((v, i) => expect(v).toBeCloseTo(eski.projectionMatrix.elements[i], 9));
          yeni.matrixWorld.elements.forEach((v, i) => expect(v).toBeCloseTo(eski.matrixWorld.elements[i], 9));
        }
      }
    }
  });

  it("ölçülmüş odada (U, kaymış izleyici; düz duvar) 3B izdüşüm 2B yardımcılarla aynı piksele düşer", () => {
    const u: OdaGeometrisi = { tip: "u", on: 6, yan: 4, yukseklik: 3, alt: 0.3, izleyiciX: 0.8, izleyiciZ: 2.2, goz: 1.7 };
    const odalar = [u, { ...u, izleyiciX: 0, izleyiciZ: 3 }, { ...u, tip: "duz" as const, on: 9, yan: 0, izleyiciZ: 4, izleyiciX: -0.6 }];
    const n: TuvalNoktasi = { x: 0, y: 0 };
    for (const oda of odalar) {
      for (const y of duvarYerlesimleri(5760, 1080, odaDuvarlari(oda))) {
        const kam = kameraKur(y);
        for (const k of [0.03, 0.25, 0.5, 0.8, 0.97]) {
          for (const e of [-25, -5, 0, 10, 20]) {
            const az = y.duvar.solAzimut + y.duvar.fov * k;
            expect(yonuIzdusur(az, e, y, n)).toBe(true);
            const t = kameradanTuvale(yonNoktasi(az, e), kam, y);
            expect(t.x).toBeCloseTo(n.x, 6);
            expect(t.y).toBeCloseTo(n.y, 6);
          }
        }
        // Göz hizasındaki yön ufuk satırına düşer (yan duvarlarda da)
        const ufuk = kameradanTuvale(yonNoktasi(y.duvar.yaw, 0), kam, y);
        expect(ufuk.y).toBeCloseTo(ufukSatiri(y), 6);
      }
    }
  });

  it("updateProjectionMatrix() simetrik piramide dönmez (ezilir); yakın düzlem değişse de izdüşüm aynı", () => {
    const y = duvarYerlesimleri(5760, 1080, odaDuvarlari({ tip: "u", on: 6, yan: 4, yukseklik: 3, alt: 0.3, izleyiciX: 0, izleyiciZ: 3, goz: 1.7 }))[0];
    const kam = kameraKur(y);
    const p = yonNoktasi(-60, 8);
    const once = kameradanTuvale(p, kam, y);
    kam.near = 0.5;
    kam.updateProjectionMatrix();
    const sonra = kameradanTuvale(p, kam, y);
    expect(sonra.x).toBeCloseTo(once.x, 6);
    expect(sonra.y).toBeCloseTo(once.y, 6);
    // ters matris de güncel (three'nin ışın atma / unproject yolu)
    const birim = new THREE.Matrix4().multiplyMatrices(kam.projectionMatrix, kam.projectionMatrixInverse);
    birim.elements.forEach((v, i) => expect(v).toBeCloseTo(i % 5 === 0 ? 1 : 0, 9));
  });

  it("sis: kaymış izleyicide köşedeki nokta iki komşu kamerada aynı sis uzaklığını alır (ölçülmüş odada gerçek uzaklık)", () => {
    const oda: OdaGeometrisi = { tip: "u", on: 6, yan: 4, yukseklik: 3, alt: 0.3, izleyiciX: 0, izleyiciZ: 2.2, goz: 1.7 };
    const yer = duvarYerlesimleri(5760, 1080, odaDuvarlari(oda));
    const gorus = (kam: THREE.Camera, p: THREE.Vector3) => p.clone().applyMatrix4(kam.matrixWorldInverse); // mvPosition
    for (const [i, j] of [
      [0, 1],
      [1, 2],
    ]) {
      const a = kameraKur(yer[i]);
      const b = kameraKur(yer[j]);
      const kose = yer[j].duvar.solAzimut; // ön köşe −53,75° / +53,75°
      for (const e of [-1, -8, 5]) {
        const p = yonNoktasi(kose, e, 100);
        // three'nin varsayılanı (vFogDepth = −mvPosition.z): iki kamerada çok farklı → köşede sis kırılır
        expect(Math.abs(gorus(a, p).z - gorus(b, p).z)).toBeGreaterThan(15);
        // gerçek uzaklık (vFogDepth = length(mvPosition.xyz)): iki kamerada aynı, kameranın yönünden bağımsız
        expect(gorus(a, p).length()).toBeCloseTo(100, 9);
        expect(gorus(b, p).length()).toBeCloseTo(100, 9);
      }
    }
    // ön köşe −53,75°: sol kamerada 80,6 m, orta kamerada 59,1 m derinlik (ön 6, yan 4, z 2,2)
    const p = yonNoktasi(yer[1].duvar.solAzimut, 0, 100);
    expect(-gorus(kameraKur(yer[0]), p).z).toBeCloseTo(80.6, 1);
    expect(-gorus(kameraKur(yer[1]), p).z).toBeCloseTo(59.1, 1);

    // Seçim: ölçülmüş oda (U ve düz) → gerçek uzaklık; ölçüsüz (varsayılan, ?fov=) → three'nin derinliği (bugünkü görüntü)
    expect(uzaklikSisiGerekir(yer)).toBe(true);
    expect(uzaklikSisiGerekir(duvarYerlesimleri(5760, 1080, odaDuvarlari({ ...oda, tip: "duz" as const, on: 9, yan: 0 })))).toBe(true);
    expect(uzaklikSisiGerekir(duvarYerlesimleri(5760, 1080))).toBe(false);
    expect(uzaklikSisiGerekir(duvarYerlesimleri(1920, 360, duvarlariOlustur(40)))).toBe(false);
    // ölçüsüzde köşe iki kamera eksenine eşit açıda: derinlik zaten eşit (sis kipini değiştirmeye gerek yok)
    const v = duvarYerlesimleri(5760, 1080);
    const q = yonNoktasi(45, -3, 100);
    expect(gorus(kameraKur(v[1]), q).z).toBeCloseTo(gorus(kameraKur(v[2]), q).z, 9);

    // Köşe kodu: three'nin sis parçası değişir ve geri döner
    const ozgun = THREE.ShaderChunk.fog_vertex;
    expect(ozgun).toContain("vFogDepth = - mvPosition.z;");
    try {
      sisUzakligiAyarla(true);
      expect(THREE.ShaderChunk.fog_vertex).toContain("vFogDepth = length( mvPosition.xyz );");
      expect(THREE.ShaderChunk.fog_vertex).toContain("#ifdef USE_FOG");
      sisUzakligiAyarla(false);
      expect(THREE.ShaderChunk.fog_vertex).toBe(ozgun);
    } finally {
      THREE.ShaderChunk.fog_vertex = ozgun;
    }
  });
});
