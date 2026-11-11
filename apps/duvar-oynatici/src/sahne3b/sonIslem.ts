/**
 * Son işlem ("film" görünümü, 11 Kasım 2026 denemesi; `?gorsel=film`).
 *
 * Üç duvar önce yarım-kayan-noktalı (HDR) bir hedefe çizilir, sonra tek tam ekran geçişle tuvale aktarılır:
 *  - temas gölgesi (AO): yalnız derinlikten; karşılıklı komşu çiftlerinin ortalaması merkezden yakınsa girinti
 *    sayılır (duvar dibi, moloz arası, araç altı). Normal gerekmez, düz eğik yüzey kendini karartmaz.
 *  - parlama (bloom): parlak bölgeler çeyrek çözünürlükte bulanıklaştırılıp eklenir (gök, ateş, namlu alevi).
 *  - film tonu: ACES eğrisi + pozlama, hafif kontrast/doygunluk, bantlanmaya karşı titreme.
 *
 * İngilizce karşılıklar: son işlem = post-processing, temas gölgesi = ambient occlusion, parlama = bloom,
 * film tonu = tone mapping.
 */
import * as THREE from "three";

const TEPE = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

/** Parlak bölgeleri ayırıp küçültür (çeyrek çözünürlük). */
const PARLAK = /* glsl */ `
uniform sampler2D tRenk;
uniform vec2 piksel;
uniform float esik;
varying vec2 vUv;
void main() {
  vec3 c = vec3(0.0);
  for (int y = -1; y <= 1; y += 2) for (int x = -1; x <= 1; x += 2) c += texture2D(tRenk, vUv + vec2(float(x), float(y)) * piksel).rgb;
  c *= 0.25;
  float p = max(c.r, max(c.g, c.b));
  // Yumuşak diz: eşiğin altı hiç, üstü giderek artan katkı; çok parlak tek piksel (kıvılcım) ekranı yakmasın
  c *= smoothstep(esik, esik * 2.0, p);
  gl_FragColor = vec4(min(c, vec3(8.0)), 1.0);
}`;

const BULANIK = /* glsl */ `
uniform sampler2D tRenk;
uniform vec2 adim;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tRenk, vUv).rgb * 0.227027;
  c += (texture2D(tRenk, vUv + adim * 1.3846).rgb + texture2D(tRenk, vUv - adim * 1.3846).rgb) * 0.316216;
  c += (texture2D(tRenk, vUv + adim * 3.2308).rgb + texture2D(tRenk, vUv - adim * 3.2308).rgb) * 0.070270;
  gl_FragColor = vec4(c, 1.0);
}`;

/** Temas gölgesi, yarım çözünürlükte (R kanalı: 1 açık, 0 kapalı); birleştirmede 5 örnekle yumuşatılır. */
const TEMAS = /* glsl */ `
uniform sampler2D tDerinlik;
uniform vec2 piksel;
uniform float yakin;
uniform float uzak;
uniform float odak;      // piksel cinsinden odak uzaklığı (1 m'lik nesnenin 1 m uzaklıktaki piksel boyu)
uniform float aoYaricap; // metre
varying vec2 vUv;

float uzaklik(vec2 uv) {
  float d = texture2D(tDerinlik, uv).x;
  return yakin * uzak / (uzak - d * (uzak - yakin));
}

float karma(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

void main() {
  float d0 = texture2D(tDerinlik, vUv).x;
  if (d0 >= 0.99999) {
    gl_FragColor = vec4(1.0);
    return;
  }
  float z = yakin * uzak / (uzak - d0 * (uzak - yakin));
  // Ekrandaki yarıçap uzaklıkla küçülür; çok yakında 48 pikselle sınırlı (doku önbelleği dostu)
  float r = clamp(aoYaricap * odak / z, 2.0, 48.0);
  float aci = karma(gl_FragCoord.xy) * 3.14159;
  float sinir = aoYaricap * 2.5;
  float kapali = 0.0;
  for (int i = 0; i < 8; i++) {
    float a = aci + float(i) * 0.3927;
    float k = (float(i) + 0.5 + karma(gl_FragCoord.yx + float(i))) / 8.0;
    vec2 o = vec2(cos(a), sin(a)) * r * k * piksel;
    float za = uzaklik(vUv + o);
    float zb = uzaklik(vUv - o);
    // Biri bile menzil dışındaysa çift atılır: eğik yüzeyde (zemin, uzayan duvar) tek taraflı örnek sahte gölge yapardı
    if (abs(za - z) > sinir || abs(zb - z) > sinir) continue;
    kapali += clamp((z - 0.5 * (za + zb)) / (aoYaricap * 0.35) - 0.08, 0.0, 1.0);
  }
  // Uzakta (yarıçap 2 pikselin altına inince) söner
  float sonme = smoothstep(1.5, 4.0, aoYaricap * odak / z);
  gl_FragColor = vec4(vec3(1.0 - sonme * min(1.0, kapali / 8.0 * 2.2)), 1.0);
}`;

const BIRLESTIR = /* glsl */ `
uniform sampler2D tRenk;
uniform sampler2D tTemas;
uniform sampler2D tParlama;
uniform vec2 piksel;
uniform float aoGuc;
uniform float parlamaGuc;
uniform float pozlama;
uniform float kontrast;
uniform float doygunluk;
varying vec2 vUv;

float karma(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main() {
  vec3 c = texture2D(tRenk, vUv).rgb;
  if (aoGuc > 0.0) {
    vec2 p = piksel * 2.5;
    float t = texture2D(tTemas, vUv).r * 0.28;
    t += (texture2D(tTemas, vUv + vec2(p.x, p.y)).r + texture2D(tTemas, vUv + vec2(-p.x, p.y)).r + texture2D(tTemas, vUv + vec2(p.x, -p.y)).r + texture2D(tTemas, vUv + vec2(-p.x, -p.y)).r) * 0.18;
    c *= mix(1.0, t, aoGuc);
  }
  c += texture2D(tParlama, vUv).rgb * parlamaGuc;
  c = aces(c * pozlama);
  c = pow(c, vec3(1.0 / 2.2));
  c = (c - 0.5) * kontrast + 0.5;
  float gri = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(gri), c, doygunluk);
  c += (karma(gl_FragCoord.xy + 17.0) - 0.5) / 255.0;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

export interface SonIslemAyari {
  aoGuc: number;
  aoYaricap: number;
  parlamaGuc: number;
  parlamaEsigi: number;
  pozlama: number;
  kontrast: number;
  doygunluk: number;
}

export const SON_ISLEM_VARSAYILAN: SonIslemAyari = { aoGuc: 0.85, aoYaricap: 0.7, parlamaGuc: 0.35, parlamaEsigi: 1.0, pozlama: 1.15, kontrast: 1.06, doygunluk: 1.06 };

export class SonIslem {
  /** Sahnenin çizildiği HDR hedef (derinlik dokulu). */
  readonly hedef: THREE.WebGLRenderTarget;
  readonly ayar: SonIslemAyari = { ...SON_ISLEM_VARSAYILAN };
  private readonly kucukA: THREE.WebGLRenderTarget;
  private readonly kucukB: THREE.WebGLRenderTarget;
  private readonly temasHedef: THREE.WebGLRenderTarget;
  private readonly temas: THREE.ShaderMaterial;
  private readonly sahne = new THREE.Scene();
  private readonly kamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly dortgen: THREE.Mesh;
  private readonly parlak: THREE.ShaderMaterial;
  private readonly bulanik: THREE.ShaderMaterial;
  private readonly birlestir: THREE.ShaderMaterial;
  private W = 1;
  private H = 1;

  constructor(W: number, H: number, ornekleme: number) {
    const derinlik = new THREE.DepthTexture(1, 1);
    derinlik.type = THREE.UnsignedIntType;
    this.hedef = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: true, depthTexture: derinlik, samples: ornekleme });
    const kucuk = () => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.kucukA = kucuk();
    this.kucukB = kucuk();
    this.temasHedef = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    const malzeme = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>) =>
      new THREE.ShaderMaterial({ vertexShader: TEPE, fragmentShader, uniforms, depthTest: false, depthWrite: false, toneMapped: false });
    this.parlak = malzeme(PARLAK, { tRenk: { value: null }, piksel: { value: new THREE.Vector2() }, esik: { value: 1 } });
    this.bulanik = malzeme(BULANIK, { tRenk: { value: null }, adim: { value: new THREE.Vector2() } });
    this.temas = malzeme(TEMAS, { tDerinlik: { value: null }, piksel: { value: new THREE.Vector2() }, yakin: { value: 0.1 }, uzak: { value: 1000 }, odak: { value: 1000 }, aoYaricap: { value: 0.7 } });
    this.birlestir = malzeme(BIRLESTIR, {
      tRenk: { value: null },
      tTemas: { value: null },
      tParlama: { value: null },
      piksel: { value: new THREE.Vector2() },
      aoGuc: { value: 0 },
      parlamaGuc: { value: 0 },
      pozlama: { value: 1 },
      kontrast: { value: 1 },
      doygunluk: { value: 1 },
    });
    this.dortgen = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.birlestir);
    this.dortgen.frustumCulled = false;
    this.sahne.add(this.dortgen);
    this.boyutAyarla(W, H);
  }

  /** Cihaz pikseli cinsinden tuval boyutu. */
  boyutAyarla(W: number, H: number) {
    this.W = Math.max(1, Math.round(W));
    this.H = Math.max(1, Math.round(H));
    this.hedef.setSize(this.W, this.H);
    const kw = Math.max(1, Math.round(this.W / 4));
    const kh = Math.max(1, Math.round(this.H / 4));
    this.kucukA.setSize(kw, kh);
    this.kucukB.setSize(kw, kh);
    this.temasHedef.setSize(Math.max(1, Math.round(this.W / 2)), Math.max(1, Math.round(this.H / 2)));
  }

  /** Bir duvarın çizim alanı (cihaz pikseli); ardından `renderer.setRenderTarget(hedef)` çağrılır. */
  duvarAlani(x: number, genislik: number) {
    this.hedef.viewport.set(x, 0, genislik, this.H);
    this.hedef.scissor.set(x, 0, genislik, this.H);
    this.hedef.scissorTest = true;
  }

  private gecis(r: THREE.WebGLRenderer, malzeme: THREE.ShaderMaterial, hedef: THREE.WebGLRenderTarget | null) {
    this.dortgen.material = malzeme;
    r.setRenderTarget(hedef);
    r.render(this.sahne, this.kamera);
  }

  /** HDR hedefi tuvale aktarır. `kamera`: yakın/uzak düzlem ve odak için duvar kameralarından biri. */
  bitir(r: THREE.WebGLRenderer, kamera: THREE.PerspectiveCamera | THREE.Camera) {
    const a = this.ayar;
    const p = kamera.projectionMatrix.elements;
    // Perspektif izdüşümden yakın/uzak: p[10] = -(f+n)/(f-n), p[14] = -2fn/(f-n)
    const yakin = p[14] / (p[10] - 1);
    const uzak = p[14] / (p[10] + 1);
    const otomatikTemizle = r.autoClear;
    r.autoClear = true;
    const kw = this.kucukA.width;
    const kh = this.kucukA.height;
    if (a.parlamaGuc > 0) {
      this.parlak.uniforms.tRenk.value = this.hedef.texture;
      (this.parlak.uniforms.piksel.value as THREE.Vector2).set(1 / this.W, 1 / this.H);
      this.parlak.uniforms.esik.value = a.parlamaEsigi;
      this.gecis(r, this.parlak, this.kucukA);
      for (let i = 0; i < 2; i++) {
        const g = 1 + i * 1.5;
        this.bulanik.uniforms.tRenk.value = this.kucukA.texture;
        (this.bulanik.uniforms.adim.value as THREE.Vector2).set(g / kw, 0);
        this.gecis(r, this.bulanik, this.kucukB);
        this.bulanik.uniforms.tRenk.value = this.kucukB.texture;
        (this.bulanik.uniforms.adim.value as THREE.Vector2).set(0, g / kh);
        this.gecis(r, this.bulanik, this.kucukA);
      }
    }
    if (a.aoGuc > 0) {
      const t = this.temas.uniforms;
      t.tDerinlik.value = this.hedef.depthTexture;
      (t.piksel.value as THREE.Vector2).set(1 / this.W, 1 / this.H);
      t.yakin.value = yakin;
      t.uzak.value = uzak;
      // Yarım çözünürlükte çalışır: odak tam çözünürlük pikseliyle, örnek adımı da (piksel) tam çözünürlükle
      t.odak.value = (p[5] * this.H) / 2;
      t.aoYaricap.value = a.aoYaricap;
      this.gecis(r, this.temas, this.temasHedef);
    }
    const u = this.birlestir.uniforms;
    u.tRenk.value = this.hedef.texture;
    u.tTemas.value = this.temasHedef.texture;
    u.tParlama.value = this.kucukA.texture;
    (u.piksel.value as THREE.Vector2).set(1 / this.W, 1 / this.H);
    u.aoGuc.value = a.aoGuc;
    u.parlamaGuc.value = a.parlamaGuc;
    u.pozlama.value = a.pozlama;
    u.kontrast.value = a.kontrast;
    u.doygunluk.value = a.doygunluk;
    this.gecis(r, this.birlestir, null);
    r.autoClear = otomatikTemizle;
  }

  birak() {
    this.hedef.depthTexture?.dispose();
    this.hedef.dispose();
    this.kucukA.dispose();
    this.kucukB.dispose();
    this.temasHedef.dispose();
    this.temas.dispose();
    this.parlak.dispose();
    this.bulanik.dispose();
    this.birlestir.dispose();
    this.dortgen.geometry.dispose();
  }
}
