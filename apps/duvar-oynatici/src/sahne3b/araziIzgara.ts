/**
 * Yakın arazi ızgarası yardımcıları (saf, THREE'siz; testli): krater penceresi ve çukuru, pencerenin analitik
 * yüksekliğe geri dönmesi (kraterleriTemizle), yalnız pencerede köşe normalleri ve yükleme aralığı.
 *
 * Izgara n×n köşe, adım `adim` m, (−yarim, −yarim)'dan başlar; köşe indeksi iz·n + ix (x = ix·adim − yarim,
 * z = iz·adim − yarim). Bu, arazi.ts'teki PlaneGeometry(boyut, boyut, n−1, n−1).rotateX(−90°) düzenidir (satır = z).
 *
 * Neden pencere: krater başına tam computeVertexNormals (103 k köşe) + 2,5 MB konum/normal yüklemesi patlama anında
 * 34–76 ms'lik takılma yapıyordu; çukur en çok ±8 m'lik bir pencereyi değiştirir.
 */

/** Izgara indeks penceresi (uçlar dâhil). */
export interface IzgaraPenceresi {
  ix0: number;
  ix1: number;
  iz0: number;
  iz1: number;
}

/** Izgara düzeni. */
export interface IzgaraDuzeni {
  n: number;
  adim: number;
  yarim: number;
}

/** Krater çukurunun etki penceresi: merkezden ±1,5 r (kenar kabarması dâhil); ızgara dışında kalırsa null. */
export function kraterPenceresi(kx: number, kz: number, r: number, d: IzgaraDuzeni): IzgaraPenceresi | null {
  const ix0 = Math.max(0, Math.floor((kx - r * 1.5 + d.yarim) / d.adim));
  const ix1 = Math.min(d.n - 1, Math.ceil((kx + r * 1.5 + d.yarim) / d.adim));
  const iz0 = Math.max(0, Math.floor((kz - r * 1.5 + d.yarim) / d.adim));
  const iz1 = Math.min(d.n - 1, Math.ceil((kz + r * 1.5 + d.yarim) / d.adim));
  if (ix1 < ix0 || iz1 < iz0) return null;
  return { ix0, ix1, iz0, iz1 };
}

/** Krater çukuru derinliği (m): yarıçap ve şiddetle. */
export function kraterDerinligi(r: number, siddet: number): number {
  return 0.32 * r * (0.5 + siddet * 0.5);
}

/** Çukur + kenar kabarması: merkezden göreli uzaklık d = mesafe/r için yükseklik farkı (m). */
export function kraterFarki(d: number, derinlik: number): number {
  let dh = 0;
  if (d < 1) dh = -derinlik * Math.pow(1 - d * d, 2);
  dh += Math.exp(-Math.pow((d - 1.06) / 0.16, 2)) * derinlik * 0.28;
  return Math.abs(dh) >= 1e-3 ? dh : 0;
}

/** Krater çukurunu (kenarı hafif kabarık) yükseklik dizisine ekler (`h` yerinde); değişen pencereyi döner. */
export function kraterUygula(h: Float32Array, d: IzgaraDuzeni, kx: number, kz: number, r: number, siddet: number): IzgaraPenceresi | null {
  const p = kraterPenceresi(kx, kz, r, d);
  if (!p) return null;
  const derinlik = kraterDerinligi(r, siddet);
  for (let iz = p.iz0; iz <= p.iz1; iz++) {
    for (let ix = p.ix0; ix <= p.ix1; ix++) {
      const dh = kraterFarki(Math.hypot(ix * d.adim - d.yarim - kx, iz * d.adim - d.yarim - kz) / r, derinlik);
      if (dh !== 0) h[iz * d.n + ix] += dh;
    }
  }
  return p;
}

/** Penceredeki yükseklikleri analitik (deformasyonsuz) fonksiyondan yeniden yazar: krater temizliği. */
export function pencereyiYenile(h: Float32Array, d: IzgaraDuzeni, p: IzgaraPenceresi, analitik: (x: number, z: number) => number) {
  for (let iz = p.iz0; iz <= p.iz1; iz++) for (let ix = p.ix0; ix <= p.ix1; ix++) h[iz * d.n + ix] = analitik(ix * d.adim - d.yarim, iz * d.adim - d.yarim);
}

/** Penceredeki köşelerin y'sini yükseklik dizisinden konum dizisine (xyz) yazar. */
export function konumlariYaz(konum: Float32Array, h: Float32Array, n: number, p: IzgaraPenceresi) {
  for (let iz = p.iz0; iz <= p.iz1; iz++) for (let ix = p.ix0; ix <= p.ix1; ix++) konum[(iz * n + ix) * 3 + 1] = h[iz * n + ix];
}

/** Pencereyi her yönde `pay` köşe büyütür (ızgaraya kırpılır). */
export function pencereyiBuyut(p: IzgaraPenceresi, pay: number, n: number): IzgaraPenceresi {
  return { ix0: Math.max(0, p.ix0 - pay), ix1: Math.min(n - 1, p.ix1 + pay), iz0: Math.max(0, p.iz0 - pay), iz1: Math.min(n - 1, p.iz1 + pay) };
}

/**
 * Yükseklikleri `p` penceresinde değişmiş ızgaranın köşe normallerini yalnız etkilenen köşelerde (p + 1 köşe)
 * yeniden hesaplar; sonuç three'nin computeVertexNormals'ıyla aynıdır (aynı üçgen düzeni ve toplama sırası, her
 * adımda Float32 yuvarlama: alan ağırlıklı yüz normalleri toplanır, sonra normalize edilir). Etkilenen köşelerin
 * bütün komşu yüzleri (p + 2 köşelik dörtgenler) toplanır, dışarıdaki köşelere dokunulmaz. Dönen: güncellenen
 * köşe penceresi (yükleme aralığı için).
 */
export function pencereNormalleri(konum: Float32Array, normal: Float32Array, n: number, p: IzgaraPenceresi): IzgaraPenceresi {
  const v = pencereyiBuyut(p, 1, n);
  for (let iz = v.iz0; iz <= v.iz1; iz++) normal.fill(0, (iz * n + v.ix0) * 3, (iz * n + v.ix1 + 1) * 3);
  // Köşe penceresine değen dörtgenler (dörtgen (qx, qz): köşeleri qx..qx+1, qz..qz+1)
  const qx0 = Math.max(0, v.ix0 - 1);
  const qx1 = Math.min(n - 2, v.ix1);
  const qz0 = Math.max(0, v.iz0 - 1);
  const qz1 = Math.min(n - 2, v.iz1);
  const topla = (k: number, nx: number, ny: number, nz: number) => {
    const ix = k % n;
    const iz = (k - ix) / n;
    if (ix < v.ix0 || ix > v.ix1 || iz < v.iz0 || iz > v.iz1) return;
    normal[k * 3] += nx;
    normal[k * 3 + 1] += ny;
    normal[k * 3 + 2] += nz;
  };
  const ekle = (a: number, b: number, c: number) => {
    // three: cb = pC − pB, ab = pA − pB, cb × ab; her köşeye eklenir
    const bx = konum[b * 3];
    const by = konum[b * 3 + 1];
    const bz = konum[b * 3 + 2];
    const cbx = konum[c * 3] - bx;
    const cby = konum[c * 3 + 1] - by;
    const cbz = konum[c * 3 + 2] - bz;
    const abx = konum[a * 3] - bx;
    const aby = konum[a * 3 + 1] - by;
    const abz = konum[a * 3 + 2] - bz;
    const nx = cby * abz - cbz * aby;
    const ny = cbz * abx - cbx * abz;
    const nz = cbx * aby - cby * abx;
    topla(a, nx, ny, nz);
    topla(b, nx, ny, nz);
    topla(c, nx, ny, nz);
  };
  // PlaneGeometry sırası: satır satır (iy = z), dörtgen başına (a, b, d) ve (b, c, d)
  for (let qz = qz0; qz <= qz1; qz++) {
    for (let qx = qx0; qx <= qx1; qx++) {
      const a = qx + n * qz;
      const b = qx + n * (qz + 1);
      const c = qx + 1 + n * (qz + 1);
      const d = qx + 1 + n * qz;
      ekle(a, b, d);
      ekle(b, c, d);
    }
  }
  for (let iz = v.iz0; iz <= v.iz1; iz++) {
    for (let ix = v.ix0; ix <= v.ix1; ix++) {
      const i = (iz * n + ix) * 3;
      const x = normal[i];
      const y = normal[i + 1];
      const z = normal[i + 2];
      const ters = 1 / (Math.sqrt(x * x + y * y + z * z) || 1);
      normal[i] = x * ters;
      normal[i + 1] = y * ters;
      normal[i + 2] = z * ters;
    }
  }
  return v;
}

/** Pencerenin köşe dizisindeki (itemSize öğe/köşe) bitişik aralığı: ilk satırın başından son satırın sonuna. */
export function pencereAraligi(p: IzgaraPenceresi, n: number, oge: number): { start: number; count: number } {
  const bas = p.iz0 * n + p.ix0;
  const son = p.iz1 * n + p.ix1;
  return { start: bas * oge, count: (son - bas + 1) * oge };
}
