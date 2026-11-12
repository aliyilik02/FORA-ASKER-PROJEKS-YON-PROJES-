// Kirpi tekerlekleri (12 Kasım): araç gelirken akslar gidilen yol kadar dönüyor mu (açı = yol / yarıçap), tekerlek
// yerinde mi (aks merkezinde, yere değiyor), durunca dönüş duruyor mu. Ayrı köprüde koş:
//   KOPRU=http://127.0.0.1:4100 node araclar/oyun-testi/kirpi-teker.mjs [bolge]
import { baslat, bekle } from "./cekirdek.mjs";
const bolge = process.argv[2] ?? "kirsal_acik_arazi";
const c = await baslat({ sorgu: { gorsel: "film", fov: "24" }, cikti: "araclar/_goruntu/kirpi", genislik: 3840 });
const olc = () => c.js(() => {
  const a = window.duvar.sahne3b.arac;
  if (!a?.aktif || !a.tekerlekler) return null;
  const g = a.grup;
  g.updateMatrixWorld(true);
  const THREE = window.duvar.THREE;
  const akslar = a.tekerlekler.akslar.map((aks) => {
    const ag = aks.children[0];
    const k = ag.geometry.boundingBox;
    // Tekerlek ağının dünya kutusu (parçanın kendi köşelerinden): alt kenar yere değmeli
    const koseler = [];
    for (const x of [k.min.x, k.max.x]) for (const y of [k.min.y, k.max.y]) for (const z of [k.min.z, k.max.z]) koseler.push(ag.localToWorld(new THREE.Vector3(x, y, z)));
    const merkez = aks.getWorldPosition(new THREE.Vector3());
    return { aci: +aks.rotation.x.toFixed(3), merkezY: +(merkez.y - g.position.y).toFixed(3), altY: +(Math.min(...koseler.map((p) => p.y)) - g.position.y).toFixed(2) };
  });
  return { asama: a.asama, x: +g.position.x.toFixed(2), z: +g.position.z.toFixed(2), kalan: +a.kalan.toFixed(2), akslar, yaricap: a.tekerlekler.yaricap };
});
try {
  await c.api("POST", "/sahne/sifirla", {});
  await c.api("PATCH", "/ortam", { mevsim: "yaz", saat: 12, yagis: "yok", sis: 0.03, bulut: 0.4, simsek: false });
  await c.api("PUT", "/bolge", { bolge });
  await c.hazirBekle();
  await bekle(4000);
  await c.api("POST", "/efekt", { tur: "zirhli_arac", siddet: 1, yon: 0 });
  let ilk = null;
  for (let i = 0; i < 40 && !ilk; i++) { await bekle(150); ilk = await olc(); }
  if (!ilk) throw new Error("araç gelmedi (tekerlekler ayrılamadı?)");
  console.log("ilk", JSON.stringify(ilk));
  const ornekler = [ilk];
  for (let i = 0; i < 9; i++) {
    await bekle(1000);
    const o = await olc();
    ornekler.push(o);
    if (i === 3) await c.cek("kirpi_yolda", "orta");
    if (i === 4) await c.cek("kirpi_yolda2", "orta");
  }
  await bekle(3500);
  const son = await olc();
  ornekler.push(son);
  await c.cek("kirpi_durdu", "orta");
  let hata = 0;
  for (let i = 1; i < ornekler.length; i++) {
    const a = ornekler[i - 1], b = ornekler[i];
    const yol = a.kalan - b.kalan;
    const donus = b.akslar[0].aci - a.akslar[0].aci;
    const beklenen = yol / b.yaricap;
    const uyum = Math.abs(donus - beklenen) < 0.02 + beklenen * 0.02;
    if (!uyum) hata++;
    console.log(`  ${b.asama.padEnd(9)} yol ${yol.toFixed(2)} m  dönüş ${donus.toFixed(2)} rad  beklenen ${beklenen.toFixed(2)}  ${uyum ? "✓" : "✗"}  aks y ${b.akslar.map((k) => k.merkezY).join("/")}  alt ${b.akslar.map((k) => k.altY).join("/")}`);
  }
  const durdu = son.asama !== "geliyor";
  console.log(durdu ? "✓ araç durdu, tekerlek dönmüyor" : "✗ araç hâlâ geliyor");
  console.log(hata === 0 && durdu ? "SONUÇ: tekerlek dönüşü yolla uyumlu" : `SONUÇ: ${hata} uyumsuz örnek`);
  if (c.konsol.size) console.log("konsol:", [...c.konsol.entries()].slice(0, 6));
} finally {
  await c.kapat();
}
