/**
 * Tatbikat olay günlüğü — AAR (After Action Review, tatbikat sonrası değerlendirme) için (8 Kasım, C-16).
 *
 * Köprüden geçen her anlamlı olay (durum değişimi, efekt, figür komutu, senaryo adımı/durumu, sahne sıfırlaması,
 * eğitmen notu, oynatıcı hatası) zaman damgası ve tatbikat kimliğiyle `veri/olaylar/<YYYY-MM-DD>.jsonl` dosyasına satır
 * satır eklenir (JSON Lines: her satır bağımsız, yarım yazım dosyayı bozmaz). Tatbikat: senaryo baştan oynatılınca ya da
 * eğitmen "Tatbikat başlat" deyince açılır, senaryo bitince/durunca ya da "bitir" deyince kapanır; dışındaki olaylar
 * `tatbikat: null` (serbest çalışma). Panel canlı akışı WS `olay` mesajıyla alır, geçmişi `GET /api/olaylar` ile çeker,
 * `GET /api/olaylar/csv` ile dışa aktarır. Tekrar oynatma (komut akışını duvara yeniden gönderme) sonraki adım.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Olay, OlayTuru, SimulasyonDurumu, Tatbikat } from "./tipler.js";
import { BOLGE_ETIKETLERI, GUVENLI_ALAN_ETIKETLERI, HELIKOPTER_ETIKETLERI, MEVSIM_ETIKETLERI, SAFHA_ETIKETLERI, YAGIS_ETIKETLERI } from "./tipler.js";
export type { Olay, OlayTuru, Tatbikat };

type Dinleyici = (olay: Olay) => void;

const saatBicimi = (s: number) => `${String(Math.floor(s)).padStart(2, "0")}:${String(Math.round((s % 1) * 60)).padStart(2, "0")}`;

/** İki durum arasındaki eğitmene anlamlı farklar (tek satırlık ifadeler); boşsa değişiklik yok. */
export function durumFarki(eski: SimulasyonDurumu, yeni: SimulasyonDurumu): string[] {
  const f: string[] = [];
  if (eski.oda !== yeni.oda) f.push(`oda: ${yeni.oda === "oda1" ? "Oda 1" : "Oda 2"}`);
  if (eski.bolge !== yeni.bolge) f.push(`bölge: ${BOLGE_ETIKETLERI[yeni.bolge] ?? yeni.bolge}`);
  if ((eski.safha ?? "taktik_saha") !== (yeni.safha ?? "taktik_saha")) f.push(`safha: ${SAFHA_ETIKETLERI[yeni.safha ?? "taktik_saha"]}`);
  const o1 = eski.ortam;
  const o2 = yeni.ortam;
  if (o1.mevsim !== o2.mevsim) f.push(`mevsim: ${MEVSIM_ETIKETLERI[o2.mevsim] ?? o2.mevsim}`);
  if (Math.abs(o1.saat - o2.saat) > 1e-6) f.push(`saat: ${saatBicimi(o2.saat)}`);
  if (Math.abs(o1.bulut - o2.bulut) > 1e-6) f.push(`bulut: %${Math.round(o2.bulut * 100)}`);
  if (Math.abs(o1.sis - o2.sis) > 1e-6) f.push(`sis: %${Math.round(o2.sis * 100)}`);
  if (o1.yagis !== o2.yagis) f.push(`yağış: ${YAGIS_ETIKETLERI[o2.yagis] ?? o2.yagis}`);
  if (Math.abs(o1.ruzgarSiddeti - o2.ruzgarSiddeti) > 1e-6 || o1.ruzgarYonu !== o2.ruzgarYonu) f.push(`rüzgâr: %${Math.round(o2.ruzgarSiddeti * 100)} @ ${o2.ruzgarYonu}°`);
  if (Boolean(o1.simsek) !== Boolean(o2.simsek)) f.push(`şimşek: ${o2.simsek ? "açık" : "kapalı"}`);
  if (Math.abs(eski.isik.parlaklik - yeni.isik.parlaklik) > 1e-6 || eski.isik.senaryoyaBagli !== yeni.isik.senaryoyaBagli) f.push(`ışık: %${Math.round(yeni.isik.parlaklik * 100)}${yeni.isik.senaryoyaBagli ? " (otomatik)" : " (elle)"}`);
  const m1 = eski.izliMermi;
  const m2 = yeni.izliMermi;
  if (m1.aktif !== m2.aktif || (m2.aktif && (m1.cikisNoktasi !== m2.cikisNoktasi || m1.yon !== m2.yon || m1.siklik !== m2.siklik)))
    f.push(m2.aktif ? `izli mermi: açık (${["sol", "orta", "sağ"][m2.cikisNoktasi]} duvar, ${m2.yon}°, ${m2.siklik}/sn)` : "izli mermi: kapalı");
  const h1 = eski.oda2;
  const h2 = yeni.oda2;
  if (h1.helikopter !== h2.helikopter) f.push(`helikopter: ${HELIKOPTER_ETIKETLERI[h2.helikopter] ?? h2.helikopter}`);
  if (h1.guvenliAlan !== h2.guvenliAlan) f.push(`güvenli alan: ${GUVENLI_ALAN_ETIKETLERI[h2.guvenliAlan] ?? h2.guvenliAlan}`);
  const c1 = eski.catisma;
  const c2 = yeni.catisma;
  if (c1 && c2 && (c1.aktif !== c2.aktif || (c2.aktif && (Math.abs(c1.siddet - c2.siddet) > 1e-6 || c1.yon !== c2.yon || c1.dostAtes !== c2.dostAtes))))
    f.push(c2.aktif ? `çatışma: %${Math.round(c2.siddet * 100)} @ ${c2.yon}°${c2.dostAtes ? "" : ", dost ateşi kapalı"}` : "çatışma: durdu");
  return f;
}

/** CSV (noktalı virgül ayraçlı, Excel/Türkçe yerel ayar): saat; tatbikat içi süre; tatbikat; tür; özet. */
export function olaylarCsv(olaylar: Olay[], tatbikatlar: Tatbikat[] = []): string {
  const bas = new Map(tatbikatlar.map((t) => [t.id, t.baslangic]));
  const hucre = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const satirlar = ["saat;tatbikat_suresi;tatbikat;tur;ozet"];
  for (const o of olaylar) {
    const b = o.tatbikat ? (bas.get(o.tatbikat) ?? Number(o.tatbikat)) : undefined;
    const sure = b !== undefined && Number.isFinite(b) ? sureBicimi(o.zaman - b) : "";
    satirlar.push([new Date(o.zaman).toLocaleTimeString("tr-TR"), sure, o.tatbikat ?? "", o.tur, o.ozet].map(hucre).join(";"));
  }
  return `﻿${satirlar.join("\r\n")}\r\n`;
}

export function sureBicimi(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

const gunAdi = (zaman: number) => {
  const d = new Date(zaman);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export class OlayGunlugu {
  private readonly klasor: string;
  private dinleyiciler = new Set<Dinleyici>();
  /** Bellekteki son olaylar (hızlı liste; dosya tam geçmiş). */
  private son: Olay[] = [];
  private readonly kapasite = 2000;
  private tatbikatlar: Tatbikat[] = [];
  aktifTatbikat: Tatbikat | null = null;
  /** Yazım hatası (disk dolu, izin) bir kez günlüğe; sonra sessiz. */
  private yazimHatasi = false;

  constructor(
    veriKlasoru: string,
    private readonly saat: () => number = () => Date.now(),
    private readonly uyari?: (mesaj: string) => void,
  ) {
    this.klasor = join(veriKlasoru, "olaylar");
    try {
      mkdirSync(this.klasor, { recursive: true });
    } catch {
      /* okunur dosya sistemi: yalnız bellek */
    }
  }

  dinle(d: Dinleyici): () => void {
    this.dinleyiciler.add(d);
    return () => this.dinleyiciler.delete(d);
  }

  /** Olay kaydet: belleğe, dosyaya, dinleyicilere. */
  kaydet(tur: OlayTuru, ozet: string, ayrinti?: unknown): Olay {
    const olay: Olay = { zaman: this.saat(), tatbikat: this.aktifTatbikat?.id ?? null, tur, ozet, ...(ayrinti !== undefined ? { ayrinti } : {}) };
    this.son.push(olay);
    if (this.son.length > this.kapasite) this.son.shift();
    try {
      appendFileSync(join(this.klasor, `${gunAdi(olay.zaman)}.jsonl`), `${JSON.stringify(olay)}\n`, "utf8");
    } catch (hata) {
      if (!this.yazimHatasi) {
        this.yazimHatasi = true;
        this.uyari?.(`Olay günlüğü yazılamıyor (${hata instanceof Error ? hata.message : String(hata)}); yalnız bellekte tutuluyor`);
      }
    }
    for (const d of this.dinleyiciler) d(olay);
    return olay;
  }

  /** Yeni tatbikat (önceki açıksa kapanır). Kimlik = başlangıç damgası (ms, 36 tabanı). */
  tatbikatBaslat(ad: string): Tatbikat {
    if (this.aktifTatbikat) this.tatbikatBitir("yeni tatbikat başladı");
    const baslangic = this.saat();
    const t: Tatbikat = { id: baslangic.toString(36), ad, baslangic };
    this.tatbikatlar.push(t);
    if (this.tatbikatlar.length > 200) this.tatbikatlar.shift();
    this.aktifTatbikat = t;
    this.kaydet("tatbikat", `Tatbikat başladı: ${ad}`, { id: t.id, ad });
    return t;
  }

  tatbikatBitir(neden = "eğitmen bitirdi"): Tatbikat | null {
    const t = this.aktifTatbikat;
    if (!t) return null;
    this.kaydet("tatbikat", `Tatbikat bitti: ${t.ad} (${sureBicimi(this.saat() - t.baslangic)}; ${neden})`, { id: t.id, neden });
    t.bitis = this.saat();
    this.aktifTatbikat = null;
    return t;
  }

  tatbikatListesi(): Tatbikat[] {
    return [...this.tatbikatlar];
  }

  /** Günler (dosya adları, yeni → eski). */
  gunler(): string[] {
    try {
      return readdirSync(this.klasor)
        .filter((a) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(a))
        .map((a) => a.slice(0, 10))
        .sort()
        .reverse();
    } catch {
      return [];
    }
  }

  /**
   * Olay listesi: `gun` (YYYY-MM-DD; verilmezse bellek) ve/veya `tatbikat` kimliğine göre; `son` en çok N (yeni → eski
   * değil, kronolojik). Dosya bozuk satırları atlanır.
   */
  liste(filtre: { gun?: string; tatbikat?: string; son?: number } = {}): Olay[] {
    let kaynak: Olay[];
    if (filtre.gun) {
      const yol = join(this.klasor, `${filtre.gun}.jsonl`);
      kaynak = [];
      if (existsSync(yol)) {
        for (const satir of readFileSync(yol, "utf8").split("\n")) {
          if (!satir.trim()) continue;
          try {
            kaynak.push(JSON.parse(satir) as Olay);
          } catch {
            /* yarım satır */
          }
        }
      }
    } else kaynak = this.son;
    let sonuc = filtre.tatbikat ? kaynak.filter((o) => o.tatbikat === filtre.tatbikat) : kaynak;
    if (filtre.son && sonuc.length > filtre.son) sonuc = sonuc.slice(-filtre.son);
    return [...sonuc];
  }
}
