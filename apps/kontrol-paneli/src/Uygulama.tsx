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
import { AarPaneli, AAR_NOT_OLAYI } from "./bilesenler/AarPaneli";
import { SesDuzeniAyari } from "./bilesenler/SesDuzeniAyari";
import { UnrealKomutlariPaneli } from "./bilesenler/UnrealKomutlariPaneli";
import { UstCubuk } from "./bilesenler/UstCubuk";
import { SEKME_KISAYOLLARI, YanMenu } from "./bilesenler/YanMenu";
import { EFEKT_ETIKETLERI, SIFIRLAMA_KAYNAK_ETIKETLERI, SOZLESME_SURUMU, sifirlamaOzetiMetni, type EfektTuru, type SifirlamaKaynagi } from "./tipler";
import { vurulabilirAskerler, yoneEnYakin } from "./figurYardimcilari";
import { useKopru } from "./useKopru";
import { EgitmenEkrani } from "./bilesenler/egitmen/EgitmenEkrani";
import { Cekmece, SenaryoSecimi, YerVeHava } from "./bilesenler/egitmen/Cekmeceler";
import { SifirlaDugmesi } from "./bilesenler/SifirlaDugmesi";
import { BOLGE_ETIKETLERI, MEVSIM_ETIKETLERI, YAGIS_ETIKETLERI } from "./tipler";
import { zamanEtiketi } from "./bilesenler/ortak";

/** Görünüm: "egitmen" tek sayfalık sade ekran (varsayılan); "teknisyen" kurulum, ince ayar, senaryo düzenleme, günlük. */
type Gorunum = "egitmen" | "teknisyen";
const GORUNUM_ANAHTARI = "duvar.panel.gorunum";

/** Sıfırla düğmesinin kurulu (onay bekleyen) kalma süresi: ikinci dokunuş / Esc bu sürede gelmezse çözülür. */
const SIFIRLAMA_ONAY_MS = 3000;
/** İlk dokunuştan sonra ikincisinin sayılması için en kısa süre (çift dokunuş koruması). */
const SIFIRLAMA_EN_KISA_MS = 400;

export function Uygulama() {
  return (
    <ArayuzSaglayici>
      <Govde />
    </ArayuzSaglayici>
  );
}

function Govde() {
  const kopru = useKopru();
  const { durum, senaryo, senaryolar, olaylar, tatbikat, makro, tekrar, baglanti, gunluk, unrealIstekler, ornek, figurler, onizleme, sonSifirlama, soketAcik, hata, sifirlamaUygula } = kopru;
  const { sekme, setSekme, seciliYon, setSeciliYon, bildir, kilit, setKilit } = useArayuz();
  const [gorunum, setGorunumHam] = useState<Gorunum>(() => {
    try {
      return localStorage.getItem(GORUNUM_ANAHTARI) === "teknisyen" ? "teknisyen" : "egitmen";
    } catch {
      return "egitmen";
    }
  });
  const setGorunum = useCallback((g: Gorunum) => {
    setGorunumHam(g);
    try {
      localStorage.setItem(GORUNUM_ANAHTARI, g);
    } catch {
      /* özel pencere */
    }
  }, []);
  const [cekmece, setCekmece] = useState<"ortam" | "senaryo" | null>(null);

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

  // Köprü günlüğüne düşen HATA satırları (UE, DMX, oynatıcı, senaryo adımı) eğitmene bildirim olarak da gelsin: gözü
  // duvarda olan eğitmen Sistem rozetini görmez (§3-9). Seyrekleştirme: 3 sn'de en çok bir bildirim, bağlantı anındaki
  // geçmiş yığını atlanır (yalnız bu oturumda yeni gelenler).
  const sonHataBildirimi = useRef({ zaman: 0, ilkYukleme: true });
  useEffect(() => {
    const son = gunluk[0];
    if (!son) return;
    if (sonHataBildirimi.current.ilkYukleme) {
      sonHataBildirimi.current = { zaman: Date.now(), ilkYukleme: false };
      return;
    }
    if (son.seviye !== "hata") return;
    if (Date.now() - sonHataBildirimi.current.zaman < 3000) return;
    sonHataBildirimi.current.zaman = Date.now();
    bildir({ tur: "hata", baslik: "Köprü hatası", metin: son.mesaj.slice(0, 160) });
  }, [gunluk, bildir]);

  /**
   * Sahneyi sıfırla, iki aşama (düğme ve klavye aynı durumu paylaşır): ilk dokunuş / Esc kurar, SIFIRLAMA_ONAY_MS
   * içinde ikincisi sıfırlar, süre dolunca çözülür. Ref mantığın kaynağı (iki hızlı Esc arasında yeniden çizim olmasa
   * da doğru), durum yalnız görünüm için.
   */
  const [sifirlamaKurulu, setSifirlamaKurulu] = useState(false);
  const kuruluRef = useRef(false);
  const kurulmaZamani = useRef(0);
  const sifirlaDokun = useCallback(
    (kaynak: SifirlamaKaynagi) => {
      if (!kuruluRef.current) {
        kuruluRef.current = true;
        kurulmaZamani.current = Date.now();
        setSifirlamaKurulu(true);
        return;
      }
      // Tablette çift dokunuş / dokunma sıçraması ya da basılı kalan Esc tek hamlede sıfırlamasın: ikinci dokunuş en az 400 ms sonra
      if (Date.now() - kurulmaZamani.current < SIFIRLAMA_EN_KISA_MS) return;
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
      // Senaryo editörü açıkken canlı kısayollar (1–6, Boşluk, oklar) çalışmaz: "+ Adım ekle"den sonra odak düğmede kalır,
      // "5" tuşu duvarda gerçek efekt tetiklerdi (§3-12). Esc ve sekme tuşları kalır.
      const editorAcik = document.querySelector(".editor") !== null;
      // Gösterim kilidi: yalnız Boşluk (oynat/duraklat/devam) ve Esc (sıfırlama) çalışır
      if (kilit && e.key !== " " && e.key !== "Escape") return;
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
        // F1–F5 Teknisyen sayfasının bölümleri; eğitmen ekranında sayfayı da açar
        e.preventDefault();
        setGorunum("teknisyen");
        setSekme(s);
        return;
      }
      if (editorAcik) return;
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
      // M: tatbikat notu (AAR) — Senaryo sekmesine geç, not alanına odaklan
      if (e.key === "m" || e.key === "M") {
        if (e.repeat) return;
        e.preventDefault();
        setGorunum("teknisyen");
        setSekme("senaryo");
        window.setTimeout(() => window.dispatchEvent(new CustomEvent(AAR_NOT_OLAYI)), 50);
        return;
      }
      if (e.key === "ArrowLeft") setSeciliYon(seciliYon - (e.shiftKey ? 15 : 5));
      if (e.key === "ArrowRight") setSeciliYon(seciliYon + (e.shiftKey ? 15 : 5));
      if (e.key === " " && senaryo?.senaryoId) {
        e.preventDefault();
        if (e.repeat) return;
        void calistir(() => (senaryo.durum === "oynuyor" ? api.senaryoDuraklat() : senaryo.durum === "bekliyor" ? api.senaryoDevam() : api.senaryoOynat()));
      }
    };
    window.addEventListener("keydown", dinle);
    return () => window.removeEventListener("keydown", dinle);
  }, [durum, senaryo, seciliYon, setSeciliYon, setSekme, setGorunum, calistir, bildir, figurler, sifirlaDokun, kilit]);

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
      {!soketAcik && (
        <div className="baglanti-seridi" role="alert">
          <strong>BAĞLANTI YOK</strong> — köprüyle bağlantı koptu; görünen durum güncel olmayabilir. Yeniden bağlanılıyor…
        </div>
      )}
      {soketAcik && baglanti && (baglanti.sozlesme ?? 0) !== SOZLESME_SURUMU && (
        <div className="baglanti-seridi" role="alert">
          <strong>KÖPRÜ ESKİ SÜRÜM</strong> — panel yeniden derlendi ama köprü eski kodla çalışıyor (köprü {baglanti.sozlesme ?? "sürümsüz"}, panel {SOZLESME_SURUMU}); yeni
          düğmeler "İşlem başarısız" verir. Köprüyü yeniden başlat: <span className="mono">demo.bat yeniden</span> ya da köprü penceresinde Ctrl+C → <span className="mono">npm start</span>.
        </div>
      )}
      {gorunum === "egitmen" ? (
        <>
          <header className="e-ust">
            <nav className="e-oda" aria-label="Oda">
              <button type="button" className={durum.oda === "oda1" ? "secili" : ""} onClick={() => void calistir(() => api.odaSec("oda1"))}>
                <strong>Oda 1</strong>
                <small>Yaralıya müdahale</small>
              </button>
              <button type="button" className={durum.oda === "oda2" ? "secili" : ""} onClick={() => void calistir(() => api.odaSec("oda2"))}>
                <strong>Oda 2</strong>
                <small>Güvenli alan, tahliye</small>
              </button>
            </nav>
            <button type="button" className="e-ortam" onClick={() => setCekmece("ortam")}>
              <small>Yer ve hava</small>
              <strong>
                {BOLGE_ETIKETLERI[durum.bolge]} · {MEVSIM_ETIKETLERI[durum.ortam.mevsim]} · {zamanEtiketi(durum.ortam.saat)}
                {durum.ortam.yagis !== "yok" ? ` · ${YAGIS_ETIKETLERI[durum.ortam.yagis]}` : durum.ortam.sis > 0.3 ? " · Sisli" : ""}
              </strong>
            </button>
            <button type="button" className="e-senaryo" data-kilit-serbest onClick={() => setCekmece("senaryo")}>
              <small>Hazır akış</small>
              <strong>Senaryolar</strong>
            </button>
            <span className={`e-baglanti ${!soketAcik ? "kotu" : baglanti?.oynatici?.bagli ? "iyi" : "bekliyor"}`}>
              <i />
              {!soketAcik ? "Bağlantı yok" : baglanti?.oynatici?.bagli ? "Duvar bağlı" : "Duvar açık değil"}
            </span>
            <button type="button" className={`e-kilit ${kilit ? "secili" : ""}`} data-kilit-serbest aria-pressed={kilit} title="Kilitliyken yalnız senaryo düğmeleri ve Temizle çalışır (yanlış dokunma koruması)" onClick={() => setKilit(!kilit)}>
              {kilit ? "Kilidi aç" : "Kilitle"}
            </button>
            <SifirlaDugmesi kurulu={sifirlamaKurulu} sayi={sifirlanacak} onDokun={() => sifirlaDokun("panel")} etiket="Sahneyi temizle" />
            <button type="button" className="e-teknisyen" title="Teknisyen sayfası: kurulum, ince ayar, senaryo düzenleme, günlük" onClick={() => setGorunum("teknisyen")}>
              Teknisyen
            </button>
          </header>
          <div className={`e-govde ${kilit ? "kilitli" : ""}`}>
            <EgitmenEkrani durum={durum} figurler={figurler} senaryo={senaryo} makro={makro ?? null} calistir={calistir} onizleme={onizleme} sonSifirlamaZamani={sonSifirlama?.zaman} />
          </div>
          {cekmece === "ortam" && (
            <Cekmece baslik="Yer ve hava" altBaslik="Dokun, duvar değişsin" onKapat={() => setCekmece(null)}>
              <YerVeHava durum={durum} calistir={calistir} />
            </Cekmece>
          )}
          {cekmece === "senaryo" && (
            <Cekmece baslik="Senaryolar" altBaslik="Hazır akışı seç, Oynat de" onKapat={() => setCekmece(null)}>
              <SenaryoSecimi
                senaryolar={senaryolar}
                senaryoDurumu={senaryo}
                calistir={calistir}
                onKapat={() => setCekmece(null)}
                onDuzenle={() => {
                  setCekmece(null);
                  setSekme("senaryo");
                  setGorunum("teknisyen");
                }}
              />
            </Cekmece>
          )}
        </>
      ) : (
        <>
      <div className="teknisyen-seridi">
        <button type="button" className="birincil" onClick={() => setGorunum("egitmen")}>
          ← Eğitmen ekranına dön
        </button>
        <span>Teknisyen sayfası: kurulum, ince ayar, senaryo düzenleme ve günlük. Günlük kullanımda eğitmen ekranı yeterlidir.</span>
      </div>
      <UstCubuk
        durum={durum}
        baglanti={baglanti}
        soketAcik={soketAcik}
        onOda={(oda) => void calistir(() => api.odaSec(oda))}
        calistir={calistir}
        sifirla={{ kurulu: sifirlamaKurulu, sayi: sifirlanacak, onDokun: () => sifirlaDokun("panel") }}
      />
      <div className={`govde ${kilit ? "kilitli" : ""}`}>
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
            {sekme === "efektler" && (durum.oda === "oda1" ? <EfektPaneli durum={durum} calistir={calistir} makro={makro} /> : <Oda2Paneli durum={durum} calistir={calistir} makro={makro} />)}
            {sekme === "figurler" && <FigurPaneli aktifler={figurler} calistir={calistir} oda={durum.oda} />}
            {sekme === "senaryo" && (
              <>
                <SenaryoPaneli senaryoDurumu={senaryo} senaryolar={senaryolar} simDurumu={durum} calistir={calistir} />
                <AarPaneli olaylar={olaylar} tatbikat={tatbikat} tekrar={tekrar} calistir={calistir} />
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
        </>
      )}
      <Bildirimler />
    </div>
  );
}
