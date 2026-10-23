/**
 * Prosedürel gökyüzü ("tam 3B" arazi kipi): three.js Sky (Preetham) + saatten güneş; ortam ışığı (IBL)
 * gökyüzünden PMREM ile üretilir ve saat değişince yenilenir. Gece: güneş ufkun altında, gök koyu lacivert;
 * yıldız yok (ileride). Panorama kipinde kullanılmaz.
 */
import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { gunesKonumu } from "../projeksiyon";
import { azimutYon, radyan } from "./uzay";

export class Gokyuzu {
  readonly sky = new Sky();
  private pmrem: THREE.PMREMGenerator | null = null;
  private ortam: THREE.Texture | null = null;
  private sonSaat = -1;
  private sonBulut = -1;
  /** Güneş yönü (birim) ve ufka göre yüksekliği (derece), ışık sistemi için. */
  gunesYonu = new THREE.Vector3(0, 1, 0);
  gunesYuksekligi = 45;
  gunesAzimutu = 0;

  constructor() {
    this.sky.scale.setScalar(9000);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 6;
    u.rayleigh.value = 2.2;
    u.mieCoefficient.value = 0.006;
    u.mieDirectionalG.value = 0.8;
  }

  baglan(renderer: THREE.WebGLRenderer) {
    this.pmrem = new THREE.PMREMGenerator(renderer);
  }

  /** Saat (0–24) ve bulut (0–1) → güneş konumu, atmosfer; gerekiyorsa ortam dokusu yenilenir. */
  guncelle(saat: number, bulut: number, sahne: THREE.Scene): boolean {
    const g = gunesKonumu(saat);
    this.gunesAzimutu = g.azimut;
    this.gunesYuksekligi = g.yukseklik;
    const yon = azimutYon(g.azimut);
    const e = radyan(g.yukseklik);
    this.gunesYonu.set(yon.x * Math.cos(e), Math.sin(e), yon.z * Math.cos(e)).normalize();
    const u = this.sky.material.uniforms;
    u.sunPosition.value.copy(this.gunesYonu);
    u.turbidity.value = 4 + bulut * 12;
    u.rayleigh.value = 1.6 + bulut * 1.2;
    u.mieCoefficient.value = 0.004 + bulut * 0.03;
    const degisti = Math.abs(saat - this.sonSaat) > 0.2 || Math.abs(bulut - this.sonBulut) > 0.1;
    if (degisti && this.pmrem) {
      this.sonSaat = saat;
      this.sonBulut = bulut;
      const gecici = new THREE.Scene();
      gecici.add(this.sky);
      this.ortam?.dispose();
      this.ortam = this.pmrem.fromScene(gecici, 0.04).texture;
      sahne.environment = this.ortam;
      sahne.background = null;
      sahne.add(this.sky); // fromScene sky'ı geçici sahneye aldı; geri ekle
      return true;
    }
    return false;
  }

  /** Ufuk rengi (sis için): güneş yüksekliğine ve buluta göre yaklaşık. */
  ufukRengi(bulut: number): THREE.Color {
    const gun = Math.max(0, Math.min(1, (this.gunesYuksekligi + 6) / 18));
    const acik = new THREE.Color(0.72, 0.78, 0.86).lerp(new THREE.Color(0.62, 0.64, 0.66), bulut);
    const gece = new THREE.Color(0.05, 0.06, 0.1);
    const alaca = new THREE.Color(0.9, 0.62, 0.42);
    const c = gece.clone().lerp(acik, gun);
    if (this.gunesYuksekligi > -4 && this.gunesYuksekligi < 12) c.lerp(alaca, (1 - Math.abs(this.gunesYuksekligi - 4) / 8) * 0.5 * (1 - bulut));
    return c;
  }

  sok(sahne: THREE.Scene) {
    sahne.remove(this.sky);
    this.ortam?.dispose();
    this.ortam = null;
    this.sonSaat = -1;
  }
}
