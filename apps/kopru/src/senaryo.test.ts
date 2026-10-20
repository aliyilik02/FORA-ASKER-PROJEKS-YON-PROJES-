import { describe, expect, it } from "vitest";
import { ArtNetGonderici } from "./artnet.js";
import { DurumDeposu } from "./durum.js";
import { Gunluk } from "./gunluk.js";
import { SenaryoMotoru, type Zamanlayici } from "./senaryo.js";
import type { Senaryo } from "./tipler.js";
import { UnrealIstemci } from "./unreal.js";

/** Elle ilerletilen sahte saat. */
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
    simdi += ms;
    for (const cb of [...geriCagrilar]) cb();
    await new Promise((r) => setTimeout(r, 0));
  };
  return { z, ilerle };
}

function kur() {
  const gunluk = new Gunluk();
  const unreal = new UnrealIstemci({ adres: "http://localhost:30010", preset: "Test", mod: "simulasyon" }, gunluk);
  const artnet = new ArtNetGonderici({ hedef: "127.0.0.1", port: 6454, evren: 0, aktif: false });
  const depo = new DurumDeposu(unreal, artnet, gunluk);
  const { z, ilerle } = sahteZamanlayici();
  const motor = new SenaryoMotoru(depo, gunluk, z, 50);
  return { depo, unreal, motor, ilerle };
}

const senaryo: Senaryo = {
  id: "t1",
  ad: "Test",
  oda: "oda1",
  adimlar: [
    { id: "s2", gecikmeMs: 2000, aciklama: "patlama", islem: { tip: "efekt", efekt: { tur: "patlama", siddet: 1 } } },
    { id: "s1", gecikmeMs: 0, aciklama: "bölge", islem: { tip: "bolge", bolge: "ormanlik" } },
    { id: "s3", gecikmeMs: 4000, aciklama: "mermi", islem: { tip: "izli_mermi", izliMermi: { aktif: true, siklik: 5 } } },
  ],
};

describe("senaryo motoru", () => {
  it("adımları gecikmeye göre sırayla tetikler ve tamamlanınca durur", async () => {
    const { depo, unreal, motor, ilerle } = kur();
    motor.yukle(senaryo);
    expect(motor.al().toplamMs).toBe(4000);

    await motor.oynat();
    expect(motor.al().durum).toBe("oynuyor");
    expect(motor.al().tamamlanan).toEqual(["s1"]);
    expect(depo.al().bolge).toBe("ormanlik");

    await ilerle(1000);
    expect(motor.al().tamamlanan).toEqual(["s1"]);

    await ilerle(1500);
    expect(motor.al().tamamlanan).toEqual(["s1", "s2"]);
    expect(depo.al().sonEfektler[0]?.tur).toBe("patlama");

    await ilerle(2000);
    expect(motor.al().tamamlanan).toEqual(["s1", "s2", "s3"]);
    expect(motor.al().durum).toBe("duruyor");
    expect(depo.al().izliMermi.aktif).toBe(true);

    const cagrilar = unreal.gonderilen.map((g) => g.yol.split("/").pop());
    expect(cagrilar).toContain("BolgeYukle");
    expect(cagrilar).toContain("EfektTetikle");
    expect(cagrilar).toContain("IzliMermiAyarla");
  });

  it("duraklatıp devam edince konumu korur", async () => {
    const { motor, ilerle } = kur();
    motor.yukle(senaryo);
    await motor.oynat();
    await ilerle(1000);
    motor.duraklat();
    expect(motor.al().durum).toBe("duraklatildi");
    expect(motor.al().konumMs).toBe(1000);

    await ilerle(5000); // duraklatılmışken geçen süre sayılmaz
    expect(motor.al().tamamlanan).toEqual(["s1"]);

    await motor.oynat();
    await ilerle(1100);
    expect(motor.al().tamamlanan).toEqual(["s1", "s2"]);
  });

  it("durdurulunca sıfırlanır", async () => {
    const { motor, ilerle } = kur();
    motor.yukle(senaryo);
    await motor.oynat();
    await ilerle(2500);
    motor.dur();
    expect(motor.al().durum).toBe("duruyor");
    expect(motor.al().konumMs).toBe(0);
  });
});

describe("durum deposu", () => {
  it("değerleri sınırlar ve uzak sesleri oda 2 ayarlarıyla tamamlar", async () => {
    const { depo, unreal } = kur();
    await depo.ortamGuncelle({ saat: 30, bulut: 2, ruzgarYonu: -90 });
    const o = depo.al().ortam;
    expect(o.saat).toBe(24);
    expect(o.bulut).toBe(1);
    expect(o.ruzgarYonu).toBe(270);

    await depo.oda2Guncelle({ uzakSesMesafesi: 1200, uzakSesYonu: 135 });
    await depo.efektTetikle({ tur: "uzak_patlama" });
    const son = unreal.gonderilen.at(-1)!.govde as { Parameters: Record<string, unknown> };
    expect(son.Parameters.Mesafe).toBe(1200);
    expect(son.Parameters.Yon).toBe(135);
  });
});
