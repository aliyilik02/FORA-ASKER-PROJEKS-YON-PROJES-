import { api } from "../api";
import type { SimulasyonDurumu } from "../tipler";
import { Bolum, Kaydirici } from "./ortak";

type Calistir = <T>(islem: () => Promise<T>) => Promise<T | undefined>;

function hexe(r: number, g: number, b: number) {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

export function IsikPaneli({ durum, calistir }: { durum: SimulasyonDurumu; calistir: Calistir }) {
  const i = durum.isik;
  const guncelle = (k: Partial<typeof i>) => void calistir(() => api.isik(k));
  return (
    <Bolum
      baslik="Ortam Işığı (DMX / Art-Net)"
      altBaslik="Şartname §6 – ışık senaryoyla birlikte veya elle"
      sag={<span className="isik-onizleme" style={{ background: hexe(i.r, i.g, i.b), opacity: 0.25 + i.parlaklik * 0.75 }} />}
    >
      <div className="satir">
        <span className="etiket">Senaryoya bağlı</span>
        <label className="anahtar">
          <input type="checkbox" checked={i.senaryoyaBagli} onChange={(e) => guncelle({ senaryoyaBagli: e.target.checked })} />
          <span>{i.senaryoyaBagli ? "Gün ışığı ve patlamalarla otomatik" : "Elle kontrol"}</span>
        </label>
      </div>
      <Kaydirici etiket="Parlaklık" deger={i.parlaklik} min={0} max={1} bicim={(v) => `%${Math.round(v * 100)}`} onChange={(parlaklik) => guncelle({ parlaklik })} />
      <div className="satir">
        <span className="etiket">Renk</span>
        <input
          type="color"
          value={hexe(i.r, i.g, i.b)}
          disabled={i.senaryoyaBagli}
          onChange={(e) => {
            const v = e.target.value;
            guncelle({ r: parseInt(v.slice(1, 3), 16), g: parseInt(v.slice(3, 5), 16), b: parseInt(v.slice(5, 7), 16) });
          }}
        />
        <code>
          R{i.r} G{i.g} B{i.b}
        </code>
      </div>
    </Bolum>
  );
}
