import { useCallback, useEffect } from "react";
import { api } from "./api";
import { ArayuzSaglayici, useArayuz } from "./arayuz";
import { Bildirimler } from "./bilesenler/Bildirimler";
import { CanliSahne } from "./bilesenler/CanliSahne";
import { EfektPaneli } from "./bilesenler/EfektPaneli";
import { FigurPaneli } from "./bilesenler/FigurPaneli";
import { GunlukPaneli } from "./bilesenler/GunlukPaneli";
import { IsikPaneli } from "./bilesenler/IsikPaneli";
import { Oda2Paneli } from "./bilesenler/Oda2Paneli";
import { OnAyarPaneli } from "./bilesenler/OnAyarPaneli";
import { OrnekPaneli } from "./bilesenler/OrnekPaneli";
import { OynaticiAyarlari } from "./bilesenler/OynaticiAyarlari";
import { BolgePaneli, OrtamPaneli } from "./bilesenler/OrtamPaneli";
import { SenaryoPaneli } from "./bilesenler/SenaryoPaneli";
import { UnrealKomutlariPaneli } from "./bilesenler/UnrealKomutlariPaneli";
import { UstCubuk } from "./bilesenler/UstCubuk";
import { SEKME_KISAYOLLARI, YanMenu } from "./bilesenler/YanMenu";
import { EFEKT_ETIKETLERI, type EfektTuru } from "./tipler";
import { useKopru } from "./useKopru";

export function Uygulama() {
  return (
    <ArayuzSaglayici>
      <Govde />
    </ArayuzSaglayici>
  );
}

function Govde() {
  const kopru = useKopru();
  const { durum, senaryo, baglanti, gunluk, unrealIstekler, ornek, figurler, soketAcik, hata } = kopru;
  const { sekme, setSekme, seciliYon, setSeciliYon, bildir } = useArayuz();

  // API çağrılarını sarar: hata olursa bildirim
  const calistir = useCallback(
    async <T,>(islem: () => Promise<T>): Promise<T | undefined> => {
      const r = await kopru.calistir(islem);
      return r;
    },
    [kopru],
  );
  useEffect(() => {
    if (hata) bildir({ tur: "hata", baslik: "İşlem başarısız", metin: hata });
  }, [hata, bildir]);

  // Klavye kısayolları (yazı alanlarında devre dışı)
  useEffect(() => {
    const dinle = (e: KeyboardEvent) => {
      const hedef = e.target as HTMLElement | null;
      if (hedef && ["INPUT", "SELECT", "TEXTAREA"].includes(hedef.tagName)) return;
      if (!durum) return;
      const s = SEKME_KISAYOLLARI[e.key];
      if (s) {
        e.preventDefault();
        setSekme(s);
        return;
      }
      const efektler: EfektTuru[] = durum.oda === "oda1" ? ["patlama", "toz_duman", "gurultu", "bagirma", "cagirma"] : ["uzak_patlama", "uzak_mermi_sesi", "bagirma", "cagirma"];
      const n = Number(e.key);
      if (n >= 1 && n <= efektler.length) {
        const tur = efektler[n - 1];
        void calistir(() => api.efekt({ tur, siddet: tur === "patlama" ? 1 : 0.8, yon: seciliYon, mesafe: durum.oda2.uzakSesMesafesi })).then((r) => {
          if (r) bildir({ tur: "basari", baslik: `${EFEKT_ETIKETLERI[tur]} tetiklendi`, metin: `${seciliYon}°` });
        });
        return;
      }
      if (e.key === "6" && durum.oda === "oda1") {
        // Canlı sahne kartındaki "Asker vuruldu" ile aynı: pusulaya en yakın ayakta asker
        const adaylar = figurler.filter((f) => /^asker_(bekleyen|taktik|diz_cokmus|kamuflaj)/.test(f.klip ?? "") && f.poz !== "yarali");
        if (adaylar.length) {
          const hedefAz = ((seciliYon + 180) % 360) - 180;
          const fark = (a: number) => Math.abs((((a - hedefAz) % 360) + 540) % 360 - 180);
          const f = [...adaylar].sort((a, b) => fark(a.azimut ?? 0) - fark(b.azimut ?? 0))[0];
          void calistir(() => api.figur({ islem: "poz", id: f.id, poz: "yarali" })).then((r) => r && bildir({ tur: "hata", baslik: "Asker vuruldu" }));
        }
        return;
      }
      if (e.key === "ArrowLeft") setSeciliYon(seciliYon - (e.shiftKey ? 15 : 5));
      if (e.key === "ArrowRight") setSeciliYon(seciliYon + (e.shiftKey ? 15 : 5));
      if (e.key === " " && senaryo?.senaryoId) {
        e.preventDefault();
        void calistir(() => (senaryo.durum === "oynuyor" ? api.senaryoDuraklat() : api.senaryoOynat()));
      }
    };
    window.addEventListener("keydown", dinle);
    return () => window.removeEventListener("keydown", dinle);
  }, [durum, senaryo, seciliYon, setSeciliYon, setSekme, calistir, bildir, figurler]);

  if (!durum) {
    return (
      <div className="yukleniyor">
        <span className="yukleniyor-lamba" />
        <p>Köprü sunucusuna bağlanılıyor…</p>
        <small>
          Sunucu çalışmıyorsa <code>demo.bat</code> veya <code>npm start</code> ile başlatın.
        </small>
      </div>
    );
  }

  return (
    <div className="uygulama">
      <UstCubuk durum={durum} baglanti={baglanti} soketAcik={soketAcik} onOda={(oda) => void calistir(() => api.odaSec(oda))} calistir={calistir} />
      <div className="govde">
        <YanMenu rozetler={{ figurler: figurler.length, senaryo: senaryo?.durum === "oynuyor" ? "▶" : undefined, sistem: gunluk.filter((g) => g.seviye === "hata").length || undefined }} />
        <main className="icerik">
          <aside className="sol-kolon">
            <CanliSahne durum={durum} figurler={figurler} senaryo={senaryo} calistir={calistir} />
          </aside>
          <div className="sag-kolon" key={sekme}>
            {sekme === "sahne" && (
              <>
                <BolgePaneli durum={durum} calistir={calistir} />
                <OrtamPaneli durum={durum} calistir={calistir} />
                <IsikPaneli durum={durum} calistir={calistir} />
              </>
            )}
            {sekme === "efektler" && (durum.oda === "oda1" ? <EfektPaneli durum={durum} calistir={calistir} /> : <Oda2Paneli durum={durum} calistir={calistir} />)}
            {sekme === "figurler" && <FigurPaneli aktifler={figurler} calistir={calistir} />}
            {sekme === "senaryo" && (
              <>
                <SenaryoPaneli senaryoDurumu={senaryo} simDurumu={durum} calistir={calistir} />
                <OnAyarPaneli calistir={calistir} />
              </>
            )}
            {sekme === "sistem" && (
              <>
                <OynaticiAyarlari baglanti={baglanti} />
                <OrnekPaneli ornek={ornek} calistir={calistir} />
                <UnrealKomutlariPaneli istekler={unrealIstekler} baglanti={baglanti} />
                <GunlukPaneli gunluk={gunluk} durum={durum} />
              </>
            )}
          </div>
        </main>
      </div>
      <Bildirimler />
    </div>
  );
}
