/**
 * Helikopter rotor tozu ("downwash" / "brownout") profilleri: zemin malzemesi bölge ve mevsimden seçilir.
 *
 *  - kış (her bölge): kar savrulması — beyaz-mavi, daha parlak ve ince, havada uzun asılı kalır, güneşte parıldar
 *  - kırsal açık arazi / dağlık: kuru toprak — açık kahve toz, koyu toprak topağı ve kuru ot kırıntısı
 *  - ormanlık: koyu toprak (yeşilimsi kahve) + savrulan yaprak/çimen kırıntısı (süzülerek düşer)
 *  - üs bölgesi / meskûn mahal: açık gri beton/asfalt tozu, az hacim, gri kırıntı
 *
 * Saf modül (THREE yok, testli). Renkler parçacık gölgelendiricisinde doğrudan ekran rengi olarak kullanılır
 * (patlama tozuyla aynı ölçek: kuru toprak ≈ [0,62 0,53 0,39]).
 */

export type RotorTozuTuru = "toprak" | "kar" | "orman" | "beton";

export interface RotorTozuProfili {
  /** Toz rengi (0–1). */
  renk: [number, number, number];
  /** Parçacık başına parlaklık sapması (±, oran). */
  renkSapma: number;
  /** Yayım hacmi çarpanı (saniyedeki parçacık sayısı). */
  hacim: number;
  /** Parçacık boyutu çarpanı (kar daha ince). */
  boyut: number;
  /** Ömür çarpanı: havada asılı kalma süresi. */
  omur: number;
  /** Saydamlık çarpanı. */
  alfa: number;
  /** Kaldırma çarpanı: yavaşlayan akışın halka olup yükselme hızı. */
  kaldirma: number;
  /** Savrulan kırıntı renkleri (taş, topak, yaprak, kar topağı). */
  kirinti: Array<[number, number, number]>;
  /** Kırıntı yayım çarpanı. */
  kirintiOrani: number;
  /** Kırıntı yer çekimi (m/s²): taş/beton 9,8; yaprak ve kar topağı süzülür. */
  kirintiYercekimi: number;
  /** Kırıntı yatay sürtünmesi (1/sn): yaprak havada çabuk yavaşlar. */
  kirintiSurtunme: number;
  /** Güneşte parıldayan kristal oranı (yalnız kar; 0 = yok). */
  parilti: number;
}

export const ROTOR_TOZU_PROFILLERI: Record<RotorTozuTuru, RotorTozuProfili> = {
  toprak: {
    renk: [0.62, 0.53, 0.39],
    renkSapma: 0.12,
    hacim: 1,
    boyut: 1,
    omur: 1,
    alfa: 1,
    kaldirma: 1,
    kirinti: [
      [0.26, 0.2, 0.14],
      [0.34, 0.27, 0.19],
      [0.4, 0.41, 0.22],
    ],
    kirintiOrani: 1,
    kirintiYercekimi: 9.8,
    kirintiSurtunme: 0.6,
    parilti: 0,
  },
  kar: {
    renk: [0.9, 0.94, 1.0],
    renkSapma: 0.05,
    hacim: 1.15,
    boyut: 0.72,
    omur: 1.6,
    alfa: 1.1,
    kaldirma: 0.6,
    kirinti: [
      [0.9, 0.92, 0.97],
      [0.8, 0.84, 0.9],
    ],
    kirintiOrani: 0.7,
    kirintiYercekimi: 4.5,
    kirintiSurtunme: 1.2,
    parilti: 1,
  },
  orman: {
    renk: [0.42, 0.38, 0.26],
    renkSapma: 0.1,
    hacim: 0.75,
    boyut: 0.95,
    omur: 0.9,
    alfa: 0.9,
    kaldirma: 0.9,
    kirinti: [
      [0.3, 0.36, 0.13],
      [0.45, 0.34, 0.13],
      [0.36, 0.42, 0.17],
      [0.24, 0.17, 0.1],
    ],
    kirintiOrani: 1.7,
    kirintiYercekimi: 2.6,
    kirintiSurtunme: 1.6,
    parilti: 0,
  },
  beton: {
    renk: [0.64, 0.64, 0.62],
    renkSapma: 0.07,
    hacim: 0.55,
    boyut: 0.9,
    omur: 0.85,
    alfa: 0.8,
    kaldirma: 0.8,
    kirinti: [
      [0.42, 0.42, 0.4],
      [0.56, 0.55, 0.51],
      [0.3, 0.3, 0.29],
    ],
    kirintiOrani: 0.55,
    kirintiYercekimi: 9.8,
    kirintiSurtunme: 0.5,
    parilti: 0,
  },
};

/** Bölge + mevsim → rotor tozu türü. Kar her bölgede önceliklidir; bilinmeyen bölge kuru toprak sayılır. */
export function rotorTozuTuru(bolge: string, mevsim: string): RotorTozuTuru {
  if (mevsim === "kis") return "kar";
  if (bolge === "ormanlik") return "orman";
  if (bolge === "us_bolgesi" || bolge === "meskun_mahal") return "beton";
  return "toprak";
}

/**
 * Rotor tozu şiddeti 0–1: kızaklar ~20 m'nin altına inince yer etkisiyle hızla artar (alçaldıkça üstel),
 * rotor gücüyle (devir oranı 0–1) ölçeklenir.
 */
export function rotorTozuSiddeti(irtifa: number, rotorGucu: number): number {
  const yakinlik = Math.max(0, Math.min(1, 1 - irtifa / 20));
  return Math.pow(yakinlik, 1.5) * Math.max(0, Math.min(1, rotorGucu));
}
