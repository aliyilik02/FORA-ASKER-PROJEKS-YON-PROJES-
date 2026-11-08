/**
 * Tatbikat tekrar oynatma (AAR, 8 Kasım C-16): olay günlüğündeki bir tatbikatın komut akışı (durum anlık görüntüleri,
 * efektler, figür komutları, sahne sıfırlamaları) özgün göreli zamanlamasıyla (× hız) duvara yeniden gönderilir.
 * Başlarken sahne temele döner; eğitmen durdurabilir, sahne sıfırlaması da keser. Senaryo motoru ve panel komutları
 * olaylara zaten yansıdığı için `senaryo`/`not`/`tatbikat` kayıtları atlanır. Tekrar sırasında üretilen olaylar
 * "Tekrar: <ad>" tatbikatı altında günlüğe düşer.
 */
import type { FigurKomutu, Olay, SimulasyonDurumu, TekrarDurumu } from "./tipler.js";

type Dinleyici = (durum: TekrarDurumu | null) => void;

export interface TekrarZamanlayici {
  simdi(): number;
  zamanla(cb: () => void, ms: number): () => void;
}

export interface TekrarBagimliliklari {
  durumuYukle(durum: Omit<SimulasyonDurumu, "sonEfektler">): Promise<unknown>;
  efektTetikle(efekt: Olay["ayrinti"]): Promise<unknown>;
  figurKomutu(komut: FigurKomutu): unknown;
  sahneSifirla(): unknown;
  gunluk: { bilgi(m: string): void; uyari(m: string): void };
}

/** Tekrar oynatılabilir olaylar ve göreli zamanları (ms, ilk olaya göre). */
export function tekrarAkisi(olaylar: Olay[]): Array<{ t: number; olay: Olay }> {
  const uygun = olaylar.filter((o) => (o.tur === "efekt" || o.tur === "figur" || o.tur === "durum" || o.tur === "sahne") && o.ayrinti !== undefined);
  if (uygun.length === 0) return [];
  const t0 = olaylar[0]?.zaman ?? uygun[0].zaman;
  return uygun.map((olay) => ({ t: Math.max(0, olay.zaman - t0), olay }));
}

export class TekrarOynatici {
  private durum: TekrarDurumu | null = null;
  private iptaller: Array<() => void> = [];
  private dinleyiciler = new Set<Dinleyici>();

  constructor(
    private readonly b: TekrarBagimliliklari,
    private readonly zamanlayici: TekrarZamanlayici = { simdi: () => Date.now(), zamanla: (cb, ms) => { const t = setTimeout(cb, ms); return () => clearTimeout(t); } },
  ) {}

  al(): TekrarDurumu | null {
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

  /** Tekrarı başlatır; `hiz` 0,25–4 (2 = iki kat hızlı). Oynatılacak olay yoksa null. */
  baslat(ad: string, tatbikat: string, olaylar: Olay[], hiz = 1): TekrarDurumu | null {
    this.durdur(true);
    const akis = tekrarAkisi(olaylar);
    if (akis.length === 0) return null;
    const h = Math.min(4, Math.max(0.25, Number.isFinite(hiz) ? hiz : 1));
    const toplamMs = Math.round(akis[akis.length - 1].t / h);
    this.durum = { ad, tatbikat, baslangic: this.zamanlayici.simdi(), toplamMs, hiz: h, olaySayisi: akis.length, tamamlanan: 0 };
    this.b.gunluk.bilgi(`Tekrar oynatma başladı: ${ad} (${akis.length} olay, ${Math.round(toplamMs / 1000)} sn, ×${h})`);
    this.b.sahneSifirla();
    for (const { t, olay } of akis) {
      const uygula = () => {
        if (!this.durum) return;
        void Promise.resolve()
          .then(() => this.uygula(olay))
          .catch((hata: unknown) => this.b.gunluk.uyari(`Tekrar adımı uygulanamadı (${olay.ozet}): ${hata instanceof Error ? hata.message : String(hata)}`))
          .finally(() => {
            if (!this.durum) return;
            this.durum.tamamlanan++;
            if (this.durum.tamamlanan >= this.durum.olaySayisi) {
              this.b.gunluk.bilgi(`Tekrar oynatma bitti: ${this.durum.ad}`);
              this.durum = null;
              this.iptaller = [];
            }
            this.yayinla();
          });
      };
      const gecikme = Math.round(t / h);
      if (gecikme <= 0) uygula();
      else this.iptaller.push(this.zamanlayici.zamanla(uygula, gecikme));
    }
    this.yayinla();
    return this.al();
  }

  private uygula(olay: Olay) {
    switch (olay.tur) {
      case "durum": {
        const a = olay.ayrinti as { durum?: Omit<SimulasyonDurumu, "sonEfektler"> } | undefined;
        if (a?.durum) return this.b.durumuYukle(a.durum);
        return undefined;
      }
      case "efekt":
        return this.b.efektTetikle(olay.ayrinti);
      case "figur":
        return this.b.figurKomutu(olay.ayrinti as FigurKomutu);
      case "sahne":
        return this.b.sahneSifirla();
      default:
        return undefined;
    }
  }

  durdur(sessiz = false): boolean {
    for (const i of this.iptaller) i();
    this.iptaller = [];
    const vardi = this.durum !== null;
    if (vardi && !sessiz) this.b.gunluk.bilgi(`Tekrar oynatma durduruldu: ${this.durum!.ad}`);
    this.durum = null;
    if (vardi) this.yayinla();
    return vardi;
  }
}
