/** Ortak yapı taşları: bölüm kartı, gecikmeli kaydırıcı, seçenek grubu, anahtar, rozet, LED, onaylı düğme, ikonlar. */
import { useEffect, useRef, useState, type ReactNode } from "react";

export function Bolum({ baslik, altBaslik, children, sag, ikon, sinif }: { baslik: string; altBaslik?: string; children: ReactNode; sag?: ReactNode; ikon?: ReactNode; sinif?: string }) {
  return (
    <section className={`bolum ${sinif ?? ""}`}>
      <header className="bolum-baslik">
        <div className="bolum-baslik-sol">
          {ikon && <span className="bolum-ikon">{ikon}</span>}
          <div>
            <h2>{baslik}</h2>
            {altBaslik && <p className="alt-baslik">{altBaslik}</p>}
          </div>
        </div>
        {sag}
      </header>
      <div className="bolum-icerik">{children}</div>
    </section>
  );
}

/**
 * Kaydırıcı: sürüklerken yerel değer anında güncellenir, köprüye gönderim 120 ms boşlukta yapılır
 * (her piksel için istek atılmaz). Sunucudan gelen değer, kullanıcı sürüklemiyorsa benimsenir.
 */
export function Kaydirici({
  etiket,
  deger,
  min,
  max,
  adim = 0.01,
  birim = "",
  bicim,
  onChange,
  gecikmeMs = 120,
  vurgu,
}: {
  etiket: string;
  deger: number;
  min: number;
  max: number;
  adim?: number;
  birim?: string;
  bicim?: (v: number) => string;
  onChange: (v: number) => void;
  gecikmeMs?: number;
  vurgu?: "amber" | "izli" | "gok";
}) {
  const [yerel, setYerel] = useState(deger);
  const zamanlayici = useRef<number | null>(null);
  const sonDokunma = useRef(0);

  useEffect(() => {
    if (Date.now() - sonDokunma.current > 500) setYerel(deger);
  }, [deger]);

  const degistir = (v: number) => {
    sonDokunma.current = Date.now();
    setYerel(v);
    if (zamanlayici.current) window.clearTimeout(zamanlayici.current);
    zamanlayici.current = window.setTimeout(() => onChange(v), gecikmeMs);
  };
  const oran = max > min ? ((yerel - min) / (max - min)) * 100 : 0;
  return (
    <label className={`kaydirici ${vurgu ? `vurgu-${vurgu}` : ""}`}>
      <span className="kaydirici-etiket">
        <span>{etiket}</span>
        <strong>{bicim ? bicim(yerel) : `${Math.round(yerel * 100) / 100}${birim}`}</strong>
      </span>
      <input type="range" min={min} max={max} step={adim} value={yerel} style={{ "--oran": `${oran}%` } as React.CSSProperties} onChange={(e) => degistir(Number(e.target.value))} />
    </label>
  );
}

export function SecenekGrubu<T extends string>({
  secenekler,
  deger,
  onChange,
  buyuk,
  ikonlar,
}: {
  secenekler: Record<T, string>;
  deger: T;
  onChange: (v: T) => void;
  buyuk?: boolean;
  ikonlar?: Partial<Record<T, ReactNode>>;
}) {
  return (
    <div className={`secenek-grubu ${buyuk ? "buyuk" : ""}`} role="radiogroup">
      {(Object.keys(secenekler) as T[]).map((anahtar) => (
        <button key={anahtar} type="button" role="radio" aria-checked={anahtar === deger} className={anahtar === deger ? "secili" : ""} onClick={() => onChange(anahtar)}>
          {ikonlar?.[anahtar] && <span className="secenek-ikon">{ikonlar[anahtar]}</span>}
          {secenekler[anahtar]}
        </button>
      ))}
    </div>
  );
}

export function Anahtar({ acik, onChange, etiket, aciklama }: { acik: boolean; onChange: (v: boolean) => void; etiket?: string; aciklama?: string }) {
  return (
    <button type="button" role="switch" aria-checked={acik} className={`anahtar ${acik ? "acik" : ""}`} onClick={() => onChange(!acik)}>
      <span className="anahtar-ray">
        <span className="anahtar-topuz" />
      </span>
      {(etiket || aciklama) && (
        <span className="anahtar-metin">
          {etiket && <strong>{etiket}</strong>}
          {aciklama && <small>{aciklama}</small>}
        </span>
      )}
    </button>
  );
}

export function Rozet({ tur = "notr", children, title }: { tur?: "iyi" | "kotu" | "uyari" | "notr" | "amber"; children: ReactNode; title?: string }) {
  return (
    <span className={`rozet ${tur}`} title={title}>
      {children}
    </span>
  );
}

/** Durum lambası: bağlı (yeşil), bağlanıyor (amber, nefes alır), kopuk (kırmızı), pasif (gri). */
export function Led({ durum, etiket, title }: { durum: "iyi" | "kotu" | "bekliyor" | "pasif"; etiket: string; title?: string }) {
  return (
    <span className={`led led-${durum}`} title={title}>
      <span className="led-isik" />
      <span className="led-etiket">{etiket}</span>
    </span>
  );
}

/** İki aşamalı tehlikeli işlem: ilk tık "Emin misin?", ikinci tık uygular; 3 sn içinde tıklanmazsa geri döner. */
export function OnayliDugme({ children, onay = "Emin misin?", onClick, sinif = "" }: { children: ReactNode; onay?: string; onClick: () => void; sinif?: string }) {
  const [bekliyor, setBekliyor] = useState(false);
  useEffect(() => {
    if (!bekliyor) return;
    const t = window.setTimeout(() => setBekliyor(false), 3000);
    return () => window.clearTimeout(t);
  }, [bekliyor]);
  return (
    <button
      type="button"
      className={`${sinif} ${bekliyor ? "onay-bekliyor" : ""}`}
      onClick={() => {
        if (bekliyor) {
          setBekliyor(false);
          onClick();
        } else setBekliyor(true);
      }}
    >
      {bekliyor ? onay : children}
    </button>
  );
}

export function saatBicimi(saat: number): string {
  const s = Math.floor(saat);
  const d = Math.round((saat - s) * 60);
  return `${String(s % 24).padStart(2, "0")}:${String(d).padStart(2, "0")}`;
}

export function sureBicimi(ms: number): string {
  const toplamSn = Math.floor(ms / 1000);
  const dk = Math.floor(toplamSn / 60);
  const sn = toplamSn % 60;
  return `${String(dk).padStart(2, "0")}:${String(sn).padStart(2, "0")}`;
}

/** Yön (0–359) → okunur metin: "35° sağ-ön". */
export function yonMetni(yon: number): string {
  const y = ((yon % 360) + 360) % 360;
  const a = y > 180 ? y - 360 : y;
  const taraf = Math.abs(a) < 8 ? "karşı" : Math.abs(a) > 172 ? "arka" : a > 0 ? (a < 70 ? "sağ-ön" : a < 110 ? "sağ" : "sağ-arka") : a > -70 ? "sol-ön" : a > -110 ? "sol" : "sol-arka";
  return `${Math.abs(a)}° ${taraf}`;
}

/* --- İkonlar: tek çizgi ağırlığı, 20 px ızgara --- */
const I = ({ children, boyut = 18 }: { children: ReactNode; boyut?: number }) => (
  <svg width={boyut} height={boyut} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
export const Ikon = {
  sahne: () => (
    <I>
      <path d="M2 14l5-7 4 5 3-3 4 5" />
      <circle cx="14" cy="5" r="2" />
    </I>
  ),
  efekt: () => (
    <I>
      <path d="M10 2l2 5 5 1-4 4 1 5-4-2-4 2 1-5-4-4 5-1z" />
    </I>
  ),
  figur: () => (
    <I>
      <circle cx="10" cy="4.5" r="2.5" />
      <path d="M5 18v-5l5-3 5 3v5M7 10l3-2 3 2" />
    </I>
  ),
  senaryo: () => (
    <I>
      <path d="M3 4h14M3 10h9M3 16h6" />
      <path d="M15 13l3 2-3 2z" fill="currentColor" />
    </I>
  ),
  sistem: () => (
    <I>
      <circle cx="10" cy="10" r="3" />
      <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4" />
    </I>
  ),
  gunes: () => (
    <I>
      <circle cx="10" cy="10" r="3.5" />
      <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.5 4.5l1.5 1.5M14 14l1.5 1.5M4.5 15.5L6 14M14 6l1.5-1.5" />
    </I>
  ),
  ay: () => (
    <I>
      <path d="M15 12.5A6 6 0 0 1 7.5 5a6 6 0 1 0 7.5 7.5z" />
    </I>
  ),
  ruzgar: () => (
    <I>
      <path d="M3 7h9a2 2 0 1 0-2-2M3 11h12a2 2 0 1 1-2 2M3 15h6" />
    </I>
  ),
  helikopter: () => (
    <I>
      <path d="M2 4h14M9 4v3M6 10a4 3 0 0 1 8 0v1a3 3 0 0 1-3 3H8l-4 1v-3a3 3 0 0 1 2-2zM5 17h8" />
    </I>
  ),
  oynat: () => (
    <I>
      <path d="M6 4l10 6-10 6z" fill="currentColor" stroke="none" />
    </I>
  ),
  duraklat: () => (
    <I>
      <path d="M6 4v12M14 4v12" strokeWidth="2.6" />
    </I>
  ),
  durdur: () => (
    <I>
      <rect x="5" y="5" width="10" height="10" rx="1" fill="currentColor" stroke="none" />
    </I>
  ),
  yenile: () => (
    <I>
      <path d="M16 10a6 6 0 1 1-2-4.5M16 3v4h-4" />
    </I>
  ),
  pencere: () => (
    <I>
      <rect x="3" y="4" width="14" height="12" rx="1.5" />
      <path d="M3 8h14" />
    </I>
  ),
  uyari: () => (
    <I>
      <path d="M10 3l8 14H2z" />
      <path d="M10 8v4M10 14.5v.5" />
    </I>
  ),
  kapat: () => (
    <I boyut={14}>
      <path d="M5 5l10 10M15 5L5 15" />
    </I>
  ),
};
