/** Sağ altta kısa süreli bildirimler; hata bildirimleri daha uzun kalır. */
import { useArayuz } from "../arayuz";
import { Ikon } from "./ortak";

export function Bildirimler() {
  const { bildirimler, bildirimKapat } = useArayuz();
  if (bildirimler.length === 0) return null;
  return (
    <div className="bildirimler" aria-live="polite">
      {bildirimler.map((b) => (
        <div key={b.id} className={`bildirim bildirim-${b.tur}`}>
          <span className="bildirim-cizgi" />
          <div className="bildirim-govde">
            <strong>{b.baslik}</strong>
            {b.metin && <small>{b.metin}</small>}
          </div>
          <button type="button" className="bildirim-kapat" aria-label="Kapat" onClick={() => bildirimKapat(b.id)}>
            <Ikon.kapat />
          </button>
        </div>
      ))}
    </div>
  );
}
