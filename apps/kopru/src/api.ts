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
import { sifirlamaKaynagiCoz, type SahneYoneticisi } from "./sahne.js";
import type { SenaryoMotoru } from "./senaryo.js";
import type { BaglantiDurumu, OnAyar, Senaryo, SenaryoAdimi, SifirlamaYaniti } from "./tipler.js";
import { CATISMA_SEMASI, EFEKT_SEMASI, ISIK_SEMASI, IZLI_MERMI_SEMASI, ODA2_SEMASI, ORTAM_SEMASI, kismiDogrula, senaryoAdimlariniDogrula } from "./dogrulama.js";
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
  /** Bağlı kontrol paneli sayısını döndürür. */
  panelSayisi?: () => number;
  figur?: FigurYoneticisi;
  /** Sahne sıfırlaması (temel sahne; senaryo, figür, durum, oynatıcı yayını tek yerde). */
  sahne?: SahneYoneticisi;
  /** Senaryo listesi değişince (kayıt/silme) çağrılır; köprü `senaryolar` mesajını yayınlar. */
  senaryolarDegisti?: (liste: Senaryo[]) => void;
}

export function baglantiDurumu(unreal: UnrealIstemci, artnet: ArtNetGonderici, oynaticiSayisi = 0, panelSayisi = 0): BaglantiDurumu {
  return {
    unreal: { mod: unreal.mod, bagli: unreal.bagli, adres: unreal.adres, sonHata: unreal.sonHata },
    artnet: {
      aktif: artnet.aktif,
      hedef: artnet.hedef,
      evren: artnet.evren,
      sonGonderim: artnet.sonGonderimZamani || undefined,
    },
    oynatici: { bagli: oynaticiSayisi > 0, sayi: oynaticiSayisi },
    panel: { sayi: panelSayisi },
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
  r.get("/baglanti", (_req, res) => res.json(baglantiDurumu(b.unreal, b.artnet, b.oynaticiSayisi?.() ?? 0, b.panelSayisi?.() ?? 0)));
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

  // PATCH gövdeleri alan alan doğrulanır (dogrulama.ts): yanlış tip/seçenek 400 ve hata listesi; tanınmayan alan atılır
  const dogrulaYaDaReddet = <T extends object>(req: Request, res: Response, sema: Parameters<typeof kismiDogrula>[1]): Partial<T> | null => {
    const s = kismiDogrula<T>(req.body, sema);
    if (s.hatalar.length) {
      res.status(400).json({ hata: s.hatalar.join("; ") });
      return null;
    }
    return s.deger;
  };

  r.patch(
    "/ortam",
    sarmala(async (req, res) => {
      const k = dogrulaYaDaReddet<Parameters<DurumDeposu["ortamGuncelle"]>[0]>(req, res, ORTAM_SEMASI);
      if (!k) return;
      await b.depo.ortamGuncelle(k);
      res.json(b.depo.al());
    }),
  );

  r.patch(
    "/isik",
    sarmala((req, res) => {
      const k = dogrulaYaDaReddet<Parameters<DurumDeposu["isikGuncelle"]>[0]>(req, res, ISIK_SEMASI);
      if (!k) return;
      b.depo.isikGuncelle(k);
      res.json(b.depo.al());
    }),
  );

  r.patch(
    "/izli-mermi",
    sarmala(async (req, res) => {
      const k = dogrulaYaDaReddet<Parameters<DurumDeposu["izliMermiGuncelle"]>[0]>(req, res, IZLI_MERMI_SEMASI);
      if (!k) return;
      await b.depo.izliMermiGuncelle(k);
      res.json(b.depo.al());
    }),
  );

  r.patch(
    "/oda2",
    sarmala(async (req, res) => {
      const k = dogrulaYaDaReddet<Parameters<DurumDeposu["oda2Guncelle"]>[0]>(req, res, ODA2_SEMASI);
      if (!k) return;
      await b.depo.oda2Guncelle(k);
      res.json(b.depo.al());
    }),
  );

  r.patch(
    "/catisma",
    sarmala(async (req, res) => {
      const k = dogrulaYaDaReddet<Parameters<DurumDeposu["catismaGuncelle"]>[0]>(req, res, CATISMA_SEMASI);
      if (!k) return;
      await b.depo.catismaGuncelle(k);
      res.json(b.depo.al());
    }),
  );

  r.post(
    "/efekt",
    sarmala(async (req, res) => {
      const k = dogrulaYaDaReddet<Parameters<DurumDeposu["efektTetikle"]>[0]>(req, res, EFEKT_SEMASI);
      if (!k) return;
      if (!k.tur) return res.status(400).json({ hata: "tur zorunlu" });
      await b.depo.efektTetikle(k as Parameters<DurumDeposu["efektTetikle"]>[0]);
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

  // --- Sahneyi temele döndür: deneme sonrası / yeni eğitim grubu (figürler, efektler, çatışma, izli mermi, helikopter,
  // senaryo oynatımı, krater/duman, sesler; ortam, bölge, ışık ve yüklü senaryo kalır). Gövde { kaynak? }; gövdesiz eski
  // çağrı "panel" sayılır. Yanıt: panel WS mesajını beklemeden durumu ve senaryoyu hemen yazar.
  r.post("/sahne/sifirla", (req, res) => {
    if (!b.sahne) return res.status(501).json({ hata: "sahne yöneticisi yok" });
    const kaynak = sifirlamaKaynagiCoz(req.body?.kaynak);
    const ozet = b.sahne.sifirla(kaynak);
    const yanit: SifirlamaYaniti = { tamam: true, nesil: b.sahne.nesil, kaynak, ozet, zaman: b.sahne.sonZaman, durum: b.depo.al(), senaryo: b.senaryo.al() };
    res.json(yanit);
  });

  // --- Senaryolar ---
  r.get("/senaryolar", (_req, res) => res.json(b.veri.senaryolar()));
  r.get("/senaryo/durum", (_req, res) => res.json(b.senaryo.al()));

  r.post("/senaryolar", (req, res) => {
    const govde = req.body as Partial<Senaryo>;
    if (!govde?.ad || typeof govde.ad !== "string" || !Array.isArray(govde.adimlar)) return res.status(400).json({ hata: "ad ve adimlar zorunlu" });
    // Adımlar: işlem/gecikme denetimi, yinelenen kimlikler tekilleştirilir (aynı kimlik iki kez geçerse ikincisi hiç çalışmaz, senaryo bitmezdi)
    const d = senaryoAdimlariniDogrula(govde.adimlar);
    if (d.hatalar.length) return res.status(400).json({ hata: d.hatalar.join("; ") });
    const senaryo: Senaryo = {
      id: typeof govde.id === "string" && govde.id ? govde.id : kimlikUret("sn"),
      ad: govde.ad,
      aciklama: typeof govde.aciklama === "string" ? govde.aciklama : undefined,
      oda: govde.oda === "oda2" ? "oda2" : "oda1",
      adimlar: d.adimlar as unknown as SenaryoAdimi[],
    };
    const kayit = b.veri.senaryoKaydet(senaryo);
    b.senaryolarDegisti?.(b.veri.senaryolar());
    res.json(kayit);
  });

  r.delete("/senaryolar/:id", (req, res) => {
    const silindi = b.veri.senaryoSil(req.params.id);
    if (silindi) b.senaryolarDegisti?.(b.veri.senaryolar());
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
      // Figür adımı uygulanamadıysa (asker sahnede yok) eğitmen bunu görsün: {tamam:false, uyari}
      res.json(await b.senaryo.adimiTetikle(adim));
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
