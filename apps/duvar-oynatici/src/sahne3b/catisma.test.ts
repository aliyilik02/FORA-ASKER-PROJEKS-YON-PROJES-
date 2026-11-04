/**
 * Uzak izli mermi kalınlığı ve duvar geometrisi: piksel açısı çizilen duvarların kamerasından (DuvarKamerasi, simetrik
 * olmayan piramit) ölçülür. Ölçülmüş odada (`?oda=`) duvarların uzaklığı ve piksel en/boy oranı farklıdır; iz her
 * duvarda en az ~1,5 px kalsın diye yatay/dikey ve duvarlar arasında en büyük piksel açısı kullanılır. Ölçüsüz
 * yerleşimde (üç duvar aynı, kare piksel) değer önceki tek duvarlı formülle (2 / (elements[5] · yükseklik)) aynıdır.
 */
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { duvarYerlesimleri, odaDuvarlari, type OdaGeometrisi, type Yerlesim } from "../projeksiyon";
import { CatismaSistemi } from "./catisma";
import { DuvarKamerasi } from "./duvarKamerasi";
import type { ParcacikSistemi } from "./parcaciklar";

/** Çizim yok: parçacık sistemi yerine boş yöntemler. */
const PARCACIKLAR = { parlama: () => undefined, duman: { ekle: () => undefined }, kivilcim: { ekle: () => undefined } } as unknown as ParcacikSistemi;

/** sahne3b.ciz gibi: her duvar kendi viewport'unda kendi kamerasıyla çizilir (izlerin onBeforeRender'ı çağrılır). */
function ciz(mesh: THREE.InstancedMesh, yerlesimler: Yerlesim[]): DuvarKamerasi[] {
  const sahne = new THREE.Scene();
  const grup = new THREE.Group();
  return yerlesimler.map((y) => {
    const kam = new DuvarKamerasi(0.1, 3000);
    kam.duvaraAyarla(y.izdusum);
    const renderer = { getCurrentViewport: (v: THREE.Vector4) => v.set(y.x, 0, y.genislik, y.yukseklik) } as unknown as THREE.WebGLRenderer;
    mesh.onBeforeRender(renderer, sahne, kam, mesh.geometry, mesh.material as THREE.Material, grup);
    return kam;
  });
}

/** Duvarın piksel başına teğeti (optik eksende piksel açısı): yatay ve dikeyin büyüğü. */
const duvarPikselAcisi = (y: Yerlesim) => Math.max((y.izdusum.sag - y.izdusum.sol) / y.genislik, (y.izdusum.ust - y.izdusum.alt) / y.yukseklik);

/** Uzak izli mermi akışı + bir duvar çizimi; sonraki karede izlerin kalınlık / mesafe oranları. */
function kalinlikOranlari(yerlesimler: Yerlesim[]): { oranlar: number[]; kameralar: DuvarKamerasi[] } {
  const sistem = new CatismaSistemi(PARCACIKLAR, { carpma: () => undefined, atis: () => undefined });
  const mesh = sistem.grup.children[0] as THREE.InstancedMesh;
  sistem.izliAyarla({ aktif: true, azimut: 0, yon: 0, siklik: 600 });
  sistem.guncelle(1 / 60); // 10 iz, 150–300 m (piksel açısı henüz varsayılan)
  const kameralar = ciz(mesh, yerlesimler);
  sistem.izliAyarla({ aktif: false, azimut: 0, yon: 0, siklik: 600 });
  sistem.guncelle(1 / 60); // ölçülen piksel açısı bu karenin kalınlığına girer
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const oranlar: number[] = [];
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, m);
    m.decompose(p, q, s);
    // Taban kalınlığı (0,04 m) aşılmışsa kalınlık = mesafe · piksel açısı · 1,5
    if (s.x > 0.05) oranlar.push(s.x / (1.5 * p.length()));
  }
  return { oranlar, kameralar };
}

describe("uzak izli mermi kalınlığı (piksel açısı duvar kameralarından)", () => {
  it("ölçülmüş U odada (kaymış izleyici) duvarların en büyük piksel açısı: yatay ya da dikey, son çizilen duvar değil", () => {
    const oda: OdaGeometrisi = { tip: "u", on: 6, yan: 4, yukseklik: 3, alt: 0.3, izleyiciX: 0.8, izleyiciZ: 2.2, goz: 1.7 };
    const yer = duvarYerlesimleri(5760, 1080, odaDuvarlari(oda));
    const { oranlar, kameralar } = kalinlikOranlari(yer);
    expect(oranlar.length).toBeGreaterThan(5);
    const enBuyuk = Math.max(...yer.map(duvarPikselAcisi));
    for (const o of oranlar) expect(o / enBuyuk).toBeCloseTo(1, 4);
    // Önceki formül (son çizilen duvarın dikeyi) bu odada ~%13 küçük kalırdı: ön duvarda iz 1,5 px'in altına inerdi
    const son = kameralar[kameralar.length - 1].projectionMatrix.elements[5];
    const eski = 2 / (son * 1080);
    expect(enBuyuk).toBeGreaterThan(eski * 1.1);
    // En büyüğü ön duvarın yatayı (geniş, yakın duvar; pikseller kare değil)
    expect(enBuyuk).toBeCloseTo((yer[1].izdusum.sag - yer[1].izdusum.sol) / yer[1].genislik, 12);
  });

  it("iz tamponu: yalnız etkin aralık yüklenir (dinamik), iz yokken hiç yükleme yok", () => {
    const sistem = new CatismaSistemi(PARCACIKLAR, { carpma: () => undefined, atis: () => undefined });
    const mesh = sistem.grup.children[0] as THREE.InstancedMesh;
    const im = mesh.instanceMatrix;
    const ic = mesh.instanceColor!;
    expect(im.usage).toBe(THREE.DynamicDrawUsage);
    expect(ic.usage).toBe(THREE.DynamicDrawUsage);
    // İz yok: sürüm değişmez (yükleme yok)
    const v0 = im.version;
    const r0 = ic.version;
    for (let i = 0; i < 5; i++) sistem.guncelle(1 / 60);
    expect(im.version).toBe(v0);
    expect(ic.version).toBe(r0);
    // İzli akış: her karede yalnız [0, n) aralığı (önceki karelerin aralıkları birikmez)
    sistem.izliAyarla({ aktif: true, azimut: 0, yon: 0, siklik: 60 });
    for (let i = 0; i < 20; i++) sistem.guncelle(1 / 60);
    expect(mesh.count).toBeGreaterThan(5);
    expect(mesh.count).toBeLessThan(320);
    expect(im.version).toBeGreaterThan(v0);
    expect(im.updateRanges).toEqual([{ start: 0, count: mesh.count * 16 }]);
    expect(ic.updateRanges).toEqual([{ start: 0, count: mesh.count * 3 }]);
  });

  it("ölçüsüz yerleşimde (üç duvar aynı, kare piksel) değer önceki tek duvarlı formülle aynı", () => {
    const yer = duvarYerlesimleri(5760, 1080);
    const { oranlar, kameralar } = kalinlikOranlari(yer);
    expect(oranlar.length).toBeGreaterThan(5);
    const eski = 2 / (kameralar[2].projectionMatrix.elements[5] * 1080);
    for (const o of oranlar) expect(o / eski).toBeCloseTo(1, 4);
    // 90° duvar, 1920 px: optik eksende ~0,06° / px (izliYol.ts ölçülene kadarki varsayılanı 0,054° ile aynı ölçek)
    expect(THREE.MathUtils.radToDeg(eski)).toBeCloseTo(0.0597, 3);
  });
});
