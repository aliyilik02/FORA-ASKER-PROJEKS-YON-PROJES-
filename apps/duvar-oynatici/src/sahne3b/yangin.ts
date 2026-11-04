/**
 * Kalıcı yangınlar (3 Kasım gece): alev + kor + kara duman + titreyen turuncu ışık. Panel efekti `yangin` seçilen
 * yöndeki patlama noktasına yangın ekler; `yangin_sondur` hepsini söndürür (alev 2 sn'de kısılır, duman bir süre tüter).
 * Parçacıklar `ParcacikSistemi.yangin` ile saniye başına oranla yayılır (kare hızından bağımsız, kalite çarpanıyla).
 */
import * as THREE from "three";
import type { ParcacikSistemi } from "./parcaciklar";
import { konumAzimutu } from "./uzay";

interface Yangin {
  konum: THREE.Vector3;
  /** Alan yarıçapı (m). */
  yaricap: number;
  /** 0–1 (panel şiddeti). */
  siddet: number;
  /** Alev gücü 0–1: başlarken 1 sn'de yükselir, söndürülünce 2 sn'de iner; 0 olunca duman da kesilir, kayıt silinir. */
  guc: number;
  sonuyor: boolean;
  isik: THREE.PointLight;
  /** Titreme fazları. */
  faz: number;
  /** Yaş (sn). */
  yas: number;
  /** Kendiliğinden sönme: bu yaşta sönmeye başlar (sn); null kalıcı (panel söndürene dek). Patlama artığı yangın 3–4 sn. */
  omur: number | null;
}

export class YanginKatmani {
  readonly grup = new THREE.Group();
  private readonly yanginlar: Yangin[] = [];
  /** Rüzgâr (dünya x/z, m/s) — duman sürüklenir. */
  ruzgar = new THREE.Vector3();
  /** Ortam ışığı 0–1: gece yangın ışığı daha baskın (ışık gücü sabit, çevre karanlık). */

  constructor(private readonly parcaciklar: ParcacikSistemi) {}

  get sayi() {
    return this.yanginlar.length;
  }

  /**
   * Yangın ekler. `omur` (sn) verilirse o yaşta kendiliğinden sönmeye başlar (patlama artığı: 4 Kasım, kullanıcı
   * "patlamadan sonra ufak bir yangın 3–4 sn sürüp sönsün"); verilmezse panel söndürene dek sürer.
   */
  ekle(konum: THREE.Vector3, siddet: number, omur?: number) {
    const s = Math.max(0.15, Math.min(1, siddet));
    // Aynı noktaya ikinci yangın: büyüt; kalıcı olan kalıcı kalır, ömürlüyse ömrü uzar
    const yakin = this.yanginlar.find((y) => y.konum.distanceTo(konum) < 3);
    if (yakin) {
      yakin.siddet = Math.min(1, yakin.siddet + s * 0.5);
      yakin.yaricap = Math.min(6, yakin.yaricap + 0.8);
      yakin.sonuyor = false;
      yakin.omur = omur === undefined ? null : yakin.omur === null ? null : Math.max(yakin.omur, yakin.yas + omur);
      return;
    }
    const isik = new THREE.PointLight(0xff8a2a, 0, 14 + 20 * s, 1.6);
    isik.position.copy(konum).add(new THREE.Vector3(0, 1.2 + s, 0));
    this.grup.add(isik);
    this.yanginlar.push({ konum: konum.clone(), yaricap: 1.2 + 2.2 * s, siddet: s, guc: 0, sonuyor: false, isik, faz: Math.random() * 100, yas: 0, omur: omur ?? null });
  }

  /** Ses motoru için (her kare): yangın başına sahne azimutu, yatay mesafe, seviye = şiddet × alev gücü (sönerken iner). */
  sesOzeti(): Array<{ azimut: number; mesafe: number; seviye: number }> {
    return this.yanginlar.map((y) => ({ azimut: konumAzimutu(y.konum), mesafe: Math.hypot(y.konum.x, y.konum.z), seviye: y.siddet * y.guc }));
  }

  /** Hepsini söndür (alev kısılır, duman tüter, sonra kayıt silinir). */
  sondur() {
    for (const y of this.yanginlar) y.sonuyor = true;
  }

  /** Anında kaldır (sahne sıfırlama). */
  temizle() {
    for (const y of this.yanginlar) this.grup.remove(y.isik);
    this.yanginlar.length = 0;
  }

  guncelle(dt: number) {
    for (let i = this.yanginlar.length - 1; i >= 0; i--) {
      const y = this.yanginlar[i];
      y.faz += dt;
      y.yas += dt;
      if (y.omur !== null && y.yas >= y.omur) y.sonuyor = true;
      if (y.sonuyor) {
        y.guc = Math.max(0, y.guc - dt / 2.5);
        if (y.guc <= 0) {
          this.grup.remove(y.isik);
          this.yanginlar.splice(i, 1);
          continue;
        }
      } else y.guc = Math.min(1, y.guc + dt);
      // Titreme: üç frekansın toplamı (alev yalpalaması) + nadir parlamalar
      const t = y.faz;
      const titreme = 0.78 + 0.12 * Math.sin(t * 13.1) + 0.07 * Math.sin(t * 29.7 + 1.3) + 0.05 * Math.sin(t * 5.3 + 2.1);
      y.isik.intensity = y.guc * y.siddet * 60 * y.yaricap * titreme; // cd; 520 zemini turuncuya boyuyordu (3 Kasım)
      y.isik.position.x = y.konum.x + 0.25 * Math.sin(t * 7.1);
      y.isik.position.z = y.konum.z + 0.25 * Math.cos(t * 6.3);
      this.parcaciklar.yangin(y.konum, y.yaricap, y.siddet * y.guc, y.sonuyor, dt, this.ruzgar);
    }
  }
}
