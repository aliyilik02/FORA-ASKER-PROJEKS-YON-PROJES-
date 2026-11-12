/**
 * Düşman atıcıları (siluet): alan planının mevzilerinde (pencere, çatı kenarı, kaya, yıkık duvar) görünen silahlı
 * figürler. Amaç tehdidin yerini göstermek: kursiyer ateşin hangi pencereden geldiğini görür, eğitmen "saat 11, çatı"
 * diyebilir. Duvardaki düşman küçük ve koyudur (30 m'de göğüs üstü ~20 piksel); okunurluğu hareket (doğrulma/çökme)
 * ve namlu parıltısı sağlar.
 *
 *  - Mevzi (manifest `dusmanMevzileri`, `siluet: true`): `x`/`z` figürün durduğu yer (binanın İÇİ, pencere boşluğunun
 *    ya da çatı kenarının arkası), `y` örtü çizgisinin zemin üstü yüksekliği (pencere denizliği, çatı kenarı, kaya
 *    tepesi). Figür örtü çizgisinin altında saklanır, ateş için ~0,8 m yükselir (namlu çizginin 0,5 m üstünde), salvo
 *    bitince çöker. Çizginin altı hiç çizilmez (kesme düzlemi): bacaklar alt kat penceresinden ya da çatının altından
 *    görünmez. `siluet` olmayan (eski) mevzi yalnız parıltı verir; `y` o zaman ateş noktasının yüksekliğidir.
 *  - Arazi mevzisi: plan mevzisi olmayan yönde (açık arazi) atıcı sırtın hemen gerisinde durur; yer arazi yüksekliğinden
 *    hesaplanır (`araziMevzileriBul`: göz hattının zeminin ~1 m üstünden geçtiği yer), 3B arazinin kenar sisinden
 *    önceki bölümünde (40–140 m). Sırt da yoksa görünen yamaçta açık arazi mevzisi (`acikAraziMevzileriBul`: atıcı
 *    otların içinden diz çöker gibi doğrulur, 55–95 m). Arazi kapalıyken çıkmaz: eski uzak kaynak (150–260 m, yalnız
 *    parıltı) kalır.
 *  - Kalıcılık (`dusmanYerlesimi.ts`): şiddete göre 2–4 atıcı birer mevzi tutar, 3–6 salvo atar, sonra başka mevziye
 *    geçer. İzli mermi akışını 1–2 makineli besler (14–26 sn aynı yerde, akış sürdükçe ayakta).
 *  - Telegraf: salvo istenince figür 0,3 sn'de doğrulur, ilk mermi ondan sonra çıkar (catisma.ts gecikmesi); her atışta
 *    namlu parıltısı figürü de aydınlatır (gece siluet yalnız o anda seçilir).
 *  - Geri bildirim: yakınına patlama düşen mevzi 25–45 sn susar (`patlamaOldu`); üstüne ateş açılan atıcı birkaç saniye
 *    başını kaldıramaz (`baskila`: zırhlı araç, dost ateşi).
 *  - Model: kendi asker modelimizin koyu tonlu kopyası (manifest `dusman`); iskelet + nişan klibi. Gölge düşürmez
 *    (kesilmiş gövdenin tam gölgesi yanlış olurdu), gölge alır. Saklıyken görünmez, karıştırıcı çalışmaz.
 */
import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as iskeletKopyala } from "three/examples/jsm/utils/SkeletonUtils.js";
import { rastgele } from "../rastgele";
import { acikAraziMevzileriBul, araziMevzileriBul, aticiSayisi, izliAticiSayisi, koniAdaylari, mevziSec, type MevziKonumu } from "./dusmanYerlesimi";
import { derece, radyan, zeminY } from "./uzay";

export interface DusmanMevzisi {
  ad?: string;
  /** Sahne konumu (m). Siluetli mevzide figürün durduğu yer; eski mevzide ateş noktası. */
  x: number;
  z: number;
  /** Zemin üstü yükseklik (m). Siluetli mevzide örtü çizgisi (denizlik, çatı kenarı); eski mevzide ateş noktası. */
  y: number;
  /** Figür görünür (geometriye göre doğrulanmış mevzi; `araclar/oyun-testi/dusman-mevzi-bul.mjs`). */
  siluet?: boolean;
  /** false: örtü çizgisinin altı kesilmez (önünde gerçek siper olan zemin mevzisi). */
  kirp?: boolean;
  /** Araziden hesaplanmış mevzi (sırt gerisi; manifestte yazılmaz). */
  arazi?: boolean;
}

export interface DusmanModeli {
  /** glTF dosyası (manifest köküne göre). */
  dosya: string;
  boy?: number;
  /** Nişan klibi (kısa ad yeter). */
  animasyon?: string;
  /** Koyulaştırma tonu (CSS rengi; dokuyla çarpılır). */
  ton?: string;
  silahModeli?: { dosya: string; kemik: string; konum?: [number, number, number]; donus?: [number, number, number]; boy?: number };
}

export type DusmanKanali = "salvo" | "izli";

export interface AticiYaniti {
  /** Namlu ucu (dünya; atıcı ayaktayken). Çağıran kopyalamalı. */
  konum: THREE.Vector3;
  /** Atıcı doğruldu, ateş edebilir (siluetsiz mevzi hep hazır). */
  hazir: boolean;
  no: number;
  siluet: boolean;
}

/** Namlunun örtü çizgisinden yüksekliği (m): göğüs üstü görünür. */
const NAMLU_USTU = 0.5;
/** Saklanma derinliği (m): baş çizginin altına iner. */
const COKME = 0.95;
const KALKIS_SURESI = 0.3;
const INIS_SURESI = 0.26;
/** Aynı anda en çok figür (4 çatışma + 2 izli). Tanılama görünümü bu sınırı aşabilir. */
const EN_COK_FIGUR = 6;
const VARSAYILAN_TON = "#8a8074";
const VARSAYILAN_NISAN = "Rifle Aiming Idle";

interface Figur {
  kok: THREE.Group;
  karistirici: THREE.AnimationMixer | null;
  malzemeler: THREE.MeshStandardMaterial[];
  duzlem: THREE.Plane;
  mesgul: boolean;
  /**
   * Isınma: figür üretilince izleyicinin 60 m altında birkaç kare gerçekten çizilir (ayıklamasız), sonra gizlenir.
   * Kesme düzlemli iskelet programı ancak gerçek çizimde derlenir (three `compile` kesme düzlemi sayısını bilmez);
   * böylece derleme takılması sahne yüklenirken olur, çatışmanın ortasında ilk doğrulmada değil.
   */
  isinma: { cizim: number; aglar: THREE.Mesh[] } | null;
}

/** Isınmada figürün gerçekten çizilmesi gereken kare sayısı (duvar başına bir çizim: 3 duvar ≈ 1 kare). */
const ISINMA_CIZIMI = 6;

interface Isgal {
  no: number;
  mevzi: number;
  kanal: DusmanKanali | "tani";
  /** Salvo kanalı: kalan salvo; izli: kalan saniye. */
  kalan: number;
  sonIstek: number;
  /** 0 saklı … 1 ayakta. */
  yukselme: number;
  ayaktaKal: number;
  bastirma: number;
  /** Bu tur bitince (çökünce) mevziyi bırak. */
  sonTur: boolean;
  birak: boolean;
  vuruldu: boolean;
  siluet: boolean;
  figur: Figur | null;
  parlama: number;
  geriTepme: number;
  faz: number;
  ortuY: number;
  yaw: number;
  pitch: number;
  /** Ayaktayken kök konumu ve namlu ucu (dünya). */
  taban: THREE.Vector3;
  namlu: THREE.Vector3;
}

const _e = new THREE.Euler(0, 0, 0, "YXZ");
const _v = new THREE.Vector3();
const _k = new THREE.Vector3();

function klipBul(klipler: THREE.AnimationClip[], ad: string): THREE.AnimationClip | null {
  const kisa = (k: THREE.AnimationClip) => (k.name.split(/[|/]/).pop() ?? "").trim();
  return klipler.find((k) => k.name === ad) ?? klipler.find((k) => kisa(k) === ad) ?? null;
}

const yumusak = (t: number) => t * t * (3 - 2 * t);

export class DusmanKatmani {
  readonly grup = new THREE.Group();
  /** `?dusman=kapali`: figür çizilmez (yalnız parıltı); mevzi kalıcılığı yine geçerli. */
  siluetAcik = true;
  uyari: ((mesaj: string) => void) | null = null;

  /**
   * 3B arazi bilgisi (sahne3b): açıksa görünür yarıçapı (m), kapalıysa null. Verilirse plan mevzisi olmayan yönde sırt
   * gerisi arazi mevzileri hesaplanır.
   */
  araziBilgisi: (() => { yaricap: number } | null) | null = null;
  /** Gözden (orijin) noktaya giden doğru bir alan yapısına takılıyor mu (sahne3b → AlanKatmani.kesisim). */
  gorusEngeli: ((x: number, y: number, z: number) => boolean) | null = null;

  /** Plan mevzileri, ardından araziden hesaplananlar (aynı dizide; `planSayisi`den sonrası arazi). */
  private mevziler: DusmanMevzisi[] = [];
  private plan: DusmanMevzisi[] = [];
  private dost: Array<{ x: number; z: number; yaricap: number }> = [];
  private dostImzasi = "[]";
  /** Arazi mevzisi hesaplanmış yön dilimleri (10°). */
  private readonly araziDilimleri = new Set<number>();
  private isgaller: Isgal[] = [];
  private figurler: Figur[] = [];
  /** Mevzi no → yeniden kullanılabileceği saat (patlamayla susturuldu). */
  private readonly etkisiz = new Map<number, number>();
  private sonBirakilan: number | null = null;
  private saat = 0;
  private sayac = 0;

  private gltf: GLTF | null = null;
  private silahGltf: GLTF | null = null;
  private tanim: DusmanModeli | null = null;
  private modelImzasi = "";
  private readonly ton = new THREE.Color(VARSAYILAN_TON);
  /** Nişan pozunda namlu ucu, figür köküne göre (m; ölçülür). */
  private readonly namluOfseti = new THREE.Vector3(0.06, 1.42, 0.72);
  private readonly kalca = new THREE.Vector3(0, 0.95, 0);

  /** Model yüklendi, figür üretilebilir. */
  get hazir(): boolean {
    return this.gltf !== null;
  }

  /**
   * Düşman modeli (manifest `dusman`). `yukle` figür katmanının önbellekli yükleyicisi: aynı GLB (kendi askerimiz)
   * ikinci kez indirilmez, dokuları ekran kartına ikinci kez yüklenmez.
   */
  modelAyarla(tanim: DusmanModeli | null, kok: string, yukle: (url: string) => Promise<GLTF>) {
    const imza = JSON.stringify([tanim, kok]);
    if (imza === this.modelImzasi) return;
    this.modelImzasi = imza;
    this.tanim = tanim;
    if (!tanim) return;
    this.ton.set(tanim.ton ?? VARSAYILAN_TON);
    const url = (dosya: string) => (/^(https?:|data:|blob:|\/)/.test(dosya) ? dosya : kok + dosya);
    const silah = tanim.silahModeli ? yukle(url(tanim.silahModeli.dosya)).catch(() => null) : Promise.resolve(null);
    void Promise.all([yukle(url(tanim.dosya)), silah]).then(
      ([g, s]) => {
        if (imza !== this.modelImzasi) return;
        this.gltf = g;
        this.silahGltf = s;
        // İki figür önden: ilk salvoda kopyalama/derleme beklenmez
        for (let i = 0; i < 2; i++) this.figurUret();
      },
      () => this.uyari?.(`Düşman modeli yüklenemedi: ${tanim.dosya}`),
    );
  }

  /**
   * Etkin alan planının mevzileri (plan değişince atıcılar ve susturmalar sıfırlanır). `dost`: dost yapılarının
   * yerleri (bayrak direği, gözetleme kulesi); yarıçapı içindeki plan ve arazi mevzileri kullanılmaz
   * (düşman kendi bayrağımızın dibinden ateş etmesin).
   */
  mevzileriAyarla(mevziler: DusmanMevzisi[] | undefined, dost: Array<{ x: number; z: number; yaricap: number }> = []) {
    const yeni = mevziler ?? [];
    const dostImzasi = JSON.stringify(dost);
    if ((yeni === this.plan || (yeni.length === 0 && this.plan.length === 0)) && dostImzasi === this.dostImzasi) return;
    this.plan = yeni;
    this.dost = dost;
    this.dostImzasi = dostImzasi;
    this.araziDegisti();
  }

  private dostYakini(x: number, z: number): boolean {
    return this.dost.some((d) => Math.hypot(d.x - x, d.z - z) < d.yaricap);
  }

  /** Arazi yeniden kuruldu (bölge, kip, mevsim): arazi mevzileri ve atıcılar sıfırlanır; plan mevzileri kalır. */
  araziDegisti() {
    this.temizle();
    this.mevziler = this.plan.filter((m) => !this.dostYakini(m.x, m.z));
    this.araziDilimleri.clear();
  }

  get mevziSayisi(): number {
    return this.mevziler.length;
  }

  private mevziKonumlari(): MevziKonumu[] {
    return this.mevziler.map((m, no) => ({ no, x: m.x, z: m.z, azimut: derece(Math.atan2(m.x, -m.z)), mesafe: Math.hypot(m.x, m.z) }));
  }

  /**
   * Yön diliminde sırt gerisi arazi mevzilerini hesaplayıp listeye ekler (dilim başına bir kez). Eklenen varsa true.
   * Göz hattı alan yapısına takılan (evin arkası) ve mevcut mevzilere 8 m'den yakın olanlar atılır.
   */
  private araziMevzileriEkle(azimut: number, aci: number): boolean {
    const bilgi = this.araziBilgisi?.();
    if (!bilgi) return false;
    const dilim = Math.round(azimut / 10);
    if (this.araziDilimleri.has(dilim)) return false;
    this.araziDilimleri.add(dilim);
    // Sırt gerisi: 3B arazinin kenar sisine girmeden (görünür yarıçapın %86'sı, en çok 140 m)
    const enUzak = Math.min(140, bilgi.yaricap * 0.86);
    if (enUzak < 45) return false;
    let n = 0;
    const ekle = (m: { x: number; y: number; z: number; azimut: number; mesafe: number }, tur: string) => {
      if (this.mevziler.some((v) => Math.hypot(v.x - m.x, v.z - m.z) < 8) || this.dostYakini(m.x, m.z)) return;
      if (this.gorusEngeli?.(m.x, zeminY(m.x, m.z) + m.y + 0.5, m.z)) return;
      this.mevziler.push({ ad: `${tur} ${Math.round(m.azimut)}° ${Math.round(m.mesafe)} m`, x: m.x, y: m.y, z: m.z, siluet: true, arazi: true });
      n++;
    };
    for (const m of araziMevzileriBul(zeminY, azimut, aci, 40, enUzak)) ekle(m, "sırt");
    // Yönde hâlâ üçten az mevzi varsa (sırt yok ya da uzak): görünen yamaçta açık arazi mevzileri (otların içinden
    // doğrulan atıcı), 55–95 m; en çok dört
    const konide = () => koniAdaylari(this.mevziKonumlari(), azimut, aci).length;
    if (konide() < 3) {
      for (const m of acikAraziMevzileriBul(zeminY, azimut, aci, 55, Math.min(95, enUzak))) {
        if (konide() >= 4) break;
        ekle(m, "açık arazi");
      }
    }
    return n > 0;
  }

  private figurUret(): Figur | null {
    const g = this.gltf;
    const tanim = this.tanim;
    if (!g || !tanim) return null;
    const nesne = iskeletKopyala(g.scene) as THREE.Object3D;
    const duzlem = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e4);
    const malzemeler: THREE.MeshStandardMaterial[] = [];
    const cevrilen = new Map<THREE.Material, THREE.MeshStandardMaterial>();
    const cevir = (mal: THREE.Material) => {
      let k = cevrilen.get(mal);
      if (k) return k;
      k = mal.clone() as THREE.MeshStandardMaterial;
      if (k.color) k.color.multiply(this.ton);
      if ("roughness" in k) k.roughness = 1;
      if ("metalness" in k) k.metalness = 0;
      if ("envMapIntensity" in k) k.envMapIntensity = 0.6;
      // Örtü çizgisinin altı çizilmez; namlu parıltısı figürü kendi dokusuyla aydınlatır
      k.clippingPlanes = [duzlem];
      if (k.emissive) {
        k.emissive.setRGB(1, 0.74, 0.45);
        k.emissiveIntensity = 0;
        k.emissiveMap = k.map ?? null;
      }
      // Renk soldurulur (doygunluğun %30'u kalır): model kendi askerimizdir, kamuflaj deseni ve bordo bere düşmanda
      // seçilmemeli; namlu parıltısının aydınlattığı karede de (ışıma dokusu aynı doku) koyu, renksiz bir figür kalır
      k.onBeforeCompile = (g) => {
        g.fragmentShader = g.fragmentShader
          .replace("#include <map_fragment>", "#include <map_fragment>\n  diffuseColor.rgb = mix(vec3(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114))), diffuseColor.rgb, 0.3);")
          .replace(
            "#include <emissivemap_fragment>",
            "#ifdef USE_EMISSIVEMAP\n  vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );\n  totalEmissiveRadiance *= mix(vec3(dot(emissiveColor.rgb, vec3(0.299, 0.587, 0.114))), emissiveColor.rgb, 0.3);\n#endif",
          );
      };
      k.customProgramCacheKey = () => "dusmanSoluk";
      cevrilen.set(mal, k);
      malzemeler.push(k);
      return k;
    };
    const boya = (kok: THREE.Object3D) =>
      kok.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.castShadow = false;
        m.receiveShadow = true;
        m.material = Array.isArray(m.material) ? m.material.map(cevir) : cevir(m.material);
        const sm = m as THREE.SkinnedMesh;
        if (sm.isSkinnedMesh) {
          // figurler3b ile aynı: sınır küresi bind-pozdan, pozlar sığsın diye ×2,5
          try {
            sm.computeBoundingSphere();
            if (sm.boundingSphere) sm.boundingSphere.radius *= 2.5;
            m.frustumCulled = Boolean(sm.boundingSphere);
          } catch {
            m.frustumCulled = false;
          }
        }
      });
    boya(nesne);
    nesne.updateMatrixWorld(true);
    const kutu = new THREE.Box3().setFromObject(nesne, true);
    const yukseklik = kutu.max.y - kutu.min.y;
    const boy = tanim.boy ?? 1.8;
    const olcek = yukseklik > 1e-4 ? boy / yukseklik : 1;
    nesne.scale.setScalar(olcek);
    nesne.position.y = -kutu.min.y * olcek;
    const kok = new THREE.Group();
    kok.rotation.order = "YXZ";
    kok.add(nesne);
    kok.visible = false;

    let karistirici: THREE.AnimationMixer | null = null;
    const klip = klipBul(g.animations ?? [], tanim.animasyon ?? VARSAYILAN_NISAN) ?? g.animations?.[0] ?? null;
    if (klip) {
      karistirici = new THREE.AnimationMixer(nesne);
      const e = karistirici.clipAction(klip);
      e.setLoop(THREE.LoopRepeat, Infinity);
      e.play();
      e.time = rastgele() * klip.duration;
      e.timeScale = 0.9 + rastgele() * 0.2;
      karistirici.update(0);
    }

    // Elde tüfek (figurler3b ile aynı soket hesabı: metre → kemik yerel birimi)
    let silah: THREE.Object3D | null = null;
    let namluYerel: THREE.Vector3[] = [];
    let elKemigi: THREE.Object3D | null = null;
    const sm = tanim.silahModeli;
    if (sm && this.silahGltf) {
      elKemigi = nesne.getObjectByName(sm.kemik) ?? nesne.getObjectByName(sm.kemik.replace(/[^\w]/g, "")) ?? null;
      if (elKemigi) {
        silah = this.silahGltf.scene.clone(true);
        silah.updateMatrixWorld(true);
        const sk = new THREE.Box3().setFromObject(silah);
        const sb = sk.getSize(new THREE.Vector3());
        const merkez = sk.getCenter(new THREE.Vector3());
        const enUzun = Math.max(sb.x, sb.y, sb.z) || 1;
        const eksen = sb.x > sb.z ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
        namluYerel = [merkez.clone().addScaledVector(eksen, enUzun / 2), merkez.clone().addScaledVector(eksen, -enUzun / 2)];
        nesne.updateMatrixWorld(true);
        // Kemiğin dünya ölçeği (model ölçeği dahil): tüfek boyu ve soket konumu metre → kemik yerel birimi
        const kemikOlcek = elKemigi.getWorldScale(new THREE.Vector3()).x || 1;
        silah.scale.setScalar((sm.boy ?? 0.85) / enUzun / kemikOlcek);
        const p = sm.konum ?? [0, 0, 0];
        silah.position.set(p[0] / kemikOlcek, p[1] / kemikOlcek, p[2] / kemikOlcek);
        const d = sm.donus ?? [0, 0, 0];
        silah.rotation.set(radyan(d[0]), radyan(d[1]), radyan(d[2]));
        boya(silah);
        elKemigi.add(silah);
      }
    }

    // Namlu ucu ilk figürde ölçülür: nişan pozunda tüfeğin elden uzak ucu (kök koordinatında)
    if (this.figurler.length === 0) {
      this.kalca.set(0, 0.95 * (boy / 1.8), 0);
      if (silah && elKemigi && namluYerel.length) {
        kok.updateMatrixWorld(true);
        const el = elKemigi.getWorldPosition(new THREE.Vector3());
        const uclar = namluYerel.map((n) => silah!.localToWorld(n.clone()));
        const uc = uclar[0].distanceTo(el) >= uclar[1].distanceTo(el) ? uclar[0] : uclar[1];
        // Makul aralıkta ise (öne doğru, omuz hizası) kullan; değilse varsayılan kalır
        if (uc.z > 0.3 && uc.y > 0.9 * (boy / 1.8) && uc.y < 1.75 * (boy / 1.8)) this.namluOfseti.copy(uc);
      } else this.namluOfseti.set(0.06, 1.42, 0.72).multiplyScalar(boy / 1.8);
    }

    this.grup.add(kok);
    const figur: Figur = { kok, karistirici, malzemeler, duzlem, mesgul: false, isinma: null };
    this.figurler.push(figur);
    // Isınma: izleyicinin altında, ayıklamasız birkaç çizim (bkz. Figur.isinma)
    const aglar: THREE.Mesh[] = [];
    kok.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) aglar.push(o as THREE.Mesh);
    });
    if (aglar.length) {
      const isinma = { cizim: 0, aglar };
      figur.isinma = isinma;
      for (const a of aglar) a.frustumCulled = false;
      aglar[0].onBeforeRender = () => {
        isinma.cizim++;
      };
      kok.position.set(0, -60, 0);
      kok.visible = true;
    }
    return figur;
  }

  /** Isınmayı bitirir: ayıklama geri açılır (iskeletli ağda sınır küresi varsa), çizim sayacı kalkar. */
  private isinmayiBitir(f: Figur) {
    const i = f.isinma;
    if (!i) return;
    f.isinma = null;
    i.aglar[0].onBeforeRender = () => undefined;
    for (const a of i.aglar) a.frustumCulled = !(a as THREE.SkinnedMesh).isSkinnedMesh || Boolean((a as THREE.SkinnedMesh).boundingSphere);
    if (!f.mesgul) f.kok.visible = false;
  }

  private figurAl(sinirsiz = false): Figur | null {
    if (!this.siluetAcik) return null;
    const bos = this.figurler.find((f) => !f.mesgul);
    const f = bos ?? (sinirsiz || this.figurler.length < EN_COK_FIGUR ? this.figurUret() : null);
    if (f) {
      f.mesgul = true;
      this.isinmayiBitir(f); // ısınması bitmeden göreve çıkan figür ilk çiziminde derlenir
    }
    return f;
  }

  /** Atıcının ayaktaki yeri, yönü (izleyicinin önüne nişan) ve namlu ucu. */
  private yerlestir(i: Isgal) {
    const m = this.mevziler[i.mevzi];
    i.ortuY = zeminY(m.x, m.z) + m.y;
    if (!i.siluet) {
      i.namlu.set(m.x, i.ortuY, m.z);
      return;
    }
    const namluY = i.ortuY + NAMLU_USTU;
    i.yaw = Math.atan2(-m.x, -m.z);
    // Hedef izleyicinin bel hizası: yukarıdaki atıcı öne eğilir (kalçadan), aşağıdaki hafif kaldırır
    i.pitch = Math.max(-0.12, Math.min(0.5, Math.atan2(namluY + 0.6, Math.hypot(m.x, m.z))));
    _e.set(i.pitch, i.yaw, 0, "YXZ");
    _v.copy(this.namluOfseti).sub(this.kalca).applyEuler(_e).add(this.kalca);
    i.taban.set(m.x, namluY - _v.y, m.z);
    i.namlu.set(m.x + _v.x, namluY, m.z + _v.z);
  }

  private isgalEt(mevzi: number, kanal: Isgal["kanal"], sinirsiz = false): Isgal {
    const m = this.mevziler[mevzi];
    const figur = m.siluet && this.gltf ? this.figurAl(sinirsiz) : null;
    const i: Isgal = {
      no: ++this.sayac,
      mevzi,
      kanal,
      kalan: kanal === "salvo" ? 3 + Math.floor(rastgele() * 4) : 14 + rastgele() * 12,
      sonIstek: this.saat,
      yukselme: 0,
      ayaktaKal: 0,
      bastirma: 0,
      sonTur: false,
      birak: false,
      vuruldu: false,
      siluet: figur !== null,
      figur,
      parlama: 0,
      geriTepme: 0,
      faz: rastgele() * 6.28,
      ortuY: 0,
      yaw: 0,
      pitch: 0,
      taban: new THREE.Vector3(),
      namlu: new THREE.Vector3(),
    };
    this.yerlestir(i);
    this.isgaller.push(i);
    return i;
  }

  /**
   * Yönün `aci` derecesindeki mevzilerden ateş edecek atıcı. Salvo kanalında salvo başına bir kez (atıcı doğrulur,
   * salvo sayısı düşer), izli kanalında her mermide çağrılır. Dönen: atıcı; "sustu" (mevzi var ama hepsi susturulmuş
   * ya da baskı altında: ateş yok); null (o yönde mevzi yok: çağıran uzak arazi kaynağına düşer).
   */
  aticiIste(azimut: number, aci: number, taraf: number, kanal: DusmanKanali, yogunluk: number): AticiYaniti | "sustu" | null {
    // Arazi mevzileri yalnız düz akışta (taraf 0): çaprazlama izli mermi cadde cephelerine göredir
    const koniSec = (liste: MevziKonumu[]) => koniAdaylari(liste, azimut, aci, taraf).filter((k) => !taraf || !this.mevziler[k.no].arazi);
    let konumlar = this.mevziKonumlari();
    let koni = koniSec(konumlar);
    // O yönde mevzi yok: açık arazide sırt gerisi mevziler (dilim başına bir kez hesaplanır)
    if (!koni.length && !taraf && this.araziMevzileriEkle(azimut, aci)) {
      konumlar = this.mevziKonumlari();
      koni = koniSec(konumlar);
    }
    if (!koni.length) return null;
    const kullanilabilir = koni.filter((k) => (this.etkisiz.get(k.no) ?? 0) <= this.saat);
    // Koni dışına düşen (yön değişti) ya da susturulan mevzideki atıcı bırakılır
    for (const i of this.isgaller) if (i.kanal === kanal && !i.birak && !kullanilabilir.some((k) => k.no === i.mevzi)) i.birak = true;
    if (!kullanilabilir.length) return "sustu";
    const gecerli = this.isgaller.filter((i) => i.kanal === kanal && !i.birak && !i.sonTur);
    const hedefSayi = Math.min(kullanilabilir.length, kanal === "salvo" ? aticiSayisi(yogunluk) : izliAticiSayisi(yogunluk));
    let secilen: Isgal | null = null;
    if (gecerli.length < hedefSayi) {
      const dolu = new Set(this.isgaller.map((i) => i.mevzi));
      const m = mevziSec(
        kullanilabilir.filter((k) => !dolu.has(k.no)),
        konumlar.filter((k) => dolu.has(k.no)),
        this.sonBirakilan,
        rastgele,
      );
      if (m) secilen = this.isgalEt(m.no, kanal);
    }
    if (!secilen) {
      // Kendi kanalında yoksa (mevziler öbür kanalda) konideki herhangi bir atıcı paylaşılır
      const havuz = gecerli.length ? gecerli : this.isgaller.filter((i) => !i.birak && i.kanal !== "tani" && kullanilabilir.some((k) => k.no === i.mevzi));
      const adaylar = havuz.filter((i) => i.bastirma <= 0);
      if (!adaylar.length) return "sustu";
      // Salvo: en uzun süredir ateş etmeyen (atıcılar sırayla); izli: rastgele (iki makineli karışık)
      secilen = kanal === "salvo" ? adaylar.reduce((a, b) => (b.sonIstek < a.sonIstek ? b : a)) : adaylar[Math.floor(rastgele() * adaylar.length)];
    }
    secilen.sonIstek = this.saat;
    if (kanal === "salvo") {
      if (secilen.kanal === "salvo" && --secilen.kalan <= 0) secilen.sonTur = true;
      secilen.ayaktaKal = Math.max(secilen.ayaktaKal, 1.3);
    } else secilen.ayaktaKal = Math.max(secilen.ayaktaKal, 1.6);
    return { konum: secilen.namlu, hazir: !secilen.siluet || secilen.yukselme >= 0.9, no: secilen.no, siluet: secilen.siluet };
  }

  /** Atıcı ateş etti: parıltı figürü aydınlatır, geri tepme, ayakta kalma uzar. false: atıcı artık yok ya da baskı altında (salvo kesilir). */
  atisOldu(no: number): boolean {
    const i = this.isgaller.find((x) => x.no === no);
    if (!i || i.bastirma > 0 || i.vuruldu) return false;
    i.parlama = 1;
    i.geriTepme = 1;
    i.ayaktaKal = Math.max(i.ayaktaKal, i.kanal === "izli" ? 1.6 : 0.5 + rastgele() * 0.25);
    return true;
  }

  /**
   * Patlama: yatay `yaricap` içindeki mevziler 25–45 sn susar (oradaki atıcı düşer). Yüksek kat pencereleri de sayılır
   * (bina dibindeki patlama cepheyi susturur), 16 m'den yüksektekiler hariç. Dönen: susturulan mevzi sayısı.
   */
  patlamaOldu(p: THREE.Vector3, yaricap: number): number {
    let n = 0;
    this.mevziler.forEach((m, no) => {
      if (Math.hypot(m.x - p.x, m.z - p.z) > yaricap) return;
      if (zeminY(m.x, m.z) + m.y - p.y > 16) return;
      this.etkisiz.set(no, this.saat + 25 + rastgele() * 20);
      n++;
      for (const i of this.isgaller) {
        if (i.mevzi !== no || i.kanal === "tani") continue;
        i.vuruldu = true;
        i.birak = true;
        i.ayaktaKal = 0;
      }
    });
    return n;
  }

  /** Üstüne ateş açılan atıcı `sure` saniye başını kaldıramaz (zırhlı araç, dost ateşi). */
  baskila(p: THREE.Vector3, yaricap: number, sure: number) {
    for (const i of this.isgaller) {
      if (i.kanal === "tani" || i.namlu.distanceTo(p) > yaricap) continue;
      i.bastirma = Math.max(i.bastirma, sure);
      i.ayaktaKal = 0;
    }
  }

  /** Dost ateşinin ve zırhlı aracın nişan alacağı yer: mevzi tutan bir atıcı (ayaktaki öncelikli); yoksa null. */
  hedefNoktasi(): THREE.Vector3 | null {
    const adaylar = this.isgaller.filter((i) => i.kanal !== "tani" && !i.birak);
    if (!adaylar.length) return null;
    const ayakta = adaylar.filter((i) => i.yukselme > 0.5);
    const havuz = ayakta.length ? ayakta : adaylar;
    return havuz[Math.floor(rastgele() * havuz.length)].namlu;
  }

  guncelle(dt: number) {
    this.saat += dt;
    for (const f of this.figurler) if (f.isinma && f.isinma.cizim >= ISINMA_CIZIMI) this.isinmayiBitir(f);
    let canli = 0;
    for (let n = 0; n < this.isgaller.length; n++) {
      const i = this.isgaller[n];
      const tani = i.kanal === "tani";
      if (!tani) {
        // İzli makineli: akış sürdükçe süresi azalır; bitince yer değiştirir. İstek kesildiyse (çatışma durdu, yön
        // değişti) atıcı bırakılır (zaten çökmüştür)
        const bosta = this.saat - i.sonIstek;
        if (i.kanal === "izli" && bosta < 1) {
          i.kalan -= dt;
          if (i.kalan <= 0) i.sonTur = true;
        }
        if (bosta > (i.kanal === "salvo" ? 9 : 3)) i.birak = true;
        i.bastirma = Math.max(0, i.bastirma - dt);
        i.ayaktaKal -= dt;
      }
      const yukari = tani || (i.ayaktaKal > 0 && i.bastirma <= 0 && !i.birak && !(i.sonTur && i.kanal === "izli"));
      i.yukselme = Math.max(0, Math.min(1, i.yukselme + (yukari ? dt / KALKIS_SURESI : -dt / (i.vuruldu ? INIS_SURESI * 0.6 : INIS_SURESI))));
      if (!yukari && i.yukselme === 0 && (i.birak || i.sonTur)) {
        // Mevzi bırakılır; figür havuza döner
        if (i.figur) {
          i.figur.kok.visible = false;
          i.figur.mesgul = false;
        }
        this.sonBirakilan = i.mevzi;
        continue;
      }
      this.isgaller[canli++] = i;
      i.parlama = Math.max(0, i.parlama - dt / 0.07);
      i.geriTepme = Math.max(0, i.geriTepme - dt / 0.09);
      const f = i.figur;
      if (!f) continue;
      const e = yumusak(i.yukselme);
      const gorunur = e > 0.003;
      f.kok.visible = gorunur;
      if (!gorunur) continue;
      // Hafif salınım (nefes, nişan düzeltme) + geri tepme; vurulan geriye yıkılır
      const salinim = Math.sin(this.saat * 1.3 + i.faz) * 0.02;
      const pitch = i.pitch - i.geriTepme * 0.025 - (i.vuruldu ? (1 - e) * 0.9 : 0);
      _e.set(pitch, i.yaw + salinim, 0, "YXZ");
      f.kok.rotation.copy(_e);
      _k.copy(this.kalca).applyEuler(_e);
      f.kok.position.copy(i.taban).add(this.kalca).sub(_k);
      f.kok.position.y -= (1 - e) * COKME;
      if (i.geriTepme > 0) {
        f.kok.position.x -= Math.sin(i.yaw) * 0.02 * i.geriTepme;
        f.kok.position.z -= Math.cos(i.yaw) * 0.02 * i.geriTepme;
      }
      f.duzlem.constant = this.mevziler[i.mevzi].kirp === false ? 1e4 : -(i.ortuY - 0.02);
      f.karistirici?.update(dt);
      const isik = i.parlama * 1.1;
      for (let k = 0; k < f.malzemeler.length; k++) f.malzemeler[k].emissiveIntensity = isik;
    }
    this.isgaller.length = canli;
  }

  /** Bölge değişimi / sahne sıfırlaması: atıcılar ve susturmalar gider (mevzi listesi kalır). */
  temizle() {
    for (const i of this.isgaller) {
      if (!i.figur) continue;
      i.figur.kok.visible = false;
      i.figur.mesgul = false;
    }
    this.isgaller.length = 0;
    this.etkisiz.clear();
    this.sonBirakilan = null;
  }

  /**
   * Tanılama (mevzi doğrulama, `araclar/oyun-testi/dusman-siluet.mjs`): siluetli mevzilerin hepsinde (ya da
   * `yalniz` listesindekilerde) figür ayakta durur; false ile kalkar. Dönen: gösterilen mevzi sayısı.
   */
  tanilama(acik: boolean, yalniz?: number[]): number {
    for (const i of this.isgaller) {
      if (i.kanal !== "tani") continue;
      i.kanal = "salvo";
      i.birak = true;
      i.ayaktaKal = 0;
    }
    if (!acik) return 0;
    let n = 0;
    this.mevziler.forEach((m, no) => {
      if (!m.siluet || (yalniz && !yalniz.includes(no))) return;
      const i = this.isgalEt(no, "tani", true);
      i.yukselme = 1;
      n++;
    });
    return n;
  }

  /** Tanı/test: mevzi listesi (plan + araziden hesaplananlar). */
  mevziListesi() {
    return this.mevziler.map((m, no) => ({ no, ad: m.ad ?? "", x: +m.x.toFixed(2), y: +m.y.toFixed(2), z: +m.z.toFixed(2), siluet: Boolean(m.siluet), arazi: Boolean(m.arazi) }));
  }

  /** Tanı/test: yön diliminde arazi mevzilerini şimdi hesapla (normalde ilk ateş isteğinde). Dönen: mevzi sayısı. */
  araziMevzileriHazirla(azimut: number, aci = 30): number {
    this.araziMevzileriEkle(azimut, aci);
    return this.mevziler.filter((m) => m.arazi).length;
  }

  /** Tanı/test: atıcıların durumu. */
  durum() {
    return this.isgaller.map((i) => ({
      no: i.no,
      mevzi: i.mevzi,
      ad: this.mevziler[i.mevzi]?.ad ?? "",
      kanal: i.kanal,
      siluet: i.siluet,
      yukselme: +i.yukselme.toFixed(2),
      parlama: +i.parlama.toFixed(2),
      bastirma: +i.bastirma.toFixed(1),
      kalan: +i.kalan.toFixed(1),
      namlu: i.namlu.toArray().map((v) => +v.toFixed(2)),
      taban: i.taban.toArray().map((v) => +v.toFixed(2)),
      ortuY: +i.ortuY.toFixed(2),
    }));
  }

  /** Tanı/test: susturulmuş mevziler (no → kalan sn) ve figür havuzu. */
  ozet() {
    const etkisiz: Record<number, number> = {};
    for (const [no, t] of this.etkisiz) if (t > this.saat) etkisiz[no] = +(t - this.saat).toFixed(1);
    return { mevzi: this.mevziler.length, arazi: this.mevziler.filter((m) => m.arazi).length, siluetli: this.mevziler.filter((m) => m.siluet).length, figur: this.figurler.length, hazir: this.hazir, etkisiz, namluOfseti: this.namluOfseti.toArray().map((v) => +v.toFixed(3)) };
  }
}
