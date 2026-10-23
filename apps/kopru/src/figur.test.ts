import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FigurYoneticisi } from "./figur.js";
import { Gunluk } from "./gunluk.js";

describe("figür yöneticisi", () => {
  it("oynat/durdur/temizle komutlarını doğrular ve aktif listeyi tutar", () => {
    const f = new FigurYoneticisi(new Gunluk(), []);
    const olaylar: string[] = [];
    f.dinle((k, aktifler) => olaylar.push(`${k.islem}:${aktifler.length}`));

    const a = f.komut({ islem: "oynat", klip: "asker_yarali_yerde", azimut: 370, yukseklik: -100, olcek: 50 });
    expect(a.id).toMatch(/^fg_/);
    expect(a.azimut).toBe(10); // 370 → 10
    expect(a.yukseklik).toBe(-45); // sınırlandı
    expect(a.olcek).toBe(10);
    const b = f.komut({ islem: "oynat", klip: "asker_siper", azimut: -200 });
    expect(b.azimut).toBe(160);
    expect(f.aktifListe()).toHaveLength(2);

    f.komut({ islem: "durdur", id: a.id });
    expect(f.aktifListe().map((x) => x.id)).toEqual([b.id]);
    f.komut({ islem: "temizle" });
    expect(f.aktifListe()).toHaveLength(0);
    expect(olaylar).toEqual(["oynat:1", "oynat:2", "durdur:1", "temizle:0"]);

    expect(() => f.komut({ islem: "oynat" })).toThrow(/klip/);
    expect(() => f.komut({ islem: "durdur" })).toThrow(/id/);
    expect(() => f.komut({ islem: "yok" as "oynat" })).toThrow(/islem/);
  });

  it("klip listesini ilk bulunan manifestten okur", () => {
    const yok = join(tmpdir(), "yok-klasor");
    const var1 = mkdtempSync(join(tmpdir(), "icerik-"));
    writeFileSync(
      join(var1, "manifest.json"),
      JSON.stringify({
        klipler: {
          _aciklama: "yorum",
          patlama_toprak_1: { dosya: "k/p1.webm", kategori: "efekt", genislikDerece: 12 },
          asker_yarali_yerde: { dosya: "k/a1.webm", kategori: "figur", ad: "Yaralı asker (yerde)", dongu: true },
          ornek_klip: { _ornek: true, dosya: "x.webm", kategori: "figur" },
        },
      }),
    );
    const f = new FigurYoneticisi(new Gunluk(), [yok, var1]);
    expect(f.klipleriOku()).toEqual([
      { ad: "patlama_toprak_1", baslik: "patlama_toprak_1", kategori: "efekt", dongu: false },
      { ad: "asker_yarali_yerde", baslik: "Yaralı asker (yerde)", kategori: "figur", dongu: true },
    ]);
    expect(new FigurYoneticisi(new Gunluk(), [yok]).klipleriOku()).toEqual([]);
  });

  it("poz komutu aktif figürün duruşunu günceller ve doğrular", () => {
    const f = new FigurYoneticisi(new Gunluk(), []);
    const olaylar: string[] = [];
    f.dinle((k) => olaylar.push(`${k.islem}:${k.poz ?? "-"}`));
    const a = f.komut({ islem: "oynat", klip: "asker_bekleyen", azimut: 20 });
    expect(a.poz).toBeUndefined(); // ayakta varsayılan, yayında taşınmaz
    const y = f.komut({ islem: "oynat", klip: "asker_yarali_3b", poz: "yarali" });
    expect(y.poz).toBe("yarali");

    const p = f.komut({ islem: "poz", id: a.id, poz: "yarali" });
    expect(p).toEqual({ islem: "poz", id: a.id, poz: "yarali" });
    expect(f.aktifListe().find((x) => x.id === a.id)?.poz).toBe("yarali");
    f.komut({ islem: "poz", id: a.id, poz: "ayakta" });
    expect(f.aktifListe().find((x) => x.id === a.id)?.poz).toBeUndefined();

    // Duruşlu figür tek seferlik sayılıp silinmez
    f.komut({ islem: "poz", id: a.id, poz: "comelmis" });
    f.tekSeferlikleriKaldir({ asker_bekleyen: { dongu: false }, asker_yarali_3b: { dongu: false } });
    expect(f.aktifListe().map((x) => x.id).sort()).toEqual([a.id, y.id].sort());

    expect(() => f.komut({ islem: "poz", poz: "yarali" })).toThrow(/id/);
    expect(() => f.komut({ islem: "poz", id: a.id })).toThrow(/poz/);
    expect(() => f.komut({ islem: "poz", id: "yok", poz: "yarali" })).toThrow(/sahnede/);
    expect(() => f.komut({ islem: "poz", id: a.id, poz: "ucan" as "yarali" })).toThrow(/poz/);
    expect(olaylar).toEqual(["oynat:-", "oynat:yarali", "poz:yarali", "poz:ayakta", "poz:comelmis"]);
  });
});
