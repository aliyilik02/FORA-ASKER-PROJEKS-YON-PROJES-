/**
 * Canlı sahne kartı: her bölümde görünür kalır. Pusula (yön seçimi + sahnedeki her şey), durum
 * özeti ve bir dokunuşluk hızlı efektler. Eğitmenin gözü eğitim alanındayken tek bakışta
 * "duvarda şu an ne var" sorusunu yanıtlar.
 */
import { useEffect, useState } from "react";
import { api } from "../api";
import { useArayuz } from "../arayuz";
import { BOLGE_ETIKETLERI, EFEKT_ETIKETLERI, HELIKOPTER_ETIKETLERI, MEVSIM_ETIKETLERI, YAGIS_ETIKETLERI, type EfektTuru, type FigurKomutu, type SenaryoDurumu, type SimulasyonDurumu } from "../tipler";
import { Ikon, OnayliDugme, Rozet, saatBicimi, sureBicimi, yonMetni } from "./ortak";
import { Pusula } from "./Pusula";

type Calistir = <T>(islem: () => Promise<T>) => Promise<T | undefined>;

const HIZLI_ODA1: Array<{ tur: EfektTuru; siddet: number; sinif?: string; kisayol: string }> = [
  { tur: "patlama", siddet: 1, sinif: "izli", kisayol: "1" },
  { tur: "toz_duman", siddet: 0.8, kisayol: "2" },
  { tur: "gurultu", siddet: 0.8, kisayol: "3" },
  { tur: "bagirma", siddet: 1, kisayol: "4" },
  { tur: "cagirma", siddet: 1, kisayol: "5" },
];
const HIZLI_ODA2: Array<{ tur: EfektTuru; siddet: number; sinif?: string; kisayol: string }> = [
  { tur: "uzak_patlama", siddet: 0.8, sinif: "izli", kisayol: "1" },
  { tur: "uzak_mermi_sesi", siddet: 0.7, kisayol: "2" },
  { tur: "bagirma", siddet: 1, kisayol: "3" },
  { tur: "cagirma", siddet: 1, kisayol: "4" },
];

export function CanliSahne({
  durum,
  figurler,
  senaryo,
  calistir,
  onizleme = null,
}: {
  durum: SimulasyonDurumu;
  figurler: Array<FigurKomutu & { id: string }>;
  senaryo: SenaryoDurumu | null;
  calistir: Calistir;
  /** Oynatıcıdan gelen küçük duvar görüntüsü (yoksa kart pusulayla yetinir). */
  onizleme?: { veri: string; zaman: number } | null;
}) {
  const { seciliYon, setSeciliYon, bildir } = useArayuz();
  const [simdi, setSimdi] = useState(Date.now());
  const [sonTetik, setSonTetik] = useState<string | null>(null);
  useEffect(() => {
    const t = window.setInterval(() => setSimdi(Date.now()), 250);
    return () => window.clearInterval(t);
  }, []);

  const hizli = durum.oda === "oda1" ? HIZLI_ODA1 : HIZLI_ODA2;
  // Oda 1'in en önemli tek dokunuşu: pusulaya en yakın ayakta/diz çökmüş asker vurulur (6 tuşu)
  const vurulabilir = figurler.filter((f) => /^asker_(bekleyen|taktik|diz_cokmus|kamuflaj)/.test(f.klip ?? "") && f.poz !== "yarali");
  const askerVuruldu = () => {
    if (!vurulabilir.length) return;
    const hedefAz = ((seciliYon + 180) % 360) - 180;
    const fark = (a: number) => Math.abs((((a - hedefAz) % 360) + 540) % 360 - 180);
    const f = [...vurulabilir].sort((a, b) => fark(a.azimut ?? 0) - fark(b.azimut ?? 0))[0];
    setSonTetik("vuruldu");
    window.setTimeout(() => setSonTetik(null), 450);
    void calistir(() => api.figur({ islem: "poz", id: f.id, poz: "yarali" })).then((r) => r && bildir({ tur: "hata", baslik: "Asker vuruldu", metin: `${yonMetni(((f.azimut ?? 0) + 360) % 360)} tarafı · Figürler'den sıhhiyeci gönder` }));
  };
  const tetikle = (tur: EfektTuru, siddet: number) => {
    setSonTetik(tur);
    window.setTimeout(() => setSonTetik(null), 450);
    void calistir(() => api.efekt({ tur, siddet, yon: seciliYon, mesafe: durum.oda2.uzakSesMesafesi })).then((r) => {
      if (r) bildir({ tur: "basari", baslik: `${EFEKT_ETIKETLERI[tur]} tetiklendi`, metin: yonMetni(seciliYon) });
    });
  };

  const o = durum.ortam;
  const havaMetni = [o.yagis !== "yok" ? YAGIS_ETIKETLERI[o.yagis] : null, o.sis > 0.15 ? `sis %${Math.round(o.sis * 100)}` : null, o.bulut > 0.5 ? `bulut %${Math.round(o.bulut * 100)}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="canli-sahne">
      <header className="canli-baslik">
        <div>
          <span className="canli-etiket">Canlı sahne</span>
          <h2>{BOLGE_ETIKETLERI[durum.bolge]}</h2>
        </div>
        <div className="canli-ozet">
          <Rozet tur="amber">
            {MEVSIM_ETIKETLERI[o.mevsim]} · {saatBicimi(o.saat)}
          </Rozet>
          {havaMetni && <Rozet>{havaMetni}</Rozet>}
          {durum.izliMermi.aktif && <Rozet tur="kotu">izli mermi {durum.izliMermi.siklik}/sn</Rozet>}
          {durum.catisma?.aktif && <Rozet tur="kotu">çatışma %{Math.round(durum.catisma.siddet * 100)} · {yonMetni(durum.catisma.yon)}</Rozet>}
          {durum.oda === "oda2" && durum.oda2.helikopter !== "yok" && (
            <Rozet tur="uyari">
              <Ikon.helikopter /> {HELIKOPTER_ETIKETLERI[durum.oda2.helikopter]}
            </Rozet>
          )}
          {figurler.length > 0 && <Rozet tur="iyi">{figurler.length} figür</Rozet>}
          {figurler.some((f) => f.poz === "yarali") && <Rozet tur="kotu">{figurler.filter((f) => f.poz === "yarali").length} yaralı</Rozet>}
          {senaryo?.senaryoId && senaryo.durum !== "duruyor" && (
            <Rozet tur={senaryo.durum === "oynuyor" ? "iyi" : "uyari"}>
              senaryo {sureBicimi(senaryo.konumMs)} / {sureBicimi(senaryo.toplamMs)}
            </Rozet>
          )}
          <OnayliDugme sinif="kucuk ikincil" onay="Sahne temizlensin mi?" onClick={() => void calistir(() => api.sahneSifirla()).then((r) => r && bildir({ tur: "basari", baslik: "Sahne sıfırlandı", metin: "Figürler, çatışma, izli mermi, helikopter, krater ve duman temizlendi" }))}>
            Sahneyi sıfırla
          </OnayliDugme>
        </div>
      </header>

      {onizleme && simdi - onizleme.zaman < 15000 && (
        <figure className="onizleme" title="Duvardaki görüntü (oynatıcıdan ~2 sn'de bir)">
          <img src={onizleme.veri} alt="Duvar önizlemesi" />
          <figcaption>duvar · {Math.max(0, Math.round((simdi - onizleme.zaman) / 1000))} sn önce</figcaption>
        </figure>
      )}
      <Pusula
        yon={seciliYon}
        onYon={setSeciliYon}
        ortam={o}
        figurler={figurler}
        efektler={durum.sonEfektler}
        helikopter={durum.oda === "oda2" ? durum.oda2.helikopter : "yok"}
        helikopterYonu={durum.oda2.helikopterYonu ?? 12}
        dusmanYonu={durum.catisma?.aktif ? durum.catisma.yon : null}
        simdi={simdi}
      />

      <div className="hizli-yonler">
        {[
          [-90, "Sol"],
          [-45, "Sol-ön"],
          [0, "Karşı"],
          [45, "Sağ-ön"],
          [90, "Sağ"],
        ].map(([a, ad]) => (
          <button key={ad} type="button" className={`kucuk ${((seciliYon + 180) % 360) - 180 === a ? "secili" : "ikincil"}`} onClick={() => setSeciliYon(Number(a))}>
            {ad}
          </button>
        ))}
      </div>

      <div className="hizli-efektler">
        {hizli.map((h) => (
          <button key={h.tur} type="button" className={`efekt ${h.sinif ?? ""} ${sonTetik === h.tur ? "tetiklendi" : ""}`} onClick={() => tetikle(h.tur, h.siddet)}>
            <span className="efekt-ad">{EFEKT_ETIKETLERI[h.tur]}</span>
            <kbd>{h.kisayol}</kbd>
          </button>
        ))}
        {durum.oda === "oda1" && (
          <button
            type="button"
            className={`efekt vuruldu ${sonTetik === "vuruldu" ? "tetiklendi" : ""}`}
            disabled={!vurulabilir.length}
            onClick={askerVuruldu}
            title={vurulabilir.length ? "Pusulaya en yakın asker vurulur, yere düşer, yardım çağırır" : "Önce Figürler'den asker çağır"}
          >
            <span className="efekt-ad">Asker vuruldu</span>
            <kbd>6</kbd>
          </button>
        )}
      </div>
      <p className="ipucu">Yönü pusuladan seç, efekti tek dokunuşla tetikle. Klavye: 1–5 efekt, 6 asker vuruldu, ←/→ yön, Boşluk senaryo oynat/duraklat.</p>
    </section>
  );
}
