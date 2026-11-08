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
  type Safha,
  SAFHA_ETIKETLERI,
  durumuTamamla,
  varsayilanDurum,
} from "./tipler.js";
import { UE_SIFIRLAMA_ZAMAN_ASIMI_MS, type UnrealIstemci } from "./unreal.js";
import { GUVENLI_ALANLAR, HELIKOPTER_DURUMLARI, MEVSIMLER, YAGISLAR, boolYaDa, sayiYaDa, secenekYaDa } from "./dogrulama.js";

type Dinleyici = (durum: SimulasyonDurumu) => void;

/** Sahne sıfırlamasında kapananlar: önceden açık mıydı (özet ve günlük için). */
export interface TemeleDonenler {
  catisma: boolean;
  izliMermi: boolean;
  helikopter: boolean;
}
type EfektDinleyici = (efekt: EfektIstegi & { zaman: number }) => void;

/** Sonlu olmayan değer (NaN) alt sınıra değil, çağıranın verdiği `eski`ye düşer; o da yoksa alt sınır. */
const sinirla = (v: number, min: number, max: number, eski?: number) => (Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : (eski ?? min));

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
      mevsim: secenekYaDa(kismi.mevsim, MEVSIMLER, o.mevsim),
      saat: sinirla(sayiYaDa(kismi.saat, o.saat), 0, 24),
      bulut: sinirla(sayiYaDa(kismi.bulut, o.bulut), 0, 1),
      sis: sinirla(sayiYaDa(kismi.sis, o.sis), 0, 1),
      yagis: secenekYaDa(kismi.yagis, YAGISLAR, o.yagis),
      ruzgarSiddeti: sinirla(sayiYaDa(kismi.ruzgarSiddeti, o.ruzgarSiddeti), 0, 1),
      ruzgarYonu: ((sayiYaDa(kismi.ruzgarYonu, o.ruzgarYonu) % 360) + 360) % 360,
      simsek: boolYaDa(kismi.simsek, o.simsek ?? false),
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
      parlaklik: sinirla(sayiYaDa(kismi.parlaklik, i.parlaklik), 0, 1),
      r: sinirla(sayiYaDa(kismi.r, i.r), 0, 255),
      g: sinirla(sayiYaDa(kismi.g, i.g), 0, 255),
      b: sinirla(sayiYaDa(kismi.b, i.b), 0, 255),
      senaryoyaBagli: boolYaDa(kismi.senaryoyaBagli, i.senaryoyaBagli),
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
      aktif: boolYaDa(kismi.aktif, m.aktif),
      cikisNoktasi: secenekYaDa(kismi.cikisNoktasi, [0, 1, 2] as const, m.cikisNoktasi),
      yon: sinirla(sayiYaDa(kismi.yon, m.yon), -90, 90),
      siklik: sinirla(sayiYaDa(kismi.siklik, m.siklik), 0.1, 30),
    };
    await this.unreal.izliMermiAyarla(this.durum.izliMermi);
    this.yayinla();
  }

  async oda2Guncelle(kismi: Partial<Oda2Ayarlari>) {
    const o = this.durum.oda2;
    this.durum.oda2 = {
      guvenliAlan: secenekYaDa(kismi.guvenliAlan, GUVENLI_ALANLAR, o.guvenliAlan),
      helikopter: secenekYaDa(kismi.helikopter, HELIKOPTER_DURUMLARI, o.helikopter),
      helikopterYonu: ((Math.round(sayiYaDa(kismi.helikopterYonu, o.helikopterYonu ?? 12)) % 360) + 360) % 360,
      uzakSesMesafesi: sinirla(sayiYaDa(kismi.uzakSesMesafesi, o.uzakSesMesafesi), 0, 10000),
      uzakSesYonu: ((sayiYaDa(kismi.uzakSesYonu, o.uzakSesYonu) % 360) + 360) % 360,
    };
    await this.unreal.oda2Ayarla(this.durum.oda2);
    this.yayinla();
  }

  async catismaGuncelle(kismi: Partial<CatismaAyarlari>) {
    const c = this.durum.catisma ?? varsayilanDurum().catisma;
    this.durum.catisma = {
      aktif: boolYaDa(kismi.aktif, c.aktif),
      siddet: sinirla(sayiYaDa(kismi.siddet, c.siddet), 0, 1),
      yon: ((Math.round(sayiYaDa(kismi.yon, c.yon)) % 360) + 360) % 360,
      dostAtes: boolYaDa(kismi.dostAtes, c.dostAtes),
    };
    await this.unreal.catismaAyarla(this.durum.catisma);
    this.gunluk.bilgi(this.durum.catisma.aktif ? `Çatışma: %${Math.round(this.durum.catisma.siddet * 100)}, yön ${this.durum.catisma.yon}°` : "Çatışma durdu");
    this.yayinla();
  }

  async efektTetikle(efekt: EfektIstegi) {
    const istek: EfektIstegi = {
      tur: efekt.tur,
      siddet: sinirla(sayiYaDa(efekt.siddet, 1), 0, 1),
      yon: efekt.yon === undefined ? undefined : sayiYaDa(efekt.yon, 0),
      mesafe: efekt.mesafe === undefined ? undefined : sayiYaDa(efekt.mesafe, 0),
    };
    // Oda 2'deki uzak sesler panelde ayarlanan mesafe/yöne göre zayıflatılır (§9).
    // Şimşek: yön ve mesafe verilmezse rastgele (yakın çakma seyrek: mesafe 0,5–7,5 km, karesel dağılım)
    if (istek.tur === "simsek") {
      istek.yon = istek.yon ?? Math.round(Math.random() * 360 - 180);
      istek.mesafe = istek.mesafe ?? Math.round(500 + Math.random() ** 2 * 7000);
    }
    if ((istek.tur === "uzak_patlama" || istek.tur === "uzak_mermi_sesi") && istek.mesafe === undefined) {
      istek.mesafe = this.durum.oda2.uzakSesMesafesi;
      istek.yon = istek.yon ?? this.durum.oda2.uzakSesYonu;
    }
    this.gunluk.bilgi(`Efekt tetiklendi: ${istek.tur} (şiddet ${istek.siddet})`);
    await this.unreal.efektTetikle(istek);
    if (istek.tur === "patlama" && this.durum.isik.senaryoyaBagli) {
      this.artnet.patlamaFlasi(istek.siddet ?? 1);
    }
    // Şimşek odada da çakar: kısa çift flaş (uzak şimşek sönük)
    if (istek.tur === "simsek" && this.durum.isik.senaryoyaBagli) {
      const g = (istek.siddet ?? 1) * Math.max(0.35, 1 - (istek.mesafe ?? 2000) / 9000);
      this.artnet.ciftFlas(g, 90, 170, g * 0.6, 70);
    }
    const olay = { ...istek, zaman: Date.now() };
    this.durum.sonEfektler.unshift(olay);
    if (this.durum.sonEfektler.length > 50) this.durum.sonEfektler.pop();
    for (const d of this.efektDinleyiciler) d(olay);
    this.yayinla();
  }

  /**
   * Sahne sıfırlaması (bkz. sahne.ts): çatışma, izli mermi ve helikopter tek seferde kapanır, son efektler silinir;
   * TEK durum yayını. Ayar değerleri (şiddet, yön, dost ateşi, çıkış noktası, sıklık, iniş yönü, uzak ses) korunur,
   * yalnız "aktif" bayrakları kapanır: eğitmen yeniden açınca aynı ayarla gelir. DMX'te süren patlama flaşı kesilir,
   * temel ışık yeniden gönderilir. UE çağrıları yayından SONRA, beklenmeden ve kısa zaman aşımıyla gider: erişilemeyen
   * UE sıfırlamayı geciktirmez (eskiden her alan önce UE'yi bekleyip ayrı yayın yapıyordu, arada çatışma sürüyordu).
   */
  sahneyiTemeleDondur(): TemeleDonenler {
    const d = this.durum;
    const catisma = d.catisma ?? varsayilanDurum().catisma;
    const onceki: TemeleDonenler = { catisma: catisma.aktif, izliMermi: d.izliMermi.aktif, helikopter: d.oda2.helikopter !== "yok" };
    d.catisma = { ...catisma, aktif: false };
    d.izliMermi = { ...d.izliMermi, aktif: false };
    d.oda2 = { ...d.oda2, helikopter: "yok" };
    d.sonEfektler = [];
    this.yayinla();
    this.artnet.flasiIptal();
    this.artnet.isigiUygula(d.isik);
    void Promise.allSettled([
      this.unreal.catismaAyarla(d.catisma, UE_SIFIRLAMA_ZAMAN_ASIMI_MS),
      this.unreal.izliMermiAyarla(d.izliMermi, UE_SIFIRLAMA_ZAMAN_ASIMI_MS),
      this.unreal.oda2Ayarla(d.oda2, UE_SIFIRLAMA_ZAMAN_ASIMI_MS),
    ]);
    return onceki;
  }

  /** TCCC safhası (panel rozeti ya da senaryo adımı); oynatıcıya `durum` yayınıyla gider. UE çağrısı yok. */
  safhaAyarla(safha: Safha) {
    if (this.durum.safha === safha) return;
    this.durum.safha = safha;
    this.gunluk.bilgi(`Safha: ${SAFHA_ETIKETLERI[safha]}`);
    this.yayinla();
  }

  /**
   * Senaryo "Durdur" (eğitmen eliyle): senaryonun açtığı sürekli efektler kapanır (§3-17; önceden çatışma/izli/helikopter
   * durdurulan senaryodan sonra da sürüyordu). Yalnız istenen alanlar; ayar değerleri korunur, UE çağrıları beklenmez.
   */
  sureklileriKapat(k: { catisma?: boolean; izliMermi?: boolean; helikopter?: boolean }) {
    const d = this.durum;
    let degisti = false;
    if (k.catisma && d.catisma?.aktif) {
      d.catisma = { ...d.catisma, aktif: false };
      degisti = true;
      void this.unreal.catismaAyarla(d.catisma, UE_SIFIRLAMA_ZAMAN_ASIMI_MS);
    }
    if (k.izliMermi && d.izliMermi.aktif) {
      d.izliMermi = { ...d.izliMermi, aktif: false };
      degisti = true;
      void this.unreal.izliMermiAyarla(d.izliMermi, UE_SIFIRLAMA_ZAMAN_ASIMI_MS);
    }
    if (k.helikopter && d.oda2.helikopter !== "yok") {
      d.oda2 = { ...d.oda2, helikopter: "yok" };
      degisti = true;
      void this.unreal.oda2Ayarla(d.oda2, UE_SIFIRLAMA_ZAMAN_ASIMI_MS);
    }
    if (degisti) this.yayinla();
    return degisti;
  }

  /** Ön ayar yüklerken tüm durumu tek seferde uygular. */
  async durumuYukle(yeni: Omit<SimulasyonDurumu, "sonEfektler">) {
    this.durum = { ...durumuTamamla(structuredClone(yeni)), sonEfektler: this.durum.sonEfektler };
    await this.tumunuGonder();
    this.yayinla();
  }
}
