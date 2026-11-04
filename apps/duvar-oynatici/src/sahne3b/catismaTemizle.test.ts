/**
 * CatismaSistemi.temizle (sahne sıfırlaması, bölge değişimi): uçuştaki izler ve top mermileri silinir, salvo / dost /
 * top / izli sayaçları baştan. Eskiden uçuştaki tank mermisi temizlikten sonra uzak patlama (parçacık, flaş, ses) üretiyordu.
 */
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { CatismaSistemi } from "./catisma";
import type { ParcacikSistemi } from "./parcaciklar";

/** Çizim yok: parçacık sistemi yerine boş yöntemler. */
const PARCACIKLAR = { parlama: () => undefined, duman: { ekle: () => undefined }, kivilcim: { ekle: () => undefined } } as unknown as ParcacikSistemi;

describe("CatismaSistemi.temizle", () => {
  it("uçuştaki top mermisi de silinir; çatışma kapalıyken sonra uzak patlama ya da iz doğmaz, sayaçlar baştan", () => {
    let uzakPatlama = 0;
    const s = new CatismaSistemi(PARCACIKLAR, { carpma: () => undefined, atis: () => undefined, uzakPatlama: () => uzakPatlama++, topAtisi: () => undefined });
    s.agirSilahlar = () => [{ konum: new THREE.Vector3(5, 0, -20), namlu: new THREE.Vector3(5, 2.2, -23), yon: new THREE.Vector3(0, 0, -1) }];
    s.dostlar = () => [new THREE.Vector3(-3, 0, -6), new THREE.Vector3(3, 0, -6)];
    s.catismaAyarla({ aktif: true, siddet: 0.4, azimut: 0, dostAtes: true });
    s.izliAyarla({ aktif: true, azimut: 0, yon: 0, siklik: 4 });
    // İlk top atışı 2–6 sn içinde; mermi 0,55–0,8 sn uçar
    const mermiler = () => (s as unknown as { mermiler: unknown[] }).mermiler.length;
    for (let t = 0; t < 7 && mermiler() === 0; t += 0.05) s.guncelle(0.05);
    expect(mermiler()).toBeGreaterThan(0);
    expect(s.aktifIzSayisi).toBeGreaterThan(0);
    // Köprünün durum yayını önce çatışmayı ve izli mermiyi kapatır, sonra `sahne` mesajı temizler
    s.catismaAyarla({ aktif: false, siddet: 0.4, azimut: 0, dostAtes: true });
    s.izliAyarla({ aktif: false, azimut: 0, yon: 0, siklik: 4 });
    uzakPatlama = 0;
    s.temizle();
    expect(mermiler()).toBe(0);
    expect(s.aktifIzSayisi).toBe(0);
    for (let i = 0; i < 60; i++) s.guncelle(1 / 30);
    expect(uzakPatlama).toBe(0);
    expect(s.aktifIzSayisi).toBe(0);
    const ic = s as unknown as { dostSayaclar: Map<number, number>; topSayaclar: Map<number, number>; izliBirikim: number; dusmanSalvoKalan: number; uzakPatlamaSayac: number };
    expect(ic.dostSayaclar.size).toBe(0);
    expect(ic.topSayaclar.size).toBe(0);
    expect(ic.izliBirikim).toBe(0);
    expect(ic.dusmanSalvoKalan).toBe(0);
    expect(ic.uzakPatlamaSayac).toBe(20);
  });

  it("temizledikten sonra çatışma yeniden açılınca ateş yine başlar (ayarlar korunur)", () => {
    let atis = 0;
    const s = new CatismaSistemi(PARCACIKLAR, { carpma: () => undefined, atis: () => atis++ });
    s.dostlar = () => [new THREE.Vector3(0, 0, -6)];
    s.catismaAyarla({ aktif: true, siddet: 0.6, azimut: 30, dostAtes: true });
    for (let i = 0; i < 30; i++) s.guncelle(1 / 30);
    s.temizle();
    atis = 0;
    for (let i = 0; i < 90; i++) s.guncelle(1 / 30);
    expect(atis).toBeGreaterThan(0);
    expect(s.aktifIzSayisi).toBeGreaterThan(0);
  });
});
