import { describe, expect, it } from "vitest";
import {
  aciNormalize,
  azimutKonum,
  azimutX,
  duvarYerlesimleri,
  duvarlariOlustur,
  gunIsigi,
  gunesKonumu,
  mesafeYerlesimi,
  xAzimut,
  yonAzimut,
  zamanDilimi,
} from "./projeksiyon";

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
