/**
 * Simülasyon durum modeli – kontrol paneli ve köprü sunucusu bu tipleri paylaşır.
 * (apps/kontrol-paneli/src/tipler.ts dosyası bunun birebir kopyasıdır.)
 */

export type Oda = "oda1" | "oda2";

/** Şartname §2: en az 5 bölge (Meskûn Mahal, Ormanlık, Dağlık, Üs Bölgesi + 1). */
export type Bolge = "meskun_mahal" | "ormanlik" | "daglik" | "us_bolgesi" | "kirsal_acik_arazi";

export type Mevsim = "ilkbahar" | "yaz" | "sonbahar" | "kis";

export type Yagis = "yok" | "hafif_yagmur" | "siddetli_yagmur" | "kar";

/** Şartname §7: Oda 2 güvenli alan görüntüleri. */
export type GuvenliAlanTipi = "kaya_sutre_arkasi" | "cukur" | "meskun_mahal_ici";

export type HelikopterDurumu = "yok" | "yaklasiyor" | "iniyor" | "yerde" | "kalkiyor";

/** Şartname §3: her bölgede yaz/kış, gece/gündüz ve hava durumu değiştirilebilir. */
export interface OrtamAyarlari {
  mevsim: Mevsim;
  /** 0–24 saat (ondalıklı, ör. 18.5 = 18:30). */
  saat: number;
  /** 0–1 bulut örtüsü. */
  bulut: number;
  /** 0–1 sis yoğunluğu. */
  sis: number;
  yagis: Yagis;
  /** 0–1 rüzgâr şiddeti. */
  ruzgarSiddeti: number;
  /** 0–360 derece rüzgâr yönü. */
  ruzgarYonu: number;
}

/** Şartname §6: ortam ışığı DMX512/Art-Net üzerinden. */
export interface OrtamIsigi {
  /** 0–1 parlaklık. */
  parlaklik: number;
  /** 0–255 RGB. */
  r: number;
  g: number;
  b: number;
  /** Senaryoya göre otomatik güncellensin mi (gün ışığı/patlama ile). */
  senaryoyaBagli: boolean;
}

/** Şartname §5: izli mermi çıkış noktası, yönü ve sıklığı. */
export interface IzliMermiAyarlari {
  aktif: boolean;
  /** Hangi duvar/çıkış noktası (0: sol duvar, 1: orta duvar, 2: sağ duvar). */
  cikisNoktasi: 0 | 1 | 2;
  /** Yatay açı, -90..90 derece. */
  yon: number;
  /** Saniyede mermi sayısı. */
  siklik: number;
}

export interface Oda2Ayarlari {
  guvenliAlan: GuvenliAlanTipi;
  helikopter: HelikopterDurumu;
  /** Uzaktan gelen seslerin mesafesi (metre). Ses bu mesafeye göre zayıflatılır. */
  uzakSesMesafesi: number;
  /** Uzaktan gelen seslerin yönü, 0–360 derece. */
  uzakSesYonu: number;
}

export type EfektTuru =
  | "patlama"
  | "gurultu"
  | "bagirma"
  | "cagirma"
  | "toz_duman"
  | "uzak_patlama"
  | "uzak_mermi_sesi";

export interface EfektIstegi {
  tur: EfektTuru;
  /** 0–1 şiddet. */
  siddet?: number;
  /** 0–360 derece yön (konumsal ses için). */
  yon?: number;
  /** metre (uzak sesler için zayıflatma). */
  mesafe?: number;
}

export interface SimulasyonDurumu {
  oda: Oda;
  bolge: Bolge;
  ortam: OrtamAyarlari;
  isik: OrtamIsigi;
  izliMermi: IzliMermiAyarlari;
  oda2: Oda2Ayarlari;
  /** Son tetiklenen efektler (panelde günlük için). */
  sonEfektler: Array<EfektIstegi & { zaman: number }>;
}

/** Senaryo zaman çizelgesi adımı. */
export interface SenaryoAdimi {
  id: string;
  /** Senaryo başlangıcından itibaren milisaniye. */
  gecikmeMs: number;
  aciklama: string;
  islem:
    | { tip: "efekt"; efekt: EfektIstegi }
    | { tip: "ortam"; ortam: Partial<OrtamAyarlari> }
    | { tip: "bolge"; bolge: Bolge }
    | { tip: "izli_mermi"; izliMermi: Partial<IzliMermiAyarlari> }
    | { tip: "isik"; isik: Partial<OrtamIsigi> }
    | { tip: "oda2"; oda2: Partial<Oda2Ayarlari> };
}

export interface Senaryo {
  id: string;
  ad: string;
  aciklama?: string;
  oda: Oda;
  adimlar: SenaryoAdimi[];
}

export type SenaryoOynatmaDurumu = "duruyor" | "oynuyor" | "duraklatildi";

export interface SenaryoDurumu {
  senaryoId: string | null;
  durum: SenaryoOynatmaDurumu;
  /** Senaryo içindeki konum (ms). */
  konumMs: number;
  toplamMs: number;
  /** Tamamlanan adım id'leri. */
  tamamlanan: string[];
}

export interface OnAyar {
  id: string;
  ad: string;
  olusturma: string;
  durum: Omit<SimulasyonDurumu, "sonEfektler">;
}

export interface BaglantiDurumu {
  unreal: { mod: "gercek" | "simulasyon"; bagli: boolean; adres: string; sonHata?: string };
  artnet: { aktif: boolean; hedef: string; evren: number; sonGonderim?: number };
}

/** Sunucu → istemci WebSocket mesajları. */
export type SunucuMesaji =
  | { tip: "durum"; durum: SimulasyonDurumu }
  | { tip: "senaryo"; senaryo: SenaryoDurumu }
  | { tip: "baglanti"; baglanti: BaglantiDurumu }
  | { tip: "gunluk"; seviye: "bilgi" | "uyari" | "hata"; mesaj: string; zaman: number };

export const BOLGE_ETIKETLERI: Record<Bolge, string> = {
  meskun_mahal: "Meskûn Mahal",
  ormanlik: "Ormanlık",
  daglik: "Dağlık",
  us_bolgesi: "Üs Bölgesi",
  kirsal_acik_arazi: "Kırsal Açık Arazi",
};

export const MEVSIM_ETIKETLERI: Record<Mevsim, string> = {
  ilkbahar: "İlkbahar",
  yaz: "Yaz",
  sonbahar: "Sonbahar",
  kis: "Kış",
};

export const YAGIS_ETIKETLERI: Record<Yagis, string> = {
  yok: "Yok",
  hafif_yagmur: "Hafif yağmur",
  siddetli_yagmur: "Şiddetli yağmur",
  kar: "Kar",
};

export const GUVENLI_ALAN_ETIKETLERI: Record<GuvenliAlanTipi, string> = {
  kaya_sutre_arkasi: "Kaya / sütre arkası",
  cukur: "Çukur",
  meskun_mahal_ici: "Meskûn mahal içi",
};

export const HELIKOPTER_ETIKETLERI: Record<HelikopterDurumu, string> = {
  yok: "Yok",
  yaklasiyor: "Yaklaşıyor",
  iniyor: "İniyor",
  yerde: "Yerde",
  kalkiyor: "Kalkıyor",
};

export const EFEKT_ETIKETLERI: Record<EfektTuru, string> = {
  patlama: "Patlama",
  gurultu: "Gürültü",
  bagirma: "Bağırma",
  cagirma: "Çağırma",
  toz_duman: "Toz / duman",
  uzak_patlama: "Uzaktan patlama",
  uzak_mermi_sesi: "Uzaktan mermi sesi",
};

export function varsayilanDurum(): SimulasyonDurumu {
  return {
    oda: "oda1",
    bolge: "daglik",
    ortam: {
      mevsim: "yaz",
      saat: 12,
      bulut: 0.2,
      sis: 0,
      yagis: "yok",
      ruzgarSiddeti: 0.1,
      ruzgarYonu: 90,
    },
    isik: { parlaklik: 0.8, r: 255, g: 244, b: 224, senaryoyaBagli: true },
    izliMermi: { aktif: false, cikisNoktasi: 1, yon: 0, siklik: 3 },
    oda2: { guvenliAlan: "kaya_sutre_arkasi", helikopter: "yok", uzakSesMesafesi: 800, uzakSesYonu: 45 },
    sonEfektler: [],
  };
}
