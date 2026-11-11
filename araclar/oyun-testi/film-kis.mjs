// Film görünümü denetimi (11 Kasım): kışta kar (kayalar, Kirpi, yıkılan duvar), dağ mevzi noktaları, orman fps.
// Ayrı köprüde koş:  KOPRU=http://127.0.0.1:4100 node araclar/oyun-testi/film-kis.mjs
import { baslat, bekle } from "./cekirdek.mjs";
const c = await baslat({ cikti: "araclar/_goruntu/film" });
try {
  // 1) Dağlık kış: mevzi noktaları ve kar
  await c.api("POST", "/sahne/sifirla", {});
  await c.api("PATCH", "/ortam", { mevsim: "kis", saat: 12, yagis: "yok", sis: 0.04, bulut: 0.6, simsek: false });
  await c.api("PUT", "/bolge", { bolge: "daglik" });
  await c.hazirBekle();
  await bekle(5000);
  for (const [id, klip, azimut] of [["d1", "komando_kis_bekleyen", -33], ["d2", "komando_bekleyen", 24], ["d3", "telsizci_bekleyen", 56], ["d4", "komando_bere_bekleyen", -62]]) {
    await c.figur({ islem: "oynat", id, klip, azimut });
    await c.figurBekle(id);
  }
  await bekle(1500);
  const f = await c.js(() => window.duvar.figurler().map((x) => ({ id: x.id, mesafe: +Math.hypot(x.x, x.z).toFixed(1), azimut: +((Math.atan2(x.x, -x.z) * 180) / Math.PI).toFixed(0) })));
  console.log("dağ mevzi figürleri:", JSON.stringify(f));
  await c.cek("k1_dag_kis_orta", "orta");
  await c.cek("k2_dag_kis_sag", "sag");
  console.log("dağlık kış fps:", JSON.stringify(await c.fps(3)));

  // 2) Meskûn kış: duvar ve Kirpi karlı mı
  await c.api("POST", "/sahne/sifirla", {});
  await c.api("PUT", "/bolge", { bolge: "meskun_mahal" });
  await c.hazirBekle();
  await bekle(5000);
  await c.api("POST", "/efekt", { tur: "zirhli_arac", siddet: 1, yon: 0 });
  await bekle(11000);
  await c.cek("k3_meskun_kis_orta", "orta");

  // 3) Orman yaz: görüntü ve fps
  await c.api("POST", "/sahne/sifirla", {});
  await c.api("PATCH", "/ortam", { mevsim: "yaz", saat: 12, yagis: "yok", sis: 0.04, bulut: 0.45, simsek: false });
  await c.api("PUT", "/bolge", { bolge: "ormanlik" });
  await c.hazirBekle();
  await bekle(6000);
  await c.cek("k4_orman_orta", "orta");
  console.log("orman fps:", JSON.stringify(await c.fps(4)));
} finally {
  await c.kapat();
}
