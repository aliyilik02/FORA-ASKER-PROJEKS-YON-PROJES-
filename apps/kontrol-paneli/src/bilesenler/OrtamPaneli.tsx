import { api } from "../api";
import { useArayuz } from "../arayuz";
import { BOLGE_ETIKETLERI, GUN_ZAMANI_ETIKETLERI, GUN_ZAMANI_SAATI, MEVSIM_ETIKETLERI, YAGIS_ETIKETLERI, gunZamani, type SimulasyonDurumu } from "../tipler";
import { Anahtar, Bolum, Ikon, Kaydirici, SecenekGrubu } from "./ortak";

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

export function OrtamPaneli({ durum, calistir }: { durum: SimulasyonDurumu; calistir: Calistir }) {
  const o = durum.ortam;
  const guncelle = (k: Partial<typeof o>) => void calistir(() => api.ortam(k));
  return (
    <Bolum baslik="Ortam" altBaslik="Yaz/kış, gündüz/gece ve hava; oynatıcı uygun panoramayı kendisi seçer" ikon={<Ikon.gunes />}>
      <div className="satir">
        <span className="etiket">Mevsim</span>
        <SecenekGrubu secenekler={MEVSIM_ETIKETLERI} deger={o.mevsim} onChange={(mevsim) => guncelle({ mevsim })} />
      </div>

      <div className="satir">
        <span className="etiket">Zaman</span>
        <SecenekGrubu secenekler={GUN_ZAMANI_ETIKETLERI} deger={gunZamani(o.saat)} onChange={(z) => guncelle({ saat: GUN_ZAMANI_SAATI[z] })} />
      </div>

      <div className="satir">
        <span className="etiket">Yağış</span>
        <SecenekGrubu secenekler={YAGIS_ETIKETLERI} deger={o.yagis} onChange={(yagis) => guncelle({ yagis })} />
      </div>
      <Anahtar acik={o.simsek ?? false} onChange={(simsek) => guncelle({ simsek })} etiket="Şimşek" aciklama="Fırtınada rastgele yönden çakma; oda ışığı flaş yapar, gök gürültüsü uzaklığa göre gecikir" />
      <div className="iki-sutun">
        <Kaydirici etiket="Bulut" deger={o.bulut} min={0} max={1} bicim={(v) => `%${Math.round(v * 100)}`} onChange={(bulut) => guncelle({ bulut })} />
        <Kaydirici etiket="Sis" deger={o.sis} min={0} max={1} bicim={(v) => `%${Math.round(v * 100)}`} onChange={(sis) => guncelle({ sis })} />
        <Kaydirici etiket="Rüzgâr şiddeti" deger={o.ruzgarSiddeti} min={0} max={1} bicim={(v) => `%${Math.round(v * 100)}`} onChange={(ruzgarSiddeti) => guncelle({ ruzgarSiddeti })} />
        <Kaydirici etiket="Rüzgâr yönü" deger={o.ruzgarYonu} min={0} max={359} adim={1} birim="°" onChange={(ruzgarYonu) => guncelle({ ruzgarYonu })} />
      </div>
    </Bolum>
  );
}
