import { api } from "../api";
import { BOLGE_ETIKETLERI, MEVSIM_ETIKETLERI, YAGIS_ETIKETLERI, type SimulasyonDurumu } from "../tipler";
import { Bolum, Kaydirici, SecenekGrubu, saatBicimi } from "./ortak";

type Calistir = <T>(islem: () => Promise<T>) => Promise<T | undefined>;

export function BolgePaneli({ durum, calistir }: { durum: SimulasyonDurumu; calistir: Calistir }) {
  return (
    <Bolum baslik="Bölge" altBaslik="Şartname §2 – beş bölge, tek komutla geçiş">
      <SecenekGrubu secenekler={BOLGE_ETIKETLERI} deger={durum.bolge} onChange={(b) => void calistir(() => api.bolgeSec(b))} />
    </Bolum>
  );
}

export function OrtamPaneli({ durum, calistir }: { durum: SimulasyonDurumu; calistir: Calistir }) {
  const o = durum.ortam;
  const guncelle = (k: Partial<typeof o>) => void calistir(() => api.ortam(k));
  return (
    <Bolum baslik="Ortam" altBaslik="Şartname §3 – mevsim, saat, bulut, sis, yağış ve rüzgâr">
      <div className="satir">
        <span className="etiket">Mevsim</span>
        <SecenekGrubu secenekler={MEVSIM_ETIKETLERI} deger={o.mevsim} onChange={(mevsim) => guncelle({ mevsim })} />
      </div>
      <div className="hizli-saat">
        <span className="etiket">Hızlı seçim</span>
        <button type="button" onClick={() => guncelle({ saat: 6 })}>Şafak</button>
        <button type="button" onClick={() => guncelle({ saat: 12 })}>Öğle</button>
        <button type="button" onClick={() => guncelle({ saat: 19 })}>Gün batımı</button>
        <button type="button" onClick={() => guncelle({ saat: 23 })}>Gece</button>
      </div>
      <Kaydirici etiket="Saat" deger={o.saat} min={0} max={24} adim={0.25} bicim={saatBicimi} onChange={(saat) => guncelle({ saat })} />
      <Kaydirici etiket="Bulut" deger={o.bulut} min={0} max={1} bicim={(v) => `%${Math.round(v * 100)}`} onChange={(bulut) => guncelle({ bulut })} />
      <Kaydirici etiket="Sis" deger={o.sis} min={0} max={1} bicim={(v) => `%${Math.round(v * 100)}`} onChange={(sis) => guncelle({ sis })} />
      <div className="satir">
        <span className="etiket">Yağış</span>
        <SecenekGrubu secenekler={YAGIS_ETIKETLERI} deger={o.yagis} onChange={(yagis) => guncelle({ yagis })} />
      </div>
      <Kaydirici
        etiket="Rüzgâr şiddeti"
        deger={o.ruzgarSiddeti}
        min={0}
        max={1}
        bicim={(v) => `%${Math.round(v * 100)}`}
        onChange={(ruzgarSiddeti) => guncelle({ ruzgarSiddeti })}
      />
      <Kaydirici etiket="Rüzgâr yönü" deger={o.ruzgarYonu} min={0} max={359} adim={1} birim="°" onChange={(ruzgarYonu) => guncelle({ ruzgarYonu })} />
    </Bolum>
  );
}
