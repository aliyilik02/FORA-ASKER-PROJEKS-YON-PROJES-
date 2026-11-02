/**
 * Sahne3B.sahneyiSifirla / temeleDondur: hasar, parçacıklar, çatışma izleri ve patlama ışığı temizlenir; arazi
 * kraterleri `kraterleriTemizle` (FPS turu, arazi.ts) varsa yerinde geri alınır ve değiştiyse figür/sütre zemine oturur,
 * yoksa eski yol (ızgara bir sonraki durumda yeniden kurulur). WebGL yok: sınıf kurucusuz, alanlar sahte.
 */
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { Sahne3B } from "./sahne3b";

function kur(arazi: Record<string, unknown>) {
  const cagrilar: string[] = [];
  const kayit = (ad: string) => () => {
    cagrilar.push(ad);
  };
  const s = Object.create(Sahne3B.prototype) as Sahne3B;
  const flas = new THREE.PointLight(0xffffff, 1234);
  Object.assign(s, {
    hasar: { temizle: kayit("hasar") },
    parcaciklar: { temizle: kayit("parcaciklar") },
    catisma: { temizle: kayit("catisma") },
    figurler: { temizle: kayit("figurler"), zemineOturt: kayit("figurler.zemin") },
    sutre: { zemineOturt: kayit("sutre.zemin") },
    flas,
    flasGuc: 0.8,
    araziBolge: "hibrit|kirsal_acik_arazi",
    arazi,
  });
  const ic = s as unknown as { flasGuc: number; araziBolge: string };
  return { s, cagrilar, flas, ic };
}

describe("Sahne3B sahne sıfırlaması", () => {
  it("kraterleriTemizle yoksa eski yol: arazi açıkken ızgara bir sonraki durumda yeniden kurulur; flaş söner", () => {
    const { s, cagrilar, flas, ic } = kur({ aktif: true });
    s.sahneyiSifirla();
    expect(cagrilar).toEqual(["hasar", "parcaciklar", "catisma"]);
    expect(ic.araziBolge).toBe("");
    expect(ic.flasGuc).toBe(0);
    expect(flas.intensity).toBe(0);
    const kapali = kur({ aktif: false });
    kapali.s.sahneyiSifirla();
    expect(kapali.ic.araziBolge).toBe("hibrit|kirsal_acik_arazi");
  });

  it("kraterleriTemizle varsa yerinde geri alınır (this bağlı); değiştiyse figür ve sütre yeni zemine oturur", () => {
    let cagiran: unknown = null;
    const arazi = {
      aktif: true,
      sonuc: true,
      kraterleriTemizle(this: { sonuc: boolean }) {
        cagiran = this;
        return this.sonuc;
      },
    };
    const { s, cagrilar, ic } = kur(arazi);
    s.sahneyiSifirla();
    expect(cagiran).toBe(arazi);
    expect(cagrilar).toEqual(["hasar", "parcaciklar", "catisma", "figurler.zemin", "sutre.zemin"]);
    expect(ic.araziBolge).toBe("hibrit|kirsal_acik_arazi");
    arazi.sonuc = false;
    cagrilar.length = 0;
    s.sahneyiSifirla();
    expect(cagrilar).toEqual(["hasar", "parcaciklar", "catisma"]);
  });

  it("temeleDondur: önce figürler (yüklenenler dahil), sonra sahneyiSifirla", () => {
    const { s, cagrilar } = kur({ aktif: false });
    s.temeleDondur();
    expect(cagrilar).toEqual(["figurler", "hasar", "parcaciklar", "catisma"]);
  });
});
