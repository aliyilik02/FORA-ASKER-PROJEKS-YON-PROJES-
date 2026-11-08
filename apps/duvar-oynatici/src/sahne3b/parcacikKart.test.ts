/**
 * Parçacık kartı yönü (8 Kasım gece): göze dönük kartın normali göze DOĞRU olmalı; tersi arka yüz olur, FrontSide ile
 * ayıklanır ve parçacıklar sayılıp çizilmez (kullanıcı: "dumanları kaldırmışsın"). Gölgelendiricideki vektör hesabı
 * burada JS'le aynen tekrarlanır; ayrıca malzeme iki yüzlü olmalı.
 */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { ParcacikGrubu } from "./parcaciklar";

/** VERTEX gölgelendiricisindeki kart tabanı: n, sağ, yukarı. */
function kartTabani(merkez: THREE.Vector3, goz: THREE.Vector3) {
  const n = goz.clone().sub(merkez).normalize();
  const sag = new THREE.Vector3(0, 1, 0).cross(n).normalize();
  const yukari = n.clone().cross(sag);
  return { n, sag, yukari };
}

describe("parçacık kartı yönü", () => {
  it("kartın yüzey normali (sağ × yukarı) göze bakar; önde, yanda ve köşede", () => {
    const goz = new THREE.Vector3(0, 0, 0);
    for (const merkez of [new THREE.Vector3(0, 1, -20), new THREE.Vector3(-30, 2, -5), new THREE.Vector3(25, 0.5, -25), new THREE.Vector3(40, 3, 10)]) {
      const { n, sag, yukari } = kartTabani(merkez, goz);
      const yuzeyNormali = sag.clone().cross(yukari);
      expect(yuzeyNormali.dot(n)).toBeGreaterThan(0.99); // göze doğru
      expect(yuzeyNormali.dot(goz.clone().sub(merkez).normalize())).toBeGreaterThan(0.99);
      // Sağ vektör yatay ve ileri yöne dik
      expect(Math.abs(sag.y)).toBeLessThan(1e-6);
      expect(Math.abs(sag.dot(n))).toBeLessThan(1e-6);
    }
  });
  it("gölgelendirici göz − merkez kullanır ve malzeme iki yüzlü", () => {
    const g = new ParcacikGrubu(new THREE.Texture(), 8, "normal", true);
    const m = (g as unknown as { mesh: THREE.Mesh }).mesh.material as THREE.ShaderMaterial;
    expect(m.vertexShader).toContain("cameraPosition - merkez");
    expect(m.side).toBe(THREE.DoubleSide);
  });
});
