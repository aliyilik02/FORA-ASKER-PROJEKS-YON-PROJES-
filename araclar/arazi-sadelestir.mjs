#!/usr/bin/env node
/**
 * Poly Haven fotogrametri modellerini (yüz binlerce üçgen) oynatıcı için sadeleştirir: meshoptimizer ile
 * üçgen sayısı hedefe indirilir, dokular 1K kalır, sonuç tek dosya GLB olarak <klasör>/<ad>_lod.glb'ye yazılır.
 * arazi.ts önce *_lod.glb arar, yoksa özgün .gltf'yi yükler.
 *   node araclar/arazi-sadelestir.mjs            (hepsi)
 *   node araclar/arazi-sadelestir.mjs kaya_buyuk (tek klasör)
 */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, simplify, weld } from "@gltf-transform/functions";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { MeshoptSimplifier } from "meshoptimizer";

const kok = fileURLToPath(new URL("..", import.meta.url));
const modelKok = join(kok, "apps", "duvar-oynatici", "public", "icerik", "arazi", "modeller");

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
  await belge.transform(
    weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio: oran, error: 0.02, lockBorder: false }),
    dedup(),
    prune(),
  );
  const sonra = ucgen(belge);
  await io.write(hedefDosya, belge);
  const mb = (statSync(hedefDosya).size / 1048576).toFixed(1);
  console.log(`${klasor.padEnd(14)} ${Math.round(once).toString().padStart(8)} → ${Math.round(sonra).toString().padStart(7)} üçgen  (${mb} MB)  ${existsSync(hedefDosya) ? "✓" : "✗"}`);
}
