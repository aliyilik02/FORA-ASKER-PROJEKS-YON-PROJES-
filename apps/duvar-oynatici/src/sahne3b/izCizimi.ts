/**
 * Işık çizgisi çizimi: mermi izleri ve namlu alevi.
 *
 * Eski iz örneklenmiş bir kutuydu (kare kesitli, düz renkli çubuk): yakından "uçan sopa", uzaktan keskin kenarlı
 * çizgi gibi duruyordu. Burada her iz ekran uzayında bir kapsüldür: baş ve kuyruk noktaları izdüşürülür, aralarına
 * yuvarlak uçlu bir şerit gerilir, parlaklık parçalayıcıda (fragment) hesaplanır:
 *  - sıcak çekirdek (beyaza yakın, dar) + renkli hale (geniş, yumuşak sönen),
 *  - başta parlak nokta (yanan iz bileşiği), kuyruğa doğru incelme ve sönme,
 *  - izleyiciye doğru gelen izde şerit bir noktaya kısalır: yuvarlak parıltı kalır (kutu bu açıdan kayboluyordu),
 *  - çekirdek yarıçapı piksel cinsinden alt sınırlıdır (uzak iz piksel altına inip titremez); her duvar kendi
 *    kamerası ve görüş alanıyla hesaplar (ölçülmüş odada duvarların piksel açısı farklıdır).
 * Değerler doğrusal ve 1'in üstündedir (HDR): film görünümünde son işlem parlaması (bloom) çekirdeği ışıldatır; sade
 * görünümde hale aynı işi görür. Katkı karışımı, derinlik yazmaz, derinliği sınar (bina arkasındaki iz görünmez).
 *
 * Yakın düzlem: uçlardan biri izleyicinin arkasındaysa şerit yakın düzlemde kırpılır; ikisi de arkadaysa çizilmez.
 */
import * as THREE from "three";

const TEPE = /* glsl */ `
attribute vec3 aBas;
attribute vec3 aKuyruk;
attribute vec3 aRenk;
attribute vec2 aBoyut; // x: çekirdek yarıçapı (m), y: güç
uniform vec2 uCozunurluk;
uniform float uEnAzPiksel;
uniform float uHale;
varying vec2 vKonum;    // piksel: x eksen boyunca (0 baş … uzunluk kuyruk), y dik
varying float vUzunluk; // piksel
varying float vYaricap; // piksel (çekirdek)
varying vec3 vRenk;
varying float vGuc;

void main() {
  vec4 vb = viewMatrix * vec4(aBas, 1.0);
  vec4 vk = viewMatrix * vec4(aKuyruk, 1.0);
  float yakin = -0.12;
  vRenk = aRenk;
  vGuc = aBoyut.y;
  vKonum = vec2(0.0);
  vUzunluk = 0.0;
  vYaricap = 1.0;
  if (vb.z > yakin && vk.z > yakin) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  if (vb.z > yakin) vb = mix(vb, vk, (vb.z - yakin) / (vb.z - vk.z));
  if (vk.z > yakin) vk = mix(vk, vb, (vk.z - yakin) / (vk.z - vb.z));
  vec4 cb = projectionMatrix * vb;
  vec4 ck = projectionMatrix * vk;
  vec2 yari = 0.5 * uCozunurluk;
  vec2 sb = cb.xy / cb.w * yari;
  vec2 sk = ck.xy / ck.w * yari;
  vec2 eksen = sk - sb;
  float uzunluk = length(eksen);
  vec2 yon = uzunluk > 0.001 ? eksen / uzunluk : vec2(1.0, 0.0);
  vec2 dik = vec2(-yon.y, yon.x);
  // Odak (piksel): 1 m'lik nesnenin 1 m uzaklıktaki boyu; çekirdek yarıçapı başın uzaklığına göre
  float odak = projectionMatrix[1][1] * yari.y;
  float r = max(uEnAzPiksel, aBoyut.x * odak / max(0.25, -vb.z));
  float hale = r * uHale;
  float uc = position.x; // 0 baş, 1 kuyruk
  float disari = uc * 2.0 - 1.0;
  vec2 p = mix(sb, sk, uc) + yon * disari * hale + dik * position.y * hale;
  vKonum = vec2(uc * uzunluk + disari * hale, position.y * hale);
  vUzunluk = uzunluk;
  vYaricap = r;
  vec4 c = mix(cb, ck, uc);
  gl_Position = vec4(p / yari * c.w, c.z, c.w);
}`;

const PARCA = /* glsl */ `
uniform float uParlaklik;
varying vec2 vKonum;
varying float vUzunluk;
varying float vYaricap;
varying vec3 vRenk;
varying float vGuc;

void main() {
  float t = clamp(vKonum.x / max(vUzunluk, 0.5), 0.0, 1.0); // 0 baş … 1 kuyruk
  float dx = vKonum.x - clamp(vKonum.x, 0.0, vUzunluk);
  float d = length(vec2(dx, vKonum.y));
  // Kuyruğa doğru incelir ve söner (yanan bileşik başta; kuyruk gözde kalan izdir)
  float kalinlik = vYaricap * mix(1.0, 0.4, t);
  float sonme = pow(1.0 - t, 1.5);
  float cekirdek = exp(-(d * d) / (kalinlik * kalinlik) * 1.3);
  float hale = exp(-d / (vYaricap * 1.9)) * 0.3;
  float bas = exp(-dot(vKonum, vKonum) / (vYaricap * vYaricap * 2.6));
  vec3 sicak = vec3(1.0, 0.94, 0.82);
  vec3 renk = vRenk * (hale * (0.35 + 0.65 * sonme) + cekirdek * sonme * 1.1) + sicak * (cekirdek * sonme * 0.8 + bas * 1.5);
  gl_FragColor = vec4(renk * vGuc * uParlaklik, 1.0);
  if (max(gl_FragColor.r, max(gl_FragColor.g, gl_FragColor.b)) < 0.004) discard;
  #include <colorspace_fragment>
}`;

export class IzCizici {
  readonly mesh: THREE.Mesh;
  private readonly geometri: THREE.InstancedBufferGeometry;
  private readonly bas: THREE.InstancedBufferAttribute;
  private readonly kuyruk: THREE.InstancedBufferAttribute;
  private readonly renk: THREE.InstancedBufferAttribute;
  private readonly boyut: THREE.InstancedBufferAttribute;
  private readonly oznitelikler: THREE.InstancedBufferAttribute[];
  private readonly malzeme: THREE.ShaderMaterial;
  private n = 0;
  private readonly gorunum = new THREE.Vector4();

  constructor(readonly kapasite: number) {
    const g = new THREE.InstancedBufferGeometry();
    // Dörtgen: x 0 (baş) … 1 (kuyruk), y −1 … 1; köşeler gölgelendiricide ekran uzayında yerleşir
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0]), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const oz = (boy: number) => new THREE.InstancedBufferAttribute(new Float32Array(kapasite * boy), boy).setUsage(THREE.DynamicDrawUsage);
    this.bas = oz(3);
    this.kuyruk = oz(3);
    this.renk = oz(3);
    this.boyut = oz(2);
    g.setAttribute("aBas", this.bas);
    g.setAttribute("aKuyruk", this.kuyruk);
    g.setAttribute("aRenk", this.renk);
    g.setAttribute("aBoyut", this.boyut);
    this.oznitelikler = [this.bas, this.kuyruk, this.renk, this.boyut];
    g.instanceCount = 0;
    this.geometri = g;
    this.malzeme = new THREE.ShaderMaterial({
      uniforms: {
        uCozunurluk: { value: new THREE.Vector2(1920, 1080) },
        // Çekirdek yarıçapı en az 0,75 px (görünür genişlik ~1,5 px): uzak iz piksel altına inmez
        uEnAzPiksel: { value: 0.75 },
        uHale: { value: 4.5 },
        uParlaklik: { value: 1 },
      },
      vertexShader: TEPE,
      fragmentShader: PARCA,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(g, this.malzeme);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 25;
    // Her duvar kendi görüş alanıyla çizilir: piksel boyutları (cihaz pikseli) o duvarınkinden
    this.mesh.onBeforeRender = (renderer) => {
      renderer.getCurrentViewport(this.gorunum);
      if (this.gorunum.z > 0 && this.gorunum.w > 0) (this.malzeme.uniforms.uCozunurluk.value as THREE.Vector2).set(this.gorunum.z, this.gorunum.w);
    };
  }

  /** Genel parlaklık çarpanı (gündüz soluk, gece tam). */
  set parlaklik(v: number) {
    this.malzeme.uniforms.uParlaklik.value = v;
  }
  get parlaklik(): number {
    return this.malzeme.uniforms.uParlaklik.value as number;
  }

  get sayi(): number {
    return this.n;
  }

  /** Kare başı: önceki çizgiler bırakılır. */
  baslat() {
    this.n = 0;
  }

  /** Bir çizgi: baş (parlak uç) ve kuyruk noktaları (dünya), renk (doğrusal), çekirdek yarıçapı (m), güç. Doluysa atlanır. */
  ekle(bx: number, by: number, bz: number, kx: number, ky: number, kz: number, r: number, g: number, b: number, yaricap: number, guc: number) {
    if (this.n >= this.kapasite) return;
    const i = this.n++;
    this.bas.setXYZ(i, bx, by, bz);
    this.kuyruk.setXYZ(i, kx, ky, kz);
    this.renk.setXYZ(i, r, g, b);
    this.boyut.setXY(i, yaricap, guc);
  }

  /** Kare sonu: yalnız etkin aralık yüklenir; çizgi yokken yükleme de çizim de yok. */
  bitir() {
    this.geometri.instanceCount = this.n;
    this.mesh.visible = this.n > 0;
    if (this.n === 0) return;
    for (const o of this.oznitelikler) {
      o.clearUpdateRanges();
      o.addUpdateRange(0, this.n * o.itemSize);
      o.needsUpdate = true;
    }
  }

  /** Tanı/test: i. çizginin baş ve kuyruk noktaları. */
  cizgi(i: number): { bas: THREE.Vector3; kuyruk: THREE.Vector3; yaricap: number; guc: number } {
    return {
      bas: new THREE.Vector3(this.bas.getX(i), this.bas.getY(i), this.bas.getZ(i)),
      kuyruk: new THREE.Vector3(this.kuyruk.getX(i), this.kuyruk.getY(i), this.kuyruk.getZ(i)),
      yaricap: this.boyut.getX(i),
      guc: this.boyut.getY(i),
    };
  }
}
