// Mermi izi görünümü (Playwright): çatışmayı (ve/veya izli akışı) kare kare ilerletip izlerin, namlu parıltılarının ve
// çarpmaların tam karesini çeker; önce/sonra karşılaştırması için. Sayfa saati test denetiminde (cekirdek saat: true).
//
//   KOPRU=http://127.0.0.1:4100 node araclar/oyun-testi/iz-gorunumu.mjs [bolge] [--saat 12] [--ad on_ek] [--izli]
//        [--kare 6] [--asker 4] [--siddet 0.8] [--yon 0] [--genislik 3840] [--iz kapali|dusman|acik]
//
// Çıktı: araclar/_goruntu/iz/<ad>_<n>.png (tam tuval) ve <ad>_<n>_orta.png (orta duvar).
import { baslat, bekle } from "./cekirdek.mjs";

const arg = (ad, varsayilan) => {
  const i = process.argv.indexOf(`--${ad}`);
  return i > 0 && process.argv[i + 1] !== undefined && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : varsayilan;
};
const bayrak = (ad) => process.argv.includes(`--${ad}`);
const bolge = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "meskun_mahal";
const onEk = arg("ad", bolge);
const kareSayisi = Number(arg("kare", "6"));
const askerSayisi = Number(arg("asker", "4"));
const yon = Number(arg("yon", "0"));

const t = await baslat({ genislik: Number(arg("genislik", "3840")), cikti: "araclar/_goruntu/iz", sorgu: { gorsel: arg("gorsel", "film"), ...(arg("iz", "") ? { iz: arg("iz", "") } : {}) }, saat: true });
try {
  await t.api("POST", "/sahne/sifirla", { kaynak: "panel" });
  await t.api("PATCH", "/ortam", { mevsim: "yaz", saat: Number(arg("saat", "12")), yagis: "yok", sis: 0, bulut: 0.2, simsek: false });
  await t.api("PUT", "/bolge", { bolge });
  await t.hazirBekle();
  await bekle(5000);
  const kadro = [["i1", "komando_nisan", -24], ["i2", "komando_bere_nisan", 14], ["i3", "komando_nisan", 34], ["i4", "komando_agir_bekleyen", -44], ["i5", "telsizci_bekleyen", 4]].slice(0, askerSayisi);
  for (const [id, klip, azimut] of kadro) await t.figur({ islem: "oynat", id, klip, azimut });
  for (const [id] of kadro) await t.figurBekle(id);
  await bekle(1500);
  await t.api("PATCH", "/catisma", { aktif: true, siddet: Number(arg("siddet", "0.8")), yon, dostAtes: true, siperAl: true });
  if (bayrak("izli")) await t.api("PATCH", "/izli-mermi", { aktif: true, cikisNoktasi: 1, yon: 0, siklik: 3 });
  await bekle(4000);
  const simdi = await t.js(() => Date.now());
  await t.sayfa.clock.pauseAt(simdi + 10);
  let cekilen = 0;
  let sonCekim = -100;
  for (let k = 0; k < 900 && cekilen < kareSayisi; k++) {
    await t.sayfa.clock.runFor(17);
    const iz = await t.js(() => window.duvar.sahne3b.izSayisi);
    // En az üç iz uçuştayken, çekimler arası ≥ 25 kare (farklı anlar)
    if (iz >= 3 && k - sonCekim >= 25) {
      sonCekim = k;
      cekilen++;
      await t.cek(`${onEk}_${cekilen}`);
      await t.cek(`${onEk}_${cekilen}_orta`, "orta");
      console.log(`  kare ${k}: uçuşta ${iz} mermi, çizilen ışık çizgisi ${await t.js(() => window.duvar.sahne3b.cizilenIzSayisi)} → ${onEk}_${cekilen}.png`);
    }
  }
  await t.sayfa.clock.resume();
  await t.api("PATCH", "/catisma", { aktif: false });
  await t.api("PATCH", "/izli-mermi", { aktif: false }).catch(() => undefined);
  if (t.konsol.size) console.log("konsol:", [...t.konsol.entries()].slice(0, 8));
} finally {
  await t.kapat();
}
