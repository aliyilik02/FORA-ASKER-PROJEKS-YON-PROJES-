/**
 * Şimşekli fırtına zamanlayıcısı: ortamda `simsek` açıkken rastgele aralıklarla şimşek efekti tetikler (bütün
 * oynatıcılara aynı çakma gider: tek yerden zamanlanır; DMX flaşı ve günlük `efektTetikle`de). Saniyede bir `adim`.
 */
import type { OrtamAyarlari } from "./tipler.js";

export interface FirtinaBaglami {
  ortam(): OrtamAyarlari;
  simsek(siddet: number): void;
}

export class FirtinaZamanlayici {
  private sonraki = 0;

  constructor(
    private readonly b: FirtinaBaglami,
    private readonly rastgele: () => number = Math.random,
  ) {}

  /** `simdi` ms. Açılınca ilk çakma 3–11 sn sonra; sonra 12–40 sn (şiddetli yağmur yoksa 1,6 kat seyrek). */
  adim(simdi: number) {
    const o = this.b.ortam();
    if (!o.simsek) {
      this.sonraki = 0;
      return;
    }
    if (this.sonraki === 0) {
      this.sonraki = simdi + 3000 + this.rastgele() * 8000;
      return;
    }
    if (simdi < this.sonraki) return;
    this.sonraki = simdi + (12000 + this.rastgele() * 28000) * (o.yagis === "siddetli_yagmur" ? 1 : 1.6);
    this.b.simsek(0.6 + this.rastgele() * 0.4);
  }
}
