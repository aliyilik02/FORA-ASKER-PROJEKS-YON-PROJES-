/** Figür listesi üzerinde paylaşılan seçimler (canlı sahne kartı, figür paneli, klavye kısayolu). */
import type { FigurKomutu } from "./tipler";

type Aktif = FigurKomutu & { id: string };

/** Vurulabilecek askerler: 3B asker klipleri, henüz yaralı olmayanlar (koşan/yürüyen ve sıhhiyeci hariç). */
export function vurulabilirAskerler(figurler: Aktif[]): Aktif[] {
  return figurler.filter((f) => /^asker_(bekleyen|taktik|diz_cokmus|kamuflaj)/.test(f.klip ?? "") && f.poz !== "yarali");
}

/** Panel yönüne (0–359, saat yönünde) en yakın figür. */
export function yoneEnYakin(figurler: Aktif[], yon: number): Aktif | undefined {
  const hedefAz = ((yon + 180) % 360) - 180;
  const fark = (a: number) => Math.abs((((a - hedefAz) % 360) + 540) % 360 - 180);
  return [...figurler].sort((a, b) => fark(a.azimut ?? 0) - fark(b.azimut ?? 0))[0];
}
