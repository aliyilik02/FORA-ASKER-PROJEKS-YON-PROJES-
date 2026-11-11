/**
 * Sokak katmanı: 3B alanın asfalt yolu, bordürlü yükseltilmiş kaldırımı, yol seviyesindeki parke meydanı ve kesik orta
 * çizgisi (manifest `alanlar[bolge].sokak`). Yüzeyler zemine uyan ızgara ağlardır (zeminY + küçük pay): krater açılınca
 * o bölge yeniden örneklenir ve yanık rengine kararır, arazi yeniden kurulunca baştan örneklenir. Kar ve ıslaklık
 * gölgelendiriciye tek değerle gelir (kar beyazlatır, ıslaklık koyulaştırıp parlatır). Kaldırımlar z eksenine paralel
 * varsayılır (bordür, yola bakan uzun kenarda). Dokular Poly Haven CC0 (araclar/sokak-doku-indir.mjs): asphalt_02,
 * brick_pavement_03 (kilit parke taşı), concrete_pavement_02 (bordür).
 */
import * as THREE from "three";
import { zeminY } from "./uzay";

export interface SokakDikdortgen {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export interface SokakPlani {
  asfalt?: SokakDikdortgen[];
  /** Yükseltilmiş, bordürlü kaldırım (yükseklik m, varsayılan 0,15). */
  kaldirim?: Array<SokakDikdortgen & { yukseklik?: number }>;
  /** Yol seviyesinde parke meydan. */
  meydan?: SokakDikdortgen[];
  /** Kesik orta çizgi: x, z0 → z1, [çizgi, boşluk] m (varsayılan [3, 5]). */
  ortaCizgi?: { x: number; z0: number; z1: number; kesik?: [number, number] };
}

/** (x, z) sokak yüzeylerinden birinin `pay` m içinde mi (arazi oraya çim/çalı/kaya koymaz). */
export function sokakIcindeMi(plan: SokakPlani, x: number, z: number, pay = 0.5): boolean {
  const ic = (d: SokakDikdortgen) =>
    x > Math.min(d.x0, d.x1) - pay && x < Math.max(d.x0, d.x1) + pay && z > Math.min(d.z0, d.z1) - pay && z < Math.max(d.z0, d.z1) + pay;
  return Boolean(plan.asfalt?.some(ic) || plan.kaldirim?.some(ic) || plan.meydan?.some(ic));
}

/** Yüzeyin zeminden yüksekliği (z-dövüşü olmasın): asfalt 3 cm, meydan 3,5 cm, kaldırım üstü bordür + 3 cm. */
const ASFALT_PAYI = 0.03;
const MEYDAN_PAYI = 0.035;
const BORDUR_GENISLIGI = 0.16;
/** Doku tekrar ölçüsü (m başına 1 / ölçek): asfalt 5 m, parke 1,6 m, beton 1,2 m. */
const OLCEK = { asfalt: 5, parke: 1.6, beton: 1.2 };

interface Yuzey {
  mesh: THREE.Mesh;
  /** Her köşenin zeminden yüksekliği (kaldırım/bordür üstü yüksek, bordür yan yüzü alt köşeler 0). */
  paylar: Float32Array;
}

export class SokakKatmani {
  readonly grup = new THREE.Group();
  private aktifPlan: SokakPlani | null = null;
  private yuzeyler: Yuzey[] = [];
  private malzemeler: THREE.MeshStandardMaterial[] = [];
  private dokular: THREE.Texture[] = [];
  /** Kar (0–1) ve ıslaklık (0–1): bütün sokak malzemelerinde ortak. */
  private readonly u = { uKar: { value: 0 }, uIslak: { value: 0 }, uFilm: { value: 0 } };

  /** Film görünümü: yüzeyde büyük ölçekli kir/toz lekeleri ve su birikintileri (gölgelendiricide). */
  set film(acik: boolean) {
    this.u.uFilm.value = acik ? 1 : 0;
  }

  get plan(): SokakPlani | null {
    return this.aktifPlan;
  }

  set islaklik(v: number) {
    this.u.uIslak.value = v;
  }

  karAyarla(kar: number) {
    this.u.uKar.value = kar;
  }

  /** Planı kurar; aynı plan açıksa dokunmaz, null kaldırır. Zemin fonksiyonu kurulduktan sonra çağrılmalı. */
  ayarla(plan: SokakPlani | null | undefined, kok: string) {
    const yeni = plan ?? null;
    if (yeni === this.aktifPlan) return;
    this.temizle();
    this.aktifPlan = yeni;
    if (!yeni) return;
    const asfalt = this.malzeme(kok, "asfalt");
    const parke = this.malzeme(kok, "parke");
    const beton = this.malzeme(kok, "beton");
    for (const d of yeni.asfalt ?? []) this.izgara(d, asfalt, OLCEK.asfalt, () => ASFALT_PAYI);
    for (const d of yeni.meydan ?? []) this.izgara(d, parke, OLCEK.parke, () => MEYDAN_PAYI);
    for (const d of yeni.kaldirim ?? []) this.kaldirim(d, parke, beton);
    if (yeni.ortaCizgi) this.ortaCizgi(yeni.ortaCizgi);
  }

  temizle() {
    for (const y of this.yuzeyler) {
      this.grup.remove(y.mesh);
      y.mesh.geometry.dispose();
    }
    this.yuzeyler = [];
    for (const m of this.malzemeler) m.dispose();
    for (const d of this.dokular) d.dispose();
    this.malzemeler = [];
    this.dokular = [];
    this.aktifPlan = null;
  }

  /** Arazi yeniden kuruldu / koridor değişti: bütün köşeler yeni zemine (renkler korunur). */
  zemineOturt() {
    for (const y of this.yuzeyler) this.ornekle(y, null, 0);
  }

  /** Sahne sıfırlaması: kraterler geri alındı, yanık renkleri temizlenir ve zemine yeniden oturur. */
  kraterleriTemizle() {
    for (const y of this.yuzeyler) {
      const renk = y.mesh.geometry.getAttribute("color") as THREE.BufferAttribute | undefined;
      if (renk) {
        (renk.array as Float32Array).fill(1);
        renk.needsUpdate = true;
      }
      this.ornekle(y, null, 0);
    }
  }

  /** Patlama krateri: `yaricap`ın 0,8 m ötesine kadar yeniden örneklenir; merkeze doğru yanık rengine kararır. */
  kraterUygula(p: THREE.Vector3, yaricap: number) {
    for (const y of this.yuzeyler) this.ornekle(y, p, yaricap);
  }

  private malzeme(kok: string, ad: "asfalt" | "parke" | "beton"): THREE.MeshStandardMaterial {
    const yukle = (ek: string, renkli: boolean) => {
      const d = new THREE.TextureLoader().load(`${kok}arazi/dokular/sokak_${ad}_${ek}.jpg`);
      d.wrapS = d.wrapT = THREE.RepeatWrapping;
      d.colorSpace = renkli ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      d.anisotropy = 8;
      this.dokular.push(d);
      return d;
    };
    const m = new THREE.MeshStandardMaterial({
      map: yukle("renk", true),
      normalMap: yukle("normal", false),
      roughnessMap: yukle("puruz", false),
      roughness: 1,
      metalness: 0,
      vertexColors: true,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -2,
    });
    m.onBeforeCompile = (s) => {
      s.uniforms.uKar = this.u.uKar;
      s.uniforms.uIslak = this.u.uIslak;
      s.uniforms.uFilm = this.u.uFilm;
      s.uniforms.uOlcek = { value: OLCEK[ad] };
      s.fragmentShader =
        "uniform float uKar;\nuniform float uIslak;\nuniform float uFilm;\nuniform float uOlcek;\nfloat gSu;\n" +
        "float sKarma(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\n" +
        "float sGurultu(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(sKarma(i), sKarma(i + vec2(1.0, 0.0)), f.x), mix(sKarma(i + vec2(0.0, 1.0)), sKarma(i + vec2(1.0, 1.0)), f.x), f.y); }\n" +
        "float sFbm(vec2 p) { return sGurultu(p) * 0.55 + sGurultu(p * 2.1 + 4.7) * 0.3 + sGurultu(p * 4.3 + 9.1) * 0.15; }\n" +
        s.fragmentShader
          .replace(
            "#include <map_fragment>",
            "#include <map_fragment>\n  vec2 sDunya = vMapUv * uOlcek;\n  diffuseColor.rgb *= mix(1.0, 0.62 + 0.5 * sFbm(sDunya * 0.3), uFilm);\n  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.5, 0.46, 0.4), smoothstep(0.55, 0.85, sFbm(sDunya * 0.8 + 7.3)) * 0.2 * uFilm);\n  gSu = smoothstep(0.72, 0.76, sFbm(sDunya * 0.27 + 3.1)) * uFilm * (1.0 - uKar);\n  diffuseColor.rgb *= mix(1.0, 0.32, gSu);\n  diffuseColor.rgb *= mix(1.0, 0.68, uIslak * (1.0 - uKar));\n  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.88, 0.92), clamp(uKar, 0.0, 1.0) * 0.85);",
          )
          .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.3, uIslak * (1.0 - uKar));\n  roughnessFactor = mix(roughnessFactor, 0.04, gSu);")
          .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\n  normal = normalize(mix(normal, nonPerturbedNormal, gSu));");
    };
    this.malzemeler.push(m);
    return m;
  }

  /** Dikdörtgeni ~1 m ızgarayla kaplayan, zemine uyan yüzey; doku dünya koordinatında (ölçek m). */
  private izgara(d: SokakDikdortgen, malzeme: THREE.Material, olcek: number, pay: (x: number, z: number) => number) {
    const x0 = Math.min(d.x0, d.x1);
    const x1 = Math.max(d.x0, d.x1);
    const z0 = Math.min(d.z0, d.z1);
    const z1 = Math.max(d.z0, d.z1);
    const nx = Math.max(1, Math.ceil(x1 - x0));
    const nz = Math.max(1, Math.ceil(z1 - z0));
    const konum = new Float32Array((nx + 1) * (nz + 1) * 3);
    const uv = new Float32Array((nx + 1) * (nz + 1) * 2);
    const paylar = new Float32Array((nx + 1) * (nz + 1));
    for (let j = 0; j <= nz; j++)
      for (let i = 0; i <= nx; i++) {
        const k = j * (nx + 1) + i;
        const x = x0 + ((x1 - x0) * i) / nx;
        const z = z0 + ((z1 - z0) * j) / nz;
        konum[k * 3] = x;
        konum[k * 3 + 2] = z;
        uv[k * 2] = x / olcek;
        uv[k * 2 + 1] = z / olcek;
        paylar[k] = pay(x, z);
      }
    const indis: number[] = [];
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        const a = j * (nx + 1) + i;
        const b = a + 1;
        const c = a + nx + 1;
        const e = c + 1;
        indis.push(a, c, b, b, c, e);
      }
    this.yuzeyEkle(konum, uv, indis, paylar, malzeme);
  }

  /** Kaldırım: parke üst yüzey + yola bakan kenarda beton bordür (üst şerit ve yan yüz), uçlarda yan yüz. */
  private kaldirim(d: SokakDikdortgen & { yukseklik?: number }, parke: THREE.Material, beton: THREE.Material) {
    const h = d.yukseklik ?? 0.15;
    const x0 = Math.min(d.x0, d.x1);
    const x1 = Math.max(d.x0, d.x1);
    const z0 = Math.min(d.z0, d.z1);
    const z1 = Math.max(d.z0, d.z1);
    // Yola bakan uzun kenar: x = 0'a yakın olan
    const icX = Math.abs(x0) < Math.abs(x1) ? x0 : x1;
    const disaYon = icX === x0 ? 1 : -1;
    const bordurX = icX + disaYon * BORDUR_GENISLIGI;
    const parkeD = disaYon > 0 ? { x0: bordurX, x1, z0, z1 } : { x0, x1: bordurX, z0, z1 };
    this.izgara(parkeD, parke, OLCEK.parke, () => h + ASFALT_PAYI);
    this.izgara({ x0: Math.min(icX, bordurX), x1: Math.max(icX, bordurX), z0, z1 }, beton, OLCEK.beton, () => h + ASFALT_PAYI);
    // Yan yüzler: bordür yüzü (yola bakan) ve iki uç
    this.yanYuz(icX, z0, icX, z1, h, beton);
    this.yanYuz(x0, z0, x1, z0, h, beton);
    this.yanYuz(x0, z1, x1, z1, h, beton);
  }

  /** (ax, az) → (bx, bz) boyunca dikey şerit: alt kenar zeminin 5 cm altı, üst kenar zemin + h + pay. */
  private yanYuz(ax: number, az: number, bx: number, bz: number, h: number, malzeme: THREE.Material) {
    const uzunluk = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(uzunluk));
    const konum = new Float32Array((n + 1) * 2 * 3);
    const uv = new Float32Array((n + 1) * 2 * 2);
    const paylar = new Float32Array((n + 1) * 2);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      for (let k = 0; k < 2; k++) {
        const v = i * 2 + k;
        konum[v * 3] = x;
        konum[v * 3 + 2] = z;
        uv[v * 2] = (uzunluk * t) / OLCEK.beton;
        uv[v * 2 + 1] = k === 0 ? 0 : (h + 0.08) / OLCEK.beton;
        paylar[v] = k === 0 ? -0.05 : h + ASFALT_PAYI;
      }
    }
    const indis: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = i * 2;
      indis.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    }
    const y = this.yuzeyEkle(konum, uv, indis, paylar, malzeme);
    (y.mesh.material as THREE.Material).side = THREE.DoubleSide;
  }

  /** Yıpranmış kesik beyaz orta çizgi: 12 cm, çizgi/boşluk m; çizgi ağları gürültülü saydam dokuyla. */
  private ortaCizgi(c: NonNullable<SokakPlani["ortaCizgi"]>) {
    const [cizgi, bosluk] = c.kesik ?? [3, 5];
    const dokular = this.boyaDokusu();
    const malzeme = new THREE.MeshStandardMaterial({
      color: 0xe8e6df,
      map: dokular,
      transparent: true,
      depthWrite: false,
      roughness: 0.85,
      metalness: 0,
      vertexColors: true,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4,
    });
    this.malzemeler.push(malzeme);
    const yon = Math.sign(c.z1 - c.z0) || 1;
    for (let z = c.z0; yon * (c.z1 - z) > 0; z += yon * (cizgi + bosluk)) {
      const son = yon > 0 ? Math.min(z + cizgi, c.z1) : Math.max(z - cizgi, c.z1);
      this.izgara({ x0: c.x - 0.06, x1: c.x + 0.06, z0: z, z1: son }, malzeme, 1, () => ASFALT_PAYI + 0.004);
    }
    // Çizgi dokusu boyu boyunca bir kez: uv'ler dünya ölçeğinde (izgara) olduğundan tekrar eder
    dokular.repeat.set(1, 1);
  }

  /** Aşınmış boya: gürültülü alfa (yer yer silinmiş, kenarı tırtıklı). */
  private boyaDokusu(): THREE.CanvasTexture {
    const n = 128;
    const tuval = document.createElement("canvas");
    tuval.width = n;
    tuval.height = n;
    const c = tuval.getContext("2d")!;
    const veri = c.createImageData(n, n);
    for (let i = 0; i < n * n; i++) {
      const g = Math.random();
      const a = g < 0.18 ? 0 : g < 0.45 ? 120 : 235;
      veri.data[i * 4] = veri.data[i * 4 + 1] = veri.data[i * 4 + 2] = 255;
      veri.data[i * 4 + 3] = a;
    }
    c.putImageData(veri, 0, 0);
    const d = new THREE.CanvasTexture(tuval);
    d.wrapS = d.wrapT = THREE.RepeatWrapping;
    d.colorSpace = THREE.SRGBColorSpace;
    this.dokular.push(d);
    return d;
  }

  private yuzeyEkle(konum: Float32Array, uv: Float32Array, indis: number[], paylar: Float32Array, malzeme: THREE.Material): Yuzey {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(konum, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array((konum.length / 3) * 3).fill(1), 3));
    g.setIndex(indis);
    const mesh = new THREE.Mesh(g, malzeme);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.frustumCulled = false; // ızgara zemine göre yeniden örneklenir; sınır küresi her seferinde hesaplanmaz
    const y = { mesh, paylar };
    this.yuzeyler.push(y);
    this.grup.add(mesh);
    this.ornekle(y, null, 0);
    return y;
  }

  /**
   * Köşeleri zemine (zeminY + pay) oturtur. `krater` verilirse yalnız `yaricap + 0,8` m içi; köşe rengi merkeze doğru
   * yanık tonuna iner (var olan koyuluk korunur, en koyusu kalır).
   */
  private ornekle(y: Yuzey, krater: THREE.Vector3 | null, yaricap: number) {
    const g = y.mesh.geometry;
    const konum = g.getAttribute("position") as THREE.BufferAttribute;
    const renk = g.getAttribute("color") as THREE.BufferAttribute;
    const k = konum.array as Float32Array;
    const r = renk.array as Float32Array;
    const sinir = yaricap + 0.8;
    let degisti = false;
    for (let v = 0; v < konum.count; v++) {
      const x = k[v * 3];
      const z = k[v * 3 + 2];
      if (krater) {
        const uz = Math.hypot(x - krater.x, z - krater.z);
        if (uz > sinir) continue;
        const kararma = 1 - 0.62 * (1 - THREE.MathUtils.smoothstep(uz, yaricap * 0.35, sinir));
        for (let c = 0; c < 3; c++) r[v * 3 + c] = Math.min(r[v * 3 + c], kararma * (c === 0 ? 1 : 0.94));
      }
      k[v * 3 + 1] = zeminY(x, z) + y.paylar[v];
      degisti = true;
    }
    if (!degisti) return;
    konum.needsUpdate = true;
    renk.needsUpdate = true;
    g.computeVertexNormals();
  }
}
