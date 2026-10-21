import { useEffect, useState } from "react";
import { api } from "../api";
import type { FigurKomutu, KlipOzeti } from "../tipler";
import { Bolum, Kaydirici } from "./ortak";

type Calistir = <T>(islem: () => Promise<T>) => Promise<T | undefined>;

const KATEGORI_ETIKETLERI: Record<string, string> = { figur: "Figür (asker, araç)", efekt: "Efekt plakası", hava: "Hava", diger: "Diğer" };

/**
 * Figürler: içerik manifestindeki alfa kanallı klipleri (yeşil perde asker çekimleri, araçlar,
 * efekt plakaları) sahneye yerleştirir. Klip listesi köprüden (/api/klipler) gelir.
 */
export function FigurPaneli({ aktifler, calistir }: { aktifler: Array<FigurKomutu & { id: string }>; calistir: Calistir }) {
  const [klipler, setKlipler] = useState<KlipOzeti[]>([]);
  const [klip, setKlip] = useState("");
  const [azimut, setAzimut] = useState(15);
  const [yukseklik, setYukseklik] = useState(-4);
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
    klipler.reduce<Record<string, KlipOzeti[]>>((g, k) => {
      (g[k.kategori] ??= []).push(k);
      return g;
    }, {}),
  );

  return (
    <Bolum
      baslik="Figürler ve Klipler"
      altBaslik="Alfa kanallı klipleri (asker, araç, efekt plakası) sahneye yerleştir"
      sag={
        <button type="button" className="kucuk ikincil" onClick={yenile} title="Manifest değiştiyse listeyi yenile">
          Yenile
        </button>
      }
    >
      {klipler.length === 0 ? (
        <p className="aciklama">
          Manifestte klip yok. <code>icerik/manifest.json</code> içindeki <code>klipler</code> bölümüne alfa kanallı WebM veya sprite sayfası ekleyin
          (bkz. docs/fotogercekci-icerik-hatti.md §2.5).
        </p>
      ) : (
        <>
          <div className="satir">
            <select value={klip} onChange={(e) => setKlip(e.target.value)}>
              {gruplar.map(([kategori, liste]) => (
                <optgroup key={kategori} label={KATEGORI_ETIKETLERI[kategori] ?? kategori}>
                  {liste.map((k) => (
                    <option key={k.ad} value={k.ad}>
                      {k.baslik}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <label className="anahtar">
              <input type="checkbox" checked={yansit} onChange={(e) => setYansit(e.target.checked)} />
              <span>Aynala</span>
            </label>
          </div>
          <Kaydirici etiket="Yön (azimut)" deger={azimut} min={-135} max={135} adim={1} birim="°" onChange={setAzimut} />
          <Kaydirici etiket="Yükseklik (ufka göre)" deger={yukseklik} min={-25} max={15} adim={0.5} birim="°" onChange={setYukseklik} />
          <Kaydirici etiket="Ölçek" deger={olcek} min={0.2} max={4} adim={0.1} birim="×" onChange={setOlcek} />
          <div className="satir">
            <button
              type="button"
              className="birincil"
              disabled={!klip}
              onClick={() => void calistir(() => api.figur({ islem: "oynat", klip, azimut, yukseklik, olcek, yansit, dongu: secili?.dongu }))}
            >
              ▶ Sahneye koy
            </button>
            <button type="button" className="ikincil" disabled={aktifler.length === 0} onClick={() => void calistir(() => api.figur({ islem: "temizle" }))}>
              Tümünü kaldır
            </button>
          </div>
        </>
      )}
      {aktifler.length > 0 && (
        <ul className="on-ayar-listesi">
          {aktifler.map((f) => (
            <li key={f.id}>
              <div>
                <strong>{klipler.find((k) => k.ad === f.klip)?.baslik ?? f.klip}</strong>
                <small>
                  {f.azimut}° · yükseklik {f.yukseklik}° · ×{f.olcek}
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
  );
}
