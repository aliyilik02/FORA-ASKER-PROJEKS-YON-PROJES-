import { describe, expect, it } from "vitest";
import { figurYolu } from "./figurYonlendirme";

const temel = { manifestYuklendi: true, tip: "model", ucAktifOlabilir: true, sahneHazir: true, gecisBekliyor: false };

describe("figurYolu", () => {
  it("manifest gelmeden gelen figür kuyruğa alınır (tanım bilinmese de)", () => {
    expect(figurYolu({ ...temel, manifestYuklendi: false, tip: undefined })).toBe("manifest_bekle");
    expect(figurYolu({ ...temel, manifestYuklendi: false, sahneHazir: false })).toBe("manifest_bekle");
  });
  it("3B model: sahne hazırsa hemen, değilse sahne hazır olunca", () => {
    expect(figurYolu(temel)).toBe("ucb");
    expect(figurYolu({ ...temel, sahneHazir: false })).toBe("ucb_bekle");
    expect(figurYolu({ ...temel, gecisBekliyor: true })).toBe("ucb_bekle");
  });
  it("3B kapalı oynatıcıda model oynatılamaz", () => {
    expect(figurYolu({ ...temel, ucAktifOlabilir: false, sahneHazir: false })).toBe("yok");
  });
  it("2B klip manifest geldiyse hemen; tanımsız klip düşer", () => {
    expect(figurYolu({ ...temel, tip: "video" })).toBe("ikib");
    expect(figurYolu({ ...temel, tip: undefined })).toBe("yok");
  });
});
