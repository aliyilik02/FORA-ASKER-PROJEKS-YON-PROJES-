/**
 * Parçacık sistemi: duman, toz, ateş, kıvılcım/moloz.
 *
 * Her doku türü için tek bir instanced billboard mesh'i (tek çizim çağrısı). Kamera düzlemine
 * dönük kareler vertex shader'da üretilir; gl_PointSize sınırı yoktur, büyük yakın duman da çizilir.
 */
import * as THREE from "three";

const VERTEX = `
attribute vec3 konum;
attribute float boyut;
attribute float alfa;
attribute float aci;
attribute vec3 renk;
varying vec2 vUv;
varying float vAlfa;
varying vec3 vRenk;
void main() {
  vUv = uv;
  vAlfa = alfa;
  vRenk = renk;
  vec4 mv = modelViewMatrix * vec4(konum, 1.0);
  float c = cos(aci); float s = sin(aci);
  vec2 p = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * boyut;
  mv.xy += p;
  gl_Position = projectionMatrix * mv;
}
`;
const FRAGMENT = `
uniform sampler2D doku;
uniform float renkOlcek; // doku gri ise (Kenney ~0.42) rengi normalize eder
varying vec2 vUv;
varying float vAlfa;
varying vec3 vRenk;
void main() {
  vec4 t = texture2D(doku, vUv);
  gl_FragColor = vec4(min(vec3(1.0), t.rgb * renkOlcek) * vRenk, t.a * vAlfa);
  if (gl_FragColor.a < 0.004) discard;
}
`;

export interface Parcacik {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  boyut: number;
  buyume: number; // m/s
  alfa: number;
  aci: number;
  donus: number; // rad/s
  t: number;
  sure: number;
  renk: [number, number, number];
  yercekimi: number;
  surtunme: number;
}

export type Karisim = "normal" | "katki";

/** Tek doku, tek mesh, en çok `kapasite` parçacık. */
export class ParcacikGrubu {
  readonly mesh: THREE.Mesh;
  private readonly geometri: THREE.InstancedBufferGeometry;
  private readonly konum: THREE.InstancedBufferAttribute;
  private readonly boyut: THREE.InstancedBufferAttribute;
  private readonly alfa: THREE.InstancedBufferAttribute;
  private readonly aci: THREE.InstancedBufferAttribute;
  private readonly renk: THREE.InstancedBufferAttribute;
  readonly parcaciklar: Parcacik[] = [];
  /** Ortam ışığı çarpanı (duman gece kararır; ateş karartılmaz). */
  isik = 1;

  constructor(doku: THREE.Texture, readonly kapasite: number, karisim: Karisim, readonly isikliMi: boolean) {
    const temel = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = temel.index;
    g.setAttribute("position", temel.getAttribute("position"));
    g.setAttribute("uv", temel.getAttribute("uv"));
    this.konum = new THREE.InstancedBufferAttribute(new Float32Array(kapasite * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.boyut = new THREE.InstancedBufferAttribute(new Float32Array(kapasite), 1).setUsage(THREE.DynamicDrawUsage);
    this.alfa = new THREE.InstancedBufferAttribute(new Float32Array(kapasite), 1).setUsage(THREE.DynamicDrawUsage);
    this.aci = new THREE.InstancedBufferAttribute(new Float32Array(kapasite), 1).setUsage(THREE.DynamicDrawUsage);
    this.renk = new THREE.InstancedBufferAttribute(new Float32Array(kapasite * 3), 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute("konum", this.konum);
    g.setAttribute("boyut", this.boyut);
    g.setAttribute("alfa", this.alfa);
    g.setAttribute("aci", this.aci);
    g.setAttribute("renk", this.renk);
    g.instanceCount = 0;
    this.geometri = g;
    const m = new THREE.ShaderMaterial({
      uniforms: { doku: { value: doku }, renkOlcek: { value: 1 } },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: karisim === "katki" ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = karisim === "katki" ? 30 : 20;
  }

  ekle(p: Parcacik) {
    if (this.parcaciklar.length >= this.kapasite) this.parcaciklar.shift();
    this.parcaciklar.push(p);
  }

  /** Dokuyu değiştirir; görünür piksellerin ortalama parlaklığı ölçülüp renk ona göre normalize edilir. */
  dokuAyarla(doku: THREE.Texture) {
    const u = (this.mesh.material as THREE.ShaderMaterial).uniforms;
    u.doku.value = doku;
    try {
      const img = doku.image as HTMLImageElement;
      const c = document.createElement("canvas");
      c.width = c.height = 32;
      const ctx = c.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0, 32, 32);
      const d = ctx.getImageData(0, 0, 32, 32).data;
      let t = 0;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] > 40) {
          t += (d[i] + d[i + 1] + d[i + 2]) / 3;
          n++;
        }
      }
      const ort = n ? t / n / 255 : 1;
      u.renkOlcek.value = ort > 0.05 ? Math.min(3, 0.9 / ort) : 1;
    } catch {
      u.renkOlcek.value = 1;
    }
  }

  get sayi() {
    return this.parcaciklar.length;
  }

  guncelle(dt: number) {
    const canli: Parcacik[] = [];
    for (const p of this.parcaciklar) {
      p.t += dt;
      if (p.t >= p.sure) continue;
      p.vy -= p.yercekimi * dt;
      const s = Math.max(0, 1 - p.surtunme * dt);
      p.vx *= s;
      p.vz *= s;
      if (p.yercekimi === 0) p.vy *= s;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.boyut += p.buyume * dt;
      p.aci += p.donus * dt;
      canli.push(p);
    }
    this.parcaciklar.length = 0;
    this.parcaciklar.push(...canli);
    const n = canli.length;
    const k = this.konum.array as Float32Array;
    const b = this.boyut.array as Float32Array;
    const a = this.alfa.array as Float32Array;
    const c = this.aci.array as Float32Array;
    const r = this.renk.array as Float32Array;
    const isik = this.isikliMi ? this.isik : 1;
    for (let i = 0; i < n; i++) {
      const p = canli[i];
      const u = p.t / p.sure;
      // Hızlı belirme, yavaş sönme
      const zarf = u < 0.12 ? u / 0.12 : 1 - (u - 0.12) / 0.88;
      k[i * 3] = p.x;
      k[i * 3 + 1] = p.y;
      k[i * 3 + 2] = p.z;
      b[i] = p.boyut;
      a[i] = p.alfa * Math.max(0, zarf);
      c[i] = p.aci;
      r[i * 3] = p.renk[0] * isik;
      r[i * 3 + 1] = p.renk[1] * isik;
      r[i * 3 + 2] = p.renk[2] * isik;
    }
    this.geometri.instanceCount = n;
    this.konum.needsUpdate = true;
    this.boyut.needsUpdate = true;
    this.alfa.needsUpdate = true;
    this.aci.needsUpdate = true;
    this.renk.needsUpdate = true;
  }

  temizle() {
    this.parcaciklar.length = 0;
    this.geometri.instanceCount = 0;
  }
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** Üst düzey yayıcılar: patlama, duman sütunu, toz bulutu, rotor tozu, kıvılcım. */
export class ParcacikSistemi {
  readonly duman: ParcacikGrubu;
  readonly ates: ParcacikGrubu;
  readonly kivilcim: ParcacikGrubu;
  readonly grup = new THREE.Group();

  constructor(dumanDoku: THREE.Texture, atesDoku: THREE.Texture, kivilcimDoku: THREE.Texture) {
    this.duman = new ParcacikGrubu(dumanDoku, 1200, "normal", true);
    this.ates = new ParcacikGrubu(atesDoku, 300, "katki", false);
    this.kivilcim = new ParcacikGrubu(kivilcimDoku, 600, "katki", false);
    this.grup.add(this.duman.mesh, this.ates.mesh, this.kivilcim.mesh);
  }

  set isik(v: number) {
    this.duman.isik = v;
  }

  guncelle(dt: number) {
    this.duman.guncelle(dt);
    this.ates.guncelle(dt);
    this.kivilcim.guncelle(dt);
  }

  temizle() {
    this.duman.temizle();
    this.ates.temizle();
    this.kivilcim.temizle();
  }

  /** Yer patlaması: ateş topu + toprak/duman sütunu + saçılan moloz. `yaricap` metre. */
  patlama(p: THREE.Vector3, yaricap: number) {
    const r = yaricap;
    // Ateş topu: birkaç büyük katkılı alev, hızla büyür ve söner
    for (let i = 0; i < 10; i++) {
      this.ates.ekle({
        x: p.x + rnd(-r * 0.3, r * 0.3),
        y: p.y + rnd(0, r * 0.6),
        z: p.z + rnd(-r * 0.3, r * 0.3),
        vx: rnd(-1, 1) * r,
        vy: rnd(2, 6) * r * 0.6,
        vz: rnd(-1, 1) * r,
        boyut: r * rnd(0.8, 1.6),
        buyume: r * rnd(2, 4),
        alfa: rnd(0.7, 1),
        aci: rnd(0, 6.28),
        donus: rnd(-1.5, 1.5),
        t: 0,
        sure: rnd(0.35, 0.7),
        renk: [1, rnd(0.75, 0.95), rnd(0.5, 0.8)],
        yercekimi: 0,
        surtunme: 2,
      });
    }
    // Toprak sütunu: kuru toprak rengi (tan) hızlı fışkıran topaklar + az miktarda koyu is;
    // yarı saydam ve hızla seyrelen, gökyüzünde kara leke gibi asılı kalmayan
    for (let i = 0; i < 70; i++) {
      const yukari = rnd(4, 14) * r * 0.5;
      const isMi = i % 7 === 0;
      const t = rnd(0.8, 1);
      this.duman.ekle({
        x: p.x + rnd(-r * 0.4, r * 0.4),
        y: p.y + rnd(0, r * 0.3),
        z: p.z + rnd(-r * 0.4, r * 0.4),
        vx: rnd(-1.5, 1.5) * r,
        vy: yukari,
        vz: rnd(-1.5, 1.5) * r,
        boyut: r * rnd(0.6, 1.4),
        buyume: r * rnd(0.8, 1.6),
        alfa: rnd(0.25, 0.5),
        aci: rnd(0, 6.28),
        donus: rnd(-0.8, 0.8),
        t: 0,
        sure: rnd(2, 5),
        renk: isMi ? [0.3 * t, 0.28 * t, 0.26 * t] : [0.66 * t, 0.56 * t, 0.42 * t],
        yercekimi: rnd(0.5, 2.5),
        surtunme: 0.9,
      });
    }
    // Kıvılcım / moloz
    for (let i = 0; i < 120; i++) {
      const a = rnd(0, 6.28);
      const h = rnd(6, 22) * r * 0.6;
      this.kivilcim.ekle({
        x: p.x,
        y: p.y + r * 0.2,
        z: p.z,
        vx: Math.cos(a) * h * rnd(0.2, 1),
        vy: rnd(0.6, 1.4) * h,
        vz: Math.sin(a) * h * rnd(0.2, 1),
        boyut: rnd(0.025, 0.07) * r,
        buyume: 0,
        alfa: 1,
        aci: 0,
        donus: 0,
        t: 0,
        sure: rnd(0.6, 2.2),
        renk: [1, rnd(0.6, 0.9), 0.4],
        yercekimi: 9.8,
        surtunme: 0.25,
      });
    }
  }

  /** Kraterden tüten sürekli duman (saniyede birkaç topak). */
  tutenDuman(p: THREE.Vector3, yaricap: number, siddet: number) {
    this.duman.ekle({
      x: p.x + rnd(-yaricap * 0.3, yaricap * 0.3),
      y: p.y + 0.1,
      z: p.z + rnd(-yaricap * 0.3, yaricap * 0.3),
      vx: rnd(-0.3, 0.3),
      vy: rnd(0.5, 1.2) * (0.5 + siddet),
      vz: rnd(-0.3, 0.3),
      boyut: yaricap * rnd(0.3, 0.6),
      buyume: yaricap * rnd(0.25, 0.5),
      alfa: rnd(0.08, 0.2) * siddet,
      aci: rnd(0, 6.28),
      donus: rnd(-0.4, 0.4),
      t: 0,
      sure: rnd(3, 6),
      renk: [0.5, 0.47, 0.43],
      yercekimi: -0.15,
      surtunme: 0.3,
    });
  }

  /** Toz bulutu (araç geçişi, yakın serpinti): açık kahverengi, yere yakın, yana yayılır. */
  tozBulutu(p: THREE.Vector3, yaricap: number, siddet: number) {
    for (let i = 0; i < 40 * siddet; i++) {
      this.duman.ekle({
        x: p.x + rnd(-yaricap, yaricap),
        y: p.y + rnd(0, yaricap * 0.3),
        z: p.z + rnd(-yaricap, yaricap),
        vx: rnd(-1, 1) * yaricap * 0.5,
        vy: rnd(0.3, 1.5),
        vz: rnd(-1, 1) * yaricap * 0.5,
        boyut: yaricap * rnd(0.4, 0.9),
        buyume: yaricap * rnd(0.3, 0.6),
        alfa: rnd(0.25, 0.5) * siddet,
        aci: rnd(0, 6.28),
        donus: rnd(-0.5, 0.5),
        t: 0,
        sure: rnd(3, 6),
        renk: [0.62, 0.55, 0.42],
        yercekimi: 0,
        surtunme: 0.7,
      });
    }
  }

  /** Rotor tozu: iniş noktasından dışa doğru halka şeklinde savrulan toz. `siddet` 0–1. */
  rotorTozu(p: THREE.Vector3, yaricap: number, siddet: number, dt: number) {
    const adet = Math.round(120 * siddet * dt);
    for (let i = 0; i < adet; i++) {
      const a = rnd(0, 6.28);
      const r0 = rnd(0.2, 0.6) * yaricap;
      const hiz = rnd(3, 9) * (0.4 + siddet);
      this.duman.ekle({
        x: p.x + Math.cos(a) * r0,
        y: p.y + rnd(0, 0.5),
        z: p.z + Math.sin(a) * r0,
        vx: Math.cos(a) * hiz,
        vy: rnd(0.5, 2.5) * siddet,
        vz: Math.sin(a) * hiz,
        boyut: yaricap * rnd(0.15, 0.35),
        buyume: yaricap * rnd(0.25, 0.5),
        alfa: rnd(0.2, 0.45) * siddet,
        aci: rnd(0, 6.28),
        donus: rnd(-1, 1),
        t: 0,
        sure: rnd(1.5, 3.5),
        renk: [0.6, 0.53, 0.4],
        yercekimi: 0,
        surtunme: 1.2,
      });
    }
  }

  /** Namlu alevi / küçük parlama (tek kare). */
  parlama(p: THREE.Vector3, boyut: number) {
    this.ates.ekle({ x: p.x, y: p.y, z: p.z, vx: 0, vy: 0, vz: 0, boyut, buyume: boyut * 4, alfa: 1, aci: rnd(0, 6.28), donus: 0, t: 0, sure: 0.08, renk: [1, 0.9, 0.7], yercekimi: 0, surtunme: 0 });
  }
}
