// Oynayarak test 4: çatışmada siper alma (sütre arkasında çök → doğrul, ateş et → çök) ve yaralının görüş hattı
// (öndeki asker kenara çekilir). Çıktı: araclar/_goruntu/oyun/sp_*.png; sonuç satırları stdout.
//   node araclar/oyun-testi/siper-ve-yarali.mjs
import { baslat, bekle, cozumle } from "./cekirdek.mjs";

const c = await baslat();
const durumlar = () => c.js(() => window.duvar.sahne3b.figurler.aktifler?.map?.((a) => ({ id: a.id, poz: a.poz, siper: a.siper?.mod ?? null, ates: a.atesPozu, x: +a.nesne.position.x.toFixed(2), z: +a.nesne.position.z.toFixed(2) })) ?? null);
/** Yaralının izleyiciden görünürlüğü: öndeki figürlerin, yaralının uzaklığına izdüşürülmüş en küçük sapması (m). */
const gorus = (liste, yaraliId) => {
  const y = liste.find((f) => f.id === yaraliId);
  const u = Math.hypot(y.x, y.z);
  let enAz = Infinity;
  for (const b of liste) {
    if (b.id === yaraliId) continue;
    const ileri = (b.x * y.x + b.z * y.z) / u;
    if (ileri < 0.5 || ileri > u - 0.3) continue;
    const sapma = Math.abs((b.x * -y.z + b.z * y.x) / u);
    enAz = Math.min(enAz, (sapma * u) / ileri);
  }
  return +enAz.toFixed(2);
};
let hata = 0;
const bekleKosul = (ad, kosul) => {
  console.log(`  ${kosul ? "✓" : "✗"} ${ad}`);
  if (!kosul) hata++;
};
try {
  await c.api("POST", "/sahne/sifirla", { kaynak: "panel" });
  await c.api("PUT", "/oda", { oda: "oda1" });
  await c.api("PATCH", "/ortam", { mevsim: "yaz", saat: 12, yagis: "yok", sis: 0, bulut: 0.2, simsek: false });
  await c.api("PATCH", "/catisma", { aktif: false, yon: 0, siddet: 0.8, dostAtes: true, siperAl: true });
  await c.api("PUT", "/safha", { safha: "taktik_saha" });
  await c.api("PUT", "/bolge", { bolge: "meskun_mahal" });
  console.log("hazır:", await c.hazirBekle());
  await bekle(3000);
  const kadro = [["a1", "komando_bekleyen", -22], ["a2", "komando_bere_bekleyen", 12], ["a3", "telsizci_bekleyen", 38], ["a4", "komando_agir_bekleyen", -48], ["a5", "komando_bekleyen", -20]];
  for (const [id, klip, azimut] of kadro) await c.figur({ islem: "oynat", id, klip, azimut });
  for (const [id] of kadro) await c.figurBekle(id);
  await bekle(2000);
  if (!(await durumlar())) throw new Error("figür katmanına erişilemedi (window.duvar.sahne3b.figurler)");

  // --- 1) Siper alma
  console.log("\n== Siper alma (açık)");
  const olcum = kadro.map(([id]) => c.ornekle(id, 24));
  await bekle(300);
  await c.api("PATCH", "/catisma", { aktif: true });
  const gorulen = new Map(kadro.map(([id]) => [id, new Set()]));
  const atesEden = new Map(kadro.map(([id]) => [id, new Set()]));
  for (let i = 0; i < 46; i++) {
    await bekle(500);
    const d = await durumlar();
    for (const f of d) {
      gorulen.get(f.id)?.add(f.poz);
      if (f.ates) atesEden.get(f.id)?.add(f.poz);
    }
    if ([4, 10, 18, 28, 40].includes(i)) {
      await c.cek(`sp_siper_${String(i).padStart(2, "0")}`);
      console.log(`  ${(i + 1) / 2} sn:`, d.map((f) => `${f.id}:${f.poz}${f.ates ? "*" : ""}(${f.siper})`).join(" "));
    }
  }
  const son = await durumlar();
  const inKalk = son.filter((f) => f.siper === "inKalk").map((f) => f.id);
  console.log("  sütre arkasında (inKalk):", inKalk.join(", ") || "yok");
  bekleKosul("en az bir asker sütre arkasında inip kalkıyor", inKalk.length >= 1);
  bekleKosul("inip kalkanlar hem çökmüş hem ayakta görüldü", inKalk.every((id) => gorulen.get(id).has("comelmis") && gorulen.get(id).has("ayakta")));
  bekleKosul("siperde çökmüşken ateş etmedi", inKalk.every((id) => !atesEden.get(id).has("comelmis")));
  for (const [i, p] of olcum.entries()) {
    const s = cozumle(await p);
    console.log(`  ${kadro[i][0]} sıçrama ${s.sicramaSayisi} dönüş ${s.enHizliDonusDerSn}°/sn kalça ${s.kalcaY?.enAz}..${s.kalcaY?.enCok}`);
    if (s.sicramaSayisi > 0) console.log("    ", JSON.stringify(s.sicramalar.slice(0, 3)));
    bekleKosul(`${kadro[i][0]} sıçrama yok`, s.sicramaSayisi === 0);
  }
  // Çatışma biter: kendi çökenler kalkar
  await c.api("PATCH", "/catisma", { aktif: false });
  await bekle(11000);
  const sonra = await durumlar();
  console.log("  ateş kesildi +11 sn:", sonra.map((f) => `${f.id}:${f.poz}`).join(" "));
  bekleKosul("çatışma bitince herkes ayakta", sonra.every((f) => f.poz === "ayakta"));
  await c.cek("sp_siper_bitti");

  // Siper al kapalı: kimse çökmez
  console.log("\n== Siper alma (kapalı)");
  await c.api("PATCH", "/catisma", { aktif: true, siperAl: false });
  await bekle(7000);
  const kapali = await durumlar();
  console.log("  7 sn:", kapali.map((f) => `${f.id}:${f.poz}${f.ates ? "*" : ""}`).join(" "));
  bekleKosul("kapalıyken herkes ayakta ateş ediyor", kapali.every((f) => f.poz === "ayakta"));
  // Eğitmen komutu korunur
  await c.api("PATCH", "/catisma", { siperAl: true });
  await c.figur({ islem: "poz", id: "a2", poz: "yatmis" });
  await bekle(9000);
  const elle = await durumlar();
  bekleKosul("eğitmenin yatırdığı asker yatmış kaldı", elle.find((f) => f.id === "a2").poz === "yatmis");
  await c.api("PATCH", "/catisma", { aktif: false });
  await c.figur({ islem: "poz", id: "a2", poz: "ayakta" });
  await bekle(6000);

  // --- 2) Yaralının görüş hattı
  console.log("\n== Yaralının görüş hattı");
  const once = await durumlar();
  console.log("  önce: a4 görüş açıklığı", gorus(once, "a4"), "m");
  await c.cek("sp_yarali_once");
  const p = kadro.map(([id]) => c.ornekle(id, 9));
  await bekle(300);
  await c.figur({ islem: "poz", id: "a4", poz: "yarali" });
  await bekle(9000);
  const sonraY = await durumlar();
  const aciklik = gorus(sonraY, "a4");
  console.log("  sonra: a4 görüş açıklığı", aciklik, "m;", sonraY.map((f) => `${f.id}(${f.x},${f.z})`).join(" "));
  bekleKosul("yaralının önü açık (≥ 1 m)", aciklik >= 1);
  for (const [i, pr] of p.entries()) {
    const s = cozumle(await pr);
    if (s.kokHizi > 0.02) console.log(`  ${kadro[i][0]} yürüdü: hız ${s.kokHizi} m/sn, sıçrama ${s.sicramaSayisi}, ${s.eylemCizgisi.slice(0, 5).join(" | ")}`);
    bekleKosul(`${kadro[i][0]} sıçrama yok`, s.sicramaSayisi === 0);
  }
  await c.cek("sp_yarali_sonra");
  const k = await c.figurKutusu("a4", 1.5);
  if (k && !k.hata) await c.cek("sp_yarali_yakin", k);
  console.log(hata ? `\n${hata} KOŞUL SAĞLANMADI` : "\nHepsi sağlandı");
} finally {
  await c.api("POST", "/sahne/sifirla", { kaynak: "panel" }).catch(() => {});
  if (c.konsol.size) console.log("\nKonsol:\n  " + [...c.konsol].map(([m, n]) => `${n}× ${m}`).join("\n  "));
  await c.kapat();
}
process.exitCode = hata ? 1 : 0;
