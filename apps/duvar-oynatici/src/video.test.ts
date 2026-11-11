/**
 * Panorama seçimi ve en yakın yedek (video.ts panoramaAdaylari / panoramaSec): tam eşleşmede eski kural (en özel kayıt),
 * eksik birleşimde önce aynı zaman (başka mevsim), sonra aynı mevsimde en yakın zaman (gecede alacakaranlık, sonra
 * gündüz). Gerçek manifestte hiçbir bölge/mevsim/zaman birleşimi panoramasız kalmamalı (yer tutucuya düşmez).
 */
import { describe, expect, it } from "vitest";
import gercekManifest from "../public/icerik/manifest.json";
import type { Bolge, Mevsim } from "./tipler";
import { type Manifest, type PanoramaKaydiManifest, panoramaAdaylari, panoramaSec } from "./video";
import type { ZamanDilimi } from "./projeksiyon";

const p = (bolge: Bolge, mevsim: "yaz" | "kis" | undefined, zaman: ZamanDilimi | undefined, dosya: string, ek: Partial<PanoramaKaydiManifest> = {}): PanoramaKaydiManifest => ({ bolge, mevsim, zaman, dosya, ...ek });

/** Gerçek manifestin (Kasım 2026) birleşim düzeni: dağlıkta kış yalnız gündüz, üste gece yok. */
const MANIFEST: Manifest = {
  panorama: [
    p("kirsal_acik_arazi", "yaz", "gunduz", "kirsal/ai.jpg"),
    p("kirsal_acik_arazi", "yaz", "gunduz", "kirsal/foto.jpg", { _ornek: true }),
    p("kirsal_acik_arazi", "yaz", "alacakaranlik", "kirsal/yaz_alaca.jpg"),
    p("kirsal_acik_arazi", "yaz", "gece", "kirsal/yaz_gece.jpg"),
    p("kirsal_acik_arazi", "kis", "gunduz", "kirsal/kis_gunduz.jpg"),
    p("kirsal_acik_arazi", "kis", "alacakaranlik", "kirsal/kis_alaca.jpg"),
    p("daglik", "kis", "gunduz", "daglik/kis_gunduz.jpg"),
    p("daglik", "yaz", "alacakaranlik", "daglik/yaz_alaca.jpg"),
    p("daglik", "yaz", "gece", "daglik/yaz_gece.jpg"),
    p("daglik", "yaz", "gunduz", "daglik/yaz_gunduz.jpg"),
    p("us_bolgesi", "kis", "alacakaranlik", "us/kis_alaca.jpg"),
    p("us_bolgesi", "kis", "gunduz", "us/kis_gunduz.jpg"),
    p("us_bolgesi", "yaz", "alacakaranlik", "us/yaz_alaca.jpg"),
    p("us_bolgesi", "yaz", "gunduz", "us/yaz_gunduz.jpg"),
    p("meskun_mahal", undefined, undefined, "meskun/genel.jpg"),
    p("meskun_mahal", "kis", "gece", "meskun/kis_gece.jpg"),
  ],
};

describe("panoramaAdaylari: tam eşleşme", () => {
  it("tam eşleşme yedek sayılmaz; _ornek kayıt seçilmez", () => {
    const [ilk] = panoramaAdaylari(MANIFEST, "kirsal_acik_arazi", "yaz", "gunduz");
    expect(ilk.kayit.dosya).toBe("kirsal/ai.jpg");
    expect(ilk.yedek).toBe(false);
    expect(panoramaAdaylari(MANIFEST, "kirsal_acik_arazi", "yaz", "gunduz").some((a) => a.kayit._ornek)).toBe(false);
  });
  it("en özel kayıt kazanır (mevsimi ve zamanı yazılı olan genel kaydın önünde)", () => {
    expect(panoramaSec(MANIFEST, "meskun_mahal", "kis", "gece")?.dosya).toBe("meskun/kis_gece.jpg");
    expect(panoramaSec(MANIFEST, "meskun_mahal", "yaz", "gunduz")?.dosya).toBe("meskun/genel.jpg");
  });
});

describe("panoramaAdaylari: eksik birleşimde en yakın panorama", () => {
  it("önce aynı zaman, başka mevsim: dağlık kış gece → dağlık yaz gece (zamanı korunur)", () => {
    const [a] = panoramaAdaylari(MANIFEST, "daglik", "kis", "gece");
    expect(a.kayit.dosya).toBe("daglik/yaz_gece.jpg");
    expect(a.yedek).toBe(true);
    expect(a.mevsimFarkli).toBe(true);
    expect(a.zamanFarkli).toBe(false);
  });
  it("kırsal kış gece → kırsal yaz gece", () => {
    expect(panoramaSec(MANIFEST, "kirsal_acik_arazi", "kis", "gece")?.dosya).toBe("kirsal/yaz_gece.jpg");
  });
  it("aynı zaman hiç yoksa aynı mevsimde gecede önce alacakaranlık: üs yaz gece → üs yaz alacakaranlık (zaman farklı)", () => {
    const [a] = panoramaAdaylari(MANIFEST, "us_bolgesi", "yaz", "gece");
    expect(a.kayit.dosya).toBe("us/yaz_alaca.jpg");
    expect(a.zamanFarkli).toBe(true);
    expect(a.mevsimFarkli).toBe(false);
    expect(panoramaSec(MANIFEST, "us_bolgesi", "kis", "gece")?.dosya).toBe("us/kis_alaca.jpg");
  });
  it("kalan adaylar sırayla (yükleme hatasında denenir): üs yaz gece → yaz alaca, kış alaca, yaz gündüz, kış gündüz", () => {
    expect(panoramaAdaylari(MANIFEST, "us_bolgesi", "yaz", "gece").map((a) => a.kayit.dosya)).toEqual(["us/yaz_alaca.jpg", "us/kis_alaca.jpg", "us/yaz_gunduz.jpg", "us/kis_gunduz.jpg"]);
  });
  it("gündüz için alacakaranlık gecenin önünde", () => {
    const m: Manifest = { panorama: [p("ormanlik", "yaz", "gece", "o/gece.jpg"), p("ormanlik", "yaz", "alacakaranlik", "o/alaca.jpg")] };
    expect(panoramaSec(m, "ormanlik", "yaz", "gunduz")?.dosya).toBe("o/alaca.jpg");
  });
  it("bölgede hiç panorama yoksa null (yalnız o zaman yer tutucu)", () => {
    expect(panoramaSec(MANIFEST, "ormanlik", "yaz", "gunduz")).toBeNull();
    expect(panoramaAdaylari({}, "daglik", "yaz", "gunduz")).toEqual([]);
  });
});

describe("gerçek manifest", () => {
  const m = gercekManifest as unknown as Manifest;
  const bolgeler: Bolge[] = ["kirsal_acik_arazi", "daglik", "meskun_mahal", "ormanlik", "us_bolgesi"];
  const mevsimler: Mevsim[] = ["yaz", "kis"];
  const zamanlar: ZamanDilimi[] = ["gunduz", "gece"];
  it("her bölge × mevsim × zaman birleşiminde bir panorama var (eksikler en yakın yedeğe düşer)", () => {
    for (const b of bolgeler) for (const mv of mevsimler) for (const z of zamanlar) expect(panoramaSec(m, b, mv, z), `${b} ${mv} ${z}`).not.toBeNull();
  });
  it("Kasım 2026'daki 7 eksik birleşimin yedekleri: gece için gece/alacakaranlık dosyası", () => {
    const yedek = (b: Bolge, mv: Mevsim, z: ZamanDilimi) => panoramaAdaylari(m, b, mv, z)[0];
    for (const [b, mv, z] of [
      ["kirsal_acik_arazi", "kis", "gece"],
      ["daglik", "kis", "gece"],
      ["ormanlik", "kis", "gece"],
      ["us_bolgesi", "yaz", "gece"],
      ["us_bolgesi", "kis", "gece"],
    ] as Array<[Bolge, Mevsim, ZamanDilimi]>) {
      const a = yedek(b, mv, z);
      expect(a.kayit.zaman === "gece" || a.kayit.zaman === "alacakaranlik", `${b} ${mv} ${z} → ${a.kayit.dosya}`).toBe(true);
    }
    expect(yedek("meskun_mahal", "kis", "gunduz").kayit.zaman).toBe("gunduz");
  });
});
