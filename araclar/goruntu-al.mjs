// Görsel denetim (Playwright): oynatıcıyı başsız Chrome'da (ekran kartıyla) açar, köprü API'siyle sahneyi kurar, sahne
// hazır olunca tam tuvali ve her duvarı PNG olarak kaydeder. Claude ve geliştirici görüntüyü okuyup gerçekçiliği
// değerlendirir. Köprü çalışıyor olmalı (npm start). Tarayıcı: kurulu Google Chrome (`channel: "chrome"`; Windows'ta
// chrome.exe için "Yüksek performans" GPU tercihi geçerli olur). Chrome yoksa --chromium ile Playwright'ın Chromium'u.
//
//   node araclar/goruntu-al.mjs --bolge ormanlik --mevsim yaz --saat 12 [--fov 90] [--genislik 3840] [--ad orman_yaz]
//        [--cikti araclar/_goruntu] [--kalite yuksek] [--bekle 4] [--js "<sahne hazırken çalışacak ifade>"] [--goster]
//   Birden çok sahne: --sahneler "ormanlik:yaz:12,kirsal_acik_arazi:yaz:12,meskun_mahal:kis:16"
//
// --fov dar verilirse (ör. 25) her duvar teleobjektif gibi yakınlaşır: uzak ağaç/bina ayrıntısı için.
// Not: bölge/ortam köprüde değişir, açık olan bütün oynatıcılar da o sahneye geçer.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const arg = (ad, varsayilan) => {
  const i = process.argv.indexOf(`--${ad}`);
  return i > 0 && process.argv[i + 1] !== undefined && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : varsayilan;
};
const bayrak = (ad) => process.argv.includes(`--${ad}`);
const KOPRU = arg("kopru", "http://127.0.0.1:4000");
const GENISLIK = Number(arg("genislik", 3840));
const YUKSEKLIK = Math.round((GENISLIK * 9) / 48);
const FOV = arg("fov", "");
const KALITE = arg("kalite", "yuksek");
const BEKLE = Number(arg("bekle", 4)) * 1000;
const CIKTI = path.resolve(arg("cikti", "araclar/_goruntu"));
const JS = arg("js", "");

const sahneler = (arg("sahneler", "") || `${arg("bolge", "kirsal_acik_arazi")}:${arg("mevsim", "yaz")}:${arg("saat", 12)}`)
  .split(",")
  .map((s) => {
    const [bolge, mevsim = "yaz", saat = "12"] = s.split(":");
    return { bolge, mevsim, saat: Number(saat) };
  });
const tekAd = arg("ad", "");

const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(yontem, yol, govde) {
  const r = await fetch(KOPRU + "/api" + yol, { method: yontem, headers: { "content-type": "application/json" }, body: govde ? JSON.stringify(govde) : undefined });
  if (!r.ok) throw new Error(`${yontem} ${yol}: ${r.status} ${await r.text()}`);
  return r.json();
}

const HAZIR = () => {
  const d = window.duvar;
  if (!d || !d.sahne3b) return { hazir: false, neden: "duvar yok" };
  const s = d.sahne3b;
  if (!s.hazir) return { hazir: false, neden: "3B hazır değil" };
  if (s.panoramaYukleniyor) return { hazir: false, neden: "panorama yükleniyor" };
  if (d.gecis && d.gecis.opaklik > 0.01) return { hazir: false, neden: "geçiş örtüsü" };
  return { hazir: true, kaynak: s.kaynakBilgisi };
};

async function main() {
  fs.mkdirSync(CIKTI, { recursive: true });
  await api("GET", "/durum"); // köprü ayakta mı
  const tarayici = await chromium.launch({
    channel: bayrak("chromium") ? undefined : "chrome",
    headless: !bayrak("goster"),
    args: ["--ignore-gpu-blocklist", "--enable-gpu", "--use-angle=d3d11", "--autoplay-policy=no-user-gesture-required", "--mute-audio"],
  });
  try {
    const sayfa = await tarayici.newPage({ viewport: { width: GENISLIK, height: YUKSEKLIK }, deviceScaleFactor: 1 });
    const konsol = new Set();
    sayfa.on("pageerror", (h) => konsol.add("HATA " + h.message));
    sayfa.on("console", (m) => {
      if (m.type() === "error" || (m.type() === "warning" && !/X4122|Program Info Log/.test(m.text()))) konsol.add(`${m.type()} ${m.text().slice(0, 300)}`);
    });
    const sorgu = new URLSearchParams({ dinamik: "0", tohum: "7", kalite: KALITE, hud: "0", gecis: "0" });
    if (FOV) sorgu.set("fov", FOV);
    sorgu.set("gorsel", arg("gorsel", "film"));
    await sayfa.goto(`${KOPRU}/oynatici/?${sorgu}`);
    const gpu = await sayfa.evaluate(() => {
      const g = document.createElement("canvas").getContext("webgl2");
      const e = g && g.getExtension("WEBGL_debug_renderer_info");
      return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : "?";
    });
    console.log(`GPU: ${gpu}  · tuval ${GENISLIK}×${YUKSEKLIK}${FOV ? ` · fov ${FOV}` : ""} · kalite ${KALITE}`);
    if (/SwiftShader|Basic Render/i.test(gpu)) console.log("  ! yazılımsal çizim: görüntü ve süre gerçeği yansıtmaz");

    for (const s of sahneler) {
      await api("PATCH", "/ortam", { mevsim: s.mevsim, saat: s.saat, yagis: "yok", sis: Number(arg("sis", "0")), bulut: Number(arg("bulut", "0.2")), simsek: false });
      await api("PUT", "/bolge", { bolge: s.bolge });
      const bas = Date.now();
      await bekle(1500);
      let h = { hazir: false, neden: "?" };
      while (Date.now() - bas < 90000) {
        h = await sayfa.evaluate(HAZIR);
        if (h.hazir) break;
        await bekle(500);
      }
      if (!h.hazir) console.log(`  ! ${s.bolge}: 90 sn'de hazır olmadı (${h.neden}), yine de çekiliyor`);
      await bekle(BEKLE); // arazi dokuları, bitki yerleşimi, gölge oturması
      if (JS) console.log("  js →", JSON.stringify(await sayfa.evaluate(JS)).slice(0, 300));
      const ad = tekAd && sahneler.length === 1 ? tekAd : `${s.bolge}_${s.mevsim}_${String(s.saat).padStart(2, "0")}${FOV ? `_fov${FOV}` : ""}`;
      const dosya = path.join(CIKTI, `${ad}.png`);
      await sayfa.screenshot({ path: dosya });
      // Duvar başına kırpım (U duvar: sol / orta / sağ eşit üçte bir)
      const dg = Math.floor(GENISLIK / 3);
      for (const [i, duvar] of ["sol", "orta", "sag"].entries()) {
        await sayfa.screenshot({ path: path.join(CIKTI, `${ad}_${duvar}.png`), clip: { x: i * dg, y: 0, width: dg, height: YUKSEKLIK } });
      }
      console.log(`  ${dosya}  (${Math.round((Date.now() - bas) / 1000)} sn${h.kaynak ? ` · ${h.kaynak}` : ""})`);
    }
    if (konsol.size) console.log("Konsol uyarı/hata:\n  " + [...konsol].slice(0, 15).join("\n  "));
  } finally {
    await tarayici.close();
  }
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
