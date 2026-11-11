/**
 * Oynatıcı ses düzeni (Sistem sekmesi): stereo / çok kanallı hoparlör yerleşimi. "Oynatıcı" düğmesi oynatıcıyı
 * `?ses=` ile açar; oynatıcı değeri kendi yerel kaydına yazar. Otomatik: oynatıcı ses cihazının kanal sayısına bakar.
 * Panelde seçim yokken oynatıcının kendi kaydındaki düzen gösterilir (oynatıcı elle `?ses=` ile açılmış olabilir).
 */
import { useEffect, useState } from "react";
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

function kayitOku(anahtar: string): string | null {
  try {
    return localStorage.getItem(anahtar);
  } catch {
    return null;
  }
}

/**
 * Oynatıcının yerel kaydı ("ses", "hoparlor"; oynatıcı `?ses=` / `?hoparlor=` ile yazar). Panel ve oynatıcı köprüden
 * (port 4000) açılınca aynı kökendedir: kayıt okunur, oynatıcı penceresi onu değiştirince ("storage" olayı) güncellenir.
 * Geliştirme sunucularında (5173 / 5174) ve ayrı profilli kiosk oynatıcısında kayıt görünmez (null).
 */
function useOynaticiKaydi(anahtar: string): string | null {
  const [deger, setDeger] = useState(() => kayitOku(anahtar));
  useEffect(() => {
    const dinle = (e: StorageEvent) => {
      if (e.key === null || e.key === anahtar) setDeger(kayitOku(anahtar));
    };
    window.addEventListener("storage", dinle);
    return () => window.removeEventListener("storage", dinle);
  }, [anahtar]);
  return deger;
}

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
  const oynaticiDuzeni = useOynaticiKaydi("ses");
  const oynaticiAcilari = useOynaticiKaydi("hoparlor");
  const secili = SECIMLER.find((s) => s === oynaticiParametreleri.ses);
  // Panelde seçim yoksa adres ?ses= taşımaz, oynatıcı kendi kaydındaki düzeni kullanır: etkin değer o
  const kayittan = secili ? undefined : SECIMLER.find((s) => s !== "otomatik" && s === oynaticiDuzeni);
  const deger: SesSecimi = secili ?? kayittan ?? "otomatik";
  // Otomatik de adrese yazılır (?ses=otomatik): oynatıcı her açılışta kayıtlı düzeni siler, cihazın kanal sayısına bakar
  const sec = (v: SesSecimi) => setOynaticiParametresi("ses", v);
  return (
    <Bolum baslik="Ses düzeni" altBaslik="Hoparlör sayısı ve yerleşimi" ikon={<HoparlorIkonu />}>
      <div className="satir">
        <span className="etiket">Düzen</span>
        <SecenekGrubu<SesSecimi> deger={deger} secenekler={SES_ETIKETLERI} onChange={sec} />
      </div>
      {kayittan && (
        <p className="aciklama">
          Oynatıcı kendi kaydındaki {SES_ETIKETLERI[kayittan]} düzenini kullanıyor (daha önce adresle <code>?ses={kayittan}</code>{" "}
          verilmiş). Cihazın kanal sayısına dönmek için Otomatik'i seç.
        </p>
      )}
      <p className="aciklama">
        Windows ses ayarlarında hoparlör yapılandırması 5.1 / 7.1 seçilmezse tarayıcı yalnızca 2 kanal görür ve oynatıcı stereo
        çalar. Çok kanalda sesler yönünden gelir (ön/arka ayrılır); 5.1 / 7.1'de patlama basları subwoofer'a gider.
      </p>
      <p className="aciklama">
        Oynatıcıda <kbd>T</kbd> hoparlör testi: her kanalda sırayla kısa gürültü, kanalın adı ekranda. Değişiklik üst çubuktaki
        "Oynatıcı" düğmesiyle açılan pencerede geçerli olur; açık oynatıcıyı kapatıp yeniden aç. Hoparlörler farklı açılardaysa
        oynatıcı adresine <code>?hoparlor=</code> eklenir (bkz. docs/duvar-oynatici.md).
        {oynaticiAcilari && (
          <>
            {" "}
            Oynatıcıda kayıtlı açılar: <code>{oynaticiAcilari}</code> (silmek için adrese <code>?hoparlor=otomatik</code>).
          </>
        )}
      </p>
    </Bolum>
  );
}
