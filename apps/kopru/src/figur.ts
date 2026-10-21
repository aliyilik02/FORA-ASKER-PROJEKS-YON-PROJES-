/**
 * Figür / klip yöneticisi: panelden gelen komutları doğrular, aktif örnekleri tutar ve
 * oynatıcılara yayınlar. Klip listesini oynatıcının içerik manifestinden okur.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { kimlikUret } from "./depo.js";
import type { Gunluk } from "./gunluk.js";
import type { FigurKomutu, KlipOzeti } from "./tipler.js";

export type AktifFigur = FigurKomutu & { id: string };
type Dinleyici = (komut: AktifFigur, aktifler: AktifFigur[]) => void;

const sinirla = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export class FigurYoneticisi {
  private aktifler = new Map<string, AktifFigur>();
  private dinleyiciler = new Set<Dinleyici>();

  constructor(
    private readonly gunluk: Gunluk,
    /** Aday içerik klasörleri; ilk var olan manifest.json kullanılır. */
    private readonly icerikKlasorleri: string[],
  ) {}

  dinle(d: Dinleyici): () => void {
    this.dinleyiciler.add(d);
    return () => this.dinleyiciler.delete(d);
  }

  aktifListe(): AktifFigur[] {
    return [...this.aktifler.values()];
  }

  /** Komutu doğrular, uygular ve yayınlar. Hatalı komutta Error fırlatır. */
  komut(ham: FigurKomutu): AktifFigur {
    if (!["oynat", "durdur", "temizle"].includes(ham.islem)) throw new Error("islem 'oynat', 'durdur' veya 'temizle' olmalı");
    let k: AktifFigur;
    if (ham.islem === "oynat") {
      if (!ham.klip || typeof ham.klip !== "string") throw new Error("klip adı zorunlu");
      k = {
        islem: "oynat",
        id: ham.id ?? kimlikUret("fg"),
        klip: ham.klip,
        azimut: ((Number(ham.azimut ?? 0) % 360) + 540) % 360 - 180,
        yukseklik: sinirla(Number(ham.yukseklik ?? -4), -45, 45),
        olcek: sinirla(Number(ham.olcek ?? 1), 0.1, 10),
        dongu: ham.dongu,
        yansit: Boolean(ham.yansit),
      };
      this.aktifler.set(k.id, k);
      this.gunluk.bilgi(`Figür oynat: ${k.klip} @ ${k.azimut}° (${k.id})`);
    } else if (ham.islem === "durdur") {
      if (!ham.id) throw new Error("durdurmak için id zorunlu");
      k = { islem: "durdur", id: ham.id };
      this.aktifler.delete(ham.id);
      this.gunluk.bilgi(`Figür durdur: ${ham.id}`);
    } else {
      k = { islem: "temizle", id: "*" };
      this.aktifler.clear();
      this.gunluk.bilgi("Tüm figürler kaldırıldı");
    }
    const liste = this.aktifListe();
    for (const d of this.dinleyiciler) d(k, liste);
    return k;
  }

  /** Bir kerelik klip bittiğinde oynatıcı bildirmez; panel listesi için süreli olmayanlar tutulur. Bu yardımcı eski tek seferlikleri temizler. */
  tekSeferlikleriKaldir(klipTanimlari: Record<string, { dongu?: boolean }>) {
    for (const [id, f] of this.aktifler) {
      const tanim = f.klip ? klipTanimlari[f.klip] : undefined;
      const dongu = f.dongu ?? tanim?.dongu ?? false;
      if (!dongu) this.aktifler.delete(id);
    }
  }

  /** Manifestteki klipleri özetler (panel listesi için). */
  klipleriOku(): KlipOzeti[] {
    for (const klasor of this.icerikKlasorleri) {
      const yol = join(klasor, "manifest.json");
      if (!existsSync(yol)) continue;
      try {
        const m = JSON.parse(readFileSync(yol, "utf8")) as { klipler?: Record<string, Record<string, unknown>> };
        return Object.entries(m.klipler ?? {})
          .filter(([ad, t]) => !ad.startsWith("_") && !t._ornek)
          .map(([ad, t]) => ({
            ad,
            baslik: typeof t.ad === "string" ? t.ad : ad,
            kategori: typeof t.kategori === "string" ? t.kategori : "diger",
            dongu: Boolean(t.dongu),
          }));
      } catch (hata) {
        this.gunluk.uyari(`manifest okunamadı (${yol}): ${hata instanceof Error ? hata.message : String(hata)}`);
        return [];
      }
    }
    return [];
  }
}
