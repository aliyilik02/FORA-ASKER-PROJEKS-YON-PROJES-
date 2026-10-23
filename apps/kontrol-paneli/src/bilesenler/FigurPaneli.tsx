import { useEffect, useState } from "react";
import { api } from "../api";
import { useArayuz, yonAzimut } from "../arayuz";
import { vurulabilirAskerler, yoneEnYakin } from "../figurYardimcilari";
import { FIGUR_POZ_ETIKETLERI, type FigurKomutu, type FigurPozu, type KlipOzeti } from "../tipler";
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
export function FigurPaneli({ aktifler, calistir, oda = "oda1" }: { aktifler: Array<FigurKomutu & { id: string }>; calistir: Calistir; oda?: "oda1" | "oda2" }) {
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
  const yaralilar = klipler.filter((k) => k.kategori === "figur" && /^asker_yarali_3b/.test(k.ad)).map((k) => k.ad);
  const sihhiyeciler = klipler.filter((k) => /^asker_sihhiyeci/.test(k.ad)).map((k) => k.ad);
  /** Sahnedeki yaralılar; sıhhiyeci en son vurulanın yanına gider. */
  const yaraliAktifler = aktifler.filter((f) => f.poz === "yarali");
  const baslik = (ad: string) => klipler.find((k) => k.ad === ad)?.baslik ?? ad;
  /** Vurulabilecek (ayakta/diz çökmüş, 3B asker) figürler. */
  const vurulabilir = vurulabilirAskerler(aktifler);

  const cagir = async (ad: string, sapma = 0, yuk = -7) => {
    await api.figur({ islem: "oynat", klip: ad, azimut: yonAzimut(seciliYon + sapma), yukseklik: yuk, olcek: 1, yansit: false, dongu: true });
  };
  const yaraliCagir = () => {
    const ad = yaralilar[0];
    if (!ad) return;
    // Oda 1: 8 m yakında; Oda 2: sütrenin içinde (3,5 m), kum torbası hattının arkasında kalmasın
    void calistir(() => cagir(ad, 0, oda === "oda2" ? -26 : -12)).then(() => bildir({ tur: "basari", baslik: "Yaralı yerde", metin: `${yonMetni(seciliYon)} tarafı, ${oda === "oda2" ? "sütrenin içinde" : "yakın mesafe"} · yardım çağırıyor` }));
  };
  const pozDegistir = (f: FigurKomutu & { id: string }, poz: FigurPozu) =>
    void calistir(() => api.figur({ islem: "poz", id: f.id, poz })).then(
      (r) =>
        r &&
        bildir({
          tur: poz === "yarali" ? "hata" : "basari",
          baslik: poz === "yarali" ? "Asker vuruldu" : poz === "comelmis" ? "Asker diz çöktü" : poz === "yatmis" ? "Asker yere yattı" : "Asker ayağa kalktı",
          metin: `${baslik(f.klip ?? "")} · ${yonMetni(((f.azimut ?? 0) + 360) % 360)} tarafı`,
        }),
    );
  /** Sıhhiyeci: en son yaralının yanına diz çöker, ona dönük müdahale eder. */
  const sihhiyeciGonder = () => {
    const ad = sihhiyeciler[0];
    const yarali = yaraliAktifler[yaraliAktifler.length - 1];
    if (!ad || !yarali) return;
    void calistir(() => api.figur({ islem: "oynat", klip: ad, yaninda: yarali.id, azimut: yarali.azimut, olcek: 1, dongu: true })).then(
      (r) => r && bildir({ tur: "basari", baslik: "Sıhhiyeci yaralının başında", metin: `${yonMetni(((yarali.azimut ?? 0) + 360) % 360)} tarafı` }),
    );
  };
  /** Tek dokunuş: sahnedeki ayakta askerlerden biri (pusulaya en yakın) vurulur, yere düşer. */
  const askerVuruldu = () => {
    const f = yoneEnYakin(vurulabilir, seciliYon);
    if (f) pozDegistir(f, "yarali");
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
            <button type="button" className="birlik yarali" disabled={!yaralilar.length} onClick={yaraliCagir}>
              <span className="birlik-ad">Yaralı asker</span>
              <small>Yakında yerde, yardım ister</small>
            </button>
            <button type="button" className="birlik vuruldu" disabled={!vurulabilir.length} onClick={askerVuruldu} title="Pusulaya en yakın ayakta asker vurulur ve yere düşer">
              <span className="birlik-ad">Asker vuruldu!</span>
              <small>{vurulabilir.length ? `${vurulabilir.length} asker sahnede` : "Önce asker çağır"}</small>
            </button>
            <button type="button" className="birlik sihhiyeci" disabled={!sihhiyeciler.length || !yaraliAktifler.length} onClick={sihhiyeciGonder} title="Son yaralının yanına diz çöker, müdahale eder">
              <span className="birlik-ad">Sıhhiyeci gönder</span>
              <small>{yaraliAktifler.length ? "Yaralının başına diz çöker" : "Önce yaralı olmalı"}</small>
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
                    {f.poz && f.poz !== "ayakta" ? ` · ${FIGUR_POZ_ETIKETLERI[f.poz].toLowerCase()}` : ""}
                  </small>
                </div>
                {/^asker_/.test(f.klip ?? "") && !/^asker_(kosan|yuruyen)/.test(f.klip ?? "") && (
                  <span className="dugme-grubu">
                    {f.poz !== "yarali" && (
                      <button type="button" className="kucuk tehlike" onClick={() => pozDegistir(f, "yarali")} title="Vurulur, yere düşer, yardım çağırır">
                        Vuruldu
                      </button>
                    )}
                    {(f.poz ?? "ayakta") !== "ayakta" && (
                      <button type="button" className="kucuk ikincil" onClick={() => pozDegistir(f, "ayakta")}>
                        Kalk
                      </button>
                    )}
                    {f.poz !== "comelmis" && f.poz !== "yarali" && (
                      <button type="button" className="kucuk ikincil" onClick={() => pozDegistir(f, "comelmis")}>
                        Diz çök
                      </button>
                    )}
                    {f.poz !== "yatmis" && f.poz !== "yarali" && !/sihhiyeci/.test(f.klip ?? "") && (
                      <button type="button" className="kucuk ikincil" onClick={() => pozDegistir(f, "yatmis")} title="Yere yatıp ateş pozisyonu">
                        Yat
                      </button>
                    )}
                  </span>
                )}
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
