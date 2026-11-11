import { chromium } from "playwright";
// Panel turu: eğitmen ekranını tarayıcıda gezer (duvara dokun, asker, vuruldu, sıhhiyeci, çatışma, patlama, çekmeceler,
// Oda 2, Teknisyen, tablet), ekran görüntülerini araclar/_goruntu/oyun/yp_*.png yazar. Sahneyi değiştirir: ayrı köprüde koş.
//   KOPRU=http://127.0.0.1:4100 node araclar/oyun-testi/panel-tur.mjs
const K = process.env.KOPRU ?? "http://127.0.0.1:4100";
const api = (y, yol, g) => fetch(K + "/api" + yol, { method: y, headers: { "content-type": "application/json" }, body: g ? JSON.stringify(g) : undefined }).then((r) => r.json());
const t = await chromium.launch({ channel: "chrome", headless: true, args: ["--ignore-gpu-blocklist", "--enable-gpu", "--use-angle=d3d11", "--mute-audio"] });
const oy = await t.newPage({ viewport: { width: 1920, height: 360 } });
await api("POST", "/sahne/sifirla", {}); await api("PUT", "/oda", { oda: "oda1" }); await api("PUT", "/bolge", { bolge: "meskun_mahal" }); await api("PATCH", "/ortam", { mevsim: "yaz", saat: 12, yagis: "yok", sis: 0, bulut: 0.2 });
await oy.goto(K + "/oynatici/?kalite=orta&gecis=0"); await oy.waitForTimeout(9000);
const s = await t.newPage({ viewport: { width: 1366, height: 900 } });
const hatalar = []; s.on("pageerror", (e) => hatalar.push(e.message)); s.on("console", (m) => m.type() === "error" && hatalar.push(m.text().slice(0, 200)));
await s.goto(K + "/"); await s.evaluate(() => localStorage.clear()); await s.reload(); await s.waitForTimeout(2500);
const cek = (ad, tam = true) => s.screenshot({ path: `araclar/_goruntu/oyun/yp_${ad}.png`, fullPage: tam });
// duvara dokun: orta duvarın sol yarısı
const kutu = await s.locator(".duvar-goruntu").boundingBox();
await s.mouse.click(kutu.x + kutu.width * 0.42, kutu.y + kutu.height * 0.6);
await s.getByRole("button", { name: /^Üç asker/ }).click(); await s.waitForTimeout(2500);
await s.getByRole("button", { name: /^Asker vuruldu/ }).click(); await s.waitForTimeout(600);
await s.getByRole("button", { name: /^Sıhhiyeci gönder/ }).click(); await s.waitForTimeout(600);
await s.getByRole("button", { name: /^Çatışmayı başlat/ }).click(); await s.waitForTimeout(700);
await s.getByRole("button", { name: /^Patlama/ }).first().click(); await s.waitForTimeout(6500);
await cek("1_ana");
console.log("durum:", JSON.stringify((await api("GET", "/durum")).catisma), "figür", (await api("GET", "/figurler")).map((f) => `${f.klip}:${f.poz ?? ""}:${f.yaninda ?? ""}`).join(" "));
await s.locator(".e-ortam").click(); await s.waitForTimeout(500); await cek("2_ortam", false);
await s.getByRole("button", { name: /^Fırtına/ }).click(); await s.waitForTimeout(400);
await s.locator(".cekmece-kapat").click();
await s.locator(".e-senaryo").click(); await s.waitForTimeout(500); await cek("3_senaryo", false);
await s.locator(".cekmece-kapat").click();
await api("POST", "/sahne/sifirla", {});
await s.getByRole("button", { name: /^Oda 2/ }).click(); await s.waitForTimeout(6000); await cek("4_oda2");
await s.getByRole("button", { name: "Teknisyen" }).click(); await s.waitForTimeout(700); await cek("5_teknisyen", false);
await s.getByRole("button", { name: /Eğitmen ekranına dön/ }).click();
await s.getByRole("button", { name: /^Oda 1/ }).click(); await s.waitForTimeout(800);
await s.setViewportSize({ width: 820, height: 1180 }); await s.waitForTimeout(600); await cek("6_tablet");
console.log("ortam:", JSON.stringify((await api("GET", "/durum")).ortam));
console.log("hata:", hatalar.slice(0, 5));
await api("POST", "/sahne/sifirla", {}); await api("PUT", "/oda", { oda: "oda1" });
await t.close();
