/** 3B alanda düşman ateşi: pencere/çatı mevzisinden çıkış ve çaprazlama izli mermi (catisma.ts mevziSec). */
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { CatismaSistemi } from "./catisma";
import type { ParcacikSistemi } from "./parcaciklar";

const PARCACIKLAR = { parlama: () => undefined, duman: { ekle: () => undefined }, kivilcim: { ekle: () => undefined } } as unknown as ParcacikSistemi;
const MEVZILER = [new THREE.Vector3(-8.5, 7, -24), new THREE.Vector3(8.5, 4.5, -31), new THREE.Vector3(0, 27, -96.6)];

type Ic = {
  dusmanKaynagi(az: number): THREE.Vector3;
  izliAtis(az: number, yon: number): void;
  kaynakMevzi: boolean;
  eklenecek: Array<{ p: THREE.Vector3; v: THREE.Vector3 }>;
};

function kur(mevziler = MEVZILER) {
  const s = new CatismaSistemi(PARCACIKLAR, { carpma: () => undefined, atis: () => undefined });
  s.mevziler = () => mevziler;
  return s as unknown as Ic;
}

const enYakin = (p: THREE.Vector3) => Math.min(...MEVZILER.map((m) => m.distanceTo(p)));

describe("çatışma: 3B alan mevzileri", () => {
  it("düşman yönünün ±30°'sinde mevzi varsa kaynak odur (pencere yüksekliğinde, küçük titremeyle)", () => {
    const s = kur();
    for (let i = 0; i < 20; i++) {
      const k = s.dusmanKaynagi(0);
      expect(s.kaynakMevzi).toBe(true);
      expect(enYakin(k)).toBeLessThan(0.8);
    }
  });

  it("o yönde mevzi yoksa eski uzak arazi kaynağı (150–260 m)", () => {
    const s = kur();
    const k = s.dusmanKaynagi(90);
    expect(s.kaynakMevzi).toBe(false);
    expect(Math.hypot(k.x, k.z)).toBeGreaterThanOrEqual(150);
  });

  it("izli mermi yan akışı (+90) sağ cepheden karşı kaldırıma çaprazlar; düz akış mevziden izleyiciye gelir", () => {
    const s = kur();
    s.izliAtis(0, 90);
    const capraz = s.eklenecek.pop()!;
    expect(capraz.p.x).toBeGreaterThan(0);
    expect(capraz.v.x).toBeLessThan(0);
    s.izliAtis(0, 0);
    const duz = s.eklenecek.pop()!;
    expect(enYakin(duz.p)).toBeLessThan(0.8);
  });
});
