/**
 * Yangın ışık havuzu (8 Kasım değerlendirmesi §2-2): sahnedeki PointLight sayısı sabit kalır (gölgelendirici yeniden
 * derlenmez), en güçlü yangınlar ışık alır, sıfırlamada ışıklar söner ama sahnede kalır.
 */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { ISIK_SAYISI, YanginKatmani } from "./yangin";
import type { ParcacikSistemi } from "./parcaciklar";

const sahte = () => ({ yangin: () => undefined }) as unknown as ParcacikSistemi;
const DT = 1 / 60;
const isiklar = (k: YanginKatmani) => k.grup.children.filter((c) => c instanceof THREE.PointLight) as THREE.PointLight[];

describe("YanginKatmani ışık havuzu", () => {
  it("altı yangında da sahnede yalnız havuz ışıkları var; en çok ISIK_SAYISI yanar", () => {
    const k = new YanginKatmani(sahte());
    expect(isiklar(k)).toHaveLength(ISIK_SAYISI);
    for (let i = 0; i < 6; i++) k.ekle(new THREE.Vector3(i * 10 - 25, 0, -30), 0.3 + i * 0.1);
    for (let t = 0; t < 1.2; t += DT) k.guncelle(DT);
    expect(k.sayi).toBe(6);
    expect(isiklar(k)).toHaveLength(ISIK_SAYISI);
    expect(k.yananIsik).toBe(ISIK_SAYISI);
  });

  it("tek yangında bir ışık yanar, konumu yangının üstünde; yangın bitince ışık söner ama kalır", () => {
    const k = new YanginKatmani(sahte());
    k.ekle(new THREE.Vector3(5, 0, -20), 0.6, 1);
    for (let t = 0; t < 0.5; t += DT) k.guncelle(DT);
    expect(k.yananIsik).toBe(1);
    const yanan = isiklar(k).find((i) => i.visible)!;
    expect(yanan.position.x).toBeCloseTo(5, 0);
    expect(yanan.position.z).toBeCloseTo(-20, 0);
    expect(yanan.position.y).toBeGreaterThan(1);
    for (let t = 0; t < 4; t += DT) k.guncelle(DT);
    expect(k.sayi).toBe(0);
    expect(k.yananIsik).toBe(0);
    expect(isiklar(k)).toHaveLength(ISIK_SAYISI);
  });

  it("temizle ışıkları söndürür, sahneden çıkarmaz", () => {
    const k = new YanginKatmani(sahte());
    k.ekle(new THREE.Vector3(0, 0, -10), 0.8);
    for (let t = 0; t < 0.5; t += DT) k.guncelle(DT);
    k.temizle();
    expect(k.yananIsik).toBe(0);
    expect(isiklar(k)).toHaveLength(ISIK_SAYISI);
  });
});
