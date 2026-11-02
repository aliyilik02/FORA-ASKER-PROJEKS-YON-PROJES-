import { afterEach, describe, expect, it, vi } from "vitest";
import { ArtNetGonderici, artDmxPaketiOlustur, gunIsigiHesapla, isiktanDmxKanallari } from "./artnet.js";
import type { OrtamIsigi } from "./tipler.js";

afterEach(() => {
  vi.useRealTimers();
});

const TEMEL: OrtamIsigi = { parlaklik: 0.5, r: 255, g: 244, b: 224, senaryoyaBagli: true };
const ilkBes = (a: ArtNetGonderici) => Array.from(a.sonDurum().slice(0, 5));

describe("Art-Net patlama flaşı", () => {
  it("100 ms arayla iki flaş: ışık flaş bitince temel değere döner (beyazda takılı kalmaz), tek zamanlayıcı süreyi uzatır", async () => {
    vi.useFakeTimers();
    const a = new ArtNetGonderici({ hedef: "127.0.0.1", port: 6454, evren: 0, aktif: false });
    a.isigiUygula(TEMEL);
    const temel = ilkBes(a);
    expect(temel).toEqual([128, 255, 244, 224, 0]);
    a.patlamaFlasi(1);
    expect(a.sonDurum()[0]).toBe(255);
    await vi.advanceTimersByTimeAsync(100);
    a.patlamaFlasi(1);
    // İlk flaşın süresi (250 ms) dolsa da ikinci flaş sürüyor
    await vi.advanceTimersByTimeAsync(200);
    expect(a.sonDurum()[0]).toBe(255);
    await vi.advanceTimersByTimeAsync(100);
    expect(ilkBes(a)).toEqual(temel);
    // Eski hata: ikinci flaş birincinin beyazını "önceki" sanıyordu; artık hiçbir bekleyen geri yazım yok
    await vi.advanceTimersByTimeAsync(1000);
    expect(ilkBes(a)).toEqual(temel);
  });

  it("flasiIptal süren flaşı keser ve temel ışığı geri yazar; flaş yokken bir şey yapmaz", async () => {
    vi.useFakeTimers();
    const a = new ArtNetGonderici({ hedef: "127.0.0.1", port: 6454, evren: 0, aktif: false });
    a.isigiUygula(TEMEL);
    const temel = ilkBes(a);
    a.flasiIptal();
    expect(ilkBes(a)).toEqual(temel);
    a.patlamaFlasi(0.6);
    a.flasiIptal();
    expect(ilkBes(a)).toEqual(temel);
    await vi.advanceTimersByTimeAsync(500);
    expect(ilkBes(a)).toEqual(temel);
  });

  it("flaş sürerken gelen ışık ayarı flaşı kesmez, flaş bitince yeni ışığa dönülür", async () => {
    vi.useFakeTimers();
    const a = new ArtNetGonderici({ hedef: "127.0.0.1", port: 6454, evren: 0, aktif: false });
    a.isigiUygula(TEMEL);
    a.patlamaFlasi(1);
    a.isigiUygula({ ...TEMEL, parlaklik: 0.2, b: 100 });
    expect(a.sonDurum()[0]).toBe(255);
    await vi.advanceTimersByTimeAsync(300);
    expect(ilkBes(a)).toEqual([51, 255, 244, 100, 0]);
  });
});

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
