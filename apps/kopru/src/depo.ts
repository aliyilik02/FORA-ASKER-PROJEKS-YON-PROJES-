/**
 * Ön ayar ve senaryo kalıcılığı – yerel diskte JSON dosyaları (§10: internet gerektirmez).
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { FigurKomutu, OnAyar, Senaryo, SimulasyonDurumu } from "./tipler.js";

/** Köprü kapanıp açılınca sahnenin kaldığı yerden devam etmesi için son durum (bölge, ortam, oda, figürler). */
export interface SonDurum {
  zaman: number;
  durum: Omit<SimulasyonDurumu, "sonEfektler">;
  figurler: Array<FigurKomutu & { id: string }>;
}

function dosyaOku<T>(yol: string, varsayilan: T): T {
  if (!existsSync(yol)) return varsayilan;
  try {
    return JSON.parse(readFileSync(yol, "utf8")) as T;
  } catch {
    return varsayilan;
  }
}

function dosyaYaz(yol: string, veri: unknown) {
  writeFileSync(yol, JSON.stringify(veri, null, 2), "utf8");
}

export function kimlikUret(onek: string): string {
  return `${onek}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export class VeriDeposu {
  private readonly onAyarDosyasi: string;
  private readonly senaryoDosyasi: string;
  private readonly sonDurumDosyasi: string;

  constructor(klasor: string, varsayilanSenaryolar: Senaryo[] = []) {
    mkdirSync(klasor, { recursive: true });
    this.onAyarDosyasi = join(klasor, "on-ayarlar.json");
    this.senaryoDosyasi = join(klasor, "senaryolar.json");
    this.sonDurumDosyasi = join(klasor, "son-durum.json");
    if (!existsSync(this.senaryoDosyasi) && varsayilanSenaryolar.length) {
      dosyaYaz(this.senaryoDosyasi, varsayilanSenaryolar);
    } else if (varsayilanSenaryolar.length) {
      // Sürüm güncellemesiyle gelen yeni örnekler mevcut kuruluma da eklenir; eğitmenin kendi senaryoları ve
      // düzenlediği (aynı kimlikli) örnekler olduğu gibi kalır.
      const mevcut = dosyaOku<Senaryo[]>(this.senaryoDosyasi, []);
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
    const d = dosyaOku<SonDurum | null>(this.sonDurumDosyasi, null);
    if (!d || typeof d.zaman !== "number" || !d.durum) return null;
    if (Date.now() - d.zaman > enCokYasMs) return null;
    return { zaman: d.zaman, durum: d.durum, figurler: Array.isArray(d.figurler) ? d.figurler : [] };
  }

  onAyarlar(): OnAyar[] {
    return dosyaOku<OnAyar[]>(this.onAyarDosyasi, []);
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
    return dosyaOku<Senaryo[]>(this.senaryoDosyasi, []);
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
