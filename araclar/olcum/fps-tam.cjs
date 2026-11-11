// Tam kullanım fps turu (10 Kasım, projeksiyon PC ihtiyacı): her bölgede boş / tam yük (4 asker, yaralı, sıhhiyeci,
// tank, çatışma 1, izli 4/sn, 2 yangın, helikopter, 2,5 sn'de patlama/havan/toz) / tam yük + fırtına; sonda gece+fişek.
// 5760×1080 için ayrı Chrome: --force-device-scale-factor=0.3333333 --app=http://127.0.0.1:4000/oynatici/?dinamik=0&tohum=7
//   node araclar/olcum/fps-tam.cjs "5787×1085"   (bağımsız değişken: bilgi satırındaki tuval boyutu süzgeci)
// Tam kullanım fps turu (projeksiyon PC ihtiyacı için): 5760×1080 tuvalli oynatıcıdan (bilgi satırı ÇÖZ ile süzülür)
// her bölgede boş / tam yük / tam yük + fırtına, sonda kırsal gece + fişek.
const { createRequire } = require("module");
const req = createRequire(require("path").join(__dirname, "..", "..", "package.json"));
const WebSocket = req("ws");
const API = "http://localhost:4000/api";
const COZ = process.argv[2] || "5760×1080";
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const istek = async (yontem, yol, govde) => {
  try {
    const r = await fetch(API + yol, { method: yontem, headers: { "content-type": "application/json" }, body: govde ? JSON.stringify(govde) : undefined });
    if (!r.ok) console.log("  ! ", yontem, yol, r.status, (await r.text()).slice(0, 150));
  } catch (e) { console.log("  ! ", yontem, yol, String(e)); }
};

let son = null, sonZaman = 0;
const ws = new WebSocket("ws://localhost:4000/ws");
ws.on("open", () => ws.send(JSON.stringify({ tip: "merhaba", rol: "panel", ad: "fps-tam" })));
ws.on("message", (m) => {
  try {
    const d = JSON.parse(m.toString());
    if (d.tip === "onizleme" && d.bilgi && d.bilgi.includes(COZ)) { son = d.bilgi; sonZaman = Date.now(); }
  } catch {}
});

// Ölçüm sırasında efekt döngüsü (tam yükte): patlama, havan, toz, uzak patlama, bağırma sırayla, 2,5 sn'de bir
let efektZamanlayici = null;
function efektDongusu(acik) {
  clearInterval(efektZamanlayici);
  if (!acik) return;
  const sira = ["patlama", "havan", "toz_duman", "patlama", "uzak_patlama", "bagirma"];
  let i = 0;
  efektZamanlayici = setInterval(() => {
    const tur = sira[i++ % sira.length];
    istek("POST", "/efekt", { tur, siddet: 0.9, yon: (i * 47) % 360, mesafe: tur === "uzak_patlama" ? 600 : undefined });
  }, 2500);
}

async function olc(ad, sure = 30000) {
  const bas = Date.now();
  await bekle(6000);
  while (Date.now() - bas < 70000 && (!son || Date.now() - sonZaman > 7000 || /geçiş|yükl/i.test(son.split("·").slice(9).join("·")))) await bekle(1000);
  await bekle(5000);
  const ornek = [];
  const t0 = Date.now();
  let gorulen = 0;
  while (Date.now() - t0 < sure) {
    if (sonZaman > gorulen) { gorulen = sonZaman; ornek.push(son); }
    await bekle(250);
  }
  const fps = ornek.map((s) => Number(s.split(" ")[0])).filter((n) => !isNaN(n));
  const ort = fps.length ? (fps.reduce((a, b) => a + b, 0) / fps.length).toFixed(0) : "?";
  const enDusuk = fps.length ? Math.min(...fps) : "?";
  console.log(`${ad.padEnd(38)} ort ${String(ort).padStart(3)}  en düşük ${String(enDusuk).padStart(3)}  [${fps.join(", ")}]  | ${(ornek.at(-1) || "yok").split("·").slice(1).join("·").trim()}`);
}

async function tamYuk(bolge, mevsim) {
  await istek("PUT", "/oda", { oda: "oda2" });
  await istek("PATCH", "/oda2", { guvenliAlan: bolge === "meskun_mahal" ? "meskun_mahal_ici" : "operasyonel_bolge", helikopter: "yaklasiyor" });
  const kis = mevsim === "kis";
  const askerler = kis ? ["komando_kis_bekleyen", "komando_kis_nisan", "komando_bekleyen", "komando_diz_cokmus"] : ["komando_bekleyen", "komando_bere_nisan", "komando_agir_bekleyen", "komando_diz_cokmus"];
  for (const klip of askerler) { await istek("POST", "/figur", { islem: "oynat", klip }); await bekle(300); }
  await istek("POST", "/figur", { islem: "oynat", klip: "komando_yarali", id: "olcum_yarali", poz: "yarali" });
  await bekle(300);
  await istek("POST", "/figur", { islem: "oynat", klip: "sihhiyeci_bekleyen", yaninda: "olcum_yarali" });
  await istek("POST", "/figur", { islem: "oynat", klip: "tank_altay" });
  await istek("PATCH", "/catisma", { aktif: true, siddet: 1, yon: 0, dostAtes: true });
  await istek("PATCH", "/izli-mermi", { aktif: true, cikisNoktasi: 1, yon: 0, siklik: 4 });
  await istek("POST", "/efekt", { tur: "yangin", siddet: 0.8, yon: 330 });
  await istek("POST", "/efekt", { tur: "yangin", siddet: 0.8, yon: 30 });
  setTimeout(() => istek("PATCH", "/oda2", { helikopter: "iniyor" }), 12000);
  efektDongusu(true);
}

async function sifirla() {
  efektDongusu(false);
  await istek("POST", "/sahne/sifirla", { kaynak: "panel" });
  await istek("PATCH", "/izli-mermi", { aktif: false });
  await istek("PUT", "/oda", { oda: "oda1" });
  await istek("PATCH", "/ortam", { yagis: "yok", bulut: 0.2, sis: 0, simsek: false, saat: 12 });
}

(async () => {
  await bekle(2000);
  if (!son) console.log(`(henüz ${COZ} önizlemesi yok, bekleniyor)`);
  const sahneler = [["kirsal_acik_arazi", "yaz"], ["meskun_mahal", "yaz"], ["ormanlik", "yaz"], ["ormanlik", "kis"], ["daglik", "yaz"], ["us_bolgesi", "yaz"]];
  for (const [bolge, mevsim] of sahneler) {
    await sifirla();
    await istek("PATCH", "/ortam", { mevsim, saat: 12, yagis: "yok", sis: 0, bulut: 0.2, simsek: false });
    await istek("PUT", "/bolge", { bolge });
    await olc(`${bolge} ${mevsim} boş`);
    await tamYuk(bolge, mevsim);
    await olc(`${bolge} ${mevsim} TAM YÜK`, 40000);
    await istek("PATCH", "/ortam", { yagis: mevsim === "kis" ? "kar" : "siddetli_yagmur", bulut: 0.9, sis: 0.3, simsek: true, ruzgarSiddeti: 0.7 });
    await olc(`${bolge} ${mevsim} TAM YÜK + fırtına`, 40000);
  }
  // gece: kırsal, tam yük + aydınlatma fişekleri
  await sifirla();
  await istek("PATCH", "/ortam", { mevsim: "yaz", saat: 23, yagis: "yok", sis: 0, bulut: 0.2, simsek: false });
  await istek("PUT", "/bolge", { bolge: "kirsal_acik_arazi" });
  await tamYuk("kirsal_acik_arazi", "yaz");
  await istek("POST", "/efekt", { tur: "fisek", siddet: 1, yon: 350 });
  setTimeout(() => istek("POST", "/efekt", { tur: "fisek", siddet: 1, yon: 20 }), 15000);
  await olc("kirsal yaz GECE TAM YÜK + fişek", 40000);
  await sifirla();
  await istek("PUT", "/bolge", { bolge: "meskun_mahal" });
  ws.close();
  process.exit(0);
})();
