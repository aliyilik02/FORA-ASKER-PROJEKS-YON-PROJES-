/**
 * Oda 2 helikopter (3B): yaklaşma → iniş → yerde → kalkış. Model manifestten gelir
 * (klipler → tip "model", ad "helikopter"); rotor düğümleri adından bulunup döndürülür.
 * Hareket `helikopterUcusu.ts` uçuş modelinden (kavisli yaklaşma, virajda yatış, iniş öncesi burun yukarı
 * "flare", kızakta sekme, 5 m askıdan burun aşağı kalkış, havada iniş noktası değişince pas geçme); yere yakınken
 * zemin malzemesine göre rotor tozu (kar / kuru toprak / orman / beton, `rotorTozu.ts`) savrulur. "Yok" geldiğinde
 * görünüyorsa 1,5 sn'de söner (malzemelerde alphaHash: opaklık 1'de görünüm aynı, sönerken gölgelendirici derlenmez).
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
  /** Sönme için modelin malzemeleri (özgün opaklıklarıyla) ve gölge veren mesh'leri; uygulanmış son sönme değeri. */
  private readonly malzemeler: Array<{ mal: THREE.Material; opaklik: number }> = [];
  private readonly golgeVerenler: THREE.Mesh[] = [];
  private uygulananSolma = 1;
  /**
   * (x, z)'deki 3B alan yapısının tepesi (dünya y; yoksa -Infinity): uçuş modelinin arazi kaçınması binaları da
   * "zemin" sayar, helikopter caddenin sonundaki binaların üstünden geçer (sahne3b → AlanKatmani.tepeYuksekligi).
   */
  engelUstu: ((x: number, z: number) => number) | null = null;

  constructor(private readonly parcaciklar: ParcacikSistemi) {
    this.grup.visible = false;
    this.grup.add(this.govde);
    this.ucus.zeminFarki = (x, z) => Math.max(zeminY(x, z), this.engelUstu?.(x, z) ?? -Infinity) - this.inisZemini;
  }

  /**
   * İniş noktası (sahne azimutu, m); aynı nokta yok sayılır. Uçuş modeline hemen geçer: yerdeyse yeni noktada, belirdiği
   * karede yeni eksende baştan; havadaysa geçerli yaklaşmada rota buradan kurulur, değilse pas geçer. Uçuş yüksekliği
   * iniş noktası zeminine göre olduğundan havadayken dünya yüksekliği korunur (helikopter sıçramaz; inisZeminiGuncelle).
   */
  inisNoktasi(azimut: number, mesafe: number) {
    if (azimut === this.inisAzimut && mesafe === this.inisMesafe) return;
    this.inisAzimut = azimut;
    this.inisMesafe = mesafe;
    this.inisZeminiGuncelle();
    this.ucus.inisNoktasi(azimut, mesafe);
  }
  get inisAzimutu() {
    return this.inisAzimut;
  }
  /**
   * Rotor sesi için konum (ses.ts): sahne azimutu (derece), izleyiciden yatay mesafe ve yerel zeminden irtifa (m);
   * yokken (ya da model yüklenmemişken) null. Uçuş modelinden okunur (`guncelle`den sonra; main.ts'te sahne
   * güncellemesi ses çağrısından önce): askı salınımı irtifaya girmez. Görüş sınırını (1500 m) aşan helikopterde son
   * konum kalır: ses taban seviyede ve boğuk, "yok" gelince susar (null, konumsuz eski sesi tam seviyede açardı).
   * Her karede okunur: hep aynı nesne doldurulur (ayırma yok), okuyan değeri hemen kullanır, saklamaz.
   */
  get sesKonumu(): { azimut: number; mesafe: number; irtifa: number } | null {
    if (this.mevcutDurum === "yok" || !this.hazir) return null;
    const u = this.ucus;
    const k = this.sesKonumuDegeri;
    k.azimut = (Math.atan2(u.x, -u.z) * 180) / Math.PI;
    k.mesafe = Math.hypot(u.x, u.z);
    k.irtifa = u.irtifa;
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
            // Sönme: opak malzemede alphaHash (sıralamasız, opaklık 1'de aynı görünüm; yükte açılır, sönerken derleme
            // yok); saydam (cam) malzeme zaten karışımlı, yalnız opaklığı azalır. Dokulu opak malzeme sönmez (dokunun
            // alfa kanalı glTF OPAQUE'ta yok sayılır; alphaHash onu noktalı gösterirdi), sönme bitince model gizlenir.
            this.golgeVerenler.push(mesh);
            for (const mal of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
              if (this.malzemeler.some((k) => k.mal === mal)) continue;
              const dokulu = Boolean((mal as THREE.MeshStandardMaterial).map || (mal as THREE.MeshStandardMaterial).alphaMap);
              if (!mal.transparent && dokulu) continue;
              if (!mal.transparent) mal.alphaHash = true;
              this.malzemeler.push({ mal, opaklik: mal.opacity });
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
    // Yaklaşma/iniş başlangıcı iniş noktasının güncel zeminine göre kurulsun (nokta inisNoktasi'nda geçti)
    this.inisZeminiGuncelle();
    this.ucus.durumAyarla(d);
    // "Yok"ta görünüyorsa uçuş modeli sönerken görünür tutar
    this.grup.visible = this.model !== null && this.ucus.gorunur;
  }

  guncelle(dt: number) {
    const u = this.ucus;
    if (!this.model || (this.durum === "yok" && !u.gorunur)) {
      this.tozSiddeti = 0;
      this.grup.visible = false;
      return;
    }
    this.inisZeminiGuncelle();
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
    this.solmaUygula(u.solma);
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

  /**
   * Sönme (uçuş modelinin `solma`sı, 0–1): malzeme opaklığı özgün değerle çarpılır (alphaHash ile seyrelir); yarısında
   * gölge kalkar (gölge geçişi alphaHash kullanmaz). Yalnız değer değişince çalışır.
   */
  private solmaUygula(s: number) {
    if (s === this.uygulananSolma) return;
    const golgeVardi = this.uygulananSolma >= 0.5;
    this.uygulananSolma = s;
    for (const k of this.malzemeler) k.mal.opacity = k.opaklik * s;
    const golge = s >= 0.5;
    if (golge !== golgeVardi) for (const mesh of this.golgeVerenler) mesh.castShadow = golge;
  }

  /**
   * İniş noktasının zemin yüksekliği (uçuş yüksekliğinin dayanağı). Değişince (yeni nokta; panorama değişip görüş
   * koridoru iniş alanını düzledi, bölge değişip arazi yeniden kuruldu) havadaki helikopterin dünya yüksekliği korunur:
   * sıçramaz. Yerdeyse yeni zemine oturur.
   */
  private inisZeminiGuncelle() {
    const a = radyan(this.inisAzimut);
    const yeni = zeminY(Math.sin(a) * this.inisMesafe, -Math.cos(a) * this.inisMesafe);
    const u = this.ucus;
    if (u.gorunur && !u.yerde) u.yukseklik += this.inisZemini - yeni;
    this.inisZemini = yeni;
  }
}
