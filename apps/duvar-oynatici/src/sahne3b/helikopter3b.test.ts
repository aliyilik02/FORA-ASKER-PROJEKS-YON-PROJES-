/**
 * Helikopter3B rotor sesi konumu (ses.ts `helikopter(durum, toz, konum)`): uçuş modelinden sahne azimutu (derece),
 * izleyiciden yatay mesafe ve yerel zeminden irtifa; yokken ya da model yokken null; her karede aynı nesne (ayırma
 * yok). Model dosyası yüklenmez: boş bir grup "yüklenmiş model" yerine geçer (uçuş ve konum zinciri modelden bağımsız).
 */
import * as THREE from "three";
import { afterEach, describe, expect, it } from "vitest";
import { Helikopter3B } from "./helikopter3b";
import type { ParcacikSistemi } from "./parcaciklar";
import { zeminFonksiyonu, zeminY } from "./uzay";

/** Çizim yok: rotor tozu yayımı boş. */
const PARCACIKLAR = { rotorTozu: () => undefined } as unknown as ParcacikSistemi;

function kur(): Helikopter3B {
  const heli = new Helikopter3B(PARCACIKLAR);
  (heli as unknown as { model: THREE.Object3D }).model = new THREE.Group();
  return heli;
}

const derece = (rad: number) => (rad * 180) / Math.PI;

describe("Helikopter3B rotor sesi konumu (uçuş modelinden)", () => {
  afterEach(() => zeminFonksiyonu(null));

  it("yokken ya da model yüklenmemişken null; yerde iniş noktasında: azimut (derece), yatay mesafe, irtifa 0", () => {
    const modelsiz = new Helikopter3B(PARCACIKLAR);
    modelsiz.durumAyarla("yerde");
    expect(modelsiz.sesKonumu).toBeNull();

    const heli = kur();
    expect(heli.sesKonumu).toBeNull();
    heli.inisNoktasi(40, 42);
    heli.durumAyarla("yerde");
    for (let i = 0; i < 2; i++) {
      // durum değişince (ilk guncelle'den önce) de iniş noktasında; sonra da
      const k = heli.sesKonumu!;
      expect(k.azimut).toBeCloseTo(40, 6);
      expect(k.mesafe).toBeCloseTo(42, 6);
      expect(k.irtifa).toBe(0);
      heli.guncelle(1 / 60);
    }
    heli.durumAyarla("yok");
    expect(heli.sesKonumu).toBeNull();
  });

  it("uçarken çizilen konumla aynı yön ve yatay mesafe, irtifa yerel zeminden (eğimli arazi); hep aynı nesne", () => {
    // Eğimli arazi: helikopterin altındaki zemin iniş noktasınınkinden farklı (irtifa iniş noktasına göre olmamalı)
    zeminFonksiyonu((x, z) => 0.04 * x - 0.02 * z);
    const heli = kur();
    heli.inisNoktasi(-80, 45);
    let ilk: Helikopter3B["sesKonumu"] = null;
    let enYuksek = 0;
    const denetle = () => {
      const k = heli.sesKonumu;
      expect(k).not.toBeNull();
      ilk ??= k;
      expect(k).toBe(ilk);
      const p = heli.grup.position;
      expect(k!.azimut).toBeCloseTo(derece(Math.atan2(p.x, -p.z)), 6);
      expect(k!.mesafe).toBeCloseTo(Math.hypot(p.x, p.z), 6);
      // grup yüksekliği = yerel zemin + irtifa + askı salınımı (en çok 0,22 m)
      expect(Math.abs(p.y - zeminY(p.x, p.z) - k!.irtifa)).toBeLessThan(0.25);
      enYuksek = Math.max(enYuksek, k!.irtifa);
    };
    heli.durumAyarla("yaklasiyor");
    for (let i = 0; i < 20 * 60; i++) {
      heli.guncelle(1 / 60);
      denetle();
    }
    heli.durumAyarla("iniyor");
    for (let i = 0; i < 20 * 60; i++) {
      heli.guncelle(1 / 60);
      denetle();
    }
    expect(enYuksek).toBeGreaterThan(40);
    // İndi: iniş noktasında (birkaç metre içinde), irtifa ~0
    const yerde = heli.sesKonumu!;
    expect(Math.abs(yerde.azimut + 80)).toBeLessThan(4);
    expect(Math.abs(yerde.mesafe - 45)).toBeLessThan(3);
    expect(yerde.irtifa).toBeLessThan(0.05);
  });

  it("kalkıp görüş sınırını (1500 m) aşınca son konumda kalır (null değil: null konumsuz eski sesi tam seviyede açardı)", () => {
    const heli = kur();
    heli.inisNoktasi(12, 38);
    heli.durumAyarla("yerde");
    heli.durumAyarla("kalkiyor");
    for (let i = 0; i < 90 * 60; i++) heli.guncelle(1 / 60);
    expect(heli.grup.visible).toBe(false);
    const k = heli.sesKonumu!;
    expect(k).not.toBeNull();
    expect(k.mesafe).toBeGreaterThan(1400);
    const mesafe = k.mesafe;
    heli.guncelle(1);
    expect(heli.sesKonumu!.mesafe).toBe(mesafe);
    heli.durumAyarla("yok");
    expect(heli.sesKonumu).toBeNull();
  });
});
