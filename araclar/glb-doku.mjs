#!/usr/bin/env node
/**
 * GLB doku çıkar / geri yaz (4 Kasım 2026; sıhhiye çantasındaki haçı kızılaya çevirmek için).
 *   node araclar/glb-doku.mjs cikar <model.glb> <klasor>        → klasöre <i>_<yuva>.png (baseColor/normal/...)
 *   node araclar/glb-doku.mjs yaz   <model.glb> <i> <yeni.png> [cikti.glb]  → i. dokuyu değiştirir (varsayılan yerinde)
 */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [komut, glb, a, b, c] = process.argv.slice(2);
if (!komut || !glb) {
  console.error("kullanım: cikar <glb> <klasor> | yaz <glb> <i> <png> [cikti]");
  process.exit(1);
}
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const belge = await io.read(glb);
const dokular = belge.getRoot().listTextures();
const yuva = (t) => {
  const yuvalar = new Set();
  for (const m of belge.getRoot().listMaterials()) {
    if (m.getBaseColorTexture() === t) yuvalar.add("baseColor");
    if (m.getNormalTexture() === t) yuvalar.add("normal");
    if (m.getMetallicRoughnessTexture() === t) yuvalar.add("metalRough");
    if (m.getEmissiveTexture() === t) yuvalar.add("emissive");
    if (m.getOcclusionTexture() === t) yuvalar.add("occlusion");
  }
  return [...yuvalar].join("+") || "bilinmiyor";
};
if (komut === "cikar") {
  mkdirSync(a, { recursive: true });
  dokular.forEach((t, i) => {
    const uz = t.getMimeType() === "image/jpeg" ? "jpg" : "png";
    const ad = `${i}_${yuva(t)}.${uz}`;
    writeFileSync(join(a, ad), t.getImage());
    console.log(ad, t.getSize()?.join("x"));
  });
} else if (komut === "yaz") {
  const t = dokular[Number(a)];
  if (!t) throw new Error("doku yok: " + a);
  t.setImage(readFileSync(b)).setMimeType(b.toLowerCase().endsWith(".jpg") ? "image/jpeg" : "image/png");
  await io.write(c ?? glb, belge);
  console.log("yazıldı", c ?? glb);
}
