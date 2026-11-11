/**
 * Sokak dokuları (Poly Haven, CC0) → apps/duvar-oynatici/public/icerik/arazi/dokular/sokak_<ad>_{renk,normal,puruz}.jpg
 * (depo dışı). Asfalt: asphalt_02 (çatlaklı koyu asfalt); parke: brick_pavement_03 (gri kilit parke taşı, Türkiye
 * kaldırımları); beton: concrete_pavement_02 (bordür). 2K JPG. Var olan dosya atlanır.
 *
 *   node araclar/sokak-doku-indir.mjs
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const kok = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hedef = path.join(kok, "apps/duvar-oynatici/public/icerik/arazi/dokular");
mkdirSync(hedef, { recursive: true });
// duvar_tugla: yıkılan duvar (sahne3b/yikilanDuvar.ts), red_bricks_04 = 2,5 × 2,5 m kırmızı tuğla örgüsü
const DOKULAR = { asfalt: "asphalt_02", parke: "brick_pavement_03", beton: "concrete_pavement_02", duvar_tugla: "red_bricks_04" };
const HARITALAR = { renk: "Diffuse", normal: "nor_gl", puruz: "Rough" };

for (const [ad, kimlik] of Object.entries(DOKULAR)) {
  const dosyalar = await (await fetch(`https://api.polyhaven.com/files/${kimlik}`)).json();
  for (const [ek, harita] of Object.entries(HARITALAR)) {
    const cikti = path.join(hedef, ad.startsWith("duvar_") ? `${ad}_${ek}.jpg` : `sokak_${ad}_${ek}.jpg`);
    if (existsSync(cikti)) continue;
    const url = dosyalar[harita]?.["2k"]?.jpg?.url;
    if (!url) throw new Error(`${kimlik} ${harita} 2k jpg yok`);
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    writeFileSync(cikti, Buffer.from(await r.arrayBuffer()));
    console.log(`indi ${path.basename(cikti)} (${kimlik})`);
  }
}
const lisans = path.join(kok, "apps/duvar-oynatici/public/icerik/arazi/LISANS.txt");
const satir = "Sokak dokuları (sokak_*): Poly Haven asphalt_02, brick_pavement_03, concrete_pavement_02; duvar_tugla_*: red_bricks_04 — CC0 (polyhaven.com)";
if (!existsSync(lisans) || !readFileSync(lisans, "utf8").includes("sokak_*")) appendFileSync(lisans, `\n${satir}\n`);
console.log("tamam");
