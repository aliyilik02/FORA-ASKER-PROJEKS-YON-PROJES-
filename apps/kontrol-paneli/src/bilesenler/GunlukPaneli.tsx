import { useState } from "react";
import type { SimulasyonDurumu } from "../tipler";
import { EFEKT_ETIKETLERI } from "../tipler";
import type { GunlukSatiri } from "../useKopru";
import { Bolum, Ikon } from "./ortak";

export function GunlukPaneli({ gunluk, durum }: { gunluk: GunlukSatiri[]; durum: SimulasyonDurumu }) {
  const [suzgec, setSuzgec] = useState<"hepsi" | "uyari">("hepsi");
  const liste = suzgec === "hepsi" ? gunluk : gunluk.filter((g) => g.seviye !== "bilgi");
  return (
    <Bolum
      baslik="Olay Günlüğü"
      altBaslik="Son efektler ve sistem mesajları"
      ikon={<Ikon.sistem />}
      sag={
        <div className="secenek-grubu">
          <button type="button" className={suzgec === "hepsi" ? "secili" : ""} onClick={() => setSuzgec("hepsi")}>
            Hepsi
          </button>
          <button type="button" className={suzgec === "uyari" ? "secili" : ""} onClick={() => setSuzgec("uyari")}>
            Uyarı ve hata
          </button>
        </div>
      }
    >
      {durum.sonEfektler.length > 0 && (
        <div className="son-efektler">
          {durum.sonEfektler.slice(0, 6).map((e, i) => (
            <span key={`${e.zaman}-${i}`} className="rozet notr">
              {new Date(e.zaman).toLocaleTimeString("tr-TR")} · {EFEKT_ETIKETLERI[e.tur]}
              {e.yon !== undefined ? ` · ${e.yon}°` : ""}
            </span>
          ))}
        </div>
      )}
      <ul className="gunluk">
        {liste.length === 0 && <li className="aciklama">Kayıt yok.</li>}
        {liste.map((g, i) => (
          <li key={`${g.zaman}-${i}`} className={`gunluk-${g.seviye}`}>
            <time>{new Date(g.zaman).toLocaleTimeString("tr-TR")}</time>
            <span>{g.mesaj}</span>
          </li>
        ))}
      </ul>
    </Bolum>
  );
}
