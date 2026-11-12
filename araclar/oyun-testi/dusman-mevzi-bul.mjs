// Düşman mevzisi bulucu (Playwright): alan yapılarının gerçek geometrisinden siluetli mevzi önerir.
//
// Neden: mevzi "cephenin 0,5 m önü, tahmini pencere yüksekliği" diye elle yazılınca figür havada kalıyor ya da duvarın
// içinde kayboluyor (Meshy binalarının duvarı sınır kutusunun 1–4 m gerisinde, pencereleri gerçek boşluk). Bu araç:
//   1. Tarama: her yapının izleyiciye bakan kutu yüzünden içeri yatay ışınlar (0,5 × 0,25 m ızgara) → derinlik haritası
//      (yavaş: bina başına ~1 dk; `araclar/_goruntu/dusman/derinlik_<bolge>.json` önbelleği, yapı değişmedikçe yeniden yapılmaz).
//   2. Aday: haritada duvar düzleminden ≥ 1 m derin hücre öbekleri = pencere/yıkık boşluğu; sütunların duvar tepesi = çatı
//      kenarı / kaya tepesi. Figür duvarın 0,5 m gerisine (binanın içine), göz hattı boşluğun ortasından geçecek yere konur.
//   3. Doğrulama: izleyicinin gözünden figürün durduğu düşey hatta ışınlar → örtü çizgisi (görünmeye başladığı yükseklik)
//      ve görünür bant; namlu ucu ve omuzlar da görünmeli.
//      Figürün başı duvarların görüş alanında (üç duvar kamerası) kalmalı: yakın yüksek çatı ekranın üstünde kalır.
//   4. Seçim: izleyiciden ≥ 20 m, ≥ 2,2 m yüksek yapılarda (araç ve dost yapısı değil: `--haric`); yapılar sırayla birer aday alır (uzak
//      binalar da pay alır), aynı yapıda farklı tür/kat öne geçer → manifest `dusmanMevzileri` satırları.
//
//   KOPRU=http://127.0.0.1:4100 node araclar/oyun-testi/dusman-mevzi-bul.mjs <bolge> [--yapiBasina 3] [--enCok 36]
//        [--enAzYukseklik 1.1] [--yenidenTara] [--enUzak 130] [--enYakin 20] [--secim] [--haric "<düzenli ifade>"]
//
// --secim: doğrulanmış adaylar önbellekten (adaylar_<bolge>.json) alınır, yalnız seçim yeniden yapılır (tarayıcısız).
//
// Çıktı: araclar/_goruntu/dusman/mevziler_<bolge>.json (dusman-siluet.mjs --mevziler ile gözle denetlenir, sonra
// manifestin `alanlar.<bolge>[_film].dusmanMevzileri` alanına yapıştırılır). Film görünümünün planı taranır.
import fs from "node:fs";
import path from "node:path";
import { baslat, bekle } from "./cekirdek.mjs";

const arg = (ad, varsayilan) => {
  const i = process.argv.indexOf(`--${ad}`);
  return i > 0 && process.argv[i + 1] !== undefined && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : varsayilan;
};
const bayrak = (ad) => process.argv.includes(`--${ad}`);
const bolge = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "meskun_mahal";
const YAPI_BASINA = Number(arg("yapiBasina", "3"));
const EN_COK = Number(arg("enCok", "36"));
const EN_YAKIN = Number(arg("enYakin", "20"));
const EN_AZ_YAPI = Number(arg("enAzYapi", "2.2"));
/** Dost yapıları düşman mevzisi olmaz (gözetleme kulesi, askerî araç, nöbetçi kulübesi, kum torbası, T-duvar…). */
const HARIC = new RegExp(arg("haric", "gozetleme|askeri|nobet|kulube|kum_torbasi|t_duvar|konteyner|jenerator|kirpi|hesco|otomobil|minibus|otobus|kamyon|pikap|arac_|dire[kg]|lamba|bayrak"), "i");
const EN_AZ_YUK = Number(arg("enAzYukseklik", "1.1"));
const EN_UZAK = Number(arg("enUzak", "130"));
const DU = 0.5;
const DY = 0.25;
/** Figür duvar düzleminin bu kadar gerisinde durur (m). */
const GERI = 0.5;
const klasor = path.resolve("araclar/_goruntu/dusman");
fs.mkdirSync(klasor, { recursive: true });
const onbellekDosyasi = path.join(klasor, `derinlik_${bolge}.json`);
const adayDosyasi = path.join(klasor, `adaylar_${bolge}.json`);

/** 4. Seçim: doğrulanmış adaylardan mevzi listesi (tarayıcı gerekmez). */
function sec(dogrulanan) {
  // Örtü çizgisi zeminden en az 0,75 m yukarıda olmalı: daha alçağında (kapı eşiği, açık zemin) figürün kökü zeminin
  // çok altına düşer, bele kadar toprağa gömülü görünür
  const uygun = dogrulanan.filter((a) => a.mesafe >= EN_YAKIN && a.yapiYuk >= EN_AZ_YAPI && !HARIC.test(a.yapi) && a.ortu - a.zemin >= 0.75);
  // Aday puanı: görünür bant (1,2 m'ye kadar), iki omuz, pencere çatıdan biraz önde
  for (const a of uygun) a.puan = Math.min(1.2, a.bant) + 0.3 * a.omuz + (a.tur === "pencere" ? 0.25 : 0);
  const gruplar = new Map();
  for (const a of uygun) {
    if (!gruplar.has(a.yapiNo)) gruplar.set(a.yapiNo, []);
    gruplar.get(a.yapiNo).push(a);
  }
  const secilen = [];
  // Yapılar sırayla birer aday alır (her yapı ilk turda bir mevzi, sonra ikinci…): uzak binalar da pay alır
  const sira = [...gruplar.values()].sort((p, q) => Math.min(...p.map((a) => a.mesafe)) - Math.min(...q.map((a) => a.mesafe)));
  for (let tur = 0; tur < YAPI_BASINA && secilen.length < EN_COK; tur++) {
    for (const liste of sira) {
      if (secilen.length >= EN_COK) break;
      const benim = secilen.filter((b) => b.yapiNo === liste[0].yapiNo);
      let en = null;
      let enPuan = -Infinity;
      for (const a of liste) {
        if (secilen.some((b) => Math.hypot(b.x - a.x, b.ortu - a.ortu, b.z - a.z) < 3.5)) continue;
        // Aynı yapıda çeşitlilik: farklı tür ve farklı kat öne geçer
        let p = a.puan;
        for (const b of benim) p += (b.tur !== a.tur ? 0.4 : 0) + Math.min(0.5, Math.abs(b.ortu - a.ortu) * 0.12) + Math.min(0.3, Math.hypot(b.x - a.x, b.z - a.z) * 0.03);
        if (p > enPuan) {
          enPuan = p;
          en = a;
        }
      }
      if (en) secilen.push(en);
    }
  }
  secilen.sort((a, b) => a.azimut - b.azimut);
  const kisa = (ad) => ad.replace(/^(bina_|sf_)/, "").replace(/_/g, " ");
  const mevziler = secilen.map((a) => ({
    ad: `${kisa(a.yapi)} ${a.tur === "pencere" ? "pencere" : "üst"} ${Math.max(0, a.ortu - a.zemin).toFixed(0)} m`,
    x: +a.x.toFixed(2),
    z: +a.z.toFixed(2),
    y: +(a.ortu - a.zemin).toFixed(2),
    siluet: true,
  }));
  const cikti = path.join(klasor, `mevziler_${bolge}.json`);
  fs.writeFileSync(cikti, JSON.stringify(mevziler, null, 1));
  console.log(`${dogrulanan.length} geçerli aday (${uygun.length} uygun, ${gruplar.size} yapı) → ${mevziler.length} mevzi: ${cikti}`);
  for (const [i, a] of secilen.entries()) console.log(`  ${String(i).padStart(2)} ${mevziler[i].ad.padEnd(34)} az ${a.azimut.toFixed(0).padStart(4)}  ${a.mesafe.toFixed(0).padStart(3)} m  bant ${a.bant}  omuz ${a.omuz}`);
}

if (bayrak("secim")) {
  sec(JSON.parse(fs.readFileSync(adayDosyasi, "utf8")));
  process.exit(0);
}

const t = await baslat({ cikti: "araclar/_goruntu/dusman", sorgu: { gorsel: "film", dusman: "kapali" } });
try {
  await t.api("POST", "/sahne/sifirla", { kaynak: "panel" });
  await t.api("PATCH", "/ortam", { mevsim: "yaz", saat: 12, yagis: "yok", sis: 0, bulut: 0.2, simsek: false });
  await t.api("PUT", "/bolge", { bolge });
  await t.hazirBekle();
  await bekle(6000);

  // --- Yapılar: yeterince yüksek, direk/lamba ve çatı eşyası olmayan alan öğeleri ---
  const yapilar = await t.js(
    ({ enAzYuk, enUzak }) => {
      const s = window.duvar.sahne3b;
      return s.alan.izler
        .map((iz, no) => {
          const k = iz.kutu;
          const en = Math.min(k.max.x - k.min.x, k.max.z - k.min.z);
          const boy = Math.max(k.max.x - k.min.x, k.max.z - k.min.z);
          const yuk = k.max.y - k.min.y;
          const yakin = Math.hypot(Math.max(k.min.x, Math.min(0, k.max.x)), Math.max(k.min.z, Math.min(0, k.max.z)));
          return { no, ad: iz.nesne.userData.alanDosya.split("/").pop().replace(/\.glb$/, ""), kutu: [k.min.toArray(), k.max.toArray()], en, boy, yuk, yakin, catiEsyasi: typeof iz.y === "number" };
        })
        .filter((y) => !y.catiEsyasi && y.yuk >= enAzYuk && y.boy >= 1.5 && !(y.yuk > 5 && y.en < 1.5) && y.yakin <= enUzak && y.yakin >= 8);
    },
    { enAzYuk: EN_AZ_YUK, enUzak: EN_UZAK },
  );
  console.log(`${bolge}: ${yapilar.length} yapı taranacak`);

  // --- 1. Tarama (önbellekli) ---
  const imza = (y) => `${y.ad}|${y.kutu.flat().map((v) => v.toFixed(1)).join(",")}`;
  let onbellek = {};
  if (!bayrak("yenidenTara") && fs.existsSync(onbellekDosyasi)) {
    try {
      const eski = JSON.parse(fs.readFileSync(onbellekDosyasi, "utf8"));
      if (Array.isArray(eski)) for (const b of eski) onbellek[`${b.ad.replace(/\.glb$/, "")}|${b.kutu.flat().map((v) => v.toFixed(1)).join(",")}`] = b.cepheler;
      else onbellek = eski;
    } catch {
      onbellek = {};
    }
  }
  for (const y of yapilar) {
    const a = imza(y);
    if (onbellek[a]) {
      y.cepheler = onbellek[a];
      continue;
    }
    const bas = Date.now();
    y.cepheler = await t.js(
      ({ no, DU, DY }) => {
        const d = window.duvar;
        const T = d.THREE;
        const iz = d.sahne3b.alan.izler[no];
        const k = iz.kutu;
        const isin = new T.Raycaster();
        const o = new T.Vector3();
        const yon = new T.Vector3();
        const yuzler = [];
        if (k.max.x < 0) yuzler.push({ ad: "x+", eksen: "x", duzlem: k.max.x, yon: -1, u0: k.min.z, u1: k.max.z });
        if (k.min.x > 0) yuzler.push({ ad: "x-", eksen: "x", duzlem: k.min.x, yon: 1, u0: k.min.z, u1: k.max.z });
        if (k.max.z < 0) yuzler.push({ ad: "z+", eksen: "z", duzlem: k.max.z, yon: -1, u0: k.min.x, u1: k.max.x });
        if (k.min.z > 0) yuzler.push({ ad: "z-", eksen: "z", duzlem: k.min.z, yon: 1, u0: k.min.x, u1: k.max.x });
        const cepheler = [];
        for (const f of yuzler) {
          const satirlar = [];
          for (let yy = k.max.y + 0.5; yy >= k.min.y; yy -= DY) {
            const satir = [];
            for (let u = f.u0 + DU / 2; u < f.u1; u += DU) {
              if (f.eksen === "x") {
                o.set(f.duzlem - f.yon * 1.5, yy, u);
                yon.set(f.yon, 0, 0);
              } else {
                o.set(u, yy, f.duzlem - f.yon * 1.5);
                yon.set(0, 0, f.yon);
              }
              isin.set(o, yon);
              isin.far = 12;
              const v = isin.intersectObject(iz.nesne, true);
              satir.push(v.length ? +(v[0].distance - 1.5).toFixed(2) : null);
            }
            satirlar.push(satir);
          }
          cepheler.push({ ...f, yUst: k.max.y + 0.5, DU, DY, satirlar });
        }
        return cepheler;
      },
      { no: y.no, DU, DY },
    );
    onbellek[a] = y.cepheler;
    fs.writeFileSync(onbellekDosyasi, JSON.stringify(onbellek));
    console.log(`  tarandı: ${y.ad} (${y.cepheler.length} cephe, ${((Date.now() - bas) / 1000).toFixed(0)} sn)`);
  }

  // --- 2. Adaylar (derinlik haritasından) ---
  const adaylar = [];
  for (const y of yapilar) {
    for (const c of y.cepheler) {
      const S = c.satirlar;
      const R = S.length;
      const C = S[0]?.length ?? 0;
      if (R < 4 || C < 2) continue;
      const vuruslar = S.flat()
        .filter((d) => d !== null && d < 8)
        .sort((a, b) => a - b);
      if (vuruslar.length < 8) continue;
      const ort = vuruslar[Math.floor(vuruslar.length / 2)];
      const duvar = (r, k) => S[r][k] !== null && S[r][k] <= ort + 1.0;
      // Sütunların duvar tepesi (yukarıdan ilk duvar hücresi)
      const tepe = [];
      for (let k = 0; k < C; k++) {
        let r = 0;
        while (r < R && !duvar(r, k)) r++;
        tepe.push(r < R ? r : -1);
      }
      const dunya = (u, geri) => {
        // Duvar düzleminin `geri` metre gerisinde, göz hattı düzlemde u'dan geçen nokta (izleyici orijinde)
        const duzlem = c.duzlem + c.yon * ort;
        const ic = duzlem + c.yon * geri;
        const oran = Math.abs(duzlem) > 0.5 ? ic / duzlem : 1;
        return c.eksen === "x" ? { x: ic, z: u * oran } : { x: u * oran, z: ic };
      };
      // Boşluklar: duvar tepesinin altındaki derin hücrelerin bağlı öbekleri
      const gorulen = Array.from({ length: R }, () => new Array(C).fill(false));
      for (let r0 = 0; r0 < R; r0++) {
        for (let k0 = 0; k0 < C; k0++) {
          if (gorulen[r0][k0] || duvar(r0, k0) || tepe[k0] < 0 || r0 <= tepe[k0]) continue;
          const yigin = [[r0, k0]];
          gorulen[r0][k0] = true;
          let rmin = r0;
          let rmax = r0;
          let kmin = k0;
          let kmax = k0;
          let n = 0;
          while (yigin.length) {
            const [r, k] = yigin.pop();
            n++;
            rmin = Math.min(rmin, r);
            rmax = Math.max(rmax, r);
            kmin = Math.min(kmin, k);
            kmax = Math.max(kmax, k);
            for (const [dr, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const rr = r + dr;
              const kk = k + dk;
              if (rr < 0 || rr >= R || kk < 0 || kk >= C || gorulen[rr][kk] || duvar(rr, kk) || tepe[kk] < 0 || rr <= tepe[kk]) continue;
              gorulen[rr][kk] = true;
              yigin.push([rr, kk]);
            }
          }
          const gen = (kmax - kmin + 1) * DU;
          const yuk = (rmax - rmin + 1) * DY;
          if (gen < 0.9 || yuk < 0.7 || n < 4) continue;
          const denizlik = c.yUst - (rmax + 0.5) * DY;
          // Geniş boşlukta (yıkık cephe) 2,5 m'de bir aday
          const adet = Math.max(1, Math.min(4, Math.round(gen / 2.5)));
          for (let i = 0; i < adet; i++) {
            const u = c.u0 + DU / 2 + (kmin + ((i + 0.5) / adet) * (kmax - kmin + 1) - 0.5) * DU;
            adaylar.push({ yapi: y.ad, yapiNo: y.no, yapiYuk: y.yuk, cephe: c.ad, tur: "pencere", ...dunya(u, GERI), yTahmin: denizlik, gen, yuk });
          }
        }
      }
      // Çatı kenarı / kaya tepesi: duvar tepesi düzgün süren sütun dizileri, 4 m'de bir aday
      let bas = -1;
      for (let k = 0; k <= C; k++) {
        const surer = k < C && tepe[k] >= 0 && (bas < 0 || Math.abs(tepe[k] - tepe[k - 1]) <= 2);
        if (surer) {
          if (bas < 0) bas = k;
          continue;
        }
        if (bas >= 0) {
          const uzunluk = (k - bas) * DU;
          if (uzunluk >= 1.5) {
            const adet = Math.max(1, Math.round(uzunluk / 4));
            for (let i = 0; i < adet; i++) {
              const kk = Math.min(k - 1, Math.max(bas, Math.round(bas + ((i + 0.5) / adet) * (k - bas) - 0.5)));
              const u = c.u0 + DU / 2 + kk * DU;
              adaylar.push({ yapi: y.ad, yapiNo: y.no, yapiYuk: y.yuk, cephe: c.ad, tur: "cati", ...dunya(u, GERI), yTahmin: c.yUst - tepe[kk] * DY + DY / 2, gen: uzunluk, yuk: 0 });
            }
          }
          bas = -1;
        }
        if (k < C && tepe[k] >= 0) bas = k;
      }
    }
  }
  console.log(`${adaylar.length} aday (pencere ${adaylar.filter((a) => a.tur === "pencere").length}, çatı ${adaylar.filter((a) => a.tur === "cati").length}); görüş doğrulaması…`);

  // --- 3. Doğrulama: gözden düşey hat boyunca görüş → örtü çizgisi ---
  const dogrulanan = [];
  const PARCA = 12;
  for (let i = 0; i < adaylar.length; i += PARCA) {
    const sonuc = await t.js((parca) => {
      const d = window.duvar;
      const T = d.THREE;
      const s = d.sahne3b;
      const izler = s.alan.izler;
      const isin = new T.Raycaster();
      const goz = new T.Vector3(0, 0, 0);
      const yon = new T.Vector3();
      const zemin = (x, z) => s.arazi.yukseklik(x, z) - 1.7;
      const digerOrtuler = [s.yikilan?.grup, s.sutre?.grup].filter((g) => g && g.children.length);
      /** Gözden p noktası görünüyor mu (alan yapıları + arazi). */
      const gorunur = (x, y, z) => {
        yon.set(x, y, z);
        const uzaklik = yon.length();
        yon.multiplyScalar(1 / uzaklik);
        // Arazi: 3 m adımlarla
        for (let m = 6; m < uzaklik - 1; m += 3) if (yon.y * m < (s.arazi.aktif ? zemin(yon.x * m, yon.z * m) : -1.7) - 0.05) return false;
        isin.set(goz, yon);
        isin.far = uzaklik - 0.08;
        for (const iz of izler) {
          if (!isin.ray.intersectsBox(iz.kutu)) continue;
          if (isin.intersectObject(iz.nesne, true).length) return false;
        }
        // Alan dışındaki örtüler: yıkılabilir tuğla duvar (film görünümü), Oda 2 sütresi
        for (const g of digerOrtuler) if (isin.intersectObject(g, true).length) return false;
        return true;
      };
      return parca.map((a) => {
        const yatay = Math.hypot(a.x, a.z);
        const ix = -a.x / yatay; // izleyiciye doğru yatay birim
        const iz_ = -a.z / yatay;
        // Düşey tarama: tahminin 1,2 m altından 2 m üstüne, 0,1 m adım
        const y0 = a.yTahmin - 1.2;
        // Hızlı eleme: tahmini çizginin 0,3–1,5 m üstünde hiçbir nokta görünmüyorsa tam taramaya gerek yok
        if (![0.3, 0.6, 0.9, 1.2, 1.5].some((dy) => gorunur(a.x, a.yTahmin + dy, a.z))) return null;
        const gor = [];
        for (let k = 0; k <= 32; k++) gor.push(gorunur(a.x, y0 + k * 0.1, a.z));
        // En alttan başlayan, ≥ 0,8 m süren ilk görünür bant; altında en az 0,3 m kapalı olmalı (örtü var)
        let ortu = null;
        let bant = 0;
        for (let k = 3; k <= 32 - 8; k++) {
          if (!gor[k] || gor[k - 1] || gor[k - 2] || gor[k - 3]) continue;
          let n = 0;
          while (k + n <= 32 && gor[k + n]) n++;
          if (n >= 8) {
            ortu = y0 + k * 0.1;
            bant = n * 0.1;
            break;
          }
        }
        if (ortu === null) return null;
        // Namlu ucu (0,72 m öne, çizginin 0,5 m üstü) ve omuzlar (±0,22 m yana, 0,4 m üstü)
        const namlu = gorunur(a.x + ix * 0.72, ortu + 0.5, a.z + iz_ * 0.72);
        const omuz = [1, -1].filter((y) => gorunur(a.x + -iz_ * 0.22 * y, ortu + 0.4, a.z + ix * 0.22 * y)).length;
        const bas = gorunur(a.x, ortu + 0.75, a.z);
        // Duvarların görüş alanı: baş (çizginin 0,85 m üstü) ve örtü çizgisi bir duvar kamerasının içinde kalmalı
        const ekranda = s.kameralar.some((k) => {
          const ust = new T.Vector3(a.x, ortu + 0.85, a.z).project(k);
          const alt = new T.Vector3(a.x, ortu - 0.1, a.z).project(k);
          return ust.z > -1 && ust.z < 1 && Math.abs(ust.x) <= 1 && Math.abs(alt.x) <= 1 && ust.y <= 0.94 && alt.y >= -0.94;
        });
        return { ...a, ortu: +ortu.toFixed(2), bant: +bant.toFixed(1), namlu, omuz, bas, ekranda, zemin: +(s.arazi.aktif ? zemin(a.x, a.z) : -1.7).toFixed(2) };
      });
    }, adaylar.slice(i, i + PARCA));
    for (const a of sonuc) if (a && a.namlu && a.bas && a.ekranda && a.omuz >= 1) dogrulanan.push(a);
    process.stdout.write(`\r  ${Math.min(adaylar.length, i + PARCA)}/${adaylar.length} · geçerli ${dogrulanan.length}`);
  }
  console.log("");

  for (const a of dogrulanan) {
    a.mesafe = Math.hypot(a.x, a.z);
    a.azimut = (Math.atan2(a.x, -a.z) * 180) / Math.PI;
  }
  fs.writeFileSync(adayDosyasi, JSON.stringify(dogrulanan));
  sec(dogrulanan);
} finally {
  await t.kapat();
}
