/**
 * FigurKatmani yükleme iptali (sahne sıfırlaması): model, "yanında" hedef bekleme ve elde silah await'lerinden sonra
 * jeton denetlenir; temizle / durdur ya da aynı kimlikle yeni oynat gelince yüklemesi biten figür sahneye çıkmaz.
 * WebGL yok: glTF yükleyicisi elle çözülen (ertelenmiş) sözlerle değiştirilir.
 */
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FigurKatmani, type ModelTanimi } from "./figurler3b";
import { yerKonumu } from "./uzay";

afterEach(() => {
  vi.useRealTimers();
});

const TANIM: ModelTanimi = { dosya: "asker.glb", animasyon: "yok" };

function ertelenmis() {
  let coz!: () => void;
  let reddet!: (e: Error) => void;
  const p = new Promise<unknown>((c, r) => {
    coz = () => c({ scene: new THREE.Group(), animations: [] });
    reddet = r;
  });
  return { p, coz, reddet };
}

/** Yükleyici url'e göre verilen sözü döner (yoksa hemen çözülen boş model). */
function katman(yukleyici: (url: string) => Promise<unknown> = () => Promise.resolve({ scene: new THREE.Group(), animations: [] })) {
  const k = new FigurKatmani();
  (k as unknown as { yukle: (url: string) => Promise<unknown> }).yukle = yukleyici;
  return k;
}

describe("FigurKatmani yükleme iptali", () => {
  it("model yüklenirken temizle: yükleme bitince figür sahneye çıkmaz, iptal hata sayılmaz", async () => {
    const y = ertelenmis();
    const k = katman(() => y.p);
    const bitti = k.oynat(TANIM, { id: "fg_1", azimut: 0, mesafe: 6 }, "");
    expect(k.yukleniyor).toBe(1);
    expect(k.doluMu(yerKonumu(0, 6))).toBe(true); // rezervasyon
    k.temizle();
    expect(k.yukleniyor).toBe(0);
    expect(k.doluMu(yerKonumu(0, 6))).toBe(false);
    y.coz();
    expect(await bitti).toBe(true);
    expect(k.sayi).toBe(0);
    expect(k.grup.children).toHaveLength(0);
  });

  it("model yüklenirken durdur(id): yalnız o figür iptal, diğeri sahneye çıkar", async () => {
    const a = ertelenmis();
    const b = ertelenmis();
    const k = katman((url) => (url.includes("a") ? a.p : b.p));
    const ilk = k.oynat({ ...TANIM, dosya: "a.glb" }, { id: "fg_a", azimut: -20, mesafe: 6 }, "");
    const ikinci = k.oynat({ ...TANIM, dosya: "b.glb" }, { id: "fg_b", azimut: 20, mesafe: 6 }, "");
    k.durdur("fg_a");
    a.coz();
    b.coz();
    expect(await ilk).toBe(true);
    expect(await ikinci).toBe(true);
    expect(k.sayi).toBe(1);
    expect(k.pozlar().map((p) => p.id)).toEqual(["fg_b"]);
  });

  it("'yanında' (sıhhiyeci) hedef beklerken temizle: bekleme hemen biter, 4 sn sonra da figür çıkmaz", async () => {
    vi.useFakeTimers();
    const k = katman();
    let bitti = false;
    const s = k.oynat(TANIM, { id: "fg_sihhiye", azimut: 20, mesafe: 6, yaninda: "fg_yarali_yok" }, "").then((r) => {
      bitti = true;
      return r;
    });
    await vi.advanceTimersByTimeAsync(300);
    expect(bitti).toBe(false);
    k.temizle();
    await vi.advanceTimersByTimeAsync(150);
    expect(bitti).toBe(true);
    expect(await s).toBe(true);
    await vi.advanceTimersByTimeAsync(4500);
    expect(k.sayi).toBe(0);
  });

  it("elde silah yüklenirken temizle: figür çıkmaz", async () => {
    const silah = ertelenmis();
    const k = katman((url) => (url.includes("tufek") ? silah.p : Promise.resolve({ scene: new THREE.Group(), animations: [] })));
    const s = k.oynat({ ...TANIM, silahModeli: { dosya: "tufek.glb", kemik: "WristR" } }, { id: "fg_t", azimut: 0, mesafe: 6 }, "");
    await new Promise((r) => setTimeout(r, 0));
    expect(k.yukleniyor).toBe(1);
    k.temizle();
    silah.coz();
    expect(await s).toBe(true);
    expect(k.sayi).toBe(0);
  });

  it("aynı kimlikle art arda oynat: yalnız sonuncusu sahnede (önce biten eski komut uygulanmaz)", async () => {
    const eski = ertelenmis();
    const yeni = ertelenmis();
    let i = 0;
    const k = katman(() => (i++ === 0 ? eski.p : yeni.p));
    const s1 = k.oynat(TANIM, { id: "fg_x", azimut: -40, mesafe: 6 }, "");
    const s2 = k.oynat(TANIM, { id: "fg_x", azimut: 40, mesafe: 6 }, "");
    yeni.coz();
    expect(await s2).toBe(true);
    eski.coz();
    expect(await s1).toBe(true);
    expect(k.sayi).toBe(1);
    // Sonuncunun konumu (azimut 40 → +x)
    expect(k.grup.children[0].position.x).toBeGreaterThan(0);
  });

  it("normal yükleme sahneye çıkar, rezervasyon kalkar; yükleme düşerse false (uyarı) ve rezervasyon kalkar", async () => {
    const k = katman();
    expect(await k.oynat(TANIM, { id: "fg_1", azimut: 0, mesafe: 6 }, "")).toBe(true);
    expect(k.sayi).toBe(1);
    expect(k.yukleniyor).toBe(0);
    const hatali = ertelenmis();
    const k2 = katman(() => hatali.p);
    const s = k2.oynat(TANIM, { id: "fg_2", azimut: 90, mesafe: 6 }, "");
    hatali.reddet(new Error("404"));
    expect(await s).toBe(false);
    expect(k2.yukleniyor).toBe(0);
    expect(k2.doluMu(yerKonumu(90, 6))).toBe(false);
  });
});
