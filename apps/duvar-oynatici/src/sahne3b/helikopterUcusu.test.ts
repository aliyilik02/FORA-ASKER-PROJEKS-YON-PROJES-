import { describe, expect, it } from "vitest";
import type { HelikopterDurumu } from "../tipler";
import { HelikopterUcusu, TAM_DEVIR, aciFarki } from "./helikopterUcusu";

const DT = 1 / 60;
const DERECE = Math.PI / 180;

interface Kare {
  t: number;
  durum: HelikopterDurumu;
  s: number;
  q: number;
  mesafe: number;
  azimut: number;
  yukseklik: number;
  irtifa: number;
  hiz: number;
  vx: number;
  vz: number;
  yunuslama: number;
  yatis: number;
  rotor: number;
  toz: number;
  yerde: boolean;
  gorunur: boolean;
}

/** Panel/senaryo komutlarını (saniye, durum) sırayla uygulayıp 60 fps'te uçurur; her kareyi kaydeder. */
function uc(komutlar: Array<[number, HelikopterDurumu]>, bitis: number, inisAz = 12, inisMes = 38) {
  const h = new HelikopterUcusu();
  h.inisNoktasi(inisAz, inisMes);
  const kareler: Kare[] = [];
  let k = 0;
  const adim = Math.round(bitis / DT);
  for (let i = 0; i <= adim; i++) {
    const t = i * DT;
    while (k < komutlar.length && komutlar[k][0] <= t + 1e-9) h.durumAyarla(komutlar[k++][1]);
    h.guncelle(DT);
    kareler.push({
      t,
      durum: h.durum,
      s: h.s,
      q: h.q,
      mesafe: Math.hypot(h.x, h.z),
      azimut: (Math.atan2(h.x, -h.z) * 180) / Math.PI,
      yukseklik: h.yukseklik,
      irtifa: h.irtifa,
      hiz: Math.hypot(h.vx, h.vz),
      vx: h.vx,
      vz: h.vz,
      yunuslama: h.yunuslama,
      yatis: h.yatis,
      rotor: h.rotorHizi,
      toz: h.tozSiddeti,
      yerde: h.yerde,
      gorunur: h.gorunur,
    });
  }
  return kareler;
}
const an = (kareler: Kare[], t: number) => kareler[Math.min(kareler.length - 1, Math.round(t / DT))];
const yereDegis = (kareler: Kare[]) => kareler.find((k) => k.yerde && k.gorunur)!;

describe("HelikopterUcusu: paneldeki tam iniş dizisi (yaklaşıyor 0 → iniyor 20 → yerde 35 sn)", () => {
  const kareler = uc(
    [
      [0, "yaklasiyor"],
      [20, "iniyor"],
      [35, "yerde"],
    ],
    80,
  );

  it("420 m / 70 m'den belirir, kavisli rotayla iniş eksenine oturur", () => {
    const ilk = kareler[0];
    expect(ilk.mesafe).toBeGreaterThan(400);
    expect(ilk.mesafe).toBeLessThan(440);
    expect(ilk.yukseklik).toBeCloseTo(70, 0);
    expect(Math.abs(ilk.q)).toBeGreaterThan(40); // yandan gelir
    expect(Math.abs(an(kareler, 18).q)).toBeLessThan(3); // eksene oturmuş
    // Virajda hafif yatış (1–8°; belirirken sert yatış yok)
    const yatis = Math.max(...kareler.filter((k) => k.t < 18).map((k) => Math.abs(k.yatis)));
    expect(yatis).toBeGreaterThan(1 * DERECE);
    expect(yatis).toBeLessThan(8 * DERECE);
  });

  it("~17–20 sn'de son yaklaşma kapısında: 25–80 m kala, 18–30 m'de, yavaşlamış", () => {
    const k = an(kareler, 19.9);
    expect(k.s).toBeGreaterThan(25);
    expect(k.s).toBeLessThan(80);
    expect(k.yukseklik).toBeGreaterThan(18);
    expect(k.yukseklik).toBeLessThan(30);
    expect(k.hiz).toBeLessThan(13);
  });

  it("'iniyor'dan sonra 15 sn içinde iniş noktasına (±2 m) yere değer", () => {
    const d = yereDegis(kareler);
    expect(d.t).toBeGreaterThan(20);
    expect(d.t).toBeLessThan(35);
    expect(Math.hypot(d.s, d.q)).toBeLessThan(2);
  });

  it("son 25 m'de burun yukarı (flare), yere değerken düz", () => {
    const d = yereDegis(kareler);
    const flare = kareler.filter((k) => k.durum === "iniyor" && k.t < d.t && k.s < 25);
    expect(Math.max(...flare.map((k) => k.yunuslama))).toBeGreaterThan(4 * DERECE);
    expect(Math.max(...kareler.map((k) => k.yunuslama))).toBeLessThan(16 * DERECE);
    expect(Math.abs(an(kareler, d.t + 2).yunuslama)).toBeLessThan(0.5 * DERECE);
  });

  it("hareket yumuşak: hız sıçramaz, zeminin altına inmez", () => {
    for (let i = 1; i < kareler.length; i++) {
      const a = kareler[i - 1];
      const b = kareler[i];
      if (!a.gorunur || !b.gorunur) continue;
      expect(Math.hypot(b.vx - a.vx, b.vz - a.vz)).toBeLessThan(3.5 * DT * 1.01 + 1e-9);
      expect(b.irtifa).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(b.yukseklik + b.yunuslama + b.yatis)).toBe(true);
    }
  });

  it("toz: 20 m'nin üstünde yok, yere yaklaşınca güçlü, yerde ~0,45", () => {
    for (const k of kareler) if (k.irtifa > 22 && !k.yerde) expect(k.toz).toBeLessThan(0.01);
    const d = yereDegis(kareler);
    expect(Math.max(...kareler.filter((k) => k.t <= d.t + 0.5).map((k) => k.toz))).toBeGreaterThan(0.8);
    const sonra = an(kareler, d.t + 6).toz;
    expect(sonra).toBeGreaterThan(0.35);
    expect(sonra).toBeLessThan(0.6);
  });

  it("rotor yere değdikten 25 sn sonra yavaşlar (8 rad/sn'ye iner)", () => {
    const d = yereDegis(kareler);
    expect(an(kareler, d.t + 20).rotor).toBe(TAM_DEVIR);
    expect(an(kareler, d.t + 32).rotor).toBeLessThan(30);
    expect(an(kareler, Math.min(80, d.t + 45)).rotor).toBeLessThan(12);
  });
});

describe("HelikopterUcusu: kalkış", () => {
  // Gösterim senaryosu gibi: yerde 23 sn bekler (rotor tam devirde), kalkıştan 15 sn sonra "yok"
  const kareler = uc(
    [
      [0, "yaklasiyor"],
      [17, "iniyor"],
      [34, "yerde"],
      [57, "kalkiyor"],
    ],
    80,
  );
  const kalkis = kareler.filter((k) => k.durum === "kalkiyor");

  it("önce ~5 m askıya dikey yükselir", () => {
    const aski = kalkis.find((k) => k.irtifa > 4 && k.irtifa < 6.5 && k.hiz < 1.5);
    expect(aski).toBeDefined();
    expect(aski!.t - 57).toBeLessThan(6);
  });

  it("burun aşağı hızlanır ve tırmanır; izleyiciye 20 m'den fazla yaklaşmaz", () => {
    expect(Math.min(...kalkis.map((k) => k.yunuslama))).toBeLessThan(-6 * DERECE);
    expect(Math.min(...kalkis.map((k) => k.yunuslama))).toBeGreaterThan(-16 * DERECE);
    expect(Math.min(...kalkis.map((k) => k.mesafe))).toBeGreaterThan(20);
    expect(an(kareler, 57 + 15).yukseklik).toBeGreaterThan(15);
  });

  it("15 sn içinde U duvarın görüş alanından (±135°) çıkar: 'yok' gelince sıçrama görünmez", () => {
    const k = an(kareler, 57 + 15);
    expect(Math.abs(k.azimut)).toBeGreaterThan(135);
    // İniş noktası sağda (+12°): kalkış sağ taraftan arkaya
    expect(k.azimut).toBeGreaterThan(0);
  });

  it("sol iniş noktasında kalkış soldan arkaya (ayna)", () => {
    const sol = uc(
      [
        [0, "yaklasiyor"],
        [17, "iniyor"],
        [34, "yerde"],
        [57, "kalkiyor"],
      ],
      75,
      -30,
      40,
    );
    const k = an(sol, 57 + 15);
    expect(k.azimut).toBeLessThan(-135);
    expect(Math.hypot(yereDegis(sol).s, yereDegis(sol).q)).toBeLessThan(2);
  });

  it("rotor yavaşlamışsa önce devir alır, sonra yerden kesilir", () => {
    // Senaryo C gibi: yerde 30 sn → kalkış
    const c = uc(
      [
        [0, "yaklasiyor"],
        [20, "iniyor"],
        [35, "yerde"],
        [70, "kalkiyor"],
      ],
      90,
    );
    expect(an(c, 70).rotor).toBeLessThan(30);
    expect(an(c, 70.8).yerde).toBe(true);
    const kalkti = c.find((k) => k.t > 70 && !k.yerde)!;
    expect(kalkti.rotor).toBeGreaterThanOrEqual(36);
    expect(Math.abs(an(c, 90).azimut)).toBeGreaterThan(135);
  });
});

describe("HelikopterUcusu: arazi", () => {
  it("rotadaki 40 m'lik sırta önceden yükselir, ≥ 6 m yukarıdan aşar, sonra noktasına iner", () => {
    // Dağlık profildeki gibi: izleyicinin önünde ~135 m'de geniş sırt; izleyici çevresi düz
    const sirt = (x: number, z: number) =>
      40 * Math.exp(-((x * 0.55 + z * 0.83 + 112) ** 2) / (2 * 38 * 38)) * Math.min(1, Math.max(0, (Math.hypot(x, z) - 9) / 17));
    const h = new HelikopterUcusu();
    h.inisNoktasi(-10, 38);
    const lx = Math.sin(-10 * DERECE) * 38;
    const lz = -Math.cos(-10 * DERECE) * 38;
    h.zeminFarki = (x, z) => sirt(x, z) - sirt(lx, lz);
    const komutlar: Array<[number, HelikopterDurumu]> = [
      [0, "yaklasiyor"],
      [20, "iniyor"],
      [40, "yerde"],
    ];
    let k = 0;
    let enAz = Infinity;
    let sirtUstu = -Infinity;
    for (let i = 0; i <= 40 / DT; i++) {
      while (k < komutlar.length && komutlar[k][0] <= i * DT + 1e-9) h.durumAyarla(komutlar[k++][1]);
      h.guncelle(DT);
      if (!h.yerde && h.s > 15) enAz = Math.min(enAz, h.irtifa);
      if (h.zeminFarki(h.x, h.z) > 30) sirtUstu = Math.max(sirtUstu, h.irtifa);
    }
    expect(sirtUstu).toBeGreaterThan(0); // sırtın üstünden geçti
    expect(enAz).toBeGreaterThan(6);
    expect(h.yerde).toBe(true);
    expect(Math.hypot(h.s, h.q)).toBeLessThan(2);
  });
});

describe("HelikopterUcusu: doğrudan durumlar", () => {
  it("yoktan 'yerde': iniş noktasında, park yönünde, rotor tam devirde belirir", () => {
    const h = new HelikopterUcusu();
    h.inisNoktasi(-20, 45);
    h.durumAyarla("yerde");
    h.guncelle(DT);
    expect(h.yerde).toBe(true);
    expect(Math.hypot(h.s, h.q)).toBeLessThan(1e-6);
    expect(Math.hypot(h.x, h.z)).toBeCloseTo(45, 6);
    expect(h.rotorHizi).toBe(TAM_DEVIR);
    expect(Math.abs(aciFarki(h.yonelim, h.parkYonu))).toBeLessThan(1e-6);
  });

  it("yerdeyken iniş noktası değişirse yeni noktada belirir", () => {
    const h = new HelikopterUcusu();
    h.inisNoktasi(12, 38);
    h.durumAyarla("yerde");
    h.guncelle(DT);
    h.inisNoktasi(60, 30);
    h.guncelle(DT);
    expect(Math.hypot(h.x, h.z)).toBeCloseTo(30, 6);
    expect((Math.atan2(h.x, -h.z) * 180) / Math.PI).toBeCloseTo(60, 6);
  });

  it("yoktan 'iniyor': 85 m geriden gelip ~15 sn içinde iner", () => {
    const k = uc([[0, "iniyor"]], 20);
    expect(k[0].mesafe).toBeGreaterThan(100);
    const d = yereDegis(k);
    expect(d.t).toBeLessThan(16);
    expect(Math.hypot(d.s, d.q)).toBeLessThan(2);
  });

  it("kalkıştan uzaklaşırken 'iniyor' gelirse önden yeniden gelip iner (izleyicinin yanında askıda kalmaz)", () => {
    const k = uc(
      [
        [0, "yerde"],
        [1, "kalkiyor"],
        [9, "iniyor"],
      ],
      30,
    );
    expect(an(k, 8.9).yerde).toBe(false);
    expect(an(k, 9.05).mesafe).toBeGreaterThan(100);
    const d = k.find((x) => x.t > 9 && x.yerde);
    expect(d).toBeDefined();
    expect(Math.hypot(d!.s, d!.q)).toBeLessThan(2);
  });

  it("kalkıştan uzaklaşırken 'yerde' gelirse iniş noktasında belirir", () => {
    const k = uc(
      [
        [0, "yerde"],
        [1, "kalkiyor"],
        [9, "yerde"],
      ],
      10,
    );
    const s = an(k, 9.1);
    expect(s.yerde).toBe(true);
    expect(Math.hypot(s.s, s.q)).toBeLessThan(1e-6);
  });

  it("'yok': görünüyorsa 1,5 sn'de söner (birden kaybolmaz), sonra gizler, toz sıfırlanır", () => {
    const h = new HelikopterUcusu();
    h.durumAyarla("yerde");
    h.guncelle(DT);
    h.durumAyarla("yok");
    h.guncelle(DT);
    expect(h.gorunur).toBe(true);
    expect(h.solma).toBeLessThan(1);
    expect(h.solma).toBeGreaterThan(0.95);
    for (let i = 0; i < 0.75 / DT; i++) h.guncelle(DT);
    expect(h.solma).toBeGreaterThan(0.4);
    expect(h.solma).toBeLessThan(0.6);
    for (let i = 0; i < 0.8 / DT; i++) h.guncelle(DT);
    expect(h.gorunur).toBe(false);
    expect(h.tozSiddeti).toBe(0);
    // Görünmüyorken 'yok' hemen; yeniden belirince tam görünür
    h.durumAyarla("yerde");
    expect(h.solma).toBe(1);
    const g = new HelikopterUcusu();
    g.durumAyarla("yok");
    g.guncelle(DT);
    expect(g.gorunur).toBe(false);
    // Sönerken yeni durum: sönen helikopter gider, yaklaşma baştan (420 m'den, tam görünür)
    h.guncelle(DT);
    h.durumAyarla("yok");
    for (let i = 0; i < 0.5 / DT; i++) h.guncelle(DT);
    expect(h.solma).toBeLessThan(0.8);
    h.durumAyarla("yaklasiyor");
    expect(h.solma).toBe(1);
    expect(h.gorunur).toBe(true);
    expect(h.s).toBeGreaterThan(370);
  });

  it("kalkışta 'yok' gelirse sönerken o anki hızıyla süzülür (yerinde durmaz), sönünce gizlenir", () => {
    const h = new HelikopterUcusu();
    h.inisNoktasi(12, 38);
    h.durumAyarla("yerde");
    h.guncelle(DT);
    h.durumAyarla("kalkiyor");
    for (let i = 0; i < 9 / DT; i++) h.guncelle(DT);
    const v0 = Math.hypot(h.vx, h.vz);
    expect(v0).toBeGreaterThan(8);
    const x0 = h.x;
    const z0 = h.z;
    h.durumAyarla("yok");
    for (let i = 0; i < 1 / DT; i++) h.guncelle(DT);
    expect(h.gorunur).toBe(true);
    expect(Math.hypot(h.x - x0, h.z - z0)).toBeGreaterThan(0.8 * v0);
    expect(Math.hypot(h.vx, h.vz)).toBeGreaterThan(0.9 * v0);
    for (let i = 0; i < 0.6 / DT; i++) h.guncelle(DT);
    expect(h.gorunur).toBe(false);
  });

  it("aciFarki −180..180 sarar", () => {
    expect(aciFarki(190, 0)).toBe(-170);
    expect(aciFarki(-170, 170)).toBe(20);
    expect(aciFarki(30, 30)).toBe(0);
  });
});

describe("HelikopterUcusu: belirirken sarsıntı yok (azimut × mesafe taraması)", () => {
  it("yaklaşma ve doğrudan iniş başında hız rota teğetinde: ilk karede yanal ivme ~0, ilk 3 sn'de yatış < 8°", () => {
    let enCokIvme = 0;
    let enCokYatis = 0;
    let ornek = "";
    for (const d of ["yaklasiyor", "iniyor"] as const) {
      for (const mes of [38, 40, 42, 45, 50]) {
        for (let az = 0; az < 360; az += 2) {
          const h = new HelikopterUcusu();
          h.inisNoktasi(az > 180 ? az - 360 : az, mes);
          h.durumAyarla(d);
          const vx = h.vx;
          const vz = h.vz;
          h.guncelle(DT);
          // Hıza dik ivme (ilk kare): kayan nokta hatasıyla rota eğimi 0 çıkarsa 3,5 m/sn² sınırına dayanırdı
          const yanal = Math.abs(((h.vx - vx) / DT) * vz - ((h.vz - vz) / DT) * vx) / Math.hypot(vx, vz);
          if (yanal > enCokIvme) {
            enCokIvme = yanal;
            ornek = `${d} ${az}°/${mes} m`;
          }
          for (let i = 0; i < 3 / DT; i++) {
            h.guncelle(DT);
            enCokYatis = Math.max(enCokYatis, Math.abs(h.yatis));
          }
        }
      }
    }
    expect(enCokIvme, ornek).toBeLessThan(0.2);
    expect(enCokYatis).toBeLessThan(8 * DERECE);
  });
});

describe("HelikopterUcusu: havadayken iniş noktası değişirse (panorama/plan ya da panelin yönü)", () => {
  /** Panel dizisi (yaklaşıyor 0 → iniyor 20 → yerde 35); `degisimT` anında iniş noktası `eski`den `yeni`ye geçer. */
  function degisim(eski: [number, number], yeni: [number, number], degisimT: number, bitis = 100) {
    const h = new HelikopterUcusu();
    h.inisNoktasi(...eski);
    const komutlar: Array<[number, HelikopterDurumu]> = [
      [0, "yaklasiyor"],
      [20, "iniyor"],
      [35, "yerde"],
    ];
    const lx = Math.sin(yeni[0] * DERECE) * yeni[1];
    const lz = -Math.cos(yeni[0] * DERECE) * yeni[1];
    let k = 0;
    let once: { y: number; hiz: number } | null = null;
    let pas = false;
    let temas: { t: number; uzaklik: number } | null = null;
    const sonra: Array<{ t: number; uzaklik: number; y: number; vy: number; hiz: number; dv: number }> = [];
    for (let i = 0; i <= bitis / DT; i++) {
      const t = i * DT;
      while (k < komutlar.length && komutlar[k][0] <= t + 1e-9) h.durumAyarla(komutlar[k++][1]);
      if (!once && t >= degisimT - 1e-9) {
        once = { y: h.yukseklik, hiz: Math.hypot(h.vx, h.vz) };
        h.inisNoktasi(...yeni);
        pas = h.pasGeciyor;
      }
      const vx = h.vx;
      const vz = h.vz;
      h.guncelle(DT);
      if (!once) continue;
      const uzaklik = Math.hypot(h.x - lx, h.z - lz);
      sonra.push({ t, uzaklik, y: h.yukseklik, vy: h.vy, hiz: Math.hypot(h.vx, h.vz), dv: Math.hypot(h.vx - vx, h.vz - vz) });
      if (!temas && h.yerde) temas = { t, uzaklik };
    }
    return { once: once!, pas, temas, sonra };
  }

  const senaryolar: Array<[string, [number, number], [number, number], number]> = [
    ["yaklaşmanın 10. sn'si, −80° → 40° (kırsal yaz gündüz AI → yaz alacakaranlık)", [-80, 42], [40, 42], 10],
    ["inişin 4. sn'si (24 sn), −80° → 40°", [-80, 42], [40, 42], 24],
    ["son askıda (27 sn, ~2,5 m), −80° → 40°", [-80, 42], [40, 42], 27],
    ["yaklaşmanın 2. sn'si (420 m), −80° → 40°", [-80, 42], [40, 42], 2],
    ["bekleme askısında (19 sn), 12° → −60° (plansız panoramada panelin yönü)", [12, 38], [-60, 38], 19],
    ["inişte (24 sn), 40° → 80° (yawKaydirma değişti)", [40, 42], [80, 42], 24],
    ["yaklaşmada (14 sn), 12° → 90°", [12, 38], [90, 38], 14],
  ];
  for (const [ad, eski, yeni, t] of senaryolar) {
    it(`${ad}: pas geçip yeni noktaya (≤ 3 m) iner; noktadan uzakta alçalmaz, hız ve ivme sınırda`, () => {
      const r = degisim(eski, yeni, t);
      expect(r.pas).toBe(true);
      expect(r.temas).not.toBeNull();
      expect(r.temas!.uzaklik).toBeLessThan(3);
      expect(r.temas!.t).toBeLessThan(90);
      const tavan = Math.max(r.once.hiz, 22.5);
      for (const k of r.sonra) {
        expect(k.hiz).toBeLessThan(tavan + 1e-6);
        expect(k.dv).toBeLessThan(3.5 * DT * 1.01 + 1e-9);
        if (k.uzaklik > 60) {
          // Noktadan 60 m'den uzakta alçalmaz: değişim anında alçaktaysa tırmanır (ilk 2 sn dikey eylemsizlik payı)
          expect(k.y).toBeGreaterThan(Math.min(15, r.once.y) - 2.5);
          if (k.t > t + 2 && k.y < 15) expect(k.vy).toBeGreaterThan(-0.05);
        }
      }
    });
  }

  it("küçük değişimde (−80° → −75°, yaklaşmanın 10. sn'si) pas geçmez: rota buradan kurulur, yeni noktaya iner", () => {
    const r = degisim([-80, 42], [-75, 42], 10);
    expect(r.pas).toBe(false);
    expect(r.temas!.uzaklik).toBeLessThan(2);
    expect(r.temas!.t).toBeLessThan(35);
  });

  it("belirdiği karede değişirse (aynı mesajda durum + yeni panorama) yeni eksende baştan belirir, pas geçmez", () => {
    for (const d of ["yaklasiyor", "iniyor"] as const) {
      const h = new HelikopterUcusu();
      h.inisNoktasi(-80, 42);
      h.durumAyarla(d);
      h.inisNoktasi(40, 42);
      expect(h.pasGeciyor).toBe(false);
      expect(h.s).toBeGreaterThan(d === "yaklasiyor" ? 370 : 80); // yeni eksenin dışından (420 m ya da 85 m)
      const komutlar: Array<[number, HelikopterDurumu]> = d === "yaklasiyor" ? [[20, "iniyor"]] : [];
      let k = 0;
      for (let i = 0; i <= 45 / DT && !h.yerde; i++) {
        while (k < komutlar.length && komutlar[k][0] <= i * DT + 1e-9) h.durumAyarla(komutlar[k++][1]);
        h.guncelle(DT);
      }
      expect(h.yerde).toBe(true);
      expect(Math.hypot(h.s, h.q)).toBeLessThan(2);
    }
  });

  /**
   * Son askıda/dikey inişte iniş noktası değişir: `kosul` sağlanınca `yeni` noktaya geçilir. Değişimden sonra noktaya
   * 4 m'den uzakken en alçak irtifa ve yere değme, kare başına yükseklik sıçraması ve yere değdiği yer döner.
   */
  function sonAskidaDegisim(yeni: [number, number], kosul: (h: HelikopterUcusu) => boolean) {
    const h = new HelikopterUcusu();
    h.inisNoktasi(12, 38);
    h.durumAyarla("yaklasiyor");
    let kaydi = false;
    let oncekiS = 0;
    let uzaktaEnAlcak = Infinity;
    let uzaktaYerde = false;
    let sicrama = 0;
    for (let i = 0; i <= 70 / DT && !h.yerde; i++) {
      if (Math.abs(i * DT - 20) < DT / 2) h.durumAyarla("iniyor");
      if (!kaydi && h.durum === "iniyor" && kosul(h)) {
        h.inisNoktasi(...yeni);
        oncekiS = h.s;
        kaydi = true;
      }
      const y = h.yukseklik;
      h.guncelle(DT);
      if (!kaydi) continue;
      // Kare başına yükseklik değişimi dikey hızla tutarlı (zemin payı 1,5 m'ye "ışınlamaz")
      sicrama = Math.max(sicrama, Math.abs(h.yukseklik - y) - Math.abs(h.vy) * DT);
      if (Math.hypot(h.s, h.q) > 4) {
        uzaktaEnAlcak = Math.min(uzaktaEnAlcak, h.irtifa);
        if (h.yerde) uzaktaYerde = true;
      }
    }
    return { h, kaydi, oncekiS, uzaktaEnAlcak, uzaktaYerde, sicrama };
  }

  it("noktayı geçince geri döner (son askıda nokta 10 m dışarı kaydı): noktadan uzakta yere inmez, dikey iniş noktanın üstünde, ≤ 1,5 m'ye iner", () => {
    // Son askı: noktanın üstünde, yavaş, alçak → nokta aynı yönde 10 m dışarı (helikopter noktayı geçmiş olur, s ≈ −10)
    const r = sonAskidaDegisim([12, 48], (h) => Math.hypot(h.vx, h.vz) < 1 && h.irtifa < 3.2 && Math.hypot(h.s, h.q) < 1.5);
    expect(r.kaydi).toBe(true);
    expect(r.oncekiS).toBeLessThan(-8);
    // Noktaya 4 m'den uzakken dikey inişe geçmez: dikey iniş hızını keser, olağan zemin payının (1,5 m) altına inmez
    expect(r.uzaktaYerde).toBe(false);
    expect(r.uzaktaEnAlcak).toBeGreaterThan(1.4);
    expect(r.h.yerde).toBe(true);
    expect(Math.hypot(r.h.s, r.h.q)).toBeLessThan(1.5);
  });

  for (const [ad, yeni] of [
    ["10 m dışarı", [12, 48]],
    ["8 m içeri", [12, 30]],
    ["40° yana (~27 m)", [-28, 38]],
    ["pas geçme (−80°)", [-80, 42]],
  ] as Array<[string, [number, number]]>) {
    it(`dikey inişin son metresinde (~0,5 m) nokta değişirse (${ad}) zemin payına sıçramaz, yeni noktaya iner`, () => {
      const r = sonAskidaDegisim(yeni, (h) => h.irtifa < 0.6 && h.vy < -0.1);
      expect(r.kaydi).toBe(true);
      expect(r.sicrama).toBeLessThan(0.02);
      expect(r.uzaktaYerde).toBe(false);
      expect(r.h.yerde).toBe(true);
      const lx = Math.sin(yeni[0] * DERECE) * yeni[1];
      const lz = -Math.cos(yeni[0] * DERECE) * yeni[1];
      expect(Math.hypot(r.h.x - lx, r.h.z - lz)).toBeLessThan(1.5);
    });
  }

  for (const [ad, yeni] of [
    ["3 m yana", [16.5, 38]],
    ["3 m dışarı", [12, 41]],
    ["2,5 m içeri", [12, 35.5]],
  ] as Array<[string, [number, number]]>) {
    it(`dikey inişin son metresinde nokta az kayarsa (${ad}: dikey iniş hemen yeniden başlar) kızaklar noktaya oturmadan yere değmez`, () => {
      const r = sonAskidaDegisim(yeni, (h) => h.irtifa < 0.8 && h.vy < -0.1);
      expect(r.kaydi).toBe(true);
      expect(r.h.yerde).toBe(true);
      const lx = Math.sin(yeni[0] * DERECE) * yeni[1];
      const lz = -Math.cos(yeni[0] * DERECE) * yeni[1];
      expect(Math.hypot(r.h.x - lx, r.h.z - lz)).toBeLessThan(1.5);
    });
  }

  it("inişin son metrelerinde birkaç derecelik kayma (−80° → −75°, 8–12 m kala) pas geçtirmez: buradan iner", () => {
    for (const t of [23, 24, 25]) {
      const r = degisim([-80, 42], [-75, 42], t);
      expect(r.pas, `${t} sn`).toBe(false);
      expect(r.temas!.uzaklik).toBeLessThan(2);
      expect(r.temas!.t).toBeLessThan(35);
    }
  });

  it("nokta askıdayken yakında yana kayınca (40°, ~27 m) yer değiştirme hızlı değil: yatay hız ≤ ~6 m/sn, alçakta yatış < 10°", () => {
    const h = new HelikopterUcusu();
    h.inisNoktasi(-80, 42);
    h.durumAyarla("yaklasiyor");
    let kaydi = false;
    let enHizli = 0;
    let enYatik = 0;
    for (let i = 0; i <= 60 / DT && !h.yerde; i++) {
      if (Math.abs(i * DT - 20) < DT / 2) h.durumAyarla("iniyor");
      if (!kaydi && h.durum === "iniyor" && Math.hypot(h.vx, h.vz) < 1 && h.irtifa < 3.2 && Math.hypot(h.s, h.q) < 1.5) {
        h.inisNoktasi(-40, 42);
        expect(h.pasGeciyor).toBe(false);
        kaydi = true;
      }
      h.guncelle(DT);
      if (!kaydi) continue;
      enHizli = Math.max(enHizli, Math.hypot(h.vx, h.vz));
      enYatik = Math.max(enYatik, Math.abs(h.yatis));
    }
    expect(kaydi).toBe(true);
    expect(enHizli).toBeLessThan(6.5);
    expect(enYatik).toBeLessThan(10 * DERECE);
    expect(h.yerde).toBe(true);
    expect(Math.hypot(h.s, h.q)).toBeLessThan(1.5);
  });

  it("pas geçmede yavaşken (askıdan çıkış, giriş noktasında dönüş) yan yan kaymaz, sert yatmaz: burun önce döner", () => {
    // Son askıda (−80°) nokta 40°'ye: askıdan pas geçme, giriş noktasında 180° dönüş
    const h = new HelikopterUcusu();
    h.inisNoktasi(-80, 42);
    h.durumAyarla("yaklasiyor");
    let kaydi = false;
    let enYanHiz = 0;
    let yavaskenEnYatik = 0;
    for (let i = 0; i <= 90 / DT && !h.yerde; i++) {
      if (Math.abs(i * DT - 20) < DT / 2) h.durumAyarla("iniyor");
      if (Math.abs(i * DT - 35) < DT / 2) h.durumAyarla("yerde");
      if (!kaydi && h.durum === "iniyor" && Math.hypot(h.vx, h.vz) < 1 && h.irtifa < 3.2 && Math.hypot(h.s, h.q) < 1.5) {
        h.inisNoktasi(40, 42);
        expect(h.pasGeciyor).toBe(true);
        kaydi = true;
      }
      h.guncelle(DT);
      if (!kaydi) continue;
      // Burnun yanına doğru hız (yan kayma) ve 8 m/sn altındaki yatış
      const b = h.yonelim * DERECE;
      enYanHiz = Math.max(enYanHiz, Math.abs(h.vx * Math.cos(b) + h.vz * Math.sin(b)));
      if (Math.hypot(h.vx, h.vz) < 8) yavaskenEnYatik = Math.max(yavaskenEnYatik, Math.abs(h.yatis));
    }
    expect(kaydi).toBe(true);
    expect(enYanHiz).toBeLessThan(3);
    expect(yavaskenEnYatik).toBeLessThan(8 * DERECE);
    expect(h.yerde).toBe(true);
    expect(Math.hypot(h.s, h.q)).toBeLessThan(1.5);
  });
});

describe("HelikopterUcusu: kalkış iniş noktasının kendi yanından arkaya, görüş dışına", () => {
  // Manifestteki iniş noktaları (sahne azimutu): kırsal AI −80°, kırsal foto 100°, meskûn yaz gece −117°, dağlık yaz
  // gece 150°, meskûn kış alacakaranlık 0°/50 m, varsayılan 12°
  const noktalar: Array<[number, number]> = [
    [-80, 42],
    [100, 45],
    [-117, 45],
    [150, 42],
    [0, 50],
    [12, 38],
  ];
  for (const [inisAz, mes] of noktalar) {
    it(`iniş ${inisAz}°/${mes} m: kalkıştan 16 sn sonra arkada (|az| > 135°) ya da 350 m ötede; karşı yan duvara girmez`, () => {
      const h = new HelikopterUcusu();
      h.inisNoktasi(inisAz, mes);
      h.durumAyarla("yerde");
      h.guncelle(DT);
      h.durumAyarla("kalkiyor");
      const yan = inisAz < 0 ? -1 : 1;
      let enYakin = Infinity;
      for (let i = 1; i <= 25 / DT; i++) {
        h.guncelle(DT);
        const az = (Math.atan2(h.x, -h.z) * 180) / Math.PI;
        const m = Math.hypot(h.x, h.z);
        enYakin = Math.min(enYakin, m);
        // Karşı yan duvar (sağ nokta için sol duvar −135..−45°, sol nokta için sağ duvar)
        const karsi = yan * az < -45 && yan * az > -135;
        expect(karsi, `${(i * DT).toFixed(2)} sn: ${az.toFixed(0)}°`).toBe(false);
        if (i * DT >= 16) expect(Math.abs(az) > 135 || m > 350, `${(i * DT).toFixed(2)} sn: ${az.toFixed(0)}°, ${m.toFixed(0)} m`).toBe(true);
      }
      expect(enYakin).toBeGreaterThan(20);
    });
  }
});
