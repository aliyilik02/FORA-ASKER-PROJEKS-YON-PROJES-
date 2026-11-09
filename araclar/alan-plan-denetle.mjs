/**
 * Alan planı denetimi: manifest `alanlar[bolge]` öğelerinin gerçek taban izlerini (hazırlanmış GLB'lerin sınır kutusu,
 * `yonDerece` ile döndürülmüş) hesaplar, yerleşim noktalarının bir öğenin içine ya da `pay` metre yakınına düşüp
 * düşmediğini ve helikopter iniş alanının (rotor yarıçapı) boş olup olmadığını raporlar.
 *
 *   node araclar/alan-plan-denetle.mjs [bolge=meskun_mahal] [--json cikti.json]
 *
 * --json: taban izleri + noktalar (sahne x/z) dosyaya; üstten bakış çizimi ve tasarım için.
 */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const kok = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const icerik = path.join(kok, "apps/duvar-oynatici/public/icerik");
const arg = process.argv.slice(2);
const bolge = arg.find((a) => !a.startsWith("--") && !a.endsWith(".json")) ?? "meskun_mahal";
const jsonCikti = arg.includes("--json") ? arg[arg.indexOf("--json") + 1] : null;
const manifest = JSON.parse(readFileSync(path.join(icerik, "manifest.json"), "utf8"));
const plan = manifest.alanlar?.[bolge];
if (!plan) throw new Error(`alan planı yok: ${bolge}`);

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const olcuOnbellek = new Map();
/** GLB'nin yerel sınır kutusu (kök dönüşümleri dahil): [minX, minY, minZ, maxX, maxY, maxZ]. */
async function kutu(dosya) {
  if (olcuOnbellek.has(dosya)) return olcuOnbellek.get(dosya);
  const belge = await io.read(path.join(icerik, dosya));
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const sahne of belge.getRoot().listScenes())
    for (const k of sahne.listChildren())
      k.traverse((d) => {
        const mesh = d.getMesh();
        if (!mesh) return;
        const m = d.getWorldMatrix();
        for (const p of mesh.listPrimitives()) {
          const poz = p.getAttribute("POSITION");
          const a = poz.getMin([]);
          const b = poz.getMax([]);
          for (const x of [a[0], b[0]])
            for (const y of [a[1], b[1]])
              for (const z of [a[2], b[2]]) {
                const v = [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
                for (let i = 0; i < 3; i++) {
                  min[i] = Math.min(min[i], v[i]);
                  max[i] = Math.max(max[i], v[i]);
                }
              }
        }
      });
  const s = [...min, ...max];
  olcuOnbellek.set(dosya, s);
  return s;
}

const rad = (d) => (d * Math.PI) / 180;
const yerden = (azimut, mesafe) => ({ x: Math.sin(rad(azimut)) * mesafe, z: -Math.cos(rad(azimut)) * mesafe });
/** Öğenin sahnedeki taban izi (dönük kutunun eksen hizalı sarmalayanı) ve yüksekliği. */
async function iz(o) {
  const [x0, y0, z0, x1, y1, z1] = await kutu(o.dosya);
  const merkez = typeof o.x === "number" ? { x: o.x, z: o.z } : yerden(o.azimut ?? 0, o.mesafe ?? 20);
  const t = rad(o.yonDerece ?? 0);
  const k = [
    [x0, z0],
    [x1, z0],
    [x0, z1],
    [x1, z1],
  ].map(([x, z]) => ({ x: merkez.x + x * Math.cos(t) + z * Math.sin(t), z: merkez.z - x * Math.sin(t) + z * Math.cos(t) }));
  return {
    ad: path.basename(o.dosya, ".glb"),
    minX: Math.min(...k.map((p) => p.x)),
    maxX: Math.max(...k.map((p) => p.x)),
    minZ: Math.min(...k.map((p) => p.z)),
    maxZ: Math.max(...k.map((p) => p.z)),
    yukseklik: y1 - y0 + (o.y ?? 0),
    cati: typeof o.y === "number",
  };
}

const izler = [];
for (const o of plan.ogeler) izler.push(await iz(o));
const yer = izler.filter((i) => !i.cati);
const icinde = (p, pay) => yer.filter((i) => p.x > i.minX - pay && p.x < i.maxX + pay && p.z > i.minZ - pay && p.z < i.maxZ + pay);

// Asker noktaları yerleşimde izleyiciden 4–7 m'ye çekilir (sahne3b ASKER_EN_YAKIN/UZAK); denetim o konumda.
// Paylar: asker/figür 0,6 m (figür engeli 0,3 + gövde), toz 1 m, patlama 2,5 m (alan denetimi 2 m + titreme),
// tank 3 m (gövde ~7,5 × 3,5 m), helikopter 7 m (rotor 5,5 m + pay; sahne3b iniş denetimiyle aynı).
const noktalar = (plan.noktalar ?? []).map((n) => {
  const asker = (n.tur ?? []).includes("asker");
  const mesafe = asker ? Math.min(7, Math.max(4, n.mesafe)) : n.mesafe;
  return { ...n, mesafe, ...yerden(n.azimut, mesafe) };
});
let sorun = 0;
console.log(`${bolge}: ${izler.length} öğe, ${noktalar.length} nokta, ${(plan.dusmanMevzileri ?? []).length} mevzi`);
for (const n of noktalar) {
  const tur = n.tur ?? [];
  const pay = tur.includes("helikopter") ? 7 : tur.includes("tank") ? 3 : tur.includes("patlama") ? 2.5 : tur.includes("toz") ? 1 : 0.6;
  const carpan = icinde(n, pay);
  if (carpan.length) {
    sorun++;
    console.log(`  SORUN ${n.ad ?? ""} [${tur.join(",")}] (${n.x.toFixed(1)}, ${n.z.toFixed(1)}) ← ${carpan.map((c) => c.ad).join(", ")} (pay ${pay} m)`);
  }
}
// Mevzi bir yapının hacmi içindeyse namlu parıltısı görünmez (cephenin önünde olmalı)
for (const m of plan.dusmanMevzileri ?? []) {
  const ic = yer.filter((i) => m.x > i.minX && m.x < i.maxX && m.z > i.minZ && m.z < i.maxZ && m.y < i.yukseklik);
  if (ic.length) {
    sorun++;
    console.log(`  SORUN mevzi ${m.ad ?? ""} (${m.x}, ${m.y}, ${m.z}) yapının içinde: ${ic.map((i) => i.ad).join(", ")}`);
  }
}
// Öğe-öğe çakışmaları (çatı eşyası hariç; yalnız gözle bakılacak ipucu)
for (let i = 0; i < yer.length; i++)
  for (let j = i + 1; j < yer.length; j++) {
    const a = yer[i];
    const b = yer[j];
    const ox = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
    const oz = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
    if (ox > 0.3 && oz > 0.3) console.log(`  çakışma: ${a.ad} × ${b.ad} (${ox.toFixed(1)} × ${oz.toFixed(1)} m)`);
  }
console.log(sorun ? `${sorun} noktada sorun` : "noktalar temiz");
if (jsonCikti) writeFileSync(jsonCikti, JSON.stringify({ bolge, izler, noktalar }, null, 1));
