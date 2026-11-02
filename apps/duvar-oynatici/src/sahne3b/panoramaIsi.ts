/**
 * Panorama çözme işini başlatır: işçide (`panoramaIscisi.ts`), işçi açılamaz ya da betiği yüklenemezse ana iş
 * parçacığında aynı kod (createImageBitmap çözmeyi yine arka planda yapar; yalnız çevirme/küçültme ana iş parçacığında
 * kalır). İşçi altyapısı bir kez düşerse oturum boyunca ana iş parçacığı yolu kullanılır; çözme hatası (HTTP 404, bozuk
 * dosya) işçiden normal yanıt olarak gelir. İptal: işçi durdurulur (çözme de biter), ana iş parçacığı yolunda indirme
 * kesilir ve geç gelen bitmapler kapatılır.
 */
import { panoramaCoz, type CozumSecenekleri, type CozulmusPanorama } from "./panoramaCozucu";
import type { IsciIstegi, IsciYaniti } from "./panoramaIscisi";

export interface CozmeIsi {
  /** İptal edilen işin sözü hiç sonuçlanmayabilir (işçi durdurulur); çağıran nesil numarasıyla da denetler. */
  sonuc: Promise<CozulmusPanorama>;
  iptal(): void;
}

/** İşçi altyapısı çalışmadı (betik yüklenemedi vb.): sonraki işler doğrudan ana iş parçacığında. */
let isciKullanilamaz = false;

export function cozmeBaslat(adres: string, secenek: CozumSecenekleri): CozmeIsi {
  // İşçide göreli adres işçi betiğinin konumuna göre çözülür (…/assets/): sayfaya göre mutlak adrese çevrilir
  const url = typeof location !== "undefined" ? new URL(adres, location.href).href : adres;
  let iptalEdildi = false;
  let anaIptal: AbortController | null = null;
  /** Ana iş parçacığında çöz (işçi yoksa ya da düştüyse). */
  const anaIstegi = () => {
    anaIptal = new AbortController();
    return panoramaCoz(url, secenek, anaIptal.signal).then((s) => {
      if (iptalEdildi) {
        s.tam.close();
        s.kucuk.close();
        throw new Error("iptal");
      }
      return s;
    });
  };
  let isci: Worker | null = null;
  if (!isciKullanilamaz) {
    try {
      isci = new Worker(new URL("./panoramaIscisi.ts", import.meta.url), { type: "module", name: "panorama" });
    } catch {
      isci = null;
    }
  }
  if (!isci) {
    const sonuc = anaIstegi();
    return {
      sonuc,
      iptal: () => {
        iptalEdildi = true;
        anaIptal?.abort();
      },
    };
  }
  const w = isci;
  let bitti = false;
  const sonuc = new Promise<CozulmusPanorama>((coz, reddet) => {
    w.onmessage = (e: MessageEvent<IsciYaniti>) => {
      bitti = true;
      w.terminate();
      if (e.data.tamam) coz(e.data.sonuc);
      else reddet(new Error(e.data.hata));
    };
    w.onerror = (e: ErrorEvent) => {
      // Altyapı hatası (betik yüklenemedi, modül hatası): aynı dosya ana iş parçacığında çözülür
      e.preventDefault();
      bitti = true;
      w.terminate();
      isciKullanilamaz = true;
      if (iptalEdildi) return;
      anaIstegi().then(coz, reddet);
    };
  });
  const istek: IsciIstegi = { url, secenek };
  w.postMessage(istek);
  return {
    sonuc,
    iptal: () => {
      iptalEdildi = true;
      anaIptal?.abort();
      if (bitti) return;
      bitti = true;
      w.terminate();
    },
  };
}
