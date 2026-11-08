/**
 * Veri deposu dayanıklılığı (8 Kasım değerlendirmesi §3-2): bozuk JSON eğitmenin senaryolarını silmesin (yedek + uyarı),
 * yazım atomik olsun (.tmp kalmaz).
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { VeriDeposu, bozukYedekYolu } from "./depo.js";
import { ORNEK_SENARYOLAR } from "./ornekSenaryolar.js";

describe("veri deposu – bozuk dosya ve atomik yazım", () => {
  it("bozuk senaryolar.json yedeğe kopyalanır, uyarı verilir, örnekler yazılır ama bozuk içerik kaybolmaz", () => {
    const k = mkdtempSync(join(tmpdir(), "depo-bozuk-"));
    const bozuk = '[{"id":"sn_benim","ad":"Benim","oda":"oda1","adimlar":[]},';
    writeFileSync(join(k, "senaryolar.json"), bozuk);
    const uyarilar: string[] = [];
    const d = new VeriDeposu(k, ORNEK_SENARYOLAR, (u) => uyarilar.push(u));
    expect(uyarilar.length).toBeGreaterThanOrEqual(1);
    expect(uyarilar[0]).toContain("okunamadı");
    const yedekler = readdirSync(k).filter((a) => a.includes(".bozuk-"));
    expect(yedekler).toHaveLength(1);
    expect(readFileSync(join(k, yedekler[0]), "utf8")).toBe(bozuk);
    // Yeni dosya geçerli JSON ve örnekleri içerir
    expect(d.senaryolar().map((s) => s.id)).toEqual(ORNEK_SENARYOLAR.map((s) => s.id));
  });

  it("yazım geçici dosya üzerinden olur; .tmp kalmaz, içerik geçerli", () => {
    const k = mkdtempSync(join(tmpdir(), "depo-atomik-"));
    const d = new VeriDeposu(k, []);
    d.onAyarKaydet({ id: "oa1", ad: "Deneme", durum: {} as never });
    expect(existsSync(join(k, "on-ayarlar.json.tmp"))).toBe(false);
    expect(JSON.parse(readFileSync(join(k, "on-ayarlar.json"), "utf8"))).toHaveLength(1);
  });

  it("yedek adı .json uzantısını korur ve zaman damgası taşır", () => {
    const ad = bozukYedekYolu("C:/veri/senaryolar.json", Date.UTC(2026, 10, 8, 12, 30, 0));
    expect(ad).toBe("C:/veri/senaryolar.bozuk-2026-11-08T12-30-00-000Z.json");
  });
});
