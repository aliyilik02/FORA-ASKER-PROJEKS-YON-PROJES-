/**
 * Arayüz bağlamı: paneller arasında paylaşılan hafif durum.
 *  - seciliYon: pusuladan seçilen yön (0–359, 0 = karşı/orta duvar, saat yönünde); efekt ve figür
 *    panelleri bu yönü kullanır, böylece eğitmen yönü bir kez seçer.
 *  - bildirimler: sağ altta kısa süreli geri bildirim ("Patlama tetiklendi → 35°").
 *  - sekme: sol raydaki açık bölüm (yeniden yüklemede hatırlanır).
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

export type Sekme = "sahne" | "efektler" | "figurler" | "senaryo" | "sistem";

export interface Bildirim {
  id: number;
  tur: "bilgi" | "basari" | "hata";
  baslik: string;
  metin?: string;
}

interface ArayuzDegerleri {
  seciliYon: number;
  setSeciliYon: (yon: number) => void;
  sekme: Sekme;
  setSekme: (s: Sekme) => void;
  bildirimler: Bildirim[];
  bildir: (b: Omit<Bildirim, "id">) => void;
  bildirimKapat: (id: number) => void;
}

const Baglam = createContext<ArayuzDegerleri | null>(null);

const SEKME_ANAHTARI = "duvar.panel.sekme";

export function ArayuzSaglayici({ children }: { children: ReactNode }) {
  const [seciliYon, setSeciliYonHam] = useState(0);
  const [sekme, setSekmeHam] = useState<Sekme>(() => {
    try {
      const k = localStorage.getItem(SEKME_ANAHTARI) as Sekme | null;
      return k && ["sahne", "efektler", "figurler", "senaryo", "sistem"].includes(k) ? k : "sahne";
    } catch {
      return "sahne";
    }
  });
  const [bildirimler, setBildirimler] = useState<Bildirim[]>([]);
  const sayac = useRef(0);

  const setSeciliYon = useCallback((yon: number) => setSeciliYonHam(((Math.round(yon) % 360) + 360) % 360), []);
  const setSekme = useCallback((s: Sekme) => {
    setSekmeHam(s);
    try {
      localStorage.setItem(SEKME_ANAHTARI, s);
    } catch {
      /* özel pencere */
    }
  }, []);
  const bildirimKapat = useCallback((id: number) => setBildirimler((b) => b.filter((x) => x.id !== id)), []);
  const bildir = useCallback(
    (b: Omit<Bildirim, "id">) => {
      const id = ++sayac.current;
      setBildirimler((eski) => [...eski.slice(-4), { ...b, id }]);
      window.setTimeout(() => bildirimKapat(id), b.tur === "hata" ? 6000 : 3200);
    },
    [bildirimKapat],
  );

  const deger = useMemo(
    () => ({ seciliYon, setSeciliYon, sekme, setSekme, bildirimler, bildir, bildirimKapat }),
    [seciliYon, setSeciliYon, sekme, setSekme, bildirimler, bildir, bildirimKapat],
  );
  return <Baglam.Provider value={deger}>{children}</Baglam.Provider>;
}

export function useArayuz(): ArayuzDegerleri {
  const d = useContext(Baglam);
  if (!d) throw new Error("useArayuz, ArayuzSaglayici içinde kullanılmalı");
  return d;
}

/** Panel yönü (0–359, saat yönünde, 0 = karşı) ↔ oynatıcı azimutu (-180..180). */
export function yonAzimut(yon: number): number {
  return ((((yon + 180) % 360) + 360) % 360) - 180;
}
export function azimutYon(azimut: number): number {
  return ((Math.round(azimut) % 360) + 360) % 360;
}
