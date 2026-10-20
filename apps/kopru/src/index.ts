/**
 * Köprü sunucusu giriş noktası.
 * - HTTP API (/api/...) ve WebSocket (/ws) sunar.
 * - Üretimde kontrol panelinin derlenmiş dosyalarını (apps/kontrol-paneli/dist) da sunar;
 *   böylece tek bir süreç, tek bir port ile sistem kontrol odasında çalışır.
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
import { Gunluk } from "./gunluk.js";
import { OrnekBaslatici, ornekKomutuOlustur } from "./ornek.js";
import { ORNEK_SENARYOLAR } from "./ornekSenaryolar.js";
import { SenaryoMotoru } from "./senaryo.js";
import type { SunucuMesaji } from "./tipler.js";
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

const uygulama = express();
uygulama.use("/api", apiOlustur({ depo, senaryo, veri, unreal, artnet, gunluk, ornek }));

// Derlenmiş panel varsa aynı porttan sun.
const panelKlasoru = fileURLToPath(new URL("../../kontrol-paneli/dist/", import.meta.url));
if (existsSync(panelKlasoru)) {
  uygulama.use(express.static(panelKlasoru));
  uygulama.get(/^\/(?!api|ws).*/, (_req, res) => res.sendFile("index.html", { root: panelKlasoru }));
}

const sunucu = createServer(uygulama);
const wss = new WebSocketServer({ server: sunucu, path: "/ws" });

function herkeseGonder(mesaj: SunucuMesaji) {
  const veri = JSON.stringify(mesaj);
  for (const istemci of wss.clients) {
    if (istemci.readyState === istemci.OPEN) istemci.send(veri);
  }
}

depo.dinle((durum) => herkeseGonder({ tip: "durum", durum }));
senaryo.dinle((s) => herkeseGonder({ tip: "senaryo", senaryo: s }));
gunluk.dinle((k) => herkeseGonder({ tip: "gunluk", seviye: k.seviye, mesaj: k.mesaj, zaman: k.zaman }));
unreal.dinle((istek) => herkeseGonder({ tip: "unreal", istek }));
ornek.dinle((o) => herkeseGonder({ tip: "ornek", ornek: o }));

wss.on("connection", (ws: WebSocket) => {
  ws.send(JSON.stringify({ tip: "durum", durum: depo.al() } satisfies SunucuMesaji));
  ws.send(JSON.stringify({ tip: "senaryo", senaryo: senaryo.al() } satisfies SunucuMesaji));
  ws.send(JSON.stringify({ tip: "baglanti", baglanti: baglantiDurumu(unreal, artnet) } satisfies SunucuMesaji));
  ws.send(JSON.stringify({ tip: "ornek", ornek: ornek.durum() } satisfies SunucuMesaji));
});

// UE bağlantısını düzenli yokla; durum değişirse panellere bildir.
let oncekiBagli: boolean | null = null;
setInterval(async () => {
  const bagli = await unreal.yokla();
  if (bagli !== oncekiBagli) {
    oncekiBagli = bagli;
    herkeseGonder({ tip: "baglanti", baglanti: baglantiDurumu(unreal, artnet) });
    if (bagli && unreal.mod === "gercek") await depo.tumunuGonder();
  }
}, 3000);

artnet.baslat();
sunucu.listen(ayarlar.port, () => {
  gunluk.bilgi(`Köprü sunucusu dinliyor: http://0.0.0.0:${ayarlar.port}`);
  gunluk.bilgi(`Unreal modu: ${ayarlar.unrealMod} (${ayarlar.unrealAdres}, preset "${ayarlar.unrealPreset}")`);
  gunluk.bilgi(`Art-Net: ${ayarlar.artnetAktif ? `aktif → ${artnet.hedef}, evren ${artnet.evren}` : "kapalı (ARTNET_AKTIF=1 ile açılır)"}`);
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
