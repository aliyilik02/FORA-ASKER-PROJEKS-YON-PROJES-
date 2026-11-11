/**
 * AraziKatmani.dokularHazir: yüklemesi süren doku kalmayınca true (gelen, yedeğiyle birlikte bulunamayan ya da yükleme
 * sürerken bırakılan). Bölge geçişinde örtü solmadan önce bunu bekler (sahne3b.ts araziDokulariHazir, en çok 1,2 sn);
 * önbellekteki ortak dokular (bölgeler arası korunur) yeni yükleme başlatmaz. WebGL ve DOM yok: sınıf kurucusuz,
 * doku yükleyicisi sahte (geri çağrılar elle).
 */
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { AraziKatmani } from "./arazi";

interface IcErisim {
  doku(ad: string, srgb: boolean, yedek?: string): THREE.Texture;
  kullanilmayanDokulariBirak(): void;
  kullanilanDokular: Set<string>;
}

function kur() {
  const yuklemeler: Array<{ url: string; geldi: () => void; dustu: () => void }> = [];
  const uyarilar: string[] = [];
  const a = Object.create(AraziKatmani.prototype) as AraziKatmani;
  Object.assign(a, {
    dokular: new Map<string, THREE.Texture>(),
    kullanilanDokular: new Set<string>(),
    yuklenenDokular: new Set<THREE.Texture>(),
    kok: "icerik/",
    kalite: { anizotropi: 1, dokuBoyutu: 0 },
    uyari: (m: string) => void uyarilar.push(m),
    dokuYukleyici: {
      load: (url: string, geldi: (t: THREE.Texture) => void, _ilerleme: unknown, dustu: () => void) => {
        const resim = { width: 4, height: 4 } as unknown as HTMLImageElement;
        yuklemeler.push({ url, geldi: () => geldi(new THREE.Texture(resim)), dustu });
      },
    },
  });
  return { a, ic: a as unknown as IcErisim, yuklemeler, uyarilar };
}

describe("AraziKatmani.dokularHazir", () => {
  it("yükleme sürerken false, resim gelince true; önbellekteki doku yeniden yüklenmez", () => {
    const { a, ic, yuklemeler } = kur();
    expect(a.dokularHazir).toBe(true);
    const d = ic.doku("bozkir_renk", true);
    expect(yuklemeler.map((y) => y.url)).toEqual(["icerik/arazi/dokular/bozkir_renk.jpg"]);
    expect(a.dokularHazir).toBe(false);
    yuklemeler[0].geldi();
    expect(a.dokularHazir).toBe(true);
    expect(d.image).toBeTruthy();
    expect(ic.doku("bozkir_renk", true)).toBe(d);
    expect(yuklemeler).toHaveLength(1);
    expect(a.dokularHazir).toBe(true);
  });

  it("dosya yoksa yedek denenir; o da yoksa bitmiş sayılır (örtü boşuna beklemez), tek uyarı", () => {
    const { a, ic, yuklemeler, uyarilar } = kur();
    ic.doku("orman_normal", false, "bozkir_normal");
    yuklemeler[0].dustu();
    expect(yuklemeler[1].url).toBe("icerik/arazi/dokular/bozkir_normal.jpg");
    expect(a.dokularHazir).toBe(false);
    yuklemeler[1].dustu();
    expect(a.dokularHazir).toBe(true);
    expect(uyarilar).toEqual(["Arazi dokusu bulunamadı: arazi/dokular/bozkir_normal.jpg"]);
  });

  it("yükleme sürerken bırakılan doku (yeni bölgede kullanılmıyor) beklenmez; geç gelen resim atılır, yedek denenmez", () => {
    const { a, ic, yuklemeler, uyarilar } = kur();
    const d = ic.doku("kar_renk", true);
    const e = ic.doku("tas_renk", true, "kaya_renk");
    ic.kullanilanDokular.clear();
    ic.kullanilmayanDokulariBirak();
    expect(a.dokularHazir).toBe(true);
    yuklemeler[0].geldi();
    yuklemeler[1].dustu();
    expect(d.image).toBeNull();
    expect(e.image).toBeNull();
    expect(yuklemeler).toHaveLength(2);
    expect(uyarilar).toEqual([]);
    expect(a.dokularHazir).toBe(true);
  });
});
