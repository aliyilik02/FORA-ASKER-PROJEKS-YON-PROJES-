/**
 * API gövdesi doğrulama (8 Kasım değerlendirmesi §3-8): PATCH gövdeleri depoya yazılmadan önce alan alan denetlenir.
 * Önceden `sinirla(Number("abc"))` NaN üretiyor, NaN `son-durum.json`'a null olarak yazılıp açılışta geri geliyordu;
 * `isik.r` NaN olunca DMX 0'a düşüyor, oda kararıyordu; sıralı alanlar (mevsim, yağış, helikopter) serbest metin alıyordu.
 *
 * Kurallar: gövde nesne olmalı; tanınmayan alanlar sessizce atılır; tanınan alan yanlış tipteyse hata satırı; sayılar
 * sonlu olmalı (sayısal metin "12" kabul, panel formlarından gelebilir), bool için true/false ve "true"/"false".
 * Sınırlar depoda uygulanır (sinirla); burada yalnız tip ve seçenek denetimi.
 */
import type { CatismaAyarlari, EfektIstegi, GuvenliAlanTipi, HelikopterDurumu, IzliMermiAyarlari, Mevsim, Oda2Ayarlari, OrtamAyarlari, OrtamIsigi, Yagis } from "./tipler.js";

export type AlanSemasi = { tip: "sayi" } | { tip: "bool" } | { tip: "secenek"; secenekler: readonly (string | number)[] };

export interface DogrulamaSonucu<T> {
  deger: Partial<T>;
  hatalar: string[];
}

export const MEVSIMLER: readonly Mevsim[] = ["ilkbahar", "yaz", "sonbahar", "kis"];
export const YAGISLAR: readonly Yagis[] = ["yok", "hafif_yagmur", "siddetli_yagmur", "kar"];
export const GUVENLI_ALANLAR: readonly GuvenliAlanTipi[] = ["operasyonel_bolge", "meskun_mahal_ici", "kaya_sutre_arkasi", "cukur"];
export const HELIKOPTER_DURUMLARI: readonly HelikopterDurumu[] = ["yok", "yaklasiyor", "iniyor", "yerde", "kalkiyor"];
export const SAFHALAR = ["ates_altinda", "taktik_saha", "tahliye"] as const;
export const EFEKT_TURLERI = ["patlama", "gurultu", "bagirma", "cagirma", "toz_duman", "uzak_patlama", "uzak_mermi_sesi", "simsek", "yangin", "yangin_sondur", "havan", "fisek"] as const;

/** Sonlu sayı: number ya da sayısal metin; aksi hâlde undefined. */
export function sayiCoz(deger: unknown): number | undefined {
  if (typeof deger === "number") return Number.isFinite(deger) ? deger : undefined;
  if (typeof deger === "string" && deger.trim() !== "") {
    const n = Number(deger);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/** Bool: true/false ya da "true"/"false"; aksi hâlde undefined ("false" metni truthy sayılmasın). */
export function boolCoz(deger: unknown): boolean | undefined {
  if (typeof deger === "boolean") return deger;
  if (deger === "true") return true;
  if (deger === "false") return false;
  return undefined;
}

export function kismiDogrula<T extends object>(govde: unknown, sema: Record<string, AlanSemasi>): DogrulamaSonucu<T> {
  const hatalar: string[] = [];
  const deger: Record<string, unknown> = {};
  if (govde === undefined || govde === null) return { deger: {}, hatalar };
  if (typeof govde !== "object" || Array.isArray(govde)) return { deger: {}, hatalar: ["gövde bir nesne olmalı"] };
  for (const [alan, s] of Object.entries(sema)) {
    const ham = (govde as Record<string, unknown>)[alan];
    if (ham === undefined || ham === null) continue;
    if (s.tip === "sayi") {
      const n = sayiCoz(ham);
      if (n === undefined) hatalar.push(`${alan}: sayı olmalı`);
      else deger[alan] = n;
    } else if (s.tip === "bool") {
      const b = boolCoz(ham);
      if (b === undefined) hatalar.push(`${alan}: true/false olmalı`);
      else deger[alan] = b;
    } else {
      const aday = typeof ham === "string" && s.secenekler.every((x) => typeof x === "number") ? Number(ham) : ham;
      if (!s.secenekler.includes(aday as string | number)) hatalar.push(`${alan}: şunlardan biri olmalı: ${s.secenekler.join(", ")}`);
      else deger[alan] = aday;
    }
  }
  return { deger: deger as Partial<T>, hatalar };
}

export const ORTAM_SEMASI: Record<keyof OrtamAyarlari, AlanSemasi> = {
  mevsim: { tip: "secenek", secenekler: MEVSIMLER },
  saat: { tip: "sayi" },
  bulut: { tip: "sayi" },
  sis: { tip: "sayi" },
  yagis: { tip: "secenek", secenekler: YAGISLAR },
  ruzgarSiddeti: { tip: "sayi" },
  ruzgarYonu: { tip: "sayi" },
  simsek: { tip: "bool" },
};
export const ISIK_SEMASI: Record<keyof OrtamIsigi, AlanSemasi> = {
  parlaklik: { tip: "sayi" },
  r: { tip: "sayi" },
  g: { tip: "sayi" },
  b: { tip: "sayi" },
  senaryoyaBagli: { tip: "bool" },
};
export const IZLI_MERMI_SEMASI: Record<keyof IzliMermiAyarlari, AlanSemasi> = {
  aktif: { tip: "bool" },
  cikisNoktasi: { tip: "secenek", secenekler: [0, 1, 2] },
  yon: { tip: "sayi" },
  siklik: { tip: "sayi" },
};
export const ODA2_SEMASI: Record<keyof Oda2Ayarlari, AlanSemasi> = {
  guvenliAlan: { tip: "secenek", secenekler: GUVENLI_ALANLAR },
  helikopter: { tip: "secenek", secenekler: HELIKOPTER_DURUMLARI },
  helikopterYonu: { tip: "sayi" },
  uzakSesMesafesi: { tip: "sayi" },
  uzakSesYonu: { tip: "sayi" },
};
export const CATISMA_SEMASI: Record<keyof CatismaAyarlari, AlanSemasi> = {
  aktif: { tip: "bool" },
  siddet: { tip: "sayi" },
  yon: { tip: "sayi" },
  dostAtes: { tip: "bool" },
  siperAl: { tip: "bool" },
};
export const EFEKT_SEMASI: Record<keyof EfektIstegi, AlanSemasi> = {
  tur: { tip: "secenek", secenekler: EFEKT_TURLERI },
  siddet: { tip: "sayi" },
  yon: { tip: "sayi" },
  mesafe: { tip: "sayi" },
};

/** Depo içi yardımcılar: bozuk değer gelirse (senaryo adımı, eski kayıt) eski değer korunur. */
export const sayiYaDa = (yeni: unknown, eski: number): number => sayiCoz(yeni) ?? eski;
export const boolYaDa = (yeni: unknown, eski: boolean): boolean => boolCoz(yeni) ?? eski;
export const secenekYaDa = <T extends string | number>(yeni: unknown, liste: readonly T[], eski: T): T => (liste.includes(yeni as T) ? (yeni as T) : eski);

/**
 * Senaryo adımlarını kayıttan önce denetler (§3-16): her adım `islem` nesnesi ve `tip` taşımalı; adım kimlikleri
 * tekil olmalı (aynı kimlik iki kez geçerse ikincisi hiç çalışmaz ve senaryo bitmezdi) — yinelenenlere `_2`, `_3` eklenir.
 */
export function senaryoAdimlariniDogrula(adimlar: unknown): { adimlar: Array<Record<string, unknown>>; hatalar: string[] } {
  if (!Array.isArray(adimlar)) return { adimlar: [], hatalar: ["adimlar bir dizi olmalı"] };
  const hatalar: string[] = [];
  const gorulen = new Set<string>();
  const sonuc = adimlar.map((a, i) => {
    const adim = (a && typeof a === "object" ? { ...(a as Record<string, unknown>) } : {}) as Record<string, unknown>;
    const islem = adim.islem;
    if (!islem || typeof islem !== "object" || typeof (islem as { tip?: unknown }).tip !== "string") hatalar.push(`adım ${i + 1}: islem.tip eksik`);
    if (sayiCoz(adim.gecikmeMs) === undefined) hatalar.push(`adım ${i + 1}: gecikmeMs sayı olmalı`);
    else adim.gecikmeMs = sayiCoz(adim.gecikmeMs);
    let id = typeof adim.id === "string" && adim.id ? adim.id : `adim_${i + 1}`;
    if (gorulen.has(id)) {
      let n = 2;
      while (gorulen.has(`${id}_${n}`)) n++;
      id = `${id}_${n}`;
    }
    gorulen.add(id);
    adim.id = id;
    return adim;
  });
  return { adimlar: sonuc, hatalar };
}
