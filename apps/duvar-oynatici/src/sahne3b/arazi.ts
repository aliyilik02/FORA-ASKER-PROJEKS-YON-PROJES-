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
 *
 * Performans (Iris Xe, 3 duvar + gölge her kare): bitkiler model başına malzemeye göre tek geometride birleşir
 * (çimen modelinin 17 alt mesh'i tek çizim), örnekler 8 azimut sektörüne bölünür (BitkiHucresi; duvar başına 3
 * hücre çizilir, bkz. bitkiSektorleri.ts), saydam iki yüzlü yapraklar tek geçişte çizilir, ot/taş 50 m'de, çalı
 * 80 m'de biter. Krater yalnız kendi ızgara penceresinin normallerini hesaplar ve o aralığı yükler (araziIzgara.ts).
 * Bölge değişiminde arazi malzemesi (derlenmiş splat gölgelendiricisi), çimen malzemesi ve ortak dokular korunur.
 */
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { normalleriYumusat } from "./normalYumusat";

/** Meshy bitki/kaya modellerinde yumuşatma eşiği (derece): yaprak kümeleri yumuşar, kaya sırtı keskin kalır. */
const MESHY_NORMAL_ACISI = 75;
import { ImprovedNoise } from "three/examples/jsm/math/ImprovedNoise.js";
import { deinterleaveGeometry, mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { konumlariYaz, kraterPenceresi, kraterUygula, pencereAraligi, pencereNormalleri, pencereyiYenile, type IzgaraDuzeni, type IzgaraPenceresi } from "./araziIzgara";
import { kabukPiramitte, kamaKabugu, kesikPay, sektorlereBol, type OrnekKuresi } from "./bitkiSektorleri";
import { AralikIzgarasi, karistir, yolDizisi } from "./bitkiYerlesimi";
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
  /** Ağaç yoğunluğu çarpanı (varsayılan 1; bitki setindeki ağaç adetleriyle çarpılır). */
  agac?: number;
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
  /** Zemin yeşilliği 0–1 (orman): kahverengi orman tabanı yosun/zeytin yeşiline kayar (splat gölgelendiricisi). */
  yesillik?: number;
  /** Ağaç gölgesi lekeleri 0–1 (orman): zeminde yumuşak koyu yamalar, panoramadaki gölgeli zemine uyum. */
  golgeLekesi?: number;
  /** Çimen demetlerinin en uzak mesafesi (m; varsayılan 83): orman tabanında demetler yakında toplanır, sık görünür. */
  cimenEnUzak?: number;
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
  daglik: { ad: "dağlık", tohum: 23, genlik: 22, dalga: 110, sirt: 40, dere: 0, uzakTepe: 160, yol: false, cimen: 0.4, kaya: 1, cali: 0.7, kuruluk: 0.6, dokular: DAG, bitkiler: "dag", yaricap: 160, kenarCukuru: 0 },
  // Orman: panoramadaki ağaçlar yakın → küçük yarıçap + çanak (alan planı açıkken 3B orman: yarıçap planda, çanak yok);
  // zemin yeşil, sık ve üç tonlu çimen, ağaç gölgesi lekeleri
  ormanlik: { ad: "ormanlık", tohum: 37, genlik: 5, dalga: 90, sirt: 0, dere: 1.2, uzakTepe: 60, yol: true, cimen: 1.5, kaya: 0.4, cali: 1, kuruluk: 0.05, dokular: ORMAN, bitkiler: "orman", yaricap: 48, kenarCukuru: 1.6, golgeLekesi: 0.5, demetOlcek: 0.85, yesillik: 0.75, cimenEnUzak: 50 },
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
/** Görüş koridoru plan noktasının bu kadar metre ötesine kadar sürer (tavan orada yavaşça yükselir, dik duvar kalmaz). */
const KORIDOR_ARKA = 25;
const UZAK_BOYUT = 2400;
const UZAK_BOLUM = 160;
const SPLAT_BOYUT = 1024;
/** Çakıl lekeleri bu çözünürlükte hesaplanır, splat tuvaline büyütülür (1M yerine 65k gürültü örneği). */
const SPLAT_HESAP = 256;
/** Yakın ızgara düzeni (araziIzgara.ts yardımcıları için). */
const IZGARA: IzgaraDuzeni = { n: YAKIN_BOYUT / YAKIN_ADIM + 1, adim: YAKIN_ADIM, yarim: YAKIN_BOYUT / 2 };
/**
 * Bitki hücreleri: 8 azimut sektörü, 22,5° kaydırılmış (ölçüsüz U odada duvar kenarları ±45°/±135° bir sektörün
 * ortasına düşer: duvar başına 3 hücre). Halka bölmesi yok: gölge kutusu (±45 m) her sektöre değiyor, kazanç küçük.
 */
const SEKTOR_SAYISI = 8;
const SEKTOR_KAYMASI = 22.5;
/**
 * Sınıf başına en uzak yerleşim (m; profil yarıçapından küçükse uygulanır, yakındaki yoğunluk aynı kalır): fotogrametri
 * ot ve taşlar 50 m'den ötede duvarda 2–4 piksel (sis bandında görünmez), çalı/dal/kütük 80 m. Kayalar profil
 * yarıçapına kadar kalır (sis bandının boş görünmemesi için; çimen demetleri de 83 m'ye kadar sürer).
 */
const OT_EN_UZAK = 50;
const TAS_EN_UZAK = 50;
const CALI_EN_UZAK = 80;
/** Ağaç izleyiciden en az bu kadar uzakta (m): mevzi, patlama ve sütre çevresi açık kalır. */
const AGAC_EN_YAKIN = 11;
/** Ağacın uzak kopyasına (LOD) geçiş (m); uzak kopya gölge düşürmez (gölge kutusu ±45 m). */
const UZAK_LOD_MESAFE = 40;
/** Kış bitki seti bu kar örtüsünden itibaren (kış 1; sonbahar 0,15 yaz setinde kalır). */
export const KIS_ESIGI = 0.5;

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

/** Çimen demeti ton çarpanları: canlı yeşil, sararmış uçlu, gölgede mavimsi koyu. */
const CIMEN_TONLARI: ReadonlyArray<readonly [number, number, number]> = [
  [0.95, 1.0, 0.84],
  [1.1, 1.03, 0.72],
  [0.8, 0.94, 0.9],
];

/**
 * Model klasörü → özgün glTF dosyası (sadeleştirilmiş *_lod.glb varsa o tercih edilir). Meshy modelleri ("m_" önekli,
 * araclar/bitki-modelleri.json) yalnız *_lod.glb ve ağaçlarda *_uzak.glb olarak gelir.
 */
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

/**
 * Bitki sınıfı: kraterde ot/çalı/taş silinir (savruldu), kaya ve ağaç yeni zemine iner. Ağaç: 9–20 m Meshy
 * modelleri (araclar/bitki-modelleri.json), uzak kopyalı (LOD), gövdeler arası aralıklı, yakın çevreyi açık bırakır.
 */
type BitkiSinifi = "kaya" | "tas" | "cali" | "ot" | "agac";

interface BitkiTanimi {
  klasor: string;
  /** Temel adet (profil çarpanı `carpan` alanıyla ve kalite kaya çarpanıyla çarpılır). */
  adet: number;
  carpan: "kaya" | "cali" | "cimen" | "agac";
  sinif: BitkiSinifi;
  olcek: [number, number];
  /** Eğimli yerleri tercih (0 düz, 1 yamaç). */
  egimTercihi: number;
  /** Tabanın toprağa gömülme payı (model yüksekliğinin oranı). */
  gomme: number;
  golge: boolean;
  /** Dere yatağına (h < -1,2) konmaz. */
  dereYok?: boolean;
  /** En uzak yerleşim (m); verilmezse profil yarıçapı. Bkz. OT_EN_UZAK. */
  enUzak?: number;
  /** En yakın yerleşim (m; varsayılan 8). Ağaç izleyicinin çevresini, yar uzağı tutar. */
  enYakin?: number;
  /** Mesafe dağılımı üssü (r = enYakin + u^us · aralık): 1,35 yakına yığar (çalı, ot), 0,5 alanca eşit (orman). */
  us?: number;
  /** Uzak kopya (<klasor>_uzak.glb) UZAK_LOD_MESAFE ötesinde çizilir ve gölge düşürmez. */
  uzak?: boolean;
  /** Gövdeler arası en az mesafe (m, ölçekle çarpılır): ağaçlar iç içe girmez (bütün ağaç türleri ortak ızgarada). */
  aralik?: number;
  /** Rüzgâr salınımı: tepenin model metresinde kayması (varsayılan çalı/ot 0,045; ağaç ~0,12; 0 = yok). */
  ruzgar?: number;
  /** Yol boyu dizi (kavak sırası): yolun iki yanında `pay` m açıkta, `adim` m arayla (`faz` kaydırmalı), `bosluk` atlanır. */
  dizi?: { pay: number; adim: number; faz: number; bosluk: number };
  /** Model rengine çarpan (örnek rengi): pişirilmiş dokusu fazla mavi/turkuaz kalan modeli yerel yeşile çeker. */
  renk?: [number, number, number];
}
/** #214 "koyu çalı" pişirmede turkuaza kaçtı: zeytin yeşiline çeken örnek rengi. */
const CALI_214_RENK: [number, number, number] = [1.18, 1.0, 0.62];
const kaya = (klasor: string, adet: number, olcek: [number, number], egim: number, gomme: number): BitkiTanimi => ({ klasor, adet, carpan: "kaya", sinif: "kaya", olcek, egimTercihi: egim, gomme, golge: true, dereYok: true });
const tas = (klasor: string, adet: number): BitkiTanimi => ({ klasor, adet, carpan: "kaya", sinif: "tas", olcek: [0.8, 1.6], egimTercihi: 0.1, gomme: 0.05, golge: false, enUzak: TAS_EN_UZAK });
const bitki = (klasor: string, adet: number, olcek: [number, number], gomme = 0.04, golge = true, ek: Partial<BitkiTanimi> = {}): BitkiTanimi => ({ klasor, adet, carpan: "cali", sinif: "cali", olcek, egimTercihi: 0, gomme, golge, enUzak: CALI_EN_UZAK, ...ek });
const ot = (klasor: string, adet: number): BitkiTanimi => ({ klasor, adet, carpan: "cimen", sinif: "ot", olcek: [0.8, 1.5], egimTercihi: 0, gomme: 0.02, golge: false, enUzak: OT_EN_UZAK });
/** Ağaç: alanca eşit dağılım (orman uzakta da sık), 11 m'den ötede, gövdeler en az 3,4 m arayla. */
const agac = (klasor: string, adet: number, olcek: [number, number], ek: Partial<BitkiTanimi> = {}): BitkiTanimi => ({ klasor, adet, carpan: "agac", sinif: "agac", olcek, egimTercihi: 0, gomme: 0.02, golge: true, dereYok: true, enYakin: AGAC_EN_YAKIN, us: 0.55, uzak: true, aralik: 3.4, ruzgar: 0.12, ...ek });
/** Genç ağaç / alt tabaka: daha sık ve izleyiciye biraz daha yakın. */
const genc = (klasor: string, adet: number, olcek: [number, number], ek: Partial<BitkiTanimi> = {}) => agac(klasor, adet, olcek, { aralik: 2.2, enYakin: 9, ruzgar: 0.08, ...ek });
const kuruAgac = (klasor: string, adet: number, olcek: [number, number], ek: Partial<BitkiTanimi> = {}) => agac(klasor, adet, olcek, { ruzgar: 0, ...ek });
/** Köy yolu kavak sırası: üç tür aynı adımda farklı fazla iç içe tek sıra (yolun iki yanı, ~8 m arayla). */
const yolSirasi = (klasor: string, faz: number, ek: Partial<BitkiTanimi> = {}) => agac(klasor, 80, [0.85, 1.15], { dizi: { pay: 6.5, adim: 24, faz, bosluk: 0.18 }, aralik: 3, enYakin: 12, ...ek });
/** Devrik gövde, kütük: çalı sınıfı (kraterde savrulur) ama sallanmaz. */
const kutuk = (klasor: string, adet: number, olcek: [number, number], gomme = 0.1) => bitki(klasor, adet, olcek, gomme, true, { ruzgar: 0 });
/** Yar, kayalık, taşlık: büyük kaya kütleleri yamaçta ve uzakta. */
const kayalik = (klasor: string, adet: number, olcek: [number, number], enYakin: number): BitkiTanimi => ({ ...kaya(klasor, adet, olcek, 0.7, 0.18), enYakin, us: 0.8 });

const BITKI_SETLERI: Record<BitkiSeti, BitkiTanimi[]> = {
  // Kırsal: köy yolu boyunca kavak sırası, tarlada seyrek meşe ve yaprak döken ağaç, köy kenarında servi/mazı
  bozkir: [
    yolSirasi("m_kavak_83", 0),
    yolSirasi("m_kavak_95", 8),
    yolSirasi("m_kavak_79", 16),
    agac("m_mese_62", 10, [0.8, 1.2], { ruzgar: 0.1, aralik: 6 }),
    agac("m_mese_68", 10, [0.8, 1.2], { ruzgar: 0.1, aralik: 6 }),
    agac("m_mese_77", 8, [0.8, 1.2], { ruzgar: 0.1, aralik: 6 }),
    agac("m_yaprak_87", 8, [0.8, 1.2], { ruzgar: 0.1, aralik: 6 }),
    agac("m_yaprak_88", 6, [0.8, 1.2], { ruzgar: 0.1, aralik: 6 }),
    agac("m_yaprak_89", 6, [0.8, 1.2], { ruzgar: 0.1, aralik: 6 }),
    agac("m_servi_52", 5, [0.85, 1.15], { aralik: 2.5, ruzgar: 0.05 }),
    agac("m_mazi_49", 6, [0.8, 1.2], { aralik: 2.5, ruzgar: 0.05, enYakin: 9 }),
    kuruAgac("m_kuru_90", 3, [0.8, 1.2]),
    kaya("kaya_buyuk", 7, [0.8, 1.7], 0.6, 0.18),
    kaya("kaya_orta", 12, [0.7, 1.5], 0.5, 0.15),
    kaya("kaya_kucuk", 16, [0.6, 1.3], 0.3, 0.12),
    kaya("kaya_yuvarlak", 10, [0.6, 1.4], 0.3, 0.15),
    tas("tas_kume", 26),
    tas("taslar", 30),
    bitki("m_cali_214", 12, [0.8, 1.3], 0.04, true, { renk: CALI_214_RENK }),
    bitki("m_kuru_cali_273", 20, [0.8, 1.4], 0.04),
    bitki("cali", 22, [0.7, 1.6], 0.05),
    bitki("kuru_dal", 10, [0.8, 1.4], 0.03, false),
    bitki("kutuk", 3, [0.8, 1.2], 0.08),
    ot("cimen_1", 60),
    ot("cimen_2", 50),
  ],
  // Orman: karaçam, çam, ladin ağırlıklı (araya sedir, meşe, kuru gövde); altında çalı, eğrelti, devrik gövde, yosunlu
  // kaya. Fidanlar 1–1,3 m'lik fotogrametri; 2–3,5 m'ye büyütülünce genç ağaç gibi okunur.
  orman: [
    agac("m_karacam_14", 110, [0.8, 1.2]),
    agac("m_cam_2", 80, [0.8, 1.15]),
    agac("m_cam_1", 70, [0.8, 1.2]),
    agac("m_ladin_53", 55, [0.75, 1.1]),
    agac("m_cam_12", 50, [0.8, 1.3]),
    agac("m_sedir_56", 20, [0.8, 1.2]),
    agac("m_mese_62", 12, [0.8, 1.2], { ruzgar: 0.1 }),
    genc("m_cam_10", 40, [0.5, 0.9]),
    kuruAgac("m_kuru_cam_133", 6, [0.8, 1.1]),
    bitki("m_cali_214", 45, [0.8, 1.3], 0.04, true, { renk: CALI_214_RENK }),
    bitki("m_cali_195", 26, [0.8, 1.2]),
    bitki("m_egrelti_234", 30, [0.8, 1.3], 0.03, false),
    bitki("fidan_goknar", 14, [1.8, 3.0], 0.03),
    bitki("fidan_cam", 12, [1.8, 3.2], 0.03),
    bitki("egrelti", 30, [1.0, 1.8], 0.03, false),
    bitki("kuru_dal", 8, [0.8, 1.4], 0.03, false),
    kutuk("m_devrik_185", 6, [0.8, 1.2], 0.12),
    kutuk("m_devrik_169", 5, [0.8, 1.2], 0.12),
    kutuk("m_kutuk_165", 8, [0.8, 1.3], 0.06),
    kaya("m_yosunlu_329", 12, [0.8, 1.4], 0.3, 0.15),
    kaya("m_yosunlu_336", 4, [0.8, 1.2], 0.3, 0.2),
    tas("taslar", 12),
    ot("cimen_1", 35),
    ot("cimen_2", 30),
  ],
  // Dağlık (Toros): gri/beyaz kireçtaşı kaya, yar ve taşlık; seyrek ardıç, sedir, karaçam ve kuru çam; kuru çalı
  dag: [
    kaya("m_kirec_344", 14, [0.8, 1.6], 0.6, 0.18),
    kaya("m_kirec_346", 10, [0.8, 1.5], 0.6, 0.18),
    kaya("m_kirec_349", 20, [0.7, 1.5], 0.4, 0.15),
    kaya("m_kaya_354", 18, [0.7, 1.5], 0.4, 0.15),
    kaya("m_kaya_356", 12, [0.8, 1.5], 0.5, 0.18),
    kaya("m_kaya_294", 8, [0.8, 1.5], 0.5, 0.18),
    kaya("m_kaya_300", 8, [0.8, 1.5], 0.5, 0.18),
    kaya("kaya_buyuk", 6, [0.9, 2.1], 0.6, 0.2),
    kayalik("m_kayalik_307", 5, [0.7, 1.2], 30),
    kayalik("m_taslik_318", 6, [0.8, 1.2], 20),
    kayalik("m_yar_358", 3, [0.8, 1.2], 60),
    kayalik("m_yar_359", 3, [0.8, 1.2], 60),
    kayalik("m_yar_364", 3, [0.8, 1.2], 50),
    kayalik("m_yar_365", 3, [0.8, 1.2], 50),
    kayalik("m_kaya_duvari_367", 3, [0.8, 1.2], 50),
    tas("tas_kume", 32),
    tas("taslar", 36),
    agac("m_ardic_199", 40, [0.7, 1.3], { aralik: 2.5, ruzgar: 0.05, enYakin: 10 }),
    agac("m_sedir_56", 22, [0.8, 1.25]),
    agac("m_karacam_14", 22, [0.8, 1.2]),
    genc("m_cam_12", 14, [0.6, 1.0]),
    kuruAgac("m_kuru_cam_132", 5, [0.8, 1.1]),
    kuruAgac("m_kuru_146", 6, [0.8, 1.2]),
    bitki("m_kuru_cali_273", 25, [0.8, 1.4], 0.04),
    bitki("m_kuru_cali_253", 12, [0.8, 1.3], 0.04),
    bitki("m_cali_214", 15, [0.7, 1.2], 0.04, true, { renk: CALI_214_RENK }),
    bitki("cali", 9, [0.6, 1.2], 0.05),
    bitki("kuru_dal", 6, [0.8, 1.3], 0.03, false),
    ot("cimen_1", 28),
    ot("cimen_2", 22),
  ],
  us: [kaya("kaya_kucuk", 3, [0.6, 1.0], 0.2, 0.15), tas("tas_kume", 10), tas("taslar", 16), bitki("cali", 4, [0.6, 1.1], 0.05), ot("cimen_1", 22), ot("cimen_2", 16)],
  kent: [tas("tas_kume", 6), tas("taslar", 10), bitki("cali", 5, [0.6, 1.2], 0.05), bitki("kuru_dal", 4, [0.8, 1.2], 0.03, false), ot("cimen_1", 20), ot("cimen_2", 15)],
};

/**
 * Kış: iğne yapraklılar dalında kar taşıyan modellerle, yaprak döken ağaçlar (meşe, kavak) yapraksız gövdelerle yer
 * değiştirir; eğrelti ve ot modelleri kalkar (kart çimen karlı görünümle kalır), her dem yeşil çalı eklenir. Geri
 * kalan her şeyin üstü gölgelendiricide karlanır (bitkiMalzemesi). null = kışın yok.
 */
const KIS_YERINE: Record<string, string | null> = {
  m_karacam_14: "m_karli_cam_102",
  m_cam_2: "m_karli_ladin_125",
  m_cam_1: "m_karli_ladin_104",
  m_ladin_53: "m_karli_ladin_125",
  m_cam_12: "m_karli_ladin_120",
  m_cam_10: "m_karli_cam_99",
  m_mese_62: "m_kuru_90",
  m_mese_68: "m_kuru_139",
  m_mese_77: "m_kuru_146",
  m_yaprak_87: "m_kuru_90",
  m_yaprak_88: "m_kuru_139",
  m_yaprak_89: "m_kuru_146",
  m_kavak_83: "m_kuru_90",
  m_kavak_95: "m_kuru_139",
  m_kavak_79: "m_kuru_146",
  m_egrelti_234: null,
  egrelti: null,
  cimen_1: null,
  cimen_2: null,
};

function kisSeti(yaz: readonly BitkiTanimi[], karliCali: number): BitkiTanimi[] {
  const sonuc = yaz.flatMap((b): BitkiTanimi[] => {
    const yeni = KIS_YERINE[b.klasor];
    if (yeni === null) return [];
    if (yeni === undefined) return [b];
    return [{ ...b, klasor: yeni, ruzgar: yeni.startsWith("m_kuru") ? 0 : b.ruzgar }];
  });
  // Karlı çalı: her dem yeşil pırnal tipi çalı, üstü gölgelendiricide karlanır (#252 "karlı çalı" pişirmede kara döndü)
  if (karliCali > 0) sonuc.push(bitki("m_cali_214", karliCali, [0.8, 1.3], 0.06, true, { ruzgar: 0.02, renk: CALI_214_RENK }));
  return sonuc;
}

const KIS_SETLERI: Record<BitkiSeti, BitkiTanimi[]> = {
  bozkir: kisSeti(BITKI_SETLERI.bozkir, 10),
  orman: kisSeti(BITKI_SETLERI.orman, 30),
  dag: kisSeti(BITKI_SETLERI.dag, 10),
  us: kisSeti(BITKI_SETLERI.us, 0),
  kent: kisSeti(BITKI_SETLERI.kent, 0),
};

/** Kurulumda kullanılacak bitki listesi: kar örtüsü KIS_ESIGI'ni aşınca kış seti (bkz. KIS_YERINE). */
export function bitkiListesi(set: BitkiSeti, kar: number): readonly BitkiTanimi[] {
  return (kar >= KIS_ESIGI ? KIS_SETLERI : BITKI_SETLERI)[set] ?? BITKI_SETLERI.bozkir;
}

/** Bir bitki örneğinin yeri: dünya matrisi ve örnek rengi (ağaçta ton farkı). */
interface BitkiYeri {
  x: number;
  z: number;
  m: THREE.Matrix4;
  ton: [number, number, number];
}
const _renk = new THREE.Color();
const _hm = new THREE.Matrix4();
const _hk = new THREE.Sphere();
/** Örnek matrisinin 3×3 dönüşüm öğeleri (sütun düzeni): sıfırlanınca örnek görünmez, konumu (12–14) kalır. */
const DONUSUM_OGELERI = [0, 1, 2, 4, 5, 6, 8, 9, 10] as const;

/**
 * Bitki hücresi: bir türün bir malzemesinin bir azimut sektöründeki örnekleri (bkz. bitkiSektorleri.ts). three her
 * duvar kamerasında ve gölge kamerasında `intersectsFrustum` ile ayıklar; sınır, örneklerin halka dilimini saran
 * dışbükey kabuk (küre izleyiciyi neredeyse içine aldığı için ayıklamazdı). Kabuk kurulamazsa sınır küresi (three'nin
 * varsayılanı). Bitki grubu sahne başlangıcında ve dönüşümsüz: örnek matrisleri dünya koordinatıdır.
 */
class BitkiHucresi extends THREE.InstancedMesh {
  private kabuk: Float64Array | null = null;

  constructor(
    geometri: THREE.BufferGeometry,
    malzeme: THREE.Material | THREE.Material[],
    adet: number,
    readonly sinif: BitkiSinifi,
  ) {
    super(geometri, malzeme, adet);
  }

  /** Küre (saydam sıralama, yedek ayıklama) ve kabuk: örnekler yazıldıktan ya da değiştikten sonra çağrılır. */
  sinirlariHesapla() {
    this.computeBoundingSphere();
    const g = this.geometry.boundingSphere!;
    const kureler: OrnekKuresi[] = [];
    for (let i = 0; i < this.count; i++) {
      this.getMatrixAt(i, _hm);
      _hk.copy(g).applyMatrix4(_hm);
      kureler.push({ x: _hk.center.x, y: _hk.center.y, z: _hk.center.z, r: _hk.radius });
    }
    this.kabuk = kamaKabugu(kureler);
  }

  override intersectsFrustum(frustum: THREE.Frustum | THREE.FrustumArray): boolean {
    if (this.kabuk && "planes" in frustum) return kabukPiramitte(frustum.planes, this.kabuk);
    return super.intersectsFrustum(frustum);
  }
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
  /** Splat tuvalinin kraterlerden önceki kopyası (yanık boyası temizliği). */
  private splatTemiz: HTMLCanvasElement | null = null;
  private splatDoku: THREE.CanvasTexture | null = null;
  private cimen: THREE.InstancedMesh | null = null;
  private cimenKonumlar: Float32Array | null = null;
  private cimenOlcekler: Float32Array | null = null;
  /** Çimen demeti malzemesi bölgeler arası korunur (gölgelendirici yeniden derlenmez); renk dokusu kurulukla değişir. */
  private cimenMalzemesi: THREE.MeshStandardMaterial | null = null;
  private cimenRenkKurulugu = -1;
  /** Çimen rüzgâr zamanı (demet gölgelendiricisinin uniform'u; malzeme korunduğu için ayrı). */
  private readonly cimenZaman: THREE.IUniform<number> = { value: 0 };
  /** Bitki, kaya ve çimendeki kar örtüsü (0–1): bütün bitki malzemelerinin ortak uniform'u (karAyarla). */
  private readonly bitkiKar: THREE.IUniform<number> = { value: 0 };
  private bitkiGrubu = new THREE.Group();
  /** Birleşik model geometrileri (hücreler öznitelikleri paylaşır); sok bırakır. */
  private readonly bitkiGeometrileri: THREE.BufferGeometry[] = [];
  /** Yakın arazinin tamamı bir sonraki çizimde yüklenecek: kraterin kısmi aralığı eklenmez (tamamı gider). */
  private yakinTamYuklemeBekliyor = false;
  private readonly yukleyici = new GLTFLoader();
  private readonly modelOnbellek = new Map<string, Promise<GLTF>>();
  private readonly dokuYukleyici = new THREE.TextureLoader();
  private dokular = new Map<string, THREE.Texture>();
  /** Bu kurulumda istenen dokular: kalanlar kurulum sonunda bırakılır (ortak dokular bölgeler arası korunur). */
  private readonly kullanilanDokular = new Set<string>();
  /** Yüklemesi sürenler (geldi, yedeğiyle birlikte bulunamadı ya da bırakıldıysa çıkar): `dokularHazir`. */
  private readonly yuklenenDokular = new Set<THREE.Texture>();
  /**
   * Kraterin değiştirdiği bitki örneklerinin kraterden önceki matrisi (mesh → örnek → 16 sayı): kraterleriTemizle
   * geri koyar. Koridor değişiminde yedek de aynı yükseklik farkını alır.
   */
  private readonly kraterYedekleri = new Map<THREE.InstancedMesh, Map<number, Float32Array>>();
  private zaman = 0;
  private kar = 0;
  private kok = "";
  private nesil = 0;
  /** Yüklenme durumu (HUD). */
  durum = "kapalı";
  /** Kaya/çalı yerleşiminde boş bırakılacak noktalar (mevzi, patlama, iniş). */
  temizNoktalar: THREE.Vector3[] = [];
  /**
   * Görüş koridorları: yerleşim planı noktalarına (asker, tank, iniş...) izleyiciden bakış hattı. Arazi bu hatta göz →
   * ayak çizgisinin altına indirilir, noktanın çevresi düzlenir: plan noktasındaki asker tümsek arkasında kaybolmaz ve
   * panoramanın düz zemin varsayımıyla aynı yüksekliğe basar. `yaricap`: düz alan yarıçapı (iniş alanı geniş).
   */
  private koridorlar: Array<{ x: number; z: number; d: number; yaricap: number }> = [];
  private koridorImzasi = "";
  /** Uygulanmış kraterler: yükseklikler yeniden hesaplanınca (koridor değişimi) çukurlar korunur. */
  private kraterler: Array<{ x: number; z: number; r: number; s: number }> = [];
  /** Uyarı kanalı (doku/model bulunamadı); sahne3b köprü günlüğüne iletir. */
  uyari: ((mesaj: string) => void) | null = null;
  /**
   * Bitki (çim demeti, çalı, kaya) konmayacak yer: 3B alanın asfalt yolu, kaldırımı ve meydanı (sahne3b → SokakKatmani).
   * Kurulumdan önce ayarlanır; null ise her yer serbest.
   */
  bitkiDisla: ((x: number, z: number) => boolean) | null = null;

  constructor() {
    this.grup.add(this.bitkiGrubu);
  }

  get aktif() {
    return this.mod !== "kapali" && this.yakin !== null;
  }

  /**
   * Kurulumun dokularının yüklemesi bitti mi (gelen ya da bulunamayan; önbellekteki ortak dokular hemen hazır). Bölge
   * geçişinde örtü solmadan önce bunu bekler (sahne3b.ts, en çok 1,2 sn): doku "pop"u eski karenin arkasında kalır.
   */
  get dokularHazir(): boolean {
    return this.yuklenenDokular.size === 0;
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
    return this.koridorUygula(h, x, z);
  }

  /**
   * Plan noktalarına görüş koridoru ve nokta çevresinde düz alan (bkz. `koridorlar`). Yalnız alçaltır/düzler.
   * Kesim yumuşak: çekirdekte göz → ayak çizgisinin altına iner, yanlara ve noktanın arkasına doğru geniş bir geçişle
   * asıl araziye döner. Dar geçiş tepede hendek, noktanın hemen arkasında dik duvar bırakıyordu (dik yamaçta kaya
   * dokusu beyaz bir şerit gibi görünüyordu; birden çok nokta yan yana olunca tepe boyunca teras oluşuyordu).
   */
  private koridorUygula(h: number, x: number, z: number): number {
    for (const k of this.koridorlar) {
      // Nokta çevresi: düz zemin (panorama düz zemin varsayımı; asker, krater, tank, iniş aynı seviyede)
      const dn = Math.hypot(x - k.x, z - k.z);
      if (dn < k.yaricap * 1.8) h *= smooth(k.yaricap * 0.55, k.yaricap * 1.8, dn);
      // Hat boyunca: göz (zeminden 1,7 m) → ayak çizgisinin 0,25 m altı; noktanın ötesinde tavan yavaşça yükselir
      const t = (x * k.x + z * k.z) / k.d;
      if (t <= 0 || t >= k.d + KORIDOR_ARKA) continue;
      const yan = Math.abs(x * k.z - z * k.x) / k.d;
      const genislik = 1.4 + 0.07 * t;
      const dis = genislik * 3 + 6;
      if (yan >= dis) continue;
      const tavan = t < k.d ? 1.7 * (1 - t / k.d) - 0.25 : -0.25 + 0.3 * (t - k.d);
      if (h > tavan) h -= (h - tavan) * (1 - smooth(genislik, dis, yan));
    }
    return h;
  }

  /** (x, z) görüş koridorunun çekirdeğinde mi (kaya/çalı/fidan konmaz, askerin önünü kapatmasın). */
  private koridorda(x: number, z: number, pay = 0): boolean {
    for (const k of this.koridorlar) {
      if (Math.hypot(x - k.x, z - k.z) < k.yaricap * 0.8 + pay) return true;
      const t = (x * k.x + z * k.z) / k.d;
      if (t <= 2 || t >= k.d) continue;
      if (Math.abs(x * k.z - z * k.x) / k.d < 1.4 + 0.07 * t + pay) return true;
    }
    return false;
  }

  /**
   * Yerleşim planı noktalarından görüş koridorlarını ayarlar (panorama değişince). Arazi kuruluysa yükseklikler yerinde
   * yeniden hesaplanır (kraterler yeniden uygulanır, dokular yeniden yüklenmez); çimen ve bitkiler yeni zemine oturur,
   * koridora düşen kaya/çalı gizlenir. Değişiklik varsa true döner (çağıran figür/sütreyi zemine oturtur).
   */
  koridorlariAyarla(noktalar: Array<{ x: number; z: number; yaricap: number }>, yerinde = true): boolean {
    const imza = noktalar.map((n) => `${n.x.toFixed(1)},${n.z.toFixed(1)},${n.yaricap}`).join(";");
    if (imza === this.koridorImzasi) return false;
    this.koridorImzasi = imza;
    this.koridorlar = noktalar.map((n) => ({ ...n, d: Math.max(1, Math.hypot(n.x, n.z)) })).filter((n) => n.d > 3);
    this.temizNoktalar = noktalar.map((n) => new THREE.Vector3(n.x, 0, n.z));
    if (!yerinde || !this.yakin || !this.yukseklikler) return false;
    const n = this.n;
    const yarim = YAKIN_BOYUT / 2;
    const eski = this.yukseklikler.slice();
    const h = this.yukseklikler;
    for (let iz = 0; iz < n; iz++) for (let ix = 0; ix < n; ix++) h[iz * n + ix] = this.analitik(ix * YAKIN_ADIM - yarim, iz * YAKIN_ADIM - yarim);
    for (const k of this.kraterler) kraterUygula(h, IZGARA, k.x, k.z, k.r, k.s);
    const pos = this.yakin.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setY(i, h[i]);
    this.yakin.geometry.computeVertexNormals();
    this.yakinTamYukle();
    // Çimen ve bitkiler: yükseklik farkı kadar kayar; koridor çekirdeğindeki kaya/çalı gizlenir (çimen kalır).
    // Krater yedeği (kraterden önceki matris) de aynı farkı alır: temizlikte yeni zemine döner. Fark kraterden
    // bağımsızdır (kraterler iki ızgarada da aynı uygulanır).
    const fark = (x: number, z: number) => this.izgaraYuksekligi(h, x, z) - this.izgaraYuksekligi(eski, x, z);
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const kaydir = (dizi: Float32Array, ofset: number, cimenMi: boolean) => {
      m.fromArray(dizi, ofset);
      m.decompose(p, q, s);
      if (s.x === 0) return;
      p.y += fark(p.x, p.z);
      if (!cimenMi && this.koridorda(p.x, p.z, 0.6)) s.set(0, 0, 0);
      m.compose(p, q, s);
      m.toArray(dizi, ofset);
    };
    for (const c of this.bitkiGrubu.children) {
      const inst = c as THREE.InstancedMesh;
      if (!inst.isInstancedMesh) continue;
      const cimenMi = inst === this.cimen;
      const yedek = this.kraterYedekleri.get(inst);
      if (yedek) for (const y of yedek.values()) kaydir(y, 0, cimenMi);
      const dizi = inst.instanceMatrix.array as Float32Array;
      for (let i = 0; i < inst.count; i++) kaydir(dizi, i * 16, cimenMi);
      inst.instanceMatrix.needsUpdate = true;
      if (inst instanceof BitkiHucresi) inst.sinirlariHesapla();
    }
    return true;
  }

  /** Izgaradan çift doğrusal yükseklik (verilen dizi; yeni/eski karşılaştırma için). */
  private izgaraYuksekligi(h: Float32Array, x: number, z: number): number {
    const yarim = YAKIN_BOYUT / 2;
    const fx = Math.min(this.n - 1.001, Math.max(0, (x + yarim) / YAKIN_ADIM));
    const fz = Math.min(this.n - 1.001, Math.max(0, (z + yarim) / YAKIN_ADIM));
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const tx = fx - ix;
    const tz = fz - iz;
    const n = this.n;
    return (h[iz * n + ix] * (1 - tx) + h[iz * n + ix + 1] * tx) * (1 - tz) + (h[(iz + 1) * n + ix] * (1 - tx) + h[(iz + 1) * n + ix + 1] * tx) * tz;
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
   * arazi ilk kare düz renkle görünür, dokular gelince geçer. Önceki kurulumun arazi/çimen malzemesi ve yeni bölgede de
   * kullanılan dokuları korunur (yeniden indirme ve gölgelendirici derlemesi yok).
   */
  kur(mod: AraziModu, profil: AraziProfili, kalite: AraziKalitesi, kok: string, kar: number) {
    this.sok(mod !== "kapali");
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
    this.kullanilanDokular.clear();

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
    this.malzeme = this.malzemeHazirla();
    const yakin = new THREE.Mesh(g, this.malzeme);
    yakin.position.y = ZEMIN_Y;
    yakin.receiveShadow = true;
    yakin.castShadow = kalite.araziGolgesi;
    // Hibrit kipte malzeme saydam (kenar sis geçişi): saydam listede en önce çizilsin ki derinliği yazılsın ve
    // duman/iz gibi derinlik yazmayan parçacıklar tepe arkasında doğru örtülsün
    yakin.renderOrder = -5;
    // three öznitelikleri çizim listesi kurulurken yükler, onBeforeRender ondan sonra: bekleyen tam yükleme gitti
    yakin.onBeforeRender = () => {
      this.yakinTamYuklemeBekliyor = false;
    };
    this.yakinTamYuklemeBekliyor = true;
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
    this.kullanilmayanDokulariBirak();
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

  /**
   * Araziyi kaldırır ve GPU kaynaklarını serbest bırakır. `yenidenKurulacak` (kur bölge/kip değişiminde çağırır):
   * arazi ve çimen malzemesi (derlenmiş gölgelendiriciler) ile dokular korunur, kurulum sonunda yalnız yeni bölgede
   * kullanılmayanlar bırakılır. Aksi halde (kapalı kip) hepsi bırakılır.
   */
  sok(yenidenKurulacak = false) {
    this.nesil++;
    for (const c of [...this.grup.children]) if (c !== this.bitkiGrubu) this.grup.remove(c);
    // Hücre geometrileri birleşik model geometrisinin özniteliklerini paylaşır: hepsi birlikte bırakılır (paylaşılan
    // GPU tamponu ilk dispose'da silinir, sonrakiler etkisiz; bırakılan hücre bir daha çizilmez)
    for (const c of [...this.bitkiGrubu.children]) {
      this.bitkiGrubu.remove(c);
      const m = c as THREE.InstancedMesh;
      if (m.isInstancedMesh) {
        m.geometry.dispose();
        m.dispose();
      }
    }
    for (const g of this.bitkiGeometrileri) g.dispose();
    this.bitkiGeometrileri.length = 0;
    this.yakin?.geometry.dispose();
    this.uzak?.geometry.dispose();
    this.splatDoku?.dispose();
    if (!yenidenKurulacak) {
      const mal = this.cimenMalzemesi;
      if (mal) {
        mal.map?.dispose();
        mal.alphaMap?.dispose();
        mal.dispose();
      }
      this.cimenMalzemesi = null;
      this.cimenRenkKurulugu = -1;
      this.malzeme?.dispose();
      this.malzeme = null;
      this.uniformlar = {};
      for (const d of this.dokular.values()) d.dispose();
      this.dokular.clear();
      this.yuklenenDokular.clear();
    }
    this.kraterYedekleri.clear();
    this.yakin = null;
    this.uzak = null;
    this.cimen = null;
    this.cimenKonumlar = null;
    this.cimenOlcekler = null;
    this.splatTuval = null;
    this.splatTemiz = null;
    this.splatDoku = null;
    this.yukseklikler = null;
    this.kraterler = [];
    this.mod = "kapali";
    this.durum = "kapalı";
  }

  /** Bu kurulumda istenmeyen dokuları bırakır (önceki bölgeye özgü olanlar); ortaklar korunur. */
  private kullanilmayanDokulariBirak() {
    for (const [ad, d] of this.dokular) {
      if (this.kullanilanDokular.has(ad)) continue;
      d.dispose();
      this.dokular.delete(ad);
      this.yuklenenDokular.delete(d);
    }
  }

  // ------------------------------------------------------------------ doku / malzeme
  /**
   * Doku (icerik/arazi/dokular/<ad>.jpg). Shader dünya xz ile örneklediği için `repeat` kullanılmaz. Dosya
   * yoksa `yedek` denenir, o da yoksa uyarı; doku boş kalır (düz renk). Düşük kalitede 1K'ya küçültülür.
   * Önbellekte kalır (bölge değişiminde ortak dokular yeniden indirilmez); yükleme sürerken doku önbellekten
   * çıkarıldıysa (bırakıldı) gelen resim atılır, yedek denenmez. Yükleme sürerken `dokularHazir` false.
   */
  private doku(ad: string, srgb: boolean, yedek?: string): THREE.Texture {
    this.kullanilanDokular.add(ad);
    let t = this.dokular.get(ad);
    if (t) return t;
    const doku = new THREE.Texture();
    t = doku;
    doku.wrapS = doku.wrapT = THREE.RepeatWrapping;
    doku.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    doku.anisotropy = this.kalite.anizotropi;
    this.dokular.set(ad, doku);
    this.yuklenenDokular.add(doku);
    const yukle = (dosya: string, sonDeneme: boolean) =>
      this.dokuYukleyici.load(
        `${this.kok}arazi/dokular/${dosya}.jpg`,
        (y) => {
          this.yuklenenDokular.delete(doku);
          if (this.dokular.get(ad) !== doku) return;
          doku.image = this.kucult(y.image as HTMLImageElement);
          doku.needsUpdate = true;
        },
        undefined,
        () => {
          if (this.dokular.get(ad) !== doku) {
            this.yuklenenDokular.delete(doku);
            return;
          }
          if (!sonDeneme && yedek && yedek !== dosya) yukle(yedek, true);
          else {
            this.yuklenenDokular.delete(doku);
            this.uyari?.(`Arazi dokusu bulunamadı: arazi/dokular/${dosya}.jpg`);
          }
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

  /**
   * Arazi malzemesi: ilk kurulumda oluşturulur, sonra korunur (splat gölgelendiricisi bir kez derlenir; bölge
   * değişiminde ~205 k üçgenlik arazinin programı yeniden derlenmiyordu ama her seferinde yeniden kuruluyordu).
   * Profil ve kip değerleri her kurulumda uniform'lara yazılır; saydamlık (hibrit) değişirse program bir kez değişir.
   */
  private malzemeHazirla(): THREE.MeshStandardMaterial {
    const m = this.malzeme ?? this.malzemeOlustur();
    const hibrit = this.mod === "hibrit";
    if (m.transparent !== hibrit) {
      m.transparent = hibrit;
      m.needsUpdate = true;
    }
    // Normal yolu açmak için bir normal haritası atanır (gerçek örnekleme shader'da karışımla yapılır)
    m.normalMap = this.doku(this.profil.dokular.toprak + "_normal", false, "bozkir_normal"); // shader'da dünya xz ile örneklenir
    const p = this.profil;
    const u = this.uniformlar;
    u.kar.value = this.kar;
    u.kuruluk.value = p.kuruluk;
    u.yesillik.value = p.yesillik ?? 0;
    u.golgeLekesi.value = p.golgeLekesi ?? 0;
    u.sisBaslangic.value = hibrit ? p.yaricap * 0.76 : 1e6;
    u.sisBitis.value = hibrit ? p.yaricap : 1e6;
    return m;
  }

  private malzemeOlustur(): THREE.MeshStandardMaterial {
    const bos = new THREE.Texture();
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
    m.normalScale.set(0.9, 0.9);
    const u: Record<string, THREE.IUniform> = {
      tSplat: { value: bos },
      kar: { value: 0 },
      kuruluk: { value: 0 },
      yesillik: { value: 0 },
      golgeLekesi: { value: 0 },
      islaklik: { value: 0 },
      sisBaslangic: { value: 1e6 },
      sisBitis: { value: 1e6 },
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
uniform float kar, kuruluk, yesillik, golgeLekesi, islaklik, sisBaslangic, sisBitis, yarimBoyut;
struct AraziKarisim { float toprak, cimen, kaya, cakil, yol, yanik, kar; };
// Islaklık: yüzey ıslaklığı (kar üstünde yok) ve su birikintisi (düz zemin, makro dokunun çukurları; yol/çakılda çok)
float gIslak;
float gBirikinti;
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
  gIslak = islaklik * (1.0 - k.kar);
  float duz = smoothstep(0.08, 0.02, egim);
  float cukur = texture2D(tUzak, vDunya.xz * tUzakOlcek * 0.9 + vec2(0.53, 0.29)).b;
  float esik = mix(0.72, 0.5, smoothstep(0.3, 1.0, islaklik)) - 0.12 * (k.yol + k.cakil);
  gBirikinti = smoothstep(esik, esik + 0.1, cukur) * duz * smoothstep(0.25, 0.6, islaklik) * (1.0 - k.kar) * (1.0 - k.cimen * 0.7);
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
  // Yeşillik (orman): kuru yaprak ve toprak tonu yosun/zeytin yeşiline kayar (Poly Haven orman zeminleri kahverengi);
  // kaya ve kar üstünde değil
  if (yesillik > 0.0) {
    float p2 = dot(renk, vec3(0.3, 0.59, 0.11));
    renk = mix(renk, p2 * vec3(0.74, 1.2, 0.5), yesillik * (1.0 - k.kar) * (1.0 - k.kaya) * (0.45 + 0.4 * k.cimen));
  }
  // Ağaç gölgesi lekeleri (orman): makro dokunun iki ölçeği → yumuşak koyu yamalar, güneşli panoramadaki gölgeli zemine uyum
  if (golgeLekesi > 0.0) {
    float leke = texture2D(tUzak, xz * tUzakOlcek * 0.31 + vec2(0.37, 0.61)).g * 0.6 + texture2D(tUzak, xz * tUzakOlcek * 1.7 + vec2(0.11, 0.83)).g * 0.4;
    renk *= 1.0 - golgeLekesi * smoothstep(0.30, 0.55, leke) * 0.6;
  }
  // Islak zemin koyulaşır; birikinti neredeyse siyah (gök yansıması pürüzlülükten gelir)
  renk *= mix(1.0, 0.55, gIslak);
  renk = mix(renk, renk * vec3(0.3, 0.32, 0.35), gBirikinti);
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
  // Birikinti düz ayna: doku normali geometri normaline çekilir
  normal = normalize(mix(normal, nonPerturbedNormal, gBirikinti));
}`,
        )
        .replace(
          "#include <roughnessmap_fragment>",
          `#include <roughnessmap_fragment>
// Islakta parlar (0,95 → 0,45), birikintide ayna (0,08): ortam haritasındaki gök zemine yansır
roughnessFactor = mix(roughnessFactor, 0.45, gIslak);
roughnessFactor = mix(roughnessFactor, 0.08, gBirikinti);`,
        );
    };
    m.customProgramCacheKey = () => "arazi-splat-v5";
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
    // Kraterlerden önceki hâli (kraterleriTemizle geri çizer)
    const temiz = document.createElement("canvas");
    temiz.width = SPLAT_BOYUT;
    temiz.height = SPLAT_BOYUT;
    temiz.getContext("2d")!.drawImage(c, 0, 0);
    this.splatTemiz = temiz;
    this.splatDoku = new THREE.CanvasTexture(c);
    this.splatDoku.colorSpace = THREE.NoColorSpace;
    this.splatDoku.flipY = false;
    this.uniformlar.tSplat.value = this.splatDoku;
  }

  // ------------------------------------------------------------------ krater
  /** Yakın arazinin konum ve normallerinin tamamı bir sonraki çizimde yüklenir (bekleyen kısmi aralıklar düşer). */
  private yakinTamYukle() {
    const g = this.yakin?.geometry;
    if (!g) return;
    for (const ad of ["position", "normal"]) {
      const a = g.attributes[ad] as THREE.BufferAttribute;
      a.clearUpdateRanges();
      a.needsUpdate = true;
    }
    this.yakinTamYuklemeBekliyor = true;
  }

  /**
   * Pencerelerin yüksekliklerini konuma yazar, normalleri yalnız pencerelerde (bir köşe geniş) yeniden hesaplar ve
   * yalnız o aralıkları yükler. Tam yükleme bekliyorsa (aynı karede koridor değişimi) aralık eklenmez: tamamı gider.
   */
  private pencereleriGuncelle(pencereler: readonly IzgaraPenceresi[]) {
    const g = this.yakin?.geometry;
    if (!g || !this.yukseklikler || pencereler.length === 0) return;
    const pos = g.attributes.position as THREE.BufferAttribute;
    const nor = g.attributes.normal as THREE.BufferAttribute;
    const konum = pos.array as Float32Array;
    // Önce bütün yükseklikler, sonra normaller (üst üste binen pencerelerde de doğru)
    for (const p of pencereler) konumlariYaz(konum, this.yukseklikler, this.n, p);
    for (const p of pencereler) {
      const v = pencereNormalleri(konum, nor.array as Float32Array, this.n, p);
      if (this.yakinTamYuklemeBekliyor) continue;
      const a = pencereAraligi(p, this.n, 3);
      pos.addUpdateRange(a.start, a.count);
      const b = pencereAraligi(v, this.n, 3);
      nor.addUpdateRange(b.start, b.count);
    }
    pos.needsUpdate = true;
    nor.needsUpdate = true;
  }

  /** Örneğin kraterden önceki matrisini (ilk değişiminde) yedekler. */
  private yedekle(mesh: THREE.InstancedMesh, i: number) {
    let y = this.kraterYedekleri.get(mesh);
    if (!y) {
      y = new Map();
      this.kraterYedekleri.set(mesh, y);
    }
    if (!y.has(i)) y.set(i, (mesh.instanceMatrix.array as Float32Array).slice(i * 16, i * 16 + 16));
  }

  /** Krater merkezinin 1,25 r içindeki görünür bitki örnekleri ve oradaki (kraterden önceki) zemin yüksekliği. */
  private kraterBitkileri(kx: number, kz: number, r: number): Array<{ hucre: BitkiHucresi; i: number; zemin: number }> {
    const sonuc: Array<{ hucre: BitkiHucresi; i: number; zemin: number }> = [];
    for (const c of this.bitkiGrubu.children) {
      if (!(c instanceof BitkiHucresi)) continue;
      const d = c.instanceMatrix.array as Float32Array;
      for (let i = 0; i < c.count; i++) {
        const o = i * 16;
        if (d[o] === 0 && d[o + 1] === 0 && d[o + 2] === 0) continue; // gizli (koridor ya da önceki krater)
        if (Math.hypot(d[o + 12] - kx, d[o + 14] - kz) >= r * 1.25) continue;
        sonuc.push({ hucre: c, i, zemin: this.yukseklik(d[o + 12], d[o + 14]) });
      }
    }
    return sonuc;
  }

  /**
   * Araziyi çukurlaştırır (kenar hafif yükselir), yanık doku boyar; çukurdaki çimen, ot, çalı ve taşlar silinir
   * (savruldu), kayalar yeni zemine iner (havada kalmaz). Değişen örneklerin önceki matrisi yedeklenir
   * (kraterleriTemizle). Normaller yalnız krater penceresinde hesaplanır, yalnız o aralık yüklenir (eskiden tam
   * computeVertexNormals + 2,5 MB yükleme: patlama başına 34–76 ms). `konum` dünya koordinatı.
   */
  krater(konum: THREE.Vector3, yaricap: number, siddet: number) {
    if (!this.aktif || !this.yakin || !this.yukseklikler) return;
    const r = Math.max(1.2, yaricap);
    // Birikim sınırı (§2-17): aynı yere üst üste patlamalar metrelerce çukur açmasın — yakın bir krater varsa (merkezler
    // 0,6 r içinde) yeni çukur kazılmaz (yanık/moloz/duman yine gelir); liste en çok 60 krater tutar (koridor değişiminde
    // yeniden uygulama maliyeti sınırlı kalsın)
    if (this.kraterler.some((k) => Math.hypot(k.x - konum.x, k.z - konum.z) < 0.6 * Math.max(r, k.r))) return;
    this.kraterler.push({ x: konum.x, z: konum.z, r, s: siddet });
    if (this.kraterler.length > 60) this.kraterler.shift();
    const etkilenen = this.kraterBitkileri(konum.x, konum.z, r);
    const pencere = kraterUygula(this.yukseklikler, IZGARA, konum.x, konum.z, r, siddet);
    if (!pencere) return;
    this.pencereleriGuncelle([pencere]);
    // Bitkiler: ot/çalı/taş silinir (konumu korunur: hücre kabuğu dar kalsın), kaya yeni zemine iner
    const degisen = new Set<BitkiHucresi>();
    for (const e of etkilenen) {
      this.yedekle(e.hucre, e.i);
      const d = e.hucre.instanceMatrix.array as Float32Array;
      const o = e.i * 16;
      if (e.hucre.sinif === "kaya" || e.hucre.sinif === "agac") d[o + 13] += this.yukseklik(d[o + 12], d[o + 14]) - e.zemin;
      else for (const k of DONUSUM_OGELERI) d[o + k] = 0;
      degisen.add(e.hucre);
    }
    for (const h of degisen) {
      h.instanceMatrix.needsUpdate = true;
      h.sinirlariHesapla();
    }
    // Yanık boyası (G)
    if (this.splatTuval && this.splatDoku) {
      const ctx = this.splatTuval.getContext("2d")!;
      const olcek = SPLAT_BOYUT / YAKIN_BOYUT;
      const yarim = YAKIN_BOYUT / 2;
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
    // Çimen temizle (demetler; önceki matris yedekte)
    if (this.cimen && this.cimenKonumlar && this.cimenOlcekler) {
      const m = new THREE.Matrix4();
      let degisti = false;
      for (let i = 0; i < this.cimen.count; i++) {
        const cx = this.cimenKonumlar[i * 3];
        const cz = this.cimenKonumlar[i * 3 + 2];
        if (Math.hypot(cx - konum.x, cz - konum.z) < r * 1.25 && this.cimenOlcekler[i] > 0) {
          this.yedekle(this.cimen, i);
          this.cimenOlcekler[i] = 0;
          m.makeScale(0, 0, 0);
          this.cimen.setMatrixAt(i, m);
          degisti = true;
        }
      }
      if (degisti) this.cimen.instanceMatrix.needsUpdate = true;
    }
  }

  /**
   * Bütün kraterleri geri alır (sahneyi sıfırla): etkilenen ızgara pencereleri analitik yüksekliğe döner (görüş
   * koridorları analitiğin içinde: taban birebir aynı), normaller yalnız pencerelerde hesaplanıp o aralıklar yüklenir;
   * splat tuvalinde krater kutularının yalnız G kanalı (yanık) silinir (R yol, B çakıl korunur; tuval başta G = 0);
   * silinen çimen, ot, çalı, taş geri gelir, inen kayalar yerine döner. Dokular ve modeller yeniden yüklenmez
   * (birkaç ms). Bir şey değiştiyse true döner (çağıran figür ve sütreyi yeni zemine oturtur).
   */
  kraterleriTemizle(): boolean {
    if (this.kraterler.length === 0 && this.kraterYedekleri.size === 0) return false;
    const kraterler = this.kraterler;
    this.kraterler = [];
    if (this.yukseklikler && this.yakin) {
      const pencereler: IzgaraPenceresi[] = [];
      for (const k of kraterler) {
        const p = kraterPenceresi(k.x, k.z, k.r, IZGARA);
        if (!p) continue;
        pencereyiYenile(this.yukseklikler, IZGARA, p, (x, z) => this.analitik(x, z));
        pencereler.push(p);
      }
      this.pencereleriGuncelle(pencereler);
    }
    if (this.splatTuval && this.splatTemiz && this.splatDoku && kraterler.length) {
      // Tuvalde kurulumdan sonra yalnız yanık (G) boyanır: kurulumdaki kopyası geri çizilir (getImageData her çağrıda
      // ~40 ms GPU okuması bekliyordu)
      const ctx = this.splatTuval.getContext("2d")!;
      ctx.globalCompositeOperation = "copy";
      ctx.drawImage(this.splatTemiz, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      this.splatDoku.needsUpdate = true;
    }
    for (const [mesh, yedek] of this.kraterYedekleri) {
      const d = mesh.instanceMatrix.array as Float32Array;
      for (const [i, m] of yedek) {
        d.set(m, i * 16);
        if (mesh === this.cimen && this.cimenOlcekler) this.cimenOlcekler[i] = Math.hypot(m[0], m[1], m[2]);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh instanceof BitkiHucresi) mesh.sinirlariHesapla();
    }
    this.kraterYedekleri.clear();
    return true;
  }

  // ------------------------------------------------------------------ çimen
  /**
   * Çimen demeti malzemesi: bir kez oluşturulur, bölgeler arası korunur (gölgelendirici yeniden derlenmez); renk
   * dokusu yalnız kuruluk değişince yenilenir. Sap alfa haritası aynı kalır.
   */
  private cimenMalzemesiHazirla(): THREE.MeshStandardMaterial {
    const mevcut = this.cimenMalzemesi;
    if (mevcut) {
      if (this.cimenRenkKurulugu !== this.profil.kuruluk) {
        mevcut.map?.dispose();
        mevcut.map = cimenRenkDokusu(this.profil.kuruluk);
        this.cimenRenkKurulugu = this.profil.kuruluk;
      }
      return mevcut;
    }
    const mal = new THREE.MeshStandardMaterial({ map: cimenRenkDokusu(this.profil.kuruluk), alphaMap: cimenAlfaDokusu(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1, metalness: 0 });
    mal.onBeforeCompile = (shader) => {
      shader.uniforms.zaman = this.cimenZaman;
      shader.uniforms.bitkiKar = this.bitkiKar;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nuniform float zaman;\nuniform float bitkiKar;")
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
{
  // Rüzgâr: üst köşeler sallanır (uv.y² ile), örnek konumuna göre faz; karda sertleşmiş ot az sallanır
  vec4 dk = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float faz = dk.x * 0.35 + dk.z * 0.27;
  float sal = sin(zaman * 1.7 + faz) * 0.5 + sin(zaman * 2.9 + faz * 1.7) * 0.25;
  float ust = uv.y * uv.y * (1.0 - bitkiKar * 0.7);
  transformed.x += sal * 0.09 * ust;
  transformed.z += sal * 0.05 * ust;
  // Kış: demetlerin bir kısmı karın altında kalır (köşeler tek noktaya: görünmez), kalanı kısalır (dibi karda)
  if (bitkiKar > 0.0) {
    float h = fract(sin(dot(dk.xz, vec2(12.9898, 78.233))) * 43758.5453);
    if (h < bitkiKar * 0.45) transformed = vec3(0.0);
    else transformed.y *= 1.0 - bitkiKar * 0.3;
  }
}`,
        );
      shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nuniform float bitkiKar;").replace(
        "#include <color_fragment>",
        `#include <color_fragment>
{
  // Kış: yeşil saman rengine döner, dibi karla örtülü, uçlarında kar tozu
  float k = bitkiKar;
  vec3 saman = vec3(0.60, 0.53, 0.36) * (0.7 + 0.3 * vMapUv.y);
  diffuseColor.rgb = mix(diffuseColor.rgb, saman, k * 0.85);
  float kar = max(1.0 - smoothstep(0.0, 0.42, vMapUv.y), smoothstep(0.82, 1.0, vMapUv.y) * 0.55) * k;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.88, 0.9, 0.94), kar);
}`,
      );
    };
    mal.customProgramCacheKey = () => "arazi-cimen-v2";
    this.cimenMalzemesi = mal;
    this.cimenRenkKurulugu = this.profil.kuruluk;
    return mal;
  }

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
    const mesh = new THREE.InstancedMesh(geo, this.cimenMalzemesiHazirla(), sayi);
    const renk = new THREE.Color();
    for (let i = 0; i < sayi; i++) {
      // Üç ton: canlı yeşil (yarısı), sararmış uçlu, gölgede mavimsi koyu — tek renkli halı görünümü kırılır
      const t = 0.86 + Math.random() * 0.26;
      const s = Math.random();
      const [r, g, b] = s < 0.5 ? CIMEN_TONLARI[0] : s < 0.78 ? CIMEN_TONLARI[1] : CIMEN_TONLARI[2];
      renk.setRGB(t * r * (0.97 + Math.random() * 0.06), t * g, t * b * (0.92 + Math.random() * 0.1));
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
    const enUzak = Math.max(12, Math.min(this.profil.cimenEnUzak ?? 83, this.profil.yaricap * 0.9));
    while (yerlesen < sayi && deneme < sayi * 6) {
      deneme++;
      const r = 3 + Math.pow(Math.random(), 0.75) * (enUzak - 3);
      const a = Math.random() * Math.PI * 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (this.profil.yol && Math.abs(z - yolZ(x)) < 3.2) continue;
      if (this.bitkiDisla?.(x, z)) continue;
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
  /** Model (önbellekli). `uzak`: ağacın uzak kopyası (<klasor>_uzak.glb); yoksa yakın model. */
  private model(klasor: string, uzak = false): Promise<GLTF> {
    const anahtar = uzak ? `${klasor}#uzak` : klasor;
    let p = this.modelOnbellek.get(anahtar);
    if (!p) {
      const yol = `${this.kok}arazi/modeller/${klasor}/${klasor}`;
      const dosya = MODELLER[klasor];
      // Önce sadeleştirilmiş LOD (araclar/arazi-sadelestir.mjs), yoksa özgün fotogrametri modeli
      p = uzak
        ? this.yukleyici.loadAsync(`${yol}_uzak.glb`).catch(() => this.model(klasor))
        : this.yukleyici.loadAsync(`${yol}_lod.glb`).catch((e) => (dosya ? this.yukleyici.loadAsync(`${this.kok}arazi/modeller/${klasor}/${dosya}`) : Promise.reject(e)));
      // Meshy pişirme çıktısı parçalı ve düz gölgeli (köşe/üçgen = 3): yumuşak normal, yoksa ağaç "kristal" görünür
      if (klasor.startsWith("m_")) {
        p = p.then((gltf) => {
          gltf.scene.traverse((o) => {
            const m = o as THREE.Mesh;
            if (m.isMesh) normalleriYumusat(m.geometry, MESHY_NORMAL_ACISI);
          });
          return gltf;
        });
      }
      p.catch(() => this.modelOnbellek.delete(anahtar));
      this.modelOnbellek.set(anahtar, p);
    }
    return p;
  }

  /**
   * Bu kurulumun listesinde olmayan modelleri önbellekten çıkarır ve GPU kaynaklarını bırakır (geometri, malzeme,
   * doku): 66 Meshy modelinin hepsi bölge gezildikçe bellekte birikmesin. Hücreleri önceki kurulumda sok() ile gitti.
   */
  private kullanilmayanModelleriBirak(liste: readonly BitkiTanimi[]) {
    const gerekli = new Set(liste.flatMap((b) => [b.klasor, `${b.klasor}#uzak`]));
    const birakilacak = [...this.modelOnbellek].filter(([anahtar]) => !gerekli.has(anahtar));
    for (const [anahtar, p] of birakilacak) {
      this.modelOnbellek.delete(anahtar);
      void p
        .then((gltf) => {
          // Uzak kopya yoksa yakın modelin kendisidir: o hâlâ önbellekteyse dokunma
          if ([...this.modelOnbellek.values()].some((q) => q === p)) return;
          gltf.scene.traverse((o) => {
            const m = o as THREE.Mesh;
            if (!m.isMesh) return;
            m.geometry.dispose();
            for (const mal of Array.isArray(m.material) ? m.material : [m.material]) {
              for (const deger of Object.values(mal)) if (deger instanceof THREE.Texture) deger.dispose();
              mal.dispose();
            }
          });
        })
        .catch(() => {});
    }
  }

  /**
   * Modelin alt mesh'leri (dünya dönüşümü uygulanmış) malzemeye göre tek geometride birleşir: çimen modelinin 17,
   * çalının 9 alt mesh'i 1–2 çizim olur (sektörlere bölmeden önce çizim sayısını düşürür). Öznitelikleri uyuşmayan
   * parçalar ayrı kalır.
   */
  private modelParcalari(meshler: THREE.Mesh[]): Array<{ geometri: THREE.BufferGeometry; malzeme: THREE.Material | THREE.Material[] }> {
    const gruplar = new Map<THREE.Material | THREE.Material[], THREE.BufferGeometry[]>();
    for (const kaynak of meshler) {
      kaynak.updateWorldMatrix(true, false);
      // LOD dosyaları (gltf-transform) iç içe (interleaved) köşe tamponu kullanır: birleştirme için ayrılır
      const geo = kaynak.geometry.clone();
      deinterleaveGeometry(geo);
      geo.applyMatrix4(kaynak.matrixWorld);
      let liste = gruplar.get(kaynak.material);
      if (!liste) gruplar.set(kaynak.material, (liste = []));
      liste.push(geo);
    }
    const sonuc: Array<{ geometri: THREE.BufferGeometry; malzeme: THREE.Material | THREE.Material[] }> = [];
    for (const [malzeme, geolar] of gruplar) {
      const birlesik = geolar.length > 1 && !Array.isArray(malzeme) && birlesebilir(geolar) ? mergeGeometries(geolar) : null;
      if (birlesik) {
        for (const g of geolar) g.dispose();
        sonuc.push({ geometri: birlesik, malzeme });
      } else for (const g of geolar) sonuc.push({ geometri: g, malzeme });
    }
    return sonuc;
  }

  /**
   * Bitki ve kaya malzemesi (malzeme paylaşımlı, bir kez): rüzgâr (çalı, ot, ağaç; tabandan yüksekliğe göre kare genlikli
   * yanal kayma, örnek konumuna göre faz, çimenle aynı saat `cimenZaman`) ve kar (`bitkiKar`: dünya uzayında yukarı bakan
   * yüzeyler beyazlar, konumdan hafif gürültüyle; ağaç tepesi, çalı üstü, kaya sırtı). Modelin kendi
   * `onBeforeCompile`'ı varsa önce o çalışır.
   */
  private bitkiMalzemesi(m: THREE.MeshStandardMaterial, ruzgar: { taban: number; yukseklik: number; genlik: number } | null) {
    if (m.userData.bitkiHazir) return;
    m.userData.bitkiHazir = true;
    const onceki = m.onBeforeCompile;
    m.onBeforeCompile = (shader, r) => {
      onceki?.(shader, r);
      shader.uniforms.bitkiKar = this.bitkiKar;
      if (ruzgar) {
        shader.uniforms.zaman = this.cimenZaman;
        shader.uniforms.bitkiTaban = { value: ruzgar.taban };
        shader.uniforms.bitkiYukseklik = { value: Math.max(0.05, ruzgar.yukseklik) };
        shader.uniforms.bitkiGenlik = { value: ruzgar.genlik };
        shader.vertexShader = shader.vertexShader
          .replace("#include <common>", "#include <common>\nuniform float zaman;\nuniform float bitkiTaban;\nuniform float bitkiYukseklik;\nuniform float bitkiGenlik;")
          .replace(
            "#include <begin_vertex>",
            `#include <begin_vertex>
{
  float ust = clamp((position.y - bitkiTaban) / bitkiYukseklik, 0.0, 1.0);
  ust *= ust;
  vec3 dk = vec3(0.0);
  #ifdef USE_INSTANCING
  dk = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  #endif
  float faz = dk.x * 0.31 + dk.z * 0.23;
  float sal = sin(zaman * 1.4 + faz) * 0.6 + sin(zaman * 2.6 + faz * 1.9) * 0.3;
  transformed.x += sal * bitkiGenlik * ust;
  transformed.z += sal * bitkiGenlik * 0.67 * ust;
}`,
          );
      }
      shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nuniform float bitkiKar;").replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
if (bitkiKar > 0.0) {
  // Görüş normali → dünya (viewMatrix dik dönüşüm: devriğiyle çarpım); dünya konumu görüş konumundan
  vec3 dunyaN = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
  vec3 dunyaP = (vec4(-vViewPosition, 0.0) * viewMatrix).xyz + cameraPosition;
  float gurultu = sin(dunyaP.x * 1.7 + dunyaP.z * 0.9) * sin(dunyaP.z * 1.3 - dunyaP.y * 2.1) * 0.12;
  float kapla = smoothstep(0.18 + gurultu, 0.62 + gurultu, dunyaN.y) * bitkiKar;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.89, 0.93), kapla);
  roughnessFactor = mix(roughnessFactor, 0.85, kapla);
}`,
      );
    };
    m.customProgramCacheKey = () => (ruzgar ? "arazi-bitki-v2-ruzgar" : "arazi-bitki-v2");
    m.needsUpdate = true;
  }

  private async bitkileriYukle(nesil: number) {
    const liste = bitkiListesi(this.profil.bitkiler, this.kar);
    // Yerleşim yarıçapı: görünür yarıçapın %93'ü (en çok 148 m); kenar sisine çok yakın kaya yarım görünmez
    const enUzak = Math.max(14, Math.min(148, this.profil.yaricap * 0.93));
    // Bütün ağaç türlerinin gövdeleri ortak ızgarada: türler iç içe girmez
    const agaclar = new AralikIzgarasi(4);
    let eksik = 0;
    for (const b of liste) {
      const enYakin = Math.min(b.enYakin ?? 8, enUzak - 4);
      const us = b.us ?? 1.35;
      // Sınıfın en uzak mesafesi: dağılım kesilir, yakındaki yoğunluk aynı kalır (u ∈ [0, uSinir], adet × uSinir)
      const uSinir = kesikPay(enYakin, enUzak, Math.min(enUzak, b.enUzak ?? enUzak), us);
      const carpan = b.carpan === "agac" ? (this.profil.agac ?? 1) : this.profil[b.carpan];
      const adet = Math.round(b.adet * carpan * this.kalite.kayaCarpani * uSinir);
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
      const yerler = this.yerlerSec(b, adet, { enYakin, enUzak, us, uSinir }, boyut, kutu.min.y, agaclar);
      if (yerler.length === 0) continue;
      // Ağaç: UZAK_LOD_MESAFE ötesi uzak kopyayla (az üçgen, küçük doku), gölgesiz
      const yakinda = b.uzak ? yerler.filter((y) => Math.hypot(y.x, y.z) < UZAK_LOD_MESAFE) : yerler;
      const uzakta = b.uzak ? yerler.filter((y) => Math.hypot(y.x, y.z) >= UZAK_LOD_MESAFE) : [];
      if (yakinda.length) this.hucreleriKur(gltf, yakinda, b, kutu.min.y, boyut.y, b.golge);
      if (uzakta.length) {
        let uzakModel = gltf;
        try {
          uzakModel = await this.model(b.klasor, true);
        } catch {
          // uzak kopya da yakın model de yoksa yukarıda zaten atlanırdı; yakın model kalır
        }
        if (nesil !== this.nesil) return;
        uzakModel.scene.updateMatrixWorld(true);
        this.hucreleriKur(uzakModel, uzakta, b, kutu.min.y, boyut.y, false);
      }
    }
    if (nesil !== this.nesil) return;
    this.kullanilmayanModelleriBirak(liste);
    if (eksik > 0) this.uyari?.(`Arazi modelleri eksik: ${eksik} tür yüklenemedi (icerik/arazi/modeller; araclar/arazi-indir.mjs, Meshy bitkileri araclar/bitki-modelleri.json)`);
  }

  /**
   * Bir türün örnek yerleri: rastgele (mesafe dağılımı `us`) ya da yol boyu dizi; yol, temiz nokta (mevzi, patlama,
   * iniş), görüş koridoru, dere yatağı ve 3B alan/sokak (bitkiDisla) dışında; ağaçta gövdeler arası en az aralık ve dik
   * yamaç yok. `ton`: örnek rengi (ağaçta ±%10 parlaklık, hafif sarı/mavi kayma; diğerlerinde 1).
   */
  private yerlerSec(
    b: BitkiTanimi,
    adet: number,
    d: { enYakin: number; enUzak: number; us: number; uSinir: number },
    boyut: THREE.Vector3,
    taban: number,
    agaclar: AralikIzgarasi,
  ): BitkiYeri[] {
    const yerler: BitkiYeri[] = [];
    const agacMi = b.sinif === "agac";
    // Gövde çevresi (model metresi): ağaçta tepe değil gövde (tepeler iç içe geçebilir), diğerlerinde taban yarı genişliği
    const ayak = agacMi ? Math.max(1, boyut.x * 0.3) : boyut.x * 0.5;
    const adaylar = b.dizi && this.profil.yol ? karistir(yolDizisi(yolZ, -d.enUzak, d.enUzak, b.dizi.adim, b.dizi.faz, b.dizi.pay, b.dizi.bosluk, Math.random), Math.random) : null;
    if (b.dizi && !adaylar) return yerler; // yolu olmayan bölgede dizi yok
    const sinir = adaylar ? adaylar.length : adet * 40;
    let deneme = 0;
    while (yerler.length < adet && deneme < sinir) {
      deneme++;
      let x: number;
      let z: number;
      if (adaylar) {
        ({ x, z } = adaylar[deneme - 1]);
        const r = Math.hypot(x, z);
        if (r < d.enYakin || r > d.enUzak) continue;
      } else {
        const r = d.enYakin + Math.pow(Math.random() * d.uSinir, d.us) * (d.enUzak - d.enYakin);
        const a = Math.random() * Math.PI * 2;
        x = Math.cos(a) * r;
        z = Math.sin(a) * r;
        // Konumlar: eğim tercihine göre; yoldan uzak
        if (this.profil.yol && Math.abs(z - yolZ(x)) < 4 + (agacMi ? ayak * 2 : boyut.x)) continue;
        const egim = this.egim(x, z);
        if (Math.random() > 0.25 + egim * b.egimTercihi * 3) continue;
        if (agacMi && egim > 0.5) continue; // uçurum yamacında ağaç yok
      }
      if (this.bitkiDisla?.(x, z)) continue;
      const olcek = b.olcek[0] + Math.random() * (b.olcek[1] - b.olcek[0]);
      const pay = agacMi ? ayak * olcek : boyut.x * 0.5;
      if (this.temizNoktalar.some((t) => Math.hypot(t.x - x, t.z - z) < 4 + pay)) continue;
      if (this.koridorda(x, z, agacMi ? pay : boyut.x * 0.5 * b.olcek[1])) continue; // görüş koridoru: askerin önünü kapatmasın
      if (b.dereYok && this.yukseklik(x, z) < -1.2) continue; // dere yatağına büyük kaya/ağaç değil
      if (b.aralik && !agaclar.bosMu(x, z, b.aralik * olcek)) continue;
      const y = ZEMIN_Y + this.yukseklik(x, z) - taban * olcek - boyut.y * olcek * b.gomme;
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(x, y, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.random() * Math.PI * 2, 0)),
        new THREE.Vector3(olcek, olcek, olcek),
      );
      if (b.aralik) agaclar.ekle(x, z, b.aralik * olcek);
      const t = agacMi ? 0.9 + Math.random() * 0.2 : 1;
      const kayma = agacMi ? (Math.random() - 0.5) * 0.08 : 0;
      const [rr, rg, rb] = b.renk ?? [1, 1, 1];
      yerler.push({ x, z, m, ton: [t * (1 + kayma) * rr, t * rg, t * (1 - kayma * 1.5) * rb] });
    }
    return yerler;
  }

  /**
   * Yerleri azimut sektörlerine bölüp model parçası başına BitkiHucresi kurar (bkz. sınıf açıklaması). Malzeme bir kez
   * hazırlanır (bitkiMalzemesi: rüzgâr + kar); ağaç örnekleri hafif renk farkı alır (aynı model ormanda tekrar etmesin).
   */
  private hucreleriKur(gltf: GLTF, yerler: BitkiYeri[], b: BitkiTanimi, taban: number, yukseklik: number, golge: boolean) {
    const meshler: THREE.Mesh[] = [];
    gltf.scene.traverse((o) => {
      const mm = o as THREE.Mesh;
      if (mm.isMesh) meshler.push(mm);
    });
    const bitkiMi = b.sinif === "cali" || b.sinif === "ot" || b.sinif === "agac";
    const genlik = bitkiMi ? (b.ruzgar ?? 0.045) : 0;
    // Azimut sektörleri: her hücre ayrı mesh, three duvar ve gölge kamerası başına ayıklar
    const hucreler = sektorlereBol(yerler, SEKTOR_SAYISI, SEKTOR_KAYMASI).filter((h) => h.length > 0);
    for (const { geometri, malzeme } of this.modelParcalari(meshler)) {
      for (const mal of Array.isArray(malzeme) ? malzeme : [malzeme]) {
        // Yaprak/sap kartları iki yüzlü görünsün (fotogrametri modellerinde tek yüz)
        const std = mal as THREE.MeshStandardMaterial;
        if (bitkiMi && (std.alphaTest > 0 || std.transparent || b.klasor.startsWith("cimen"))) std.side = THREE.DoubleSide;
        // Rüzgâr salınımı (C-18) ve kar: malzeme paylaşımlı, bir kez
        this.bitkiMalzemesi(std, genlik > 0 ? { taban, yukseklik, genlik } : null);
        // Saydam + iki yüzlü: three arka ve ön yüzü iki ayrı çizimle çizerdi (ot ve çalı yaprağında kare başına
        // ~1 M üçgen); tek geçişte çizilir. Yapraklar derinlik yazmaz, sıralama farkı bu ölçekte görünmüyor.
        if (std.transparent && std.side === THREE.DoubleSide) std.forceSinglePass = true;
      }
      this.bitkiGeometrileri.push(geometri);
      for (const hucre of hucreler) {
        const inst = new BitkiHucresi(paylasimliGeometri(geometri), malzeme, hucre.length, b.sinif);
        hucre.forEach((y, i) => {
          inst.setMatrixAt(i, y.m);
          if (b.sinif === "agac" || b.renk) inst.setColorAt(i, _renk.setRGB(y.ton[0], y.ton[1], y.ton[2]));
        });
        inst.instanceMatrix.needsUpdate = true;
        if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
        inst.castShadow = golge;
        inst.receiveShadow = true;
        inst.sinirlariHesapla();
        this.bitkiGrubu.add(inst);
      }
    }
  }

  // ------------------------------------------------------------------ kare
  guncelle(dt: number) {
    this.zaman += dt;
    this.cimenZaman.value = this.zaman;
  }

  /** Yağmurdan ıslaklık 0–1 (sahne3b yağışla yavaşça yükseltip kurutur): koyu, parlak zemin ve düzlüklerde birikinti. */
  islaklikAyarla(v: number) {
    if (this.uniformlar.islaklik) this.uniformlar.islaklik.value = v;
  }

  /** Mevsim: kar örtüsü 0–1 (kış 1, sonbahar 0.15). */
  karAyarla(kar: number) {
    this.kar = kar;
    if (this.uniformlar.kar) this.uniformlar.kar.value = kar;
    // Bitki, kaya ve çimen karı (gölgelendiricide): sonbaharın hafif kırağısı (0,15) yalnız zeminde kalır. Çimen kışın
    // da görünür: saman rengi, dibi karda, bir kısmı örtünün altında (cimenMalzemesiHazirla)
    this.bitkiKar.value = Math.max(0, (kar - 0.3) / 0.7);
  }
}

/** mergeGeometries ile birleşebilir mi: hepsi indeksli ya da hiçbiri, aynı öznitelikler (boyut, tür, normalize), biçim hedefi yok. */
function birlesebilir(geolar: readonly THREE.BufferGeometry[]): boolean {
  const ilk = geolar[0];
  const adlar = Object.keys(ilk.attributes).sort().join(",");
  for (const g of geolar) {
    if ((g.index === null) !== (ilk.index === null)) return false;
    if (Object.keys(g.attributes).sort().join(",") !== adlar || Object.keys(g.morphAttributes).length > 0) return false;
    for (const ad of Object.keys(g.attributes)) {
      const a = g.attributes[ad];
      const b = ilk.attributes[ad];
      if (!(a instanceof THREE.BufferAttribute) || !(b instanceof THREE.BufferAttribute)) return false;
      if (a.itemSize !== b.itemSize || a.normalized !== b.normalized || a.array.constructor !== b.array.constructor) return false;
    }
  }
  return true;
}

/**
 * Aynı öznitelikleri (dolayısıyla aynı GPU tamponlarını) paylaşan yeni geometri nesnesi: her hücre kendi VAO'sunu
 * kullanır (çizim başına öznitelik yeniden bağlanmaz), köşe verisi bir kez yüklenir. Hepsi birlikte bırakılmalı (sok).
 */
function paylasimliGeometri(kaynak: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setIndex(kaynak.index);
  for (const ad of Object.keys(kaynak.attributes)) g.setAttribute(ad, kaynak.attributes[ad]);
  if (!kaynak.boundingSphere) kaynak.computeBoundingSphere();
  g.boundingSphere = kaynak.boundingSphere!.clone();
  return g;
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
