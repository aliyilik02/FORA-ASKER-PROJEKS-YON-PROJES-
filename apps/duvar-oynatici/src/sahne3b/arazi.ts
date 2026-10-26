/**
 * 3B arazi katmanı: yükseklik haritası + çok katmanlı PBR doku karışımı (splat) + krater deformasyonu +
 * çimen/kaya/çalı dağıtımı. İki kip:
 *  - "hibrit": yakın alan (profil `yaricap`, 40–160 m) 3B arazi, uzak dağlar/gök panoramadan; arazi kenarı
 *    sise karışır. Ağaç/bina yakın olan panoramalarda (orman, meskûn mahal) yarıçap küçük tutulur ve kenara
 *    doğru hafif çanak (`kenarCukuru`) açılır: böylece panoramadaki gövdeler/temeller arazinin altında kalmaz.
 *  - "tam":    uzak halka (±1200 m, tepeler) da 3B; gökyüzü prosedürel (gokyuzu.ts), panorama kapalı.
 *
 * Yükseklik fonksiyonu `yukseklik(x, z)` diğer katmanlar için tek kaynak (uzay.ts `zeminFonksiyonu`):
 * figür, sütre, helikopter inişi, mermi çarpması, krater hep arazinin üstüne oturur.
 *
 * Dokular: Poly Haven CC0, 2K JPG (icerik/arazi/dokular, `araclar/arazi-indir.mjs` ile indirilir); düşük
 * kalitede yüklenirken 1K'ya küçültülür. Modeller: Poly Haven CC0 fotogrametri kaya/çimen/çalı/fidan
 * (icerik/arazi/modeller, 1K glTF; `araclar/arazi-sadelestir.mjs` ile *_lod.glb).
 */
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { ImprovedNoise } from "three/examples/jsm/math/ImprovedNoise.js";
import { ZEMIN_Y } from "./uzay";

export type AraziModu = "kapali" | "hibrit" | "tam";
export type BitkiSeti = "bozkir" | "orman" | "dag" | "us" | "kent";

export interface AraziDokulari {
  /** Ana toprak dokusu ve metre cinsinden tekrar ölçeği. */
  toprak: string;
  toprakOlcek: number;
  /** Çimen/çayır katmanı. */
  cimen: string;
  cimenOlcek: number;
  /** Makro ton (geniş alan, tekrar hissini kırar; çimen/toprak dağılımını da belirler). */
  makro: string;
  makroOlcek: number;
  /** Yol dokusu (varsayılan "yol" = çakıllı toprak yol). */
  yol?: string;
}

/** Bölgeye göre arazi karakteri (tipik Anadolu arazisi; gerçek DEM değil). */
export interface AraziProfili {
  ad: string;
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
  dokular: AraziDokulari;
  bitkiler: BitkiSeti;
  /**
   * Hibrit kipte görünür arazi yarıçapı (m): bu mesafede arazi tamamen sise/panoramaya karışır. Açık arazide
   * 160; panoramadaki ağaç/bina izleyiciye yakınsa küçük (orman ~48, meskûn ~42) — yoksa gövdeler arazinin
   * altına gömülür.
   */
  yaricap: number;
  /** Hibrit kipte kenara doğru çanak derinliği (m): panoramanın zemini kenarda arazinin üstünden görünür. */
  kenarCukuru: number;
  /** Ağaç gölgesi lekeleri 0–1 (orman): zeminde yumuşak koyu yamalar, panoramadaki gölgeli zemine uyum. */
  golgeLekesi?: number;
  /** Çimen demeti boyut çarpanı (orman altında kısa, bozkırda uzun). */
  demetOlcek?: number;
}

const BOZKIR: AraziDokulari = { toprak: "bozkir", toprakOlcek: 4, cimen: "cimen_kaya", cimenOlcek: 15, makro: "makro_kahve", makroOlcek: 20 };
const ORMAN: AraziDokulari = { toprak: "orman_zemini", toprakOlcek: 3, cimen: "orman_cimen", cimenOlcek: 3, makro: "orman_yaprak", makroOlcek: 24 };
const DAG: AraziDokulari = { toprak: "dag_tasli", toprakOlcek: 7, cimen: "cimen_kaya", cimenOlcek: 15, makro: "dag_kaya", makroOlcek: 45 };
const US: AraziDokulari = { toprak: "us_toprak", toprakOlcek: 6, cimen: "cimen_kaya", cimenOlcek: 15, makro: "makro_kahve", makroOlcek: 20, yol: "us_cakil" };
const KENT: AraziDokulari = { toprak: "kent_toprak", toprakOlcek: 3, cimen: "cimen_kaya", cimenOlcek: 15, makro: "makro_kahve", makroOlcek: 20, yol: "kent_yol" };

export const ARAZI_PROFILLERI: Record<string, AraziProfili> = {
  kirsal_acik_arazi: { ad: "bozkır", tohum: 11, genlik: 9, dalga: 120, sirt: 18, dere: 3, uzakTepe: 45, yol: true, cimen: 0.7, kaya: 0.8, cali: 0.8, kuruluk: 0.8, dokular: BOZKIR, bitkiler: "bozkir", yaricap: 160, kenarCukuru: 0 },
  daglik: { ad: "dağlık", tohum: 23, genlik: 22, dalga: 110, sirt: 40, dere: 0, uzakTepe: 160, yol: false, cimen: 0.4, kaya: 1, cali: 0.3, kuruluk: 0.6, dokular: DAG, bitkiler: "dag", yaricap: 160, kenarCukuru: 0 },
  // Orman: panoramadaki ağaçlar yakın → küçük yarıçap + çanak; zemin yeşil, demetler kısa, ağaç gölgesi lekeleri
  ormanlik: { ad: "ormanlık", tohum: 37, genlik: 5, dalga: 90, sirt: 0, dere: 1.2, uzakTepe: 60, yol: true, cimen: 0.35, kaya: 0.4, cali: 1, kuruluk: 0.05, dokular: ORMAN, bitkiler: "orman", yaricap: 48, kenarCukuru: 1.6, golgeLekesi: 0.5, demetOlcek: 0.75 },
  us_bolgesi: { ad: "üs bölgesi", tohum: 41, genlik: 1.2, dalga: 160, sirt: 0, dere: 0, uzakTepe: 30, yol: true, cimen: 0.4, kaya: 0.2, cali: 0.3, kuruluk: 0.75, dokular: US, bitkiler: "us", yaricap: 90, kenarCukuru: 0.6 },
  // Meskûn mahal: panoramada binalar 5–15 m'de; hibrit varsayılan değil (main.ts), açılırsa küçük ve çimensiz
  meskun_mahal: { ad: "meskûn mahal", tohum: 53, genlik: 1.0, dalga: 150, sirt: 0, dere: 0, uzakTepe: 40, yol: false, cimen: 0.1, kaya: 0.1, cali: 0.25, kuruluk: 0.6, dokular: KENT, bitkiler: "kent", yaricap: 30, kenarCukuru: 0.8, demetOlcek: 0.7 },
};

export interface AraziKalitesi {
  /** Çimen demeti sayısı, kaya örnek sayısı çarpanı, arazinin kendi gölgesi. */
  cimenSayisi: number;
  kayaCarpani: number;
  araziGolgesi: boolean;
  /** Çimen demetleri gölge düşürür (yalnız yüksek). */
  cimenGolgesi: boolean;
  /** Doku anizotropik filtre derecesi. */
  anizotropi: number;
  /** Dokular yüklenirken bu kenara küçültülür (0 = dokunma). Düşük kalitede 1024: bellek/bant genişliği yarıya iner. */
  dokuBoyutu: number;
}
export const ARAZI_KALITE: Record<"dusuk" | "orta" | "yuksek", AraziKalitesi> = {
  dusuk: { cimenSayisi: 2500, kayaCarpani: 0.5, araziGolgesi: false, cimenGolgesi: false, anizotropi: 2, dokuBoyutu: 1024 },
  orta: { cimenSayisi: 5000, kayaCarpani: 0.8, araziGolgesi: true, cimenGolgesi: false, anizotropi: 4, dokuBoyutu: 0 },
  yuksek: { cimenSayisi: 9000, kayaCarpani: 1, araziGolgesi: true, cimenGolgesi: true, anizotropi: 8, dokuBoyutu: 0 },
};

/** Yakın arazi boyutu (m) ve ızgara adımı (m). */
const YAKIN_BOYUT = 320;
const YAKIN_ADIM = 1;
const UZAK_BOYUT = 2400;
const UZAK_BOLUM = 160;
const SPLAT_BOYUT = 1024;
/** Çakıl lekeleri bu çözünürlükte hesaplanır, splat tuvaline büyütülür (1M yerine 65k gürültü örneği). */
const SPLAT_HESAP = 256;

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

/** Model klasörü → özgün glTF dosyası (sadeleştirilmiş *_lod.glb varsa o tercih edilir). */
const MODELLER: Record<string, string> = {
  kaya_buyuk: "boulder_01.gltf",
  kaya_orta: "namaqualand_boulder_02.gltf",
  kaya_kucuk: "namaqualand_boulder_03.gltf",
  kaya_yuvarlak: "rock_09.gltf",
  tas_kume: "sand_rocks_small_01.gltf",
  taslar: "namaqualand_stones_01.gltf",
  cali: "searsia_burchellii.gltf",
  kuru_dal: "dry_branches_medium_01.gltf",
  kutuk: "dead_tree_trunk_02.gltf",
  cimen_1: "grass_medium_01.gltf",
  cimen_2: "grass_medium_02.gltf",
  fidan_goknar: "fir_sapling.gltf",
  fidan_cam: "pine_sapling_small.gltf",
  cali_1: "shrub_01.gltf",
  cali_2: "shrub_02.gltf",
  cali_3: "shrub_03.gltf",
  egrelti: "fern_02.gltf",
  kutuk_2: "tree_stump_01.gltf",
  cam_koku: "pine_roots.gltf",
};

interface BitkiTanimi {
  klasor: string;
  /** Temel adet (profil çarpanı `carpan` alanıyla ve kalite kaya çarpanıyla çarpılır). */
  adet: number;
  carpan: "kaya" | "cali" | "cimen";
  olcek: [number, number];
  /** Eğimli yerleri tercih (0 düz, 1 yamaç). */
  egimTercihi: number;
  /** Tabanın toprağa gömülme payı (model yüksekliğinin oranı). */
  gomme: number;
  golge: boolean;
  /** Dere yatağına (h < -1,2) konmaz. */
  dereYok?: boolean;
}
const kaya = (klasor: string, adet: number, olcek: [number, number], egim: number, gomme: number): BitkiTanimi => ({ klasor, adet, carpan: "kaya", olcek, egimTercihi: egim, gomme, golge: true, dereYok: true });
const tas = (klasor: string, adet: number): BitkiTanimi => ({ klasor, adet, carpan: "kaya", olcek: [0.8, 1.6], egimTercihi: 0.1, gomme: 0.05, golge: false });
const bitki = (klasor: string, adet: number, olcek: [number, number], gomme = 0.04, golge = true): BitkiTanimi => ({ klasor, adet, carpan: "cali", olcek, egimTercihi: 0, gomme, golge });
const ot = (klasor: string, adet: number): BitkiTanimi => ({ klasor, adet, carpan: "cimen", olcek: [0.8, 1.5], egimTercihi: 0, gomme: 0.02, golge: false });

const BITKI_SETLERI: Record<BitkiSeti, BitkiTanimi[]> = {
  bozkir: [
    kaya("kaya_buyuk", 7, [0.8, 1.7], 0.6, 0.18),
    kaya("kaya_orta", 12, [0.7, 1.5], 0.5, 0.15),
    kaya("kaya_kucuk", 16, [0.6, 1.3], 0.3, 0.12),
    kaya("kaya_yuvarlak", 10, [0.6, 1.4], 0.3, 0.15),
    tas("tas_kume", 26),
    tas("taslar", 30),
    bitki("cali", 22, [0.7, 1.6], 0.05),
    bitki("kuru_dal", 10, [0.8, 1.4], 0.03, false),
    bitki("kutuk", 3, [0.8, 1.2], 0.08),
    ot("cimen_1", 60),
    ot("cimen_2", 50),
  ],
  // Fidanlar 1–1,3 m'lik fotogrametri; 2–3,5 m'ye büyütülünce genç ağaç gibi okunur ve panoramanın ağaçlarına köprü olur
  orman: [
    bitki("fidan_goknar", 22, [1.8, 3.0], 0.03),
    bitki("fidan_cam", 18, [1.8, 3.2], 0.03),
    bitki("cali_1", 12, [1.2, 2.0], 0.04),
    bitki("cali_2", 14, [1.2, 2.0], 0.04),
    bitki("cali_3", 14, [1.2, 2.0], 0.04),
    bitki("egrelti", 50, [1.0, 1.8], 0.03, false),
    bitki("kutuk_2", 5, [0.9, 1.3], 0.08),
    bitki("cam_koku", 3, [0.9, 1.2], 0.06),
    bitki("kuru_dal", 8, [0.8, 1.4], 0.03, false),
    kaya("kaya_orta", 4, [0.6, 1.1], 0.3, 0.2),
    tas("taslar", 12),
    ot("cimen_1", 35),
    ot("cimen_2", 30),
  ],
  dag: [
    kaya("kaya_buyuk", 12, [0.9, 2.1], 0.6, 0.2),
    kaya("kaya_orta", 18, [0.8, 1.7], 0.5, 0.15),
    kaya("kaya_kucuk", 22, [0.6, 1.4], 0.3, 0.12),
    kaya("kaya_yuvarlak", 12, [0.6, 1.5], 0.3, 0.15),
    tas("tas_kume", 32),
    tas("taslar", 36),
    bitki("cali", 9, [0.6, 1.2], 0.05),
    bitki("kuru_dal", 6, [0.8, 1.3], 0.03, false),
    ot("cimen_1", 28),
    ot("cimen_2", 22),
  ],
  us: [kaya("kaya_kucuk", 3, [0.6, 1.0], 0.2, 0.15), tas("tas_kume", 10), tas("taslar", 16), bitki("cali", 4, [0.6, 1.1], 0.05), ot("cimen_1", 22), ot("cimen_2", 16)],
  kent: [tas("tas_kume", 6), tas("taslar", 10), bitki("cali", 5, [0.6, 1.2], 0.05), bitki("kuru_dal", 4, [0.8, 1.2], 0.03, false), ot("cimen_1", 20), ot("cimen_2", 15)],
};

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
  private readonly modelOnbellek = new Map<string, Promise<GLTF>>();
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
  /** Uyarı kanalı (doku/model bulunamadı); sahne3b köprü günlüğüne iletir. */
  uyari: ((mesaj: string) => void) | null = null;

  constructor() {
    this.grup.add(this.bitkiGrubu);
  }

  get aktif() {
    return this.mod !== "kapali" && this.yakin !== null;
  }

  /** Hibrit kipte görünür yarıçap (m); sis ayarı için. */
  get yaricap() {
    return this.profil.yaricap;
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
    // Hibrit: kenara doğru çanak — panoramadaki yakın ağaç/bina temelleri arazinin altında kalmasın
    if (this.mod === "hibrit" && p.kenarCukuru > 0) h -= p.kenarCukuru * smooth(p.yaricap * 0.45, p.yaricap * 0.98, r);
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
    // PlaneGeometry rotateX(-90°): satır 0 → z = -yarım, satırlar +z'ye gider; dizimiz de z artan sırada → aynı
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
    // Hibrit kipte malzeme saydam (kenar sis geçişi): saydam listede en önce çizilsin ki derinliği yazılsın ve
    // duman/iz gibi derinlik yazmayan parçacıklar tepe arkasında doğru örtülsün
    yakin.renderOrder = -5;
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
      uzak.renderOrder = -6;
      this.uzak = uzak;
      this.grup.add(uzak);
    }

    this.splatOlustur();
    this.dokulariYukle();
    this.cimenOlustur();
    void this.bitkileriYukle(nesil);
    this.durum = `${mod} · ${profil.ad}`;
  }

  private yukseklik2(h: Float32Array, x: number, z: number): number {
    const yarim = YAKIN_BOYUT / 2;
    const ix = Math.round((x + yarim) / YAKIN_ADIM);
    const iz = Math.round((z + yarim) / YAKIN_ADIM);
    return h[Math.min(this.n - 1, Math.max(0, iz)) * this.n + Math.min(this.n - 1, Math.max(0, ix))];
  }

  /** Araziyi kaldırır ve GPU kaynaklarını serbest bırakır (dokular dâhil; bölge değişince yeniden yüklenir). */
  sok() {
    this.nesil++;
    for (const c of [...this.grup.children]) if (c !== this.bitkiGrubu) this.grup.remove(c);
    for (const c of [...this.bitkiGrubu.children]) {
      this.bitkiGrubu.remove(c);
      const m = c as THREE.InstancedMesh;
      if (m.isInstancedMesh) {
        m.geometry.dispose();
        m.dispose();
      }
    }
    this.yakin?.geometry.dispose();
    this.uzak?.geometry.dispose();
    if (this.cimen) {
      const mal = this.cimen.material as THREE.MeshStandardMaterial;
      mal.map?.dispose();
      mal.alphaMap?.dispose();
      mal.dispose();
    }
    this.malzeme?.dispose();
    this.splatDoku?.dispose();
    for (const d of this.dokular.values()) d.dispose();
    this.dokular.clear();
    this.yakin = null;
    this.uzak = null;
    this.cimen = null;
    this.cimenKonumlar = null;
    this.cimenOlcekler = null;
    this.malzeme = null;
    this.splatTuval = null;
    this.splatDoku = null;
    this.yukseklikler = null;
    this.uniformlar = {};
    this.mod = "kapali";
    this.durum = "kapalı";
  }

  // ------------------------------------------------------------------ doku / malzeme
  /**
   * Doku (icerik/arazi/dokular/<ad>.jpg). Shader dünya xz ile örneklediği için `repeat` kullanılmaz. Dosya
   * yoksa `yedek` denenir, o da yoksa uyarı; doku boş kalır (düz renk). Düşük kalitede 1K'ya küçültülür.
   */
  private doku(ad: string, srgb: boolean, yedek?: string): THREE.Texture {
    let t = this.dokular.get(ad);
    if (t) return t;
    const doku = new THREE.Texture();
    t = doku;
    doku.wrapS = doku.wrapT = THREE.RepeatWrapping;
    doku.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    doku.anisotropy = this.kalite.anizotropi;
    this.dokular.set(ad, doku);
    const nesil = this.nesil;
    const yukle = (dosya: string, sonDeneme: boolean) =>
      this.dokuYukleyici.load(
        `${this.kok}arazi/dokular/${dosya}.jpg`,
        (y) => {
          if (nesil !== this.nesil) {
            y.dispose();
            return;
          }
          doku.image = this.kucult(y.image as HTMLImageElement);
          doku.needsUpdate = true;
        },
        undefined,
        () => {
          if (!sonDeneme && yedek && yedek !== dosya) yukle(yedek, true);
          else this.uyari?.(`Arazi dokusu bulunamadı: arazi/dokular/${dosya}.jpg`);
        },
      );
    yukle(ad, false);
    return doku;
  }

  /** Düşük kalitede 2K dokuyu 1K tuvale çizer (GPU belleği ve bant genişliği yarıya iner). */
  private kucult(img: HTMLImageElement): HTMLImageElement | HTMLCanvasElement {
    const hedef = this.kalite.dokuBoyutu;
    if (!hedef || !img.width || img.width <= hedef) return img;
    const c = document.createElement("canvas");
    c.width = hedef;
    c.height = Math.round((img.height * hedef) / img.width);
    const ctx = c.getContext("2d");
    if (!ctx) return img;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c;
  }

  private dokulariYukle() {
    // Katman → (renk, normal, metre başına tekrar). Dokular 2K; makro doku geniş alan tonu.
    const u = this.uniformlar;
    const ata = (ad: string, dosya: string, srgb: boolean, olcek: number, yedek?: string) => {
      u[ad].value = this.doku(dosya, srgb, yedek);
      u[ad + "Olcek"].value = 1 / olcek;
    };
    // Doku birimi bütçesi (WebGL en az 16): 7 renk + 2 normal (kaya, kar) + makro + splat + normalMap (toprak,
    // malzemenin kendi yolu) + ortam + gölge haritası = 14. Çimen/çakıl/yol/yanık toprak normalini paylaşır.
    const d = this.profil.dokular;
    ata("tToprak", d.toprak + "_renk", true, d.toprakOlcek, "bozkir_renk");
    ata("tCimen", d.cimen + "_renk", true, d.cimenOlcek, "cimen_kaya_renk");
    ata("tKaya", "kaya_renk", true, 2.5);
    ata("tKayaN", "kaya_normal", false, 2.5);
    ata("tCakil", "tasli_zemin_renk", true, 2);
    ata("tYol", (d.yol ?? "yol") + "_renk", true, 2, "yol_renk");
    ata("tYanik", "yanik_renk", true, 1.2);
    ata("tKar", "kar_renk", true, 2);
    ata("tKarN", "kar_normal", false, 2);
    ata("tUzak", d.makro + "_renk", true, d.makroOlcek, "makro_kahve_renk");
    this.uniformlar.toprakNOlcek.value = 1 / d.toprakOlcek;
  }

  private malzemeOlustur(): THREE.MeshStandardMaterial {
    const bos = new THREE.Texture();
    const hibrit = this.mod === "hibrit";
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0, transparent: hibrit });
    // Normal yolu açmak için bir normal haritası atanır (gerçek örnekleme shader'da karışımla yapılır)
    m.normalMap = this.doku(this.profil.dokular.toprak + "_normal", false, "bozkir_normal"); // shader'da dünya xz ile örneklenir
    m.normalScale.set(0.9, 0.9);
    const p = this.profil;
    const u: Record<string, THREE.IUniform> = {
      tSplat: { value: bos },
      kar: { value: this.kar },
      kuruluk: { value: p.kuruluk },
      golgeLekesi: { value: p.golgeLekesi ?? 0 },
      sisBaslangic: { value: hibrit ? p.yaricap * 0.76 : 1e6 },
      sisBitis: { value: hibrit ? p.yaricap : 1e6 },
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
        .replace("#include <common>", "#include <common>\nvarying vec3 vDunya;\nvarying vec3 vDunyaN;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvDunya = (modelMatrix * vec4(position, 1.0)).xyz;\nvDunyaN = normalize(mat3(modelMatrix) * normal);");
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
varying vec3 vDunya;
varying vec3 vDunyaN;
uniform sampler2D tSplat, tToprak, tCimen, tKaya, tKayaN, tCakil, tYol, tYanik, tKar, tKarN, tUzak;
uniform float tToprakOlcek, tCimenOlcek, tKayaOlcek, tKayaNOlcek, tCakilOlcek, tYolOlcek, tYanikOlcek, tKarOlcek, tKarNOlcek, tUzakOlcek, toprakNOlcek;
uniform float kar, kuruluk, golgeLekesi, sisBaslangic, sisBitis, yarimBoyut;
struct AraziKarisim { float toprak, cimen, kaya, cakil, yol, yanik, kar; };
// Karışım ağırlıkları parça başına bir kez hesaplanır (renk ve normal aynı değeri kullanır)
AraziKarisim gArazi;
vec3 gMakro;
void araziAgirliklari(vec3 geoNormal) {
  vec2 sp = (vDunya.xz + yarimBoyut) / (2.0 * yarimBoyut);
  // Yakın alanın dışında (tam kipte uzak halka) splat yok: kenar pikseli (yol) dışarıya uzamasın
  float icerde = step(max(abs(sp.x - 0.5), abs(sp.y - 0.5)), 0.5);
  vec4 splat = texture2D(tSplat, sp) * icerde;
  float egim = 1.0 - clamp(geoNormal.y, 0.0, 1.0);
  gMakro = texture2D(tUzak, vDunya.xz * tUzakOlcek).rgb;
  float desen = gMakro.r * 0.6 + gMakro.g * 0.4;
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
  gArazi = k;
}`,
        )
        .replace(
          "#include <map_fragment>",
          `{
  // Geometri normali dünya uzayında (eğim için); vNormal görüş uzayında olduğu için ayrı varying
  araziAgirliklari(normalize(vDunyaN));
  AraziKarisim k = gArazi;
  vec2 xz = vDunya.xz;
  vec3 renk = texture2D(tToprak, xz * tToprakOlcek).rgb * k.toprak
            + texture2D(tCimen, xz * tCimenOlcek).rgb * k.cimen
            + texture2D(tKaya, xz * tKayaOlcek).rgb * k.kaya
            + texture2D(tCakil, xz * tCakilOlcek).rgb * k.cakil
            + texture2D(tYol, xz * tYolOlcek).rgb * k.yol
            + texture2D(tYanik, xz * tYanikOlcek).rgb * k.yanik * 0.6
            + texture2D(tKar, xz * tKarOlcek).rgb * k.kar;
  // Makro ton: geniş alan dokusu tekrar hissini kırar; kuru bozkırda sarıya çeker
  renk *= mix(vec3(1.0), gMakro * 1.9, 0.35);
  // Kuruluk: yeşil örtü bozkırda samana döner (doygunluk düşer, sıcak ton); kar üstünde uygulanmaz
  float parlak = dot(renk, vec3(0.3, 0.59, 0.11));
  vec3 saman = parlak * vec3(1.18, 1.02, 0.68);
  renk = mix(renk, saman, kuruluk * (1.0 - k.kar) * (0.35 + 0.45 * k.cimen));
  // Ağaç gölgesi lekeleri (orman): makro dokunun iki ölçeği → yumuşak koyu yamalar, güneşli panoramadaki gölgeli zemine uyum
  if (golgeLekesi > 0.0) {
    float leke = texture2D(tUzak, xz * tUzakOlcek * 0.31 + vec2(0.37, 0.61)).g * 0.6 + texture2D(tUzak, xz * tUzakOlcek * 1.7 + vec2(0.11, 0.83)).g * 0.4;
    renk *= 1.0 - golgeLekesi * smoothstep(0.30, 0.55, leke) * 0.6;
  }
  diffuseColor.rgb *= renk;
  float uzaklik = length(vDunya.xz);
  diffuseColor.a *= 1.0 - smoothstep(sisBaslangic, sisBitis, uzaklik);
}`,
        )
        .replace(
          "#include <normal_fragment_maps>",
          `{
  AraziKarisim k = gArazi;
  vec2 xz = vDunya.xz;
  // normalMap = toprak normali (çimen/çakıl/yol/yanık da onu kullanır; farklı ölçeklerde)
  vec3 toprakN = texture2D(normalMap, xz * toprakNOlcek).xyz;
  vec3 nm = toprakN * (k.toprak + k.yanik)
          + texture2D(normalMap, xz * toprakNOlcek * 2.0).xyz * (k.cimen + k.cakil + k.yol)
          + texture2D(tKayaN, xz * tKayaNOlcek).xyz * k.kaya
          + texture2D(tKarN, xz * tKarNOlcek).xyz * k.kar;
  vec3 mapN = nm * 2.0 - 1.0;
  mapN.xy *= normalScale;
  // Teğet çerçevesi dünya eksenlerinden: doku u = +x, v = +z (PlaneGeometry uv'si v'yi ters çevirir; mesh uv'si
  // kullanılmadığı için three'nin tbn'i burada geçersiz). Görüş uzayına taşı.
  vec3 Tg = normalize((viewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz);
  Tg = normalize(Tg - normal * dot(normal, Tg));
  vec3 Bg = cross(Tg, normal);
  normal = normalize(mat3(Tg, Bg, normal) * mapN);
}`,
        );
    };
    m.customProgramCacheKey = () => "arazi-splat-v3";
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
    // Çakıl yamaları (B): seyrek lekeler — düşük çözünürlükte hesaplanır, yumuşatarak büyütülür
    const kucuk = document.createElement("canvas");
    kucuk.width = SPLAT_HESAP;
    kucuk.height = SPLAT_HESAP;
    const kctx = kucuk.getContext("2d")!;
    const img = kctx.createImageData(SPLAT_HESAP, SPLAT_HESAP);
    const d = img.data;
    const kOlcek = SPLAT_HESAP / YAKIN_BOYUT;
    for (let py = 0; py < SPLAT_HESAP; py++) {
      for (let px = 0; px < SPLAT_HESAP; px++) {
        const x = px / kOlcek - yarim;
        const z = py / kOlcek - yarim;
        const nz = fbm(x / 22, z / 22, this.profil.tohum + 5, 2);
        const i = (py * SPLAT_HESAP + px) * 4;
        d[i + 2] = smooth(0.22, 0.42, nz) * 255;
        d[i + 3] = 255;
      }
    }
    kctx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(kucuk, 0, 0, SPLAT_BOYUT, SPLAT_BOYUT);
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
    if (ix1 < ix0 || iz1 < iz0) return;
    const pos = this.yakin.geometry.attributes.position as THREE.BufferAttribute;
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
        pos.setY(i, h[i]); // ızgara (ix, iz) ↔ köşe indeksi iz·n + ix (PlaneGeometry satır = z)
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

  // ------------------------------------------------------------------ çimen
  private cimenOlustur() {
    if (this.profil.cimen <= 0) return;
    const sayi = Math.round(this.kalite.cimenSayisi * this.profil.cimen);
    // Demet: çapraz iki kart (0,42 × 0,42 m); dokusu prosedürel sap alfa haritası
    const kart = new THREE.PlaneGeometry(0.42, 0.42, 1, 2);
    kart.translate(0, 0.21, 0);
    const kart2 = kart.clone().rotateY(Math.PI / 2);
    const geo = birlestir([kart, kart2]);
    kart.dispose();
    kart2.dispose();
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
    mesh.castShadow = this.kalite.cimenGolgesi;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    const konumlar = new Float32Array(sayi * 3);
    const olcekler = new Float32Array(sayi);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const eksenY = new THREE.Vector3(0, 1, 0);
    let yerlesen = 0;
    let deneme = 0;
    // Yakına yoğun, görünür yarıçapın %90'ına (en çok 83 m) kadar seyrelerek
    const enUzak = Math.max(12, Math.min(83, this.profil.yaricap * 0.9));
    while (yerlesen < sayi && deneme < sayi * 6) {
      deneme++;
      const r = 3 + Math.pow(Math.random(), 0.75) * (enUzak - 3);
      const a = Math.random() * Math.PI * 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (this.profil.yol && Math.abs(z - yolZ(x)) < 3.2) continue;
      const egim = this.egim(x, z);
      if (egim > 0.45) continue;
      const olcek = (0.55 + Math.random() * 0.75) * (this.profil.demetOlcek ?? 1);
      p.set(x, ZEMIN_Y + this.yukseklik(x, z) - 0.02, z);
      q.setFromAxisAngle(eksenY, Math.random() * Math.PI);
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
    mesh.visible = this.kar < 0.8;
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

  // ------------------------------------------------------------------ kaya / çalı / fidan
  private model(klasor: string): Promise<GLTF> {
    let p = this.modelOnbellek.get(klasor);
    if (!p) {
      const dosya = MODELLER[klasor];
      // Önce sadeleştirilmiş LOD (araclar/arazi-sadelestir.mjs), yoksa özgün fotogrametri modeli
      p = this.yukleyici.loadAsync(`${this.kok}arazi/modeller/${klasor}/${klasor}_lod.glb`).catch(() => this.yukleyici.loadAsync(`${this.kok}arazi/modeller/${klasor}/${dosya}`));
      p.catch(() => this.modelOnbellek.delete(klasor));
      this.modelOnbellek.set(klasor, p);
    }
    return p;
  }

  private async bitkileriYukle(nesil: number) {
    const liste = BITKI_SETLERI[this.profil.bitkiler] ?? BITKI_SETLERI.bozkir;
    // Yerleşim yarıçapı: görünür yarıçapın %93'ü (en çok 148 m); kenar sisine çok yakın kaya yarım görünmez
    const enUzak = Math.max(14, Math.min(148, this.profil.yaricap * 0.93));
    let eksik = 0;
    for (const b of liste) {
      const adet = Math.round(b.adet * this.profil[b.carpan] * this.kalite.kayaCarpani);
      if (adet <= 0) continue;
      let gltf: GLTF;
      try {
        gltf = await this.model(b.klasor);
      } catch {
        eksik++;
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
        const r = 8 + Math.pow(Math.random(), 1.35) * (enUzak - 8);
        const a = Math.random() * Math.PI * 2;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        if (this.profil.yol && Math.abs(z - yolZ(x)) < 4 + boyut.x) continue;
        const egim = this.egim(x, z);
        if (Math.random() > 0.25 + egim * b.egimTercihi * 3) continue;
        if (this.temizNoktalar.some((t) => Math.hypot(t.x - x, t.z - z) < 4 + boyut.x * 0.5)) continue;
        if (b.dereYok && this.yukseklik(x, z) < -1.2) continue; // dere yatağına büyük kaya değil
        const olcek = b.olcek[0] + Math.random() * (b.olcek[1] - b.olcek[0]);
        const y = ZEMIN_Y + this.yukseklik(x, z) - taban * olcek - boyut.y * olcek * b.gomme;
        const m = new THREE.Matrix4().compose(
          new THREE.Vector3(x, y, z),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.random() * Math.PI * 2, 0)),
          new THREE.Vector3(olcek, olcek, olcek),
        );
        yerler.push(m);
      }
      if (yerler.length === 0) continue;
      const bitkiMi = b.carpan !== "kaya";
      for (const kaynak of meshler) {
        kaynak.updateWorldMatrix(true, false);
        const geo = kaynak.geometry.clone().applyMatrix4(kaynak.matrixWorld);
        const mal = kaynak.material as THREE.MeshStandardMaterial;
        // Yaprak/sap kartları iki yüzlü görünsün (fotogrametri modellerinde tek yüz)
        if (mal && "side" in mal && bitkiMi && (mal.alphaTest > 0 || mal.transparent || b.klasor.startsWith("cimen"))) mal.side = THREE.DoubleSide;
        const inst = new THREE.InstancedMesh(geo, mal, yerler.length);
        yerler.forEach((m, i) => inst.setMatrixAt(i, m));
        inst.instanceMatrix.needsUpdate = true;
        inst.castShadow = b.golge;
        inst.receiveShadow = true;
        inst.frustumCulled = false;
        this.bitkiGrubu.add(inst);
      }
    }
    if (eksik > 0 && nesil === this.nesil) this.uyari?.(`Arazi modelleri eksik: ${eksik} tür yüklenemedi (icerik/arazi/modeller; araclar/arazi-indir.mjs)`);
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
