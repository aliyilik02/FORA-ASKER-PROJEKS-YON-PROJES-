import { useEffect, useState } from "react";
import { api } from "../api";
import type { Senaryo, SenaryoDurumu, SimulasyonDurumu } from "../tipler";
import { Bolum, sureBicimi } from "./ortak";
import { SenaryoEditoru } from "./SenaryoEditoru";

type Calistir = <T>(islem: () => Promise<T>) => Promise<T | undefined>;

export function SenaryoPaneli({
  senaryoDurumu,
  simDurumu,
  calistir,
}: {
  senaryoDurumu: SenaryoDurumu | null;
  simDurumu: SimulasyonDurumu;
  calistir: Calistir;
}) {
  const [senaryolar, setSenaryolar] = useState<Senaryo[]>([]);
  const [secili, setSecili] = useState<string>("");
  const [editorAcik, setEditorAcik] = useState(false);

  const listeyiYenile = () => void calistir(() => api.senaryolar()).then((s) => s && setSenaryolar(s));
  useEffect(listeyiYenile, []); // eslint-disable-line react-hooks/exhaustive-deps

  const yuklu = senaryolar.find((s) => s.id === senaryoDurumu?.senaryoId);
  const durum = senaryoDurumu?.durum ?? "duruyor";
  const konum = senaryoDurumu?.konumMs ?? 0;
  const toplam = senaryoDurumu?.toplamMs ?? 0;

  return (
    <Bolum
      baslik="Senaryo"
      altBaslik="Zaman çizelgesine göre otomatik akış; eğitmen istediği adımı anında tetikleyebilir"
      sag={
        yuklu && (
          <span className={`rozet ${durum === "oynuyor" ? "iyi" : durum === "duraklatildi" ? "uyari" : "notr"}`}>
            {durum === "oynuyor" ? "Oynatılıyor" : durum === "duraklatildi" ? "Duraklatıldı" : "Hazır"} · {sureBicimi(konum)} / {sureBicimi(toplam)}
          </span>
        )
      }
    >
      <div className="satir">
        <select value={secili} onChange={(e) => setSecili(e.target.value)}>
          <option value="">Senaryo seçin…</option>
          {senaryolar.map((s) => (
            <option key={s.id} value={s.id}>
              {s.oda === "oda1" ? "[Oda 1] " : "[Oda 2] "}
              {s.ad}
            </option>
          ))}
        </select>
        <button type="button" className="birincil" disabled={!secili} onClick={() => void calistir(() => api.senaryoYukle(secili))}>
          Yükle
        </button>
        <button
          type="button"
          className="ikincil"
          disabled={!secili}
          onClick={() => {
            if (confirm("Seçili senaryo silinsin mi?")) void calistir(() => api.senaryoSil(secili)).then(listeyiYenile);
          }}
        >
          Sil
        </button>
        <button type="button" className={editorAcik ? "secili" : ""} onClick={() => setEditorAcik((a) => !a)}>
          {editorAcik ? "Editörü kapat" : "+ Yeni senaryo"}
        </button>
      </div>

      {editorAcik && (
        <SenaryoEditoru
          durum={simDurumu}
          calistir={calistir}
          onVazgec={() => setEditorAcik(false)}
          onKaydedildi={(s) => {
            setEditorAcik(false);
            setSecili(s.id);
            listeyiYenile();
            void calistir(() => api.senaryoYukle(s.id));
          }}
        />
      )}

      {yuklu && (
        <>
          <p className="aciklama">{yuklu.aciklama}</p>
          <div className="oynatma-kontrolleri">
            <button type="button" className="birincil buyuk" disabled={durum === "oynuyor"} onClick={() => void calistir(() => api.senaryoOynat())}>
              ▶ {durum === "duraklatildi" ? "Devam" : "Oynat"}
            </button>
            <button type="button" className="buyuk" disabled={durum !== "oynuyor"} onClick={() => void calistir(() => api.senaryoDuraklat())}>
              ❚❚ Duraklat
            </button>
            <button type="button" className="tehlike buyuk" disabled={durum === "duruyor"} onClick={() => void calistir(() => api.senaryoDur())}>
              ■ Durdur
            </button>
          </div>
          <div className="ilerleme">
            <div className="ilerleme-dolgu" style={{ width: toplam ? `${Math.min(100, (konum / toplam) * 100)}%` : "0%" }} />
          </div>
          <ol className="adim-listesi">
            {yuklu.adimlar.map((a) => {
              const tamam = senaryoDurumu?.tamamlanan.includes(a.id);
              return (
                <li key={a.id} className={tamam ? "tamam" : ""}>
                  <span className="adim-zaman">{sureBicimi(a.gecikmeMs)}</span>
                  <span className="adim-aciklama">{a.aciklama}</span>
                  <button type="button" className="kucuk" onClick={() => void calistir(() => api.adimTetikle(yuklu.id, a.id))}>
                    Şimdi tetikle
                  </button>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </Bolum>
  );
}
