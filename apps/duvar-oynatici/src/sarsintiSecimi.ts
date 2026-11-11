/**
 * Sarsıntı (patlamada tuvalin titremesi) kademesi: `?sarsinti=kapali|hafif|tam` > yerel kayıt > "hafif".
 *
 * 8 Kasım değerlendirmesi: sarsıntı bütün tuvali ve 3B tuvali kaydırıyor, yani izleyicinin kontrol etmediği bir "dünya
 * sarsıntısı". Projeksiyon odası araştırması (vection) bunun rahatsızlık ve yön kaybı yapabileceğini söylüyor; yerde
 * yaralıyla uğraşan öğrenci için istenmeyebilir. Eğitmen panelden (Sistem › Oynatıcı ayarları) kapatır ya da tam açar;
 * varsayılan hafif (genlik %35). Kalite gibi tek yerde çözülür ve yerel kayıtta kalır.
 */
export type Sarsinti = "kapali" | "hafif" | "tam";

const KADEMELER: readonly Sarsinti[] = ["kapali", "hafif", "tam"];
export const SARSINTI_VARSAYILAN: Sarsinti = "hafif";
/** Genlik çarpanı (tuval piksel kaydırması bununla çarpılır). */
export const SARSINTI_CARPANI: Record<Sarsinti, number> = { kapali: 0, hafif: 0.35, tam: 1 };

export function sarsintiSec(param: string | null, kayit: Pick<Storage, "getItem" | "setItem">): Sarsinti {
  const gecerli = (d: string | null) => KADEMELER.find((k) => k === d) ?? null;
  const elle = gecerli(param);
  if (elle) {
    try {
      kayit.setItem("sarsinti", elle);
    } catch {
      /* yerel kayıt kapalı: yalnız bu açılış */
    }
    return elle;
  }
  try {
    return gecerli(kayit.getItem("sarsinti")) ?? SARSINTI_VARSAYILAN;
  } catch {
    return SARSINTI_VARSAYILAN;
  }
}
