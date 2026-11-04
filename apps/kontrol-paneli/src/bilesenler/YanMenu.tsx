/** Görev rayı: beş bölüm. Geniş ekranda solda dikey, tablette altta yatay sekme çubuğu. */
import { useArayuz, type Sekme } from "../arayuz";
import { Ikon } from "./ortak";

const SEKMELER: Array<{ id: Sekme; ad: string; ikon: () => JSX.Element; kisayol: string }> = [
  { id: "sahne", ad: "Sahne", ikon: Ikon.sahne, kisayol: "F1" },
  { id: "efektler", ad: "Efektler", ikon: Ikon.efekt, kisayol: "F2" },
  { id: "figurler", ad: "Figürler", ikon: Ikon.figur, kisayol: "F3" },
  { id: "senaryo", ad: "Senaryo", ikon: Ikon.senaryo, kisayol: "F4" },
  { id: "sistem", ad: "Sistem", ikon: Ikon.sistem, kisayol: "F5" },
];

export function YanMenu({ rozetler }: { rozetler?: Partial<Record<Sekme, number | string>> }) {
  const { sekme, setSekme } = useArayuz();
  return (
    <nav className="yan-menu" aria-label="Bölümler">
      {SEKMELER.map((s) => (
        <button key={s.id} type="button" className={sekme === s.id ? "secili" : ""} onClick={() => setSekme(s.id)} title={`${s.ad} (${s.kisayol})`}>
          <span className="yan-ikon">
            <s.ikon />
          </span>
          <span className="yan-ad">{s.ad}</span>
          {rozetler?.[s.id] !== undefined && rozetler[s.id] !== 0 && <span className="yan-rozet">{rozetler[s.id]}</span>}
        </button>
      ))}
    </nav>
  );
}

export const SEKME_KISAYOLLARI: Record<string, Sekme> = { F1: "sahne", F2: "efektler", F3: "figurler", F4: "senaryo", F5: "sistem" };
