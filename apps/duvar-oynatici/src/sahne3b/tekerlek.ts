/**
 * Tekerlek ayırma: tek ağda toplanmış tekerlekleri (Sketchfab Kirpi'de "wheels" malzemeli ağ: dört tekerlek + arkadaki
 * yedek + bijonlar) aks başına ayrı ağlara böler ki araç ilerlerken dönebilsinler.
 *
 * Yöntem: ağın üçgenleri model kökü koordinatına alınır; ağırlık merkezi bir aksın çevresindeki silindire (yarıçap ×
 * 1,08; yan yüz |x| ≥ `enAzX`) düşen üçgen o aksa, kalanı (yedek tekerlek, çamurluk parçası) sabit ağa gider. Aks başına
 * bir eksen düğümü kurulur (dönüş ekseni x, aksın merkezinden geçer): iki yandaki tekerlek aynı düğümde döner.
 * Köşe verisi kopyalanmaz (aynı öznitelikler, ayrı dizinler).
 */
import * as THREE from "three";

export interface TekerlekAyari {
  /** Tekerleklerin ağını tanıtan malzeme adı. */
  malzeme: string;
  /** Tekerlek yarıçapı ve aks yüksekliği (m, model kökünde; taban y = 0). */
  yaricap: number;
  y: number;
  /** Aksların z konumları (m, ön +z). */
  akslar: number[];
  /** Tekerleğin iç yüzünün |x| alt sınırı (m): ortadaki şaft/diferansiyel dönmesin. */
  enAzX: number;
}

export interface AyrilmisTekerlekler {
  /** Aks düğümleri (rotation.x ile döner). */
  akslar: THREE.Group[];
  yaricap: number;
}

export function tekerlekleriAyir(kok: THREE.Object3D, ayar: TekerlekAyari): AyrilmisTekerlekler | null {
  kok.updateMatrixWorld(true);
  let hedef: THREE.Mesh | null = null;
  kok.traverse((o) => {
    const m = o as THREE.Mesh;
    if (hedef || !m.isMesh) return;
    const mal = Array.isArray(m.material) ? m.material[0] : m.material;
    if (mal?.name === ayar.malzeme) hedef = m;
  });
  const ag = hedef as THREE.Mesh | null;
  if (!ag) return null;
  // Ağ → kök koordinatı
  const goreli = new THREE.Matrix4().copy(kok.matrixWorld).invert().multiply(ag.matrixWorld);
  const g = ag.geometry.clone().applyMatrix4(goreli);
  const konum = g.getAttribute("position");
  const dizin = g.getIndex();
  const ucgenSayisi = (dizin ? dizin.count : konum.count) / 3;
  const I = (i: number) => (dizin ? dizin.getX(i) : i);
  const kovalar: number[][] = ayar.akslar.map(() => []);
  const kalan: number[] = [];
  const sinir = ayar.yaricap * 1.08;
  for (let t = 0; t < ucgenSayisi; t++) {
    const a = I(t * 3);
    const b = I(t * 3 + 1);
    const c = I(t * 3 + 2);
    const cx = (konum.getX(a) + konum.getX(b) + konum.getX(c)) / 3;
    const cy = (konum.getY(a) + konum.getY(b) + konum.getY(c)) / 3;
    const cz = (konum.getZ(a) + konum.getZ(b) + konum.getZ(c)) / 3;
    let aks = -1;
    if (Math.abs(cx) >= ayar.enAzX) for (let k = 0; k < ayar.akslar.length; k++) if (Math.hypot(cy - ayar.y, cz - ayar.akslar[k]) <= sinir) aks = k;
    (aks >= 0 ? kovalar[aks] : kalan).push(a, b, c);
  }
  if (kovalar.every((k) => k.length === 0)) return null;
  const parca = (dizinler: number[]) => {
    const p = new THREE.BufferGeometry();
    for (const ad of Object.keys(g.attributes)) p.setAttribute(ad, g.getAttribute(ad));
    p.setIndex(dizinler);
    // Sınırlar yalnız bu parçanın köşelerinden (three öznitelikteki bütün köşeleri sayar: paylaşılan veride parça
    // bütün ağ kadar görünür, ayıklama ve ölçüm yanlış olurdu)
    const kutu = new THREE.Box3();
    const v = new THREE.Vector3();
    for (const i of dizinler) kutu.expandByPoint(v.fromBufferAttribute(konum, i));
    p.boundingBox = kutu;
    p.boundingSphere = kutu.getBoundingSphere(new THREE.Sphere());
    return p;
  };
  const ornek = (geometri: THREE.BufferGeometry) => {
    const m = new THREE.Mesh(geometri, ag.material);
    m.castShadow = ag.castShadow;
    m.receiveShadow = ag.receiveShadow;
    return m;
  };
  const akslar: THREE.Group[] = [];
  ayar.akslar.forEach((z, k) => {
    if (!kovalar[k].length) return;
    const eksen = new THREE.Group();
    eksen.name = `aks_${k}`;
    eksen.position.set(0, ayar.y, z);
    const m = ornek(parca(kovalar[k]));
    m.position.set(0, -ayar.y, -z); // geometri kök koordinatında: eksen düğümü aks merkezinde döner
    eksen.add(m);
    kok.add(eksen);
    akslar.push(eksen);
  });
  if (kalan.length) {
    const sabit = ornek(parca(kalan));
    sabit.name = "tekerlek_sabit";
    kok.add(sabit);
  }
  ag.visible = false;
  ag.removeFromParent();
  return { akslar, yaricap: ayar.yaricap };
}
