import { useState } from "react";
import { api } from "../api";
import { useArayuz } from "../arayuz";
import { EFEKT_ETIKETLERI, type EfektTuru, type SimulasyonDurumu } from "../tipler";
import { Anahtar, Bolum, Ikon, Kaydirici, yonMetni } from "./ortak";

type Calistir = <T>(islem: () => Promise<T>) => Promise<T | undefined>;

const ODA1_EFEKTLERI: Array<{ tur: EfektTuru; aciklama: string; sinif?: string }> = [
  { tur: "patlama", aciklama: "Ateş topu, toprak, moloz; kalıcı krater ve duman", sinif: "izli" },
  { tur: "toz_duman", aciklama: "Yere yakın toz bulutu" },
  { tur: "gurultu", aciklama: "Seri atış (6–10 el)" },
  { tur: "bagirma", aciklama: "Yaralı var! Siper al!" },
  { tur: "cagirma", aciklama: "Sıhhiye! Sedye getirin!" },
];

export function EfektPaneli({ durum, calistir }: { durum: SimulasyonDurumu; calistir: Calistir }) {
  const { seciliYon, bildir } = useArayuz();
  const [siddet, setSiddet] = useState(1);
  const m = durum.izliMermi;
  const mermiGuncelle = (k: Partial<typeof m>) => void calistir(() => api.izliMermi(k));

  return (
    <>
      <Bolum
        baslik="Efektler"
        altBaslik="Yön pusuladan gelir; her efekt panoramanın açık alanlarına yerleşir (ağaç ve bina içinde patlamaz)"
        ikon={<Ikon.efekt />}
        sag={<span className="rozet amber">yön {yonMetni(seciliYon)}</span>}
      >
        <Kaydirici etiket="Şiddet" deger={siddet} min={0.1} max={1} bicim={(v) => `%${Math.round(v * 100)}`} onChange={setSiddet} gecikmeMs={0} vurgu="izli" />
        <div className="efekt-listesi">
          {ODA1_EFEKTLERI.map((e) => (
            <button
              key={e.tur}
              type="button"
              className={`efekt-satir ${e.sinif ?? ""}`}
              onClick={() =>
                void calistir(() => api.efekt({ tur: e.tur, siddet, yon: seciliYon })).then((r) => r && bildir({ tur: "basari", baslik: `${EFEKT_ETIKETLERI[e.tur]} tetiklendi`, metin: yonMetni(seciliYon) }))
              }
            >
              <span className="efekt-satir-ad">{EFEKT_ETIKETLERI[e.tur]}</span>
              <span className="efekt-satir-aciklama">{e.aciklama}</span>
              <span className="efekt-satir-ok">Tetikle</span>
            </button>
          ))}
        </div>
      </Bolum>

      <Bolum baslik="İzli Mermi" altBaslik="Seçilen duvardan sürekli izli mermi akışı" ikon={<Ikon.efekt />} sag={<Anahtar acik={m.aktif} onChange={(aktif) => mermiGuncelle({ aktif })} etiket={m.aktif ? "Açık" : "Kapalı"} />}>
        <div className={`izli-ayarlar ${m.aktif ? "" : "soluk"}`}>
          <div className="satir">
            <span className="etiket">Çıkış</span>
            <div className="secenek-grubu">
              {([0, 1, 2] as const).map((n) => (
                <button key={n} type="button" className={m.cikisNoktasi === n ? "secili" : ""} onClick={() => mermiGuncelle({ cikisNoktasi: n })}>
                  {["Sol duvar", "Orta duvar", "Sağ duvar"][n]}
                </button>
              ))}
            </div>
          </div>
          <div className="iki-sutun">
            <Kaydirici etiket="Mermi yönü" deger={m.yon} min={-90} max={90} adim={1} birim="°" onChange={(yon) => mermiGuncelle({ yon })} />
            <Kaydirici etiket="Sıklık" deger={m.siklik} min={0.5} max={20} adim={0.5} birim=" /sn" onChange={(siklik) => mermiGuncelle({ siklik })} />
          </div>
        </div>
      </Bolum>
    </>
  );
}
