/** Köprü sunucusu HTTP istemcisi. */
import type {
  BaglantiDurumu,
  Bolge,
  CatismaAyarlari,
  EfektIstegi,
  FigurKomutu,
  KlipOzeti,
  IzliMermiAyarlari,
  Oda,
  Oda2Ayarlari,
  OnAyar,
  OrnekDurumu,
  OrtamAyarlari,
  OrtamIsigi,
  Senaryo,
  SenaryoDurumu,
  SimulasyonDurumu,
  UnrealIstekKaydi,
} from "./tipler";

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
  sahneSifirla: () => istek<{ tamam: boolean; durum: SimulasyonDurumu }>("/sahne/sifirla", "POST"),
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
  adimTetikle: (senaryoId: string, adimId: string) => istek<{ tamam: boolean }>("/senaryo/adim-tetikle", "POST", { senaryoId, adimId }),

  onAyarlar: () => istek<OnAyar[]>("/on-ayarlar", "GET"),
  onAyarKaydet: (ad: string) => istek<OnAyar>("/on-ayarlar", "POST", { ad }),
  onAyarYukle: (id: string) => istek<SimulasyonDurumu>(`/on-ayarlar/${id}/yukle`, "POST"),
  onAyarSil: (id: string) => istek<{ tamam: boolean }>(`/on-ayarlar/${id}`, "DELETE"),
};
