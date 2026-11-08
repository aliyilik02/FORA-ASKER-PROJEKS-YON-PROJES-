import { describe, expect, it } from "vitest";
import {
  aciGenisligi,
  aciNormalize,
  azimutGorunur,
  azimutKonum,
  azimutX,
  duvarYerlesimleri,
  duvarlariOlustur,
  geometriOzeti,
  gunIsigi,
  gunesKonumu,
  mesafeYerlesimi,
  type OdaGeometrisi,
  odaDuvarlari,
  odaGeometrisiCoz,
  odaGeometrisiYaz,
  type TuvalNoktasi,
  tuvaldenYon,
  ufukSatiri,
  xAzimut,
  yonAzimut,
  yonuIzdusur,
  zamanDilimi,
} from "./projeksiyon";

const derece = (r: number) => (r * 180) / Math.PI;
const radyan = (d: number) => (d * Math.PI) / 180;

describe("duvar yerleşimi", () => {
  const y = duvarYerlesimleri(5760, 1080);

  it("üç duvarı eşit böler", () => {
    expect(y).toHaveLength(3);
    expect(y[1].x).toBe(1920);
    expect(y[2].genislik).toBe(1920);
  });

  it("azimutları doğru duvara ve x'e eşler", () => {
    expect(azimutX(0, y[1])).toBe(2880); // orta duvarın ortası
    expect(azimutX(-90, y[0])).toBe(960); // sol duvarın ortası
    expect(azimutX(90, y[2])).toBe(4800);
    expect(azimutX(0, y[0])).toBeNull(); // orta azimut sol duvarda görünmez
    expect(azimutKonum(44, y)?.yerlesim.duvar.ad).toBe("orta");
    expect(azimutKonum(46, y)?.yerlesim.duvar.ad).toBe("sag");
    expect(azimutKonum(180, y)).toBeNull(); // arkası görünmez
  });

  it("köşelerde süreklidir: orta duvarın sağ kenarı ile sağ duvarın sol kenarı aynı azimut", () => {
    expect(xAzimut(3840, y[1])).toBeCloseTo(45);
    expect(xAzimut(3840, y[2])).toBeCloseTo(45);
  });

  it("farklı fov ile duvar yaw'ları bitişik kalır", () => {
    const d = duvarlariOlustur(40);
    expect(d.map((x) => x.yaw)).toEqual([-40, 0, 40]);
  });
});

describe("açılar ve zaman", () => {
  it("açıyı -180..180 aralığına alır", () => {
    expect(aciNormalize(270)).toBe(-90);
    expect(aciNormalize(-270)).toBe(90);
    expect(yonAzimut(315)).toBe(-45);
  });

  it("güneş sabah solda doğar, öğlen ortada tepede, akşam sağda batar", () => {
    expect(gunesKonumu(5.75).azimut).toBe(-90);
    expect(gunesKonumu(12.75).azimut).toBeCloseTo(0);
    expect(gunesKonumu(12.75).yukseklik).toBeCloseTo(65);
    expect(gunesKonumu(19.75).azimut).toBeCloseTo(90);
    expect(gunesKonumu(0).yukseklik).toBeLessThan(0);
  });

  it("gün ışığı ve zaman dilimi", () => {
    expect(gunIsigi(12)).toBe(1);
    expect(gunIsigi(0)).toBe(0);
    expect(zamanDilimi(12)).toBe("gunduz");
    expect(zamanDilimi(19.5)).toBe("alacakaranlik");
    expect(zamanDilimi(23)).toBe("gece");
    expect(gunIsigi(18.6)).toBeGreaterThan(0.5); // akşamüstü hâlâ aydınlık
  });

  it("uzak nesneler ufka yakın ve küçük, yakınlar altta ve büyük", () => {
    const uzak = mesafeYerlesimi(1, 500, 1080);
    const yakin = mesafeYerlesimi(0, 500, 1080);
    expect(uzak.y).toBe(500);
    expect(yakin.y).toBeGreaterThan(1000);
    expect(yakin.olcek).toBeGreaterThan(uzak.olcek * 5);
  });
});

describe("ölçüsüz izdüşüm (varsayılan, ?fov=)", () => {
  const y = duvarYerlesimleri(5760, 1080);

  it("kenarlar ±45° / ±135°; köşedeki nokta (ufkun altında ve üstünde) iki duvarda aynı yere düşer", () => {
    expect(xAzimut(0, y[0])).toBeCloseTo(-135, 9);
    expect(xAzimut(1920, y[0])).toBeCloseTo(-45, 9);
    expect(xAzimut(1920, y[1])).toBeCloseTo(-45, 9);
    expect(xAzimut(3840, y[1])).toBeCloseTo(45, 9);
    expect(xAzimut(3840, y[2])).toBeCloseTo(45, 9);
    expect(xAzimut(5760, y[2])).toBeCloseTo(135, 9);
    const a: TuvalNoktasi = { x: 0, y: 0 };
    const b: TuvalNoktasi = { x: 0, y: 0 };
    for (const e of [-20, 0, 15]) {
      expect(yonuIzdusur(45, e, y[1], a)).toBe(true);
      expect(yonuIzdusur(45, e, y[2], b)).toBe(true);
      expect(a.x).toBeCloseTo(3840, 6);
      expect(b.x).toBeCloseTo(3840, 6);
      expect(a.y).toBeCloseTo(b.y, 6);
    }
  });

  it("bugünkü 3B kameralarla aynı: yaw kadar döndürülmüş taban, yatay ±tan(fov/2), dikey ±tan(fov/2)·H/w", () => {
    [-90, 0, 90].forEach((yaw, i) => {
      const iz = y[i].izdusum;
      expect(y[i].duvar.yaw).toBe(yaw);
      expect(iz.sagEksen[0]).toBeCloseTo(Math.cos(radyan(yaw)), 12);
      expect(iz.sagEksen[2]).toBeCloseTo(Math.sin(radyan(yaw)), 12);
      expect(iz.normal[0]).toBeCloseTo(-Math.sin(radyan(yaw)), 12);
      expect(iz.normal[2]).toBeCloseTo(Math.cos(radyan(yaw)), 12);
      expect(iz.yukariEksen[1]).toBe(1);
      expect(iz.sol).toBeCloseTo(-1, 12);
      expect(iz.sag).toBeCloseTo(1, 12);
      expect(iz.alt).toBeCloseTo(-1080 / 1920, 12);
      expect(iz.ust).toBeCloseTo(1080 / 1920, 12);
    });
    expect(ufukSatiri(y[1])).toBeCloseTo(540, 9);
    expect(ufukSatiri(y[1], 0.2)).toBeCloseTo((1080 * 1.2) / 2, 9); // eski ufukY: H·(1 + k)/2
  });

  it("perspektif: 90° duvarda 22,5° → u = 0,5 + tan(22,5°)/2 ≈ 0,7071 (doğrusal eşleme 0,75 derdi)", () => {
    const u = (azimutX(22.5, y[1])! - y[1].x) / y[1].genislik;
    expect(u).toBeCloseTo(0.5 + Math.tan(radyan(22.5)) / 2, 12);
    expect(u).toBeCloseTo(0.7071, 4);
    // ters yön de perspektif
    expect(xAzimut(y[1].x + 0.75 * y[1].genislik, y[1])).toBeCloseTo(derece(Math.atan(0.5)), 9);
  });

  it("açısal genişlik kenara doğru büyür; tolerans önce azimutu içeren duvarı seçer", () => {
    expect(aciGenisligi(0, 10, y[1])).toBeCloseTo(Math.tan(radyan(5)) * 1920, 6);
    expect(aciGenisligi(40, 10, y[1])).toBeGreaterThan(aciGenisligi(0, 10, y[1]) * 1.5);
    expect(azimutKonum(-40, y, 20)?.yerlesim.duvar.ad).toBe("orta");
    expect(azimutKonum(-140, y, 20)?.yerlesim.duvar.ad).toBe("sol"); // köşe ötesi: toleransla
    expect(azimutGorunur(-50, y[1].duvar)).toBe(false);
    expect(azimutGorunur(-50, y[1].duvar, 6)).toBe(true);
  });

  it("?fov=40: kenarlar ±60°, köşeler sürekli", () => {
    const d = duvarYerlesimleri(5760, 1080, duvarlariOlustur(40));
    expect(xAzimut(0, d[0])).toBeCloseTo(-60, 9);
    expect(xAzimut(5760, d[2])).toBeCloseTo(60, 9);
    expect(xAzimut(1920, d[0])).toBeCloseTo(xAzimut(1920, d[1]), 9);
  });
});

describe("ölçülmüş U oda: ön 6 m, yan 4 m, izleyici ön duvara 3 m, ortada", () => {
  const oda: OdaGeometrisi = { tip: "u", on: 6, yan: 4, yukseklik: 3, alt: 0.3, izleyiciX: 0, izleyiciZ: 3, goz: 1.7 };
  const duvarlar = odaDuvarlari(oda);
  const y = duvarYerlesimleri(5760, 1080, duvarlar);

  it("orta duvar ±45°; sol duvar ön köşede −45°, arka uçta −(90° + atan(1/3)) ≈ −108,43°", () => {
    const [sol, orta, sag] = duvarlar;
    expect(orta.solAzimut).toBeCloseTo(-45, 9);
    expect(orta.fov).toBeCloseTo(90, 9);
    expect(orta.yaw).toBeCloseTo(0, 9);
    expect(sol.solAzimut).toBeCloseTo(-(90 + derece(Math.atan(1 / 3))), 9);
    expect(sol.solAzimut).toBeCloseTo(-108.43, 2);
    expect(sol.solAzimut + sol.fov).toBeCloseTo(-45, 9);
    expect(sag.solAzimut).toBeCloseTo(45, 9);
    expect(sag.solAzimut + sag.fov).toBeCloseTo(108.43, 2);
    // eşdeğer yaw = duvar merkezinin yönü: sol duvarın ortası (x −3, z −1) → atan2(−3, 1)
    expect(sol.yaw).toBeCloseTo(derece(Math.atan2(-3, 1)), 9);
    expect(xAzimut(0, y[0])).toBeCloseTo(-108.43, 2);
    expect(xAzimut(1920, y[0])).toBeCloseTo(-45, 9);
    expect(xAzimut(1920, y[1])).toBeCloseTo(-45, 9);
    expect(xAzimut(3840, y[1])).toBeCloseTo(45, 9);
    expect(xAzimut(3840, y[2])).toBeCloseTo(45, 9);
  });

  it("yan duvarlar simetrik olmayan (off-axis) piramit; normaller odanın içine bakar", () => {
    const iz = y[0].izdusum;
    expect(iz.sol).toBeCloseTo(-1 / 3, 12);
    expect(iz.sag).toBeCloseTo(1, 12);
    expect(iz.normal[0]).toBeCloseTo(1, 12);
    expect(iz.sagEksen[2]).toBeCloseTo(-1, 12);
    expect(y[2].izdusum.normal[0]).toBeCloseTo(-1, 12);
    expect(y[2].izdusum.sol).toBeCloseTo(-1, 12);
    expect(y[2].izdusum.sag).toBeCloseTo(1 / 3, 12);
    // dikey sınırlar ölçüden: (alt − göz)/d … (alt + yükseklik − göz)/d, d = 3
    expect(iz.alt).toBeCloseTo((0.3 - 1.7) / 3, 12);
    expect(iz.ust).toBeCloseTo((0.3 + 3 - 1.7) / 3, 12);
  });

  it("ufuk göz hizasında: (alt + yükseklik − göz)/yükseklik · H, her duvarda aynı", () => {
    const beklenen = ((0.3 + 3 - 1.7) / 3) * 1080;
    for (const d of y) expect(ufukSatiri(d)).toBeCloseTo(beklenen, 6);
    const n: TuvalNoktasi = { x: 0, y: 0 };
    expect(yonuIzdusur(-70, 0, y[0], n)).toBe(true);
    expect(n.y).toBeCloseTo(beklenen, 6);
    expect(yonuIzdusur(10, 0, y[1], n)).toBe(true);
    expect(n.y).toBeCloseTo(beklenen, 6);
    // göz görüntünün alt kenarına inince ufuk görüntünün en altına iner
    const alcak = duvarYerlesimleri(5760, 1080, odaDuvarlari({ ...oda, goz: 0.3 }));
    expect(ufukSatiri(alcak[1])).toBeCloseTo(1080, 6);
  });

  it("izleyici kaymışken de (x 0,8 m, z 2,2 m) köşeler hem yatayda hem dikeyde sürekli", () => {
    const yer = duvarYerlesimleri(5760, 1080, odaDuvarlari({ ...oda, izleyiciX: 0.8, izleyiciZ: 2.2 }));
    const a: TuvalNoktasi = { x: 0, y: 0 };
    const b: TuvalNoktasi = { x: 0, y: 0 };
    for (const [i, j] of [
      [0, 1],
      [1, 2],
    ]) {
      const kose = yer[i].duvar.solAzimut + yer[i].duvar.fov;
      expect(aciNormalize(yer[j].duvar.solAzimut - kose)).toBeCloseTo(0, 9);
      for (const e of [-15, 0, 10]) {
        expect(yonuIzdusur(kose, e, yer[i], a, 0.001)).toBe(true);
        expect(yonuIzdusur(kose, e, yer[j], b, 0.001)).toBe(true);
        expect(a.x).toBeCloseTo(yer[j].x, 6);
        expect(b.x).toBeCloseTo(yer[j].x, 6);
        expect(a.y).toBeCloseTo(b.y, 6);
      }
    }
    // orta duvar artık simetrik değil: izleyici sağa kayınca sol kenar daha geniş açıda
    expect(yer[1].duvar.solAzimut).toBeCloseTo(-derece(Math.atan(3.8 / 2.2)), 9);
  });

  it("özet: geometri ve duvar açıları", () => {
    const [geometri, acilar] = geometriOzeti(oda, duvarlar);
    expect(geometri).toContain("U oda");
    expect(acilar).toContain("sol 63,4°");
    expect(acilar).toContain("orta 90°");
    expect(geometriOzeti(null, duvarlariOlustur(90))[1]).toContain("sağ 90° (45° … 135°)");
  });
});

describe("düz duvar, 3 projektör", () => {
  const oda = odaGeometrisiCoz("duz,on=9,yuk=2.5,alt=0.3,z=4,goz=1.7")!;
  const duvarlar = odaDuvarlari(oda);
  const y = duvarYerlesimleri(5760, 1080, duvarlar);

  it("üç görüntü aynı yöne bakar, aynı dikey sınırlarda; sınırlarda süreklidir", () => {
    for (const d of duvarlar) {
      for (let e = 0; e < 3; e++) {
        expect(d.izdusum.sagEksen[e]).toBeCloseTo(duvarlar[1].izdusum.sagEksen[e], 12);
        expect(d.izdusum.yukariEksen[e]).toBeCloseTo(duvarlar[1].izdusum.yukariEksen[e], 12);
        expect(d.izdusum.normal[e]).toBeCloseTo(duvarlar[1].izdusum.normal[e], 12);
      }
      expect(d.izdusum.alt).toBeCloseTo((0.3 - 1.7) / 4, 12);
      expect(d.izdusum.ust).toBeCloseTo((0.3 + 2.5 - 1.7) / 4, 12);
    }
    expect(duvarlar[0].izdusum.sag).toBeCloseTo(duvarlar[1].izdusum.sol, 12);
    expect(duvarlar[1].izdusum.sag).toBeCloseTo(duvarlar[2].izdusum.sol, 12);
    expect(xAzimut(1920, y[0])).toBeCloseTo(xAzimut(1920, y[1]), 9);
    expect(xAzimut(3840, y[1])).toBeCloseTo(xAzimut(3840, y[2]), 9);
    // dış kenarlar ±atan(4,5/4) ≈ ±48,37°, orta üçte bir ±atan(1,5/4) ≈ ±20,56°
    expect(xAzimut(0, y[0])).toBeCloseTo(-derece(Math.atan(4.5 / 4)), 9);
    expect(xAzimut(5760, y[2])).toBeCloseTo(derece(Math.atan(4.5 / 4)), 9);
    expect(duvarlar[1].fov).toBeCloseTo(2 * derece(Math.atan(1.5 / 4)), 9);
    // sınırdaki nokta iki görüntüde aynı satırda
    const a: TuvalNoktasi = { x: 0, y: 0 };
    const b: TuvalNoktasi = { x: 0, y: 0 };
    const sinir = xAzimut(3840, y[1]);
    expect(yonuIzdusur(sinir, 12, y[1], a, 0.001)).toBe(true);
    expect(yonuIzdusur(sinir, 12, y[2], b, 0.001)).toBe(true);
    expect(a.x).toBeCloseTo(3840, 6);
    expect(b.x).toBeCloseTo(3840, 6);
    expect(a.y).toBeCloseTo(b.y, 6);
  });
});

describe("köşe ötesi: kenarı aşan sprite (yer tutucu bulut/güneş/ağaç, figür gölgesi)", () => {
  it("ölçüsüz 90° duvar: köşe ötesindeki yön komşu duvardaki noktasına düşer, genişlik iki duvarda aynı", () => {
    const y = duvarYerlesimleri(5760, 1080);
    const a: TuvalNoktasi = { x: 0, y: 0 };
    const b: TuvalNoktasi = { x: 0, y: 0 };
    for (const az of [38, 44, 46, 50, 53]) {
      expect(azimutX(az, y[1], 8)).toBeCloseTo(azimutX(az, y[2], 8)!, 9);
      expect(azimutX(-az, y[1], 8)).toBeCloseTo(azimutX(-az, y[0], 8)!, 9);
      expect(aciGenisligi(az, 30, y[1])).toBeCloseTo(aciGenisligi(az, 30, y[2]), 9);
      for (const e of [-6, 0, 14]) {
        expect(yonuIzdusur(az, e, y[1], a, 8)).toBe(true);
        expect(yonuIzdusur(az, e, y[2], b, 8)).toBe(true);
        expect(a.x).toBeCloseTo(b.x, 9);
        expect(a.y).toBeCloseTo(b.y, 9);
      }
    }
    // 50°: sağ duvardaki yeri köşeden (1 − tan 40°)/2 · 1920 ≈ 154,5 px (orta duvarın kendi uzantısı 184 px derdi)
    expect(azimutX(50, y[1], 8)! - 3840).toBeCloseTo(((1 - Math.tan(radyan(40))) / 2) * 1920, 6);
    // 30°'lik bulut 50°'de: iki duvarda da aynı (önce orta 1387 px, sağ 923 px)
    expect(aciGenisligi(50, 30, y[1])).toBeCloseTo(azimutX(65, y[2])! - azimutX(35, y[1])!, 6);
    // dış kenarın ötesi (komşu yok): duvarın kendi perspektif uzantısı, arka boşlukta da eskisi gibi
    expect(azimutX(-140, y[0], 8)).toBeCloseTo(((1 + Math.tan(radyan(-50))) / 2) * 1920, 6);
    expect(azimutKonum(-140, y, 20)?.x).toBeCloseTo(((1 + Math.tan(radyan(-50))) / 2) * 1920, 6);
    expect(azimutX(150, y[1], 120)).toBeCloseTo(4800 + Math.tan(radyan(60)) * 960, 6);
  });

  it("ölçülmüş U oda (kaymış izleyici) ve düz duvar: köşe / sınır ötesinde iki duvar aynı nokta ve genişlik", () => {
    const u: OdaGeometrisi = { tip: "u", on: 6, yan: 4, yukseklik: 3, alt: 0.3, izleyiciX: 0.8, izleyiciZ: 2.2, goz: 1.7 };
    for (const oda of [u, { ...u, tip: "duz" as const, on: 9, yan: 0, izleyiciZ: 4, izleyiciX: -0.6 }]) {
      const yer = duvarYerlesimleri(5760, 1080, odaDuvarlari(oda));
      for (const [i, j] of [
        [0, 1],
        [1, 2],
      ]) {
        const kose = yer[j].duvar.solAzimut;
        for (const d of [-7, -2, 2, 7]) {
          expect(azimutX(kose + d, yer[i], 10)).toBeCloseTo(azimutX(kose + d, yer[j], 10)!, 6);
          expect(aciGenisligi(kose + d, 20, yer[i])).toBeCloseTo(aciGenisligi(kose + d, 20, yer[j]), 6);
        }
      }
      // tuvalde soldan sağa artar (köşe ötesi komşu duvarın bölgesine düşer)
      const xler = [-60, -50, -40, -20, 0, 20, 40, 50, 60].map((az) => azimutX(az, yer[1], 70)!);
      for (let k = 1; k < xler.length; k++) expect(xler[k]).toBeGreaterThan(xler[k - 1]);
    }
    // düz duvarda sınır ötesi = aynı düzlemin perspektif uzantısı (komşu duvarın noktası onunla aynı)
    const duz = duvarYerlesimleri(5760, 1080, odaDuvarlari({ ...u, tip: "duz", on: 9, yan: 0, izleyiciZ: 4, izleyiciX: 0 }));
    const az = derece(Math.atan(2 / 4)); // orta üçte birin (±1,5 m) ötesinde, 2 m sağda
    expect(azimutX(az, duz[1], 10)).toBeCloseTo(2880 + (2 / 1.5) * 960, 6);
  });
});

describe("ters izdüşüm", () => {
  it("yön → tuval → yön gidiş-dönüş (ölçüsüz, U oda, kaymış izleyici, düz duvar)", () => {
    const u: OdaGeometrisi = { tip: "u", on: 6, yan: 4, yukseklik: 3, alt: 0.3, izleyiciX: 0, izleyiciZ: 3, goz: 1.7 };
    const yerlesimler = [
      duvarYerlesimleri(5760, 1080),
      duvarYerlesimleri(1920, 360, duvarlariOlustur(60)),
      duvarYerlesimleri(5760, 1080, odaDuvarlari(u)),
      duvarYerlesimleri(5760, 1080, odaDuvarlari({ ...u, izleyiciX: -1.2, izleyiciZ: 4.5, goz: 1.2 })),
      duvarYerlesimleri(5760, 1080, odaDuvarlari({ ...u, tip: "duz", on: 9, yan: 0 })),
    ];
    const n: TuvalNoktasi = { x: 0, y: 0 };
    for (const yer of yerlesimler) {
      for (const y of yer) {
        for (const k of [0.02, 0.3, 0.5, 0.77, 0.98]) {
          for (const e of [-25, -8, 0, 12, 30]) {
            const az = y.duvar.solAzimut + y.duvar.fov * k;
            expect(yonuIzdusur(az, e, y, n)).toBe(true);
            const yon = tuvaldenYon(n.x, n.y, y);
            expect(aciNormalize(yon.azimut - az)).toBeCloseTo(0, 9);
            expect(yon.yukseklik).toBeCloseTo(e, 9);
          }
        }
        // tuval → yön → tuval
        const yon = tuvaldenYon(y.x + y.genislik * 0.37, y.yukseklik * 0.81, y);
        expect(yonuIzdusur(yon.azimut, yon.yukseklik, y, n)).toBe(true);
        expect(n.x).toBeCloseTo(y.x + y.genislik * 0.37, 6);
        expect(n.y).toBeCloseTo(y.yukseklik * 0.81, 6);
      }
    }
  });
});

describe("?oda= ayrıştırma", () => {
  it("geçerli U ve düz duvar; eksik isteğe bağlı alanlar varsayılanla", () => {
    expect(odaGeometrisiCoz("u,on=6,yan=4,yuk=3,alt=0.2,x=0,z=3,goz=1.7")).toEqual({ tip: "u", on: 6, yan: 4, yukseklik: 3, alt: 0.2, izleyiciX: 0, izleyiciZ: 3, goz: 1.7 });
    // Yan duvarda kısmi görüntü (yang): ön köşeden görüntü genişliği; yan duvar boyunu aşamaz, 0,2'den küçük olamaz
    const kismi = odaGeometrisiCoz("u,on=6,yan=4,yang=3,yuk=3,alt=0.2,x=0,z=3,goz=1.7")!;
    expect(kismi.yanGoruntu).toBe(3);
    expect(odaGeometrisiYaz(kismi)).toBe("u,on=6,yan=4,yang=3,yuk=3,alt=0.2,x=0,z=3,goz=1.7");
    expect(odaGeometrisiCoz("u,on=6,yan=4,yang=5,yuk=3,z=3")).toBeNull();
    expect(odaGeometrisiCoz("u,on=6,yan=4,yang=0.1,yuk=3,z=3")).toBeNull();
    // Kısmi görüntüde yan duvarın açı aralığı daralır (arka uç ön köşeden yang kadar)
    const tam = odaDuvarlari(odaGeometrisiCoz("u,on=6,yan=4,yuk=3,z=3")!);
    const dar = odaDuvarlari(kismi);
    expect(dar[0].fov).toBeLessThan(tam[0].fov);
    expect(dar[1].fov).toBeCloseTo(tam[1].fov, 6);
    expect(odaGeometrisiCoz("duz,on=9,yuk=2.5,alt=0.3,z=4,goz=1.7")).toEqual({ tip: "duz", on: 9, yan: 0, yukseklik: 2.5, alt: 0.3, izleyiciX: 0, izleyiciZ: 4, goz: 1.7 });
    expect(odaGeometrisiCoz(" U, on=6 ,yan=4,yuk=3,z=3,")).toEqual({ tip: "u", on: 6, yan: 4, yukseklik: 3, alt: 0, izleyiciX: 0, izleyiciZ: 3, goz: 1.7 });
    expect(odaGeometrisiCoz("u,on=6,yan=4,yuk=3,z=3,x=-2.5")?.izleyiciX).toBe(-2.5);
  });

  it("geçersiz girdi → null (varsayılana düşer)", () => {
    const hatalilar = [
      null,
      undefined,
      "",
      "sifirla",
      "v,on=6,yuk=3,z=3",
      "u",
      "u,on=6,yuk=3,z=3", // yan yok
      "duz,yuk=3,z=3", // on yok
      "u,on=6,yan=4,z=3", // yükseklik yok
      "u,on=6,yan=4,yuk=3", // izleyici uzaklığı yok
      "u,on=6,yan=4,yuk=3,z=3,foo=1",
      "u,on=6,yan=4,yuk=3,z=3,toString=1",
      "u,on=6,yan=4,yuk=3,z=3,on=7", // tekrar
      "u,on=abc,yan=4,yuk=3,z=3",
      "u,on=,yan=4,yuk=3,z=3",
      "u,on6,yan=4,yuk=3,z=3",
      "u,on=6,yan=4,yuk=3,z=3,x=3", // izleyici yan duvar düzleminde
      "u,on=6,yan=4,yuk=-3,z=3",
      "u,on=6,yan=4,yuk=3,z=3,goz=12",
      "duz,on=9,yuk=2.5,z=0",
      "duz,on=9,yuk=2.5,z=4,x=12",
    ];
    for (const metin of hatalilar) expect(odaGeometrisiCoz(metin), String(metin)).toBeNull();
  });

  it("yaz → çöz gidiş-dönüş (milimetre)", () => {
    const g: OdaGeometrisi = { tip: "u", on: 7.25, yan: 3.5, yukseklik: 2.8, alt: 0.15, izleyiciX: -0.4, izleyiciZ: 2.6, goz: 1.65 };
    expect(odaGeometrisiYaz(g)).toBe("u,on=7.25,yan=3.5,yuk=2.8,alt=0.15,x=-0.4,z=2.6,goz=1.65");
    expect(odaGeometrisiCoz(odaGeometrisiYaz(g))).toEqual(g);
    const d = odaGeometrisiCoz("duz,on=9,yuk=2.5,alt=0.3,z=4,goz=1.7")!;
    expect(odaGeometrisiYaz(d)).toBe("duz,on=9,yuk=2.5,alt=0.3,x=0,z=4,goz=1.7");
    expect(odaGeometrisiCoz(odaGeometrisiYaz(d))).toEqual(d);
  });
});
