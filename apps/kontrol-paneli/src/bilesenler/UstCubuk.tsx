/**
 * Üst çubuk: marka, oda seçimi, görev saati (simülasyon saati), sahneyi sıfırla (her genişlikte görünen tek global
 * tehlikeli eylem), bağlantı lambaları, oynatıcı penceresi.
 */
import { api } from "../api";
import { useArayuz } from "../arayuz";
import { gunZamani, type BaglantiDurumu, type Oda, type SimulasyonDurumu } from "../tipler";
import { Ikon, Led, zamanEtiketi } from "./ortak";
import { SifirlaDugmesi } from "./SifirlaDugmesi";

type Calistir = <T>(islem: () => Promise<T>) => Promise<T | undefined>;

export function UstCubuk({
  durum,
  baglanti,
  soketAcik,
  onOda,
  calistir,
  sifirla,
}: {
  durum: SimulasyonDurumu;
  baglanti: BaglantiDurumu | null;
  soketAcik: boolean;
  onOda: (oda: Oda) => void;
  calistir: Calistir;
  /** Sıfırla düğmesi: kurulu (onay bekliyor), etkin öğe sayısı, dokunuş. */
  sifirla: { kurulu: boolean; sayi: number; onDokun: () => void };
}) {
  const { oynaticiKalite, oynaticiAdresi, kilit, setKilit } = useArayuz();
  const ue = baglanti?.unreal;
  const oynatici = baglanti?.oynatici;
  const saat = durum.ortam.saat;
  const gece = gunZamani(saat) === "gece";
  return (
    <header className="ust-cubuk">
      <div className="marka">
        <span className="marka-isaret" aria-hidden="true">
          <svg viewBox="0 0 32 32" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round">
            <path d="M4 10v14h24V10M4 10l5-4h14l5 4" />
            <path d="M16 6v18M9 6v18M23 6v18" opacity=".5" />
          </svg>
        </span>
        <div>
          <h1>Duvar Simülasyonu</h1>
          <p>Eğirdir Dağ Komando Okulu · Eğitmen Paneli</p>
        </div>
      </div>

      <nav className="oda-secici" aria-label="Oda">
        <button type="button" className={durum.oda === "oda1" ? "secili" : ""} onClick={() => onOda("oda1")}>
          <span className="oda-no">1</span>
          <span className="oda-ad">Ateş Altında Yaralıya Müdahale</span>
        </button>
        <button type="button" className={durum.oda === "oda2" ? "secili" : ""} onClick={() => onOda("oda2")}>
          <span className="oda-no">2</span>
          <span className="oda-ad">Taktik Güvenli Alan / Tahliye</span>
        </button>
      </nav>

      <button
        type="button"
        className={`kilit-dugmesi ${kilit ? "secili" : ""}`}
        data-kilit-serbest
        title="Gösterim kilidi: açıkken yalnız senaryo oynat/duraklat/devam/durdur ve Sıfırla çalışır (yanlış dokunma koruması)"
        aria-pressed={kilit}
        onClick={() => setKilit(!kilit)}
      >
        {kilit ? "🔒 Kilitli" : "🔓 Kilit"}
      </button>
      <div className="gorev-saati" title="Sahnede gündüz mü gece mi">
        <span className="gorev-saati-ikon">{gece ? <Ikon.ay /> : <Ikon.gunes />}</span>
        <span className="gorev-saati-deger">{zamanEtiketi(saat)}</span>
      </div>

      <div className="lambalar">
        <SifirlaDugmesi kurulu={sifirla.kurulu} sayi={sifirla.sayi} onDokun={sifirla.onDokun} />
        <Led durum={soketAcik ? "iyi" : "bekliyor"} etiket="Köprü" title={`Köprü sunucusu (WebSocket)${baglanti?.panel && baglanti.panel.sayi > 1 ? ` · ${baglanti.panel.sayi} panel bağlı` : ""}`} />
        <Led
          durum={!oynatici?.bagli ? "kotu" : oynatici.sayi > 1 ? "bekliyor" : "iyi"}
          etiket={oynatici?.bagli ? `Oynatıcı ×${oynatici.sayi}` : "Oynatıcı"}
          title={
            oynatici && oynatici.sayi > 1
              ? `${oynatici.sayi} oynatıcı sekmesi bağlı: hepsi aynı ekran kartında sahneyi çizer ve birbirini yavaşlatır. Fazla sekmeleri kapat.`
              : "Duvar Oynatıcı: görüntüyü üreten tarayıcı (3 duvar)"
          }
        />
        <Led
          durum={ue?.mod === "simulasyon" ? "pasif" : ue?.bagli ? "iyi" : "kotu"}
          etiket={ue?.mod === "simulasyon" ? "UE sim" : "Unreal"}
          title={ue ? `${ue.adres}${ue.sonHata ? ` – ${ue.sonHata}` : ""}` : ""}
        />
        <Led durum={baglanti?.artnet.aktif ? "iyi" : "pasif"} etiket="Art-Net" title={baglanti ? `${baglanti.artnet.hedef} · evren ${baglanti.artnet.evren}` : ""} />
        <button type="button" className="ikincil kucuk ikonlu" onClick={() => void calistir(() => api.yenidenSenkron())} title="Durumu oynatıcı ve Unreal'a yeniden gönder">
          <Ikon.yenile /> Senkron
        </button>
        <a className="dugme ikincil kucuk ikonlu" href={oynaticiAdresi} target="_blank" rel="noreferrer" title={`Oynatıcıyı yeni pencerede aç (kalite: ${oynaticiKalite})`}>
          <Ikon.pencere /> Oynatıcı
        </a>
      </div>
    </header>
  );
}
