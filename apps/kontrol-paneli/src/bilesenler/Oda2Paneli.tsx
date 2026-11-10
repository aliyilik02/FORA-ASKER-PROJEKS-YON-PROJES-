import { useEffect, useState } from "react";
import { api } from "../api";
import { useArayuz } from "../arayuz";
import { EFEKT_ETIKETLERI, GUVENLI_ALAN_ETIKETLERI, HELIKOPTER_ETIKETLERI, type HelikopterDurumu, type MakroDurumu, type SimulasyonDurumu } from "../tipler";
import { Bolum, Ikon, Kaydirici, SecenekGrubu, yonMetni } from "./ortak";

type Calistir = <T>(islem: () => Promise<T>) => Promise<T | undefined>;

/** Helikopter iniş dizisi: köprüde makro olarak çalışır (tablet kapansa da sürer; sıfırlama ve elle komut keser). */
export const HELI_DIZISI: ReadonlyArray<{ durum: HelikopterDurumu; sn: number }> = [
  { durum: "yaklasiyor", sn: 0 },
  { durum: "iniyor", sn: 20 },
  { durum: "yerde", sn: 35 },
];
export const HELI_MAKRO_ADI = "Helikopter iniş dizisi";

export function Oda2Paneli({ durum, calistir, makro }: { durum: SimulasyonDurumu; calistir: Calistir; makro?: MakroDurumu | null }) {
  const { seciliYon, bildir } = useArayuz();
  const o = durum.oda2;
  const heliMakrosu = makro && makro.ad === HELI_MAKRO_ADI ? makro : null;
  const guncelle = (k: Partial<typeof o>) => {
    // Elle helikopter komutu (Kalkış, "Elle" seçimi) süren iniş dizisini (köprü makrosu) iptal eder (§3-11)
    if (k.helikopter !== undefined && heliMakrosu) void api.makroDur().catch(() => undefined);
    void calistir(() => api.oda2(k));
  };
  const diziBaslangic = heliMakrosu ? heliMakrosu.baslangic : null;
  const [gecen, setGecen] = useState(0);

  useEffect(() => {
    if (diziBaslangic === null) return;
    const guncelleGecen = () => setGecen((Date.now() - diziBaslangic) / 1000);
    guncelleGecen();
    const t = window.setInterval(guncelleGecen, 200);
    return () => window.clearInterval(t);
  }, [diziBaslangic]);

  const diziBaslat = () => {
    void calistir(() =>
      api.makro(
        HELI_MAKRO_ADI,
        HELI_DIZISI.map((a, i) => ({ id: `heli_${i}`, gecikmeMs: a.sn * 1000, aciklama: `Helikopter ${HELIKOPTER_ETIKETLERI[a.durum]}`, islem: { tip: "oda2", oda2: { helikopter: a.durum } } })),
      ),
    ).then((r) => r && bildir({ tur: "bilgi", baslik: "Helikopter iniş dizisi başladı", metin: "Yaklaşma 20 sn → iniş 15 sn → yerde (köprüde çalışır)" }));
  };
  const diziIptal = () => {
    void calistir(() => api.makroDur());
  };

  return (
    <>
      <Bolum baslik="Güvenli Alan Görüntüsü" altBaslik="Tahliye noktası sahnesi; tek dokunuşla geçiş" ikon={<Ikon.sahne />}>
        <SecenekGrubu secenekler={GUVENLI_ALAN_ETIKETLERI} deger={o.guvenliAlan} onChange={(guvenliAlan) => guncelle({ guvenliAlan })} buyuk />
      </Bolum>

      <Bolum
        baslik="Helikopter"
        altBaslik="3B model panoramanın iniş alanına iner; rotor sesi ve toz otomatik"
        ikon={<Ikon.helikopter />}
        sag={<span className={`rozet ${o.helikopter === "yok" ? "notr" : "uyari"}`}>{HELIKOPTER_ETIKETLERI[o.helikopter]}</span>}
      >
        <div className="heli-dizi">
          {diziBaslangic === null ? (
            <button type="button" className="birincil buyuk" onClick={diziBaslat}>
              <Ikon.oynat /> Tam iniş dizisi (yaklaş → in → yerde)
            </button>
          ) : (
            <div className="heli-ilerleme">
              <div className="heli-ilerleme-ray">
                <span style={{ width: `${Math.min(100, (gecen / 35) * 100)}%` }} />
              </div>
              <div className="heli-asamalar">
                {HELI_DIZISI.map((a) => (
                  <span key={a.durum} className={gecen >= a.sn ? "tamam" : ""}>
                    {HELIKOPTER_ETIKETLERI[a.durum]}
                  </span>
                ))}
              </div>
              <button type="button" className="kucuk ikincil" onClick={diziIptal}>
                Diziyi iptal et
              </button>
            </div>
          )}
          <button type="button" className="buyuk" disabled={o.helikopter === "yok"} onClick={() => guncelle({ helikopter: "kalkiyor" })}>
            Kalkış
          </button>
        </div>
        <div className="satir">
          <span className="etiket">İniş yönü</span>
          <span className="rozet uyari">{yonMetni(o.helikopterYonu ?? 12)}</span>
          <button type="button" className="kucuk" disabled={(o.helikopterYonu ?? 12) === seciliYon} onClick={() => guncelle({ helikopterYonu: seciliYon })}>
            Seçili yöne indir ({seciliYon}°)
          </button>
        </div>
        <div className="satir">
          <span className="etiket">Elle</span>
          <SecenekGrubu secenekler={HELIKOPTER_ETIKETLERI} deger={o.helikopter} onChange={(helikopter) => guncelle({ helikopter })} />
        </div>
      </Bolum>

      <Bolum baslik="Uzaktan Sesler" altBaslik="Mesafeye göre boğuk ve zayıf; yön soldaki seçiciden" ikon={<Ikon.efekt />} sag={<span className="rozet amber">yön {yonMetni(seciliYon)}</span>}>
        <Kaydirici etiket="Mesafe" deger={o.uzakSesMesafesi} min={100} max={5000} adim={50} birim=" m" onChange={(uzakSesMesafesi) => guncelle({ uzakSesMesafesi })} />
        <div className="efekt-listesi">
          {(["uzak_patlama", "uzak_mermi_sesi"] as const).map((tur) => (
            <button
              key={tur}
              type="button"
              className={`efekt-satir ${tur === "uzak_patlama" ? "izli" : ""}`}
              onClick={() =>
                void calistir(() => api.efekt({ tur, siddet: 0.8, yon: seciliYon, mesafe: o.uzakSesMesafesi })).then(
                  (r) => r && bildir({ tur: "basari", baslik: `${EFEKT_ETIKETLERI[tur]} tetiklendi`, metin: `${yonMetni(seciliYon)} · ${o.uzakSesMesafesi} m` }),
                )
              }
            >
              <span className="efekt-satir-ad">{EFEKT_ETIKETLERI[tur]}</span>
              <span className="efekt-satir-aciklama">{o.uzakSesMesafesi} m uzaktan</span>
              <span className="efekt-satir-ok">Tetikle</span>
            </button>
          ))}
        </div>
      </Bolum>
    </>
  );
}
