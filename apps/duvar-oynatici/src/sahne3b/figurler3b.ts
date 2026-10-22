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
}

interface Aktif {
  id: string;
  nesne: THREE.Object3D;
  karistirici: THREE.AnimationMixer | null;
  hiz: number;
  sola: boolean;
  bitti: boolean;
  silah: boolean;
  temelDonus: number;
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

  /** Silahlı figürlerin dünya konumları (ayak hizası). */
  silahliKonumlar(): THREE.Vector3[] {
    return this.aktifler.filter((a) => a.silah && a.hiz === 0).map((a) => a.nesne.position.clone());
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
    const animasyonlar = gltf.animations ?? [];
    if (animasyonlar.length && tanim.animasyon !== "yok") {
      const klip = (tanim.animasyon && THREE.AnimationClip.findByName(animasyonlar, tanim.animasyon)) || animasyonlar[0];
      karistirici = new THREE.AnimationMixer(nesne);
      const eylem = karistirici.clipAction(klip);
      const dongu = s.dongu ?? tanim.dongu ?? true;
      eylem.setLoop(dongu ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      eylem.clampWhenFinished = true;
      eylem.play();
    }
    this.grup.add(sarmal);
    this.aktifler.push({ id: s.id, nesne: sarmal, karistirici, hiz, sola, bitti: false, silah: Boolean(tanim.silah), temelDonus: sarmal.rotation.y });
    return true;
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
      a.karistirici?.update(dt);
      // Çatışmada silahlı, sabit figürler düşmana döner (yumuşak)
      if (a.silah && a.hiz === 0) {
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
