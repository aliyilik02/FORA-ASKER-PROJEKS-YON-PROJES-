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

/**
 * Kaldırılan eski model klipleri → yeni Meshy modelleri (3 Kasım 2026: Quaternius/SWAT askerler, eski tanklar silindi).
 * Eğitmenin kaydettiği senaryolar ve açılışta geri yüklenen durum eski adları taşıyabilir; oynatıcı tanımsız klibi
 * sessizce atlar ("figür sahneye gelmedi"). Manifestte bulunmayan ad burada çevrilir, günlüğe bir kez yazılır.
 */
export const ESKI_KLIPLER: Record<string, string> = {
  asker_bekleyen: "komando_bekleyen",
  asker_taktik: "komando_bere_bekleyen",
  asker_yuruyen: "komando_yuruyen",
  asker_kosan: "komando_kosan",
  asker_diz_cokmus: "komando_diz_cokmus",
  asker_yarali_3b: "komando_yarali",
  asker_sihhiyeci: "komando_sihhiyeci",
  asker_swat: "komando_bekleyen",
  asker_kamuflaj: "komando_bekleyen",
  asker_mixamo: "komando_bekleyen",
  asker_test_ayakta: "komando_bekleyen",
  tank_eski: "tank_altay",
  tank_mbt: "tank_altay",
  tank_quaternius: "tank_altay",
};

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
    for (const f of liste) if (f && typeof f.id === "string" && f.id && typeof f.klip === "string" && f.klip) this.aktifler.set(f.id, { ...f, islem: "oynat", klip: this.klipAdiCevir(f.klip) });
  }

  private cevrilenler = new Set<string>();
  /** Manifestte olmayan eski klip adını yenisine çevirir (ESKI_KLIPLER); manifestte varsa ya da eşleme yoksa aynen döner. */
  klipAdiCevir(ad: string): string {
    const yeni = ESKI_KLIPLER[ad];
    if (!yeni || this.manifestKlipleri()[ad]) return ad;
    if (!this.cevrilenler.has(ad)) {
      this.cevrilenler.add(ad);
      this.gunluk.uyari(`Eski klip adı "${ad}" → "${yeni}" (senaryo/kayıt güncellenmeli)`);
    }
    return yeni;
  }

  /** Komutu doğrular, uygular ve yayınlar. Hatalı komutta Error fırlatır. `sessiz`: günlüğe yazmaz (sahne sıfırlaması). */
  komut(ham: FigurKomutu, sessiz = false): AktifFigur {
    if (!["oynat", "durdur", "temizle", "poz"].includes(ham.islem)) throw new Error("islem 'oynat', 'durdur', 'temizle' veya 'poz' olmalı");
    if (ham.poz !== undefined && !POZLAR.includes(ham.poz)) throw new Error(`poz ${POZLAR.join("/")} olmalı`);
    let k: AktifFigur;
    if (ham.islem === "oynat") {
      if (!ham.klip || typeof ham.klip !== "string") throw new Error("klip adı zorunlu");
      const klip = this.klipAdiCevir(ham.klip);
      // Manifestte başlangıç duruşu tanımlı klip (komando_yarali → yarali): panel listesi de bilsin
      const poz = ham.poz ?? this.klipPozu(klip);
      k = {
        islem: "oynat",
        id: ham.id ?? kimlikUret("fg"),
        klip,
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
      if (!sessiz) this.gunluk.bilgi(`Figür oynat: ${k.klip} @ ${k.azimut}°${k.poz ? ` (${k.poz})` : ""} (${k.id})`);
    } else if (ham.islem === "poz") {
      if (!ham.id) throw new Error("poz için id zorunlu");
      if (!ham.poz) throw new Error("poz zorunlu");
      const mevcut = this.aktifler.get(ham.id);
      if (!mevcut) throw new Error("figür sahnede değil");
      // Aktif listede duruş güncellenir; oynatıcıya yalnızca poz komutu gider
      if (ham.poz === "ayakta") delete mevcut.poz;
      else mevcut.poz = ham.poz;
      k = { islem: "poz", id: ham.id, poz: ham.poz };
      if (!sessiz) this.gunluk.bilgi(`Figür duruş: ${mevcut.klip} → ${ham.poz} (${ham.id})`);
    } else if (ham.islem === "durdur") {
      if (!ham.id) throw new Error("durdurmak için id zorunlu");
      k = { islem: "durdur", id: ham.id };
      this.aktifler.delete(ham.id);
      if (!sessiz) this.gunluk.bilgi(`Figür durdur: ${ham.id}`);
    } else {
      k = { islem: "temizle", id: "*" };
      this.aktifler.clear();
      if (!sessiz) this.gunluk.bilgi("Tüm figürler kaldırıldı");
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
            grup: typeof t.grup === "string" ? t.grup : undefined,
            simge: typeof t.simge === "string" ? t.simge : undefined,
            eski: t.eski === true ? true : undefined,
          }));
      } catch (hata) {
        this.gunluk.uyari(`manifest okunamadı (${yol}): ${hata instanceof Error ? hata.message : String(hata)}`);
        return [];
      }
    }
    return [];
  }
}
