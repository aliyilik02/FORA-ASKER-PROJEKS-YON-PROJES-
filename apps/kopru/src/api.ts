/**
 * HTTP API – kontrol paneli bu uç noktaları kullanır. Tüm yollar Türkçedir.
 */
import express, { type Request, type Response, type NextFunction } from "express";
import type { ArtNetGonderici } from "./artnet.js";
import type { VeriDeposu } from "./depo.js";
import { kimlikUret } from "./depo.js";
import type { DurumDeposu } from "./durum.js";
import type { FigurYoneticisi } from "./figur.js";
import type { Gunluk } from "./gunluk.js";
import type { OrnekBaslatici } from "./ornek.js";
import type { SenaryoMotoru } from "./senaryo.js";
import type { BaglantiDurumu, OnAyar, Senaryo } from "./tipler.js";
import type { UnrealIstemci } from "./unreal.js";

export interface ApiBagimliliklari {
  depo: DurumDeposu;
  senaryo: SenaryoMotoru;
  veri: VeriDeposu;
  unreal: UnrealIstemci;
  artnet: ArtNetGonderici;
  gunluk: Gunluk;
  ornek: OrnekBaslatici;
  /** Bağlı Duvar Oynatıcı sayısını döndürür. */
  oynaticiSayisi?: () => number;
  figur?: FigurYoneticisi;
}

export function baglantiDurumu(unreal: UnrealIstemci, artnet: ArtNetGonderici, oynaticiSayisi = 0): BaglantiDurumu {
  return {
    unreal: { mod: unreal.mod, bagli: unreal.bagli, adres: unreal.adres, sonHata: unreal.sonHata },
    artnet: {
      aktif: artnet.aktif,
      hedef: artnet.hedef,
      evren: artnet.evren,
      sonGonderim: artnet.sonGonderimZamani || undefined,
    },
    oynatici: { bagli: oynaticiSayisi > 0, sayi: oynaticiSayisi },
  };
}

const sarmala =
  (fn: (req: Request, res: Response) => Promise<unknown> | unknown) =>
  (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res)).catch(next);

export function apiOlustur(b: ApiBagimliliklari): express.Router {
  const r = express.Router();
  r.use(express.json({ limit: "1mb" }));

  r.get("/durum", (_req, res) => res.json(b.depo.al()));
  r.get("/baglanti", (_req, res) => res.json(baglantiDurumu(b.unreal, b.artnet, b.oynaticiSayisi?.() ?? 0)));
  r.get("/gunluk", (_req, res) => res.json(b.gunluk.sonKayitlar()));
  r.get("/unreal/son-istekler", (_req, res) => res.json(b.unreal.sonIstekler()));

  // --- Örnek paket (paketlenmiş UE oyunu) başlat/durdur ---
  r.get("/ornek/durum", (_req, res) => res.json(b.ornek.durum()));
  r.post(
    "/ornek/baslat",
    sarmala((_req, res) => res.json(b.ornek.baslat())),
  );
  r.post("/ornek/durdur", (_req, res) => res.json(b.ornek.durdur()));

  r.post(
    "/yeniden-senkron",
    sarmala(async (_req, res) => {
      await b.unreal.yokla();
      await b.depo.tumunuGonder();
      res.json({ tamam: true });
    }),
  );

  r.put(
    "/oda",
    sarmala(async (req, res) => {
      const oda = req.body?.oda;
      if (oda !== "oda1" && oda !== "oda2") return res.status(400).json({ hata: "oda 'oda1' veya 'oda2' olmalı" });
      await b.depo.odaSec(oda);
      res.json(b.depo.al());
    }),
  );

  r.put(
    "/bolge",
    sarmala(async (req, res) => {
      const bolge = req.body?.bolge;
      const gecerli = ["meskun_mahal", "ormanlik", "daglik", "us_bolgesi", "kirsal_acik_arazi"];
      // Not: 5. bölge olarak "kırsal açık arazi" seçildi (docs/sartname-analizi-ve-yaklasim.md §10).
      if (!gecerli.includes(bolge)) return res.status(400).json({ hata: `bolge şunlardan biri olmalı: ${gecerli.join(", ")}` });
      await b.depo.bolgeSec(bolge);
      res.json(b.depo.al());
    }),
  );

  r.patch(
    "/ortam",
    sarmala(async (req, res) => {
      await b.depo.ortamGuncelle(req.body ?? {});
      res.json(b.depo.al());
    }),
  );

  r.patch(
    "/isik",
    sarmala((req, res) => {
      b.depo.isikGuncelle(req.body ?? {});
      res.json(b.depo.al());
    }),
  );

  r.patch(
    "/izli-mermi",
    sarmala(async (req, res) => {
      await b.depo.izliMermiGuncelle(req.body ?? {});
      res.json(b.depo.al());
    }),
  );

  r.patch(
    "/oda2",
    sarmala(async (req, res) => {
      await b.depo.oda2Guncelle(req.body ?? {});
      res.json(b.depo.al());
    }),
  );

  r.post(
    "/efekt",
    sarmala(async (req, res) => {
      const tur = req.body?.tur;
      const gecerli = ["patlama", "gurultu", "bagirma", "cagirma", "toz_duman", "uzak_patlama", "uzak_mermi_sesi"];
      if (!gecerli.includes(tur)) return res.status(400).json({ hata: `tur şunlardan biri olmalı: ${gecerli.join(", ")}` });
      await b.depo.efektTetikle(req.body);
      res.json({ tamam: true });
    }),
  );

  // --- Figürler / klipler (alfa kanallı asker, araç, efekt plakaları) ---
  r.get("/klipler", (_req, res) => res.json(b.figur?.klipleriOku() ?? []));
  r.get("/figurler", (_req, res) => res.json(b.figur?.aktifListe() ?? []));
  r.post(
    "/figur",
    sarmala((req, res) => {
      if (!b.figur) return res.status(501).json({ hata: "figür yöneticisi yok" });
      try {
        const k = b.figur.komut(req.body ?? {});
        res.json({ komut: k, aktifler: b.figur.aktifListe() });
      } catch (hata) {
        res.status(400).json({ hata: hata instanceof Error ? hata.message : String(hata) });
      }
    }),
  );

  // --- Senaryolar ---
  r.get("/senaryolar", (_req, res) => res.json(b.veri.senaryolar()));
  r.get("/senaryo/durum", (_req, res) => res.json(b.senaryo.al()));

  r.post("/senaryolar", (req, res) => {
    const govde = req.body as Partial<Senaryo>;
    if (!govde?.ad || !Array.isArray(govde.adimlar)) return res.status(400).json({ hata: "ad ve adimlar zorunlu" });
    const senaryo: Senaryo = {
      id: govde.id ?? kimlikUret("sn"),
      ad: govde.ad,
      aciklama: govde.aciklama,
      oda: govde.oda === "oda2" ? "oda2" : "oda1",
      adimlar: govde.adimlar.map((a, i) => ({ ...a, id: a.id ?? `adim_${i + 1}` })),
    };
    res.json(b.veri.senaryoKaydet(senaryo));
  });

  r.delete("/senaryolar/:id", (req, res) => {
    const silindi = b.veri.senaryoSil(req.params.id);
    res.status(silindi ? 200 : 404).json({ tamam: silindi });
  });

  r.post(
    "/senaryo/yukle",
    sarmala((req, res) => {
      const senaryo = b.veri.senaryoBul(req.body?.id);
      if (!senaryo) return res.status(404).json({ hata: "senaryo bulunamadı" });
      b.senaryo.yukle(senaryo);
      res.json(b.senaryo.al());
    }),
  );
  r.post(
    "/senaryo/oynat",
    sarmala(async (_req, res) => {
      await b.senaryo.oynat();
      res.json(b.senaryo.al());
    }),
  );
  r.post("/senaryo/duraklat", (_req, res) => {
    b.senaryo.duraklat();
    res.json(b.senaryo.al());
  });
  r.post("/senaryo/dur", (_req, res) => {
    b.senaryo.dur();
    res.json(b.senaryo.al());
  });
  r.post(
    "/senaryo/adim-tetikle",
    sarmala(async (req, res) => {
      const senaryo = b.veri.senaryoBul(req.body?.senaryoId);
      const adim = senaryo?.adimlar.find((a) => a.id === req.body?.adimId);
      if (!adim) return res.status(404).json({ hata: "adım bulunamadı" });
      await b.senaryo.adimiTetikle(adim);
      res.json({ tamam: true });
    }),
  );

  // --- Ön ayarlar ---
  r.get("/on-ayarlar", (_req, res) => res.json(b.veri.onAyarlar()));
  r.post("/on-ayarlar", (req, res) => {
    const ad = String(req.body?.ad ?? "").trim();
    if (!ad) return res.status(400).json({ hata: "ad zorunlu" });
    const { sonEfektler: _s, ...durum } = b.depo.al();
    const onAyar: OnAyar = { id: kimlikUret("oa"), ad, olusturma: new Date().toISOString(), durum };
    res.json(b.veri.onAyarKaydet(onAyar));
  });
  r.post(
    "/on-ayarlar/:id/yukle",
    sarmala(async (req, res) => {
      const onAyar = b.veri.onAyarlar().find((o) => o.id === req.params.id);
      if (!onAyar) return res.status(404).json({ hata: "ön ayar bulunamadı" });
      await b.depo.durumuYukle(onAyar.durum);
      res.json(b.depo.al());
    }),
  );
  r.delete("/on-ayarlar/:id", (req, res) => {
    const silindi = b.veri.onAyarSil(req.params.id);
    res.status(silindi ? 200 : 404).json({ tamam: silindi });
  });

  r.use((hata: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const mesaj = hata instanceof Error ? hata.message : String(hata);
    b.gunluk.hata(`API hatası: ${mesaj}`);
    res.status(500).json({ hata: mesaj });
  });

  return r;
}
