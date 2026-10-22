import { useEffect, useState } from "react";
import { api } from "../api";
import { useArayuz, yonAzimut } from "../arayuz";
import type { FigurKomutu, KlipOzeti } from "../tipler";
import { Anahtar, Bolum, Ikon, Kaydirici, OnayliDugme, yonMetni } from "./ortak";

type Calistir = <T>(islem: () => Promise<T>) => Promise<T | undefined>;

const KATEGORI_ETIKETLERI: Record<string, string> = { figur: "Figürler", efekt: "Efekt plakaları", hava: "Hava", diger: "Diğer" };
const MESAFELER: Array<[number, string]> = [
  [-12, "Yakın · 8 m"],
  [-7, "Orta · 14 m"],
  [-4, "Uzak · 24 m"],
  [-2.5, "Çok uzak · 40 m"],
];

/**
 * Figürler: 3B modeller ve alfa klipler. Yön pusuladan, mesafe dört hazır adımdan seçilir;
 * oynatıcı figürü panoramanın yerleşim planına göre açık alana oturtur.
 */
export function FigurPaneli({ aktifler, calistir }: { aktifler: Array<FigurKomutu & { id: string }>; calistir: Calistir }) {
  const { seciliYon, bildir } = useArayuz();
  const [klipler, setKlipler] = useState<KlipOzeti[]>([]);
  const [klip, setKlip] = useState("");
  const [yukseklik, setYukseklik] = useState(-7);
  const [olcek, setOlcek] = useState(1);
  const [yansit, setYansit] = useState(false);

  const yenile = () =>
    void calistir(() => api.klipler()).then((k) => {
      if (!k) return;
      setKlipler(k);
      if (!klip && k.length) setKlip((k.find((x) => x.kategori === "figur") ?? k[0]).ad);
    });
  useEffect(yenile, []); // eslint-disable-line react-hooks/exhaustive-deps

  const secili = klipler.find((k) => k.ad === klip);
  const gruplar = Object.entries(
    klipler
      .filter((k) => k.kategori !== "efekt")
      .reduce<Record<string, KlipOzeti[]>>((g, k) => {
        (g[k.kategori] ??= []).push(k);
        return g;
      }, {}),
  );
  const azimut = yonAzimut(seciliYon);

  return (
    <>
      <Bolum
        baslik="Figür ekle"
        altBaslik="Asker ve araç modelleri sahnenin ışığıyla aydınlanır, zemine gölge düşürür"
        ikon={<Ikon.figur />}
        sag={
          <button type="button" className="kucuk ikincil ikonlu" onClick={yenile} title="Manifest değiştiyse listeyi yenile">
            <Ikon.yenile /> Yenile
          </button>
        }
      >
        {klipler.length === 0 ? (
          <p className="aciklama">Manifestte figür yok. İçerik klasörüne model/klip ekleyin.</p>
        ) : (
          <>
            <div className="klip-kartlari">
              {gruplar.map(([kategori, liste]) => (
                <div key={kategori} className="klip-grubu">
                  <span className="klip-grubu-ad">{KATEGORI_ETIKETLERI[kategori] ?? kategori}</span>
                  <div className="klip-grubu-liste">
                    {liste.map((k) => (
                      <button key={k.ad} type="button" className={`klip-karti ${klip === k.ad ? "secili" : ""}`} onClick={() => setKlip(k.ad)}>
                        {k.baslik}
                        {k.dongu && <small>döngü</small>}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="satir">
              <span className="etiket">Mesafe</span>
              <div className="secenek-grubu">
                {MESAFELER.map(([y, ad]) => (
                  <button key={ad} type="button" className={yukseklik === y ? "secili" : ""} onClick={() => setYukseklik(y)}>
                    {ad}
                  </button>
                ))}
              </div>
            </div>
            <div className="iki-sutun">
              <Kaydirici etiket="Ölçek" deger={olcek} min={0.5} max={2} adim={0.1} birim="×" onChange={setOlcek} gecikmeMs={0} />
              <div className="satir" style={{ alignSelf: "end" }}>
                <Anahtar acik={yansit} onChange={setYansit} etiket="Aynala" aciklama="Yürüyen/koşan figür sola gider" />
              </div>
            </div>
            <div className="satir">
              <button
                type="button"
                className="birincil buyuk"
                disabled={!klip}
                onClick={() =>
                  void calistir(() => api.figur({ islem: "oynat", klip, azimut, yukseklik, olcek, yansit, dongu: secili?.dongu })).then(
                    (r) => r && bildir({ tur: "basari", baslik: `${secili?.baslik ?? klip} sahneye kondu`, metin: yonMetni(seciliYon) }),
                  )
                }
              >
                <Ikon.oynat /> Sahneye koy · {yonMetni(seciliYon)}
              </button>
            </div>
          </>
        )}
      </Bolum>

      <Bolum
        baslik="Sahnedeki figürler"
        altBaslik={aktifler.length ? `${aktifler.length} figür` : "Sahne boş"}
        ikon={<Ikon.figur />}
        sag={
          aktifler.length > 0 && (
            <OnayliDugme sinif="kucuk tehlike" onay="Hepsini kaldır?" onClick={() => void calistir(() => api.figur({ islem: "temizle" }))}>
              Tümünü kaldır
            </OnayliDugme>
          )
        }
      >
        {aktifler.length === 0 ? (
          <p className="aciklama">Henüz figür yok. Yukarıdan seçip pusuladaki yöne koy.</p>
        ) : (
          <ul className="liste">
            {aktifler.map((f) => (
              <li key={f.id}>
                <span className="liste-isaret figur" />
                <div className="liste-govde">
                  <strong>{klipler.find((k) => k.ad === f.klip)?.baslik ?? f.klip}</strong>
                  <small>
                    {yonMetni(((f.azimut ?? 0) + 360) % 360)} · {MESAFELER.find(([y]) => y === f.yukseklik)?.[1] ?? `${f.yukseklik}°`} · ×{f.olcek}
                    {f.yansit ? " · aynalı" : ""}
                  </small>
                </div>
                <button type="button" className="kucuk ikincil" onClick={() => void calistir(() => api.figur({ islem: "durdur", id: f.id }))}>
                  Kaldır
                </button>
              </li>
            ))}
          </ul>
        )}
      </Bolum>
    </>
  );
}
