/**
 * Duvar kamerası: genelleştirilmiş perspektif izdüşümü (Kooima). Göz başlangıç noktasında; yön duvar düzleminin
 * eksenlerinden (sağ, yukarı, izleyiciye dönük normal), izdüşüm simetrik olmayan (off-axis) kesik piramitten.
 *
 * three'nin `updateProjectionMatrix()`'i fov/aspect'ten simetrik piramit kurar; burada ezilir, böylece bir
 * yardımcı (ya da ileride eklenen kod) çağırsa da duvar izdüşümü bozulmaz. `fov`/`aspect` yalnız bilgi amaçlı
 * eşdeğerlerdir (dikey açı aralığı, sınır oranı).
 */
import * as THREE from "three";
import type { DuvarIzdusumu } from "../projeksiyon";

const matris = new THREE.Matrix4();
const sag = new THREE.Vector3();
const yukari = new THREE.Vector3();
const normal = new THREE.Vector3();

export class DuvarKamerasi extends THREE.PerspectiveCamera {
  /** Göze 1 birim uzaklıktaki teğet sınırları; null iken (kurucu) three'nin simetrik piramidi. */
  private sinir: { sol: number; sag: number; alt: number; ust: number } | null = null;

  constructor(yakin = 0.1, uzak = 3000) {
    super(50, 1, yakin, uzak);
  }

  /**
   * Duvara yönelt. `yukseklikKaydirma` (panoramanın ufuk kaydırması, −1..1) duvarın sağ ekseni çevresinde ek
   * eğimdir: tan(eğim) = k·(üst−alt)/2 → ufuk satırı k·H/2 kayar. Ölçüsüz yerleşimde bu, eski
   * `rotation.x = atan(k·tan(dikeyFov/2))` ile birebir aynıdır.
   */
  duvaraAyarla(iz: DuvarIzdusumu, yukseklikKaydirma = 0) {
    const egim = Math.atan((yukseklikKaydirma * (iz.ust - iz.alt)) / 2);
    const c = Math.cos(egim);
    const s = Math.sin(egim);
    sag.fromArray(iz.sagEksen);
    const u = iz.yukariEksen;
    const n = iz.normal;
    yukari.set(c * u[0] + s * n[0], c * u[1] + s * n[1], c * u[2] + s * n[2]);
    normal.set(c * n[0] - s * u[0], c * n[1] - s * u[1], c * n[2] - s * u[2]);
    matris.makeBasis(sag, yukari, normal);
    this.quaternion.setFromRotationMatrix(matris);
    this.sinir = { sol: iz.sol, sag: iz.sag, alt: iz.alt, ust: iz.ust };
    this.fov = THREE.MathUtils.radToDeg(Math.atan(iz.ust) - Math.atan(iz.alt));
    this.aspect = (iz.sag - iz.sol) / (iz.ust - iz.alt);
    this.updateProjectionMatrix();
  }

  override updateProjectionMatrix() {
    const s = this.sinir;
    if (!s) {
      super.updateProjectionMatrix();
      return;
    }
    const n = this.near;
    this.projectionMatrix.makePerspective(s.sol * n, s.sag * n, s.ust * n, s.alt * n, n, this.far, this.coordinateSystem, this.reversedDepth);
    this.projectionMatrixInverse.copy(this.projectionMatrix).invert();
  }
}
