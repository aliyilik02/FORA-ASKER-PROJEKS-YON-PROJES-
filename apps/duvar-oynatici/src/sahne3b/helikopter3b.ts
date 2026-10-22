/**
 * Oda 2 helikopter (3B): yaklaşma → iniş → yerde → kalkış. Model manifestten gelir
 * (klipler → tip "model", ad "helikopter"); rotor düğümleri adından bulunup döndürülür,
 * yere yakınken rotor tozu savrulur.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { HelikopterDurumu } from "../tipler";
import type { ParcacikSistemi } from "./parcaciklar";
import { ZEMIN_Y, azimutYon, radyan } from "./uzay";

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

  constructor(private readonly parcaciklar: ParcacikSistemi) {
    this.grup.visible = false;
  }

  inisNoktasi(azimut: number, mesafe: number) {
    this.inisAzimut = azimut;
    this.inisMesafe = mesafe;
  }

  get hazir() {
    return this.model !== null;
  }
  get mevcutDurum() {
    return this.durum;
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
        m.position.y = -kutu.min.y * olcek;
        this.model = m;
        this.grup.add(m);
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
    if (d === "yaklasiyor") {
      this.mesafe = 420;
      this.irtifa = 70;
    } else if (d === "yerde") {
      this.mesafe = this.inisMesafe;
      this.irtifa = 0;
    } else if (d === "iniyor" && this.mesafe > 200) {
      this.mesafe = 120;
      this.irtifa = 35;
    }
    this.grup.visible = d !== "yok" && this.model !== null;
  }

  guncelle(dt: number) {
    if (this.durum === "yok" || !this.model) {
      this.tozSiddeti = 0;
      return;
    }
    this.grup.visible = true;
    this.faz += dt;
    const yaklas = (hedef: number, deger: number, sure: number) => deger + (hedef - deger) * Math.min(1, dt / sure);
    switch (this.durum) {
      case "yaklasiyor":
        this.mesafe = yaklas(this.inisMesafe, this.mesafe, 9);
        this.irtifa = yaklas(22, this.irtifa, 10);
        break;
      case "iniyor":
        this.mesafe = yaklas(this.inisMesafe, this.mesafe, 3);
        this.irtifa = yaklas(0, this.irtifa, 7);
        break;
      case "yerde":
        this.irtifa = 0;
        break;
      case "kalkiyor":
        this.irtifa = yaklas(90, this.irtifa, 12);
        this.mesafe = yaklas(500, this.mesafe, 16);
        break;
    }
    const yon = azimutYon(this.inisAzimut);
    const sallanti = this.irtifa > 0.3 ? Math.sin(this.faz * 1.1) * 0.6 : 0;
    this.grup.position.set(yon.x * this.mesafe, ZEMIN_Y + this.irtifa + sallanti, yon.z * this.mesafe);
    // Burun izleyiciye doğru hafif çapraz; uçuşta öne eğik
    this.grup.rotation.y = radyan(-this.inisAzimut + 150);
    this.grup.rotation.x = this.durum === "yaklasiyor" || this.durum === "kalkiyor" ? -0.08 : -0.02;
    const rotorHiz = this.durum === "yerde" && this.faz > 25 ? Math.max(8, 40 - (this.faz - 25) * 2) : 40;
    this.karistirici?.update(dt * (rotorHiz / 40) * 2);
    for (const r of this.rotorlar) {
      if (r.eksen === "y") r.nesne.rotation.y += rotorHiz * dt;
      else r.nesne.rotation.x += rotorHiz * 1.5 * dt;
    }
    // Rotor tozu: yere yakınlık × güç
    const yakin = Math.max(0, 1 - this.irtifa / 18);
    this.tozSiddeti = this.durum === "yerde" ? 0.45 * Math.max(0.3, Math.min(1, rotorHiz / 40)) : yakin;
    if (this.tozSiddeti > 0.05) {
      const yer = new THREE.Vector3(this.grup.position.x, ZEMIN_Y, this.grup.position.z);
      this.parcaciklar.rotorTozu(yer, 9, this.tozSiddeti, dt);
    }
  }
}
