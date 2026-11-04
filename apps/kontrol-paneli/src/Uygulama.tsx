import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { ArayuzSaglayici, useArayuz } from "./arayuz";
import { Bildirimler } from "./bilesenler/Bildirimler";
import { CanliSahne } from "./bilesenler/CanliSahne";
import { DuvarGeometrisiAyari } from "./bilesenler/DuvarGeometrisiAyari";
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
import { SesDuzeniAyari } from "./bilesenler/SesDuzeniAyari";
import { UnrealKomutlariPaneli } from "./bilesenler/UnrealKomutlariPaneli";
import { UstCubuk } from "./bilesenler/UstCubuk";
import { SEKME_KISAYOLLARI, YanMenu } from "./bilesenler/YanMenu";
import { EFEKT_ETIKETLERI, SIFIRLAMA_KAYNAK_ETIKETLERI, sifirlamaOzetiMetni, type EfektTuru, type SifirlamaKaynagi } from "./tipler";
import { vurulabilirAskerler, yoneEnYakin } from "./figurYardimcilari";
import { useKopru } from "./useKopru";

/** Sıfırla düğmesinin kurulu (onay bekleyen) kalma süresi: ikinci dokunuş / Esc bu sürede gelmezse çözülür. */
const SIFIRLAMA_ONAY_MS = 3000;

export function Uygulama() {
  return (
    <ArayuzSaglayici>
      <Govde />
    </ArayuzSaglayici>
  );
}

function Govde() {
  const kopru = useKopru();
  const { durum, senaryo, baglanti, gunluk, unrealIstekler, ornek, figurler, onizleme, sonSifirlama, soketAcik, hata, sifirlamaUygula } = kopru;
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

  /**
   * Sahneyi sıfırla, iki aşama (düğme ve klavye aynı durumu paylaşır): ilk dokunuş / Esc kurar, SIFIRLAMA_ONAY_MS
   * içinde ikincisi sıfırlar, süre dolunca çözülür. Ref mantığın kaynağı (iki hızlı Esc arasında yeniden çizim olmasa
   * da doğru), durum yalnız görünüm için.
   */
  const [sifirlamaKurulu, setSifirlamaKurulu] = useState(false);
  const kuruluRef = useRef(false);
  const sifirlaDokun = useCallback(
    (kaynak: SifirlamaKaynagi) => {
      if (!kuruluRef.current) {
        kuruluRef.current = true;
        setSifirlamaKurulu(true);
        return;
      }
      kuruluRef.current = false;
      setSifirlamaKurulu(false);
      void calistir(() => api.sahneSifirla(kaynak)).then((y) => y && sifirlamaUygula(y));
    },
    [calistir, sifirlamaUygula],
  );
  useEffect(() => {
    if (!sifirlamaKurulu) return;
    const t = window.setTimeout(() => {
      kuruluRef.current = false;
      setSifirlamaKurulu(false);
    }, SIFIRLAMA_ONAY_MS);
    return () => window.clearTimeout(t);
  }, [sifirlamaKurulu]);
  // Sıfırlama (bu panelden, başka panelden ya da oynatıcıdan ⇧0): nesil başına tek bildirim (WS mesajı ve API yanıtı aynı nesli taşır)
  const bildirilenNesil = useRef<number | null>(null);
  useEffect(() => {
    if (!sonSifirlama || sonSifirlama.nesil === bildirilenNesil.current) return;
    bildirilenNesil.current = sonSifirlama.nesil;
    bildir({ tur: "basari", baslik: "Sahne temele döndü", metin: `${sifirlamaOzetiMetni(sonSifirlama.ozet)} · ${SIFIRLAMA_KAYNAK_ETIKETLERI[sonSifirlama.kaynak]} · ortam ve bölge korundu` });
  }, [sonSifirlama, bildir]);

  // Klavye kısayolları (yazı alanlarında devre dışı)
  useEffect(() => {
    const dinle = (e: KeyboardEvent) => {
      const hedef = e.target as HTMLElement | null;
      if (hedef && ["INPUT", "SELECT", "TEXTAREA"].includes(hedef.tagName)) return;
      if (!durum) return;
      // Esc, Esc: sahneyi sıfırla (iki aşamalı onayın klavye karşılığı). Basılı tutmak (tuş tekrarı) onaylamaz;
      // Ctrl/Alt/Meta/Shift ile gelen Esc yok sayılır (Shift+Esc Chrome'da görev yöneticisi).
      if (e.key === "Escape") {
        if (e.repeat || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
        e.preventDefault();
        sifirlaDokun("kisayol");
        return;
      }
      const s = SEKME_KISAYOLLARI[e.key];
      if (s) {
        e.preventDefault();
        setSekme(s);
        return;
      }
      const efektler: EfektTuru[] = durum.oda === "oda1" ? ["patlama", "toz_duman", "gurultu", "bagirma", "cagirma"] : ["uzak_patlama", "uzak_mermi_sesi", "bagirma", "cagirma"];
      const n = Number(e.key);
      if (n >= 1 && n <= efektler.length) {
        // Basılı tutunca (~30/sn) efekt yağmuru olmasın
        if (e.repeat) return;
        const tur = efektler[n - 1];
        void calistir(() => api.efekt({ tur, siddet: tur === "patlama" ? 1 : 0.8, yon: seciliYon, mesafe: durum.oda2.uzakSesMesafesi })).then((r) => {
          if (r) bildir({ tur: "basari", baslik: `${EFEKT_ETIKETLERI[tur]} tetiklendi`, metin: `${seciliYon}°` });
        });
        return;
      }
      if (e.key === "6" && durum.oda === "oda1") {
        if (e.repeat) return;
        // Canlı sahne kartındaki "Asker vuruldu" ile aynı: seçili yöne en yakın ayakta asker
        const f = yoneEnYakin(vurulabilirAskerler(figurler), seciliYon);
        if (f) void calistir(() => api.figur({ islem: "poz", id: f.id, poz: "yarali" })).then((r) => r && bildir({ tur: "hata", baslik: "Asker vuruldu" }));
        return;
      }
      if (e.key === "ArrowLeft") setSeciliYon(seciliYon - (e.shiftKey ? 15 : 5));
      if (e.key === "ArrowRight") setSeciliYon(seciliYon + (e.shiftKey ? 15 : 5));
      if (e.key === " " && senaryo?.senaryoId) {
        e.preventDefault();
        if (e.repeat) return;
        void calistir(() => (senaryo.durum === "oynuyor" ? api.senaryoDuraklat() : api.senaryoOynat()));
      }
    };
    window.addEventListener("keydown", dinle);
    return () => window.removeEventListener("keydown", dinle);
  }, [durum, senaryo, seciliYon, setSeciliYon, setSekme, calistir, bildir, figurler, sifirlaDokun]);

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

  // Sıfırla rozetindeki etkin öğe sayısı: figürler + çatışma + izli mermi + (Oda 2'de) helikopter + oynayan/duraklatılmış senaryo
  const sifirlanacak =
    figurler.length +
    (durum.catisma?.aktif ? 1 : 0) +
    (durum.izliMermi.aktif ? 1 : 0) +
    (durum.oda === "oda2" && durum.oda2.helikopter !== "yok" ? 1 : 0) +
    (senaryo?.senaryoId && senaryo.durum !== "duruyor" ? 1 : 0);

  return (
    <div className="uygulama">
      <UstCubuk
        durum={durum}
        baglanti={baglanti}
        soketAcik={soketAcik}
        onOda={(oda) => void calistir(() => api.odaSec(oda))}
        calistir={calistir}
        sifirla={{ kurulu: sifirlamaKurulu, sayi: sifirlanacak, onDokun: () => sifirlaDokun("panel") }}
      />
      <div className="govde">
        <YanMenu rozetler={{ figurler: figurler.length, senaryo: senaryo?.durum === "oynuyor" ? "▶" : undefined, sistem: gunluk.filter((g) => g.seviye === "hata").length || undefined }} />
        <main className="icerik">
          <aside className="sol-kolon">
            <CanliSahne durum={durum} figurler={figurler} senaryo={senaryo} calistir={calistir} onizleme={onizleme} sonSifirlamaZamani={sonSifirlama?.zaman} />
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
            {sekme === "figurler" && <FigurPaneli aktifler={figurler} calistir={calistir} oda={durum.oda} />}
            {sekme === "senaryo" && (
              <>
                <SenaryoPaneli senaryoDurumu={senaryo} simDurumu={durum} calistir={calistir} />
                <OnAyarPaneli calistir={calistir} />
              </>
            )}
            {sekme === "sistem" && (
              <>
                <OynaticiAyarlari baglanti={baglanti} />
                <SesDuzeniAyari />
                <DuvarGeometrisiAyari />
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
