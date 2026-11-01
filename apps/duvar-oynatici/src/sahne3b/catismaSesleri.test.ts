/**
 * Çatışma sesleri sözleşmesi: CatismaSistemi ses geri çağrılarını sahne azimutuyla (derece) çağırır, stereo pan
 * (−1..1) ile değil; stereo / çok kanal yerleşimini ses motoru azimuttan yapar. Pan geçilirse bütün çatışma sesleri
 * ortaya (0°) toplanır. Derleme tarafında `AzimutDerece` markası düz sayıyı (ör. Math.sin(...)) reddeder; bu test
 * çalışma anında atış, çarpma, top ve uzak patlama seslerinin yönünü sahnedeki gerçek açılarla denetler (tohumlu
 * rastgelelik: her çalıştırmada aynı atışlar).
 */
import type { Vector3 } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CatismaSistemi, type CatismaSesleri, type IzliAyari } from "./catisma";
import type { ParcacikSistemi } from "./parcaciklar";
import { azimutYon, yerKonumu } from "./uzay";

/** Tekrarlanabilir rastgelelik (mulberry32). */
function tohumluRastgele(tohum: number): () => number {
  let a = tohum >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Çizim yok: parçacık sistemi yerine boş yöntemler (yalnız ses sözleşmesi denetlenir). */
const PARCACIKLAR = { parlama: () => undefined, duman: { ekle: () => undefined }, kivilcim: { ekle: () => undefined } } as unknown as ParcacikSistemi;

/** Sistemi kurar; geri çağrılardan gelen azimutları türüne göre toplar. */
function kur() {
  const ses = { uzakAtis: [] as number[], yakinAtis: [] as number[], carpma: [] as number[], top: [] as number[], uzakPatlama: [] as number[] };
  const sesler: CatismaSesleri = {
    carpma: (az) => ses.carpma.push(az),
    atis: (az, uzak) => (uzak ? ses.uzakAtis : ses.yakinAtis).push(az),
    uzakPatlama: (az) => ses.uzakPatlama.push(az),
    topAtisi: (az) => ses.top.push(az),
  };
  return { ses, sistem: new CatismaSistemi(PARCACIKLAR, sesler) };
}

/** `sure` saniye, 60 kare/sn. */
function calistir(sistem: CatismaSistemi, sure: number) {
  for (let i = 0; i < sure * 60; i++) sistem.guncelle(1 / 60);
}
/** İki azimut arasındaki açı (0..180°). */
const aciFarki = (a: number, b: number) => Math.abs(((((a - b) % 360) + 540) % 360) - 180);
const ortanca = (d: number[]) => [...d].sort((a, b) => a - b)[Math.floor(d.length / 2)];

describe("çatışma sesleri sahne azimutuyla (derece) çağrılır", () => {
  beforeEach(() => {
    vi.spyOn(Math, "random").mockImplementation(tohumluRastgele(7));
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("düşman ateşi (−90°, sol): uzak atış sesi düşman hattından (±10° dağılım), uzak patlama cepheden", () => {
    const { ses, sistem } = kur();
    sistem.catismaAyarla({ aktif: true, siddet: 1, azimut: -90, dostAtes: false });
    calistir(sistem, 30);
    expect(ses.uzakAtis.length).toBeGreaterThan(20);
    for (const az of ses.uzakAtis) expect(aciFarki(az, -90)).toBeLessThanOrEqual(10.5);
    expect(ses.uzakPatlama.length).toBeGreaterThan(0);
    for (const az of ses.uzakPatlama) expect(aciFarki(az, -90)).toBeLessThanOrEqual(40.5);
  });

  it("izli mermi akışı (90°, sağ): atış sesi kaynaktan; çarpma sesi derece (pan aralığı −1..1 değil)", () => {
    const { ses, sistem } = kur();
    // yon 0: izler kaynaktan izleyiciye doğru (iz doğrultusu ayarı olmayan sürümde alan yok sayılır)
    sistem.izliAyarla({ aktif: true, azimut: 90, yon: 0, siklik: 60 } as IzliAyari);
    calistir(sistem, 30);
    expect(ses.uzakAtis.length).toBeGreaterThan(100);
    for (const az of ses.uzakAtis) expect(aciFarki(az, 90)).toBeLessThanOrEqual(10.5);
    // Çarpmalar önde (sağda) ya da üstten geçenlerde arkada (solda): neredeyse hepsi pan aralığının dışında
    expect(ses.carpma.length).toBeGreaterThan(8);
    expect(ses.carpma.filter((az) => Math.abs(az) > 1.5).length).toBeGreaterThanOrEqual(ses.carpma.length * 0.8);
    expect(Math.max(...ses.carpma.map(Math.abs))).toBeGreaterThan(45);
  });

  it("izli mermi (kaynak 60°, izliAtis): atış sesi ~60° gelir, sin(60°) ≈ 0,87 pan değeri değil", () => {
    const { ses, sistem } = kur();
    sistem.izliAyarla({ aktif: true, azimut: 60, yon: 0, siklik: 30 });
    calistir(sistem, 20);
    expect(ses.uzakAtis.length).toBeGreaterThan(50);
    for (const az of ses.uzakAtis) expect(aciFarki(az, 60)).toBeLessThanOrEqual(10.5);
    expect(Math.abs(ortanca(ses.uzakAtis) - 60)).toBeLessThan(4);
    // Çapraz akışta (yön 45°) da: ses kaynağın gerçek konumundan, yine derece (pan aralığı −1..1'in çok dışında)
    const capraz = kur();
    capraz.sistem.izliAyarla({ aktif: true, azimut: 60, yon: 45, siklik: 30 });
    calistir(capraz.sistem, 20);
    expect(capraz.ses.uzakAtis.length).toBeGreaterThan(50);
    for (const az of capraz.ses.uzakAtis) expect(Math.abs(az)).toBeGreaterThan(1.5);
    expect(Math.abs(ortanca(capraz.ses.uzakAtis))).toBeGreaterThan(30);
  });

  it("ses hızı üstü 'çat': başın yanından geçen iz, en yakın geçiş noktasının azimutunu (derece) iz başına bir kez verir", () => {
    const { ses, sistem } = kur();
    // İz eklemek için iç yöntem (yalnız test; akışın rastgele hedefleri olmadan, bilinen bir yoldan)
    const izEkle = (sistem as unknown as { izEkle(p: Vector3, v: Vector3, dost: boolean): void }).izEkle.bind(sistem);
    /** Baş yüksekliğinde `mesafe` m'de, `azimut` yönündeki noktadan dik geçen iz: 150 m geriden, 160 m/sn. */
    const gecir = (azimut: number, mesafe: number) => {
      const gecis = azimutYon(azimut).multiplyScalar(mesafe);
      const d = azimutYon(azimut + 90); // yatay doğrultu, geçiş yönüne dik
      // İzin hafif düşüşü (0,15 g, ~0,94 sn'de ~0,65 m) karşılansın: baş hizasından geçer, çok ötede yere iner
      izEkle(gecis.clone().addScaledVector(d, -150).setY(0.65), d.multiplyScalar(160), false);
    };
    gecir(60, 3);
    calistir(sistem, 2.5);
    // Yalnız "çat" (yere 26 m'den uzakta çarpar, çarpma sesi yok); değer derece: sin(60°) ≈ 0,87 değil
    expect(ses.carpma.length).toBe(1);
    expect(ses.carpma[0]).toBeCloseTo(60, 0);
    gecir(-120, 4); // sol arka: pan −1..1 aralığında olamayacak bir yön
    calistir(sistem, 2.5);
    expect(ses.carpma.length).toBe(2);
    expect(aciFarki(ses.carpma[1], -120)).toBeLessThan(0.5);
    // Dost izi ve uzaktan geçen iz çatlamaz
    izEkle(azimutYon(150).multiplyScalar(-150).setY(0.65), azimutYon(150).multiplyScalar(160), true);
    gecir(10, 8);
    calistir(sistem, 2.5);
    expect(ses.carpma.length).toBe(2);
  });

  it("dost ateşi ve tank: atış sesi atıcının, top sesi tankın yönünden; top mermisi namlu yönünde patlar", () => {
    const { ses, sistem } = kur();
    const dost = yerKonumu(40, 12);
    const tank = yerKonumu(-60, 30);
    sistem.dostlar = () => [dost];
    sistem.agirSilahlar = () => [{ konum: tank, namlu: tank.clone().setY(tank.y + 2), yon: azimutYon(150) }];
    sistem.catismaAyarla({ aktif: true, siddet: 0.5, azimut: 150, dostAtes: true });
    calistir(sistem, 30);
    expect(ses.yakinAtis.length).toBeGreaterThan(10);
    for (const az of ses.yakinAtis) expect(az).toBeCloseTo(40, 6);
    for (const az of ses.uzakAtis) expect(aciFarki(az, 150)).toBeLessThanOrEqual(10.5);
    expect(ses.top.length).toBeGreaterThan(0);
    for (const az of ses.top) expect(az).toBeCloseTo(-60, 6);
    expect(ses.uzakPatlama.some((az) => aciFarki(az, 150) <= 3)).toBe(true);
    for (const az of ses.uzakPatlama) expect(aciFarki(az, 150)).toBeLessThanOrEqual(40.5);
  });
});
