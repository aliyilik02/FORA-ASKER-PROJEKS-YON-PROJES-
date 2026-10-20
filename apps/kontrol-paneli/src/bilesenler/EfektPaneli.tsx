import { useState } from "react";
import { api } from "../api";
import { EFEKT_ETIKETLERI, type EfektTuru, type SimulasyonDurumu } from "../tipler";
import { Bolum, Kaydirici } from "./ortak";

type Calistir = <T>(islem: () => Promise<T>) => Promise<T | undefined>;

const ODA1_EFEKTLERI: EfektTuru[] = ["patlama", "toz_duman", "gurultu", "bagirma", "cagirma"];

export function EfektPaneli({ durum, calistir }: { durum: SimulasyonDurumu; calistir: Calistir }) {
  const [siddet, setSiddet] = useState(1);
  const [yon, setYon] = useState(0);
  const m = durum.izliMermi;
  const mermiGuncelle = (k: Partial<typeof m>) => void calistir(() => api.izliMermi(k));

  return (
    <Bolum baslik="Efektler" altBaslik="Şartname §4–§5 – patlama, gürültü, bağırma, çağırma ve izli mermi">
      <div className="efekt-ayarlari">
        <Kaydirici etiket="Şiddet" deger={siddet} min={0} max={1} bicim={(v) => `%${Math.round(v * 100)}`} onChange={setSiddet} />
        <Kaydirici etiket="Yön (konumsal ses)" deger={yon} min={0} max={359} adim={1} birim="°" onChange={setYon} />
      </div>
      <div className="efekt-dugmeleri">
        {ODA1_EFEKTLERI.map((tur) => (
          <button
            key={tur}
            type="button"
            className={`efekt ${tur === "patlama" ? "tehlike" : ""}`}
            onClick={() => void calistir(() => api.efekt({ tur, siddet, yon }))}
          >
            {EFEKT_ETIKETLERI[tur]}
          </button>
        ))}
      </div>

      <hr />
      <div className="satir">
        <span className="etiket">İzli mermi</span>
        <label className="anahtar">
          <input type="checkbox" checked={m.aktif} onChange={(e) => mermiGuncelle({ aktif: e.target.checked })} />
          <span>{m.aktif ? "Açık" : "Kapalı"}</span>
        </label>
      </div>
      <div className="satir">
        <span className="etiket">Çıkış noktası</span>
        <div className="secenek-grubu">
          {([0, 1, 2] as const).map((n) => (
            <button key={n} type="button" className={m.cikisNoktasi === n ? "secili" : ""} onClick={() => mermiGuncelle({ cikisNoktasi: n })}>
              {["Sol duvar", "Orta duvar", "Sağ duvar"][n]}
            </button>
          ))}
        </div>
      </div>
      <Kaydirici etiket="Mermi yönü" deger={m.yon} min={-90} max={90} adim={1} birim="°" onChange={(yon) => mermiGuncelle({ yon })} />
      <Kaydirici etiket="Sıklık" deger={m.siklik} min={0.5} max={20} adim={0.5} birim=" mermi/sn" onChange={(siklik) => mermiGuncelle({ siklik })} />
    </Bolum>
  );
}
