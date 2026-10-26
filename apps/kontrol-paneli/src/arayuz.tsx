/**
 * Arayüz bağlamı: paneller arasında paylaşılan hafif durum.
 *  - seciliYon: pusuladan seçilen yön (0–359, 0 = karşı/orta duvar, saat yönünde); efekt ve figür
 *    panelleri bu yönü kullanır, böylece eğitmen yönü bir kez seçer.
 *  - bildirimler: sağ altta kısa süreli geri bildirim ("Patlama tetiklendi → 35°").
 *  - sekme: sol raydaki açık bölüm (yeniden yüklemede hatırlanır).
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

export type Sekme = "sahne" | "efektler" | "figurler" | "senaryo" | "sistem";
/** Oynatıcı kalite kademesi; "Oynatıcı" düğmesi bu değerle (`?kalite=`) açar. */
export type OynaticiKalite = "dusuk" | "orta" | "yuksek";
export const KALITE_ETIKETLERI: Record<OynaticiKalite, string> = { dusuk: "Düşük (dizüstü / entegre ekran kartı)", orta: "Orta", yuksek: "Yüksek (saha makinesi, RTX)" };

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
  oynaticiKalite: OynaticiKalite;
  setOynaticiKalite: (k: OynaticiKalite) => void;
  /** Oynatıcıya adres çubuğuyla geçen ek ayarlar (ör. ses düzeni, duvar geometrisi); yerel kayıtta kalır. */
  oynaticiParametreleri: Record<string, string>;
  /** null veya "" → parametre kaldırılır (oynatıcı kendi varsayılanını / yerel kaydını kullanır). */
  setOynaticiParametresi: (ad: string, deger: string | null) => void;
  /** Üst çubuktaki "Oynatıcı" düğmesinin açtığı adres: kalite + ek ayarlar. */
  oynaticiAdresi: string;
}

const Baglam = createContext<ArayuzDegerleri | null>(null);

const SEKME_ANAHTARI = "duvar.panel.sekme";
const KALITE_ANAHTARI = "duvar.panel.kalite";
const PARAMETRE_ANAHTARI = "duvar.panel.oynaticiParametreleri";

/** Oynatıcı adresi: `?kalite=` + ek parametreler (ad sırasıyla, kararlı adres). */
export function oynaticiAdresiOlustur(kalite: OynaticiKalite, ek: Record<string, string>): string {
  const p = new URLSearchParams({ kalite });
  for (const ad of Object.keys(ek).sort()) if (ek[ad]) p.set(ad, ek[ad]);
  return `/oynatici/?${p.toString()}`;
}

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
  const [oynaticiKalite, setKaliteHam] = useState<OynaticiKalite>(() => {
    try {
      const k = localStorage.getItem(KALITE_ANAHTARI) as OynaticiKalite | null;
      return k && ["dusuk", "orta", "yuksek"].includes(k) ? k : "yuksek";
    } catch {
      return "yuksek";
    }
  });
  const setOynaticiKalite = useCallback((k: OynaticiKalite) => {
    setKaliteHam(k);
    try {
      localStorage.setItem(KALITE_ANAHTARI, k);
    } catch {
      /* özel pencere */
    }
  }, []);
  const [oynaticiParametreleri, setParametrelerHam] = useState<Record<string, string>>(() => {
    try {
      const k = JSON.parse(localStorage.getItem(PARAMETRE_ANAHTARI) ?? "{}") as unknown;
      return k && typeof k === "object" && !Array.isArray(k) ? Object.fromEntries(Object.entries(k).filter(([, v]) => typeof v === "string")) : {};
    } catch {
      return {};
    }
  });
  const setOynaticiParametresi = useCallback((ad: string, deger: string | null) => {
    setParametrelerHam((eski) => {
      const yeni = { ...eski };
      if (deger) yeni[ad] = deger;
      else delete yeni[ad];
      try {
        localStorage.setItem(PARAMETRE_ANAHTARI, JSON.stringify(yeni));
      } catch {
        /* özel pencere */
      }
      return yeni;
    });
  }, []);
  const oynaticiAdresi = useMemo(() => oynaticiAdresiOlustur(oynaticiKalite, oynaticiParametreleri), [oynaticiKalite, oynaticiParametreleri]);
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
    () => ({ seciliYon, setSeciliYon, sekme, setSekme, bildirimler, bildir, bildirimKapat, oynaticiKalite, setOynaticiKalite, oynaticiParametreleri, setOynaticiParametresi, oynaticiAdresi }),
    [seciliYon, setSeciliYon, sekme, setSekme, bildirimler, bildir, bildirimKapat, oynaticiKalite, setOynaticiKalite, oynaticiParametreleri, setOynaticiParametresi, oynaticiAdresi],
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
