/**
 * Eğitmen ekranının yan çekmeceleri: "Yer ve hava" (bölge kartları + tek dokunuşluk hazır hava/saat seçimleri) ve
 * "Senaryolar" (hazır senaryoyu seç, oynat). İnce ayar (kaydırıcılar, senaryo düzenleme) Teknisyen sayfasındadır.
 */
import type { ReactNode } from "react";
import { api } from "../../api";
import { useArayuz } from "../../arayuz";
import { BOLGE_ETIKETLERI, GUN_ZAMANI_SAATI, gunZamani, type Bolge, type OrtamAyarlari, type Senaryo, type SenaryoDurumu, type SimulasyonDurumu } from "../../tipler";
import { sureBicimi } from "../ortak";

type Calistir = <T>(islem: () => Promise<T>) => Promise<T | undefined>;

export function Cekmece({ baslik, altBaslik, onKapat, children }: { baslik: string; altBaslik?: string; onKapat: () => void; children: ReactNode }) {
  return (
    <div className="cekmece-perde" onPointerDown={(e) => e.target === e.currentTarget && onKapat()}>
      <aside className="cekmece" role="dialog" aria-label={baslik}>
        <header>
          <div>
            <h2>{baslik}</h2>
            {altBaslik && <p>{altBaslik}</p>}
          </div>
          <button type="button" className="cekmece-kapat" onClick={onKapat}>
            Kapat
          </button>
        </header>
        <div className="cekmece-govde">{children}</div>
      </aside>
    </div>
  );
}

const BOLGE_ACIKLAMA: Record<Bolge, string> = {
  kirsal_acik_arazi: "Tarla, toprak yol, köy",
  meskun_mahal: "Şehir caddesi, binalar",
  ormanlik: "Sık ağaçlık",
  daglik: "Kayalık, yamaç",
  us_bolgesi: "Üs, beton alan",
};
const ZAMANLAR: Array<{ ad: string; saat: number }> = [
  { ad: "Gündüz", saat: GUN_ZAMANI_SAATI.gunduz },
  { ad: "Gece", saat: GUN_ZAMANI_SAATI.gece },
];
const HAVALAR: Array<{ ad: string; aciklama: string; ortam: Partial<OrtamAyarlari> }> = [
  { ad: "Açık", aciklama: "Güneşli, temiz hava", ortam: { yagis: "yok", bulut: 0.15, sis: 0, simsek: false, ruzgarSiddeti: 0.2 } },
  { ad: "Bulutlu", aciklama: "Kapalı gök", ortam: { yagis: "yok", bulut: 0.85, sis: 0.05, simsek: false, ruzgarSiddeti: 0.3 } },
  { ad: "Sisli", aciklama: "Görüş kısa", ortam: { yagis: "yok", bulut: 0.6, sis: 0.55, simsek: false, ruzgarSiddeti: 0.1 } },
  { ad: "Yağmurlu", aciklama: "Hafif yağmur", ortam: { yagis: "hafif_yagmur", bulut: 0.85, sis: 0.1, simsek: false, ruzgarSiddeti: 0.4 } },
  { ad: "Fırtına", aciklama: "Sağanak ve şimşek", ortam: { yagis: "siddetli_yagmur", bulut: 1, sis: 0.2, simsek: true, ruzgarSiddeti: 0.8 } },
  { ad: "Kar yağıyor", aciklama: "Kışa geçer", ortam: { mevsim: "kis", yagis: "kar", bulut: 0.9, sis: 0.2, simsek: false, ruzgarSiddeti: 0.3 } },
];

export function YerVeHava({ durum, calistir }: { durum: SimulasyonDurumu; calistir: Calistir }) {
  const { bildir } = useArayuz();
  const o = durum.ortam;
  const ortam = (k: Partial<OrtamAyarlari>, baslik: string) => void calistir(() => api.ortam(k)).then((r) => r && bildir({ tur: "basari", baslik }));
  const havaSecili = (h: Partial<OrtamAyarlari>) => h.yagis === o.yagis && Math.abs((h.sis ?? 0) - o.sis) < 0.12 && Math.abs((h.bulut ?? 0) - o.bulut) < 0.2;
  const kis = o.mevsim === "kis";
  return (
    <>
      <h3 className="cekmece-baslik">Neresi?</h3>
      <div className="kart-izgara">
        {(Object.keys(BOLGE_ETIKETLERI) as Bolge[]).map((b) => (
          <button key={b} type="button" className={`secim-karti ${durum.bolge === b ? "secili" : ""}`} onClick={() => void calistir(() => api.bolgeSec(b)).then((r) => r && bildir({ tur: "basari", baslik: BOLGE_ETIKETLERI[b] }))}>
            <strong>{BOLGE_ETIKETLERI[b]}</strong>
            <small>{BOLGE_ACIKLAMA[b]}</small>
          </button>
        ))}
      </div>

      <h3 className="cekmece-baslik">Mevsim</h3>
      <div className="kart-izgara iki">
        <button type="button" className={`secim-karti ${!kis ? "secili" : ""}`} onClick={() => ortam({ mevsim: "yaz", ...(o.yagis === "kar" ? { yagis: "yok" as const } : {}) }, "Yaz")}>
          <strong>Yaz</strong>
          <small>Yeşil, kuru zemin</small>
        </button>
        <button type="button" className={`secim-karti ${kis ? "secili" : ""}`} onClick={() => ortam({ mevsim: "kis" }, "Kış")}>
          <strong>Kış</strong>
          <small>Karlı zemin</small>
        </button>
      </div>

      <h3 className="cekmece-baslik">Gündüz mü, gece mi?</h3>
      <div className="kart-izgara iki">
        {ZAMANLAR.map((z) => (
          <button key={z.ad} type="button" className={`secim-karti ${gunZamani(o.saat) === gunZamani(z.saat) ? "secili" : ""}`} onClick={() => ortam({ saat: z.saat }, z.ad)}>
            <strong>{z.ad}</strong>
          </button>
        ))}
      </div>

      <h3 className="cekmece-baslik">Hava</h3>
      <div className="kart-izgara">
        {HAVALAR.map((h) => (
          <button key={h.ad} type="button" className={`secim-karti ${havaSecili(h.ortam) ? "secili" : ""}`} onClick={() => ortam(h.ortam, h.ad)}>
            <strong>{h.ad}</strong>
            <small>{h.aciklama}</small>
          </button>
        ))}
      </div>
      <p className="cekmece-not">Yer ya da zaman değişince duvar birkaç saniyede yeni görüntüye geçer. Daha ince ayar (rüzgâr, ışık rengi) Teknisyen sayfasında.</p>
    </>
  );
}

export function SenaryoSecimi({ senaryolar, senaryoDurumu, calistir, onKapat, onDuzenle }: { senaryolar: Senaryo[]; senaryoDurumu: SenaryoDurumu | null; calistir: Calistir; onKapat: () => void; onDuzenle: () => void }) {
  const { bildir } = useArayuz();
  const oynat = (s: Senaryo) =>
    void calistir(async () => {
      await api.senaryoYukle(s.id);
      return api.senaryoOynat();
    }).then((r) => {
      if (!r) return;
      bildir({ tur: "basari", baslik: "Senaryo başladı", metin: s.ad });
      onKapat();
    });
  const oynayan = senaryoDurumu && senaryoDurumu.durum !== "duruyor" ? senaryoDurumu.senaryoId : null;
  return (
    <>
      <p className="cekmece-not ust">Senaryo, olayları kendi sırasıyla oynatır. Başlayınca sahne temizlenir; istediğin an Duraklat ya da Bitir diyebilirsin.</p>
      <ul className="senaryo-kartlari">
        {senaryolar
          .filter((s) => !/^test/i.test(s.ad))
          .map((s) => {
          const sure = s.adimlar.reduce((m, a) => Math.max(m, a.gecikmeMs), 0);
          return (
            <li key={s.id} className={oynayan === s.id ? "oynuyor" : ""}>
              <div>
                <strong>{s.ad}</strong>
                <small>
                  {sureBicimi(sure)} · {s.oda === "oda2" ? "Oda 2" : "Oda 1"}
                </small>
                {s.aciklama && <p>{s.aciklama}</p>}
              </div>
              {oynayan === s.id ? (
                <span className="konu-durum acik">Oynuyor</span>
              ) : (
                <button type="button" className="birincil" data-kilit-serbest onClick={() => oynat(s)}>
                  Oynat
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <button type="button" className="cekmece-baglanti" onClick={onDuzenle}>
        Senaryo hazırla ya da düzenle (Teknisyen sayfası)
      </button>
    </>
  );
}
