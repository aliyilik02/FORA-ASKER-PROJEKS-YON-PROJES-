/**
 * Alan katmanı: bölgeye özgü 3B yapı / araç / sokak eşyası dizilimi (Meshy topluluk modelleri, CC0; seçim
 * artifact "Meshy Alan Modelleri", hazırlama `araclar/alan-modelleri-hazirla.mjs`). Manifest `alanlar` bölümü:
 *
 *   "alanlar": { "meskun_mahal": { "arkaPlanBolge": "daglik", "arazi": "hibrit", "araziYaricap": 130,
 *     "ogeler": [{ "dosya": "modeller/alan/bina_yikik_69.glb", "x": 17.2, "z": -29.4, "yonDerece": -90 }],
 *     "noktalar": [...], "yasak": [...] } }
 *
 * Konumlar sahne koordinatında (izleyici orijinde, ileri -z, sağ +x; `azimut`/`mesafe` de olur). Modeller
 * hazırlanırken gerçek ölçüye getirilir (taban y=0, x/z merkezde). `yonDerece` modelin ön yüzünü (+z) yukarıdan
 * bakınca saat yönünün tersine döndürür: 0 → izleyiciye, 90 → +x (sağa), -90 → -x (sola), 180 → ileri.
 * `noktalar`/`yasak` panoramanın yerleşim planının yerine geçer (main.ts): figür, patlama, helikopter sokağa düşer.
 * Bölge değişince modeller ve GPU kaynakları bırakılır (dizüstü Iris Xe belleği; bölge değişimi seyrek).
 */
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { radyan, yerKonumu, zeminY } from "./uzay";
import type { DokuntuObegi } from "./dokuntu";
import type { AracRotasi } from "./aracOlayi";
import type { YikilabilirDuvar } from "./yikilanDuvar";
import type { BayrakPlani } from "./bayrak";
import type { SokakPlani } from "./sokak";
import type { YasakAralik, YerlesimNoktasi } from "./yerlesim";

export interface AlanOgesi {
  /** glTF dosyası (manifest köküne göre). */
  dosya: string;
  /** Sahne konumu (m): x sağa, z geriye (ileri -z). Verilmezse `azimut` + `mesafe`. */
  x?: number;
  z?: number;
  azimut?: number;
  mesafe?: number;
  /** Ön yüzün (+z) dönüşü, derece: 0 izleyiciye, 90 → +x, -90 → -x, 180 → ileri. */
  yonDerece?: number;
  /** Zemin üstü yükseklik (m; çatıdaki güneş enerjili su ısıtıcı): verilirse taban izine oturtulmaz. */
  y?: number;
  /** Ek ölçek (model zaten gerçek ölçüde hazırlanır). */
  olcek?: number;
  /** Gölge düşürür mü (varsayılan evet). */
  golge?: boolean;
  /** Öne doğru yatırma (derece, yerel x ekseni): duvara yaslanmış saç levha, devrilmiş pano. */
  yatirDerece?: number;
  /** Renk tonu (CSS rengi, dokuyla çarpılır): taramanın rengini araziye yaklaştırmak için (turuncu çöl kayası → boz). */
  ton?: string;
}

export interface AlanPlani {
  /** Gök, uzak dağlar ve ışık için panoraması kullanılacak bölge (yakın binalar 3B olduğundan). */
  arkaPlanBolge?: string;
  /** Arazi kipi (kullanıcı `?arazi=` ile ezer). */
  arazi?: "kapali" | "hibrit" | "tam";
  /** 3B arazinin görünür yarıçapı (m); yapılar bunun içinde kalmalı. */
  araziYaricap?: number;
  ogeler: AlanOgesi[];
  noktalar?: YerlesimNoktasi[];
  yasak?: YasakAralik[];
  /**
   * Düşman ateş mevzileri (sahne x/z, y zemin üstü m): pencere ve çatı ağızları, barikat arkası. Çatışma ve izli mermi
   * düşman yönünün ±30°'sinde mevzi varsa uzak arazi yerine buradan ateş eder (catisma.ts).
   */
  dusmanMevzileri?: Array<{ x: number; y: number; z: number; ad?: string }>;
  /** Asfalt yol, bordürlü kaldırım, parke meydan, orta çizgi (sahne3b/sokak.ts). */
  sokak?: SokakPlani;
  /** Saçılmış küçük döküntü öbekleri (sahne3b/dokuntu.ts; film görünümü). */
  dokuntu?: DokuntuObegi[];
  /** Zırhlı araç olayının rotası (sahne3b/aracOlayi.ts). */
  aracRotasi?: AracRotasi;
  /** Patlamayla yıkılan tuğla duvarlar (sahne3b/yikilanDuvar.ts). */
  yikilabilir?: YikilabilirDuvar[];
  /** Direkte dalgalanan bayraklar (sahne3b/bayrak.ts). */
  bayraklar?: BayrakPlani[];
}

/** Film görünümü eki (manifest `alanlar.<bolge>_film`): temel plandan dosya adı `cikar`dakilerden birini içerenler atılır, `ekle` eklenir. */
export interface AlanFilmEki {
  cikar?: string[];
  ekle?: AlanOgesi[];
  dokuntu?: DokuntuObegi[];
  aracRotasi?: AracRotasi;
  yikilabilir?: YikilabilirDuvar[];
  bayraklar?: BayrakPlani[];
}

export function filmPlani(temel: AlanPlani, ek: AlanFilmEki | undefined): AlanPlani {
  if (!ek) return temel;
  const cikar = ek.cikar ?? [];
  return { ...temel, ogeler: [...temel.ogeler.filter((o) => !cikar.some((c) => o.dosya.includes(c))), ...(ek.ekle ?? [])], dokuntu: ek.dokuntu, aracRotasi: ek.aracRotasi ?? temel.aracRotasi, yikilabilir: ek.yikilabilir, bayraklar: ek.bayraklar };
}

/** Mermi izinin kestiği öğe kutusu: ince/uzun direk ve lambalar (kutusu çoğunlukla boş hava) ile çatı eşyası hariç. */
export function carpismaKutusuMu(kutu: THREE.Box3, catiEsyasi: boolean): boolean {
  if (catiEsyasi) return false;
  const en = Math.min(kutu.max.x - kutu.min.x, kutu.max.z - kutu.min.z);
  const yuk = kutu.max.y - kutu.min.y;
  return !(yuk > 5 && en < 1.5) && yuk > 0.3;
}

/**
 * Doğru parçası (x0,y0,z0)→(x1,y1,z1) ile eksen hizalı kutunun ilk kesişiminin parametresi (0–1), yoksa -1.
 * Başlangıcı kutunun içinde olan parça kesişim sayılmaz (pencereden ateş eden düşmanın izi kendi binasına çarpmaz).
 */
export function parcaKutuKesisimi(kutu: THREE.Box3, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): number {
  const { min, max } = kutu;
  if (x0 >= min.x && x0 <= max.x && y0 >= min.y && y0 <= max.y && z0 >= min.z && z0 <= max.z) return -1;
  let t0 = 0;
  let t1 = 1;
  const eksen = (p: number, d: number, a: number, b: number) => {
    if (Math.abs(d) < 1e-9) return p >= a && p <= b;
    let ta = (a - p) / d;
    let tb = (b - p) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    return t0 <= t1;
  };
  if (!eksen(x0, x1 - x0, min.x, max.x) || !eksen(y0, y1 - y0, min.y, max.y) || !eksen(z0, z1 - z0, min.z, max.z)) return -1;
  return t0;
}

/** Parçacık itmesinin ihtiyaç duyduğu alanlar (parcaciklar.ts Parcacik ile uyumlu). */
export interface ItilenParcacik {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  boyut: number;
  yercekimi: number;
}

/** Parçacık ızgarası hücresi (m) ve kutuların genişletme payı (en büyük parçacık yarıçapı, m). */
const HUCRE = 10;
const EN_BUYUK_YARICAP = 3;
const hucreAnahtari = (ix: number, iz: number) => (ix + 512) * 1024 + (iz + 512);

/**
 * Parçacığı kutunun dışına iter: merkez, kutunun boyutun %40'ı (en çok 3 m) genişletilmiş hacmindeyse en kısa yoldan
 * dışarı. Yandan itilirken duvara doğru hız söner (hafif geri teper) ve duman duvar boyunca yükselir; tepeye yakınsa
 * üstüne çıkar. Tepenin üstündeki parçacık serbest (duman binanın üstünden aşar). İtildiyse true.
 */
export function parcacigiKutudanIt(p: ItilenParcacik, kutu: THREE.Box3): boolean {
  const r = Math.min(EN_BUYUK_YARICAP, 0.4 * p.boyut);
  const ust = kutu.max.y + r * 0.5;
  if (p.y > ust || p.y < kutu.min.y - r) return false;
  const sol = p.x - (kutu.min.x - r);
  const sag = kutu.max.x + r - p.x;
  if (sol <= 0 || sag <= 0) return false;
  const on = p.z - (kutu.min.z - r);
  const arka = kutu.max.z + r - p.z;
  if (on <= 0 || arka <= 0) return false;
  const dx = Math.min(sol, sag);
  const dz = Math.min(on, arka);
  const dy = ust - p.y;
  if (dy <= dx && dy <= dz) {
    p.y = ust;
    if (p.vy < 0) p.vy = 0;
    return true;
  }
  if (dx <= dz) {
    if (sol < sag) {
      p.x -= sol;
      if (p.vx > 0) p.vx *= -0.15;
    } else {
      p.x += sag;
      if (p.vx < 0) p.vx *= -0.15;
    }
  } else if (on < arka) {
    p.z -= on;
    if (p.vz > 0) p.vz *= -0.15;
  } else {
    p.z += arka;
    if (p.vz < 0) p.vz *= -0.15;
  }
  // Yerçekimsiz duman/toz duvara dayanınca yükselir (yapı boyunca yukarı akar)
  if (p.yercekimi === 0 && p.vy < 0.4) p.vy += 0.15;
  return true;
}

export function ogeKonumu(o: AlanOgesi): THREE.Vector3 {
  if (typeof o.x === "number" && typeof o.z === "number") return new THREE.Vector3(o.x, 0, o.z);
  return yerKonumu(o.azimut ?? 0, o.mesafe ?? 20);
}

/** Taban izinin dört köşesi ve merkezindeki en alçak zemin: bina eğimli zeminde havada kalmasın (bir köşe gömülür). */
function tabanY(kutu: THREE.Box3): number {
  const { min, max } = kutu;
  const xs = [min.x, max.x, (min.x + max.x) / 2];
  const zs = [min.z, max.z, (min.z + max.z) / 2];
  let y = Infinity;
  for (const x of xs) for (const z of zs) y = Math.min(y, zeminY(x, z));
  return Number.isFinite(y) ? y : 0;
}

/**
 * Alan modeli doku sınırı (piksel, en uzun kenar). 10 Kasım profili: meskûn caddenin yavaşlığı üçgen değil ekran kartı
 * belleğiydi — alan 131 doku (34'ü 2048²) ≈ 1,2 GB; GTX 1650'nin 4 GB'ında taşıyordu. Dokular yerinde 512'ye
 * küçülünce kare süresi alan gizliyken ki kadar düştü (başsız ölçüm 102 → 33 ms). Renk ayrıntıyı taşır, normal/
 * pürüzlülük/AO yarı çözünürlükte fark etmez.
 */
export const ALAN_DOKU_SINIRI: Record<"dusuk" | "orta" | "yuksek", { renk: number; diger: number }> = {
  dusuk: { renk: 512, diger: 512 },
  orta: { renk: 1024, diger: 512 },
  yuksek: { renk: 2048, diger: 1024 },
};

/** Malzeme dokularını rolüne göre (renk / diğer) sınıra küçültür; yerinde (aynı Texture nesnesi, yeni resim). */
export function dokulariSinirla(kok: THREE.Object3D, sinir: { renk: number; diger: number }): number {
  const hedef = new Map<THREE.Texture, number>();
  const ekle = (t: unknown, s: number) => {
    if (!(t instanceof THREE.Texture)) return;
    hedef.set(t, Math.min(hedef.get(t) ?? Infinity, s));
  };
  kok.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    for (const mal of Array.isArray(m.material) ? m.material : [m.material]) {
      const std = mal as THREE.MeshStandardMaterial;
      ekle(std.map, sinir.renk);
      ekle(std.emissiveMap, sinir.renk);
      ekle(std.normalMap, sinir.diger);
      ekle(std.roughnessMap, sinir.diger);
      ekle(std.metalnessMap, sinir.diger);
      ekle(std.aoMap, sinir.diger);
    }
  });
  let kucuk = 0;
  for (const [t, s] of hedef) {
    const img = t.image as { width?: number; height?: number } | undefined;
    if (!img?.width || !img.height || Math.max(img.width, img.height) <= s || typeof document === "undefined") continue;
    const k = s / Math.max(img.width, img.height);
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.width * k));
    c.height = Math.max(1, Math.round(img.height * k));
    const ctx = c.getContext("2d");
    if (!ctx) continue;
    ctx.drawImage(t.image as CanvasImageSource, 0, 0, c.width, c.height);
    (t.image as { close?: () => void }).close?.(); // ImageBitmap belleği hemen bırakılsın
    t.image = c;
    t.needsUpdate = true;
    kucuk++;
  }
  return kucuk;
}

export class AlanKatmani {
  /** Doku sınırı (sahne3b kaliteye göre verir; yoksa küçültme yok). */
  dokuSiniri: { renk: number; diger: number } | null = null;
  readonly grup = new THREE.Group();
  private readonly yukleyici = new GLTFLoader();
  private readonly onbellek = new Map<string, Promise<GLTF>>();
  private aktifPlan: AlanPlani | null = null;
  private nesil = 0;
  /** Yerleşmiş öğelerin taban izi (x/z denetimi; y zemine oturtulurken değişir). */
  private readonly izler: Array<{ nesne: THREE.Object3D; kutu: THREE.Box3; y?: number }> = [];
  /** Yüklenemeyen model (köprü günlüğüne). */
  uyari: ((mesaj: string) => void) | null = null;

  get plan(): AlanPlani | null {
    return this.aktifPlan;
  }

  get ogeSayisi(): number {
    return this.izler.length;
  }

  private yukle(url: string) {
    let p = this.onbellek.get(url);
    if (!p) {
      const sinir = this.dokuSiniri;
      p = this.yukleyici.loadAsync(url).then((g) => {
        if (sinir) dokulariSinirla(g.scene, sinir);
        return g;
      });
      this.onbellek.set(url, p);
    }
    return p;
  }

  /** Planı uygular; aynı plan zaten açıksa dokunmaz. null → alanı kaldırır. */
  ayarla(plan: AlanPlani | null | undefined, kok: string) {
    const yeni = plan ?? null;
    if (yeni === this.aktifPlan) return;
    this.temizle();
    this.aktifPlan = yeni;
    if (!yeni) return;
    const nesil = this.nesil;
    for (const o of yeni.ogeler) void this.yerlestir(o, kok, nesil);
  }

  /** Bütün öğeleri kaldırır ve GPU kaynaklarını bırakır (önbellek de boşalır). */
  temizle() {
    this.nesil++;
    for (const c of [...this.grup.children]) this.grup.remove(c);
    this.izler.length = 0;
    this.izgara = null;
    this.aktifPlan = null;
    const bekleyen = [...this.onbellek.values()];
    this.onbellek.clear();
    for (const p of bekleyen) {
      void p
        .then((g) => {
          const dokular = new Set<THREE.Texture>();
          g.scene.traverse((o) => {
            const m = o as THREE.Mesh;
            if (!m.isMesh) return;
            m.geometry.dispose();
            for (const mal of Array.isArray(m.material) ? m.material : [m.material]) {
              for (const deger of Object.values(mal)) if (deger instanceof THREE.Texture) dokular.add(deger);
              mal.dispose();
            }
          });
          for (const d of dokular) d.dispose();
        })
        .catch(() => undefined);
    }
  }

  private async yerlestir(o: AlanOgesi, kok: string, nesil: number) {
    const url = /^(https?:|data:|blob:|\/)/.test(o.dosya) ? o.dosya : kok + o.dosya;
    let gltf: GLTF;
    try {
      gltf = await this.yukle(url);
    } catch {
      if (nesil === this.nesil) this.uyari?.(`Alan modeli yüklenemedi: ${o.dosya}`);
      return;
    }
    if (nesil !== this.nesil) return;
    // Aynı model birden çok yerde kullanılabilir: geometri/malzeme paylaşılır, düğümler kopyalanır
    const nesne = gltf.scene.clone(true);
    const golge = o.golge !== false;
    nesne.traverse((c) => {
      const m = c as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = golge;
      m.receiveShadow = true;
      if (o.ton) {
        // Ton bu kopyaya özel: malzeme kopyalanır (dokular paylaşılır)
        const tonla = (mal: THREE.Material) => {
          const k = mal.clone() as THREE.MeshStandardMaterial;
          k.color?.multiply(new THREE.Color(o.ton));
          return k;
        };
        m.material = Array.isArray(m.material) ? m.material.map(tonla) : tonla(m.material);
      }
    });
    const p = ogeKonumu(o);
    nesne.position.set(p.x, 0, p.z);
    nesne.rotation.order = "YXZ";
    nesne.rotation.y = radyan(o.yonDerece ?? 0);
    if (o.yatirDerece) nesne.rotation.x = radyan(o.yatirDerece);
    if (o.olcek && o.olcek > 0) nesne.scale.setScalar(o.olcek);
    nesne.userData.alanDosya = o.dosya;
    this.grup.add(nesne);
    const iz = { nesne, kutu: new THREE.Box3(), y: o.y };
    this.izler.push(iz);
    this.oturt(iz);
    this.izgara = null; // parçacık ızgarası yeni öğeyle yeniden kurulur
  }

  private oturt(iz: { nesne: THREE.Object3D; kutu: THREE.Box3; y?: number }) {
    if (typeof iz.y === "number") {
      // Çatıdaki eşya: binanın oturduğu zemin + verilen yükseklik (binayla aynı en alçak nokta kuralı yaklaşık)
      iz.nesne.position.y = zeminY(iz.nesne.position.x, iz.nesne.position.z) + iz.y;
      iz.nesne.updateMatrixWorld(true);
      iz.kutu.setFromObject(iz.nesne);
      return;
    }
    iz.nesne.position.y = 0;
    iz.nesne.updateMatrixWorld(true);
    iz.kutu.setFromObject(iz.nesne);
    iz.nesne.position.y = tabanY(iz.kutu);
    iz.nesne.updateMatrixWorld(true);
    iz.kutu.setFromObject(iz.nesne);
  }

  /** Arazi yeniden kurulunca öğeleri yeni zemine oturtur. */
  zemineOturt() {
    for (const iz of this.izler) this.oturt(iz);
  }

  /** (x, z) bir öğenin taban izine `pay` metreden yakın mı (asker binanın / aracın içine konmasın). */
  doluMu(konum: THREE.Vector3, pay = 0.6): boolean {
    for (const { kutu, y } of this.izler) {
      if (typeof y === "number") continue; // çatı eşyası zemini kaplamaz
      if (konum.x > kutu.min.x - pay && konum.x < kutu.max.x + pay && konum.z > kutu.min.z - pay && konum.z < kutu.max.z + pay) return true;
    }
    return false;
  }

  /** (x, z)'den en yakın zemin öğesinin taban izine yatay uzaklık (m; içindeyse 0, öğe yoksa Infinity). Krater boyu için. */
  enYakinMesafe(konum: THREE.Vector3): number {
    let enAz = Infinity;
    for (const { kutu, y } of this.izler) {
      if (typeof y === "number") continue;
      const dx = Math.max(kutu.min.x - konum.x, 0, konum.x - kutu.max.x);
      const dz = Math.max(kutu.min.z - konum.z, 0, konum.z - kutu.max.z);
      enAz = Math.min(enAz, Math.hypot(dx, dz));
    }
    return enAz;
  }

  /** (x, z)'deki en yüksek öğe tepesi (dünya y; yoksa -Infinity): helikopter binaların üstünden geçsin. */
  tepeYuksekligi(x: number, z: number): number {
    let y = -Infinity;
    for (const { kutu } of this.izler) if (x >= kutu.min.x && x <= kutu.max.x && z >= kutu.min.z && z <= kutu.max.z) y = Math.max(y, kutu.max.y);
    return y;
  }

  /** Parçacık ızgarası: hücre → o hücreye (genişletilmiş) değen katı kutular; öğeler değişince yeniden kurulur. */
  private izgara: Map<number, THREE.Box3[]> | null = null;

  private izgaraKur(): Map<number, THREE.Box3[]> {
    const izgara = new Map<number, THREE.Box3[]>();
    for (const { kutu, y } of this.izler) {
      if (!carpismaKutusuMu(kutu, typeof y === "number")) continue;
      const x0 = Math.floor((kutu.min.x - EN_BUYUK_YARICAP) / HUCRE);
      const x1 = Math.floor((kutu.max.x + EN_BUYUK_YARICAP) / HUCRE);
      const z0 = Math.floor((kutu.min.z - EN_BUYUK_YARICAP) / HUCRE);
      const z1 = Math.floor((kutu.max.z + EN_BUYUK_YARICAP) / HUCRE);
      for (let ix = x0; ix <= x1; ix++)
        for (let iz = z0; iz <= z1; iz++) {
          const a = hucreAnahtari(ix, iz);
          const liste = izgara.get(a);
          if (liste) liste.push(kutu);
          else izgara.set(a, [kutu]);
        }
    }
    this.izgara = izgara;
    return izgara;
  }

  /** Toz/duman/ateş parçacığını yapıların dışına iter (parcaciklar.ts ParcacikGrubu.engel); yapı yoksa hiçbir şey. */
  parcacikIt(p: ItilenParcacik) {
    if (!this.izler.length) return;
    const liste = (this.izgara ?? this.izgaraKur()).get(hucreAnahtari(Math.floor(p.x / HUCRE), Math.floor(p.z / HUCRE)));
    if (!liste) return;
    for (let i = 0; i < liste.length; i++) parcacigiKutudanIt(p, liste[i]);
  }

  /** Mermi izi parçasının ilk çarptığı öğe kutusunun parametresi (0–1), yoksa -1 (direk, lamba, çatı eşyası hariç). */
  kesisim(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): number {
    let enAz = -1;
    for (const { kutu, y } of this.izler) {
      if (!carpismaKutusuMu(kutu, typeof y === "number")) continue;
      const t = parcaKutuKesisimi(kutu, x0, y0, z0, x1, y1, z1);
      if (t >= 0 && (enAz < 0 || t < enAz)) enAz = t;
    }
    return enAz;
  }

  /** Planın düşman mevzileri, dünya koordinatında (y = zemin + mevzi yüksekliği). */
  dusmanMevzileri(): THREE.Vector3[] {
    return (this.aktifPlan?.dusmanMevzileri ?? []).map((m) => new THREE.Vector3(m.x, zeminY(m.x, m.z) + m.y, m.z));
  }
}
