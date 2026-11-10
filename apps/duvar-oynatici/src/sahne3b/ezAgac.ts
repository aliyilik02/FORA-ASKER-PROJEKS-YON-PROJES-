/**
 * Yapraklı ağaçlar (10 Kasım): ez-tree (MIT, @dgreenheck/ez-tree) ile yordamsal ağaç. Meshy ağaçları tek parça "kil"
 * heykeldi (1,5 M üçgen 6000'e inince kristal kırıkları); burada dallar gerçek silindir, yapraklar/iğneler alfa kartı.
 * ez-tree yalnız geometri ve doku üretir: kendi Phong malzemesi ve rüzgâr gölgelendiricisi bırakılır, yerine arazi
 * hattının MeshStandardMaterial'ı gelir (bitkiMalzemesi: rüzgâr + kar, gölge, sektör ayıklaması aynen çalışsın).
 *
 * Arazi katmanı `ez_` önekli klasör adını bu modüle yönlendirir (arazi.ts `model()`); dönen nesne glTF gibi `{ scene }`.
 * Ağaç gerçek metre boyuna ölçeklenir (`boy`). Uzak kopya (UZAK_LOD_MESAFE ötesi): aynı ağaç, yaprak kartlarının
 * yarısı büyütülerek, ince dallar atılarak.
 *
 * Dokular: kabuk Poly Haven (meşe, söğüt) ve TextureCan (çam, huş) CC0; yaprak PNG'leri ez-tree deposunda (MIT).
 * Paket dokuları JS içinde taşıdığı için (~4 MB) dinamik import: ağaçsız bölgede (meskûn, üs) hiç yüklenmez.
 */
import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

/** ez-tree seçenekleri (paket türleri bildirilmemiş sınıf; yalnız kullandığımız alanlar). */
interface EzSecenekleri {
  seed: number;
  type: string;
  bark: { type: string; tint: number; textured: boolean; flatShading: boolean; textureScale: { x: number; y: number } };
  branch: {
    levels: number;
    angle: Record<number, number>;
    children: Record<number, number>;
    gnarliness: Record<number, number>;
    length: Record<number, number>;
    radius: Record<number, number>;
    sections: Record<number, number>;
    segments: Record<number, number>;
    start: Record<number, number>;
    taper: Record<number, number>;
    force: { direction: { x: number; y: number; z: number }; strength: number };
  };
  leaves: { type: string; billboard: string; angle: number; count: number; start: number; size: number; sizeVariance: number; tint: number; alphaTest: number };
}

export interface EzTuru {
  /** ez-tree ön ayarı: "Pine Large", "Oak Medium", "Aspen Large", "Ash Medium", "Bush 1" … */
  ayar: string;
  /** Hedef boy (m): ağaç bu yüksekliğe ölçeklenir; örnek ölçeği (BitkiTanimi.olcek) bunun üstüne. */
  boy: number;
  tohum: number;
  /** Ön ayarın üstüne tür ayarı (yerel tür: karaçam taç biçimi, ladin konisi, kavak sütunu …). */
  degistir?: (o: EzSecenekleri) => void;
  /** Yapraksız (kış, kuru ağaç). */
  yapraksiz?: boolean;
  /** Yaprak rengi çarpanı (doku × renk): Anadolu yazı biraz zeytin/sarı yeşil. */
  yaprakRenk?: number;
  kabukRenk?: number;
  /** En büyük yatay genişlik (m): ölçek boy ile bunun küçüğü (çalı ön ayarları boyundan 3–4 kat yayvan). */
  genislik?: number;
}

/** Çam/ladin ön ayarı ince ayarı için yardımcı. */
const ayarla = (f: (o: EzSecenekleri) => void) => f;

/**
 * Tür tablosu. Boylar Anadolu türlerinin olgun ağaç boyları (orman içinde biraz kısa): karaçam 18–25, kızılçam 12–18,
 * Toros göknarı/ladin 15–25, sapsız meşe 12–18, servi kavak 18–25, dişbudak 12–15.
 */
export const EZ_TURLERI: Record<string, EzTuru> = {
  // Karaçam: uzun çıplak gövde, tepede yayvan/yassı taç (yaşlı karaçamın "şemsiye"si)
  ez_karacam: {
    ayar: "Pine Large",
    boy: 20,
    tohum: 11,
    yaprakRenk: 0x6f8a5e,
    degistir: ayarla((o) => {
      o.branch.start[1] = 0.45;
      o.branch.angle[1] = 105;
      o.branch.children[0] = 70;
      o.branch.length[1] = 30;
    }),
  },
  // Kızılçam / genel çam: piramidal genç taç
  ez_cam: { ayar: "Pine Medium", boy: 14, tohum: 23, yaprakRenk: 0x76905f },
  ez_cam_genc: { ayar: "Pine Small", boy: 6, tohum: 37, yaprakRenk: 0x7d9665 },
  // Göknar/ladin: yere kadar dal, sık, aşağı sarkık dallarla dar koni
  ez_ladin: {
    ayar: "Pine Large",
    boy: 18,
    tohum: 41,
    yaprakRenk: 0x5f7d58,
    degistir: ayarla((o) => {
      o.branch.start[1] = 0.12;
      o.branch.angle[1] = 115;
      o.branch.children[0] = 120;
      o.branch.length[1] = 22;
      o.leaves.count = 30;
      o.leaves.size *= 1.35;
    }),
  },
  // Sedir: geniş, katlı, yatay dallı
  ez_sedir: {
    ayar: "Pine Large",
    boy: 16,
    tohum: 53,
    yaprakRenk: 0x68856a,
    degistir: ayarla((o) => {
      o.branch.start[1] = 0.3;
      o.branch.angle[1] = 92;
      o.branch.children[0] = 60;
      o.branch.length[1] = 42;
    }),
  },
  // Servi / mazı (köy kenarı): dar, sık, dalları gövdeye yakın yukarı iğne yapraklı sütun
  ez_servi: {
    ayar: "Pine Medium",
    boy: 11,
    tohum: 151,
    yaprakRenk: 0x5c7650,
    degistir: ayarla((o) => {
      o.branch.start[1] = 0.08;
      o.branch.angle[1] = 28;
      o.branch.children[0] = 110;
      o.branch.length[1] = Math.min(o.branch.length[1], 9);
      o.leaves.count = Math.max(o.leaves.count, 26);
      o.leaves.size *= 1.25;
    }),
  },
  // Toros ardıcı: kısa, eğri gövdeli, dağınık tepeli
  ez_ardic: {
    ayar: "Pine Small",
    boy: 5,
    tohum: 163,
    yaprakRenk: 0x5d7559,
    degistir: ayarla((o) => {
      o.branch.gnarliness[0] = Math.max(o.branch.gnarliness[0] ?? 0, 0.12);
      o.branch.gnarliness[1] = Math.max(o.branch.gnarliness[1] ?? 0, 0.2);
      o.branch.start[1] = 0.2;
    }),
  },
  ez_mese: { ayar: "Oak Medium", boy: 12, tohum: 61, yaprakRenk: 0x86975f },
  ez_mese_buyuk: { ayar: "Oak Large", boy: 15, tohum: 67, yaprakRenk: 0x82935c },
  ez_disbudak: { ayar: "Ash Medium", boy: 13, tohum: 71, yaprakRenk: 0x8a9c62 },
  // Servi kavak (Lombardiya): dar sütun, dallar gövdeye yakın yukarı
  ez_kavak: {
    ayar: "Aspen Large",
    boy: 22,
    tohum: 83,
    yaprakRenk: 0x8b9e5e,
    // Kabuk gri-kahve (ez-tree "aspen" huş gibi beyaz), yaprak yeşil dişbudak dokusu ("aspen" sonbahar sarısı)
    degistir: ayarla((o) => {
      o.bark.type = "willow";
      o.leaves.type = "ash";
      o.branch.angle[1] = 18;
      o.branch.angle[2] = 20;
      o.branch.length[1] = Math.min(o.branch.length[1], 14);
      o.branch.start[1] = 0.12;
    }),
  },
  ez_titrek_kavak: {
    ayar: "Aspen Medium",
    boy: 14,
    tohum: 89,
    yaprakRenk: 0x8fa062,
    degistir: ayarla((o) => {
      o.leaves.type = "ash";
    }),
  },
  ez_cali_1: { ayar: "Bush 1", boy: 1.4, genislik: 2.2, tohum: 101, yaprakRenk: 0x7a8c5c },
  ez_cali_2: { ayar: "Bush 2", boy: 1.1, genislik: 1.8, tohum: 103, yaprakRenk: 0x748758 },
  ez_cali_3: { ayar: "Bush 3", boy: 1.7, genislik: 2.4, tohum: 107, yaprakRenk: 0x708354 },
  // Bozkır/dağ kuru çalısı (geven, kekik, karaçalı tipi): solgun zeytin-kahve, alçak
  // Açık zeytin-saman: ilk sürüm (0x8f8560) yayvan ve kapkara "yanık çalı yığını" gibi duruyordu
  ez_kuru_cali: { ayar: "Bush 2", boy: 0.9, genislik: 1.4, tohum: 211, yaprakRenk: 0xc2b588, kabukRenk: 0xb0a08a },
  ez_kuru_cali_2: { ayar: "Bush 1", boy: 1.1, genislik: 1.6, tohum: 223, yaprakRenk: 0xb8ad80, kabukRenk: 0xb0a08a },
  // Kış / kuru: yaprak döken türler yapraksız (gerçek çıplak dal örgüsü)
  ez_kis_mese: { ayar: "Oak Medium", boy: 12, tohum: 61, yapraksiz: true },
  ez_kis_mese_buyuk: { ayar: "Oak Large", boy: 15, tohum: 67, yapraksiz: true },
  ez_kis_disbudak: { ayar: "Ash Medium", boy: 13, tohum: 71, yapraksiz: true },
  ez_kis_kavak: {
    ayar: "Aspen Large",
    boy: 22,
    tohum: 83,
    yapraksiz: true,
    degistir: (o) => EZ_TURLERI.ez_kavak.degistir?.(o),
  },
  ez_kis_titrek_kavak: { ayar: "Aspen Medium", boy: 14, tohum: 89, yapraksiz: true },
  ez_kuru_cam: { ayar: "Pine Medium", boy: 12, tohum: 131, yapraksiz: true, kabukRenk: 0xb8aa98 },
  ez_kuru_mese: {
    ayar: "Oak Small",
    boy: 9,
    tohum: 137,
    yapraksiz: true,
    kabukRenk: 0xa89c8c,
    degistir: ayarla((o) => {
      o.branch.gnarliness[1] = Math.max(o.branch.gnarliness[1] ?? 0, 0.25);
    }),
  },
};

/** Yaprak sayısı ve kart boyu çarpanı (bütün yapraklı türler; yakın ve uzak kopya). fps: yaprak kartı aşırı çizimi artar. */
export const YAPRAK_YOGUNLUGU = 1.4;
export const YAPRAK_BUYUMESI = 1.12;

export const ezTuruMu =(klasor: string) => klasor.startsWith("ez_") && klasor.split("~")[0] in EZ_TURLERI;

type EzModulu = typeof import("@dgreenheck/ez-tree");
let modulSozu: Promise<EzModulu> | null = null;
const ezModulu = () => (modulSozu ??= import("@dgreenheck/ez-tree"));

/** Doku resmi gelene dek bekler (paket dokuları data URL ile eşzamansız yüklenir). */
async function dokuHazir(t: THREE.Texture | null | undefined, sinirMs = 8000): Promise<void> {
  if (!t) return;
  const bas = performance.now();
  while (performance.now() - bas < sinirMs) {
    const img = t.image as HTMLImageElement | undefined;
    if (img && (img.complete === undefined || (img.complete && img.naturalWidth > 0))) return;
    await new Promise((r) => setTimeout(r, 30));
  }
}

/**
 * Yaprak kartı normali: kartın kendi normali ile taç merkezinden dışa doğrultunun karışımı. Kartlar düz panel gibi
 * parlamaz, taç bir hacim gibi aydınlanır (güneş tarafı açık, iç ve gölge tarafı koyu) — bitki gölgelendirmede bilinen
 * "küresel normal" yöntemi. `agirlik` 0 = kart normali, 1 = tam küre.
 */
export function yaprakNormalleri(geometri: THREE.BufferGeometry, agirlik = 0.8): void {
  const p = geometri.getAttribute("position");
  const n = geometri.getAttribute("normal");
  if (!p || !n || p.count === 0) return;
  geometri.computeBoundingBox();
  const kutu = geometri.boundingBox!;
  const merkez = kutu.getCenter(new THREE.Vector3());
  // Taç merkezi kutu ortasından biraz aşağı: alt yapraklar yanlara/aşağı, üst yapraklar yukarı baksın
  merkez.y = kutu.min.y + (kutu.max.y - kutu.min.y) * 0.42;
  const yari = kutu.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  const d = new THREE.Vector3();
  const k = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    // Elipsoit taçta dışa doğrultu: eksenleri taç yarı boyutuna böl
    d.set((p.getX(i) - merkez.x) / Math.max(yari.x, 0.01), (p.getY(i) - merkez.y) / Math.max(yari.y, 0.01), (p.getZ(i) - merkez.z) / Math.max(yari.z, 0.01));
    if (d.lengthSq() < 1e-6) d.set(0, 1, 0);
    d.normalize();
    k.set(n.getX(i), n.getY(i), n.getZ(i));
    // Kart normali taç dışına bakmıyorsa çevir (iki yüzlü kartın hangi yüzü olduğu önemsiz)
    if (k.dot(d) < 0) k.negate();
    k.lerp(d, agirlik).normalize();
    n.setXYZ(i, k.x, k.y, k.z);
  }
  n.needsUpdate = true;
}

/**
 * Uzak kopya yaprakları: kart birimlerinin (çift kartta iki dörtgen) yarısı atılır, kalanlar tabanları etrafında
 * `buyut` kat büyür: taç dolu kalır, üçgen yarıya iner. Saf (indeksli, 4 köşe / 6 indeks dörtgen düzeni).
 */
export function yapraklariSeyrelt(geometri: THREE.BufferGeometry, birimDortgen: 1 | 2, buyut = 1.4, tekYuz = false): THREE.BufferGeometry {
  const p = geometri.getAttribute("position");
  const uv = geometri.getAttribute("uv");
  const n = geometri.getAttribute("normal");
  const dortgen = p.count / 4;
  const birim = Math.floor(dortgen / birimDortgen);
  const tut: number[] = [];
  // tekYuz: çift kartın (çapraz iki dörtgen) yalnız ilki — uzakta kartın kenarı görünmez, yarı yarıya ucuz
  const birimdenAl = tekYuz ? 1 : birimDortgen;
  for (let b = 0; b < birim; b++) if (b % 2 === 0) for (let q = 0; q < birimdenAl; q++) tut.push(b * birimDortgen + q);
  const yP = new Float32Array(tut.length * 12);
  const yN = new Float32Array(tut.length * 12);
  const yU = new Float32Array(tut.length * 8);
  const yI = new Uint32Array(tut.length * 6);
  const taban = new THREE.Vector3();
  const v = new THREE.Vector3();
  tut.forEach((q, j) => {
    // Kart tabanı: köşe 1 ve 2'nin ortası (ez-tree dörtgeni: 0 sol üst, 1 sol alt, 2 sağ alt, 3 sağ üst)
    taban.set((p.getX(q * 4 + 1) + p.getX(q * 4 + 2)) / 2, (p.getY(q * 4 + 1) + p.getY(q * 4 + 2)) / 2, (p.getZ(q * 4 + 1) + p.getZ(q * 4 + 2)) / 2);
    for (let c = 0; c < 4; c++) {
      const s = q * 4 + c;
      v.set(p.getX(s), p.getY(s), p.getZ(s)).sub(taban).multiplyScalar(buyut).add(taban);
      yP.set([v.x, v.y, v.z], (j * 4 + c) * 3);
      yN.set([n.getX(s), n.getY(s), n.getZ(s)], (j * 4 + c) * 3);
      yU.set([uv.getX(s), uv.getY(s)], (j * 4 + c) * 2);
    }
    const o = j * 4;
    yI.set([o, o + 1, o + 2, o, o + 2, o + 3], j * 6);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(yP, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(yN, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(yU, 2));
  g.setIndex(new THREE.BufferAttribute(yI, 1));
  return g;
}

/** Arka yüzde normali çevirmeyen yaprak malzemesi (iki yüzlü kartın arkası taç dışına bakan normali korusun). */
function yaprakMalzemesi(harita: THREE.Texture | null, alfa: number, renk: number): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    name: "ez_yaprak",
    map: harita,
    color: renk,
    side: THREE.DoubleSide,
    alphaTest: Math.max(0.4, alfa),
    roughness: 0.82,
    metalness: 0,
  });
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_begin>",
      "#include <normal_fragment_begin>\n#ifdef DOUBLE_SIDED\nnormal *= faceDirection;\n#endif",
    );
  };
  m.customProgramCacheKey = () => "ez-yaprak-v1";
  return m;
}

/** Kabuk malzemesi: ez-tree'nin kabuk dokuları (renk, normal, AO, pürüzlülük) MeshStandard'a. */
function kabukMalzemesi(kaynak: THREE.MeshPhongMaterial, renk: number, sade = false): THREE.MeshStandardMaterial {
  // sade (uzak kopya): 40 m ötede normal/AO/pürüzlülük ayrıntısı görünmez, yalnız renk dokusu
  return new THREE.MeshStandardMaterial({
    name: sade ? "ez_kabuk_uzak" : "ez_kabuk",
    map: kaynak.map,
    normalMap: sade ? null : kaynak.normalMap,
    aoMap: sade ? null : kaynak.aoMap,
    roughnessMap: sade ? null : ((kaynak as unknown as { roughnessMap?: THREE.Texture | null }).roughnessMap ?? null),
    color: renk,
    roughness: 1,
    metalness: 0,
  });
}

/** Bir türü üretir: glTF benzeri `{ scene }` (arazi hattı yalnız `scene`'i kullanır). */
export async function ezAgacUret(klasor: string, uzak = false): Promise<GLTF> {
  // "ez_karacam~2": aynı türün başka bireyi (tohum kayar) — ormanda tek ağaç binlerce kez tekrar etmesin
  const [ad, varyantMetni] = klasor.split("~");
  const varyant = Number(varyantMetni ?? 0) || 0;
  const tur = EZ_TURLERI[ad];
  if (!tur) throw new Error(`ez-tree türü yok: ${klasor}`);
  const { Tree, TreePreset } = await ezModulu();
  const agac = new Tree();
  const on = (TreePreset as Record<string, unknown>)[tur.ayar];
  if (!on) throw new Error(`ez-tree ön ayarı yok: ${tur.ayar}`);
  const o = structuredClone(on) as EzSecenekleri;
  o.seed = tur.tohum + varyant * 977;
  o.bark.textureScale = { x: 1, y: 1 }; // dokular paylaşımlı: tekrar ölçeği türler arasında değişmesin
  o.bark.flatShading = false;
  tur.degistir?.(o);
  if (tur.yapraksiz) o.leaves.count = 0;
  else {
    // Taç yoğunluğu (kullanıcı isteği, 10 Kasım: ön ayar taçları seyrek/içi görünür duruyordu)
    o.leaves.count = Math.round(o.leaves.count * YAPRAK_YOGUNLUGU);
    o.leaves.size *= YAPRAK_BUYUMESI;
  }
  // Dal ağı bütçesi (10 Kasım ölçümü: ormanda üçgenlerin çoğu kabuktaydı — çamın ~100 yan dalı 10 kesit × 6 çevre
  // silindir, ağaç başına ~8,8 bin; ince dalların çoğu iğne/yaprak kartının arkasında). Gövde (seviye 0) korunur.
  for (const k of Object.keys(o.branch.sections)) {
    const s = +k;
    if (s === 0) {
      if (uzak) o.branch.sections[s] = Math.max(4, Math.round(o.branch.sections[s] * 0.5));
    } else o.branch.sections[s] = Math.max(2, Math.round(o.branch.sections[s] * (uzak ? 0.3 : 0.6)));
  }
  for (const k of Object.keys(o.branch.segments)) {
    const s = +k;
    if (s === 0) {
      if (uzak) o.branch.segments[s] = Math.max(5, Math.round(o.branch.segments[s] * 0.6));
    } else o.branch.segments[s] = uzak ? 3 : Math.min(o.branch.segments[s], 5);
  }
  (agac as unknown as { loadFromJson(j: unknown): void }).loadFromJson(o);

  const kabukKaynak = agac.branchesMesh.material as THREE.MeshPhongMaterial;
  const yaprakKaynak = agac.leavesMesh.material as THREE.MeshPhongMaterial;
  await Promise.all([dokuHazir(kabukKaynak.map), dokuHazir(kabukKaynak.normalMap), dokuHazir(kabukKaynak.aoMap), dokuHazir(yaprakKaynak.map)]);

  const sahne = new THREE.Group();
  sahne.name = klasor;
  const dalGeo = agac.branchesMesh.geometry;
  sahne.add(new THREE.Mesh(dalGeo, kabukMalzemesi(kabukKaynak, tur.kabukRenk ?? 0xffffff, uzak)));
  let yaprakGeo = agac.leavesMesh.geometry;
  // Yapraksız tür: ez-tree count = 0'da da yaprak döken dal uçlarına birer yaprak koyuyor; ağ tümden atılır
  if (!tur.yapraksiz && yaprakGeo.getAttribute("position")?.count) {
    if (uzak) {
      // Uzak: kart birimlerinin yarısı, çift kartın tek yüzü, 1,5 kat büyük (yaprak kartı ~¼; ölçüm: orman yaz
      // 1920×360 GTX 1650, Meshy 121 fps → ez-tree ilk sürüm 68 fps, aşırı çizim yaprak kartlarından)
      const cift = o.leaves.billboard === "double";
      const seyrek = yapraklariSeyrelt(yaprakGeo, cift ? 2 : 1, 1.5, cift);
      yaprakGeo.dispose();
      yaprakGeo = seyrek;
    }
    yaprakNormalleri(yaprakGeo, 0.8);
    sahne.add(new THREE.Mesh(yaprakGeo, yaprakMalzemesi(yaprakKaynak.map, o.leaves.alphaTest, tur.yaprakRenk ?? 0xffffff)));
  } else yaprakGeo.dispose();
  // ez-tree'nin kendi malzemeleri bırakılır (dokular bizim malzemede yaşar, dispose edilmez)
  kabukKaynak.dispose();
  yaprakKaynak.dispose();

  // Gerçek boy: model biriminden metreye (taban y = 0 kalır)
  sahne.updateMatrixWorld(true);
  const kutu = new THREE.Box3().setFromObject(sahne);
  const yukseklik = Math.max(0.01, kutu.max.y - kutu.min.y);
  const yatay = Math.max(0.01, kutu.max.x - kutu.min.x, kutu.max.z - kutu.min.z);
  sahne.scale.setScalar(Math.min(tur.boy / yukseklik, tur.genislik ? tur.genislik / yatay : Infinity));
  sahne.updateMatrixWorld(true);
  return { scene: sahne } as unknown as GLTF;
}
