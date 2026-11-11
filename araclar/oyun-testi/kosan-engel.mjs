// Oynayarak test 6: koşan/yürüyen asker sabit engelin (bariyer, araç, sütre) ve duran askerin içinden geçiyor mu?
// Kuşatma senaryosundaki kadro kurulur, iki yönden koşan gönderilir; her karede engel/figür mesafesi ölçülür.
//   node araclar/oyun-testi/kosan-engel.mjs
import { baslat, bekle } from "./cekirdek.mjs";
const c = await baslat();
let hata = 0;
const izle = (id, sure) => c.js(({ id, sure }) => new Promise((coz) => {
  const d = window.duvar, s = d.sahne3b, f = s.figurler; const kayit = []; let bas = null;
  const adim = (t) => {
    if (bas === null) bas = t;
    const a = s.figurAktifBul(id);
    if (a) {
      const p = a.nesne.position;
      let enYakin = Infinity;
      for (const b of f.aktifler) if (b !== a && !b.agirSilah) enYakin = Math.min(enYakin, Math.hypot(b.nesne.position.x - p.x, b.nesne.position.z - p.z));
      kayit.push({ t: +((t - bas) / 1000).toFixed(2), x: +p.x.toFixed(2), z: +p.z.toFixed(2), r: +Math.hypot(p.x, p.z).toFixed(2), az: +((Math.atan2(p.x, -p.z) * 180) / Math.PI).toFixed(1), icinde: f.engel(p), kac: +a.kacinma.toFixed(2), enYakin: +enYakin.toFixed(2) });
    }
    if (t - bas < sure * 1000 && (a || kayit.length === 0)) requestAnimationFrame(adim); else coz(kayit);
  };
  requestAnimationFrame(adim);
}), { id, sure });
try {
  await c.api("POST", "/sahne/sifirla", {});
  await c.api("PATCH", "/ortam", { mevsim: "yaz", saat: 12, yagis: "yok", sis: 0, bulut: 0.2, simsek: false });
  await c.api("PUT", "/bolge", { bolge: "meskun_mahal" });
  await c.hazirBekle(); await bekle(3000);
  for (const [id, klip, az] of [["k1", "komando_bekleyen", -22], ["k2", "komando_bere_bekleyen", 12], ["k3", "telsizci_bekleyen", 38], ["k4", "komando_agir_bekleyen", -48], ["t", "tank_altay", 0]]) { await c.figur({ islem: "oynat", id, klip, azimut: az }); await c.figurBekle(id); }
  await bekle(1500);
  const denemeler = [["komando_bere_kosan", -60, false], ["komando_kosan", 55, true], ["komando_yuruyen", -70, false], ["komando_kosan", -80, false], ["komando_comelerek", 60, true]];
  for (const [klip, azimut, yansit] of denemeler) {
    await c.figur({ islem: "oynat", id: "kos", klip, azimut, yansit }); await c.figurBekle("kos");
    const kayit = await izle("kos", klip.includes("kosan") ? 9 : 22);
    const icinde = kayit.filter((k) => k.icinde);
    const yakin = Math.min(...kayit.map((k) => k.enYakin));
    console.log(`${klip} az ${azimut}${yansit ? " (sola)" : ""}: ${kayit.length} kare, engel içinde ${icinde.length} kare, figüre en yakın ${yakin} m, yarıçap ${Math.min(...kayit.map((k) => k.r))}..${Math.max(...kayit.map((k) => k.r))}`);
    if (icinde.length) { hata++; console.log("   içinde:", icinde.filter((_, i) => i % 6 === 0).slice(0, 8).map((k) => `t${k.t} (${k.x},${k.z}) az${k.az} kaç${k.kac}`).join(" | ")); }
    if (yakin < 0.7) { hata++; console.log("   ! figüre çok yakın"); }
    await c.api("POST", "/figur", { islem: "durdur", id: "kos" }); await bekle(400);
  }
  console.log(hata ? `${hata} SORUN` : "Temiz");
} finally { await c.api("POST", "/sahne/sifirla", {}); if (c.konsol.size) console.log([...c.konsol]); await c.kapat(); }
process.exitCode = hata ? 1 : 0;
