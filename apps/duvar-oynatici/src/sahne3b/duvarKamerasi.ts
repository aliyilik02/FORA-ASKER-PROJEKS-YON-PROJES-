/**
 * Duvar kamerası: genelleştirilmiş perspektif izdüşümü (Kooima). Göz başlangıç noktasında; yön duvar düzleminin
 * eksenlerinden (sağ, yukarı, izleyiciye dönük normal), izdüşüm simetrik olmayan (off-axis) kesik piramitten.
 *
 * three'nin `updateProjectionMatrix()`'i fov/aspect'ten simetrik piramit kurar; burada ezilir, böylece bir
 * yardımcı (ya da ileride eklenen kod) çağırsa da duvar izdüşümü bozulmaz. `fov`/`aspect` yalnız bilgi amaçlı
 * eşdeğerlerdir (dikey açı aralığı, sınır oranı).
 */
import * as THREE from "three";
import type { DuvarIzdusumu, Yerlesim } from "../projeksiyon";

/** three'nin sis köşe kodu: görüş uzayı derinliği (−z, kamera eksenine izdüşüm). */
const SIS_DERINLIK_KODU = THREE.ShaderChunk.fog_vertex;
/** Gerçek uzaklık: kameranın baktığı yöne bağlı değil (tüm duvar kameraları göz noktasında). */
const SIS_UZAKLIK_KODU = `
#ifdef USE_FOG

	vFogDepth = length( mvPosition.xyz );

#endif
`;

/**
 * Sis neye göre: three sisi görüş uzayı derinliğiyle hesaplar; duvar kameraları farklı yönlere baktığından aynı
 * nokta iki duvarda farklı sis alabilir. Ölçüsüz yerleşimde köşe iki kamera eksenine eşit açıdadır (derinlikler
 * eşit), düz duvarda üç kamera aynı yöne bakar; ölçülmüş U odada izleyici ön ve yan duvara eşit uzaklıkta değilse
 * köşede sis kırılır (ön 6, yan 4, z 2,2: köşedeki 100 m'lik nokta sol kamerada 80,6 m, orta kamerada 59,1 m
 * derinlikte). Ölçülmüş odada (`?oda=`, dikey sınırlar ölçüden) gerçek uzaklık kullanılır; ölçüsüzde bugünkü
 * görüntü korunur.
 */
export function uzaklikSisiGerekir(yerlesimler: readonly Yerlesim[]): boolean {
  return yerlesimler.some((y) => !y.duvar.dikeyOrandan);
}

/**
 * Sis köşe kodunu seçer (`true`: gerçek uzaklık, `false`: three'nin derinliği). Malzemeler derlenmeden, ilk
 * çizimden önce çağrılmalı: three program önbelleği köşe kodunu anahtara katmaz, sonradan değişen kod derlenmiş
 * malzemelere geçmez. Geometri sayfa ömrünce sabit (adres parametresi), yeniden boyutlandırmada aynı değer gelir.
 */
export function sisUzakligiAyarla(acik: boolean) {
  THREE.ShaderChunk.fog_vertex = acik ? SIS_UZAKLIK_KODU : SIS_DERINLIK_KODU;
}

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
