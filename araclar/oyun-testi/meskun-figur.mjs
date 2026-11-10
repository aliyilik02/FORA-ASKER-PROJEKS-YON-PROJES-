// Oynayarak test 1: meskûn mahalde figür yerleşimi, bekleme, çatışmaya geçiş, patlama tepkisi, duruş geçişleri,
// vurulma, sıhhiyeci (safha), koşan/yürüyen asker. Çıktı: araclar/_goruntu/oyun/f_*.png + f_olcum.json
//   node araclar/oyun-testi/meskun-figur.mjs [--bolge meskun_mahal]
import fs from "node:fs";
import path from "node:path";
import { baslat, bekle, cozumle } from "./cekirdek.mjs";

const bolge = process.argv.includes("--bolge") ? process.argv[process.argv.indexOf("--bolge") + 1] : "meskun_mahal";
const c = await baslat();
const olcum = {};
const yaz = (ad, o) => {
  olcum[ad] = cozumle(o);
  console.log(`\n== ${ad}\n` + JSON.stringify(olcum[ad], null, 1));
};
async function yakin(ad, id) {
  const k = await c.figurKutusu(id);
  if (!k || k.hata) return console.log(`  ! ${ad}: kutu yok`, k);
  await c.cek(ad, k);
}
try {
  await c.api("POST", "/sahne/sifirla", { kaynak: "panel" });
  await c.api("PUT", "/oda", { oda: "oda1" });
  await c.api("PATCH", "/ortam", { mevsim: "yaz", saat: 12, yagis: "yok", sis: 0, bulut: 0.2, simsek: false });
  await c.api("PATCH", "/catisma", { aktif: false, yon: 0, siddet: 0.8, dostAtes: true });
  await c.api("PUT", "/safha", { safha: "taktik_saha" });
  await c.api("PUT", "/bolge", { bolge });
  console.log("hazır:", await c.hazirBekle());
  await bekle(4000);
  await c.cek("f01_bos");

  // 1) Yerleşim
  const ids = {};
  const kadro = [
    ["a1", "komando_bekleyen", -22],
    ["a2", "komando_bere_nisan", 12],
    ["a3", "telsizci_bekleyen", 38],
    ["a4", "komando_agir_bekleyen", -48],
    ["a5", "komando_bekleyen", -20],
    ["t1", "tank_altay", 0],
  ];
  for (const [id, klip, azimut] of kadro) ids[id] = await c.figur({ islem: "oynat", id, klip, azimut });
  for (const id of Object.keys(ids)) console.log("  figür", id, await c.figurBekle(id));
  await bekle(2500);
  console.log("konumlar:", JSON.stringify(await c.figurler()));
  await c.cek("f02_kadro");
  for (const id of ["a1", "a2", "a3", "a4", "a5", "t1"]) await yakin(`f02_${id}`, id);

  // 2) Bekleme (idle) tekrar ve çeşitlilik
  yaz("bekleme_a1_8sn", await c.ornekle("a1", 8));

  // 3) Çatışmaya geçiş
  const p1 = c.ornekle("a1", 6);
  await bekle(300);
  await c.api("PATCH", "/catisma", { aktif: true, yon: 0, siddet: 0.8 });
  for (const [i, ms] of [400, 900, 1600, 2600].entries()) {
    await bekle(i === 0 ? ms : ms - [400, 900, 1600, 2600][i - 1]);
    await yakin(`f03_ates_gecis_${i}`, "a1");
  }
  yaz("catismaya_gecis_a1", await p1);
  await c.cek("f03_catisma");
  // Namlu parıltısı yakalamak için seri çekim
  for (let i = 0; i < 6; i++) {
    await yakin(`f04_ates_seri_${i}`, "a2");
    await bekle(170);
  }
  yaz("ates_a2_5sn", await c.ornekle("a2", 5));
  await yakin("f04_tank", "t1");

  // 4) Yakın patlama: irkilme
  const p2 = c.ornekle("a1", 4);
  await bekle(400);
  await c.api("POST", "/efekt", { tur: "patlama", siddet: 0.9, yon: 340 });
  await bekle(250);
  await c.cek("f05_patlama_0");
  await bekle(500);
  await c.cek("f05_patlama_1");
  await yakin("f05_irkilme", "a1");
  await bekle(1500);
  await c.cek("f05_patlama_2");
  yaz("patlama_irkilme_a1", await p2);
  await bekle(3000);
  await c.cek("f05_patlama_3");

  // 5) Duruş geçişleri (çatışma sürerken)
  for (const poz of ["comelmis", "yatmis", "ayakta"]) {
    const p = c.ornekle("a3", 4.5);
    await bekle(300);
    await c.figur({ islem: "poz", id: "a3", poz });
    await bekle(700);
    await yakin(`f06_${poz}_ara`, "a3");
    await bekle(2800);
    await yakin(`f06_${poz}_son`, "a3");
    yaz(`durus_${poz}_a3`, await p);
  }

  // 6) Vurulma → yaralı
  const p3 = c.ornekle("a4", 7);
  await bekle(300);
  await c.figur({ islem: "poz", id: "a4", poz: "yarali" });
  for (const [i, ms] of [350, 900, 1800, 4500].entries()) {
    await bekle(i === 0 ? ms : ms - [350, 900, 1800, 4500][i - 1]);
    await yakin(`f07_vurulma_${i}`, "a4");
  }
  yaz("vurulma_a4", await p3);

  // 7) Sıhhiyeci: ateş altında siperde bekler, taktik sahada yürür
  await c.api("PUT", "/safha", { safha: "ates_altinda" });
  await c.figur({ islem: "oynat", id: "s1", klip: "sihhiyeci_sihhiyeci", yaninda: "a4" });
  console.log("  sıhhiyeci", await c.figurBekle("s1"));
  await bekle(2500);
  console.log("konumlar (ateş altında):", JSON.stringify(await c.figurler()));
  await yakin("f08_sihhiyeci_siperde", "s1");
  await c.cek("f08_ates_altinda");
  const p4 = c.ornekle("s1", 9);
  await bekle(300);
  await c.api("PATCH", "/catisma", { aktif: false });
  await c.api("PUT", "/safha", { safha: "taktik_saha" });
  await bekle(1500);
  await yakin("f08_sihhiyeci_yuruyor", "s1");
  await bekle(6500);
  yaz("sihhiyeci_yurume_s1", await p4);
  await yakin("f08_sihhiyeci_yaninda", "s1");
  await yakin("f08_yarali", "a4");
  console.log("konumlar (taktik saha):", JSON.stringify(await c.figurler()));

  // 8) Koşan ve yürüyen asker (ayak kayması, kaçınma)
  await c.figur({ islem: "oynat", id: "k1", klip: "komando_kosan", azimut: -50 });
  console.log("  koşan", await c.figurBekle("k1"));
  await bekle(600);
  const p5 = c.ornekle("k1", 5);
  await bekle(800);
  await yakin("f09_kosan_0", "k1");
  await bekle(1500);
  await yakin("f09_kosan_1", "k1");
  yaz("kosan_k1", await p5);
  await c.figur({ islem: "oynat", id: "y1", klip: "komando_yuruyen", azimut: -40 });
  console.log("  yürüyen", await c.figurBekle("y1"));
  await bekle(600);
  const p6 = c.ornekle("y1", 5);
  await bekle(1500);
  await yakin("f09_yuruyen", "y1");
  yaz("yuruyen_y1", await p6);
  await c.figur({ islem: "oynat", id: "c1", klip: "komando_comelerek", azimut: 30, yansit: true });
  console.log("  çömelerek", await c.figurBekle("c1"));
  await bekle(600);
  const p7 = c.ornekle("c1", 4);
  await bekle(1500);
  await yakin("f09_comelerek", "c1");
  yaz("comelerek_c1", await p7);
  await c.cek("f10_son");
  console.log("konumlar (son):", JSON.stringify(await c.figurler()));
} finally {
  fs.writeFileSync(path.join(c.klasor, "f_olcum.json"), JSON.stringify(olcum, null, 1));
  if (c.konsol.size) console.log("\nKonsol:\n  " + [...c.konsol].map(([m, n]) => `${n}× ${m}`).join("\n  "));
  await c.kapat();
}
