/**
 * Figür durum makinesi (12 Kasım 2026). Figürün ne yaptığı önceden bir düzine bayrağın birleşiminden her yerde yeniden
 * çıkarılıyordu (`poz`, `asama`, `gecis`, `yuruyus`, `sicrama.kosuyor`, `siper.mod`, `mudahale`, `hiz`…): yeni bir davranış
 * eklerken (şarjör değiştirme, yaralı sürükleme) "şu an başlayabilir mi, ateş edebilir mi, başka davranış karışır mı"
 * soruları her işlevde ayrı ayrı ve tutarsız cevaplanıyordu. Burada tek yerde:
 *
 *  - `durumCoz`: bayraklardan tek bir durum (öncelik sırasıyla; bir figür her an tam bir durumdadır),
 *  - `baslayabilir`: kendiliğinden başlayan etkinlikler (mevzi değiştirme, şarjör, jest, sürükleme, siper kararı) hangi
 *    durumdan başlayabilir,
 *  - `atesEdebilir` / `hedefAlinabilir`: çatışma katmanının sorduğu sorular.
 *
 * Saf hesap (three yok). Duruş kliplerinin iç işleyişi (çapraz geçişler, prosedürel ofsetler) figurler3b.ts'te kalır;
 * durum onların ÜSTÜNDEKİ görev katmanıdır.
 */

export type FigurDurumu =
  | "bekliyor" // tehdit yok: ayakta / diz çökmüş / yatmış bekliyor
  | "nisanda" // çatışmada, düşmana dönük, ateş edebilir
  | "siperde" // sütre arkasında çökmüş, başını eğmiş (ateş etmiyor)
  | "gecis" // duruş değiştiriyor (çöküyor, kalkıyor, yatıyor)
  | "kosuyor" // mevzi değiştiriyor (koşu)
  | "yuruyor" // bir hedefe yürüyor (sıhhiyeci yaralıya, kenara çekilen asker)
  | "devriye" // yana yürüyen / koşan figür (ekrandan geçer)
  | "sarjor" // şarjör değiştiriyor
  | "jest" // hedef gösterme, el işareti
  | "surukluyor" // yaralıya gidiyor / yaralıyı sipere çekiyor
  | "suruklenen" // sürüklenen yaralı
  | "mudahale" // sıhhiyeci yaralının başında
  | "vuruluyor" // vurulma + düşme klipleri oynuyor
  | "yarali" // yerde
  | "arac"; // tank / ağır silah (duruş sistemi yok)

/** Kendiliğinden başlayan etkinlikler. */
export type Etkinlik = "mevziDegistir" | "sarjor" | "jest" | "suruklemeyeGit" | "siperKarari";

export interface DurumGirdisi {
  poz: "ayakta" | "comelmis" | "yatmis" | "yarali";
  /** Duruş aşaması: vurulma/düşme klipleri sürerken "normal" değildir. */
  asama: "normal" | "vuruluyor" | "dusuyor" | "yerde";
  /** Duruş geçiş klibi oynuyor. */
  gecis: boolean;
  /** Hedefe yürüyüş / koşu sürüyor. */
  yuruyus: boolean;
  /** Bu yürüyüş mevzi değiştirme koşusu. */
  kosu: boolean;
  /** Yana hareket hızı (m/sn; 0 = yerinde). */
  hiz: number;
  /** Silahlı ve çatışma var (düşman yönü belli). */
  tehdit: boolean;
  /** Sütre arkasında "in–kalk" kipinde ve şu an çökmüş. */
  siperdeCokmus: boolean;
  /** Süren tek seferlik etkinlik. */
  eylem: "yok" | "sarjor" | "jest";
  surukleme: "yok" | "ceken" | "cekilen";
  /** Sıhhiyeci müdahale döngüsünde. */
  mudahale: boolean;
  agirSilah: boolean;
}

/** Bayraklardan durum (öncelik sırası: yukarıdaki koşul alttakini ezer). */
export function durumCoz(g: DurumGirdisi): FigurDurumu {
  if (g.agirSilah) return "arac";
  if (g.surukleme === "cekilen") return "suruklenen";
  if (g.asama === "vuruluyor" || g.asama === "dusuyor") return "vuruluyor";
  if (g.poz === "yarali") return "yarali";
  if (g.surukleme === "ceken") return "surukluyor";
  if (g.hiz > 0) return "devriye";
  if (g.yuruyus) return g.kosu ? "kosuyor" : "yuruyor";
  if (g.gecis) return "gecis";
  if (g.eylem === "sarjor") return "sarjor";
  if (g.eylem === "jest") return "jest";
  if (g.mudahale) return "mudahale";
  if (g.tehdit) return g.siperdeCokmus ? "siperde" : "nisanda";
  return "bekliyor";
}

const BASLANGIC: Record<Etkinlik, readonly FigurDurumu[]> = {
  // Koşu yalnız sakin bir andan başlar: geçiş, şarjör ya da jest ortasında değil
  mevziDegistir: ["nisanda", "siperde"],
  // Şarjör: nişandayken (ayakta / diz / yatarak) ya da siperde çökmüşken
  sarjor: ["nisanda", "siperde"],
  jest: ["nisanda", "siperde"],
  // Yaralıyı çekmeye giden asker: çatışmada ya da beklerken, ama başka işin ortasında değil
  suruklemeyeGit: ["nisanda", "siperde", "bekliyor"],
  siperKarari: ["nisanda", "siperde", "bekliyor"],
};

export function baslayabilir(etkinlik: Etkinlik, durum: FigurDurumu): boolean {
  return BASLANGIC[etkinlik].includes(durum);
}

/** Bu durumdaki figür ateş edebilir mi (çatışma katmanı namlu noktası ister). */
export function atesEdebilir(durum: FigurDurumu): boolean {
  return durum === "nisanda";
}

/** Siper / mevzi davranışı bu figüre karışabilir mi (meşgul değil). */
export function mesgul(durum: FigurDurumu): boolean {
  return durum !== "nisanda" && durum !== "siperde" && durum !== "bekliyor";
}

/** Panel ve tanı için okunur ad. */
export const DURUM_ADI: Record<FigurDurumu, string> = {
  bekliyor: "bekliyor",
  nisanda: "nişanda",
  siperde: "siperde",
  gecis: "duruş değiştiriyor",
  kosuyor: "mevzi değiştiriyor",
  yuruyor: "yürüyor",
  devriye: "geçiyor",
  sarjor: "şarjör değiştiriyor",
  jest: "işaret veriyor",
  surukluyor: "yaralıyı çekiyor",
  suruklenen: "sipere çekiliyor",
  mudahale: "müdahale ediyor",
  vuruluyor: "vuruldu",
  yarali: "yaralı",
  arac: "araç",
};
