import type { SimulasyonDurumu } from "../tipler";
import { EFEKT_ETIKETLERI } from "../tipler";
import type { GunlukSatiri } from "../useKopru";
import { Bolum } from "./ortak";

export function GunlukPaneli({ gunluk, durum }: { gunluk: GunlukSatiri[]; durum: SimulasyonDurumu }) {
  return (
    <Bolum baslik="Olay Günlüğü" altBaslik="Son efektler ve sistem mesajları">
      {durum.sonEfektler.length > 0 && (
        <div className="son-efektler">
          {durum.sonEfektler.slice(0, 6).map((e, i) => (
            <span key={`${e.zaman}-${i}`} className="rozet notr">
              {new Date(e.zaman).toLocaleTimeString("tr-TR")} · {EFEKT_ETIKETLERI[e.tur]}
            </span>
          ))}
        </div>
      )}
      <ul className="gunluk">
        {gunluk.length === 0 && <li className="aciklama">Henüz kayıt yok.</li>}
        {gunluk.map((g, i) => (
          <li key={`${g.zaman}-${i}`} className={`gunluk-${g.seviye}`}>
            <time>{new Date(g.zaman).toLocaleTimeString("tr-TR")}</time>
            <span>{g.mesaj}</span>
          </li>
        ))}
      </ul>
    </Bolum>
  );
}
