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

export class AlanKatmani {
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
      p = this.yukleyici.loadAsync(url);
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
    });
    const p = ogeKonumu(o);
    nesne.position.set(p.x, 0, p.z);
    nesne.rotation.y = radyan(o.yonDerece ?? 0);
    if (o.olcek && o.olcek > 0) nesne.scale.setScalar(o.olcek);
    nesne.userData.alanDosya = o.dosya;
    this.grup.add(nesne);
    const iz = { nesne, kutu: new THREE.Box3(), y: o.y };
    this.izler.push(iz);
    this.oturt(iz);
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
    for (const { kutu } of this.izler) {
      if (konum.x > kutu.min.x - pay && konum.x < kutu.max.x + pay && konum.z > kutu.min.z - pay && konum.z < kutu.max.z + pay) return true;
    }
    return false;
  }
}
