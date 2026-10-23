import { useEffect, useState } from "react";
import { api } from "../api";
import { useArayuz } from "../arayuz";
import { BOLGE_ETIKETLERI, MEVSIM_ETIKETLERI, type OnAyar } from "../tipler";
import { Bolum, Ikon, OnayliDugme, saatBicimi } from "./ortak";

type Calistir = <T>(islem: () => Promise<T>) => Promise<T | undefined>;

export function OnAyarPaneli({ calistir }: { calistir: Calistir }) {
  const { bildir } = useArayuz();
  const [onAyarlar, setOnAyarlar] = useState<OnAyar[]>([]);
  const [ad, setAd] = useState("");

  const yenile = () => void calistir(() => api.onAyarlar()).then((o) => o && setOnAyarlar(o));
  useEffect(yenile, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Bolum baslik="Ön Ayarlar" altBaslik="Şu anki bölge, saat, hava ve ışığı adla kaydet; derste tek dokunuşla geri çağır" ikon={<Ikon.sistem />}>
      <form
        className="satir"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ad.trim()) return;
          void calistir(() => api.onAyarKaydet(ad.trim())).then((r) => {
            if (!r) return;
            setAd("");
            yenile();
            bildir({ tur: "basari", baslik: `"${r.ad}" kaydedildi` });
          });
        }}
      >
        <input type="text" placeholder="Ön ayar adı (ör. Dağlık – kış gecesi)" value={ad} onChange={(e) => setAd(e.target.value)} />
        <button type="submit" className="birincil" disabled={!ad.trim()}>
          Kaydet
        </button>
      </form>
      {onAyarlar.length === 0 ? (
        <p className="aciklama">Henüz kayıtlı ön ayar yok.</p>
      ) : (
        <ul className="liste">
          {onAyarlar.map((o) => (
            <li key={o.id}>
              <span className="liste-isaret onayar" />
              <div className="liste-govde">
                <strong>{o.ad}</strong>
                <small>
                  {BOLGE_ETIKETLERI[o.durum.bolge]} · {MEVSIM_ETIKETLERI[o.durum.ortam.mevsim]} · {saatBicimi(o.durum.ortam.saat)} · {new Date(o.olusturma).toLocaleDateString("tr-TR")}
                </small>
              </div>
              <button type="button" className="kucuk birincil" onClick={() => void calistir(() => api.onAyarYukle(o.id)).then((r) => r && bildir({ tur: "basari", baslik: `"${o.ad}" yüklendi` }))}>
                Yükle
              </button>
              <OnayliDugme sinif="kucuk ikincil" onay="Silinsin mi?" onClick={() => void calistir(() => api.onAyarSil(o.id)).then(yenile)}>
                Sil
              </OnayliDugme>
            </li>
          ))}
        </ul>
      )}
    </Bolum>
  );
}
