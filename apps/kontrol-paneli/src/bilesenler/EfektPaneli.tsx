import { useState } from "react";
import { api } from "../api";
import { useArayuz } from "../arayuz";
import { EFEKT_ETIKETLERI, type EfektTuru, type MakroDurumu, type SenaryoAdimi, type SimulasyonDurumu } from "../tipler";
import { Anahtar, Bolum, Ikon, Kaydirici, yonMetni } from "./ortak";

type Calistir = <T>(islem: () => Promise<T>) => Promise<T | undefined>;

const ODA1_EFEKTLERI: Array<{ tur: EfektTuru; aciklama: string; sinif?: string }> = [
  { tur: "patlama", aciklama: "Ateş topu, toprak, moloz; kalıcı krater ve duman", sinif: "izli" },
  { tur: "havan", aciklama: "Önce düşen ıslık (1,4 sn, siper alma penceresi), sonra seçilen yönde patlama ve oda ışığında flaş", sinif: "izli" },
  { tur: "toz_duman", aciklama: "Yere yakın toz bulutu" },
  { tur: "gurultu", aciklama: "Seri atış (6–10 el)" },
  { tur: "bagirma", aciklama: "Yaralı var! Siper al!" },
  { tur: "cagirma", aciklama: "Sıhhiye! Sedye getirin!" },
  { tur: "simsek", aciklama: "Seçilen yönde çakma, gecikmeli gök gürültüsü, oda ışığında flaş" },
  { tur: "yangin", aciklama: "Seçilen yönde kalıcı yangın: alev, kor, kara duman, titreyen ışık (söndürene kadar sürer)", sinif: "izli" },
  { tur: "yangin_sondur", aciklama: "Sahnedeki bütün yangınlar söner (duman bir süre tüter)" },
  { tur: "fisek", aciklama: "Seçilen yönde paraşütlü aydınlatma fişeği: ~28 sn salınan sert ışık, duman izi; gece araziyi ve yaralıyı gösterir" },
];

/**
 * İzli mermi yönü: 0 seçilen duvarın uzağından izleyiciye doğru; ±90'a yakın komşu duvar yönünden gelip seçilen duvarın
 * önünden yandan geçer; + sağdan sola (←), − soldan sağa (→).
 */
function izliYonMetni(v: number): string {
  const d = Math.round(v);
  if (Math.abs(d) <= 5) return `${d}° · izleyiciye`;
  return `${d > 0 ? "+" : ""}${d}° · ${Math.abs(d) >= 70 ? "yandan" : "çapraz"} ${d > 0 ? "←" : "→"}`;
}

/** Hazır makrolar (eğitmen dizileri): adımlar köprüde zamanlanır; yön soldaki seçiciden. */
function makrolar(yon: number): Array<{ ad: string; aciklama: string; adimlar: SenaryoAdimi[] }> {
  const efekt = (id: string, ms: number, tur: EfektTuru, siddet: number, sapma = 0): SenaryoAdimi => ({ id, gecikmeMs: ms, aciklama: EFEKT_ETIKETLERI[tur], islem: { tip: "efekt", efekt: { tur, siddet, yon: (((yon + sapma) % 360) + 360) % 360 } } });
  return [
    {
      ad: "Pusu",
      aciklama: "Havan ıslığı → patlama, çatışma başlar, bağırma, ikinci patlama, 25 sn sonra çatışma durur",
      adimlar: [
        efekt("m1", 0, "havan", 1),
        { id: "m2", gecikmeMs: 1500, aciklama: "Çatışma", islem: { tip: "catisma", catisma: { aktif: true, siddet: 0.7, yon } } },
        efekt("m3", 2500, "bagirma", 1),
        efekt("m4", 6000, "patlama", 0.8, 25),
        efekt("m5", 12000, "toz_duman", 0.8, -20),
        { id: "m6", gecikmeMs: 25000, aciklama: "Çatışma durur", islem: { tip: "catisma", catisma: { aktif: false } } },
      ],
    },
    {
      ad: "Havan baskını",
      aciklama: "Üç havan mermisi 4 sn arayla, farklı yönlerden",
      adimlar: [efekt("h1", 0, "havan", 1), efekt("h2", 4000, "havan", 0.9, 30), efekt("h3", 8000, "havan", 1, -35)],
    },
    {
      ad: "Gece aydınlatma",
      aciklama: "Aydınlatma fişeği, 12 sn sonra ikinci fişek komşu yönden",
      adimlar: [efekt("f1", 0, "fisek", 1), efekt("f2", 12000, "fisek", 1, 40)],
    },
    {
      ad: "Temas kes",
      aciklama: "Çatışma ve izli mermi kapanır, yangınlar söner",
      adimlar: [
        { id: "t1", gecikmeMs: 0, aciklama: "Çatışma durur", islem: { tip: "catisma", catisma: { aktif: false } } },
        { id: "t2", gecikmeMs: 0, aciklama: "İzli mermi kapalı", islem: { tip: "izli_mermi", izliMermi: { aktif: false } } },
        efekt("t3", 500, "yangin_sondur", 1),
      ],
    },
  ];
}

export function EfektPaneli({ durum, calistir, makro }: { durum: SimulasyonDurumu; calistir: Calistir; makro?: MakroDurumu | null }) {
  const { seciliYon, bildir } = useArayuz();
  const [siddet, setSiddet] = useState(1);
  const m = durum.izliMermi;
  const mermiGuncelle = (k: Partial<typeof m>) => void calistir(() => api.izliMermi(k));
  const c = durum.catisma ?? { aktif: false, siddet: 0.5, yon: 0, dostAtes: true };
  const catismaGuncelle = (k: Partial<typeof c>) => void calistir(() => api.catisma(k));

  return (
    <>
      <Bolum
        baslik="Efektler"
        altBaslik="Yön soldaki seçiciden gelir; her efekt panoramanın açık alanlarına yerleşir (ağaç ve bina içinde patlamaz)"
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

      <Bolum
        baslik="Makrolar"
        altBaslik="Tek dokunuşla eğitmen dizisi; köprüde zamanlanır, tablet kapansa da sürer; Sıfırla keser"
        ikon={<Ikon.senaryo />}
        sag={makro ? <span className="rozet iyi">{makro.ad} · {makro.tamamlanan}/{makro.adimSayisi}</span> : undefined}
      >
        <div className="efekt-listesi">
          {makrolar(seciliYon).map((m) => (
            <button
              key={m.ad}
              type="button"
              className="efekt-satir"
              disabled={Boolean(makro)}
              onClick={() => void calistir(() => api.makro(m.ad, m.adimlar)).then((r) => r && bildir({ tur: "basari", baslik: `Makro başladı: ${m.ad}`, metin: `${m.adimlar.length} adım · ${yonMetni(seciliYon)}` }))}
            >
              <span className="efekt-satir-ad">{m.ad}</span>
              <span className="efekt-satir-aciklama">{m.aciklama}</span>
              <span className="efekt-satir-ok">Başlat</span>
            </button>
          ))}
        </div>
        {makro && (
          <button type="button" className="kucuk tehlike" onClick={() => void calistir(() => api.makroDur())}>
            Makroyu durdur
          </button>
        )}
      </Bolum>

      <Bolum
        baslik="Çatışma"
        altBaslik="Düşman cephesinden gelen ateş: izli mermiler yere çarpar, seker; sahnedeki silahlı figürler karşılık verir"
        ikon={<Ikon.efekt />}
        sinif={c.aktif ? "oynuyor" : ""}
        sag={<Anahtar acik={c.aktif} onChange={(aktif) => catismaGuncelle({ aktif })} etiket={c.aktif ? "Sürüyor" : "Durdu"} />}
      >
        <div className="satir">
          <span className="etiket">Düşman yönü</span>
          <span className="rozet kotu">{yonMetni(c.yon)}</span>
          <button type="button" className="kucuk" disabled={c.yon === seciliYon} onClick={() => catismaGuncelle({ yon: seciliYon })}>
            Seçili yönü al ({seciliYon}°)
          </button>
        </div>
        <Kaydirici etiket="Şiddet" deger={c.siddet} min={0.05} max={1} bicim={(v) => (v < 0.3 ? `%${Math.round(v * 100)} · tek tük` : v < 0.7 ? `%${Math.round(v * 100)} · yoğun` : `%${Math.round(v * 100)} · ağır çatışma`)} onChange={(siddet) => catismaGuncelle({ siddet })} vurgu="izli" />
        <Anahtar acik={c.dostAtes} onChange={(dostAtes) => catismaGuncelle({ dostAtes })} etiket="Dost ateşi" aciklama="Sahnedeki silahlı figürler (asker, tank) düşmana döner ve ateş eder" />
        <p className="aciklama">Figür eklemek için Figürler bölümünden "Cephe kur" kullan: seçili yöne üç asker yerleşir.</p>
      </Bolum>

      <Bolum baslik="İzli Mermi" altBaslik="Seçilen duvardan sürekli izli mermi akışı (çatışmadan bağımsız)" ikon={<Ikon.efekt />} sag={<Anahtar acik={m.aktif} onChange={(aktif) => mermiGuncelle({ aktif })} etiket={m.aktif ? "Açık" : "Kapalı"} />}>
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
            <Kaydirici etiket="Mermi yönü" deger={m.yon} min={-90} max={90} adim={1} bicim={izliYonMetni} onChange={(yon) => mermiGuncelle({ yon })} />
            <Kaydirici etiket="Sıklık" deger={m.siklik} min={0.5} max={20} adim={0.5} birim=" /sn" onChange={(siklik) => mermiGuncelle({ siklik })} />
          </div>
          <p className="aciklama">
            Yön 0°: mermiler seçilen duvarın uzağından izleyiciye doğru gelir (bir kısmı yakına çarpar, seker, başın üstünden
            geçer). ±90°: mermiler komşu duvar yönünden gelip seçilen duvarın 10–60 m önünden yandan geçer; + sağdan sola,
            − soldan sağa (yan duvarda bir yönde komşu duvar yok: sağ duvarda +, sol duvarda − mermiler arkadan gelir).
            Başın yakınından geçen mermi "çat" diye ses verir.
          </p>
        </div>
      </Bolum>
    </>
  );
}
