// Klip ölçümü (12 Kasım): bir figür modelinin animasyon kliplerini tarayıcıda örnekleyip sayıya döker. Yeni bir klibi
// davranışa bağlamadan önce koş: süre, kalça yüksekliği (duruş: ayakta / diz / yerde), ellerin hareketi (hangi el
// çalışıyor: tüfek sağ elde, sağ eli sallayan klip tüfeği de sallar), doğal yürüme hızı (basan ayağın gövdeye göre hızı;
// + ileri, − geri), başın yeri. Tahminle yazılan hız ayak kaydırır, yanlış el tüfeği havaya diker.
//
//   KOPRU=http://127.0.0.1:4100 node araclar/oyun-testi/klip-olc.mjs [--klip komando_bere_bekleyen] [--ad "Reloading,Pull Heavy Object"]
//        [--json araclar/_goruntu/klip/olcum.json]
//
// --ad verilmezse modelin bütün klipleri ölçülür. Ayrı köprüde koş (sahneyi sıfırlar).
import fs from "node:fs";
import path from "node:path";
import { baslat, bekle } from "./cekirdek.mjs";

const arg = (ad, varsayilan) => {
  const i = process.argv.indexOf(`--${ad}`);
  return i > 0 && process.argv[i + 1] !== undefined && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : varsayilan;
};
const klip = arg("klip", "komando_bere_bekleyen");
const istenen = arg("ad", "").split(",").map((s) => s.trim()).filter(Boolean);

const c = await baslat({ genislik: 1920, sorgu: { gorsel: "sade", hareket: "kapali" }, cikti: "araclar/_goruntu/klip" });
try {
  await c.api("POST", "/sahne/sifirla", {});
  await c.api("PUT", "/bolge", { bolge: "kirsal_acik_arazi" });
  await c.hazirBekle();
  await bekle(2500);
  await c.figur({ islem: "oynat", id: "olcum", klip, azimut: 0 });
  await c.figurBekle("olcum");
  await bekle(800);
  const sonuc = await c.js((istenen) => {
    const THREE = window.duvar.THREE;
    const a = window.duvar.sahne3b.figurAktifBul("olcum");
    if (!a?.karistirici) return { hata: "figür ya da karıştırıcı yok" };
    const bul = (re) => {
      let b = null;
      a.icNesne.traverse((o) => {
        if (!b && o.isBone && re.test(o.name)) b = o;
      });
      return b;
    };
    const kemik = { kalca: bul(/hips$/i), solEl: bul(/left_?hand$/i), sagEl: bul(/right_?hand$/i), solAyak: bul(/left_?foot$/i), sagAyak: bul(/right_?foot$/i), bas: bul(/head$/i) };
    for (const [ad, k] of Object.entries(kemik)) if (!k) return { hata: `kemik yok: ${ad}` };
    const yerel = (k) => a.nesne.worldToLocal(k.getWorldPosition(new THREE.Vector3()));
    const m = a.karistirici;
    const klipler = a.klipler.filter((k) => !istenen.length || istenen.some((ad) => k.name === ad || k.name.endsWith("|" + ad)));
    const olcek = 1.8 / a.boy;
    const liste = [];
    for (const k of klipler) {
      m.stopAllAction();
      const e = m.clipAction(k);
      e.reset().setEffectiveWeight(1).play();
      const N = Math.max(24, Math.min(160, Math.round(k.duration * 30)));
      const ornek = [];
      for (let i = 0; i <= N; i++) {
        e.time = (k.duration * i) / N;
        m.update(0);
        a.nesne.updateMatrixWorld(true);
        ornek.push({ t: e.time, kalca: yerel(kemik.kalca), solEl: yerel(kemik.solEl), sagEl: yerel(kemik.sagEl), solAyak: yerel(kemik.solAyak), sagAyak: yerel(kemik.sagAyak), bas: yerel(kemik.bas) });
      }
      e.stop();
      const ort = (ad) => ornek.reduce((s, o) => s.add(o[ad]), new THREE.Vector3()).multiplyScalar(1 / ornek.length);
      const aralik = (ad) => {
        const o = ort(ad);
        return Math.max(...ornek.map((x) => x[ad].distanceTo(o)));
      };
      // El hareketi kalçaya göre (gövde sallanması sayılmasın)
      const elAraligi = (ad) => {
        const g = ornek.map((x) => x[ad].clone().sub(x.kalca));
        const o = g.reduce((s, v) => s.add(v), new THREE.Vector3()).multiplyScalar(1 / g.length);
        return Math.max(...g.map((v) => v.distanceTo(o)));
      };
      // Doğal hız: basan ayağın (en alçak 4 cm) gövdeye göre ileri-geri hızı; ileri yürüyüşte ayak geriye (−z) kayar
      const hizlar = [];
      for (const ayak of ["solAyak", "sagAyak"]) {
        const enAlt = Math.min(...ornek.map((x) => x[ayak].y));
        for (let i = 1; i < ornek.length; i++) {
          const p = ornek[i - 1], q = ornek[i];
          if (p[ayak].y - enAlt < 0.04 * (1 / olcek) && q[ayak].y - enAlt < 0.04 * (1 / olcek)) hizlar.push(-(q[ayak].z - p[ayak].z) / (q.t - p.t));
        }
      }
      hizlar.sort((x, y) => x - y);
      const medyan = hizlar.length ? hizlar[Math.floor(hizlar.length / 2)] : 0;
      const kalcaY = ornek.map((x) => x.kalca.y * olcek);
      const r = (v) => +(v * olcek).toFixed(2);
      liste.push({
        ad: k.name.split("|").pop(),
        sure: +k.duration.toFixed(2),
        kalcaY: [+Math.min(...kalcaY).toFixed(2), +Math.max(...kalcaY).toFixed(2)],
        kalcaBas: +kalcaY[0].toFixed(2),
        kalcaSon: +kalcaY[kalcaY.length - 1].toFixed(2),
        solEl: { y: r(ort("solEl").y), z: r(ort("solEl").z), hareket: r(elAraligi("solEl")) },
        sagEl: { y: r(ort("sagEl").y), z: r(ort("sagEl").z), hareket: r(elAraligi("sagEl")) },
        basY: r(ort("bas").y),
        basZ: r(ort("bas").z),
        kalcaKayma: r(aralik("kalca")),
        hiz: +(medyan * olcek).toFixed(2),
      });
    }
    m.stopAllAction();
    a.eylemBekle?.reset().setEffectiveWeight(1).play();
    return { boy: a.boy, liste };
  }, istenen);
  if (sonuc.hata) throw new Error(sonuc.hata);
  console.log(`${klip}: ${sonuc.liste.length} klip (1,8 m boya ölçeklenmiş; el y/z sarmal uzayında, hareket kalçaya göre en büyük sapma)`);
  console.log("klip".padEnd(30), "süre  kalça y (baş→son, min–max)   sol el y/z ±har   sağ el y/z ±har   baş y/z      hız m/sn");
  for (const k of sonuc.liste) {
    console.log(
      k.ad.padEnd(30),
      String(k.sure).padStart(5),
      ` ${k.kalcaBas.toFixed(2)}→${k.kalcaSon.toFixed(2)} (${k.kalcaY[0].toFixed(2)}–${k.kalcaY[1].toFixed(2)})`.padEnd(27),
      `${k.solEl.y.toFixed(2)}/${k.solEl.z.toFixed(2)} ±${k.solEl.hareket.toFixed(2)}`.padEnd(18),
      `${k.sagEl.y.toFixed(2)}/${k.sagEl.z.toFixed(2)} ±${k.sagEl.hareket.toFixed(2)}`.padEnd(18),
      `${k.basY.toFixed(2)}/${k.basZ.toFixed(2)}`.padEnd(12),
      k.hiz.toFixed(2),
    );
  }
  const json = arg("json", "araclar/_goruntu/klip/olcum.json");
  fs.mkdirSync(path.dirname(json), { recursive: true });
  fs.writeFileSync(json, JSON.stringify({ klip, ...sonuc }, null, 1));
  console.log("→", json);
} finally {
  await c.kapat();
}
