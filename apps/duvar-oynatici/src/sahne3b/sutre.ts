/**
 * Oda 2 sütre katmanı: güvenli alan tipine göre ön plana 3B eşya dizilimi (kum torbası hattı,
 * kaya, HESCO, sandık...). Manifest `sutreler` bölümü: { "<guvenliAlan>": [{ dosya, azimut, mesafe,
 * yonDerece, boy, renk }] }. Konumlar sahne koordinatında (azimut 0 = orta duvar), panoramadan bağımsız;
 * sütre izleyicinin hemen önünde durduğundan her panoramada çalışır.
 */
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { radyan, yerKonumu } from "./uzay";

export interface SutreEsyasi {
  dosya: string;
  azimut: number;
  mesafe: number;
  yonDerece?: number;
  /** Hedef boy (m); verilmezse model ölçeği 1. */
  boy?: number;
  renk?: string;
}

export class SutreKatmani {
  readonly grup = new THREE.Group();
  private readonly yukleyici = new GLTFLoader();
  private readonly onbellek = new Map<string, Promise<GLTF>>();
  private aktifTip: string | null = null;
  private nesil = 0;

  private yukle(url: string) {
    let p = this.onbellek.get(url);
    if (!p) {
      p = this.yukleyici.loadAsync(url);
      this.onbellek.set(url, p);
    }
    return p;
  }

  temizle() {
    for (const c of [...this.grup.children]) this.grup.remove(c);
    this.aktifTip = null;
  }

  /** Dizilimi değiştirir; aynı tip zaten açıksa dokunmaz. */
  ayarla(tip: string | null, esyalar: SutreEsyasi[] | undefined, kok: string) {
    if (tip === this.aktifTip) return;
    this.temizle();
    this.aktifTip = tip;
    if (!tip || !esyalar?.length) return;
    const nesil = ++this.nesil;
    for (const e of esyalar) {
      const url = /^(https?:|data:|blob:|\/)/.test(e.dosya) ? e.dosya : kok + e.dosya;
      void this.yukle(url)
        .then((gltf) => {
          if (nesil !== this.nesil) return;
          const nesne = gltf.scene.clone(true);
          const boya = e.renk ? new THREE.Color(e.renk) : null;
          nesne.traverse((o) => {
            const m = o as THREE.Mesh;
            if (!m.isMesh) return;
            m.castShadow = true;
            m.receiveShadow = true;
            if (boya) {
              const uygula = (mal: THREE.Material) => {
                const k = mal.clone() as THREE.MeshStandardMaterial;
                if (k.color) {
                  const l = (k.color.r + k.color.g + k.color.b) / 3;
                  k.color.copy(boya).multiplyScalar(0.6 + l * 0.8);
                }
                return k;
              };
              m.material = Array.isArray(m.material) ? m.material.map(uygula) : uygula(m.material);
            }
          });
          nesne.updateMatrixWorld(true);
          const kutu = new THREE.Box3().setFromObject(nesne);
          const boyut = kutu.getSize(new THREE.Vector3());
          const olcek = e.boy && boyut.y > 1e-4 ? e.boy / boyut.y : 1;
          nesne.scale.setScalar(olcek);
          // Taban zemine, x/z merkezi yerleşim noktasına (orijinden uzak modeller için)
          const merkez = kutu.getCenter(new THREE.Vector3());
          nesne.position.set(-merkez.x * olcek, -kutu.min.y * olcek, -merkez.z * olcek);
          const sarmal = new THREE.Group();
          sarmal.add(nesne);
          sarmal.position.copy(yerKonumu(e.azimut, e.mesafe));
          sarmal.rotation.y = -radyan(e.azimut) + radyan(e.yonDerece ?? 0);
          this.grup.add(sarmal);
        })
        .catch(() => undefined);
    }
  }
}
