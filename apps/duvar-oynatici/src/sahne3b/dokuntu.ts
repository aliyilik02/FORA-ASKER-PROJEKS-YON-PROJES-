/**
 * Döküntü katmanı (film görünümü, 11 Kasım 2026): yıkık binaların önüne ve caddeye saçılmış tuğla kırığı, beton
 * parçası ve sıva kırıntısı. Büyük moloz yığınları taranmış modeldir (alan.ts); bu katman onların çevresini ve boş
 * asfaltı küçük parçalarla doldurur. Tek InstancedMesh türü başına bir çizim çağrısı, gölge düşürmez (yalnız alır).
 *
 * Plan (manifest `alanlar.<bolge>_film.dokuntu`): [{ x, z, yaricap, adet, tugla? }] — merkezde sık, kenara seyrek.
 */
import * as THREE from "three";
import { mulberry32 } from "../projeksiyon";
import { zeminY } from "./uzay";

export interface DokuntuObegi {
  x: number;
  z: number;
  /** Saçılma yarıçapı (m): parçaların ~%85'i bunun içinde. */
  yaricap: number;
  adet: number;
  /** Tuğla kırığı oranı 0–1 (kalanı beton/sıva grisi); varsayılan 0,35. */
  tugla?: number;
  /** Dağ taşı kırığı (boz/bej, biraz iri): tuğla ve beton yerine. */
  tas?: boolean;
}

/** Zemine oturan asfalt/parke payı: parçalar yüzeyin üstünde dursun. */
const TABAN_PAYI = 0.035;

/** Köşeleri rastgele kaydırılmış kutu: kırık parça. */
function parcaGeometrisi(tohum: number): THREE.BufferGeometry {
  const r = mulberry32(tohum);
  const g = new THREE.BoxGeometry(1, 1, 1, 1, 1, 1).toNonIndexed();
  const p = g.getAttribute("position") as THREE.BufferAttribute;
  // Aynı köşe üç yüzde yinelenir: kaydırma köşe konumuna göre belirlensin ki yüzler ayrılmasın
  const kayma = new Map<string, [number, number, number]>();
  for (let i = 0; i < p.count; i++) {
    const anahtar = `${p.getX(i)},${p.getY(i)},${p.getZ(i)}`;
    let k = kayma.get(anahtar);
    if (!k) {
      k = [(r() - 0.5) * 0.5, (r() - 0.5) * 0.4, (r() - 0.5) * 0.5];
      kayma.set(anahtar, k);
    }
    p.setXYZ(i, p.getX(i) + k[0], p.getY(i) + k[1], p.getZ(i) + k[2]);
  }
  g.computeVertexNormals();
  return g;
}

export class DokuntuKatmani {
  readonly grup = new THREE.Group();
  private aktif: DokuntuObegi[] | null = null;
  private aglar: THREE.InstancedMesh[] = [];
  private readonly malzeme = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, flatShading: true });

  ayarla(obekler: DokuntuObegi[] | null | undefined) {
    const yeni = obekler && obekler.length ? obekler : null;
    if (yeni === this.aktif) return;
    this.temizle();
    this.aktif = yeni;
    if (!yeni) return;
    const TUR = 3;
    const toplam = yeni.reduce((t, o) => t + o.adet, 0);
    const r = mulberry32(4711);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const renk = new THREE.Color();
    const sayac = new Array<number>(TUR).fill(0);
    for (let t = 0; t < TUR; t++) {
      const ag = new THREE.InstancedMesh(parcaGeometrisi(31 + t * 17), this.malzeme, Math.ceil(toplam / TUR) + yeni.length);
      ag.castShadow = false;
      ag.receiveShadow = true;
      ag.frustumCulled = false;
      this.aglar.push(ag);
      this.grup.add(ag);
    }
    let sira = 0;
    for (const o of yeni) {
      const tuglaOrani = o.tugla ?? 0.35;
      for (let i = 0; i < o.adet; i++) {
        // Merkezde sık: iki düzgün dağılımın çarpımı
        const d = o.yaricap * 1.15 * r() * Math.sqrt(r());
        const a = r() * Math.PI * 2;
        const x = o.x + Math.cos(a) * d;
        const z = o.z + Math.sin(a) * d;
        const tugla = !o.tas && r() < tuglaOrani;
        // Çoğu küçük kırıntı, az sayıda iri parça
        const iri = r();
        const boy = (tugla ? 0.07 + r() * 0.09 : iri > 0.97 ? 0.18 + r() * 0.2 : 0.03 + r() * 0.09) * (o.tas ? 0.75 : 1);
        const en = boy * (tugla ? 0.5 : 0.5 + r() * 0.6);
        const kalin = tugla ? boy * 0.3 : boy * (0.18 + r() * 0.4);
        e.set((r() - 0.5) * 0.5, r() * Math.PI * 2, (r() - 0.5) * 0.5);
        q.setFromEuler(e);
        m4.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(boy, kalin, en));
        const t = sira++ % TUR;
        const ag = this.aglar[t];
        const k = sayac[t]++;
        if (k >= ag.instanceMatrix.count) continue;
        ag.setMatrixAt(k, m4);
        const ton = 0.75 + r() * 0.4;
        // Doğrusal renk: asfalttan biraz açık gri, soluk tuğla; parlak beyaz parça oyuncak gibi duruyordu
        if (o.tas) renk.setRGB(0.13 * ton, 0.115 * ton, 0.095 * ton).multiplyScalar(r() < 0.3 ? 0.55 : 1);
        else if (tugla) renk.setRGB(0.2 * ton, 0.1 * ton, 0.075 * ton);
        else if (r() < 0.3) renk.setRGB(0.05 * ton, 0.05 * ton, 0.048 * ton);
        else renk.setRGB(0.19 * ton, 0.18 * ton, 0.165 * ton);
        ag.setColorAt(k, renk);
      }
    }
    this.aglar.forEach((ag, t) => {
      ag.count = sayac[t];
      if (ag.instanceColor) ag.instanceColor.needsUpdate = true;
    });
    this.zemineOturt();
  }

  /** Kış: küçük kırıntı kar altında kalır (karın üstünde koyu leke gibi duruyordu). */
  karAyarla(kar: number) {
    this.grup.visible = kar < 0.5;
  }

  /** Parçaları (yeni) zemine oturtur: yarı kalınlıkları kadar yukarıda. */
  zemineOturt() {
    const m4 = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    for (const ag of this.aglar) {
      for (let i = 0; i < ag.count; i++) {
        ag.getMatrixAt(i, m4);
        m4.decompose(p, q, s);
        p.y = zeminY(p.x, p.z) + TABAN_PAYI + s.y * 0.35;
        m4.compose(p, q, s);
        ag.setMatrixAt(i, m4);
      }
      ag.instanceMatrix.needsUpdate = true;
    }
  }

  temizle() {
    for (const ag of this.aglar) {
      this.grup.remove(ag);
      ag.geometry.dispose();
      ag.dispose();
    }
    this.aglar = [];
    this.aktif = null;
  }
}
