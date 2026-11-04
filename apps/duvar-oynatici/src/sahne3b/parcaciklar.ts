/**
 * Parçacık sistemi: duman, toz, ateş, kıvılcım/moloz.
 *
 * Her doku türü için tek bir instanced billboard mesh'i (tek çizim çağrısı). Kamera düzlemine
 * dönük kareler vertex shader'da üretilir; gl_PointSize sınırı yoktur, büyük yakın duman da çizilir.
 */
import * as THREE from "three";
import type { RotorTozuProfili } from "./rotorTozu";

const VERTEX = `
attribute vec3 konum;
attribute float boyut;
attribute float alfa;
attribute float aci;
attribute vec3 renk;
attribute vec2 ek; // x: atlas karesi (0–3), y: gölgeleme ağırlığı (0 düz – 1 tam)
uniform vec3 isikYonu; // dünya uzayında güneşe/ışığa doğru birim vektör
varying vec2 vUv;
varying float vAlfa;
varying vec3 vRenk;
varying vec3 vIsik;
varying float vAci;
varying vec2 vEk;
void main() {
  vUv = uv;
  vEk = ek;
  vAlfa = alfa;
  vRenk = renk;
  vAci = aci;
  vIsik = normalize((viewMatrix * vec4(isikYonu, 0.0)).xyz);
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
uniform float golgeleme; // 0: düz (ateş/kıvılcım), 1: duman topağı küre gibi aydınlanır (güneş tarafı açık, arkası koyu)
uniform float atlas; // 1: doku 2×2 kare atlası, parçacık kendi karesini (ek.x) kullanır
varying vec2 vUv;
varying float vAlfa;
varying vec3 vRenk;
varying vec3 vIsik;
varying float vAci;
varying vec2 vEk;
void main() {
  vec2 uvDoku = vUv;
  if (atlas > 0.5) {
    float k = floor(vEk.x + 0.5);
    uvDoku = vUv * 0.5 + vec2(mod(k, 2.0), floor(k / 2.0)) * 0.5;
  }
  vec4 t = texture2D(doku, uvDoku);
  vec3 renk = min(vec3(1.0), t.rgb * renkOlcek) * vRenk;
  float golge = golgeleme * vEk.y;
  if (golge > 0.0) {
    // Topağın küre normali (kart düzleminde uv → sanal yarım küre; kart dönüşü geri alınır ki ışık yönü sabit kalsın)
    vec2 q = vUv * 2.0 - 1.0;
    float c = cos(-vAci); float s = sin(-vAci);
    q = vec2(q.x * c - q.y * s, q.x * s + q.y * c);
    float r2 = dot(q, q);
    vec3 n = normalize(vec3(q, sqrt(max(0.0, 1.0 - r2 * 0.85))));
    float d = dot(n, vIsik);
    float aydinlik = 0.55 + 0.45 * max(0.0, d) - 0.18 * max(0.0, -d);
    renk *= mix(1.0, aydinlik, golge);
  }
  gl_FragColor = vec4(renk, t.a * vAlfa);
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
  /** Ömür boyunca varılacak renk (ör. yangın dumanı kara → gri, alev sarı → koyu kızıl); yoksa sabit. */
  renkSon?: [number, number, number];
  yercekimi: number;
  surtunme: number;
  /** Atlas karesi 0–3 (doku atlas ise; yoksa yok sayılır). Çeşitlilik: komşu topaklar farklı kare. */
  kare?: number;
  /** Gölgeleme ağırlığı 0–1 (varsayılan 1): toz ve seyrek duman daha saydam, ışığı daha az biçimlendirir. */
  golge?: number;
  /** Rüzgâr payı 0–1 (0 yok): sürtünme havaya göre uygulanır, topak zamanla grubun `ruzgar` hızının bu katına kapılır. */
  surukle?: number;
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
  private readonly ek: THREE.InstancedBufferAttribute;
  /** Rüzgâr hızı (dünya, m/sn): `surukle` > 0 parçacıklar buna kapılır. Sahne her kare ortamdan yazar. */
  readonly ruzgar = new THREE.Vector3();
  /** Örnek başına öznitelikler (canlı aralık yüklemesi için). */
  private readonly oznitelikler: THREE.InstancedBufferAttribute[];
  readonly parcaciklar: Parcacik[] = [];
  /** Ölen parçacık nesneleri; `al()` yeniden kullanır (en çok `kapasite` kadar tutulur). */
  private readonly havuz: Parcacik[] = [];
  /** Ortam ışığı çarpanı (duman gece kararır; ateş karartılmaz). */
  isik = 1;

  /** Işık yönü (dünya, güneşe doğru birim vektör): duman topakları güneş tarafından aydınlanır. */
  isikYonuAyarla(v: THREE.Vector3) {
    (this.mesh.material as THREE.ShaderMaterial).uniforms.isikYonu.value.copy(v).normalize();
  }

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
    this.ek = new THREE.InstancedBufferAttribute(new Float32Array(kapasite * 2), 2).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute("konum", this.konum);
    g.setAttribute("boyut", this.boyut);
    g.setAttribute("alfa", this.alfa);
    g.setAttribute("aci", this.aci);
    g.setAttribute("renk", this.renk);
    g.setAttribute("ek", this.ek);
    this.oznitelikler = [this.konum, this.boyut, this.alfa, this.aci, this.renk, this.ek];
    g.instanceCount = 0;
    this.geometri = g;
    const m = new THREE.ShaderMaterial({
      uniforms: { doku: { value: doku }, renkOlcek: { value: 1 }, isikYonu: { value: new THREE.Vector3(0.3, 0.9, 0.3) }, golgeleme: { value: isikliMi ? 1 : 0 }, atlas: { value: 0 } },
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
    if (this.parcaciklar.length >= this.kapasite) this.havuzaVer(this.parcaciklar.shift()!);
    this.parcaciklar.push(p);
  }

  /**
   * Havuzdan (ölmüş parçacıklardan) bir nesne, yoksa yeni. Sürekli yayıcılar (rotor tozu) kare başına nesne
   * üretmesin diye: alanları çağıran doldurur, sonra `ekle`. `renk` dizisi nesnenin kendisinindir, yerinde yazılır
   * (bu yüzden `ekle`ye paylaşılan sabit renk dizisi verilmez; mevcut çağıranlar hep yeni dizi verir).
   */
  al(): Parcacik {
    const p = this.havuz.pop();
    if (p) {
      p.renkSon = undefined; // havuzdan dönen nesne önceki kullanımın renk geçişini, karesini, gölgesini, rüzgârını taşımasın
      p.kare = undefined;
      p.golge = undefined;
      p.surukle = undefined;
      return p;
    }
    return { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, boyut: 0, buyume: 0, alfa: 0, aci: 0, donus: 0, t: 0, sure: 1, renk: [1, 1, 1], yercekimi: 0, surtunme: 0 };
  }

  private havuzaVer(p: Parcacik) {
    if (this.havuz.length < this.kapasite) this.havuz.push(p);
  }

  /**
   * Dokuyu değiştirir; görünür piksellerin ortalama parlaklığı ölçülüp renk ona göre normalize edilir.
   * `atlas`: doku 2×2 kare atlası (dört farklı topak), parçacık `kare` alanıyla birini seçer.
   */
  dokuAyarla(doku: THREE.Texture, atlas = false) {
    const u = (this.mesh.material as THREE.ShaderMaterial).uniforms;
    u.doku.value = doku;
    u.atlas.value = atlas ? 1 : 0;
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
    // Yerinde sıkıştırma: ölen parçacıklar atlanır, kare başına yeni dizi üretilmez
    const canli = this.parcaciklar;
    let n = 0;
    for (let i = 0; i < canli.length; i++) {
      const p = canli[i];
      p.t += dt;
      if (p.t >= p.sure) {
        this.havuzaVer(p);
        continue;
      }
      p.vy -= p.yercekimi * dt;
      const s = Math.max(0, 1 - p.surtunme * dt);
      if (p.surukle) {
        // Sürtünme havaya göre: hız rüzgâr hızına (× pay) doğru söner; durgun havada durur, rüzgârda onunla akar
        const wx = this.ruzgar.x * p.surukle;
        const wz = this.ruzgar.z * p.surukle;
        p.vx = wx + (p.vx - wx) * s;
        p.vz = wz + (p.vz - wz) * s;
      } else {
        p.vx *= s;
        p.vz *= s;
      }
      if (p.yercekimi === 0) p.vy *= s;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.boyut += p.buyume * dt;
      p.aci += p.donus * dt;
      canli[n++] = p;
    }
    canli.length = n;
    const k = this.konum.array as Float32Array;
    const b = this.boyut.array as Float32Array;
    const a = this.alfa.array as Float32Array;
    const c = this.aci.array as Float32Array;
    const r = this.renk.array as Float32Array;
    const e = this.ek.array as Float32Array;
    const isik = this.isikliMi ? this.isik : 1;
    for (let i = 0; i < n; i++) {
      const p = canli[i];
      e[i * 2] = p.kare ?? 0;
      e[i * 2 + 1] = p.golge ?? 1;
      const u = p.t / p.sure;
      // Hızlı belirme (ömrün %12'si, en çok 0,35 sn: 10–16 sn yaşayan toz 1,6 sn'de değil hemen görünür), yavaş sönme
      const giris = Math.min(0.12, 0.35 / p.sure);
      const zarf = u < giris ? u / giris : 1 - (u - giris) / (1 - giris);
      k[i * 3] = p.x;
      k[i * 3 + 1] = p.y;
      k[i * 3 + 2] = p.z;
      b[i] = p.boyut;
      a[i] = p.alfa * Math.max(0, zarf);
      c[i] = p.aci;
      if (p.renkSon) {
        const w = Math.min(1, u * 1.15);
        r[i * 3] = (p.renk[0] + (p.renkSon[0] - p.renk[0]) * w) * isik;
        r[i * 3 + 1] = (p.renk[1] + (p.renkSon[1] - p.renk[1]) * w) * isik;
        r[i * 3 + 2] = (p.renk[2] + (p.renkSon[2] - p.renk[2]) * w) * isik;
      } else {
        r[i * 3] = p.renk[0] * isik;
        r[i * 3 + 1] = p.renk[1] * isik;
        r[i * 3 + 2] = p.renk[2] * isik;
      }
    }
    this.geometri.instanceCount = n;
    // Yalnız canlı aralık yüklenir; parçacık yokken hiç yükleme yok (sayı 0: çizim de yok). Önceden her karede beş
    // tamponun tamamı yükleniyordu (ANGLE/D3D11'de dinamik tampon güncellemesi pahalı).
    if (n === 0) return;
    for (const a of this.oznitelikler) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, n * a.itemSize);
      a.needsUpdate = true;
    }
  }

  temizle() {
    for (let i = 0; i < this.parcaciklar.length; i++) this.havuzaVer(this.parcaciklar[i]);
    this.parcaciklar.length = 0;
    this.geometri.instanceCount = 0;
  }
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/**
 * Rotor tozu için havuzdan radyal parçacık: merkezin çevresinde rastgele açıda, `r0` uzakta ve `y0` yukarıda;
 * yatay hız dışa doğru `hiz` (eksi: içe), dikey `vy`. Kalan alanları çağıran yazar, sonra grubun `ekle`si.
 */
function radyalParcacik(g: ParcacikGrubu, m: THREE.Vector3, r0: number, y0: number, hiz: number, vy: number): Parcacik {
  const a = Math.random() * 6.283;
  const c = Math.cos(a);
  const sn = Math.sin(a);
  const p = g.al();
  p.x = m.x + c * r0;
  p.y = m.y + y0;
  p.z = m.z + sn * r0;
  p.vx = c * hiz;
  p.vy = vy;
  p.vz = sn * hiz;
  p.t = 0;
  return p;
}

/** Zemin rengini parçacık başına hafif aydınlık/koyu sapmayla yerinde yazar (dizi üretmez). */
function tonla(hedef: [number, number, number], renk: [number, number, number], sapma: number) {
  const k = 1 + rnd(-sapma, sapma);
  hedef[0] = Math.min(1, renk[0] * k);
  hedef[1] = Math.min(1, renk[1] * k);
  hedef[2] = Math.min(1, renk[2] * k);
}

/** Patlama varyantı: küçük sapma çarpanları (bkz. ParcacikSistemi.PATLAMA_VARYANTLARI). */
export interface PatlamaVaryanti {
  ad: string;
  /** Ateş topu boyut çarpanı. */
  ates: number;
  /** Sütun yükseklik (dikey hız) çarpanı. */
  sutun: number;
  /** Sütun eğimi 0–0,25 (yatay/dikey hız oranı); eteğin güçlü tarafı da bu yönde. */
  egim: number;
  /** Her kaçıncı sütun topağı is (küçük = daha isli). */
  isOrani: number;
  /** Toz eteği erim çarpanı. */
  etek: number;
  /** Kor/moloz sayısı çarpanı. */
  kor: number;
  /** Renk sıcaklığı çarpanları (r, g, b) ±%5. */
  sicaklik: [number, number, number];
  /** Artık yangın gücü çarpanı (sahne3b.patlama). */
  yangin: number;
}

/** Üst düzey yayıcılar: patlama, duman sütunu, toz bulutu, rotor tozu, kıvılcım. */
export class ParcacikSistemi {
  readonly duman: ParcacikGrubu;
  readonly ates: ParcacikGrubu;
  readonly kivilcim: ParcacikGrubu;
  readonly grup = new THREE.Group();
  /** Süren toz kaynakları (`tozBulutu`): ilk patlamadan sonra birkaç saniye daha alçak toz yayar, sonra biter. */
  private readonly tozKaynaklari: Array<{ p: THREE.Vector3; yaricap: number; siddet: number; t: number; sure: number; birikim: number }> = [];

  constructor(dumanDoku: THREE.Texture, atesDoku: THREE.Texture, kivilcimDoku: THREE.Texture, kapasiteCarpani = 1) {
    this.duman = new ParcacikGrubu(dumanDoku, Math.round(1200 * kapasiteCarpani), "normal", true);
    this.ates = new ParcacikGrubu(atesDoku, Math.round(300 * kapasiteCarpani), "katki", false);
    this.kivilcim = new ParcacikGrubu(kivilcimDoku, Math.round(600 * kapasiteCarpani), "katki", false);
    this.grup.add(this.duman.mesh, this.ates.mesh, this.kivilcim.mesh);
  }

  set isik(v: number) {
    this.duman.isik = v;
  }

  guncelle(dt: number) {
    this.tozKaynaklariniIsle(dt);
    this.duman.guncelle(dt);
    this.ates.guncelle(dt);
    this.kivilcim.guncelle(dt);
  }

  temizle() {
    this.tozKaynaklari.length = 0;
    this.duman.temizle();
    this.ates.temizle();
    this.kivilcim.temizle();
  }

  /**
   * Patlama varyantları (4 Kasım 2026; kullanıcı: "her patlama aynı olmasın, çok ufak değişikliklerle farklı
   * varyantlar"): aynı görünüm, küçük sapmalar — ateş topu boyutu, sütun yüksekliği ve hafif eğimi, is oranı, toz
   * eteğinin yönü/erimi, kor sayısı, renk sıcaklığı, artık yangının gücü. Arka arkaya aynı varyant gelmez.
   */
  static readonly PATLAMA_VARYANTLARI: readonly PatlamaVaryanti[] = [
    { ad: "dengeli", ates: 1, sutun: 1, egim: 0, isOrani: 7, etek: 1, kor: 1, sicaklik: [1, 1, 1], yangin: 1 },
    { ad: "yüksek", ates: 0.92, sutun: 1.22, egim: 0.08, isOrani: 6, etek: 0.85, kor: 0.9, sicaklik: [1, 0.98, 0.95], yangin: 0.9 },
    { ad: "basık", ates: 1.1, sutun: 0.8, egim: 0.05, isOrani: 9, etek: 1.3, kor: 1.15, sicaklik: [1, 1, 1.03], yangin: 1.1 },
    { ad: "isli", ates: 0.95, sutun: 1.05, egim: 0.18, isOrani: 4, etek: 1, kor: 0.8, sicaklik: [0.96, 0.95, 0.95], yangin: 1.25 },
    { ad: "kuru toz", ates: 1.05, sutun: 0.95, egim: 0.12, isOrani: 11, etek: 1.2, kor: 1.3, sicaklik: [1.04, 1.02, 0.97], yangin: 0.75 },
    { ad: "eğik", ates: 1, sutun: 1.1, egim: 0.25, isOrani: 7, etek: 0.95, kor: 1, sicaklik: [1, 0.99, 0.98], yangin: 1 },
  ];
  private sonVaryant = -1;

  /** Rastgele varyant; bir öncekiyle aynı olmaz. */
  patlamaVaryantiSec(): PatlamaVaryanti {
    const n = ParcacikSistemi.PATLAMA_VARYANTLARI.length;
    let i = Math.floor(Math.random() * (n - 1));
    if (i >= this.sonVaryant) i++;
    this.sonVaryant = i;
    return ParcacikSistemi.PATLAMA_VARYANTLARI[i];
  }

  /** Yer patlaması: ateş topu + toprak/duman sütunu + saçılan moloz + toz eteği. `yaricap` metre; `v` varyant (yoksa seçilir). */
  patlama(p: THREE.Vector3, yaricap: number, v: PatlamaVaryanti = this.patlamaVaryantiSec()) {
    const r = yaricap;
    const [sr, sg, sb] = v.sicaklik;
    // Sütunun hafif eğimi ve eteğin güçlü tarafı: patlama başına rastgele bir yön
    const egimAci = Math.random() * 6.283;
    const ex = Math.cos(egimAci) * v.egim;
    const ez = Math.sin(egimAci) * v.egim;
    // Ateş topu: birkaç büyük katkılı alev, hızla büyür ve söner
    for (let i = 0; i < 10; i++) {
      this.ates.ekle({
        x: p.x + rnd(-r * 0.3, r * 0.3),
        y: p.y + rnd(0, r * 0.6),
        z: p.z + rnd(-r * 0.3, r * 0.3),
        vx: rnd(-1, 1) * r,
        vy: rnd(2, 6) * r * 0.6,
        vz: rnd(-1, 1) * r,
        boyut: r * rnd(0.8, 1.6) * v.ates,
        buyume: r * rnd(2, 4) * v.ates,
        alfa: rnd(0.7, 1),
        aci: rnd(0, 6.28),
        donus: rnd(-1.5, 1.5),
        t: 0,
        sure: rnd(0.35, 0.7),
        renk: [1, rnd(0.75, 0.95) * sg, rnd(0.5, 0.8) * sb],
        yercekimi: 0,
        surtunme: 2,
      });
    }
    // Toprak sütunu: kuru toprak rengi (tan) fışkıran topaklar + az miktarda koyu is; yarı saydam. Duvar dar bir
    // şerit olduğundan sütun çok yükselmez (4 Kasım: eski 7–25 m/sn dikey hız 1 sn'de görüş alanından çıkıyordu),
    // 4–8 sn asılı kalır, rüzgârla sürüklenir, büyüyüp seyrelir.
    for (let i = 0; i < 60; i++) {
      const yukari = rnd(2, 6) * r * 0.5 * v.sutun;
      const isMi = i % v.isOrani === 0;
      const t = rnd(0.8, 1);
      this.duman.ekle({
        x: p.x + rnd(-r * 0.4, r * 0.4),
        y: p.y + rnd(0, r * 0.3),
        z: p.z + rnd(-r * 0.4, r * 0.4),
        vx: rnd(-1.2, 1.2) * r + ex * yukari,
        vy: yukari,
        vz: rnd(-1.2, 1.2) * r + ez * yukari,
        boyut: r * rnd(0.6, 1.4),
        buyume: r * rnd(0.5, 1.1),
        alfa: rnd(0.22, 0.42),
        aci: rnd(0, 6.28),
        donus: rnd(-0.6, 0.6),
        t: 0,
        sure: rnd(4, 8),
        renk: isMi ? [0.3 * t, 0.28 * t, 0.26 * t] : [0.66 * t * sr, 0.56 * t * sg, 0.42 * t * sb],
        renkSon: isMi ? [0.42, 0.4, 0.38] : [0.7 * t * sr, 0.63 * t * sg, 0.52 * t * sb],
        yercekimi: rnd(0.6, 1.8),
        surtunme: 0.9,
        kare: i & 3,
        golge: isMi ? 1 : 0.7,
        surukle: 0.6,
      });
    }
    // Toz eteği: zemine yapışık, dışa doğru yayılan geniş ve uzun ömürlü (8–14 sn) açık toz; patlamanın alçak kalan izi.
    // Eğim yönündeki taraf biraz daha uzağa gider (varyant)
    for (let i = 0; i < 36; i++) {
      const a = rnd(0, 6.283);
      const taraf = 1 + (Math.cos(a - egimAci) * v.egim) / 0.25 * 0.3;
      const h = rnd(3, 8) * r * 0.35 * v.etek * taraf;
      const t = rnd(0.85, 1);
      this.duman.ekle({
        x: p.x + Math.cos(a) * r * 0.5,
        y: p.y + rnd(0.1, 0.5),
        z: p.z + Math.sin(a) * r * 0.5,
        vx: Math.cos(a) * h,
        vy: rnd(0.3, 1.0),
        vz: Math.sin(a) * h,
        boyut: r * rnd(0.8, 1.4),
        buyume: r * rnd(0.45, 0.85),
        alfa: rnd(0.16, 0.3),
        aci: rnd(0, 6.28),
        donus: rnd(-0.35, 0.35),
        t: 0,
        sure: rnd(8, 14),
        renk: [0.86 * t * sr, 0.8 * t * sg, 0.68 * t * sb],
        renkSon: [0.84, 0.82, 0.78],
        yercekimi: 0.06,
        surtunme: 0.7,
        kare: i & 3,
        golge: 0.45,
        surukle: 0.8,
      });
    }
    // Kıvılcım / moloz
    const korSayisi = Math.round(120 * v.kor);
    for (let i = 0; i < korSayisi; i++) {
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

  /** Yangın yayım birikimleri (saniyedeki oran kare hızından bağımsız). */
  private readonly yanginBirikim = { alev: 0, kor: 0, duman: 0 };

  /**
   * Sürekli yangın (yangin.ts): tabandan yükselen kısa ömürlü alevler (sarı çekirdek → turuncu → koyu kızıl, katkılı,
   * yukarı doğru daralır), savrulan korlar, üstte kara → gri sürüklenen duman sütunu. `siddet` 0–1 (güç dahil);
   * `sonuyor` iken alev kesilir, yalnız seyrek beyaz duman tüter. Yayım kalite kapasitesiyle ölçekli.
   */
  yangin(p: THREE.Vector3, yaricap: number, siddet: number, sonuyor: boolean, dt: number, ruzgar: THREE.Vector3) {
    if (dt <= 0) return;
    const s = Math.max(0, Math.min(1, siddet));
    const kap = this.duman.kapasite / 1200;
    const b = this.yanginBirikim;
    const r = yaricap;
    // Alevler: saniyede 55·s·r (kapasiteyle), ömür 0,45–0,9 sn
    b.alev += (sonuyor ? 0 : 55 * s * r * Math.min(1, kap)) * dt;
    while (b.alev >= 1) {
      b.alev -= 1;
      const a = Math.random() * 6.283;
      const rr = Math.sqrt(Math.random()) * r * 0.75;
      const q = this.ates.al();
      q.x = p.x + Math.cos(a) * rr;
      q.y = p.y + rnd(0, 0.25);
      q.z = p.z + Math.sin(a) * rr;
      q.vx = rnd(-0.35, 0.35) + ruzgar.x * 0.15;
      q.vy = rnd(1.4, 3.2) * (0.6 + 0.4 * s);
      q.vz = rnd(-0.35, 0.35) + ruzgar.z * 0.15;
      q.boyut = r * rnd(0.3, 0.55);
      q.buyume = r * rnd(0.25, 0.6);
      q.alfa = rnd(0.55, 0.95);
      q.aci = rnd(0, 6.28);
      q.donus = rnd(-2.5, 2.5);
      q.t = 0;
      q.sure = rnd(0.45, 0.9);
      q.renk[0] = 1;
      q.renk[1] = rnd(0.82, 0.95);
      q.renk[2] = rnd(0.35, 0.55);
      q.renkSon = [0.75, 0.18, 0.03];
      q.yercekimi = -1.5; // kaldırma: hızlanarak yükselir
      q.surtunme = 1.2;
      this.ates.ekle(q);
    }
    // Korlar: saniyede 14·s·r
    b.kor += (sonuyor ? 2 : 14 * s * r) * dt;
    while (b.kor >= 1) {
      b.kor -= 1;
      const a = Math.random() * 6.283;
      const q = this.kivilcim.al();
      q.x = p.x + Math.cos(a) * r * 0.5;
      q.y = p.y + rnd(0.2, 0.8);
      q.z = p.z + Math.sin(a) * r * 0.5;
      q.vx = rnd(-1.2, 1.2) + ruzgar.x * 0.4;
      q.vy = rnd(1.5, 4.5);
      q.vz = rnd(-1.2, 1.2) + ruzgar.z * 0.4;
      q.boyut = rnd(0.02, 0.05);
      q.buyume = -0.008;
      q.alfa = 1;
      q.aci = 0;
      q.donus = 0;
      q.t = 0;
      q.sure = rnd(1.2, 3);
      q.renk[0] = 1;
      q.renk[1] = rnd(0.45, 0.7);
      q.renk[2] = 0.15;
      q.renkSon = [0.5, 0.08, 0.0];
      q.yercekimi = 0.6;
      q.surtunme = 0.6;
      this.kivilcim.ekle(q);
    }
    // Duman: saniyede 9·r (sönerken 4·r, beyazımsı), ömür 5–9 sn; kara → gri, büyür, rüzgârla sürüklenir
    b.duman += (sonuyor ? 4 : 9 * (0.5 + 0.5 * s)) * r * Math.min(1, kap) * dt;
    while (b.duman >= 1) {
      b.duman -= 1;
      const a = Math.random() * 6.283;
      const rr = Math.sqrt(Math.random()) * r * 0.6;
      const q = this.duman.al();
      q.x = p.x + Math.cos(a) * rr;
      q.y = p.y + rnd(0.8, 1.6) * r * 0.5;
      q.z = p.z + Math.sin(a) * rr;
      q.vx = rnd(-0.3, 0.3) + ruzgar.x * 0.6;
      q.vy = rnd(1.2, 2.2) * (0.7 + 0.3 * s);
      q.vz = rnd(-0.3, 0.3) + ruzgar.z * 0.6;
      q.boyut = r * rnd(0.5, 0.9);
      q.buyume = r * rnd(0.35, 0.6);
      q.alfa = sonuyor ? rnd(0.12, 0.22) : rnd(0.3, 0.5);
      q.aci = rnd(0, 6.28);
      q.donus = rnd(-0.5, 0.5);
      q.t = 0;
      q.sure = rnd(5, 9);
      if (sonuyor) {
        q.renk[0] = 0.62;
        q.renk[1] = 0.6;
        q.renk[2] = 0.58;
        q.renkSon = [0.72, 0.71, 0.7];
      } else {
        const k = rnd(0.07, 0.13);
        q.renk[0] = k * 1.1;
        q.renk[1] = k;
        q.renk[2] = k * 0.95;
        q.renkSon = [0.34, 0.33, 0.32];
      }
      q.yercekimi = -0.25;
      q.surtunme = 0.35;
      q.kare = Math.floor(Math.random() * 4);
      q.golge = sonuyor ? 0.6 : 1;
      q.surukle = 0.5;
      this.duman.ekle(q);
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
      kare: Math.floor(Math.random() * 4),
      golge: 0.8,
      surukle: 0.7,
    });
  }

  /**
   * Toz bulutu (panel "Toz / duman", araç geçişi, plakalı patlama): alçak, açık kahverengi toz. İlk anda bir dalga
   * dışa yayılır, sonra kaynak 2,5–4 sn daha tüter (`tozKaynaklariniIsle`); topaklar 10–16 sn yaşar, büyüyüp seyrelir
   * ve ilk yarıçapın 3–4 katına yayılır, rüzgârla sürüklenir (4 Kasım: eskisi 40 topak, 3–6 sn, yerinde kayboluyordu).
   * Yayım kalite kapasitesiyle ölçekli.
   */
  tozBulutu(p: THREE.Vector3, yaricap: number, siddet: number) {
    const s = Math.max(0.1, Math.min(1.5, siddet));
    const kap = Math.min(1, this.duman.kapasite / 1200);
    const n = Math.round(40 * Math.min(1, s) * kap);
    for (let i = 0; i < n; i++) this.tozTopagi(p, yaricap, s, true, i & 3);
    this.tozKaynaklari.push({ p: p.clone(), yaricap, siddet: s, t: 0, sure: 2.5 + 1.5 * Math.min(1, s), birikim: 0 });
  }

  /** Süren toz kaynakları: saniyede 9·s·kap topak (ilk dalgadan daha yavaş ve küçük), süresi dolan kaynak silinir. */
  private tozKaynaklariniIsle(dt: number) {
    if (this.tozKaynaklari.length === 0 || dt <= 0) return;
    const kap = Math.min(1, this.duman.kapasite / 1200);
    let n = 0;
    for (const k of this.tozKaynaklari) {
      k.t += dt;
      if (k.t >= k.sure) continue;
      k.birikim += 12 * Math.min(1, k.siddet) * kap * dt;
      while (k.birikim >= 1) {
        k.birikim -= 1;
        this.tozTopagi(k.p, k.yaricap, k.siddet * (1 - k.t / k.sure), false, Math.floor(Math.random() * 4));
      }
      this.tozKaynaklari[n++] = k;
    }
    this.tozKaynaklari.length = n;
  }

  /** Tek toz topağı: `dalga` ilk dışa akış (hızlı, alçak), değilse kaynaktan tüten (yavaş). Havuzdan. */
  private tozTopagi(p: THREE.Vector3, yaricap: number, siddet: number, dalga: boolean, kare: number) {
    const r = yaricap;
    const a = Math.random() * 6.283;
    const rr = (dalga ? Math.sqrt(Math.random()) * 0.6 : Math.random() * 0.35) * r;
    const hiz = dalga ? rnd(2.2, 5) * (r / 3.5) : rnd(0.3, 1.0) * (r / 3.5);
    const ton = rnd(0.86, 1);
    const q = this.duman.al();
    q.x = p.x + Math.cos(a) * rr;
    q.y = p.y + rnd(0.4, dalga ? 1.4 : 1.6);
    q.z = p.z + Math.sin(a) * rr;
    q.vx = Math.cos(a) * hiz;
    q.vy = dalga ? rnd(0.35, 1.1) : rnd(0.5, 1.3);
    q.vz = Math.sin(a) * hiz;
    q.boyut = r * rnd(dalga ? 0.6 : 0.45, 1);
    q.buyume = r * rnd(0.28, 0.5);
    // İlk püskürme yoğun (0,45–0,65), yayıldıkça zarf ve büyümeyle incelir; tütenler seyrek
    q.alfa = (dalga ? rnd(0.45, 0.65) : rnd(0.16, 0.28)) * Math.min(1, siddet + 0.3);
    q.aci = rnd(0, 6.28);
    q.donus = rnd(-0.3, 0.3);
    q.t = 0;
    q.sure = rnd(10, 16);
    // Güneşli toz zeminden açık okunur (ışığı saçar); zamanla daha da açık ve grimsi (incelir)
    q.renk[0] = 0.88 * ton;
    q.renk[1] = 0.82 * ton;
    q.renk[2] = 0.7 * ton;
    q.renkSon = [0.86, 0.84, 0.8];
    q.yercekimi = 0.07; // hafif çökme: yükselme önce durur, sonra toz zemine yakın asılı kalır
    q.surtunme = dalga ? 0.38 : 0.4;
    q.kare = kare;
    q.golge = 0.3;
    q.surukle = 0.85;
    this.duman.ekle(q);
  }

  /** Rotor tozu yayım birikimleri (saniyedeki oran kare hızından bağımsız, kesirli parçacık sonraki kareye kalır). */
  private readonly rotorBirikim = { akis: 0, halka: 0, kirinti: 0, parilti: 0 };

  /**
   * Rotor tozu (aşağı akış, "brownout"): rotor diskinin altından (yarıçap ~5–6 m) zemine yapışık güçlü radyal
   * akış (8–15 m/sn, sürtünmeyle söner, küçük dikey hız); akış yavaşladıkça kaldırma kazanıp kıvrılır ve 1–2 rotor
   * çapında yükselen bir halka (torus) olur, halkanın üstü diske geri emilir. Üstüne hızlı savrulan kırıntı (taş,
   * toprak topağı, yaprak, kar topağı) ve karda güneşte parıldayan kristaller. Renk, hacim, incelik ve asılı kalma
   * zemin profilinden (`rotorTozu.ts`). `siddet` 0–1 (alçaklık × rotor gücü). Yayım saniye başına sınırlı ve kalite
   * kapasitesiyle ölçekli (yüksek kalitede tam şiddette ~200 canlı toz parçacığı, karda ~350); yeni çizim çağrısı
   * yok, parçacık nesneleri havuzdan. Kırıntılar normal karışımlı duman grubunda çizilir: kıvılcım grubu katkılı
   * karışımdır (yalnız ışık ekler), koyu taş/yaprak orada görünmez, gece parlardı.
   */
  rotorTozu(merkez: THREE.Vector3, rotorYaricap: number, siddet: number, dt: number, profil: RotorTozuProfili) {
    if (siddet <= 0.02 || dt <= 0) return;
    const s = Math.min(1, siddet);
    const kap = this.duman.kapasite / 1200;
    const R = rotorYaricap;
    const b = this.rotorBirikim;
    // 1) Zemin akışı: diskin altından dışa, yere yapışık ve hızlı; yavaşlarken kaldırma (eksi yer çekimi) kıvırır
    b.akis += 55 * s * profil.hacim * kap * dt;
    while (b.akis >= 1) {
      b.akis -= 1;
      const p = radyalParcacik(this.duman, merkez, R * rnd(0.3, 1), rnd(0.05, 0.45), rnd(8, 15) * (0.55 + 0.45 * s), rnd(0.1, 0.6));
      p.boyut = R * rnd(0.12, 0.24) * profil.boyut;
      p.buyume = rnd(0.8, 1.6) * profil.boyut;
      p.alfa = rnd(0.18, 0.38) * (0.4 + 0.6 * s) * profil.alfa;
      p.aci = rnd(0, 6.28);
      p.donus = rnd(-1.2, 1.2);
      p.sure = rnd(1.6, 3) * profil.omur;
      tonla(p.renk, profil.renk, profil.renkSapma);
      p.yercekimi = -rnd(0.35, 0.9) * profil.kaldirma;
      p.surtunme = rnd(0.7, 1.1);
      this.duman.ekle(p);
    }
    // 2) Halka ("brownout" duvarı): 1–2 rotor çapında, iri, yavaş, uzun ömürlü. Alt kısmı dışa yayılıp yükselir,
    //    üst kısmı (~%30) içe, diske geri emilir (devridaim): alçakta helikopteri saran torus
    b.halka += 14 * s * profil.hacim * kap * dt;
    while (b.halka >= 1) {
      b.halka -= 1;
      const p =
        Math.random() < 0.3
          ? radyalParcacik(this.duman, merkez, R * rnd(1.6, 3), rnd(1.5, 3.5), -rnd(1, 2.5), rnd(0.8, 2) * profil.kaldirma)
          : radyalParcacik(this.duman, merkez, R * rnd(2, 4), rnd(0.2, 1.2), rnd(1.5, 4), rnd(0.6, 1.8) * profil.kaldirma);
      p.boyut = R * rnd(0.3, 0.55) * profil.boyut;
      p.buyume = rnd(1.2, 2.4) * profil.boyut;
      p.alfa = rnd(0.1, 0.24) * s * profil.alfa;
      p.aci = rnd(0, 6.28);
      p.donus = rnd(-0.6, 0.6);
      p.sure = rnd(2.6, 4.5) * profil.omur;
      tonla(p.renk, profil.renk, profil.renkSapma);
      p.yercekimi = -rnd(0.15, 0.5) * profil.kaldirma;
      p.surtunme = rnd(0.5, 0.9);
      this.duman.ekle(p);
    }
    // 3) Kırıntı: güçlü akışta küçük, hızlı, yer çekimli (taş/beton düşer; yaprak ve kar topağı süzülür)
    if (s > 0.2) {
      b.kirinti += 34 * ((s - 0.2) / 0.8) * profil.kirintiOrani * kap * dt;
      const g = profil.kirintiYercekimi;
      const hafif = g < 6;
      while (b.kirinti >= 1) {
        b.kirinti -= 1;
        const vy = rnd(1.5, 5.5);
        const p = radyalParcacik(this.duman, merkez, R * rnd(0.2, 0.9), rnd(0.05, 0.3), rnd(9, 20) * (0.5 + 0.5 * s), vy);
        const k = profil.kirinti[(Math.random() * profil.kirinti.length) | 0];
        p.boyut = rnd(0.05, 0.12) * (hafif ? 1.4 : 1);
        p.buyume = 0;
        p.alfa = rnd(0.75, 1);
        p.aci = rnd(0, 6.28);
        p.donus = rnd(-8, 8);
        // Yere inince söner: ağır kırıntı hızla düşer, yaprak ve kar topağı havada daha uzun süzülür
        p.sure = hafif ? Math.min(rnd(1.4, 2.6), (2 * vy) / g + 0.4) : Math.min(1.4, (2 * vy) / g + 0.15);
        p.renk[0] = k[0];
        p.renk[1] = k[1];
        p.renk[2] = k[2];
        p.yercekimi = g;
        p.surtunme = profil.kirintiSurtunme;
        this.duman.ekle(p);
      }
    }
    // 4) Kar kristali parıltısı (kıvılcım grubu, katkılı): güneşte ince ışıltı, sahne ışığıyla kısılır (gece sönük)
    if (profil.parilti > 0) {
      b.parilti += 18 * s * profil.parilti * kap * dt;
      const isik = this.duman.isik;
      while (b.parilti >= 1) {
        b.parilti -= 1;
        const p = radyalParcacik(this.kivilcim, merkez, R * rnd(0.3, 1.5), rnd(0.1, 1), rnd(4, 10) * (0.5 + 0.5 * s), rnd(0.5, 2.5));
        p.boyut = rnd(0.03, 0.06);
        p.buyume = 0;
        p.alfa = 1;
        p.aci = 0;
        p.donus = 0;
        p.sure = rnd(0.8, 1.6);
        p.renk[0] = 0.75 * isik;
        p.renk[1] = 0.8 * isik;
        p.renk[2] = 0.9 * isik;
        p.yercekimi = 0.6;
        p.surtunme = 1.4;
        this.kivilcim.ekle(p);
      }
    }
  }

  /** Namlu alevi / küçük parlama (tek kare). */
  parlama(p: THREE.Vector3, boyut: number) {
    this.ates.ekle({ x: p.x, y: p.y, z: p.z, vx: 0, vy: 0, vz: 0, boyut, buyume: boyut * 4, alfa: 1, aci: rnd(0, 6.28), donus: 0, t: 0, sure: 0.08, renk: [1, 0.9, 0.7], yercekimi: 0, surtunme: 0 });
  }
}
