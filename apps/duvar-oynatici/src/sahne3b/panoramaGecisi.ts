/**
 * Panorama geçişinin saf parçaları (THREE'siz, birim testli): istek/iptal/takas durum makinesi, küp boyu seçimi, şerit
 * planı, solma ve yer tutucu kararları.
 *
 * İlke: ekrandaki sahne (panorama + 3B arazi + figürler), yenisi tamamen hazır olana dek canlı kalır. Hazırlık (indirme,
 * işçide çözme, GPU'ya şeritler hâlinde yükleme, küp, PMREM) ekrandakine dokunmadan yürür; takas tek karede yapılır, eski
 * kare 2B örtüye kopyalanıp solar (main.ts, gecis.ts). Ardışık isteklerde yenisi eskisini geçersiz kılar (nesil numarası):
 * eskinin sonucu atılır, GPU kaynakları bırakılır. Yer tutucu yalnız hiç panorama gösterilmemişken ve gösterilecek
 * panorama yokken çizilir.
 */
import type { Kalite } from "./sahne3b";

/** Arka plan küpünün yüz boyu (piksel): 1080p duvarda 90° ≈ 2048 px (yüksek 1:1); dizüstünde (640 px duvar) 1024 yeter. */
export const KUP_YUZU: Record<Kalite, number> = { dusuk: 1024, orta: 1536, yuksek: 2048 };

/**
 * Küp yüz boyu: kalite kademesinin değeri, ama kaynağın yüksekliğini aşmaz (2912×1440 AI panoramada 1440; three'nin eski
 * otomatik dönüşümü de resim yüksekliğini kullanıyordu, yani hiçbir kademede eskisinden keskin olmaz, büyütme yapılmaz).
 */
export function kupYuzuSec(kalite: Kalite, kaynakYuksekligi: number): number {
  return Math.max(16, Math.min(KUP_YUZU[kalite], Math.floor(kaynakYuksekligi)));
}

/** GPU'ya yüklenecek equirect'in en büyük genişliği: küp yüzünün 4 katı (yüz merkezinde 1:1); geniş kaynak işçide küçülür. */
export function yuklemeGenisligi(kalite: Kalite): number {
  return 4 * KUP_YUZU[kalite];
}

/**
 * Şerit başına satır: ~8 MiB (RGBA). Iris Xe ölçümü (8K, 128 MiB): tek seferde 160–290 ms ana iş parçacığı; şeritler
 * arka arkaya gönderilince yine 100–250 ms'lik takılma (GPU sürecinin kuyruğu dolunca), önceki şerit GPU'da bitmeden
 * (fenceSync) yenisi gönderilmezse kare başına en çok ~17 ms. 8K'da 16 şerit (~0,6 sn), 4K'da 4 şerit.
 */
export function seritSatiri(genislik: number, yukseklik: number, hedefBayt = 8 * 1024 * 1024): number {
  return Math.max(1, Math.min(Math.floor(yukseklik), Math.floor(hedefBayt / Math.max(1, genislik * 4))));
}

/** Hazırlık adımları (HUD ve günlük için adlarıyla). */
export type HazirlikAdimi = "coz" | "yukle" | "kup" | "pmrem" | "derle" | "hazir";
export const ADIM_ADLARI: Record<HazirlikAdimi, string> = { coz: "çözülüyor", yukle: "yükleniyor", kup: "küp", pmrem: "ışık", derle: "derleniyor", hazir: "hazır" };

export interface GecisCagrilari<K, V> {
  /** Yeni hazırlık: çözme işini başlatır (sonuç her zaman sonra, eşzamansız gelir) ve kaynak tutucuyu döndürür. */
  baslat(kaynak: K, no: number): V;
  /** Hazırlık iptal edildi ya da panorama ekrandan kalktı: işçi, bitmap ve GPU kaynakları bırakılır. */
  birak(veri: V): void;
  /** Aynı dosyada geçiş gerektiren alanların imzası (yaw, yükseklik, plan, güneş, zaman). */
  imza(kaynak: K): string;
}

export interface Hazirlik<K, V> {
  no: number;
  kaynak: K;
  veri: V;
  adim: HazirlikAdimi;
  /** Bu dosya yüklenemezse sırayla denenecek yedekler (manifestte en yakın panoramalar). */
  adaylar: K[];
}

export type IstekSonucu = "yok" | "ayni" | "meta" | "suruyor" | "yeni" | "hatali";

export interface TakasSonucu<K, V> {
  /** Ekrana gelen yeni panorama (yeni dosya); yoksa null. */
  yeni: { kaynak: K; veri: V } | null;
  /** Ekrandan kalkan panorama: çağıran yenisini uyguladıktan sonra `birak` ile bırakır. */
  eski: { kaynak: K; veri: V } | null;
  /** Aynı dosya, değişen alanlar (yaw, plan, güneş, zaman); yoksa null. */
  meta: K | null;
  /** Panorama kapandı (video panorama 2B yolda; 3B katman gizlenir). */
  kapandi: boolean;
  /** Takasa ertelenmiş yan etki vardı (bölge sıfırlaması, arazi, kar). */
  yanEtki: boolean;
}

/**
 * İstek → hazırlık → takas durum makinesi. `etkin`: ekrandaki; `hazirlik`: hazırlanan (en çok bir tane; yenisi gelince
 * eskisi iptal edilir). Çağıran (Sahne3B) GPU adımlarını yürütür ve `hazirlik.adim`ı ilerletir; `takasHazir` olunca
 * main.ts örtüyü yakalayıp `takas()`ı çağırır.
 */
export class PanoramaGecisi<K extends { url: string }, V> {
  etkin: { kaynak: K; veri: V } | null = null;
  hazirlik: Hazirlik<K, V> | null = null;
  bekleyenMeta: K | null = null;
  /** Takasa ertelenmiş yan etki (bölge sıfırlaması, arazi, kar): hazırlık yoksa bir sonraki karede takas olur. */
  yanEtki = false;
  kapatIstendi = false;
  /** Yüklenemeyen dosyalar (oturum boyunca yeniden denenmez; sıradaki aday denenir). */
  readonly hatali = new Set<string>();
  private no = 0;

  constructor(private readonly c: GecisCagrilari<K, V>) {}

  /**
   * Yeni istek. null: bu bölgede hiç panorama yok → ekrandaki kalır (yer tutucuya düşülmez), süren hazırlık iptal.
   * Ekrandaki dosya → hazırlık iptal (A→B→A'da geçiş olmaz); alanları farklıysa meta takası. Hazırlanan dosya → yalnız
   * kaynak güncellenir. Başka dosya → süren hazırlık iptal, yenisi başlar (hatalı dosyalar atlanır, sıradaki aday).
   */
  iste(k: K | null, adaylar: K[] = []): IstekSonucu {
    if (!k) {
      this.hazirlikIptal();
      this.bekleyenMeta = null;
      return "yok";
    }
    this.kapatIstendi = false;
    const secilen = [k, ...adaylar].find((a) => !this.hatali.has(a.url));
    if (!secilen) {
      this.hazirlikIptal();
      return "hatali";
    }
    const kalan = secilen === k ? adaylar : adaylar.slice(adaylar.indexOf(secilen) + 1);
    if (this.etkin && secilen.url === this.etkin.kaynak.url) {
      this.hazirlikIptal();
      if (this.c.imza(secilen) !== this.c.imza(this.etkin.kaynak)) {
        this.bekleyenMeta = secilen;
        return "meta";
      }
      this.bekleyenMeta = null;
      return "ayni";
    }
    if (this.hazirlik && secilen.url === this.hazirlik.kaynak.url) {
      this.hazirlik.kaynak = secilen;
      this.hazirlik.adaylar = kalan;
      return "suruyor";
    }
    this.hazirlikIptal();
    this.bekleyenMeta = null;
    this.baslat(secilen, kalan);
    return "yeni";
  }

  /** 3B katmanı kapat (video panorama 2B yolda): takasta ekrandaki kalkar. */
  kapat() {
    this.hazirlikIptal();
    this.bekleyenMeta = null;
    if (this.etkin) this.kapatIstendi = true;
  }

  /** Bu nesil hâlâ geçerli mi (işçi sonucu ve GPU adımları her await'ten sonra denetler). */
  gecerli(no: number): boolean {
    return this.hazirlik !== null && this.hazirlik.no === no;
  }

  /**
   * Hazırlık düştü (indirme/çözme hatası): dosya hatalı sayılır, sıradaki aday başlar (ekrandakiyse o kalır). Başlayan
   * adayı döndürür; aday kalmadıysa null (ekrandaki kalır; hiç yoksa yer tutucu).
   */
  dustu(no: number): K | null {
    const h = this.hazirlik;
    if (!h || h.no !== no) return null;
    this.hatali.add(h.kaynak.url);
    this.hazirlik = null;
    this.c.birak(h.veri);
    const sonraki = h.adaylar.find((a) => !this.hatali.has(a.url));
    if (!sonraki) return null;
    const kalan = h.adaylar.slice(h.adaylar.indexOf(sonraki) + 1);
    if (this.etkin && sonraki.url === this.etkin.kaynak.url) {
      if (this.c.imza(sonraki) !== this.c.imza(this.etkin.kaynak)) this.bekleyenMeta = sonraki;
      return sonraki;
    }
    this.baslat(sonraki, kalan);
    return sonraki;
  }

  /** Yan etki takasa ertelendi (bölge sıfırlaması, arazi, kar). */
  yanEtkiIste() {
    this.yanEtki = true;
  }

  /** Hazırlık sürüyor (sonuç henüz hazır değil). */
  get yukleniyor(): boolean {
    return this.hazirlik !== null && this.hazirlik.adim !== "hazir";
  }
  /** Hazırlık ya da takas bekleyen bir şey var: ışık ve arazi bu sürede ekrandaki görüntüyü değiştirmez. */
  get bekliyor(): boolean {
    return this.hazirlik !== null || this.bekleyenMeta !== null || this.kapatIstendi || this.yanEtki;
  }
  /** Hiç panorama gösterilmedi ve ilki hazırlanıyor (ilk açılış: ekran siyah). */
  get ilkBekleniyor(): boolean {
    return this.etkin === null && this.hazirlik !== null;
  }
  /** Takas bu karede yapılabilir: yeni sonuç hazır ya da (hazırlık yokken) meta / kapatma / yan etki bekliyor. */
  get takasHazir(): boolean {
    if (this.hazirlik) return this.hazirlik.adim === "hazir";
    return this.bekleyenMeta !== null || this.kapatIstendi || this.yanEtki;
  }

  /** Takas: ekrandaki değişir; eskiyi çağıran yenisini uyguladıktan sonra bırakır. */
  takas(): TakasSonucu<K, V> {
    const h = this.hazirlik && this.hazirlik.adim === "hazir" ? this.hazirlik : null;
    let yeni: TakasSonucu<K, V>["yeni"] = null;
    let eski: TakasSonucu<K, V>["eski"] = null;
    let meta: K | null = null;
    let kapandi = false;
    if (h) {
      eski = this.etkin;
      this.etkin = { kaynak: h.kaynak, veri: h.veri };
      yeni = this.etkin;
      this.hazirlik = null;
    } else if (this.kapatIstendi) {
      eski = this.etkin;
      this.etkin = null;
      kapandi = true;
    } else if (this.bekleyenMeta && this.etkin) {
      this.etkin.kaynak = this.bekleyenMeta;
      meta = this.bekleyenMeta;
    }
    const yanEtki = this.yanEtki;
    this.bekleyenMeta = null;
    this.kapatIstendi = false;
    this.yanEtki = false;
    return { yeni, eski, meta, kapandi, yanEtki };
  }

  private baslat(k: K, adaylar: K[]) {
    const no = ++this.no;
    // Çağrı sonucu eşzamansız gelir (gecerli/dustu bu nesneyi görür)
    const veri = this.c.baslat(k, no);
    this.hazirlik = { no, kaynak: k, veri, adim: "coz", adaylar };
  }

  private hazirlikIptal() {
    const h = this.hazirlik;
    if (!h) return;
    this.hazirlik = null;
    this.c.birak(h.veri);
  }
}

/**
 * Takastan sonra örtünün solmaya başlayıp başlamayacağı: yeni sahne en az bir kez çizildi, gölgelendirici derlemesi bitti
 * ve (bölge değiştiyse) arazi dokuları geldi; dokular gecikirse en çok `dokuBekleme` ms beklenir. Doku "pop"u ve
 * derleme takılması örtünün (eski karenin) arkasında kalır.
 */
export function solmaBaslayabilir(cizimSayisi: number, derleniyor: boolean, araziBekleniyor: boolean, dokularHazir: boolean, gecenMs: number, dokuBekleme = 1200): boolean {
  if (derleniyor || cizimSayisi < 1) return false;
  if (!araziBekleniyor || dokularHazir) return true;
  return gecenMs >= dokuBekleme;
}

export type ArkaPlanKarari = "yok" | "siyah" | "yer_tutucu";

/**
 * 2B tuvalde ne çizilecek. Arka plan çizildiyse hiçbir şey; içerik listesi (manifest) ya da ilk panorama beklenirken
 * siyah; daha önce panorama gösterildiyse de siyah (geçiş örtüsü ve 3B katman zaten bir görüntü tutar). Parametrik yer
 * tutucu (gokyuzuCiz/araziCiz) yalnız hiç panorama gösterilmemişken ve gösterilecek panorama yokken.
 */
export function arkaPlanKarari(arkaPlanVar: boolean, manifestYuklendi: boolean, panoramaBekleniyor: boolean, panoramaGosterildi: boolean): ArkaPlanKarari {
  if (arkaPlanVar) return "yok";
  if (!manifestYuklendi || panoramaBekleniyor || panoramaGosterildi) return "siyah";
  return "yer_tutucu";
}
