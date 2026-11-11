/**
 * Ağaç yerleşimi için saf yardımcılar (arazi.ts kullanır, birim testli): yol boyu dizi (kavak sırası) ve gövdeler arası
 * en az mesafe ızgarası (ağaçlar iç içe girmesin).
 */

/**
 * Yolun iki yanında dizi: merkez çizgisi z = yolZ(x); her `adim` metrede (`faz` kaydırmasıyla) yolun dik doğrultusunda
 * `pay` m açıkta birer aday, `bosluk` olasılığıyla atlanır (sırada doğal boşluk). Konum ±%12 kayar: dizi cetvel gibi
 * durmasın. Birden çok tür aynı `adim` ve farklı `faz` ile iç içe tek bir sıra oluşturur.
 */
export function yolDizisi(
  yolZ: (x: number) => number,
  xMin: number,
  xMax: number,
  adim: number,
  faz: number,
  pay: number,
  bosluk: number,
  rastgele: () => number,
): Array<{ x: number; z: number }> {
  const sonuc: Array<{ x: number; z: number }> = [];
  if (!(adim > 0) || xMax <= xMin) return sonuc;
  const ilk = Math.ceil((xMin - faz) / adim) * adim + faz;
  for (let x0 = ilk; x0 <= xMax; x0 += adim) {
    for (const yan of [-1, 1]) {
      if (rastgele() < bosluk) continue;
      const x = x0 + (rastgele() - 0.5) * adim * 0.12;
      // Yolun teğeti (1, eğim) → dik birim vektör (-eğim, 1)/uzunluk
      const egim = (yolZ(x + 0.5) - yolZ(x - 0.5)) / 1;
      const u = Math.hypot(egim, 1);
      const p = pay * (0.92 + rastgele() * 0.16);
      sonuc.push({ x: x + (-egim / u) * p * yan, z: yolZ(x) + (1 / u) * p * yan });
    }
  }
  return sonuc;
}

/** Fisher–Yates karıştırma (yeni dizi): dizi adayları azken sıranın hep aynı ucu dolmasın. */
export function karistir<T>(dizi: readonly T[], rastgele: () => number): T[] {
  const s = dizi.slice();
  for (let i = s.length - 1; i > 0; i--) {
    const j = Math.floor(rastgele() * (i + 1));
    [s[i], s[j]] = [s[j], s[i]];
  }
  return s;
}

/**
 * Gövdeler arası en az mesafe: kare ızgarada karma (hücre = en büyük aralık); sorgu yalnız komşu 9 hücreye bakar.
 * Bütün ağaç türleri aynı ızgarayı paylaşır (karaçam ladinin içine konmaz).
 */
export class AralikIzgarasi {
  private readonly hucreler = new Map<string, Array<{ x: number; z: number; r: number }>>();

  constructor(private readonly hucre: number) {}

  private anahtar(ix: number, iz: number) {
    return `${ix},${iz}`;
  }

  /** (x, z) çevresinde `aralik` m içinde başka gövde yoksa true; iki gövdenin aralıklarından büyüğü geçerli. */
  bosMu(x: number, z: number, aralik: number): boolean {
    const ix = Math.floor(x / this.hucre);
    const iz = Math.floor(z / this.hucre);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const liste = this.hucreler.get(this.anahtar(ix + dx, iz + dz));
        if (!liste) continue;
        for (const g of liste) if (Math.hypot(g.x - x, g.z - z) < Math.max(aralik, g.r)) return false;
      }
    }
    return true;
  }

  ekle(x: number, z: number, aralik: number) {
    const k = this.anahtar(Math.floor(x / this.hucre), Math.floor(z / this.hucre));
    let liste = this.hucreler.get(k);
    if (!liste) this.hucreler.set(k, (liste = []));
    liste.push({ x, z, r: aralik });
  }

  get sayi(): number {
    let n = 0;
    for (const l of this.hucreler.values()) n += l.length;
    return n;
  }
}
