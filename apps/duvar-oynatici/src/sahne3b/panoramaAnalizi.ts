/**
 * Panorama analizi (saf, DOM'suz): küçük, dik (üst satır gök) bir RGBA kopyadan ufuk rengi, parlaklık bantları ve güneş
 * tahmini. Eskiden 8K resim ana iş parçacığında üç ayrı tuvale küçültülüyordu (güneş, ufuk, gece parlaklığı: her biri
 * yeniden çözme demekti); şimdi panorama işçide bir kez küçültülür (`panoramaCozucu.ts`), bu işlevler orada çalışır ve
 * sonuç sahneye sayı olarak gelir. Bantlar açıyla tanımlı olduğundan kopyanın boyutundan bağımsızdır (256×128 önerilir).
 */
import { gunesTahmin, type GunesTahmini } from "./gunes";

export const ANALIZ_GENISLIGI = 256;
export const ANALIZ_YUKSEKLIGI = 128;

export interface PanoramaAnalizi {
  /** Ufuk bandının (yükseklik ≈ +5,6°…−11,3°; eski 128×64 düzeninde 30–35. satırlar) ortalama sRGB rengi, 0–1. */
  ufuk: [number, number, number];
  /** Doğrusal parlaklık: zemin bandı (ufkun 8–35° altı) ve gök (ufkun 10–60° üstü) ortalaması. */
  parlaklik: { zemin: number; gok: number };
  /** Gökteki en parlak, çevresine göre belirgin bölge (güneş/ay); yoksa null (bkz. gunes.ts). */
  gunes: GunesTahmini | null;
}

/** Satır merkezinin ufka göre yüksekliği (derece; equirect, üst satır +90°). */
function satirYuksekligi(y: number, h: number): number {
  return 90 - ((y + 0.5) / h) * 180;
}

function srgbDogrusal(v: number): number {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/**
 * Ufuk bandının ortalama sRGB rengi (0–1). Hibrit kipte 3B arazinin kenarı bu renge sislenir; panoramanın ufkundaki
 * zemin/pus tonu. Bant eski 128×64 kopyanın 30–35. satırları (v ≈ 0,47–0,56), yani ufkun hemen altı.
 */
export function ufukRengiHesapla(veri: Uint8ClampedArray, w: number, h: number): [number, number, number] {
  const y0 = Math.round((h * 30) / 64);
  const y1 = Math.max(y0 + 1, Math.round((h * 36) / 64));
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let y = y0; y < y1 && y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      r += veri[i];
      g += veri[i + 1];
      b += veri[i + 2];
      n++;
    }
  }
  if (n === 0) return [0.78, 0.8, 0.82];
  return [r / n / 255, g / n / 255, b / n / 255];
}

/**
 * Doğrusal parlaklık ölçüsü: zemin bandı (ufkun 8–35° altı) ve gök (10–60° üstü). Gece panoramasında 3B ışık (ay, dolgu)
 * bu ölçüye eşlenir (sahne3b isikGuncelle); satır yükseklikleri açıyla seçildiğinden kopya boyutu sonucu değiştirmez.
 */
export function parlaklikHesapla(veri: Uint8ClampedArray, w: number, h: number): { zemin: number; gok: number } {
  let zemin = 0;
  let nz = 0;
  let gok = 0;
  let ng = 0;
  for (let y = 0; y < h; y++) {
    const yukseklik = satirYuksekligi(y, h);
    const zemindeMi = yukseklik <= -8 && yukseklik >= -35;
    if (!zemindeMi && !(yukseklik >= 10 && yukseklik <= 60)) continue;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const l = 0.2126 * srgbDogrusal(veri[i]) + 0.7152 * srgbDogrusal(veri[i + 1]) + 0.0722 * srgbDogrusal(veri[i + 2]);
      if (zemindeMi) {
        zemin += l;
        nz++;
      } else {
        gok += l;
        ng++;
      }
    }
  }
  return { zemin: zemin / Math.max(1, nz), gok: gok / Math.max(1, ng) };
}

/** 2×2 kutu ortalamasıyla yarı boyut (sRGB değerleri üzerinde; tuvalin küçültmesi gibi). w ve h çift olmalı. */
export function yariyaIndir(veri: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const yw = w >> 1;
  const yh = h >> 1;
  const cikti = new Uint8ClampedArray(yw * yh * 4);
  for (let y = 0; y < yh; y++) {
    for (let x = 0; x < yw; x++) {
      const a = (2 * y * w + 2 * x) * 4;
      const b = a + w * 4;
      const o = (y * yw + x) * 4;
      for (let k = 0; k < 4; k++) cikti[o + k] = (veri[a + k] + veri[a + 4 + k] + veri[b + k] + veri[b + 4 + k] + 2) >> 2;
    }
  }
  return cikti;
}

/**
 * Üç ölçü birlikte (işçide panorama başına bir kez). Güneş 256×128 kopyadan; ufuk ve parlaklık eski koddaki gibi
 * 128×64'ten (2×2 ortalama). Tarayıcıda 24 panoramada eski yolla (8K → tuvale drawImage) karşılaştırıldı: güneş
 * azimutu en çok 0,8°, yüksekliği 0,15°, gücü 0,01 farklı (resizeQuality "high"; "low" güneşi 176°'ye dek kaydırıyordu).
 */
export function panoramaAnalizEt(veri: Uint8ClampedArray, w: number, h: number): PanoramaAnalizi {
  const kaba = w % 2 === 0 && h % 2 === 0 ? yariyaIndir(veri, w, h) : veri;
  const kw = kaba === veri ? w : w >> 1;
  const kh = kaba === veri ? h : h >> 1;
  return { ufuk: ufukRengiHesapla(kaba, kw, kh), parlaklik: parlaklikHesapla(kaba, kw, kh), gunes: gunesTahmin(veri, w, h) };
}
