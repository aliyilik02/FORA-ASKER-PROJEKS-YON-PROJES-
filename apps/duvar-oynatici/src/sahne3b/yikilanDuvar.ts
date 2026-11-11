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
  yikildi = false;

  constructor(
    readonly plan: YikilabilirDuvar,
    malzeme: THREE.Material,
    geometri: THREE.BufferGeometry,
  ) {
    const sutunSayisi = Math.max(2, Math.round(plan.en / TUGLA.en));
    const siraSayisi = Math.max(2, Math.round(plan.yukseklik / TUGLA.boy));
    this.ag = new THREE.InstancedMesh(geometri, malzeme, sutunSayisi * siraSayisi);
    this.ag.castShadow = this.ag.receiveShadow = true;
    this.ag.frustumCulled = false;
    const r = mulberry32(Math.round(plan.x * 31 + plan.z * 17) + 99);
    const yon = radyan(plan.yonDerece ?? 0);
    const sag = new THREE.Vector3(Math.cos(yon), 0, -Math.sin(yon));
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
        this.tuglalar.push({ sutun: i, sira: j, konum, donus: donus.clone(), hiz: new THREE.Vector3(), acisalEksen: new THREE.Vector3(1, 0, 0), acisalHiz: 0, durum: 0, gecikme: 0 });
        const ton = 0.7 + r() * 0.45;
        // Çoğu tuğla kırmızısı, arada sıva kalıntısı (gri) ve isli tuğla
        const tur = r();
        if (tur < 0.14) renk.setRGB(0.3 * ton, 0.29 * ton, 0.27 * ton);
        else if (tur < 0.24) renk.setRGB(0.1 * ton, 0.07 * ton, 0.06 * ton);
        else renk.setRGB(0.3 * ton, 0.12 * ton, 0.08 * ton);
        this.ag.setColorAt(k, renk);
      }
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
    let enAltSira = Infinity;
    const vurulanSutunlar = new Set<number>();
    for (const t of this.tuglalar) {
      if (t.durum !== 0) continue;
      const d = t.konum.distanceTo(p);
      if (d > yaricap) continue;
      const guc = 1 - d / yaricap;
      t.durum = 1;
      t.gecikme = 0;
      t.hiz.copy(t.konum).sub(p).setY(0).normalize().multiplyScalar(1.2 + guc * 5 * (0.4 + r()));
      t.hiz.y = 1.5 + guc * 5 * r();
      t.acisalEksen.set(r() - 0.5, r() - 0.5, r() - 0.5).normalize();
      t.acisalHiz = (4 + r() * 10) * (r() < 0.5 ? -1 : 1);
      vurulanSutunlar.add(t.sutun);
      enAltSira = Math.min(enAltSira, t.sira);
      this.hareketli++;
    }
    if (!vurulanSutunlar.size) return false;
    // Deliğin üstünde kalanlar desteksiz: aşağıdan yukarı gecikmeyle dökülür (hafif öne/arkaya savrularak)
    for (const t of this.tuglalar) {
      if (t.durum !== 0 || t.sira < enAltSira) continue;
      if (!vurulanSutunlar.has(t.sutun) && !vurulanSutunlar.has(t.sutun - 1) && !vurulanSutunlar.has(t.sutun + 1)) continue;
      t.durum = 1;
      t.gecikme = 0.15 + (t.sira - enAltSira) * 0.035 + r() * 0.2;
      t.hiz.copy(t.konum).sub(p).setY(0).normalize().multiplyScalar(0.4 + r() * 1.6);
      t.hiz.y = r() * 0.8;
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
  private readonly malzeme = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0 });
  private readonly geometri = new THREE.BoxGeometry(TUGLA.en * 0.96, TUGLA.boy * 0.93, TUGLA.kalin);

  ayarla(plan: YikilabilirDuvar[] | null | undefined) {
    const yeni = plan && plan.length ? plan : null;
    if (yeni === this.aktif) return;
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
