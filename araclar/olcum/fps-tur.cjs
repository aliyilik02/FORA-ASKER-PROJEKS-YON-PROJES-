// fps turu (10 Kasım): köprüye panel olarak bağlanır (/ws), oynatıcının 5 sn'lik önizleme `bilgi` satırından fps okur;
// her bölgede boş ve 4 asker + çatışma. Ölçülecek oynatıcı ayrı, önde, büyük pencerede olmalı (arka plandaki sekme
// kare çizmez). Önerilen: ayrı Chrome profili --app=http://127.0.0.1:4000/oynatici/?dinamik=0&tohum=7&kalite=yuksek
// --start-maximized. Kullanıcının kendi oynatıcısı da rapor yollar → 2. bağımsız değişken süzgeç.
//   node araclar/olcum/fps-tur.cjs "ormanlik:yaz,meskun_mahal:yaz" "1920×360 · kalite yuksek ·"
// Sahne sahne fps turu: köprüye panel olarak bağlanır, her sahneyi API ile kurar, geçiş bitince örnekler.
const { createRequire } = require("module");
const req = createRequire(require("path").join(__dirname, "..", "..", "package.json"));
const WebSocket = req("ws");
const API = "http://localhost:4000/api";
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const istek = async (yontem, yol, govde) => {
  const r = await fetch(API + yol, { method: yontem, headers: { "content-type": "application/json" }, body: govde ? JSON.stringify(govde) : undefined });
  if (!r.ok) console.log("  ! ", yontem, yol, r.status, (await r.text()).slice(0, 150));
};

let son = null;
let sonZaman = 0;
const ws = new WebSocket("ws://localhost:4000/ws");
ws.on("open", () => ws.send(JSON.stringify({ tip: "merhaba", rol: "panel", ad: "fps-tur" })));
ws.on("message", (m) => {
  try {
    const d = JSON.parse(m.toString());
    if (d.tip === "onizleme" && d.bilgi && (!process.argv[3] || d.bilgi.includes(process.argv[3]))) { son = d.bilgi; sonZaman = Date.now(); }
  } catch {}
});

async function olc(ad) {
  // geçiş bitene dek bekle (bilgi satırında geçiş bilgisi kalmayınca), en çok 60 sn
  const bas = Date.now();
  await bekle(6000);
  while (Date.now() - bas < 60000 && (!son || /geçiş|yükl|panorama/i.test(son.split("·").slice(9).join("·")))) await bekle(1000);
  await bekle(4000);
  const ornek = [];
  const t0 = Date.now();
  let gorulen = 0;
  while (Date.now() - t0 < 21000) {
    if (sonZaman > gorulen) { gorulen = sonZaman; ornek.push(son); }
    await bekle(250);
  }
  const fps = ornek.map((s) => Number(s.split(" ")[0])).filter((n) => !isNaN(n));
  const ort = fps.length ? (fps.reduce((a, b) => a + b, 0) / fps.length).toFixed(0) : "?";
  console.log(`${ad.padEnd(34)} ${ort.padStart(3)} fps  [${fps.join(", ")}]  | ${(ornek.at(-1) || "").split("·").slice(1).join("·").trim()}`);
}

const ASKERLER = ["komando_bekleyen", "komando_bere_nisan", "komando_agir_bekleyen", "komando_diz_cokmus"];
async function yuk(acik) {
  if (acik) {
    for (const klip of ASKERLER) { await istek("POST", "/figur", { islem: "oynat", klip }); await bekle(400); }
    await istek("PATCH", "/catisma", { aktif: true, siddet: 0.7, yon: 0, dostAtes: true });
  } else {
    await istek("POST", "/sahne/sifirla", { kaynak: "panel" });
  }
}

(async () => {
  await bekle(1500);
  const sahneler = process.argv[2] ? process.argv[2].split(",").map((s) => s.split(":")) : [
    ["meskun_mahal", "yaz"], ["ormanlik", "yaz"], ["ormanlik", "kis"], ["daglik", "yaz"],
    ["kirsal_acik_arazi", "yaz"], ["us_bolgesi", "yaz"],
  ];
  for (const [bolge, mevsim] of sahneler) {
    await istek("PATCH", "/ortam", { mevsim, saat: 12, yagis: "yok", sis: 0 });
    await istek("PUT", "/bolge", { bolge });
    await olc(`${bolge} ${mevsim} boş`);
    await yuk(true);
    await olc(`${bolge} ${mevsim} 4 asker+çatışma`);
    await yuk(false);
  }
  await istek("PUT", "/bolge", { bolge: "meskun_mahal" });
  ws.close();
  process.exit(0);
})();
