// Oynayarak test 2: meskûn mahalde hava (yağmur, sağanak + şimşek, kar/kış, sis), gece + fişek, havan, yangın, toz,
// izli mermi, uzak patlama, Oda 2 helikopter inişi. Her durumda kare hızı ölçülür. Çıktı: araclar/_goruntu/oyun/h_*.png
//   node araclar/oyun-testi/meskun-hava-efekt.mjs
import { baslat, bekle } from "./cekirdek.mjs";

const c = await baslat();
const fpsYaz = async (ad, sure = 3) => console.log(`  fps ${ad}:`, JSON.stringify(await c.fps(sure)));
const kaynak = () => c.js(() => {
  const r = window.duvar.sahne3b.renderer ?? window.duvar.sahne3b.cizici;
  return r ? { cizim: r.info.render.calls, ucgen: r.info.render.triangles, geometri: r.info.memory.geometries, doku: r.info.memory.textures, program: r.info.programs?.length } : Object.keys(window.duvar.sahne3b).slice(0, 60);
});
try {
  await c.api("POST", "/sahne/sifirla", { kaynak: "panel" });
  await c.api("PUT", "/oda", { oda: "oda1" });
  await c.api("PATCH", "/ortam", { mevsim: "yaz", saat: 12, yagis: "yok", sis: 0, bulut: 0.2, simsek: false, ruzgarSiddeti: 0.5 });
  await c.api("PUT", "/bolge", { bolge: "meskun_mahal" });
  console.log("hazır:", await c.hazirBekle());
  await bekle(4000);
  await fpsYaz("boş yaz gündüz");
  console.log("  kaynak:", JSON.stringify(await kaynak()));
  for (const [id, klip, azimut] of [["a1", "komando_bekleyen", -15], ["a2", "komando_bere_bekleyen", 15], ["a3", "telsizci_bekleyen", 40]]) {
    await c.figur({ islem: "oynat", id, klip, azimut });
    await c.figurBekle(id);
  }
  await bekle(1500);

  // Hafif yağmur
  await c.api("PATCH", "/ortam", { yagis: "hafif_yagmur", bulut: 0.7 });
  await bekle(5000);
  await fpsYaz("hafif yağmur");
  await c.cek("h01_hafif_yagmur");
  await c.cek("h01_hafif_yagmur_orta", "orta");

  // Sağanak + şimşek + sis
  await c.api("PATCH", "/ortam", { yagis: "siddetli_yagmur", bulut: 1, sis: 0.35, simsek: true });
  await bekle(5000);
  await fpsYaz("sağanak");
  await c.cek("h02_saganak");
  await c.cek("h02_saganak_orta", "orta");
  await c.api("POST", "/efekt", { tur: "simsek", siddet: 1, yon: 20 });
  await bekle(60);
  await c.cek("h02_simsek_0");
  await bekle(120);
  await c.cek("h02_simsek_1");
  await bekle(400);
  await c.cek("h02_simsek_2");

  // Yoğun sis
  await c.api("PATCH", "/ortam", { yagis: "yok", sis: 0.9, bulut: 0.8, simsek: false });
  await bekle(4000);
  await c.cek("h03_sis");

  // Kış + kar
  await c.api("PATCH", "/ortam", { mevsim: "kis", yagis: "kar", sis: 0.25, bulut: 0.9, saat: 12 });
  console.log("kış hazır:", await c.hazirBekle());
  await bekle(7000);
  await fpsYaz("kış kar");
  await c.cek("h04_kis_kar");
  await c.cek("h04_kis_kar_orta", "orta");
  await c.cek("h04_kis_kar_sol", "sol");
  console.log("konumlar kış:", JSON.stringify(await c.figurler()));

  // Kış patlaması (kar zeminde toz rengi)
  await c.api("POST", "/efekt", { tur: "patlama", siddet: 0.8, yon: 350 });
  await bekle(350);
  await c.cek("h04_kis_patlama_0", "orta");
  await bekle(1200);
  await c.cek("h04_kis_patlama_1", "orta");

  // Yaz, gece, yangın + toz
  await c.api("POST", "/sahne/sifirla", { kaynak: "panel" });
  await c.api("PATCH", "/ortam", { mevsim: "yaz", yagis: "yok", sis: 0, bulut: 0.3, saat: 23 });
  console.log("akşam hazır:", await c.hazirBekle());
  await bekle(5000);
  for (const [id, klip, azimut] of [["a1", "komando_bekleyen", -15], ["a2", "komando_bere_bekleyen", 15]]) {
    await c.figur({ islem: "oynat", id, klip, azimut });
    await c.figurBekle(id);
  }
  await c.api("POST", "/efekt", { tur: "yangin", siddet: 0.9, yon: 335 });
  await c.api("POST", "/efekt", { tur: "yangin", siddet: 0.6, yon: 30 });
  await c.api("POST", "/efekt", { tur: "toz_duman", siddet: 0.8, yon: 10 });
  await bekle(6000);
  await fpsYaz("akşam 2 yangın + toz");
  await c.cek("h05_aksam_yangin");
  await c.cek("h05_aksam_yangin_orta", "orta");
  await bekle(8000);
  await c.cek("h05_aksam_yangin_14sn");

  // Havan: ıslık → patlama
  await c.api("POST", "/efekt", { tur: "havan", siddet: 0.9, yon: 355 });
  await bekle(1000);
  await c.cek("h06_havan_islik", "orta");
  await bekle(700);
  await c.cek("h06_havan_patlama_0", "orta");
  await bekle(200);
  await c.cek("h06_havan_patlama_1", "orta");
  await bekle(1500);
  await c.cek("h06_havan_patlama_2", "orta");

  // Gece + çatışma + izli mermi + fişek
  await c.api("POST", "/efekt", { tur: "yangin_sondur" });
  await c.api("PATCH", "/ortam", { saat: 23, bulut: 0.2 });
  console.log("gece hazır:", await c.hazirBekle());
  await bekle(6000);
  await c.cek("h07_gece");
  await c.api("PATCH", "/catisma", { aktif: true, yon: 0, siddet: 1, dostAtes: true });
  await c.api("PATCH", "/izli-mermi", { aktif: true, yon: 0, siklik: 8, cikisNoktasi: 1 });
  await bekle(4000);
  await fpsYaz("gece çatışma + izli");
  for (let i = 0; i < 4; i++) {
    await c.cek(`h07_gece_catisma_${i}`, "orta");
    await bekle(230);
  }
  await c.cek("h07_gece_catisma");
  await c.api("POST", "/efekt", { tur: "fisek", siddet: 1, yon: 0 });
  await bekle(3500);
  await c.cek("h08_fisek_3sn");
  await bekle(9000);
  await c.cek("h08_fisek_12sn");
  await fpsYaz("gece fişek + çatışma");
  await c.api("POST", "/efekt", { tur: "uzak_patlama", siddet: 0.8, yon: 320, mesafe: 900 });
  await bekle(250);
  await c.cek("h08_uzak_patlama", "sol");
  await bekle(15000);
  await c.cek("h08_fisek_27sn");
  await bekle(6000);
  await c.cek("h08_fisek_bitti");

  // Oda 2: helikopter inişi (gündüz)
  await c.api("POST", "/sahne/sifirla", { kaynak: "panel" });
  await c.api("PATCH", "/ortam", { saat: 12, bulut: 0.2 });
  await c.api("PUT", "/oda", { oda: "oda2" });
  console.log("oda2 hazır:", await c.hazirBekle());
  await bekle(6000);
  await c.cek("h09_oda2");
  await c.api("PATCH", "/oda2", { helikopter: "yaklasiyor", helikopterYonu: 0 });
  await bekle(6000);
  await c.cek("h09_heli_yaklasiyor");
  await c.api("PATCH", "/oda2", { helikopter: "iniyor" });
  for (const [i, ms] of [5000, 5000, 6000, 6000].entries()) {
    await bekle(ms);
    await c.cek(`h09_heli_iniyor_${i}`);
  }
  await fpsYaz("helikopter iniyor/yerde");
  await c.api("PATCH", "/oda2", { helikopter: "yerde" });
  await bekle(6000);
  await c.cek("h09_heli_yerde");
  await c.cek("h09_heli_yerde_orta", "orta");
  await c.api("PATCH", "/oda2", { helikopter: "kalkiyor" });
  await bekle(5000);
  await c.cek("h09_heli_kalkiyor");
  console.log("  kaynak son:", JSON.stringify(await kaynak()));
} finally {
  await c.api("POST", "/sahne/sifirla", { kaynak: "panel" }).catch(() => {});
  await c.api("PUT", "/oda", { oda: "oda1" }).catch(() => {});
  if (c.konsol.size) console.log("\nKonsol:\n  " + [...c.konsol].map(([m, n]) => `${n}× ${m}`).join("\n  "));
  await c.kapat();
}
