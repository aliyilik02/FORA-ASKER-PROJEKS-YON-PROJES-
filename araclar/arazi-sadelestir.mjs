#!/usr/bin/env node
/**
 * Poly Haven fotogrametri modellerini (yüz binlerce üçgen) oynatıcı için sadeleştirir: meshoptimizer ile
 * üçgen sayısı hedefe indirilir, dokular 1K kalır, sonuç tek dosya GLB olarak <klasör>/<ad>_lod.glb'ye yazılır.
 * arazi.ts önce *_lod.glb arar, yoksa özgün .gltf'yi yükler.
 *   node araclar/arazi-sadelestir.mjs            (hepsi)
 *   node araclar/arazi-sadelestir.mjs kaya_buyuk (tek klasör)
 * İçerik depo dışındaysa: ICERIK_KLASORU=<icerik klasörü> (köprüyle aynı değişken).
 */
import { Accessor, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, simplify, weld } from "@gltf-transform/functions";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { MeshoptSimplifier } from "meshoptimizer";

const kok = fileURLToPath(new URL("..", import.meta.url));
// İçerik başka yerdeyse (sahada ayrı disk; köprüyle aynı değişken) ICERIK_KLASORU
const modelKok = join(process.env.ICERIK_KLASORU ?? join(kok, "apps", "duvar-oynatici", "public", "icerik"), "arazi", "modeller");

/** Hedef üçgen sayıları: duvarda 10–150 m'den bakılır; kaya 6–10k, çalı yaprak kartları 25k, çimen 6k yeter. */
const HEDEF = {
  kaya_buyuk: 9000,
  kaya_orta: 9000,
  kaya_kucuk: 7000,
  kaya_yuvarlak: 5000,
  tas_kume: 12000,
  taslar: 10000,
  cali: 30000,
  kuru_dal: 8000,
  kutuk: 10000,
  cimen_1: 12000,
  cimen_2: 6000,
  // 26 Ekim: ormanlık seti (fidan yaprak kartları çok; 20–30k yeter)
  fidan_goknar: 30000,
  fidan_cam: 24000,
  cali_1: 16000,
  cali_2: 12000,
  cali_3: 12000,
  egrelti: 8000,
  kutuk_2: 8000,
  cam_koku: 12000,
};

/**
 * Normalleri yüz başına (sert kenarlı) gelen fotogrametri modelleri: aynı konumdaki köşelerin normalleri farklı
 * olduğundan neredeyse her köşe "dikiş" sayılır ve meshoptimizer çökertemez (kaya_buyuk: 33 k konum, 62 k
 * konum+normal; 66 k → 56,5 k'da kalıyordu, hedef 9 k). Bunlarda normaller atılır, köşeler konum + uv ile kaynaklanır,
 * sadeleştirmeden sonra konum başına yumuşak normal hesaplanır (uv dikişinde iki yan aynı normali alır).
 */
const NORMAL_YENIDEN = new Set(["kaya_buyuk"]);

/** Alan ağırlıklı yüz normallerinin konum başına toplamı → NORMAL (uv dikişindeki köşeler aynı normali paylaşır). */
function yumusakNormaller(belge) {
  for (const mesh of belge.getRoot().listMeshes())
    for (const p of mesh.listPrimitives()) {
      const konum = p.getAttribute("POSITION").getArray();
      const indis = p.getIndices().getArray();
      const n = konum.length / 3;
      const anahtarlar = new Map();
      const grup = new Int32Array(n);
      for (let i = 0; i < n; i++) {
        const k = `${konum[i * 3]},${konum[i * 3 + 1]},${konum[i * 3 + 2]}`;
        let g = anahtarlar.get(k);
        if (g === undefined) anahtarlar.set(k, (g = anahtarlar.size));
        grup[i] = g;
      }
      const toplam = new Float64Array(anahtarlar.size * 3);
      for (let t = 0; t < indis.length; t += 3) {
        const a = indis[t] * 3;
        const b = indis[t + 1] * 3;
        const c = indis[t + 2] * 3;
        const ux = konum[b] - konum[a];
        const uy = konum[b + 1] - konum[a + 1];
        const uz = konum[b + 2] - konum[a + 2];
        const vx = konum[c] - konum[a];
        const vy = konum[c + 1] - konum[a + 1];
        const vz = konum[c + 2] - konum[a + 2];
        const nx = uy * vz - uz * vy;
        const ny = uz * vx - ux * vz;
        const nz = ux * vy - uy * vx;
        for (let j = 0; j < 3; j++) {
          const g = grup[indis[t + j]] * 3;
          toplam[g] += nx;
          toplam[g + 1] += ny;
          toplam[g + 2] += nz;
        }
      }
      const normal = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const g = grup[i] * 3;
        const l = Math.hypot(toplam[g], toplam[g + 1], toplam[g + 2]) || 1;
        normal[i * 3] = toplam[g] / l;
        normal[i * 3 + 1] = toplam[g + 1] / l;
        normal[i * 3 + 2] = toplam[g + 2] / l;
      }
      const tampon = p.getAttribute("POSITION").getBuffer();
      p.setAttribute("NORMAL", belge.createAccessor().setType(Accessor.Type.VEC3).setArray(normal).setBuffer(tampon));
    }
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
await MeshoptSimplifier.ready;
const istenen = process.argv[2];
for (const klasor of readdirSync(modelKok)) {
  if (istenen && klasor !== istenen) continue;
  const yol = join(modelKok, klasor);
  if (!statSync(yol).isDirectory()) continue;
  const gltf = readdirSync(yol).find((d) => d.endsWith(".gltf"));
  if (!gltf) continue;
  const hedefDosya = join(yol, `${klasor}_lod.glb`);
  const belge = await io.read(join(yol, gltf));
  const ucgen = (b) =>
    b
      .getRoot()
      .listMeshes()
      .flatMap((m) => m.listPrimitives())
      .reduce((t, p) => t + (p.getIndices() ? p.getIndices().getCount() / 3 : p.getAttribute("POSITION").getCount() / 3), 0);
  const once = ucgen(belge);
  const hedef = HEDEF[klasor] ?? 8000;
  const oran = Math.min(1, hedef / once);
  const normalYeniden = NORMAL_YENIDEN.has(klasor);
  if (normalYeniden) for (const m of belge.getRoot().listMeshes()) for (const p of m.listPrimitives()) p.setAttribute("NORMAL", null);
  await belge.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: oran, error: 0.02, lockBorder: false }));
  if (normalYeniden) yumusakNormaller(belge);
  await belge.transform(dedup(), prune());
  const sonra = ucgen(belge);
  await io.write(hedefDosya, belge);
  const mb = (statSync(hedefDosya).size / 1048576).toFixed(1);
  console.log(`${klasor.padEnd(14)} ${Math.round(once).toString().padStart(8)} → ${Math.round(sonra).toString().padStart(7)} üçgen  (${mb} MB)  ${existsSync(hedefDosya) ? "✓" : "✗"}`);
}
