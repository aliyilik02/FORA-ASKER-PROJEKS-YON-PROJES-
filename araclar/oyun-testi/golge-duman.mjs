// Görsel denetim: (1) askerlerin çevresindeki temas gölgesi halesi (film görünümü, sonIslem.ts) ve (2) toz/duman
// bulutunun arkasındaki sahnenin görünümü. Önce/sonra karşılaştırması için.
//
//   KOPRU=http://127.0.0.1:4100 node araclar/oyun-testi/golge-duman.mjs [bolge] [--ad on_ek] [--gorsel film|sade]
//
// Çıktı: araclar/_goruntu/golge/<ad>_asker_<id>.png (asker yakın planları), <ad>_duman_<n>.png (orta duvar, duman).
import { baslat, bekle } from "./cekirdek.mjs";

const arg = (ad, varsayilan) => {
  const i = process.argv.indexOf(`--${ad}`);
  return i > 0 && process.argv[i + 1] !== undefined && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : varsayilan;
};
const bolge = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "meskun_mahal";
const onEk = arg("ad", "golge");

const t = await baslat({ cikti: "araclar/_goruntu/golge", sorgu: { gorsel: arg("gorsel", "film"), hareket: "kapali" } });
try {
  await t.api("POST", "/sahne/sifirla", { kaynak: "panel" });
  await t.api("PATCH", "/ortam", { mevsim: "yaz", saat: 12, yagis: "yok", sis: 0, bulut: 0.2, simsek: false });
  await t.api("PATCH", "/catisma", { aktif: false });
  await t.api("PUT", "/bolge", { bolge });
  await t.hazirBekle();
  await bekle(5000);
  // Duvar/bariyer diplerine ve açığa askerler (diz çökmüş ve ayakta)
  const kadro = [["g1", "komando_diz_cokmus", -70], ["g2", "komando_bekleyen", -100], ["g3", "komando_diz_cokmus", 60], ["g4", "komando_bekleyen", 20], ["g5", "komando_bere_bekleyen", -25], ["g6", "komando_diz_cokmus", 95]];
  for (const [id, klip, azimut] of kadro) await t.figur({ islem: "oynat", id, klip, azimut });
  for (const [id] of kadro) await t.figurBekle(id);
  await bekle(2500);
  await t.cek(`${onEk}_hepsi`);
  for (const [id] of kadro) {
    const kutu = await t.figurKutusu(id, 0.9);
    if (kutu && !kutu.hata) await t.cek(`${onEk}_asker_${id}`, kutu);
  }
  // Toz/duman: orta duvara iki bulut, 2 ve 5 sn sonra
  await t.api("POST", "/efekt", { tur: "toz_duman", yon: 0, siddet: 1 });
  await bekle(600);
  await t.api("POST", "/efekt", { tur: "toz_duman", yon: 12, siddet: 1 });
  await bekle(1800);
  await t.cek(`${onEk}_duman_1`, "orta");
  await bekle(3000);
  await t.cek(`${onEk}_duman_2`, "orta");
  await bekle(4000);
  await t.cek(`${onEk}_duman_3`, "orta");
  if (t.konsol.size) console.log("konsol:", [...t.konsol.entries()].slice(0, 8));
  console.log("tamam:", onEk);
} finally {
  await t.kapat();
}
