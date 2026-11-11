import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { EZ_TURLERI, ezTuruMu, yapraklariSeyrelt, yaprakNormalleri } from "./ezAgac";
import { bitkiListesi } from "./arazi";

/** ez-tree düzeninde dörtgenler: köşe 0 sol üst, 1 sol alt, 2 sağ alt, 3 sağ üst; normal +z. */
function kartlar(sayi: number, aralik = 1): THREE.BufferGeometry {
  const p: number[] = [];
  const n: number[] = [];
  const uv: number[] = [];
  const ix: number[] = [];
  for (let k = 0; k < sayi; k++) {
    const x = k * aralik;
    p.push(x - 0.5, 1, 0, x - 0.5, 0, 0, x + 0.5, 0, 0, x + 0.5, 1, 0);
    n.push(0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1);
    uv.push(0, 1, 0, 0, 1, 0, 1, 1);
    const o = k * 4;
    ix.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(n, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(ix);
  return g;
}

describe("ez-tree yardımcıları", () => {
  it("uzak kopya: tek kartta yarısı kalır, kalan kart tabanından büyür", () => {
    const g = yapraklariSeyrelt(kartlar(10), 1, 1.4);
    expect(g.getAttribute("position").count).toBe(5 * 4);
    expect(g.index!.count).toBe(5 * 6);
    const p = g.getAttribute("position");
    // İlk kart: taban (0,0,0) sabit, üst köşe 1 → 1,4
    expect(p.getY(1)).toBeCloseTo(0);
    expect(p.getY(0)).toBeCloseTo(1.4);
    expect(p.getX(0)).toBeCloseTo(-0.7);
  });

  it("uzak kopya: çift kartta birim (iki dörtgen) bölünmez", () => {
    const g = yapraklariSeyrelt(kartlar(8), 2, 1);
    // 4 birimden 2'si kalır = 4 dörtgen; kalanlar 0,1 ve 4,5 numaralı dörtgenler (x = 0,1,4,5)
    const p = g.getAttribute("position");
    const xler = [0, 1, 2, 3].map((q) => Math.round((p.getX(q * 4 + 1) + p.getX(q * 4 + 2)) / 2));
    expect(xler).toEqual([0, 1, 4, 5]);
  });

  it("uzak kopya tek yüz: çift kartın yalnız ilk dörtgeni kalır (¼)", () => {
    const g = yapraklariSeyrelt(kartlar(8), 2, 1, true);
    const p = g.getAttribute("position");
    expect(p.count).toBe(2 * 4);
    const xler = [0, 1].map((q) => Math.round((p.getX(q * 4 + 1) + p.getX(q * 4 + 2)) / 2));
    expect(xler).toEqual([0, 4]);
  });

  it("taç normali: dışa bakar, birim uzunlukta", () => {
    const g = kartlar(9, 2);
    yaprakNormalleri(g, 1);
    const p = g.getAttribute("position");
    const n = g.getAttribute("normal");
    for (let i = 0; i < n.count; i++) {
      expect(Math.hypot(n.getX(i), n.getY(i), n.getZ(i))).toBeCloseTo(1, 5);
    }
    // En soldaki kartın normali sola (-x), en sağdakinin sağa (+x) yatar
    expect(n.getX(1)).toBeLessThan(-0.5);
    expect(n.getX(p.count - 2)).toBeGreaterThan(0.5);
  });

  it("tür adı ve varyant tanınır, bilinmeyen tanınmaz", () => {
    expect(ezTuruMu("ez_karacam")).toBe(true);
    expect(ezTuruMu("ez_karacam~2")).toBe(true);
    expect(ezTuruMu("ez_yok")).toBe(false);
    expect(ezTuruMu("m_cam_2")).toBe(false);
  });

  it("bitki setlerindeki her ez_ türü tabloda var (yaz ve kış)", () => {
    for (const set of ["bozkir", "orman", "dag", "us", "kent"] as const) {
      for (const kar of [0, 1]) {
        for (const b of bitkiListesi(set, kar)) {
          if (b.klasor.startsWith("ez_")) expect(ezTuruMu(b.klasor), `${set}/${kar}: ${b.klasor}`).toBe(true);
        }
      }
    }
  });

  it("kışta yaprak döken türler yapraksız karşılığına geçer", () => {
    const kis = bitkiListesi("bozkir", 1).map((b) => b.klasor);
    expect(kis).toContain("ez_kis_kavak~1");
    expect(kis).toContain("ez_kis_mese~2");
    expect(kis.some((k) => k.startsWith("ez_kavak") || k.startsWith("ez_mese"))).toBe(false);
    for (const k of kis.filter((k) => k.startsWith("ez_kis_"))) expect(EZ_TURLERI[k.split("~")[0]].yapraksiz).toBe(true);
  });
});
