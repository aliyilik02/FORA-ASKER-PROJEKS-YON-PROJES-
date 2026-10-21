import { api } from "./api";
import { BaglantiCubugu } from "./bilesenler/BaglantiCubugu";
import { EfektPaneli } from "./bilesenler/EfektPaneli";
import { FigurPaneli } from "./bilesenler/FigurPaneli";
import { GunlukPaneli } from "./bilesenler/GunlukPaneli";
import { IsikPaneli } from "./bilesenler/IsikPaneli";
import { Oda2Paneli } from "./bilesenler/Oda2Paneli";
import { OnAyarPaneli } from "./bilesenler/OnAyarPaneli";
import { OrnekPaneli } from "./bilesenler/OrnekPaneli";
import { BolgePaneli, OrtamPaneli } from "./bilesenler/OrtamPaneli";
import { SenaryoPaneli } from "./bilesenler/SenaryoPaneli";
import { UnrealKomutlariPaneli } from "./bilesenler/UnrealKomutlariPaneli";
import { useKopru } from "./useKopru";

export function Uygulama() {
  const { durum, senaryo, baglanti, gunluk, unrealIstekler, ornek, figurler, soketAcik, hata, calistir } = useKopru();

  if (!durum) {
    return (
      <div className="yukleniyor">
        <p>Köprü sunucusuna bağlanılıyor…</p>
        <small>Sunucu çalışmıyorsa <code>npm run dev:kopru</code> ile başlatın.</small>
      </div>
    );
  }

  return (
    <div className="uygulama">
      <BaglantiCubugu
        baglanti={baglanti}
        soketAcik={soketAcik}
        oda={durum.oda}
        hata={hata}
        onOda={(oda) => void calistir(() => api.odaSec(oda))}
        calistir={calistir}
      />

      <main className="izgara">
        <div className="sutun">
          <BolgePaneli durum={durum} calistir={calistir} />
          <OrtamPaneli durum={durum} calistir={calistir} />
          <IsikPaneli durum={durum} calistir={calistir} />
          <FigurPaneli aktifler={figurler} calistir={calistir} />
        </div>
        <div className="sutun">
          {durum.oda === "oda1" ? <EfektPaneli durum={durum} calistir={calistir} /> : <Oda2Paneli durum={durum} calistir={calistir} />}
          <SenaryoPaneli senaryoDurumu={senaryo} simDurumu={durum} calistir={calistir} />
        </div>
        <div className="sutun">
          <OnAyarPaneli calistir={calistir} />
          <OrnekPaneli ornek={ornek} calistir={calistir} />
          <UnrealKomutlariPaneli istekler={unrealIstekler} baglanti={baglanti} />
          <GunlukPaneli gunluk={gunluk} durum={durum} />
        </div>
      </main>
    </div>
  );
}
