import { useEffect, useState } from "react";
import { api } from "../api";
import { useArayuz } from "../arayuz";
import type { Senaryo, SenaryoDurumu, SimulasyonDurumu } from "../tipler";
import { Bolum, Ikon, OnayliDugme, sureBicimi } from "./ortak";
import { SenaryoEditoru } from "./SenaryoEditoru";

type Calistir = <T>(islem: () => Promise<T>) => Promise<T | undefined>;

export function SenaryoPaneli({ senaryoDurumu, simDurumu, calistir }: { senaryoDurumu: SenaryoDurumu | null; simDurumu: SimulasyonDurumu; calistir: Calistir }) {
  const { bildir } = useArayuz();
  const [senaryolar, setSenaryolar] = useState<Senaryo[]>([]);
  const [editorAcik, setEditorAcik] = useState(false);

  const listeyiYenile = () => void calistir(() => api.senaryolar()).then((s) => s && setSenaryolar(s));
  useEffect(listeyiYenile, []); // eslint-disable-line react-hooks/exhaustive-deps

  const yuklu = senaryolar.find((s) => s.id === senaryoDurumu?.senaryoId);
  const durum = senaryoDurumu?.durum ?? "duruyor";
  const konum = senaryoDurumu?.konumMs ?? 0;
  const toplam = senaryoDurumu?.toplamMs ?? 0;
  const sonraki = yuklu?.adimlar.find((a) => !senaryoDurumu?.tamamlanan.includes(a.id) && a.gecikmeMs >= konum);

  return (
    <>
      <Bolum
        baslik="Senaryo"
        altBaslik="Zaman çizelgesi otomatik akar; istediğin adımı anında tetikleyebilirsin"
        ikon={<Ikon.senaryo />}
        sag={
          <button type="button" className={`kucuk ${editorAcik ? "secili" : "ikincil"}`} onClick={() => setEditorAcik((a) => !a)}>
            {editorAcik ? "Editörü kapat" : "+ Yeni senaryo"}
          </button>
        }
      >
        {editorAcik && (
          <SenaryoEditoru
            durum={simDurumu}
            calistir={calistir}
            onVazgec={() => setEditorAcik(false)}
            onKaydedildi={(s) => {
              setEditorAcik(false);
              listeyiYenile();
              void calistir(() => api.senaryoYukle(s.id));
              bildir({ tur: "basari", baslik: `"${s.ad}" kaydedildi ve yüklendi` });
            }}
          />
        )}

        {senaryolar.length === 0 && !editorAcik && <p className="aciklama">Kayıtlı senaryo yok. "+ Yeni senaryo" ile oluştur.</p>}
        {senaryolar.length > 0 && (
          <ul className="liste senaryo-listesi">
            {senaryolar.map((s) => {
              const buYuklu = s.id === senaryoDurumu?.senaryoId;
              return (
                <li key={s.id} className={buYuklu ? "secili" : ""}>
                  <span className={`liste-isaret ${s.oda === "oda1" ? "oda1" : "oda2"}`}>{s.oda === "oda1" ? "1" : "2"}</span>
                  <div className="liste-govde">
                    <strong>{s.ad}</strong>
                    <small>
                      {s.adimlar.length} adım · {sureBicimi(s.adimlar.reduce((m, a) => Math.max(m, a.gecikmeMs), 0))}
                      {s.aciklama ? ` · ${s.aciklama}` : ""}
                    </small>
                  </div>
                  {buYuklu ? (
                    <span className="rozet amber">yüklü</span>
                  ) : (
                    <button type="button" className="kucuk birincil" onClick={() => void calistir(() => api.senaryoYukle(s.id))}>
                      Yükle
                    </button>
                  )}
                  <OnayliDugme sinif="kucuk ikincil" onay="Silinsin mi?" onClick={() => void calistir(() => api.senaryoSil(s.id)).then(listeyiYenile)}>
                    Sil
                  </OnayliDugme>
                </li>
              );
            })}
          </ul>
        )}
      </Bolum>

      {yuklu && (
        <Bolum
          baslik={yuklu.ad}
          altBaslik={yuklu.aciklama ?? "Yüklü senaryo"}
          ikon={<Ikon.oynat />}
          sinif={durum === "oynuyor" ? "oynuyor" : ""}
          sag={
            <span className={`rozet ${durum === "oynuyor" ? "iyi" : durum === "duraklatildi" ? "uyari" : "notr"}`}>
              {durum === "oynuyor" ? "Oynatılıyor" : durum === "duraklatildi" ? "Duraklatıldı" : "Hazır"}
            </span>
          }
        >
          <div className="oynatma">
            <button type="button" className="birincil buyuk" disabled={durum === "oynuyor"} onClick={() => void calistir(() => api.senaryoOynat())}>
              <Ikon.oynat /> {durum === "duraklatildi" ? "Devam" : "Oynat"}
            </button>
            <button type="button" className="buyuk" disabled={durum !== "oynuyor"} onClick={() => void calistir(() => api.senaryoDuraklat())}>
              <Ikon.duraklat /> Duraklat
            </button>
            <button type="button" className="tehlike buyuk" disabled={durum === "duruyor"} onClick={() => void calistir(() => api.senaryoDur())}>
              <Ikon.durdur /> Durdur
            </button>
          </div>
          <div className="zaman-cizgisi">
            <div className="zaman-cizgisi-ray">
              <span className="zaman-cizgisi-dolgu" style={{ width: toplam ? `${Math.min(100, (konum / toplam) * 100)}%` : "0%" }} />
              {yuklu.adimlar.map((a) => (
                <i key={a.id} className={`zaman-cizgisi-isaret ${senaryoDurumu?.tamamlanan.includes(a.id) ? "tamam" : ""}`} style={{ left: toplam ? `${(a.gecikmeMs / toplam) * 100}%` : "0%" }} title={`${sureBicimi(a.gecikmeMs)} ${a.aciklama}`} />
              ))}
            </div>
            <div className="zaman-cizgisi-okuma">
              <span className="mono">{sureBicimi(konum)}</span>
              {sonraki && durum === "oynuyor" && (
                <span className="sonraki-adim">
                  sonraki: {sonraki.aciklama} · {sureBicimi(sonraki.gecikmeMs - konum)}
                </span>
              )}
              <span className="mono">{sureBicimi(toplam)}</span>
            </div>
          </div>
          <ol className="adim-listesi">
            {yuklu.adimlar.map((a) => {
              const tamam = senaryoDurumu?.tamamlanan.includes(a.id);
              return (
                <li key={a.id} className={`${tamam ? "tamam" : ""} ${sonraki?.id === a.id ? "sirada" : ""}`}>
                  <span className="adim-zaman mono">{sureBicimi(a.gecikmeMs)}</span>
                  <span className="adim-aciklama">{a.aciklama}</span>
                  <button type="button" className="kucuk ikincil" onClick={() => void calistir(() => api.adimTetikle(yuklu.id, a.id))}>
                    Şimdi
                  </button>
                </li>
              );
            })}
          </ol>
        </Bolum>
      )}
    </>
  );
}
