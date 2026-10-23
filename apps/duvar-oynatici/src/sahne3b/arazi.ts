/**
 * 3B arazi katmanı: yükseklik haritası + çok katmanlı PBR doku karışımı (splat) + krater deformasyonu +
 * çimen/kaya/çalı dağıtımı. İki kip:
 *  - "hibrit": yakın alan (±160 m) 3B arazi, uzak dağlar/gök panoramadan; arazi kenarı sise karışır.
 *  - "tam":    uzak halka (±1200 m, tepeler) da 3B; gökyüzü prosedürel (gokyuzu.ts), panorama kapalı.
 *
 * Yükseklik fonksiyonu `yukseklik(x, z)` diğer katmanlar için tek kaynak (uzay.ts `zeminFonksiyonu`):
 * figür, sütre, helikopter inişi, mermi çarpması, krater hep arazinin üstüne oturur.
 *
 * Dokular: Poly Haven CC0, 2K JPG (icerik/arazi/dokular, `araclar/arazi-indir.mjs` ile indirilir).
 * Modeller: Poly Haven CC0 fotogrametri kaya/çimen/çalı (icerik/arazi/modeller, 1K glTF).
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { ImprovedNoise } from "three/examples/jsm/math/ImprovedNoise.js";
import { ZEMIN_Y } from "./uzay";

export type AraziModu = "kapali" | "hibrit" | "tam";

/** Bölgeye göre arazi karakteri (tipik Anadolu arazisi; gerçek DEM değil). */
export interface AraziProfili {
  tohum: number;
  /** Büyük dalga genliği (m) ve dalga boyu (m): tarla/ova için küçük, dağlık için büyük. */
  genlik: number;
  dalga: number;
  /** Arka-sol sırt yüksekliği (m); 0 = yok. */
  sirt: number;
  /** Dere yatağı derinliği (m); 0 = yok. */
  dere: number;
  /** Uzak tepeler (tam kipte) genliği (m). */
  uzakTepe: number;
  /** Köy yolu var mı. */
  yol: boolean;
  /** Çimen yoğunluğu 0–1, kaya yoğunluğu 0–1, çalı 0–1. */
  cimen: number;
  kaya: number;
  cali: number;
  /** Zemin tonu: 0 yeşil çayır … 1 kuru bozkır. */
  kuruluk: number;
  /** Doku seti (icerik/arazi/dokular/<ad>_renk.jpg): ana toprak, çimen/çayır katmanı, makro ton (geniş alan). */
  dokular: { toprak: string; toprakOlcek: number; cimen: string; cimenOlcek: number; makro: string; makroOlcek: number };
}
const BOZKIR = { toprak: "bozkir", toprakOlcek: 4, cimen: "cimen_kaya", cimenOlcek: 15, makro: "makro_kahve", makroOlcek: 20 };
const CAYIR = { toprak: "kuru_toprak", toprakOlcek: 4, cimen: "cimen_kaya", cimenOlcek: 15, makro: "uzak_arazi", makroOlcek: 90 };

export const ARAZI_PROFILLERI: Record<string, AraziProfili> = {
  kirsal_acik_arazi: { tohum: 11, genlik: 9, dalga: 120, sirt: 18, dere: 3, uzakTepe: 45, yol: true, cimen: 0.7, kaya: 0.8, cali: 0.8, kuruluk: 0.8, dokular: BOZKIR },
  daglik: { tohum: 23, genlik: 22, dalga: 110, sirt: 40, dere: 0, uzakTepe: 160, yol: false, cimen: 0.4, kaya: 1, cali: 0.3, kuruluk: 0.6, dokular: BOZKIR },
  ormanlik: { tohum: 37, genlik: 7, dalga: 120, sirt: 10, dere: 1.5, uzakTepe: 60, yol: true, cimen: 0.9, kaya: 0.4, cali: 1, kuruluk: 0.25, dokular: CAYIR },
  us_bolgesi: { tohum: 41, genlik: 1.5, dalga: 160, sirt: 0, dere: 0, uzakTepe: 30, yol: true, cimen: 0.5, kaya: 0.2, cali: 0.3, kuruluk: 0.7, dokular: BOZKIR },
  meskun_mahal: { tohum: 53, genlik: 2, dalga: 150, sirt: 6, dere: 0, uzakTepe: 40, yol: true, cimen: 0.6, kaya: 0.2, cali: 0.4, kuruluk: 0.5, dokular: CAYIR },
};

export interface AraziKalitesi {
  /** Çimen demeti sayısı, kaya örnek sayısı çarpanı, arazinin kendi gölgesi. */
  cimenSayisi: number;
  kayaCarpani: number;
  araziGolgesi: boolean;
}
export const ARAZI_KALITE: Record<"dusuk" | "orta" | "yuksek", AraziKalitesi> = {
  dusuk: { cimenSayisi: 2500, kayaCarpani: 0.5, araziGolgesi: false },
  orta: { cimenSayisi: 5000, kayaCarpani: 0.8, araziGolgesi: true },
  yuksek: { cimenSayisi: 9000, kayaCarpani: 1, araziGolgesi: true },
};

/** Yakın arazi boyutu (m) ve ızgara adımı (m). */
const YAKIN_BOYUT = 320;
const YAKIN_ADIM = 1;
const UZAK_BOYUT = 2400;
const UZAK_BOLUM = 160;
const SPLAT_BOYUT = 1024;

const noise = new ImprovedNoise();
function fbm(x: number, z: number, tohum: number, oktav = 4): number {
  let t = 0;
  let g = 1;
  let f = 1;
  let n = 0;
  for (let i = 0; i < oktav; i++) {
    t += noise.noise(x * f + tohum * 7.13, z * f + tohum * 3.71, tohum) * g;
    n += g;
    g *= 0.5;
    f *= 2.07;
  }
  return t / n;
}
const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Köy yolu merkez çizgisi: z(x). İzleyicinin ~32 m önünden geçer, hafif kıvrımlı. */
function yolZ(x: number): number {
  return -32 + 9 * Math.sin(x / 70) + 3 * Math.sin(x / 23);
}

export class AraziKatmani {
  readonly grup = new THREE.Group();
  mod: AraziModu = "kapali";
  profil: AraziProfili = ARAZI_PROFILLERI.kirsal_acik_arazi;
  private kalite: AraziKalitesi = ARAZI_KALITE.yuksek;
  private yakin: THREE.Mesh | null = null;
  private uzak: THREE.Mesh | null = null;
  private yukseklikler: Float32Array | null = null;
  private readonly n = YAKIN_BOYUT / YAKIN_ADIM + 1;
  private malzeme: THREE.MeshStandardMaterial | null = null;
  private uniformlar: Record<string, THREE.IUniform> = {};
  private splatTuval: HTMLCanvasElement | null = null;
  private splatDoku: THREE.CanvasTexture | null = null;
  private cimen: THREE.InstancedMesh | null = null;
  private cimenKonumlar: Float32Array | null = null;
  private cimenOlcekler: Float32Array | null = null;
  private bitkiGrubu = new THREE.Group();
  private readonly yukleyici = new GLTFLoader();
  private readonly dokuYukleyici = new THREE.TextureLoader();
  private dokular = new Map<string, THREE.Texture>();
  private zaman = 0;
  private kar = 0;
  private kok = "";
  private nesil = 0;
  /** Yüklenme durumu (HUD). */
  durum = "kapalı";
  /** Kaya/çalı yerleşiminde boş bırakılacak noktalar (mevzi, patlama, iniş). */
  temizNoktalar: THREE.Vector3[] = [];

  constructor() {
    this.grup.add(this.bitkiGrubu);
  }

  get aktif() {
    return this.mod !== "kapali" && this.yakin !== null;
  }

  // ------------------------------------------------------------------ yükseklik
  /** Analitik yükseklik (deformasyonsuz); yakın ızgara bu fonksiyondan örneklenir. */
  private analitik(x: number, z: number): number {
    const p = this.profil;
    const r = Math.hypot(x, z);
    let h = fbm(x / p.dalga, z / p.dalga, p.tohum, 3) * p.genlik;
    h += fbm(x / 38, z / 38, p.tohum + 1, 3) * p.genlik * 0.22;
    h += fbm(x / 7, z / 7, p.tohum + 2, 2) * 0.25;
    if (p.sirt > 0) {
      // Sırt: arka-sol çaprazında, izleyiciden 110–180 m
      const d = x * 0.55 + z * 0.83 + 112;
      h += p.sirt * Math.exp(-(d * d) / (2 * 38 * 38)) * (0.7 + 0.3 * fbm(x / 60, z / 60, p.tohum + 3, 2));
    }
    if (p.dere > 0) {
      // Dere yatağı: sağ taraftan arkaya doğru kıvrılan vadi
      const dz = z - (70 + 25 * Math.sin(x / 90));
      const dx = x - 60;
      const d = Math.min(Math.abs(dz), Math.abs(dx + 40 * Math.sin(z / 80)));
      h -= p.dere * Math.exp(-(d * d) / (2 * 7 * 7));
    }
    if (p.yol) {
      const d = Math.abs(z - yolZ(x));
      const w = 1 - smooth(2.6, 4.5, d);
      h = h * (1 - w) + (h * 0.3 + fbm(x / 140, 0, p.tohum, 2) * p.genlik * 0.7) * w; // yol boyunca yumuşak
    }
    // Uzak tepeler (tam kip): 300 m'den sonra büyür
    h += fbm(x / 420, z / 420, p.tohum + 9, 3) * p.uzakTepe * smooth(260, 700, r);
    // İzleyici çevresi düz (Oda 2 sütre, göz hizası sabit)
    h *= smooth(9, 26, r);
    return h;
  }

  /** Arazi yüksekliği (m, zemin düzlemine göre); krater deformasyonu dâhil. */
  yukseklik(x: number, z: number): number {
    if (!this.aktif || !this.yukseklikler) return 0;
    const yarim = YAKIN_BOYUT / 2;
    if (Math.abs(x) >= yarim - 1 || Math.abs(z) >= yarim - 1) return this.analitik(x, z);
    const fx = (x + yarim) / YAKIN_ADIM;
    const fz = (z + yarim) / YAKIN_ADIM;
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const tx = fx - ix;
    const tz = fz - iz;
    const n = this.n;
    const h = this.yukseklikler;
    const h00 = h[iz * n + ix];
    const h10 = h[iz * n + ix + 1];
    const h01 = h[(iz + 1) * n + ix];
    const h11 = h[(iz + 1) * n + ix + 1];
    return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
  }

  // ------------------------------------------------------------------ kurulum
  /**
   * Araziyi kurar. `temizNoktalar`: kaya/çalı konmayacak yerler. Dokular ve modeller asenkron yüklenir;
   * arazi ilk kare düz renkle görünür, dokular gelince geçer.
   */
  kur(mod: AraziModu, profil: AraziProfili, kalite: AraziKalitesi, kok: string, kar: number) {
    this.sok();
    this.mod = mod;
    if (mod === "kapali") {
      this.durum = "kapalı";
      return;
    }
    this.profil = profil;
    this.kalite = kalite;
    this.kok = kok;
    this.kar = kar;
    const nesil = ++this.nesil;
    this.durum = "kuruluyor";

    // Yakın ızgara
    const n = this.n;
    const h = new Float32Array(n * n);
    const yarim = YAKIN_BOYUT / 2;
    for (let iz = 0; iz < n; iz++) {
      for (let ix = 0; ix < n; ix++) {
        h[iz * n + ix] = this.analitik(ix * YAKIN_ADIM - yarim, iz * YAKIN_ADIM - yarim);
      }
    }
    this.yukseklikler = h;
    const g = new THREE.PlaneGeometry(YAKIN_BOYUT, YAKIN_BOYUT, n - 1, n - 1);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    // PlaneGeometry rotateX(-90°): satırlar +z'den -z'ye gider; dizimiz z artan sırada → eşle
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, this.yukseklik2(h, x, z));
    }
    g.computeVertexNormals();
    this.malzeme = this.malzemeOlustur();
    const yakin = new THREE.Mesh(g, this.malzeme);
    yakin.position.y = ZEMIN_Y;
    yakin.receiveShadow = true;
    yakin.castShadow = kalite.araziGolgesi;
    yakin.renderOrder = 0;
    this.yakin = yakin;
    this.grup.add(yakin);

    // Uzak halka (tam kip)
    if (mod === "tam") {
      const ug = new THREE.PlaneGeometry(UZAK_BOYUT, UZAK_BOYUT, UZAK_BOLUM, UZAK_BOLUM);
      ug.rotateX(-Math.PI / 2);
      const up = ug.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < up.count; i++) {
        const x = up.getX(i);
        const z = up.getZ(i);
        const icerde = Math.abs(x) < yarim && Math.abs(z) < yarim;
        up.setY(i, this.analitik(x, z) - (icerde ? 0.6 : 0));
      }
      ug.computeVertexNormals();
      const uzak = new THREE.Mesh(ug, this.malzeme);
      uzak.position.y = ZEMIN_Y;
      uzak.receiveShadow = false;
      this.uzak = uzak;
      this.grup.add(uzak);
    }

    this.splatOlustur();
    this.dokulariYukle(nesil);
    this.cimenOlustur();
    void this.bitkileriYukle(nesil);
    this.durum = `${mod} · ${profil.tohum}`;
  }

  private yukseklik2(h: Float32Array, x: number, z: number): number {
    const yarim = YAKIN_BOYUT / 2;
    const ix = Math.round((x + yarim) / YAKIN_ADIM);
    const iz = Math.round((z + yarim) / YAKIN_ADIM);
    return h[Math.min(this.n - 1, Math.max(0, iz)) * this.n + Math.min(this.n - 1, Math.max(0, ix))];
  }

  sok() {
    for (const c of [...this.grup.children]) if (c !== this.bitkiGrubu) this.grup.remove(c);
    for (const c of [...this.bitkiGrubu.children]) this.bitkiGrubu.remove(c);
    this.yakin?.geometry.dispose();
    this.uzak?.geometry.dispose();
    this.cimen?.geometry.dispose();
    this.yakin = null;
    this.uzak = null;
    this.cimen = null;
    this.yukseklikler = null;
    this.mod = "kapali";
    this.durum = "kapalı";
  }

  // ------------------------------------------------------------------ doku / malzeme
  private doku(ad: string, srgb: boolean, tekrar: number): THREE.Texture {
    const anahtar = `${ad}`;
    let d = this.dokular.get(anahtar);
    if (!d) {
      d = this.dokuYukleyici.load(`${this.kok}arazi/dokular/${ad}.jpg`);
      d.wrapS = d.wrapT = THREE.RepeatWrapping;
      d.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      d.anisotropy = 8;
      this.dokular.set(anahtar, d);
    }
    d.repeat.set(tekrar, tekrar);
    return d;
  }

  private dokulariYukle(_nesil: number) {
    // Katman → (renk, normal, metre başına tekrar). Dokular 2K; "uzak_arazi" 90 m'lik makro ton.
    const u = this.uniformlar;
    const ata = (ad: string, dosya: string, srgb: boolean, olcek: number) => {
      u[ad].value = this.doku(dosya, srgb, 1);
      u[ad + "Olcek"].value = 1 / olcek;
    };
    // Doku birimi bütçesi (WebGL en az 16): 7 renk + 2 normal (kaya, kar) + makro + splat + normalMap (toprak,
    // malzemenin kendi yolu) + ortam + gölge haritası = 14. Çimen/çakıl/yol/yanık toprak normalini paylaşır.
    const d = this.profil.dokular;
    ata("tToprak", d.toprak + "_renk", true, d.toprakOlcek);
    ata("tCimen", d.cimen + "_renk", true, d.cimenOlcek);
    ata("tKaya", "kaya_renk", true, 2.5);
    ata("tKayaN", "kaya_normal", false, 2.5);
    ata("tCakil", "tasli_zemin_renk", true, 2);
    ata("tYol", "yol_renk", true, 2);
    ata("tYanik", "yanik_renk", true, 1.2);
    ata("tKar", "kar_renk", true, 2);
    ata("tKarN", "kar_normal", false, 2);
    ata("tUzak", d.makro + "_renk", true, d.makroOlcek);
    this.uniformlar.toprakNOlcek.value = 1 / d.toprakOlcek;
  }

  private malzemeOlustur(): THREE.MeshStandardMaterial {
    const bos = new THREE.Texture();
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0, transparent: this.mod === "hibrit" });
    // Normal yolu açmak için bir normal haritası atanır (gerçek örnekleme shader'da karışımla yapılır)
    m.normalMap = this.doku(this.profil.dokular.toprak + "_normal", false, 1); // shader'da dünya xz ile örneklenir
    m.normalScale.set(0.9, 0.9);
    const u: Record<string, THREE.IUniform> = {
      tSplat: { value: bos },
      kar: { value: this.kar },
      kuruluk: { value: this.profil.kuruluk },
      sisBaslangic: { value: this.mod === "hibrit" ? 120 : 1e6 },
      sisBitis: { value: this.mod === "hibrit" ? 158 : 1e6 },
      yarimBoyut: { value: YAKIN_BOYUT / 2 },
    };
    for (const ad of ["tToprak", "tCimen", "tKaya", "tKayaN", "tCakil", "tYol", "tYanik", "tKar", "tKarN", "tUzak"]) {
      u[ad] = { value: bos };
      u[ad + "Olcek"] = { value: 0.25 };
    }
    u.toprakNOlcek = { value: 0.25 };
    this.uniformlar = u;
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vDunya;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvDunya = (modelMatrix * vec4(position, 1.0)).xyz;");
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
varying vec3 vDunya;
uniform sampler2D tSplat, tToprak, tCimen, tKaya, tKayaN, tCakil, tYol, tYanik, tKar, tKarN, tUzak;
uniform float tToprakOlcek, tCimenOlcek, tKayaOlcek, tKayaNOlcek, tCakilOlcek, tYolOlcek, tYanikOlcek, tKarOlcek, tKarNOlcek, tUzakOlcek, toprakNOlcek;
uniform float kar, kuruluk, sisBaslangic, sisBitis, yarimBoyut;
struct AraziKarisim { float toprak, cimen, kaya, cakil, yol, yanik, kar; };
AraziKarisim araziAgirliklari(vec3 geoNormal) {
  vec2 sp = (vDunya.xz + yarimBoyut) / (2.0 * yarimBoyut);
  vec4 splat = texture2D(tSplat, sp);
  float egim = 1.0 - clamp(geoNormal.y, 0.0, 1.0);
  vec3 makro = texture2D(tUzak, vDunya.xz * tUzakOlcek).rgb;
  float desen = makro.r * 0.6 + makro.g * 0.4;
  AraziKarisim k;
  float cimenPay = clamp((desen - 0.25) * 2.2 - kuruluk * 0.9 + 0.55, 0.0, 1.0);
  k.cimen = cimenPay;
  k.toprak = 1.0 - cimenPay;
  k.cakil = splat.b * 0.9;
  k.kaya = smoothstep(0.30, 0.55, egim);
  k.yol = splat.r;
  k.yanik = splat.g;
  k.kar = kar * (1.0 - smoothstep(0.35, 0.7, egim)) * smoothstep(0.15, 0.45, 0.5 + desen * 0.5 + kar * 0.4);
  // Üst katmanlar altları kapatır
  float kalan = 1.0;
  k.kar *= kalan; kalan -= k.kar;
  k.yanik *= kalan; kalan -= k.yanik;
  k.yol *= kalan; kalan -= k.yol;
  k.kaya *= kalan; kalan -= k.kaya;
  k.cakil *= kalan; kalan -= k.cakil;
  k.cimen *= kalan; k.toprak *= kalan;
  return k;
}`,
        )
        .replace(
          "#include <map_fragment>",
          `{
  AraziKarisim k = araziAgirliklari(normalize(vNormal));
  vec2 xz = vDunya.xz;
  vec3 renk = texture2D(tToprak, xz * tToprakOlcek).rgb * k.toprak
            + texture2D(tCimen, xz * tCimenOlcek).rgb * k.cimen
            + texture2D(tKaya, xz * tKayaOlcek).rgb * k.kaya
            + texture2D(tCakil, xz * tCakilOlcek).rgb * k.cakil
            + texture2D(tYol, xz * tYolOlcek).rgb * k.yol
            + texture2D(tYanik, xz * tYanikOlcek).rgb * k.yanik * 0.6
            + texture2D(tKar, xz * tKarOlcek).rgb * k.kar;
  // Makro ton: 90 m'lik hava fotoğrafı dokusu geniş alanda tekrar hissini kırar; kuru bozkırda sarıya çeker
  vec3 makro = texture2D(tUzak, xz * tUzakOlcek).rgb;
  renk *= mix(vec3(1.0), makro * 1.9, 0.35);
  // Kuruluk: yeşil örtü bozkırda samana döner (doygunluk düşer, sıcak ton); kar üstünde uygulanmaz
  float parlak = dot(renk, vec3(0.3, 0.59, 0.11));
  vec3 saman = parlak * vec3(1.18, 1.02, 0.68);
  renk = mix(renk, saman, kuruluk * (1.0 - k.kar) * (0.35 + 0.45 * k.cimen));
  diffuseColor.rgb *= renk;
  float uzaklik = length(vDunya.xz);
  diffuseColor.a *= 1.0 - smoothstep(sisBaslangic, sisBitis, uzaklik);
}`,
        )
        .replace(
          "#include <normal_fragment_maps>",
          `{
  AraziKarisim k = araziAgirliklari(normalize(vNormal));
  vec2 xz = vDunya.xz;
  // normalMap = kuru toprak normali (çimen/çakıl/yol/yanık da onu kullanır; farklı ölçeklerde)
  vec3 toprakN = texture2D(normalMap, xz * toprakNOlcek).xyz;
  vec3 nm = toprakN * (k.toprak + k.yanik)
          + texture2D(normalMap, xz * toprakNOlcek * 2.0).xyz * (k.cimen + k.cakil + k.yol)
          + texture2D(tKayaN, xz * tKayaNOlcek).xyz * k.kaya
          + texture2D(tKarN, xz * tKarNOlcek).xyz * k.kar;
  vec3 mapN = nm * 2.0 - 1.0;
  mapN.xy *= normalScale;
  normal = normalize( tbn * mapN );
}`,
        );
    };
    m.customProgramCacheKey = () => "arazi-splat-v1";
    return m;
  }

  // ------------------------------------------------------------------ splat (yol, yanık, çakıl)
  private splatOlustur() {
    const c = document.createElement("canvas");
    c.width = SPLAT_BOYUT;
    c.height = SPLAT_BOYUT;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.fillStyle = "rgb(0,0,0)";
    ctx.fillRect(0, 0, SPLAT_BOYUT, SPLAT_BOYUT);
    const olcek = SPLAT_BOYUT / YAKIN_BOYUT;
    const yarim = YAKIN_BOYUT / 2;
    // Çakıl yamaları (B): seyrek lekeler
    const img = ctx.getImageData(0, 0, SPLAT_BOYUT, SPLAT_BOYUT);
    const d = img.data;
    for (let py = 0; py < SPLAT_BOYUT; py += 1) {
      for (let px = 0; px < SPLAT_BOYUT; px += 1) {
        const x = px / olcek - yarim;
        const z = py / olcek - yarim;
        const nz = fbm(x / 22, z / 22, this.profil.tohum + 5, 2);
        const cakil = smooth(0.22, 0.42, nz) * 255;
        d[(py * SPLAT_BOYUT + px) * 4 + 2] = cakil;
      }
    }
    ctx.putImageData(img, 0, 0);
    // Yol (R): merkez çizgisi boyunca kalın çizgi + kenar yumuşatma
    if (this.profil.yol) {
      ctx.strokeStyle = "rgb(255,0,0)";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const ciz = (genislik: number, alfa: number) => {
        ctx.globalAlpha = alfa;
        ctx.lineWidth = genislik * olcek;
        ctx.beginPath();
        for (let x = -yarim; x <= yarim; x += 2) {
          const px = (x + yarim) * olcek;
          const py = (yolZ(x) + yarim) * olcek;
          if (x === -yarim) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      };
      ciz(7, 0.35);
      ciz(4.6, 1);
      ctx.globalAlpha = 1;
    }
    this.splatTuval = c;
    this.splatDoku = new THREE.CanvasTexture(c);
    this.splatDoku.colorSpace = THREE.NoColorSpace;
    this.splatDoku.flipY = false;
    this.uniformlar.tSplat.value = this.splatDoku;
  }

  // ------------------------------------------------------------------ krater
  /** Araziyi çukurlaştırır (kenar hafif yükselir), yanık doku boyar, çimeni temizler. `konum` dünya koordinatı. */
  krater(konum: THREE.Vector3, yaricap: number, siddet: number) {
    if (!this.aktif || !this.yakin || !this.yukseklikler) return;
    const n = this.n;
    const h = this.yukseklikler;
    const yarim = YAKIN_BOYUT / 2;
    const r = Math.max(1.2, yaricap);
    const derinlik = 0.32 * r * (0.5 + siddet * 0.5);
    const ix0 = Math.max(0, Math.floor((konum.x - r * 1.5 + yarim) / YAKIN_ADIM));
    const ix1 = Math.min(n - 1, Math.ceil((konum.x + r * 1.5 + yarim) / YAKIN_ADIM));
    const iz0 = Math.max(0, Math.floor((konum.z - r * 1.5 + yarim) / YAKIN_ADIM));
    const iz1 = Math.min(n - 1, Math.ceil((konum.z + r * 1.5 + yarim) / YAKIN_ADIM));
    const pos = this.yakin.geometry.attributes.position as THREE.BufferAttribute;
    const sutun = n; // PlaneGeometry: satır = z, sütun = x
    for (let iz = iz0; iz <= iz1; iz++) {
      for (let ix = ix0; ix <= ix1; ix++) {
        const x = ix * YAKIN_ADIM - yarim;
        const z = iz * YAKIN_ADIM - yarim;
        const d = Math.hypot(x - konum.x, z - konum.z) / r;
        let dh = 0;
        if (d < 1) dh = -derinlik * Math.pow(1 - d * d, 2);
        const kenar = Math.exp(-Math.pow((d - 1.06) / 0.16, 2)) * derinlik * 0.28;
        dh += kenar;
        if (Math.abs(dh) < 1e-3) continue;
        const i = iz * n + ix;
        h[i] += dh;
        // Geometri köşe indeksi: PlaneGeometry satırları +z'den -z'ye değil; rotateX sonrası z = -(satır) → bul
        const vi = this.koseIndeksi(ix, iz, sutun);
        pos.setY(vi, h[i]);
      }
    }
    pos.needsUpdate = true;
    this.yakin.geometry.computeVertexNormals();
    // Yanık boyası (G)
    if (this.splatTuval && this.splatDoku) {
      const ctx = this.splatTuval.getContext("2d")!;
      const olcek = SPLAT_BOYUT / YAKIN_BOYUT;
      const px = (konum.x + yarim) * olcek;
      const py = (konum.z + yarim) * olcek;
      const g = ctx.createRadialGradient(px, py, 0, px, py, r * 1.5 * olcek);
      g.addColorStop(0, "rgba(0,255,0,1)");
      g.addColorStop(0.6, "rgba(0,255,0,0.85)");
      g.addColorStop(1, "rgba(0,255,0,0)");
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, r * 1.5 * olcek, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      this.splatDoku.needsUpdate = true;
    }
    // Çimen temizle
    if (this.cimen && this.cimenKonumlar && this.cimenOlcekler) {
      const m = new THREE.Matrix4();
      let degisti = false;
      for (let i = 0; i < this.cimen.count; i++) {
        const cx = this.cimenKonumlar[i * 3];
        const cz = this.cimenKonumlar[i * 3 + 2];
        if (Math.hypot(cx - konum.x, cz - konum.z) < r * 1.25 && this.cimenOlcekler[i] > 0) {
          this.cimenOlcekler[i] = 0;
          m.makeScale(0, 0, 0);
          this.cimen.setMatrixAt(i, m);
          degisti = true;
        }
      }
      if (degisti) this.cimen.instanceMatrix.needsUpdate = true;
    }
  }

  /** Izgara (ix, iz) → PlaneGeometry köşe indeksi. PlaneGeometry(…) rotateX(-90°): orijinal y (yukarı +) → z = -y; satır 0 en üst (y=+yarım) → z = -yarım. */
  private koseIndeksi(ix: number, iz: number, sutun: number): number {
    return iz * sutun + ix;
  }

  // ------------------------------------------------------------------ çimen
  private cimenOlustur() {
    if (this.profil.cimen <= 0) return;
    const sayi = Math.round(this.kalite.cimenSayisi * this.profil.cimen);
    // Demet: çapraz iki kart (0,55 × 0,65 m); dokusu prosedürel sap alfa haritası
    const kart = new THREE.PlaneGeometry(0.42, 0.42, 1, 2);
    kart.translate(0, 0.21, 0);
    const kart2 = kart.clone().rotateY(Math.PI / 2);
    const geo = birlestir([kart, kart2]);
    const alfa = cimenAlfaDokusu();
    const renkDoku = cimenRenkDokusu(this.profil.kuruluk);
    const mal = new THREE.MeshStandardMaterial({ map: renkDoku, alphaMap: alfa, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1, metalness: 0 });
    mal.onBeforeCompile = (shader) => {
      shader.uniforms.zaman = this.uniformlar.cimenZaman ?? (this.uniformlar.cimenZaman = { value: 0 });
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nuniform float zaman;")
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
{
  // Rüzgâr: üst köşeler sallanır (uv.y² ile), örnek konumuna göre faz
  vec4 dk = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float faz = dk.x * 0.35 + dk.z * 0.27;
  float sal = sin(zaman * 1.7 + faz) * 0.5 + sin(zaman * 2.9 + faz * 1.7) * 0.25;
  float ust = uv.y * uv.y;
  transformed.x += sal * 0.09 * ust;
  transformed.z += sal * 0.05 * ust;
}`,
        );
    };
    mal.customProgramCacheKey = () => "arazi-cimen-v1";
    const mesh = new THREE.InstancedMesh(geo, mal, sayi);
    const renk = new THREE.Color();
    for (let i = 0; i < sayi; i++) {
      const t = 0.88 + Math.random() * 0.24;
      renk.setRGB(t * (0.97 + Math.random() * 0.06), t, t * (0.9 + Math.random() * 0.12));
      mesh.setColorAt(i, renk);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    const konumlar = new Float32Array(sayi * 3);
    const olcekler = new Float32Array(sayi);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    let yerlesen = 0;
    let deneme = 0;
    while (yerlesen < sayi && deneme < sayi * 6) {
      deneme++;
      // Yakına yoğun, 75 m'ye kadar seyrelerek
      const r = 3 + Math.pow(Math.random(), 0.75) * 80;
      const a = Math.random() * Math.PI * 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (this.profil.yol && Math.abs(z - yolZ(x)) < 3.2) continue;
      const egim = this.egim(x, z);
      if (egim > 0.45) continue;
      const olcek = 0.55 + Math.random() * 0.75;
      p.set(x, ZEMIN_Y + this.yukseklik(x, z) - 0.02, z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI);
      s.set(olcek, olcek * (0.7 + Math.random() * 0.6), olcek);
      m.compose(p, q, s);
      mesh.setMatrixAt(yerlesen, m);
      konumlar[yerlesen * 3] = x;
      konumlar[yerlesen * 3 + 1] = p.y;
      konumlar[yerlesen * 3 + 2] = z;
      olcekler[yerlesen] = olcek;
      yerlesen++;
    }
    mesh.count = yerlesen;
    mesh.instanceMatrix.needsUpdate = true;
    this.cimen = mesh;
    this.cimenKonumlar = konumlar;
    this.cimenOlcekler = olcekler;
    this.bitkiGrubu.add(mesh);
  }

  /** Eğim 0 (düz) – 1 (dik). */
  private egim(x: number, z: number): number {
    const e = 0.75;
    const dx = (this.yukseklik(x + e, z) - this.yukseklik(x - e, z)) / (2 * e);
    const dz = (this.yukseklik(x, z + e) - this.yukseklik(x, z - e)) / (2 * e);
    const n = 1 / Math.sqrt(1 + dx * dx + dz * dz);
    return 1 - n;
  }

  // ------------------------------------------------------------------ kaya / çalı
  private async bitkileriYukle(nesil: number) {
    const liste: Array<{ klasor: string; dosya: string; adet: number; olcek: [number, number]; egimTercihi: number; gomme: number }> = [
      { klasor: "kaya_buyuk", dosya: "boulder_01.gltf", adet: Math.round(7 * this.profil.kaya), olcek: [0.8, 1.7], egimTercihi: 0.6, gomme: 0.18 },
      { klasor: "kaya_orta", dosya: "namaqualand_boulder_02.gltf", adet: Math.round(12 * this.profil.kaya), olcek: [0.7, 1.5], egimTercihi: 0.5, gomme: 0.15 },
      { klasor: "kaya_kucuk", dosya: "namaqualand_boulder_03.gltf", adet: Math.round(16 * this.profil.kaya), olcek: [0.6, 1.3], egimTercihi: 0.3, gomme: 0.12 },
      { klasor: "kaya_yuvarlak", dosya: "rock_09.gltf", adet: Math.round(10 * this.profil.kaya), olcek: [0.6, 1.4], egimTercihi: 0.3, gomme: 0.15 },
      { klasor: "tas_kume", dosya: "sand_rocks_small_01.gltf", adet: Math.round(26 * this.profil.kaya), olcek: [0.8, 1.6], egimTercihi: 0.1, gomme: 0.05 },
      { klasor: "taslar", dosya: "namaqualand_stones_01.gltf", adet: Math.round(30 * this.profil.kaya), olcek: [0.8, 1.6], egimTercihi: 0.1, gomme: 0.04 },
      { klasor: "cali", dosya: "searsia_burchellii.gltf", adet: Math.round(22 * this.profil.cali), olcek: [0.7, 1.6], egimTercihi: 0.0, gomme: 0.05 },
      { klasor: "kuru_dal", dosya: "dry_branches_medium_01.gltf", adet: Math.round(10 * this.profil.cali), olcek: [0.8, 1.4], egimTercihi: 0.0, gomme: 0.03 },
      { klasor: "kutuk", dosya: "dead_tree_trunk_02.gltf", adet: Math.round(3 * this.profil.cali), olcek: [0.8, 1.2], egimTercihi: 0.0, gomme: 0.08 },
      { klasor: "cimen_1", dosya: "grass_medium_01.gltf", adet: Math.round(60 * this.profil.cimen), olcek: [0.8, 1.5], egimTercihi: 0.0, gomme: 0.02 },
      { klasor: "cimen_2", dosya: "grass_medium_02.gltf", adet: Math.round(50 * this.profil.cimen), olcek: [0.8, 1.5], egimTercihi: 0.0, gomme: 0.02 },
    ];
    for (const b of liste) {
      const adet = Math.round(b.adet * this.kalite.kayaCarpani);
      if (adet <= 0) continue;
      let gltf;
      try {
        // Önce sadeleştirilmiş LOD (araclar/arazi-sadelestir.mjs), yoksa özgün fotogrametri modeli
        gltf = await this.yukleyici.loadAsync(`${this.kok}arazi/modeller/${b.klasor}/${b.klasor}_lod.glb`).catch(() => this.yukleyici.loadAsync(`${this.kok}arazi/modeller/${b.klasor}/${b.dosya}`));
      } catch {
        continue;
      }
      if (nesil !== this.nesil) return;
      gltf.scene.updateMatrixWorld(true);
      const kutu = new THREE.Box3().setFromObject(gltf.scene);
      const boyut = kutu.getSize(new THREE.Vector3());
      const taban = kutu.min.y;
      const meshler: THREE.Mesh[] = [];
      gltf.scene.traverse((o) => {
        const mm = o as THREE.Mesh;
        if (mm.isMesh) meshler.push(mm);
      });
      // Konumlar: eğim tercihine göre; temiz noktalardan, yoldan ve izleyici çevresinden uzak
      const yerler: THREE.Matrix4[] = [];
      let deneme = 0;
      while (yerler.length < adet && deneme < adet * 40) {
        deneme++;
        const r = 8 + Math.pow(Math.random(), 1.35) * 140;
        const a = Math.random() * Math.PI * 2;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        if (this.profil.yol && Math.abs(z - yolZ(x)) < 4 + boyut.x) continue;
        const egim = this.egim(x, z);
        if (Math.random() > 0.25 + egim * b.egimTercihi * 3) continue;
        if (this.temizNoktalar.some((t) => Math.hypot(t.x - x, t.z - z) < 4 + boyut.x * 0.5)) continue;
        if (this.yukseklik(x, z) < -1.2 && b.klasor.startsWith("kaya")) continue; // dere yatağına büyük kaya değil
        const olcek = b.olcek[0] + Math.random() * (b.olcek[1] - b.olcek[0]);
        const y = ZEMIN_Y + this.yukseklik(x, z) - taban * olcek - boyut.y * olcek * b.gomme;
        const m = new THREE.Matrix4().compose(
          new THREE.Vector3(x, y, z),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.random() * Math.PI * 2, 0)),
          new THREE.Vector3(olcek, olcek, olcek),
        );
        yerler.push(m);
      }
      for (const kaynak of meshler) {
        kaynak.updateWorldMatrix(true, false);
        const geo = kaynak.geometry.clone().applyMatrix4(kaynak.matrixWorld);
        const mal = kaynak.material as THREE.MeshStandardMaterial;
        if (mal && "side" in mal && b.klasor.startsWith("cimen")) mal.side = THREE.DoubleSide;
        const inst = new THREE.InstancedMesh(geo, mal, yerler.length);
        yerler.forEach((m, i) => inst.setMatrixAt(i, m));
        inst.instanceMatrix.needsUpdate = true;
        inst.castShadow = b.klasor.startsWith("kaya") || b.klasor === "cali" || b.klasor === "kutuk";
        inst.receiveShadow = true;
        inst.frustumCulled = false;
        this.bitkiGrubu.add(inst);
      }
    }
  }

  // ------------------------------------------------------------------ kare
  guncelle(dt: number) {
    this.zaman += dt;
    if (this.uniformlar.cimenZaman) this.uniformlar.cimenZaman.value = this.zaman;
  }

  /** Mevsim: kar örtüsü 0–1 (kış 1, sonbahar 0.15). */
  karAyarla(kar: number) {
    this.kar = kar;
    if (this.uniformlar.kar) this.uniformlar.kar.value = kar;
    if (this.cimen) this.cimen.visible = kar < 0.8;
  }
}

/** Birden çok BufferGeometry'yi (aynı özniteliklerle) tek geometriye birleştirir. */
function birlestir(parcalar: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let taban = 0;
  for (const g of parcalar) {
    const p = g.attributes.position as THREE.BufferAttribute;
    const n = g.attributes.normal as THREE.BufferAttribute;
    const u = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      uv.push(u.getX(i), u.getY(i));
    }
    const ix = g.index!;
    for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + taban);
    taban += p.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  return geo;
}

/** Çimen demeti alfa haritası: dikey saplar, altta dolu üstte seyrek. */
function cimenAlfaDokusu(): THREE.CanvasTexture {
  const n = 128;
  const c = document.createElement("canvas");
  c.width = n;
  c.height = n;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, n, n);
  ctx.strokeStyle = "#fff";
  ctx.lineCap = "round";
  for (let i = 0; i < 26; i++) {
    const x0 = 8 + Math.random() * (n - 16);
    const egri = (Math.random() - 0.5) * 30;
    const boy = n * (0.55 + Math.random() * 0.45);
    ctx.lineWidth = 2 + Math.random() * 2.5;
    ctx.beginPath();
    ctx.moveTo(x0, n);
    ctx.quadraticCurveTo(x0 + egri * 0.5, n - boy * 0.6, x0 + egri, n - boy);
    ctx.stroke();
  }
  const d = new THREE.CanvasTexture(c);
  return d;
}

/** Çimen rengi: alt koyu, üst açık; kuruluğa göre yeşilden samana. */
function cimenRenkDokusu(kuruluk: number): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 64;
  const ctx = c.getContext("2d")!;
  const yesilAlt = [52, 72, 28];
  const yesilUst = [128, 150, 62];
  const kuruAlt = [96, 84, 46];
  const kuruUst = [196, 176, 104];
  const karis = (a: number[], b: number[], t: number) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const alt = karis(yesilAlt, kuruAlt, kuruluk);
  const ust = karis(yesilUst, kuruUst, kuruluk);
  const g = ctx.createLinearGradient(0, 64, 0, 0);
  g.addColorStop(0, `rgb(${alt.join(",")})`);
  g.addColorStop(1, `rgb(${ust.join(",")})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 64);
  const d = new THREE.CanvasTexture(c);
  d.colorSpace = THREE.SRGBColorSpace;
  return d;
}
