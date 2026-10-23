/**
 * 3B figürler: glTF modelleri (asker, araç, sahne eşyası) panoramanın ışığıyla aydınlanır,
 * güneşe göre gölge düşürür, zemine gerçekten oturur. Panelin Figür komutu (azimut, yükseklik,
 * ölçek, yansıt) 2B kliplerle aynı sözleşmeyle gelir; yükseklik → mesafeye çevrilir.
 */
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as iskeletKopyala } from "three/examples/jsm/utils/SkeletonUtils.js";
import { ZEMIN_Y, izleyiciyeDonus, konumAzimutu, radyan, yanaDonus, yerKonumu, yukseklikMesafe } from "./uzay";

export interface ModelTanimi {
  dosya: string;
  /** Oynatılacak animasyon adı (yoksa ilk animasyon; "yok" → sabit). */
  animasyon?: string;
  /** Hedef boy (metre); modelin sınır kutusu buna ölçeklenir. Varsayılan 1.8. */
  boy?: number;
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
  animasyonlar?: { ates?: string; vurulma?: string; dusme?: string };
  /** Elde silah: ayrı glTF, iskeletteki kemiğe bağlanır. konum metre, donus derece, boy = silah uzunluğu (m). */
  silahModeli?: { dosya: string; kemik: string; konum?: [number, number, number]; donus?: [number, number, number]; boy?: number };
  /** Başlangıç duruşu (manifest); panel komutu `poz` ile değişir. */
  poz?: FigurPozu;
  /**
   * Prosedürel duruş (diz çökme, yerde nefes/yardım işareti) için kemik adları. Verilmezse Quaternius
   * rigi varsayılır (Hips, Chest, UpperLeg.L/R, LowerLeg.L/R, UpperArm.R; GLTFLoader noktaları siler).
   */
  kemikler?: Partial<Record<KemikRolu, string>>;
}

export type FigurPozu = "ayakta" | "comelmis" | "yarali";
type KemikRolu = "govde" | "gogus" | "solUstBacak" | "solAltBacak" | "sagUstBacak" | "sagAltBacak" | "sagUstKol" | "solAyak" | "sagAyak";
/**
 * Quaternius rigi: uyluk→baldır zinciri Body altında, ayaklar (Foot.L/R) Root altında AYRI kemiklerdir
 * (IK hedefi; bekleme klibi onları yazmaz). Bacak döndürülünce ayak da taşınmalı.
 */
const VARSAYILAN_KEMIKLER: Record<KemikRolu, string> = {
  govde: "Torso",
  gogus: "Chest",
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
}

type PozAsamasi = "normal" | "vuruluyor" | "dusuyor" | "yerde";

interface Aktif {
  id: string;
  nesne: THREE.Object3D;
  karistirici: THREE.AnimationMixer | null;
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
  eylemBekle: THREE.AnimationAction | null;
  eylemAtes: THREE.AnimationAction | null;
  atesPozu: boolean;
  /** Duruş sistemi */
  poz: FigurPozu;
  asama: PozAsamasi;
  eylemVurulma: THREE.AnimationAction | null;
  eylemDusme: THREE.AnimationAction | null;
  kemikler: Partial<Record<KemikRolu, THREE.Object3D>>;
  /** Ofset uygulanmadan önceki kemik kuaterniyonları: klip o kemiği yazmıyorsa birikmeyi önlemek için kare başında geri yüklenir. */
  kemikTemel: Map<THREE.Object3D, THREE.Quaternion>;
  kemikTemelKonum: Map<THREE.Object3D, THREE.Vector3>;
  /** Elde silah: yaralı yere düşünce yanına bırakılır, kalkınca ele döner. */
  silahNesne: THREE.Object3D | null;
  silahKemik: THREE.Object3D | null;
  silahTemel: { konum: THREE.Vector3; donus: THREE.Quaternion; olcek: THREE.Vector3 } | null;
  silahYerde: boolean;
  /** İç model düğümü (sarmalın çocuğu) ve ayakta dururkenki y'si; diz çökünce aşağı iner. */
  icNesne: THREE.Object3D;
  tabanY: number;
  /** Hedef boy (m): çökme derinliği ve nefes genliği buna göre. */
  boy: number;
  /** Çökme miktarı 0..1 (yumuşak geçiş). */
  comelme: number;
  /** Prosedürel hareketler için zaman (s) ve bir sonraki yardım işareti zamanı. */
  zaman: number;
  sonrakiYardim: number;
  azimut: number;
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

  get sayi() {
    return this.aktifler.length;
  }

  /** Ses olayları (yaralanma çığlığı, yardım çağrısı); main.ts ses motoruna bağlar. */
  sesOlayi: ((tur: "vuruldu" | "yardim", azimut: number) => void) | null = null;

  /** Hafif silahlı (tüfekli), ateş edebilir durumdaki figürlerin dünya konumları (ayak hizası); yaralılar ve ağır silahlar hariç. */
  silahliKonumlar(): THREE.Vector3[] {
    return this.aktifler.filter((a) => a.silah && !a.agirSilah && a.hiz === 0 && a.poz !== "yarali").map((a) => a.nesne.position.clone());
  }

  /** Sahnedeki figürlerin duruşları (panel/HUD için). */
  pozlar(): Array<{ id: string; poz: FigurPozu }> {
    return this.aktifler.map((a) => ({ id: a.id, poz: a.poz }));
  }

  /** Verilen zemin noktasının `yaricap` m içinde figür var mı (yerleşimde üst üste binmeyi önler). */
  doluMu(konum: THREE.Vector3, yaricap = 2.2): boolean {
    return this.aktifler.some((a) => a.nesne.position.distanceTo(konum) < yaricap);
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
    // Hedef: namlu dünya yönü düşman azimutuna baksın. Kule, temel dönüşünün yerel z'si (dünya yukarı) etrafında döner.
    const hedef = radyan(this.dusmanAzimutu);
    const eksen = new THREE.Vector3(0, 0, 1);
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

  /** Modeli önceden yükle (manifest okununca çağrılır; ilk gösterim gecikmesin). */
  onYukle(url: string) {
    void this.yukle(url).catch(() => undefined);
  }

  async oynat(tanim: ModelTanimi, s: FigurSecenekleri, kok: string): Promise<boolean> {
    const url = /^(https?:|data:|blob:|\/)/.test(tanim.dosya) ? tanim.dosya : kok + tanim.dosya;
    this.durdur(s.id);
    let gltf: GLTF;
    try {
      gltf = await this.yukle(url);
    } catch {
      return false;
    }
    // Aynı id için bu arada yeni komut geldiyse eskisini uygulama
    if (this.aktifler.some((a) => a.id === s.id)) return false;
    const nesne = iskeletKopyala(gltf.scene) as THREE.Object3D;
    iskeletleriPaylastir(nesne);
    const boya = tanim.renk ? new THREE.Color(tanim.renk) : null;
    nesne.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
        m.frustumCulled = false;
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
    const olcek = boyut.y > 1e-4 ? hedefBoy / boyut.y : 1;
    const sarmal = new THREE.Group();
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
    const hiz = tanim.hiz ?? 0;
    const sola = Boolean(s.yansit);
    sarmal.rotation.y = hiz > 0 ? yanaDonus(s.azimut, sola) : izleyiciyeDonus(s.azimut);

    let karistirici: THREE.AnimationMixer | null = null;
    let eylemBekle: THREE.AnimationAction | null = null;
    let eylemAtes: THREE.AnimationAction | null = null;
    let eylemVurulma: THREE.AnimationAction | null = null;
    let eylemDusme: THREE.AnimationAction | null = null;
    const animasyonlar = gltf.animations ?? [];
    if (animasyonlar.length && tanim.animasyon !== "yok") {
      const klip = klipBul(animasyonlar, tanim.animasyon) ?? animasyonlar[0];
      karistirici = new THREE.AnimationMixer(nesne);
      eylemBekle = karistirici.clipAction(klip);
      const dongu = s.dongu ?? tanim.dongu ?? true;
      eylemBekle.setLoop(dongu ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      eylemBekle.clampWhenFinished = true;
      eylemBekle.play();
      const atesKlip = klipBul(animasyonlar, tanim.animasyonlar?.ates);
      if (atesKlip) {
        eylemAtes = karistirici.clipAction(atesKlip);
        eylemAtes.setLoop(THREE.LoopRepeat, Infinity);
        eylemAtes.timeScale = 0.9 + Math.random() * 0.2;
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
      if (kemik && silahGltf && !this.aktifler.some((a) => a.id === s.id)) {
        const silah = silahGltf.scene.clone(true);
        silah.updateMatrixWorld(true);
        const kendiBoy = new THREE.Box3().setFromObject(silah).getSize(new THREE.Vector3());
        const enUzun = Math.max(kendiBoy.x, kendiBoy.y, kendiBoy.z) || 1;
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
    this.grup.add(sarmal);
    const aktif: Aktif = {
      id: s.id,
      nesne: sarmal,
      karistirici,
      hiz,
      sola,
      bitti: false,
      silah: Boolean(tanim.silah),
      temelDonus: sarmal.rotation.y,
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
      zaman: Math.random() * 10,
      sonrakiYardim: 2 + Math.random() * 4,
      azimut: s.azimut,
    };
    // Tek seferlik klipler bitince sonraki aşama: vurulma → düşme → yerde
    karistirici?.addEventListener("finished", (olay) => {
      const e = (olay as unknown as { action: THREE.AnimationAction }).action;
      if (aktif.asama === "vuruluyor" && e === aktif.eylemVurulma) this.dusmeyeBasla(aktif);
      else if (aktif.asama === "dusuyor" && e === aktif.eylemDusme) this.yereDustu(aktif);
    });
    this.aktifler.push(aktif);
    const baslangicPozu = s.poz ?? tanim.poz ?? "ayakta";
    if (baslangicPozu !== "ayakta") this.pozUygula(aktif, baslangicPozu, true);
    return true;
  }

  /** Panel komutu: figürün duruşunu değiştir (vuruldu → yere düşer; diz çök; ayağa kalk). */
  pozAyarla(id: string, poz: FigurPozu) {
    const a = this.aktifler.find((x) => x.id === id);
    if (a) this.pozUygula(a, poz, false);
  }

  private pozUygula(a: Aktif, poz: FigurPozu, aninda: boolean) {
    if (a.poz === poz) return;
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
        } else if (a.eylemVurulma) {
          this.oturanlariSondur(a, 0.15);
          a.eylemVurulma.reset().setEffectiveWeight(1).play();
          a.asama = "vuruluyor";
          this.sesOlayi?.("vuruldu", a.azimut);
        } else {
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
      a.sonrakiYardim = a.zaman + 3 + Math.random() * 3;
      return;
    }
    // ayakta / çömelmiş: yerdeyse kalk (bekleme klibine dön), silahı al
    if (onceki === "yarali") {
      a.asama = "normal";
      this.silahiAl(a);
      a.icNesne.rotation.x = 0;
      a.icNesne.position.y = a.tabanY;
      a.eylemVurulma?.stop();
      a.eylemDusme?.stop();
      if (a.eylemBekle) a.eylemBekle.reset().setEffectiveWeight(1).play();
      a.atesPozu = false;
    }
    if (aninda) a.comelme = poz === "comelmis" ? 1 : 0;
  }

  /** Yere düştü: aşama "yerde", tüfek elden çıkıp yanına düşer (dik durmasın). */
  private yereDustu(a: Aktif) {
    a.asama = "yerde";
    const s = a.silahNesne;
    if (!s || !a.silahKemik || a.silahYerde) return;
    a.silahYerde = true;
    a.nesne.updateMatrixWorld(true);
    const el = a.nesne.worldToLocal(s.getWorldPosition(new THREE.Vector3()));
    a.nesne.attach(s); // dünya dönüşümü korunur; artık sarmal (metre) uzayında
    s.position.set(el.x + (Math.random() - 0.5) * 0.4, 0.03, el.z + 0.2);
    s.rotation.set(0, Math.random() * Math.PI, 0); // tüfeğin uzun ekseni yatay; rastgele yön
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

  private dusmeyeBasla(a: Aktif) {
    if (!a.eylemDusme) {
      this.yereDustu(a);
      return;
    }
    const onceki = a.asama === "vuruluyor" ? a.eylemVurulma : null;
    a.eylemDusme.reset().setEffectiveWeight(1).play();
    if (onceki) onceki.crossFadeTo(a.eylemDusme, 0.12, false);
    else this.oturanlariSondur(a, 0.15);
    a.asama = "dusuyor";
  }

  /** Bekleme/ateş döngülerini söndürür (tek seferlik klibe geçerken). */
  private oturanlariSondur(a: Aktif, sure: number) {
    for (const e of [a.eylemBekle, a.eylemAtes]) {
      if (!e) continue;
      if (sure > 0) e.fadeOut(sure);
      else e.stop();
    }
  }

  /**
   * Prosedürel duruş: karıştırıcıdan sonra kemiklere dünya eksenli ofsetler.
   * - Diz çökme: sol bacak öne 90° (diz bükük, ayak yerde), sağ diz yerde (alt bacak geriye), gövde hafif öne, kalça iner.
   * - Yerde yaralı: göğüs nefesle inip kalkar, ara ara sağ kol yardım ister gibi kalkar.
   */
  private durusuUygula(a: Aktif, dt: number) {
    a.zaman += dt;
    const hedefComelme = a.poz === "comelmis" ? 1 : 0;
    if (a.comelme !== hedefComelme) a.comelme += Math.sign(hedefComelme - a.comelme) * Math.min(Math.abs(hedefComelme - a.comelme), dt / 0.6);
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
    } else if (a.comelme <= 0 && a.asama === "normal" && a.poz !== "yarali" && a.icNesne.position.y !== a.tabanY) {
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
      } else if (t >= 2.6) a.sonrakiYardim = a.zaman + 6 + Math.random() * 6;
    }
  }

  /** Çatışma durumuna göre bekleme ↔ ateş klipleri arasında yumuşak geçiş. */
  private pozuGuncelle(a: Aktif) {
    if (!a.eylemAtes || !a.eylemBekle || a.poz === "yarali") return;
    const istenen = a.silah && a.hiz === 0 && this.dusmanAzimutu !== null;
    if (istenen === a.atesPozu) return;
    a.atesPozu = istenen;
    const from = istenen ? a.eylemBekle : a.eylemAtes;
    const to = istenen ? a.eylemAtes : a.eylemBekle;
    to.reset().setEffectiveWeight(1).play();
    from.crossFadeTo(to, 0.35, false);
  }

  durdur(id: string) {
    for (const a of this.aktifler) if (a.id === id) this.grup.remove(a.nesne);
    this.aktifler = this.aktifler.filter((a) => a.id !== id);
  }

  temizle() {
    for (const a of this.aktifler) this.grup.remove(a.nesne);
    this.aktifler = [];
  }

  guncelle(dt: number) {
    for (const a of this.aktifler) {
      this.pozuGuncelle(a);
      for (const [kemik, temel] of a.kemikTemel) kemik.quaternion.copy(temel);
      a.kemikTemel.clear();
      for (const [kemik, temel] of a.kemikTemelKonum) kemik.position.copy(temel);
      a.kemikTemelKonum.clear();
      a.karistirici?.update(dt);
      this.durusuUygula(a, dt);
      // Kuleli ağır silah: gövde yerinde, kule düşmana döner
      if (a.agirSilah && a.kule) this.kuleyiDondur(a, dt);
      // Çatışmada silahlı, sabit figürler (kulesiz) düşmana döner (yumuşak); yaralı dönmez
      if (a.silah && a.hiz === 0 && !(a.agirSilah && a.kule) && a.poz !== "yarali") {
        // Modelin ön yüzü (+z) düşman yönüne (sin a, 0, -cos a) baksın: θ = π − a
        const hedef = this.dusmanAzimutu === null ? a.temelDonus : Math.PI - radyan(this.dusmanAzimutu);
        let fark = hedef - a.nesne.rotation.y;
        fark = Math.atan2(Math.sin(fark), Math.cos(fark));
        a.nesne.rotation.y += fark * Math.min(1, dt * 3);
      }
      if (a.hiz > 0) {
        // Yana hareket: izleyici etrafında teğet yönde (sağa, yansıt ise sola)
        const az = konumAzimutu(a.nesne.position);
        const tegets = new THREE.Vector3(Math.cos(radyan(az)), 0, Math.sin(radyan(az)));
        if (a.sola) tegets.negate();
        a.nesne.position.addScaledVector(tegets, a.hiz * dt);
        a.nesne.position.y = ZEMIN_Y;
        a.nesne.rotation.y = yanaDonus(konumAzimutu(a.nesne.position), a.sola);
        if (Math.abs(konumAzimutu(a.nesne.position)) > 165) a.bitti = true;
      }
    }
    for (const a of this.aktifler) if (a.bitti) this.grup.remove(a.nesne);
    this.aktifler = this.aktifler.filter((a) => !a.bitti);
  }
}
