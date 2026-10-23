import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { VeriDeposu } from "./depo.js";
import { ORNEK_SENARYOLAR } from "./ornekSenaryolar.js";
import type { Senaryo } from "./tipler.js";

describe("veri deposu", () => {
  it("ilk kurulumda örnek senaryoları yazar", () => {
    const k = mkdtempSync(join(tmpdir(), "depo-"));
    const d = new VeriDeposu(k, ORNEK_SENARYOLAR);
    expect(d.senaryolar().map((s) => s.id)).toEqual(ORNEK_SENARYOLAR.map((s) => s.id));
  });

  it("mevcut kuruluma yeni örnekleri ekler, eğitmenin senaryolarını ve düzenlediği örneği korur", () => {
    const k = mkdtempSync(join(tmpdir(), "depo-"));
    const benim: Senaryo = { id: "sn_benim", ad: "Benim", oda: "oda1", adimlar: [] };
    const duzenlenmis: Senaryo = { ...ORNEK_SENARYOLAR[0], ad: "Düzenlendi" };
    writeFileSync(join(k, "senaryolar.json"), JSON.stringify([benim, duzenlenmis]));
    new VeriDeposu(k, ORNEK_SENARYOLAR);
    const liste = JSON.parse(readFileSync(join(k, "senaryolar.json"), "utf8")) as Senaryo[];
    expect(liste[0].id).toBe("sn_benim");
    expect(liste[1].ad).toBe("Düzenlendi");
    expect(liste.map((s) => s.id)).toEqual(["sn_benim", ORNEK_SENARYOLAR[0].id, ...ORNEK_SENARYOLAR.slice(1).map((s) => s.id)]);
  });

  it("örnek senaryoların adım kimlikleri tekil ve figür duruş adımları önce sahneye konan figürü hedefler", () => {
    for (const s of ORNEK_SENARYOLAR) {
      const kimlikler = s.adimlar.map((a) => a.id);
      expect(new Set(kimlikler).size).toBe(kimlikler.length);
      const konanlar = new Set<string>();
      for (const a of [...s.adimlar].sort((x, y) => x.gecikmeMs - y.gecikmeMs)) {
        if (a.islem.tip !== "figur") continue;
        if (a.islem.figur.islem === "oynat" && a.islem.figur.id) konanlar.add(a.islem.figur.id);
        if (a.islem.figur.islem === "poz") expect(konanlar.has(a.islem.figur.id ?? "")).toBe(true);
      }
    }
  });
});
