/**
 * Kalıcı hasar: krater çıkartmaları (decal) ve kraterden tüten duman.
 *
 * Patlama bittikten sonra zemin "değişmiş" kalmalı; her patlama için yeni panorama üretmek yerine
 * zemin düzlemine alfa kanallı krater yatırılır. Bölge değişince veya panelden "temizle" gelince silinir.
 */
import * as THREE from "three";
import type { ParcacikSistemi } from "./parcaciklar";

interface Krater {
  mesh: THREE.Mesh;
  moloz: THREE.InstancedMesh;
  konum: THREE.Vector3;
  yaricap: number;
  siddet: number;
  dumanKalan: number; // saniye
  sayac: number;
}

const MOLOZ_GEOMETRI = new THREE.IcosahedronGeometry(1, 0);
const MOLOZ_MALZEME = new THREE.MeshStandardMaterial({ color: 0x6e5a42, roughness: 1, metalness: 0 });

export class HasarKatmani {
  readonly grup = new THREE.Group();
  private kraterler: Krater[] = [];
  private dokular: THREE.Texture[];
  private static readonly EN_COK = 40;

  constructor(dokular: THREE.Texture[], private readonly parcaciklar: ParcacikSistemi) {
    this.dokular = dokular;
  }

  dokulariAyarla(dokular: THREE.Texture[]) {
    if (dokular.length) this.dokular = dokular;
  }

  get sayi() {
    return this.kraterler.length;
  }

  /** Zemine krater yatırır. `yaricap` metre; duman süresi şiddete göre 30–90 sn. */
  krater(konum: THREE.Vector3, yaricap: number, siddet: number) {
    const doku = this.dokular[Math.floor(Math.random() * this.dokular.length)];
    const m = new THREE.MeshStandardMaterial({
      map: doku,
      transparent: true,
      roughness: 1,
      metalness: 0,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const g = new THREE.PlaneGeometry(yaricap * 2, yaricap * 2);
    const mesh = new THREE.Mesh(g, m);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = Math.random() * Math.PI * 2;
    mesh.position.copy(konum);
    mesh.position.y += 0.01 + this.kraterler.length * 0.001; // üst üste binenlerde z-fighting önleme
    mesh.receiveShadow = true;
    mesh.renderOrder = 5 + this.kraterler.length;
    this.grup.add(mesh);
    // Savrulmuş toprak kesekleri: düz çıkartma eğik bakışta kaybolur, 3B moloz krateri "okunur" kılar
    const adet = 14 + Math.round(siddet * 16);
    const moloz = new THREE.InstancedMesh(MOLOZ_GEOMETRI, MOLOZ_MALZEME, adet);
    const mat = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const olcekV = new THREE.Vector3();
    for (let i = 0; i < adet; i++) {
      const aci = Math.random() * Math.PI * 2;
      const r = yaricap * (0.45 + Math.pow(Math.random(), 0.6) * 0.9);
      const boyut = (0.04 + Math.random() * 0.09) * (0.7 + siddet * 0.6);
      q.setFromEuler(new THREE.Euler(Math.random() * 3, Math.random() * 3, Math.random() * 3));
      olcekV.set(boyut * (0.7 + Math.random()), boyut * 0.6, boyut * (0.7 + Math.random()));
      mat.compose(new THREE.Vector3(konum.x + Math.cos(aci) * r, konum.y + boyut * 0.3, konum.z + Math.sin(aci) * r), q, olcekV);
      moloz.setMatrixAt(i, mat);
    }
    moloz.castShadow = true;
    moloz.receiveShadow = true;
    moloz.instanceMatrix.needsUpdate = true;
    this.grup.add(moloz);
    this.kraterler.push({ mesh, moloz, konum: konum.clone(), yaricap, siddet, dumanKalan: 30 + siddet * 60, sayac: 0 });
    if (this.kraterler.length > HasarKatmani.EN_COK) this.kaldir(this.kraterler[0]);
  }

  private kaldir(k: Krater) {
    this.grup.remove(k.mesh, k.moloz);
    k.mesh.geometry.dispose();
    (k.mesh.material as THREE.Material).dispose();
    k.moloz.dispose();
    this.kraterler = this.kraterler.filter((x) => x !== k);
  }

  temizle() {
    for (const k of [...this.kraterler]) this.kaldir(k);
  }

  guncelle(dt: number) {
    for (const k of this.kraterler) {
      if (k.dumanKalan <= 0) continue;
      k.dumanKalan -= dt;
      k.sayac += dt;
      // Zamanla seyrelen duman: başta saniyede ~6 topak, sonda ~1
      const oran = k.dumanKalan / (30 + k.siddet * 60);
      const aralik = 1 / (1 + 5 * oran);
      while (k.sayac >= aralik) {
        k.sayac -= aralik;
        this.parcaciklar.tutenDuman(k.konum, k.yaricap, k.siddet * (0.4 + 0.6 * oran));
      }
    }
  }
}
