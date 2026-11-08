/**
 * Aydınlatma fişeği (8 Kasım, C-18): paraşütlü yıldız fişeği — seçilen yönde ~150 m ileride, ~170 m yükseklikte tutuşur,
 * ~2,5 m/s inerek 20–35 sn yanar (40 mm M583A1: ≥ 35 sn, ~70 bin kandela; 60 mm havan: 2,5 m/s iniş), paraşütte
 * salınır (sert, gezinen gölgeler), son 3 sn'de söner. Işık: sabit havuz (ISIK_SAYISI PointLight; yangın gibi program
 * çeşidi sabit kalsın); görünüm: her kare küçük katkı parlaması (ates grubu) + seyrek duman izi (tutenDuman). Gece eğitim
 * aracı: eğitmen "fişek" atınca kursiyer araziyi ve yaralıyı birkaç saniye görür, sonra karanlık döner.
 */
import * as THREE from "three";
import type { ParcacikSistemi } from "./parcaciklar";
import { konumAzimutu } from "./uzay";

export interface Fisek {
  /** Tutuşma noktası (dünya). */
  merkez: THREE.Vector3;
  /** Anlık konum (salınım dahil). */
  konum: THREE.Vector3;
  yas: number;
  /** Yanma süresi (sn). */
  omur: number;
  /** 0–1 (panel şiddeti → parlaklık). */
  siddet: number;
  faz: number;
  dumanSayac: number;
}

export const ISIK_SAYISI = 2;
export const INIS_HIZI = 2.5;
/** Varsayılan yanma süresi (sn); 40 mm fişek 20–35 sn. */
export const VARSAYILAN_OMUR = 28;
/** Tam ışık (kandela eşdeğeri; three fiziksel ışıkta PointLight.intensity). */
const TAM_ISIK = 70000;
const SONME_SURESI = 3;

export class FisekKatmani {
  readonly grup = new THREE.Group();
  private readonly fisekler: Fisek[] = [];
  private readonly isiklar: THREE.PointLight[] = [];

  constructor(private readonly parcaciklar: ParcacikSistemi) {
    for (let i = 0; i < ISIK_SAYISI; i++) {
      const isik = new THREE.PointLight(0xfff1d2, 0, 0, 2);
      isik.visible = false;
      this.isiklar.push(isik);
      this.grup.add(isik);
    }
  }

  get sayi() {
    return this.fisekler.length;
  }

  get yananIsik() {
    return this.isiklar.filter((i) => i.visible && i.intensity > 0).length;
  }

  /** Fişeklerin toplam ışık payı 0–1 (sahne dolgu ışığı ve gök parlaması için). */
  get toplamGuc() {
    return Math.min(1, this.fisekler.reduce((t, f) => t + this.guc(f) * f.siddet, 0));
  }

  private guc(f: Fisek): number {
    const giris = Math.min(1, f.yas / 0.6);
    const cikis = Math.min(1, Math.max(0, (f.omur - f.yas) / SONME_SURESI));
    return giris * cikis;
  }

  /** Fişek at: tutuşma noktası `merkez` (dünya; y yükseklik), `siddet` 0–1, `omur` sn. */
  ekle(merkez: THREE.Vector3, siddet = 1, omur = VARSAYILAN_OMUR) {
    if (this.fisekler.length >= 4) this.fisekler.shift();
    this.fisekler.push({ merkez: merkez.clone(), konum: merkez.clone(), yas: 0, omur: Math.max(5, omur), siddet: Math.max(0.2, Math.min(1, siddet)), faz: Math.random() * 6.28, dumanSayac: 0 });
  }

  /** Ses motoru için: azimut, yatay mesafe, seviye (güç × şiddet). */
  sesOzeti(): Array<{ azimut: number; mesafe: number; seviye: number }> {
    return this.fisekler.map((f) => ({ azimut: konumAzimutu(f.konum), mesafe: Math.hypot(f.konum.x, f.konum.z), seviye: this.guc(f) * f.siddet }));
  }

  /** Anında kaldır (sahne sıfırlama); ışıklar sahnede kalır, söner. */
  temizle() {
    this.fisekler.length = 0;
    this.isiklariAta();
  }

  guncelle(dt: number) {
    for (let i = this.fisekler.length - 1; i >= 0; i--) {
      const f = this.fisekler[i];
      f.yas += dt;
      f.faz += dt;
      if (f.yas >= f.omur) {
        this.fisekler.splice(i, 1);
        continue;
      }
      // Paraşütte iniş + yavaş sarkaç salınımı (genlik 4 m, ~4,5 sn)
      const y = f.merkez.y - INIS_HIZI * f.yas;
      f.konum.set(f.merkez.x + 4 * Math.sin((f.faz * 6.283) / 4.5), y, f.merkez.z + 2.5 * Math.cos((f.faz * 6.283) / 6.1));
      const g = this.guc(f);
      // Görünür parlama (katkı; uzaklıkta küçük bir yıldız) ve seyrek duman izi
      this.parcaciklar.parlama(f.konum, (1.2 + 1.3 * f.siddet) * Math.max(0.15, g));
      f.dumanSayac -= dt;
      if (f.dumanSayac <= 0 && g > 0.3) {
        f.dumanSayac = 0.18;
        this.parcaciklar.tutenDuman(f.konum, 1.2, 0.45 * f.siddet);
      }
    }
    this.isiklariAta();
  }

  private isiklariAta() {
    const aday = [...this.fisekler].map((f) => ({ f, puan: this.guc(f) * f.siddet })).filter((a) => a.puan > 0).sort((a, b) => b.puan - a.puan);
    for (let i = 0; i < this.isiklar.length; i++) {
      const isik = this.isiklar[i];
      const a = aday[i];
      if (!a) {
        isik.intensity = 0;
        isik.visible = false;
        continue;
      }
      const titreme = 0.92 + 0.06 * Math.sin(a.f.faz * 17.3) + 0.02 * Math.sin(a.f.faz * 41.1);
      isik.visible = true;
      isik.intensity = TAM_ISIK * a.puan * titreme;
      isik.position.copy(a.f.konum);
    }
  }
}
