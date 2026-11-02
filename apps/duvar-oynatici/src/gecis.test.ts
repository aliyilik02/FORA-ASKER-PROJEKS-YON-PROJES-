/**
 * Geçiş örtüsü (GecisKatmani): yakala → tam opak bekler → solma (Web Animations, compositor) → gizlenir ve tuval küçülür.
 * DOM yok: sahte öğe, çizim bağlamı ve animasyon; saat elle ilerletilir.
 */
import { describe, expect, it } from "vitest";
import { GecisKatmani, type GecisOgesi, gecisSuresiCoz } from "./gecis";

function sahteOge() {
  const cizimler: string[] = [];
  let bitir: (() => void) | null = null;
  const animasyonlar: Array<{ kareler: Keyframe[]; secenek: KeyframeAnimationOptions; iptal: boolean }> = [];
  const oge: GecisOgesi = {
    width: 1,
    height: 1,
    style: { visibility: "", opacity: "", transform: "" },
    getContext: () => ({
      fillStyle: "",
      globalAlpha: 1,
      drawImage: (_k: CanvasImageSource, x: number, y: number, w: number, h: number) => void cizimler.push(`kopya ${x},${y},${w}x${h}`),
      fillRect: (x: number, y: number, w: number, h: number) => void cizimler.push(`dolgu ${x},${y},${w}x${h}`),
    }),
    animate: (kareler, secenek) => {
      const a = { kareler, secenek, iptal: false };
      animasyonlar.push(a);
      return {
        finished: new Promise<unknown>((coz) => {
          bitir = () => coz(undefined);
        }),
        cancel: () => {
          a.iptal = true;
        },
      };
    },
  };
  return { oge, cizimler, animasyonlar, bitir: () => bitir?.() };
}

const kaynak = {} as CanvasImageSource;

describe("GecisKatmani", () => {
  it("yakala: 3B tuval boyutunda kopyalar, görünür ve tam opak bekler", () => {
    const s = sahteOge();
    const g = new GecisKatmani(s.oge, 600, () => 0);
    expect(s.oge.style.visibility).toBe("hidden");
    g.boyutlandir(1920, 360);
    g.yakala(kaynak);
    expect(s.cizimler).toEqual(["kopya 0,0,1920x360"]);
    expect([s.oge.width, s.oge.height]).toEqual([1920, 360]);
    expect(s.oge.style.visibility).toBe("visible");
    expect(g.suruyor).toBe(true);
    expect(g.solmaBekliyor).toBe(true);
    expect(g.opaklik).toBe(1);
  });

  it("solma: opaklık animasyonu (1 → 0, süre ve yumuşatma), bitince gizlenir ve tuval 1×1'e küçülür", async () => {
    const s = sahteOge();
    let t = 1000;
    const g = new GecisKatmani(s.oge, 600, () => t);
    g.boyutlandir(640, 360);
    g.yakala(kaynak);
    g.solmaBaslat();
    expect(g.solmaBekliyor).toBe(false);
    expect(g.suruyor).toBe(true);
    expect(s.animasyonlar[0].kareler).toEqual([{ opacity: 1 }, { opacity: 0 }]);
    expect(s.animasyonlar[0].secenek.duration).toBe(600);
    t = 1300;
    expect(g.opaklik).toBeGreaterThan(0.3);
    expect(g.opaklik).toBeLessThan(0.7);
    s.bitir();
    await Promise.resolve();
    expect(g.suruyor).toBe(false);
    expect(s.oge.style.visibility).toBe("hidden");
    expect([s.oge.width, s.oge.height]).toEqual([1, 1]);
    expect(g.opaklik).toBe(0);
  });

  it("ilk açılış: siyah dolgu; süre 0 (?gecis=0) anında kalkar", () => {
    const s = sahteOge();
    const g = new GecisKatmani(s.oge, 0, () => 0);
    g.boyutlandir(320, 180);
    g.siyahla();
    expect(s.cizimler).toEqual(["dolgu 0,0,320x180"]);
    expect(g.solmaBekliyor).toBe(true);
    g.solmaBaslat();
    expect(g.suruyor).toBe(false);
    expect(s.animasyonlar).toHaveLength(0);
  });

  it("animasyonun bitiş sözü gecikirse süre + 0,4 sn sonra guncelle örtüyü kaldırır; sarsıntı dönüşümü aktarılır", () => {
    const s = sahteOge();
    let t = 0;
    const g = new GecisKatmani(s.oge, 600, () => t);
    g.boyutlandir(320, 180);
    g.yakala(kaynak);
    g.guncelle("translate(2px, 1px)");
    expect(s.oge.style.transform).toBe("translate(2px, 1px)");
    g.solmaBaslat();
    t = 900;
    g.guncelle("");
    expect(g.suruyor).toBe(true);
    t = 1100;
    g.guncelle("");
    expect(g.suruyor).toBe(false);
    expect(s.animasyonlar[0].iptal).toBe(true);
  });

  it("geçiş sürerken boyut değişirse örtü hemen kalkar", () => {
    const s = sahteOge();
    const g = new GecisKatmani(s.oge, 600, () => 0);
    g.boyutlandir(320, 180);
    g.yakala(kaynak);
    g.boyutlandir(640, 360);
    expect(g.suruyor).toBe(false);
  });

  it("boyut bilinmeden yakalama yapılmaz", () => {
    const s = sahteOge();
    const g = new GecisKatmani(s.oge, 600, () => 0);
    g.yakala(kaynak);
    expect(g.suruyor).toBe(false);
    expect(s.cizimler).toHaveLength(0);
  });
});

describe("gecisSuresiCoz (?gecis=)", () => {
  it("varsayılan 600 ms, 0 anlık kesme, sınır 5000, geçersiz değer varsayılan", () => {
    expect(gecisSuresiCoz(null)).toBe(600);
    expect(gecisSuresiCoz("0")).toBe(0);
    expect(gecisSuresiCoz("900")).toBe(900);
    expect(gecisSuresiCoz("99999")).toBe(5000);
    expect(gecisSuresiCoz("-5")).toBe(0);
    expect(gecisSuresiCoz("abc")).toBe(600);
    expect(gecisSuresiCoz("")).toBe(600);
  });
});
