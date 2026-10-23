import { api } from "../api";
import { useArayuz } from "../arayuz";
import { BOLGE_ETIKETLERI, MEVSIM_ETIKETLERI, YAGIS_ETIKETLERI, type SimulasyonDurumu } from "../tipler";
import { Bolum, Ikon, Kaydirici, SecenekGrubu, saatBicimi } from "./ortak";

type Calistir = <T>(islem: () => Promise<T>) => Promise<T | undefined>;

const BOLGE_ACIKLAMA: Record<string, string> = {
  kirsal_acik_arazi: "Bozkır, tarla, toprak yol",
  meskun_mahal: "Köy / kasaba sokağı",
  ormanlik: "Çam ve karışık orman",
  daglik: "Kayalık sırt, yayla",
  us_bolgesi: "Hangar, beton apron",
};

export function BolgePaneli({ durum, calistir }: { durum: SimulasyonDurumu; calistir: Calistir }) {
  const { bildir } = useArayuz();
  return (
    <Bolum baslik="Bölge" altBaslik="Tek dokunuşla arazi değişir; kraterler ve duman temizlenir" ikon={<Ikon.sahne />}>
      <div className="bolge-kartlari">
        {(Object.keys(BOLGE_ETIKETLERI) as Array<keyof typeof BOLGE_ETIKETLERI>).map((b) => (
          <button
            key={b}
            type="button"
            className={`bolge-karti ${durum.bolge === b ? "secili" : ""}`}
            onClick={() => void calistir(() => api.bolgeSec(b)).then((r) => r && bildir({ tur: "basari", baslik: `Bölge: ${BOLGE_ETIKETLERI[b]}` }))}
          >
            <strong>{BOLGE_ETIKETLERI[b]}</strong>
            <small>{BOLGE_ACIKLAMA[b]}</small>
          </button>
        ))}
      </div>
    </Bolum>
  );
}

const ZAMANLAR: Array<[number, string]> = [
  [5.5, "Şafak"],
  [8, "Sabah"],
  [12, "Öğle"],
  [16, "İkindi"],
  [19.5, "Gün batımı"],
  [21, "Alacakaranlık"],
  [23.5, "Gece"],
];

export function OrtamPaneli({ durum, calistir }: { durum: SimulasyonDurumu; calistir: Calistir }) {
  const o = durum.ortam;
  const guncelle = (k: Partial<typeof o>) => void calistir(() => api.ortam(k));
  return (
    <Bolum baslik="Ortam" altBaslik="Mevsim, gün saati ve hava; oynatıcı uygun panoramayı kendisi seçer" ikon={<Ikon.gunes />}>
      <div className="satir">
        <span className="etiket">Mevsim</span>
        <SecenekGrubu secenekler={MEVSIM_ETIKETLERI} deger={o.mevsim} onChange={(mevsim) => guncelle({ mevsim })} />
      </div>

      <div className="gun-cizgisi" aria-hidden="true">
        <div className="gun-cizgisi-ray">
          <span className="gun-cizgisi-gunes" style={{ left: `${(o.saat / 24) * 100}%` }} />
        </div>
      </div>
      <Kaydirici etiket="Saat" deger={o.saat} min={0} max={24} adim={0.25} bicim={saatBicimi} onChange={(saat) => guncelle({ saat })} vurgu="amber" />
      <div className="hizli-zaman">
        {ZAMANLAR.map(([s, ad]) => (
          <button key={ad} type="button" className={`kucuk ${Math.abs(o.saat - s) < 0.3 ? "secili" : "ikincil"}`} onClick={() => guncelle({ saat: s })}>
            {ad}
          </button>
        ))}
      </div>

      <div className="satir">
        <span className="etiket">Yağış</span>
        <SecenekGrubu secenekler={YAGIS_ETIKETLERI} deger={o.yagis} onChange={(yagis) => guncelle({ yagis })} />
      </div>
      <div className="iki-sutun">
        <Kaydirici etiket="Bulut" deger={o.bulut} min={0} max={1} bicim={(v) => `%${Math.round(v * 100)}`} onChange={(bulut) => guncelle({ bulut })} />
        <Kaydirici etiket="Sis" deger={o.sis} min={0} max={1} bicim={(v) => `%${Math.round(v * 100)}`} onChange={(sis) => guncelle({ sis })} />
        <Kaydirici etiket="Rüzgâr şiddeti" deger={o.ruzgarSiddeti} min={0} max={1} bicim={(v) => `%${Math.round(v * 100)}`} onChange={(ruzgarSiddeti) => guncelle({ ruzgarSiddeti })} />
        <Kaydirici etiket="Rüzgâr yönü" deger={o.ruzgarYonu} min={0} max={359} adim={1} birim="°" onChange={(ruzgarYonu) => guncelle({ ruzgarYonu })} />
      </div>
    </Bolum>
  );
}
