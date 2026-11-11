import { describe, expect, it } from "vitest";
import { FirtinaZamanlayici } from "./firtina.js";
import { varsayilanDurum, type OrtamAyarlari } from "./tipler.js";

describe("FirtinaZamanlayici", () => {
  const kur = (o: Partial<OrtamAyarlari>) => {
    const ortam = { ...varsayilanDurum().ortam, ...o };
    const cakmalar: number[] = [];
    const z = new FirtinaZamanlayici({ ortam: () => ortam, simsek: (s) => cakmalar.push(s) }, () => 0.5);
    return { ortam, cakmalar, z };
  };

  it("şimşek kapalıyken hiç çakmaz", () => {
    const { z, cakmalar } = kur({ simsek: false, yagis: "siddetli_yagmur" });
    for (let t = 0; t < 120000; t += 1000) z.adim(t);
    expect(cakmalar).toHaveLength(0);
  });

  it("açılınca 3–11 sn içinde ilk, sonra 12–40 sn arayla çakar", () => {
    const { z, cakmalar } = kur({ simsek: true, yagis: "siddetli_yagmur" });
    const zamanlar: number[] = [];
    for (let t = 0; t <= 120000; t += 1000) {
      const n = cakmalar.length;
      z.adim(t);
      if (cakmalar.length > n) zamanlar.push(t);
    }
    expect(zamanlar[0]).toBe(7000);
    expect(zamanlar[1] - zamanlar[0]).toBe(26000);
    expect(cakmalar.every((s) => s >= 0.6 && s <= 1)).toBe(true);
  });

  it("kapatılıp açılınca sayaç baştan başlar", () => {
    const { z, ortam, cakmalar } = kur({ simsek: true });
    z.adim(0);
    ortam.simsek = false;
    z.adim(50000);
    ortam.simsek = true;
    z.adim(60000);
    z.adim(66000);
    expect(cakmalar).toHaveLength(0);
    z.adim(67000);
    expect(cakmalar).toHaveLength(1);
  });
});
