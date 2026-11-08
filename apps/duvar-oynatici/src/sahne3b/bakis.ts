/**
 * Figür bakışı (8 Kasım, B-9): baş ve göğüs kemiklerine, figürün yüzünden bağımsız yön ofseti. Saf hesap; three'siz,
 * birim testli. Öncelik (FigurKatmani.bakisHedefi): düşman yönü > yaralı (sıhhiyeci her zaman yaralıya) > son patlama.
 * Yüz yerine davranış inandırıcılık verir: askerin tehdide bakması, kimsenin yaralıya bakmaması sorununu çözer.
 */
export interface Nokta {
  x: number;
  y: number;
  z: number;
}
export interface BakisAcilari {
  /** Sola/sağa (radyan; dünya yukarı ekseni etrafında, figürün yüzüne göre). */
  yaw: number;
  /** Yukarı/aşağı (radyan; pozitif yukarı). */
  pitch: number;
}

const sinirla = (v: number, s: number) => Math.max(-s, Math.min(s, v));

/**
 * Göz noktasından hedefe bakmak için yüz yönüne (`ileriYaw`, dünya yaw'ı; three'de ileri +z için yaw = atan2(x, z))
 * göre gereken yaw/pitch ofseti; eklem sınırlarıyla kırpılır (varsayılan ±70° / ±25°). Hedef tam tepede/altta ya da
 * göz noktasının üstündeyse yaw 0.
 */
export function bakisAcilari(goz: Nokta, ileriYaw: number, hedef: Nokta, maxYaw = (70 * Math.PI) / 180, maxPitch = (25 * Math.PI) / 180): BakisAcilari {
  const dx = hedef.x - goz.x;
  const dz = hedef.z - goz.z;
  const dy = hedef.y - goz.y;
  const yatay = Math.hypot(dx, dz);
  if (yatay < 1e-3) return { yaw: 0, pitch: 0 };
  let yaw = Math.atan2(dx, dz) - ileriYaw;
  yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
  const pitch = Math.atan2(dy, yatay);
  return { yaw: sinirla(yaw, maxYaw), pitch: sinirla(pitch, maxPitch) };
}

/** Üstel yumuşatma: `sure` saniyede farkın ~%63'ü kapanır (kare hızından bağımsız). */
export function yumusat(mevcut: number, hedef: number, dt: number, sure = 0.35): number {
  if (sure <= 0) return hedef;
  return mevcut + (hedef - mevcut) * Math.min(1, dt / sure);
}
