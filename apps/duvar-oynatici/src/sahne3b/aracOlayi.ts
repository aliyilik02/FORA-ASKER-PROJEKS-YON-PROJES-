/**
 * Zırhlı araç olayı (11 Kasım 2026 denemesi; efekt `zirhli_arac`): Kirpi caddenin ucundan gelir, yavaşlayıp durur,
 * tavandaki silahla düşman mevzilerine (pencere/çatı) kısa diziler hâlinde ateş açar, sonra yerinde bekler.
 *
 * Model: Sketchfab BMC Kirpi (42manako, CC-BY), `modeller/alan/sf_kirpi_bmc.glb` (ön yüz +z, 7,1 m). Tekerlekler modelde
 * tek ağdadır ("wheels" malzemesi: dört tekerlek + yedek); yüklenince aks başına ayrılır (tekerlek.ts) ve gidilen yola
 * göre döner. Hareket hissi ayrıca fren dalışı, hafif sarsıntı ve tekerlek tozundan gelir.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { ParcacikSistemi } from "./parcaciklar";
import { tekerlekleriAyir, type AyrilmisTekerlekler } from "./tekerlek";
import { zeminY } from "./uzay";

export interface AracRotasi {
  /** Başlangıç ve duruş noktası (sahne x, z). */
  bas: [number, number];
  dur: [number, number];
}

type Asama = "yok" | "yukleniyor" | "geliyor" | "duruyor" | "ates" | "bekliyor";

const HIZ = 9; // m/sn seyir
const FREN_MESAFESI = 16; // m: bu kadar kala yavaşlamaya başlar
const ATES_SURESI = 26; // sn
const ATIS_ARALIGI = 0.11; // sn (≈ 550 atım/dk)
/** Kirpi'nin tekerlekleri (model kökünde ölçüldü: çap 1,15 m, akslar z = 2,25 ve −1,94). */
const TEKERLEK = { malzeme: "wheels", yaricap: 0.575, y: 0.58, akslar: [2.25, -1.94], enAzX: 0.85 };
/** Tavan silahının namlu ucu, araç yerel uzayında (ön +z). */
const NAMLU = new THREE.Vector3(0, 3.05, 0.9);

export class AracOlayi {
  readonly grup = new THREE.Group();
  private readonly yukleyici = new GLTFLoader();
  private model: THREE.Object3D | null = null;
  private tekerlekler: AyrilmisTekerlekler | null = null;
  private yuklenen = "";
  private asama: Asama = "yok";
  private rota: AracRotasi = { bas: [0, -90], dur: [0, -24] };
  private kalan = 0;
  private t = 0;
  private tozSayaci = 0;
  private dizi = 0;
  private atisSayaci = 0;
  private araSayaci = 0;
  private nesil = 0;
  /**
   * Isınma: model yüklendikten sonra kaç GERÇEK çizim daha (milimetrik, yer altında) yapılacak; 0 = ısınma yok. Kare
   * değil çizim sayılır: sahne geçişi sürerken `guncelle` çağrılır ama 3B sahne çizilmez, kare sayınca model hiç
   * çizilmeden gizleniyordu.
   */
  private isinma = 0;
  private isinmaAgi: THREE.Mesh | null = null;
  /** Model ilk yüklendiğinde (kar yaması gibi malzeme işleri için). */
  modelHazir: ((kok: THREE.Object3D) => void) | null = null;

  /**
   * @param atis namlu ucundan (dünya) bir atış: iz, namlu alevi ve ses çağıranda (çatışma sistemi) üretilir.
   */
  constructor(
    private readonly parcaciklar: ParcacikSistemi,
    private readonly atis: (namlu: THREE.Vector3, konum: THREE.Vector3) => void,
  ) {
    this.grup.visible = false;
  }

  get aktif(): boolean {
    return this.asama !== "yok";
  }

  /** Aracın konumu (ses ve bakış için); sahnede değilse null. */
  get konum(): THREE.Vector3 | null {
    return this.asama === "yok" || this.asama === "yukleniyor" ? null : this.grup.position;
  }

  /**
   * Ön yükleme + ısınma: model bölge kurulurken yüklenir, dokuları ekran kartına çıkar, programları derlenir. Yoksa ilk
   * çağrıda GLB çözme + 6 doku + 6 program tek karede geliyor, görüntü 0,5–1,6 sn donuyordu (12 Kasım ölçümü). Model
   * birkaç kare milimetrik ölçekte, yerin altında ama görüş alanında çizilir (görünmez), sonra gizlenir.
   */
  hazirla(url: string) {
    if (this.yuklenen === url || this.asama !== "yok" || this.onYukleme === url) return;
    this.onYukleme = url;
    this.yukleyici.load(
      url,
      (g) => {
        this.onYukleme = "";
        if (this.yuklenen === url) return;
        this.modeliKur(g.scene, url);
        // Arada araç çağrıldıysa o yükleme kendi modelini kurar; ısınma gerekmez. Sahne/bölge temizliği (temizle)
        // ön yüklemeyi iptal etmez: bölge kurulurken hemen ardından çağrılır, model yine ısınmalıdır
        if (this.asama !== "yok") return;
        if (this.model) this.grup.remove(this.model);
        this.model = g.scene;
        this.grup.add(g.scene);
        this.grup.scale.setScalar(0.001);
        this.grup.position.set(0, zeminY(0, -30) - 3, -30);
        this.grup.rotation.set(0, 0, 0);
        this.grup.visible = true;
        // Görüş alanı ayıklaması kapalı: yer altındaki nokta duvarın alt kenarının dışında kalabilir, çizilmezse
        // program derlenmez (ilk denemede 9 m'de ayıklanıyordu)
        this.ayiklama(false);
        this.isinma = 9; // üç duvar × üç kare
        g.scene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh && !this.isinmaAgi) this.isinmaAgi = m;
        });
        if (this.isinmaAgi) this.isinmaAgi.onBeforeRender = () => {
          if (this.isinma > 1) this.isinma--;
          else this.isinmaBitti = true;
        };
      },
      undefined,
      () => {
        this.onYukleme = "";
      },
    );
  }
  private onYukleme = "";
  private isinmaBitti = false;
  private isinmayiBitir() {
    if (this.isinmaAgi) delete (this.isinmaAgi as { onBeforeRender?: unknown }).onBeforeRender;
    this.isinmaAgi = null;
    this.isinmaBitti = false;
    this.isinma = 0;
    this.ayiklama(true);
  }
  private ayiklama(acik: boolean) {
    this.grup.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.frustumCulled = acik;
    });
  }

  private modeliKur(kok: THREE.Object3D, url: string) {
    kok.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.isMesh) m.castShadow = m.receiveShadow = true;
    });
    this.yuklenen = url;
    this.tekerlekler = tekerlekleriAyir(kok, TEKERLEK);
    this.modelHazir?.(kok);
  }

  baslat(url: string, rota: AracRotasi) {
    this.temizle();
    this.rota = rota;
    const nesil = ++this.nesil;
    this.asama = "yukleniyor";
    const hazir = (model: THREE.Object3D) => {
      if (nesil !== this.nesil) return;
      if (this.model !== model) {
        if (this.model) this.grup.remove(this.model);
        this.model = model;
        this.grup.add(model);
      }
      const dx = rota.dur[0] - rota.bas[0];
      const dz = rota.dur[1] - rota.bas[1];
      this.kalan = Math.hypot(dx, dz);
      this.grup.position.set(rota.bas[0], zeminY(rota.bas[0], rota.bas[1]), rota.bas[1]);
      this.grup.rotation.set(0, Math.atan2(dx, dz), 0);
      this.grup.scale.setScalar(1);
      if (this.isinma > 0) this.isinmayiBitir();
      this.grup.visible = true;
      this.t = 0;
      this.asama = "geliyor";
    };
    if (this.model && this.yuklenen === url) return hazir(this.model);
    this.yukleyici.load(
      url,
      (g) => {
        // Ön yükleme arada bitirdiyse aynı model kullanılır (iki kopya kurulmaz)
        if (this.yuklenen === url && this.model) return hazir(this.model);
        this.modeliKur(g.scene, url);
        hazir(g.scene);
      },
      undefined,
      () => {
        if (nesil === this.nesil) this.asama = "yok";
      },
    );
  }

  guncelle(dt: number) {
    if (this.isinma > 0 && this.asama === "yok" && this.isinmaBitti) {
      this.isinmayiBitir();
      this.grup.visible = false;
      this.grup.scale.setScalar(1);
    }
    if (this.asama === "yok" || this.asama === "yukleniyor") return;
    const g = this.grup;
    this.t += dt;
    if (this.asama === "geliyor") {
      // Fren: kalan mesafe azaldıkça hız düşer (en az 0,6 m/sn ki tam dursun)
      const hiz = Math.max(0.6, HIZ * Math.min(1, this.kalan / FREN_MESAFESI));
      const adim = Math.min(this.kalan, hiz * dt);
      const yon = new THREE.Vector3(this.rota.dur[0] - g.position.x, 0, this.rota.dur[1] - g.position.z);
      if (yon.lengthSq() > 1e-6) g.position.addScaledVector(yon.normalize(), adim);
      this.kalan -= adim;
      g.position.y = zeminY(g.position.x, g.position.z);
      // Tekerlekler gidilen yol kadar döner (kaymadan yuvarlanma: açı = yol / yarıçap)
      if (this.tekerlekler) for (const aks of this.tekerlekler.akslar) aks.rotation.x += adim / this.tekerlekler.yaricap;
      // Yol sarsıntısı ve fren dalışı (burun aşağı)
      const fren = 1 - Math.min(1, this.kalan / FREN_MESAFESI);
      g.rotation.x = 0.035 * fren * (hiz / HIZ + 0.3) + Math.sin(this.t * 9) * 0.004 * (hiz / HIZ);
      g.rotation.z = Math.sin(this.t * 6.3) * 0.006 * (hiz / HIZ);
      this.tozSayaci -= dt;
      if (this.tozSayaci <= 0 && hiz > 2) {
        this.tozSayaci = 0.3;
        const arka = new THREE.Vector3(0, 0.2, -3.2).applyQuaternion(g.quaternion).add(g.position);
        this.parcaciklar.tozBulutu(arka, 1.3, 0.22 * (hiz / HIZ));
      }
      if (this.kalan <= 0.02) {
        this.asama = "duruyor";
        this.t = 0;
      }
    } else if (this.asama === "duruyor") {
      // Süspansiyon geri salınır
      g.rotation.x = 0.035 * Math.exp(-this.t * 4) * Math.cos(this.t * 9);
      g.rotation.z = 0;
      if (this.t > 1.1) {
        g.rotation.x = 0;
        this.asama = "ates";
        this.t = 0;
        this.dizi = 0;
        this.araSayaci = 0.2;
      }
    } else if (this.asama === "ates") {
      if (this.dizi > 0) {
        this.atisSayaci -= dt;
        // Geri tepme: gövde hafif sallanır
        g.rotation.x = -0.004 * Math.sin(this.t * 55);
        while (this.atisSayaci <= 0 && this.dizi > 0) {
          this.atisSayaci += ATIS_ARALIGI;
          this.dizi--;
          this.atis(NAMLU.clone().applyQuaternion(g.quaternion).add(g.position), g.position);
        }
      } else {
        g.rotation.x = 0;
        this.araSayaci -= dt;
        if (this.araSayaci <= 0) {
          this.dizi = 5 + Math.floor(Math.random() * 6);
          this.atisSayaci = 0;
          this.araSayaci = 0.9 + Math.random() * 1.8;
        }
      }
      if (this.t > ATES_SURESI) {
        g.rotation.x = 0;
        this.asama = "bekliyor";
      }
    }
  }

  /** Zemin değişti (krater, arazi yeniden kuruldu). */
  zemineOturt() {
    if (this.asama !== "yok" && this.asama !== "yukleniyor") this.grup.position.y = zeminY(this.grup.position.x, this.grup.position.z);
  }

  /** Sahne sıfırlaması / bölge değişimi: araç kalkar (model bellekte kalır, yeniden çağrılınca hemen gelir). */
  temizle() {
    this.nesil++;
    this.asama = "yok";
    // Süren ısınma kesilmez (model milimetrik ve yer altında; guncelle bitirince gizler)
    if (this.isinma > 0) return;
    this.grup.scale.setScalar(1);
    this.grup.visible = false;
  }
}
