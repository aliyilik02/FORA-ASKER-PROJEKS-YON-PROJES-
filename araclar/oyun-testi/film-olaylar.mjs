// Film görünümü olayları (11 Kasım): yıkılan duvar ve zırhlı araç. Ayrı köprüde koş (kullanıcının sahnesini bozmasın):
//   cd apps/kopru && PORT=4100 VERI_KLASORU=<geçici>/ node dist/index.js
//   KOPRU=http://127.0.0.1:4100 node araclar/oyun-testi/film-olaylar.mjs
import { baslat, bekle } from "./cekirdek.mjs";
const c = await baslat({ sorgu: { gorsel: "film" }, cikti: "araclar/_goruntu/film" });
const olc = () => c.js(() => {
  const s = window.duvar.sahne3b;
  const a = s.arac, y = s.yikilan;
  return { arac: a?.aktif ? { asama: a.asama, x: +a.grup.position.x.toFixed(1), z: +a.grup.position.z.toFixed(1) } : null, duvar: y.duvarlar.map((d) => ({ yikildi: d.yikildi, ucan: d.tuglalar.filter((t) => t.durum === 1).length, yerde: d.tuglalar.filter((t) => t.durum === 2).length, toplam: d.tuglalar.length })) };
});
try {
  await c.api("POST", "/sahne/sifirla", {});
  await c.api("PATCH", "/ortam", { mevsim: "yaz", saat: 12, yagis: "yok", sis: 0.05, bulut: 0.55, simsek: false });
  await c.api("PUT", "/bolge", { bolge: "meskun_mahal" });
  await c.hazirBekle(); await bekle(4000);
  console.log("başlangıç", JSON.stringify(await olc()));
  await c.cek("o1_once", "orta");
  await c.api("POST", "/efekt", { tur: "duvar_yik", siddet: 1, yon: 20 });
  await bekle(450); await c.cek("o2_patlama", "orta");
  await bekle(900); await c.cek("o3_cokme", "orta");
  await bekle(3500); console.log("duvar sonrası", JSON.stringify(await olc()));
  await c.cek("o4_yigin", "orta");
  await c.api("POST", "/efekt", { tur: "zirhli_arac", siddet: 1, yon: 0 });
  await bekle(3500); console.log("araç 3,5 sn", JSON.stringify((await olc()).arac)); await c.cek("o5_arac_geliyor", "orta");
  await bekle(5500); console.log("araç 9 sn", JSON.stringify((await olc()).arac));
  await bekle(3200); console.log("araç 12 sn", JSON.stringify((await olc()).arac)); await c.cek("o6_arac_ates", "orta");
  await bekle(700); await c.cek("o7_arac_ates2", "orta");
  await c.api("POST", "/sahne/sifirla", {}); await bekle(1500);
  console.log("sıfırlama sonrası", JSON.stringify(await olc()));
  console.log("konsol hataları:", Array.isArray(c.konsol) ? c.konsol.filter((k) => /error/i.test(String(k))).slice(0, 5) : "?");
} finally { await c.kapat(); }
