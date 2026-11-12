// Oynayarak test: çatışmada askerlerin mevzi değiştirmesi (figurler3b sicramayiGuncelle). Askerleri çağırır, çatışmayı
// başlatır, konumları kare kare örnekler: kaç sıçrama oldu, aynı anda birden çok asker koştu mu, koşarken sabit engelin
// (kum torbası, bariyer, bina) ya da başka askerin içinden geçti mi, vardığı yerde ateşe döndü mü.
//
//   KOPRU=http://127.0.0.1:4100 node araclar/oyun-testi/mevzi-degistirme.mjs [bolge] [--sure 75] [--asker 4] [--yon 0]
//
// Çıktı: araclar/_goruntu/oyun/md_<bolge>_*.png (koşu anları) ve stdout'ta ölçüm. Çıkış kodu: hata sayısı.
import { baslat, bekle, cozumle } from "./cekirdek.mjs";

const arg = (ad, varsayilan) => {
  const i = process.argv.indexOf(`--${ad}`);
  return i > 0 && process.argv[i + 1] !== undefined && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : varsayilan;
};
const bolge = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "meskun_mahal";
const sure = Number(arg("sure", "75"));
const askerSayisi = Number(arg("asker", "4"));
const yon = Number(arg("yon", "0"));

const c = await baslat({ sorgu: { hareket: "acik" } });
let hata = 0;
const kosul = (ad, tamam) => {
  console.log(`  ${tamam ? "✓" : "✗"} ${ad}`);
  if (!tamam) hata++;
};
try {
  await c.api("POST", "/sahne/sifirla", { kaynak: "panel" });
  await c.api("PUT", "/oda", { oda: "oda1" }).catch(() => undefined);
  await c.api("PATCH", "/ortam", { mevsim: "yaz", saat: 12, yagis: "yok", sis: 0, bulut: 0.2, simsek: false });
  await c.api("PATCH", "/catisma", { aktif: false, yon, siddet: 0.7, dostAtes: true, siperAl: true });
  await c.api("PUT", "/bolge", { bolge });
  console.log("hazır:", await c.hazirBekle());
  await bekle(4000);
  const kadro = [["m1", "komando_nisan", -24], ["m2", "komando_bere_nisan", 14], ["m3", "komando_nisan", 36], ["m4", "komando_agir_bekleyen", -46], ["m5", "telsizci_bekleyen", 2], ["m6", "komando_kis_nisan", -8]].slice(0, askerSayisi);
  for (const [id, klip, azimut] of kadro) await c.figur({ islem: "oynat", id, klip, azimut });
  for (const [id] of kadro) await c.figurBekle(id);
  await bekle(1500);

  // Sayfada kare kare örnekleyici: konum, koşu, engel içinde mi, en yakın başka asker
  await c.js(() => {
    const d = window.duvar;
    const f = d.sahne3b.figurler;
    const o = (window.__md = { kareler: 0, ornek: [], ayniAnda: 0, engelde: {}, yakin: {}, enHizli: 0, dur: false });
    let son = performance.now();
    const adim = (t) => {
      const dt = (t - son) / 1000;
      son = t;
      o.kareler++;
      const kosanlar = f.aktifler.filter((a) => a.sicrama.kosuyor);
      o.ayniAnda = Math.max(o.ayniAnda, kosanlar.length);
      for (const a of kosanlar) {
        const p = a.nesne.position;
        if (f.engel(p)) {
          o.engelde[a.id] = (o.engelde[a.id] ?? 0) + 1;
          (o.engelNokta ??= []).push([a.id, +p.x.toFixed(2), +p.z.toFixed(2), a.yuruyus ? +Math.hypot(a.yuruyus.hedef.x - p.x, a.yuruyus.hedef.z - p.z).toFixed(1) : -1]);
        }
        for (const b of f.aktifler) {
          if (b === a) continue;
          const u = Math.hypot(b.nesne.position.x - p.x, b.nesne.position.z - p.z);
          o.yakin[a.id] = Math.min(o.yakin[a.id] ?? 99, u);
        }
        // Koşu boyunca ortalama hız (kare arası anlık hız, ekran çekimi takılmalarında yanıltır)
        if (a.__onceki) {
          a.__kosu.yol += Math.hypot(p.x - a.__onceki.x, p.z - a.__onceki.z);
          a.__kosu.sure += dt;
        } else a.__kosu = { yol: 0, sure: 0 };
        a.__onceki = { x: p.x, z: p.z };
      }
      for (const a of f.aktifler) {
        if (a.sicrama.kosuyor || !a.__onceki) continue;
        if (a.__kosu.sure > 0.4) o.enHizli = Math.max(o.enHizli, a.__kosu.yol / a.__kosu.sure);
        a.__onceki = null;
      }
      if (o.kareler % 15 === 0) o.ornek.push(f.aktifler.map((a) => ({ id: a.id, x: +a.nesne.position.x.toFixed(2), z: +a.nesne.position.z.toFixed(2), kosu: a.sicrama.kosuyor, poz: a.poz, ates: a.atesPozu })));
      if (!o.dur) requestAnimationFrame(adim);
    };
    requestAnimationFrame(adim);
  });

  // Kemik örneklemesi (animasyon sıçraması: koşuya geçiş ve varış anları dahil)
  const olcum = kadro.map(([id]) => c.ornekle(id, Math.min(sure - 4, 60)));
  await bekle(200);
  await c.api("PATCH", "/catisma", { aktif: true });
  const bas = Date.now();
  let cekim = 0;
  while (Date.now() - bas < sure * 1000) {
    await bekle(120);
    const kosan = await c.js(() => window.duvar.sahne3b.figurler.aktifler.filter((a) => a.sicrama.kosuyor).map((a) => a.id));
    if (kosan.length && cekim < 5) {
      await bekle(350); // koşunun ortası
      const kutu = await c.figurKutusu(kosan[0], 0.9);
      await c.cek(`md_${bolge}_${++cekim}`);
      if (kutu && !kutu.hata) await c.cek(`md_${bolge}_${cekim}_yakin`, kutu);
      await bekle(2500);
    }
  }
  const o = await c.js(() => {
    window.__md.dur = true;
    return window.__md;
  });
  await c.api("PATCH", "/catisma", { aktif: false });

  // Sıçramalar: figür başına koşu dönemleri (örneklerde kosu=true dizileri) ve kat edilen yol
  const sicramalar = [];
  for (const [id] of kadro) {
    let bas = null;
    for (const kare of o.ornek) {
      const f = kare.find((x) => x.id === id);
      if (!f) continue;
      if (f.kosu && !bas) bas = f;
      if (!f.kosu && bas) {
        sicramalar.push({ id, yol: +Math.hypot(f.x - bas.x, f.z - bas.z).toFixed(1), uzaklik: +Math.hypot(f.x, f.z).toFixed(1) });
        bas = null;
      }
    }
  }
  const son = o.ornek.at(-1) ?? [];
  console.log(`\n== ${bolge}: ${sure} sn çatışma, ${kadro.length} asker`);
  console.log("  sıçramalar:", sicramalar.map((s) => `${s.id} ${s.yol} m (izleyiciye ${s.uzaklik} m)`).join(" · ") || "yok");
  console.log("  en hızlı koşu (ortalama):", o.enHizli.toFixed(2), "m/sn · aynı anda koşan en çok:", o.ayniAnda, "· engel içinde kare:", JSON.stringify(o.engelde), "· koşarken en yakın asker (m):", JSON.stringify(Object.fromEntries(Object.entries(o.yakin).map(([k, v]) => [k, +v.toFixed(2)]))));
  if (o.engelNokta?.length) console.log("  engel içindeki konumlar [id, x, z, hedefe m]:", JSON.stringify(o.engelNokta.filter((_, i) => i % 6 === 0).slice(0, 24)));
  console.log("  son durum:", son.map((f) => `${f.id}:${f.poz}${f.ates ? "*" : ""}`).join(" "));
  for (const [i, p] of olcum.entries()) {
    const z = cozumle(await p);
    console.log(`  ${kadro[i][0]} animasyon sıçraması ${z.sicramaSayisi} · kök hızı ${z.kokHizi} · en hızlı dönüş ${z.enHizliDonusDerSn}°/sn`);
    if (z.sicramaSayisi > 0) {
      console.log("    ", JSON.stringify(z.sicramalar.slice(0, 4)));
      // Sıçrama anlarının ±2 sn çevresindeki eylem değişimleri
      const yakin = z.eylemCizgisi.filter((e) => z.sicramalar.some((j) => Math.abs(parseFloat(e) - j.t) < 2));
      console.log("    ", yakin.join(" | "));
    }
    // Diz çökme geçişinin başındaki sol el düzeltmesi (≈ 9–10 m/sn, eşiğin hemen üstü) bu işten bağımsız, eskiden beri var:
    // yalnız kalça/baş sıçraması ve belirgin el sıçraması (> 12 m/sn) hata sayılır
    kosul(`${kadro[i][0]} belirgin animasyon sıçraması yok`, z.sicramalar.every((j) => j.kemik !== "kalca" && j.kemik !== "bas" && j.hiz <= 12));
  }
  kosul("en az iki sıçrama oldu", sicramalar.length >= 2);
  kosul("aynı anda en çok bir asker koştu", o.ayniAnda <= 1);
  kosul("koşu hızı klibin doğal hızında (ortalama ≤ 3,4 m/sn)", o.enHizli <= 3.45);
  kosul("koşarken sabit engelin içinden geçmedi (≤ 6 kare)", Object.values(o.engelde).every((n) => n <= 6));
  kosul("koşarken başka askerin içinden geçmedi (≥ 0,5 m)", Object.values(o.yakin).every((u) => u >= 0.5));
  kosul("sıçramalar ≤ 9,5 m (örnekleme koşunun başını kaçırabilir: alt sınır 1,2 m)", sicramalar.every((s) => s.yol >= 1.2 && s.yol <= 9.5));
  kosul("askerler izleyiciden 3,5–8 m bandında kaldı", son.every((f) => Math.hypot(f.x, f.z) >= 3.4 && Math.hypot(f.x, f.z) <= 8.2));
  const fps = await c.fps(3);
  console.log("  kare hızı:", JSON.stringify(fps));
  if (c.konsol.size) console.log("konsol:", [...c.konsol.entries()].slice(0, 8));
} finally {
  await c.kapat();
}
process.exit(hata);
