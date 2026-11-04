// GLB özeti: ağlar, üçgen sayısı, sınır kutusu (metre), düğüm/animasyon adları. node araclar/glb-bilgi.mjs <dosya.glb>
import fs from "node:fs";
for (const yol of process.argv.slice(2)) {
  const buf = fs.readFileSync(yol);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString());
  let ucgen = 0;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const m of json.meshes ?? []) for (const p of m.primitives) {
    const pos = json.accessors[p.attributes.POSITION];
    const n = p.indices !== undefined ? json.accessors[p.indices].count : pos.count;
    ucgen += Math.floor(n / 3);
    for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], pos.min?.[i] ?? 0); max[i] = Math.max(max[i], pos.max?.[i] ?? 0); }
  }
  const boyut = max.map((v, i) => +(v - min[i]).toFixed(3));
  console.log(`${yol}\n  ${(buf.length / 1e6).toFixed(1)} MB · ağ ${json.meshes?.length ?? 0} · üçgen ${ucgen} · doku ${json.images?.length ?? 0} · animasyon ${json.animations?.length ?? 0} · iskelet ${json.skins?.length ?? 0}`);
  console.log(`  min ${min.map((v) => v.toFixed(3))} max ${max.map((v) => v.toFixed(3))} boyut (x,y,z) ${boyut}`);
  console.log(`  düğümler: ${(json.nodes ?? []).map((n) => n.name).filter(Boolean).slice(0, 12).join(", ")}${(json.nodes?.length ?? 0) > 12 ? " …" : ""}`);
  if (json.animations?.length) console.log(`  klipler: ${json.animations.map((a) => a.name).join(", ")}`);
}
