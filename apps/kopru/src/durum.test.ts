/**
 * DurumDeposu.sahneyiTemeleDondur: çatışma / izli mermi / helikopter tek yayında kapanır, ayar değerleri korunur;
 * UE çağrıları yayından sonra, beklenmeden gider (gerçek kipte donan UE yayını geciktirmez); DMX flaşı kesilir.
 */
import { describe, expect, it, vi } from "vitest";
import { ArtNetGonderici } from "./artnet.js";
import { DurumDeposu } from "./durum.js";
import { Gunluk } from "./gunluk.js";
import { UnrealIstemci } from "./unreal.js";

function kur(mod: "simulasyon" | "gercek" = "simulasyon", fetchFn?: typeof fetch) {
  const gunluk = new Gunluk();
  const unreal = new UnrealIstemci({ adres: "http://127.0.0.1:30010", preset: "Test", mod }, gunluk, fetchFn);
  const artnet = new ArtNetGonderici({ hedef: "127.0.0.1", port: 6454, evren: 0, aktif: false });
  const depo = new DurumDeposu(unreal, artnet, gunluk);
  return { gunluk, unreal, artnet, depo };
}

describe("sahneyiTemeleDondur", () => {
  it("tek durum yayını; aktif bayraklar kapalı, ayar değerleri ve ortam korunur, son efektler boş; önceden açık olanlar döner", async () => {
    const { depo, unreal } = kur();
    await depo.bolgeSec("ormanlik");
    await depo.ortamGuncelle({ saat: 18.5, sis: 0.3, yagis: "hafif_yagmur" });
    await depo.catismaGuncelle({ aktif: true, siddet: 0.8, yon: 135, dostAtes: false });
    await depo.izliMermiGuncelle({ aktif: true, cikisNoktasi: 2, yon: 40, siklik: 7 });
    await depo.oda2Guncelle({ helikopter: "yerde", helikopterYonu: 200, guvenliAlan: "cukur", uzakSesMesafesi: 1500 });
    await depo.efektTetikle({ tur: "toz_duman", siddet: 0.5, yon: 30 });
    const once = depo.al();
    const yayinlar: Array<ReturnType<typeof depo.al>> = [];
    const olaylar: string[] = [];
    depo.dinle((d) => {
      yayinlar.push(d);
      olaylar.push("durum");
    });
    unreal.dinle((k) => olaylar.push(`ue:${k.fonksiyon}`));

    const donen = depo.sahneyiTemeleDondur();
    expect(donen).toEqual({ catisma: true, izliMermi: true, helikopter: true });
    expect(yayinlar).toHaveLength(1);
    // UE çağrıları yayından sonra
    expect(olaylar[0]).toBe("durum");
    expect(olaylar.slice(1).sort()).toEqual(["ue:CatismaAyarla", "ue:IzliMermiAyarla", "ue:Oda2Ayarla"]);
    const d = yayinlar[0];
    expect(d.catisma).toEqual({ ...once.catisma, aktif: false });
    expect(d.izliMermi).toEqual({ ...once.izliMermi, aktif: false });
    expect(d.oda2).toEqual({ ...once.oda2, helikopter: "yok" });
    expect(d.sonEfektler).toEqual([]);
    expect(d.bolge).toBe("ormanlik");
    expect(d.ortam).toEqual(once.ortam);
    expect(d.isik).toEqual(once.isik);
    expect(d.oda).toBe(once.oda);

    // İkinci çağrı: hiçbir şey açık değil, yine tek yayın
    expect(depo.sahneyiTemeleDondur()).toEqual({ catisma: false, izliMermi: false, helikopter: false });
    expect(yayinlar).toHaveLength(2);
  });

  it("gerçek UE kipinde UE cevap vermese de yayın beklemeden çıkar, istekler 3 sn'de zaman aşımına düşer; DMX flaşı kesilir", async () => {
    vi.useFakeTimers();
    try {
      // Hiç dönmeyen fetch: yalnız zaman aşımı (AbortController) bitirir
      const istekler: string[] = [];
      const asili = ((url: string, secenek?: RequestInit) => {
        istekler.push(url.split("/").pop() ?? "");
        return new Promise((_coz, reddet) => secenek?.signal?.addEventListener("abort", () => reddet(new Error("iptal"))));
      }) as unknown as typeof fetch;
      const { depo, artnet, unreal } = kur("gercek", asili);
      artnet.isigiUygula(depo.al().isik);
      const temel = Array.from(artnet.sonDurum().slice(0, 4));
      artnet.patlamaFlasi(1);
      expect(artnet.sonDurum()[0]).toBe(255);
      let yayin = 0;
      depo.dinle(() => yayin++);
      depo.sahneyiTemeleDondur();
      expect(yayin).toBe(1);
      expect(Array.from(artnet.sonDurum().slice(0, 4))).toEqual(temel);
      expect(istekler.sort()).toEqual(["CatismaAyarla", "IzliMermiAyarla", "Oda2Ayarla"]);
      await vi.advanceTimersByTimeAsync(3000);
      expect(unreal.sonHata).toMatch(/zaman aşımı \(3000 ms\)/);
      expect(unreal.sonIstekler().filter((k) => !k.basarili)).toHaveLength(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
