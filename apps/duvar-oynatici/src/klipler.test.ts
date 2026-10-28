import { afterEach, describe, expect, it, vi } from "vitest";
import { KlipKatmani, klipParcasi, type KlipParcasi } from "./klipler";
import { duvarYerlesimleri, odaDuvarlari, type TuvalNoktasi, ufukSatiri, yonuIzdusur } from "./projeksiyon";

const yeni = (): KlipParcasi => ({ xSol: 0, xSag: 0, yUst: 0, yAlt: 0, f0: 0, f1: 0 });

/** Çizim sırasını kaydeden sahte 2B bağlam (yalnız klip katmanının kullandığı çağrılar). */
function sahteBaglam() {
  const kayit: string[] = [];
  let kirpma = "";
  let sonRect = "";
  const ctx = {
    save: () => kayit.push("save"),
    restore: () => {
      kayit.push("restore");
      kirpma = "";
    },
    beginPath: () => undefined,
    rect: (x: number, _y: number, w: number) => {
      sonRect = `${x}-${x + w}`;
    },
    clip: () => {
      kirpma = sonRect;
    },
    ellipse: (x: number) => kayit.push(`golge x=${x.toFixed(3)} kirpma=${kirpma}`),
    fill: () => undefined,
    translate: () => undefined,
    scale: () => undefined,
    drawImage: (...a: number[]) => kayit.push(`resim ${a[5].toFixed(1)}-${(a[5] + a[7]).toFixed(1)}`),
    fillStyle: "",
    filter: "none",
    globalCompositeOperation: "source-over",
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, kayit };
}

describe("figür gölgesi köşede", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("gölge klibin tüm parçalarından önce, değdiği her duvarda o duvara kırpılmış ve aynı yerde çizilir", () => {
    // Node'da Image yok: yüklenmiş gibi davranan sahte resim
    vi.stubGlobal(
      "Image",
      class {
        naturalWidth = 100;
        naturalHeight = 300;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_: string) {
          this.onload?.();
        }
      },
    );
    const katman = new KlipKatmani();
    katman.ayarla({ asker: { dosya: "asker.png", kategori: "figur", genislikDerece: 10 } }, "");
    // 42° … 52°: köşeyi (45°) aşar, ortası (47°) döngüde sonra gelen sağ duvarda
    katman.oynat({ klip: "asker", azimut: 47 });
    const y = duvarYerlesimleri(5760, 1080);
    const { ctx, kayit } = sahteBaglam();
    katman.ciz(ctx, y, 540, 1080, 1, ["figur"]);
    const golgeler = kayit.filter((k) => k.startsWith("golge"));
    const resimler = kayit.filter((k) => k.startsWith("resim"));
    expect(resimler).toHaveLength(2); // orta + sağ duvar parçası
    expect(golgeler).toHaveLength(2); // elips köşeyi aşıyor: iki duvarda, her biri kendi duvarına kırpılmış
    expect(golgeler[0]).toContain("kirpma=1920-3840");
    expect(golgeler[1]).toContain("kirpma=3840-5760");
    expect(golgeler[0].split(" ")[1]).toBe(golgeler[1].split(" ")[1]); // aynı merkez
    // önce gölgeler, sonra resim parçaları (bacakların üstü kararmaz)
    expect(kayit.indexOf(golgeler[1])).toBeLessThan(kayit.indexOf(resimler[0]));
    expect(resimler[0]).toMatch(/-3840\.0$/);
    expect(resimler[1]).toMatch(/^resim 3840\.0-/);
  });
});

describe("klip yerleşimi (perspektif, köşede parçalı)", () => {
  const y = duvarYerlesimleri(5760, 1080);

  it("duvarın ortasındaki klip tek parça; alt kenarı yükseklik açısının izdüşümünde", () => {
    const p = yeni();
    expect(klipParcasi(0, 10, -4, 20, y[0], 0, p)).toBe(false);
    expect(klipParcasi(0, 10, -4, 20, y[1], 0, p)).toBe(true);
    expect(p.f0).toBe(0);
    expect(p.f1).toBe(1);
    expect((p.xSol + p.xSag) / 2).toBeCloseTo(2880, 6);
    expect(p.xSag - p.xSol).toBeCloseTo(Math.tan((5 * Math.PI) / 180) * 1920, 6);
    const n: TuvalNoktasi = { x: 0, y: 0 };
    yonuIzdusur(0, -4, y[1], n);
    expect(p.yAlt).toBeCloseTo(n.y, 9);
    expect(p.yAlt).toBeGreaterThan(ufukSatiri(y[1]));
    expect(p.yUst).toBeLessThan(ufukSatiri(y[1]));
    // sahne ufku izdüşümden farklıysa (yer tutucu sahne) klip o kadar kayar
    const k = yeni();
    klipParcasi(0, 10, -4, 20, y[1], 30, k);
    expect(k.yAlt - p.yAlt).toBeCloseTo(30, 9);
  });

  it("köşedeki klip iki duvara bölünür: aynı köşe sütununda ve aynı satırlarda birleşir, kaynakta boşluk yok", () => {
    const a = yeni();
    const b = yeni();
    expect(klipParcasi(44, 10, -4, 20, y[1], 0, a)).toBe(true);
    expect(klipParcasi(44, 10, -4, 20, y[2], 0, b)).toBe(true);
    expect(klipParcasi(44, 10, -4, 20, y[0], 0, yeni())).toBe(false);
    expect(a.xSag).toBeCloseTo(3840, 6);
    expect(b.xSol).toBeCloseTo(3840, 6);
    expect(a.f1).toBeCloseTo(0.6, 12); // 39° … 45° orta duvarda, 45° … 49° sağ duvarda
    expect(b.f0).toBeCloseTo(a.f1, 12);
    expect(a.f0).toBe(0);
    expect(b.f1).toBe(1);
    expect(a.yAlt).toBeCloseTo(b.yAlt, 6);
    expect(a.yUst).toBeCloseTo(b.yUst, 6);
  });

  it("ölçülmüş U odada (izleyici kaymış) köşe birleşimi de kesintisiz", () => {
    const u = duvarYerlesimleri(
      5760,
      1080,
      odaDuvarlari({ tip: "u", on: 6, yan: 4, yukseklik: 3, alt: 0.3, izleyiciX: 0.8, izleyiciZ: 2.2, goz: 1.7 }),
    );
    const kose = u[0].duvar.solAzimut + u[0].duvar.fov;
    const a = yeni();
    const b = yeni();
    expect(klipParcasi(kose + 1, 8, -6, 12, u[0], 0, a)).toBe(true);
    expect(klipParcasi(kose + 1, 8, -6, 12, u[1], 0, b)).toBe(true);
    expect(a.xSag).toBeCloseTo(u[1].x, 6);
    expect(b.xSol).toBeCloseTo(u[1].x, 6);
    expect(b.f0).toBeCloseTo(a.f1, 12);
    expect(a.f1).toBeCloseTo(3 / 8, 9);
    expect(a.yAlt).toBeCloseTo(b.yAlt, 6);
    expect(a.yUst).toBeCloseTo(b.yUst, 6);
  });
});
