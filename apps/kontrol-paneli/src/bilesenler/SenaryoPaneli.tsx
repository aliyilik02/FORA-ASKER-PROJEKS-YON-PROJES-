import { useState } from "react";
import { api } from "../api";
import { useArayuz } from "../arayuz";
import type { Senaryo, SenaryoDurumu, SimulasyonDurumu } from "../tipler";
import { Bolum, Ikon, OnayliDugme, sureBicimi } from "./ortak";
import { SenaryoEditoru } from "./SenaryoEditoru";

type Calistir = <T>(islem: () => Promise<T>) => Promise<T | undefined>;

/**
 * Liste `senaryolar` üstten gelir (useKopru: açılışta çekilir, köprünün `senaryolar` mesajıyla yenilenir): başka panel
 * senaryo kaydedince/silince burası da güncellenir; eskiden yalnız açılışta çekiliyor, yüklü senaryo listede yoksa
 * Oynat/Duraklat denetimleri kayboluyordu (§3-15).
 */
export function SenaryoPaneli({ senaryoDurumu, senaryolar, simDurumu, calistir }: { senaryoDurumu: SenaryoDurumu | null; senaryolar: Senaryo[]; simDurumu: SimulasyonDurumu; calistir: Calistir }) {
  const { bildir } = useArayuz();
  const [editorAcik, setEditorAcik] = useState(false);

  const yuklu = senaryolar.find((s) => s.id === senaryoDurumu?.senaryoId);
  const durum = senaryoDurumu?.durum ?? "duruyor";
  const bekliyor = durum === "bekliyor";
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
                  <OnayliDugme sinif="kucuk ikincil" onay="Silinsin mi?" onClick={() => void calistir(() => api.senaryoSil(s.id))}>
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
            <span className={`rozet ${durum === "oynuyor" ? "iyi" : durum === "duraklatildi" || bekliyor ? "uyari" : "notr"}`}>
              {durum === "oynuyor" ? "Oynatılıyor" : durum === "duraklatildi" ? "Duraklatıldı" : bekliyor ? "Onay bekliyor" : "Hazır"}
            </span>
          }
        >
          {bekliyor && senaryoDurumu?.bekleme && (
            <div className="bekleme-kutusu" role="status">
              <strong>Eğitmen onayı bekleniyor</strong>
              <span>{senaryoDurumu.bekleme.mesaj}</span>
              <small>Kursiyer hazır olunca "Devam" (ya da Boşluk); sonraki adımlar bekleme süresi kadar kayar.</small>
            </div>
          )}
          <div className="oynatma">
            <button type="button" className="birincil buyuk" data-kilit-serbest disabled={durum === "oynuyor"} onClick={() => void calistir(() => (bekliyor ? api.senaryoDevam() : api.senaryoOynat()))}>
              <Ikon.oynat /> {durum === "duraklatildi" || bekliyor ? "Devam" : "Oynat"}
            </button>
            <button type="button" className="buyuk" data-kilit-serbest disabled={durum !== "oynuyor"} onClick={() => void calistir(() => api.senaryoDuraklat())}>
              <Ikon.duraklat /> Duraklat
            </button>
            <button type="button" className="tehlike buyuk" data-kilit-serbest disabled={durum === "duruyor"} onClick={() => void calistir(() => api.senaryoDur())}>
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
                  <span className="adim-aciklama">
                    {a.aciklama}
                    {a.beklenen && <small className="adim-beklenen"> · beklenen: {a.beklenen}</small>}
                  </span>
                  <button
                    type="button"
                    className="kucuk ikincil"
                    onClick={() =>
                      void calistir(() => api.adimTetikle(yuklu.id, a.id)).then((r) => {
                        if (r && !r.tamam) bildir({ tur: "hata", baslik: "Adım uygulanamadı", metin: r.uyari ?? a.aciklama });
                      })
                    }
                  >
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
