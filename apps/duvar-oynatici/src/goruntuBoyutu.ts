/**
 * Görüntü boyutunu dosya başlığından okur (JPEG SOF, PNG IHDR) — panorama işçisi 12K×6K resmi tam çözüp sonra
 * küçültmek yerine (≈ 288 MB RGBA tepe) doğrudan küçültülmüş çözer; kaynak genişlik/yükseklik yine bilinir (C-21, §2-25).
 * Tanınmazsa null (işçi eski yola düşer).
 */
export interface GoruntuBoyutu {
  genislik: number;
  yukseklik: number;
}

export function goruntuBoyutu(veri: ArrayBuffer | Uint8Array): GoruntuBoyutu | null {
  const b = veri instanceof Uint8Array ? veri : new Uint8Array(veri);
  if (b.length < 24) return null;
  // PNG: imza + IHDR (genişlik 16–19, yükseklik 20–23, büyük uçlu)
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const g = (b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19];
    const y = (b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23];
    return g > 0 && y > 0 ? { genislik: g >>> 0, yukseklik: y >>> 0 } : null;
  }
  // JPEG: FFD8, bölümler: FF xx, uzunluk (2 bayt); SOF0/1/2 (C0/C1/C2): [uzunluk][hassasiyet][yükseklik][genişlik]
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i++;
        continue;
      }
      const isaret = b[i + 1];
      if (isaret === 0xff) {
        i++;
        continue;
      }
      if (isaret === 0xd8 || (isaret >= 0xd0 && isaret <= 0xd7) || isaret === 0x01) {
        i += 2;
        continue;
      }
      const uzunluk = (b[i + 2] << 8) | b[i + 3];
      if (isaret === 0xc0 || isaret === 0xc1 || isaret === 0xc2) {
        const y = (b[i + 5] << 8) | b[i + 6];
        const g = (b[i + 7] << 8) | b[i + 8];
        return g > 0 && y > 0 ? { genislik: g, yukseklik: y } : null;
      }
      if (isaret === 0xda || isaret === 0xd9) return null; // SOS/EOI'den önce SOF bulunamadı
      i += 2 + uzunluk;
    }
  }
  return null;
}
