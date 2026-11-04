/**
 * Panorama çözme işçisi (Web Worker): indirme, JPEG çözme, küçültme ve analiz ana iş parçacığının dışında. Her istek
 * için ayrı işçi açılır; yenisi gelince eskisi `terminate()` ile durdurulur (createImageBitmap iptal edilemez, işçiyle
 * birlikte biter). Sonuçtaki bitmapler aktarılır (kopyasız).
 */
import { panoramaCoz, type CozumSecenekleri, type CozulmusPanorama } from "./panoramaCozucu";

export interface IsciIstegi {
  url: string;
  secenek: CozumSecenekleri;
}
export type IsciYaniti = { tamam: true; sonuc: CozulmusPanorama } | { tamam: false; hata: string };

/** İşçi kapsamının kullanılan kısmı (lib.dom'da DedicatedWorkerGlobalScope yok). */
interface IsciKapsami {
  onmessage: ((e: MessageEvent<IsciIstegi>) => void) | null;
  postMessage(mesaj: IsciYaniti, aktar?: Transferable[]): void;
}

const kapsam = self as unknown as IsciKapsami;
kapsam.onmessage = (e) => {
  const { url, secenek } = e.data;
  panoramaCoz(url, secenek).then(
    (sonuc) => kapsam.postMessage({ tamam: true, sonuc }, sonuc.gok ? [sonuc.tam, sonuc.kucuk, sonuc.gok.veri.buffer] : [sonuc.tam, sonuc.kucuk]),
    (h: unknown) => kapsam.postMessage({ tamam: false, hata: h instanceof Error ? h.message : String(h) }),
  );
};
