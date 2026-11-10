// Köprüye panel olarak bağlanır, oynatıcı önizlemelerindeki "bilgi" satırını (fps, kalite...) yazdırır.
const { createRequire } = require("module");
const req = createRequire(require("path").join(__dirname, "..", "..", "package.json"));
const WebSocket = req("ws");
const sure = Number(process.argv[2] || 40) * 1000;
const ws = new WebSocket("ws://localhost:4000/ws");
ws.on("open", () => ws.send(JSON.stringify({ tip: "merhaba", rol: "panel", ad: "fps-olcer" })));
ws.on("message", (m) => {
  try {
    const d = JSON.parse(m.toString());
    if (d.tip === "onizleme") console.log(new Date().toLocaleTimeString("tr-TR"), d.bilgi);
    if (d.tip === "gunluk" || d.tip === "baglanti") console.log("#", d.tip, JSON.stringify(d).slice(0, 200));
  } catch {}
});
setTimeout(() => { ws.close(); process.exit(0); }, sure);
