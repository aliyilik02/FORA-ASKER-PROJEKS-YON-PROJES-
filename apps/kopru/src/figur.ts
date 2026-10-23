/**
 * Figür / klip yöneticisi: panelden gelen komutları doğrular, aktif örnekleri tutar ve
 * oynatıcılara yayınlar. Klip listesini oynatıcının içerik manifestinden okur.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { kimlikUret } from "./depo.js";
import type { Gunluk } from "./gunluk.js";
import type { FigurKomutu, FigurPozu, KlipOzeti } from "./tipler.js";

export type AktifFigur = FigurKomutu & { id: string };
const POZLAR: FigurPozu[] = ["ayakta", "comelmis", "yatmis", "yarali"];
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

  /** Açılışta kaydedilmiş figürleri geri yükler (yayın yok; bağlanan istemciler listeyi zaten alır). */
  yukle(liste: AktifFigur[]) {
    this.aktifler.clear();
    for (const f of liste) if (f && typeof f.id === "string" && f.id && typeof f.klip === "string" && f.klip) this.aktifler.set(f.id, { ...f, islem: "oynat" });
  }

  /** Komutu doğrular, uygular ve yayınlar. Hatalı komutta Error fırlatır. */
  komut(ham: FigurKomutu): AktifFigur {
    if (!["oynat", "durdur", "temizle", "poz"].includes(ham.islem)) throw new Error("islem 'oynat', 'durdur', 'temizle' veya 'poz' olmalı");
    if (ham.poz !== undefined && !POZLAR.includes(ham.poz)) throw new Error(`poz ${POZLAR.join("/")} olmalı`);
    let k: AktifFigur;
    if (ham.islem === "oynat") {
      if (!ham.klip || typeof ham.klip !== "string") throw new Error("klip adı zorunlu");
      // Manifestte başlangıç duruşu tanımlı klip (asker_yarali_3b → yarali): panel listesi de bilsin
      const poz = ham.poz ?? this.klipPozu(ham.klip);
      k = {
        islem: "oynat",
        id: ham.id ?? kimlikUret("fg"),
        klip: ham.klip,
        azimut: ((Number(ham.azimut ?? 0) % 360) + 540) % 360 - 180,
        yukseklik: sinirla(Number(ham.yukseklik ?? -4), -45, 45),
        olcek: sinirla(Number(ham.olcek ?? 1), 0.1, 10),
        dongu: ham.dongu,
        yansit: Boolean(ham.yansit),
        ...(poz && poz !== "ayakta" ? { poz } : {}),
        ...(typeof ham.yaninda === "string" && this.aktifler.has(ham.yaninda) ? { yaninda: ham.yaninda } : {}),
      };
      // Yanına yerleşen figür paneldeki listede aynı yönde görünsün
      if (k.yaninda) k.azimut = this.aktifler.get(k.yaninda)?.azimut ?? k.azimut;
      this.aktifler.set(k.id, k);
      this.gunluk.bilgi(`Figür oynat: ${k.klip} @ ${k.azimut}°${k.poz ? ` (${k.poz})` : ""} (${k.id})`);
    } else if (ham.islem === "poz") {
      if (!ham.id) throw new Error("poz için id zorunlu");
      if (!ham.poz) throw new Error("poz zorunlu");
      const mevcut = this.aktifler.get(ham.id);
      if (!mevcut) throw new Error("figür sahnede değil");
      // Aktif listede duruş güncellenir; oynatıcıya yalnızca poz komutu gider
      if (ham.poz === "ayakta") delete mevcut.poz;
      else mevcut.poz = ham.poz;
      k = { islem: "poz", id: ham.id, poz: ham.poz };
      this.gunluk.bilgi(`Figür duruş: ${mevcut.klip} → ${ham.poz} (${ham.id})`);
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
      if (!dongu && !f.poz) this.aktifler.delete(id);
    }
  }

  /** Manifestte klibe tanımlı başlangıç duruşu (`poz`), yoksa undefined. */
  klipPozu(ad: string): FigurPozu | undefined {
    const t = this.manifestKlipleri()[ad];
    const p = t?.poz;
    return typeof p === "string" && POZLAR.includes(p as FigurPozu) ? (p as FigurPozu) : undefined;
  }

  private manifestKlipleri(): Record<string, Record<string, unknown>> {
    for (const klasor of this.icerikKlasorleri) {
      const yol = join(klasor, "manifest.json");
      if (!existsSync(yol)) continue;
      try {
        return (JSON.parse(readFileSync(yol, "utf8")) as { klipler?: Record<string, Record<string, unknown>> }).klipler ?? {};
      } catch {
        return {};
      }
    }
    return {};
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
