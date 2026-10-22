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
 * Birlik: eğitmen yer seçmez. Asker, tank ve cephe tek dokunuşla çağrılır; oynatıcı o panoramanın
 * hazır mevzi/tank noktalarından pusuladaki yöne en yakın BOŞ olanı kullanır (üst üste binmez).
 * Elle yerleştirme "Gelişmiş" altında saklı kalır.
 */
export function FigurPaneli({ aktifler, calistir }: { aktifler: Array<FigurKomutu & { id: string }>; calistir: Calistir }) {
  const { seciliYon, bildir } = useArayuz();
  const [klipler, setKlipler] = useState<KlipOzeti[]>([]);
  const [klip, setKlip] = useState("");
  const [yukseklik, setYukseklik] = useState(-7);
  const [olcek, setOlcek] = useState(1);
  const [yansit, setYansit] = useState(false);
  const [sayac, setSayac] = useState(0);

  const yenile = () =>
    void calistir(() => api.klipler()).then((k) => {
      if (!k) return;
      setKlipler(k);
      if (!klip && k.length) setKlip((k.find((x) => x.kategori === "figur") ?? k[0]).ad);
    });
  useEffect(yenile, []); // eslint-disable-line react-hooks/exhaustive-deps

  const askerler = klipler.filter((k) => k.kategori === "figur" && /^asker_(bekleyen|kamuflaj)/.test(k.ad)).map((k) => k.ad);
  const tanklar = klipler.filter((k) => k.kategori === "figur" && /^tank/.test(k.ad)).map((k) => k.ad);
  const kosanlar = klipler.filter((k) => /^asker_(kosan|yuruyen)/.test(k.ad)).map((k) => k.ad);
  const baslik = (ad: string) => klipler.find((k) => k.ad === ad)?.baslik ?? ad;

  const cagir = async (ad: string, sapma = 0, yuk = -7) => {
    await api.figur({ islem: "oynat", klip: ad, azimut: yonAzimut(seciliYon + sapma), yukseklik: yuk, olcek: 1, yansit: false, dongu: true });
  };
  const askerCagir = () => {
    if (!askerler.length) return;
    const ad = askerler[sayac % askerler.length];
    setSayac((s) => s + 1);
    void calistir(() => cagir(ad)).then(() => bildir({ tur: "basari", baslik: "Asker mevziye girdi", metin: `${baslik(ad)} · ${yonMetni(seciliYon)} tarafı` }));
  };
  const tankCagir = () => {
    if (!tanklar.length) return;
    const ad = tanklar[sayac % tanklar.length];
    setSayac((s) => s + 1);
    void calistir(() => cagir(ad, 0, -5)).then(() => bildir({ tur: "basari", baslik: "Tank geldi", metin: `${baslik(ad)} · ${yonMetni(seciliYon)} tarafı` }));
  };
  const cepheKur = () =>
    void calistir(async () => {
      const secim = askerler.length ? askerler : [klip];
      const yerler: Array<[number, number]> = [
        [-22, -7],
        [0, -9],
        [22, -7],
      ];
      for (let i = 0; i < yerler.length; i++) await cagir(secim[i % secim.length], yerler[i][0], yerler[i][1]);
      await api.catisma({ yon: seciliYon });
      return true;
    }).then((r) => r && bildir({ tur: "basari", baslik: "Cephe kuruldu", metin: `${yonMetni(seciliYon)} · 3 asker mevzide, düşman yönü ayarlandı` }));
  const kosanGonder = (sola: boolean) => {
    const ad = kosanlar.find((k) => /kosan/.test(k)) ?? kosanlar[0];
    if (!ad) return;
    void calistir(() => api.figur({ islem: "oynat", klip: ad, azimut: yonAzimut(seciliYon + (sola ? 40 : -40)), yukseklik: -6, olcek: 1, yansit: sola, dongu: true })).then(() =>
      bildir({ tur: "basari", baslik: sola ? "Asker sola koşuyor" : "Asker sağa koşuyor" }),
    );
  };

  const secili = klipler.find((k) => k.ad === klip);
  const gruplar = Object.entries(
    klipler
      .filter((k) => k.kategori !== "efekt")
      .reduce<Record<string, KlipOzeti[]>>((g, k) => {
        (g[k.kategori] ??= []).push(k);
        return g;
      }, {}),
  );

  return (
    <>
      <Bolum
        baslik="Birlik çağır"
        altBaslik="Yer seçmene gerek yok: her sahnenin hazır mevzileri var, pusuladaki tarafa en yakın boş mevzi kullanılır"
        ikon={<Ikon.figur />}
        sag={<span className="rozet amber">taraf {yonMetni(seciliYon)}</span>}
      >
        {klipler.length === 0 ? (
          <p className="aciklama">Manifestte figür yok. İçerik klasörüne model ekleyin.</p>
        ) : (
          <div className="birlik-dugmeleri">
            <button type="button" className="birlik asker" disabled={!askerler.length} onClick={askerCagir}>
              <span className="birlik-ad">Asker çağır</span>
              <small>Mevziye bir asker</small>
            </button>
            <button type="button" className="birlik cephe" disabled={!askerler.length} onClick={cepheKur}>
              <span className="birlik-ad">Cephe kur</span>
              <small>3 asker + düşman yönü</small>
            </button>
            <button type="button" className="birlik tank" disabled={!tanklar.length} onClick={tankCagir}>
              <span className="birlik-ad">Tank çağır</span>
              <small>Açık alana bir tank</small>
            </button>
            <button type="button" className="birlik" disabled={!kosanlar.length} onClick={() => kosanGonder(false)}>
              <span className="birlik-ad">Koşan asker →</span>
              <small>Soldan sağa geçer</small>
            </button>
            <button type="button" className="birlik" disabled={!kosanlar.length} onClick={() => kosanGonder(true)}>
              <span className="birlik-ad">← Koşan asker</span>
              <small>Sağdan sola geçer</small>
            </button>
          </div>
        )}
        <details className="gelismis">
          <summary>Gelişmiş: elle yerleştirme</summary>
          <div className="gelismis-govde">
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
            <button
              type="button"
              className="birincil"
              disabled={!klip}
              onClick={() =>
                void calistir(() => api.figur({ islem: "oynat", klip, azimut: yonAzimut(seciliYon), yukseklik, olcek, yansit, dongu: secili?.dongu })).then(
                  (r) => r && bildir({ tur: "basari", baslik: `${secili?.baslik ?? klip} sahneye kondu`, metin: yonMetni(seciliYon) }),
                )
              }
            >
              <Ikon.oynat /> Sahneye koy · {yonMetni(seciliYon)}
            </button>
            <button type="button" className="kucuk ikincil ikonlu" onClick={yenile} title="Manifest değiştiyse listeyi yenile">
              <Ikon.yenile /> Listeyi yenile
            </button>
          </div>
        </details>
      </Bolum>

      <Bolum
        baslik="Sahnedeki birlik"
        altBaslik={aktifler.length ? `${aktifler.length} figür` : "Sahne boş"}
        ikon={<Ikon.figur />}
        sag={
          aktifler.length > 0 && (
            <OnayliDugme sinif="kucuk tehlike" onay="Hepsi çekilsin mi?" onClick={() => void calistir(() => api.figur({ islem: "temizle" }))}>
              Birliği geri çek
            </OnayliDugme>
          )
        }
      >
        {aktifler.length === 0 ? (
          <p className="aciklama">Henüz figür yok. Yukarıdan asker, cephe ya da tank çağır.</p>
        ) : (
          <ul className="liste">
            {aktifler.map((f) => (
              <li key={f.id}>
                <span className="liste-isaret figur" />
                <div className="liste-govde">
                  <strong>{baslik(f.klip ?? "")}</strong>
                  <small>
                    {yonMetni(((f.azimut ?? 0) + 360) % 360)} tarafı
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
