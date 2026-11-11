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

  it("tekSeferlikleriKaldir ayakta duruşlu tek seferlik figürü de kaldırır", () => {
    const f = new FigurYoneticisi(new Gunluk(), []);
    f.komut({ islem: "oynat", klip: "komando_bomba", azimut: 0, poz: "ayakta", dongu: false });
    f.komut({ islem: "oynat", klip: "komando_yarali", azimut: 20, poz: "yarali", dongu: false });
    f.tekSeferlikleriKaldir({});
    expect(f.aktifListe().map((x) => x.poz)).toEqual(["yarali"]);
  });
});
