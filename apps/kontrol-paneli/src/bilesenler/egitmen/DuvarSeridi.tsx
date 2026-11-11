/**
 * Duvar şeridi: üç duvarın canlı görüntüsü (oynatıcı bağlı değilse boş üç duvar). Eğitmen görüntüde bir yere dokunur,
 * orada işaret belirir; sonraki her çağrı (asker, patlama, ses…) o yere gider. Derece ve yön adı bilmek gerekmez; altta
 * yedek olarak beş büyük yön düğmesi durur. Sahnedeki askerler, yaralılar ve düşman yönü şeritte işaretlenir.
 */
import { useEffect, useRef, useState } from "react";
import { azimutYon, yonAzimut } from "../../arayuz";
import type { FigurKomutu } from "../../tipler";

/** Şerit üç duvar × 90°: yatay oran (0–1) ↔ sahne azimutu (−135…+135). Duvar içinde perspektif (tan) eşlemesi. */
export function oranAzimut(oran: number): number {
  const o = Math.min(0.9999, Math.max(0, oran)) * 3;
  const duvar = Math.floor(o);
  const u = o - duvar;
  return (duvar - 1) * 90 + (Math.atan(2 * u - 1) * 180) / Math.PI;
}
export function azimutOran(azimut: number): number | null {
  if (azimut < -135 || azimut > 135) return null;
  const duvar = Math.min(2, Math.max(0, Math.floor((azimut + 135) / 90)));
  const yerel = azimut - (duvar - 1) * 90;
  return (duvar + (Math.tan((yerel * Math.PI) / 180) + 1) / 2) / 3;
}

const YONLER: Array<[number, string]> = [
  [-90, "Sol"],
  [-45, "Sol ön"],
  [0, "Karşı"],
  [45, "Sağ ön"],
  [90, "Sağ"],
];
/** Seçili yerin sade adı: en yakın beş yönden biri. */
export function yerAdi(yon: number): string {
  const az = yonAzimut(yon);
  if (Math.abs(az) > 135) return "Arka";
  return [...YONLER].sort((a, b) => Math.abs(a[0] - az) - Math.abs(b[0] - az))[0][1];
}

export function DuvarSeridi({
  yon,
  onYon,
  figurler,
  onizleme,
  temizleniyor,
  dusmanYonu,
  helikopterYonu,
}: {
  yon: number;
  onYon: (yon: number) => void;
  figurler: Array<FigurKomutu & { id: string }>;
  onizleme: { veri: string; zaman: number } | null;
  temizleniyor: boolean;
  dusmanYonu: number | null;
  helikopterYonu: number | null;
}) {
  const kutu = useRef<HTMLDivElement>(null);
  const [simdi, setSimdi] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setSimdi(Date.now()), 2000);
    return () => window.clearInterval(t);
  }, []);
  const canli = onizleme !== null && simdi - onizleme.zaman < 20000;
  const dokun = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = kutu.current?.getBoundingClientRect();
    if (!r || r.width === 0) return;
    onYon(azimutYon(Math.round(oranAzimut((e.clientX - r.left) / r.width))));
  };
  const seciliOran = azimutOran(yonAzimut(yon));
  const yuzde = (o: number) => `${(o * 100).toFixed(2)}%`;
  const dusmanOran = dusmanYonu === null ? null : azimutOran(yonAzimut(dusmanYonu));
  const heliOran = helikopterYonu === null ? null : azimutOran(yonAzimut(helikopterYonu));

  return (
    <div className="duvar-seridi">
      <div className={`duvar-goruntu ${canli ? "canli" : "bos"} ${temizleniyor ? "temizleniyor" : ""}`} ref={kutu} onPointerDown={dokun} role="button" aria-label="Duvarda yer seç: görüntüye dokun">
        {canli && onizleme && <img src={onizleme.veri} alt="" draggable={false} />}
        <div className="duvar-bolmeleri" aria-hidden="true">
          <span>Sol duvar</span>
          <span>Orta duvar</span>
          <span>Sağ duvar</span>
        </div>
        {!canli && <p className="duvar-bos-yazi">Duvar görüntüsü bekleniyor. Yine de yer seçebilirsin: istediğin duvara dokun.</p>}
        {figurler.map((f) => {
          const o = azimutOran(f.azimut ?? 0);
          if (o === null) return null;
          const yarali = f.poz === "yarali";
          const sihhiye = /sihhiyeci/.test(f.klip ?? "");
          const tank = /tank|zirhli/.test(f.klip ?? "");
          return <span key={f.id} className={`duvar-isaret ${yarali ? "yarali" : sihhiye ? "sihhiye" : tank ? "tank" : "asker"}`} style={{ left: yuzde(o) }} title={yarali ? "Yaralı" : sihhiye ? "Sıhhiyeci" : tank ? "Tank" : "Asker"} />;
        })}
        {dusmanOran !== null && (
          <span className="duvar-dusman" style={{ left: yuzde(dusmanOran) }}>
            Düşman
          </span>
        )}
        {heliOran !== null && (
          <span className="duvar-heli" style={{ left: yuzde(heliOran) }}>
            Helikopter
          </span>
        )}
        {seciliOran !== null && (
          <span className="duvar-secili" style={{ left: yuzde(seciliOran) }} aria-hidden="true">
            <i />
          </span>
        )}
      </div>
      <div className="duvar-alt">
        <span className="duvar-soru">Nereye?</span>
        <div className="duvar-yonler">
          {YONLER.map(([az, ad]) => (
            <button key={az} type="button" className={Math.abs(yonAzimut(yon) - az) <= 22 ? "secili" : ""} onClick={() => onYon(azimutYon(az))}>
              {ad}
            </button>
          ))}
        </div>
        <span className="duvar-ipucu">ya da görüntüde bir yere dokun</span>
      </div>
    </div>
  );
}
