// İlk patlama takılması: taze sayfada ilk patlamanın en uzun karesi, derlenen program sayısı ve sonraki patlamalarla
// karşılaştırma. Ayrı köprüde koş:
//   KOPRU=http://127.0.0.1:4100 node araclar/oyun-testi/ilk-patlama.mjs [bolge] [--efekt patlama,havan,yangin]
import { baslat, bekle } from "./cekirdek.mjs";
const bolge = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "meskun_mahal";
const i = process.argv.indexOf("--efekt");
const efektler = (i > 0 ? process.argv[i + 1] : "patlama,patlama,patlama").split(",");
const c = await baslat({ sorgu: { gorsel: "film" }, cikti: "araclar/_goruntu/patlama" });
const kareleriBaslat = () => c.js(() => {
  const k = (window.__kare = { son: performance.now(), enUzun: 0, liste: [] });
  const dongu = (t) => {
    const d = t - k.son;
    k.son = t;
    if (d > k.enUzun) k.enUzun = d;
    if (d > 40) k.liste.push(Math.round(d));
    k.id = requestAnimationFrame(dongu);
  };
  k.id = requestAnimationFrame(dongu);
});
const kareleriAl = () => c.js(() => {
  const k = window.__kare;
  cancelAnimationFrame(k.id);
  const r = window.duvar.sahne3b.renderer ?? window.duvar.renderer;
  return { enUzun: Math.round(k.enUzun), uzunlar: k.liste, program: r?.info?.programs?.length ?? -1, doku: r?.info?.memory?.textures ?? -1, geometri: r?.info?.memory?.geometries ?? -1 };
});
try {
  await c.api("POST", "/sahne/sifirla", {});
  await c.api("PATCH", "/ortam", { mevsim: "yaz", saat: 12, yagis: "yok", sis: 0.03, bulut: 0.4, simsek: false });
  await c.api("PUT", "/bolge", { bolge });
  await c.hazirBekle();
  await bekle(6000);
  await kareleriBaslat();
  await bekle(2500);
  console.log("boşta      ", JSON.stringify(await kareleriAl()));
  let n = 0;
  for (const tur of efektler) {
    n++;
    await kareleriBaslat();
    await c.api("POST", "/efekt", { tur, siddet: 1, yon: n % 2 ? 10 : 350 });
    await bekle(4000);
    console.log(`${n}. ${tur.padEnd(8)}`, JSON.stringify(await kareleriAl()));
  }
  if (c.konsol.size) console.log("konsol:", [...c.konsol.entries()].slice(0, 6));
} finally {
  await c.kapat();
}
