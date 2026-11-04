/**
 * Sahne3B helikopter iniş noktası seçimi: panelin yönüne (helikopterYonu) en yakın plan iniş noktası, sahne koordinatında.
 * Nokta yalnız plan (panorama), yawKaydirma ya da panelin yönü değişince değişir: her durum mesajında yeniden uygulanan
 * aynı panorama noktayı sabit bir varsayılana (12°) sıfırlamaz (eskiden helikopter havadayken başka eksene sıçrayıp
 * yanlış yere iniyordu). Yeni panorama (ya da aynı dosyanın yeni planı) takasta ekrana gelir; iniş noktası da takasta
 * yeni plandan seçilir (eski görüntü dururken eski plan geçerli). Hazırlık sürerken `panoramaYukleniyor` açık, `hazir`
 * açık kalır (main.ts helikopteri 3B'de tutar). WebGL yok: sınıf kurucusuz kurulur, yalnız kullanılan alanlar verilir;
 * çözme işi sahte (sözleri elle sonuçlanır), GPU adımları atlanır (hazırlık elle "hazır" yapılır).
 */
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { HelikopterDurumu } from "../tipler";
import type { CozmeIsi } from "./panoramaIsi";
import type { CozulmusPanorama } from "./panoramaCozucu";
import { GokOrtusu } from "./gokOrtusu";
import { Sahne3B, type PanoramaKaynagi } from "./sahne3b";
import type { YerlesimPlani } from "./yerlesim";

interface SahteHeli {
  noktalar: Array<[number, number]>;
  inisNoktasi(azimut: number, mesafe: number): void;
  durumAyarla(d: HelikopterDurumu): void;
}

/** İç durum makinesine erişim (testte "hazır" adımına geçirmek için). */
interface IcErisim {
  gecis: { hazirlik: { adim: string } | null; etkin: { kaynak: PanoramaKaynagi } | null };
}

function kur(kaynak: PanoramaKaynagi) {
  const heli: SahteHeli = {
    noktalar: [],
    inisNoktasi(azimut, mesafe) {
      this.noktalar.push([azimut, mesafe]);
    },
    durumAyarla: () => undefined,
  };
  const isler: Array<{ url: string; coz: (s: CozulmusPanorama) => void; dus: (h: Error) => void; iptal: boolean }> = [];
  const cozucu = (url: string): CozmeIsi => {
    const kayit = { url, coz: (_s: CozulmusPanorama) => undefined as void, dus: (_h: Error) => undefined as void, iptal: false };
    const sonuc = new Promise<CozulmusPanorama>((coz, dus) => {
      kayit.coz = coz;
      kayit.dus = dus;
    });
    isler.push(kayit);
    return { sonuc, iptal: () => void (kayit.iptal = true) };
  };
  const s = Object.create(Sahne3B.prototype) as Sahne3B;
  const arazi = { mod: "kapali", aktif: false, koridorlariAyarla: () => false };
  Object.assign(s, {
    renderer: {},
    gokOrtusu: new GokOrtusu(),
    sahne: new THREE.Scene(),
    kameralar: [],
    yerlesimler: [],
    heli,
    heliYonu: 12,
    arazi,
    cozucu,
    yonelimUygula: () => undefined,
    isikGuncelle: () => undefined,
  });
  // Ekrandaki panorama: ilk istek hazırlanır ve takas edilir
  s.panoramaAyarla(kaynak);
  const ic = s as unknown as IcErisim;
  hazirYap(ic);
  s.takasYap(0);
  return { s, heli, isler, ic, son: () => heli.noktalar[heli.noktalar.length - 1] };
}
function hazirYap(ic: IcErisim) {
  if (ic.gecis.hazirlik) ic.gecis.hazirlik.adim = "hazir";
}
/** Çözülmüş sahte sonuç (bitmapler kapatılabilir nesneler). */
function sahteSonuc(): CozulmusPanorama {
  const bitmap = { width: 64, height: 32, close: () => undefined } as unknown as ImageBitmap;
  return { tam: bitmap, kucuk: bitmap, analiz: null, gok: null, kaynakGenisligi: 64, kaynakYuksekligi: 32, sureler: { indirme: 0, cozme: 0, kucultme: 0, analiz: 0, gok: 0 } };
}
const bekle = () => new Promise((r) => setTimeout(r, 0));

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
    // durumUygula: panoramayiGuncelle (aynı panorama) → helikopterAyarla
    for (let i = 0; i < 3; i++) {
      s.panoramaAyarla(panorama("a.jpg", PLAN));
      expect(s.takasHazir).toBe(false);
      s.helikopterAyarla("yaklasiyor", -60);
      expect(son()).toEqual([-80, 42]);
    }
    // Yön verilmeyen çağrı son yönü korur
    s.helikopterAyarla("iniyor");
    expect(son()).toEqual([-80, 42]);
  });

  it("aynı dosyanın yeni planı ve yaw'ı takasta: önce eski plan, takastan sonra yeni plandaki nokta (sahne = panorama − yawKaydirma)", () => {
    const { s, son } = kur(panorama("a.jpg", PLAN));
    s.helikopterAyarla("iniyor", -60);
    const yeniPlan: YerlesimPlani = {
      noktalar: [
        { azimut: -100, mesafe: 45, tur: [...HELI] },
        { azimut: 30, mesafe: 40, tur: [...HELI] },
      ],
    };
    // Aynı url, farklı plan ve yaw: yeniden yükleme yok, meta takası
    s.panoramaAyarla(panorama("a.jpg", yeniPlan, 10));
    expect(s.panoramaYukleniyor).toBe(false);
    expect(s.takasHazir).toBe(true);
    expect(son()).toEqual([-80, 42]);
    s.takasYap(1);
    // Panelin −60°'si panoramada −50° → −100° noktası, sahnede −110°
    expect(son()).toEqual([-110, 45]);
  });

  it("plan yoksa panelin yönü + 38 m; 2B siluet yolunda ('yok' ile gelen) yön de saklanır", () => {
    const { s, son } = kur(panorama("a.jpg"));
    s.helikopterAyarla("yok", 90);
    expect(son()).toEqual([90, 38]);
    s.panoramaAyarla(panorama("a.jpg"));
    expect(son()).toEqual([90, 38]);
    s.panoramaAyarla(panorama("a.jpg", PLAN));
    s.takasYap(1);
    expect(son()).toEqual([40, 42]);
  });
});

describe("Sahne3B yeni resim panorama hazırlanırken (uçuş sırasında saat/mevsim değişti)", () => {
  it("panoramaYukleniyor hazırlık boyunca açık, hazir açık kalır; iniş noktası takasta yeni plandan; düşen ve geçersiz kalan işler", async () => {
    const { s, ic, isler, son } = kur(panorama("a.jpg", PLAN));
    s.helikopterAyarla("yaklasiyor", -60);
    expect(son()).toEqual([-80, 42]);
    expect(s.panoramaYukleniyor).toBe(false);
    expect(s.hazir).toBe(true);
    // Saat değişti: yeni dosya, yeni plan
    s.panoramaAyarla({ ...panorama("b.jpg", { noktalar: [{ azimut: 40, mesafe: 42, tur: [...HELI] }] }), gunes: { azimut: 0, yukseklik: 30 } });
    expect(s.panoramaYukleniyor).toBe(true);
    expect(s.hazir).toBe(true); // eski sahne çizilmeye devam eder (yer tutucu yok)
    expect(son()).toEqual([-80, 42]); // ekranda hâlâ eski panorama: eski plan
    isler[1].coz(sahteSonuc());
    await bekle();
    expect(ic.gecis.hazirlik?.adim).toBe("yukle");
    hazirYap(ic);
    expect(s.panoramaYukleniyor).toBe(false);
    expect(s.takasHazir).toBe(true);
    s.takasYap(2);
    expect(son()).toEqual([40, 42]);
    expect(ic.gecis.etkin?.kaynak.url).toBe("b.jpg");
    expect(s.hazir).toBe(true);
    // Yükleme düşerse hazırlık biter, ekrandaki kalır
    s.panoramaAyarla(panorama("c.jpg", PLAN));
    expect(s.panoramaYukleniyor).toBe(true);
    isler[2].dus(new Error("HTTP 404"));
    await bekle();
    expect(s.panoramaYukleniyor).toBe(false);
    expect(ic.gecis.etkin?.kaynak.url).toBe("b.jpg");
    expect(s.hata).toContain("c.jpg");
    // Eski hazırlığın geç gelen sonucu güncel hazırlığı bitirmez; eski iş iptal edilir
    s.panoramaAyarla(panorama("d.jpg", PLAN));
    s.panoramaAyarla(panorama("e.jpg", PLAN));
    expect(isler[3].iptal).toBe(true);
    isler[3].dus(new Error("geç"));
    isler[3].coz(sahteSonuc());
    await bekle();
    expect(s.panoramaYukleniyor).toBe(true);
    expect(ic.gecis.hazirlik?.adim).toBe("coz");
    // Bu bölgede panorama yok: ekrandaki kalır, hazırlık biter
    s.panoramaAyarla(null);
    expect(s.panoramaYukleniyor).toBe(false);
    expect(s.hazir).toBe(true);
  });
});
