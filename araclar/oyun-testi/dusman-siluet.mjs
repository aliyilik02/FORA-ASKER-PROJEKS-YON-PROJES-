// Düşman silueti denetimi (Playwright). Üç kip:
//   (varsayılan)  siluetli mevzilerin hepsinde figür ayakta: tam tuval + duvarlar + mevzi başına yakın plan kırpım
//   --catisma     çatışmayı oynatır: atıcıların doğrulma/ateş/çökme döngüsü, aynı anda atıcı sayısı, kare hızı ve en uzun kare
//   --an          bir salvoyu kare kare ilerletir (sayfa saati test denetiminde): doğrulma, namlu parıltısı (80 ms) ve
//                 izlerin tam karesini çeker
//
//   KOPRU=http://127.0.0.1:4100 node araclar/oyun-testi/dusman-siluet.mjs [bolge] [--fov 40] [--mevziler dosya.json]
//        [--mevsim yaz] [--saat 12] [--catisma | --an] [--yon 0] [--siddet 0.6] [--sure 25] [--izli] [--ad on_ek]
//        [--genislik 7680] [--arazi <azimut>] [--patlama]
//
// --mevziler: manifest yerine bu JSON'daki mevziler denenir ([{ad,x,y,z,siluet}]; mevzi bulucunun çıktısı).
// --arazi <azimut>: o yönün sırt gerisi arazi mevzileri de hesaplanıp gösterilir (açık arazi bölgeleri).
// --izli: çatışma yerine izli mermi akışı (orta duvar). --patlama: 12. sn'de düşman yönüne patlama (susturma denetimi).
// Görüntüler araclar/_goruntu/dusman/ altına. Kullanıcının oynatıcısı açıkken AYRI köprüde koş (PORT=4100).
import fs from "node:fs";
import { baslat, bekle } from "./cekirdek.mjs";

const arg = (ad, varsayilan) => {
  const i = process.argv.indexOf(`--${ad}`);
  return i > 0 && process.argv[i + 1] !== undefined && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : varsayilan;
};
const bayrak = (ad) => process.argv.includes(`--${ad}`);
const bolge = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "meskun_mahal";
const fov = arg("fov", "");
const onEk = arg("ad", `${bolge}${fov ? `_fov${fov}` : ""}`);
const mevziDosyasi = arg("mevziler", "");
const yon = Number(arg("yon", "0"));
const siddet = Number(arg("siddet", "0.6"));
const an = bayrak("an");

const t = await baslat({ genislik: Number(arg("genislik", "3840")), cikti: "araclar/_goruntu/dusman", sorgu: { ...(fov ? { fov } : {}), gorsel: arg("gorsel", "film"), dusman: arg("dusman", "acik") }, saat: an });

/** Atıcıların namlu ucunun ekrandaki yeri çevresinde kırpım kutuları (görüş dışındaysa null). */
const kutular = (durum, buyutme = 1) =>
  t.js(
    ({ durum, genislik, yukseklik, buyutme }) => {
      const d = window.duvar;
      const T = d.THREE;
      const kameralar = d.sahne3b.kameralar;
      const dg = genislik / kameralar.length;
      return durum.map((a) => {
        const p = new T.Vector3(a.namlu[0], a.namlu[1], a.namlu[2]);
        let en = null;
        kameralar.forEach((k, i) => {
          const q = p.clone().project(k);
          if (q.z < -1 || q.z > 1 || Math.abs(q.x) > 1.05 || Math.abs(q.y) > 1.05) return;
          if (!en || Math.abs(q.x) < Math.abs(en.q.x)) en = { q, i };
        });
        if (!en) return null;
        const x = en.i * dg + ((en.q.x + 1) / 2) * dg;
        const y = ((1 - en.q.y) / 2) * yukseklik;
        const mesafe = Math.hypot(a.namlu[0], a.namlu[2]);
        // Odak uzaklığı (px) = (dg / 2) × projeksiyon[0]; kırpım figürün ~5 katı genişlik, 200–520 px
        const odak = (dg / 2) * kameralar[en.i].projectionMatrix.elements[0];
        const yari = Math.max(100, Math.min(260, (odak * 2.2) / mesafe)) * buyutme;
        const w = Math.round(yari * 2);
        const h = Math.round(yari * 1.5);
        return { x: Math.max(0, Math.min(genislik - w, Math.round(x - yari))), y: Math.max(0, Math.min(yukseklik - h, Math.round(y - h * 0.55))), width: w, height: Math.min(h, yukseklik) };
      });
    },
    { durum, genislik: t.genislik, yukseklik: t.yukseklik, buyutme },
  );

try {
  await t.api("POST", "/sahne/sifirla", { kaynak: "panel" });
  await t.api("PATCH", "/ortam", { mevsim: arg("mevsim", "yaz"), saat: Number(arg("saat", "12")), yagis: "yok", sis: 0, bulut: 0.2, simsek: false });
  await t.api("PUT", "/bolge", { bolge });
  await t.hazirBekle();
  await bekle(5000);
  if (mevziDosyasi) {
    const mevziler = JSON.parse(fs.readFileSync(mevziDosyasi, "utf8"));
    await t.js((m) => window.duvar.dusman.mevzileriAyarla(m), mevziler);
  }
  // Model yüklenene dek bekle
  for (let i = 0; i < 60; i++) {
    if (await t.js(() => window.duvar.dusman.hazir)) break;
    await bekle(250);
  }
  if (arg("arazi", "") !== "") console.log("arazi mevzisi:", await t.js((az) => window.duvar.dusman.araziMevzileriHazirla(az, 45), Number(arg("arazi", "0"))));
  console.log("özet:", JSON.stringify(await t.js(() => window.duvar.dusman.ozet())));

  const atesBaslat = () =>
    bayrak("izli")
      ? t.api("PATCH", "/izli-mermi", { aktif: true, cikisNoktasi: 1, yon: 0, siklik: Number(arg("siklik", "3")) })
      : t.api("PATCH", "/catisma", { aktif: true, siddet, yon, dostAtes: true });
  const atesDurdur = () => (bayrak("izli") ? t.api("PATCH", "/izli-mermi", { aktif: false }) : t.api("PATCH", "/catisma", { aktif: false })).catch(() => undefined);

  if (an) {
    // --- Kare kare: bir salvonun doğrulma, ateş ve iz anları ---
    await atesBaslat();
    let durum = [];
    const bas = Date.now();
    while (Date.now() - bas < 20000) {
      durum = await t.js(() => window.duvar.dusman.durum());
      if (durum.some((x) => x.siluet && x.yukselme > 0.02 && x.yukselme < 0.6)) break;
      await bekle(30);
    }
    const simdi = await t.js(() => Date.now());
    await t.sayfa.clock.pauseAt(simdi + 10);
    const atici = durum.find((x) => x.siluet && x.yukselme > 0.02) ?? durum[0];
    if (!atici) throw new Error("20 sn'de doğrulan atıcı olmadı");
    console.log(`atıcı: mevzi ${atici.mevzi} ${atici.ad} (${Math.hypot(atici.namlu[0], atici.namlu[2]).toFixed(0)} m)`);
    const [kutu] = await kutular([atici], 1.6);
    let cekilen = { dogrulma: false, ates: 0, iz: false };
    for (let k = 0; k < 150; k++) {
      await t.sayfa.clock.runFor(17);
      const d = (await t.js(() => window.duvar.dusman.durum())).find((x) => x.no === atici.no);
      const iz = await t.js(() => window.duvar.sahne3b.izSayisi);
      if (!d) break;
      if (!cekilen.dogrulma && d.yukselme > 0.4) {
        cekilen.dogrulma = true;
        if (kutu) await t.cek(`${onEk}_an_1_dogrulma`, kutu);
      }
      if (d.parlama > 0.7 && cekilen.ates < 2) {
        cekilen.ates++;
        if (kutu) await t.cek(`${onEk}_an_2_ates_${cekilen.ates}`, kutu);
        await t.cek(`${onEk}_an_2_ates_${cekilen.ates}_tam`);
      }
      if (!cekilen.iz && cekilen.ates >= 1 && iz >= 3 && d.parlama < 0.3) {
        cekilen.iz = true;
        await t.cek(`${onEk}_an_3_izler`);
      }
      if (cekilen.ates >= 2 && cekilen.iz && d.yukselme < 0.05) break;
    }
    console.log("çekilen:", JSON.stringify(cekilen));
    await t.sayfa.clock.resume();
    await atesDurdur();
  } else if (!bayrak("catisma")) {
    // --- Tanılama: bütün siluetli mevzilerde figür ayakta ---
    const n = await t.js(() => window.duvar.dusman.tanilama(true));
    await bekle(1200);
    const durum = await t.js(() => window.duvar.dusman.durum());
    console.log(`${n} siluetli mevzi gösteriliyor`);
    await t.cek(`${onEk}_hepsi`);
    for (const d of ["sol", "orta", "sag"]) await t.cek(`${onEk}_${d}`, d);
    const k = await kutular(durum);
    for (let i = 0; i < durum.length; i++) {
      const a = durum[i];
      const az = ((Math.atan2(a.namlu[0], -a.namlu[2]) * 180) / Math.PI).toFixed(0);
      console.log(`  ${String(a.mevzi).padStart(2)} ${a.ad.padEnd(28)} az ${az.padStart(4)}  ${Math.hypot(a.namlu[0], a.namlu[2]).toFixed(0).padStart(3)} m  örtü ${a.ortuY}  ${a.siluet ? "" : "(figür yok)"}${k[i] ? "" : " (görüş dışı)"}`);
      if (k[i] && !bayrak("kirpimsiz")) await t.cek(`${onEk}_m${String(a.mevzi).padStart(2, "0")}`, k[i]);
    }
  } else {
    // --- Çatışma: döngü ve kare süresi (bütün süre boyunca en uzun kare: ilk doğrulmadaki derleme takılması dahil) ---
    await t.js(() => {
      const o = (window.__kare = { enUzun: 0, uzun: 0, n: 0, son: null });
      const adim = (d) => {
        if (o.son !== null) {
          const f = d - o.son;
          o.n++;
          if (f > o.enUzun) o.enUzun = f;
          if (f > 50) o.uzun++;
        }
        o.son = d;
        requestAnimationFrame(adim);
      };
      requestAnimationFrame(adim);
    });
    await atesBaslat();
    const ornekler = [];
    const sure = Number(arg("sure", "25")) * 1000;
    const bas = Date.now();
    let patladi = false;
    while (Date.now() - bas < sure) {
      const d = await t.js(() => window.duvar.dusman.durum());
      ornekler.push({ t: (Date.now() - bas) / 1000, d });
      if (bayrak("patlama") && !patladi && Date.now() - bas > 12000) {
        patladi = true;
        // Eğitmenin patlaması düşman yönüne: yakınındaki mevziler susmalı
        await t.api("POST", "/efekt", { tur: "patlama", yon, siddet: 1 }).catch((h) => console.log("patlama isteği:", h.message));
        await bekle(600);
        console.log("patlamadan sonra susturulan mevziler:", JSON.stringify(await t.js(() => window.duvar.dusman.ozet().etkisiz)));
      }
      await bekle(150);
    }
    const kare = await t.js(() => window.__kare);
    const hiz = await t.fps(4);
    await atesDurdur();
    const mevziler = new Map();
    for (const o of ornekler) for (const x of o.d) mevziler.set(x.mevzi, (mevziler.get(x.mevzi) ?? 0) + (x.yukselme > 0.5 ? 0.15 : 0));
    console.log("ayakta kalınan süre (sn) mevzi başına:", JSON.stringify([...mevziler.entries()].map(([m, s]) => [m, +s.toFixed(1)])));
    console.log("aynı anda en çok atıcı:", Math.max(0, ...ornekler.map((o) => o.d.length)), "· ayakta en çok:", Math.max(0, ...ornekler.map((o) => o.d.filter((x) => x.yukselme > 0.5).length)), "· siluetli:", ornekler.some((o) => o.d.some((x) => x.siluet)));
    console.log(`kare: ${kare.n} kare, en uzun ${kare.enUzun.toFixed(0)} ms, 50 ms üstü ${kare.uzun}; son 4 sn ${JSON.stringify(hiz)}`);
  }
  if (t.konsol.size) console.log("konsol:", [...t.konsol.entries()].slice(0, 8));
} finally {
  await t.kapat();
}
