/** Köprü sunucusuyla WebSocket bağlantısı; durum, senaryo ve günlük akışını tutar. */
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { heliDizisiIptal } from "./heliDizisi";
import type { BaglantiDurumu, FigurKomutu, OrnekDurumu, Senaryo, SenaryoDurumu, SifirlamaKaynagi, SifirlamaOzeti, SifirlamaYaniti, SimulasyonDurumu, SunucuMesaji, UnrealIstekKaydi } from "./tipler";

export interface GunlukSatiri {
  seviye: "bilgi" | "uyari" | "hata";
  mesaj: string;
  zaman: number;
}

/** Son sahne sıfırlaması (köprünün `sahne/sifirla` mesajı ya da bu panelin API yanıtı; aynı nesil iki kez gelebilir). */
export interface SonSifirlama {
  nesil: number;
  kaynak: SifirlamaKaynagi;
  ozet: SifirlamaOzeti;
  /** Köprü saati (ms): önizleme bundan eskiyse "temizleniyor…". */
  zaman: number;
}

/**
 * Son sıfırlama nesli (modül düzeyi): birkaç API çağrısı süren panel işlemi (ör. "Cephe kur") başında okur, adımlar
 * arasında değiştiyse durur; sıfırlamadan sonra yarım kalan işlem sahneyi yeniden doldurmaz.
 */
let bilinenSifirlamaNesli = 0;
export function sifirlamaNesli(): number {
  return bilinenSifirlamaNesli;
}

export function useKopru() {
  const [durum, setDurum] = useState<SimulasyonDurumu | null>(null);
  const [senaryo, setSenaryo] = useState<SenaryoDurumu | null>(null);
  /** Kayıtlı senaryolar: açılışta çekilir, köprünün `senaryolar` mesajıyla (bu ya da başka panel kaydedince/silince) yenilenir. */
  const [senaryolar, setSenaryolar] = useState<Senaryo[]>([]);
  const [baglanti, setBaglanti] = useState<BaglantiDurumu | null>(null);
  const [gunluk, setGunluk] = useState<GunlukSatiri[]>([]);
  const [unrealIstekler, setUnrealIstekler] = useState<UnrealIstekKaydi[]>([]);
  const [ornek, setOrnek] = useState<OrnekDurumu | null>(null);
  const [figurler, setFigurler] = useState<Array<FigurKomutu & { id: string }>>([]);
  const [onizleme, setOnizleme] = useState<{ veri: string; zaman: number; bilgi?: string } | null>(null);
  const [sonSifirlama, setSonSifirlama] = useState<SonSifirlama | null>(null);
  const [soketAcik, setSoketAcik] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const yenidenDeneme = useRef<number | null>(null);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let kapatildi = false;

    const baglan = () => {
      const protokol = location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${protokol}://${location.host}/ws`);
      ws.onopen = () => {
        setSoketAcik(true);
        setHata(null);
        ws?.send(JSON.stringify({ tip: "merhaba", rol: "panel" }));
        void api.baglanti().then(setBaglanti).catch(() => undefined);
        void api
          .gunluk()
          .then((kayitlar) => setGunluk([...kayitlar].reverse().slice(0, 150)))
          .catch(() => undefined);
        void api
          .unrealSonIstekler()
          .then((kayitlar) => setUnrealIstekler([...kayitlar].reverse().slice(0, 60)))
          .catch(() => undefined);
        void api.figurler().then(setFigurler).catch(() => undefined);
        void api.senaryolar().then(setSenaryolar).catch(() => undefined);
      };
      ws.onmessage = (olay) => {
        const mesaj = JSON.parse(olay.data) as SunucuMesaji;
        switch (mesaj.tip) {
          case "durum":
            setDurum(mesaj.durum);
            break;
          case "senaryo":
            setSenaryo(mesaj.senaryo);
            break;
          case "senaryolar":
            setSenaryolar(mesaj.liste);
            break;
          case "baglanti":
            setBaglanti(mesaj.baglanti);
            break;
          case "gunluk":
            setGunluk((eski) => [{ seviye: mesaj.seviye, mesaj: mesaj.mesaj, zaman: mesaj.zaman }, ...eski].slice(0, 150));
            break;
          case "unreal":
            setUnrealIstekler((eski) => [mesaj.istek, ...eski].slice(0, 60));
            break;
          case "ornek":
            setOrnek(mesaj.ornek);
            break;
          case "figur":
            setFigurler(mesaj.aktifler);
            break;
          case "onizleme":
            setOnizleme({ veri: mesaj.veri, zaman: mesaj.zaman, bilgi: mesaj.bilgi });
            break;
          case "sahne":
            // Sıfırlama (hangi panelden ya da oynatıcıdan olursa olsun): her panel tek bildirim, helikopter dizisi iptal.
            // "senkron" oynatıcılar içindir (kaçırılan sıfırlama); panelde yok sayılır.
            if (mesaj.islem === "sifirla") {
              bilinenSifirlamaNesli = mesaj.nesil;
              heliDizisiIptal();
              setSonSifirlama({ nesil: mesaj.nesil, kaynak: mesaj.kaynak, ozet: mesaj.ozet, zaman: mesaj.zaman });
            }
            break;
        }
      };
      ws.onclose = () => {
        setSoketAcik(false);
        if (!kapatildi) yenidenDeneme.current = window.setTimeout(baglan, 2000);
      };
      ws.onerror = () => ws?.close();
    };

    baglan();
    return () => {
      kapatildi = true;
      if (yenidenDeneme.current) clearTimeout(yenidenDeneme.current);
      ws?.close();
    };
  }, []);

  /** API çağrılarını sarar; hata olursa üst çubukta gösterir. */
  const calistir = useCallback(async <T,>(islem: () => Promise<T>): Promise<T | undefined> => {
    try {
      setHata(null);
      return await islem();
    } catch (h) {
      setHata(h instanceof Error ? h.message : String(h));
      return undefined;
    }
  }, []);

  /**
   * Bu panelin sıfırlama isteğinin yanıtı: durum, senaryo ve figür listesi WS mesajını beklemeden hemen yazılır
   * (rozetler, pusula halkaları ve sayaç anında temizlenir). Aynı nesil WS'den de gelir; bildirim nesil başına bir kez.
   */
  const sifirlamaUygula = useCallback((y: SifirlamaYaniti) => {
    bilinenSifirlamaNesli = Math.max(bilinenSifirlamaNesli, y.nesil);
    heliDizisiIptal();
    setDurum(y.durum);
    setSenaryo(y.senaryo);
    setFigurler([]);
    setSonSifirlama((eski) => (eski && eski.nesil >= y.nesil ? eski : { nesil: y.nesil, kaynak: y.kaynak, ozet: y.ozet, zaman: y.zaman }));
  }, []);

  return { durum, senaryo, senaryolar, baglanti, gunluk, unrealIstekler, ornek, figurler, onizleme, sonSifirlama, soketAcik, hata, calistir, sifirlamaUygula };
}
