/**
 * Makro (eğitmen dizisi), 8 Kasım D-listesi: birkaç senaryo adımının zamanlı dizisi ("Pusu" = çatışma + patlamalar +
 * bağırma; helikopter iniş dizisi = yaklaşıyor → iniyor → yerde). Yüklü senaryodan bağımsız, köprüde çalışır: tablet
 * kapansa/sekme değişse de sürer (eskiden helikopter dizisi panel sekmesinde setTimeout ile dönüyor, ekran kapanınca
 * takılıyordu). Sahne sıfırlaması ve yeni makro süreni iptal eder; durum WS `makro` mesajıyla panellere gider.
 */
import type { MakroDurumu, SenaryoAdimi } from "./tipler.js";

type Dinleyici = (durum: MakroDurumu | null) => void;

export interface MakroZamanlayici {
  simdi(): number;
  zamanla(cb: () => void, ms: number): () => void;
}

export const gercekMakroZamanlayici: MakroZamanlayici = {
  simdi: () => Date.now(),
  zamanla: (cb, ms) => {
    const t = setTimeout(cb, ms);
    return () => clearTimeout(t);
  },
};

export class MakroCalistirici {
  private durum: MakroDurumu | null = null;
  private iptaller: Array<() => void> = [];
  private dinleyiciler = new Set<Dinleyici>();

  constructor(
    private readonly tetikle: (adim: SenaryoAdimi) => Promise<unknown>,
    private readonly gunluk: { bilgi(m: string): void; uyari(m: string): void },
    private readonly zamanlayici: MakroZamanlayici = gercekMakroZamanlayici,
  ) {}

  al(): MakroDurumu | null {
    return this.durum ? { ...this.durum } : null;
  }

  dinle(d: Dinleyici): () => void {
    this.dinleyiciler.add(d);
    return () => this.dinleyiciler.delete(d);
  }

  private yayinla() {
    const k = this.al();
    for (const d of this.dinleyiciler) d(k);
  }

  /** Diziyi başlatır (süreni iptal eder). Adımlar gecikmelerine göre zamanlanır; 0 ms olanlar hemen. */
  baslat(ad: string, adimlar: SenaryoAdimi[]): MakroDurumu {
    this.durdur(true);
    const sirali = [...adimlar].sort((a, b) => a.gecikmeMs - b.gecikmeMs);
    const toplamMs = sirali.reduce((m, a) => Math.max(m, a.gecikmeMs), 0);
    this.durum = { ad, baslangic: this.zamanlayici.simdi(), toplamMs, adimSayisi: sirali.length, tamamlanan: 0 };
    this.gunluk.bilgi(`Makro başladı: ${ad} (${sirali.length} adım, ${Math.round(toplamMs / 1000)} sn)`);
    for (const adim of sirali) {
      const calistir = () => {
        if (!this.durum) return;
        void this.tetikle(adim)
          .catch((h: unknown) => this.gunluk.uyari(`Makro adımı uygulanamadı (${adim.aciklama}): ${h instanceof Error ? h.message : String(h)}`))
          .finally(() => {
            if (!this.durum) return;
            this.durum.tamamlanan++;
            if (this.durum.tamamlanan >= this.durum.adimSayisi) {
              this.gunluk.bilgi(`Makro bitti: ${this.durum.ad}`);
              this.durum = null;
              this.iptaller = [];
            }
            this.yayinla();
          });
      };
      if (adim.gecikmeMs <= 0) calistir();
      else this.iptaller.push(this.zamanlayici.zamanla(calistir, adim.gecikmeMs));
    }
    this.yayinla();
    return this.al()!;
  }

  /** Süren diziyi iptal eder (bekleyen adımlar çalışmaz). `sessiz`: günlüğe yazmaz. */
  durdur(sessiz = false): boolean {
    for (const i of this.iptaller) i();
    this.iptaller = [];
    const vardi = this.durum !== null;
    if (vardi && !sessiz) this.gunluk.bilgi(`Makro durduruldu: ${this.durum!.ad}`);
    this.durum = null;
    if (vardi) this.yayinla();
    return vardi;
  }
}
