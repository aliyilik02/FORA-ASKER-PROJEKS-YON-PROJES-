#!/usr/bin/env node
/**
 * Oynatıcının güneş tahminini (apps/duvar-oynatici/src/sahne3b/gunes.ts) dosyadan çalıştırır; plan önizleme
 * aracı (plan-onizleme.py) panoramanın 256×128 RGBA küçük kopyasını ham dosya olarak verir, bu betik JSON basar.
 *   node araclar/gunes-tahmin.mjs <ham.rgba> [genislik=256] [yukseklik=128]
 * Node 22.6+ (tür ayıklama) .ts dosyasını doğrudan içe aktarır; oynatıcıyla birebir aynı algoritma.
 */
import { readFileSync } from "node:fs";
import { gunesTahmin } from "../apps/duvar-oynatici/src/sahne3b/gunes.ts";

const [yol, g = "256", y = "128"] = process.argv.slice(2);
if (!yol) {
  console.error("kullanım: node araclar/gunes-tahmin.mjs <ham.rgba> [genislik] [yukseklik]");
  process.exit(1);
}
const w = Number(g);
const h = Number(y);
const piksel = new Uint8ClampedArray(readFileSync(yol));
console.log(JSON.stringify(gunesTahmin(piksel, w, h)));
