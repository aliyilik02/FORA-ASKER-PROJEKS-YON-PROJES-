import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { ParcacikGrubu, ParcacikSistemi } from "./parcaciklar";
import { ROTOR_TOZU_PROFILLERI, type RotorTozuTuru } from "./rotorTozu";

const DT = 1 / 60;
const ZEMIN = -1.7;
const MERKEZ = new THREE.Vector3(0, ZEMIN, -38);
const sistem = () => new ParcacikSistemi(new THREE.Texture(), new THREE.Texture(), new THREE.Texture(), 1);

/** `sure` saniye boyunca sabit şiddette rotor tozu yayar (60 fps). */
function savur(tur: RotorTozuTuru, siddet: number, sure: number) {
  const s = sistem();
  for (let t = 0; t < sure; t += DT) {
    s.rotorTozu(MERKEZ, 5.5, siddet, DT, ROTOR_TOZU_PROFILLERI[tur]);
    s.guncelle(DT);
  }
  return s;
}

describe("ParcacikGrubu havuzu", () => {
  it("ölen parçacığın nesnesi yeniden kullanılır, kapasite aşılmaz", () => {
    const g = new ParcacikGrubu(new THREE.Texture(), 4, "normal", true);
    const p = g.al();
    p.t = 0;
    p.sure = 0.1;
    g.ekle(p);
    g.guncelle(0.2);
    expect(g.sayi).toBe(0);
    expect(g.al()).toBe(p);
    for (let i = 0; i < 10; i++) {
      const q = g.al();
      q.t = 0;
      q.sure = 5;
      g.ekle(q);
    }
    expect(g.sayi).toBe(4);
  });
});

describe("ParcacikGrubu tampon yüklemesi", () => {
  it("parçacık yokken yükleme yok; varken yalnız canlı aralık (kapasitenin tamamı değil)", () => {
    const g = new ParcacikGrubu(new THREE.Texture(), 50, "normal", true);
    const oz = g.mesh.geometry.attributes as Record<string, THREE.InstancedBufferAttribute>;
    const adlar = ["konum", "boyut", "alfa", "aci", "renk"];
    const surum = () => adlar.map((a) => oz[a].version);
    const once = surum();
    g.guncelle(DT);
    expect(surum()).toEqual(once);
    for (let i = 0; i < 3; i++) {
      const p = g.al();
      p.t = 0;
      p.sure = 5;
      g.ekle(p);
    }
    g.guncelle(DT);
    g.guncelle(DT); // aralıklar birikmez
    for (const a of adlar) {
      expect(oz[a].version).toBeGreaterThan(once[adlar.indexOf(a)]);
      expect(oz[a].updateRanges).toEqual([{ start: 0, count: 3 * oz[a].itemSize }]);
    }
  });
});

describe("rotorTozu", () => {
  it("tam şiddette bile canlı parçacık sayısı sınırlı (kapasitenin çok altında)", () => {
    for (const tur of Object.keys(ROTOR_TOZU_PROFILLERI) as RotorTozuTuru[]) {
      const s = savur(tur, 1, 10);
      expect(s.duman.sayi).toBeGreaterThan(60);
      expect(s.duman.sayi).toBeLessThan(450);
      expect(s.kivilcim.sayi).toBeLessThan(60);
    }
  });

  it("şiddet sıfıra yakınken toz yok; beton tozu topraktan az, kar daha çok ve uzun asılı", () => {
    expect(savur("toprak", 0.01, 3).duman.sayi).toBe(0);
    const toprak = savur("toprak", 0.8, 8).duman.sayi;
    expect(savur("beton", 0.8, 8).duman.sayi).toBeLessThan(toprak * 0.8);
    expect(savur("kar", 0.8, 8).duman.sayi).toBeGreaterThan(toprak);
    expect(savur("kar", 0.8, 8).kivilcim.sayi).toBeGreaterThan(0); // güneşte parıltı
    expect(savur("toprak", 0.8, 8).kivilcim.sayi).toBe(0);
  });

  it("toz diskin altından dışa akar, zemine yakın kalır ve 1–2 rotor çapında halka olur", () => {
    const s = savur("toprak", 1, 6);
    let disa = 0;
    let alcak = 0;
    let halkada = 0;
    const ps = s.duman.parcaciklar;
    for (const p of ps) {
      const dx = p.x - MERKEZ.x;
      const dz = p.z - MERKEZ.z;
      const r = Math.hypot(dx, dz);
      if (dx * p.vx + dz * p.vz > 0) disa++;
      if (p.y - ZEMIN < 6) alcak++;
      if (r > 5.5 && r < 25) halkada++;
    }
    expect(disa / ps.length).toBeGreaterThan(0.6);
    expect(alcak / ps.length).toBeGreaterThan(0.75);
    expect(halkada / ps.length).toBeGreaterThan(0.6);
  });

  it("renk zemin profilinden: orman koyu, kar parlak mavimsi, beton gri", () => {
    const ortalama = (tur: RotorTozuTuru) => {
      const s = savur(tur, 0.15, 3); // kırıntısız: yalnız toz rengi
      const r = [0, 0, 0];
      for (const p of s.duman.parcaciklar) for (let i = 0; i < 3; i++) r[i] += p.renk[i] / s.duman.sayi;
      return r;
    };
    const kar = ortalama("kar");
    const orman = ortalama("orman");
    const beton = ortalama("beton");
    const toprak = ortalama("toprak");
    expect(kar[2]).toBeGreaterThan(kar[0]);
    expect(kar[0] + kar[1] + kar[2]).toBeGreaterThan(toprak[0] + toprak[1] + toprak[2]);
    expect(orman[0] + orman[1] + orman[2]).toBeLessThan(toprak[0] + toprak[1] + toprak[2]);
    expect(Math.abs(beton[0] - beton[2])).toBeLessThan(0.05);
  });
});
