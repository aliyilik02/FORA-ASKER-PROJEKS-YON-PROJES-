/**
 * Panoramaya özel yerleşim planı: patlama, figür ve helikopter için önceden tanımlı noktalar ve
 * yasak açı aralıkları (ağaç kümesi, bina, kaya). Panelden gelen yön en yakın uygun noktaya
 * "yapışır"; nokta yoksa yön yasak aralıkların dışına itilir. Böylece patlama ağacın içinde
 * olmaz, figür duvarın ortasında durmaz, helikopter açık alana iner.
 *
 * Manifest (panorama kaydı):
 *   "noktalar": [{ "ad": "tarla sol", "azimut": -40, "mesafe": 18, "tur": ["patlama", "figur"] }],
 *   "yasak":    [{ "baslangic": 7, "bitis": 68, "ad": "kavaklar" }]
 * `tur` verilmezse nokta her amaç için geçerlidir. Açılar derece, 0 = orta duvar, sağa artı.
 */

export type YerlesimTuru = "patlama" | "figur" | "helikopter" | "toz" | "asker" | "tank";

export interface YerlesimNoktasi {
  ad?: string;
  azimut: number;
  mesafe: number;
  tur?: YerlesimTuru[];
}

export interface YasakAralik {
  ad?: string;
  /** Saat yönünde başlangıçtan bitişe (ör. 170 → -170 arkayı kapsar). */
  baslangic: number;
  bitis: number;
}

export interface YerlesimPlani {
  noktalar?: YerlesimNoktasi[];
  yasak?: YasakAralik[];
}

export interface YerlesimSecimi {
  azimut: number;
  mesafe: number;
  nokta?: YerlesimNoktasi;
  /** true: istenen yön değiştirildi (nokta veya yasak kaçınma). */
  degisti: boolean;
}

export function aciNormalize(a: number): number {
  return ((((a + 180) % 360) + 360) % 360) - 180;
}

/** Saat yönünde baslangic→bitis aralığında mı (sarmalı). */
export function aralikta(azimut: number, aralik: YasakAralik): boolean {
  const a = aciNormalize(azimut - aralik.baslangic);
  const genislik = ((aciNormalize(aralik.bitis - aralik.baslangic) + 360) % 360) || 360;
  const konum = (a + 360) % 360;
  return konum <= genislik;
}

export function yasakMi(azimut: number, yasak: YasakAralik[] | undefined): boolean {
  return (yasak ?? []).some((y) => aralikta(azimut, y));
}

/** Azimut yasak aralıktaysa en yakın kenarın `pay` derece dışına iter (en çok 3 kez, zincirleme aralıklar için). */
export function yasaktanKacin(azimut: number, yasak: YasakAralik[] | undefined, pay = 4): number {
  let a = aciNormalize(azimut);
  for (let tur = 0; tur < 3; tur++) {
    const y = (yasak ?? []).find((y) => aralikta(a, y));
    if (!y) return a;
    const basaUzaklik = Math.abs(aciNormalize(a - y.baslangic));
    const sonaUzaklik = Math.abs(aciNormalize(a - y.bitis));
    a = aciNormalize(basaUzaklik <= sonaUzaklik ? y.baslangic - pay : y.bitis + pay);
  }
  return a;
}

/**
 * Birlik yerleşimi: türler sırayla denenir (ör. ["tank", "figur"]), istenen yöne en yakın **boş**
 * nokta seçilir. `dolu(azimut, mesafe)` o noktada figür var mı der. Hepsi doluysa en yakın nokta
 * yana 2,5 m kaydırılarak kullanılır (hat oluşur). Hiç nokta yoksa serbest yön + varsayılan mesafe.
 */
export function birlikNoktasiSec(
  plan: YerlesimPlani | undefined,
  azimutIstenen: number,
  turler: YerlesimTuru[],
  varsayilanMesafe: number,
  dolu: (azimut: number, mesafe: number) => boolean,
): YerlesimSecimi {
  const istenen = aciNormalize(azimutIstenen);
  for (const tur of turler) {
    const adaylar = (plan?.noktalar ?? []).filter((n) => n.tur?.includes(tur)).sort((a, b) => Math.abs(aciNormalize(a.azimut - istenen)) - Math.abs(aciNormalize(b.azimut - istenen)));
    if (adaylar.length === 0) continue;
    const bos = adaylar.find((n) => !dolu(n.azimut, n.mesafe));
    if (bos) return { azimut: bos.azimut, mesafe: bos.mesafe, nokta: bos, degisti: true };
    // Hepsi dolu: en yakın noktanın yanına (2,5 m sağ/sol; o da doluysa 5 m)
    const n = adaylar[0];
    for (const kaydirma of [2.5, -2.5, 5, -5, 7.5, -7.5]) {
      const yanAci = (Math.atan2(kaydirma, n.mesafe) * 180) / Math.PI;
      const az = aciNormalize(n.azimut + yanAci);
      const mesafe = Math.hypot(n.mesafe, kaydirma);
      if (!dolu(az, mesafe)) return { azimut: az, mesafe, nokta: n, degisti: true };
    }
    return { azimut: n.azimut, mesafe: n.mesafe, nokta: n, degisti: true };
  }
  const serbest = yasaktanKacin(istenen, plan?.yasak);
  return { azimut: serbest, mesafe: varsayilanMesafe, degisti: Math.abs(aciNormalize(serbest - istenen)) > 0.5 };
}

/**
 * İstenen yön için yerleşim seçer. Uygun türde nokta varsa ve `tolerans` derece içindeyse ona
 * yapışır; yoksa yönü yasak aralıklardan kaçırır ve varsayılan mesafeyi kullanır.
 */
export function noktaSec(plan: YerlesimPlani | undefined, azimutIstenen: number, tur: YerlesimTuru, varsayilanMesafe: number, tolerans = 55): YerlesimSecimi {
  const istenen = aciNormalize(azimutIstenen);
  const adaylar = (plan?.noktalar ?? []).filter((n) => !n.tur || n.tur.includes(tur));
  let enIyi: YerlesimNoktasi | undefined;
  let enKucuk = Infinity;
  for (const n of adaylar) {
    const fark = Math.abs(aciNormalize(n.azimut - istenen));
    if (fark < enKucuk) {
      enKucuk = fark;
      enIyi = n;
    }
  }
  if (enIyi && enKucuk <= tolerans) {
    return { azimut: enIyi.azimut, mesafe: enIyi.mesafe, nokta: enIyi, degisti: Math.abs(aciNormalize(enIyi.azimut - istenen)) > 0.5 };
  }
  const serbest = yasaktanKacin(istenen, plan?.yasak);
  return { azimut: serbest, mesafe: varsayilanMesafe, degisti: Math.abs(aciNormalize(serbest - istenen)) > 0.5 };
}
