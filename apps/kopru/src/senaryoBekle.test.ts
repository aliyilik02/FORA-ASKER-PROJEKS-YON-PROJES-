/**
 * `bekle_onay` ve `safha` adımları (8 Kasım, B-10): senaryo "bekliyor"a düşer, eğitmen Devam deyince sonraki adımlar
 * bekleme süresi kadar kayar (göreli zamanlar korunur); safha adımı durum.safha'yı değiştirir; Durdur beklemeyi siler.
 */
import { describe, expect, it } from "vitest";
import { ArtNetGonderici } from "./artnet.js";
import { DurumDeposu } from "./durum.js";
import { Gunluk } from "./gunluk.js";
import { SenaryoMotoru, type Zamanlayici } from "./senaryo.js";
import type { Senaryo } from "./tipler.js";
import { UnrealIstemci } from "./unreal.js";

function sahteZamanlayici() {
  let simdi = 0;
  const geriCagrilar: Array<() => void> = [];
  const z: Zamanlayici = {
    simdi: () => simdi,
    aralik: (cb) => {
      geriCagrilar.push(cb);
      return () => {
        const i = geriCagrilar.indexOf(cb);
        if (i >= 0) geriCagrilar.splice(i, 1);
      };
    },
  };
  const ilerle = async (ms: number) => {
    for (let t = 0; t < ms; t += 50) {
      simdi += 50;
      for (const cb of [...geriCagrilar]) cb();
      await new Promise((r) => setTimeout(r, 0));
    }
  };
  return { z, ilerle, simdi: () => simdi };
}

function kur() {
  const gunluk = new Gunluk();
  const unreal = new UnrealIstemci({ adres: "http://x", preset: "T", mod: "simulasyon" }, gunluk);
  const artnet = new ArtNetGonderici({ hedef: "127.0.0.1", port: 6454, evren: 0, aktif: false });
  const depo = new DurumDeposu(unreal, artnet, gunluk);
  const { z, ilerle } = sahteZamanlayici();
  const motor = new SenaryoMotoru(depo, gunluk, z, 50);
  return { depo, motor, ilerle };
}

const SENARYO: Senaryo = {
  id: "bk",
  ad: "Bekle",
  oda: "oda1",
  adimlar: [
    { id: "s1", gecikmeMs: 0, aciklama: "ateş altında", islem: { tip: "safha", safha: "ates_altinda" } },
    { id: "s2", gecikmeMs: 500, aciklama: "turnike bekle", islem: { tip: "bekle_onay", mesaj: "Turnike uygulanınca Devam" } },
    { id: "s3", gecikmeMs: 1000, aciklama: "taktik saha", islem: { tip: "safha", safha: "taktik_saha" } },
    { id: "s4", gecikmeMs: 1500, aciklama: "bölge", islem: { tip: "bolge", bolge: "ormanlik" } },
  ],
};

describe("senaryo – eğitmen onayı ve safha", () => {
  it("bekle_onay adımında durur, Devam'dan sonra kalan adımlar göreli zamanlarıyla sürer", async () => {
    const { depo, motor, ilerle } = kur();
    const yayinlar: string[] = [];
    motor.dinle((s) => yayinlar.push(s.durum));
    motor.yukle(SENARYO);
    await motor.oynat();
    await ilerle(600);
    const d = motor.al();
    expect(d.durum).toBe("bekliyor");
    expect(d.bekleme).toEqual({ adimId: "s2", mesaj: "Turnike uygulanınca Devam" });
    expect(d.tamamlanan).toEqual(["s1", "s2"]);
    expect(depo.al().safha).toBe("ates_altinda");
    // Beklerken zaman geçer, adımlar ilerlemez
    await ilerle(3000);
    expect(motor.al().durum).toBe("bekliyor");
    expect(motor.al().tamamlanan).toEqual(["s1", "s2"]);
    expect(depo.al().safha).toBe("ates_altinda");
    // Devam: s3 bekleme konumundan 500 ms sonra, s4 1000 ms sonra
    motor.devamEt();
    expect(motor.al().durum).toBe("oynuyor");
    expect(motor.al().bekleme).toBeUndefined();
    await ilerle(400);
    expect(motor.al().tamamlanan).toEqual(["s1", "s2"]);
    await ilerle(200);
    expect(motor.al().tamamlanan).toEqual(["s1", "s2", "s3"]);
    expect(depo.al().safha).toBe("taktik_saha");
    await ilerle(600);
    expect(motor.al().tamamlanan).toEqual(["s1", "s2", "s3", "s4"]);
    expect(motor.al().durum).toBe("duruyor");
    expect(depo.al().bolge).toBe("ormanlik");
    expect(yayinlar).toContain("bekliyor");
  });

  it("oynat() bekliyorken devam eder; Durdur beklemeyi siler; devamEt bekliyor değilken etkisiz", async () => {
    const { motor, ilerle } = kur();
    motor.yukle(SENARYO);
    await motor.oynat();
    await ilerle(600);
    expect(motor.al().durum).toBe("bekliyor");
    await motor.oynat();
    expect(motor.al().durum).toBe("oynuyor");
    motor.dur();
    expect(motor.al().durum).toBe("duruyor");
    expect(motor.al().bekleme).toBeUndefined();
    motor.devamEt();
    expect(motor.al().durum).toBe("duruyor");
  });

  it("elle tetiklenen bekle_onay adımı beklemez ({tamam:true})", async () => {
    const { motor } = kur();
    motor.yukle(SENARYO);
    expect(await motor.adimiTetikle(SENARYO.adimlar[1])).toEqual({ tamam: true });
    expect(motor.al().durum).toBe("duruyor");
  });
});
