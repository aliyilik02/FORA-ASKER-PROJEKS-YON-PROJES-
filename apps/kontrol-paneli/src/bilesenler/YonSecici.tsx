/**
 * Yön seçici (D2, 4 Kasım 2026; pusulanın yerine): beş bölge düğmesi (sol, sol-ön, karşı, sağ-ön, sağ) + ±5° ince
 * ayar + derece. Eğitmen "sol / karşı / sağ" düşünür; derece yalnız gerektiğinde. Çizim yok, saat tetiği yok: eski
 * SVG pusula saniyede 4 kez yeniden çizilip oynatıcının kare hızını düşürüyordu. Sahnedeki öğeler (figür, yaralı,
 * düşman cephesi, helikopter) altta metin olarak, yönleriyle listelenir.
 */
import type { FigurKomutu, HelikopterDurumu } from "../tipler";
import { HELIKOPTER_ETIKETLERI } from "../tipler";
import { yonMetni } from "./ortak";

const BOLGELER: Array<{ aci: number; ad: string }> = [
  { aci: -90, ad: "Sol" },
  { aci: -45, ad: "Sol-ön" },
  { aci: 0, ad: "Karşı" },
  { aci: 45, ad: "Sağ-ön" },
  { aci: 90, ad: "Sağ" },
];

/** 0–359 → −180..180 */
const imzali = (yon: number) => ((((yon % 360) + 540) % 360) - 180);

export function YonSecici({
  yon,
  onYon,
  figurler = [],
  dusmanYonu = null,
  helikopter = "yok",
  helikopterYonu,
}: {
  yon: number;
  onYon: (yon: number) => void;
  figurler?: Array<FigurKomutu & { id: string }>;
  dusmanYonu?: number | null;
  helikopter?: HelikopterDurumu;
  helikopterYonu?: number;
}) {
  const a = imzali(yon);
  // Seçili bölge: en yakın bölge merkezi (±22,5°); arka yönler (|a| > 112,5) hiçbirini seçmez
  const seciliBolge = Math.abs(a) <= 112.5 ? BOLGELER.reduce((en, b) => (Math.abs(b.aci - a) < Math.abs(en.aci - a) ? b : en)) : null;
  const yaralilar = figurler.filter((f) => f.poz === "yarali");
  const digerler = figurler.filter((f) => f.poz !== "yarali");
  return (
    <div className="yon-secici">
      <div className="yon-secici-satir">
        <span className="yon-secici-etiket" id="yon-secici-etiket">
          Yön
        </span>
        <div className="yon-bolgeler" role="group" aria-labelledby="yon-secici-etiket">
          {BOLGELER.map((b) => (
            <button key={b.ad} type="button" className={seciliBolge?.aci === b.aci ? "secili" : ""} aria-pressed={seciliBolge?.aci === b.aci} onClick={() => onYon(b.aci)}>
              {b.ad}
            </button>
          ))}
        </div>
        <div className="yon-ince">
          <button type="button" aria-label="5 derece sola" onClick={() => onYon(yon - 5)}>
            −5°
          </button>
          <span className="yon-derece" aria-live="polite">
            {a > 0 ? "+" : ""}
            {a}°
          </span>
          <button type="button" aria-label="5 derece sağa" onClick={() => onYon(yon + 5)}>
            +5°
          </button>
        </div>
      </div>
      <div className="yon-sahne" aria-label="Sahnedekiler">
        {digerler.length > 0 && (
          <span>
            <i /> {digerler.length} figür · {digerler.map((f) => yonMetni(((f.azimut ?? 0) + 360) % 360).split(" ")[1]).filter((v, i, d) => d.indexOf(v) === i).join(", ")}
          </span>
        )}
        {yaralilar.length > 0 && (
          <span>
            <i className="yarali" /> {yaralilar.length} yaralı · {yonMetni(((yaralilar[yaralilar.length - 1].azimut ?? 0) + 360) % 360)}
          </span>
        )}
        {dusmanYonu !== null && (
          <span>
            <i className="dusman" /> düşman · {yonMetni(dusmanYonu)}
          </span>
        )}
        {helikopter !== "yok" && (
          <span>
            <i className="heli" /> {HELIKOPTER_ETIKETLERI[helikopter].toLowerCase()} · {yonMetni(helikopterYonu ?? 12)}
          </span>
        )}
        {figurler.length === 0 && dusmanYonu === null && helikopter === "yok" && <span>Sahne boş</span>}
      </div>
    </div>
  );
}
