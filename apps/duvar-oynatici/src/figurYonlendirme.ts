/**
 * Köprüden gelen figür "oynat" komutunun yolu (main.ts `figurKomutu`); saf, testli.
 *
 * 4 Kasım 2026 hatası: oynatıcı yeni açıldığında WebSocket, manifest isteğinden ÖNCE kurulabiliyor; köprü bağlanır
 * bağlanmaz aktif figürleri yollar, `klipler.tanim()` henüz boş olduğundan komut 2B yola düşüp sessizce kayboluyordu
 * ("figür 0", aynı komutlar yeniden gönderilince yükleniyordu). Manifest gelmeden gelen her figür kuyruğa alınır.
 */
export type FigurYolu = "manifest_bekle" | "ucb" | "ucb_bekle" | "ikib" | "yok";

export function figurYolu(a: {
  manifestYuklendi: boolean;
  /** Klip tanımının tipi; tanım yoksa undefined. */
  tip: string | undefined;
  ucAktifOlabilir: boolean;
  sahneHazir: boolean;
  gecisBekliyor: boolean;
}): FigurYolu {
  if (!a.manifestYuklendi) return "manifest_bekle";
  if (a.tip === "model") {
    if (a.sahneHazir && !a.gecisBekliyor) return "ucb";
    // 3B sahne henüz hazır değil (ilk panorama yükleniyor) ya da bölge geçişi takas bekliyor: sahne hazır olunca
    return a.ucAktifOlabilir ? "ucb_bekle" : "yok";
  }
  return a.tip ? "ikib" : "yok";
}
