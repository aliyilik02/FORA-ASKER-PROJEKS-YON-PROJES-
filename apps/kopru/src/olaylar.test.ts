import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { OlayGunlugu, durumFarki, olaylarCsv, sureBicimi } from "./olaylar.js";
import { varsayilanDurum } from "./tipler.js";

describe("durumFarki", () => {
  it("yalnız değişen alanları Türkçe özetler; değişiklik yoksa boş", () => {
    const a = varsayilanDurum();
    const b = varsayilanDurum();
    expect(durumFarki(a, b)).toEqual([]);
    b.bolge = "ormanlik";
    b.ortam.saat = 18.5;
    b.catisma = { aktif: true, siddet: 0.6, yon: 45, dostAtes: true };
    b.safha = "ates_altinda";
    b.oda2.helikopter = "iniyor";
    expect(durumFarki(a, b)).toEqual(["bölge: Ormanlık", "safha: Ateş altında bakım", "saat: 18:30", "helikopter: İniyor", "çatışma: %60 @ 45°"]);
    const c = structuredClone(b);
    c.catisma.aktif = false;
    expect(durumFarki(b, c)).toEqual(["çatışma: durdu"]);
  });
});

describe("OlayGunlugu", () => {
  it("olayları JSONL'e ekler, tatbikat kimliğini taşır, listeler ve CSV üretir", () => {
    const k = mkdtempSync(join(tmpdir(), "olay-"));
    let t = Date.UTC(2026, 10, 8, 9, 0, 0);
    const g = new OlayGunlugu(k, () => t);
    const gelen: string[] = [];
    g.dinle((o) => gelen.push(o.tur));
    g.kaydet("efekt", "Patlama (%100, 0°)");
    expect(g.liste()[0].tatbikat).toBeNull();
    t += 1000;
    const tb = g.tatbikatBaslat("TCCC lane 1");
    t += 65_000;
    g.kaydet("not", "Turnike 1:05'te uygulandı");
    t += 5_000;
    g.tatbikatBitir();
    const dosyalar = readdirSync(join(k, "olaylar"));
    expect(dosyalar).toHaveLength(1);
    const satirlar = readFileSync(join(k, "olaylar", dosyalar[0]), "utf8").trim().split("\n");
    expect(satirlar).toHaveLength(4);
    expect(JSON.parse(satirlar[2])).toMatchObject({ tur: "not", tatbikat: tb.id });
    expect(gelen).toEqual(["efekt", "tatbikat", "not", "tatbikat"]);
    // Tatbikata göre filtre ve dosyadan okuma
    const gun = dosyalar[0].slice(0, 10);
    expect(g.gunler()).toEqual([gun]);
    expect(g.liste({ gun, tatbikat: tb.id }).map((o) => o.tur)).toEqual(["tatbikat", "not", "tatbikat"]);
    expect(g.liste({ son: 2 })).toHaveLength(2);
    const csv = olaylarCsv(g.liste({ tatbikat: tb.id }), g.tatbikatListesi());
    expect(csv.startsWith("﻿saat;tatbikat_suresi;tatbikat;tur;ozet")).toBe(true);
    expect(csv).toContain(`"01:05";"${tb.id}";"not";"Turnike 1:05'te uygulandı"`);
    expect(g.aktifTatbikat).toBeNull();
  });
  it("yeni tatbikat öncekini kapatır; bozuk satır listeyi bozmaz", () => {
    const k = mkdtempSync(join(tmpdir(), "olay2-"));
    let t = Date.UTC(2026, 10, 8, 9, 0, 0);
    const g = new OlayGunlugu(k, () => t);
    const a = g.tatbikatBaslat("A");
    t += 1000;
    const b = g.tatbikatBaslat("B");
    expect(g.tatbikatListesi().map((x) => x.id)).toEqual([a.id, b.id]);
    expect(g.tatbikatListesi()[0].bitis).toBe(t);
    expect(g.liste().map((o) => o.ozet)[1]).toContain("Tatbikat bitti: A");
    expect(sureBicimi(125_000)).toBe("02:05");
  });
});
