/**
 * Meshy topluluk modellerini (CC0) oynatıcıya hazırlar: araclar/alan-modelleri.json'daki her satır için
 * meshy_output/topluluk/<no>.glb → apps/duvar-oynatici/public/icerik/modeller/alan/<ad>.glb
 * (model-sadelestir.mjs: dikiş korumalı sadeleştirme, gerçek ölçü, taban y=0, doku küçültme).
 *
 *   node araclar/alan-modelleri-hazirla.mjs            # eksik ya da eskiyenleri hazırla
 *   node araclar/alan-modelleri-hazirla.mjs --hepsi    # hepsini yeniden
 *   node araclar/alan-modelleri-hazirla.mjs 69 67      # yalnız bu numaralar
 *
 *   node araclar/alan-modelleri-hazirla.mjs --tasi     # İndirilenler'deki Meshy GLB'lerini numaraya göre taşır
 *        (eşleme: araclar/alan-indirme-adlari.json — indirme sırasıyla [["<no>", "<başlık ya da Meshy'nin önerdiği ad>"], ...])
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const kok = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const yapilandirma = JSON.parse(readFileSync(path.join(kok, "araclar/alan-modelleri.json"), "utf8"));
const hamDizin = path.join(kok, "meshy_output/topluluk");
const ciktiDizin = path.join(kok, "apps/duvar-oynatici/public/icerik/modeller/alan");
mkdirSync(hamDizin, { recursive: true });
mkdirSync(ciktiDizin, { recursive: true });
const arg = process.argv.slice(2);

/** Meshy'nin kaydettiği ad başlığın ilk 21 karakterini ve 10 haneli zaman damgasını taşır; önerilen adla öneki eşleştir. */
function baslik(ad, damgaHane) {
  return ad
    .replace(/^Meshy_AI_/, "")
    .replace(new RegExp(`_\\d{${damgaHane}}_.*$`), "")
    .replace(/_+$/, "");
}

if (arg.includes("--tasi")) {
  // İndirme sırasıyla [no, başlık] listesi: aynı başlıklı modeller (ör. dört "Concrete_Barrier") sırayla en eski dosyayı alır
  const ham = JSON.parse(readFileSync(path.join(kok, "araclar/alan-indirme-adlari.json"), "utf8"));
  const adlar = Array.isArray(ham) ? ham : Object.entries(ham);
  const indirilen = path.join(homedir(), "Downloads");
  const dosyalar = readdirSync(indirilen).filter((d) => /^Meshy_AI_.*\.glb$/i.test(d));
  const kullanildi = new Set();
  let tasinan = 0;
  for (const [no, onerilen] of adlar) {
    const hedef = path.join(hamDizin, `${no}.glb`);
    if (existsSync(hedef)) continue;
    const tam = onerilen.startsWith("Meshy_AI_") ? baslik(onerilen, 8) : onerilen.replace(/_+$/, "");
    const aday = dosyalar
      .filter((d) => !kullanildi.has(d))
      .map((d) => ({ d, b: baslik(d, 10) }))
      .filter((x) => x.b.length > 0 && tam.startsWith(x.b))
      .sort((a, b) => b.b.length - a.b.length || statSync(path.join(indirilen, a.d)).mtimeMs - statSync(path.join(indirilen, b.d)).mtimeMs);
    if (!aday.length) {
      console.log(`EŞLEŞMEDİ #${no} (${tam})`);
      continue;
    }
    kullanildi.add(aday[0].d);
    renameSync(path.join(indirilen, aday[0].d), hedef);
    tasinan++;
  }
  console.log(`${tasinan} dosya taşındı → ${hamDizin}`);
  process.exit(0);
}

const hepsi = arg.includes("--hepsi");
const secili = new Set(arg.filter((a) => /^\d+$/.test(a)).map(Number));
const ozet = [];
for (const m of yapilandirma.modeller) {
  if (secili.size && !secili.has(m.no)) continue;
  const girdi = path.join(hamDizin, `${m.no}.glb`);
  const cikti = path.join(ciktiDizin, `${m.ad}.glb`);
  if (!existsSync(girdi)) {
    ozet.push(`YOK   #${m.no} ${m.ad} (ham dosya indirilmemiş)`);
    continue;
  }
  if (!hepsi && existsSync(cikti) && statSync(cikti).mtimeMs > statSync(girdi).mtimeMs) {
    ozet.push(`HAZIR #${m.no} ${m.ad} (atlandı)`);
    continue;
  }
  const secenek = ["--ucgen", String(m.ucgen), "--boy", String(m.boy), "--eksen", m.eksen, "--doku", String(m.doku)];
  if (m.sinir) secenek.push("--sinir", m.sinir);
  if (m.hata) secenek.push("--hata", String(m.hata));
  const s = spawnSync(process.execPath, ["--max-old-space-size=12288", path.join(kok, "araclar/model-sadelestir.mjs"), girdi, cikti, ...secenek], {
    encoding: "utf8",
  });
  const satir = (s.stdout || "").trim().split("\n").pop() || "";
  ozet.push(s.status === 0 ? `#${m.no} ${satir.replace(cikti, m.ad)}` : `HATA  #${m.no} ${m.ad}: ${(s.stderr || "").trim().split("\n").pop()}`);
  console.log(ozet[ozet.length - 1]);
}
writeFileSync(path.join(hamDizin, "_hazirlama-ozeti.txt"), ozet.join("\n") + "\n");
console.log(`\n${ozet.filter((o) => o.startsWith("#")).length} hazırlandı, ${ozet.filter((o) => o.startsWith("HATA")).length} hata, ${ozet.filter((o) => o.startsWith("YOK")).length} ham dosya yok.`);
