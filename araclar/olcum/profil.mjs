// Kare profili (10 Kasım): başsız Chrome (Playwright, NVIDIA) sahneyi kurar, kareyi `sahne3b.ciz()` + readPixels ile
// senkron çizip süre ölçer (göreli; gerçek pencereden ~7 kat yavaş), katmanları kapatarak kırılım: gölge geçişi, alan
// gizli / gölgesiz, arazi gizli, alan istatistikleri, alan dokularını 1024/512'ye küçültme denemesi.
//   node araclar/olcum/profil.mjs meskun_mahal 1920
// Meskûn cadde profili: kare süresi (senkron çizim + readPixels), katman kapatarak kırılım, alan istatistikleri.
// node profil.mjs [bolge] [genislik]
import { chromium } from "playwright";
const BOLGE = process.argv[2] || "meskun_mahal";
const GEN = Number(process.argv[3] || 1920);
const YUK = Math.round((GEN * 9) / 48);
const api = (y, yol, g) => fetch("http://127.0.0.1:4000/api" + yol, { method: y, headers: { "content-type": "application/json" }, body: g ? JSON.stringify(g) : undefined });
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await chromium.launch({ channel: "chrome", args: ["--ignore-gpu-blocklist", "--enable-gpu", "--use-angle=d3d11", "--mute-audio"] });
const p = await b.newPage({ viewport: { width: GEN, height: YUK } });
await p.goto("http://127.0.0.1:4000/oynatici/?dinamik=0&tohum=7&kalite=yuksek&hud=0&gecis=0");
await api("PATCH", "/ortam", { mevsim: "yaz", saat: 12, yagis: "yok", sis: 0, bulut: 0.2 });
await api("PUT", "/bolge", { bolge: BOLGE });
const bas = Date.now();
await bekle(2000);
while (Date.now() - bas < 90000) {
  const h = await p.evaluate(() => { const s = window.duvar?.sahne3b; return !!s && s.hazir && !s.panoramaYukleniyor && !(window.duvar.gecis?.opaklik > 0.01); });
  if (h) break;
  await bekle(500);
}
await bekle(7000);
const sonuc = await p.evaluate(() => {
  const s = window.duvar.sahne3b;
  const r = s.renderer;
  const gl = r.getContext();
  const px = new Uint8Array(4);
  const kare = () => { s.ciz(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); };
  const olc = (n = 40) => { for (let i = 0; i < 6; i++) kare(); const t = performance.now(); for (let i = 0; i < n; i++) kare(); return +((performance.now() - t) / n).toFixed(2); };
  const sayac = () => { r.info.autoReset = false; r.info.reset(); s.ciz(); const i = { cizim: r.info.render.calls, ucgen: r.info.render.triangles }; r.info.autoReset = true; return i; };
  const out = {};
  out.taban_ms = olc();
  out.taban_sayac = sayac();
  // Gölge geçişi atlanır (eski harita kalır): gölge geçişinin maliyeti
  const sm = r.shadowMap;
  Object.defineProperty(sm, "needsUpdate", { configurable: true, get: () => false, set: () => {} });
  out.golgeGecisiYok_ms = olc();
  out.golgeGecisiYok_sayac = sayac();
  delete sm.needsUpdate;
  // Alan (binalar, araçlar) gizli / gölge atmıyor
  const alan = s.alan?.grup;
  if (alan) {
    alan.visible = false;
    out.alanGizli_ms = olc();
    alan.visible = true;
    const atanlar = [];
    alan.traverse((o) => { if (o.isMesh && o.castShadow) { atanlar.push(o); o.castShadow = false; } });
    out.alanGolgesiz_ms = olc();
    for (const o of atanlar) o.castShadow = true;
  }
  // Arazi (zemin + bitki) gizli
  const ar = s.arazi?.grup;
  if (ar) { ar.visible = false; out.araziGizli_ms = olc(); ar.visible = true; }
  // Alan istatistikleri
  if (alan) {
    let mesh = 0, ucgen = 0, golgeUcgen = 0;
    const mal = new Set(), dok = new Map();
    const enAgir = [];
    alan.traverse((o) => {
      if (!o.isMesh) return;
      mesh++;
      const g = o.geometry;
      const u = (g.index ? g.index.count : g.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1);
      ucgen += u;
      if (o.castShadow) golgeUcgen += u;
      let ust = o; while (ust.parent && ust.parent !== alan) ust = ust.parent;
      enAgir.push([ust.name || o.name || "?", Math.round(u)]);
      for (const m of [].concat(o.material)) {
        mal.add(m);
        for (const v of Object.values(m)) if (v && v.isTexture && v.image) dok.set(v, `${v.image.width}x${v.image.height}`);
      }
    });
    const toplam = new Map();
    for (const [ad, u] of enAgir) toplam.set(ad, (toplam.get(ad) || 0) + u);
    const boyutlar = {};
    for (const b of dok.values()) boyutlar[b] = (boyutlar[b] || 0) + 1;
    out.alan = { mesh, ucgen: Math.round(ucgen), golgeUcgen: Math.round(golgeUcgen), malzeme: mal.size, doku: dok.size, dokuBoyutlari: boyutlar, enAgir: [...toplam].sort((a, b) => b[1] - a[1]).slice(0, 12) };
  }
  // Doku deneyi: alan dokularını yerinde küçült (en çok 1024, sonra 512) → bellek/bant genişliği varsayımı
  if (alan && !window.__parca) {
    const kucult = (enFazla) => {
      const set = new Set();
      alan.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) for (const v of Object.values(m)) if (v && v.isTexture && v.image && v.image.width > enFazla) set.add(v); });
      for (const t of set) {
        const c = document.createElement("canvas");
        const k = enFazla / Math.max(t.image.width, t.image.height);
        c.width = Math.round(t.image.width * k); c.height = Math.round(t.image.height * k);
        c.getContext("2d").drawImage(t.image, 0, 0, c.width, c.height);
        t.dispose(); t.image = c; t.needsUpdate = true;
      }
      return set.size;
    };
    out.doku_once_ms = olc();
    out.doku1024_sayi = kucult(1024);
    olc(4);
    out.doku1024_ms = olc();
    out.doku512_sayi = kucult(512);
    olc(4);
    out.doku512_ms = olc();
    return out;
  }
  // Parça parça: alanın her çocuğu gizlenince kazanç (ms), en büyük 15
  if (alan) {
    const taban = olc(12);
    const kazanc = [];
    for (const c of alan.children) {
      c.visible = false;
      const t = olc(12);
      c.visible = true;
      let u = 0, m = 0, saydam = 0, ad = c.name;
      c.traverse((o) => { if (!o.isMesh) return; m++; const g = o.geometry; u += (g.index ? g.index.count : g.attributes.position.count) / 3; for (const mm of [].concat(o.material)) if (mm.transparent || mm.alphaTest > 0) saydam++; });
      c.traverse((o) => { if (!ad && o.userData && o.userData.alanDosya) ad = o.userData.alanDosya; });
      kazanc.push({ ad: ad || c.uuid.slice(0, 6), kazanc: +(taban - t).toFixed(1), ucgen: Math.round(u), mesh: m, saydam, konum: c.position.toArray().map((v) => Math.round(v)) });
    }
    out.parcaTaban = taban;
    out.parcalar = kazanc.sort((a, b) => b.kazanc - a.kazanc).slice(0, 15);
    out.parcaSayisi = alan.children.length;
  }
  out.golgeHaritasi = s.gunes?.shadow?.mapSize?.x;
  out.antialias = gl.getContextAttributes().antialias;
  return out;
});
console.log(`${BOLGE} ${GEN}×${YUK}`);
console.log(JSON.stringify(sonuc, null, 1));
await b.close();
