import { api } from "../api";
import type { OrnekDurumu } from "../tipler";
import { Bolum } from "./ortak";

type Calistir = <T>(islem: () => Promise<T>) => Promise<T | undefined>;

/**
 * Paketlenmiş örnek UE oyununu (ör. TCCC) panelden başlatır/durdurur.
 * Köprüde ORNEK_PAKET ayarlanmamışsa bölüm gösterilmez.
 */
export function OrnekPaneli({ ornek, calistir }: { ornek: OrnekDurumu | null; calistir: Calistir }) {
  if (!ornek || (!ornek.yapilandirildi && !ornek.calisiyor)) return null;
  const sure = ornek.baslangic ? Math.round((Date.now() - ornek.baslangic) / 60000) : 0;
  return (
    <Bolum
      baslik="Örnek Paket (demo)"
      altBaslik="Paketlenmiş UE oyunu; panele bağlı değildir, yan yana gösterim için"
      sag={
        <span className={`rozet ${ornek.calisiyor ? "iyi" : "notr"}`}>
          {ornek.calisiyor ? `Çalışıyor · pid ${ornek.pid}${sure ? ` · ${sure} dk` : ""}` : "Kapalı"}
        </span>
      }
    >
      <div className="oynatma-kontrolleri">
        <button type="button" className="birincil" disabled={ornek.calisiyor} onClick={() => void calistir(() => api.ornekBaslat())}>
          ▶ Örneği başlat
        </button>
        <button type="button" className="tehlike" disabled={!ornek.calisiyor} onClick={() => void calistir(() => api.ornekDurdur())}>
          ■ Kapat
        </button>
      </div>
      {ornek.sonCikis && !ornek.calisiyor && (
        <p className="aciklama">
          Son kapanış: {new Date(ornek.sonCikis.zaman).toLocaleTimeString("tr-TR")}
          {ornek.sonCikis.hata
            ? ` · hata: ${ornek.sonCikis.hata}`
            : ornek.sonCikis.sinyal
              ? " · panelden kapatıldı"
              : ` · çıkış kodu ${ornek.sonCikis.kod ?? "?"}`}
        </p>
      )}
      <details>
        <summary className="aciklama">Komut satırı</summary>
        <code className="komut">{ornek.komut}</code>
      </details>
    </Bolum>
  );
}
