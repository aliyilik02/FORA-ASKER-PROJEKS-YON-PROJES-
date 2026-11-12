// Mevzi bulucunun çıktısını manifeste yazar (dusman-mevzi-bul.mjs → dusman-siluet.mjs ile gözle denetim → bu betik).
//
//   node araclar/oyun-testi/dusman-mevzi-yaz.mjs <bolge> [--dosya araclar/_goruntu/dusman/mevziler_<bolge>.json]
//
// `alanlar.<bolge>_film.dusmanMevzileri` (film görünümü, varsayılan) listenin tamamını alır. Temel plan
// (`alanlar.<bolge>`, `?gorsel=sade`) yalnız temel planda da bulunan yapılardaki mevzileri alır: film ekinin getirdiği
// yapılar (`sf_…`) sade görünümde yoktur, oradaki figür havada kalırdı. Manifestin geri kalan biçimi korunur
// (yalnız ilgili diziler değişir); mevzi başına bir satır.
import fs from "node:fs";
import path from "node:path";

const bolge = process.argv[2];
if (!bolge) {
  console.error("kullanım: node araclar/oyun-testi/dusman-mevzi-yaz.mjs <bolge> [--dosya <json>]");
  process.exit(1);
}
const di = process.argv.indexOf("--dosya");
const dosya = di > 0 ? process.argv[di + 1] : path.join("araclar/_goruntu/dusman", `mevziler_${bolge}.json`);
const mevziler = JSON.parse(fs.readFileSync(dosya, "utf8"));
const yol = "apps/duvar-oynatici/public/icerik/manifest.json";
let s = fs.readFileSync(yol, "utf8");
const satirSonu = s.includes("\r\n") ? "\r\n" : "\n";
const manifest = JSON.parse(s);

/** `bas`taki açılış ayracının eşini bulur (dizgi içlerini atlar). */
function esAyrac(metin, bas) {
  const ac = metin[bas];
  const kapa = ac === "{" ? "}" : "]";
  let derinlik = 0;
  let dizgi = false;
  for (let i = bas; i < metin.length; i++) {
    const c = metin[i];
    if (dizgi) {
      if (c === "\\") i++;
      else if (c === '"') dizgi = false;
      continue;
    }
    if (c === '"') dizgi = true;
    else if (c === ac) derinlik++;
    else if (c === kapa && --derinlik === 0) return i;
  }
  throw new Error("ayraç eşi yok");
}

function yaz(anahtar, liste) {
  if (!manifest.alanlar?.[anahtar]) {
    console.log(`  ${anahtar}: manifestte yok, atlandı`);
    return;
  }
  // "alanlar" nesnesinin içinde anahtarın nesnesi
  const alanlarBas = s.indexOf('"alanlar"');
  const m = new RegExp(`"${anahtar}"\\s*:\\s*\\{`).exec(s.slice(alanlarBas));
  if (!m) throw new Error(`${anahtar} metinde bulunamadı`);
  const nesneBas = alanlarBas + m.index + m[0].length - 1;
  const nesneSon = esAyrac(s, nesneBas);
  const govde = s.slice(nesneBas, nesneSon + 1);
  const girinti = "      ";
  const satirlar = liste.map((v) => `${girinti}  ${JSON.stringify(v)}`).join(`,${satirSonu}`);
  const dizi = liste.length ? `[${satirSonu}${satirlar}${satirSonu}${girinti}]` : "[]";
  // Yalnız bu nesnenin kendi (birinci düzey) dusmanMevzileri alanı
  let konum = -1;
  let derinlik = 0;
  let dizgi = false;
  for (let i = 0; i < govde.length; i++) {
    const c = govde[i];
    if (dizgi) {
      if (c === "\\") i++;
      else if (c === '"') dizgi = false;
      continue;
    }
    if (c === '"') {
      if (derinlik === 1 && govde.startsWith('"dusmanMevzileri"', i)) {
        konum = i;
        break;
      }
      dizgi = true;
    } else if (c === "{" || c === "[") derinlik++;
    else if (c === "}" || c === "]") derinlik--;
  }
  let yeniGovde;
  if (konum >= 0) {
    const diziBas = govde.indexOf("[", konum);
    const diziSon = esAyrac(govde, diziBas);
    yeniGovde = govde.slice(0, diziBas) + dizi + govde.slice(diziSon + 1);
  } else {
    // Alan yok: nesnenin sonuna eklenir
    const son = govde.lastIndexOf("}");
    const once = govde.slice(0, son).replace(/\s+$/, "");
    yeniGovde = `${once},${satirSonu}${girinti}"dusmanMevzileri": ${dizi}${satirSonu}    }`;
  }
  s = s.slice(0, nesneBas) + yeniGovde + s.slice(nesneSon + 1);
  console.log(`  ${anahtar}: ${liste.length} mevzi yazıldı`);
}

const temiz = mevziler.map(({ ad, x, z, y, siluet }) => ({ ad, x, z, y, siluet }));
const filmAnahtari = `${bolge}_film`;
const temelDosyalar = (manifest.alanlar?.[bolge]?.ogeler ?? []).map((o) => o.dosya.split("/").pop().replace(/\.glb$/, ""));
const kisa = (ad) => ad.replace(/^(bina_|sf_)/, "").replace(/_/g, " ");
// Mevzi adı "<yapı kısa adı> pencere|üst N m": temel plandaki yapılarla eşleşenler temel plana da yazılır
const temeldeki = temiz.filter((v) => temelDosyalar.some((d) => !d.startsWith("sf_") && v.ad.startsWith(kisa(d) + " ")));
console.log(`${bolge}: ${temiz.length} mevzi (${temeldeki.length} temel plandaki yapılarda)`);
if (manifest.alanlar?.[filmAnahtari]) {
  yaz(filmAnahtari, temiz);
  yaz(bolge, temeldeki);
} else yaz(bolge, temiz);
JSON.parse(s); // bozulmadığını doğrula
fs.writeFileSync(yol, s);
