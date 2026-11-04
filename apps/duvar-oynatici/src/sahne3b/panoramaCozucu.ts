/**
 * Panorama dosyasını çözer: fetch → Blob → createImageBitmap (JPEG çözme tarayıcının çözücü iş parçacığında) → küçük
 * kopyalar → analiz. İşçide (`panoramaIscisi.ts`) çalışır; işçi açılamazsa ana iş parçacığında da aynı kod çalışır.
 *
 * Ölçüm (Iris Xe, 60,6 MB q100 8K orman): eski yol (TextureLoader → texImage2D(HTMLImageElement)) ana iş parçacığında
 * 1,9 sn tek parça çözme + yükleme; createImageBitmap(blob) ana iş parçacığında 110–160 ms (çevirme/dönüştürme o iş
 * parçacığında yapılıyor); işçide en uzun ana iş parçacığı boşluğu 17–21 ms. Bu yüzden çözme ve küçültme işçidedir.
 *
 * Satır düzeni: `tam` ve `kucuk` imageOrientation "flipY" ile ters (ilk satır resmin altı): ImageBitmap'te
 * texture.flipY yok sayıldığından GPU'ya bu düzende gider ve three'nin equirect örneklemesiyle (eski flipY=true
 * yüklemeyle) aynı yön çıkar. Analiz kopyası yeniden çevrilir (dik: üst satır gök), gunes.ts bunu bekler.
 */
import { gokMaskesiHesapla, type GokMaskesi } from "./gokMaskesi";
import { ANALIZ_GENISLIGI, ANALIZ_YUKSEKLIGI, panoramaAnalizEt, type PanoramaAnalizi } from "./panoramaAnalizi";

/** PMREM (ortam ışığı) girdisi: sabit 1024×512 → 256'lık küp; malzeme programları panorama değişince yeniden derlenmez. */
export const PMREM_GIRDI_GENISLIGI = 1024;

export interface CozumSecenekleri {
  /** Tam görüntünün en büyük genişliği (piksel; kalite kademesinin küp yüzünün 4 katı). Kaynak daha genişse işçide küçülür. 0 = kaynak. */
  enGenis: number;
  /** Gök maskesinin genişliği (piksel, yüksekliğin 2 katı); 0 = maske yok (manifest `gok: false`). */
  gokGenisligi?: number;
}

export interface CozulmusPanorama {
  /** GPU satır düzeninde (ters) tam görüntü; küp üretimi için şeritler hâlinde yüklenir. */
  tam: ImageBitmap;
  /** 1024×512, GPU satır düzeninde: PMREM girdisi. */
  kucuk: ImageBitmap;
  /** Okunamadıysa null (sahne sabit sınırlara ve saate göre güneşe düşer; eski "tainted canvas" davranışı). */
  analiz: PanoramaAnalizi | null;
  /** Gök maskesi (dik düzen; gokMaskesi.ts); istenmediyse ya da okunamadıysa null. */
  gok: GokMaskesi | null;
  kaynakGenisligi: number;
  kaynakYuksekligi: number;
  /** Adım süreleri (ms; işçinin saatiyle): indirme, çözme, küçültme (tam + 1024), analiz, gök maskesi. */
  sureler: { indirme: number; cozme: number; kucultme: number; analiz: number; gok: number };
}

export async function panoramaCoz(url: string, secenek: CozumSecenekleri, sinyal?: AbortSignal): Promise<CozulmusPanorama> {
  const t0 = performance.now();
  const yanit = await fetch(url, { signal: sinyal });
  if (!yanit.ok) throw new Error(`HTTP ${yanit.status}`);
  const blob = await yanit.blob();
  const t1 = performance.now();
  let tam = await createImageBitmap(blob, { imageOrientation: "flipY", premultiplyAlpha: "none", colorSpaceConversion: "default" });
  const kaynakGenisligi = tam.width;
  const kaynakYuksekligi = tam.height;
  const t2 = performance.now();
  // Küçük kopya tam çözümden ("high": analiz eski tuval yoluyla karşılaştırılıp bu ayarla doğrulandı; "low" güneşi kaydırıyordu)
  const kucuk = await createImageBitmap(tam, { resizeWidth: PMREM_GIRDI_GENISLIGI, resizeHeight: PMREM_GIRDI_GENISLIGI / 2, resizeQuality: "high" });
  if (secenek.enGenis > 0 && tam.width > secenek.enGenis) {
    // Tam tam 2× küçültmede çift doğrusal örnekleme 2×2 kutu ortalamasıdır (hızlı, kayıpsız sayılır); diğer oranlarda mipmap'li
    const kalite: ResizeQuality = tam.width === 2 * secenek.enGenis ? "low" : "medium";
    const k = await createImageBitmap(tam, { resizeWidth: secenek.enGenis, resizeHeight: Math.max(1, Math.round((secenek.enGenis * tam.height) / tam.width)), resizeQuality: kalite });
    tam.close();
    tam = k;
  }
  const t3 = performance.now();
  let analiz: PanoramaAnalizi | null = null;
  const a = await createImageBitmap(kucuk, { resizeWidth: ANALIZ_GENISLIGI, resizeHeight: ANALIZ_YUKSEKLIGI, resizeQuality: "high", imageOrientation: "flipY" });
  try {
    const tuval = new OffscreenCanvas(ANALIZ_GENISLIGI, ANALIZ_YUKSEKLIGI);
    const ctx = tuval.getContext("2d", { willReadFrequently: true });
    if (ctx) {
      ctx.drawImage(a, 0, 0);
      analiz = panoramaAnalizEt(ctx.getImageData(0, 0, ANALIZ_GENISLIGI, ANALIZ_YUKSEKLIGI).data, ANALIZ_GENISLIGI, ANALIZ_YUKSEKLIGI);
    }
  } catch {
    analiz = null;
  } finally {
    a.close();
  }
  const t4 = performance.now();
  // Gök maskesi tam çözümden (dik: flipY'li bitmap yeniden çevrilir); gök örtüsü onu duvar başına ~4 piksellik
  // kenarla örnekler (2048 genişlikte). Okunamazsa maske yok, gök örtüsü yalnız ufuk pusu ve zemin tonlaması yapar.
  let gok: GokMaskesi | null = null;
  const gw = secenek.gokGenisligi ?? 0;
  if (gw > 0) {
    const gh = gw >> 1;
    const m = await createImageBitmap(tam, { resizeWidth: gw, resizeHeight: gh, resizeQuality: "medium", imageOrientation: "flipY" });
    try {
      const tuval = new OffscreenCanvas(gw, gh);
      const ctx = tuval.getContext("2d", { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(m, 0, 0);
        gok = gokMaskesiHesapla(ctx.getImageData(0, 0, gw, gh).data, gw, gh);
      }
    } catch {
      gok = null;
    } finally {
      m.close();
    }
  }
  const t5 = performance.now();
  return { tam, kucuk, analiz, gok, kaynakGenisligi, kaynakYuksekligi, sureler: { indirme: t1 - t0, cozme: t2 - t1, kucultme: t3 - t2, analiz: t4 - t3, gok: t5 - t4 } };
}
