import type { ReactNode } from "react";

export function Bolum({ baslik, altBaslik, children, sag }: { baslik: string; altBaslik?: string; children: ReactNode; sag?: ReactNode }) {
  return (
    <section className="bolum">
      <header className="bolum-baslik">
        <div>
          <h2>{baslik}</h2>
          {altBaslik && <p className="alt-baslik">{altBaslik}</p>}
        </div>
        {sag}
      </header>
      <div className="bolum-icerik">{children}</div>
    </section>
  );
}

export function Kaydirici({
  etiket,
  deger,
  min,
  max,
  adim = 0.01,
  birim = "",
  bicim,
  onChange,
}: {
  etiket: string;
  deger: number;
  min: number;
  max: number;
  adim?: number;
  birim?: string;
  bicim?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="kaydirici">
      <span className="kaydirici-etiket">
        {etiket}
        <strong>{bicim ? bicim(deger) : `${Math.round(deger * 100) / 100}${birim}`}</strong>
      </span>
      <input type="range" min={min} max={max} step={adim} value={deger} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

export function SecenekGrubu<T extends string>({
  secenekler,
  deger,
  onChange,
}: {
  secenekler: Record<T, string>;
  deger: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="secenek-grubu">
      {(Object.keys(secenekler) as T[]).map((anahtar) => (
        <button key={anahtar} type="button" className={anahtar === deger ? "secili" : ""} onClick={() => onChange(anahtar)}>
          {secenekler[anahtar]}
        </button>
      ))}
    </div>
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
