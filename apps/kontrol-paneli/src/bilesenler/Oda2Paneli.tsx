import { api } from "../api";
import { GUVENLI_ALAN_ETIKETLERI, HELIKOPTER_ETIKETLERI, type SimulasyonDurumu } from "../tipler";
import { Bolum, Kaydirici, SecenekGrubu } from "./ortak";

type Calistir = <T>(islem: () => Promise<T>) => Promise<T | undefined>;

export function Oda2Paneli({ durum, calistir }: { durum: SimulasyonDurumu; calistir: Calistir }) {
  const o = durum.oda2;
  const guncelle = (k: Partial<typeof o>) => void calistir(() => api.oda2(k));
  return (
    <>
      <Bolum baslik="Güvenli Alan Görüntüsü" altBaslik="Şartname §7 – tek komutla geçiş">
        <SecenekGrubu secenekler={GUVENLI_ALAN_ETIKETLERI} deger={o.guvenliAlan} onChange={(guvenliAlan) => guncelle({ guvenliAlan })} />
      </Bolum>

      <Bolum baslik="Helikopter" altBaslik="Şartname §8 – yaklaşma ve iniş animasyonu, rotor sesi, toz ve rüzgâr">
        <SecenekGrubu secenekler={HELIKOPTER_ETIKETLERI} deger={o.helikopter} onChange={(helikopter) => guncelle({ helikopter })} />
        <div className="hizli-saat">
          <span className="etiket">Tam dizi</span>
          <button
            type="button"
            className="birincil"
            onClick={() => {
              void calistir(async () => {
                await api.oda2({ helikopter: "yaklasiyor" });
                setTimeout(() => void api.oda2({ helikopter: "iniyor" }), 20000);
                setTimeout(() => void api.oda2({ helikopter: "yerde" }), 35000);
              });
            }}
          >
            Yaklaş → İn (55 sn)
          </button>
          <button type="button" onClick={() => guncelle({ helikopter: "kalkiyor" })}>
            Kalkış
          </button>
        </div>
      </Bolum>

      <Bolum baslik="Uzaktan Sesler" altBaslik="Şartname §9 – mesafe ve yöne göre zayıflatılmış patlama ve mermi sesleri">
        <Kaydirici etiket="Mesafe" deger={o.uzakSesMesafesi} min={100} max={5000} adim={50} birim=" m" onChange={(uzakSesMesafesi) => guncelle({ uzakSesMesafesi })} />
        <Kaydirici etiket="Yön" deger={o.uzakSesYonu} min={0} max={359} adim={1} birim="°" onChange={(uzakSesYonu) => guncelle({ uzakSesYonu })} />
        <div className="efekt-dugmeleri">
          <button type="button" className="efekt tehlike" onClick={() => void calistir(() => api.efekt({ tur: "uzak_patlama", siddet: 0.8 }))}>
            Uzaktan patlama
          </button>
          <button type="button" className="efekt" onClick={() => void calistir(() => api.efekt({ tur: "uzak_mermi_sesi", siddet: 0.7 }))}>
            Uzaktan mermi sesi
          </button>
        </div>
      </Bolum>
    </>
  );
}
