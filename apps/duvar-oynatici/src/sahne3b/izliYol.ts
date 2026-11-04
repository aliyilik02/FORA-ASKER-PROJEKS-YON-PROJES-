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
 *  - yon 0: değişmez (mermiler seçilen duvarın uzağından izleyiciye doğru gelir).
 *  - yon ±90: kaynak komşu duvarın yönüne kayar (uzak kalır), doğru izleyicinin `eksenMesafe` önünden yana dik
 *    geçer: mermiler komşu duvar yönünden gelip seçilen duvarın önünden yandan geçer (yandan ateş böyle görünür).
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

/** Kaynak yükseltmesinin sınırları: yerel zeminden en çok bu kadar (m) ve izleyiciden bakınca o yöndeki arazi ufkunun en çok bu kadar üstü (derece). */
export const KAYNAK_YERDEN_EN_COK = 12;
export const KAYNAK_UFUK_PAYI = 1.5;

/**
 * Uzak mermi kaynağının yüksekliği (y, m). `y.sy` taban yükseklik (zeminin 0,8–4 m üstü), hedef ucu hazır verilir.
 * Doğru araziyi aşsın diye kaynak yükselir (kaynakYukseltmesi), ama en çok yerel zeminden 12 m'ye ve izleyiciden
 * bakınca o yöndeki arazi ufkunun 1,5° üstüne kadar: dağlıkta mermiler gökten (50–80 m'den, uçaktan atılır gibi)
 * gelmez, sırtın hemen üstünden doğar. Sınır yetmezse doğru kapalı kalır: mermi yine atılır, araziye engellendiği
 * yerde (yamaçta) çarpar. Kaynak yerel zeminden 12 m'yi hiç aşmaz (derin çukurda taban da iner). Düz zeminde taban
 * aynen döner. `ufukTanjanti`: o yöndeki arazi ufkunun yükselme tanjantı (AraziUfku).
 */
export function izliKaynakYuksekligi(y: IzliYol, zemin: (x: number, z: number) => number, ufukTanjanti: number): number {
  const yer = zemin(y.sx, y.sz);
  const ust = yer + KAYNAK_YERDEN_EN_COK;
  const gerek = kaynakYukseltmesi(y, zemin);
  if (gerek <= 0) return Math.min(y.sy, ust);
  const tavan = Math.min(ust, Math.hypot(y.sx, y.sz) * Math.tan(Math.atan(ufukTanjanti) + KAYNAK_UFUK_PAYI * RAD));
  return Math.min(y.sy + Math.min(gerek, Math.max(0, tavan - y.sy)), ust);
}

/** Sırta taşınan kaynağın izleyiciden en yakın mesafesi (m): düşman ateşi bundan yakından başlamaz. */
export const SIRT_EN_YAKIN = 80;
/** Sırttaki kaynağın zeminden yüksekliği (m): sırt çizgisinde yatan/çömelen atıcının namlusu. */
export const SIRT_KAYNAK_YUKSEKLIGI = 1.5;
/** Sırt aramasında doğru boyunca örnek aralığı (m). */
const SIRT_ADIM = 4;

/**
 * Sırt üstüne taşıma (kullanıcı kararı): kaynak → hedef doğrusu (sınırlı yükseltmeden sonra da) izleyiciden ≥ 80 m'de
 * araziyle kesiliyorsa kaynak, doğru üzerinde ≥ 80 m'deki sırtın tepesine taşınır: hedeften bakınca en yüksek görünen
 * nokta (yükselme açısı en büyük; eşitlikte uzak olan), kaynak orada zeminin 1,5 m üstünde. Düşman sırt çizgisinden
 * ateş eder: namlu parıltısı sırtta görünür, mermi arka yamaca çarpmadan izleyiciye ulaşır (kırsal hibritte orta
 * duvardaki izlerin yalnız ~%17–25'i izleyicinin 60 m yakınına ulaşıyordu). Kaynak yerinde (y.sx, y.sz, y.sy) değişir;
 * taşındıysa true. Çağıran sonra izliKaynakYuksekligi'ni yeniden uygular: daha yakın bir tümsek hâlâ kapatıyorsa kaynak
 * sırt zemininden en çok 12 m kalkar. Doğru açıksa ya da yalnız 80 m'den yakın bir tümsek kapatıyorsa dokunmaz (kaynak
 * yakına çekilmez; mermi o tümseğe, yani yine yakına düşer).
 */
export function sirtaTasi(y: IzliYol, zemin: (x: number, z: number) => number): boolean {
  const dx = y.sx - y.hx;
  const dz = y.sz - y.hz;
  const uzunluk = Math.hypot(dx, dz);
  let uzakEngel = false;
  let enIyi = -Infinity;
  let bx = 0;
  let bz = 0;
  let bZemin = 0;
  for (let d = SIRT_ADIM; d < uzunluk; d += SIRT_ADIM) {
    const f = d / uzunluk;
    const x = y.hx + dx * f;
    const z = y.hz + dz * f;
    if (Math.hypot(x, z) < SIRT_EN_YAKIN) continue;
    const g = zemin(x, z);
    if (g > y.hy + (y.sy - y.hy) * f) uzakEngel = true;
    const egim = (g - y.hy) / d;
    if (egim >= enIyi) {
      enIyi = egim;
      bx = x;
      bz = z;
      bZemin = g;
    }
  }
  if (!uzakEngel) return false;
  y.sx = bx;
  y.sz = bz;
  y.sy = bZemin + SIRT_KAYNAK_YUKSEKLIGI;
  return true;
}

/** Arazi ufku: azimut kovası (derece), örnek uzaklıkları (m) ve önbellek ömrü (sn). */
const UFUK_KOVA = 2;
const UFUK_KOVA_SAYISI = 360 / UFUK_KOVA;
const UFUK_EN_YAKIN = 20;
const UFUK_EN_UZAK = 320;
const UFUK_ADIM = 10;

/**
 * İzleyicinin gözünden (başlangıç noktası, y = 0) arazi ufku: her 2°'lik azimut kovası için zeminin en büyük yükselme
 * açısının tanjantı (20–320 m, 10 m arayla örneklenir; uzak mermi kaynakları 150–300 m'de). Kova başına önbellekte,
 * `omur` saniye geçerli (`ilerlet` saati sürer): arazi değişince (bölge, görüş koridoru, krater) kendiliğinden tazelenir.
 * Kare başına nesne üretilmez.
 */
export class AraziUfku {
  private readonly tanjantlar = new Float64Array(UFUK_KOVA_SAYISI);
  private readonly zamanlar = new Float64Array(UFUK_KOVA_SAYISI).fill(-Infinity);
  private saat = 0;

  constructor(private readonly omur = 2) {}

  ilerlet(dt: number) {
    this.saat += dt;
  }

  /** `azimut` (sahne, derece) yönünde ufkun yükselme tanjantı (açı = atan). Düz zeminde hafif eksi (−1,7 / 320 m). */
  tanjant(azimut: number, zemin: (x: number, z: number) => number): number {
    const k = (((Math.floor((azimut + 180) / UFUK_KOVA) % UFUK_KOVA_SAYISI) + UFUK_KOVA_SAYISI) % UFUK_KOVA_SAYISI);
    if (this.saat - this.zamanlar[k] < this.omur) return this.tanjantlar[k];
    const a = ((k + 0.5) * UFUK_KOVA - 180) * RAD;
    const yx = Math.sin(a);
    const yz = -Math.cos(a);
    let enCok = -Infinity;
    for (let d = UFUK_EN_YAKIN; d <= UFUK_EN_UZAK; d += UFUK_ADIM) {
      const t = zemin(yx * d, yz * d) / d;
      if (t > enCok) enCok = t;
    }
    this.tanjantlar[k] = enCok;
    this.zamanlar[k] = this.saat;
    return enCok;
  }
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
