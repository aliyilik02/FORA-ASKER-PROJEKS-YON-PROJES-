/**
 * Sahne pusulası: U duvarın kuş bakışı görünümü. Merkez = eğitim alanı (izleyici); üç yay = sol,
 * orta, sağ duvar. Üzerinde: güneş/ay yönü, rüzgâr oku, aktif figürler, son efektlerin halkaları
 * (zamanla söner), helikopter. Tıklayıp sürükleyince yön seçilir; seçili yön kama olarak gösterilir.
 * Bu, panelin imzası: eğitmen yönü bir slider yerine sahnenin kendisinden seçer.
 */
import { useRef, useState, type PointerEvent } from "react";
import type { EfektIstegi, FigurKomutu, HelikopterDurumu, OrtamAyarlari } from "../tipler";
import { azimutYon } from "../arayuz";

export interface PusulaIsareti {
  azimut: number; // -180..180
  mesafe: number; // 0..1 (0 merkez, 1 duvar)
  tur: "figur" | "helikopter";
  etiket?: string;
}

const CX = 160;
const CY = 160;
const R_DUVAR = 122;

function nokta(azimut: number, r: number) {
  const a = (azimut * Math.PI) / 180;
  return { x: CX + Math.sin(a) * r, y: CY - Math.cos(a) * r };
}
function yay(bas: number, son: number, r: number) {
  const p1 = nokta(bas, r);
  const p2 = nokta(son, r);
  return `M ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} A ${r} ${r} 0 0 1 ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
}

/** Güneş konumu (oynatıcıdaki projeksiyon.ts ile aynı eğri). */
function gunesKonumu(saat: number) {
  const t = (saat - 5.75) / 14;
  return { azimut: -90 + t * 180, yukseklik: Math.sin(t * Math.PI) * 65 };
}

export function Pusula({
  yon,
  onYon,
  ortam,
  figurler,
  efektler,
  helikopter,
  simdi,
}: {
  yon: number;
  onYon: (yon: number) => void;
  ortam: OrtamAyarlari;
  figurler: Array<FigurKomutu & { id: string }>;
  efektler: Array<EfektIstegi & { zaman: number }>;
  helikopter: HelikopterDurumu;
  simdi: number;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const [surukleniyor, setSurukleniyor] = useState(false);
  const [fareYon, setFareYon] = useState<number | null>(null);

  const konumdanYon = (e: PointerEvent<SVGSVGElement>) => {
    const r = svg.current!.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 320 - CX;
    const y = ((e.clientY - r.top) / r.height) * 320 - CY;
    return azimutYon((Math.atan2(x, -y) * 180) / Math.PI);
  };

  const gunes = gunesKonumu(ortam.saat);
  const gunduz = gunes.yukseklik > -12;
  const gunesN = nokta(gunes.azimut, R_DUVAR + 22);
  const ruzgarN = nokta(ortam.ruzgarYonu, R_DUVAR + 22);
  const secN = nokta(yon, R_DUVAR);
  const secIc = nokta(yon, 18);
  const yonA = ((yon + 180) % 360) - 180;
  const duvarDisi = Math.abs(yonA) > 135;

  return (
    <div className={`pusula ${surukleniyor ? "surukleniyor" : ""}`}>
      <svg
        ref={svg}
        viewBox="0 0 320 320"
        role="slider"
        aria-label="Yön seçimi"
        aria-valuenow={yon}
        aria-valuemin={0}
        aria-valuemax={359}
        tabIndex={0}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setSurukleniyor(true);
          onYon(konumdanYon(e));
        }}
        onPointerMove={(e) => {
          const y = konumdanYon(e);
          setFareYon(y);
          if (surukleniyor) onYon(y);
        }}
        onPointerUp={() => setSurukleniyor(false)}
        onPointerLeave={() => {
          setFareYon(null);
          setSurukleniyor(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") onYon(yon - 5);
          if (e.key === "ArrowRight") onYon(yon + 5);
          if (e.key === "ArrowUp") onYon(0);
        }}
      >
        <defs>
          <radialGradient id="pusula-zemin" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--masa-ust)" />
            <stop offset="100%" stopColor="var(--gece)" />
          </radialGradient>
        </defs>
        {/* zemin ve mesafe halkaları */}
        <circle cx={CX} cy={CY} r={R_DUVAR + 36} fill="url(#pusula-zemin)" />
        {[0.33, 0.66].map((k) => (
          <circle key={k} cx={CX} cy={CY} r={R_DUVAR * k} className="pusula-halka" />
        ))}
        <circle cx={CX} cy={CY} r={R_DUVAR} className="pusula-halka" />
        {/* arka (duvarsız) bölge */}
        <path d={`${yay(135, 225, R_DUVAR)} L ${CX} ${CY} Z`} className="pusula-arka" />
        {/* seçili yön kaması */}
        <path d={`M ${secIc.x} ${secIc.y} L ${secN.x} ${secN.y}`} className={`pusula-sec-cizgi ${duvarDisi ? "disi" : ""}`} />
        <circle cx={secN.x} cy={secN.y} r="7" className={`pusula-sec-nokta ${duvarDisi ? "disi" : ""}`} />
        {/* duvarlar */}
        <path d={yay(-135, -45, R_DUVAR)} className="pusula-duvar" />
        <path d={yay(-45, 45, R_DUVAR)} className="pusula-duvar orta" />
        <path d={yay(45, 135, R_DUVAR)} className="pusula-duvar" />
        {[
          [-90, "SOL"],
          [0, "ORTA"],
          [90, "SAĞ"],
        ].map(([a, ad]) => {
          const p = nokta(Number(a), R_DUVAR + 12);
          return (
            <text key={ad} x={p.x} y={p.y} className="pusula-duvar-ad" textAnchor="middle" dominantBaseline="middle">
              {ad}
            </text>
          );
        })}
        {/* efekt halkaları: 8 sn içinde büyüyüp söner */}
        {efektler
          .filter((e) => simdi - e.zaman < 8000 && e.yon !== undefined)
          .map((e, i) => {
            const yas = (simdi - e.zaman) / 8000;
            const uzak = e.tur === "uzak_patlama" || e.tur === "uzak_mermi_sesi";
            const p = nokta(e.yon ?? 0, R_DUVAR * (uzak ? 0.95 : 0.45 + (1 - (e.siddet ?? 1)) * 0.3));
            const r = 6 + yas * 26;
            return (
              <g key={`${e.zaman}-${i}`} className={`pusula-efekt ${e.tur === "patlama" || uzak ? "patlama" : ""}`} style={{ opacity: 1 - yas }}>
                <circle cx={p.x} cy={p.y} r={r} />
                <circle cx={p.x} cy={p.y} r="3.5" className="dolu" />
              </g>
            );
          })}
        {/* figürler */}
        {figurler.map((f) => {
          const yuk = f.yukseklik ?? -4;
          const mesafe = Math.min(1, 1.7 / Math.tan((Math.max(0.5, -yuk) * Math.PI) / 180) / 40);
          const p = nokta(f.azimut ?? 0, 16 + mesafe * (R_DUVAR - 24));
          return (
            <g key={f.id} className="pusula-figur">
              <circle cx={p.x} cy={p.y} r="5.5" />
              <title>{f.klip}</title>
            </g>
          );
        })}
        {/* helikopter */}
        {helikopter !== "yok" && (() => {
          const uzak = helikopter === "yaklasiyor" || helikopter === "kalkiyor";
          const p = nokta(12, R_DUVAR * (uzak ? 1.1 : 0.9));
          return (
            <g className={`pusula-heli ${uzak ? "ucusta" : ""}`} transform={`translate(${p.x} ${p.y})`}>
              <circle r="7" />
              <path d="M-7 0h14M0-7v14" className="pala" />
            </g>
          );
        })()}
        {/* güneş / ay ve rüzgâr */}
        <g transform={`translate(${gunesN.x} ${gunesN.y})`} className={gunduz ? "pusula-gunes" : "pusula-ay"}>
          <circle r="6" />
          {gunduz && [0, 45, 90, 135, 180, 225, 270, 315].map((a) => <line key={a} x1={0} y1={-8} x2={0} y2={-10} transform={`rotate(${a})`} />)}
        </g>
        <g transform={`translate(${ruzgarN.x} ${ruzgarN.y}) rotate(${ortam.ruzgarYonu + 180})`} className="pusula-ruzgar" style={{ opacity: 0.35 + ortam.ruzgarSiddeti * 0.65 }}>
          <path d="M0 -9 L4 -2 L1 -2 L1 9 L-1 9 L-1 -2 L-4 -2 Z" />
        </g>
        {/* merkez: izleyici */}
        <circle cx={CX} cy={CY} r="5" className="pusula-merkez" />
        {/* imleç önizlemesi */}
        {fareYon !== null && !surukleniyor && (() => {
          const p = nokta(fareYon, R_DUVAR);
          return <circle cx={p.x} cy={p.y} r="4" className="pusula-imlec" />;
        })()}
      </svg>
      <div className="pusula-okuma">
        <span className="pusula-derece">{yon}°</span>
        <span className="pusula-aciklama">{duvarDisi ? "arka — duvarda görünmez, yalnız ses" : yonA === 0 ? "karşı" : yonA > 0 ? (yonA <= 45 ? "orta duvar, sağ" : "sağ duvar") : yonA >= -45 ? "orta duvar, sol" : "sol duvar"}</span>
      </div>
    </div>
  );
}
