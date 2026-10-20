import { describe, expect, it } from "vitest";
import { envDosyasiniYukle } from "./ayarlar.js";
import { Gunluk } from "./gunluk.js";
import { FOV_PARAMETRESI, OrnekBaslatici, ornekKomutuOlustur, parametreleriAyir } from "./ornek.js";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const normalize = (yol: string) => yol.replace(/\\/g, "/");

describe("örnek paket komutu", () => {
  it("UnrealGame.exe yolunu ve pencere parametrelerini üretir", () => {
    const k = ornekKomutuOlustur({
      paket: "C:/ornek",
      proje: "TCCC",
      harita: "/Game/Maps/CitySuburbs",
      genislik: 5760,
      yukseklik: 1080,
      tamEkran: false,
      ekParametreler: '-ExecCmds="stat fps"',
    });
    expect(normalize(k.exe)).toBe("C:/ornek/Engine/Binaries/Win64/UnrealGame.exe");
    expect(normalize(k.cwd)).toBe("C:/ornek/Engine/Binaries/Win64");
    expect(normalize(k.args[0]!)).toBe("../../../TCCC/TCCC.uproject");
    expect(k.args[1]).toBe("/Game/Maps/CitySuburbs");
    for (const p of ["-windowed", "-ResX=5760", "-ResY=1080", "-WinX=0", "-WinY=0", "-ForceRes", FOV_PARAMETRESI, "-log", '-ExecCmds="stat fps"']) {
      expect(k.args).toContain(p);
    }
  });

  it("ek parametrelerde tırnak içindeki boşlukları korur", () => {
    expect(parametreleriAyir('-ExecCmds="sg.ShadowQuality 1,stat fps" -NoSplash  -log')).toEqual([
      '-ExecCmds="sg.ShadowQuality 1,stat fps"',
      "-NoSplash",
      "-log",
    ]);
    expect(parametreleriAyir("")).toEqual([]);
  });

  it("tam ekranda pencere konumu vermez, harita yoksa menüden açar", () => {
    const k = ornekKomutuOlustur({ paket: "D:/p", proje: "TCCC", harita: "", genislik: 1920, yukseklik: 1080, tamEkran: true, ekParametreler: "" });
    expect(k.args).toContain("-fullscreen");
    expect(k.args).not.toContain("-windowed");
    expect(k.args).not.toContain("-WinX=0");
    expect(k.args[1]).toBe("-fullscreen");
  });
});

describe("örnek başlatıcı", () => {
  it("süreci başlatır, durumu bildirir ve durdurur", async () => {
    const b = new OrnekBaslatici({ exe: process.execPath, args: ["-e", "setTimeout(() => {}, 10000)"], cwd: process.cwd() }, new Gunluk(), true);
    const d1 = b.baslat();
    expect(d1.calisiyor).toBe(true);
    expect(d1.pid).toBeGreaterThan(0);
    expect(b.baslat().pid).toBe(d1.pid); // ikinci çağrı yeni süreç açmaz

    await new Promise<void>((cozumle) => {
      b.dinle((d) => {
        if (!d.calisiyor) cozumle();
      });
      b.durdur();
    });
    expect(b.durum().calisiyor).toBe(false);
    expect(b.durum().sonCikis).toBeDefined();
  });

  it("paket bulunamazsa başlatmayı reddeder", () => {
    const b = new OrnekBaslatici({ exe: "/yok/Engine/Binaries/Win64/UnrealGame.exe", args: [], cwd: "/" }, new Gunluk());
    expect(b.durum().yapilandirildi).toBe(false);
    expect(() => b.baslat()).toThrow(/ORNEK_PAKET/);
  });
});

describe(".env okuyucu", () => {
  it("dosyayı okur, yorumları atlar, var olan değişkeni ezmez", () => {
    const klasor = mkdtempSync(join(tmpdir(), "kopru-env-"));
    const yol = join(klasor, ".env");
    writeFileSync(yol, "# yorum\nPORT=4100\nUNREAL_ADRES=\"http://10.0.0.5:30010\"\nORNEK_PAKET='C:\\\\Projeler\\\\ornek'\nBOZUK\n", "utf8");
    const env: NodeJS.ProcessEnv = { PORT: "9999" };
    expect(envDosyasiniYukle(yol, env)).toBe(true);
    expect(env.PORT).toBe("9999");
    expect(env.UNREAL_ADRES).toBe("http://10.0.0.5:30010");
    expect(env.ORNEK_PAKET).toBe("C:\\\\Projeler\\\\ornek");
    expect(envDosyasiniYukle(join(klasor, "yok.env"), env)).toBe(false);
  });
});
