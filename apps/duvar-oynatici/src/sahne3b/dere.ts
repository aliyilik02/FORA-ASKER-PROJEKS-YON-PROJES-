/**
 * Dere (film görünümü, 11 Kasım 2026): orman açıklığından akan sığ su. Verilen yol boyunca zemine oturan şerit;
 * gökyüzünü yansıtan koyu, pürüzsüz yüzey, akış yönünde kayan dalgacıklar ve kıyıya doğru saydamlaşan kenar.
 * Arazi oyulmaz: şerit zeminin birkaç santim üstünde durur, yamaçta suyla birlikte iner (dere, göl değil).
 *
 * Plan (manifest `alanlar.<bolge>_film.dereler`): [{ yol: [[x, z], ...], genislik }] — akış yol sırasıyla.
 */
import * as THREE from "three";
import { zeminY } from "./uzay";

export interface DerePlani {
  /** Akış yönünde orta hat noktaları (sahne x, z). */
  yol: Array<[number, number]>;
  /** Genişlik (m), varsayılan 3. */
  genislik?: number;
}

const SU_PAYI = 0.05;

export class DereKatmani {
  readonly grup = new THREE.Group();
  private aktif: DerePlani[] | null = null;
  private readonly zaman = { value: 0 };
  private readonly malzeme: THREE.MeshStandardMaterial;
  private aglar: THREE.Mesh[] = [];

  constructor() {
    this.malzeme = new THREE.MeshStandardMaterial({ color: 0x1d2a2b, roughness: 0.06, metalness: 0, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.malzeme.onBeforeCompile = (s) => {
      s.uniforms.uZaman = this.zaman;
      s.vertexShader = "varying vec2 vDere;\n" + s.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n  vDere = uv;");
      s.fragmentShader =
        "uniform float uZaman;\nvarying vec2 vDere;\n" +
        "float dKarma(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\n" +
        "float dGurultu(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(dKarma(i), dKarma(i + vec2(1.0, 0.0)), f.x), mix(dKarma(i + vec2(0.0, 1.0)), dKarma(i + vec2(1.0, 1.0)), f.x), f.y); }\n" +
        s.fragmentShader
          .replace(
            "#include <normal_fragment_maps>",
            // vDere.x: kıyıdan kıyıya 0–1, vDere.y: akış boyunca metre. Dalgacık akışla kayar; normal hafifçe eğilir.
            "#include <normal_fragment_maps>\n  vec2 dP = vec2(vDere.x * 6.0, vDere.y * 1.4 - uZaman * 1.1);\n  float dA = dGurultu(dP) + 0.5 * dGurultu(dP * 2.3 + 3.0);\n  float dB = dGurultu(dP + vec2(0.35, 0.0)) + 0.5 * dGurultu((dP + vec2(0.35, 0.0)) * 2.3 + 3.0);\n  float dC = dGurultu(dP + vec2(0.0, 0.35)) + 0.5 * dGurultu((dP + vec2(0.0, 0.35)) * 2.3 + 3.0);\n  normal = normalize(normal + (viewMatrix * vec4((dA - dB) * 0.45, 0.0, (dA - dC) * 0.45, 0.0)).xyz);",
          )
          .replace(
            "#include <dithering_fragment>",
            "#include <dithering_fragment>\n  float dKiyi = smoothstep(0.0, 0.22, vDere.x) * smoothstep(1.0, 0.78, vDere.x);\n  gl_FragColor.a *= dKiyi * 0.9;",
          );
    };
  }

  ayarla(plan: DerePlani[] | null | undefined) {
    const yeni = plan && plan.length ? plan : null;
    if (yeni === this.aktif) return;
    this.temizle();
    this.aktif = yeni;
    for (const d of yeni ?? []) this.kur(d);
  }

  private kur(d: DerePlani) {
    const g = d.genislik ?? 3;
    // Yol yumuşatılır (Catmull-Rom), ~0,8 m aralıkla örneklenir
    const egri = new THREE.CatmullRomCurve3(d.yol.map(([x, z]) => new THREE.Vector3(x, 0, z)));
    const n = Math.max(2, Math.ceil(egri.getLength() / 0.8));
    const SUTUN = 4;
    const konum = new Float32Array((n + 1) * (SUTUN + 1) * 3);
    const uv = new Float32Array((n + 1) * (SUTUN + 1) * 2);
    const indis: number[] = [];
    let uzunluk = 0;
    let onceki: THREE.Vector3 | null = null;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = egri.getPointAt(t);
      const teget = egri.getTangentAt(t);
      const yan = new THREE.Vector3(-teget.z, 0, teget.x).normalize();
      if (onceki) uzunluk += p.distanceTo(onceki);
      onceki = p;
      // Genişlik yol boyunca hafifçe oynar (doğal kıyı)
      const yerelG = g * (0.85 + 0.3 * Math.sin(i * 0.37) * Math.sin(i * 0.11 + 1.3));
      for (let j = 0; j <= SUTUN; j++) {
        const k = i * (SUTUN + 1) + j;
        const u = j / SUTUN;
        const x = p.x + yan.x * (u - 0.5) * yerelG;
        const z = p.z + yan.z * (u - 0.5) * yerelG;
        konum[k * 3] = x;
        // Su yüzeyi kesitte düz: orta hattın zemini (kıyılar zemine gömülür ya da hafif üstünde kalır)
        konum[k * 3 + 1] = zeminY(p.x, p.z) + SU_PAYI;
        konum[k * 3 + 2] = z;
        uv[k * 2] = u;
        uv[k * 2 + 1] = uzunluk;
      }
      if (i < n)
        for (let j = 0; j < SUTUN; j++) {
          const a = i * (SUTUN + 1) + j;
          const b = a + 1;
          const c = a + SUTUN + 1;
          const e = c + 1;
          indis.push(a, c, b, b, c, e);
        }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(konum, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geo.setIndex(indis);
    geo.computeVertexNormals();
    const ag = new THREE.Mesh(geo, this.malzeme);
    ag.receiveShadow = true;
    ag.renderOrder = 1;
    this.aglar.push(ag);
    this.grup.add(ag);
  }

  /** (x, z) derenin içinde mi (figür/efekt yerleşimi suya düşmesin). */
  icindeMi(x: number, z: number, pay = 0.5): boolean {
    for (const d of this.aktif ?? []) {
      const g = (d.genislik ?? 3) / 2 + pay;
      for (let i = 0; i + 1 < d.yol.length; i++) {
        const [ax, az] = d.yol[i];
        const [bx, bz] = d.yol[i + 1];
        const dx = bx - ax;
        const dz = bz - az;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
        if (Math.hypot(x - ax - dx * t, z - az - dz * t) < g) return true;
      }
    }
    return false;
  }

  guncelle(dt: number) {
    if (this.aglar.length) this.zaman.value += dt;
  }

  temizle() {
    for (const ag of this.aglar) {
      this.grup.remove(ag);
      ag.geometry.dispose();
    }
    this.aglar = [];
    this.aktif = null;
  }
}
