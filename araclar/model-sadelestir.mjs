/**
 * Meshy GLB'sini oynatıcıya hazırlar — doku dikişlerini koruyarak (meshoptimizer; Blender Decimate UV adalarını yırtıp
 * "kırık porselen" görüntüsü veriyordu, 3 Kasım gece):
 *
 *   node araclar/model-sadelestir.mjs <girdi.glb> <cikti.glb> [--ucgen 8000] [--boy 0.95] [--eksen uzun|yukseklik]
 *        [--hata 0.01] [--doku 1024]
 *
 * - weld + simplify (MeshoptSimplifier, lockBorder: UV/normal sınırları kilitli → dikiş açılmaz), hedef üçgen sayısı.
 * - `--boy`: en uzun kenar (uzun) ya da yükseklik (yukseklik) bu kadar metre olacak şekilde kök düğüme ölçek; taban
 *   y=0, x/z merkezde (düğüm çevirisiyle; geometriye dokunulmaz).
 * - `--doku`: dokular bu kenara küçültülür (JPEG q85; sharp varsa).
 */
import { Accessor, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, simplify, weld, textureCompress } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
import { statSync } from "node:fs";

const arg = process.argv.slice(2);
const girdi = arg[0];
const cikti = arg[1];
const sec = (ad, v) => (arg.includes(ad) ? arg[arg.indexOf(ad) + 1] : v);
const ucgenHedef = Number(sec("--ucgen", "8000"));
const boy = Number(sec("--boy", "0"));
const eksen = sec("--eksen", "uzun");
const hata = Number(sec("--hata", "0.01"));
const sinirKilit = sec("--sinir", "kilitli") !== "serbest"; // çok parçalı modelde (moloz) kilitli sınırlar sadeleşmeyi engeller
const doku = Number(sec("--doku", "0"));

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
await MeshoptSimplifier.ready;
const belge = await io.read(girdi);
const ucgen = (b) =>
  b
    .getRoot()
    .listMeshes()
    .flatMap((m) => m.listPrimitives())
    .reduce((t, p) => t + (p.getIndices() ? p.getIndices().getCount() / 3 : p.getAttribute("POSITION").getCount() / 3), 0);
const once = ucgen(belge);
const oran = Math.min(1, ucgenHedef / once);
if (oran < 1) {
  await belge.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: oran, error: hata, lockBorder: sinirKilit }));
}
await belge.transform(dedup(), prune());
let dokuNotu = "";
if (doku > 0) {
  try {
    const sharp = (await import("sharp")).default;
    await belge.transform(textureCompress({ encoder: sharp, targetFormat: "jpeg", quality: 85, resize: [doku, doku] }));
    dokuNotu = ` · doku ≤${doku}`;
  } catch (e) {
    dokuNotu = ` · doku küçültülmedi (${String(e.message).slice(0, 40)})`;
  }
}

// Sınır kutusu (sahne düğümleri dünya dönüşümüyle)
const sahne = belge.getRoot().listScenes()[0];
const min = [Infinity, Infinity, Infinity];
const max = [-Infinity, -Infinity, -Infinity];
const kokler = sahne.listChildren();
for (const kok of kokler) {
  kok.traverse((dugum) => {
    const mesh = dugum.getMesh();
    if (!mesh) return;
    const m = dugum.getWorldMatrix();
    for (const p of mesh.listPrimitives()) {
      const poz = p.getAttribute("POSITION");
      const n = poz.getCount();
      const v = [0, 0, 0];
      const adim = Math.max(1, Math.floor(n / 200000));
      for (let i = 0; i < n; i += adim) {
        poz.getElement(i, v);
        const x = m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12];
        const y = m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13];
        const z = m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14];
        if (x < min[0]) min[0] = x;
        if (y < min[1]) min[1] = y;
        if (z < min[2]) min[2] = z;
        if (x > max[0]) max[0] = x;
        if (y > max[1]) max[1] = y;
        if (z > max[2]) max[2] = z;
      }
    }
  });
}
const boyut = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
let olcek = 1;
if (boy > 0) {
  const mevcut = eksen === "yukseklik" ? boyut[1] : Math.max(...boyut);
  if (mevcut > 1e-6) olcek = boy / mevcut;
}
// Yeni kök: ölçek + çeviri (taban y=0, x/z merkez)
const kok = belge.createNode("kok").setScale([olcek, olcek, olcek]).setTranslation([-((min[0] + max[0]) / 2) * olcek, -min[1] * olcek, -((min[2] + max[2]) / 2) * olcek]);
for (const c of kokler) {
  sahne.removeChild(c);
  kok.addChild(c);
}
sahne.addChild(kok);
await io.write(cikti, belge);
const mb = (statSync(cikti).size / 1048576).toFixed(1);
console.log(`HAZIR ${cikti} üçgen ${once} → ${ucgen(belge)} boyut ${boyut.map((v) => (v * olcek).toFixed(2)).join("×")} m${dokuNotu} · ${mb} MB`);
