/**
 * Panoramadan güneş yönü tahmini.
 *
 * 3B nesnelerin (asker, helikopter, krater) gölgesi panoramadaki güneşle aynı yöne düşmeli; yoksa
 * figür "yapıştırma" gibi durur. Equirectangular görüntünün gökyüzü yarısında en parlak bölgenin
 * ağırlıklı merkezi alınır. Bulutlu gökte parlak bölge geniş yayılır → `guc` düşer, gölge yumuşar.
 *
 * Koordinatlar: u = 0.5 panoramanın ortası (yaw kaydırması 0 iken orta duvar), v = 0 üst.
 * Dönüş: azimut derece (sola eksi, sağa artı), yükseklik derece (ufuk 0, zenit 90).
 */

export interface GunesTahmini {
  /** Panoramaya göre azimut (derece, -180..180). */
  azimut: number;
  /** Ufka göre yükseklik (derece, 0..90). */
  yukseklik: number;
  /** 0–1: parlak bölge ne kadar derli toplu (1 = keskin güneş diski, 0 = kapalı gök). */
  guc: number;
  /** Parlak bölge dikeyde dar mı (disk) yoksa ufuktan zenite yayılan ışıma mı (yükseklik güvenilmez). */
  yukseklikGuvenilir: boolean;
}

/**
 * `piksel` RGBA (canvas getImageData), `w`×`h` küçük bir kopya (ör. 256×128) yeterlidir.
 * Gökyüzü yoksa / görüntü düz ise null döner.
 */
export function gunesTahmin(piksel: Uint8ClampedArray, w: number, h: number): GunesTahmini | null {
  if (w < 8 || h < 4 || piksel.length < w * h * 4) return null;
  const ustSatir = Math.floor(h * 0.55); // ufkun biraz altına kadar bak (alçak güneş)
  const lum = new Float32Array(w * ustSatir);
  let enBuyuk = 0;
  for (let y = 0; y < ustSatir; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const l = 0.2126 * piksel[i] + 0.7152 * piksel[i + 1] + 0.0722 * piksel[i + 2];
      lum[y * w + x] = l;
      if (l > enBuyuk) enBuyuk = l;
    }
  }
  if (enBuyuk < 60) return null;
  // Yerel kontrast: güneş diski çevresine göre belirgin parlaktır; ufuktaki pus ve bulut beyazı
  // geniş alana yayıldığından bulanık ortalamadan az sapar. Kutu bulanıklığı (yatayda sarmalı).
  const yr = Math.max(2, Math.round(w / 24));
  const bulanik = new Float32Array(w * ustSatir);
  for (let y = 0; y < ustSatir; y++) {
    for (let x = 0; x < w; x++) {
      let t = 0;
      let n = 0;
      for (let dy = -yr; dy <= yr; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= ustSatir) continue;
        for (let dx = -yr; dx <= yr; dx++) {
          const xx = (((x + dx) % w) + w) % w;
          t += lum[yy * w + xx];
          n++;
        }
      }
      bulanik[y * w + x] = t / n;
    }
  }
  // Satır ortalaması: ufuk pusu bir satır boyunca eşit parlaktır, güneş diski satırından çok sapar.
  const satirOrt = new Float32Array(ustSatir);
  for (let y = 0; y < ustSatir; y++) {
    let t = 0;
    for (let x = 0; x < w; x++) t += lum[y * w + x];
    satirOrt[y] = t / w;
  }
  const sapma = (y: number, x: number) => Math.min(lum[y * w + x] - bulanik[y * w + x], lum[y * w + x] - satirOrt[y]);
  let enKontrast = 0;
  for (let y = 0; y < ustSatir; y++) for (let x = 0; x < w; x++) enKontrast = Math.max(enKontrast, sapma(y, x));
  // Disk yoksa (kontrast düşük) tahmin yapılmaz → çağıran saate göre güneş kullanır
  if (enKontrast < 30) return null;
  const esik = Math.max(Math.min(200, enBuyuk * 0.9), enBuyuk * 0.96);
  const kontrastEsik = enKontrast * 0.5;
  let agirlik = 0;
  let sx = 0;
  let sy = 0;
  let sz = 0;
  let sayi = 0;
  let enlemT = 0;
  let enlemKare = 0;
  for (let y = 0; y < ustSatir; y++) {
    const v = (y + 0.5) / h;
    const enlem = (0.5 - v) * Math.PI; // +π/2 zenit
    const alan = Math.cos(enlem); // equirect alan düzeltmesi
    for (let x = 0; x < w; x++) {
      const l = lum[y * w + x];
      if (l < esik || sapma(y, x) < kontrastEsik) continue;
      const u = (x + 0.5) / w;
      const az = (u - 0.5) * 2 * Math.PI;
      const ag = (l - esik + 1) * alan;
      sx += Math.sin(az) * Math.cos(enlem) * ag;
      sz += Math.cos(az) * Math.cos(enlem) * ag;
      sy += Math.sin(enlem) * ag;
      enlemT += enlem * ag;
      enlemKare += enlem * enlem * ag;
      agirlik += ag;
      sayi++;
    }
  }
  if (agirlik <= 0) return null;
  const nx = sx / agirlik;
  const ny = sy / agirlik;
  const nz = sz / agirlik;
  const boy = Math.hypot(nx, ny, nz); // 1'e yakınsa pikseller aynı yönde (keskin)
  const azimut = (Math.atan2(nx, nz) * 180) / Math.PI;
  const yukseklik = (Math.asin(Math.max(-1, Math.min(1, ny / Math.max(1e-6, boy)))) * 180) / Math.PI;
  // Parlak alanın gökyüzüne oranı: güneş diski < %1; kapalı gök > %10
  const oran = sayi / (w * ustSatir);
  const yayginlik = Math.max(0, Math.min(1, (oran - 0.004) / 0.08));
  const guc = Math.max(0, Math.min(1, boy)) * (1 - yayginlik);
  // Dikey yayılım: disk birkaç derece; dikiş/ışıma sütunu onlarca derece → yükseklik anlamsız
  const enlemOrt = enlemT / agirlik;
  const enlemStd = (Math.sqrt(Math.max(0, enlemKare / agirlik - enlemOrt * enlemOrt)) * 180) / Math.PI;
  return { azimut, yukseklik: Math.max(0, yukseklik), guc, yukseklikGuvenilir: enlemStd < 9 };
}

/** Panorama azimutunu sahne azimutuna çevirir: yawKaydirma k iken panoramanın k azimutu orta duvara gelir. */
export function panoramadanSahneAzimutu(panoramaAzimut: number, yawKaydirma: number): number {
  const a = panoramaAzimut - yawKaydirma;
  return ((((a + 180) % 360) + 360) % 360) - 180;
}
