/**
 * Çok kanallı konumsal ses: hoparlör düzenleri ve kanal kazançları. Saf hesap (Web Audio'ya dokunmaz),
 * testleri `sesYerlesimi.test.ts`; `ses.ts` bu kazançları ChannelMerger girişlerine uygular.
 *
 * Hoparlör düzeni = kanal sayısı + her kanalın sahne azimutu (derece; 0 = orta duvar, sağa artı, ±180
 * eğitim alanının arkası) ya da LFE (bas) kanalı için null. Kanal sırası Windows/Chrome'un ayrık
 * ("discrete") cihaz sırasıdır: 4 kanal FL FR RL RR, 5.1 FL FR C LFE SL SR, 7.1 FL FR C LFE BL BR SL SR.
 * Sahadaki gerçek açılar `?hoparlor=` ile verilir (ör. U odada arka hoparlörler -120/120).
 */

export type SesDuzeni = "stereo" | "dortlu" | "5.1" | "7.1";
export const SES_DUZENLERI: readonly SesDuzeni[] = ["stereo", "dortlu", "5.1", "7.1"];

/** Düzen başına varsayılan kanal azimutları (cihaz kanal sırasıyla); null = LFE. */
export const VARSAYILAN_HOPARLORLER: Readonly<Record<SesDuzeni, ReadonlyArray<number | null>>> = {
  stereo: [-30, 30],
  dortlu: [-45, 45, -135, 135],
  "5.1": [-30, 30, 0, null, -110, 110],
  "7.1": [-30, 30, 0, null, -150, 150, -90, 90],
};

/** Hoparlör testinde ekranda görünen kanal adları (varsayılan yerleşim). */
const KANAL_ETIKETLERI: Readonly<Record<SesDuzeni, readonly string[]>> = {
  stereo: ["Sol", "Sağ"],
  dortlu: ["Ön sol", "Ön sağ", "Arka sol", "Arka sağ"],
  "5.1": ["Ön sol", "Ön sağ", "Orta", "Bas (LFE)", "Arka sol", "Arka sağ"],
  "7.1": ["Ön sol", "Ön sağ", "Orta", "Bas (LFE)", "Arka sol", "Arka sağ", "Yan sol", "Yan sağ"],
};

export interface HoparlorDuzeni {
  duzen: SesDuzeni;
  /** Kanal sırasıyla hoparlör azimutları (derece, -180..180); null = LFE (bas) kanalı. */
  azimutlar: ReadonlyArray<number | null>;
  /** true: azimutlar `?hoparlor=` ile verildi (varsayılan değil). */
  ozel: boolean;
}

/** [0, 360) aralığına indirger. */
function mod360(a: number): number {
  return ((a % 360) + 360) % 360;
}
/** -180..180 aralığına indirger (180 → -180). */
function normalize(a: number): number {
  return mod360(a + 180) - 180;
}

export function kanalSayisi(duzen: SesDuzeni): number {
  return VARSAYILAN_HOPARLORLER[duzen].length;
}

/** Kanal sayısına karşılık gelen düzen (2, 4, 6, 8); yoksa null. */
export function kanaldanDuzen(n: number): SesDuzeni | null {
  return SES_DUZENLERI.find((d) => kanalSayisi(d) === n) ?? null;
}

/** Azimut → stereo pan (-1 sol, +1 sağ); arkadaki sesler yanlara düşer (eski stereo yolun yasası). */
export function stereoPan(azimut: number): number {
  return Math.max(-1, Math.min(1, Math.sin((azimut * Math.PI) / 180)));
}

/** `?ses=` değeri → düzen. Kısaltmalar: 2, 4 / quad, 51, 71. Tanınmazsa (ve "otomatik") null. */
export function sesDuzeniAyristir(metin: string | null | undefined): SesDuzeni | null {
  const m = (metin ?? "").trim().toLowerCase();
  if (m === "stereo" || m === "2") return "stereo";
  if (m === "dortlu" || m === "dörtlü" || m === "4" || m === "quad") return "dortlu";
  if (m === "5.1" || m === "51") return "5.1";
  if (m === "7.1" || m === "71") return "7.1";
  return null;
}

/**
 * `?hoparlor=` değeri: kanal sırasıyla virgülle ayrılmış azimutlar, LFE kanalı için "lfe"
 * (ör. "-45,45,-135,135" ya da "-30,30,0,lfe,-110,110"). 2–8 kanal, en çok bir LFE, LFE dışında en az
 * iki hoparlör, aynı yöne iki hoparlör yok. Geçersizse null (çağıran varsayılana döner).
 */
export function hoparlorAyristir(metin: string | null | undefined): Array<number | null> | null {
  if (!metin) return null;
  const parcalar = metin.split(/[,;]/).map((p) => p.trim().toLowerCase());
  if (parcalar.length < 2 || parcalar.length > 8) return null;
  const sonuc: Array<number | null> = [];
  for (const p of parcalar) {
    if (p === "lfe") {
      sonuc.push(null);
      continue;
    }
    if (!/^[+-]?\d+(\.\d+)?$/.test(p)) return null;
    const a = Number(p);
    if (!Number.isFinite(a) || Math.abs(a) > 360) return null;
    sonuc.push(normalize(a));
  }
  if (sonuc.filter((a) => a === null).length > 1) return null;
  const tam = sonuc.filter((a): a is number => a !== null);
  if (tam.length < 2) return null;
  for (let i = 0; i < tam.length; i++) {
    for (let j = i + 1; j < tam.length; j++) if (Math.abs(normalize(tam[i] - tam[j])) < 1) return null;
  }
  return sonuc;
}

/** Ayrıştırılmış azimutların kayıt biçimi ("-45,45,lfe,..."). */
export function hoparlorMetni(azimutlar: ReadonlyArray<number | null>): string {
  return azimutlar.map((a) => (a === null ? "lfe" : String(a))).join(",");
}

/** Düzen + isteğe bağlı özel azimutlar. Özel liste yalnızca çok kanallı düzende ve kanal sayısı tutarsa kullanılır. */
export function hoparlorDuzeni(duzen: SesDuzeni, ozel?: ReadonlyArray<number | null> | null): HoparlorDuzeni {
  const varsayilan = VARSAYILAN_HOPARLORLER[duzen];
  if (duzen !== "stereo" && ozel && ozel.length === varsayilan.length) return { duzen, azimutlar: [...ozel], ozel: true };
  return { duzen, azimutlar: varsayilan, ozel: false };
}

/** Özel yerleşimde kanal adı azimuttan: ±60° ön, ±120°'ye kadar yan, ötesi arka. */
function yonEtiketi(a: number): string {
  const m = Math.abs(a);
  const derece = `${Math.round(a)}°`;
  if (m < 10) return `Orta (${derece})`;
  if (m > 170) return `Arka orta (${derece})`;
  const bolge = m <= 60 ? "Ön" : m < 120 ? "Yan" : "Arka";
  return `${bolge} ${a < 0 ? "sol" : "sağ"} (${derece})`;
}

/** Kanal sırasıyla Türkçe hoparlör adları (hoparlör testi ekranı). */
export function kanalEtiketleri(d: HoparlorDuzeni): string[] {
  if (!d.ozel) return [...KANAL_ETIKETLERI[d.duzen]];
  return d.azimutlar.map((a) => (a === null ? "Bas (LFE)" : yonEtiketi(a)));
}

/**
 * Düzen seçimi: istenen düzen cihazın kanal sayısına sığıyorsa o; değilse otomatik
 * (≥8 → 7.1, ≥6 → 5.1, ≥4 → 4 kanal, değilse stereo). `maxKanal`: AudioDestinationNode.maxChannelCount.
 */
export function duzenSec(maxKanal: number, istenen?: SesDuzeni | null): SesDuzeni {
  const max = Number.isFinite(maxKanal) ? maxKanal : 2;
  if (istenen && kanalSayisi(istenen) <= max) return istenen;
  if (max >= 8) return "7.1";
  if (max >= 6) return "5.1";
  if (max >= 4) return "dortlu";
  return "stereo";
}

/**
 * Kaynağın (sahne azimutu, derece) kanal kazançları. LFE dışındaki hoparlörlerden kaynağı açısal olarak
 * çevreleyen iki komşu arasında sabit güçlü kaydırma (cos/sin; ±180 üzerinden sarma dâhil). `yayilim` 0..1
 * sesi tüm hoparlörlere eşit güçle dağıtır (uzak ses, dağınık kaynak; 1'de hepsi eşit). Kareler toplamı 1,
 * LFE girdisi 0. `hedef` verilirse sonuç oraya yazılır (her karede çağrılan helikopter için ayırmasız).
 */
export function kanalKazanclari(d: HoparlorDuzeni, azimut: number, yayilim = 0, hedef?: number[]): number[] {
  const az = d.azimutlar;
  const n = az.length;
  const g = hedef ?? new Array<number>(n);
  g.length = n;
  // Kaynağın solundaki (veya üstündeki) ve sağındaki en yakın hoparlör: sıralama/ayırma gerekmez
  let onceki = -1;
  let oncekiFark = Infinity;
  let sonraki = -1;
  let sonrakiFark = Infinity;
  let m = 0;
  for (let i = 0; i < n; i++) {
    g[i] = 0;
    const s = az[i];
    if (s === null) continue;
    m++;
    const geri = mod360(azimut - s);
    if (geri < oncekiFark) {
      oncekiFark = geri;
      onceki = i;
    }
    const ileri = mod360(s - azimut);
    if (ileri > 0 && ileri < sonrakiFark) {
      sonrakiFark = ileri;
      sonraki = i;
    }
  }
  if (m === 0) return g;
  if (oncekiFark === 0 || sonraki < 0 || sonraki === onceki) g[onceki] = 1;
  else {
    const t = oncekiFark / (oncekiFark + sonrakiFark);
    g[onceki] = Math.cos((t * Math.PI) / 2);
    g[sonraki] = Math.sin((t * Math.PI) / 2);
  }
  const y = Math.max(0, Math.min(1, yayilim));
  let toplam = 0;
  for (let i = 0; i < n; i++) {
    if (az[i] === null) continue;
    // Güç (kare) uzayında karışım: çift kaydırma ile eşit dağılımın toplam gücü ayrı ayrı 1
    if (y > 0) g[i] = Math.sqrt((1 - y) * g[i] * g[i] + y / m);
    toplam += g[i] * g[i];
  }
  const k = toplam > 0 ? 1 / Math.sqrt(toplam) : 0;
  for (let i = 0; i < n; i++) g[i] *= k;
  return g;
}

/**
 * Dağınık ortam sesi (stereo döngü, rüzgâr) için kanal başına [sol giriş, sağ giriş] kazançları: soldaki
 * hoparlörler sol kanalı, sağdakiler sağ kanalı alır; ön/arka ortadaki hoparlör ikisini yarım kazançla.
 * Her giriş kanalının gücü korunur (kareler toplamı 1; tek kanallı kaynakta her hoparlöre eşit güç). LFE 0.
 */
export function ortamKazanclari(d: HoparlorDuzeni): Array<[number, number]> {
  const agirlik = (a: number | null, taraf: -1 | 1): number => {
    if (a === null) return 0;
    const s = Math.sin((a * Math.PI) / 180);
    if (Math.abs(s) < 0.05) return 0.5; // orta (0° veya 180°)
    return Math.sign(s) === taraf ? 1 : 0;
  };
  const kanal = (taraf: -1 | 1) => {
    let w = d.azimutlar.map((a) => agirlik(a, taraf));
    // O tarafta hiç hoparlör yoksa (tek taraflı özel yerleşim) giriş tüm hoparlörlere dağılır
    if (w.every((x) => x === 0)) w = d.azimutlar.map((a) => (a === null ? 0 : 1));
    const toplam = Math.sqrt(w.reduce((s, x) => s + x * x, 0));
    return w.map((x) => (toplam > 0 ? x / toplam : 0));
  };
  const sol = kanal(-1);
  const sag = kanal(1);
  return d.azimutlar.map((_, i) => [sol[i], sag[i]]);
}

/** Yerel kayıt (localStorage) arayüzü; testte sahte depo verilir. */
export interface AnahtarDeposu {
  getItem(anahtar: string): string | null;
  setItem(anahtar: string, deger: string): void;
  removeItem(anahtar: string): void;
}

export interface SesAyari {
  /** İstenen düzen; null = otomatik (cihazın kanal sayısına göre). */
  duzen: SesDuzeni | null;
  /** `?hoparlor=` ile verilen kanal azimutları; null = düzenin varsayılanı. */
  hoparlor: Array<number | null> | null;
  /** Tanınmayan adres değerleri (oynatıcı köprü günlüğüne yazar). */
  uyarilar: string[];
}

const OTOMATIK = /^(otomatik|auto|varsayilan)$/i;

/**
 * `?ses=` ve `?hoparlor=` çözümü, `?kalite=` ile aynı kalıp: adres çubuğu > yerel kayıt > otomatik.
 * Adresteki geçerli değer kayda yazılır (kiosk sonraki açılışta da kullanır), "otomatik" kaydı siler;
 * tanınmayan değer uyarı verir ve kayıtlı değer geçerli kalır.
 */
export function sesAyariniCoz(adres: { ses: string | null; hoparlor: string | null }, depo: AnahtarDeposu | null): SesAyari {
  const uyarilar: string[] = [];
  const oku = (anahtar: string): string | null => {
    try {
      return depo?.getItem(anahtar) ?? null;
    } catch {
      return null;
    }
  };
  const yaz = (anahtar: string, deger: string | null) => {
    try {
      if (deger === null) depo?.removeItem(anahtar);
      else depo?.setItem(anahtar, deger);
    } catch {
      /* özel pencere / kapalı kayıt */
    }
  };

  let duzen: SesDuzeni | null;
  const sesMetni = adres.ses?.trim() ?? "";
  if (OTOMATIK.test(sesMetni)) {
    yaz("ses", null);
    duzen = null;
  } else if (sesMetni) {
    duzen = sesDuzeniAyristir(sesMetni);
    if (duzen) yaz("ses", duzen);
    else {
      uyarilar.push(`?ses=${sesMetni} tanınmadı (stereo | dortlu | 5.1 | 7.1 | otomatik)`);
      duzen = sesDuzeniAyristir(oku("ses"));
    }
  } else duzen = sesDuzeniAyristir(oku("ses"));

  let hoparlor: Array<number | null> | null;
  const hoparlorMetin = adres.hoparlor?.trim() ?? "";
  if (OTOMATIK.test(hoparlorMetin)) {
    yaz("hoparlor", null);
    hoparlor = null;
  } else if (hoparlorMetin) {
    hoparlor = hoparlorAyristir(hoparlorMetin);
    if (hoparlor) yaz("hoparlor", hoparlorMetni(hoparlor));
    else {
      uyarilar.push(`?hoparlor=${hoparlorMetin} geçersiz (kanal sırasıyla azimutlar, LFE için "lfe"; ör. -45,45,-135,135)`);
      hoparlor = hoparlorAyristir(oku("hoparlor"));
    }
  } else hoparlor = hoparlorAyristir(oku("hoparlor"));

  return { duzen, hoparlor, uyarilar };
}
