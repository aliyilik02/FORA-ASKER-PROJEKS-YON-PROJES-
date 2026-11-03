/**
 * Çözme işi başlatıcı: işçi yanıtı, işçinin çözme hatası (olduğu gibi döner), işçi altyapısı düşerse ana iş parçacığına
 * geçiş (o dosya ve sonraki işler), iptal. Worker ve fetch sahte; modül her testte yeniden yüklenir (oturum bayrağı).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IsciYaniti } from "./panoramaIscisi";

type Davranis = "yanit" | "hata" | "altyapi" | "sessiz";
function sahteIsci(davranis: Davranis) {
  const kayit = { olusan: 0, sonlanan: 0, istekler: [] as unknown[] };
  class SahteIsci {
    onmessage: ((e: { data: IsciYaniti }) => void) | null = null;
    onerror: ((e: { preventDefault(): void; message: string }) => void) | null = null;
    constructor() {
      kayit.olusan++;
    }
    postMessage(m: unknown) {
      kayit.istekler.push(m);
      setTimeout(() => {
        if (davranis === "yanit") {
          const bitmap = { width: 8, height: 4, close: () => undefined } as unknown as ImageBitmap;
          this.onmessage?.({ data: { tamam: true, sonuc: { tam: bitmap, kucuk: bitmap, analiz: null, gok: null, kaynakGenisligi: 8, kaynakYuksekligi: 4, sureler: { indirme: 0, cozme: 0, kucultme: 0, analiz: 0, gok: 0 } } } });
        } else if (davranis === "hata") this.onmessage?.({ data: { tamam: false, hata: "HTTP 404" } });
        else if (davranis === "altyapi") this.onerror?.({ preventDefault: () => undefined, message: "betik yüklenemedi" });
      }, 0);
    }
    terminate() {
      kayit.sonlanan++;
    }
  }
  vi.stubGlobal("Worker", SahteIsci);
  const fetchSahte = vi.fn(() => Promise.reject(new Error("ana iş parçacığında indirildi")));
  vi.stubGlobal("fetch", fetchSahte);
  return { kayit, fetchSahte };
}

describe("cozmeBaslat", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("işçi yanıtı: sonuç gelir, işçi sonlandırılır, adres mutlak gider", async () => {
    const { kayit, fetchSahte } = sahteIsci("yanit");
    const { cozmeBaslat } = await import("./panoramaIsi");
    const s = await cozmeBaslat("https://ornek/icerik/a.jpg", { enGenis: 4096 }).sonuc;
    expect(s.tam.width).toBe(8);
    expect(kayit.sonlanan).toBe(1);
    expect(kayit.istekler[0]).toEqual({ url: "https://ornek/icerik/a.jpg", secenek: { enGenis: 4096 } });
    expect(fetchSahte).not.toHaveBeenCalled();
  });

  it("işçinin çözme hatası (HTTP 404) olduğu gibi döner; ana iş parçacığına düşülmez", async () => {
    const { fetchSahte } = sahteIsci("hata");
    const { cozmeBaslat } = await import("./panoramaIsi");
    await expect(cozmeBaslat("a.jpg", { enGenis: 0 }).sonuc).rejects.toThrow("HTTP 404");
    expect(fetchSahte).not.toHaveBeenCalled();
  });

  it("işçi altyapısı düşerse aynı dosya ana iş parçacığında çözülür; sonraki işlerde işçi denenmez", async () => {
    const { kayit, fetchSahte } = sahteIsci("altyapi");
    const { cozmeBaslat } = await import("./panoramaIsi");
    await expect(cozmeBaslat("a.jpg", { enGenis: 0 }).sonuc).rejects.toThrow("ana iş parçacığında indirildi");
    expect(kayit.olusan).toBe(1);
    await expect(cozmeBaslat("b.jpg", { enGenis: 0 }).sonuc).rejects.toThrow("ana iş parçacığında indirildi");
    expect(kayit.olusan).toBe(1);
    expect(fetchSahte).toHaveBeenCalledTimes(2);
  });

  it("iptal: işçi hemen sonlandırılır, söz sonuçlanmaz", async () => {
    const { kayit } = sahteIsci("sessiz");
    const { cozmeBaslat } = await import("./panoramaIsi");
    const is = cozmeBaslat("a.jpg", { enGenis: 0 });
    let sonuclandi = false;
    is.sonuc.then(
      () => (sonuclandi = true),
      () => (sonuclandi = true),
    );
    is.iptal();
    await new Promise((r) => setTimeout(r, 10));
    expect(kayit.sonlanan).toBe(1);
    expect(sonuclandi).toBe(false);
  });
});
