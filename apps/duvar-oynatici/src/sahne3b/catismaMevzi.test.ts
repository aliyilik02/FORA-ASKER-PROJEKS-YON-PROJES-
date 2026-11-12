/** 3B alanda düşman ateşi: mevzideki atıcıdan çıkış, salvo boyunca aynı atıcı, çaprazlama izli mermi (catisma.ts + dusman.ts). */
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { CatismaSistemi } from "./catisma";
import { DusmanKatmani, type DusmanMevzisi } from "./dusman";
import type { ParcacikSistemi } from "./parcaciklar";
import { ZEMIN_Y } from "./uzay";

const PARCACIKLAR = { parlama: () => undefined, duman: { ekle: () => undefined }, kivilcim: { ekle: () => undefined } } as unknown as ParcacikSistemi;
/** Eski (siluetsiz) mevziler: y ateş noktasının zemin üstü yüksekliği. */
const MEVZILER: DusmanMevzisi[] = [
  { x: -8.5, y: 7, z: -24 },
  { x: 8.5, y: 4.5, z: -31 },
  { x: 0, y: 27, z: -96.6 },
];
const DUNYA = MEVZILER.map((m) => new THREE.Vector3(m.x, ZEMIN_Y + m.y, m.z));

type Ic = {
  dusmanKaynagi(az: number): THREE.Vector3 | null;
  dusmanAtis(az: number, yayilim: number): void;
  izliAtis(az: number, yon: number): void;
  kaynakMevzi: boolean;
  salvoAtici: { no: number } | null;
  dusmanSalvoKalan: number;
  eklenecek: Array<{ p: THREE.Vector3; v: THREE.Vector3 }>;
};

function kur(mevziler = MEVZILER) {
  const s = new CatismaSistemi(PARCACIKLAR, { carpma: () => undefined, atis: () => undefined });
  const dusman = new DusmanKatmani();
  dusman.mevzileriAyarla(mevziler);
  s.aticiIste = (az, aci, taraf, kanal, yogunluk) => dusman.aticiIste(az, aci, taraf, kanal, yogunluk);
  s.aticiAtisOldu = (no) => dusman.atisOldu(no);
  return { s: s as unknown as Ic, dusman };
}

const enYakin = (p: THREE.Vector3) => Math.min(...DUNYA.map((m) => m.distanceTo(p)));

describe("çatışma: 3B alan mevzileri", () => {
  it("düşman yönünün ±30°'sinde mevzi varsa kaynak oradaki atıcıdır (pencere yüksekliğinde, küçük titremeyle)", () => {
    const { s } = kur();
    for (let i = 0; i < 20; i++) {
      const k = s.dusmanKaynagi(0)!;
      expect(s.kaynakMevzi).toBe(true);
      expect(enYakin(k)).toBeLessThan(0.8);
    }
  });

  it("o yönde mevzi yoksa eski uzak arazi kaynağı (150–260 m)", () => {
    const { s } = kur();
    const k = s.dusmanKaynagi(90)!;
    expect(s.kaynakMevzi).toBe(false);
    expect(s.salvoAtici).toBeNull();
    expect(Math.hypot(k.x, k.z)).toBeGreaterThanOrEqual(150);
  });

  it("salvonun bütün mermileri aynı mevziden çıkar", () => {
    const { s } = kur();
    const k = s.dusmanKaynagi(0)!;
    const mevzi = DUNYA.reduce((a, b) => (b.distanceTo(k) < a.distanceTo(k) ? b : a));
    for (let i = 0; i < 6; i++) {
      s.dusmanAtis(0, 30);
      expect(s.eklenecek.pop()!.p.distanceTo(mevzi)).toBeLessThan(0.8);
    }
  });

  it("mevziler patlamayla susturulunca salvo atılmaz; salvo sırasında susturulursa yarıda kesilir", () => {
    const { s, dusman } = kur();
    expect(s.dusmanKaynagi(0)).not.toBeNull();
    s.dusmanSalvoKalan = 5;
    // Üç mevziyi de kapsayan patlama (yatay 120 m): atıcı düşer
    dusman.patlamaOldu(new THREE.Vector3(0, ZEMIN_Y + 14, -50), 120);
    s.dusmanAtis(0, 30);
    expect(s.dusmanSalvoKalan).toBe(0);
    expect(s.eklenecek.length).toBe(0);
    expect(s.dusmanKaynagi(0)).toBeNull();
    expect(s.kaynakMevzi).toBe(true); // uzak araziye de düşmez: o yönde düşman sustu
  });

  it("izli mermi yan akışı (+90) sağ cepheden karşı kaldırıma çaprazlar; düz akış mevziden izleyiciye gelir", () => {
    const { s } = kur();
    s.izliAtis(0, 90);
    const capraz = s.eklenecek.pop()!;
    expect(capraz.p.x).toBeGreaterThan(0);
    expect(capraz.v.x).toBeLessThan(0);
    s.izliAtis(0, 0);
    const duz = s.eklenecek.pop()!;
    expect(enYakin(duz.p)).toBeLessThan(0.8);
  });
});
