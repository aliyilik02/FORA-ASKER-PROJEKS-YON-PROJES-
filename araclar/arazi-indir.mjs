#!/usr/bin/env node
/**
 * 3B arazi içeriğini (Poly Haven CC0: zemin dokuları 2K JPG, kaya/çimen/çalı glTF 1K) indirir.
 * Liste: araclar/arazi-indir-listesi.txt ("hedefYol url boyut"). Hedef: apps/duvar-oynatici/public/icerik/arazi/
 * Var olan dosyalar atlanır. Oyun bilgisayarına taşırken icerik/ klasörünü kopyalamak yeterli; bu betik yedek.
 *   node araclar/arazi-indir.mjs
 */
import { createWriteStream, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";

const kok = fileURLToPath(new URL("..", import.meta.url));
const hedefKok = join(kok, "apps", "duvar-oynatici", "public", "icerik", "arazi");
const liste = readFileSync(join(kok, "araclar", "arazi-indir-listesi.txt"), "utf8")
  .split(/\r?\n/)
  .filter((s) => s && !s.startsWith("#"))
  .map((s) => {
    const [yol, url, boyut] = s.split(" ");
    return { yol, url, boyut: Number(boyut) };
  });
let indirilen = 0;
for (const { yol, url, boyut } of liste) {
  const hedef = join(hedefKok, yol);
  if (existsSync(hedef) && statSync(hedef).size === boyut) continue;
  mkdirSync(dirname(hedef), { recursive: true });
  const yanit = await fetch(url, { headers: { "user-agent": "duvar-simulasyonu/1.0" } });
  if (!yanit.ok || !yanit.body) {
    console.error("HATA", yol, yanit.status);
    continue;
  }
  await pipeline(yanit.body, createWriteStream(hedef));
  indirilen++;
  console.log("indirildi", yol, Math.round(boyut / 1024) + " KB");
}
console.log(`tamam: ${indirilen} dosya indirildi, ${liste.length - indirilen} zaten vardı`);
