/**
 * Sahne3B.sahneyiSifirla / temeleDondur: hasar, parçacıklar, çatışma izleri ve patlama ışığı temizlenir; arazi
 * kraterleri `AraziKatmani.kraterleriTemizle` ile yerinde geri alınır ve değiştiyse figür/sütre zemine oturur; arazi
 * yeniden kurulmaz (`araziBolge` korunur, sonraki durum mesajı takaslı geçiş tetiklemez). Panorama geçişi sürerken
 * sıfırlama gelen panoramayı bırakmaz, bölge geçişinin ertelenen işlerini düşürmez; takas sıfırlamayı geri almaz.
 * WebGL yok: sınıf kurucusuz, alanlar sahte; çözme işi sahte, GPU adımları atlanır (hazırlık elle "hazır" yapılır).
 */
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { CozmeIsi } from "./panoramaIsi";
import type { CozulmusPanorama } from "./panoramaCozucu";
import { GokOrtusu } from "./gokOrtusu";
import { Sahne3B, type PanoramaKaynagi } from "./sahne3b";

function kur(arazi: Record<string, unknown>) {
  const cagrilar: string[] = [];
  const kayit = (ad: string) => () => {
    cagrilar.push(ad);
  };
  const s = Object.create(Sahne3B.prototype) as Sahne3B;
  const flas = new THREE.PointLight(0xffffff, 1234);
  Object.assign(s, {
    hasar: { temizle: kayit("hasar") },
    parcaciklar: { temizle: kayit("parcaciklar") },
    catisma: { temizle: kayit("catisma") },
    figurler: { temizle: kayit("figurler"), zemineOturt: kayit("figurler.zemin") },
    sutre: { zemineOturt: kayit("sutre.zemin") },
    flas,
    flasGuc: 0.8,
    araziBolge: "hibrit|kirsal_acik_arazi",
    arazi,
  });
  const ic = s as unknown as { flasGuc: number; araziBolge: string };
  return { s, cagrilar, flas, ic };
}

/** Sahte arazi: kraterleriTemizle çağrısını (ve `this`) kaydeder, `sonuc` döner. */
function sahteArazi(sonuc: boolean) {
  const a = {
    aktif: true,
    mod: "hibrit",
    sonuc,
    cagiran: null as unknown,
    temizlik: 0,
    koridorlariAyarla: () => false,
    kraterleriTemizle(this: { sonuc: boolean; cagiran: unknown; temizlik: number }) {
      this.cagiran = this;
      this.temizlik++;
      return this.sonuc;
    },
  };
  return a;
}

describe("Sahne3B sahne sıfırlaması", () => {
  it("arazi kraterleri yerinde geri alınır (this bağlı); değiştiyse figür ve sütre yeni zemine oturur; flaş söner", () => {
    const arazi = sahteArazi(true);
    const { s, cagrilar, flas, ic } = kur(arazi);
    s.sahneyiSifirla();
    expect(arazi.cagiran).toBe(arazi);
    expect(cagrilar).toEqual(["hasar", "parcaciklar", "catisma", "figurler.zemin", "sutre.zemin"]);
    expect(ic.flasGuc).toBe(0);
    expect(flas.intensity).toBe(0);
    // Arazi yeniden kurulmaz: anahtar korunur (eski ara katman "" yazıp bir sonraki durumda tam kurulum tetikliyordu)
    expect(ic.araziBolge).toBe("hibrit|kirsal_acik_arazi");
    arazi.sonuc = false;
    cagrilar.length = 0;
    s.sahneyiSifirla();
    expect(cagrilar).toEqual(["hasar", "parcaciklar", "catisma"]);
    expect(arazi.temizlik).toBe(2);
  });

  it("temeleDondur: önce figürler (yüklenenler dahil), sonra sahneyiSifirla", () => {
    const { s, cagrilar } = kur(sahteArazi(false));
    s.temeleDondur();
    expect(cagrilar).toEqual(["figurler", "hasar", "parcaciklar", "catisma"]);
  });
});

/** İç durum makinesine erişim (testte "hazır" adımına geçirmek ve kaynakların bırakılışını görmek için). */
interface IcErisim {
  gecis: {
    hazirlik: { adim: string; kaynak: PanoramaKaynagi; veri: { birakildi: boolean } } | null;
    etkin: { kaynak: PanoramaKaynagi; veri: { birakildi: boolean } } | null;
  };
}

/** Ekranda a.jpg olan, geçiş durum makinesi gerçek, geri kalanı sahte Sahne3B. */
function gecisliKur() {
  const { s, cagrilar } = kur(sahteArazi(true));
  const isler: Array<{ url: string; iptal: boolean }> = [];
  const cozucu = (url: string): CozmeIsi => {
    const is = { url, iptal: false };
    isler.push(is);
    return { sonuc: new Promise<CozulmusPanorama>(() => undefined), iptal: () => void (is.iptal = true) };
  };
  Object.assign(s, {
    renderer: {},
    gokOrtusu: new GokOrtusu(),
    sahne: new THREE.Scene(),
    kameralar: [],
    yerlesimler: [],
    heli: { inisNoktasi: () => undefined, durumAyarla: () => undefined },
    heliYonu: 12,
    cozucu,
    yonelimUygula: () => undefined,
    isikGuncelle: () => undefined,
  });
  const ic = s as unknown as IcErisim;
  s.panoramaAyarla(panorama("a.jpg"));
  hazirYap(ic);
  s.takasYap(0);
  cagrilar.length = 0;
  return { s, ic, isler, cagrilar };
}
function hazirYap(ic: IcErisim) {
  if (ic.gecis.hazirlik) ic.gecis.hazirlik.adim = "hazir";
}
const panorama = (url: string): PanoramaKaynagi => ({ url, yawKaydirma: 0, yukseklikKaydirma: 0 });
const say = (liste: string[], ad: string) => liste.filter((c) => c === ad).length;

describe("Sahne3B sıfırlaması panorama geçişi sürerken", () => {
  it("hazırlık sürerken (saat değişti): ekrandaki sahne hemen temizlenir, gelen panorama bırakılmaz, takas aynen yapılır", () => {
    const { s, ic, isler, cagrilar } = gecisliKur();
    s.panoramaAyarla(panorama("b.jpg"));
    const gelen = ic.gecis.hazirlik!;
    s.temeleDondur();
    expect(cagrilar).toEqual(["figurler", "hasar", "parcaciklar", "catisma", "figurler.zemin", "sutre.zemin"]);
    expect(ic.gecis.hazirlik).toBe(gelen);
    expect(gelen.veri.birakildi).toBe(false);
    expect(isler[1]).toEqual({ url: "b.jpg", iptal: false });
    expect(s.panoramaYukleniyor).toBe(true);
    expect(s.hazir).toBe(true);
    hazirYap(ic);
    expect(s.takasHazir).toBe(true);
    const eski = ic.gecis.etkin!.veri;
    cagrilar.length = 0;
    s.takasYap(1);
    expect(ic.gecis.etkin?.kaynak.url).toBe("b.jpg");
    expect(ic.gecis.etkin?.veri.birakildi).toBe(false);
    expect(eski.birakildi).toBe(true);
    // Aynı bölge: takasta ikinci temizlik yok
    expect(cagrilar).toEqual([]);
  });

  it("bölge geçişi sürerken: ertelenen bölge sıfırlaması ve kuyruk beklemesi kalır, takas yeni bölgede yine temizler (sıfırlama geri alınmaz)", () => {
    const { s, ic, isler, cagrilar } = gecisliKur();
    // durumUygula sırası: panorama isteği, sonra bolgeDegisti
    s.panoramaAyarla(panorama("b.jpg"));
    s.bolgeDegisti();
    expect(s.bolgeGecisiBekliyor).toBe(true);
    expect(cagrilar).toEqual([]); // eski bölgenin kraterleri takasa dek ekranda
    s.temeleDondur();
    expect(say(cagrilar, "figurler")).toBe(1);
    expect(say(cagrilar, "hasar")).toBe(1);
    // Sıfırlama bölge geçişini bitirmez: yeni figür/efektler main.ts'te takası bekler, gelen panorama sürer
    expect(s.bolgeGecisiBekliyor).toBe(true);
    expect(ic.gecis.hazirlik?.kaynak.url).toBe("b.jpg");
    expect(isler[1].iptal).toBe(false);
    hazirYap(ic);
    s.takasYap(1);
    expect(ic.gecis.etkin?.kaynak.url).toBe("b.jpg");
    expect(s.bolgeGecisiBekliyor).toBe(false);
    // Takas yeni bölge için bir kez daha temizler, figürlere dokunmaz (sıfırlamadan sonra gelenler kuyruktan uygulanır)
    expect(say(cagrilar, "hasar")).toBe(2);
    expect(say(cagrilar, "figurler")).toBe(1);
  });
});
