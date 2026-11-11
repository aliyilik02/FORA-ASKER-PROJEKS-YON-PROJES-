#!/usr/bin/env node
/**
 * Çok atışlı silah kayıtlarından tek atışlık kesimler üretir (sesler/silah_tek_<n>.ogg). Oynatıcı çatışmada her atışta
 * manifestteki `sesler.gurultu` listesinden bir kayıt çalar (ses.ts tekAtis; "gürültü" efekti 6–10'unu art arda);
 * özgün dosyalar (silah_mosin.ogg 14,7 sn / 5 atış, silah_sks.ogg 15,5 sn / ~14 tepe) her atışta baştan sona çalınınca
 * çatışmada ~100 eşzamanlı kaynak birikiyor, kapattıktan sonra 15 sn ateş sürüyordu.
 *
 * Başlangıçlar zarf ölçümünden (5 ms tepe, 50 ms RMS; 2 Kasım 2026): Mosin'de her atıştan ~1 sn sonra mekanizma (sürgü)
 * sesi başlıyor, kesim 1,05 sn; SKS'de seyrek atışlarda yankı ~1,5 sn'de taban gürültüsüne iniyor, kesim 1,4 sn. Sonlar
 * yumuşak söner (tık sesi yok), başta 4 ms giriş. Özgün dosyalar silinmez.
 *
 *   node araclar/silah-tek-atis.mjs                 (içerik: apps/duvar-oynatici/public/icerik/sesler)
 *   node araclar/silah-tek-atis.mjs <sesler klasörü> [--zorla]
 *
 * Lisans: Vincent Sevedge (2009), CC BY 3.0 — atıf manifest `sesler._kaynak` ve sesler/LISANS_tabasco_silah_CC-BY-3.0.txt.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const kok = fileURLToPath(new URL("..", import.meta.url));
const argumanlar = process.argv.slice(2);
const zorla = argumanlar.includes("--zorla");
const klasor = argumanlar.find((a) => !a.startsWith("--")) ?? join(kok, "apps", "duvar-oynatici", "public", "icerik", "sesler");

/** [kaynak, başlangıç (sn), uzunluk (sn), sönüm (sn)]; başlangıç atışın 15 ms öncesi. */
const KESIMLER = [
  ["silah_mosin.ogg", 0.42, 1.05, 0.3],
  ["silah_mosin.ogg", 3.545, 1.05, 0.3],
  ["silah_mosin.ogg", 5.965, 1.05, 0.3],
  ["silah_mosin.ogg", 8.83, 1.05, 0.3],
  ["silah_sks.ogg", 0.33, 1.4, 0.45],
  ["silah_sks.ogg", 5.985, 1.4, 0.45],
  ["silah_sks.ogg", 7.69, 1.4, 0.45],
  ["silah_sks.ogg", 9.7, 1.4, 0.45],
];

const sure = (dosya) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", dosya]).toString().trim());

let yazilan = 0;
KESIMLER.forEach(([kaynak, bas, uzunluk, sonum], i) => {
  const giris = join(klasor, kaynak);
  const cikis = join(klasor, `silah_tek_${i + 1}.ogg`);
  if (!existsSync(giris)) {
    console.error(`yok: ${giris}`);
    process.exitCode = 1;
    return;
  }
  if (existsSync(cikis) && !zorla) {
    console.log(`var (atlandı, yeniden üretmek için --zorla): ${cikis}`);
    return;
  }
  // Kesim filtre grafiğinde (atrim + asetpts): çıkış tarafındaki -ss'te afade zamanları kaynağın zaman çizgisinde kalır,
  // kesimin çoğu sessiz çıkar. Burada zaman kesimin başından sayılır.
  execFileSync("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error",
    "-i", giris,
    "-af", `atrim=start=${bas}:duration=${uzunluk},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.004,afade=t=out:st=${(uzunluk - sonum).toFixed(3)}:d=${sonum}`,
    "-c:a", "libvorbis", "-q:a", "5",
    cikis,
  ]);
  yazilan++;
  console.log(`${cikis}  ←  ${kaynak} @ ${bas} sn, ${sure(cikis).toFixed(2)} sn`);
});
console.log(`${yazilan} tek atış yazıldı (${klasor}). Manifest: sesler.gurultu = ["silah_tek_1.ogg", …, "silah_tek_${KESIMLER.length}.ogg"]`);
