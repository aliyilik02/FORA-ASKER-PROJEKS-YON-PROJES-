/**
 * Ön ayar ve senaryo kalıcılığı – yerel diskte JSON dosyaları (§10: internet gerektirmez).
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import type { FigurKomutu, OnAyar, Senaryo, SimulasyonDurumu } from "./tipler.js";

/** Köprü kapanıp açılınca sahnenin kaldığı yerden devam etmesi için son durum (bölge, ortam, oda, figürler). */
export interface SonDurum {
  zaman: number;
  durum: Omit<SimulasyonDurumu, "sonEfektler">;
  figurler: Array<FigurKomutu & { id: string }>;
  /** Sahne sıfırlama nesli (SahneYoneticisi): köprü yeniden açılınca sürer, bağlı oynatıcılar boşuna temizlenmez. */
  nesil?: number;
}

/** Bozuk dosya yedeğinin adı: `<dosya>.bozuk-<zaman>.json` (aynı klasörde; eğitmen elle kurtarabilir). */
export function bozukYedekYolu(yol: string, zaman = Date.now()): string {
  return `${yol.replace(/\.json$/, "")}.bozuk-${new Date(zaman).toISOString().replace(/[:.]/g, "-")}.json`;
}

/**
 * JSON okur. Dosya bozuksa (elle düzenlerken virgül unutulmuş vb.) sessizce boş sayıp bir sonraki kayıtta üstüne
 * yazmak eğitmenin bütün senaryolarını götürürdü: bozuk dosya yedeğe kopyalanır (`bozukYedekYolu`), `uyari` çağrılır,
 * varsayılan döner. Yedek alınamazsa dosya olduğu gibi bırakılır.
 */
function dosyaOku<T>(yol: string, varsayilan: T, uyari?: (mesaj: string) => void): T {
  if (!existsSync(yol)) return varsayilan;
  try {
    return JSON.parse(readFileSync(yol, "utf8")) as T;
  } catch (hata) {
    let yedek = "";
    try {
      yedek = bozukYedekYolu(yol);
      copyFileSync(yol, yedek);
    } catch {
      yedek = "";
    }
    uyari?.(`${yol} okunamadı (${hata instanceof Error ? hata.message : String(hata)}); ${yedek ? `yedeği: ${yedek}` : "yedek alınamadı"}; varsayılanla sürülüyor`);
    return varsayilan;
  }
}

/** Atomik yazım: önce `.tmp`, sonra yeniden adlandırma; yarım kalan yazım (elektrik kesintisi) dosyayı bozmaz. */
function dosyaYaz(yol: string, veri: unknown) {
  const gecici = `${yol}.tmp`;
  writeFileSync(gecici, JSON.stringify(veri, null, 2), "utf8");
  renameSync(gecici, yol);
}

export function kimlikUret(onek: string): string {
  return `${onek}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export class VeriDeposu {
  private readonly onAyarDosyasi: string;
  private readonly senaryoDosyasi: string;
  private readonly sonDurumDosyasi: string;

  /** Bozuk dosya uyarısı (köprü günlüğüne); testlerde yakalanır. */
  uyari: ((mesaj: string) => void) | null = null;

  constructor(klasor: string, varsayilanSenaryolar: Senaryo[] = [], uyari?: (mesaj: string) => void) {
    this.uyari = uyari ?? null;
    mkdirSync(klasor, { recursive: true });
    this.onAyarDosyasi = join(klasor, "on-ayarlar.json");
    this.senaryoDosyasi = join(klasor, "senaryolar.json");
    this.sonDurumDosyasi = join(klasor, "son-durum.json");
    if (!existsSync(this.senaryoDosyasi) && varsayilanSenaryolar.length) {
      dosyaYaz(this.senaryoDosyasi, varsayilanSenaryolar);
    } else if (varsayilanSenaryolar.length) {
      // Sürüm güncellemesiyle gelen yeni örnekler mevcut kuruluma da eklenir; eğitmenin kendi senaryoları ve
      // düzenlediği (aynı kimlikli) örnekler olduğu gibi kalır.
      const mevcut = dosyaOku<Senaryo[]>(this.senaryoDosyasi, [], (u) => this.uyari?.(u));
      const eksik = varsayilanSenaryolar.filter((v) => !mevcut.some((m) => m.id === v.id));
      if (eksik.length) dosyaYaz(this.senaryoDosyasi, [...mevcut, ...eksik]);
    }
  }

  /** Son durumu yazar (durum/figür değişiminde, gecikmeli çağrılır). */
  sonDurumYaz(d: SonDurum) {
    dosyaYaz(this.sonDurumDosyasi, d);
  }

  /** Son durumu okur; `enCokYasMs`'den eskiyse (varsayılan 12 saat) yok sayar: dünkü gece sahnesi sabah açılışta gelmesin. */
  sonDurumOku(enCokYasMs = 12 * 3600 * 1000): SonDurum | null {
    const d = dosyaOku<SonDurum | null>(this.sonDurumDosyasi, null, (u) => this.uyari?.(u));
    if (!d || typeof d.zaman !== "number" || !d.durum) return null;
    // Gelecekten gelen kayıt (sistem saati geri alındı) da yok sayılır: 12 saat kuralı aksi hâlde işlemezdi
    if (Date.now() - d.zaman > enCokYasMs || d.zaman > Date.now() + 60_000) return null;
    return { zaman: d.zaman, durum: d.durum, figurler: Array.isArray(d.figurler) ? d.figurler : [], ...(typeof d.nesil === "number" ? { nesil: d.nesil } : {}) };
  }

  onAyarlar(): OnAyar[] {
    return dosyaOku<OnAyar[]>(this.onAyarDosyasi, [], (u) => this.uyari?.(u));
  }

  onAyarKaydet(onAyar: OnAyar): OnAyar {
    const liste = this.onAyarlar().filter((o) => o.id !== onAyar.id);
    liste.push(onAyar);
    dosyaYaz(this.onAyarDosyasi, liste);
    return onAyar;
  }

  onAyarSil(id: string): boolean {
    const liste = this.onAyarlar();
    const yeni = liste.filter((o) => o.id !== id);
    dosyaYaz(this.onAyarDosyasi, yeni);
    return yeni.length !== liste.length;
  }

  senaryolar(): Senaryo[] {
    return dosyaOku<Senaryo[]>(this.senaryoDosyasi, [], (u) => this.uyari?.(u));
  }

  senaryoBul(id: string): Senaryo | undefined {
    return this.senaryolar().find((s) => s.id === id);
  }

  senaryoKaydet(senaryo: Senaryo): Senaryo {
    const liste = this.senaryolar().filter((s) => s.id !== senaryo.id);
    liste.push(senaryo);
    dosyaYaz(this.senaryoDosyasi, liste);
    return senaryo;
  }

  senaryoSil(id: string): boolean {
    const liste = this.senaryolar();
    const yeni = liste.filter((s) => s.id !== id);
    dosyaYaz(this.senaryoDosyasi, yeni);
    return yeni.length !== liste.length;
  }
}
