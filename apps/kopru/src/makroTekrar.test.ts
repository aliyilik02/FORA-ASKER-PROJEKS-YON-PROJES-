/**
 * Makro ve tekrar oynatma (8 Kasım): zamanlanmış adımlar sırayla uygulanır, durdurma bekleyenleri iptal eder, tekrar
 * akışı yalnız oynatılabilir olayları göreli zamanla ve hız çarpanıyla sıralar.
 */
import { describe, expect, it } from "vitest";
import { MakroCalistirici, type MakroZamanlayici } from "./makro.js";
import { TekrarOynatici, tekrarAkisi } from "./tekrar.js";
import type { Olay, SenaryoAdimi } from "./tipler.js";

/** Elle ilerletilen sahte zamanlayıcı (setTimeout benzeri). */
function sahte() {
  let simdi = 0;
  const bekleyen: Array<{ t: number; cb: () => void; iptal: boolean }> = [];
  const z: MakroZamanlayici = {
    simdi: () => simdi,
    zamanla: (cb, ms) => {
      const k = { t: simdi + ms, cb, iptal: false };
      bekleyen.push(k);
      return () => {
        k.iptal = true;
      };
    },
  };
  const ilerle = async (ms: number) => {
    const hedef = simdi + ms;
    for (;;) {
      const sirada = bekleyen.filter((k) => !k.iptal && k.t <= hedef).sort((a, b) => a.t - b.t)[0];
      if (!sirada) break;
      simdi = sirada.t;
      sirada.iptal = true;
      sirada.cb();
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
    }
    simdi = hedef;
  };
  return { z, ilerle };
}
const gunluk = { bilgi: () => undefined, uyari: () => undefined };
const adim = (id: string, gecikmeMs: number): SenaryoAdimi => ({ id, gecikmeMs, aciklama: id, islem: { tip: "bolge", bolge: "daglik" } });

describe("MakroCalistirici", () => {
  it("adımları gecikmesine göre uygular, bitince durum null; durdur bekleyenleri iptal eder", async () => {
    const { z, ilerle } = sahte();
    const uygulanan: string[] = [];
    const m = new MakroCalistirici(async (a) => void uygulanan.push(a.id), gunluk, z);
    const durumlar: Array<number | null> = [];
    m.dinle((d) => durumlar.push(d ? d.tamamlanan : null));
    m.baslat("Pusu", [adim("c", 2000), adim("a", 0), adim("b", 1000)]);
    await ilerle(1);
    expect(uygulanan).toEqual(["a"]);
    expect(m.al()?.adimSayisi).toBe(3);
    await ilerle(1500);
    expect(uygulanan).toEqual(["a", "b"]);
    await ilerle(1000);
    expect(uygulanan).toEqual(["a", "b", "c"]);
    expect(m.al()).toBeNull();
    expect(durumlar.at(-1)).toBeNull();
    // Durdur: ikinci adım gelmez; yeni makro eskisini iptal eder
    m.baslat("X", [adim("x1", 0), adim("x2", 500)]);
    await ilerle(1);
    expect(m.durdur()).toBe(true);
    await ilerle(1000);
    expect(uygulanan).toEqual(["a", "b", "c", "x1"]);
    m.baslat("Y", [adim("y1", 300)]);
    m.baslat("Z", [adim("z1", 300)]);
    await ilerle(400);
    expect(uygulanan.slice(-1)).toEqual(["z1"]);
  });
});

describe("TekrarOynatici", () => {
  const olaylar: Olay[] = [
    { zaman: 1000, tatbikat: "t1", tur: "tatbikat", ozet: "başladı" },
    { zaman: 1000, tatbikat: "t1", tur: "sahne", ozet: "sıfır", ayrinti: {} },
    { zaman: 2000, tatbikat: "t1", tur: "durum", ozet: "bölge", ayrinti: { fark: ["bölge"], durum: { bolge: "ormanlik" } } },
    { zaman: 3000, tatbikat: "t1", tur: "efekt", ozet: "patlama", ayrinti: { tur: "patlama", siddet: 1 } },
    { zaman: 3500, tatbikat: "t1", tur: "not", ozet: "not" },
    { zaman: 5000, tatbikat: "t1", tur: "figur", ozet: "figür", ayrinti: { islem: "oynat", id: "f1", klip: "komando_bekleyen", azimut: 0 } },
  ];
  it("tekrarAkisi yalnız oynatılabilir olayları ilk olaya göre zamanlar", () => {
    const akis = tekrarAkisi(olaylar);
    expect(akis.map((a) => [a.t, a.olay.tur])).toEqual([
      [0, "sahne"],
      [1000, "durum"],
      [2000, "efekt"],
      [4000, "figur"],
    ]);
    expect(tekrarAkisi([olaylar[0]])).toEqual([]);
  });
  it("olayları × hız ile uygular: önce sıfırlama, durum yükleme, efekt, figür; durdur keser", async () => {
    const { z, ilerle } = sahte();
    const kayit: string[] = [];
    const t = new TekrarOynatici(
      {
        durumuYukle: async (d) => void kayit.push(`durum:${(d as { bolge?: string }).bolge}`),
        efektTetikle: async (e) => void kayit.push(`efekt:${(e as { tur: string }).tur}`),
        figurKomutu: (k) => void kayit.push(`figur:${k.id}`),
        sahneSifirla: () => void kayit.push("sifirla"),
        gunluk,
      },
      z,
    );
    const d = t.baslat("Deneme", "t1", olaylar, 2);
    expect(d?.toplamMs).toBe(2000);
    expect(d?.olaySayisi).toBe(4);
    await ilerle(1);
    expect(kayit).toEqual(["sifirla", "sifirla"]); // başlangıç sıfırlaması + ilk olay (0 ms)
    await ilerle(600);
    expect(kayit.at(-1)).toBe("durum:ormanlik");
    await ilerle(500);
    expect(kayit.at(-1)).toBe("efekt:patlama");
    expect(t.durdur()).toBe(true);
    await ilerle(2000);
    expect(kayit.filter((k) => k.startsWith("figur"))).toHaveLength(0);
    expect(t.al()).toBeNull();
    // Hız 1: bitince durum null
    t.baslat("Deneme", "t1", olaylar, 1);
    await ilerle(4100);
    expect(kayit.at(-1)).toBe("figur:f1");
    expect(t.al()).toBeNull();
  });
});
