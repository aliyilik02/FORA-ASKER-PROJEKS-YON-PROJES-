/**
 * Sahne sıfırlamasının oynatıcı tarafı (main.ts sahneyiTemizle → adimlariCalistir): köprünün `sahne/sifirla` mesajında, kaçırılan
 * sıfırlamada (bağlanınca nesil farklı) ya da köprü yokken ⇧0'da yerel artıklar sabit sırayla temizlenir. Her adım
 * ayrı try/catch içinde çalışır: biri hata atsa da sonrakiler çalışır (yarım temizlik kalmaz), hatalar toplanıp tek
 * satırda köprü günlüğüne gider (köprü oynatıcı günlüğünü 500 ms'de bir satırla sınırlar).
 *
 * Durumla gelenlere (çatışma, izli mermi, helikopterin açık/kapalı oluşu) burada dokunulmaz: köprü onları kapatan durum
 * yayınını `sahne` mesajından önce yollar. Yalnız köprü yokken `temelDurum` ile yerel kopyada kapatılır.
 */
import type { SimulasyonDurumu } from "./tipler";

/** Sabit temizlik sırası: önce kuyruklar (yeni figür/efekt doğmasın), sonra 3B ve 2B katmanlar, sesler, önizleme. */
export const TEMIZLIK_ADIMLARI = ["kuyruklar", "sahne3b", "klipler", "efektler", "izli", "sesler", "onizleme"] as const;
export type TemizlikAdimi = (typeof TEMIZLIK_ADIMLARI)[number];

/** Günlük satırı için adım adları. */
export const TEMIZLIK_ETIKETLERI: Record<TemizlikAdimi, string> = {
  kuyruklar: "bekleyen figür/efekt kuyruğu",
  sahne3b: "3B sahne",
  klipler: "2B klipler",
  efektler: "2B efektler",
  izli: "2B izli mermi",
  sesler: "sesler",
  onizleme: "önizleme",
};

export interface TemizlikHatasi {
  adim: TemizlikAdimi;
  hata: unknown;
}

/** Adımları TEMIZLIK_ADIMLARI sırasıyla çalıştırır; hata atanlar listede döner, sonrakiler yine çalışır. */
export function adimlariCalistir(islemler: Record<TemizlikAdimi, () => void>): TemizlikHatasi[] {
  const hatalar: TemizlikHatasi[] = [];
  for (const adim of TEMIZLIK_ADIMLARI) {
    try {
      islemler[adim]();
    } catch (hata) {
      hatalar.push({ adim, hata });
    }
  }
  return hatalar;
}

/** "3B sahne: X · sesler: Y" (köprü günlüğüne tek satır). */
export function hataOzeti(hatalar: readonly TemizlikHatasi[]): string {
  return hatalar.map((h) => `${TEMIZLIK_ETIKETLERI[h.adim]}: ${h.hata instanceof Error ? h.hata.message : String(h.hata)}`).join(" · ");
}

/**
 * Köprü yokken (⇧0, istek düştü) yalnız bu oynatıcıda temel sahne: çatışma, izli mermi ve helikopter kapalı, son
 * efektler boş; ayar değerleri, ortam ve bölge aynı. Köprü dönünce onun durumu geçerli olur.
 */
export function temelDurum(d: SimulasyonDurumu): SimulasyonDurumu {
  return {
    ...d,
    catisma: { ...d.catisma, aktif: false },
    izliMermi: { ...d.izliMermi, aktif: false },
    oda2: { ...d.oda2, helikopter: "yok" },
    sonEfektler: [],
  };
}
