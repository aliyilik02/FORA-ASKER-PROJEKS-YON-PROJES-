/**
 * 8 Kasım değerlendirmesi §3-1: bozuk/eksik senaryo adımı (elle düzenlenmiş senaryolar.json) köprüyü düşürmez; hata
 * günlüğe yazılır, senaryo sonraki adımlarla sürer ve tamamlanır.
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
  return { z, ilerle };
}

describe("senaryo motoru – bozuk adım", () => {
  it("ortam alanı eksik adım ve bilinmeyen işlem tipi günlüğe hata yazar, senaryo sürüp tamamlanır", async () => {
    const gunluk = new Gunluk();
    const hatalar: string[] = [];
    gunluk.dinle((s) => s.seviye === "hata" && hatalar.push(s.mesaj));
    const unreal = new UnrealIstemci({ adres: "http://x", preset: "T", mod: "simulasyon" }, gunluk);
    const artnet = new ArtNetGonderici({ hedef: "127.0.0.1", port: 6454, evren: 0, aktif: false });
    const depo = new DurumDeposu(unreal, artnet, gunluk);
    const { z, ilerle } = sahteZamanlayici();
    const motor = new SenaryoMotoru(depo, gunluk, z, 50);
    const bozuk = {
      id: "bz",
      ad: "Bozuk",
      oda: "oda1",
      adimlar: [
        { id: "a1", gecikmeMs: 0, aciklama: "ortam alanı yok", islem: { tip: "ortam" } },
        { id: "a2", gecikmeMs: 100, aciklama: "işlem yok", islem: undefined },
        { id: "a3", gecikmeMs: 200, aciklama: "bölge", islem: { tip: "bolge", bolge: "ormanlik" } },
      ],
    } as unknown as Senaryo;
    motor.yukle(bozuk);
    await motor.oynat();
    await ilerle(400);
    expect(motor.al().durum).toBe("duruyor");
    expect(motor.al().tamamlanan).toEqual(["a1", "a2", "a3"]);
    expect(depo.al().bolge).toBe("ormanlik");
    expect(hatalar.filter((h) => h.includes("Senaryo adımı uygulanamadı"))).toHaveLength(2);
  });
});
