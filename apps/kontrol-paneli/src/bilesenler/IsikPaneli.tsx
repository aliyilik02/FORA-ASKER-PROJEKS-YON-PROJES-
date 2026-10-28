import { api } from "../api";
import type { SimulasyonDurumu } from "../tipler";
import { Anahtar, Bolum, Ikon, Kaydirici } from "./ortak";

type Calistir = <T>(islem: () => Promise<T>) => Promise<T | undefined>;

function hexe(r: number, g: number, b: number) {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

const RENKLER: Array<[string, [number, number, number]]> = [
  ["Gün ışığı", [255, 244, 224]],
  ["Akşam", [255, 190, 130]],
  ["Ay ışığı", [120, 150, 210]],
  ["Kırmızı (gece görüşü)", [200, 40, 30]],
];

export function IsikPaneli({ durum, calistir }: { durum: SimulasyonDurumu; calistir: Calistir }) {
  const i = durum.isik;
  const guncelle = (k: Partial<typeof i>) => void calistir(() => api.isik(k));
  return (
    <Bolum
      baslik="Ortam Işığı"
      altBaslik="DMX / Art-Net üzerinden oda aydınlatması"
      ikon={<Ikon.gunes />}
      sag={<span className="isik-onizleme" style={{ background: hexe(i.r, i.g, i.b), opacity: 0.25 + i.parlaklik * 0.75 }} />}
    >
      <Anahtar acik={i.senaryoyaBagli} onChange={(senaryoyaBagli) => guncelle({ senaryoyaBagli })} etiket="Senaryoya bağlı" aciklama={i.senaryoyaBagli ? "Gün ışığı ve patlamalarla otomatik" : "Elle kontrol"} />
      <Kaydirici etiket="Parlaklık" deger={i.parlaklik} min={0} max={1} bicim={(v) => `%${Math.round(v * 100)}`} onChange={(parlaklik) => guncelle({ parlaklik })} vurgu="amber" />
      <div className={`satir ${i.senaryoyaBagli ? "soluk" : ""}`}>
        <span className="etiket">Renk</span>
        <div className="renk-secenekleri">
          {RENKLER.map(([ad, [r, g, b]]) => (
            <button
              key={ad}
              type="button"
              className={`renk-karti ${i.r === r && i.g === g && i.b === b ? "secili" : ""}`}
              disabled={i.senaryoyaBagli}
              onClick={() => guncelle({ r, g, b })}
              title={ad}
            >
              <span style={{ background: hexe(r, g, b) }} />
              {ad}
            </button>
          ))}
          <input
            type="color"
            value={hexe(i.r, i.g, i.b)}
            disabled={i.senaryoyaBagli}
            onChange={(e) => {
              const v = e.target.value;
              guncelle({ r: parseInt(v.slice(1, 3), 16), g: parseInt(v.slice(3, 5), 16), b: parseInt(v.slice(5, 7), 16) });
            }}
            title="Özel renk"
          />
        </div>
      </div>
    </Bolum>
  );
}
