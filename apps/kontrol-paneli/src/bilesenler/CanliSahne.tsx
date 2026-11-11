/**
 * Canlı sahne kartı: her bölümde görünür kalır. Yön seçici (beş bölge + ince ayar, sahnedekiler metinle), durum
 * özeti ve bir dokunuşluk hızlı efektler. Eğitmenin gözü eğitim alanındayken tek bakışta
 * "duvarda şu an ne var" sorusunu yanıtlar.
 */
import { useEffect, useState } from "react";
import { api } from "../api";
import { useArayuz } from "../arayuz";
import { BOLGE_ETIKETLERI, EFEKT_ETIKETLERI, HELIKOPTER_ETIKETLERI, MEVSIM_ETIKETLERI, YAGIS_ETIKETLERI, type EfektTuru, type FigurKomutu, type SenaryoDurumu, type SimulasyonDurumu, SAFHA_ETIKETLERI, type Safha } from "../tipler";
import { vurulabilirAskerler, yoneEnYakin } from "../figurYardimcilari";
import { Ikon, Rozet, zamanEtiketi, sureBicimi, yonMetni } from "./ortak";
import { YonSecici } from "./YonSecici";

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
  sonSifirlamaZamani,
}: {
  durum: SimulasyonDurumu;
  figurler: Array<FigurKomutu & { id: string }>;
  senaryo: SenaryoDurumu | null;
  calistir: Calistir;
  /** Oynatıcıdan gelen küçük duvar görüntüsü (yoksa kart yön seçiciyle yetinir). */
  onizleme?: { veri: string; zaman: number; bilgi?: string } | null;
  /** Son sahne sıfırlamasının köprü saati: önizleme bundan eskiyse soluk ve "temizleniyor…". */
  sonSifirlamaZamani?: number;
}) {
  const { seciliYon, setSeciliYon, bildir } = useArayuz();
  const [simdi, setSimdi] = useState(Date.now());
  const [sonTetik, setSonTetik] = useState<string | null>(null);
  // Saat yalnız önizlemenin "sn önce" metni için (1 sn). Eski SVG pusula 250 ms'de bir yeniden çizilip oynatıcının
  // kare hızını düşürüyordu; 4 Kasım'da yerini D2 yön seçici (YonSecici) aldı.
  useEffect(() => {
    const t = window.setInterval(() => setSimdi(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const hizli = durum.oda === "oda1" ? HIZLI_ODA1 : HIZLI_ODA2;
  // Oda 1'in en önemli tek dokunuşu: seçili yöne en yakın ayakta/diz çökmüş asker vurulur (6 tuşu)
  const vurulabilir = vurulabilirAskerler(figurler);
  const askerVuruldu = () => {
    const f = yoneEnYakin(vurulabilir, seciliYon);
    if (!f) return;
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

  // Sıfırlamadan önce yakalanmış önizleme: oynatıcı temiz kareyi yollayana dek soluk
  const temizleniyor = Boolean(onizleme && sonSifirlamaZamani !== undefined && onizleme.zaman < sonSifirlamaZamani);
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
            {MEVSIM_ETIKETLERI[o.mevsim]} · {zamanEtiketi(o.saat)}
          </Rozet>
          {havaMetni && <Rozet>{havaMetni}</Rozet>}
          {durum.izliMermi.aktif && <Rozet tur="kotu">izli mermi {durum.izliMermi.siklik}/sn</Rozet>}
          {durum.catisma?.aktif && <Rozet tur="kotu">çatışma %{Math.round(durum.catisma.siddet * 100)} · {yonMetni(durum.catisma.yon)}</Rozet>}
          {durum.oda === "oda2" && durum.oda2.helikopter !== "yok" && (
            <Rozet tur="uyari">
              <Ikon.helikopter /> {HELIKOPTER_ETIKETLERI[durum.oda2.helikopter]}
            </Rozet>
          )}
          {durum.oda === "oda1" && <Rozet tur={durum.safha === "ates_altinda" ? "kotu" : "amber"}>{SAFHA_ETIKETLERI[durum.safha ?? "taktik_saha"]}</Rozet>}
          {figurler.length > 0 && <Rozet tur="iyi">{figurler.length} figür</Rozet>}
          {figurler.some((f) => f.poz === "yarali") && <Rozet tur="kotu">{figurler.filter((f) => f.poz === "yarali").length} yaralı</Rozet>}
          {senaryo?.senaryoId && senaryo.durum !== "duruyor" && (
            <Rozet tur={senaryo.durum === "oynuyor" ? "iyi" : "uyari"}>
              senaryo {sureBicimi(senaryo.konumMs)} / {sureBicimi(senaryo.toplamMs)}
            </Rozet>
          )}
        </div>
      </header>

      {onizleme && simdi - onizleme.zaman < 15000 && (
        <figure className={`onizleme ${temizleniyor ? "temizleniyor" : ""}`} title="Duvardaki görüntü (oynatıcıdan en çok 5 sn'de bir; sıfırlamadan hemen sonra yenilenir)">
          <img src={onizleme.veri} alt="Duvar önizlemesi" />
          <figcaption>
            {temizleniyor ? "temizleniyor…" : `${onizleme.bilgi ? `${onizleme.bilgi} · ` : "duvar · "}${Math.max(0, Math.round((simdi - onizleme.zaman) / 1000))} sn önce`}
          </figcaption>
        </figure>
      )}
      <YonSecici
        yon={seciliYon}
        onYon={setSeciliYon}
        figurler={figurler}
        helikopter={durum.oda === "oda2" ? durum.oda2.helikopter : "yok"}
        helikopterYonu={durum.oda2.helikopterYonu ?? 12}
        dusmanYonu={durum.catisma?.aktif ? durum.catisma.yon : null}
      />

      {durum.oda === "oda1" && (
        <div className="safha-secici" title="TCCC safhası: ateş altında sıhhiyeci yaralıya gitmez, siperde bekler; taktik saha bakımına geçince yürüyüp başına gider">
          <span className="etiket">Safha</span>
          <div className="secenek-grubu">
            {(Object.keys(SAFHA_ETIKETLERI) as Safha[]).map((s) => (
              <button key={s} type="button" className={(durum.safha ?? "taktik_saha") === s ? "secili" : ""} onClick={() => void calistir(() => api.safha(s))}>
                {SAFHA_ETIKETLERI[s]}
              </button>
            ))}
          </div>
        </div>
      )}

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
            title={vurulabilir.length ? "Seçili yöne en yakın asker vurulur, yere düşer, yardım çağırır" : "Önce Figürler'den asker çağır"}
          >
            <span className="efekt-ad">Asker vuruldu</span>
            <kbd>6</kbd>
          </button>
        )}
      </div>
      <p className="ipucu">
        Yönü seç, efekti tek dokunuşla tetikle. Klavye: 1–5 efekt, 6 asker vuruldu, ←/→ yön 5°, Boşluk senaryo oynat/duraklat. Sahneyi temizlemek: üst çubukta{" "}
        <strong>Sıfırla</strong> (iki dokunuş) ya da Esc, Esc; ortam ve bölge kalır.
      </p>
    </section>
  );
}
