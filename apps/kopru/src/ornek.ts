/**
 * Örnek paket başlatıcı – paketlenmiş UE oyununu (ör. TCCC) panelden açıp kapatır.
 *
 * Kaynak proje gelene kadar "elimizdekilerle demo" aşamasında kullanılır: panel ve örnek
 * birbirine bağlı değildir (pakette Remote Control yok), ama eğitmen tek yerden ikisini
 * de yönetebilir. Ayrıntı: docs/ornek-calisma-inceleme.md §10.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { OrnekPaketAyarlari } from "./ayarlar.js";
import type { Gunluk } from "./gunluk.js";
import type { OrnekDurumu } from "./tipler.js";

export interface OrnekKomutu {
  exe: string;
  args: string[];
  cwd: string;
}

/** 48:9 gibi geniş oranlarda UE'nin dikey görüş açısını kırpmasını önler (Hor+). */
export const FOV_PARAMETRESI = "-ini:Engine:[/Script/Engine.LocalPlayer]:AspectRatioAxisConstraint=AspectRatio_MaintainYFOV";

/** Boşlukla ayrılmış parametreleri böler; tırnak içindeki boşlukları korur (-ExecCmds="stat fps,..."). */
export function parametreleriAyir(metin: string): string[] {
  return metin.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
}

/** Ayarlardan UnrealGame.exe komut satırını üretir (Windows paket yapısı). */
export function ornekKomutuOlustur(a: OrnekPaketAyarlari): OrnekKomutu {
  const cwd = join(a.paket, "Engine", "Binaries", "Win64");
  const exe = join(cwd, "UnrealGame.exe");
  const args: string[] = [join("..", "..", "..", a.proje, `${a.proje}.uproject`)];
  if (a.harita) args.push(a.harita);
  args.push(a.tamEkran ? "-fullscreen" : "-windowed", `-ResX=${a.genislik}`, `-ResY=${a.yukseklik}`);
  if (!a.tamEkran) args.push("-WinX=0", "-WinY=0");
  args.push("-ForceRes", FOV_PARAMETRESI, "-log");
  args.push(...parametreleriAyir(a.ekParametreler));
  return { exe, args, cwd };
}

type Dinleyici = (durum: OrnekDurumu) => void;

export class OrnekBaslatici {
  private surec: ChildProcess | null = null;
  private baslangic = 0;
  private sonCikis: OrnekDurumu["sonCikis"];
  private dinleyiciler = new Set<Dinleyici>();

  constructor(
    private readonly komut: OrnekKomutu,
    private readonly gunluk: Gunluk,
    private readonly yapilandirildi: boolean = existsSync(komut.exe),
  ) {}

  dinle(d: Dinleyici): () => void {
    this.dinleyiciler.add(d);
    return () => this.dinleyiciler.delete(d);
  }

  private yayinla() {
    const d = this.durum();
    for (const dl of this.dinleyiciler) dl(d);
  }

  durum(): OrnekDurumu {
    return {
      yapilandirildi: this.yapilandirildi,
      calisiyor: this.surec !== null,
      pid: this.surec?.pid,
      baslangic: this.surec ? this.baslangic : undefined,
      komut: `${this.komut.exe} ${this.komut.args.join(" ")}`,
      sonCikis: this.sonCikis,
    };
  }

  baslat(): OrnekDurumu {
    if (!this.yapilandirildi) throw new Error(`Örnek paket bulunamadı: ${this.komut.exe} (ORNEK_PAKET ayarını kontrol edin)`);
    if (this.surec) return this.durum();
    const surec = spawn(this.komut.exe, this.komut.args, { cwd: this.komut.cwd, stdio: "ignore", windowsHide: false });
    this.surec = surec;
    this.baslangic = Date.now();
    this.sonCikis = undefined;
    this.gunluk.bilgi(`Örnek paket başlatıldı (pid ${surec.pid}): ${this.komut.args.join(" ")}`);
    surec.on("error", (hata) => {
      this.gunluk.hata(`Örnek paket başlatılamadı: ${hata.message}`);
      this.sonCikis = { kod: null, zaman: Date.now(), hata: hata.message };
      this.surec = null;
      this.yayinla();
    });
    surec.on("exit", (kod, sinyal) => {
      this.gunluk.bilgi(`Örnek paket kapandı (${sinyal ? `sinyal ${sinyal}` : `kod ${kod ?? "?"}`})`);
      this.sonCikis = { kod, sinyal: sinyal ?? undefined, zaman: Date.now() };
      this.surec = null;
      this.yayinla();
    });
    this.yayinla();
    return this.durum();
  }

  durdur(): OrnekDurumu {
    if (this.surec) {
      this.gunluk.bilgi("Örnek paket durduruluyor");
      this.surec.kill();
    }
    return this.durum();
  }
}
