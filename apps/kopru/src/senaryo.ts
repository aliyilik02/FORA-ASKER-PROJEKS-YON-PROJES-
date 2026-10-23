/**
 * Senaryo motoru – zaman çizelgesine göre adımları tetikler (§3 efekt ve senaryo motoru).
 * Eğitmen senaryoyu oynatabilir, duraklatabilir, durdurabilir; adımlar sırayla işlenir.
 * Zamanlayıcı dışarıdan verilebilir (testlerde sahte saat kullanılır).
 */
import type { DurumDeposu } from "./durum.js";
import type { FigurYoneticisi } from "./figur.js";
import type { Gunluk } from "./gunluk.js";
import type { Senaryo, SenaryoAdimi, SenaryoDurumu } from "./tipler.js";

export interface Zamanlayici {
  simdi(): number;
  aralik(cb: () => void, ms: number): () => void;
}

export const gercekZamanlayici: Zamanlayici = {
  simdi: () => Date.now(),
  aralik: (cb, ms) => {
    const t = setInterval(cb, ms);
    return () => clearInterval(t);
  },
};

type Dinleyici = (durum: SenaryoDurumu) => void;

export class SenaryoMotoru {
  private senaryo: Senaryo | null = null;
  private durum: SenaryoDurumu = { senaryoId: null, durum: "duruyor", konumMs: 0, toplamMs: 0, tamamlanan: [] };
  private baslangicZamani = 0;
  private duraklatmaKonumu = 0;
  private durdur: (() => void) | null = null;
  private dinleyiciler = new Set<Dinleyici>();
  /** Figür adımları için; `figurBagla` ile verilir (isteğe bağlı, testlerde yok). */
  private figur: Pick<FigurYoneticisi, "komut"> | null = null;

  figurBagla(f: Pick<FigurYoneticisi, "komut">) {
    this.figur = f;
  }

  constructor(
    private readonly depo: DurumDeposu,
    private readonly gunluk: Gunluk,
    private readonly zamanlayici: Zamanlayici = gercekZamanlayici,
    private readonly tikMs = 50,
  ) {}

  al(): SenaryoDurumu {
    return { ...this.durum, tamamlanan: [...this.durum.tamamlanan] };
  }

  dinle(d: Dinleyici): () => void {
    this.dinleyiciler.add(d);
    return () => this.dinleyiciler.delete(d);
  }

  private yayinla() {
    const kopya = this.al();
    for (const d of this.dinleyiciler) d(kopya);
  }

  yukle(senaryo: Senaryo) {
    this.dur();
    this.senaryo = { ...senaryo, adimlar: [...senaryo.adimlar].sort((a, b) => a.gecikmeMs - b.gecikmeMs) };
    this.durum = {
      senaryoId: senaryo.id,
      durum: "duruyor",
      konumMs: 0,
      toplamMs: this.senaryo.adimlar.reduce((m, a) => Math.max(m, a.gecikmeMs), 0),
      tamamlanan: [],
    };
    this.gunluk.bilgi(`Senaryo yüklendi: ${senaryo.ad} (${senaryo.adimlar.length} adım)`);
    this.yayinla();
  }

  async oynat() {
    if (!this.senaryo) throw new Error("Önce bir senaryo yükleyin");
    if (this.durum.durum === "oynuyor") return;
    if (this.durum.durum === "duruyor") {
      this.durum.tamamlanan = [];
      this.duraklatmaKonumu = 0;
      await this.depo.odaSec(this.senaryo.oda);
    }
    this.baslangicZamani = this.zamanlayici.simdi() - this.duraklatmaKonumu;
    this.durum.durum = "oynuyor";
    this.gunluk.bilgi(`Senaryo oynatılıyor: ${this.senaryo.ad}`);
    this.durdur = this.zamanlayici.aralik(() => void this.tik(), this.tikMs);
    this.yayinla();
    await this.tik();
  }

  duraklat() {
    if (this.durum.durum !== "oynuyor") return;
    this.duraklatmaKonumu = this.zamanlayici.simdi() - this.baslangicZamani;
    this.durum.konumMs = this.duraklatmaKonumu;
    this.durum.durum = "duraklatildi";
    this.durdur?.();
    this.durdur = null;
    this.gunluk.bilgi("Senaryo duraklatıldı");
    this.yayinla();
  }

  dur() {
    const oynuyordu = this.durum.durum !== "duruyor";
    this.durdur?.();
    this.durdur = null;
    this.durum.durum = "duruyor";
    this.durum.konumMs = 0;
    this.duraklatmaKonumu = 0;
    if (oynuyordu) {
      this.gunluk.bilgi("Senaryo durduruldu");
      this.yayinla();
    }
  }

  /** Belirli bir adımı anında, zaman çizelgesinden bağımsız tetikler (eğitmen müdahalesi). */
  async adimiTetikle(adim: SenaryoAdimi) {
    const islem = adim.islem;
    switch (islem.tip) {
      case "efekt":
        await this.depo.efektTetikle(islem.efekt);
        break;
      case "ortam":
        await this.depo.ortamGuncelle(islem.ortam);
        break;
      case "bolge":
        await this.depo.bolgeSec(islem.bolge);
        break;
      case "izli_mermi":
        await this.depo.izliMermiGuncelle(islem.izliMermi);
        break;
      case "isik":
        this.depo.isikGuncelle(islem.isik);
        break;
      case "oda2":
        await this.depo.oda2Guncelle(islem.oda2);
        break;
      case "catisma":
        await this.depo.catismaGuncelle(islem.catisma);
        break;
      case "oda":
        await this.depo.odaSec(islem.oda);
        break;
      case "figur":
        if (!this.figur) {
          this.gunluk.uyari("Senaryo figür adımı: figür yöneticisi bağlı değil");
          break;
        }
        try {
          this.figur.komut(islem.figur);
        } catch (hata) {
          this.gunluk.uyari(`Senaryo figür adımı uygulanamadı: ${hata instanceof Error ? hata.message : String(hata)}`);
        }
        break;
    }
  }

  private isleniyor = false;

  private async tik() {
    if (!this.senaryo || this.durum.durum !== "oynuyor" || this.isleniyor) return;
    this.isleniyor = true;
    try {
      const konum = this.zamanlayici.simdi() - this.baslangicZamani;
      this.durum.konumMs = konum;
      for (const adim of this.senaryo.adimlar) {
        if (adim.gecikmeMs <= konum && !this.durum.tamamlanan.includes(adim.id)) {
          this.durum.tamamlanan.push(adim.id);
          this.gunluk.bilgi(`Senaryo adımı: ${adim.aciklama}`);
          await this.adimiTetikle(adim);
        }
      }
      if (this.durum.tamamlanan.length >= this.senaryo.adimlar.length) {
        this.durdur?.();
        this.durdur = null;
        this.durum.durum = "duruyor";
        this.durum.konumMs = this.durum.toplamMs;
        this.gunluk.bilgi(`Senaryo tamamlandı: ${this.senaryo.ad}`);
      }
      this.yayinla();
    } finally {
      this.isleniyor = false;
    }
  }
}
