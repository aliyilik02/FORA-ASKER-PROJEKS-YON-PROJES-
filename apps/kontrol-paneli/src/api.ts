/** Köprü sunucusu HTTP istemcisi. */
import type { BaglantiDurumu, Bolge, CatismaAyarlari, EfektIstegi, FigurKomutu, IzliMermiAyarlari, KlipOzeti, MakroDurumu, Oda, Oda2Ayarlari, Olay, OnAyar, OrnekDurumu, OrtamAyarlari, OrtamIsigi, Safha, Senaryo, SenaryoAdimi, SenaryoDurumu, SifirlamaKaynagi, SifirlamaYaniti, SimulasyonDurumu, Tatbikat, TcccOzeti, TekrarDurumu, UnrealIstekKaydi } from "./tipler";

async function istek<T>(yol: string, yontem: string, govde?: unknown): Promise<T> {
  const yanit = await fetch(`/api${yol}`, {
    method: yontem,
    headers: govde !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: govde !== undefined ? JSON.stringify(govde) : undefined,
  });
  const veri = await yanit.json().catch(() => ({}));
  if (!yanit.ok) throw new Error((veri as { hata?: string }).hata ?? `HTTP ${yanit.status}`);
  return veri as T;
}

export const api = {
  durum: () => istek<SimulasyonDurumu>("/durum", "GET"),
  baglanti: () => istek<BaglantiDurumu>("/baglanti", "GET"),
  gunluk: () => istek<Array<{ seviye: "bilgi" | "uyari" | "hata"; mesaj: string; zaman: number }>>("/gunluk", "GET"),
  yenidenSenkron: () => istek<{ tamam: boolean }>("/yeniden-senkron", "POST"),
  /** Temel sahne: figürler, efektler, çatışma, izli mermi, helikopter, senaryo oynatımı; ortam ve bölge kalır. */
  sahneSifirla: (kaynak: SifirlamaKaynagi = "panel") => istek<SifirlamaYaniti>("/sahne/sifirla", "POST", { kaynak }),
  unrealSonIstekler: () => istek<UnrealIstekKaydi[]>("/unreal/son-istekler", "GET"),
  ornekDurum: () => istek<OrnekDurumu>("/ornek/durum", "GET"),
  ornekBaslat: () => istek<OrnekDurumu>("/ornek/baslat", "POST"),
  ornekDurdur: () => istek<OrnekDurumu>("/ornek/durdur", "POST"),
  klipler: () => istek<KlipOzeti[]>("/klipler", "GET"),
  figurler: () => istek<Array<FigurKomutu & { id: string }>>("/figurler", "GET"),
  figur: (k: FigurKomutu) => istek<{ komut: FigurKomutu & { id: string }; aktifler: Array<FigurKomutu & { id: string }> }>("/figur", "POST", k),
  odaSec: (oda: Oda) => istek<SimulasyonDurumu>("/oda", "PUT", { oda }),
  bolgeSec: (bolge: Bolge) => istek<SimulasyonDurumu>("/bolge", "PUT", { bolge }),
  ortam: (k: Partial<OrtamAyarlari>) => istek<SimulasyonDurumu>("/ortam", "PATCH", k),
  isik: (k: Partial<OrtamIsigi>) => istek<SimulasyonDurumu>("/isik", "PATCH", k),
  izliMermi: (k: Partial<IzliMermiAyarlari>) => istek<SimulasyonDurumu>("/izli-mermi", "PATCH", k),
  oda2: (k: Partial<Oda2Ayarlari>) => istek<SimulasyonDurumu>("/oda2", "PATCH", k),
  catisma: (k: Partial<CatismaAyarlari>) => istek<SimulasyonDurumu>("/catisma", "PATCH", k),
  efekt: (e: EfektIstegi) => istek<{ tamam: boolean }>("/efekt", "POST", e),

  senaryolar: () => istek<Senaryo[]>("/senaryolar", "GET"),
  senaryoKaydet: (s: Partial<Senaryo>) => istek<Senaryo>("/senaryolar", "POST", s),
  senaryoSil: (id: string) => istek<{ tamam: boolean }>(`/senaryolar/${id}`, "DELETE"),
  senaryoYukle: (id: string) => istek<SenaryoDurumu>("/senaryo/yukle", "POST", { id }),
  senaryoOynat: () => istek<SenaryoDurumu>("/senaryo/oynat", "POST"),
  senaryoDuraklat: () => istek<SenaryoDurumu>("/senaryo/duraklat", "POST"),
  senaryoDur: () => istek<SenaryoDurumu>("/senaryo/dur", "POST"),
  /** `bekle_onay` adımında bekleyen senaryoyu sürdürür. */
  senaryoDevam: () => istek<SenaryoDurumu>("/senaryo/devam", "POST"),
  /** Tatbikat olay günlüğü (AAR). */
  olaylar: (f: { gun?: string; tatbikat?: string; son?: number } = {}) => {
    const q = new URLSearchParams();
    if (f.gun) q.set("gun", f.gun);
    if (f.tatbikat) q.set("tatbikat", f.tatbikat);
    if (f.son) q.set("son", String(f.son));
    const s = q.toString();
    return istek<Olay[]>(`/olaylar${s ? `?${s}` : ""}`, "GET");
  },
  olaylarGunler: () => istek<{ gunler: string[]; tatbikatlar: Tatbikat[]; aktif: Tatbikat | null }>("/olaylar/gunler", "GET"),
  olayNot: (metin: string) => istek<Olay>("/olay/not", "POST", { metin }),
  tatbikatBaslat: (ad?: string) => istek<Tatbikat>("/tatbikat/baslat", "POST", { ad }),
  tatbikatBitir: () => istek<{ tatbikat: Tatbikat | null }>("/tatbikat/bitir", "POST"),
  olaylarOzet: (tatbikat: string) => istek<TcccOzeti>(`/olaylar/ozet?tatbikat=${encodeURIComponent(tatbikat)}`, "GET"),
  /** Tatbikat komut akışını duvara yeniden gönderir (AAR tekrar oynatma); hız 0,25–4. */
  tekrarBaslat: (tatbikat: string, hiz = 1) => istek<TekrarDurumu>("/tekrar/baslat", "POST", { tatbikat, hiz }),
  tekrarDur: () => istek<{ durdu: boolean }>("/tekrar/dur", "POST"),
  /** Makro (eğitmen dizisi): köprüde zamanlanır, tablet kapansa da sürer. */
  makro: (ad: string, adimlar: SenaryoAdimi[]) => istek<MakroDurumu>("/makro", "POST", { ad, adimlar }),
  makroDur: () => istek<{ durdu: boolean }>("/makro", "DELETE"),
  safha: (safha: Safha) => istek<SimulasyonDurumu>("/safha", "PUT", { safha }),
  /** `tamam: false` + `uyari`: adım uygulanamadı (ör. figür sahnede değil); eğitmene bildirim olarak gösterilir. */
  adimTetikle: (senaryoId: string, adimId: string) => istek<{ tamam: boolean; uyari?: string }>("/senaryo/adim-tetikle", "POST", { senaryoId, adimId }),

  onAyarlar: () => istek<OnAyar[]>("/on-ayarlar", "GET"),
  onAyarKaydet: (ad: string) => istek<OnAyar>("/on-ayarlar", "POST", { ad }),
  onAyarYukle: (id: string) => istek<SimulasyonDurumu>(`/on-ayarlar/${id}/yukle`, "POST"),
  onAyarSil: (id: string) => istek<{ tamam: boolean }>(`/on-ayarlar/${id}`, "DELETE"),
};
