/**
 * Tatbikat günlüğü (AAR — tatbikat sonrası değerlendirme), 8 Kasım C-16: köprünün olay akışı (durum farkları, efektler,
 * figürler, senaryo adımları, sıfırlama, eğitmen notları) tatbikat süresine göre listelenir; eğitmen tek tuşla (M) not
 * düşer; tatbikat elle başlatılıp bitirilebilir (senaryo baştan oynatılınca kendiliğinden açılır); CSV indirilir.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { useArayuz } from "../arayuz";
import { OLAY_TURU_ETIKETLERI, type Olay, type Tatbikat } from "../tipler";
import { Bolum, Ikon, Rozet, sureBicimi } from "./ortak";

type Calistir = <T>(islem: () => Promise<T>) => Promise<T | undefined>;

/** Klavye kısayolu M: not alanına odaklan (Uygulama.tsx gönderir). */
export const AAR_NOT_OLAYI = "duvar:aar-not";

const TUR_ROZETI: Record<Olay["tur"], "iyi" | "kotu" | "uyari" | "notr" | "amber"> = {
  durum: "notr",
  efekt: "kotu",
  figur: "iyi",
  senaryo: "amber",
  sahne: "uyari",
  not: "amber",
  oynatici: "kotu",
  tatbikat: "amber",
};

export function AarPaneli({ olaylar, tatbikat, calistir }: { olaylar: Olay[]; tatbikat: Tatbikat | null; calistir: Calistir }) {
  const { bildir } = useArayuz();
  const [not, setNot] = useState("");
  const [simdi, setSimdi] = useState(Date.now());
  const notAlani = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t = window.setInterval(() => setSimdi(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => {
    const odaklan = () => notAlani.current?.focus();
    window.addEventListener(AAR_NOT_OLAYI, odaklan);
    return () => window.removeEventListener(AAR_NOT_OLAYI, odaklan);
  }, []);

  // Liste: aktif tatbikat varsa onun olayları, yoksa son tatbikatınki (varsa) ya da son 40 olay
  const sonTatbikatId = useMemo(() => tatbikat?.id ?? [...olaylar].reverse().find((o) => o.tatbikat)?.tatbikat ?? null, [olaylar, tatbikat]);
  const liste = useMemo(() => {
    const kaynak = sonTatbikatId ? olaylar.filter((o) => o.tatbikat === sonTatbikatId) : olaylar;
    return kaynak.slice(-60).reverse();
  }, [olaylar, sonTatbikatId]);
  const baslangic = useMemo(() => {
    if (tatbikat) return tatbikat.baslangic;
    if (!sonTatbikatId) return null;
    const ilk = olaylar.find((o) => o.tatbikat === sonTatbikatId);
    return ilk ? ilk.zaman : null;
  }, [olaylar, sonTatbikatId, tatbikat]);
  const sureMetni = (zaman: number) => (baslangic !== null ? sureBicimi(Math.max(0, zaman - baslangic)) : new Date(zaman).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));

  const notGonder = () => {
    const metin = not.trim();
    if (!metin) return;
    void calistir(() => api.olayNot(metin)).then((r) => {
      if (r) {
        setNot("");
        bildir({ tur: "basari", baslik: "Not kaydedildi", metin: `${sureMetni(r.zaman)} · ${metin.slice(0, 60)}` });
      }
    });
  };
  const csvAdresi = sonTatbikatId ? `/api/olaylar/csv?tatbikat=${encodeURIComponent(sonTatbikatId)}` : `/api/olaylar/csv?gun=${new Date().toISOString().slice(0, 10)}`;

  return (
    <Bolum
      baslik="Tatbikat günlüğü (AAR)"
      altBaslik="Her komut ve not zaman damgasıyla kaydedilir; tatbikat sonrası değerlendirme için CSV indir"
      ikon={<Ikon.senaryo />}
      sag={
        tatbikat ? (
          <Rozet tur="iyi" title={tatbikat.ad}>
            {tatbikat.ad} · {sureBicimi(simdi - tatbikat.baslangic)}
          </Rozet>
        ) : (
          <Rozet tur="notr">serbest çalışma</Rozet>
        )
      }
    >
      <div className="satir aar-araclar">
        {tatbikat ? (
          <button type="button" className="kucuk tehlike" onClick={() => void calistir(() => api.tatbikatBitir()).then((r) => r && bildir({ tur: "bilgi", baslik: "Tatbikat bitti", metin: tatbikat.ad }))}>
            Tatbikatı bitir
          </button>
        ) : (
          <button type="button" className="kucuk birincil" onClick={() => void calistir(() => api.tatbikatBaslat()).then((r) => r && bildir({ tur: "basari", baslik: "Tatbikat başladı", metin: r.ad }))}>
            Tatbikat başlat
          </button>
        )}
        <a className="dugme kucuk ikincil" href={csvAdresi} download>
          CSV indir
        </a>
        <span className="aciklama">Senaryo baştan oynatılınca tatbikat kendiliğinden açılır, bitince kapanır.</span>
      </div>
      <form
        className="satir aar-not"
        onSubmit={(e) => {
          e.preventDefault();
          notGonder();
        }}
      >
        <input ref={notAlani} type="text" value={not} maxLength={500} placeholder="Gözlem notu (M tuşu buraya odaklar)… ör. Turnike 1:05'te uygulandı" onChange={(e) => setNot(e.target.value)} />
        <button type="submit" className="kucuk birincil" disabled={!not.trim()}>
          Not ekle
        </button>
      </form>
      {liste.length === 0 ? (
        <p className="aciklama">Henüz olay yok.</p>
      ) : (
        <ol className="aar-liste">
          {liste.map((o, i) => (
            <li key={`${o.zaman}-${i}`} className={`aar-${o.tur}`}>
              <span className="mono aar-zaman">{sureMetni(o.zaman)}</span>
              <Rozet tur={TUR_ROZETI[o.tur]}>{OLAY_TURU_ETIKETLERI[o.tur]}</Rozet>
              <span className="aar-ozet">{o.ozet}</span>
            </li>
          ))}
        </ol>
      )}
    </Bolum>
  );
}
