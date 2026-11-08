/**
 * Sahne yöneticisi: tek düğmeyle "temel sahne" (deneme sonrası ya da yeni eğitim grubu için temiz başlangıç).
 *
 * Temel sahne KORUR: oda, bölge, ortam (mevsim, saat, bulut, sis, yağış, rüzgâr), ışık (DMX) ayarı, Oda 2 güvenli alanı
 * ve sütre dizilimi, ayar değerleri (çatışma şiddet/yön/dost ateşi, izli mermi çıkış/yön/sıklık, helikopter iniş yönü,
 * uzak ses mesafe/yön) ve yüklü senaryo (durmuş, 00:00'da; Boşluk baştan oynatır). TEMİZLER: bütün figürler, çatışma,
 * izli mermi, helikopter, son efektler, senaryo oynatımı ve DMX'te takılı flaş; oynatıcılar `sahne/sifirla` mesajıyla
 * kendi yerel artıklarını (krater, duman, parçacık, 2B efekt, uçuştaki iz ve top mermisi, yüklenmekte olan figür,
 * sesler) temizler, paneller helikopter iniş dizisini iptal eder.
 *
 * Sıra sabittir ve araya hiçbir await girmez (hepsi aynı olay döngüsü turunda): senaryo durur (yeni adım çıkmasın) →
 * figür temizle (tek `figur` yayını) → tek `durum` yayını (çatışma/izli/helikopter kapalı; flaş kesik, temel ışık) →
 * nesil++ ve `sahne/sifirla` yayını → son durum hemen diske → tek günlük satırı. `sahne` mesajı en sonda gelir: oynatıcı
 * önce ateşin kapalı olduğu durumu alır, sonra temizler; arada çizilen karede yeni iz doğmaz. İkinci çağrı aynı sonucu
 * verir (idempotent), yalnız nesil artar. Senaryo baştan oynatılırken `SenaryoMotoru.oynat` da bunu çağırır
 * (kaynak "senaryo"): eğitmenin elle çağırdıkları gider, senaryo temiz sahnede başlar; duraklatılmıştan devam ederken yok.
 */
import type { TemeleDonenler } from "./durum.js";
import type { Gunluk } from "./gunluk.js";
import { SIFIRLAMA_KAYNAK_ETIKETLERI, sifirlamaOzetiMetni, type FigurKomutu, type SenaryoDurumu, type SifirlamaKaynagi, type SifirlamaOzeti, type SunucuMesaji } from "./tipler.js";

export interface SahneBagimliliklari {
  depo: { sahneyiTemeleDondur(): TemeleDonenler };
  senaryo: { al(): SenaryoDurumu; dur(sessiz?: boolean): void; readonly yukluAd: string | null };
  figur?: { komut(k: FigurKomutu, sessiz?: boolean): unknown; aktifListe(): unknown[] };
  /** Süren makro (eğitmen dizisi) ve tekrar oynatma: sıfırlamada iptal edilir (bekleyen adımları sahneyi yeniden doldurmasın). */
  makro?: { durdur(sessiz?: boolean): unknown };
  tekrar?: { durdur(sessiz?: boolean): unknown; al(): unknown };
  gunluk: Pick<Gunluk, "bilgi">;
  /** Tüm istemcilere (oynatıcı + panel) yayın. */
  yayinla: (m: SunucuMesaji) => void;
  /** Son durumu beklemeden diske yazar (nesil dahil; köprü hemen kapanırsa eski sahne geri gelmesin). */
  kaydet: () => void;
}

export const SIFIRLAMA_KAYNAKLARI: readonly SifirlamaKaynagi[] = ["panel", "kisayol", "oynatici"];

/** İstek gövdesindeki kaynak; tanınmazsa (ya da gövdesiz eski çağrıda) "panel". */
export function sifirlamaKaynagiCoz(deger: unknown): SifirlamaKaynagi {
  return SIFIRLAMA_KAYNAKLARI.find((k) => k === deger) ?? "panel";
}

export class SahneYoneticisi {
  /**
   * Sıfırlama nesli: her sıfırlamada artar, son durumla diske yazılır; köprü yeniden açılınca kaldığı yerden sürer
   * (bağlı oynatıcılar boşuna temizlenmesin). Bağlanan istemciye `sahne/senkron` ile gider: oynatıcının bildiği nesil
   * farklıysa (kopukken sıfırlama kaçırıldı) yerel temizlik yapar. Kayıt yoksa saatten (her açılışta farklı).
   */
  nesil: number;
  /** Son sıfırlamanın köprü saati (ms; yoksa 0). */
  sonZaman = 0;

  constructor(
    private readonly b: SahneBagimliliklari,
    baslangicNesli?: number,
  ) {
    this.nesil = typeof baslangicNesli === "number" && Number.isFinite(baslangicNesli) ? baslangicNesli : Date.now();
  }

  sifirla(kaynak: SifirlamaKaynagi): SifirlamaOzeti {
    const { b } = this;
    // a) Senaryo: ilk iş, yeni adım (figür, efekt, çatışma) çıkmasın
    const senaryo = b.senaryo.al().durum !== "duruyor" ? b.senaryo.yukluAd : null;
    b.senaryo.dur(true);
    b.makro?.durdur(true);
    // Tekrar oynatmanın kendi başlangıç sıfırlaması tekrarı kesmemeli: tekrar kaynaklı sıfırlama dışında kes
    if (kaynak !== "tekrar") b.tekrar?.durdur(true);
    // b) Figürler: liste boş olsa da her zaman (oynatıcıdaki artık ve kuyruktakiler de gitsin), tek `figur` yayını
    const figur = b.figur?.aktifListe().length ?? 0;
    b.figur?.komut({ islem: "temizle" }, true);
    // c) Tek `durum` yayını: çatışma / izli mermi / helikopter kapalı, son efektler boş; flaş kesik, temel ışık
    const kapananlar = b.depo.sahneyiTemeleDondur();
    const ozet: SifirlamaOzeti = { figur, senaryo, ...kapananlar };
    // d) En son `sahne` mesajı: oynatıcı yerel artıklarını temizler, paneller tek bildirim gösterir
    this.nesil++;
    this.sonZaman = Date.now();
    b.yayinla({ tip: "sahne", islem: "sifirla", nesil: this.nesil, kaynak, ozet, zaman: this.sonZaman });
    // e) Son durum hemen diske (köprü şimdi kapanırsa eski sahne geri yüklenmesin)
    b.kaydet();
    // f) Tek günlük satırı
    b.gunluk.bilgi(`Sahne temele döndü (${SIFIRLAMA_KAYNAK_ETIKETLERI[kaynak]}): ${sifirlamaOzetiMetni(ozet)}; ortam, bölge ve ışık korundu`);
    return ozet;
  }
}
