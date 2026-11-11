// Oynayarak test 3 (yakın plan, fov 50): klip dökümü (süre, kalça başlangıç/bitiş), hareketli kliplerin doğal hızı
// (ayak kayması), uzun bekleme, model başına silah–el yakın çekimi, ateş anında namlu parıltısı.
//   node araclar/oyun-testi/figur-yakin.mjs [--bolum klip,yuru,bekle,silah,ates]
import fs from "node:fs";
import path from "node:path";
import { baslat, bekle, cozumle } from "./cekirdek.mjs";

const bolumler = (process.argv.includes("--bolum") ? process.argv[process.argv.indexOf("--bolum") + 1] : "klip,yuru,bekle,silah,ates").split(",");
const c = await baslat({ sorgu: { fov: "50" } });
const olcum = {};
const ozet = (ad, o, alanlar) => {
  const s = cozumle(o);
  olcum[ad] = s;
  const k = alanlar ? Object.fromEntries(alanlar.map((a) => [a, s[a]])) : s;
  console.log(`== ${ad} ` + JSON.stringify(k));
};
async function yakin(ad, id, pay = 0.35) {
  const k = await c.figurKutusu(id, pay);
  if (!k || k.hata) return console.log(`  ! ${ad}: kutu yok`, JSON.stringify(k));
  await c.cek(ad, k);
}
const temizle = () => c.api("POST", "/figur", { islem: "temizle" });
try {
  await c.api("POST", "/sahne/sifirla", { kaynak: "panel" });
  await c.api("PUT", "/oda", { oda: "oda1" });
  await c.api("PATCH", "/ortam", { mevsim: "yaz", saat: 12, yagis: "yok", sis: 0, bulut: 0.2, simsek: false });
  await c.api("PUT", "/safha", { safha: "taktik_saha" });
  await c.api("PUT", "/bolge", { bolge: "meskun_mahal" });
  console.log("hazır:", await c.hazirBekle());
  await bekle(3000);

  if (bolumler.includes("klip")) {
    await c.figur({ islem: "oynat", id: "m1", klip: "komando_bekleyen", azimut: 0 });
    await c.figurBekle("m1");
    const dokum = await c.js(() => {
      const a = window.duvar.sahne3b.figurAktifBul("m1");
      return a.klipler.map((k) => {
        const iz = k.tracks.find((t) => /hips\.position$/i.test(t.name));
        const v = iz ? Array.from(iz.values) : null;
        const n = v ? v.length / 3 : 0;
        let enAzY = 1e9, enCokY = -1e9, enCokXZ = 0;
        for (let i = 0; i < n; i++) {
          enAzY = Math.min(enAzY, v[i * 3 + 1]);
          enCokY = Math.max(enCokY, v[i * 3 + 1]);
          enCokXZ = Math.max(enCokXZ, Math.hypot(v[i * 3] - v[0], v[i * 3 + 2] - v[2]));
        }
        return `${k.name} | ${k.duration.toFixed(2)} sn | iz ${k.tracks.length} | kalça ilk ${v ? v.slice(0, 3).map((x) => x.toFixed(2)) : "-"} son ${v ? v.slice(-3).map((x) => x.toFixed(2)) : "-"} | y ${enAzY.toFixed(2)}..${enCokY.toFixed(2)} | yatay gezinme ${enCokXZ.toFixed(2)}`;
      });
    });
    console.log("KLİPLER (komando):\n  " + dokum.join("\n  "));
    await temizle();
  }

  if (bolumler.includes("yuru")) {
    for (const [klip, sure] of [["komando_yuruyen", 5], ["komando_kosan", 3.2], ["komando_comelerek", 5], ["komando_surunen", 5], ["yarali_asker_yuruyen", 5], ["komando_agir_yuruyen", 5], ["komando_agir_kosan", 3.2], ["sihhiyeci_kosan", 3.2]]) {
      await c.figur({ islem: "oynat", id: "y", klip, azimut: -55 });
      if (!(await c.figurBekle("y"))) {
        console.log("  ! yüklenmedi", klip);
        continue;
      }
      await bekle(500);
      const p = c.ornekle("y", sure);
      await bekle(sure * 500);
      await yakin(`y_${klip}`, "y");
      ozet(`hareket_${klip}`, await p, ["kokHizi", "klipDogalHizi", "solAyakKayma", "sagAyakKayma", "sicramaSayisi", "enHizliDonusDerSn", "kalcaY", "silahSolEl"]);
      await c.api("POST", "/figur", { islem: "durdur", id: "y" });
      await bekle(300);
    }
  }

  if (bolumler.includes("bekle")) {
    await c.figur({ islem: "oynat", id: "b1", klip: "komando_bekleyen", azimut: -8 });
    await c.figur({ islem: "oynat", id: "b2", klip: "komando_bere_etrafa_bakan", azimut: 12 });
    await c.figurBekle("b1");
    await c.figurBekle("b2");
    const [o1, o2] = await Promise.all([c.ornekle("b1", 40), c.ornekle("b2", 40)]);
    ozet("bekleme_40sn_komando_bekleyen", o1, ["enYuksekHiz", "eylemCizgisi", "sicramaSayisi"]);
    ozet("bekleme_40sn_etrafa_bakan", o2, ["enYuksekHiz", "eylemCizgisi", "sicramaSayisi"]);
    // Baş hareket genliği (bekleme canlı mı)
    for (const [ad, o] of [["b1", o1], ["b2", o2]]) {
      const xs = o.kareler.map((k) => k.bas[0]), ys = o.kareler.map((k) => k.bas[1]), zs = o.kareler.map((k) => k.bas[2]);
      const el = o.kareler.map((k) => k.sagEl[1]);
      console.log(`  ${ad} baş gezinme cm: x ${((Math.max(...xs) - Math.min(...xs)) * 100).toFixed(1)} y ${((Math.max(...ys) - Math.min(...ys)) * 100).toFixed(1)} z ${((Math.max(...zs) - Math.min(...zs)) * 100).toFixed(1)}; sağ el y ${((Math.max(...el) - Math.min(...el)) * 100).toFixed(1)}`);
    }
    await temizle();
  }

  if (bolumler.includes("silah")) {
    const liste = ["komando_bekleyen", "komando_nisan", "komando_bere_bekleyen", "telsizci_bekleyen", "telsizci_telsiz", "sihhiyeci_bekleyen", "sihhiyeci_sihhiyeci", "komando_kis_bekleyen", "komando_agir_bekleyen", "komando_diz_cokmus", "komando_yatan", "komando_yarali", "komando_bomba", "komando_el_sallayan", "komando_cpr", "yarali_asker_yarali"];
    for (const klip of liste) {
      await c.figur({ islem: "oynat", id: "s", klip, azimut: 0 });
      if (!(await c.figurBekle("s"))) {
        console.log("  ! yüklenmedi", klip);
        continue;
      }
      await bekle(1800);
      await yakin(`s_${klip}`, "s");
      const o = cozumle(await c.ornekle("s", 1.5));
      console.log(`== silah ${klip} ` + JSON.stringify({ silahSagEl: o.silahSagEl, silahSolEl: o.silahSolEl, kalcaY: o.kalcaY, ayakAlt: [o.solAyakKayma?.enAltKokeGore, o.sagAyakKayma?.enAltKokeGore] }));
      await c.api("POST", "/figur", { islem: "durdur", id: "s" });
      await bekle(250);
    }
  }

  if (bolumler.includes("ates")) {
    // Yandan görünüm: düşman 90° (sağ duvar), figür orta duvarda → namlu, parıltı ve iz yandan görünür
    await c.figur({ islem: "oynat", id: "f1", klip: "komando_bekleyen", azimut: -10 });
    await c.figur({ islem: "oynat", id: "f2", klip: "komando_diz_cokmus", azimut: 8 });
    await c.figur({ islem: "oynat", id: "f3", klip: "komando_yatan", azimut: 24 });
    for (const id of ["f1", "f2", "f3"]) await c.figurBekle(id);
    await bekle(1500);
    const p = Promise.all([c.ornekle("f1", 5), c.ornekle("f2", 5), c.ornekle("f3", 5)]);
    await bekle(300);
    await c.api("PATCH", "/catisma", { aktif: true, yon: 90, siddet: 1, dostAtes: true });
    await bekle(1800);
    for (let i = 0; i < 10; i++) {
      await c.cek(`a_ates_${i}`, "orta");
      await bekle(110);
    }
    const [o1, o2, o3] = await p;
    ozet("ates_donus_ayakta", o1, ["enHizliDonusDerSn", "eylemCizgisi", "solAyakKayma"]);
    ozet("ates_donus_diz", o2, ["enHizliDonusDerSn", "eylemCizgisi"]);
    ozet("ates_donus_yatan", o3, ["enHizliDonusDerSn", "eylemCizgisi"]);
    for (const id of ["f1", "f2", "f3"]) await yakin(`a_yakin_${id}`, id, 0.8);
    // Ateş kesilince
    await c.api("PATCH", "/catisma", { aktif: false });
    await bekle(2500);
    await c.cek("a_ates_bitti", "orta");
  }
} finally {
  fs.writeFileSync(path.join(c.klasor, "y_olcum.json"), JSON.stringify(olcum, null, 1));
  await c.api("POST", "/sahne/sifirla", { kaynak: "panel" }).catch(() => {});
  if (c.konsol.size) console.log("\nKonsol:\n  " + [...c.konsol].map(([m, n]) => `${n}× ${m}`).join("\n  "));
  await c.kapat();
}
