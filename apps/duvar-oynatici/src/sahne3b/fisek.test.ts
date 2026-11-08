import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { FisekKatmani, INIS_HIZI, ISIK_SAYISI } from "./fisek";
import type { ParcacikSistemi } from "./parcaciklar";

const sahte = () => {
  const parlama: number[] = [];
  let duman = 0;
  const p = { parlama: (_k: THREE.Vector3, boyut: number) => parlama.push(boyut), tutenDuman: () => duman++ } as unknown as ParcacikSistemi;
  return { p, parlama, dumanSayisi: () => duman };
};
const DT = 1 / 60;
const isiklar = (k: FisekKatmani) => k.grup.children.filter((c) => c instanceof THREE.PointLight) as THREE.PointLight[];

describe("aydınlatma fişeği", () => {
  it("2,5 m/s iner, salınır, ışık havuzu sabit, ömrü dolunca söner ve kaldırılır", () => {
    const { p, parlama, dumanSayisi } = sahte();
    const k = new FisekKatmani(p);
    expect(isiklar(k)).toHaveLength(ISIK_SAYISI);
    k.ekle(new THREE.Vector3(0, 170, -150), 1, 10);
    for (let t = 0; t < 4; t += DT) k.guncelle(DT);
    const f = (k as unknown as { fisekler: Array<{ konum: THREE.Vector3 }> }).fisekler[0];
    expect(f.konum.y).toBeCloseTo(170 - INIS_HIZI * 4, 0);
    expect(Math.abs(f.konum.x)).toBeLessThanOrEqual(4.01);
    expect(k.yananIsik).toBe(1);
    expect(isiklar(k).find((i) => i.visible)!.intensity).toBeGreaterThan(50000);
    expect(parlama.length).toBeGreaterThan(200);
    expect(dumanSayisi()).toBeGreaterThan(15);
    for (let t = 0; t < 7; t += DT) k.guncelle(DT);
    expect(k.sayi).toBe(0);
    expect(k.yananIsik).toBe(0);
    expect(isiklar(k)).toHaveLength(ISIK_SAYISI);
  });
  it("sönme: son 3 sn'de güç iner; en çok 4 fişek; temizle hepsini kaldırır", () => {
    const { p } = sahte();
    const k = new FisekKatmani(p);
    k.ekle(new THREE.Vector3(0, 170, -150), 1, 6);
    for (let t = 0; t < 4.5; t += DT) k.guncelle(DT);
    const yarim = isiklar(k).find((i) => i.visible)!.intensity;
    expect(yarim).toBeLessThan(45000);
    expect(yarim).toBeGreaterThan(5000);
    for (let i = 0; i < 6; i++) k.ekle(new THREE.Vector3(i, 170, -150));
    expect(k.sayi).toBe(4);
    k.temizle();
    expect(k.sayi).toBe(0);
    expect(k.yananIsik).toBe(0);
  });
});
