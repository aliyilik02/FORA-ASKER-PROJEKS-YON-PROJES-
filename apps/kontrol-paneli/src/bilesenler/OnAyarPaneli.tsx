import { useEffect, useState } from "react";
import { api } from "../api";
import type { OnAyar } from "../tipler";
import { Bolum } from "./ortak";

type Calistir = <T>(islem: () => Promise<T>) => Promise<T | undefined>;

export function OnAyarPaneli({ calistir }: { calistir: Calistir }) {
  const [onAyarlar, setOnAyarlar] = useState<OnAyar[]>([]);
  const [ad, setAd] = useState("");

  const yenile = () => void calistir(() => api.onAyarlar()).then((o) => o && setOnAyarlar(o));
  useEffect(yenile, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Bolum baslik="Ön Ayarlar" altBaslik="Mevcut bölge, ortam, ışık ve efekt ayarlarını kaydedip tek tıkla geri yükleyin">
      <form
        className="satir"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ad.trim()) return;
          void calistir(() => api.onAyarKaydet(ad.trim())).then(() => {
            setAd("");
            yenile();
          });
        }}
      >
        <input type="text" placeholder="Ön ayar adı (ör. Dağlık – kış gecesi)" value={ad} onChange={(e) => setAd(e.target.value)} />
        <button type="submit" className="birincil" disabled={!ad.trim()}>
          Mevcut durumu kaydet
        </button>
      </form>
      {onAyarlar.length === 0 ? (
        <p className="aciklama">Henüz kayıtlı ön ayar yok.</p>
      ) : (
        <ul className="on-ayar-listesi">
          {onAyarlar.map((o) => (
            <li key={o.id}>
              <div>
                <strong>{o.ad}</strong>
                <small>{new Date(o.olusturma).toLocaleString("tr-TR")}</small>
              </div>
              <div className="dugme-grubu">
                <button type="button" className="kucuk birincil" onClick={() => void calistir(() => api.onAyarYukle(o.id))}>
                  Yükle
                </button>
                <button
                  type="button"
                  className="kucuk ikincil"
                  onClick={() => {
                    if (confirm(`"${o.ad}" silinsin mi?`)) void calistir(() => api.onAyarSil(o.id)).then(yenile);
                  }}
                >
                  Sil
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Bolum>
  );
}
