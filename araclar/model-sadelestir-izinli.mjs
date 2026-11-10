// Dikiş geçirgen sadeleştirme (10 Kasım): meshoptimizer ≥ 1.1 `simplifyWithAttributes` + "Permissive" (doku dikişleri
// boyunca da çöker; Meshy topluluk modellerinin binlerce UV adalı atlasında eski yol kilitleniyordu: 2 M üçgenlik moloz
// 40 bin hedefinde 2 M'de kalmıştı) + "Prune" (kopuk küçük kırıntılar atılır). UV ve normal öznitelik olarak ağırlıklı:
// doku kayması sınırlı; özgün UV ve dokular korunur (yeniden pişirme yok: Blender pişirmesi ayrık parçalı molozda
// kara/kırık porselen çıkıyordu). `--hata` (göreli, varsayılan 0,01) kalite tavanı: hedefe inmek daha büyük bozulma
// gerektiriyorsa sadeleştirme orada durur.
//
//   node araclar/model-sadelestir-izinli.mjs <girdi.glb> <cikti.glb> --ucgen 60000 [--hata 0.01]
//   node araclar/model-sadelestir-izinli.mjs --yapilandirma araclar/alan-agir-modeller.json --kaynak meshy_output/alan_yedek_10kasim [no...]
//     (yapılandırmadaki her model: kaynak/<ad>.glb → cikti şablonu; hedef "ucgen", varsa "hata"; girdi zaten ölçekli/
//      dokusu sıkıştırılmış çıktıdır, yalnız üçgen azalır)
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, weld } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const arg = process.argv.slice(2);
const secenek = (ad, varsayilan) => (arg.includes(`--${ad}`) ? arg[arg.indexOf(`--${ad}`) + 1] : varsayilan);
await MeshoptSimplifier.ready;
if (!MeshoptSimplifier.supported) throw new Error("meshoptimizer desteklenmiyor");

/** Bir dosyayı sadeleştirir; [önce, sonra] üçgen. */
async function sadelestir(girdi, cikti, hedef, hata) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const belge = await io.read(girdi);
  await belge.transform(weld());
  const primler = belge.getRoot().listMeshes().flatMap((m) => m.listPrimitives()).filter((p) => p.getIndices() && p.getMode() === 4);
  let once = 0;
  for (const p of primler) once += p.getIndices().getCount() / 3;
  const oran = Math.min(1, hedef / Math.max(1, once));
  let sonra = 0;
  for (const p of primler) {
    const ind = p.getIndices();
    const pos = p.getAttribute("POSITION");
    const uv = p.getAttribute("TEXCOORD_0");
    const nrm = p.getAttribute("NORMAL");
    const n = pos.getCount();
    const konum = new Float32Array(n * 3);
    const oz = new Float32Array(n * 5);
    const a = [0, 0];
    const b = [0, 0, 0];
    const e = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      pos.getElement(i, e);
      konum.set(e, i * 3);
      if (uv) uv.getElement(i, a);
      if (nrm) nrm.getElement(i, b);
      oz[i * 5] = a[0];
      oz[i * 5 + 1] = a[1];
      oz[i * 5 + 2] = b[0];
      oz[i * 5 + 3] = b[1];
      oz[i * 5 + 4] = b[2];
    }
    const indeks = new Uint32Array(ind.getArray());
    if (oran >= 1) {
      sonra += indeks.length / 3;
      continue;
    }
    const hedefIndeks = Math.max(3, Math.floor((indeks.length * oran) / 3) * 3);
    // Ağırlık: UV 1 (doku kaymasın), normal 0,4 (keskin kenar)
    const [yeni] = MeshoptSimplifier.simplifyWithAttributes(indeks, konum, 3, oz, 5, [1, 1, 0.4, 0.4, 0.4], null, hedefIndeks, hata, ["Permissive", "Prune"]);
    ind.setArray(n > 65535 ? yeni : new Uint16Array(yeni));
    sonra += yeni.length / 3;
  }
  await belge.transform(prune(), dedup());
  await io.write(cikti, belge);
  return [once, sonra];
}

const yapilandirmaYolu = secenek("yapilandirma");
if (yapilandirmaYolu) {
  const kok = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const y = JSON.parse(readFileSync(path.resolve(kok, yapilandirmaYolu), "utf8"));
  const kaynak = path.resolve(kok, secenek("kaynak", "meshy_output/alan_yedek_10kasim"));
  const secili = new Set(arg.filter((s) => /^\d+$/.test(s)).map(Number));
  let topOnce = 0;
  let topSonra = 0;
  for (const m of y.modeller) {
    if (secili.size && !secili.has(m.no)) continue;
    const girdi = path.join(kaynak, `${m.ad}.glb`);
    if (!existsSync(girdi)) {
      console.log(`YOK   #${m.no} ${girdi}`);
      continue;
    }
    const cikti = path.resolve(kok, y.cikti.replace("{ad}", m.ad));
    const bas = Date.now();
    const [once, sonra] = await sadelestir(girdi, cikti, m.ucgen, m.hata ?? Number(secenek("hata", 0.01)));
    topOnce += once;
    topSonra += sonra;
    console.log(`HAZIR #${m.no} ${m.ad}: ${once} → ${sonra} üçgen (hedef ${m.ucgen}) · ${(statSync(cikti).size / 1e6).toFixed(1)} MB · ${((Date.now() - bas) / 1000).toFixed(0)} sn`);
  }
  console.log(`Toplam ${topOnce} → ${topSonra} üçgen`);
} else {
  const [girdi, cikti] = arg.filter((s) => !s.startsWith("--") && !/^\d+(\.\d+)?$/.test(s));
  if (!girdi || !cikti) throw new Error("kullanım: <girdi.glb> <cikti.glb> --ucgen N [--hata 0.01]");
  const [once, sonra] = await sadelestir(girdi, cikti, Number(secenek("ucgen", 50000)), Number(secenek("hata", 0.01)));
  console.log(`HAZIR ${cikti}: ${once} → ${sonra} üçgen`);
}
