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
 *
 *   --yapilandirma araclar/bitki-modelleri.json        # başka model kümesi (bitki/kaya): yapılandırmadaki "ham", "cikti",
 *        "ciktiUzak" ({ad} yer tutucusu) ve "adlar" yolları kullanılır; "ucgenUzak" verilen modellere uzak kopya (LOD) da üretilir
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const kok = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = process.argv.slice(2);
const yapilandirmaYolu = arg.includes("--yapilandirma") ? arg[arg.indexOf("--yapilandirma") + 1] : "araclar/alan-modelleri.json";
const yapilandirma = JSON.parse(readFileSync(path.resolve(kok, yapilandirmaYolu), "utf8"));
const hamDizin = path.join(kok, yapilandirma.ham ?? "meshy_output/topluluk");
const ciktiSablonu = yapilandirma.cikti ?? "apps/duvar-oynatici/public/icerik/modeller/alan/{ad}.glb";
const ciktiYolu = (sablon, ad) => path.join(kok, sablon.replaceAll("{ad}", ad));
const BLENDER = process.env.BLENDER ?? yapilandirma.blender ?? "C:/Program Files/Blender Foundation/Blender 5.1/blender.exe";
mkdirSync(hamDizin, { recursive: true });

/** Meshy'nin kaydettiği ad başlığın ilk 21 karakterini ve 10 haneli zaman damgasını taşır; önerilen adla öneki eşleştir. */
function baslik(ad, damgaHane) {
  return ad
    .replace(/^Meshy_AI_/, "")
    .replace(new RegExp(`_\\d{${damgaHane}}_.*$`), "")
    .replace(/_+$/, "");
}

if (arg.includes("--tasi")) {
  // İndirme sırasıyla [no, başlık] listesi: aynı başlıklı modeller (ör. dört "Concrete_Barrier") sırayla en eski dosyayı alır
  const ham = JSON.parse(readFileSync(path.join(kok, yapilandirma.adlar ?? "araclar/alan-indirme-adlari.json"), "utf8"));
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
const secili = new Set(arg.filter((a, i) => /^\d+$/.test(a) && arg[i - 1] !== "--yapilandirma").map(Number));
const ozet = [];
for (const m of yapilandirma.modeller) {
  if (secili.size && !secili.has(m.no)) continue;
  const girdi = path.join(hamDizin, `${m.no}.glb`);
  const cikti = ciktiYolu(ciktiSablonu, m.ad);
  mkdirSync(path.dirname(cikti), { recursive: true });
  if (!existsSync(girdi)) {
    ozet.push(`YOK   #${m.no} ${m.ad} (ham dosya indirilmemiş)`);
    continue;
  }
  if (!hepsi && existsSync(cikti) && statSync(cikti).mtimeMs > statSync(girdi).mtimeMs) {
    ozet.push(`HAZIR #${m.no} ${m.ad} (atlandı)`);
    continue;
  }
  // Ağaçlarda uzak kopya (LOD): az üçgen, küçük doku; oynatıcı 40 m ötesinde onu çizer
  const kopyalar = [{ hedef: cikti, ucgen: m.ucgen, doku: m.doku, etiket: m.ad, uzak: false }];
  if (m.ucgenUzak && yapilandirma.ciktiUzak) kopyalar.push({ hedef: ciktiYolu(yapilandirma.ciktiUzak, m.ad), ucgen: m.ucgenUzak, doku: m.dokuUzak ?? m.doku, etiket: `${m.ad} (uzak)`, uzak: true });
  for (const k of kopyalar) {
    let kaynak = girdi;
    let pisirme = "";
    // Pişirme (yapılandırmada "pisir": true): Blender sadeleştirir, yeni UV'ye renk (ve kayada normal) pişirir; ölçek,
    // taban ve doku sıkıştırması ardından model-sadelestir.mjs'te (orada sadeleştirme yok)
    const gecici = yapilandirma.pisir ? k.hedef.replace(/\.glb$/, ".pisir.glb") : null;
    if (gecici) {
      const pArg = ["-b", "--factory-startup", "--python", path.join(kok, "araclar/model-pisir.py"), "--", girdi, gecici, "--ucgen", String(k.ucgen), "--doku", String(k.doku)];
      if (m.normal && !k.uzak) pArg.push("--normal");
      const p = spawnSync(BLENDER, pArg, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
      pisirme = ((p.stdout || "").match(/PISIRILDI .* üçgen (\d+ → \d+(?: \(\w+\))?)/) ?? [])[1] ?? "";
      if (p.status !== 0 || !pisirme || !existsSync(gecici)) {
        ozet.push(`HATA  #${m.no} ${k.etiket}: pişirme (${((p.stderr || "") + (p.stdout || "")).trim().split("\n").filter((s) => /Error|error/.test(s)).pop() ?? "çıktı yok"})`);
        console.log(ozet[ozet.length - 1]);
        continue;
      }
      kaynak = gecici;
    }
    const secenek = ["--ucgen", gecici ? "999999999" : String(k.ucgen), "--boy", String(m.boy), "--eksen", m.eksen, "--doku", String(k.doku)];
    if (!gecici && m.sinir) secenek.push("--sinir", m.sinir);
    if (!gecici && m.hata) secenek.push("--hata", String(m.hata));
    const s = spawnSync(process.execPath, ["--max-old-space-size=12288", path.join(kok, "araclar/model-sadelestir.mjs"), kaynak, k.hedef, ...secenek], {
      encoding: "utf8",
    });
    if (gecici) rmSync(gecici, { force: true });
    const satir = ((s.stdout || "").trim().split("\n").pop() || "").replace(k.hedef, k.etiket);
    ozet.push(s.status === 0 ? `#${m.no} ${pisirme ? `pişirildi ${pisirme} · ` : ""}${satir}` : `HATA  #${m.no} ${k.etiket}: ${(s.stderr || "").trim().split("\n").pop()}`);
    console.log(ozet[ozet.length - 1]);
  }
}
writeFileSync(path.join(hamDizin, "_hazirlama-ozeti.txt"), ozet.join("\n") + "\n");
console.log(`\n${ozet.filter((o) => o.startsWith("#")).length} hazırlandı, ${ozet.filter((o) => o.startsWith("HATA")).length} hata, ${ozet.filter((o) => o.startsWith("YOK")).length} ham dosya yok.`);
