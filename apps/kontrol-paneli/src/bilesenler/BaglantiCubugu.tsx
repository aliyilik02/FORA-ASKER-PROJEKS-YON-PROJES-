import { api } from "../api";
import type { BaglantiDurumu, Oda } from "../tipler";

export function BaglantiCubugu({
  baglanti,
  soketAcik,
  oda,
  hata,
  onOda,
  calistir,
}: {
  baglanti: BaglantiDurumu | null;
  soketAcik: boolean;
  oda: Oda;
  hata: string | null;
  onOda: (oda: Oda) => void;
  calistir: <T>(islem: () => Promise<T>) => Promise<T | undefined>;
}) {
  const ueBagli = baglanti?.unreal.bagli ?? false;
  const ueMod = baglanti?.unreal.mod;
  return (
    <header className="ust-cubuk">
      <div className="marka">
        <span className="marka-ikon">▦</span>
        <div>
          <h1>Duvar Simülasyonu</h1>
          <p>Eğirdir Dağ Komando Okulu – Eğitmen Kontrol Paneli</p>
        </div>
      </div>

      <nav className="oda-sekmeleri" aria-label="Oda seçimi">
        <button type="button" className={oda === "oda1" ? "secili" : ""} onClick={() => onOda("oda1")}>
          Oda 1 · Ateş Altında Yaralıya Müdahale
        </button>
        <button type="button" className={oda === "oda2" ? "secili" : ""} onClick={() => onOda("oda2")}>
          Oda 2 · Taktik Güvenli Alan / Tahliye
        </button>
      </nav>

      <div className="durum-rozetleri">
        <span className={`rozet ${soketAcik ? "iyi" : "kotu"}`} title="Köprü sunucusu WebSocket bağlantısı">
          Köprü {soketAcik ? "bağlı" : "bağlı değil"}
        </span>
        <span
          className={`rozet ${ueMod === "simulasyon" ? "notr" : ueBagli ? "iyi" : "kotu"}`}
          title={baglanti ? `${baglanti.unreal.adres}${baglanti.unreal.sonHata ? ` – ${baglanti.unreal.sonHata}` : ""}` : ""}
        >
          Unreal {ueMod === "simulasyon" ? "simülasyon modu" : ueBagli ? "bağlı" : "bağlı değil"}
        </span>
        <span
          className={`rozet ${baglanti?.oynatici?.bagli ? "iyi" : "kotu"}`}
          title="Duvar Oynatıcı: görüntüyü üreten tarayıcı tabanlı oynatıcı (hibrit yol). /oynatici/ adresinde açılır."
        >
          Oynatıcı {baglanti?.oynatici?.bagli ? `bağlı (${baglanti.oynatici.sayi})` : "bağlı değil"}
        </span>
        <span className={`rozet ${baglanti?.artnet.aktif ? "iyi" : "notr"}`} title={baglanti ? `${baglanti.artnet.hedef} · evren ${baglanti.artnet.evren}` : ""}>
          Art-Net {baglanti?.artnet.aktif ? "aktif" : "kapalı"}
        </span>
        <button type="button" className="ikincil kucuk" onClick={() => void calistir(() => api.yenidenSenkron())}>
          Yeniden senkronla
        </button>
      </div>
      {hata && <div className="hata-seridi">Hata: {hata}</div>}
    </header>
  );
}
