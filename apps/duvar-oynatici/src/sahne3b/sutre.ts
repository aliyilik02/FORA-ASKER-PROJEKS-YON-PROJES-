/**
 * Oda 2 sütre katmanı: güvenli alan tipine göre ön plana 3B eşya dizilimi (kum torbası hattı,
 * kaya, HESCO, sandık...). Manifest `sutreler` bölümü: { "<guvenliAlan>": [{ dosya, azimut, mesafe,
 * yonDerece, boy, renk }] }. Konumlar sahne koordinatında (azimut 0 = orta duvar), panoramadan bağımsız;
 * sütre izleyicinin hemen önünde durduğundan her panoramada çalışır.
 */
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { radyan, yerKonumu, zeminY } from "./uzay";

export interface SutreEsyasi {
  /** glTF dosyası; `tip: "hesco"` ise gerekmez (prosedürel). */
  dosya?: string;
  /** "hesco": prosedürel HESCO bastion hattı (tel kafes + jeotekstil + kum dolgu); `adet` hücre yan yana. */
  tip?: "model" | "hesco";
  adet?: number;
  /** HESCO hücre boyutu (m): genişlik × yükseklik; varsayılan 1,1 × 1,37 (Mil 1). */
  hucre?: [number, number];
  azimut: number;
  mesafe: number;
  yonDerece?: number;
  /** Hedef boy (m); verilmezse model ölçeği 1. */
  boy?: number;
  renk?: string;
}

/** HESCO yan dokusu: bej jeotekstil + ince tel kafes + kum lekeleri (canvas, kiremit). */
let hescoYanDoku: THREE.CanvasTexture | null = null;
let hescoUstDoku: THREE.CanvasTexture | null = null;
function hescoDokulari() {
  if (hescoYanDoku && hescoUstDoku) return { yan: hescoYanDoku, ust: hescoUstDoku };
  const yap = (ciz: (c: CanvasRenderingContext2D, n: number) => void) => {
    const n = 256;
    const tuval = document.createElement("canvas");
    tuval.width = n;
    tuval.height = n;
    const c = tuval.getContext("2d")!;
    ciz(c, n);
    const d = new THREE.CanvasTexture(tuval);
    d.colorSpace = THREE.SRGBColorSpace;
    d.wrapS = d.wrapT = THREE.RepeatWrapping;
    d.anisotropy = 4;
    return d;
  };
  const kum = (c: CanvasRenderingContext2D, n: number, temel: string, lekeler: number) => {
    c.fillStyle = temel;
    c.fillRect(0, 0, n, n);
    for (let i = 0; i < lekeler; i++) {
      const g = 0.5 + Math.random() * 0.5;
      c.fillStyle = `rgba(${Math.round(120 * g)}, ${Math.round(100 * g)}, ${Math.round(70 * g)}, ${0.08 + Math.random() * 0.12})`;
      c.beginPath();
      c.ellipse(Math.random() * n, Math.random() * n, 4 + Math.random() * 22, 3 + Math.random() * 10, Math.random() * 3, 0, Math.PI * 2);
      c.fill();
    }
  };
  hescoYanDoku = yap((c, n) => {
    kum(c, n, "#b8a784", 60);
    // Kumaş kırışıklıkları
    c.strokeStyle = "rgba(60, 50, 35, 0.12)";
    c.lineWidth = 2;
    for (let i = 0; i < 14; i++) {
      c.beginPath();
      c.moveTo(Math.random() * n, 0);
      c.quadraticCurveTo(Math.random() * n, n / 2, Math.random() * n, n);
      c.stroke();
    }
    // Tel kafes: 76 mm göz; hücre 1,1 m → ~14 göz
    c.strokeStyle = "rgba(70, 72, 68, 0.85)";
    c.lineWidth = 1.6;
    const adim = n / 14;
    for (let i = 0; i <= 14; i++) {
      c.beginPath();
      c.moveTo(i * adim, 0);
      c.lineTo(i * adim, n);
      c.moveTo(0, i * adim);
      c.lineTo(n, i * adim);
      c.stroke();
    }
    // Üst kenarda kum taşması
    c.fillStyle = "rgba(150, 130, 95, 0.5)";
    c.fillRect(0, 0, n, 6);
  });
  hescoUstDoku = yap((c, n) => kum(c, n, "#a9956f", 90));
  return { yan: hescoYanDoku, ust: hescoUstDoku };
}

/** Prosedürel HESCO hattı: `adet` hücre, her biri hafif farklı yükseklik/duruş. */
function hescoHatti(adet: number, hucre: [number, number]): THREE.Group {
  const [gen, yuk] = hucre;
  const { yan, ust } = hescoDokulari();
  const yanMal = new THREE.MeshStandardMaterial({ map: yan, roughness: 0.95, metalness: 0.05 });
  const ustMal = new THREE.MeshStandardMaterial({ map: ust, roughness: 1, metalness: 0 });
  const grup = new THREE.Group();
  for (let i = 0; i < adet; i++) {
    const h = yuk * (0.94 + Math.random() * 0.1);
    const g = new THREE.BoxGeometry(gen * 0.98, h, gen * 0.98);
    const m = new THREE.Mesh(g, [yanMal, yanMal, ustMal, yanMal, yanMal, yanMal]);
    m.position.set((i - (adet - 1) / 2) * gen, h / 2, (Math.random() - 0.5) * 0.06);
    m.rotation.y = (Math.random() - 0.5) * 0.05;
    m.castShadow = true;
    m.receiveShadow = true;
    grup.add(m);
  }
  return grup;
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

  /** Arazi yeniden kurulduğunda sütreleri yeni zemin yüksekliğine oturtur (izleyici çevresi düzdür ama kip değişebilir). */
  zemineOturt() {
    for (const c of this.grup.children) c.position.y = zeminY(c.position.x, c.position.z);
  }

  /** Dizilimi değiştirir; aynı tip zaten açıksa dokunmaz. */
  ayarla(tip: string | null, esyalar: SutreEsyasi[] | undefined, kok: string) {
    if (tip === this.aktifTip) return;
    this.temizle();
    // Manifest henüz yüklenmemişse (esyalar undefined) tip işaretlenmez; sonraki çağrı dizilimi kurar
    this.aktifTip = tip && !esyalar ? null : tip;
    if (!tip || !esyalar?.length) return;
    const nesil = ++this.nesil;
    for (const e of esyalar) {
      if (e.tip === "hesco" || !e.dosya) {
        if (e.tip !== "hesco") continue;
        const sarmal = new THREE.Group();
        sarmal.add(hescoHatti(e.adet ?? 4, e.hucre ?? [1.1, 1.37]));
        sarmal.position.copy(yerKonumu(e.azimut, e.mesafe));
        sarmal.rotation.y = -radyan(e.azimut) + radyan(e.yonDerece ?? 0);
        this.grup.add(sarmal);
        continue;
      }
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
