/**
 * Simülasyon durum modeli – kontrol paneli ve köprü sunucusu bu tipleri paylaşır.
 * (apps/kontrol-paneli/src/tipler.ts dosyası bunun birebir kopyasıdır.)
 */

export type Oda = "oda1" | "oda2";

/** Şartname §2: en az 5 bölge (Meskûn Mahal, Ormanlık, Dağlık, Üs Bölgesi + 1). */
export type Bolge = "meskun_mahal" | "ormanlik" | "daglik" | "us_bolgesi" | "kirsal_acik_arazi";

export type Mevsim = "ilkbahar" | "yaz" | "sonbahar" | "kis";

export type Yagis = "yok" | "hafif_yagmur" | "siddetli_yagmur" | "kar";

/** Şartname §7 / idare metni 1.2: Oda 2 güvenli alan görüntüleri. */
export type GuvenliAlanTipi = "operasyonel_bolge" | "meskun_mahal_ici" | "kaya_sutre_arkasi" | "cukur";

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
  /** İniş yönü, 0–360 derece (0 = karşı); oynatıcı panoramanın en yakın iniş noktasına yapıştırır. */
  helikopterYonu: number;
  /** Uzaktan gelen seslerin mesafesi (metre). Ses bu mesafeye göre zayıflatılır. */
  uzakSesMesafesi: number;
  /** Uzaktan gelen seslerin yönü, 0–360 derece. */
  uzakSesYonu: number;
}

/**
 * Çatışma: sürekli düşman ateşi (uzaktan gelen izli mermiler, yere çarpma, sekme) ve dost
 * figürlerin karşılık vermesi (namlu alevi, atış sesi). Şiddet 0–1; yön düşman cephesi (0–360).
 */
export interface CatismaAyarlari {
  aktif: boolean;
  siddet: number;
  yon: number;
  /** Sahnedeki silahlı figürler ateşle karşılık versin mi. */
  dostAtes: boolean;
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
  catisma: CatismaAyarlari;
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
    | { tip: "oda2"; oda2: Partial<Oda2Ayarlari> }
    | { tip: "catisma"; catisma: Partial<CatismaAyarlari> }
    /** Figür komutu: asker/tank çağır, duruş değiştir (vuruldu), kaldır. */
    | { tip: "figur"; figur: FigurKomutu }
    /** Oda değiştir (Oda 1 ↔ Oda 2): gösterim senaryosu helikopter inişine geçebilsin. */
    | { tip: "oda"; oda: Oda };
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
  /** Bağlı Duvar Oynatıcı sayısı (hibrit yol: görüntüyü tarayıcı tabanlı oynatıcı üretir). */
  oynatici: { bagli: boolean; sayi: number };
}

/** İstemci → sunucu WebSocket mesajları. */
export type IstemciMesaji =
  | { tip: "merhaba"; rol: "panel" | "oynatici"; ad?: string }
  /** Oynatıcıdan küçük JPEG önizleme (data URL, ~2 sn'de bir); köprü yalnızca panellere iletir. */
  | { tip: "onizleme"; veri: string };

/** Köprünün Unreal Engine'e gönderdiği bir Remote Control çağrısının kaydı (panelde canlı izlenir). */
export interface UnrealIstekKaydi {
  fonksiyon: string;
  parametreler: Record<string, unknown>;
  zaman: number;
  mod: "gercek" | "simulasyon";
  basarili: boolean;
  hata?: string;
}

/** Panelden başlatılan örnek paketin (paketlenmiş UE oyunu) durumu. */
export interface OrnekDurumu {
  /** ORNEK_PAKET ayarı verilmiş ve UnrealGame.exe bulunmuş mu. */
  yapilandirildi: boolean;
  calisiyor: boolean;
  pid?: number;
  baslangic?: number;
  komut: string;
  sonCikis?: { kod: number | null; sinyal?: string; zaman: number; hata?: string };
}

/**
 * Figür / klip komutu: oynatıcıdaki alfa kanallı klip katmanına (asker, araç, efekt plakası)
 * bir klibi belirli bir azimuta yerleştirir veya kaldırır. Klip adları içerik manifestinden gelir.
 */
export type FigurPozu = "ayakta" | "comelmis" | "yatmis" | "yarali";
export const FIGUR_POZ_ETIKETLERI: Record<FigurPozu, string> = { ayakta: "Ayakta", comelmis: "Diz çökmüş", yatmis: "Yere yatmış", yarali: "Yaralı (yerde)" };

export interface FigurKomutu {
  /** `poz`: sahnedeki figürün duruşunu değiştirir (vurulma → yere düşme, diz çökme, ayağa kalkma). */
  islem: "oynat" | "durdur" | "temizle" | "poz";
  /** Örnek (instance) kimliği; verilmezse köprü üretir. */
  id?: string;
  /** Duruş; `oynat` ile başlangıç duruşu, `poz` ile değişiklik. Varsayılan ayakta. */
  poz?: FigurPozu;
  /** `oynat`: bu kimlikli figürün hemen yanına, ona dönük yerleşir (sıhhiyeci → yaralı); azimut/yükseklik yok sayılır. */
  yaninda?: string;
  /** Manifestteki klip adı (ör. asker_yarali_yerde). */
  klip?: string;
  /** -180..180; 0 = orta duvarın ortası. */
  azimut?: number;
  /** Ufka göre derece; negatif = ufkun altı (daha yakın zemin). */
  yukseklik?: number;
  /** Boyut çarpanı (1 = manifestteki genişlik). */
  olcek?: number;
  dongu?: boolean;
  /** Yatay ayna. */
  yansit?: boolean;
}

/** Panelde listelenen klip özeti (içerik manifestinden). */
export interface KlipOzeti {
  ad: string;
  baslik: string;
  kategori: string;
  dongu: boolean;
}

/** Sunucu → istemci WebSocket mesajları. */
export type SunucuMesaji =
  | { tip: "durum"; durum: SimulasyonDurumu }
  | { tip: "senaryo"; senaryo: SenaryoDurumu }
  | { tip: "baglanti"; baglanti: BaglantiDurumu }
  | { tip: "gunluk"; seviye: "bilgi" | "uyari" | "hata"; mesaj: string; zaman: number }
  | { tip: "unreal"; istek: UnrealIstekKaydi }
  | { tip: "ornek"; ornek: OrnekDurumu }
  /** Tetiklenen efekt olayı (oynatıcı ve paneller için). */
  | { tip: "efekt"; efekt: EfektIstegi & { zaman: number } }
  /** Figür / klip komutu (oynatıcı uygular, paneller aktif listeyi günceller). */
  | { tip: "figur"; komut: FigurKomutu & { id: string }; aktifler: Array<FigurKomutu & { id: string }> }
  /** Duvar görüntüsünün küçük önizlemesi (panelin canlı sahne kartı). */
  | { tip: "onizleme"; veri: string; zaman: number }
  /** Sahne sıfırlama: oynatıcı kraterleri, dumanı, 2B klipleri temizler (yeni eğitim grubu). */
  | { tip: "sahne"; islem: "sifirla" };

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
  operasyonel_bolge: "Operasyonel bölge",
  meskun_mahal_ici: "Meskûn mahal içi",
  kaya_sutre_arkasi: "Kaya / sütre arkası",
  cukur: "Çukur",
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
    oda2: { guvenliAlan: "kaya_sutre_arkasi", helikopter: "yok", helikopterYonu: 12, uzakSesMesafesi: 800, uzakSesYonu: 45 },
    catisma: { aktif: false, siddet: 0.5, yon: 0, dostAtes: true },
    sonEfektler: [],
  };
}

/** Eski kayıtlarda (ön ayar, disk) eksik alanları varsayılanla tamamlar. */
export function durumuTamamla(d: Partial<SimulasyonDurumu>): SimulasyonDurumu {
  const v = varsayilanDurum();
  return {
    ...v,
    ...d,
    ortam: { ...v.ortam, ...d.ortam },
    isik: { ...v.isik, ...d.isik },
    izliMermi: { ...v.izliMermi, ...d.izliMermi },
    oda2: { ...v.oda2, ...d.oda2 },
    catisma: { ...v.catisma, ...d.catisma },
    sonEfektler: d.sonEfektler ?? [],
  };
}
