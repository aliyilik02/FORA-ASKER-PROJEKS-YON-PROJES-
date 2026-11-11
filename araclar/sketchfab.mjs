// Sketchfab'dan ücretsiz lisanslı (CC0 / CC-BY) model arama ve indirme.
// Anahtar ortam değişkeninden okunur (depoya girmez): setx SKETCHFAB_TOKEN "<anahtar>"
//
//   node araclar/sketchfab.mjs ara "destroyed building" [--adet 12] [--enCokUcgen 400000] [--lisans cc0,by]
//   node araclar/sketchfab.mjs indir <uid> <klasör> [--ad dosya_adi]
//
// `ara` her satırda: uid · üçgen · GLB boyutu · lisans · beğeni · ad · yazar. `indir` GLB'yi (yoksa glTF zip'ini)
// klasöre yazar ve yanına <ad>.kaynak.json (ad, yazar, lisans, adres: atıf için) bırakır.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ANAHTAR = process.env.SKETCHFAB_TOKEN;
if (!ANAHTAR) {
  console.error('SKETCHFAB_TOKEN yok. Önce: setx SKETCHFAB_TOKEN "<anahtar>" (sonra yeni terminal)');
  process.exit(1);
}
const basliklar = { Authorization: `Token ${ANAHTAR}` };
const arg = (ad, varsayilan) => {
  const i = process.argv.indexOf(`--${ad}`);
  return i > 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : varsayilan;
};
const [, , komut, a1, a2] = process.argv;

async function json(url) {
  const y = await fetch(url, { headers: basliklar });
  if (!y.ok) throw new Error(`${y.status} ${y.statusText}: ${url}`);
  return y.json();
}

const mb = (b) => (b ? `${(b / 1048576).toFixed(1)} MB` : "?");

if (komut === "ara") {
  const adet = Number(arg("adet", 12));
  const enCok = Number(arg("enCokUcgen", 0));
  const sonuc = [];
  for (const lisans of arg("lisans", "cc0,by").split(",")) {
    const s = new URLSearchParams({ type: "models", q: a1, downloadable: "true", count: "24", sort_by: "-likeCount", license: lisans, archives_flavours: "false" });
    if (enCok) s.set("max_face_count", String(enCok));
    const j = await json(`https://api.sketchfab.com/v3/search?${s}`);
    for (const m of j.results ?? []) sonuc.push({ ...m, _lisans: lisans });
  }
  sonuc.sort((x, y) => (y.likeCount ?? 0) - (x.likeCount ?? 0));
  for (const m of sonuc.slice(0, adet)) {
    const glb = m.archives?.glb;
    console.log([m.uid, `${Math.round((m.faceCount ?? 0) / 1000)}k`, mb(glb?.size), m._lisans, `♥${m.likeCount}`, m.name.slice(0, 60), `(${m.user?.username})`].join(" · "));
  }
  if (!sonuc.length) console.log("sonuç yok");
} else if (komut === "indir") {
  const m = await json(`https://api.sketchfab.com/v3/models/${a1}`);
  const d = await json(`https://api.sketchfab.com/v3/models/${a1}/download`);
  const kaynak = d.glb ?? d.gltf;
  if (!kaynak?.url) throw new Error("indirilebilir GLB/glTF yok");
  const uzanti = d.glb ? "glb" : "zip";
  const ad = arg("ad", m.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || a1);
  mkdirSync(a2, { recursive: true });
  const veri = Buffer.from(await (await fetch(kaynak.url)).arrayBuffer());
  writeFileSync(join(a2, `${ad}.${uzanti}`), veri);
  writeFileSync(join(a2, `${ad}.kaynak.json`), JSON.stringify({ ad: m.name, yazar: m.user?.displayName ?? m.user?.username, lisans: m.license?.label, adres: m.viewerUrl, uid: m.uid, ucgen: m.faceCount }, null, 2));
  console.log(`${ad}.${uzanti} · ${mb(veri.length)} · ${m.faceCount} üçgen · ${m.license?.label} · ${m.user?.username}`);
} else {
  console.log('Kullanım: sketchfab.mjs ara "<sorgu>" | indir <uid> <klasör>');
}
