/**
 * Oynatıcı ayarları (Sistem sekmesi): kalite kademesi. "Oynatıcı" düğmesi bu değerle açar; oynatıcı elle kademeyi
 * kendi yerel kaydına yazar, sonraki açılışlarda da kullanır. "Otomatik" (varsayılan) kaydı siler, oynatıcı ekran
 * kartına göre seçer: dizüstünde (Intel entegre) "orta", sahadaki RTX makinede "yüksek".
 */
import { KALITE_ETIKETLERI, useArayuz, type OynaticiKalite } from "../arayuz";
import type { BaglantiDurumu } from "../tipler";
import { Bolum, Ikon, SecenekGrubu } from "./ortak";

type Sarsinti = "kapali" | "hafif" | "tam";
const SARSINTI_ETIKETLERI: Record<Sarsinti, string> = { kapali: "Kapalı", hafif: "Hafif", tam: "Tam" };

export function OynaticiAyarlari({ baglanti }: { baglanti: BaglantiDurumu | null }) {
  const { oynaticiKalite, setOynaticiKalite, oynaticiParametreleri, setOynaticiParametresi } = useArayuz();
  const sayi = baglanti?.oynatici.sayi ?? 0;
  const sarsinti = (["kapali", "hafif", "tam"] as const).find((s) => s === oynaticiParametreleri.sarsinti) ?? "hafif";
  return (
    <Bolum baslik="Oynatıcı ayarları" altBaslik="Görüntüyü üreten tarayıcı penceresi" ikon={<Ikon.pencere />} sag={sayi > 1 ? <span className="rozet uyari">{sayi} sekme açık</span> : undefined}>
      <div className="satir">
        <span className="etiket">Kalite</span>
        <SecenekGrubu<OynaticiKalite> deger={oynaticiKalite} secenekler={KALITE_ETIKETLERI} onChange={setOynaticiKalite} />
      </div>
      <div className="satir">
        <span className="etiket">Sarsıntı</span>
        <SecenekGrubu<Sarsinti> deger={sarsinti} secenekler={SARSINTI_ETIKETLERI} onChange={(s) => setOynaticiParametresi("sarsinti", s)} />
      </div>
      <p className="aciklama">
        Sarsıntı: patlamada duvar görüntüsünün titremesi. Projeksiyon odasında bütün dünyanın sallanması baş dönmesi ve yön
        kaybı yapabilir (izleyici hareketi kendi başlatmaz); yerde yaralıyla çalışan kursiyer için "Kapalı" ya da "Hafif"
        (varsayılan) önerilir. Flaş, toz ve ses etkilenmez.
      </p>
      <p className="aciklama">
        Otomatik: oynatıcı ekran kartına bakar (Intel entegre → orta, diğerleri → yüksek; HUD'da "otomatik" yazar). Düşük: gölge
        haritası 1024, kenar yumuşatma kapalı, yarı parçacık, sahne geçişinde küçük arka plan küpü. Yüksek: 2048, tam
        parçacık. Değişiklik üst çubuktaki "Oynatıcı" düğmesiyle açılan pencerede geçerli olur; açık oynatıcı penceresini
        kapatıp yeniden aç.
      </p>
      {sayi > 1 && (
        <p className="aciklama uyari-metin">
          {sayi} oynatıcı sekmesi bağlı. Hepsi aynı ekran kartında sahneyi çizer ve birbirini yavaşlatır; yalnızca biri açık kalsın.
        </p>
      )}
    </Bolum>
  );
}
