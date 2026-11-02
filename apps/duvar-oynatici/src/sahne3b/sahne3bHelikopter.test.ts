/**
 * Sahne3B helikopter iniş noktası seçimi: panelin yönüne (helikopterYonu) en yakın plan iniş noktası, sahne koordinatında.
 * Nokta yalnız plan (panorama), yawKaydirma ya da panelin yönü değişince değişir: her durum mesajında yeniden uygulanan
 * aynı panorama noktayı sabit bir varsayılana (12°) sıfırlamaz (eskiden helikopter havadayken başka eksene sıçrayıp
 * yanlış yere iniyordu). WebGL yok: sınıf kurucusuz kurulur, yalnız seçim zincirinin kullandığı alanlar verilir
 * (panoramaAyarla'nın aynı panorama dalı; helikopter sahte, iniş noktası çağrılarını kaydeder). Yeni resim panorama
 * yüklenirken `panoramaYukleniyor` açık (main.ts helikopteri bu sürede 3B'de tutar; doku yüklemesi sahte).
 */
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HelikopterDurumu } from "../tipler";
import { Sahne3B, type PanoramaKaynagi } from "./sahne3b";
import type { YerlesimPlani } from "./yerlesim";

interface SahteHeli {
  noktalar: Array<[number, number]>;
  inisNoktasi(azimut: number, mesafe: number): void;
  durumAyarla(d: HelikopterDurumu): void;
}

function kur(kaynak: PanoramaKaynagi) {
  const heli: SahteHeli = {
    noktalar: [],
    inisNoktasi(azimut, mesafe) {
      this.noktalar.push([azimut, mesafe]);
    },
    durumAyarla: () => undefined,
  };
  const s = Object.create(Sahne3B.prototype) as Sahne3B;
  // yawKaydirma değişince arka plan döner, kameralar yönlenir (kamera yok)
  Object.assign(s, { renderer: {}, sahne: new THREE.Scene(), kameralar: [], yerlesimler: [], heli, heliYonu: 12, kaynak, yuklenen: kaynak.url });
  return { s, heli, son: () => heli.noktalar[heli.noktalar.length - 1] };
}

const HELI = ["helikopter"] as const;
const PLAN: YerlesimPlani = {
  noktalar: [
    { azimut: -80, mesafe: 42, tur: [...HELI] },
    { azimut: 40, mesafe: 42, tur: [...HELI] },
    { azimut: 10, mesafe: 20, tur: ["patlama"] },
  ],
};
const panorama = (url: string, plan?: YerlesimPlani, yawKaydirma = 0): PanoramaKaynagi => ({ url, yawKaydirma, yukseklikKaydirma: 0, plan });

describe("Sahne3B helikopter iniş noktası (panelin yönü, plan, yawKaydirma)", () => {
  it("panelin yönüne en yakın plan iniş noktası; aynı panorama yeniden uygulanınca (her durum mesajı) 12°'ye dönmez", () => {
    const { s, son } = kur(panorama("a.jpg", PLAN));
    s.helikopterAyarla("yaklasiyor", -60);
    expect(son()).toEqual([-80, 42]);
    // durumUygula: helikopterAyarla → panoramayiGuncelle (aynı panorama)
    for (let i = 0; i < 3; i++) {
      s.helikopterAyarla("yaklasiyor", -60);
      s.panoramaAyarla(panorama("a.jpg", PLAN));
      expect(son()).toEqual([-80, 42]);
    }
    // Yön verilmeyen çağrı son yönü korur
    s.helikopterAyarla("iniyor");
    expect(son()).toEqual([-80, 42]);
  });

  it("panorama değişince yeni plandaki, panelin yönüne en yakın nokta (sahne = panorama − yawKaydirma)", () => {
    const { s, son } = kur(panorama("a.jpg", PLAN));
    s.helikopterAyarla("iniyor", -60);
    const yeniPlan: YerlesimPlani = {
      noktalar: [
        { azimut: -100, mesafe: 45, tur: [...HELI] },
        { azimut: 30, mesafe: 40, tur: [...HELI] },
      ],
    };
    // Aynı url, farklı plan ve yaw (yükleme dalına girmeden): panelin −60°'si panoramada −50° → −100° noktası
    s.panoramaAyarla(panorama("a.jpg", yeniPlan, 10));
    expect(son()).toEqual([-110, 45]);
  });

  it("plan yoksa panelin yönü + 38 m; 2B siluet yolunda ('yok' ile gelen) yön de saklanır", () => {
    const { s, son } = kur(panorama("a.jpg"));
    s.helikopterAyarla("yok", 90);
    expect(son()).toEqual([90, 38]);
    s.panoramaAyarla(panorama("a.jpg"));
    expect(son()).toEqual([90, 38]);
    s.panoramaAyarla(panorama("a.jpg", PLAN));
    expect(son()).toEqual([40, 42]);
  });
});

describe("Sahne3B yeni resim panorama yüklenirken (uçuş sırasında saat/mevsim değişti)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("panoramaYukleniyor yükleme başlarken açılır, doku gelince ya da güncel yükleme düşünce kapanır; iniş noktası yeni plandan hemen", () => {
    // Doku yüklemesi sahte: geri çağrılar elle tetiklenir (main.ts bu sürede 3B helikopteri 2B siluete geçirmez)
    type Doku = THREE.Texture<HTMLImageElement>;
    const yuklemeler: Array<{ yuklendi: (d: Doku) => void; dustu: () => void }> = [];
    vi.spyOn(THREE.TextureLoader.prototype, "load").mockImplementation((_url: string, yuklendi?: (d: Doku) => void, _ilerleme?: unknown, dustu?: (e: unknown) => void) => {
      yuklemeler.push({ yuklendi: (d) => yuklendi?.(d), dustu: () => dustu?.(new Error("yüklenemedi")) });
      return new THREE.Texture<HTMLImageElement>();
    });
    const { s, son } = kur(panorama("a.jpg", PLAN));
    Object.assign(s, { pmrem: { fromEquirectangular: () => ({ texture: new THREE.Texture() }) }, yonelimUygula: () => undefined, isikGuncelle: () => undefined });
    s.helikopterAyarla("yaklasiyor", -60);
    expect(son()).toEqual([-80, 42]);
    expect(s.panoramaYukleniyor).toBeFalsy();
    // Saat değişti: yeni dosya, yeni plan
    s.panoramaAyarla({ ...panorama("b.jpg", { noktalar: [{ azimut: 40, mesafe: 42, tur: [...HELI] }] }), gunes: { azimut: 0, yukseklik: 30 } });
    expect(s.hazir).toBe(false);
    expect(s.panoramaYukleniyor).toBe(true);
    expect(son()).toEqual([40, 42]); // yükleme beklenmez: uçuş yeni noktaya göre sürer (pas geçer ya da rotasını kurar)
    yuklemeler[0].yuklendi(new THREE.Texture<HTMLImageElement>());
    expect(s.hazir).toBe(true);
    expect(s.panoramaYukleniyor).toBe(false);
    // Yükleme düşerse biter (helikopter 2B siluete döner)
    s.panoramaAyarla(panorama("c.jpg", PLAN));
    expect(s.panoramaYukleniyor).toBe(true);
    yuklemeler[1].dustu();
    expect(s.panoramaYukleniyor).toBe(false);
    // Eski yüklemenin geç gelen sonucu güncel yüklemeyi bitirmez
    s.panoramaAyarla(panorama("d.jpg", PLAN));
    s.panoramaAyarla(panorama("e.jpg", PLAN));
    yuklemeler[2].dustu();
    expect(s.panoramaYukleniyor).toBe(true);
    // Panorama kapanınca (video panorama, 3B katman kapalı) biter
    s.panoramaAyarla(null);
    expect(s.panoramaYukleniyor).toBe(false);
  });
});
