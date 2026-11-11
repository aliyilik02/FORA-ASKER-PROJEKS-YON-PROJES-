/** Figür listesi üzerinde paylaşılan seçimler (canlı sahne kartı, figür paneli, klavye kısayolu). */
import type { FigurKomutu, KlipOzeti } from "./tipler";

type Aktif = FigurKomutu & { id: string };

/** Hareket hâlindeki klipler vurulmaz (panel bu düğmeleri koşanlarda gizler; oynatıcıda kayma sürerdi). */
const HAREKETLI = /_(kosan|yuruyen|surunen|comelerek)$/;
/** Eski Quaternius/SWAT adları (kayıtlı senaryolar, geri yüklenen durum). */
const ESKI_ASKER = /^asker_(bekleyen|taktik|diz_cokmus|kamuflaj)/;
/** Yeni Meshy adları (`komando_*`, `komando_bere_*`, `komando_kis_*`, `komando_agir_*`, `telsizci_*`): manifest listesi yokken. */
const YENI_ASKER = /^(komando|telsizci)(_[a-z]+)*_(bekleyen|nisan|diz_cokmus|yatan|etrafa_bakan|telsiz|bomba|el_sallayan)$/;

/**
 * Vurulabilecek askerler: manifest grubu "asker" olan (ya da liste yoksa ada göre asker sayılan), hareket etmeyen, henüz
 * yaralı olmayan figürler. Sıhhiyeci ve yaralılar hariç. 8 Kasım: eski sürüm yalnız `asker_*` adlarını tanıyordu, Meshy
 * `komando_*` adlarıyla "Asker vuruldu!" düğmesi, canlı sahne düğmesi ve 6 tuşu çalışmıyordu.
 */
export function vurulabilirAskerler(figurler: Aktif[], klipler?: KlipOzeti[]): Aktif[] {
  const gruplar = klipler ? new Map(klipler.map((k) => [k.ad, k.grup ?? (k.kategori === "figur" ? "nesne" : k.kategori)])) : null;
  return figurler.filter((f) => {
    if (f.poz === "yarali") return false;
    const ad = f.klip ?? "";
    if (HAREKETLI.test(ad)) return false;
    const grup = gruplar?.get(ad);
    if (grup !== undefined) return grup === "asker";
    return ESKI_ASKER.test(ad) || YENI_ASKER.test(ad);
  });
}

/** Panel yönüne (0–359, saat yönünde) en yakın figür. */
export function yoneEnYakin(figurler: Aktif[], yon: number): Aktif | undefined {
  const hedefAz = ((yon + 180) % 360) - 180;
  const fark = (a: number) => Math.abs((((a - hedefAz) % 360) + 540) % 360 - 180);
  return [...figurler].sort((a, b) => fark(a.azimut ?? 0) - fark(b.azimut ?? 0))[0];
}

/**
 * Sıhhiyecinin gideceği yaralı: başında en az sıhhiyeci olan; eşitlikte en son vurulan (listenin sonu). 10 Kasım: eski
 * seçim hep "son yaralı"ydı, 4–5 yaralı varken gönderilen bütün sıhhiyeciler tek askerin başına toplanıyordu.
 * `bekleyen`: az önce gönderilip henüz figür listesine düşmemiş görevlendirmelerin yaralı kimlikleri (hızlı art arda dokunuş).
 */
export function sihhiyeBekleyenYarali(figurler: Aktif[], bekleyen: string[] = []): Aktif | undefined {
  const yaralilar = figurler.filter((f) => f.poz === "yarali");
  const sayi = (id: string) => figurler.filter((f) => f.yaninda === id).length + bekleyen.filter((b) => b === id).length;
  let secilen: Aktif | undefined;
  let enAz = Infinity;
  for (const y of yaralilar) {
    const n = sayi(y.id);
    if (n <= enAz) {
      enAz = n;
      secilen = y;
    }
  }
  return secilen;
}
