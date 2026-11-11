/**
 * Yıkılan duvar (11 Kasım 2026 denemesi; efekt `duvar_yik` ve yakına düşen patlama): önceden tuğlalara bölünmüş
 * duvar. Patlama noktasının çevresindeki tuğlalar savrulur, üstlerinde desteksiz kalanlar dökülür, dipte yığın kalır.
 * Tek InstancedMesh; yerinde duran tuğlaya işlem yapılmaz, hareketliler basit balistik + zemin sekmesiyle yürür.
 *
 * Plan (manifest `alanlar.<bolge>_film.yikilabilir`): [{ x, z, yonDerece, en, yukseklik }] — duvar merkezi, metre.
 */
import * as THREE from "three";
import { mulberry32 } from "../projeksiyon";
import { radyan, zeminY } from "./uzay";

export interface YikilabilirDuvar {
  x: number;
  z: number;
  /** Duvar yüzünün baktığı yön (derece; 0 izleyiciye). */
  yonDerece?: number;
  en: number;
  yukseklik: number;
}

const TUGLA = { en: 0.4, boy: 0.2, kalin: 0.28 };
/** Tuğla dokusunun dünya boyu (m): Poly Haven red_bricks_04, 2,5 × 2,5 m. */
const DOKU_BOYU = 2.5;
const YERCEKIMI = 9.8;

interface Tugla {
  /** Duvar düzlemindeki ızgara konumu. */
  sutun: number;
  sira: number;
  konum: THREE.Vector3;
  donus: THREE.Quaternion;
  hiz: THREE.Vector3;
  acisalEksen: THREE.Vector3;
  acisalHiz: number;
  /** 0 yerinde, 1 uçuyor, 2 yerde durdu. */
  durum: 0 | 1 | 2;
  gecikme: number;
}

class Duvar {
  readonly ag: THREE.InstancedMesh;
  readonly tuglalar: Tugla[] = [];
  private hareketli = 0;
  readonly merkez: THREE.Vector3;
  /** Duvar yüzünün normali (yatay birim vektör). */
  private readonly normal: THREE.Vector3;
  yikildi = false;

  constructor(
    readonly plan: YikilabilirDuvar,
    malzeme: THREE.Material,
    geometri: THREE.BufferGeometry,
  ) {
    const sutunSayisi = Math.max(2, Math.round(plan.en / TUGLA.en));
    const siraSayisi = Math.max(2, Math.round(plan.yukseklik / TUGLA.boy));
    // Her tuğla duvar fotoğrafının kendi yerine denk gelen parçasını taşır: ayaktayken duvar tek parça gerçek tuğla
    // örgüsü gibi görünür, yıkılınca parçalar örgünün kırıklarını taşır. Kayma örnek başına (geometri duvara özel).
    const geo = geometri.clone();
    const kayma = new Float32Array(sutunSayisi * siraSayisi * 2);
    this.ag = new THREE.InstancedMesh(geo, malzeme, sutunSayisi * siraSayisi);
    this.ag.castShadow = this.ag.receiveShadow = true;
    this.ag.frustumCulled = false;
    const r = mulberry32(Math.round(plan.x * 31 + plan.z * 17) + 99);
    const yon = radyan(plan.yonDerece ?? 0);
    const sag = new THREE.Vector3(Math.cos(yon), 0, -Math.sin(yon));
    this.normal = new THREE.Vector3(Math.sin(yon), 0, Math.cos(yon));
    const taban = zeminY(plan.x, plan.z);
    this.merkez = new THREE.Vector3(plan.x, taban + plan.yukseklik / 2, plan.z);
    const donus = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yon);
    const renk = new THREE.Color();
    for (let j = 0; j < siraSayisi; j++)
      for (let i = 0; i < sutunSayisi; i++) {
        // Şaşırtmalı örgü: tek sıralar yarım tuğla kayık
        const kayik = j % 2 ? TUGLA.en / 2 : 0;
        const u = (i + 0.5) * TUGLA.en - (sutunSayisi * TUGLA.en) / 2 + kayik;
        const konum = new THREE.Vector3(plan.x, taban + (j + 0.5) * TUGLA.boy, plan.z).addScaledVector(sag, u);
        const k = this.tuglalar.length;
        kayma[k * 2] = (u - TUGLA.en / 2) / DOKU_BOYU;
        kayma[k * 2 + 1] = (j * TUGLA.boy) / DOKU_BOYU;
        this.tuglalar.push({ sutun: i, sira: j, konum, donus: donus.clone(), hiz: new THREE.Vector3(), acisalEksen: new THREE.Vector3(1, 0, 0), acisalHiz: 0, durum: 0, gecikme: 0 });
        // Renk dokudan gelir; örnek rengi yalnız ton oynatır (arada isli tuğla)
        const ton = 0.82 + r() * 0.3;
        if (r() < 0.12) renk.setRGB(0.45 * ton, 0.42 * ton, 0.4 * ton);
        else renk.setRGB(ton, ton, ton);
        this.ag.setColorAt(k, renk);
      }
    geo.setAttribute("aKayma", new THREE.InstancedBufferAttribute(kayma, 2));
    this.matrisleriYaz(true);
  }

  private matrisleriYaz(hepsi: boolean) {
    const m4 = new THREE.Matrix4();
    const olcek = new THREE.Vector3(1, 1, 1);
    this.tuglalar.forEach((t, k) => {
      if (!hepsi && t.durum !== 1) return;
      m4.compose(t.konum, t.donus, olcek);
      this.ag.setMatrixAt(k, m4);
    });
    this.ag.instanceMatrix.needsUpdate = true;
  }

  /** `p` noktasındaki patlama: `yaricap` içindeki tuğlalar savrulur, üstlerindekiler gecikmeyle dökülür. */
  yik(p: THREE.Vector3, yaricap: number) {
    const r = mulberry32(Math.round(p.x * 13 + p.z * 7 + performance.now()));
    /** Sütun → kopan en alt sıra: yalnız onun üstünde kalanlar desteksizdir. */
    const vurulanSutunlar = new Map<number, number>();
    for (const t of this.tuglalar) {
      if (t.durum !== 0) continue;
      const d = t.konum.distanceTo(p);
      if (d > yaricap) continue;
      const guc = 1 - d / yaricap;
      // Dipteki iki sıra ancak patlamanın tam yanındaysa kopar: yerinde bodur bir kalıntı kalır
      if (t.sira < 2 && guc < 0.6) continue;
      t.durum = 1;
      t.gecikme = 0;
      // Patlama duvarın içinde: parçalar duvar boyunca değil, iki yüzüne doğru savrulur (çoğu bir yana)
      const yan = (r() < 0.7 ? 1 : -1) * (1 + guc * 4.5 * (0.3 + r()));
      t.hiz.copy(t.konum).sub(p).setY(0).normalize().multiplyScalar(0.5 + guc * 1.8 * r()).addScaledVector(this.normal, yan);
      t.hiz.y = 1 + guc * 4.5 * r();
      t.acisalEksen.set(r() - 0.5, r() - 0.5, r() - 0.5).normalize();
      t.acisalHiz = (4 + r() * 10) * (r() < 0.5 ? -1 : 1);
      vurulanSutunlar.set(t.sutun, Math.min(vurulanSutunlar.get(t.sutun) ?? Infinity, t.sira));
      this.hareketli++;
    }
    if (!vurulanSutunlar.size) return false;
    // Deliğin üstünde kalanlar desteksiz: aşağıdan yukarı gecikmeyle dökülür (hafif öne/arkaya savrularak)
    for (const t of this.tuglalar) {
      const enAltSira = vurulanSutunlar.get(t.sutun);
      if (t.durum !== 0 || enAltSira === undefined || t.sira < enAltSira) continue;
      t.durum = 1;
      t.gecikme = 0.15 + (t.sira - enAltSira) * 0.035 + r() * 0.2;
      t.hiz.copy(this.normal).multiplyScalar((r() - 0.4) * 1.6);
      t.hiz.y = r() * 0.6;
      t.acisalEksen.set(r() - 0.5, r() - 0.5, r() - 0.5).normalize();
      t.acisalHiz = (1 + r() * 5) * (r() < 0.5 ? -1 : 1);
      this.hareketli++;
    }
    this.yikildi = true;
    return true;
  }

  guncelle(dt: number) {
    if (!this.hareketli) return;
    const dq = new THREE.Quaternion();
    for (const t of this.tuglalar) {
      if (t.durum !== 1) continue;
      if (t.gecikme > 0) {
        t.gecikme -= dt;
        continue;
      }
      t.hiz.y -= YERCEKIMI * dt;
      t.konum.addScaledVector(t.hiz, dt);
      t.donus.premultiply(dq.setFromAxisAngle(t.acisalEksen, t.acisalHiz * dt));
      const zemin = zeminY(t.konum.x, t.konum.z) + TUGLA.boy * 0.5;
      if (t.konum.y <= zemin) {
        t.konum.y = zemin;
        if (Math.abs(t.hiz.y) < 1.6) {
          t.durum = 2;
          this.hareketli--;
          const m4 = new THREE.Matrix4().compose(t.konum, t.donus, new THREE.Vector3(1, 1, 1));
          this.ag.setMatrixAt(this.tuglalar.indexOf(t), m4);
          continue;
        }
        t.hiz.y *= -0.28;
        t.hiz.x *= 0.5;
        t.hiz.z *= 0.5;
        t.acisalHiz *= 0.45;
      }
    }
    this.matrisleriYaz(false);
  }
}

export class YikilanDuvarKatmani {
  readonly grup = new THREE.Group();
  private aktif: YikilabilirDuvar[] | null = null;
  private duvarlar: Duvar[] = [];
  readonly malzeme = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0 });
  private readonly geometri = new THREE.BoxGeometry(TUGLA.en, TUGLA.boy, TUGLA.kalin);
  private dokular: THREE.Texture[] = [];

  constructor() {
    this.malzeme.onBeforeCompile = (s) => {
      s.uniforms.uOlcek = { value: new THREE.Vector2(TUGLA.en / DOKU_BOYU, TUGLA.boy / DOKU_BOYU) };
      s.vertexShader =
        "attribute vec2 aKayma;\nuniform vec2 uOlcek;\n" +
        s.vertexShader.replace(
          "#include <uv_vertex>",
          "#include <uv_vertex>\n#ifdef USE_MAP\n  vMapUv = uv * uOlcek + aKayma;\n#endif\n#ifdef USE_NORMALMAP\n  vNormalMapUv = uv * uOlcek + aKayma;\n#endif",
        );
    };
  }

  /** Tuğla dokusu (Poly Haven red_bricks_04, araclar/sokak-doku-indir.mjs); yoksa düz renk kalır. */
  private dokulariYukle(kok: string) {
    if (this.dokular.length) return;
    const yukle = (ek: string, renkli: boolean) => {
      const d = new THREE.TextureLoader().load(`${kok}arazi/dokular/duvar_tugla_${ek}.jpg`, () => {
        this.malzeme.needsUpdate = true;
      });
      d.wrapS = d.wrapT = THREE.RepeatWrapping;
      d.colorSpace = renkli ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      d.anisotropy = 8;
      this.dokular.push(d);
      return d;
    };
    this.malzeme.map = yukle("renk", true);
    this.malzeme.normalMap = yukle("normal", false);
    this.malzeme.needsUpdate = true;
  }

  ayarla(plan: YikilabilirDuvar[] | null | undefined, kok = "icerik/") {
    const yeni = plan && plan.length ? plan : null;
    if (yeni === this.aktif) return;
    if (yeni) this.dokulariYukle(kok);
    this.temizle();
    this.aktif = yeni;
    this.kur();
  }

  private kur() {
    for (const p of this.aktif ?? []) {
      const d = new Duvar(p, this.malzeme, this.geometri);
      this.duvarlar.push(d);
      this.grup.add(d.ag);
    }
  }

  private duvarlariKaldir() {
    for (const d of this.duvarlar) {
      this.grup.remove(d.ag);
      d.ag.geometry.dispose();
      d.ag.dispose();
    }
    this.duvarlar = [];
  }

  /** `p`'ye `menzil` m'den yakın, henüz yıkılmamış en yakın duvarın merkezi (yoksa null). */
  enYakin(p: THREE.Vector3, menzil = Infinity): THREE.Vector3 | null {
    let en: Duvar | null = null;
    let enD = menzil;
    for (const d of this.duvarlar) {
      if (d.yikildi) continue;
      const u = Math.hypot(d.merkez.x - p.x, d.merkez.z - p.z);
      if (u < enD) {
        enD = u;
        en = d;
      }
    }
    return en ? en.merkez.clone() : null;
  }

  /** Patlama: yarıçap içinde tuğlası olan her duvar yıkılır; yıkılan olduysa true (çağıran toz kaldırır). */
  patlama(p: THREE.Vector3, yaricap: number): boolean {
    let oldu = false;
    for (const d of this.duvarlar) if (d.yik(p, yaricap)) oldu = true;
    return oldu;
  }

  /** Mermi/parçacık/figür için dolu mu: ayakta duran duvarın taban izi. */
  doluMu(konum: THREE.Vector3, pay = 0.4): boolean {
    for (const d of this.duvarlar) {
      if (d.yikildi) continue;
      const yon = radyan(d.plan.yonDerece ?? 0);
      const dx = konum.x - d.plan.x;
      const dz = konum.z - d.plan.z;
      const u = dx * Math.cos(yon) - dz * Math.sin(yon);
      const v = dx * Math.sin(yon) + dz * Math.cos(yon);
      if (Math.abs(u) < d.plan.en / 2 + pay && Math.abs(v) < TUGLA.kalin / 2 + pay) return true;
    }
    return false;
  }

  guncelle(dt: number) {
    for (const d of this.duvarlar) d.guncelle(Math.min(dt, 0.05));
  }

  /** Sahne sıfırlaması / zemin değişti: duvarlar yeniden örülür. */
  yenidenKur() {
    this.duvarlariKaldir();
    this.kur();
  }

  temizle() {
    this.duvarlariKaldir();
    this.aktif = null;
  }
}
