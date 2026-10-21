/**
 * Köprü sunucusu giriş noktası.
 * - HTTP API (/api/...) ve WebSocket (/ws) sunar.
 * - Üretimde kontrol panelinin (apps/kontrol-paneli/dist) ve Duvar Oynatıcı'nın
 *   (apps/duvar-oynatici/dist → /oynatici/) derlenmiş dosyalarını da sunar; böylece tek bir
 *   süreç, tek bir port ile sistem kontrol odasında çalışır.
 *
 * Hibrit yol: görüntüyü tarayıcı tabanlı Duvar Oynatıcı üretir. Oynatıcı /ws'e bağlanır,
 * "merhaba" ile rolünü bildirir ve durum/efekt yayınlarını izler. Unreal Engine kullanılacaksa
 * aynı komutlar UNREAL_MOD=gercek ile Remote Control API'ye de gider.
 */
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import express from "express";
import { WebSocketServer, type WebSocket } from "ws";
import { apiOlustur, baglantiDurumu } from "./api.js";
import { ArtNetGonderici } from "./artnet.js";
import { ayarlariOku, envDosyasiniYukle, varsayilanEnvYolu } from "./ayarlar.js";
import { VeriDeposu } from "./depo.js";
import { DurumDeposu } from "./durum.js";
import { FigurYoneticisi } from "./figur.js";
import { Gunluk } from "./gunluk.js";
import { OrnekBaslatici, ornekKomutuOlustur } from "./ornek.js";
import { ORNEK_SENARYOLAR } from "./ornekSenaryolar.js";
import { SenaryoMotoru } from "./senaryo.js";
import type { IstemciMesaji, SunucuMesaji } from "./tipler.js";
import { UnrealIstemci } from "./unreal.js";

const envYuklendi = envDosyasiniYukle(varsayilanEnvYolu());
const ayarlar = ayarlariOku();
const gunluk = new Gunluk();
if (envYuklendi) gunluk.bilgi(`Ayarlar .env dosyasından okundu: ${varsayilanEnvYolu()}`);

const unreal = new UnrealIstemci({ adres: ayarlar.unrealAdres, preset: ayarlar.unrealPreset, mod: ayarlar.unrealMod }, gunluk);
const artnet = new ArtNetGonderici({
  hedef: ayarlar.artnetHedef,
  port: ayarlar.artnetPort,
  evren: ayarlar.artnetEvren,
  aktif: ayarlar.artnetAktif,
});
const depo = new DurumDeposu(unreal, artnet, gunluk);
const senaryo = new SenaryoMotoru(depo, gunluk);
const veri = new VeriDeposu(ayarlar.veriKlasoru, ORNEK_SENARYOLAR);
const ornek = new OrnekBaslatici(ornekKomutuOlustur(ayarlar.ornek), gunluk);

/** Bağlı istemciler ve rolleri (panel / oynatıcı). */
const istemciRolleri = new Map<WebSocket, IstemciMesaji["rol"]>();
const oynaticiSayisi = () => [...istemciRolleri.values()].filter((r) => r === "oynatici").length;

// Derlenmiş oynatıcı ve panel varsa aynı porttan sun.
const oynaticiKlasoru = fileURLToPath(new URL("../../duvar-oynatici/dist/", import.meta.url));
const icerikAdaylari = [
  ...(process.env.ICERIK_KLASORU ? [process.env.ICERIK_KLASORU] : []),
  fileURLToPath(new URL("../../duvar-oynatici/dist/icerik/", import.meta.url)),
  fileURLToPath(new URL("../../duvar-oynatici/public/icerik/", import.meta.url)),
];
const figur = new FigurYoneticisi(gunluk, icerikAdaylari);

const uygulama = express();
uygulama.use("/api", apiOlustur({ depo, senaryo, veri, unreal, artnet, gunluk, ornek, oynaticiSayisi, figur }));
if (existsSync(oynaticiKlasoru)) {
  uygulama.use("/oynatici", express.static(oynaticiKlasoru));
}
const panelKlasoru = fileURLToPath(new URL("../../kontrol-paneli/dist/", import.meta.url));
if (existsSync(panelKlasoru)) {
  uygulama.use(express.static(panelKlasoru));
  uygulama.get(/^\/(?!api|ws|oynatici).*/, (_req, res) => res.sendFile("index.html", { root: panelKlasoru }));
}

const sunucu = createServer(uygulama);
const wss = new WebSocketServer({ server: sunucu, path: "/ws" });

function herkeseGonder(mesaj: SunucuMesaji) {
  const veri = JSON.stringify(mesaj);
  for (const istemci of wss.clients) {
    if (istemci.readyState === istemci.OPEN) istemci.send(veri);
  }
}

const baglantiYayinla = () => herkeseGonder({ tip: "baglanti", baglanti: baglantiDurumu(unreal, artnet, oynaticiSayisi()) });

depo.dinle((durum) => herkeseGonder({ tip: "durum", durum }));
depo.efektDinle((efekt) => herkeseGonder({ tip: "efekt", efekt }));
senaryo.dinle((s) => herkeseGonder({ tip: "senaryo", senaryo: s }));
gunluk.dinle((k) => herkeseGonder({ tip: "gunluk", seviye: k.seviye, mesaj: k.mesaj, zaman: k.zaman }));
unreal.dinle((istek) => herkeseGonder({ tip: "unreal", istek }));
ornek.dinle((o) => herkeseGonder({ tip: "ornek", ornek: o }));
figur.dinle((komut, aktifler) => herkeseGonder({ tip: "figur", komut, aktifler }));

wss.on("connection", (ws: WebSocket) => {
  istemciRolleri.set(ws, "panel");
  ws.send(JSON.stringify({ tip: "durum", durum: depo.al() } satisfies SunucuMesaji));
  ws.send(JSON.stringify({ tip: "senaryo", senaryo: senaryo.al() } satisfies SunucuMesaji));
  ws.send(JSON.stringify({ tip: "baglanti", baglanti: baglantiDurumu(unreal, artnet, oynaticiSayisi()) } satisfies SunucuMesaji));
  ws.send(JSON.stringify({ tip: "ornek", ornek: ornek.durum() } satisfies SunucuMesaji));
  // Yeniden bağlanan oynatıcı sahnedeki figürleri geri alsın (aynı id ile oynat → varsa yerine geçer)
  const aktifFigurler = figur.aktifListe();
  for (const f of aktifFigurler) {
    ws.send(JSON.stringify({ tip: "figur", komut: { ...f, islem: "oynat" }, aktifler: aktifFigurler } satisfies SunucuMesaji));
  }

  ws.on("message", (ham) => {
    let mesaj: IstemciMesaji | null = null;
    try {
      mesaj = JSON.parse(String(ham)) as IstemciMesaji;
    } catch {
      return;
    }
    if (mesaj?.tip === "merhaba" && (mesaj.rol === "oynatici" || mesaj.rol === "panel")) {
      istemciRolleri.set(ws, mesaj.rol);
      if (mesaj.rol === "oynatici") gunluk.bilgi(`Duvar Oynatıcı bağlandı${mesaj.ad ? ` (${mesaj.ad})` : ""}; toplam ${oynaticiSayisi()}`);
      baglantiYayinla();
    }
  });

  ws.on("close", () => {
    const rol = istemciRolleri.get(ws);
    istemciRolleri.delete(ws);
    if (rol === "oynatici") {
      gunluk.uyari(`Duvar Oynatıcı bağlantısı koptu; kalan ${oynaticiSayisi()}`);
      baglantiYayinla();
    }
  });
});

// UE bağlantısını düzenli yokla; durum değişirse panellere bildir.
let oncekiBagli: boolean | null = null;
setInterval(async () => {
  const bagli = await unreal.yokla();
  if (bagli !== oncekiBagli) {
    oncekiBagli = bagli;
    baglantiYayinla();
    if (bagli && unreal.mod === "gercek") await depo.tumunuGonder();
  }
}, 3000);

artnet.baslat();
sunucu.listen(ayarlar.port, () => {
  gunluk.bilgi(`Köprü sunucusu dinliyor: http://0.0.0.0:${ayarlar.port}`);
  gunluk.bilgi(`Unreal modu: ${ayarlar.unrealMod} (${ayarlar.unrealAdres}, preset "${ayarlar.unrealPreset}")`);
  gunluk.bilgi(`Art-Net: ${ayarlar.artnetAktif ? `aktif → ${artnet.hedef}, evren ${artnet.evren}` : "kapalı (ARTNET_AKTIF=1 ile açılır)"}`);
  gunluk.bilgi(
    existsSync(oynaticiKlasoru)
      ? `Duvar Oynatıcı: http://localhost:${ayarlar.port}/oynatici/`
      : "Duvar Oynatıcı derlenmemiş (npm run build) – geliştirmede npm run dev:oynatici ile 5174 portunda",
  );
  if (ayarlar.ornek.paket) {
    gunluk.bilgi(
      ornek.durum().yapilandirildi
        ? `Örnek paket hazır: ${ayarlar.ornek.paket} (panelden başlatılabilir)`
        : `Örnek paket bulunamadı: ${ayarlar.ornek.paket} (ORNEK_PAKET yolunu kontrol edin)`,
    );
  }
  void depo.tumunuGonder();
});

process.on("SIGINT", () => {
  ornek.durdur();
  artnet.kapat();
  sunucu.close(() => process.exit(0));
});
