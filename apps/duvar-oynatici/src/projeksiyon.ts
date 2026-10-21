/**
 * Duvar yerleşimi ve panoramik projeksiyon matematiği.
 *
 * Dünya, izleyicinin etrafında silindirik bir panorama olarak düşünülür: her nokta bir azimut
 * (yatay açı, derece; 0 = orta duvarın ortası, sola negatif, sağa pozitif) ile tanımlanır.
 * U şeklindeki 3 duvarın her biri belirli bir yaw (bakış yönü) ve fov (yatay görüş açısı) ile
 * panoramanın bir dilimini gösterir. Köşelerde görüntü kesintisiz devam eder.
 */

export interface Duvar {
  ad: "sol" | "orta" | "sag";
  /** Duvarın ortasının baktığı azimut (derece). */
  yaw: number;
  /** Duvarın kapsadığı yatay açı (derece). */
  fov: number;
}

/** U duvar: yanlar ortaya dik; izleyici ortada → her duvar 90°. */
export const VARSAYILAN_DUVARLAR: Duvar[] = [
  { ad: "sol", yaw: -90, fov: 90 },
  { ad: "orta", yaw: 0, fov: 90 },
  { ad: "sag", yaw: 90, fov: 90 },
];

/** Farklı duvar açısı için (ör. düz tek duvar 3 projektör = 3 × 40°). */
export function duvarlariOlustur(fov: number): Duvar[] {
  return VARSAYILAN_DUVARLAR.map((d, i) => ({ ...d, fov, yaw: (i - 1) * fov }));
}

/** Tuval üzerindeki bir duvar bölgesi. */
export interface Yerlesim {
  duvar: Duvar;
  indeks: number;
  x: number;
  genislik: number;
  yukseklik: number;
}

export function aciNormalize(a: number): number {
  return ((((a + 180) % 360) + 360) % 360) - 180;
}

export function duvarYerlesimleri(W: number, H: number, duvarlar: Duvar[] = VARSAYILAN_DUVARLAR): Yerlesim[] {
  const g = W / duvarlar.length;
  return duvarlar.map((duvar, indeks) => ({ duvar, indeks, x: indeks * g, genislik: g, yukseklik: H }));
}

/** Azimut bu duvarda görünüyorsa tuval x koordinatı, değilse null. `pay` ile kenar dışı tolerans (derece). */
export function azimutX(azimut: number, y: Yerlesim, pay = 0): number | null {
  const fark = aciNormalize(azimut - y.duvar.yaw);
  const yarim = y.duvar.fov / 2 + pay;
  if (fark < -yarim || fark > yarim) return null;
  return y.x + (fark / y.duvar.fov + 0.5) * y.genislik;
}

/** Tuval x'inden azimut (duvar içinde). */
export function xAzimut(x: number, y: Yerlesim): number {
  return y.duvar.yaw + ((x - y.x) / y.genislik - 0.5) * y.duvar.fov;
}

/** Azimutu gösteren ilk duvarı ve x'i bulur. */
export function azimutKonum(azimut: number, yerlesimler: Yerlesim[], pay = 0): { x: number; yerlesim: Yerlesim } | null {
  for (const y of yerlesimler) {
    const x = azimutX(azimut, y, pay);
    if (x !== null) return { x, yerlesim: y };
  }
  return null;
}

/** Panelden gelen yön (0–359, 0 = karşı/orta, saat yönünde) → azimut (-180..180). */
export function yonAzimut(yon: number): number {
  return aciNormalize(yon);
}

/** Azimut → stereo pan (-1 sol, +1 sağ). Arkadaki sesler de yanlara düşer. */
export function azimutPan(azimut: number): number {
  return Math.sin((aciNormalize(azimut) * Math.PI) / 180);
}

/** Güneşin konumu: 05:45 solda (-90°) doğar, ~12:45 ortada tepede, 19:45 sağda (+90°) batar (14 saatlik yaz günü). */
export function gunesKonumu(saat: number): { azimut: number; yukseklik: number } {
  const t = (saat - 5.75) / 14;
  return { azimut: -90 + t * 180, yukseklik: Math.sin(t * Math.PI) * 65 };
}

export function yumusak(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** 0 (gece) – 1 (tam gündüz). */
export function gunIsigi(saat: number): number {
  return yumusak(-12, 10, gunesKonumu(saat).yukseklik);
}

/** Alacakaranlık yoğunluğu 0–1 (güneş ufka yakınken 1). */
export function alacakaranlik(saat: number): number {
  const e = gunesKonumu(saat).yukseklik;
  return Math.max(0, 1 - Math.abs(e) / 14);
}

export type ZamanDilimi = "gunduz" | "alacakaranlik" | "gece";

export function zamanDilimi(saat: number): ZamanDilimi {
  const e = gunesKonumu(saat).yukseklik;
  if (e > 12) return "gunduz";
  if (e > -12) return "alacakaranlik";
  return "gece";
}

/** Nesne uzaklığı (0 = hemen önde, 1 = ufukta) → zemin y ve ölçek. */
export function mesafeYerlesimi(mesafe: number, ufukY: number, H: number): { y: number; olcek: number } {
  const m = Math.max(0, Math.min(1, mesafe));
  const yakinlik = Math.pow(1 - m, 1.7);
  return { y: ufukY + yakinlik * (H - ufukY) * 0.92, olcek: 0.14 + yakinlik * 1.3 };
}

export type Renk = [number, number, number];

export function karistir(a: Renk, b: Renk, t: number): Renk {
  const k = Math.max(0, Math.min(1, t));
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

export function rgb(c: Renk, alfa = 1): string {
  return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${alfa})`;
}

/** Gece karartması ve mavi ay ışığı tonlaması (taban: ay ışığında siluetler seçilsin). */
export function isikla(c: Renk, isik: number): Renk {
  const k = 0.2 + 0.8 * isik;
  return karistir([c[0] * k, c[1] * k, c[2] * k], [24, 34, 70], (1 - isik) * 0.45);
}

/** Deterministik sözde rastgele sayı üreteci (sahne nesneleri her açılışta aynı yerde). */
export function mulberry32(tohum: number): () => number {
  let a = tohum >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
