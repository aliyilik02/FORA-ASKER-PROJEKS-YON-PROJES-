/**
 * Simülasyon durum deposu. Paneldeki her değişiklik buraya uygulanır, ardından
 * Unreal Engine'e ve DMX/Art-Net'e iletilir; tüm bağlı paneller WebSocket ile güncellenir.
 */
import { ArtNetGonderici, gunIsigiHesapla } from "./artnet.js";
import type { Gunluk } from "./gunluk.js";
import {
  type Bolge,
  type CatismaAyarlari,
  type EfektIstegi,
  type IzliMermiAyarlari,
  type Oda,
  type Oda2Ayarlari,
  type OrtamAyarlari,
  type OrtamIsigi,
  type SimulasyonDurumu,
  durumuTamamla,
  varsayilanDurum,
} from "./tipler.js";
import type { UnrealIstemci } from "./unreal.js";

type Dinleyici = (durum: SimulasyonDurumu) => void;
type EfektDinleyici = (efekt: EfektIstegi & { zaman: number }) => void;

const sinirla = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export class DurumDeposu {
  private durum: SimulasyonDurumu = varsayilanDurum();
  private dinleyiciler = new Set<Dinleyici>();
  private efektDinleyiciler = new Set<EfektDinleyici>();

  constructor(
    private readonly unreal: UnrealIstemci,
    private readonly artnet: ArtNetGonderici,
    private readonly gunluk: Gunluk,
  ) {}

  al(): SimulasyonDurumu {
    return structuredClone(this.durum);
  }

  dinle(d: Dinleyici): () => void {
    this.dinleyiciler.add(d);
    return () => this.dinleyiciler.delete(d);
  }

  /** Her efekt tetiklemesinde (durum yayınından ayrı, olay olarak) bilgilendirilir. */
  efektDinle(d: EfektDinleyici): () => void {
    this.efektDinleyiciler.add(d);
    return () => this.efektDinleyiciler.delete(d);
  }

  private yayinla() {
    const kopya = this.al();
    for (const d of this.dinleyiciler) d(kopya);
  }

  /** Tüm mevcut durumu UE ve DMX'e baştan gönderir (bağlantı kurulunca / yeniden senkron). */
  async tumunuGonder() {
    await this.unreal.odaSec(this.durum.oda);
    await this.unreal.bolgeYukle(this.durum.bolge);
    await this.unreal.ortamAyarla(this.durum.ortam);
    await this.unreal.izliMermiAyarla(this.durum.izliMermi);
    await this.unreal.oda2Ayarla(this.durum.oda2);
    this.artnet.isigiUygula(this.durum.isik);
  }

  async odaSec(oda: Oda) {
    if (this.durum.oda === oda) return;
    this.durum.oda = oda;
    this.gunluk.bilgi(`Oda seçildi: ${oda === "oda1" ? "Oda 1 – Ateş Altında Yaralıya Müdahale" : "Oda 2 – Güvenli Alan / Tahliye"}`);
    await this.unreal.odaSec(oda);
    this.yayinla();
  }

  async bolgeSec(bolge: Bolge) {
    this.durum.bolge = bolge;
    this.gunluk.bilgi(`Bölge yükleniyor: ${bolge}`);
    await this.unreal.bolgeYukle(bolge);
    // Bölge değişince ortam ayarları aynı sahneye yeniden uygulanır (§3: tek sahneden tüm kombinasyonlar).
    await this.unreal.ortamAyarla(this.durum.ortam);
    this.yayinla();
  }

  async ortamGuncelle(kismi: Partial<OrtamAyarlari>) {
    const o = this.durum.ortam;
    this.durum.ortam = {
      mevsim: kismi.mevsim ?? o.mevsim,
      saat: sinirla(kismi.saat ?? o.saat, 0, 24),
      bulut: sinirla(kismi.bulut ?? o.bulut, 0, 1),
      sis: sinirla(kismi.sis ?? o.sis, 0, 1),
      yagis: kismi.yagis ?? o.yagis,
      ruzgarSiddeti: sinirla(kismi.ruzgarSiddeti ?? o.ruzgarSiddeti, 0, 1),
      ruzgarYonu: ((kismi.ruzgarYonu ?? o.ruzgarYonu) % 360 + 360) % 360,
    };
    await this.unreal.ortamAyarla(this.durum.ortam);
    if (this.durum.isik.senaryoyaBagli) {
      const oneri = gunIsigiHesapla(this.durum.ortam.saat, this.durum.ortam.bulut);
      this.durum.isik = { ...this.durum.isik, ...oneri };
      this.artnet.isigiUygula(this.durum.isik);
    }
    this.yayinla();
  }

  isikGuncelle(kismi: Partial<OrtamIsigi>) {
    const i = this.durum.isik;
    this.durum.isik = {
      parlaklik: sinirla(kismi.parlaklik ?? i.parlaklik, 0, 1),
      r: sinirla(kismi.r ?? i.r, 0, 255),
      g: sinirla(kismi.g ?? i.g, 0, 255),
      b: sinirla(kismi.b ?? i.b, 0, 255),
      senaryoyaBagli: kismi.senaryoyaBagli ?? i.senaryoyaBagli,
    };
    if (this.durum.isik.senaryoyaBagli && kismi.senaryoyaBagli === true) {
      const oneri = gunIsigiHesapla(this.durum.ortam.saat, this.durum.ortam.bulut);
      this.durum.isik = { ...this.durum.isik, ...oneri };
    }
    this.artnet.isigiUygula(this.durum.isik);
    this.yayinla();
  }

  async izliMermiGuncelle(kismi: Partial<IzliMermiAyarlari>) {
    const m = this.durum.izliMermi;
    this.durum.izliMermi = {
      aktif: kismi.aktif ?? m.aktif,
      cikisNoktasi: kismi.cikisNoktasi ?? m.cikisNoktasi,
      yon: sinirla(kismi.yon ?? m.yon, -90, 90),
      siklik: sinirla(kismi.siklik ?? m.siklik, 0.1, 30),
    };
    await this.unreal.izliMermiAyarla(this.durum.izliMermi);
    this.yayinla();
  }

  async oda2Guncelle(kismi: Partial<Oda2Ayarlari>) {
    const o = this.durum.oda2;
    this.durum.oda2 = {
      guvenliAlan: kismi.guvenliAlan ?? o.guvenliAlan,
      helikopter: kismi.helikopter ?? o.helikopter,
      helikopterYonu: ((Math.round(kismi.helikopterYonu ?? o.helikopterYonu ?? 12) % 360) + 360) % 360,
      uzakSesMesafesi: sinirla(kismi.uzakSesMesafesi ?? o.uzakSesMesafesi, 0, 10000),
      uzakSesYonu: ((kismi.uzakSesYonu ?? o.uzakSesYonu) % 360 + 360) % 360,
    };
    await this.unreal.oda2Ayarla(this.durum.oda2);
    this.yayinla();
  }

  async catismaGuncelle(kismi: Partial<CatismaAyarlari>) {
    const c = this.durum.catisma ?? varsayilanDurum().catisma;
    this.durum.catisma = {
      aktif: kismi.aktif ?? c.aktif,
      siddet: sinirla(kismi.siddet ?? c.siddet, 0, 1),
      yon: ((Math.round(kismi.yon ?? c.yon) % 360) + 360) % 360,
      dostAtes: kismi.dostAtes ?? c.dostAtes,
    };
    await this.unreal.catismaAyarla(this.durum.catisma);
    this.gunluk.bilgi(this.durum.catisma.aktif ? `Çatışma: %${Math.round(this.durum.catisma.siddet * 100)}, yön ${this.durum.catisma.yon}°` : "Çatışma durdu");
    this.yayinla();
  }

  async efektTetikle(efekt: EfektIstegi) {
    const istek: EfektIstegi = {
      tur: efekt.tur,
      siddet: sinirla(efekt.siddet ?? 1, 0, 1),
      yon: efekt.yon,
      mesafe: efekt.mesafe,
    };
    // Oda 2'deki uzak sesler panelde ayarlanan mesafe/yöne göre zayıflatılır (§9).
    if ((istek.tur === "uzak_patlama" || istek.tur === "uzak_mermi_sesi") && istek.mesafe === undefined) {
      istek.mesafe = this.durum.oda2.uzakSesMesafesi;
      istek.yon = istek.yon ?? this.durum.oda2.uzakSesYonu;
    }
    this.gunluk.bilgi(`Efekt tetiklendi: ${istek.tur} (şiddet ${istek.siddet})`);
    await this.unreal.efektTetikle(istek);
    if (istek.tur === "patlama" && this.durum.isik.senaryoyaBagli) {
      this.artnet.patlamaFlasi(istek.siddet ?? 1);
    }
    const olay = { ...istek, zaman: Date.now() };
    this.durum.sonEfektler.unshift(olay);
    if (this.durum.sonEfektler.length > 50) this.durum.sonEfektler.pop();
    for (const d of this.efektDinleyiciler) d(olay);
    this.yayinla();
  }

  /** Ön ayar yüklerken tüm durumu tek seferde uygular. */
  async durumuYukle(yeni: Omit<SimulasyonDurumu, "sonEfektler">) {
    this.durum = { ...durumuTamamla(structuredClone(yeni)), sonEfektler: this.durum.sonEfektler };
    await this.tumunuGonder();
    this.yayinla();
  }
}
