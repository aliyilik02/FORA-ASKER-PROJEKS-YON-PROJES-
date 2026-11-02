/**
 * Oda 2 helikopter iniş dizisi (yaklaş → in → yerde): zamanlayıcılar bileşende değil modül düzeyinde tutulur. Böylece
 * Oda2Paneli sekme değişince kapanıp açılsa da dizi ve "Diziyi iptal et" düğmesi kaybolmaz (eskiden zamanlayıcılar
 * arka planda sürüp düğme kayboluyordu). Sahne sıfırlaması (köprünün `sahne/sifirla` mesajı ya da API yanıtı, bkz.
 * useKopru) diziyi iptal eder: helikopter +20 / +35 sn'de geri gelmez. Diziyi başlatan panel sekmesi kapanırsa dizi de
 * durur (kalıcı çözüm: diziyi köprüye taşımak).
 */
import { useSyncExternalStore } from "react";
import type { HelikopterDurumu } from "./tipler";

export const HELI_DIZISI: ReadonlyArray<{ durum: HelikopterDurumu; sn: number }> = [
  { durum: "yaklasiyor", sn: 0 },
  { durum: "iniyor", sn: 20 },
  { durum: "yerde", sn: 35 },
];
/** Dizinin göstergede sürdüğü toplam süre (sn); sonra kendiliğinden biter. */
const DIZI_SURESI_SN = 40;

let baslangic: number | null = null;
let zamanlayicilar: number[] = [];
const dinleyiciler = new Set<() => void>();
const haberVer = () => {
  for (const d of dinleyiciler) d();
};

/** Diziyi (yeniden) başlatır; `gonder` her aşamada helikopter durumunu köprüye yollar. */
export function heliDizisiBaslat(gonder: (durum: HelikopterDurumu) => void) {
  for (const t of zamanlayicilar) window.clearTimeout(t);
  zamanlayicilar = HELI_DIZISI.map((a) => window.setTimeout(() => gonder(a.durum), a.sn * 1000));
  zamanlayicilar.push(
    window.setTimeout(() => {
      zamanlayicilar = [];
      baslangic = null;
      haberVer();
    }, DIZI_SURESI_SN * 1000),
  );
  baslangic = Date.now();
  haberVer();
}

/** Süren diziyi iptal eder (panel düğmesi, sahne sıfırlaması); dizi sürüyor idiyse true. */
export function heliDizisiIptal(): boolean {
  const suruyordu = baslangic !== null;
  for (const t of zamanlayicilar) window.clearTimeout(t);
  zamanlayicilar = [];
  baslangic = null;
  if (suruyordu) haberVer();
  return suruyordu;
}

function abone(d: () => void) {
  dinleyiciler.add(d);
  return () => {
    dinleyiciler.delete(d);
  };
}
const anlik = () => baslangic;

/** Süren dizinin başlangıç zamanı (ms; dizi yoksa null). */
export function useHeliDizisi(): number | null {
  return useSyncExternalStore(abone, anlik);
}
