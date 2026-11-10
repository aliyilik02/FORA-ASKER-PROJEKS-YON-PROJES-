// Oynayarak test 5: bir senaryoyu baştan sona oynatır, verilen saniyelerde kare çeker, aralarda fps ölçer.
//   node araclar/oyun-testi/senaryo-izle.mjs --id sn_meskun_kusatma --kareler 22,31,36,47,58,64,75,92,108,119,127,131,141,150,162,176,198,215,236
import { baslat, bekle } from "./cekirdek.mjs";

const arg = (ad, v) => (process.argv.includes(`--${ad}`) ? process.argv[process.argv.indexOf(`--${ad}`) + 1] : v);
const id = arg("id", "sn_meskun_kusatma");
const kareler = arg("kareler", "20,40,60").split(",").map(Number).sort((a, b) => a - b);
const c = await baslat();
try {
  await c.api("POST", "/sahne/sifirla", { kaynak: "panel" });
  await c.hazirBekle();
  await c.api("POST", "/senaryo/yukle", { id });
  await c.api("POST", "/senaryo/oynat", {});
  const bas = Date.now();
  const gecen = () => (Date.now() - bas) / 1000;
  const fpsler = [];
  for (const sn of kareler) {
    // Kareye 5 sn'den çok varsa arada 3 sn fps ölç
    if (sn - gecen() > 5) {
      await bekle(Math.max(0, (sn - gecen() - 4) * 1000));
      const f = await c.fps(3);
      fpsler.push(f.fps);
      if (f.fps < 30 || f.enUzunMs > 120) console.log(`  ! ${gecen().toFixed(0)} sn: fps ${f.fps}, en uzun kare ${f.enUzunMs} ms`);
    }
    await bekle(Math.max(0, (sn - gecen()) * 1000));
    await c.cek(`sen_${String(sn).padStart(3, "0")}`);
    const d = await c.api("GET", "/senaryo/durum");
    console.log(`${String(sn).padStart(3)} sn · ${d.durum ?? d.oynatim ?? ""} · figür ${(await c.figurler()).length}`);
  }
  console.log("fps en az / ortalama:", Math.min(...fpsler), (fpsler.reduce((a, b) => a + b, 0) / fpsler.length).toFixed(1));
  const g = await c.api("GET", "/gunluk");
  const uyari = (Array.isArray(g) ? g : []).filter((k) => /uyar|hata|bulunamad/i.test(JSON.stringify(k))).slice(-8);
  if (uyari.length) console.log("Köprü günlüğü uyarıları:\n  " + uyari.map((k) => JSON.stringify(k).slice(0, 200)).join("\n  "));
} finally {
  await c.api("POST", "/senaryo/dur", {}).catch(() => {});
  await c.api("POST", "/sahne/sifirla", { kaynak: "panel" }).catch(() => {});
  if (c.konsol.size) console.log("\nKonsol:\n  " + [...c.konsol].map(([m, n]) => `${n}× ${m}`).join("\n  "));
  await c.kapat();
}
