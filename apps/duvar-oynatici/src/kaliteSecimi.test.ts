import { describe, expect, it } from "vitest";
import { ekranKartiKalitesi, kaliteSec, kartKisaAdi } from "./kaliteSecimi";

const IRIS = "ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x000046A8) Direct3D11 vs_5_0 ps_5_0, D3D11)";
const GTX = "ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 (0x00001F99) Direct3D11 vs_5_0 ps_5_0, D3D11)";
const RTX = "ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11-31.0.15.5222)";
const UHD = "ANGLE (Intel, Intel(R) UHD Graphics 620 (0x00005917) Direct3D11 vs_5_0 ps_5_0, D3D11)";

/** Bellek içi yerel kayıt. */
function kayit(baslangic: Record<string, string> = {}) {
  const d = new Map(Object.entries(baslangic));
  return { getItem: (k: string) => d.get(k) ?? null, setItem: (k: string, v: string) => void d.set(k, v), removeItem: (k: string) => void d.delete(k), d };
}

describe("ekranKartiKalitesi", () => {
  it("Intel entegre → orta; NVIDIA/AMD → yuksek; yazılım çizici → dusuk", () => {
    expect(ekranKartiKalitesi(IRIS)).toBe("orta");
    expect(ekranKartiKalitesi(UHD)).toBe("orta");
    expect(ekranKartiKalitesi("Intel(R) HD Graphics 530")).toBe("orta");
    expect(ekranKartiKalitesi(GTX)).toBe("yuksek");
    expect(ekranKartiKalitesi(RTX)).toBe("yuksek");
    expect(ekranKartiKalitesi("ANGLE (AMD, AMD Radeon RX 6600 Direct3D11 vs_5_0 ps_5_0, D3D11)")).toBe("yuksek");
    expect(ekranKartiKalitesi("ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)")).toBe("dusuk");
    expect(ekranKartiKalitesi("ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)")).toBe("dusuk");
  });
});

describe("kartKisaAdi", () => {
  it("ANGLE dizesinden aygıt adı; tanınmayan dize kısaltılır", () => {
    expect(kartKisaAdi(IRIS)).toBe("Intel(R) Iris(R) Xe Graphics");
    expect(kartKisaAdi(GTX)).toBe("NVIDIA GeForce GTX 1650");
    expect(kartKisaAdi(RTX)).toBe("NVIDIA GeForce RTX 4070");
    expect(kartKisaAdi("Mali-G78")).toBe("Mali-G78");
    expect(kartKisaAdi("x".repeat(80))).toHaveLength(48);
  });
});

describe("kaliteSec (adres > yerel kayıt > otomatik)", () => {
  it("geçerli ?kalite= kazanır ve kaydedilir; kart sorulmaz", () => {
    const k = kayit({ kalite: "dusuk" });
    let soruldu = 0;
    expect(kaliteSec("yuksek", k, () => (soruldu++, IRIS))).toEqual({ kalite: "yuksek", otomatikKart: null });
    expect(k.d.get("kalite")).toBe("yuksek");
    expect(soruldu).toBe(0);
  });

  it("adres yoksa (ya da geçersizse) yerel kayıt; o da yoksa otomatik (kaydedilmez)", () => {
    expect(kaliteSec(null, kayit({ kalite: "dusuk" }), () => GTX)).toEqual({ kalite: "dusuk", otomatikKart: null });
    expect(kaliteSec("cok_yuksek", kayit({ kalite: "orta" }), () => GTX)).toEqual({ kalite: "orta", otomatikKart: null });
    const bos = kayit();
    expect(kaliteSec(null, bos, () => IRIS)).toEqual({ kalite: "orta", otomatikKart: "Intel(R) Iris(R) Xe Graphics" });
    expect(bos.d.has("kalite")).toBe(false);
    expect(kaliteSec(null, kayit(), () => RTX)).toEqual({ kalite: "yuksek", otomatikKart: "NVIDIA GeForce RTX 4070" });
  });

  it("kart okunamazsa yuksek (eski varsayılan); yerel kayıt erişimi hata verirse otomatiğe düşer", () => {
    expect(kaliteSec(null, kayit(), () => null)).toEqual({ kalite: "yuksek", otomatikKart: null });
    const kapali = {
      getItem: () => {
        throw new Error("kapalı");
      },
      setItem: () => {
        throw new Error("kapalı");
      },
    };
    expect(kaliteSec(null, kapali, () => IRIS).kalite).toBe("orta");
    expect(kaliteSec("dusuk", kapali, () => IRIS).kalite).toBe("dusuk");
  });

  it("?kalite=otomatik (panelin varsayılanı) yerel kaydı siler, kartı sorar; sonraki parametresiz açılış da otomatik", () => {
    const k = kayit({ kalite: "yuksek" });
    expect(kaliteSec("otomatik", k, () => IRIS)).toEqual({ kalite: "orta", otomatikKart: "Intel(R) Iris(R) Xe Graphics" });
    expect(k.d.has("kalite")).toBe(false);
    expect(kaliteSec(null, k, () => IRIS).kalite).toBe("orta");
    // removeItem'sız (eski arayüz) kayıtta da otomatiğe gider, kayıtlı değer kullanılmaz
    const eski = { getItem: () => "dusuk", setItem: () => undefined };
    expect(kaliteSec("otomatik", eski, () => RTX)).toEqual({ kalite: "yuksek", otomatikKart: "NVIDIA GeForce RTX 4070" });
  });
});
