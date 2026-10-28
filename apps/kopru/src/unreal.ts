/**
 * Unreal Engine Remote Control API istemcisi (şartname §3 teknik mimari).
 *
 * UE tarafında "Remote Control API" eklentisi açık olmalı (varsayılan HTTP portu 30010).
 * Panelin kullandığı tüm uç noktalar bir Remote Control Preset üzerinden sunulur:
 *   PUT  /remote/preset/{preset}/property/{ad}   → değişken ayarla
 *   PUT  /remote/preset/{preset}/function/{ad}   → fonksiyon çağır
 *
 * "simulasyon" modunda hiçbir ağ isteği atılmaz; her çağrı günlüğe yazılır. Böylece panel
 * UE/nDisplay kurulumu olmadan geliştirilip test edilebilir (şartname §10: çevrimdışı çalışma).
 */
import type { Gunluk } from "./gunluk.js";
import type {
  Bolge,
  CatismaAyarlari,
  EfektIstegi,
  IzliMermiAyarlari,
  Oda,
  Oda2Ayarlari,
  OrtamAyarlari,
  UnrealIstekKaydi,
} from "./tipler.js";

export interface UnrealAyarlari {
  adres: string;
  preset: string;
  mod: "gercek" | "simulasyon";
}

/** UE içindeki Blueprint fonksiyon ve değişken adları – tek yerden yönetilir. */
export const UE_ISIMLERI = {
  fonksiyonlar: {
    bolgeYukle: "BolgeYukle",
    odaSec: "OdaSec",
    ortamAyarla: "OrtamAyarla",
    efektTetikle: "EfektTetikle",
    izliMermiAyarla: "IzliMermiAyarla",
    oda2Ayarla: "Oda2Ayarla",
    helikopter: "HelikopterDurumuAyarla",
    catismaAyarla: "CatismaAyarla",
  },
} as const;

export interface UnrealIstek {
  yol: string;
  govde: unknown;
}

export class UnrealIstemci {
  private _bagli = false;
  private _sonHata: string | undefined;
  /** Simülasyon modunda gönderilen istekler (testler için). */
  readonly gonderilen: UnrealIstek[] = [];
  /** Son çağrı kayıtları (panelde "Unreal'a giden komutlar" görünümü). */
  private readonly kayitlar: UnrealIstekKaydi[] = [];
  private readonly dinleyiciler = new Set<(kayit: UnrealIstekKaydi) => void>();

  constructor(
    private readonly ayarlar: UnrealAyarlari,
    private readonly gunluk: Gunluk,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  get mod() {
    return this.ayarlar.mod;
  }
  get adres() {
    return this.ayarlar.adres;
  }
  get bagli() {
    return this.ayarlar.mod === "simulasyon" ? true : this._bagli;
  }
  get sonHata() {
    return this._sonHata;
  }

  /** Her çağrıdan sonra (başarılı ya da değil) bilgilendirilir. */
  dinle(d: (kayit: UnrealIstekKaydi) => void): () => void {
    this.dinleyiciler.add(d);
    return () => this.dinleyiciler.delete(d);
  }

  sonIstekler(): UnrealIstekKaydi[] {
    return [...this.kayitlar];
  }

  private kaydet(kayit: UnrealIstekKaydi) {
    this.kayitlar.push(kayit);
    if (this.kayitlar.length > 100) this.kayitlar.shift();
    for (const d of this.dinleyiciler) d(kayit);
  }

  /** Bağlantıyı yoklar; UE'nin /remote/info uç noktası kullanılır. */
  async yokla(): Promise<boolean> {
    if (this.ayarlar.mod === "simulasyon") return true;
    try {
      const ctrl = new AbortController();
      const zamanlayici = setTimeout(() => ctrl.abort(), 1500);
      const yanit = await this.fetchFn(`${this.ayarlar.adres}/remote/info`, { signal: ctrl.signal });
      clearTimeout(zamanlayici);
      const onceki = this._bagli;
      this._bagli = yanit.ok;
      this._sonHata = yanit.ok ? undefined : `HTTP ${yanit.status}`;
      if (!onceki && this._bagli) this.gunluk.bilgi(`Unreal Engine bağlantısı kuruldu (${this.ayarlar.adres})`);
      return this._bagli;
    } catch (hata) {
      if (this._bagli) this.gunluk.uyari("Unreal Engine bağlantısı koptu");
      this._bagli = false;
      this._sonHata = hata instanceof Error ? hata.message : String(hata);
      return false;
    }
  }

  private async fonksiyonCagir(ad: string, parametreler: Record<string, unknown>): Promise<void> {
    const yol = `/remote/preset/${encodeURIComponent(this.ayarlar.preset)}/function/${ad}`;
    const govde = { Parameters: parametreler, GenerateTransaction: false };
    this.gonderilen.push({ yol, govde });
    if (this.gonderilen.length > 500) this.gonderilen.shift();

    const kayit: UnrealIstekKaydi = { fonksiyon: ad, parametreler, zaman: Date.now(), mod: this.ayarlar.mod, basarili: true };

    if (this.ayarlar.mod === "simulasyon") {
      this.gunluk.bilgi(`[UE simülasyon] ${ad}(${JSON.stringify(parametreler)})`);
      this.kaydet(kayit);
      return;
    }
    try {
      const yanit = await this.fetchFn(`${this.ayarlar.adres}${yol}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(govde),
      });
      if (!yanit.ok) {
        this._sonHata = `${ad}: HTTP ${yanit.status}`;
        this.gunluk.hata(`UE çağrısı başarısız: ${this._sonHata}`);
        kayit.basarili = false;
        kayit.hata = `HTTP ${yanit.status}`;
      } else {
        this._bagli = true;
      }
    } catch (hata) {
      this._bagli = false;
      this._sonHata = hata instanceof Error ? hata.message : String(hata);
      this.gunluk.hata(`UE'ye ulaşılamadı: ${this._sonHata}`);
      kayit.basarili = false;
      kayit.hata = this._sonHata;
    }
    this.kaydet(kayit);
  }

  odaSec(oda: Oda) {
    return this.fonksiyonCagir(UE_ISIMLERI.fonksiyonlar.odaSec, { Oda: oda });
  }

  bolgeYukle(bolge: Bolge) {
    return this.fonksiyonCagir(UE_ISIMLERI.fonksiyonlar.bolgeYukle, { Bolge: bolge });
  }

  ortamAyarla(ortam: OrtamAyarlari) {
    return this.fonksiyonCagir(UE_ISIMLERI.fonksiyonlar.ortamAyarla, {
      Mevsim: ortam.mevsim,
      Saat: ortam.saat,
      Bulut: ortam.bulut,
      Sis: ortam.sis,
      Yagis: ortam.yagis,
      RuzgarSiddeti: ortam.ruzgarSiddeti,
      RuzgarYonu: ortam.ruzgarYonu,
    });
  }

  efektTetikle(efekt: EfektIstegi) {
    return this.fonksiyonCagir(UE_ISIMLERI.fonksiyonlar.efektTetikle, {
      Tur: efekt.tur,
      Siddet: efekt.siddet ?? 1,
      Yon: efekt.yon ?? 0,
      Mesafe: efekt.mesafe ?? 0,
    });
  }

  izliMermiAyarla(ayar: IzliMermiAyarlari) {
    return this.fonksiyonCagir(UE_ISIMLERI.fonksiyonlar.izliMermiAyarla, {
      Aktif: ayar.aktif,
      CikisNoktasi: ayar.cikisNoktasi,
      Yon: ayar.yon,
      Siklik: ayar.siklik,
    });
  }

  oda2Ayarla(ayar: Oda2Ayarlari) {
    return this.fonksiyonCagir(UE_ISIMLERI.fonksiyonlar.oda2Ayarla, {
      GuvenliAlan: ayar.guvenliAlan,
      Helikopter: ayar.helikopter,
      HelikopterYonu: ayar.helikopterYonu,
      UzakSesMesafesi: ayar.uzakSesMesafesi,
      UzakSesYonu: ayar.uzakSesYonu,
    });
  }

  catismaAyarla(ayar: CatismaAyarlari) {
    return this.fonksiyonCagir(UE_ISIMLERI.fonksiyonlar.catismaAyarla, {
      Aktif: ayar.aktif,
      Siddet: ayar.siddet,
      Yon: ayar.yon,
      DostAtes: ayar.dostAtes,
    });
  }
}
