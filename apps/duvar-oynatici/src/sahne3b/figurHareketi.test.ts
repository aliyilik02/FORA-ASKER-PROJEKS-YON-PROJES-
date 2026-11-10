/**
 * Figür hareket yardımcıları (10 Kasım oynayarak test bulguları): hareket hızının klibin doğal hızına uyumu (ayak
 * kayması), geçiş klibinin ölü başı/sonu ("Standing Up" 11,4 sn), duruşa uymayan vurulma klibi ve düşme klibine
 * ortasından giriş.
 */
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { gecisAraligi, hareketUyumu, kalcaFarki, kalcayaEnYakinZaman } from "./figurler3b";

/** Kalçası verilen (zaman, yükseklik) noktalarından geçen klip; yükseklik yerel −z (Meshy/Mixamo aktarımındaki gibi). */
function klip(ad: string, noktalar: Array<[number, number]>) {
  const zamanlar = noktalar.map((n) => n[0]);
  const degerler = noktalar.flatMap((n) => [0, -0.06, -n[1]]);
  return new THREE.AnimationClip(ad, zamanlar[zamanlar.length - 1], [new THREE.VectorKeyframeTrack("mixamorigHips.position", zamanlar, degerler)]);
}
const kalca = (y: number) => new THREE.Vector3(0, -0.06, -y);

describe("hareketUyumu", () => {
  it("yürüyüş: 1,5 m/sn istenir, klip %30 hızlanır, figür 1,3 m/sn gider", () => {
    const u = hareketUyumu("Rifle Walk", 1.5);
    expect(u.zamanOlcegi).toBeCloseTo(1.3);
    expect(u.hiz).toBeCloseTo(1.3);
  });
  it("koşu: 4,5 m/sn istenir, 2,65 × 1,3 = 3,45 m/sn (ayak kaymaz)", () => {
    expect(hareketUyumu("Armature|Rifle Run", 4.5).hiz).toBeCloseTo(3.445);
  });
  it("yaralı yürüyüşü yavaşlar: 0,74 istenir, klip 0,8 katına iner", () => {
    const u = hareketUyumu("Injured Walk", 0.74);
    expect(u.zamanOlcegi).toBeCloseTo(0.8, 1);
    expect(u.hiz).toBeCloseTo(0.93 * u.zamanOlcegi);
  });
  it("doğal hız boyla ölçeklenir; bilinmeyen klipte istenen hız kalır", () => {
    expect(hareketUyumu("Rifle Walk", 1.0, 0.9).zamanOlcegi).toBeCloseTo(1.3);
    expect(hareketUyumu("Bilinmeyen", 2.2)).toEqual({ hiz: 2.2, zamanOlcegi: 1 });
    expect(hareketUyumu("Rifle Walk", 0)).toEqual({ hiz: 0, zamanOlcegi: 1 });
  });
});

describe("gecisAraligi", () => {
  it("yerde kıpırtısız geçen ilk saniyeleri ve sondaki bekleyişi atar", () => {
    const k = klip("Standing Up", [[0, 0.1], [1, 0.1], [2, 0.1], [3.5, 0.1], [4.3, 0.14], [5.7, 0.48], [7.1, 0.89], [8.6, 0.94], [10, 0.94], [11.4, 0.94]]);
    const a = gecisAraligi(k);
    expect(a.bas).toBeGreaterThan(3);
    expect(a.bas).toBeLessThan(4.3);
    expect(a.son).toBeGreaterThan(7.1);
    expect(a.son).toBeLessThan(9.5);
  });
  it("hemen başlayan kısa geçiş kırpılmaz", () => {
    const a = gecisAraligi(klip("Rifle Stand To Kneel", [[0, 0.95], [0.3, 0.8], [0.6, 0.5], [0.97, 0.37]]));
    expect(a.bas).toBeLessThan(0.1);
    expect(a.son).toBeGreaterThan(0.85);
  });
  it("kalça izi yoksa klibin tamamı", () => {
    const k = new THREE.AnimationClip("x", 2, [new THREE.VectorKeyframeTrack("Spine.position", [0, 2], [0, 0, 0, 0, 0, 0])]);
    expect(gecisAraligi(k)).toEqual({ bas: 0, son: 2 });
  });
});

describe("vurulma / düşme uyumu", () => {
  const dusme = klip("Dying", [[0, 0.94], [1.4, 0.92], [1.7, 0.8], [1.9, 0.49], [2.2, 0.46], [2.5, 0.28], [2.8, 0.15], [4.4, 0.13]]);
  const vurulma = klip("Hit Reaction", [[0, 0.44], [1.87, 0.44]]);
  it("ayaktaki figür (kalça 0,93) çömelik vurulma klibine uymaz, düşme klibine uyar", () => {
    expect(kalcaFarki(vurulma, 0, kalca(0.93))).toBeGreaterThan(0.2 * 0.947);
    expect(kalcaFarki(dusme, 0, kalca(0.93))).toBeLessThan(0.2 * 0.947);
  });
  it("diz çökmüş figür düşme klibine kalçasının yüksekliğinden girer", () => {
    const t = kalcayaEnYakinZaman(dusme, kalca(0.45));
    expect(t).toBeGreaterThan(1.85);
    expect(t).toBeLessThan(2.25);
  });
  it("yerdeki figür klibin sonuna yakın girer; ayaktaki baştan", () => {
    expect(kalcayaEnYakinZaman(dusme, kalca(0.14))).toBeGreaterThan(2.75);
    expect(kalcayaEnYakinZaman(dusme, kalca(0.94))).toBe(0);
  });
});
