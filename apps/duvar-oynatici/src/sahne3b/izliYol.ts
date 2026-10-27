/**
 * İzli mermi yol, arazi aşımı ve görünürlük yardımcıları (saf, THREE'siz; testli).
 *
 * Koordinatlar sahne sözleşmesinde (uzay.ts): izleyicinin başı başlangıç noktasında, azimut 0 = −z, sağa +x.
 * Azimut yönünde döndürme yukarıdan bakınca saat yönüdür (−z'den +x'e).
 */

/** Kaynak (s) → hedef (h) doğrusu; yükseklikler dâhil. Çağıran yeniden kullanır (kare başına nesne üretilmez). */
export interface IzliYol {
  sx: number;
  sy: number;
  sz: number;
  hx: number;
  hy: number;
  hz: number;
}

const RAD = Math.PI / 180;

/**
 * Klasik izli mermi doğrultusu: kaynak → hedef doğrusu, yatayda bir eksen noktası P etrafında `yon` derece
 * döndürülür (yükseklikler korunur, `y` yerinde değişir). P, doğru üzerinde izleyiciye yatay `eksenMesafe`
 * uzaklıktaki ilk noktadır (kaynak tarafından); doğru o kadar yaklaşmıyorsa P = hedef.
 *
 *  - yon 0: değişmez (mermi izleyiciye/yakına gelir).
 *  - yon ±90: doğru izleyicinin `eksenMesafe` önünden yana dik geçer; kaynak yana kayar (uzak kalır).
 *  - yon > 0 doğrultuyu saat yönünde çevirir: mermi duvarda sağdan sola akar; yon < 0 soldan sağa.
 */
export function izliYolu(y: IzliYol, yon: number, eksenMesafe: number): IzliYol {
  if (yon === 0) return y;
  const dx = y.hx - y.sx;
  const dz = y.hz - y.sz;
  const dd = dx * dx + dz * dz;
  let px = y.hx;
  let pz = y.hz;
  if (dd > 1e-9) {
    // |S + t·D| = e → t²·|D|² + 2t·(S·D) + |S|² − e² = 0; kaynak tarafındaki kök
    const b = y.sx * dx + y.sz * dz;
    const c = y.sx * y.sx + y.sz * y.sz - eksenMesafe * eksenMesafe;
    const disk = b * b - dd * c;
    if (disk >= 0) {
      const t = (-b - Math.sqrt(disk)) / dd;
      if (t >= 0 && t <= 1) {
        px = y.sx + dx * t;
        pz = y.sz + dz * t;
      }
    }
  }
  const cs = Math.cos(yon * RAD);
  const sn = Math.sin(yon * RAD);
  // Azimut yönünde döndürme (P'ye göreli): x' = x·cos − z·sin, z' = x·sin + z·cos
  const kx = y.sx - px;
  const kz = y.sz - pz;
  y.sx = px + kx * cs - kz * sn;
  y.sz = pz + kx * sn + kz * cs;
  const hx = y.hx - px;
  const hz = y.hz - pz;
  y.hx = px + hx * cs - hz * sn;
  y.hz = pz + hx * sn + hz * cs;
  return y;
}

/** Arazi denetimi: kaynak → hedef doğrusu boyunca örnek sayısı (200 m'lik yolda ~15 m arayla; hedef ucu hariç). */
const ARAZI_ORNEK_SAYISI = 12;

/**
 * Kaynağın kaç metre yükseltilmesi gerektiği (≥ 0) ki kaynak → hedef doğrusu araziyi aşsın: uzak kaynak bir sırtın
 * ya da tepenin arkasında kalırsa mermi doğar doğmaz araziye "çarpıp" kaybolur ya da tepenin içinde görünmez akar.
 * Doğru boyunca örneklerde zemin + pay·(1 − f) altında kalan yer varsa kaynak, orayı aşacak kadar kalkar (hedef ucu
 * sabit; pay hedefe doğru sıfıra iner, yere çarpacak mermi etkilenmez). Kaynak yerden ≥ 0,8 m, hedef zeminde ya da
 * üstündeyse düz zeminde sonuç 0'dır (arazi kapalıyken davranış değişmez).
 */
export function kaynakYukseltmesi(y: IzliYol, zemin: (x: number, z: number) => number, pay = 0.6, enCok = 80): number {
  let yukselt = 0;
  for (let i = 1; i <= ARAZI_ORNEK_SAYISI; i++) {
    const f = i / (ARAZI_ORNEK_SAYISI + 1.5);
    const x = y.sx + (y.hx - y.sx) * f;
    const z = y.sz + (y.hz - y.sz) * f;
    const h = y.sy + (y.hy - y.sy) * f;
    // Kaynak Δ kalkınca bu noktadaki yükseklik (1 − f)·Δ artar
    const gerek = (zemin(x, z) - h) / (1 - f) + pay;
    if (gerek > yukselt) yukselt = gerek;
  }
  return Math.min(enCok, yukselt);
}

/**
 * p0 + t·d doğru parçasının (t ∈ [0, 1]) başlangıca (izleyicinin başı) en yakın noktasının parametresi.
 * Ses hızı üstü "çat" sesi için kare içindeki en yakın geçiş buradan bulunur.
 */
export function enYakinParametre(x0: number, y0: number, z0: number, dx: number, dy: number, dz: number): number {
  const dd = dx * dx + dy * dy + dz * dz;
  if (dd < 1e-12) return 0;
  const t = -(x0 * dx + y0 * dy + z0 * dz) / dd;
  return t <= 0 ? 0 : t > 1 ? 1 : t;
}

/**
 * Ses hızı üstü "çat" için: mermi bu karede (p0 → p0 + d) başın `esik` metre yakınından geçtiyse en yakın noktanın
 * parametresi (0 ≤ t < 1), değilse −1. En yakın nokta karenin sonundaysa (t = 1) mermi hâlâ yaklaşıyordur: geçiş
 * sonraki karede aranır; yere çarpacak mermi hiç geçmez (çarpma sesi yeter, iki ses üst üste binmez).
 */
export function yakinGecis(x0: number, y0: number, z0: number, dx: number, dy: number, dz: number, esik: number): number {
  const t = enYakinParametre(x0, y0, z0, dx, dy, dz);
  if (t >= 1) return -1;
  const x = x0 + dx * t;
  const y = y0 + dy * t;
  const z = z0 + dz * t;
  return x * x + y * y + z * z <= esik * esik ? t : -1;
}

/** 1080p duvarda (90° yatay görüş, 1920 px) bir pikselin açısı ≈ 0,054° (radyan). Ölçülene kadar varsayılan. */
export const VARSAYILAN_PIKSEL_ACISI = 0.054 * RAD;

/**
 * Uzaklığa göre iz kalınlığı (m). Uzaktaki iz piksel altına inip titremesin diye görünür genişlik en az
 * `enAzPiksel` piksel tutulur; yakında temel kalınlık geçerlidir.
 */
export function izKalinligi(mesafe: number, taban: number, pikselAcisi: number, enAzPiksel = 1.5): number {
  return Math.max(taban, mesafe * pikselAcisi * enAzPiksel);
}

/** Kalınlık arttıkça iz biraz da uzar (uzakta çizgi gibi okunur); en çok 2,2 kat. */
export function izUzunlukCarpani(kalinlikOrani: number): number {
  return Math.min(2.2, 1 + 0.12 * Math.max(0, kalinlikOrani - 1));
}
