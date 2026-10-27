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
    // Virajda hafif yatış (1–20°)
    const yatis = Math.max(...kareler.filter((k) => k.t < 18).map((k) => Math.abs(k.yatis)));
    expect(yatis).toBeGreaterThan(1 * DERECE);
    expect(yatis).toBeLessThan(20 * DERECE);
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

  it("'yok' gizler, toz sıfırlanır", () => {
    const h = new HelikopterUcusu();
    h.durumAyarla("yerde");
    h.guncelle(DT);
    h.durumAyarla("yok");
    h.guncelle(DT);
    expect(h.gorunur).toBe(false);
    expect(h.tozSiddeti).toBe(0);
  });

  it("aciFarki −180..180 sarar", () => {
    expect(aciFarki(190, 0)).toBe(-170);
    expect(aciFarki(-170, 170)).toBe(20);
    expect(aciFarki(30, 30)).toBe(0);
  });
});
