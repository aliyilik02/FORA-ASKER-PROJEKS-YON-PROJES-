/**
 * Bayrak direği (film görünümü, 11 Kasım 2026): karakol tepesinde dalgalanan Türk bayrağı. Doku tuvalde resmî
 * oranlarla çizilir (en/boy 3:2; ay dış çember merkezi göndereden 0,5 G, çap 0,5 G; iç çember merkezi 0,5625 G,
 * çap 0,4 G; yıldız çemberi çapı 0,25 G, iç çemberden 1/3 G içeride). Dalga köşe gölgelendiricisinde, göndereden
 * uzaklaştıkça artar.
 *
 * Plan (manifest `alanlar.<bolge>_film.bayraklar`): [{ x, z, yukseklik?, boy? }] — direk yüksekliği ve bayrak boyu (m).
 */
import * as THREE from "three";
import { zeminY } from "./uzay";

export interface BayrakPlani {
  x: number;
  z: number;
  /** Direk yüksekliği (m), varsayılan 12. */
  yukseklik?: number;
  /** Bayrağın boyu (gönder kenarı, m), varsayılan 2,4; eni 1,5 katı. */
  boy?: number;
  /** Direk tabanının zeminden yüksekliği (m): kule/bina tepesine dikmek için. */
  taban?: number;
}

function turkBayragiDokusu(): THREE.CanvasTexture {
  const G = 256;
  const t = document.createElement("canvas");
  t.width = G * 1.5;
  t.height = G;
  const c = t.getContext("2d")!;
  c.fillStyle = "#e30a17";
  c.fillRect(0, 0, t.width, t.height);
  c.fillStyle = "#ffffff";
  c.beginPath();
  c.arc(0.5 * G, 0.5 * G, 0.25 * G, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#e30a17";
  c.beginPath();
  c.arc(0.5625 * G, 0.5 * G, 0.2 * G, 0, Math.PI * 2);
  c.fill();
  // Yıldız: bir ucu göndere bakar
  const mx = (0.5625 - 0.2 + 1 / 3 + 0.125) * G;
  const r = 0.125 * G;
  c.fillStyle = "#ffffff";
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.382;
    const x = mx + Math.cos(a) * rr;
    const y = 0.5 * G + Math.sin(a) * rr;
    if (i === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  }
  c.closePath();
  c.fill();
  const d = new THREE.CanvasTexture(t);
  d.colorSpace = THREE.SRGBColorSpace;
  d.anisotropy = 4;
  return d;
}

export class BayrakKatmani {
  readonly grup = new THREE.Group();
  private aktif: BayrakPlani[] | null = null;
  private doku: THREE.Texture | null = null;
  private readonly zaman = { value: 0 };
  private nesneler: Array<{ kok: THREE.Group; plan: BayrakPlani }> = [];
  private malzemeler: THREE.Material[] = [];

  ayarla(plan: BayrakPlani[] | null | undefined) {
    const yeni = plan && plan.length ? plan : null;
    if (yeni === this.aktif) return;
    this.temizle();
    this.aktif = yeni;
    if (!yeni) return;
    this.doku ??= turkBayragiDokusu();
    const direkMalzeme = new THREE.MeshStandardMaterial({ color: 0xb8bcc0, roughness: 0.5, metalness: 0.6 });
    const bezMalzeme = new THREE.MeshLambertMaterial({ map: this.doku, side: THREE.DoubleSide });
    bezMalzeme.onBeforeCompile = (s) => {
      s.uniforms.uZaman = this.zaman;
      s.vertexShader =
        "uniform float uZaman;\n" +
        s.vertexShader.replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\n  float bUzak = uv.x;\n  transformed.z += sin(uv.x * 7.0 - uZaman * 5.5 + uv.y * 1.5) * 0.16 * bUzak;\n  transformed.y += sin(uv.x * 4.0 - uZaman * 3.7) * 0.05 * bUzak - 0.06 * bUzak * bUzak;",
        );
    };
    this.malzemeler.push(direkMalzeme, bezMalzeme);
    for (const p of yeni) {
      const h = p.yukseklik ?? 12;
      const boy = p.boy ?? 2.4;
      const kok = new THREE.Group();
      const direk = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, h, 8), direkMalzeme);
      direk.position.y = h / 2;
      direk.castShadow = true;
      const bez = new THREE.Mesh(new THREE.PlaneGeometry(boy * 1.5, boy, 24, 8), bezMalzeme);
      bez.position.set(boy * 0.75 + 0.06, h - boy / 2 - 0.1, 0);
      bez.frustumCulled = false;
      kok.add(direk, bez);
      this.grup.add(kok);
      this.nesneler.push({ kok, plan: p });
    }
    this.zemineOturt();
  }

  zemineOturt() {
    for (const n of this.nesneler) n.kok.position.set(n.plan.x, zeminY(n.plan.x, n.plan.z) + (n.plan.taban ?? 0), n.plan.z);
  }

  /** `ruzgar` 0–1: dalga hızı. */
  guncelle(dt: number, ruzgar = 0.4) {
    if (this.nesneler.length) this.zaman.value += dt * (0.5 + ruzgar);
  }

  temizle() {
    for (const n of this.nesneler) {
      this.grup.remove(n.kok);
      n.kok.traverse((c) => (c as THREE.Mesh).geometry?.dispose());
    }
    for (const m of this.malzemeler) m.dispose();
    this.nesneler = [];
    this.malzemeler = [];
    this.aktif = null;
  }
}
