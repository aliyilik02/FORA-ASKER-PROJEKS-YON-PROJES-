import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { YanginKatmani } from "./yangin";
import type { ParcacikSistemi } from "./parcaciklar";

/** Parçacık sistemi yerine yalnız yangın yayımını sayan sahte. */
const sahte = () => {
  const cagrilar: Array<{ siddet: number; sonuyor: boolean }> = [];
  const p = { yangin: (_k: THREE.Vector3, _r: number, siddet: number, sonuyor: boolean) => cagrilar.push({ siddet, sonuyor }) } as unknown as ParcacikSistemi;
  return { p, cagrilar };
};
const DT = 1 / 60;

describe("YanginKatmani ömür", () => {
  it("ömürlü yangın (patlama artığı) kendiliğinden sönmeye başlar ve biter; kalıcı yangın sürer", () => {
    const { p, cagrilar } = sahte();
    const k = new YanginKatmani(p);
    k.ekle(new THREE.Vector3(0, 0, -10), 0.4, 3);
    k.ekle(new THREE.Vector3(20, 0, -10), 0.8);
    for (let t = 0; t < 2.5; t += DT) k.guncelle(DT);
    expect(k.sayi).toBe(2);
    expect(cagrilar.filter((c) => c.sonuyor)).toHaveLength(0);
    for (let t = 0; t < 1; t += DT) k.guncelle(DT);
    // 3,5 sn: ömürlü sönüyor (yayım "sonuyor"), kalıcı değil
    const son = cagrilar.slice(-2);
    expect(son.some((c) => c.sonuyor)).toBe(true);
    expect(son.some((c) => !c.sonuyor)).toBe(true);
    for (let t = 0; t < 3; t += DT) k.guncelle(DT);
    expect(k.sayi).toBe(1); // ömürlü 2,5 sn'de söndü, kalıcı duruyor
    expect(k.sesOzeti()).toHaveLength(1);
  });
  it("aynı yere eklenen kalıcı yangın ömürlüyü kalıcı yapar; ömürlü üstüne ömürlü ömrü uzatır", () => {
    const { p } = sahte();
    const k = new YanginKatmani(p);
    const yer = new THREE.Vector3(0, 0, -10);
    k.ekle(yer, 0.4, 2);
    for (let t = 0; t < 1; t += DT) k.guncelle(DT);
    k.ekle(yer, 0.4, 2); // 1 + 2 = 3 sn'de söner
    for (let t = 0; t < 1.5; t += DT) k.guncelle(DT);
    expect(k.sayi).toBe(1);
    for (let t = 0; t < 4; t += DT) k.guncelle(DT);
    expect(k.sayi).toBe(0);
    k.ekle(yer, 0.4, 2);
    k.ekle(yer, 0.6); // kalıcı
    for (let t = 0; t < 8; t += DT) k.guncelle(DT);
    expect(k.sayi).toBe(1);
  });
});
