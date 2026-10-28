/**
 * Oynatıcı ayarları (Sistem sekmesi): kalite kademesi. "Oynatıcı" düğmesi bu değerle açar; oynatıcı değeri
 * kendi yerel kaydına yazar, sonraki açılışlarda da kullanır. Dizüstünde "düşük", sahadaki RTX makinede "yüksek".
 */
import { KALITE_ETIKETLERI, useArayuz, type OynaticiKalite } from "../arayuz";
import type { BaglantiDurumu } from "../tipler";
import { Bolum, Ikon, SecenekGrubu } from "./ortak";

export function OynaticiAyarlari({ baglanti }: { baglanti: BaglantiDurumu | null }) {
  const { oynaticiKalite, setOynaticiKalite } = useArayuz();
  const sayi = baglanti?.oynatici.sayi ?? 0;
  return (
    <Bolum baslik="Oynatıcı ayarları" altBaslik="Görüntüyü üreten tarayıcı penceresi" ikon={<Ikon.pencere />} sag={sayi > 1 ? <span className="rozet uyari">{sayi} sekme açık</span> : undefined}>
      <div className="satir">
        <span className="etiket">Kalite</span>
        <SecenekGrubu<OynaticiKalite> deger={oynaticiKalite} secenekler={KALITE_ETIKETLERI} onChange={setOynaticiKalite} />
      </div>
      <p className="aciklama">
        Düşük: gölge haritası 1024, kenar yumuşatma kapalı, yarı parçacık. Yüksek: 2048, tam parçacık. Değişiklik üst çubuktaki
        "Oynatıcı" düğmesiyle açılan pencerede geçerli olur; açık oynatıcı penceresini kapatıp yeniden aç.
      </p>
      {sayi > 1 && (
        <p className="aciklama uyari-metin">
          {sayi} oynatıcı sekmesi bağlı. Hepsi aynı ekran kartında sahneyi çizer ve birbirini yavaşlatır; yalnızca biri açık kalsın.
        </p>
      )}
    </Bolum>
  );
}
