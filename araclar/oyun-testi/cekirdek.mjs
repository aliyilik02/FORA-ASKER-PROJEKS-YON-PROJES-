// Oynayarak test çekirdeği (Playwright): oynatıcıyı başsız Chrome'da açar, köprü API'siyle sahneyi sürer, ekran çeker
// ve figür kemiklerini kare kare örnekler (animasyon sıçraması, ayak kayması, zemine gömülme, silah–el kopması).
// Kullanım: test betiği `baslat()` çağırır, dönen bağlamla (api, cek, ornekle, figurler, bekle) sahneyi oynatır.
// Köprü çalışıyor olmalı (npm start). Görüntüler araclar/_goruntu/oyun/ altına yazılır.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

export const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

export async function baslat({ kopru = process.env.KOPRU ?? "http://127.0.0.1:4000", genislik = 3840, kalite = "yuksek", cikti = "araclar/_goruntu/oyun", sorgu = {}, goster = false } = {}) {
  const yukseklik = Math.round((genislik * 9) / 48);
  const klasor = path.resolve(cikti);
  fs.mkdirSync(klasor, { recursive: true });
  async function api(yontem, yol, govde) {
    const r = await fetch(kopru + "/api" + yol, { method: yontem, headers: { "content-type": "application/json" }, body: govde ? JSON.stringify(govde) : undefined });
    if (!r.ok) throw new Error(`${yontem} ${yol}: ${r.status} ${await r.text()}`);
    return r.json();
  }
  await api("GET", "/durum");
  const tarayici = await chromium.launch({
    channel: "chrome",
    headless: !goster,
    args: ["--ignore-gpu-blocklist", "--enable-gpu", "--use-angle=d3d11", "--autoplay-policy=no-user-gesture-required", "--mute-audio"],
  });
  const sayfa = await tarayici.newPage({ viewport: { width: genislik, height: yukseklik }, deviceScaleFactor: 1 });
  const konsol = new Map();
  const ekle = (m) => konsol.set(m, (konsol.get(m) ?? 0) + 1);
  sayfa.on("pageerror", (h) => ekle("HATA " + h.message.slice(0, 300)));
  sayfa.on("console", (m) => {
    if (m.type() === "error" || (m.type() === "warning" && !/X4122|Program Info Log/.test(m.text()))) ekle(`${m.type()} ${m.text().slice(0, 300)}`);
  });
  const s = new URLSearchParams({ dinamik: "0", tohum: "7", kalite, hud: "0", gecis: "0", ...sorgu });
  await sayfa.goto(`${kopru}/oynatici/?${s}`);

  async function hazirBekle(enCok = 90000) {
    const bas = Date.now();
    await bekle(1200);
    while (Date.now() - bas < enCok) {
      const h = await sayfa.evaluate(() => {
        const d = window.duvar;
        if (!d || !d.sahne3b || !d.sahne3b.hazir) return false;
        if (d.sahne3b.panoramaYukleniyor) return false;
        if (d.gecis && d.gecis.opaklik > 0.01) return false;
        return true;
      });
      if (h) return true;
      await bekle(400);
    }
    return false;
  }

  /** Tam tuval ya da kırpım: bolge = "sol" | "orta" | "sag" | {x,y,width,height} (0..1 oranlar da olur). */
  async function cek(ad, bolge) {
    const dosya = path.join(klasor, `${ad}.png`);
    let clip;
    const dg = Math.floor(genislik / 3);
    if (bolge === "sol") clip = { x: 0, y: 0, width: dg, height: yukseklik };
    else if (bolge === "orta") clip = { x: dg, y: 0, width: dg, height: yukseklik };
    else if (bolge === "sag") clip = { x: 2 * dg, y: 0, width: dg, height: yukseklik };
    else if (bolge) clip = bolge;
    await sayfa.screenshot({ path: dosya, clip });
    return dosya;
  }

  /** Figürün ekrandaki kutusu (bütün tuvalde piksel): yakın plan kırpımı için. Görünmüyorsa null. */
  async function figurKutusu(id, pay = 0.6) {
    return sayfa.evaluate(
      ({ id, pay, genislik, yukseklik }) => {
        const d = window.duvar;
        const T = d.THREE;
        const a = d.sahne3b.figurAktifBul(id);
        if (!a) return null;
        const s3 = d.sahne3b;
        const kameralar = s3.kameralar ?? s3.duvarKameralari ?? null;
        if (!kameralar) return { hata: "kamera yok", anahtarlar: Object.keys(s3).slice(0, 80) };
        const kutu = new T.Box3().setFromObject(a.nesne);
        const koseler = [];
        for (const x of [kutu.min.x, kutu.max.x]) for (const y of [kutu.min.y, kutu.max.y]) for (const z of [kutu.min.z, kutu.max.z]) koseler.push(new T.Vector3(x, y, z));
        const dg = genislik / kameralar.length;
        let en = null;
        kameralar.forEach((k, i) => {
          let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, ok = true;
          for (const c of koseler) {
            const p = c.clone().project(k);
            if (p.z > 1 || p.z < -1) ok = false;
            x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
          }
          if (!ok || x1 < -1 || x0 > 1) return;
          const mx = (x0 + x1) / 2;
          if (!en || Math.abs(mx) < Math.abs(en.mx)) en = { mx, i, x0, x1, y0, y1 };
        });
        if (!en) return null;
        const px = (v) => en.i * dg + ((v + 1) / 2) * dg;
        const py = (v) => ((1 - v) / 2) * yukseklik;
        let x = px(en.x0), w = px(en.x1) - x, y = py(en.y1), h = py(en.y0) - y;
        x -= w * pay; y -= h * pay * 0.5; w *= 1 + 2 * pay; h *= 1 + pay;
        const m = Math.max(w, h * 0.8, 160);
        x -= (m - w) / 2; w = m;
        x = Math.max(0, Math.min(genislik - w, x)); y = Math.max(0, y); h = Math.min(yukseklik - y, h);
        return { x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) };
      },
      { id, pay, genislik, yukseklik },
    );
  }

  /**
   * Figür kemiklerini `sure` sn boyunca kare kare örnekler. Dönen: { kareler: [{t, kok:[x,y,z], ry, kalca, bas, solAyak,
   * sagAyak, sagEl, solEl, silah, zemin, eylemler:[{ad, agirlik}]}], kemikAdlari }.
   */
  async function ornekle(id, sure = 3) {
    return sayfa.evaluate(
      ({ id, sure }) =>
        new Promise((coz) => {
          const d = window.duvar;
          const T = d.THREE;
          const a = d.sahne3b.figurAktifBul(id);
          if (!a) return coz({ hata: "figür yok" });
          const bul = (re) => {
            let b = null;
            a.icNesne.traverse((o) => {
              if (!b && o.isBone && re.test(o.name)) b = o;
            });
            return b;
          };
          const k = {
            kalca: bul(/hips|pelvis/i),
            bas: bul(/head$/i) ?? bul(/head/i),
            solAyak: bul(/left.?foot$|foot[._]?l$/i),
            sagAyak: bul(/right.?foot$|foot[._]?r$/i),
            solUc: bul(/left.?toe.?base$|lefttoe/i),
            sagUc: bul(/right.?toe.?base$|righttoe/i),
            sagEl: bul(/right.?hand$|hand[._]?r$/i),
            solEl: bul(/left.?hand$|hand[._]?l$/i),
          };
          const v = new T.Vector3();
          const dp = (o) => (o ? o.getWorldPosition(v).toArray().map((n) => +n.toFixed(4)) : null);
          const kareler = [];
          let bas = null;
          const adim = (damga) => {
            if (bas === null) bas = damga;
            const t = (damga - bas) / 1000;
            const p = a.nesne.position;
            const eylemler = [];
            const kr = a.karistirici;
            if (kr && kr._actions) for (const e of kr._actions) if (e.isRunning() && e.getEffectiveWeight() > 0.01) eylemler.push({ ad: e.getClip().name, agirlik: +e.getEffectiveWeight().toFixed(2), zaman: +e.time.toFixed(3) });
            kareler.push({
              t: +t.toFixed(4),
              kok: [p.x, p.y, p.z].map((n) => +n.toFixed(4)),
              ry: +a.nesne.rotation.y.toFixed(4),
              kalca: dp(k.kalca), bas: dp(k.bas), solAyak: dp(k.solAyak), sagAyak: dp(k.sagAyak), solUc: dp(k.solUc), sagUc: dp(k.sagUc), sagEl: dp(k.sagEl), solEl: dp(k.solEl),
              silah: a.silahNesne ? dp(a.silahNesne) : null,
              poz: a.poz, asama: a.asama, atesPozu: a.atesPozu, yuruyus: !!a.yuruyus, gecis: !!a.gecis,
              eylemler,
            });
            if (t < sure && d.sahne3b.figurAktifBul(id)) requestAnimationFrame(adim);
            else coz({ kareler, kemikAdlari: Object.fromEntries(Object.entries(k).map(([r, o]) => [r, o ? o.name : null])) });
          };
          requestAnimationFrame(adim);
        }),
      { id, sure },
    );
  }

  /** Kare hızı: `sure` sn boyunca rAF sayar (ekran çekimi yapılmazken çağır). Dönen: { fps, enUzunMs }. */
  const fps = (sure = 3) =>
    sayfa.evaluate(
      (sure) =>
        new Promise((coz) => {
          let n = 0, bas = null, son = null, enUzun = 0;
          const adim = (d) => {
            if (bas === null) bas = d;
            else { n++; enUzun = Math.max(enUzun, d - son); }
            son = d;
            if (d - bas < sure * 1000) requestAnimationFrame(adim);
            else coz({ fps: +((n * 1000) / (d - bas)).toFixed(1), enUzunMs: +enUzun.toFixed(0) });
          };
          requestAnimationFrame(adim);
        }),
      sure,
    );
  const figurler = () => sayfa.evaluate(() => window.duvar.figurler());
  const js = (ifade, arg) => sayfa.evaluate(ifade, arg);
  async function figur(komut) {
    const y = await api("POST", "/figur", komut);
    return y.komut?.id ?? komut.id;
  }
  async function figurBekle(id, enCok = 20000) {
    const bas = Date.now();
    while (Date.now() - bas < enCok) {
      if (await sayfa.evaluate((id) => !!window.duvar.sahne3b.figurAktifBul(id), id)) return true;
      await bekle(250);
    }
    return false;
  }
  async function kapat() {
    await tarayici.close();
  }
  return { api, sayfa, cek, fps, figurKutusu, ornekle, figurler, figur, figurBekle, hazirBekle, js, konsol, kapat, genislik, yukseklik, klasor };
}

const uzak = (a, b) => (a && b ? Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) : 0);

/**
 * Örnekleme çözümlemesi: kemik sıçraması (kök hareketi düşülmüş kare-arası hız, m/sn), yerdeki ayağın kayması,
 * ayak–zemin farkı, silah–el uzaklığı oynaması, eylem değişim anları.
 */
export function cozumle(o) {
  if (!o || o.hata) return o;
  const k = o.kareler;
  const s = { kare: k.length, sure: k.at(-1)?.t ?? 0, kemikAdlari: o.kemikAdlari };
  const hizlar = { kalca: [], bas: [], sagEl: [], solEl: [], solAyak: [], sagAyak: [] };
  const sicramalar = [];
  let kokYol = 0;
  for (let i = 1; i < k.length; i++) {
    const dt = k[i].t - k[i - 1].t;
    if (dt < 0.008) continue;
    const kokD = [k[i].kok[0] - k[i - 1].kok[0], k[i].kok[1] - k[i - 1].kok[1], k[i].kok[2] - k[i - 1].kok[2]];
    kokYol += Math.hypot(kokD[0], kokD[2]);
    for (const ad of Object.keys(hizlar)) {
      const a = k[i - 1][ad], b = k[i][ad];
      if (!a || !b) continue;
      const h = Math.hypot(b[0] - a[0] - kokD[0], b[1] - a[1] - kokD[1], b[2] - a[2] - kokD[2]) / dt;
      hizlar[ad].push(h);
      const esik = ad === "kalca" ? 2.5 : ad === "bas" ? 4 : 9;
      if (h > esik) sicramalar.push({ t: k[i].t, kemik: ad, hiz: +h.toFixed(1), dt: +dt.toFixed(3) });
    }
  }
  s.kokHizi = +(kokYol / Math.max(0.001, s.sure)).toFixed(2);
  s.enYuksekHiz = Object.fromEntries(Object.entries(hizlar).map(([a, h]) => [a, h.length ? +Math.max(...h).toFixed(1) : null]));
  s.sicramalar = sicramalar.slice(0, 12);
  s.sicramaSayisi = sicramalar.length;
  // Ayak kayması: ayak yerdeyken (en alçak konumuna 3 cm) dünyadaki yatay hızı
  for (const ad of ["solAyak", "sagAyak"]) {
    const ys = k.map((x) => x[ad]?.[1]).filter((y) => y !== undefined);
    if (!ys.length) continue;
    const enAlt = Math.min(...ys);
    let kayma = 0, sureYerde = 0;
    for (let i = 1; i < k.length; i++) {
      const a = k[i - 1][ad], b = k[i][ad];
      if (!a || !b) continue;
      if (a[1] < enAlt + 0.03 && b[1] < enAlt + 0.03) {
        kayma += Math.hypot(b[0] - a[0], b[2] - a[2]);
        sureYerde += k[i].t - k[i - 1].t;
      }
    }
    s[ad + "Kayma"] = { mSn: sureYerde > 0 ? +(kayma / sureYerde).toFixed(2) : null, yerdeSn: +sureYerde.toFixed(2), enAltKokeGore: +(enAlt - Math.min(...k.map((x) => x.kok[1]))).toFixed(3) };
  }
  // Klibin doğal hızı: yerdeki (en alçak 2 cm) ayağın KÖKE GÖRE yatay hızı; kök hızından farkı ayak kaymasıdır
  const dogal = [];
  for (const ad of ["solAyak", "sagAyak"]) {
    const ys = k.map((x) => (x[ad] ? x[ad][1] - x.kok[1] : null)).filter((y) => y !== null);
    if (!ys.length) continue;
    const enAlt = Math.min(...ys);
    for (let i = 1; i < k.length; i++) {
      const a = k[i - 1], b = k[i];
      const dt = b.t - a.t;
      if (dt < 0.008 || !a[ad] || !b[ad]) continue;
      if (a[ad][1] - a.kok[1] < enAlt + 0.02 && b[ad][1] - b.kok[1] < enAlt + 0.02) dogal.push(Math.hypot(b[ad][0] - b.kok[0] - (a[ad][0] - a.kok[0]), b[ad][2] - b.kok[2] - (a[ad][2] - a.kok[2])) / dt);
    }
  }
  if (dogal.length > 5) {
    dogal.sort((a, b) => a - b);
    s.klipDogalHizi = +dogal[Math.floor(dogal.length / 2)].toFixed(2);
  }
  // Silah–sağ el uzaklığı ve sol el–silah uzaklığı
  const se = k.filter((x) => x.silah && x.sagEl).map((x) => uzak(x.silah, x.sagEl));
  if (se.length) s.silahSagEl = { enAz: +Math.min(...se).toFixed(3), enCok: +Math.max(...se).toFixed(3) };
  const sl = k.filter((x) => x.silah && x.solEl).map((x) => uzak(x.silah, x.solEl));
  if (sl.length) s.silahSolEl = { enAz: +Math.min(...sl).toFixed(3), enCok: +Math.max(...sl).toFixed(3), ort: +(sl.reduce((a, b) => a + b, 0) / sl.length).toFixed(3) };
  // Kalça yüksekliği (köke göre) aralığı
  const ky = k.filter((x) => x.kalca).map((x) => x.kalca[1] - x.kok[1]);
  if (ky.length) s.kalcaY = { enAz: +Math.min(...ky).toFixed(2), enCok: +Math.max(...ky).toFixed(2) };
  // Eylem zaman çizgisi: baskın eylem değiştikçe
  const cizgi = [];
  let son = "";
  for (const x of k) {
    const ad = x.eylemler.map((e) => `${e.ad}:${e.agirlik}`).join("+") + ` [${x.poz}/${x.asama}${x.atesPozu ? "/ateş" : ""}${x.yuruyus ? "/yürüyüş" : ""}${x.gecis ? "/geçiş" : ""}]`;
    const kisa = x.eylemler.map((e) => e.ad).join("+") + x.poz + x.asama + x.atesPozu + x.yuruyus + x.gecis;
    if (kisa !== son) {
      cizgi.push(`${x.t.toFixed(2)}s ${ad}`);
      son = kisa;
    }
  }
  s.eylemCizgisi = cizgi.slice(0, 30);
  // Dönüş hızı (derece/sn) tepe
  let donus = 0;
  for (let i = 1; i < k.length; i++) {
    const dt = k[i].t - k[i - 1].t;
    let f = k[i].ry - k[i - 1].ry;
    f = Math.atan2(Math.sin(f), Math.cos(f));
    if (dt > 0) donus = Math.max(donus, Math.abs(f) / dt);
  }
  s.enHizliDonusDerSn = +((donus * 180) / Math.PI).toFixed(0);
  return s;
}
