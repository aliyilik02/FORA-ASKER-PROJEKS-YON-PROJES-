/**
 * Oda 2 helikopter (3B): yaklaşma → iniş → yerde → kalkış. Model manifestten gelir
 * (klipler → tip "model", ad "helikopter"); rotor düğümleri adından bulunup döndürülür.
 * Hareket `helikopterUcusu.ts` uçuş modelinden (kavisli yaklaşma, virajda yatış, iniş öncesi burun yukarı
 * "flare", kızakta sekme, 5 m askıdan burun aşağı kalkış); yere yakınken zemin malzemesine göre rotor tozu
 * (kar / kuru toprak / orman / beton, `rotorTozu.ts`) savrulur.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { HelikopterDurumu } from "../tipler";
import { HelikopterUcusu } from "./helikopterUcusu";
import { ROTOR_TOZU_PROFILLERI, type RotorTozuProfili, type RotorTozuTuru } from "./rotorTozu";
import type { ParcacikSistemi } from "./parcaciklar";
import { radyan, zeminY } from "./uzay";

export class Helikopter3B {
  /** İniş noktası (panorama yerleşim planından; varsayılan azimut 12°, 38 m). */
  private inisAzimut = 12;
  private inisMesafe = 38;
  readonly grup = new THREE.Group();
  private model: THREE.Object3D | null = null;
  private rotorlar: Array<{ nesne: THREE.Object3D; eksen: "y" | "x" }> = [];
  private karistirici: THREE.AnimationMixer | null = null;
  private durum: HelikopterDurumu = "yok";
  private faz = 0;
  private mesafe = 400;
  private irtifa = 70;
  private yukleniyor = false;
  /** Rotor tozu şiddeti 0–1 (ses için de kullanılır). */
  tozSiddeti = 0;
  /** Uçuş modeli (saf, testli): konum, burun yönü, yunuslama/yatış, rotor devri, toz şiddeti. */
  private readonly ucus = new HelikopterUcusu();
  /**
   * Gövde pivotu (ağırlık merkezi yakını): yön/yunuslama/yatış burada döner, kızaklar dönmezken grubun tabanındadır.
   * Model burnu yerel −z'de (OGA modeli: glTF yönlendirmesiyle +Y burun → −z); burun azimutu h için y dönüşü −h.
   */
  private readonly govde = new THREE.Group();
  private govdeYuksekligi = 1.8;
  private rotorYaricapi = 5.5;
  /** İniş noktasının zemin yüksekliği (m): uçuş rotası buna göre, yerel arazi farkı engel ve toz için. */
  private inisZemini = 0;
  private tozProfili: RotorTozuProfili = ROTOR_TOZU_PROFILLERI.toprak;
  private readonly tozMerkezi = new THREE.Vector3();

  constructor(private readonly parcaciklar: ParcacikSistemi) {
    this.grup.visible = false;
    this.grup.add(this.govde);
    this.ucus.zeminFarki = (x, z) => zeminY(x, z) - this.inisZemini;
  }

  inisNoktasi(azimut: number, mesafe: number) {
    this.inisAzimut = azimut;
    this.inisMesafe = mesafe;
  }
  get inisAzimutu() {
    return this.inisAzimut;
  }
  /**
   * Rotor sesi için konum (ses.ts): sahne azimutu (derece), yatay mesafe ve zeminden irtifa (m); yokken null.
   * Her karede okunur: hep aynı nesne doldurulur (ayırma yok), okuyan değeri hemen kullanır, saklamaz.
   */
  get sesKonumu(): { azimut: number; mesafe: number; irtifa: number } | null {
    if (this.mevcutDurum === "yok" || !this.hazir) return null;
    const p = this.grup.position;
    const k = this.sesKonumuDegeri;
    k.azimut = (Math.atan2(p.x, -p.z) * 180) / Math.PI;
    k.mesafe = Math.hypot(p.x, p.z);
    k.irtifa = Math.max(0, p.y - zeminY(p.x, p.z));
    return k;
  }
  private readonly sesKonumuDegeri = { azimut: 0, mesafe: 0, irtifa: 0 };

  get hazir() {
    return this.model !== null;
  }
  get mevcutDurum() {
    return this.durum;
  }

  /** Rotor tozu zemin malzemesi; sahne3b bölge + mevsimden seçer (kar / toprak / orman / beton). */
  set tozTuru(tur: RotorTozuTuru) {
    this.tozProfili = ROTOR_TOZU_PROFILLERI[tur];
  }

  /**
   * `rotorAdlari`: modelde döndürülecek düğüm adları (ilki ana rotor, diğerleri kuyruk). Verilmezse
   * adı rotor/blade/prop içerenler bulunur. Modelin kendi animasyonu varsa (çoğu Sketchfab helikopteri
   * rotorları animasyonla döndürür) o da oynatılır.
   */
  yukle(url: string, boy = 5.1, rotorAdlari?: string[], renk?: string) {
    if (this.model || this.yukleniyor) return;
    this.yukleniyor = true;
    new GLTFLoader().load(
      url,
      (gltf) => {
        const m = gltf.scene;
        const boya = renk ? new THREE.Color(renk) : null;
        m.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.castShadow = true;
            mesh.frustumCulled = false;
            // Askeri renk: parlak sivil modelleri (beyaz/kırmızı kurtarma helikopteri) haki tona boyar
            if (boya) {
              const boyaUygula = (mal: THREE.Material) => {
                const k = mal.clone() as THREE.MeshStandardMaterial;
                if (k.color) k.color.copy(boya);
                if ("roughness" in k) k.roughness = 0.85;
                if ("metalness" in k) k.metalness = 0.1;
                return k;
              };
              mesh.material = Array.isArray(mesh.material) ? mesh.material.map(boyaUygula) : boyaUygula(mesh.material);
            }
          }
          if (rotorAdlari) {
            const i = rotorAdlari.indexOf(o.name);
            if (i >= 0) this.rotorlar.push({ nesne: o, eksen: i === 0 ? "y" : "x" });
          } else if (/rotor|blade|prop/i.test(o.name)) this.rotorlar.push({ nesne: o, eksen: /tail|kuyruk|rear/i.test(o.name) ? "x" : "y" });
        });
        if (gltf.animations.length) {
          this.karistirici = new THREE.AnimationMixer(m);
          for (const klip of gltf.animations) this.karistirici.clipAction(klip).play();
        }
        const kutu = new THREE.Box3().setFromObject(m);
        const boyut = new THREE.Vector3();
        kutu.getSize(boyut);
        const olcek = boyut.y > 1e-4 ? boy / boyut.y : 1;
        m.scale.setScalar(olcek);
        // Pivot boyun ~%35'inde (ağırlık merkezi); model kızaklar grup tabanına gelecek kadar aşağıda
        this.govdeYuksekligi = boy * 0.35;
        this.govde.position.y = this.govdeYuksekligi;
        m.position.y = -kutu.min.y * olcek - this.govdeYuksekligi;
        // Rotor yarıçapı ≈ gövde boyunun yarısı (rotor diski gövdeyi aşağı yukarı örter); toz bu diskin altından
        this.rotorYaricapi = Math.min(6.5, Math.max(4, 0.42 * Math.max(boyut.x, boyut.z) * olcek));
        this.model = m;
        this.govde.add(m);
        this.yukleniyor = false;
      },
      undefined,
      () => {
        this.yukleniyor = false;
      },
    );
  }

  durumAyarla(d: HelikopterDurumu) {
    if (d === this.durum) return;
    this.durum = d;
    this.faz = 0;
    // İniş noktası önce: yaklaşma/iniş başlangıcı yeni noktaya göre kurulsun
    this.inisZeminiGuncelle();
    this.ucus.inisNoktasi(this.inisAzimut, this.inisMesafe);
    this.ucus.durumAyarla(d);
    this.grup.visible = d !== "yok" && this.model !== null && this.ucus.gorunur;
  }

  guncelle(dt: number) {
    if (this.durum === "yok" || !this.model) {
      this.tozSiddeti = 0;
      return;
    }
    const u = this.ucus;
    this.inisZeminiGuncelle();
    u.inisNoktasi(this.inisAzimut, this.inisMesafe);
    u.guncelle(dt);
    this.faz += dt;
    // Eski alanlar güncel kalır: irtifa yerel zeminden, mesafe izleyiciden yatay (ses konumu da kullanabilir)
    this.irtifa = u.irtifa;
    this.mesafe = Math.hypot(u.x, u.z);
    this.tozSiddeti = u.tozSiddeti;
    this.grup.visible = u.gorunur;
    if (!u.gorunur) return;
    this.grup.position.set(u.x, this.inisZemini + u.yukseklik + u.salinim, u.z);
    this.govde.position.y = this.govdeYuksekligi + u.govdeOfseti;
    // YXZ: önce burun yönü (dünya y), sonra yunuslama (yerel x), sonra yatış (yerel z, burun ekseni)
    this.govde.rotation.set(u.yunuslama, -radyan(u.yonelim), u.yatis, "YXZ");
    const rotorHiz = u.rotorHizi;
    this.karistirici?.update(dt * (rotorHiz / 40) * 2);
    for (const r of this.rotorlar) {
      if (r.eksen === "y") r.nesne.rotation.y += rotorHiz * dt;
      else r.nesne.rotation.x += rotorHiz * 1.5 * dt;
    }
    // Rotor tozu: diskin altındaki zeminden, zemin malzemesine göre (alçaklık × rotor gücü)
    if (this.tozSiddeti > 0.03) {
      this.tozMerkezi.set(u.x, zeminY(u.x, u.z), u.z);
      this.parcaciklar.rotorTozu(this.tozMerkezi, this.rotorYaricapi, this.tozSiddeti, dt, this.tozProfili);
    }
  }

  private inisZeminiGuncelle() {
    const a = radyan(this.inisAzimut);
    this.inisZemini = zeminY(Math.sin(a) * this.inisMesafe, -Math.cos(a) * this.inisMesafe);
  }
}
