/**
 * Sahne saati ve iptal edilebilir olay kuyruğu (8 Kasım, C-20): zamanlanmış sahne olayları (havan patlaması, gecikmeli
 * efektler) `setTimeout` yerine sahne saatiyle akar — duraklama/sekme gizlenmesinde kare `dt`siyle birlikte durur, sahne
 * sıfırlamasında tek çağrıyla hepsi iptal olur, nesil denetimi gerekmez.
 */
export interface KuyrukOlayi {
  zaman: number;
  cb: () => void;
  iptal: boolean;
}

export class OlayKuyrugu {
  /** Sahne saati (sn): yalnız `guncelle` ile ilerler. */
  saat = 0;
  private olaylar: KuyrukOlayi[] = [];

  get bekleyen() {
    return this.olaylar.filter((o) => !o.iptal).length;
  }

  /** `sn` saniye sonra çalışacak olay; dönen fonksiyon iptal eder. */
  ekle(sn: number, cb: () => void): () => void {
    const o: KuyrukOlayi = { zaman: this.saat + Math.max(0, sn), cb, iptal: false };
    this.olaylar.push(o);
    return () => {
      o.iptal = true;
    };
  }

  /** Saati ilerletir, vadesi gelenleri sırayla çalıştırır (bir olayın hatası diğerlerini engellemez). */
  guncelle(dt: number) {
    if (!(dt > 0)) return;
    this.saat += dt;
    if (this.olaylar.length === 0) return;
    const vadesi = this.olaylar.filter((o) => !o.iptal && o.zaman <= this.saat).sort((a, b) => a.zaman - b.zaman);
    this.olaylar = this.olaylar.filter((o) => !o.iptal && o.zaman > this.saat);
    for (const o of vadesi) {
      try {
        o.cb();
      } catch (hata) {
        console.error("Olay kuyruğu", hata);
      }
    }
  }

  /** Bekleyen her şeyi iptal eder (sahne sıfırlaması). */
  temizle() {
    for (const o of this.olaylar) o.iptal = true;
    this.olaylar = [];
  }
}
