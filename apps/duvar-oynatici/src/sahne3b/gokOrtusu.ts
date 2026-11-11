/**
 * Gök örtüsü: panorama arka planını three'nin arka plan kutusu yerine çizer ve havayı panoramanın üstünde yapar.
 * Gök maskesi (`gokMaskesi.ts`) panoramanın göğünü ayırır; orada hareketli bulut (rüzgârla akar, ufka doğru
 * perspektifle küçülür) ve kapalı hava, zeminde tonlama (kapalı havada doygunluk düşer), her yerde yükseklik sisi
 * (3B sisle aynı uzaklık eğrisi; zemin pikselinin uzaklığı göz yüksekliğinden) ve şimşek aydınlatması.
 * Hava açıkken (bulut, sis, şimşek yok) çıktı three'nin arka planıyla aynıdır (aynı küp, aynı döndürme, aynı parlaklık).
 *
 * Sözleşme: `doku` ekrandaki küp (takasta), `maske` aynı panoramanın gök maskesi (yoksa null: bulut yok, tonlama ve
 * sis var), `donus` sahnenin backgroundRotation'ı. Sahnede `background` null tutulur; kutu kameraya taşınır (three'nin
 * arka plan kutusu gibi), en önce ve en uzak düzlemde çizilir.
 */
import * as THREE from "three";
import type { GokMaskesi } from "./gokMaskesi";

const KOSE = /* glsl */ `
varying vec3 vYon;
#include <common>
void main() {
  vYon = transformDirection(position, modelMatrix);
  #include <begin_vertex>
  #include <project_vertex>
  gl_Position.z = gl_Position.w;
}
`;

const PARCA = /* glsl */ `
uniform samplerCube kup;
uniform sampler2D maske;
uniform float maskeVar;
uniform mat3 donus;
uniform float parlaklik;
uniform float bulut;
uniform float yagis;
uniform vec3 bulutRengi;
uniform vec3 gunesYonu;
uniform vec3 gunesRengi;
uniform vec2 bulutKayma;
uniform float sisMiktar;
uniform float sisYakin;
uniform float sisUzak;
uniform float sisYuksekligi;
uniform float gozYuksekligi;
uniform vec3 sisRengi;
uniform vec2 sisKayma;
uniform float simsek;
uniform vec3 simsekYonu;
uniform float maskeGoster;
uniform vec3 diskYonu;
uniform float diskVar;
varying vec3 vYon;

#include <common>

float karma(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float gurultu(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(karma(i), karma(i + vec2(1.0, 0.0)), u.x), mix(karma(i + vec2(0.0, 1.0)), karma(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float t = 0.0;
  float a = 0.5;
  mat2 d = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++) {
    t += a * gurultu(p);
    p = d * p;
    a *= 0.5;
  }
  return t;
}
/** Kaba fbm (3 kat): bükülme ve iç yapı için; ayrıntı ana katmanda. */
float fbm3(vec2 p) {
  mat2 d = mat2(1.6, 1.2, -1.2, 1.6);
  float t = 0.5 * gurultu(p);
  p = d * p;
  t += 0.25 * gurultu(p);
  p = d * p;
  return t + 0.125 * gurultu(p) + 0.0625;
}
float parlak(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

void main() {
  vec3 d = normalize(vYon);
  vec3 pd = donus * d;
  vec3 renk = textureCube(kup, pd).rgb;
  vec2 uv = equirectUv(pd);
  // Kenar dışa kaydırılır: yarı maskeli kenar piksellerinde panoramanın parlak göğü kapalı havada hale bırakıyordu
  float m = maskeVar > 0.5 ? smoothstep(0.04, 0.5, texture2D(maske, vec2(uv.x, 1.0 - uv.y)).r) : 0.0;
  // Güneş/ay diski ve halesi maskeden düşebilir (hale ufka değerse delik sayılmaz): kapalı havada bulutun arkasında kalsın
  if (diskVar > 0.5) m = max(m, smoothstep(0.9925, 0.9976, dot(d, diskYonu)));
  float L = parlak(renk);

  // Kapalı hava: zemin doygunluğu düşer (güneşli fotoğrafın sert renkleri yumuşar)
  vec3 zemin = mix(renk, vec3(L), bulut * 0.4);

  vec3 gok = renk;
  if (bulut > 0.001 && m > 0.001) {
    // Mevcut gök griye döner, sonra bulut katmanı: düzlem izdüşümü (ufka doğru küçülür), rüzgârla kayar
    vec3 gri = vec3(L) * vec3(0.96, 0.98, 1.02);
    gok = mix(renk, gri, bulut * 0.85);
    gok = mix(gok, bulutRengi, bulut * 0.55);
    float yuk = max(d.y, 0.0);
    vec2 q = d.xz / (yuk + 0.08) * 0.9 + bulutKayma;
    vec2 bukulme = vec2(fbm3(q * 0.7 + 3.1), fbm3(q * 0.7 - 5.7));
    float n = fbm(q * 1.2 + bukulme * 1.4);
    float esik = mix(0.78, 0.2, bulut);
    float yogun = smoothstep(esik, esik + 0.28, n);
    float ortu = smoothstep(0.65, 1.0, bulut);
    yogun = max(yogun, ortu * (0.82 + 0.18 * n));
    // İç yapı: koyu tabanlar ve aydınlık kenarlar; yağışta bulut koyulaşır
    float ic = fbm3(q * 2.7 - bukulme);
    vec3 koyu = bulutRengi * mix(0.62, 0.34, yagis);
    vec3 acik = bulutRengi * mix(1.12, 0.78, yagis);
    vec3 bulutR = mix(koyu, acik, clamp(0.55 - yogun * 0.35 + (ic - 0.5) * 0.9, 0.0, 1.0));
    // Parçalı bulut (açık havada) güneşte beyaz; örtü kapandıkça ve yağışta griye iner
    bulutR *= mix(1.75, 1.0, max(smoothstep(0.35, 0.85, bulut), yagis));
    float gunesYakin = pow(max(dot(d, gunesYonu), 0.0), 10.0);
    bulutR += gunesRengi * gunesYakin * (1.0 - yogun) * 0.5;
    // Ufka yakın bulut dokusu pusa karışır (izdüşüm orada sıkışır, örnekleme bozulmasın)
    float ufuk = smoothstep(0.0, 0.2, yuk);
    vec3 pus = bulutRengi * mix(0.95, 0.8, yagis);
    bulutR = mix(pus, bulutR, ufuk);
    gok = mix(gok, bulutR, clamp(yogun * mix(0.6, 1.0, ufuk), 0.0, 1.0) * 0.97);
  }
  vec3 c = mix(zemin, gok, m) * parlaklik;

  // Yükseklik sisi: zemin pikselinin uzaklığı göz yüksekliğinden, gökte sis katmanının içindeki yol; 3B sisle aynı
  // doğrusal eğri (sisYakin..sisUzak). Rüzgârla kayan kümeler sisi yer yer koyulaştırır/açar.
  if (sisMiktar > 0.001) {
    float D = d.y < -0.002 ? gozYuksekligi / -d.y : sisYuksekligi / max(d.y, 0.002);
    float f = clamp((D - sisYakin) / max(sisUzak - sisYakin, 1.0), 0.0, 1.0);
    float az = atan(d.z, d.x);
    float k = fbm3(vec2(az * 5.0, d.y * 18.0) + sisKayma);
    f *= mix(0.72, 1.18, k);
    c = mix(c, sisRengi, clamp(f, 0.0, 1.0) * sisMiktar);
  }

  // Şimşek: bulutlar (gök) içten aydınlanır, çakma yönünde güçlü; zemine az yansır
  if (simsek > 0.001) {
    float yon = pow(max(dot(d, simsekYonu), 0.0), 6.0);
    c += vec3(0.82, 0.86, 1.0) * simsek * (0.18 + 1.6 * yon) * mix(0.25, 1.0, m);
  }
  if (maskeGoster > 0.5) c = mix(c, vec3(1.0, 0.0, 0.2), m * 0.5);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}
`;

export class GokOrtusu {
  readonly kutu: THREE.Mesh<THREE.BoxGeometry, THREE.ShaderMaterial>;
  private readonly matris = new THREE.Matrix4();

  constructor() {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.deleteAttribute("normal");
    geo.deleteAttribute("uv");
    const malzeme = new THREE.ShaderMaterial({
      name: "GokOrtusu",
      uniforms: {
        kup: { value: null },
        maske: { value: null },
        maskeVar: { value: 0 },
        donus: { value: new THREE.Matrix3() },
        parlaklik: { value: 1 },
        bulut: { value: 0 },
        yagis: { value: 0 },
        bulutRengi: { value: new THREE.Color(0.6, 0.62, 0.65) },
        gunesYonu: { value: new THREE.Vector3(0, 1, 0) },
        gunesRengi: { value: new THREE.Color(1, 0.95, 0.85) },
        bulutKayma: { value: new THREE.Vector2() },
        sisMiktar: { value: 0 },
        sisYakin: { value: 0 },
        sisUzak: { value: 1000 },
        sisYuksekligi: { value: 60 },
        gozYuksekligi: { value: 1.7 },
        sisRengi: { value: new THREE.Color(0.7, 0.72, 0.75) },
        sisKayma: { value: new THREE.Vector2() },
        simsek: { value: 0 },
        simsekYonu: { value: new THREE.Vector3(0, 0.3, -1).normalize() },
        maskeGoster: { value: 0 },
        diskYonu: { value: new THREE.Vector3(0, 1, 0) },
        diskVar: { value: 0 },
      },
      vertexShader: KOSE,
      fragmentShader: PARCA,
      side: THREE.BackSide,
      depthTest: false,
      depthWrite: false,
      fog: false,
    });
    this.kutu = new THREE.Mesh(geo, malzeme);
    this.kutu.name = "gokOrtusu";
    this.kutu.frustumCulled = false;
    this.kutu.renderOrder = -1e6;
    this.kutu.visible = false;
    this.kutu.matrixAutoUpdate = false;
    // three'nin arka plan kutusu gibi: her duvar kamerasında göz noktasına taşınır (yalnız konum; dönüş yok)
    this.kutu.onBeforeRender = (_r, _s, kamera) => {
      this.kutu.matrixWorld.copyPosition(kamera.matrixWorld);
    };
  }

  get u() {
    return this.kutu.material.uniforms;
  }

  /** Ekrandaki küp ve gök maskesi (takasta). Küp yoksa kutu gizlenir. */
  ayarla(kup: THREE.Texture | null, maske: THREE.DataTexture | null) {
    this.u.kup.value = kup;
    this.u.maske.value = maske;
    this.u.maskeVar.value = maske ? 1 : 0;
    this.kutu.visible = kup !== null;
  }

  /** three'nin `backgroundRotation` uygulamasıyla aynı: dönüşün tersi (dikgen matris, devrik). */
  donusAyarla(euler: THREE.Euler) {
    (this.u.donus.value as THREE.Matrix3).setFromMatrix4(this.matris.makeRotationFromEuler(euler)).transpose();
  }

  /** Maskeden doku (dik düzen; gölgelendirici v'yi çevirir). Çağıran bırakır (`dispose`). */
  static maskeDokusu(m: GokMaskesi): THREE.DataTexture {
    const t = new THREE.DataTexture(m.veri, m.genislik, m.yukseklik, THREE.RedFormat, THREE.UnsignedByteType);
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    t.generateMipmaps = false;
    t.unpackAlignment = 1;
    t.needsUpdate = true;
    return t;
  }

  dispose() {
    this.kutu.geometry.dispose();
    this.kutu.material.dispose();
  }
}
