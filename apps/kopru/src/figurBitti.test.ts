/**
 * 8 Kasım değerlendirmesi §4-2 ve §3-6/§4-6: "ayakta" duruşu saklanır (Kalk'tan sonra yeniden bağlanan oynatıcı manifest
 * duruşuna dönmesin); oynatıcının "figür bitti" bildirimi figürü listeden düşürür ve durdur yayınlar.
 */
import { describe, expect, it } from "vitest";
import { FigurYoneticisi } from "./figur.js";
import { Gunluk } from "./gunluk.js";

describe("figür yöneticisi – ayakta ve bitti", () => {
  it("Kalk (poz ayakta) aktif listede açıkça saklanır", () => {
    const f = new FigurYoneticisi(new Gunluk(), []);
    const a = f.komut({ islem: "oynat", klip: "komando_diz_cokmus", azimut: 0, poz: "comelmis" });
    expect(f.aktifListe()[0].poz).toBe("comelmis");
    f.komut({ islem: "poz", id: a.id, poz: "ayakta" });
    expect(f.aktifListe()[0].poz).toBe("ayakta");
    // Açıkça ayakta istenen oynat da saklanır
    const b = f.komut({ islem: "oynat", klip: "komando_bekleyen", azimut: 10, poz: "ayakta" });
    expect(f.aktifListe().find((x) => x.id === b.id)?.poz).toBe("ayakta");
  });

  it("bittiBildir: sahnedeki figürü düşürür ve durdur yayınlar; bilinmeyen kimlikte hiçbir şey yapmaz", () => {
    const f = new FigurYoneticisi(new Gunluk(), []);
    const olaylar: string[] = [];
    f.dinle((k) => olaylar.push(`${k.islem}:${k.id}`));
    const a = f.komut({ islem: "oynat", klip: "komando_kosan", azimut: 0 });
    expect(f.bittiBildir(a.id)).toBe(true);
    expect(f.aktifListe()).toHaveLength(0);
    expect(olaylar.at(-1)).toBe(`durdur:${a.id}`);
    const sayi = olaylar.length;
    expect(f.bittiBildir(a.id)).toBe(false);
    expect(f.bittiBildir("yok")).toBe(false);
    expect(olaylar).toHaveLength(sayi);
  });

  it("konumBildir: mevzi değiştiren askerin yönü listede güncellenir, konum komutu yayınlanır; figür yeniden kurulmaz", () => {
    const f = new FigurYoneticisi(new Gunluk(), []);
    const olaylar: Array<{ islem: string; id: string; azimut?: number; liste: number[] }> = [];
    f.dinle((k, liste) => olaylar.push({ islem: k.islem, id: k.id, azimut: k.azimut, liste: liste.map((x) => x.azimut ?? 0) }));
    const a = f.komut({ islem: "oynat", klip: "komando_nisan", azimut: -20 });
    const b = f.komut({ islem: "oynat", klip: "komando_nisan", azimut: 30 });
    expect(f.konumBildir(a.id, 12.4)).toBe(true);
    expect(olaylar.at(-1)).toEqual({ islem: "konum", id: a.id, azimut: 12, liste: [12, 30] });
    expect(f.aktifListe().find((x) => x.id === a.id)?.klip).toBe("komando_nisan");
    // Değişmeyen yön, bilinmeyen kimlik, bozuk sayı: yayın yok
    const sayi = olaylar.length;
    expect(f.konumBildir(a.id, 12.3)).toBe(false);
    expect(f.konumBildir("yok", 5)).toBe(false);
    expect(f.konumBildir(b.id, Number.NaN)).toBe(false);
    expect(olaylar).toHaveLength(sayi);
    // ±180 sarması
    expect(f.konumBildir(b.id, 190)).toBe(true);
    expect(f.aktifListe().find((x) => x.id === b.id)?.azimut).toBe(-170);
    // API "konum" kabul etmez (yalnız oynatıcı bildirimiyle)
    expect(() => f.komut({ islem: "konum", id: a.id, azimut: 0 })).toThrow();
  });

  it("tekSeferlikleriKaldir ayakta duruşlu tek seferlik figürü de kaldırır", () => {
    const f = new FigurYoneticisi(new Gunluk(), []);
    f.komut({ islem: "oynat", klip: "komando_bomba", azimut: 0, poz: "ayakta", dongu: false });
    f.komut({ islem: "oynat", klip: "komando_yarali", azimut: 20, poz: "yarali", dongu: false });
    f.tekSeferlikleriKaldir({});
    expect(f.aktifListe().map((x) => x.poz)).toEqual(["yarali"]);
  });
});
