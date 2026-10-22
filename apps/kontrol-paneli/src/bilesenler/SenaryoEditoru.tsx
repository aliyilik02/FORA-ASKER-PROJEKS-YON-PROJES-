import { useState } from "react";
import { api } from "../api";
import {
  BOLGE_ETIKETLERI,
  EFEKT_ETIKETLERI,
  GUVENLI_ALAN_ETIKETLERI,
  HELIKOPTER_ETIKETLERI,
  MEVSIM_ETIKETLERI,
  YAGIS_ETIKETLERI,
  type Bolge,
  type EfektTuru,
  type GuvenliAlanTipi,
  type HelikopterDurumu,
  type Mevsim,
  type Oda,
  type Senaryo,
  type SenaryoAdimi,
  type SimulasyonDurumu,
  type Yagis,
} from "../tipler";
import { saatBicimi, sureBicimi } from "./ortak";

type Calistir = <T>(islem: () => Promise<T>) => Promise<T | undefined>;
type AdimTipi = SenaryoAdimi["islem"]["tip"];

const TIP_ETIKETLERI: Record<AdimTipi, string> = {
  efekt: "Efekt tetikle",
  bolge: "Bölge değiştir",
  ortam: "Ortam ayarla",
  izli_mermi: "İzli mermi",
  oda2: "Oda 2 (güvenli alan / helikopter)",
  isik: "Ortam ışığı",
  catisma: "Çatışma (düşman ateşi)",
};

interface YeniAdim {
  saniye: number;
  tip: AdimTipi;
  efektTur: EfektTuru;
  siddet: number;
  yon: number;
  bolge: Bolge;
  mevsim: Mevsim;
  saat: number;
  bulut: number;
  sis: number;
  yagis: Yagis;
  mermiAktif: boolean;
  cikis: 0 | 1 | 2;
  mermiYon: number;
  siklik: number;
  guvenliAlan: GuvenliAlanTipi;
  helikopter: HelikopterDurumu;
  parlaklik: number;
  catismaAktif: boolean;
  catismaSiddet: number;
  catismaYon: number;
}

function varsayilanYeni(d: SimulasyonDurumu): YeniAdim {
  return {
    saniye: 0,
    tip: "efekt",
    efektTur: "patlama",
    siddet: 1,
    yon: 0,
    bolge: d.bolge,
    mevsim: d.ortam.mevsim,
    saat: d.ortam.saat,
    bulut: d.ortam.bulut,
    sis: d.ortam.sis,
    yagis: d.ortam.yagis,
    mermiAktif: true,
    cikis: 1,
    mermiYon: 0,
    siklik: 5,
    guvenliAlan: d.oda2.guvenliAlan,
    helikopter: d.oda2.helikopter,
    parlaklik: d.isik.parlaklik,
    catismaAktif: true,
    catismaSiddet: d.catisma?.siddet ?? 0.5,
    catismaYon: d.catisma?.yon ?? 0,
  };
}

const yuzde = (v: number) => `%${Math.round(v * 100)}`;

function adimUret(y: YeniAdim, id: string): SenaryoAdimi {
  const gecikmeMs = Math.max(0, Math.round(y.saniye * 1000));
  switch (y.tip) {
    case "efekt":
      return {
        id,
        gecikmeMs,
        aciklama: `${EFEKT_ETIKETLERI[y.efektTur]} (${yuzde(y.siddet)}, ${y.yon}°)`,
        islem: { tip: "efekt", efekt: { tur: y.efektTur, siddet: y.siddet, yon: y.yon } },
      };
    case "bolge":
      return { id, gecikmeMs, aciklama: `Bölge: ${BOLGE_ETIKETLERI[y.bolge]}`, islem: { tip: "bolge", bolge: y.bolge } };
    case "ortam":
      return {
        id,
        gecikmeMs,
        aciklama: `Ortam: ${MEVSIM_ETIKETLERI[y.mevsim]}, ${saatBicimi(y.saat)}, bulut ${yuzde(y.bulut)}, sis ${yuzde(y.sis)}, ${YAGIS_ETIKETLERI[y.yagis].toLowerCase()}`,
        islem: { tip: "ortam", ortam: { mevsim: y.mevsim, saat: y.saat, bulut: y.bulut, sis: y.sis, yagis: y.yagis } },
      };
    case "izli_mermi":
      return y.mermiAktif
        ? {
            id,
            gecikmeMs,
            aciklama: `İzli mermi açık (${["sol", "orta", "sağ"][y.cikis]} duvar, ${y.mermiYon}°, ${y.siklik}/sn)`,
            islem: { tip: "izli_mermi", izliMermi: { aktif: true, cikisNoktasi: y.cikis, yon: y.mermiYon, siklik: y.siklik } },
          }
        : { id, gecikmeMs, aciklama: "İzli mermi kapalı", islem: { tip: "izli_mermi", izliMermi: { aktif: false } } };
    case "oda2":
      return {
        id,
        gecikmeMs,
        aciklama: `Oda 2: ${GUVENLI_ALAN_ETIKETLERI[y.guvenliAlan]}, helikopter ${HELIKOPTER_ETIKETLERI[y.helikopter].toLowerCase()}`,
        islem: { tip: "oda2", oda2: { guvenliAlan: y.guvenliAlan, helikopter: y.helikopter } },
      };
    case "isik":
      return {
        id,
        gecikmeMs,
        aciklama: `Ortam ışığı ${yuzde(y.parlaklik)} (elle)`,
        islem: { tip: "isik", isik: { parlaklik: y.parlaklik, senaryoyaBagli: false } },
      };
    case "catisma":
      return y.catismaAktif
        ? {
            id,
            gecikmeMs,
            aciklama: `Çatışma başlar (${yuzde(y.catismaSiddet)}, düşman ${y.catismaYon}°)`,
            islem: { tip: "catisma", catisma: { aktif: true, siddet: y.catismaSiddet, yon: y.catismaYon } },
          }
        : { id, gecikmeMs, aciklama: "Çatışma durur", islem: { tip: "catisma", catisma: { aktif: false } } };
  }
}

function Secim<T extends string>({ deger, secenekler, onChange }: { deger: T; secenekler: Record<T, string>; onChange: (v: T) => void }) {
  return (
    <select value={deger} onChange={(e) => onChange(e.target.value as T)}>
      {(Object.keys(secenekler) as T[]).map((k) => (
        <option key={k} value={k}>
          {secenekler[k]}
        </option>
      ))}
    </select>
  );
}

function Sayi({ etiket, deger, min, max, adim = 1, onChange }: { etiket: string; deger: number; min: number; max: number; adim?: number; onChange: (v: number) => void }) {
  return (
    <label className="alan">
      <span>{etiket}</span>
      <input type="number" value={deger} min={min} max={max} step={adim} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

/** Panelden yeni senaryo oluşturma: adımlar zaman çizelgesine eklenir, kaydedilince listeye düşer. */
export function SenaryoEditoru({
  durum,
  calistir,
  onKaydedildi,
  onVazgec,
}: {
  durum: SimulasyonDurumu;
  calistir: Calistir;
  onKaydedildi: (senaryo: Senaryo) => void;
  onVazgec: () => void;
}) {
  const [ad, setAd] = useState("");
  const [aciklama, setAciklama] = useState("");
  const [oda, setOda] = useState<Oda>(durum.oda);
  const [adimlar, setAdimlar] = useState<SenaryoAdimi[]>([]);
  const [yeni, setYeni] = useState<YeniAdim>(() => varsayilanYeni(durum));
  const [sayac, setSayac] = useState(1);

  const g = (k: Partial<YeniAdim>) => setYeni((e) => ({ ...e, ...k }));

  const adimEkle = (adim: SenaryoAdimi) => {
    setAdimlar((e) => [...e, adim].sort((a, b) => a.gecikmeMs - b.gecikmeMs));
    setSayac((s) => s + 1);
    // Bir sonraki adım için zamanı 5 sn ileri al – ardışık adımları hızlı girmek için.
    g({ saniye: yeni.saniye + 5 });
  };

  const mevcutOrtamiEkle = () => {
    const o = durum.ortam;
    adimEkle(adimUret({ ...yeni, tip: "ortam", mevsim: o.mevsim, saat: o.saat, bulut: o.bulut, sis: o.sis, yagis: o.yagis }, `adim_${sayac}`));
  };

  const kaydet = () =>
    void calistir(async () => {
      const kayit = await api.senaryoKaydet({ ad: ad.trim(), aciklama: aciklama.trim() || undefined, oda, adimlar });
      onKaydedildi(kayit);
    });

  const toplam = adimlar.reduce((m, a) => Math.max(m, a.gecikmeMs), 0);

  return (
    <div className="editor">
      <div className="satir">
        <input type="text" placeholder="Senaryo adı (ör. Ormanlık – şafak baskını)" value={ad} onChange={(e) => setAd(e.target.value)} />
        <select value={oda} onChange={(e) => setOda(e.target.value as Oda)}>
          <option value="oda1">Oda 1</option>
          <option value="oda2">Oda 2</option>
        </select>
      </div>
      <input type="text" placeholder="Açıklama (isteğe bağlı)" value={aciklama} onChange={(e) => setAciklama(e.target.value)} />

      <fieldset className="adim-formu">
        <legend>Yeni adım</legend>
        <div className="alanlar">
          <Sayi etiket="Saniye" deger={yeni.saniye} min={0} max={3600} adim={0.5} onChange={(saniye) => g({ saniye })} />
          <label className="alan">
            <span>İşlem</span>
            <Secim deger={yeni.tip} secenekler={TIP_ETIKETLERI} onChange={(tip) => g({ tip })} />
          </label>
        </div>

        {yeni.tip === "efekt" && (
          <div className="alanlar">
            <label className="alan">
              <span>Efekt</span>
              <Secim deger={yeni.efektTur} secenekler={EFEKT_ETIKETLERI} onChange={(efektTur) => g({ efektTur })} />
            </label>
            <Sayi etiket="Şiddet (0–1)" deger={yeni.siddet} min={0} max={1} adim={0.1} onChange={(siddet) => g({ siddet })} />
            <Sayi etiket="Yön (°)" deger={yeni.yon} min={0} max={359} onChange={(yon) => g({ yon })} />
          </div>
        )}
        {yeni.tip === "bolge" && (
          <div className="alanlar">
            <label className="alan">
              <span>Bölge</span>
              <Secim deger={yeni.bolge} secenekler={BOLGE_ETIKETLERI} onChange={(bolge) => g({ bolge })} />
            </label>
          </div>
        )}
        {yeni.tip === "ortam" && (
          <div className="alanlar">
            <label className="alan">
              <span>Mevsim</span>
              <Secim deger={yeni.mevsim} secenekler={MEVSIM_ETIKETLERI} onChange={(mevsim) => g({ mevsim })} />
            </label>
            <Sayi etiket="Saat (0–24)" deger={yeni.saat} min={0} max={24} adim={0.25} onChange={(saat) => g({ saat })} />
            <Sayi etiket="Bulut (0–1)" deger={yeni.bulut} min={0} max={1} adim={0.1} onChange={(bulut) => g({ bulut })} />
            <Sayi etiket="Sis (0–1)" deger={yeni.sis} min={0} max={1} adim={0.1} onChange={(sis) => g({ sis })} />
            <label className="alan">
              <span>Yağış</span>
              <Secim deger={yeni.yagis} secenekler={YAGIS_ETIKETLERI} onChange={(yagis) => g({ yagis })} />
            </label>
          </div>
        )}
        {yeni.tip === "izli_mermi" && (
          <div className="alanlar">
            <label className="alan">
              <span>Durum</span>
              <select value={yeni.mermiAktif ? "acik" : "kapali"} onChange={(e) => g({ mermiAktif: e.target.value === "acik" })}>
                <option value="acik">Açık</option>
                <option value="kapali">Kapalı</option>
              </select>
            </label>
            {yeni.mermiAktif && (
              <>
                <label className="alan">
                  <span>Çıkış</span>
                  <select value={yeni.cikis} onChange={(e) => g({ cikis: Number(e.target.value) as 0 | 1 | 2 })}>
                    <option value={0}>Sol duvar</option>
                    <option value={1}>Orta duvar</option>
                    <option value={2}>Sağ duvar</option>
                  </select>
                </label>
                <Sayi etiket="Yön (°)" deger={yeni.mermiYon} min={-90} max={90} onChange={(mermiYon) => g({ mermiYon })} />
                <Sayi etiket="Mermi/sn" deger={yeni.siklik} min={0.5} max={30} adim={0.5} onChange={(siklik) => g({ siklik })} />
              </>
            )}
          </div>
        )}
        {yeni.tip === "oda2" && (
          <div className="alanlar">
            <label className="alan">
              <span>Güvenli alan</span>
              <Secim deger={yeni.guvenliAlan} secenekler={GUVENLI_ALAN_ETIKETLERI} onChange={(guvenliAlan) => g({ guvenliAlan })} />
            </label>
            <label className="alan">
              <span>Helikopter</span>
              <Secim deger={yeni.helikopter} secenekler={HELIKOPTER_ETIKETLERI} onChange={(helikopter) => g({ helikopter })} />
            </label>
          </div>
        )}
        {yeni.tip === "isik" && (
          <div className="alanlar">
            <Sayi etiket="Parlaklık (0–1)" deger={yeni.parlaklik} min={0} max={1} adim={0.05} onChange={(parlaklik) => g({ parlaklik })} />
          </div>
        )}
        {yeni.tip === "catisma" && (
          <div className="alanlar">
            <label className="alan">
              <span>Durum</span>
              <select value={yeni.catismaAktif ? "basla" : "dur"} onChange={(e) => g({ catismaAktif: e.target.value === "basla" })}>
                <option value="basla">Başlat</option>
                <option value="dur">Durdur</option>
              </select>
            </label>
            {yeni.catismaAktif && (
              <>
                <Sayi etiket="Şiddet (0–1)" deger={yeni.catismaSiddet} min={0.05} max={1} adim={0.05} onChange={(catismaSiddet) => g({ catismaSiddet })} />
                <Sayi etiket="Düşman yönü (°)" deger={yeni.catismaYon} min={0} max={359} onChange={(catismaYon) => g({ catismaYon })} />
              </>
            )}
          </div>
        )}

        <div className="satir">
          <button type="button" className="birincil" onClick={() => adimEkle(adimUret(yeni, `adim_${sayac}`))}>
            + Adımı ekle
          </button>
          <button type="button" onClick={mevcutOrtamiEkle} title="Paneldeki şu anki mevsim/saat/hava ayarlarını bu saniyeye adım olarak ekler">
            Mevcut ortamı adım yap
          </button>
        </div>
      </fieldset>

      {adimlar.length > 0 && (
        <ol className="adim-listesi">
          {adimlar.map((a) => (
            <li key={a.id}>
              <span className="adim-zaman">{sureBicimi(a.gecikmeMs)}</span>
              <span className="adim-aciklama">{a.aciklama}</span>
              <button type="button" className="kucuk ikincil" onClick={() => setAdimlar((e) => e.filter((x) => x.id !== a.id))}>
                Sil
              </button>
            </li>
          ))}
        </ol>
      )}

      <div className="satir">
        <span className="aciklama">
          {adimlar.length} adım · toplam {sureBicimi(toplam)}
        </span>
        <span style={{ flex: 1 }} />
        <button type="button" className="ikincil" onClick={onVazgec}>
          Vazgeç
        </button>
        <button type="button" className="birincil" disabled={!ad.trim() || adimlar.length === 0} onClick={kaydet}>
          Senaryoyu kaydet
        </button>
      </div>
    </div>
  );
}
