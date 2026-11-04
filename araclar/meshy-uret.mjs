/**
 * Meshy CLI ile model üretim sürücüsü: `meshy_output/plan.json` listesindeki modelleri üretir, indirir.
 * Kaldığı yerden sürer (`meshy_output/durum.json`), her adımı tek kez öder.
 *
 *   node araclar/meshy-uret.mjs [--kod F2,T1] [--eszamanli 4]
 *
 * nesne: text-to-3d preview (poligon hedefi) → refine (PBR 2K) → GLB + önizleme
 * asker: text-to-image (A-poz) → image-to-3d (A-poz, PBR 2K) → remesh 30K → rigging → rigli GLB/FBX + önizleme
 * Çıktılar: meshy_output/<kod>/ (proje kayıtları, task_*.json, dosyalar).
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import path from "node:path";

const KOK = path.resolve("meshy_output");
const PLAN = JSON.parse(readFileSync(path.join(KOK, "plan.json"), "utf8"));
const arg = process.argv.slice(2);
const kodlar = arg.includes("--kod") ? arg[arg.indexOf("--kod") + 1].split(",") : null;
const eszamanli = arg.includes("--eszamanli") ? Number(arg[arg.indexOf("--eszamanli") + 1]) : 4;
const ORTAK = ["--output-schema", "v1", "--format", "json", "--no-update-check"];

// Durum model başına ayrı dosyada (meshy_output/<kod>/durum.json): paralel/ardışık süreçler birbirini ezmez.
const durumYolu = (kod) => path.join(KOK, kod, "durum.json");
const durum = {};
for (const m of PLAN.modeller) if (existsSync(durumYolu(m.kod))) durum[m.kod] = JSON.parse(readFileSync(durumYolu(m.kod), "utf8"));

function kaydet() {
  for (const [kod, d] of Object.entries(durum)) {
    mkdirSync(path.join(KOK, kod), { recursive: true });
    writeFileSync(durumYolu(kod), JSON.stringify(d, null, 1));
  }
}
function gunluk(s) {
  const satir = `[${new Date().toISOString().slice(11, 19)}] ${s}`;
  console.log(satir);
  appendFileSync(path.join(KOK, "gunluk.txt"), satir + "\n");
}

/** Tek CLI çağrısı; stdout'taki v1 JSON zarfı çözülür. Metin argümanları tırnaklanır (shell: true). */
function meshy(args) {
  const tirnakla = (a) => (/^[\w.,:=\-\/\\]+$/.test(a) ? a : `"${String(a).replace(/"/g, '\\"')}"`);
  return new Promise((coz) => {
    const p = spawn("npm", ["exec", "--yes", "--package=meshy-cli@0.4.0", "--", "meshy", ...args.map(tirnakla), ...ORTAK], { shell: true, windowsHide: true });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (kod) => {
      let json = null;
      try {
        json = JSON.parse(out.slice(out.indexOf("{")));
      } catch {
        /* JSON değil */
      }
      coz({ kod, json, out, err });
    });
  });
}

async function adim(m, ad, fn) {
  const d = (durum[m.kod] ??= {});
  if (d[ad]?.tamam) return d[ad];
  gunluk(`${m.kod} ${ad} başlıyor`);
  const sonuc = await fn(d);
  d[ad] = { ...sonuc, tamam: true };
  kaydet();
  gunluk(`${m.kod} ${ad} tamam ${JSON.stringify(sonuc).slice(0, 160)}`);
  return d[ad];
}

function hata(m, ad, r) {
  const mesaj = r.json?.error ? JSON.stringify(r.json.error) : (r.err || r.out).slice(-400);
  throw new Error(`${m.kod} ${ad} başarısız (çıkış ${r.kod}): ${mesaj}`);
}

async function olustur(m, d, kaynak, args, asama) {
  const proje = d.proje?.dizin;
  const r = await meshy([kaynak, "create", ...args, "--async", ...(proje ? ["--project", proje, "--stage", asama, "--workspace", KOK] : [])]);
  if (!r.json?.ok) hata(m, `${kaynak} create`, r);
  const id = r.json.result.submission?.task_id ?? r.json.result.task_id;
  if (!proje) {
    const i = await meshy(["project", "init", "--root", path.join(KOK, m.kod), "--name", m.kod, "--task-id", id, "--task-type", kaynak, "--workspace", KOK]);
    if (!i.json?.ok) hata(m, "project init", i);
    d.proje = { dizin: i.json.result.project_dir };
    kaydet();
  }
  return id;
}

async function bekle(m, d, kaynak, id, asama) {
  for (let deneme = 0; deneme < 6; deneme++) {
    const r = await meshy([kaynak, "wait", id, "--timeout", "900", "--project", d.proje.dizin, "--stage", asama, "--workspace", KOK]);
    if (r.kod === 8) {
      gunluk(`${m.kod} ${asama} zaman aşımı, sürüyor`);
      continue;
    }
    const yol = path.join(d.proje.dizin, `task_${id}.json`);
    const gorev = existsSync(yol) ? JSON.parse(readFileSync(yol, "utf8")) : {};
    const durumMetni = gorev.status ?? gorev.task?.status ?? r.json?.result?.status;
    if (!r.json?.ok || durumMetni !== "SUCCEEDED") {
      throw new Error(`${m.kod} ${asama} görev durumu ${durumMetni}: ${JSON.stringify(gorev.task_error ?? r.json?.error ?? r.err.slice(-200))}`.slice(0, 400));
    }
    return { id, kredi: gorev.consumed_credits ?? null };
  }
  throw new Error(`${m.kod} ${asama} 6 bekleme sonrası bitmedi`);
}

async function indir(m, d, id, secim, cikti, asama) {
  const r = await meshy(["download", "--task-json", path.join(d.proje.dizin, `task_${id}.json`), ...secim, "--output", cikti, "--overwrite", "--project", d.proje.dizin, "--stage", asama, "--workspace", KOK]);
  if (!r.json?.ok) hata(m, `download ${path.basename(cikti)}`, r);
  return cikti;
}

async function nesne(m) {
  const d = (durum[m.kod] ??= {});
  // Ek alanlar dosyadan (@dosya): kabuk tırnaklaması JSON'u bozmasın (pilotta satır içi JSON'la poligon hedefi uygulanmadı)
  const ekYolu = path.join(KOK, m.kod, "ek.json");
  mkdirSync(path.join(KOK, m.kod), { recursive: true });
  writeFileSync(ekYolu, JSON.stringify({ target_polycount: m.ucgen, topology: "triangle", symmetry_mode: "auto" }));
  const on = await adim(m, "onizleme", async () => ({ id: await olustur(m, d, "text-to-3d", ["--mode", "preview", "--prompt", m.prompt, "--target-formats", "glb", "--data", `@${ekYolu}`], "preview") }));
  await adim(m, "onizleme_bekle", () => bekle(m, d, "text-to-3d", on.id, "preview"));
  const rf = await adim(m, "refine", async () => ({ id: await olustur(m, d, "text-to-3d", ["--mode", "refine", "--preview-task-id", on.id, "--enable-pbr", "true", "--texture-resolution", "2k", "--target-formats", "glb"], "refine") }));
  await adim(m, "refine_bekle", () => bekle(m, d, "text-to-3d", rf.id, "refine"));
  await adim(m, "indir", async () => ({
    glb: await indir(m, d, rf.id, ["--model-format", "glb"], path.join(KOK, m.kod, m.dosya), "delivered"),
    onizleme: await indir(m, d, rf.id, ["--asset", "thumbnail.primary"], path.join(KOK, m.kod, "onizleme.png"), "preview"),
  }));
}

async function asker(m) {
  const d = (durum[m.kod] ??= {});
  const prompt = `${m.prompt} ${PLAN.gorsel_asker}`.slice(0, 1200);
  const im = await adim(m, "gorsel", async () => ({ id: await olustur(m, d, "text-to-image", ["--ai-model", "gpt-image-2", "--prompt", prompt, "--pose-mode", "a-pose"], "image") }));
  await adim(m, "gorsel_bekle", () => bekle(m, d, "text-to-image", im.id, "image"));
  await adim(m, "gorsel_indir", async () => {
    const r = await meshy(["download", "--task-json", path.join(d.proje.dizin, `task_${im.id}.json`), "--kind", "image", "--output-dir", path.join(KOK, m.kod, "gorsel"), "--overwrite", "--project", d.proje.dizin, "--stage", "image", "--workspace", KOK]);
    return { ok: Boolean(r.json?.ok), hata: r.json?.ok ? null : JSON.stringify(r.json?.error ?? r.err).slice(0, 200) };
  });
  const g = await adim(m, "geometri", async () => ({ id: await olustur(m, d, "image-to-3d", ["--input-task-id", im.id, "--model-type", "standard", "--should-texture", "true", "--enable-pbr", "true", "--texture-resolution", "2k", "--pose-mode", "a-pose", "--target-formats", "glb"], "geometry") }));
  await adim(m, "geometri_bekle", () => bekle(m, d, "image-to-3d", g.id, "geometry"));
  await adim(m, "geometri_indir", async () => ({
    glb: await indir(m, d, g.id, ["--model-format", "glb"], path.join(KOK, m.kod, "dokulu_ham.glb"), "geometry"),
    onizleme: await indir(m, d, g.id, ["--asset", "thumbnail.primary"], path.join(KOK, m.kod, "onizleme.png"), "preview"),
  }));
  const rm = await adim(m, "remesh", async () => ({ id: await olustur(m, d, "remesh", ["--input-task-id", g.id, "--topology", "triangle", "--target-polycount", "30000", "--target-formats", "glb,fbx"], "remesh") }));
  await adim(m, "remesh_bekle", () => bekle(m, d, "remesh", rm.id, "remesh"));
  const rg = await adim(m, "rig", async () => {
    try {
      return { id: await olustur(m, d, "rigging", ["--input-task-id", rm.id, "--height-meters", String(m.boy_m ?? 1.8)], "rigging"), kaynak: "remesh" };
    } catch (e) {
      gunluk(`${m.kod} remesh görevi rig'e alınmadı (${e.message.slice(0, 120)}); dokulu görevle deneniyor`);
      return { id: await olustur(m, d, "rigging", ["--input-task-id", g.id, "--height-meters", String(m.boy_m ?? 1.8)], "rigging"), kaynak: "geometri" };
    }
  });
  await adim(m, "rig_bekle", () => bekle(m, d, "rigging", rg.id, "rigging"));
  await adim(m, "rig_indir", async () => {
    const liste = await meshy(["download", "--task-json", path.join(d.proje.dizin, `task_${rg.id}.json`), "--list"]);
    const anahtarlar = JSON.stringify(liste.json?.result ?? {});
    const sonuc = { anahtarlar: anahtarlar.slice(0, 600) };
    sonuc.glb = await indir(m, d, rg.id, ["--asset", "result.rigged_character_glb_url"], path.join(KOK, m.kod, m.dosya.replace(/\.glb$/, "_rigli.glb")), "rigging");
    if (anahtarlar.includes("rigged_character_fbx_url")) {
      sonuc.fbx = await indir(m, d, rg.id, ["--asset", "result.rigged_character_fbx_url"], path.join(KOK, m.kod, m.dosya.replace(/\.glb$/, "_rigli.fbx")), "rigging");
    }
    return sonuc;
  });
}

const secilen = PLAN.modeller.filter((m) => !kodlar || kodlar.includes(m.kod));
mkdirSync(KOK, { recursive: true });
gunluk(`Başlıyor: ${secilen.map((m) => m.kod).join(", ")} (eş zamanlı ${eszamanli})`);
const kuyruk = [...secilen];
const sonuclar = {};
async function isci() {
  for (let m; (m = kuyruk.shift()); ) {
    mkdirSync(path.join(KOK, m.kod), { recursive: true });
    try {
      await (m.tur === "asker" ? asker(m) : nesne(m));
      sonuclar[m.kod] = "tamam";
    } catch (e) {
      sonuclar[m.kod] = e.message;
      gunluk(`HATA ${e.message}`);
    }
  }
}
await Promise.all(Array.from({ length: Math.min(eszamanli, secilen.length) }, isci));
gunluk("Özet: " + JSON.stringify(sonuclar));
