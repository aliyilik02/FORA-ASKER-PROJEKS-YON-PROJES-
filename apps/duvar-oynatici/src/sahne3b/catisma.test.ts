/**
 * Mermi izi çizimi (izCizimi.ts: ekran uzayında kapsül) ve izli mermi oranı. Kalınlığın piksel alt sınırı artık
 * gölgelendiricide, duvar başına hesaplanır (her duvar kendi görüş alanını `uCozunurluk` ile verir); burada işlemci
 * tarafı sınanır: çizgi verisi, yükleme aralıkları, izli/izsiz mermi, namlu alevi.
 */
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { CatismaSistemi } from "./catisma";
import type { ParcacikSistemi } from "./parcaciklar";

/** Çizim yok: parçacık sistemi yerine boş yöntemler. */
const PARCACIKLAR = { parlama: () => undefined, duman: { ekle: () => undefined }, kivilcim: { ekle: () => undefined } } as unknown as ParcacikSistemi;

type Ic = {
  dusmanAtis(az: number, yayilim: number): void;
  dostAtis(konum: THREE.Vector3, namlu?: THREE.Vector3): void;
  salvoIlkAtis: boolean;
  eklenecek: Array<{ gorunur: boolean; dost: boolean }>;
  izler: Array<{ p: THREE.Vector3; v: THREE.Vector3; gorunur: boolean; yol: number }>;
};

const kur = () => new CatismaSistemi(PARCACIKLAR, { carpma: () => undefined, atis: () => undefined });
const oznitelikler = (s: CatismaSistemi) => Object.values((s.cizici.mesh.geometry as THREE.InstancedBufferGeometry).attributes).filter((a) => (a as THREE.InstancedBufferAttribute).isInstancedBufferAttribute) as THREE.InstancedBufferAttribute[];

describe("mermi izi çizimi", () => {
  it("iz tamponu: yalnız etkin aralık yüklenir (dinamik), iz yokken yükleme de çizim de yok", () => {
    const sistem = kur();
    const g = sistem.cizici.mesh.geometry as THREE.InstancedBufferGeometry;
    const oz = oznitelikler(sistem);
    expect(oz.length).toBe(4);
    for (const o of oz) expect(o.usage).toBe(THREE.DynamicDrawUsage);
    const surumler = oz.map((o) => o.version);
    for (let i = 0; i < 5; i++) sistem.guncelle(1 / 60);
    expect(oz.map((o) => o.version)).toEqual(surumler);
    expect(g.instanceCount).toBe(0);
    expect(sistem.cizici.mesh.visible).toBe(false);
    // İzli akış: her karede yalnız [0, n) aralığı (önceki karelerin aralıkları birikmez)
    sistem.izliAyarla({ aktif: true, azimut: 0, yon: 0, siklik: 60 });
    for (let i = 0; i < 20; i++) sistem.guncelle(1 / 60);
    const n = g.instanceCount;
    expect(n).toBeGreaterThan(5);
    expect(n).toBeLessThan(320);
    expect(sistem.cizici.mesh.visible).toBe(true);
    for (const o of oz) expect(o.updateRanges).toEqual([{ start: 0, count: n * o.itemSize }]);
  });

  it("kuyruk başın gerisinde hız doğrultusundadır ve namlunun gerisine uzamaz", () => {
    const sistem = kur();
    sistem.izliAyarla({ aktif: true, azimut: 0, yon: 0, siklik: 600 });
    sistem.guncelle(1 / 60); // 10 iz doğar ve bir kare ilerler (2,3–3,2 m yol)
    sistem.izliAyarla({ aktif: false, azimut: 0, yon: 0, siklik: 600 });
    const ic = sistem as unknown as Ic;
    expect(sistem.cizici.sayi).toBe(ic.izler.length);
    for (let i = 0; i < sistem.cizici.sayi; i++) {
      const c = sistem.cizici.cizgi(i);
      const iz = ic.izler[i];
      expect(c.bas.distanceTo(iz.p)).toBeLessThan(1e-3);
      const kuyruk = c.kuyruk.clone().sub(c.bas);
      // Kuyruk hızın tersi yönünde
      expect(kuyruk.clone().normalize().dot(iz.v.clone().normalize())).toBeLessThan(-0.999);
      // İlk karede iz henüz kısa: gidilen yoldan uzun olamaz (float32 payıyla)
      expect(kuyruk.length()).toBeLessThanOrEqual(iz.yol + 1e-3);
    }
    // Uçuş sürdükçe iz uzar ama sınırlı kalır (yakında ≤ 5 m, 150 m ve ötesinde ≤ 9 m)
    for (let k = 0; k < 10; k++) sistem.guncelle(1 / 60);
    for (let i = 0; i < sistem.cizici.sayi; i++) {
      const c = sistem.cizici.cizgi(i);
      const u = c.kuyruk.distanceTo(c.bas);
      expect(u).toBeGreaterThan(2.5);
      expect(u).toBeLessThanOrEqual(9.001);
      expect(c.yaricap).toBeLessThan(0.02); // çekirdek ince: "çubuk" değil
    }
  });

  it("çatışmada düşman mermilerinin yarısı izlidir (salvonun ilki hep izli); izli akışta hepsi", () => {
    const sistem = kur();
    const ic = sistem as unknown as Ic;
    ic.salvoIlkAtis = true;
    for (let i = 0; i < 20; i++) ic.dusmanAtis(0, 30);
    expect(ic.eklenecek[0].gorunur).toBe(true);
    const izli = ic.eklenecek.filter((e) => e.gorunur).length;
    expect(izli).toBeGreaterThanOrEqual(10);
    expect(izli).toBeLessThanOrEqual(11);
    // İzsiz mermi çizilmez ama uçar
    sistem.guncelle(1 / 60);
    expect(sistem.cizici.sayi).toBe(ic.izler.filter((z) => z.gorunur).length);
    expect(ic.izler.length).toBe(20);
    // İzli mermi akışı (panel): her mermi izli
    const akis = kur();
    akis.izliAyarla({ aktif: true, azimut: 0, yon: 0, siklik: 600 });
    akis.guncelle(1 / 60);
    expect((akis as unknown as Ic).izler.every((z) => z.gorunur)).toBe(true);
  });

  it("dost ateşinde üç mermide bir izli; namlu alevi atışla çıkar ve 50 ms'de söner", () => {
    const sistem = kur();
    const ic = sistem as unknown as Ic;
    for (let i = 0; i < 9; i++) ic.dostAtis(new THREE.Vector3(2, -1.7, -5));
    expect(ic.eklenecek.filter((e) => e.gorunur).length).toBe(3);
    sistem.guncelle(1 / 120);
    // 3 izli mermi + 9 namlu alevi
    expect(sistem.cizici.sayi).toBe(12);
    // Alev namludan (asker + 1,35 m) düşman yönüne (−z) kısa bir kapsül
    const alev = sistem.cizici.cizgi(sistem.cizici.sayi - 1);
    expect(alev.kuyruk.y).toBeCloseTo(-1.7 + 1.35, 3);
    expect(alev.bas.z).toBeLessThan(alev.kuyruk.z);
    expect(alev.bas.distanceTo(alev.kuyruk)).toBeLessThan(0.45);
    for (let i = 0; i < 6; i++) sistem.guncelle(1 / 60);
    expect(sistem.cizici.sayi).toBe(3);
  });

  it("her duvar kendi görüş alanını gölgelendiriciye verir (piksel alt sınırı duvar başına)", () => {
    const sistem = kur();
    const mesh = sistem.cizici.mesh;
    const u = (mesh.material as THREE.ShaderMaterial).uniforms;
    const duvar = (g: number, y: number) => ({ getCurrentViewport: (v: THREE.Vector4) => v.set(0, 0, g, y) }) as unknown as THREE.WebGLRenderer;
    const cagir = (r: THREE.WebGLRenderer) => mesh.onBeforeRender(r, new THREE.Scene(), new THREE.PerspectiveCamera(), mesh.geometry, mesh.material as THREE.Material, new THREE.Group());
    cagir(duvar(1920, 1080));
    expect((u.uCozunurluk.value as THREE.Vector2).toArray()).toEqual([1920, 1080]);
    cagir(duvar(2880, 1080));
    expect((u.uCozunurluk.value as THREE.Vector2).toArray()).toEqual([2880, 1080]);
    // Çekirdek yarıçapı en az 0,75 px (≈ 1,5 px genişlik)
    expect(u.uEnAzPiksel.value).toBeCloseTo(0.75);
  });

  it("sıfırlama izleri ve alevleri temizler; gündüz izler soluk", () => {
    const sistem = kur();
    sistem.izliAyarla({ aktif: true, azimut: 0, yon: 0, siklik: 120 });
    for (let i = 0; i < 10; i++) sistem.guncelle(1 / 60);
    expect(sistem.cizici.sayi).toBeGreaterThan(0);
    sistem.temizle();
    expect(sistem.cizici.sayi).toBe(0);
    expect(sistem.cizici.mesh.visible).toBe(false);
    sistem.isik = 1;
    expect(sistem.cizici.parlaklik).toBeCloseTo(0.55);
    sistem.isik = 0;
    expect(sistem.cizici.parlaklik).toBeCloseTo(1);
  });
});
