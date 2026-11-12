/**
 * 3B figürler: glTF modelleri (asker, araç, sahne eşyası) panoramanın ışığıyla aydınlanır,
 * güneşe göre gölge düşürür, zemine gerçekten oturur. Panelin Figür komutu (azimut, yükseklik,
 * ölçek, yansıt) 2B kliplerle aynı sözleşmeyle gelir; yükseklik → mesafeye çevrilir.
 */
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as iskeletKopyala } from "three/examples/jsm/utils/SkeletonUtils.js";
import { azimutYon, derece, izleyiciyeDonus, konumAzimutu, radyan, yanaDonus, yerKonumu, yukseklikMesafe, zeminY } from "./uzay";
import { bakisAcilari, yumusat } from "./bakis";
import { rastgele } from "../rastgele";
import type { Safha } from "../tipler";

/**
 * Duruş geçiş klipleri (8 Kasım, B-9): GLB'de varsa ani kesme yerine önce geçiş klibi (LoopOnce), bitince hedef döngüye
 * çapraz geçilir. Adlar Mixamo (komando GLB'leri); yoksa eski 0,4 sn çapraz geçiş. Anahtar "önceki>yeni".
 */
const GECIS_KLIPLERI: Record<string, string[]> = {
  "ayakta>comelmis": ["Rifle Stand To Kneel", "Kneeling Down"],
  "comelmis>ayakta": ["Rifle Kneel To Stand", "Standing Up"],
  "comelmis>yatmis": ["Crouch To Prone"],
  "ayakta>yatmis": ["Crouch To Prone"],
  "yatmis>ayakta": ["Standing Up"],
  "yarali>ayakta": ["Standing Up"],
  "yarali>comelmis": ["Standing Up"],
};
/** Safha geçişinde sıhhiyecinin yaralıya yürüyüşü için klip adayları (ilk bulunan). */
const YURUYUS_KLIPLERI = ["Rifle Walk", "Walking", "Walk", "Rifle Crouch Walk", "Crouched Walking"];
const YURUYUS_HIZI = 1.5;
/** Mevzi değiştirme koşusu: klipler ve istenen hız (hareketUyumu klibin doğal hızına çeker: Rifle Run ≈ 3,2 m/sn). */
const KOSU_KLIPLERI = ["Rifle Run", "Running", "Run"];
const KOSU_HIZI = 3.4;
/** Mevzi değiştirme: figür başına aralık (sn), çatışma başladıktan sonraki ilk bekleme, iki sıçrama arası en az süre. */
const SICRAMA_ARALIGI: [number, number] = [14, 34];
const SICRAMA_ILK: [number, number] = [6, 22];
const SICRAMA_ARASI = 4.5;
/**
 * Eğik koşu eğimleri (derece, figürün sağ ekseni çevresinde; artı = öne): bel ve göğüs öne eğilir, baş geriye kalkıp
 * ileri bakar. Konsoldan ayar: `window.duvar.egikKosu`.
 */
export const EGIK_KOSU = { govde: 20, gogus: 14, bas: -22 };

/**
 * Hareket kliplerinin DOĞAL hızı (m/sn, 1,8 m boy): yerdeki ayağın köke göre hızı; oynatıcıda ölçüldü
 * (araclar/oyun-testi/figur-yakin.mjs, 10 Kasım). Figür bundan hızlı kaydırılırsa ayak yerde kayar ("buz pateni"):
 * Rifle Walk 1,5 m/sn ile %35, Rifle Run 4,5 m/sn ile %42, Rifle Crouch Walk 1,0 m/sn ile 2 kat kayıyordu.
 */
export const KLIP_DOGAL_HIZI: Record<string, number> = {
  "Rifle Walk": 1.0,
  "Rifle Run": 2.65,
  "Rifle Crouch Walk": 0.48,
  "Low Crawl": 0.42,
  "Injured Walk": 0.93,
};
/**
 * İstenen hızı klibin doğal hızına uydurur: klip en çok %20 hızlanır (%30'da koşu telaşlı, yapay duruyordu) / %20 yavaşlar, figür tam o hızla ilerler (ayak
 * kaymaz). Doğal hızı bilinmeyen klipte istenen hız aynen kalır.
 */
export function hareketUyumu(klipAdi: string, istenenHiz: number, boy = 1.8): { hiz: number; zamanOlcegi: number } {
  const kisa = klipAdi.split(/[|/]/).pop() ?? klipAdi;
  const dogal = KLIP_DOGAL_HIZI[kisa];
  if (!dogal || istenenHiz <= 0) return { hiz: istenenHiz, zamanOlcegi: 1 };
  const d = dogal * (boy / 1.8);
  const zamanOlcegi = Math.min(1.2, Math.max(0.8, istenenHiz / d));
  return { hiz: d * zamanOlcegi, zamanOlcegi };
}

/** Kalça konum/dönüş izleri (Mixamo "…Hips"): klipler arası duruş uyumu ve geçiş kliplerinin ölü başı/sonu için. */
function kalcaIzleri(klip: THREE.AnimationClip) {
  return {
    konum: klip.tracks.find((t) => /hips\.position$/i.test(t.name)) ?? null,
    donus: klip.tracks.find((t) => /hips\.quaternion$/i.test(t.name)) ?? null,
  };
}
/** Klibin `t` anındaki kalça konumunun (yerel) verilen konuma uzaklığı; iz yoksa 0 (uyumlu say). */
export function kalcaFarki(klip: THREE.AnimationClip, t: number, konum: THREE.Vector3): number {
  const iz = kalcaIzleri(klip).konum;
  if (!iz) return 0;
  let i = 0;
  while (i < iz.times.length - 1 && iz.times[i + 1] <= t) i++;
  return Math.hypot(iz.values[i * 3] - konum.x, iz.values[i * 3 + 1] - konum.y, iz.values[i * 3 + 2] - konum.z);
}
/** Klipte kalçanın verilen konuma en yakın olduğu (en erken) an: çömelmiş/yerdeki figür düşme klibine ortasından girer. */
export function kalcayaEnYakinZaman(klip: THREE.AnimationClip, konum: THREE.Vector3): number {
  const iz = kalcaIzleri(klip).konum;
  if (!iz) return 0;
  const uzaklik = (i: number) => Math.hypot(iz.values[i * 3] - konum.x, iz.values[i * 3 + 1] - konum.y, iz.values[i * 3 + 2] - konum.z);
  let enAz = Infinity;
  for (let i = 0; i < iz.times.length; i++) enAz = Math.min(enAz, uzaklik(i));
  for (let i = 0; i < iz.times.length; i++) if (uzaklik(i) <= enAz + 0.03) return iz.times[i];
  return 0;
}
/**
 * Geçiş klibinin işe yarar aralığı: kalçanın ilk kıpırdadığı andan 0,25 sn önce başlar, son duruşa oturduktan 0,3 sn sonra
 * biter. Mixamo "Standing Up" 11,4 sn sürer ve ilk ~3,5 sn yerde kıpırtısız yatar: "Kalk" komutundan sonra asker saniyelerce
 * tepkisiz kalıyordu.
 */
const gecisAralikOnbellek = new WeakMap<THREE.AnimationClip, { bas: number; son: number }>();
export function gecisAraligi(klip: THREE.AnimationClip): { bas: number; son: number } {
  const onbellek = gecisAralikOnbellek.get(klip);
  if (onbellek) return onbellek;
  const { konum, donus } = kalcaIzleri(klip);
  let sonuc = { bas: 0, son: klip.duration };
  if (konum && konum.times.length > 2) {
    const n = konum.times.length;
    const v = konum.values;
    const q = donus && donus.times.length === n ? donus.values : null;
    const fark = (i: number, j: number) => {
      const d = Math.hypot(v[i * 3] - v[j * 3], v[i * 3 + 1] - v[j * 3 + 1], v[i * 3 + 2] - v[j * 3 + 2]);
      if (!q) return d;
      const nokta = Math.abs(q[i * 4] * q[j * 4] + q[i * 4 + 1] * q[j * 4 + 1] + q[i * 4 + 2] * q[j * 4 + 2] + q[i * 4 + 3] * q[j * 4 + 3]);
      return d + 2 * Math.acos(Math.min(1, nokta)) * 0.2; // 8,6 derece dönüş ≈ 3 cm sayılır
    };
    let ilk = 0;
    while (ilk < n - 1 && fark(ilk, 0) < 0.03) ilk++;
    let sonHareket = n - 1;
    while (sonHareket > ilk && fark(sonHareket, n - 1) < 0.03) sonHareket--;
    sonuc = { bas: Math.max(0, konum.times[ilk] - 0.25), son: Math.min(klip.duration, konum.times[sonHareket] + 0.3) };
    if (sonuc.son - sonuc.bas < 0.3) sonuc = { bas: 0, son: klip.duration };
  }
  gecisAralikOnbellek.set(klip, sonuc);
  return sonuc;
}
/**
 * Sıhhiyecinin yaralı başındaki müdahale döngüsü (10 Kasım, kullanıcı gözlemi: "Kneeling Pointing" tek bir işaret
 * jestidir, 4 sn'de bir sonsuz dönünce gerçekçilik kayboluyordu). Bekleme klibi `isaret` olan ve başka figürün yanına
 * yerleşen figür şu döngüye girer: değerlendirme (`bekle`, 2–4 sn) → yaralının üstünde elle çalışma (`calis`, 8–14 sn,
 * yavaşlatılmış: bası/sargı gibi okunur) → kontrol (`bekle`, 3–6 sn) → …; her üç turda bir kez `isaret` (yardım/tahliye
 * çağrısı, tek oynatım). Süreler rastgele: iki sıhhiyeci eş zamanlı hareket etmez.
 */
const MUDAHALE_KLIPLERI = { bekle: "Kneeling Idle", calis: "Administering Cpr", isaret: "Kneeling Pointing" };
const MUDAHALE_CALISMA_HIZI = 0.6;
/** Çalışma klibinin harman payı (kalanı dik diz çökme): 1 = gövde yere yatık, 0,5 = öne eğilmiş. */
const MUDAHALE_CALISMA_PAYI = 0.5;
type MudahaleDurumu = "bekle" | "calis" | "isaret";

/** Ayakta vurulan figür için düşme klibi çeşitleri (modelde varsa): hep aynı ölüm tekrar etmesin. */
const DUSME_CESITLERI = ["Death From The Front", "Standing React Death Backward"];
/** Diz çökmüş figürün çatışmada geçtiği nişan klibi adayları ("Rifle Kneel Idle" tüfeği dik tutar, ateş edemez). */
const COMELMIS_NISAN_KLIPLERI = ["Idle Crouching Aiming"];

/**
 * Üst/alt gövde katmanlama (D-22): ateş klibinin yalnız omurga/boyun/baş/omuz/kol/el izleri "üst" klip, yürüyüş klibinin
 * geri kalan izleri (kalça, bacaklar, kök) "alt" klip olur; ikisi ayrık kemik kümelerine yazdığından karıştırıcıda
 * harmanlanmadan üst üste çalar: yürüyen asker düşman varken nişanda kalır. Mixamo/Meshy kemik adları; rig tanınmazsa null.
 */
const UST_GOVDE = /spine|neck|head|shoulder|arm|hand|clavicle/i;
const ustGovdeOnbellek = new WeakMap<THREE.AnimationClip, THREE.AnimationClip | null>();
const altGovdeOnbellek = new WeakMap<THREE.AnimationClip, THREE.AnimationClip | null>();
function kemikAdi(izAdi: string): string {
  return izAdi.split(".")[0];
}
export function ustGovdeKlibi(klip: THREE.AnimationClip): THREE.AnimationClip | null {
  if (ustGovdeOnbellek.has(klip)) return ustGovdeOnbellek.get(klip)!;
  const ust = klip.tracks.filter((t) => UST_GOVDE.test(kemikAdi(t.name)));
  const sonuc = ust.length >= 3 && klip.tracks.length - ust.length >= 3 ? new THREE.AnimationClip(klip.name + "|ust", klip.duration, ust) : null;
  ustGovdeOnbellek.set(klip, sonuc);
  return sonuc;
}
export function altGovdeKlibi(klip: THREE.AnimationClip): THREE.AnimationClip | null {
  if (altGovdeOnbellek.has(klip)) return altGovdeOnbellek.get(klip)!;
  const alt = klip.tracks.filter((t) => !UST_GOVDE.test(kemikAdi(t.name)));
  const sonuc = alt.length >= 3 && klip.tracks.length - alt.length >= 3 ? new THREE.AnimationClip(klip.name + "|alt", klip.duration, alt) : null;
  altGovdeOnbellek.set(klip, sonuc);
  return sonuc;
}

export interface ModelTanimi {
  dosya: string;
  /** Oynatılacak animasyon adı (yoksa ilk animasyon; "yok" → sabit). */
  animasyon?: string;
  /** Hedef boy (metre); modelin sınır kutusu buna ölçeklenir. Varsayılan 1.8. */
  boy?: number;
  /** Model zaten metre ölçeğinde (Meshy nesneleri: turnike, sedye…): boy normalizasyonu atlanır, yalnız `olcek` çarpanı. */
  olcekSabit?: boolean;
  /** Modelin ön yüzü +z değilse düzeltme (derece). */
  yonDerece?: number;
  /** Yana hareket hızı (m/s); yürüme/koşma klipleri için. Yansıt = sola. */
  hiz?: number;
  /** Varsayılan mesafe (m); panelden yükseklik gelmezse. */
  mesafe?: number;
  /** Yere yatık figür (yaralı): modelin y ekseni ileri yatırılır. */
  yatik?: boolean;
  dongu?: boolean;
  /** Silahlı figür: çatışmada düşman yönüne döner ve ateşle karşılık verir. */
  silah?: boolean;
  /** Malzemeleri tek renge boya (ör. "#4b5a3c" haki); çiğ renkli düşük poligon modeller için. */
  renk?: string;
  /** Yerleşim türleri sırayla (ör. ["tank", "figur"]); verilmezse ["asker", "figur"]. */
  yerlesim?: Array<"asker" | "tank" | "figur">;
  /** Ağır silah (tank/top): gövde yerinde kalır, varsa kule düşmana döner, top atışı yapar. */
  agirSilah?: boolean;
  /** Kule ve namlu düğüm adları (glTF). Namlu kuleye bağlanır, kule düşmana döner. */
  kule?: string;
  namlu?: string;
  /**
   * Duruma göre klipler: çatışmada `ates` (nişan/atış döngüsü), aksi hâlde `animasyon`; `vurulma` (tek sefer,
   * isabet tepkisi) ve `dusme` (tek sefer, yere düşüp kalır) yaralı duruşu için. Kısa ad yeter ("Idle_Gun_Shoot").
   */
  animasyonlar?: { ates?: string; vurulma?: string; dusme?: string; comelmis?: string; yatmis?: string };
  // `comelmis` / `yatmis`: duruşun klibi (ör. Mixamo "Rifle Kneel Idle", "Prone Idle"); varsa prosedürel kemik ofsetleri
  // yerine klibe çapraz geçilir. Yoksa (Quaternius) eski prosedürel yol.
  /** Elde silah: ayrı glTF, iskeletteki kemiğe bağlanır. konum metre, donus derece, boy = silah uzunluğu (m). */
  silahModeli?: { dosya: string; kemik: string; konum?: [number, number, number]; donus?: [number, number, number]; boy?: number };
  /** Başlangıç duruşu (manifest); panel komutu `poz` ile değişir. */
  poz?: FigurPozu;
  /** Yerleşim planı atlanır: yön + mesafe aynen (yasak aralıktan kaçınarak). Yaralı gibi yakın konması gereken figürler. */
  serbestYerlesim?: boolean;
  /**
   * Prosedürel duruş (diz çökme, yerde nefes/yardım işareti) için kemik adları. Verilmezse Quaternius
   * rigi varsayılır (Hips, Chest, UpperLeg.L/R, LowerLeg.L/R, UpperArm.R; GLTFLoader noktaları siler).
   */
  kemikler?: Partial<Record<KemikRolu, string>>;
}

export type FigurPozu = "ayakta" | "comelmis" | "yatmis" | "yarali";
type KemikRolu = "govde" | "gogus" | "bas" | "solUstBacak" | "solAltBacak" | "sagUstBacak" | "sagAltBacak" | "sagUstKol" | "solAyak" | "sagAyak";
/**
 * Quaternius rigi: uyluk→baldır zinciri Body altında, ayaklar (Foot.L/R) Root altında AYRI kemiklerdir
 * (IK hedefi; bekleme klibi onları yazmaz). Bacak döndürülünce ayak da taşınmalı.
 */
const VARSAYILAN_KEMIKLER: Record<KemikRolu, string> = {
  govde: "Torso",
  gogus: "Chest",
  bas: "Head",
  solUstBacak: "UpperLeg.L",
  solAltBacak: "LowerLeg.L",
  sagUstBacak: "UpperLeg.R",
  sagAltBacak: "LowerLeg.R",
  sagUstKol: "UpperArm.R",
  solAyak: "Foot.L",
  sagAyak: "Foot.R",
};

/**
 * Aynı kemik listesine sahip iskeletli mesh'ler tek Skeleton nesnesini paylaşır. SkeletonUtils.clone her
 * mesh'e ayrı Skeleton verir; renderer kemik matrislerini iskelet başına (karede bir) hesaplayıp dokuya
 * yüklediği için 9 parçalı Quaternius modelinde bu 9 kat iş demektir (3 duvar × gölge geçişi ile çarpılır).
 */
function iskeletleriPaylastir(kok: THREE.Object3D) {
  const meshler: THREE.SkinnedMesh[] = [];
  kok.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) meshler.push(o as THREE.SkinnedMesh);
  });
  const temsilciler: THREE.Skeleton[] = [];
  for (const m of meshler) {
    const esi = temsilciler.find(
      (t) =>
        t.bones.length === m.skeleton.bones.length &&
        t.bones.every((b, i) => b === m.skeleton.bones[i]) &&
        t.boneInverses.every((inv, i) => inv.equals(m.skeleton.boneInverses[i])),
    );
    if (esi) m.skeleton = esi;
    else temsilciler.push(m.skeleton);
  }
}

/** Kemiği dünya uzayında `d` kadar taşır (ebeveynin ölçeği/dönüşü hesaba katılır). */
function dunyadaKaydir(kemik: THREE.Object3D, d: THREE.Vector3) {
  if (!kemik.parent || d.lengthSq() < 1e-10) return;
  kemik.parent.updateWorldMatrix(true, false);
  const ters = kemik.parent.matrixWorld.clone().invert();
  const yerel = d.clone().applyMatrix4(ters).sub(new THREE.Vector3().applyMatrix4(ters));
  kemik.position.add(yerel);
  kemik.updateWorldMatrix(false, true);
}

/**
 * Kemiği dünya eksenine göre döndürür (ebeveyn zinciri korunur): W' = R(eksen, açı) · W.
 * Animasyonlu riglerde ebeveyn ölçekleri düzgün olmayabilir (kayma); dünya kuaterniyonu ve sonuç
 * normalize edilir, yoksa birim olmayan kuaterniyon matrisi ölçekler ve model şişer.
 */
function dunyaEkseniEtrafindaDondur(kemik: THREE.Object3D, eksen: THREE.Vector3, aci: number) {
  if (Math.abs(aci) < 1e-5) return;
  kemik.updateWorldMatrix(true, false);
  const q = kemik.getWorldQuaternion(new THREE.Quaternion()).normalize();
  const r = new THREE.Quaternion().setFromAxisAngle(eksen, aci);
  kemik.quaternion.multiply(q.clone().invert().multiply(r).multiply(q)).normalize();
  kemik.updateWorldMatrix(false, true);
}

export interface AgirSilah {
  /** Ayak hizası dünya konumu. */
  konum: THREE.Vector3;
  /** Namlu ucu dünya konumu ve atış yönü (birim). */
  namlu: THREE.Vector3;
  yon: THREE.Vector3;
}

export interface FigurSecenekleri {
  id: string;
  azimut: number;
  /** Verilirse yükseklik yerine doğrudan mesafe (m) kullanılır (yerleşim planından). */
  mesafe?: number;
  yukseklik?: number;
  olcek?: number;
  yansit?: boolean;
  dongu?: boolean;
  /** Başlangıç duruşu; manifestteki `poz`u ezer. */
  poz?: FigurPozu;
  /** Bu kimlikli figürün yanına, ona dönük yerleş (sıhhiyeci → yaralı). */
  yaninda?: string;
}

type PozAsamasi = "normal" | "vuruluyor" | "dusuyor" | "yerde";

export interface Aktif {
  id: string;
  nesne: THREE.Object3D;
  karistirici: THREE.AnimationMixer | null;
  /** Modelin bütün klipleri (silah hizalama örneklemesi için). */
  klipler: THREE.AnimationClip[];
  hiz: number;
  sola: boolean;
  bitti: boolean;
  silah: boolean;
  temelDonus: number;
  agirSilah: boolean;
  kule: THREE.Object3D | null;
  kuleTemel: THREE.Quaternion | null;
  namlu: THREE.Object3D | null;
  /** Kule yaw ofseti: a=0 iken kulenin dünya yaw'ı ve işaret (deneysel ölçülür). */
  kuleAci: number;
  /** Başka figürün yanına yerleşti: çatışmada düşmana dönmez, ona dönük kalır. */
  yaninda: boolean;
  eylemBekle: THREE.AnimationAction | null;
  eylemAtes: THREE.AnimationAction | null;
  atesPozu: boolean;
  /** Duruş sistemi */
  poz: FigurPozu;
  asama: PozAsamasi;
  eylemVurulma: THREE.AnimationAction | null;
  eylemDusme: THREE.AnimationAction | null;
  /** Klip tabanlı duruşlar (varsa) ve o an çalan duruş klibi. */
  eylemPoz: Partial<Record<"comelmis" | "yatmis", THREE.AnimationAction>>;
  aktifPoz: THREE.AnimationAction | null;
  kemikler: Partial<Record<KemikRolu, THREE.Object3D>>;
  /** Ofset uygulanmadan önceki kemik kuaterniyonları: klip o kemiği yazmıyorsa birikmeyi önlemek için kare başında geri yüklenir. */
  kemikTemel: Map<THREE.Object3D, THREE.Quaternion>;
  kemikTemelKonum: Map<THREE.Object3D, THREE.Vector3>;
  /** Elde silah: yaralı yere düşünce yanına bırakılır, kalkınca ele döner. */
  silahNesne: THREE.Object3D | null;
  silahKemik: THREE.Object3D | null;
  silahTemel: { konum: THREE.Vector3; donus: THREE.Quaternion; olcek: THREE.Vector3 } | null;
  /** Kulenin dönme ekseni (yerel; ilk döndürmede dünya yukarısından seçilir). */
  kuleEksen?: THREE.Vector3;
  silahYerde: boolean;
  /** İç model düğümü (sarmalın çocuğu) ve ayakta dururkenki y'si; diz çökünce aşağı iner. */
  icNesne: THREE.Object3D;
  tabanY: number;
  /** Hedef boy (m): çökme derinliği ve nefes genliği buna göre. */
  boy: number;
  /** Çökme miktarı 0..1 (yumuşak geçiş). */
  comelme: number;
  /** Yere yatma miktarı 0..1 (yumuşak geçiş). */
  yatma: number;
  /** Prosedürel hareketler için zaman (s) ve bir sonraki yardım işareti zamanı. */
  zaman: number;
  sonrakiYardim: number;
  azimut: number;
  /** Bakış: yüze göre yumuşatılmış yaw/pitch ofseti (radyan); hedef FigurKatmani.bakisHedefi. */
  bakisYaw: number;
  bakisPitch: number;
  /** "Yanında" yerleşildiyse hedef figürün kimliği (bakış için). */
  yanindaId: string | null;
  /** Süren duruş geçiş klibi; bitince `hedef` döngüsüne geçilir. */
  gecis: { eylem: THREE.AnimationAction; hedef: THREE.AnimationAction; son: number } | null;
  /** Safha "ateş altında"da siperde bekleyen sıhhiyeci: taktik sahaya geçince `yanindaHedef`e yürür. */
  safhaBekliyor: boolean;
  yanindaHedef: { konum: THREE.Vector3; donus: number } | null;
  /** Süren yürüyüş (hedefe, varınca `donus`a dönüp bekleme klibine). */
  /** `inis`: mevzi değiştirme koşusunun son metresi (sipere dalış başladı: diz çökme geçişi oynuyor, hız düşüyor). */
  yuruyus: { hedef: THREE.Vector3; donus: number; eylem: THREE.AnimationAction | null; hiz: number; inis?: boolean } | null;
  /** Eğik koşu (0–1): mevzi değiştirirken gövde öne eğilir, baş ileri bakar (durusuUygula). */
  egik: number;
  /**
   * Mevzi değiştirme (çatışmada canlılık; `sicramayiGuncelle`): `sonraki` bir sonraki sıçramanın sahne saati (0: çatışma
   * dışı, henüz kurulmadı); `kosuyor` asker yeni mevziye koşuyor (siper davranışı o sürede karışmaz).
   */
  sicrama: { sonraki: number; kosuyor: boolean };
  /** Haki boya için kopyalanan malzemeler: figür kaldırılınca bırakılır (önbellekteki glTF malzemeleri paylaşımlı, bırakılmaz). */
  kopyaMalzemeler: THREE.Material[];
  /** Yakın patlamaya irkilme (D-22): başlangıç saati ve güç 0..1; 1,1 sn'de gövde ve baş öne eğilip toparlanır. */
  tepki: { baslangic: number; guc: number } | null;
  /** Kademeli nişan (D-22): çatışma başlayınca her figür 0–0,9 sn farklı gecikmeyle ateş pozuna geçer (saat). */
  atesGecikmesi: number | null;
  /** Üst gövde ateş klibi (yalnız omurga/kol/baş izleri); yürüyen figürde alt gövde yürüyüşle birlikte çalar. */
  eylemAtesUst: THREE.AnimationAction | null;
  /** Üst/alt katman açık (yürürken nişan). */
  katmanAktif: boolean;
  /** Zemin eğimine hizalama: yumuşatılmış pitch/roll (radyan; sarmal Euler sırası YXZ). */
  egimX: number;
  egimZ: number;
  /** Kaçınma: hareket hattından o anki sapma (m, izleyiciden dışa +) ve hedeflenen sapma. */
  kacinma: number;
  kacinmaHedef: number;
  /** Yana koşan/yürüyen figürün halka yarıçapı (m; doğduğu yer). Konum her kare bu yarıçap + sapma olarak kurulur. */
  hatYaricapi: number;
  /** Kalça kemiği ve dinlenme uzunluğu (yerel birim): klipler arası duruş uyumu ölçüsü. */
  kalca: THREE.Object3D | null;
  kalcaBoy: number;
  /** Ayakta vurulunca rastgele seçilen düşme klipleri (eylemDusme dahil). */
  dusmeAdaylari: THREE.AnimationAction[];
  /** Diz çökmüş nişan klibi (varsa): çatışmada duruş klibinin yerine çalar. */
  eylemComelmisNisan: THREE.AnimationAction | null;
  /** Yürüyüş bitince yumuşak dönülecek yön (radyan) ya da null. */
  donusHedef: number | null;
  /** Son görülen düşman azimutu: ateş kesilince asker sırtını tehdide dönmez, o yöne bakmayı sürdürür. */
  sonDusman: number | null;
  /** Son atış saati: ateş klibi yalnız salvo sırasında çalar, arada nişanda bekler. */
  sonAtis: number;
  /** Tüfeğin uzun ekseni (yerel): yere düşünce yan yatırmak için. */
  silahUzunEksen: "x" | "z";
  /** Tüfek gövdesinin kutu merkezi (tüfeğin yerel uzayı; model kökü namlu ekseninin ~20 cm altında). */
  silahMerkez: THREE.Vector3;
  /** Sol kol zinciri (üst kol, ön kol, el) ve IK ağırlığı 0..1: destek eli tüfeğin el kundağına oturur. */
  solKol: { ust: THREE.Object3D; on: THREE.Object3D; el: THREE.Object3D } | null;
  solElAgirlik: number;
  /**
   * Siper davranışı (çatışma boyunca): "inKalk" sütre arkasında çöker, ateş için doğrulur, yeniden çöker; "diz" açıkta
   * diz çöküp öyle ateş eder; "ayakta" olduğu gibi; "elle" eğitmen duruş verdi, karışılmaz. `sonraki` bir sonraki
   * değişimin saati; `otoComeldi` duruşu bu davranış değiştirdiyse (çatışma bitince ayağa kalkar).
   */
  siper: { mod: "inKalk" | "diz" | "yat" | "ayakta" | "elle"; sonraki: number; otoComeldi: boolean } | null;
  /** Yaralının görüş hattını açmak için en son kenara çekildiği saat (art arda yer değiştirmesin). */
  kenaraCekilme: number;
  /** Sıhhiyecinin müdahale döngüsü (MUDAHALE_KLIPLERI); `simdiki` null: döngü başlamadı / bırakıldı. */
  mudahale: {
    eylemler: Record<MudahaleDurumu, THREE.AnimationAction>;
    durum: MudahaleDurumu;
    simdiki: THREE.AnimationAction | null;
    bitis: number;
    tur: number;
    /** Yumuşatılmış ağırlıklar 0..1: çalışma klibi payı ve işaret klibi payı. */
    calisma: number;
    isaret: number;
    /** Döngüye giriş rampası 0..1 (0,7 sn). */
    giris: number;
  } | null;
}

/** Klip adı tam ("CharacterArmature|Idle_Gun") ya da kısa ("Idle_Gun") eşleşir. */
function klipBul(klipler: THREE.AnimationClip[], ad: string | undefined): THREE.AnimationClip | null {
  if (!ad) return null;
  return klipler.find((k) => k.name === ad || k.name.endsWith("|" + ad) || k.name.endsWith("/" + ad)) ?? null;
}

export class FigurKatmani {
  readonly grup = new THREE.Group();
  private readonly yukleyici = new GLTFLoader();
  private readonly onbellek = new Map<string, Promise<GLTF>>();
  private aktifler: Aktif[] = [];
  /** Çatışmada silahlı figürlerin döneceği düşman azimutu (null: izleyiciye dönük kal). */
  dusmanAzimutu: number | null = null;
  /** Çatışmada siper alma davranışı (panel Efektler › Çatışma › Siper al). */
  siperAl = true;
  /**
   * Mevzi değiştirme: çatışmada (siper alma açıkken) asker ara sıra kalkıp yakındaki boş mevziye koşar, oradan ateşe
   * devam eder. Aynı anda tek asker hareket eder (birlik kademeli sıçrar), iki sıçrama arası ≥ 4,5 sn. `?hareket=kapali`
   * kapatır. `mevziAdaylari` (sahne3b): askerin yakınındaki boş mevziler (plan noktaları, yoksa yanal yerler).
   */
  mevziDegistir = true;
  mevziAdaylari: ((konum: THREE.Vector3, id: string) => THREE.Vector3[]) | null = null;
  private sonSicrama = -100;
  /** Asker mevzi değiştirdi (yeni sahne azimutu): main.ts köprüye bildirir, panelin duvar şeridindeki işaret yer değiştirir. */
  konumOlayi: ((id: string, azimut: number) => void) | null = null;
  private gorusDenetimi = 0;
  /** TCCC safhası (durum.safha); "ates_altinda"da sıhhiyeci yaralıya gitmez, siperde bekler. */
  safha: Safha = "taktik_saha";
  /** Son patlamanın yeri ve sahne saati: 4 sn boyunca figürler oraya bakar (düşman/yaralı yoksa). */
  private sonPatlama: { konum: THREE.Vector3; zaman: number } | null = null;
  private saat = 0;

  /** Patlama oldu: figürler kısa süre oraya bakar (sahne3b.patlama çağırır). */
  patlamaOldu(konum: THREE.Vector3) {
    this.sonPatlama = { konum: konum.clone(), zaman: this.saat };
    // İrkilme (D-22): 30 m içindeki ayakta/çömelmiş figürler mesafeyle azalan güçte öne eğilir (yaralı, yerde, ağır silah hariç)
    for (const a of this.aktifler) {
      if (a.poz === "yarali" || a.asama !== "normal" || a.agirSilah) continue;
      const d = a.nesne.position.distanceTo(konum);
      if (d > 30) continue;
      const guc = Math.min(1, Math.max(0.25, 1 - d / 30));
      if (!a.tepki || this.saat - a.tepki.baslangic > 0.6) a.tepki = { baslangic: this.saat, guc };
    }
  }

  /**
   * Safha değişti. Taktik sahaya geçince "ateş altında" siperde bekleyen sıhhiyeciler yürüyüp yaralının başına gider
   * (yürüyüş klibi varsa onunla, yoksa kayarak), varınca ona dönük müdahale klibine döner.
   */
  safhaAyarla(safha: Safha) {
    this.safha = safha;
    if (safha === "ates_altinda") return;
    for (const a of this.aktifler) {
      if (!a.safhaBekliyor || !a.yanindaHedef) continue;
      a.safhaBekliyor = false;
      this.yuruyusBaslat(a, a.yanindaHedef.konum, a.yanindaHedef.donus);
    }
  }

  get sayi() {
    return this.aktifler.length;
  }

  /** Ses olayları (yaralanma çığlığı, yardım çağrısı); main.ts ses motoruna bağlar. */
  sesOlayi: ((tur: "vuruldu" | "yardim", azimut: number) => void) | null = null;
  /** Figür ekrandan çıktı (yürüyen/koşan duvarın ucunu geçti); kimlik köprüye bildirilir. */
  bittiOlayi: ((id: string) => void) | null = null;

  /** Hafif silahlı (tüfekli), ateş edebilir durumdaki figürlerin dünya konumları (ayak hizası); yaralılar ve ağır silahlar hariç. */
  silahliKonumlar(): THREE.Vector3[] {
    return this.aktifler.filter((a) => a.silah && !a.agirSilah && a.hiz === 0 && a.poz !== "yarali").map((a) => a.nesne.position.clone());
  }

  /**
   * Gerçekten ateş edebilen figürlerin namlu ucu (dünya): nişan duruşunda, düşmana dönmüş, geçiş/yürüyüş/düşme dışında.
   * Namlu elde tutulan tüfekten ölçülür (çömelmiş ve yatan figürde parıltı havada 1,35 m yükseklikte çıkıyordu). Tüfeği dik
   * tutan diz çökmüş figür (nişan klibi yok) ateş etmez.
   */
  atisNoktalari(): Array<{ id: string; namlu: THREE.Vector3 }> {
    const sonuc: Array<{ id: string; namlu: THREE.Vector3 }> = [];
    if (this.dusmanAzimutu === null) return sonuc;
    const dusman = azimutYon(this.dusmanAzimutu);
    for (const a of this.aktifler) {
      if (!a.silah || a.agirSilah || a.hiz !== 0 || a.poz === "yarali" || a.asama !== "normal" || a.gecis || a.yuruyus || a.silahYerde) continue;
      if (a.eylemAtes && a.poz !== "yatmis" && !a.atesPozu) continue;
      const ileri = new THREE.Vector3(Math.sin(a.nesne.rotation.y), 0, Math.cos(a.nesne.rotation.y));
      if (ileri.dot(dusman) < 0.9) continue; // henüz dönüyor (> 25 derece)
      const olcek = a.boy / 1.8;
      let namlu: THREE.Vector3;
      const se = this.silahEkseni(a);
      if (se) namlu = se.merkez.addScaledVector(se.eksen, 0.5 * olcek).addScaledVector(se.ust, 0.03 * olcek);
      else {
        namlu = a.nesne.position.clone().addScaledVector(ileri, 0.6 * olcek);
        namlu.y += 1.35 * olcek * (1 - 0.35 * a.comelme - 0.8 * a.yatma);
      }
      sonuc.push({ id: a.id, namlu });
    }
    return sonuc;
  }
  /** Elde tutulan tüfeğin dünya uzayında gövde merkezi, namlu yönü (birim) ve "üst" yönü; tüfek yoksa null. */
  private silahEkseni(a: Aktif): { merkez: THREE.Vector3; eksen: THREE.Vector3; ust: THREE.Vector3 } | null {
    const silah = a.silahNesne;
    if (!silah || a.silahYerde) return null;
    a.nesne.updateMatrixWorld(true);
    const merkez = silah.localToWorld(a.silahMerkez.clone());
    const q = silah.getWorldQuaternion(new THREE.Quaternion());
    const eksen = new THREE.Vector3(a.silahUzunEksen === "x" ? 1 : 0, 0, a.silahUzunEksen === "z" ? 1 : 0).applyQuaternion(q).normalize();
    // Namlu yönü: kabza (sağ el) gövde merkezinin gerisindedir
    if (a.silahKemik && eksen.dot(merkez.clone().sub(a.silahKemik.getWorldPosition(new THREE.Vector3()))) < 0) eksen.negate();
    return { merkez, eksen, ust: new THREE.Vector3(0, 1, 0).applyQuaternion(q).normalize() };
  }

  /** Figür ateş etti (çatışma katmanı bildirir): ateş klibi 0,3 sn çalar. */
  atisOldu(id: string) {
    const a = this.aktifler.find((x) => x.id === id);
    if (a) a.sonAtis = this.saat;
  }

  /** Sahnedeki figürlerin duruşları (panel/HUD için). */
  pozlar(): Array<{ id: string; poz: FigurPozu }> {
    return this.aktifler.map((a) => ({ id: a.id, poz: a.poz }));
  }

  /**
   * Yüklenmekte olan figürlerin rezerve konumları (aynı anda çağrılan iki asker aynı mevziye düşmesin); figür sahneye
   * eklenince, yükleme düşünce ya da iptal edilince kalkar.
   */
  private readonly rezerveler = new Map<string, THREE.Vector3>();
  /**
   * Süren yüklemeler: kimlik → jeton. `durdur` / `temizle` ya da aynı kimlikle yeni `oynat` jetonu geçersiz kılar;
   * yükleme her await'ten sonra (model, "yanında" hedef bekleme, elde silah) denetler, geçersizse sessizce bırakır
   * (iptal hata sayılmaz, uyarı çıkmaz). Böylece sahne sıfırlamasından sonra yüklemesi biten figür (ör. 4 sn hedef
   * bekleyen sıhhiyeci) sahneye çıkmaz.
   */
  private readonly yuklemeler = new Map<string, number>();
  private jeton = 0;

  /** Tanı/hizalama: kimliğe göre aktif kayıt (silahHizalama.ts). */
  aktifBul(id: string): Aktif | undefined {
    return this.aktifler.find((a) => a.id === id);
  }

  /** Yüklenmekte olan figür sayısı (tanı). */
  get yukleniyor() {
    return this.yuklemeler.size;
  }

  private yuklemeyiBirak(id: string) {
    this.yuklemeler.delete(id);
    this.rezerveler.delete(id);
  }

  /** Verilen zemin noktasının `yaricap` m içinde figür (ya da yüklenmekte olan rezervasyon) var mı. */
  /** Arazi yeniden kurulduğunda (bölge/kip değişimi) figürleri yeni zemin yüksekliğine oturtur. */
  zemineOturt() {
    for (const a of this.aktifler) a.nesne.position.y = zeminY(a.nesne.position.x, a.nesne.position.z);
  }

  /** Sabit engel (Oda 2 sütre eşyası) denetimi; sahne3b bağlar. "Yanında" yerleşimi engelin içine düşmesin. */
  engel: (konum: THREE.Vector3) => boolean = () => false;

  doluMu(konum: THREE.Vector3, yaricap = 2.2): boolean {
    if (this.aktifler.some((a) => a.nesne.position.distanceTo(konum) < yaricap)) return true;
    for (const r of this.rezerveler.values()) if (r.distanceTo(konum) < yaricap) return true;
    return false;
  }

  /** `doluMu` gibi; kendi kimliğinin rezervasyonu ve kaydı sayılmaz, sütre eşyası (`engel`) da dolu sayılır. */
  private doluMuHaric(konum: THREE.Vector3, yaricap: number, haricId: string): boolean {
    if (this.aktifler.some((a) => a.id !== haricId && a.nesne.position.distanceTo(konum) < yaricap)) return true;
    for (const [id, r] of this.rezerveler) if (id !== haricId && r.distanceTo(konum) < yaricap) return true;
    return this.engel(konum);
  }

  /**
   * Konum doluysa en yakın boş noktaya kaydırır (yerinde): önce cephe hattı boyunca (izleyiciye teğet) ±1,4/±2,8/±4,2 m,
   * sonra derinlikte ±1,6 m ile birleşimleri; hiçbiri boş değilse olduğu gibi kalır. Yükseklik zemine oturtulur.
   */
  private bosYereKaydir(konum: THREE.Vector3, haricId: string, yaricap: number, olcek = 1) {
    if (!this.doluMuHaric(konum, yaricap, haricId)) return;
    const disari = new THREE.Vector3(konum.x, 0, konum.z).normalize();
    const teget = new THREE.Vector3(-disari.z, 0, disari.x);
    const adaylar: Array<[number, number]> = [];
    for (const derin of [0, 1.6, -1.6]) for (const yan of [1.4, -1.4, 2.8, -2.8, 4.2, -4.2]) adaylar.push([yan, derin]);
    for (const derin of [1.6, -1.6, 3.2]) adaylar.push([0, derin]);
    for (const [yan, derin] of adaylar) {
      // `olcek`: tank gibi büyük figürlerde adımlar 2,5 kat (gövde 3,5 m yarıçap)
      const p = konum.clone().addScaledVector(teget, yan * olcek).addScaledVector(disari, derin * olcek);
      if (p.lengthSq() < 2.5 * 2.5) continue; // izleyicinin dibine değil
      p.y = zeminY(p.x, p.z);
      if (!this.doluMuHaric(p, yaricap, haricId)) {
        konum.copy(p);
        return;
      }
    }
  }

  /** Tanı/test: sahnedeki figürlerin kimlik, konum ve hızı (window.duvar.figurler()). */
  konumlar(): Array<{ id: string; x: number; z: number; hiz: number; poz: FigurPozu }> {
    return this.aktifler.map((a) => ({ id: a.id, x: a.nesne.position.x, z: a.nesne.position.z, hiz: a.hiz, poz: a.poz }));
  }

  /**
   * Hareket hâlindeki figür için kaçınma (8 Kasım): hızla orantılı ileri bakışta (≥ 3,5 m; koşanda ~7 m) özgün hat üzerinde
   * (o anki sapma düşülmüş) 1,2 m yakınında duran figür ya da sütre varsa hattan yana (izleyiciye göre içe/dışa) 1,4 m
   * çıkılır; sapma zaten varsa aynı yanda kalınır (sık cephe hattında iki duran arasında hatta dönüp sonrakine çarpmasın),
   * hat boşalınca döner. `yon` birim hareket yönü, `disari` izleyiciden dışa birim vektör. Dönüş: istenen sapma (m) ya da 0.
   */
  private kacinmaSapmasi(a: Aktif, yon: THREE.Vector3, disari: THREE.Vector3): number {
    const p = a.nesne.position;
    const onBakis = Math.max(3.5, a.hiz * 1.6);
    // İleri bakıştaki figürler, özgün hatta göre yanal konumlarıyla (o anki sapma düşülmüş)
    const engeller: Array<{ ileri: number; yanHat: number; b: Aktif }> = [];
    for (const b of this.aktifler) {
      if (b === a || b.id === a.yanindaId) continue;
      const d = b.nesne.position.clone().sub(p);
      const ileri = d.dot(yon);
      if (ileri < -0.3 || ileri > onBakis) continue;
      engeller.push({ ileri, yanHat: d.dot(disari) + a.kacinma, b });
    }
    const hatta = engeller.filter((e) => Math.abs(e.yanHat) <= 1.2).sort((x, y) => x.ileri - y.ileri)[0];
    if (hatta) {
      // Aday sapma yolunda da figür olmamalı (sapmış yoldaki duran askere çarpmasın): önce tercih edilen yan, sonra öbürü,
      // sonra daha geniş dolanma
      const yolBos = (sapma: number) => !engeller.some((e) => Math.abs(e.yanHat - sapma) < 1.2);
      let tercih: number;
      if (Math.abs(a.kacinma) > 0.2) tercih = Math.sign(a.kacinma); // zaten sapmış: aynı yanda kal
      // Karşılıklı gelen iki hareketli aynı hattaysa (yan ≈ 0) ikisi de içe kaçıp çarpışırdı: kimliğe göre biri içe, öbürü dışa
      else if (hatta.b.hiz > 0 && Math.abs(hatta.yanHat) < 0.4) tercih = a.id < hatta.b.id ? -1 : 1;
      else tercih = hatta.yanHat >= 0 ? -1 : 1; // engel dışarıdaysa içten, içerideyse dıştan geç
      for (const sapma of [tercih * 1.4, -tercih * 1.4, tercih * 2.8, -tercih * 2.8]) if (yolBos(sapma)) return sapma;
      return tercih * 1.4;
    }
    // Sütre eşyası (Oda 2 kum torbası, kaya): önde duruyorsa boş olan yandan
    const on = p.clone().addScaledVector(yon, 1.6).addScaledVector(disari, -a.kacinma);
    if (this.engel(on)) {
      if (Math.abs(a.kacinma) > 0.2 && !this.engel(on.clone().addScaledVector(disari, a.kacinma))) return Math.sign(a.kacinma) * 1.5;
      if (!this.engel(on.clone().addScaledVector(disari, -1.5))) return -1.5;
      if (!this.engel(on.clone().addScaledVector(disari, 1.5))) return 1.5;
    }
    return 0;
  }

  /** Ağır silahlar (tank): namlu ucu ve yönü ile. Kule yoksa yön = düşman azimutu. */
  agirSilahlar(): AgirSilah[] {
    const sonuc: AgirSilah[] = [];
    for (const a of this.aktifler) {
      if (!a.agirSilah) continue;
      const konum = a.nesne.position.clone();
      let yon: THREE.Vector3;
      let namlu: THREE.Vector3;
      if (a.namlu) {
        a.nesne.updateMatrixWorld(true);
        const kutu = new THREE.Box3().setFromObject(a.namlu);
        const merkez = new THREE.Vector3();
        kutu.getCenter(merkez);
        // Namlu yönü: namlunun en uzun ekseni boyunca, gövde merkezinden dışa doğru
        yon = merkez.clone().sub(konum.clone().setY(merkez.y)).normalize();
        const uzunluk = kutu.getSize(new THREE.Vector3()).length() * 0.5;
        namlu = merkez.clone().addScaledVector(yon, uzunluk);
      } else {
        const az = this.dusmanAzimutu ?? 0;
        yon = new THREE.Vector3(Math.sin(radyan(az)), 0, -Math.cos(radyan(az)));
        namlu = konum.clone().addScaledVector(yon, 3.5);
        namlu.y += 2.2;
      }
      sonuc.push({ konum, namlu, yon });
    }
    return sonuc;
  }

  private kuleyiDondur(a: Aktif, dt: number) {
    if (!a.kule || !a.kuleTemel || this.dusmanAzimutu === null) return;
    // Hedef: namlu dünya yönü düşman azimutuna baksın. Kule, temel dönüşünde dünya yukarısına denk gelen yerel ekseni
    // etrafında döner (Quaternius tankta yerel z, Meshy/Blender tankta yerel y; düğüm dönüşü modelden modele değişir).
    const hedef = radyan(this.dusmanAzimutu);
    if (!a.kuleEksen) {
      a.kule.quaternion.copy(a.kuleTemel);
      a.kule.updateMatrixWorld(true);
      const yerelYukari = new THREE.Vector3(0, 1, 0).applyQuaternion(a.kule.getWorldQuaternion(new THREE.Quaternion()).invert());
      const b = [Math.abs(yerelYukari.x), Math.abs(yerelYukari.y), Math.abs(yerelYukari.z)];
      const i = b.indexOf(Math.max(...b));
      a.kuleEksen = new THREE.Vector3(i === 0 ? Math.sign(yerelYukari.x) : 0, i === 1 ? Math.sign(yerelYukari.y) : 0, i === 2 ? Math.sign(yerelYukari.z) : 0);
    }
    const eksen = a.kuleEksen;
    const deneme = (aci: number) => {
      a.kule!.quaternion.copy(a.kuleTemel!).multiply(new THREE.Quaternion().setFromAxisAngle(eksen, aci));
      a.kule!.updateMatrixWorld(true);
      const ileri = new THREE.Vector3(-1, 0, 0).applyQuaternion(a.kule!.getWorldQuaternion(new THREE.Quaternion()));
      return Math.atan2(ileri.x, -ileri.z); // sahne azimutu (rad)
    };
    const simdi = deneme(a.kuleAci);
    let fark = hedef - simdi;
    fark = Math.atan2(Math.sin(fark), Math.cos(fark));
    // İşaret: küçük bir adımın azimutu hangi yöne götürdüğünü ölç
    const sonra = deneme(a.kuleAci + 0.01);
    const isaret = Math.atan2(Math.sin(sonra - simdi), Math.cos(sonra - simdi)) >= 0 ? 1 : -1;
    a.kuleAci += isaret * fark * Math.min(1, dt * 1.5);
    deneme(a.kuleAci);
  }

  private yukle(url: string): Promise<GLTF> {
    let p = this.onbellek.get(url);
    if (!p) {
      p = this.yukleyici.loadAsync(url);
      this.onbellek.set(url, p);
    }
    return p;
  }

  /** Önbellekli model (düşman katmanı aynı GLB'yi paylaşır: bir kez iner, dokuları bir kez yüklenir). */
  modelYukle(url: string): Promise<GLTF> {
    return this.yukle(url);
  }

  /** Modeli önceden yükle (manifest okununca çağrılır; ilk gösterim gecikmesin). */
  onYukle(url: string) {
    void this.yukle(url).catch(() => undefined);
  }

  /**
   * Figürü yükleyip sahneye koyar. false: model yüklenemedi (çağıran uyarır). true: sahnede ya da yükleme iptal edildi
   * (temizle/durdur, aynı kimlikle yeni komut; hata değil).
   */
  async oynat(tanim: ModelTanimi, s: FigurSecenekleri, kok: string): Promise<boolean> {
    const url = /^(https?:|data:|blob:|\/)/.test(tanim.dosya) ? tanim.dosya : kok + tanim.dosya;
    // Aynı kimlikli figür ve süren yüklemesi gider (jetonu geçersiz olur)
    this.durdur(s.id);
    const jeton = ++this.jeton;
    this.yuklemeler.set(s.id, jeton);
    const gecerli = () => this.yuklemeler.get(s.id) === jeton;
    const onMesafe = s.mesafe ?? (s.yukseklik !== undefined ? yukseklikMesafe(s.yukseklik) : (tanim.mesafe ?? 20));
    if (!s.yaninda) this.rezerveler.set(s.id, yerKonumu(s.azimut, onMesafe));
    let gltf: GLTF;
    try {
      gltf = await this.yukle(url);
    } catch {
      if (!gecerli()) return true;
      this.yuklemeyiBirak(s.id);
      return false;
    }
    if (!gecerli()) return true;
    const nesne = iskeletKopyala(gltf.scene) as THREE.Object3D;
    iskeletleriPaylastir(nesne);
    const boya = tanim.renk ? new THREE.Color(tanim.renk) : null;
    const kopyaMalzemeler: THREE.Material[] = [];
    nesne.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
        // Ayıklama açık (§2-9): eskiden bütün figür ağları ayıklamasızdı, 30K üçgenli asker 3 duvar + gölgede 4 kez deriliyor,
        // kemik dokusu 4 kez yükleniyordu. İskeletli ağ için sınır küresi bind-poz'dan hesaplanıp ×2,5 büyütülür (yürüme,
        // yatma, kol kaldırma sığsın); sabit ağlar three'nin kendi küresiyle.
        const sm = m as THREE.SkinnedMesh;
        if (sm.isSkinnedMesh) {
          try {
            sm.computeBoundingSphere();
            if (sm.boundingSphere) sm.boundingSphere.radius *= 2.5;
            m.frustumCulled = Boolean(sm.boundingSphere);
          } catch {
            m.frustumCulled = false;
          }
        }
        if (boya) {
          // Haki boya: modelin kendi renk farklarını (koyu/açık parça) koruyarak tona çeker
          const boyaUygula = (mal: THREE.Material) => {
            const k = mal.clone() as THREE.MeshStandardMaterial;
            if (k.color) {
              const l = (k.color.r + k.color.g + k.color.b) / 3;
              k.color.copy(boya).multiplyScalar(0.55 + l * 0.9);
            }
            if ("roughness" in k) k.roughness = 0.9;
            if ("metalness" in k) k.metalness = 0.05;
            kopyaMalzemeler.push(k);
            return k;
          };
          m.material = Array.isArray(m.material) ? m.material.map(boyaUygula) : boyaUygula(m.material);
        }
      }
    });
    // Boy normalizasyonu. precise=true şart: iskeletli (skinned) modellerde kaba kutu bind-pose
    // geometrisinden gelir ve Mixamo modellerinde 100 kat yanlış çıkar.
    nesne.updateMatrixWorld(true);
    const kutu = new THREE.Box3().setFromObject(nesne, true);
    const boyut = new THREE.Vector3();
    kutu.getSize(boyut);
    const hedefBoy = (tanim.boy ?? 1.8) * (s.olcek ?? 1);
    const olcek = tanim.olcekSabit ? (s.olcek ?? 1) : boyut.y > 1e-4 ? hedefBoy / boyut.y : 1;
    const sarmal = new THREE.Group();
    sarmal.rotation.order = "YXZ"; // yaw önce, sonra zemin eğimi (egimeHizala)
    nesne.scale.setScalar(olcek);
    // Ayak tabanı y=0'a
    nesne.position.y = -kutu.min.y * olcek;
    if (s.yansit) nesne.scale.x *= -1;
    nesne.rotation.y = radyan(tanim.yonDerece ?? 0);
    if (tanim.yatik) {
      nesne.rotation.x = -Math.PI / 2;
      nesne.position.y = 0.05;
    }
    sarmal.add(nesne);

    const mesafe = s.mesafe ?? (s.yukseklik !== undefined ? yukseklikMesafe(s.yukseklik) : (tanim.mesafe ?? 20));
    sarmal.position.copy(yerKonumu(s.azimut, mesafe));
    let hiz = tanim.hiz ?? 0;
    const sola = Boolean(s.yansit);
    // Boş yer (8 Kasım): aynı yöne ikinci "Cephe kur" / art arda "Asker çağır" plansız panoramada aynı noktaya düşüyordu
    // (iç içe askerler). Nokta doluysa yana (cephe hattı boyunca) ve derinliğe en yakın boş noktaya kaydırılır.
    if (!s.yaninda) this.bosYereKaydir(sarmal.position, s.id, tanim.agirSilah ? 3.5 : 1.3, tanim.agirSilah ? 2.5 : 1);
    sarmal.rotation.y = hiz > 0 ? yanaDonus(s.azimut, sola) : izleyiciyeDonus(s.azimut);
    // Başka figürün yanına: ona 1,1 m mesafede, izleyici tarafında durur ve ona dönük (+z yüzü ona bakar)
    // Hedef figür henüz yükleniyor olabilir (açılışta köprü aktif listeyi art arda yollar): en çok 4 sn bekle
    let yanindaki = s.yaninda ? this.aktifler.find((x) => x.id === s.yaninda) : undefined;
    for (let deneme = 0; s.yaninda && !yanindaki && deneme < 40; deneme++) {
      await new Promise((r) => setTimeout(r, 100));
      // Beklerken iptal (sıfırlama, durdur, aynı kimlikle yeni komut): bekleme hemen biter
      if (!gecerli()) return true;
      yanindaki = this.aktifler.find((x) => x.id === s.yaninda);
    }
    let yanindaHedef: Aktif["yanindaHedef"] = null;
    let safhaBekliyor = false;
    if (yanindaki) {
      const hedef = yanindaki.nesne.position;
      const izleyiciYonu = new THREE.Vector3(-hedef.x, 0, -hedef.z).normalize();
      const yan = new THREE.Vector3(-izleyiciYonu.z, 0, izleyiciYonu.x).multiplyScalar(0.6);
      // Tercih: izleyici tarafında yanında; orası sütre eşyasının içindeyse öbür yan, arka, tam yanlar
      // Önce tam yan (izleyiciye göre yanal 0,8 m): sıhhiyeci yaralıyı örtmez, ikisi yan yana görünür (önceden sırtı
      // izleyiciye dönük, yaralının önündeydi); doluysa ön çaprazlar, arka çaprazlar
      // Dolu sayılır: sabit engel, başka figür (yaralının kendisi hariç) ve başka sıhhiyecinin ayırdığı müdahale yeri
      // (ateş altında siperde bekleyenlerinki dahil). Önceden yalnız sabit engele bakılıyordu: aynı yaralıya gönderilen
      // sıhhiyeciler tam aynı noktaya, iç içe yerleşiyordu (10 Kasım, kullanıcı gözlemi).
      const yerDolu = (p: THREE.Vector3) =>
        this.engel(p) ||
        this.aktifler.some((b) => b !== yanindaki && b.id !== s.id && (b.nesne.position.distanceTo(p) < 0.9 || (b.yanindaHedef !== null && b.yanindaHedef.konum.distanceTo(p) < 0.9))) ||
        [...this.rezerveler].some(([id, k]) => id !== s.id && k.distanceTo(p) < 0.9);
      const adaylar: Array<[number, number]> = [[0, 1.35], [0, -1.35], [0.9, 1], [0.9, -1], [-0.9, 1], [-0.9, -1], [1.3, 0], [-1.3, 0], [0, 2.9], [0, -2.9], [1.6, 2], [1.6, -2]];
      for (const [ileri, yana] of adaylar) {
        sarmal.position.copy(hedef).addScaledVector(izleyiciYonu, ileri).addScaledVector(yan, yana);
        if (!yerDolu(sarmal.position)) break;
      }
      sarmal.position.y = zeminY(sarmal.position.x, sarmal.position.z);
      const d = hedef.clone().sub(sarmal.position);
      sarmal.rotation.y = Math.atan2(d.x, d.z);
      yanindaHedef = { konum: sarmal.position.clone(), donus: sarmal.rotation.y };
      // TCCC "ateş altında bakım": sıhhiyeci açıkta müdahaleye gitmez; yaralıdan izleyiciye doğru ~4,5 m geride (siper
      // tarafı) diz çöküp bekler, taktik sahaya geçince yürür (safhaAyarla). Doktrin: CUF'ta yalnız turnike, siperde.
      if (this.safha === "ates_altinda") {
        const uzaklik = Math.hypot(hedef.x, hedef.z);
        const geri = Math.min(4.5, Math.max(0, uzaklik - 2.5));
        // Bekleme yeri de paylaşılmaz: doluysa yana 1,2 m aralıkla dizilirler
        for (const yana of [0, 2, -2, 4, -4, 6]) {
          sarmal.position.copy(hedef).addScaledVector(izleyiciYonu, geri).addScaledVector(yan, yana);
          if (!yerDolu(sarmal.position)) break;
        }
        sarmal.position.y = zeminY(sarmal.position.x, sarmal.position.z);
        const d2 = hedef.clone().sub(sarmal.position);
        sarmal.rotation.y = Math.atan2(d2.x, d2.z);
        safhaBekliyor = true;
      }
    }

    let karistirici: THREE.AnimationMixer | null = null;
    let eylemBekle: THREE.AnimationAction | null = null;
    let eylemAtes: THREE.AnimationAction | null = null;
    let eylemAtesUst: THREE.AnimationAction | null = null;
    let eylemVurulma: THREE.AnimationAction | null = null;
    let eylemDusme: THREE.AnimationAction | null = null;
    const eylemPoz: Aktif["eylemPoz"] = {};
    const dusmeAdaylari: THREE.AnimationAction[] = [];
    let eylemComelmisNisan: THREE.AnimationAction | null = null;
    let kalca: THREE.Object3D | null = null;
    nesne.traverse((o) => {
      if (!kalca && (o as THREE.Bone).isBone && /hips$/i.test(o.name)) kalca = o;
    });
    const kalcaBoy = kalca ? (kalca as THREE.Object3D).position.length() : 0;
    let silahUzunEksen: "x" | "z" = "z";
    const silahMerkez = new THREE.Vector3();
    const animasyonlar = gltf.animations ?? [];
    if (animasyonlar.length && tanim.animasyon !== "yok") {
      const klip = klipBul(animasyonlar, tanim.animasyon) ?? animasyonlar[0];
      karistirici = new THREE.AnimationMixer(nesne);
      eylemBekle = karistirici.clipAction(klip);
      const dongu = s.dongu ?? tanim.dongu ?? true;
      eylemBekle.setLoop(dongu ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      eylemBekle.clampWhenFinished = true;
      eylemBekle.play();
      // Bekleme varyasyonu (§4-8): rastgele faz ve ±%5 hız; aynı anda çağrılan askerler eşzamanlı nefes almasın ("klon ordusu")
      if (dongu) {
        eylemBekle.time = rastgele() * klip.duration;
        eylemBekle.timeScale = 0.95 + rastgele() * 0.1;
      }
      // Hareketli figür: hız klibin doğal hızına uyar (ayak kayması yok)
      if (hiz > 0) {
        const uyum = hareketUyumu(klip.name, hiz, hedefBoy);
        hiz = uyum.hiz;
        eylemBekle.timeScale = uyum.zamanOlcegi;
      }
      const atesKlip = klipBul(animasyonlar, tanim.animasyonlar?.ates);
      if (atesKlip) {
        eylemAtes = karistirici.clipAction(atesKlip);
        eylemAtes.setLoop(THREE.LoopRepeat, Infinity);
        eylemAtes.timeScale = 0.9 + rastgele() * 0.2;
        const ust = ustGovdeKlibi(atesKlip);
        if (ust) {
          eylemAtesUst = karistirici.clipAction(ust);
          eylemAtesUst.setLoop(THREE.LoopRepeat, Infinity);
          eylemAtesUst.timeScale = eylemAtes.timeScale;
        }
      }
      const tekSefer = (ad: string | undefined) => {
        const k = klipBul(animasyonlar, ad);
        if (!k || !karistirici) return null;
        const e = karistirici.clipAction(k);
        e.setLoop(THREE.LoopOnce, 1);
        e.clampWhenFinished = true;
        return e;
      };
      eylemVurulma = tekSefer(tanim.animasyonlar?.vurulma);
      eylemDusme = tekSefer(tanim.animasyonlar?.dusme);
      if (eylemDusme) {
        dusmeAdaylari.push(eylemDusme);
        for (const ad of DUSME_CESITLERI) {
          const e = tekSefer(ad);
          if (e && !dusmeAdaylari.includes(e)) dusmeAdaylari.push(e);
        }
      }
      for (const ad of COMELMIS_NISAN_KLIPLERI) {
        const k = klipBul(animasyonlar, ad);
        if (!k || eylemComelmisNisan) continue;
        eylemComelmisNisan = karistirici.clipAction(k);
        eylemComelmisNisan.setLoop(THREE.LoopRepeat, Infinity);
      }
      for (const poz of ["comelmis", "yatmis"] as const) {
        const k = klipBul(animasyonlar, tanim.animasyonlar?.[poz]);
        if (!k) continue;
        const e = karistirici.clipAction(k);
        e.setLoop(THREE.LoopRepeat, Infinity);
        eylemPoz[poz] = e;
      }
    }
    // Prosedürel duruş kemikleri (ad: manifest → varsayılan; GLTFLoader nokta/boşluğu sildiği için iki biçim)
    const kemikler: Partial<Record<KemikRolu, THREE.Object3D>> = {};
    for (const rol of Object.keys(VARSAYILAN_KEMIKLER) as KemikRolu[]) {
      const ad = tanim.kemikler?.[rol] ?? VARSAYILAN_KEMIKLER[rol];
      const k = nesne.getObjectByName(ad) ?? nesne.getObjectByName(ad.replace(/[^\w]/g, ""));
      if (k) kemikler[rol] = k;
    }
    // Elde silah: kemiğe bağla, metre cinsinden konum/boy → kemik yerel birimine çevir
    let silahNesne: THREE.Object3D | null = null;
    let silahKemik: THREE.Object3D | null = null;
    let silahTemel: Aktif["silahTemel"] = null;
    if (tanim.silahModeli) {
      const sm = tanim.silahModeli;
      const silahUrl = /^(https?:|data:|blob:|\/)/.test(sm.dosya) ? sm.dosya : kok + sm.dosya;
      // GLTFLoader düğüm adlarındaki nokta/boşluğu siler ("Wrist.R" → "WristR"); iki biçimi de dene
      const kemik = nesne.getObjectByName(sm.kemik) ?? nesne.getObjectByName(sm.kemik.replace(/[^\w]/g, ""));
      const silahGltf = await this.yukle(silahUrl).catch(() => null);
      if (!gecerli()) return true;
      if (kemik && silahGltf) {
        const silah = silahGltf.scene.clone(true);
        silah.updateMatrixWorld(true);
        const silahKutu = new THREE.Box3().setFromObject(silah);
        const kendiBoy = silahKutu.getSize(new THREE.Vector3());
        silahKutu.getCenter(silahMerkez);
        const enUzun = Math.max(kendiBoy.x, kendiBoy.y, kendiBoy.z) || 1;
        silahUzunEksen = kendiBoy.x > kendiBoy.z ? "x" : "z";
        nesne.updateMatrixWorld(true);
        const kemikOlcek = kemik.getWorldScale(new THREE.Vector3()).x || 1; // nesne-uzayında kemik ölçeği
        const hedefBoy = (sm.boy ?? 0.85) / olcek; // nesne-uzayında metre
        silah.scale.setScalar(hedefBoy / enUzun / kemikOlcek);
        const k = sm.konum ?? [0, 0, 0];
        silah.position.set(k[0] / olcek / kemikOlcek, k[1] / olcek / kemikOlcek, k[2] / olcek / kemikOlcek);
        const d = sm.donus ?? [0, 0, 0];
        silah.rotation.set(radyan(d[0]), radyan(d[1]), radyan(d[2]));
        silah.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) m.castShadow = true;
        });
        kemik.add(silah);
        silahNesne = silah;
        silahKemik = kemik;
        silahTemel = { konum: silah.position.clone(), donus: silah.quaternion.clone(), olcek: silah.scale.clone() };
      }
    }
    // Kule / namlu: namlu kuleye bağlanır (dünya dönüşümü korunarak), kule düşmana döner
    let kule: THREE.Object3D | null = null;
    let namlu: THREE.Object3D | null = null;
    if (tanim.kule) {
      kule = nesne.getObjectByName(tanim.kule) ?? null;
      if (tanim.namlu) namlu = nesne.getObjectByName(tanim.namlu) ?? null;
      if (kule && namlu && namlu.parent !== kule) {
        nesne.updateMatrixWorld(true);
        kule.attach(namlu);
      }
    }
    // Son denetim: sahneye yalnız geçerli yükleme girer; rezervasyon kalkar, konum artık aktif listede
    if (!gecerli()) return true;
    this.yuklemeyiBirak(s.id);
    this.grup.add(sarmal);
    const aktif: Aktif = {
      id: s.id,
      nesne: sarmal,
      karistirici,
      klipler: animasyonlar,
      hiz,
      sola,
      bitti: false,
      silah: Boolean(tanim.silah),
      temelDonus: sarmal.rotation.y,
      yaninda: Boolean(yanindaki),
      agirSilah: Boolean(tanim.agirSilah),
      kule,
      kuleTemel: kule ? kule.quaternion.clone() : null,
      namlu,
      kuleAci: 0,
      eylemBekle,
      eylemAtes,
      atesPozu: false,
      poz: "ayakta",
      asama: "normal",
      eylemVurulma,
      eylemDusme,
      eylemPoz,
      aktifPoz: null,
      kemikler,
      kemikTemel: new Map(),
      kemikTemelKonum: new Map(),
      silahNesne,
      silahKemik,
      silahTemel,
      silahYerde: false,
      icNesne: nesne,
      tabanY: nesne.position.y,
      boy: hedefBoy,
      comelme: 0,
      yatma: 0,
      zaman: rastgele() * 10,
      sonrakiYardim: 2 + rastgele() * 4,
      azimut: s.azimut,
      bakisYaw: 0,
      bakisPitch: 0,
      yanindaId: yanindaki ? yanindaki.id : null,
      gecis: null,
      safhaBekliyor,
      yanindaHedef,
      yuruyus: null,
      egik: 0,
      sicrama: { sonraki: 0, kosuyor: false },
      kopyaMalzemeler,
      tepki: null,
      atesGecikmesi: null,
      eylemAtesUst,
      katmanAktif: false,
      egimX: 0,
      egimZ: 0,
      kacinma: 0,
      kacinmaHedef: 0,
      hatYaricapi: Math.hypot(sarmal.position.x, sarmal.position.z),
      kalca,
      kalcaBoy,
      dusmeAdaylari,
      eylemComelmisNisan,
      donusHedef: null,
      sonDusman: null,
      sonAtis: -10,
      silahUzunEksen,
      silahMerkez,
      solKol: (() => {
        const bul = (re: RegExp) => {
          let b: THREE.Object3D | null = null;
          nesne.traverse((o) => {
            if (!b && (o as THREE.Bone).isBone && re.test(o.name)) b = o;
          });
          return b as THREE.Object3D | null;
        };
        const ust = bul(/left_?arm$/i);
        const on = bul(/left_?fore_?arm$/i);
        const el = bul(/left_?hand$/i);
        return ust && on && el ? { ust, on, el } : null;
      })(),
      solElAgirlik: 0,
      siper: null,
      kenaraCekilme: -100,
      mudahale: (() => {
        if (!yanindaki || !karistirici || !eylemBekle) return null;
        const kisaAd = (eylemBekle.getClip().name.split(/[|/]/).pop() ?? "").trim();
        if (kisaAd !== MUDAHALE_KLIPLERI.isaret) return null;
        const bekleKlip = klipBul(animasyonlar, MUDAHALE_KLIPLERI.bekle);
        const calisKlip = klipBul(animasyonlar, MUDAHALE_KLIPLERI.calis);
        if (!bekleKlip || !calisKlip) return null;
        const bekle = karistirici.clipAction(bekleKlip);
        const calis = karistirici.clipAction(calisKlip);
        bekle.setLoop(THREE.LoopRepeat, Infinity);
        calis.setLoop(THREE.LoopRepeat, Infinity);
        calis.timeScale = MUDAHALE_CALISMA_HIZI;
        return { eylemler: { bekle, calis, isaret: eylemBekle }, durum: "bekle" as MudahaleDurumu, simdiki: null, bitis: 0, tur: 0, calisma: 0, isaret: 0, giris: 0 };
      })(),
    };
    // Tek seferlik klipler bitince sonraki aşama: vurulma → düşme → yerde
    karistirici?.addEventListener("finished", (olay) => {
      const e = (olay as unknown as { action: THREE.AnimationAction }).action;
      if (aktif.asama === "vuruluyor" && e === aktif.eylemVurulma) this.dusmeyeBasla(aktif);
      else if (aktif.asama === "dusuyor" && e === aktif.eylemDusme) this.yereDustu(aktif);
      else if (aktif.gecis && e === aktif.gecis.eylem) this.gecisBitti(aktif);
    });
    this.aktifler.push(aktif);
    const baslangicPozu = s.poz ?? tanim.poz ?? "ayakta";
    if (safhaBekliyor) this.pozUygula(aktif, "comelmis", true);
    else if (baslangicPozu !== "ayakta") this.pozUygula(aktif, baslangicPozu, true);
    return true;
  }

  /** Geçiş klibi (varsa): "önceki>yeni" anahtarına göre modelin klipleri arasında ilk bulunan. */
  private gecisKlibi(a: Aktif, onceki: FigurPozu, yeni: FigurPozu): THREE.AnimationClip | null {
    const adaylar = GECIS_KLIPLERI[`${onceki}>${yeni}`];
    if (!adaylar || !a.karistirici) return null;
    for (const ad of adaylar) {
      const k = klipBul(a.klipler, ad);
      if (k) return k;
    }
    return null;
  }

  /** Geçiş klibi bitti: hedef döngüye kısa çapraz geçiş. */
  private gecisBitti(a: Aktif) {
    const g = a.gecis;
    if (!g) return;
    a.gecis = null;
    g.hedef.reset().setEffectiveWeight(1).play();
    g.eylem.crossFadeTo(g.hedef, 0.25, false);
    // Nişan/ateş duruşuna dönüş bu çapraz geçiş bittikten sonra (pozuGuncelle): hemen ardından ikinci bir çapraz geçiş
    // başlarsa ağırlıklar üst üste biner, kalça ve el tek karede sıçrar (yerden kalkıp ateşe dönen askerde ölçüldü)
    a.atesGecikmesi = Math.max(a.atesGecikmesi ?? 0, this.saat + 0.3);
  }

  /** Hedefe yürüyüş başlat (safha geçişi): yürüyüş klibi varsa çapraz geç; duruş klipleri ve prosedürel ofsetler kapanır. */
  private yuruyusBaslat(a: Aktif, hedef: THREE.Vector3, donus: number, kosu = false) {
    this.mudahaleyiBirak(a);
    let eylem: THREE.AnimationAction | null = null;
    const istenen = kosu ? KOSU_HIZI : YURUYUS_HIZI;
    let hiz = istenen;
    if (a.karistirici) {
      for (const ad of kosu ? [...KOSU_KLIPLERI, ...YURUYUS_KLIPLERI] : YURUYUS_KLIPLERI) {
        const k = klipBul(a.klipler, ad);
        if (!k) continue;
        eylem = a.karistirici.clipAction(k);
        eylem.setLoop(THREE.LoopRepeat, Infinity);
        const uyum = hareketUyumu(k.name, istenen, a.boy);
        hiz = uyum.hiz;
        eylem.timeScale = uyum.zamanOlcegi;
        break;
      }
    }
    const kaynak = a.gecis?.eylem ?? a.aktifPoz ?? (a.atesPozu ? a.eylemAtes : a.eylemBekle);
    a.gecis = null;
    if (eylem) {
      eylem.reset().setEffectiveWeight(1).play();
      if (kaynak && kaynak !== eylem) kaynak.crossFadeTo(eylem, 0.3, false);
    }
    a.aktifPoz = null;
    a.atesPozu = false;
    a.poz = "ayakta";
    a.comelme = 0;
    a.yatma = 0;
    a.donusHedef = null;
    a.yuruyus = { hedef: hedef.clone(), donus, eylem, hiz };
  }

  /** Yürüyüşü ilerlet; varınca hedef yöne dönüp bekleme klibine (sıhhiyeci: müdahale) geçer. */
  private yuruyusuGuncelle(a: Aktif, dt: number) {
    const y = a.yuruyus;
    if (!y) return;
    const d = y.hedef.clone().sub(a.nesne.position);
    d.y = 0;
    const uzaklik = d.length();
    if (uzaklik < 0.05) {
      a.nesne.position.copy(y.hedef);
      a.nesne.position.y = zeminY(y.hedef.x, y.hedef.z);
      a.donusHedef = y.donus; // ani dönmez: guncelle() yumuşak döndürür (önceden tek karede 500 derece/sn sıçrama)
      if (y.eylem && a.eylemBekle) {
        a.eylemBekle.reset().setEffectiveWeight(1).play();
        // Sıhhiyeci ayakta yürüyüşten diz çökmeye iner (kalça 0,5 m): 0,3 sn'de çöküş sıçrama gibiydi
        y.eylem.crossFadeTo(a.eylemBekle, a.mudahale ? 0.7 : 0.3, false);
        // Nişana dönüş koşu → bekleme geçişi bitince (bkz. gecisBitti)
        a.atesGecikmesi = Math.max(a.atesGecikmesi ?? 0, this.saat + 0.38);
      }
      a.yuruyus = null;
      return;
    }
    // Sipere dalış (mevzi değiştirme koşusu): son 1,1 m'de koşudan doğrudan diz çökmeye geçer, yavaşlayarak mevziye
    // kayar; siper kararı o anda verilir (sütre arkasıysa inip kalkar; açıktaysa diz çöker, yere yatar ya da ayakta
    // varır). Önceden mevziye dimdik varıp bir iki saniye sonra çöküyordu.
    if (a.sicrama.kosuyor && !y.inis && uzaklik < 1.1) {
      y.inis = true;
      const zar = rastgele();
      const mod = this.sutreArkasinda(a, y.hedef) ? "inKalk" : zar < 0.45 ? "diz" : zar < 0.75 && a.eylemPoz.yatmis ? "yat" : "ayakta";
      if (mod !== "ayakta" && a.eylemPoz.comelmis && a.siper?.mod !== "elle") {
        const kosu = y.eylem;
        y.eylem = null; // varışta bekleme klibine geçilmez: diz çökme geçişi sürüyor
        this.pozUygula(a, "comelmis", false, kosu);
        a.siper = { mod, sonraki: mod === "inKalk" ? this.saat + 3 + rastgele() * 4 : mod === "yat" ? this.saat + 1.5 : Infinity, otoComeldi: true };
      }
    }
    const adim = Math.min(uzaklik, y.hiz * (y.inis ? Math.max(0.3, uzaklik / 1.1) : 1) * dt);
    d.normalize();
    // Yolda başka figür/sütre varsa yana dolanır (hedefin kendisi hariç; yanındaId hedef figürdür)
    const yanEksen = new THREE.Vector3(-d.z, 0, d.x);
    // Mevzi değiştirme koşusunda dolanma yok: yol önceden figür ve engelden açık seçildi (yolAcik)
    const sapma = uzaklik > 1.2 && !a.sicrama.kosuyor ? this.kacinmaSapmasi(a, d, yanEksen) : 0;
    if (sapma !== 0) d.addScaledVector(yanEksen, sapma * 0.6).normalize();
    a.nesne.position.addScaledVector(d, adim);
    a.nesne.position.y = zeminY(a.nesne.position.x, a.nesne.position.z);
    const hedefYaw = Math.atan2(d.x, d.z);
    let fark = hedefYaw - a.nesne.rotation.y;
    fark = Math.atan2(Math.sin(fark), Math.cos(fark));
    const enCok = radyan(240) * dt;
    a.nesne.rotation.y += Math.max(-enCok, Math.min(enCok, fark * Math.min(1, dt * 6)));
  }

  /** Hedef yaw yönüne yumuşak ve hız sınırlı dönüş (derece/sn); hedefe vardıysa true. */
  private yumusakDon(a: Aktif, hedef: number, dt: number, kazanc: number, enCokDereceSn: number): boolean {
    let fark = hedef - a.nesne.rotation.y;
    fark = Math.atan2(Math.sin(fark), Math.cos(fark));
    const enCok = radyan(enCokDereceSn) * dt;
    a.nesne.rotation.y += Math.max(-enCok, Math.min(enCok, fark * Math.min(1, dt * kazanc)));
    return Math.abs(fark) < 0.01;
  }

  /**
   * Bakış hedefi (dünya): sıhhiyeci/yanındaki her zaman hedef figüre; silahlı figür çatışmada düşman yönüne (80 m);
   * yoksa 12 m içindeki yaralıya; yoksa 4 sn içindeki son patlamaya; yoksa null (yüz yönüne döner).
   */
  private bakisHedefi(a: Aktif): THREE.Vector3 | null {
    if (a.yanindaId) {
      const y = this.aktifler.find((x) => x.id === a.yanindaId);
      if (y) return y.nesne.position.clone().setY(y.nesne.position.y + 0.4);
    }
    if (this.dusmanAzimutu !== null && a.silah && !a.yaninda) return yerKonumu(this.dusmanAzimutu, 80).setY(1.5);
    const yarali = this.aktifler.find((x) => x !== a && x.poz === "yarali" && x.nesne.position.distanceTo(a.nesne.position) < 12);
    if (yarali) return yarali.nesne.position.clone().setY(yarali.nesne.position.y + 0.4);
    if (this.sonPatlama && this.saat - this.sonPatlama.zaman < 4) return this.sonPatlama.konum.clone().setY(this.sonPatlama.konum.y + 2);
    return null;
  }

  /**
   * Bakışı uygula (karıştırıcı ve duruştan SONRA): göğüs yaw'ın %35'i, baş %65'i dünya yukarı ekseninde; pitch yalnız
   * başta, yaw'la döndürülmüş sağ eksen etrafında. Kemik temelleri kaydedilir, kare başında geri yüklenir (durusuUygula
   * ile aynı düzen). Yaralı / düşerken / ağır silahta bakış yok (ofset sıfıra yumuşar).
   */
  private bakisiUygula(a: Aktif, dt: number) {
    let istenen = { yaw: 0, pitch: 0 };
    if (a.poz !== "yarali" && a.asama === "normal" && !a.agirSilah) {
      const hedef = this.bakisHedefi(a);
      if (hedef) {
        const goz = a.nesne.position.clone();
        goz.y += a.boy * (0.9 - 0.25 * a.comelme - 0.6 * a.yatma);
        istenen = bakisAcilari(goz, a.nesne.rotation.y, hedef);
      } else if (a.karistirici && a.hiz === 0 && !a.yuruyus && !a.gecis && a.kemikler.bas) {
        // Hedef yokken çevreyi kollar: ~37 sn'lik döngünün yarısında baş ±20° ağır ağır gezinir (figür başına ayrı faz)
        const pencere = Math.max(0, Math.sin(a.zaman * 0.17));
        istenen = { yaw: pencere * pencere * 0.35 * Math.sin(a.zaman * 0.45), pitch: 0 };
      }
    }
    a.bakisYaw = yumusat(a.bakisYaw, istenen.yaw, dt);
    a.bakisPitch = yumusat(a.bakisPitch, istenen.pitch, dt);
    if (Math.abs(a.bakisYaw) < 0.004 && Math.abs(a.bakisPitch) < 0.004) return;
    const k = a.kemikler;
    const yukari = new THREE.Vector3(0, 1, 0);
    const dondur = (kemik: THREE.Object3D | undefined, eksen: THREE.Vector3, aci: number) => {
      if (!kemik || Math.abs(aci) < 1e-5) return;
      if (!a.kemikTemel.has(kemik)) a.kemikTemel.set(kemik, kemik.quaternion.clone());
      dunyaEkseniEtrafindaDondur(kemik, eksen, aci);
    };
    a.nesne.updateMatrixWorld(true);
    dondur(k.gogus, yukari, a.bakisYaw * 0.35);
    dondur(k.bas, yukari, a.bakisYaw * 0.65);
    const sag = new THREE.Vector3(1, 0, 0).applyQuaternion(a.nesne.getWorldQuaternion(new THREE.Quaternion())).applyAxisAngle(yukari, a.bakisYaw).normalize();
    dondur(k.bas, sag, -a.bakisPitch);
  }

  /**
   * Destek eli (sol) tüfeğe oturt: iki kemikli IK. Tüfek sağ ele ölçülmüş sabit dönüşümle bağlıdır; Mixamo kliplerinde
   * (özellikle "Firing Rifle", "Rifle Run") sol el kundağın 20–27 cm altında açıkta kalıyordu. Hedef: tüfeğin uzun ekseni
   * üzerinde, gövde merkezinden namluya doğru 20 cm, 6 cm altı (el kundağı). Yalnız el zaten yakınsa (≤ 32 cm) ve figür
   * normal duruştayken uygulanır; ağırlık yumuşak açılıp kapanır (el sallama, bomba atma, düşme, geçiş kliplerinde kapalı).
   */
  private solEliOturt(a: Aktif, dt: number) {
    const kol = a.solKol;
    const silah = a.silahNesne;
    if (!kol || !silah) return;
    let istenen = 0;
    let hedef: THREE.Vector3 | null = null;
    const se = a.asama === "normal" && a.poz !== "yarali" && !a.gecis ? this.silahEkseni(a) : null;
    if (se) {
      const olcek = a.boy / 1.8;
      // Hedef bilektir: parmaklar ~15 cm öne uzanır, bu yüzden bilek merkezin 9 cm önünde, 8 cm altında (20 cm'de açık el
      // namlunun önüne taşıyordu)
      hedef = se.merkez.addScaledVector(se.eksen, 0.09 * olcek).addScaledVector(se.ust, -0.08 * olcek);
      const el = kol.el.getWorldPosition(new THREE.Vector3());
      if (el.distanceTo(hedef) < 0.32 * olcek) istenen = 1;
    }
    a.solElAgirlik += Math.sign(istenen - a.solElAgirlik) * Math.min(Math.abs(istenen - a.solElAgirlik), dt / 0.25);
    const w = a.solElAgirlik;
    if (w <= 0.001 || !hedef) return;
    const kaydet = (k: THREE.Object3D) => {
      if (!a.kemikTemel.has(k)) a.kemikTemel.set(k, k.quaternion.clone());
    };
    const pa = kol.ust.getWorldPosition(new THREE.Vector3());
    const pb = kol.on.getWorldPosition(new THREE.Vector3());
    const pc = kol.el.getWorldPosition(new THREE.Vector3());
    const lab = pa.distanceTo(pb);
    const lbc = pb.distanceTo(pc);
    if (lab < 1e-4 || lbc < 1e-4) return;
    // Ağırlıklı hedef: elin şimdiki yeri → kundak
    const t = pc.clone().lerp(hedef, w);
    const uzaklik = Math.min(pa.distanceTo(t), (lab + lbc) * 0.999);
    // 1) Dirsek açısı: |omuz–bilek| hedef uzaklığa eşit olsun
    const ba = pa.clone().sub(pb).normalize();
    const bc = pc.clone().sub(pb).normalize();
    const simdiki = Math.acos(Math.max(-1, Math.min(1, ba.dot(bc))));
    const gereken = Math.acos(Math.max(-1, Math.min(1, (lab * lab + lbc * lbc - uzaklik * uzaklik) / (2 * lab * lbc))));
    const dirsekEkseni = new THREE.Vector3().crossVectors(bc, ba);
    if (dirsekEkseni.lengthSq() > 1e-8) {
      kaydet(kol.on);
      dunyaEkseniEtrafindaDondur(kol.on, dirsekEkseni.normalize(), simdiki - gereken);
    }
    // 2) Omuz: bilek hedefe baksın
    kol.el.getWorldPosition(pc);
    const ac = pc.clone().sub(pa).normalize();
    const at = t.clone().sub(pa).normalize();
    const omuzEkseni = new THREE.Vector3().crossVectors(ac, at);
    if (omuzEkseni.lengthSq() > 1e-10) {
      kaydet(kol.ust);
      dunyaEkseniEtrafindaDondur(kol.ust, omuzEkseni.normalize(), Math.acos(Math.max(-1, Math.min(1, ac.dot(at)))));
    }
  }

  /**
   * Yol açık mı: düz hat ve iki yanındaki 0,35 m'lik paralellerde (omuz genişliğinde koridor; uçların 0,7 m'si hariç)
   * sabit engel (sütre, bina, araç, yıkılabilir duvar, dere) yok; `haric` dışındaki figürler hattan ≥ 1 m uzakta
   * (koşan asker kimsenin içinden geçmez, dolanmak zorunda kalmaz: dolanırken kum torbasına sürtünüyordu).
   */
  private yolAcik(bas: THREE.Vector3, son: THREE.Vector3, haric?: Aktif): boolean {
    const d = son.clone().sub(bas);
    d.y = 0;
    const uzunluk = d.length();
    if (uzunluk < 1.5) return true;
    d.multiplyScalar(1 / uzunluk);
    for (const b of this.aktifler) {
      if (b === haric) continue;
      const bx = b.nesne.position.x - bas.x;
      const bz = b.nesne.position.z - bas.z;
      const ileri = Math.max(0, Math.min(uzunluk, bx * d.x + bz * d.z));
      if (Math.hypot(bx - d.x * ileri, bz - d.z * ileri) < 1) return false;
    }
    const p = new THREE.Vector3();
    for (let m = 0.7; m <= uzunluk - 0.7; m += 0.4) {
      for (const yan of [0, 0.35, -0.35]) {
        p.copy(bas).addScaledVector(d, m);
        p.x += -d.z * yan;
        p.z += d.x * yan;
        if (this.engel(p)) return false;
      }
    }
    return true;
  }

  /**
   * Mevzi değiştirme ("ateş ve hareket"): çatışmada asker hep aynı yerde inip kalkmasın. Figür başına 14–34 sn'de bir
   * (ilk kez 6–22 sn sonra) asker bulunduğu yerden 2–9 m ötedeki boş bir mevziye koşar (Rifle Run, ≈ 3,2 m/sn; diz
   * çökmüşse koşuya 0,3 sn'de doğrularak geçer), varınca düşmana döner ve siper kararını orada yeniden verir (sütre
   * arkasıysa çöküp doğrulur, açıktaysa diz çöker / ayakta kalır). Kurallar: aynı anda tek asker koşar ve iki sıçrama
   * arası ≥ 4,5 sn (birlik kademeli hareket eder, biri koşarken ötekiler ateş eder); yolu sabit engelden geçen mevzi
   * seçilmez; yatan asker önce ayağa kalkar; yaralı, sıhhiyeci, ağır silah, eğitmenin duruş verdiği figür yerinde kalır.
   */
  private sicramayiGuncelle(a: Aktif) {
    const s = a.sicrama;
    if (s.kosuyor) {
      if (a.yuruyus) return;
      // Vardı (ya da yürüyüşü başka bir şey kesti): siper kararı yeni yerde baştan
      s.kosuyor = false;
      s.sonraki = this.saat + SICRAMA_ARALIGI[0] + rastgele() * (SICRAMA_ARALIGI[1] - SICRAMA_ARALIGI[0]);
      a.azimut = konumAzimutu(a.nesne.position);
      // Siper kararı dalışta verildiyse (çökmüş vardı) kalır; ayakta vardıysa yerinde yeniden verilir
      if (a.siper?.mod !== "elle" && a.poz === "ayakta") a.siper = null;
      this.konumOlayi?.(a.id, a.azimut);
      return;
    }
    const tehdit = this.dusmanAzimutu !== null && this.siperAl && this.mevziDegistir && this.mevziAdaylari !== null;
    const uygun = a.silah && !a.agirSilah && a.hiz === 0 && !a.yaninda && a.poz !== "yarali" && a.asama === "normal" && a.siper?.mod !== "elle";
    if (!tehdit) {
      s.sonraki = 0;
      return;
    }
    if (!uygun || a.yuruyus) return;
    // Duruş geçişi sürerken (diz çöküyor, yerden kalkıyor) koşu başlamaz; geçiş bittikten 0,45 sn sonra (kalkış klibi
    // biter bitmez koşuya geçince sol el tek karede 15 m/sn sıçrıyordu)
    if (a.gecis) {
      if (s.sonraki !== 0) s.sonraki = Math.max(s.sonraki, this.saat + 0.45);
      return;
    }
    if (s.sonraki === 0) {
      s.sonraki = this.saat + SICRAMA_ILK[0] + rastgele() * (SICRAMA_ILK[1] - SICRAMA_ILK[0]);
      return;
    }
    if (this.saat < s.sonraki) return;
    // Kademeli: başka asker koşarken ya da az önce sıçramışken bekle (kısa süre sonra yeniden dene)
    if (this.saat - this.sonSicrama < SICRAMA_ARASI || this.aktifler.some((b) => b.sicrama.kosuyor)) {
      s.sonraki = this.saat + 1 + rastgele() * 2;
      return;
    }
    const adaylar = this.mevziAdaylari!(a.nesne.position, a.id).filter((p) => this.yolAcik(a.nesne.position, p, a));
    if (!adaylar.length) {
      s.sonraki = this.saat + 8 + rastgele() * 8;
      // Sıçramak için kalkmış ama gidecek yer kalmamışsa siper kararını yerinde yeniden verir
      if (a.poz === "ayakta" && a.siper && a.siper.mod !== "elle") a.siper = null;
      return;
    }
    if (a.poz === "yatmis") {
      // Yatan asker önce kalkar (geçiş klibi, ~4 sn); kalkınca hemen koşar. Yoksa yere yatan bir daha kalkmaz, zamanla
      // bütün birlik yatıp kalırdı
      this.sonSicrama = this.saat;
      s.sonraki = this.saat;
      this.pozUygula(a, "ayakta", false);
      return;
    }
    const hedef = adaylar[Math.floor(rastgele() * adaylar.length)];
    hedef.y = zeminY(hedef.x, hedef.z);
    this.sonSicrama = this.saat;
    s.kosuyor = true;
    if (a.siper?.mod !== "elle") a.siper = null;
    // Varınca düşmana dönük (guncelle'deki düşmana dönüş zaten sürdürür)
    this.yuruyusBaslat(a, hedef, Math.PI - radyan(this.dusmanAzimutu!), true);
  }

  /** Panel komutu: figürün duruşunu değiştir (vuruldu → yere düşer; diz çök; ayağa kalk). */
  pozAyarla(id: string, poz: FigurPozu) {
    const a = this.aktifler.find((x) => x.id === id);
    if (!a) return;
    // Koşarken duruş komutu (vuruldu, diz çök…): koşu orada biter
    if (a.yuruyus && a.sicrama.kosuyor) {
      a.yuruyus.eylem?.fadeOut(0.2);
      a.yuruyus = null;
    }
    // Eğitmen duruş verdi: çatışma bitene dek siper davranışı bu figüre karışmaz
    if (this.dusmanAzimutu !== null && poz !== "yarali") a.siper = { mod: "elle", sonraki: Infinity, otoComeldi: false };
    this.pozUygula(a, poz, false);
  }

  /** Figürden düşman yönüne 0,6–2,4 m içinde sabit engel (bariyer, kum torbası, HESCO, duvar) var mı? */
  private sutreArkasinda(a: Aktif, konum: THREE.Vector3 = a.nesne.position): boolean {
    if (this.dusmanAzimutu === null) return false;
    const yon = azimutYon(this.dusmanAzimutu);
    for (let d = 0.6; d <= 2.4; d += 0.3) if (this.engel(konum.clone().addScaledVector(yon, d))) return true;
    return false;
  }

  /**
   * Siper alma (CUF ipucu: temas → sipere gir). Çatışma başlayınca her figür 0,5–2,2 sn içinde kararını verir: sütre
   * arkasındaysa çöker, 3–7 sn sonra doğrulup 3,5–6 sn ateş eder, yeniden çöker (figür başına ayrı zamanlama: hepsi aynı
   * anda inip kalkmaz); açıktaysa yarısı diz çöküp öyle ateş eder. Çatışma bitince kendi çöktürdükleri 1,5–4 sn içinde
   * kalkar. Eğitmenin verdiği duruşa ve klipsiz (prosedürel) modellere karışmaz.
   */
  private siperiGuncelle(a: Aktif) {
    const tehdit = this.dusmanAzimutu !== null;
    const uygun = a.silah && !a.agirSilah && a.hiz === 0 && !a.yaninda && a.poz !== "yarali" && a.asama === "normal" && Boolean(a.eylemPoz.comelmis);
    if (!uygun || a.sicrama.kosuyor) return;
    if (!tehdit || !this.siperAl) {
      if (!a.siper) return;
      if (!a.siper.otoComeldi || a.siper.mod === "elle" || a.poz === "ayakta") {
        a.siper = null;
        return;
      }
      // Kendi çöktürdüğü figür: gecikmeyle ayağa kalkar
      if (a.siper.mod !== "ayakta") a.siper = { mod: "ayakta", sonraki: this.saat + 1.5 + rastgele() * 2.5, otoComeldi: true };
      if (this.saat >= a.siper.sonraki && !a.gecis && !a.yuruyus) {
        a.siper = null;
        this.pozUygula(a, "ayakta", false);
      }
      return;
    }
    if (!a.siper) {
      if (a.poz !== "ayakta") {
        a.siper = { mod: "elle", sonraki: Infinity, otoComeldi: false };
        return;
      }
      // Açıkta: %40 diz çöküp, %30 yere yatıp, %30 ayakta ateş eder (kullanıcı: diz çökerek/yatarak ateş eden de olsun)
      const zar = rastgele();
      const acikta = zar < 0.4 ? "diz" : zar < 0.7 && a.eylemPoz.yatmis ? "yat" : "ayakta";
      const mod = this.sutreArkasinda(a) ? "inKalk" : acikta;
      a.siper = { mod, sonraki: this.saat + 0.5 + rastgele() * 1.7, otoComeldi: false };
      return;
    }
    const s = a.siper;
    if (s.mod === "elle" || s.mod === "ayakta" || this.saat < s.sonraki || a.gecis || a.yuruyus) return;
    if (a.poz === "ayakta") {
      s.otoComeldi = true;
      // Yere yatış iki adım: önce diz çöker, 1,3 sn sonra yatar ("Crouch To Prone" çömelik başlar; ayaktan doğrudan
      // geçişte kalça tek karede 3 m/sn düşüyordu)
      s.sonraki = s.mod === "inKalk" ? this.saat + 3 + rastgele() * 4 : s.mod === "yat" ? this.saat + 1.3 : Infinity;
      this.pozUygula(a, "comelmis", false);
    } else if (a.poz === "comelmis" && s.mod === "yat") {
      s.sonraki = Infinity;
      this.pozUygula(a, "yatmis", false);
    } else if (a.poz === "comelmis" && s.mod === "inKalk") {
      s.sonraki = this.saat + 3.5 + rastgele() * 2.5;
      this.pozUygula(a, "ayakta", false);
    }
  }

  /** Müdahale döngüsünü bırak (duruş komutu, yürüyüş, vurulma): bekleme klibine kısa çapraz geçiş. */
  private mudahaleyiBirak(a: Aktif, sure = 0.2) {
    const m = a.mudahale;
    if (!m || !m.simdiki) return;
    m.eylemler.bekle.fadeOut(sure);
    m.eylemler.calis.fadeOut(sure);
    if (a.eylemBekle) a.eylemBekle.reset().setEffectiveWeight(1).fadeIn(sure).play();
    m.simdiki = null;
  }

  /**
   * Sıhhiyecinin yaralı başındaki döngüsü (bkz. MUDAHALE_KLIPLERI); siperde beklerken, yürürken, duruş klibinde çalışmaz.
   * Üç klibin ağırlığı elle sürülür: "çalışma" klibi tek başına gövdeyi yere yatırıyor (göğüs masajı duruşu; yandan
   * yaralının üstüne yatmış gibi görünüyordu), bu yüzden dik diz çökme ile yarı yarıya harmanlanır: öne eğilmiş, elleri
   * yaralının üstünde çalışan sıhhiyeci.
   */
  private mudahaleyiGuncelle(a: Aktif, dt: number) {
    const m = a.mudahale;
    if (!m) return;
    if (a.safhaBekliyor || a.yuruyus || a.gecis || a.aktifPoz || a.poz !== "ayakta" || a.asama !== "normal") {
      if (m.simdiki && (a.poz === "yarali" || a.asama !== "normal")) m.simdiki = null; // vurulma: oturanlariSondur söndürdü
      return;
    }
    const e = m.eylemler;
    const gec = (durum: MudahaleDurumu, sure: number) => {
      m.durum = durum;
      m.bitis = this.saat + sure;
      if (durum === "isaret") e.isaret.time = 0;
    };
    if (!m.simdiki) {
      m.simdiki = e.bekle;
      m.tur = 0;
      m.calisma = 0;
      m.isaret = 0;
      m.giris = 0; // yürüyüş klibi 0,7 sn'de sönerken döngü aynı sürede açılır (toplam ağırlık 1 kalır, çöküş yumuşak)
      e.bekle.reset().setEffectiveWeight(0).play();
      e.calis.reset().setEffectiveWeight(0).play();
      e.calis.time = rastgele() * e.calis.getClip().duration;
      gec("bekle", 2 + rastgele() * 2);
    } else if (this.saat >= m.bitis) {
      if (m.durum === "bekle") gec("calis", 8 + rastgele() * 6);
      else if (m.durum === "calis") {
        m.tur++;
        if (m.tur % 3 === 0) gec("isaret", e.isaret.getClip().duration - 0.4);
        else gec("bekle", 3 + rastgele() * 3);
      } else gec("calis", 8 + rastgele() * 6);
    }
    const yaklas = (simdi: number, hedef: number, sure: number) => simdi + Math.sign(hedef - simdi) * Math.min(Math.abs(hedef - simdi), dt / sure);
    m.calisma = yaklas(m.calisma, m.durum === "calis" ? MUDAHALE_CALISMA_PAYI : 0, 0.9);
    m.isaret = yaklas(m.isaret, m.durum === "isaret" ? 1 : 0, 0.5);
    m.giris = Math.min(1, m.giris + dt / 0.7);
    e.isaret.setEffectiveWeight(m.giris * m.isaret);
    e.calis.setEffectiveWeight(m.giris * (1 - m.isaret) * m.calisma);
    e.bekle.setEffectiveWeight(m.giris * (1 - m.isaret) * (1 - m.calisma));
  }

  /**
   * Yaralının görüş hattını aç: izleyici (sahne merkezi) ile yerdeki yaralı arasında duran asker yana çekilir. Yaralı
   * eğitimin ana ipucudur; öndeki asker onu örtüyordu. Ölçü: askerin görüş hattından sapması yaralının uzaklığına
   * izdüşürülür; 1 m'den azsa 1,4 m olacak kadar yana yürür (boş olan yana; ikisi de doluysa kalır). Saniyede bir bakılır.
   */
  private gorusHatlariniAc() {
    for (const y of this.aktifler) {
      if (y.poz !== "yarali") continue;
      const uzaklik = Math.hypot(y.nesne.position.x, y.nesne.position.z);
      if (uzaklik < 1.5) continue;
      const yon = new THREE.Vector3(y.nesne.position.x / uzaklik, 0, y.nesne.position.z / uzaklik);
      const yan = new THREE.Vector3(-yon.z, 0, yon.x);
      for (const b of this.aktifler) {
        if (b === y || b.poz === "yarali" || b.hiz !== 0 || b.yuruyus || b.gecis || b.yaninda || b.agirSilah || !b.karistirici || b.asama !== "normal") continue;
        if (this.saat - b.kenaraCekilme < 6) continue;
        const ileri = b.nesne.position.x * yon.x + b.nesne.position.z * yon.z;
        if (ileri < 0.5 || ileri > uzaklik - 0.3) continue;
        const sapma = b.nesne.position.x * yan.x + b.nesne.position.z * yan.z;
        if ((Math.abs(sapma) * uzaklik) / ileri >= 1) continue;
        const gereken = (1.4 * ileri) / uzaklik - Math.abs(sapma) + 0.15;
        const taraf = sapma >= 0 ? 1 : -1;
        for (const t of [taraf, -taraf]) {
          const adim = t === taraf ? gereken : gereken + 2 * Math.abs(sapma);
          const hedef = b.nesne.position.clone().addScaledVector(yan, t * adim);
          if (this.doluMuHaric(hedef, 0.8, b.id)) continue;
          b.kenaraCekilme = this.saat;
          this.yuruyusBaslat(b, hedef, b.nesne.rotation.y);
          break;
        }
      }
    }
  }

  /** `kaynakEylem`: o an gövdeyi yazan eylem bilinen dışındaysa (koşu klibi: sipere dalış) çapraz geçiş ondan yapılır. */
  private pozUygula(a: Aktif, poz: FigurPozu, aninda: boolean, kaynakEylem?: THREE.AnimationAction | null) {
    if (a.poz === poz) return;
    if (poz !== "yarali") this.mudahaleyiBirak(a);
    const onceki = a.poz;
    a.poz = poz;
    if (poz === "yarali") {
      if (a.eylemDusme) {
        if (aninda) {
          // Hazır yaralı: düşme klibinin son karesinde, yerde
          this.oturanlariSondur(a, 0);
          a.eylemDusme.reset().setEffectiveWeight(1).play();
          a.eylemDusme.time = Math.max(0, a.eylemDusme.getClip().duration - 0.01);
          a.eylemDusme.paused = true;
          a.karistirici?.update(0); // son kareyi hemen uygula ki silah elin yanına düşsün
          this.yereDustu(a);
        } else if (a.eylemVurulma && this.kalcaUyumlu(a, a.eylemVurulma.getClip())) {
          // Vurulma klibi figürün o anki duruşundan başlıyorsa (Mixamo "Hit Reaction" çömelik: diz çökmüşte) önce o
          this.oturanlariSondur(a, 0.15);
          a.eylemVurulma.reset().setEffectiveWeight(1).fadeIn(0.15).play();
          a.asama = "vuruluyor";
          this.sesOlayi?.("vuruldu", a.azimut);
        } else {
          // Duruş uymuyor (ayaktaki asker çömelik vurulma klibine tek karede 27 cm çöküp sonra yeniden doğruluyordu):
          // doğrudan düşme klibi; Mixamo ölüm klipleri zaten sendeleme ile başlar
          this.dusmeyeBasla(a);
          this.sesOlayi?.("vuruldu", a.azimut);
        }
      } else {
        // Klipsiz model: gövdeyi yere yatır
        a.icNesne.rotation.x = -Math.PI / 2;
        a.icNesne.position.y = 0.05;
        this.yereDustu(a);
        if (!aninda) this.sesOlayi?.("vuruldu", a.azimut);
      }
      a.sonrakiYardim = a.zaman + 3 + rastgele() * 3;
      return;
    }
    // Klip tabanlı duruş: önce geçiş klibi (varsa: "Rifle Stand To Kneel", "Standing Up"…), sonra duruş döngüsü;
    // geçiş klibi yoksa 0,4 sn çapraz geçiş. Prosedürel (Quaternius) modelde klip yok, ofsetler devreye girer.
    const pozKlibi = poz === "ayakta" ? null : (a.eylemPoz[poz as "comelmis" | "yatmis"] ?? null);
    const klipli = pozKlibi !== null || a.aktifPoz !== null || a.gecis !== null;
    const gecisKlip = aninda ? null : this.gecisKlibi(a, onceki, poz);
    // O an gövdeyi yazan eylem: süren geçiş > yerde kalan düşme klibi > duruş klibi > ateş/bekleme
    const kaynak: THREE.AnimationAction | null = kaynakEylem ?? a.gecis?.eylem ?? (onceki === "yarali" ? (a.eylemDusme ?? a.eylemVurulma ?? null) : (a.aktifPoz ?? (a.atesPozu ? a.eylemAtes : a.eylemBekle)));
    a.gecis = null;
    // Yerdeyse kalk: silahı al, gövdeyi düzelt; düşme klibi geçiş klibine çapraz geçecekse henüz durdurulmaz
    if (onceki === "yarali") {
      a.asama = "normal";
      this.silahiAl(a);
      a.icNesne.rotation.x = 0;
      a.icNesne.position.y = a.tabanY;
      a.atesPozu = false;
      if (a.eylemVurulma && a.eylemVurulma !== kaynak) a.eylemVurulma.stop();
      if (!gecisKlip && kaynak !== a.eylemBekle) a.eylemDusme?.stop();
    }
    const hedef = pozKlibi ?? a.eylemBekle;
    if (hedef && (hedef !== kaynak || gecisKlip)) {
      if (gecisKlip && a.karistirici) {
        const g = a.karistirici.clipAction(gecisKlip);
        g.setLoop(THREE.LoopOnce, 1);
        g.clampWhenFinished = true;
        const aralik = gecisAraligi(gecisKlip);
        g.reset().setEffectiveWeight(1).play();
        g.time = aralik.bas;
        g.timeScale = aralik.son - aralik.bas > 4 ? 1.3 : 1; // uzun kalkış (Standing Up ≈ 5,5 sn) biraz hızlanır
        if (kaynak && kaynak !== g) kaynak.crossFadeTo(g, 0.15, false);
        a.gecis = { eylem: g, hedef, son: aralik.son };
      } else {
        hedef.reset().setEffectiveWeight(1).play();
        if (kaynak && kaynak !== hedef) {
          if (aninda) kaynak.stop();
          else kaynak.crossFadeTo(hedef, 0.4, false);
        }
      }
    }
    a.aktifPoz = pozKlibi;
    a.atesPozu = false;
    if (klipli || gecisKlip) {
      a.comelme = 0;
      a.yatma = 0;
      return;
    }
    if (aninda) {
      a.comelme = poz === "comelmis" ? 1 : 0;
      a.yatma = poz === "yatmis" ? 1 : 0;
    }
  }

  /** Yere düştü: aşama "yerde", tüfek elden çıkıp yanına düşer (dik durmasın). */
  private yereDustu(a: Aktif) {
    a.asama = "yerde";
    // Yardım işareti düştükten 2–5 sn sonra başlar (sayaç düşerken dolmuşsa kol hareketin ortasından, sıçrayarak kalkıyordu)
    a.sonrakiYardim = a.zaman + 2 + rastgele() * 3;
    const s = a.silahNesne;
    if (!s || !a.silahKemik || a.silahYerde) return;
    a.silahYerde = true;
    a.nesne.updateMatrixWorld(true);
    const el = a.nesne.worldToLocal(s.getWorldPosition(new THREE.Vector3()));
    a.nesne.attach(s); // dünya dönüşümü korunur; artık sarmal (metre) uzayında
    s.position.set(el.x + (rastgele() - 0.5) * 0.4, 0.03, el.z + 0.2);
    // Tüfek yan yatar (önceden kabzası üstünde dik duruyordu): uzun eksen etrafında 90 derece, sonra rastgele yön
    s.rotation.order = "YXZ";
    s.rotation.set(a.silahUzunEksen === "x" ? Math.PI / 2 : 0, rastgele() * Math.PI, a.silahUzunEksen === "z" ? Math.PI / 2 : 0);
  }

  /** Kalkınca tüfek ele geri döner (bağlandığı kemik ve yerel dönüşüm). */
  private silahiAl(a: Aktif) {
    const s = a.silahNesne;
    if (!s || !a.silahKemik || !a.silahTemel || !a.silahYerde) return;
    a.silahYerde = false;
    a.silahKemik.add(s);
    s.position.copy(a.silahTemel.konum);
    s.quaternion.copy(a.silahTemel.donus);
    s.scale.copy(a.silahTemel.olcek);
  }

  /** Klibin başlangıcındaki kalça konumu figürün o anki kalçasına yakın mı (dinlenme kalça yüksekliğinin %20 içinde)? */
  private kalcaUyumlu(a: Aktif, klip: THREE.AnimationClip): boolean {
    if (!a.kalca || a.kalcaBoy <= 0) return true;
    return kalcaFarki(klip, 0, a.kalca.position) < 0.2 * a.kalcaBoy;
  }

  private dusmeyeBasla(a: Aktif) {
    if (!a.eylemDusme) {
      this.yereDustu(a);
      return;
    }
    const onceki = a.asama === "vuruluyor" ? a.eylemVurulma : null;
    // Ayaktaysa: başlangıcı uyan düşme kliplerinden rastgele biri (çeşitlilik). Çömelmiş/yerdeyse: düşme klibine, kalçanın
    // o anki yüksekliğine denk gelen yerinden girilir (önce ayağa fırlayıp sonra düşmesin).
    let eylem = a.eylemDusme;
    let baslangic = 0;
    if (a.kalca && a.kalcaBoy > 0) {
      const uygun = (a.dusmeAdaylari.length ? a.dusmeAdaylari : [a.eylemDusme]).filter((e) => this.kalcaUyumlu(a, e.getClip()));
      if (uygun.length) eylem = uygun[Math.floor(rastgele() * uygun.length)];
      else baslangic = kalcayaEnYakinZaman(eylem.getClip(), a.kalca.position);
    }
    a.eylemDusme = eylem;
    eylem.reset().setEffectiveWeight(1).play();
    eylem.time = baslangic;
    if (onceki) onceki.crossFadeTo(eylem, baslangic > 0 ? 0.3 : 0.12, false);
    else {
      this.oturanlariSondur(a, 0.2);
      eylem.fadeIn(0.2);
    }
    a.asama = "dusuyor";
  }

  /** Bekleme/ateş döngülerini söndürür (tek seferlik klibe geçerken). */
  private oturanlariSondur(a: Aktif, sure: number) {
    for (const e of [a.eylemBekle, a.eylemAtes, a.eylemAtesUst, a.aktifPoz, a.eylemPoz.comelmis ?? null, a.eylemComelmisNisan, a.gecis?.eylem ?? null, a.yuruyus?.eylem ?? null, a.mudahale?.simdiki ? a.mudahale.eylemler.bekle : null, a.mudahale?.simdiki ? a.mudahale.eylemler.calis : null]) {
      if (!e) continue;
      if (sure > 0) e.fadeOut(sure);
      else e.stop();
    }
    a.aktifPoz = null;
    a.gecis = null;
    a.yuruyus = null;
  }

  /**
   * Prosedürel duruş: karıştırıcıdan sonra kemiklere dünya eksenli ofsetler.
   * - Diz çökme: sol bacak öne 90° (diz bükük, ayak yerde), sağ diz yerde (alt bacak geriye), gövde hafif öne, kalça iner.
   * - Yerde yaralı: göğüs nefesle inip kalkar, ara ara sağ kol yardım ister gibi kalkar.
   */
  private durusuUygula(a: Aktif, dt: number) {
    a.zaman += dt;
    const hedefComelme = a.poz === "comelmis" && !a.aktifPoz ? 1 : 0;
    if (a.comelme !== hedefComelme) a.comelme += Math.sign(hedefComelme - a.comelme) * Math.min(Math.abs(hedefComelme - a.comelme), dt / 0.6);
    const hedefYatma = a.poz === "yatmis" && !a.aktifPoz ? 1 : 0;
    if (a.yatma !== hedefYatma) a.yatma += Math.sign(hedefYatma - a.yatma) * Math.min(Math.abs(hedefYatma - a.yatma), dt / 0.8);
    const sag = new THREE.Vector3(1, 0, 0).applyQuaternion(a.nesne.getWorldQuaternion(new THREE.Quaternion())).normalize();
    const k = a.kemikler;
    const dondur = (kemik: THREE.Object3D | undefined, aci: number) => {
      if (!kemik) return;
      if (!a.kemikTemel.has(kemik)) a.kemikTemel.set(kemik, kemik.quaternion.clone());
      dunyaEkseniEtrafindaDondur(kemik, sag, aci);
    };
    const kaydir = (kemik: THREE.Object3D | undefined, d: THREE.Vector3) => {
      if (!kemik) return;
      if (!a.kemikTemelKonum.has(kemik)) a.kemikTemelKonum.set(kemik, kemik.position.clone());
      dunyadaKaydir(kemik, d);
    };
    if (a.yatma > 0 && a.asama === "normal") {
      // Yere yatıp ateş (prone): gövde ayak ekseninden öne yatırılır (yüzü yere, başı ileri), baş ileri bakar;
      // bekleme/ateş klibi sürer, tüfek yerde ileri bakar. Gövde kalınlığı için 0,12 m yukarı.
      const y = 0.5 - 0.5 * Math.cos(Math.PI * a.yatma);
      a.icNesne.rotation.x = (Math.PI / 2) * y;
      a.icNesne.position.y = a.tabanY + 0.12 * (a.boy / 1.8) * y;
      a.icNesne.updateMatrixWorld(true);
      dondur(k.bas, -radyan(65) * y);
      dondur(k.gogus, -radyan(15) * y);
    } else if (a.yatma <= 0 && a.asama === "normal" && a.poz !== "yarali" && a.icNesne.rotation.x !== 0) {
      a.icNesne.rotation.x = 0;
    }
    if (a.comelme > 0 && a.asama === "normal") {
      const c = 0.5 - 0.5 * Math.cos(Math.PI * a.comelme); // yumuşak 0..1
      const olcek = (a.boy / 1.8) * c;
      // Figürün ileri yönü (model +z; sarmal izleyiciye/düşmana dönük) ve yukarı
      const ileri = new THREE.Vector3(0, 0, 1).applyQuaternion(a.nesne.getWorldQuaternion(new THREE.Quaternion())).normalize();
      const yukari = new THREE.Vector3(0, 1, 0);
      // Kalça iner: ~0.42 m (1.8 m boy için); iç düğüm sarmal altında metre cinsinden
      a.icNesne.position.y = a.tabanY - 0.42 * olcek;
      a.icNesne.updateMatrixWorld(true);
      // Sol bacak öne: uyluk yatay, baldır dik; ayak öne gider ve (gövde indiği için) yerde kalır
      dondur(k.solUstBacak, -radyan(85) * c);
      dondur(k.solAltBacak, radyan(88) * c);
      kaydir(k.solAyak, yukari.clone().multiplyScalar(0.42 * olcek).addScaledVector(ileri, 0.5 * olcek));
      // Sağ diz yerde: uyluk dik, baldır geriye yatık; ayak geriye gider, parmaklar yere bakar
      dondur(k.sagUstBacak, radyan(8) * c);
      dondur(k.sagAltBacak, radyan(95) * c);
      kaydir(k.sagAyak, yukari.clone().multiplyScalar(0.4 * olcek).addScaledVector(ileri, -0.45 * olcek));
      dondur(k.sagAyak, radyan(80) * c);
      dondur(k.govde, -radyan(6) * c);
    } else if (a.comelme <= 0 && a.yatma <= 0 && a.asama === "normal" && a.poz !== "yarali" && a.icNesne.position.y !== a.tabanY) {
      a.icNesne.position.y = a.tabanY;
    }
    if (a.poz === "yarali" && a.asama === "yerde") {
      a.icNesne.updateMatrixWorld(true);
      // Nefes: göğüs ±2.5°, ~0.45 Hz (ağır, kesik)
      const nefes = Math.sin(a.zaman * Math.PI * 2 * 0.45);
      dondur(k.gogus, radyan(2.5) * nefes);
      // Yardım işareti: her 6–12 sn'de kol 2,6 sn boyunca kalkar-sallanır-iner
      const t = a.zaman - a.sonrakiYardim;
      if (t >= 0 && t < 2.6) {
        const zarf = Math.sin((t / 2.6) * Math.PI); // 0→1→0
        const sallama = Math.sin(t * Math.PI * 2 * 1.6) * 12;
        dondur(k.sagUstKol, -radyan(70 * zarf + sallama * zarf));
        if (t < dt) this.sesOlayi?.("yardim", a.azimut);
      } else if (t >= 2.6) a.sonrakiYardim = a.zaman + 6 + rastgele() * 6;
    }
    // Nefes (canlılık): "Rifle Idle" 8,6 sn'de başı 2 cm oynatıyor, asker heykel gibi duruyordu; göğüs ±0,9°, ~0,27 Hz
    if (a.karistirici && a.asama === "normal" && a.poz !== "yarali" && !a.agirSilah && a.hiz === 0) {
      dondur(k.gogus, radyan(0.9) * Math.sin(a.zaman * Math.PI * 2 * 0.27));
    }
    // Geri tepme (diz çökmüş / yatan): nişan klibi durağan, atış anında göğüs 0,1 sn geriye vurur (ayakta ateş klibi var)
    if ((a.poz === "comelmis" || a.poz === "yatmis") && a.asama === "normal") {
      const t = this.saat - a.sonAtis;
      if (t >= 0 && t < 0.1) dondur(k.gogus, radyan(2.4) * (1 - t / 0.1));
    }
    // Eğik koşu: mevzi değiştirirken gövde öne eğik, baş ileri bakar (ateş altında dimdik koşulmaz). Koşu klibi diktir;
    // eğim kemiklere eklenir, 0,25 sn'de girer/çıkar; sipere dalışta (inis) doğrulur
    const egikHedef = a.sicrama.kosuyor && a.yuruyus && !a.yuruyus.inis ? 1 : 0;
    if (a.egik !== egikHedef) a.egik += Math.sign(egikHedef - a.egik) * Math.min(Math.abs(egikHedef - a.egik), dt / 0.25);
    if (a.egik > 0 && a.asama === "normal") {
      const e = a.egik * a.egik * (3 - 2 * a.egik);
      dondur(k.govde, radyan(EGIK_KOSU.govde) * e);
      dondur(k.gogus, radyan(EGIK_KOSU.gogus) * e);
      dondur(k.bas, radyan(EGIK_KOSU.bas) * e);
    }
    // İrkilme: 1,1 sn'de gövde ve baş öne eğilir, kalça biraz iner, toparlanır (yarım sinüs zarfı)
    if (a.tepki && a.asama === "normal" && a.poz !== "yarali") {
      const t = this.saat - a.tepki.baslangic;
      if (t > 1.1) a.tepki = null;
      else {
        const e = Math.sin((t / 1.1) * Math.PI) * a.tepki.guc;
        dondur(k.govde, -radyan(16) * e);
        dondur(k.bas, -radyan(14) * e);
        if (a.comelme <= 0 && a.yatma <= 0) {
          a.icNesne.position.y = a.tabanY - 0.1 * (a.boy / 1.8) * e;
          a.icNesne.updateMatrixWorld(true);
        }
      }
    }
  }

  /**
   * Zemin eğimine hizalama (D-22): ayak altındaki yükseklik gradyanından pitch/roll (≤ 12°), yumuşatılmış; düz zeminde 0.
   * Sarmalın Euler sırası YXZ: yaw (düşmana dönüş, yürüyüş) bozulmaz.
   */
  private egimeHizala(a: Aktif, dt: number) {
    const p = a.nesne.position;
    const e = 0.35;
    const gx = (zeminY(p.x + e, p.z) - zeminY(p.x - e, p.z)) / (2 * e);
    const gz = (zeminY(p.x, p.z + e) - zeminY(p.x, p.z - e)) / (2 * e);
    const yaw = a.nesne.rotation.y;
    const ileriEgim = gx * Math.sin(yaw) + gz * Math.cos(yaw); // ileri yönde yükselme (model +z)
    const sagEgim = gx * Math.cos(yaw) - gz * Math.sin(yaw); // sağa doğru yükselme
    const sinir = radyan(12);
    const hedefX = Math.max(-sinir, Math.min(sinir, -Math.atan(ileriEgim)));
    const hedefZ = Math.max(-sinir, Math.min(sinir, Math.atan(sagEgim)));
    const k = Math.min(1, dt * 4);
    a.egimX += (hedefX - a.egimX) * k;
    a.egimZ += (hedefZ - a.egimZ) * k;
    a.nesne.rotation.x = a.egimX;
    a.nesne.rotation.z = a.egimZ;
  }

  /**
   * Üst/alt gövde katmanı (D-22): yana yürüyen silahlı figür düşman varken alt gövde yürüyüş + üst gövde ateş klibiyle
   * oynar (nişanda yürür); düşman gidince tam yürüyüş klibine döner. Katman klipleri yoksa (rig tanınmadı) dokunulmaz.
   */
  private katmaniGuncelle(a: Aktif) {
    if (!a.eylemAtesUst || !a.eylemBekle || !a.karistirici || a.hiz === 0 || a.poz === "yarali" || a.asama !== "normal") return;
    // Üst gövde ateş katmanı yalnız yürüyen (≤ 2 m/sn) ve düşmana doğru (± 35°) giden figürde: klip gidiş yönüne nişan
    // alır. Koşan askerde koşunun gövde eğimi/dönüşü üstüne binince tüfek havaya dikiliyor, yana koşan asker boşluğa
    // nişan alıyordu (10 Kasım, kullanıcı gözlemi: "elindeki silah saçmalıyor").
    let istenen = a.silah && this.dusmanAzimutu !== null && a.hiz <= 2;
    if (istenen && this.dusmanAzimutu !== null) {
      const d = azimutYon(this.dusmanAzimutu);
      istenen = Math.sin(a.nesne.rotation.y) * d.x + Math.cos(a.nesne.rotation.y) * d.z > 0.82;
    }
    if (istenen === a.katmanAktif) return;
    const alt = altGovdeKlibi(a.eylemBekle.getClip());
    if (!alt) return;
    a.katmanAktif = istenen;
    const altEylem = a.karistirici.clipAction(alt);
    altEylem.setLoop(THREE.LoopRepeat, Infinity);
    if (istenen) {
      altEylem.reset().setEffectiveWeight(1).play();
      altEylem.time = a.eylemBekle.time;
      altEylem.timeScale = a.eylemBekle.timeScale;
      a.eylemBekle.crossFadeTo(altEylem, 0.3, false);
      a.eylemAtesUst.reset().setEffectiveWeight(1).fadeIn(0.3).play();
    } else {
      a.eylemBekle.reset().setEffectiveWeight(1).play();
      a.eylemBekle.time = altEylem.time;
      altEylem.crossFadeTo(a.eylemBekle, 0.3, false);
      a.eylemAtesUst.fadeOut(0.3);
    }
  }

  /**
   * Halka kaçınması (yana koşan/yürüyen): hareket izleyici etrafında halka üzerinde olduğundan engeller kutupsal bakılır —
   * ileri = yay uzunluğu (hat yarıçapı × açı farkı, hareket yönünde), yanal = engelin yarıçapı − hat yarıçapı. Teğet doğru
   * üzerinde bakmak aynı halkadaki duranları "içeride" gösteriyor, koşan hep dışa kaçıp dıştaki durana çarpıyordu.
   * Hat üzerinde (|yanal| ≤ 1,2) engel varsa yolu boş olan yana ±1,4 (gerekirse 2,8) m; sapmışsa aynı yanda kalır.
   */
  private halkaKacinmasi(a: Aktif): number {
    const r0 = a.hatYaricapi;
    if (r0 < 1) return 0;
    const p = a.nesne.position;
    const aci0 = Math.atan2(p.x, -p.z);
    const yonIsaret = a.sola ? -1 : 1; // sağa koşan azimutu artırır
    const onBakis = Math.max(3.5, a.hiz * 1.6);
    const figurler: Array<{ ileri: number; yanHat: number; b: Aktif }> = [];
    for (const b of this.aktifler) {
      if (b === a || b.id === a.yanindaId) continue;
      let fark = (Math.atan2(b.nesne.position.x, -b.nesne.position.z) - aci0) * yonIsaret;
      fark = Math.atan2(Math.sin(fark), Math.cos(fark));
      const ileri = fark * r0;
      if (ileri < -0.8 || ileri > onBakis) continue;
      figurler.push({ ileri, yanHat: Math.hypot(b.nesne.position.x, b.nesne.position.z) - r0, b });
    }
    // Bir sapmada (hat yarıçapı + sapma) ileri bakış boyunca ilk engele uzaklık (m): duran/koşan figür (yanal ≤ 1,2 m) ya da
    // sabit engel (bariyer, araç, sütre; gövde genişliği için yarıçap ± 0,4 m de bakılır). Figür ve sabit engel BİRLİKTE
    // değerlendirilir: önceden figürden kaçan asker 1,4 m dışa açılıp bariyerin içinden koşuyordu (10 Kasım, kullanıcı gözlemi).
    const aciklik = (sapma: number): number => {
      const yaricap = r0 + sapma;
      if (yaricap < 2.5) return 0;
      let enYakin = Infinity;
      for (const f of figurler) if (Math.abs(f.yanHat - sapma) < 1.2) enYakin = Math.min(enYakin, Math.max(0, f.ileri));
      for (let ileri = -0.4; ileri <= onBakis && ileri < enYakin; ileri += 0.5) {
        const az = derece(aci0 + (yonIsaret * ileri) / yaricap);
        if (this.engel(yerKonumu(az, yaricap)) || this.engel(yerKonumu(az, yaricap + 0.4)) || this.engel(yerKonumu(az, yaricap - 0.4))) {
          enYakin = Math.max(0, ileri);
          break;
        }
      }
      return enYakin;
    };
    // Hat boşsa hatta dön / hatta kal; sapmışken sapma hâlâ boşsa ve hat kapalıysa sapmayı koru
    if (aciklik(0) === Infinity) return 0;
    const simdiki = Math.abs(a.kacinmaHedef) > 0.2 ? a.kacinmaHedef : 0;
    if (simdiki !== 0 && aciklik(simdiki) === Infinity) return simdiki;
    // Yeni sapma: önce o anki yan, karşılıklı koşanlarda biri içe öbürü dışa; küçükten büyüğe; ilk tamamen boş olan
    const onde = figurler.filter((f) => Math.abs(f.yanHat) <= 1.2).sort((x, y) => x.ileri - y.ileri)[0];
    let tercih: number;
    if (simdiki !== 0) tercih = Math.sign(simdiki);
    else if (onde && onde.b.hiz > 0 && Math.abs(onde.yanHat) < 0.4) tercih = a.id < onde.b.id ? -1 : 1;
    else if (onde) tercih = onde.yanHat >= 0 ? -1 : 1; // figür dışarıdaysa içten, içerideyse dıştan geç
    else tercih = -1; // sabit engel: önce izleyici tarafı (açık alan)
    let enIyi = { sapma: simdiki, uzaklik: aciklik(simdiki) };
    for (const buyukluk of [1.4, 2.8, 4.2, 5.6]) {
      for (const sapma of [tercih * buyukluk, -tercih * buyukluk]) {
        const u = aciklik(sapma);
        if (u === Infinity) return sapma;
        if (u > enIyi.uzaklik + 0.5) enIyi = { sapma, uzaklik: u };
      }
    }
    return enIyi.sapma;
  }

  /** Çatışma durumuna göre bekleme ↔ ateş klipleri arasında yumuşak geçiş. */
  private pozuGuncelle(a: Aktif) {
    if (a.poz === "yarali" || a.asama !== "normal" || a.gecis || a.yuruyus) return;
    const tehdit = a.silah && a.hiz === 0 && this.dusmanAzimutu !== null;
    // Sütre arkasında çökmüş (siper, "inKalk"): başını eğmiş bekler, nişan almaz ve ateş etmez
    const istenen = tehdit && !(a.poz === "comelmis" && a.siper?.mod === "inKalk");
    // Diz çökmüş (klipli): bekleme klibi tüfeği dik tutar; çatışmada nişan klibine geçer, bitince geri döner
    const comelmisBekle = a.eylemPoz.comelmis;
    if (a.poz === "comelmis" && a.aktifPoz && comelmisBekle && a.eylemComelmisNisan) {
      const nisanda = a.aktifPoz === a.eylemComelmisNisan;
      if (istenen === nisanda) {
        a.atesGecikmesi = null;
        a.atesPozu = nisanda;
        return;
      }
      if (istenen) {
        if (a.atesGecikmesi === null) {
          a.atesGecikmesi = this.saat + rastgele() * 0.9;
          return;
        }
        if (this.saat < a.atesGecikmesi) return;
      }
      a.atesGecikmesi = null;
      const hedef = istenen ? a.eylemComelmisNisan : comelmisBekle;
      hedef.reset().setEffectiveWeight(1).play();
      a.aktifPoz.crossFadeTo(hedef, 0.35, false);
      a.aktifPoz = hedef;
      a.atesPozu = istenen;
      return;
    }
    if (!a.eylemAtes || !a.eylemBekle || a.aktifPoz) return;
    if (istenen === a.atesPozu) {
      a.atesGecikmesi = null;
      return;
    }
    if (istenen) {
      // Kademeli başlangıç (grup davranışı): hepsi aynı karede değil, 0–0,9 sn'ye yayılarak nişana geçer
      if (a.atesGecikmesi === null) {
        a.atesGecikmesi = this.saat + rastgele() * 0.9;
        return;
      }
      if (this.saat < a.atesGecikmesi) return;
    }
    a.atesGecikmesi = null;
    a.atesPozu = istenen;
    const from = istenen ? a.eylemBekle : a.eylemAtes;
    const to = istenen ? a.eylemAtes : a.eylemBekle;
    to.reset().setEffectiveWeight(1).play();
    from.crossFadeTo(to, 0.35, false);
  }

  /** Figürü kaldırır; yükleniyorsa yüklemesi iptal olur (sahneye çıkmaz). */
  durdur(id: string) {
    this.yuklemeyiBirak(id);
    for (const a of this.aktifler) if (a.id === id) this.figuruBirak(a);
    this.aktifler = this.aktifler.filter((a) => a.id !== id);
  }

  /** Bütün figürler ve süren yüklemeler (hedef bekleyen "yanında" figürler dahil) gider. */
  temizle() {
    this.yuklemeler.clear();
    this.rezerveler.clear();
    for (const a of this.aktifler) this.figuruBirak(a);
    this.aktifler = [];
  }

  /**
   * Figürü sahneden çıkarır ve GPU/CPU kaynaklarını bırakır (§2-19, §4-20): karıştırıcı eylemleri durur ve bağlar
   * silinir, her kopyanın iskeleti (kemik dokusu) bırakılır, boya için kopyalanan malzemeler bırakılır. Geometri ve
   * özgün malzemeler önbellekteki glTF ile paylaşımlı olduğundan DOKUNULMAZ.
   */
  private figuruBirak(a: Aktif) {
    this.grup.remove(a.nesne);
    try {
      a.karistirici?.stopAllAction();
      a.karistirici?.uncacheRoot(a.icNesne);
      a.nesne.traverse((o) => {
        const sm = o as THREE.SkinnedMesh;
        if (sm.isSkinnedMesh) sm.skeleton.dispose();
      });
      for (const m of a.kopyaMalzemeler) m.dispose();
      a.kopyaMalzemeler.length = 0;
    } catch {
      /* bırakma hatası görüntüyü etkilemez */
    }
  }

  guncelle(dt: number) {
    this.saat += dt;
    if (this.saat >= this.gorusDenetimi) {
      this.gorusDenetimi = this.saat + 1;
      this.gorusHatlariniAc();
    }
    for (const a of this.aktifler) {
      this.sicramayiGuncelle(a);
      this.siperiGuncelle(a);
      this.mudahaleyiGuncelle(a, dt);
      this.pozuGuncelle(a);
      for (const [kemik, temel] of a.kemikTemel) kemik.quaternion.copy(temel);
      a.kemikTemel.clear();
      for (const [kemik, temel] of a.kemikTemelKonum) kemik.position.copy(temel);
      a.kemikTemelKonum.clear();
      // Ateş klibi yalnız salvo sırasında oynar; arada nişan duruşunda donar (önceden atış olmasa da sürekli sarsılıyordu)
      if (a.eylemAtes && a.atesPozu && a.poz === "ayakta") a.eylemAtes.paused = this.saat - a.sonAtis > 0.3;
      a.karistirici?.update(dt);
      if (a.gecis && a.gecis.eylem.time >= a.gecis.son) this.gecisBitti(a);
      this.yuruyusuGuncelle(a, dt);
      this.katmaniGuncelle(a);
      this.durusuUygula(a, dt);
      this.bakisiUygula(a, dt);
      this.solEliOturt(a, dt);
      this.egimeHizala(a, dt);
      // Kuleli ağır silah: gövde yerinde, kule düşmana döner
      if (a.agirSilah && a.kule) this.kuleyiDondur(a, dt);
      // Çatışmada silahlı, sabit figürler (kulesiz) düşmana döner (yumuşak); yaralı dönmez
      if (a.silah && a.hiz === 0 && !(a.agirSilah && a.kule) && a.poz !== "yarali" && !a.yaninda && !a.yuruyus) {
        // Modelin ön yüzü (+z) düşman yönüne (sin a, 0, -cos a) baksın: θ = π − a. Ateş kesilince son düşman yönüne
        // bakmayı sürdürür (sırtını tehdide dönmez). Dönüş hızı sınırlı: ayakta 160 derece/sn, diz çökmüş 110, yatan 60
        // (önceden 180 derecelik dönüş 540 derece/sn ile başlıyor, yatan asker pusula iğnesi gibi dönüyordu).
        if (this.dusmanAzimutu !== null) a.sonDusman = this.dusmanAzimutu;
        const hedef = a.sonDusman === null ? a.temelDonus : Math.PI - radyan(a.sonDusman);
        this.yumusakDon(a, hedef, dt, 3, a.agirSilah ? 30 : a.poz === "yatmis" ? 60 : a.poz === "comelmis" ? 110 : 160);
      } else if (a.donusHedef !== null && !a.yuruyus) {
        if (this.yumusakDon(a, a.donusHedef, dt, 6, 220)) a.donusHedef = null;
      }
      if (a.hiz > 0) {
        // Yana hareket: izleyici etrafında teğet yönde (sağa, yansıt ise sola)
        const az = konumAzimutu(a.nesne.position);
        const tegets = new THREE.Vector3(Math.cos(radyan(az)), 0, Math.sin(radyan(az)));
        if (a.sola) tegets.negate();
        a.nesne.position.addScaledVector(tegets, a.hiz * dt);
        // Kaçınma (halka): önde duran figür/sütre varsa hattan içe ya da dışa çıkar (1,4 m, gerekirse 2,8), hat boşalınca
        // döner; yanal hız hareket hızının %90'ı. Konum her kare hat yarıçapı + sapma olarak kurulur (teğet adımın
        // yarıçapı büyütmesi de böyle sıfırlanır).
        a.kacinmaHedef = this.halkaKacinmasi(a);
        const adim = Math.min(Math.abs(a.kacinmaHedef - a.kacinma), a.hiz * 0.9 * dt) * Math.sign(a.kacinmaHedef - a.kacinma);
        if (adim !== 0) a.kacinma += adim;
        if (a.hatYaricapi >= 1) {
          const yeniAz = konumAzimutu(a.nesne.position);
          a.nesne.position.copy(azimutYon(yeniAz).multiplyScalar(a.hatYaricapi + a.kacinma));
        }
        a.nesne.position.y = zeminY(a.nesne.position.x, a.nesne.position.z);
        a.nesne.rotation.y = yanaDonus(konumAzimutu(a.nesne.position), a.sola);
        if (Math.abs(konumAzimutu(a.nesne.position)) > 165) a.bitti = true;
      }
    }
    for (const a of this.aktifler) {
      if (!a.bitti) continue;
      this.grup.remove(a.nesne);
      this.bittiOlayi?.(a.id);
    }
    this.aktifler = this.aktifler.filter((a) => !a.bitti);
  }
}
