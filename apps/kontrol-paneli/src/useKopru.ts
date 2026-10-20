/** Köprü sunucusuyla WebSocket bağlantısı; durum, senaryo ve günlük akışını tutar. */
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { BaglantiDurumu, OrnekDurumu, SenaryoDurumu, SimulasyonDurumu, SunucuMesaji, UnrealIstekKaydi } from "./tipler";

export interface GunlukSatiri {
  seviye: "bilgi" | "uyari" | "hata";
  mesaj: string;
  zaman: number;
}

export function useKopru() {
  const [durum, setDurum] = useState<SimulasyonDurumu | null>(null);
  const [senaryo, setSenaryo] = useState<SenaryoDurumu | null>(null);
  const [baglanti, setBaglanti] = useState<BaglantiDurumu | null>(null);
  const [gunluk, setGunluk] = useState<GunlukSatiri[]>([]);
  const [unrealIstekler, setUnrealIstekler] = useState<UnrealIstekKaydi[]>([]);
  const [ornek, setOrnek] = useState<OrnekDurumu | null>(null);
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
        void api.baglanti().then(setBaglanti).catch(() => undefined);
        void api
          .gunluk()
          .then((kayitlar) => setGunluk([...kayitlar].reverse().slice(0, 150)))
          .catch(() => undefined);
        void api
          .unrealSonIstekler()
          .then((kayitlar) => setUnrealIstekler([...kayitlar].reverse().slice(0, 60)))
          .catch(() => undefined);
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

  return { durum, senaryo, baglanti, gunluk, unrealIstekler, ornek, soketAcik, hata, calistir };
}
