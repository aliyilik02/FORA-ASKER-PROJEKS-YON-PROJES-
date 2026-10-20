#!/usr/bin/env node
// Art-Net dinleyici – isik kontrolcusu olmadan kopru sunucusunun DMX ciktisini gormek icin.
// Kullanim:  node araclar/artnet-dinle.mjs [port] [gosterilecek kanal sayisi]
// Kopru tarafinda: ARTNET_AKTIF=1 ARTNET_HEDEF=127.0.0.1 npm run dev:kopru
import dgram from "node:dgram";

const port = Number(process.argv[2] ?? 6454);
const kanalSayisi = Number(process.argv[3] ?? 8);
const soket = dgram.createSocket({ type: "udp4", reuseAddr: true });

soket.on("message", (veri, kaynak) => {
  if (veri.length < 18 || veri.toString("ascii", 0, 8) !== "Art-Net\0") return;
  const opCode = veri.readUInt16LE(8);
  if (opCode !== 0x5000) return; // yalnizca ArtDmx
  const sira = veri[12];
  const evren = veri[14] | ((veri[15] & 0x7f) << 8);
  const uzunluk = veri.readUInt16BE(16);
  const kanallar = Array.from(veri.subarray(18, 18 + Math.min(uzunluk, kanalSayisi)));
  const [dimmer = 0, r = 0, g = 0, b = 0, strobe = 0] = kanallar;
  const zaman = new Date().toISOString().slice(11, 23);
  console.log(
    `${zaman} ${kaynak.address}:${kaynak.port} evren=${evren} sira=${sira} ` +
      `dimmer=${dimmer} R=${r} G=${g} B=${b} strobe=${strobe} | ilk ${kanalSayisi}: [${kanallar.join(", ")}]`,
  );
});

soket.on("error", (hata) => {
  console.error(`[HATA] ${hata.message}`);
  process.exit(1);
});

soket.bind(port, () => {
  console.log(`Art-Net dinleniyor: UDP ${port} (ArtDmx paketleri). Cikis: Ctrl+C`);
});
