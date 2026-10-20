import { describe, expect, it } from "vitest";
import { artDmxPaketiOlustur, gunIsigiHesapla, isiktanDmxKanallari } from "./artnet.js";

describe("Art-Net paketi", () => {
  it("ArtDmx başlığını doğru oluşturur", () => {
    const kanallar = new Uint8Array(512);
    kanallar[0] = 255;
    kanallar[3] = 17;
    const paket = artDmxPaketiOlustur(3, kanallar, 7);
    expect(paket.subarray(0, 8).toString("ascii")).toBe("Art-Net\0");
    expect(paket.readUInt16LE(8)).toBe(0x5000);
    expect(paket.readUInt16BE(10)).toBe(14);
    expect(paket.readUInt8(12)).toBe(7);
    expect(paket.readUInt8(14)).toBe(3);
    expect(paket.readUInt16BE(16)).toBe(512);
    expect(paket.length).toBe(18 + 512);
    expect(paket[18]).toBe(255);
    expect(paket[21]).toBe(17);
  });

  it("512'den fazla kanalı reddeder", () => {
    expect(() => artDmxPaketiOlustur(0, new Uint8Array(513))).toThrow();
  });
});

describe("ışık → DMX", () => {
  it("parlaklık ve RGB'yi ilk kanallara yazar", () => {
    const k = isiktanDmxKanallari({ parlaklik: 0.5, r: 10, g: 20, b: 30, senaryoyaBagli: true });
    expect(k[0]).toBe(128);
    expect(k[1]).toBe(10);
    expect(k[2]).toBe(20);
    expect(k[3]).toBe(30);
    expect(k[4]).toBe(0);
  });

  it("gün ışığı gece karanlık, öğlen parlak olur", () => {
    expect(gunIsigiHesapla(2, 0).parlaklik).toBeLessThan(0.1);
    expect(gunIsigiHesapla(12, 0).parlaklik).toBeGreaterThan(0.8);
    expect(gunIsigiHesapla(12, 1).parlaklik).toBeLessThan(gunIsigiHesapla(12, 0).parlaklik);
  });
});
