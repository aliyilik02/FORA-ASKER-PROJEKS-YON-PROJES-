/**
 * Gece projeksiyon modu (8 Kasım, C-19): projektör siyahı yansıtamaz; fiziksel doğru gece (ay ışığı 0,05–0,3 lux eşdeğeri)
 * duvarda gri çamura döner. "projeksiyon" kipinde gece sahnesinde 3B tuvale CSS filtre uygulanır: gölge tabanı yukarı
 * (parlaklık), kontrast hafif aşağı; gündüz hiçbir şey değişmez. `?gece=fiziksel|projeksiyon` > yerel kayıt > fiziksel.
 * Panel Sistem › Oynatıcı ayarları. Sahada ölçüm sonrası katsayılar ayarlanır.
 */
export type GeceModu = "fiziksel" | "projeksiyon";

const KADEMELER: readonly GeceModu[] = ["fiziksel", "projeksiyon"];
/** Bu ortam ışığının (0–1) altında gece sayılır; filtre 0'a doğru güçlenir. */
export const GECE_ESIGI = 0.45;

export function geceModuSec(param: string | null, kayit: Pick<Storage, "getItem" | "setItem">): GeceModu {
  const gecerli = (d: string | null) => KADEMELER.find((k) => k === d) ?? null;
  const elle = gecerli(param);
  if (elle) {
    try {
      kayit.setItem("gece", elle);
    } catch {
      /* yerel kayıt kapalı */
    }
    return elle;
  }
  try {
    return gecerli(kayit.getItem("gece")) ?? "fiziksel";
  } catch {
    return "fiziksel";
  }
}

/** CSS filtre dizesi: gündüz (ışık ≥ eşik) boş; gece, karanlık arttıkça parlaklık ↑ (en çok ×1,3) ve kontrast ↓ (en az ×0,88). */
export function geceFiltresi(modu: GeceModu, isik: number): string {
  if (modu !== "projeksiyon" || !Number.isFinite(isik) || isik >= GECE_ESIGI) return "";
  const t = Math.min(1, Math.max(0, 1 - isik / GECE_ESIGI));
  return `brightness(${(1 + 0.3 * t).toFixed(3)}) contrast(${(1 - 0.12 * t).toFixed(3)})`;
}
