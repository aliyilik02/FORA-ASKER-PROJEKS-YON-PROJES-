/**
 * Oynatıcı ses düzeni (Sistem sekmesi): stereo / çok kanallı hoparlör yerleşimi. "Oynatıcı" düğmesi oynatıcıyı
 * `?ses=` ile açar; oynatıcı değeri kendi yerel kaydına yazar. Otomatik: oynatıcı ses cihazının kanal sayısına bakar.
 */
import { useArayuz } from "../arayuz";
import { Bolum, SecenekGrubu } from "./ortak";

type SesSecimi = "otomatik" | "stereo" | "dortlu" | "5.1" | "7.1";
const SES_ETIKETLERI: Record<SesSecimi, string> = {
  otomatik: "Otomatik (cihazın kanal sayısına göre)",
  stereo: "Stereo",
  dortlu: "4 kanal",
  "5.1": "5.1",
  "7.1": "7.1",
};
const SECIMLER = Object.keys(SES_ETIKETLERI) as SesSecimi[];

/** Hoparlör ikonu (ortak ikonlarla aynı çizgi: 20 px ızgara, 1,6 kalınlık). */
function HoparlorIkonu() {
  return (
    <svg width={18} height={18} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 8v4h3l4 3V5L6 8z" />
      <path d="M13 7.5a3.5 3.5 0 0 1 0 5M15.5 5a7 7 0 0 1 0 10" />
    </svg>
  );
}

export function SesDuzeniAyari() {
  const { oynaticiParametreleri, setOynaticiParametresi } = useArayuz();
  const kayitli = oynaticiParametreleri.ses;
  const deger: SesSecimi = SECIMLER.find((s) => s === kayitli) ?? "otomatik";
  const sec = (v: SesSecimi) => {
    // Otomatik = parametre yok. Daha önce bir düzen gönderildiyse "otomatik" gider: oynatıcı yerel kaydındaki
    // eski düzeni siler (parametresiz açılışta oynatıcı son kaydı kullanırdı).
    if (v === "otomatik") setOynaticiParametresi("ses", kayitli ? "otomatik" : null);
    else setOynaticiParametresi("ses", v);
  };
  return (
    <Bolum baslik="Ses düzeni" altBaslik="Hoparlör sayısı ve yerleşimi" ikon={<HoparlorIkonu />}>
      <div className="satir">
        <span className="etiket">Düzen</span>
        <SecenekGrubu<SesSecimi> deger={deger} secenekler={SES_ETIKETLERI} onChange={sec} />
      </div>
      <p className="aciklama">
        Windows ses ayarlarında hoparlör yapılandırması 5.1 / 7.1 seçilmezse tarayıcı yalnızca 2 kanal görür ve oynatıcı stereo
        çalar. Çok kanalda sesler yönünden gelir (ön/arka ayrılır), patlama basları subwoofer'a gider.
      </p>
      <p className="aciklama">
        Oynatıcıda <kbd>T</kbd> hoparlör testi: her kanalda sırayla kısa gürültü, kanalın adı ekranda. Değişiklik üst çubuktaki
        "Oynatıcı" düğmesiyle açılan pencerede geçerli olur; açık oynatıcıyı kapatıp yeniden aç. Hoparlörler farklı açılardaysa
        oynatıcı adresine <code>?hoparlor=</code> eklenir (bkz. docs/duvar-oynatici.md).
      </p>
    </Bolum>
  );
}
