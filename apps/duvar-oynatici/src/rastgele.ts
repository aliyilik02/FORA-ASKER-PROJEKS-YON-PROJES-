/**
 * Oturum tohumlu rastgelelik (8 Kasım, C-20): `?tohum=1234` verilirse efekt varyantları, parçacık dağılımı ve figür
 * bekleme fazı aynı tohumla aynı sırayla üretilir — senaryo provası, hata yeniden üretimi ve karşılaştırmalı ölçüm için.
 * Tohum yoksa Math.random (her açılış farklı). mulberry32: hızlı, 32 bit durum, bu iş için yeterli.
 */
/** Tohumlu üretici; null iken Math.random çağrı anında okunur (testler Math.random'ı sarabilir). */
let uretici: (() => number) | null = null;
let aktifTohum: number | null = null;

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

/** Tohumu ayarlar (null: Math.random'a dön). Metin tohum sayıya çevrilir (basit karma). */
export function tohumAyarla(tohum: number | string | null) {
  if (tohum === null || tohum === "" || tohum === undefined) {
    uretici = null;
    aktifTohum = null;
    return;
  }
  let n: number;
  if (typeof tohum === "number") n = tohum;
  else {
    n = 2166136261;
    for (let i = 0; i < tohum.length; i++) n = Math.imul(n ^ tohum.charCodeAt(i), 16777619);
  }
  aktifTohum = n >>> 0;
  uretici = mulberry32(aktifTohum);
}

export function tohum(): number | null {
  return aktifTohum;
}

/** 0 ≤ r < 1 (tohumlu ya da Math.random). */
export function rastgele(): number {
  return uretici ? uretici() : Math.random();
}

/** [a, b) aralığında. */
export function rastgeleAralik(a: number, b: number): number {
  return a + rastgele() * (b - a);
}
