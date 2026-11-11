/**
 * Üst çubuktaki tek global tehlikeli eylem: sahneyi temele döndür (figürler, efektler, çatışma, izli mermi, helikopter,
 * senaryo oynatımı; ortam, bölge ve ışık kalır). İki aşama: ilk dokunuş (ya da Esc) kurar, düğme 3 sn kızıl nabızla
 * "Temizlensin mi?" der; ikinci dokunuş (ya da Esc) sıfırlar. Kurulu durum dışarıda (Uygulama) tutulur, klavye ve düğme
 * aynı durumu paylaşır. Rozet: sahnede etkin öğe sayısı (figür + çatışma + izli + helikopter + senaryo); 0 iken düğme
 * ikincil tonda görünür ama yine çalışır (krater, duman ve sesi panel bilmez).
 */
import { Ikon } from "./ortak";

export function SifirlaDugmesi({ kurulu, sayi, onDokun, etiket = "Sıfırla" }: { kurulu: boolean; sayi: number; onDokun: () => void; etiket?: string }) {
  return (
    <button
      type="button"
      className={`sifirla-dugme kucuk ikonlu ${kurulu ? "onay-bekliyor" : sayi > 0 ? "tehlike" : "ikincil"}`}
      onClick={onDokun}
      aria-live="polite"
      title="Sahneyi temele döndür: figürler, efektler, krater/duman, sesler, çatışma, izli mermi, helikopter ve senaryo oynatımı temizlenir; ortam, bölge, ışık ve yüklü senaryo kalır. İki dokunuş ya da Esc, Esc."
    >
      <Ikon.temizle />
      {kurulu ? (
        <span className="sifirla-metin">Temizlensin mi?</span>
      ) : (
        <>
          <span className="sifirla-metin">{etiket}</span>
          {sayi > 0 && <span className="sifirla-sayi mono">{sayi}</span>}
        </>
      )}
      <kbd>Esc</kbd>
    </button>
  );
}
