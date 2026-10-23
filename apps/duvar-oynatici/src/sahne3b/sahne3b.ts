/**
 * 3B sahne katmanı (Three.js): panorama arka planı + panoramanın ışığıyla aydınlanan 3B nesneler.
 *
 * Neden: 2B bindirmelerde figür/efekt "yapıştırma" gibi durur; burada
 *  - panorama hem arka plan hem ortam ışığı (IBL) olur, nesneler aynı ışıkla aydınlanır,
 *  - güneş yönü panoramadan tahmin edilir, gölgeler o yöne düşer ve zemine oturur,
 *  - patlamalar kalıcı krater + tüten duman bırakır, ortamı anlık aydınlatır,
 *  - helikopter ve figürler gerçek 3B modellerdir.
 * Görüntü, duvar başına bir perspektif kamerayla aynı tuvale (viewport/scissor) çizilir; köşelerde
 * perspektif kırılmaz. Bu tuval 2B tuvalin altındadır; 2B katman (klipler, sis, yağış, HUD) üstüne gelir.
 */
import * as THREE from "three";
import { gunesKonumu, type Yerlesim } from "../projeksiyon";
import type { CatismaAyarlari, HelikopterDurumu, IzliMermiAyarlari, OrtamAyarlari } from "../tipler";
import { CatismaSistemi, type CatismaSesleri } from "./catisma";
import { atesDokusu, dumanDokusu, kivilcimDokusu, kraterDokusu } from "./dokular";
import { FigurKatmani, type FigurPozu, type FigurSecenekleri, type ModelTanimi } from "./figurler3b";
import { gunesTahmin, panoramadanSahneAzimutu, type GunesTahmini } from "./gunes";
import { HasarKatmani } from "./hasar";
import { Helikopter3B } from "./helikopter3b";
import { ParcacikSistemi } from "./parcaciklar";
import { SutreKatmani, type SutreEsyasi } from "./sutre";
import { ZEMIN_Y, azimutYon, dikeyFov, radyan, yerKonumu, yukseklikMesafe } from "./uzay";
import { birlikNoktasiSec, noktaSec, type YerlesimPlani, type YerlesimSecimi, type YerlesimTuru } from "./yerlesim";

export interface PanoramaKaynagi {
  url: string;
  yawKaydirma?: number;
  yukseklikKaydirma?: number;
  /** Manifestteki zaman dilimi: gece panoraması ayrıca karartılmaz. */
  zaman?: "gunduz" | "alacakaranlik" | "gece";
  /** Panoramaya özel yerleşim noktaları ve yasak aralıklar. */
  plan?: YerlesimPlani;
}

/**
 * Three.js equirect örneklemesinde (equirectUv: u = atan(z, x)/2π + 0.5) u=0.5, +x yönüne
 * (azimut +90°) düşer; bizim sözleşmede u=0.5 orta duvardır (azimut 0). backgroundRotation(θ)
 * matrisi transpoze uygulandığından örneklenen azimut = sahne azimutu + θ olur; panoramanın
 * k azimutunu orta duvara getirmek için θ = 90° + k. `?gunes=1` ile doğrulanır: güneş küresi
 * panoramadaki güneşle çakışmalı.
 */
const UC_YAW_TABANI = 90;

export class Sahne3B {
  readonly destekli: boolean;
  private renderer: THREE.WebGLRenderer | null = null;
  private readonly sahne = new THREE.Scene();
  private kameralar: THREE.PerspectiveCamera[] = [];
  private yerlesimler: Yerlesim[] = [];
  private W = 0;
  private H = 0;
  private readonly gunes = new THREE.DirectionalLight(0xffffff, 2);
  private readonly dolgu = new THREE.HemisphereLight(0xcfd8e6, 0x6b5a45, 0.15);
  private readonly flas = new THREE.PointLight(0xffd9a0, 0, 80, 2);
  private flasGuc = 0;
  private pmrem: THREE.PMREMGenerator | null = null;
  private ortamDokusu: THREE.Texture | null = null;
  private arkaPlan: THREE.Texture | null = null;
  private yuklenen = "";
  private kaynak: PanoramaKaynagi | null = null;
  private gunesTahmini: GunesTahmini | null = null;
  private saat = 12;
  private isik = 1;
  private readonly parcaciklar: ParcacikSistemi;
  private readonly hasar: HasarKatmani;
  private readonly figurler = new FigurKatmani();
  private readonly heli: Helikopter3B;
  private readonly catisma: CatismaSistemi;
  private readonly sutre = new SutreKatmani();
  private catismaSesleri: CatismaSesleri = { carpma: () => undefined, atis: () => undefined };
  private yagisKararma = 1;
  private gunesIsareti: THREE.Mesh | null = null;
  hazir = false;
  hata = "";

  constructor(tuval: HTMLCanvasElement, hataAyiklama = false) {
    let r: THREE.WebGLRenderer | null = null;
    try {
      r = new THREE.WebGLRenderer({ canvas: tuval, antialias: true, alpha: false, powerPreference: "high-performance", preserveDrawingBuffer: false });
    } catch (h) {
      this.hata = h instanceof Error ? h.message : String(h);
    }
    this.destekli = r !== null;
    this.parcaciklar = new ParcacikSistemi(dumanDokusu(128, 1), atesDokusu(128, 7), kivilcimDokusu(32));
    this.hasar = new HasarKatmani([kraterDokusu(256, 3), kraterDokusu(256, 9), kraterDokusu(256, 21)], this.parcaciklar);
    this.heli = new Helikopter3B(this.parcaciklar);
    this.catisma = new CatismaSistemi(this.parcaciklar, {
      carpma: (p) => this.catismaSesleri.carpma(p),
      atis: (p, u) => this.catismaSesleri.atis(p, u),
      uzakPatlama: (az) => {
        this.patlama(az, 0.7, true, false);
        this.catismaSesleri.uzakPatlama?.(az);
      },
      topAtisi: (pan) => this.catismaSesleri.topAtisi?.(pan),
    });
    this.catisma.dostlar = () => this.figurler.silahliKonumlar();
    this.catisma.agirSilahlar = () => this.figurler.agirSilahlar();
    if (!r) return;
    this.renderer = r;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NoToneMapping;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    // Gölge haritası yöne bağlı (güneş), kameraya değil: üç duvar için üç kez değil karede bir kez çizilir
    r.shadowMap.autoUpdate = false;
    r.setPixelRatio(1);
    this.pmrem = new THREE.PMREMGenerator(r);

    // Güneş + gölge
    this.gunes.castShadow = true;
    this.gunes.shadow.mapSize.set(2048, 2048);
    const sc = this.gunes.shadow.camera;
    sc.left = -45;
    sc.right = 45;
    sc.top = 45;
    sc.bottom = -45;
    sc.near = 1;
    sc.far = 260;
    this.gunes.shadow.bias = -0.0004;
    this.gunes.shadow.normalBias = 0.03;
    this.gunes.target.position.set(0, ZEMIN_Y, 0);
    this.sahne.add(this.gunes, this.gunes.target, this.dolgu, this.flas);

    // Zemin: yalnızca gölge alır (panoramanın zemini görünür kalır)
    const zemin = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.ShadowMaterial({ opacity: 0.55, transparent: true }));
    zemin.rotation.x = -Math.PI / 2;
    zemin.position.y = ZEMIN_Y;
    zemin.receiveShadow = true;
    zemin.renderOrder = 1;
    this.sahne.add(zemin);

    this.sahne.add(this.hasar.grup, this.figurler.grup, this.heli.grup, this.catisma.grup, this.sutre.grup, this.parcaciklar.grup);

    if (hataAyiklama) {
      this.gunesIsareti = new THREE.Mesh(new THREE.SphereGeometry(5, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffee55 }));
      this.sahne.add(this.gunesIsareti);
    }
  }

  get figurSayisi() {
    return this.figurler.sayi;
  }
  get kraterSayisi() {
    return this.hasar.sayi;
  }
  get parcacikSayisi() {
    return this.parcaciklar.duman.sayi + this.parcaciklar.ates.sayi + this.parcaciklar.kivilcim.sayi;
  }
  /** Son duvar çiziminin çağrı sayısı (HUD; performans tanısı). */
  get cizimCagrisi(): number {
    return this.renderer?.info.render.calls ?? 0;
  }
  get gunesBilgisi(): string {
    if (!this.gunesTahmini) return "güneş: saatten";
    const g = this.gunesTahmini;
    return `güneş: panoramadan az ${g.azimut.toFixed(0)}° yük ${g.yukseklikGuvenilir ? `${g.yukseklik.toFixed(0)}°` : "saatten"} güç ${g.guc.toFixed(2)}`;
  }

  /**
   * Gerçek dokular (Kenney CC0 parçacıklar, Poly Haven yanık toprak) varsa prosedürelleri değiştirir.
   * Dosyalar yoksa sessizce yedekte kalır.
   */
  dokulariYukle(kok: string) {
    const yukleyici = new THREE.TextureLoader();
    const yukle = (yol: string) =>
      new Promise<THREE.Texture>((coz, reddet) => {
        yukleyici.load(kok + yol, (t) => {
          t.colorSpace = THREE.SRGBColorSpace;
          coz(t);
        }, undefined, reddet);
      });
    yukle("dokular/smoke_05.png").then((t) => this.parcaciklar.duman.dokuAyarla(t)).catch(() => undefined);
    yukle("dokular/flame_01.png").then((t) => this.parcaciklar.ates.dokuAyarla(t)).catch(() => undefined);
    // Krater: yanık toprak rengi × Kenney scorch alfa maskesi
    Promise.all([yukle("dokular/yanik_toprak.jpg"), yukle("dokular/scorch_01.png"), yukle("dokular/scorch_02.png"), yukle("dokular/scorch_03.png")])
      .then(([renk, ...maskeler]) => {
        const dokular = maskeler.map((m) => {
          const c = document.createElement("canvas");
          c.width = c.height = 512;
          const ctx = c.getContext("2d")!;
          ctx.drawImage(renk.image as HTMLImageElement, 0, 0, 512, 512);
          ctx.globalCompositeOperation = "multiply";
          ctx.fillStyle = "rgba(60,45,30,0.6)";
          ctx.fillRect(0, 0, 512, 512);
          ctx.globalCompositeOperation = "destination-in";
          ctx.drawImage(m.image as HTMLImageElement, 0, 0, 512, 512);
          const t = new THREE.CanvasTexture(c);
          t.colorSpace = THREE.SRGBColorSpace;
          return t;
        });
        this.hasar.dokulariAyarla(dokular);
      })
      .catch(() => undefined);
  }
  get helikopterHazir() {
    return this.heli.hazir;
  }
  get helikopterTozu() {
    return this.heli.tozSiddeti;
  }
  /** 2B katman için ufuk çizgisi (piksel, üstten). */
  get ufukY() {
    return (this.H * (1 + (this.kaynak?.yukseklikKaydirma ?? 0))) / 2;
  }

  boyutlandir(W: number, H: number, yerlesimler: Yerlesim[]) {
    this.W = W;
    this.H = H;
    this.yerlesimler = yerlesimler;
    this.renderer?.setSize(W, H, false);
    this.kameralar = yerlesimler.map((y) => {
      const k = new THREE.PerspectiveCamera(dikeyFov(y.duvar.fov, y.genislik, H), y.genislik / H, 0.1, 3000);
      k.rotation.order = "YXZ";
      return k;
    });
    this.kameralariYonlendir();
  }

  private kameralariYonlendir() {
    const k = this.kaynak?.yukseklikKaydirma ?? 0;
    this.kameralar.forEach((kam, i) => {
      const y = this.yerlesimler[i];
      kam.rotation.y = -radyan(y.duvar.yaw);
      kam.rotation.x = Math.atan(k * Math.tan(radyan(kam.fov) / 2));
    });
  }

  /** Panorama resmi (equirect) → arka plan + ortam ışığı + güneş tahmini. null → katman kapanır. */
  panoramaAyarla(kaynak: PanoramaKaynagi | null) {
    if (!this.renderer) return;
    if (!kaynak) {
      this.kapat();
      return;
    }
    const yawDegisti = this.kaynak && (this.kaynak.yawKaydirma !== kaynak.yawKaydirma || this.kaynak.yukseklikKaydirma !== kaynak.yukseklikKaydirma);
    this.kaynak = kaynak;
    const inis = noktaSec(kaynak.plan, 12, "helikopter", 38, 180);
    this.heli.inisNoktasi(inis.azimut, inis.mesafe);
    if (kaynak.url === this.yuklenen) {
      if (yawDegisti) this.yonelimUygula();
      return;
    }
    this.kapat();
    this.kaynak = kaynak;
    this.yuklenen = kaynak.url;
    new THREE.TextureLoader().load(
      kaynak.url,
      (doku) => {
        if (this.yuklenen !== kaynak.url || !this.renderer || !this.pmrem) {
          doku.dispose();
          return;
        }
        doku.mapping = THREE.EquirectangularReflectionMapping;
        doku.colorSpace = THREE.SRGBColorSpace;
        doku.minFilter = THREE.LinearFilter;
        doku.generateMipmaps = false;
        this.arkaPlan = doku;
        this.sahne.background = doku;
        this.ortamDokusu = this.pmrem.fromEquirectangular(doku).texture;
        this.sahne.environment = this.ortamDokusu;
        this.gunesTahmini = this.gunesiTahminEt(doku.image as HTMLImageElement);
        this.yonelimUygula();
        this.isikGuncelle();
        this.hazir = true;
        this.hata = "";
      },
      undefined,
      () => {
        if (this.yuklenen === kaynak.url) this.hata = `panorama yüklenemedi: ${kaynak.url}`;
      },
    );
  }

  private gunesiTahminEt(img: HTMLImageElement): GunesTahmini | null {
    try {
      const c = document.createElement("canvas");
      c.width = 256;
      c.height = 128;
      const ctx = c.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0, 256, 128);
      return gunesTahmin(ctx.getImageData(0, 0, 256, 128).data, 256, 128);
    } catch {
      return null;
    }
  }

  private yonelimUygula() {
    const yaw = radyan(UC_YAW_TABANI + (this.kaynak?.yawKaydirma ?? 0));
    this.sahne.backgroundRotation.set(0, yaw, 0);
    this.sahne.environmentRotation.set(0, yaw, 0);
    this.kameralariYonlendir();
  }

  kapat() {
    this.sahne.background = null;
    this.sahne.environment = null;
    this.arkaPlan?.dispose();
    this.ortamDokusu?.dispose();
    this.arkaPlan = null;
    this.ortamDokusu = null;
    this.yuklenen = "";
    this.kaynak = null;
    this.gunesTahmini = null;
    this.hazir = false;
  }

  /** Bölge değişti: hasar ve parçacıklar sıfırlanır (figürler panelden yönetilir). */
  sahneyiSifirla() {
    this.hasar.temizle();
    this.parcaciklar.temizle();
    this.catisma.temizle();
  }

  ortamAyarla(ortam: OrtamAyarlari, isik: number) {
    this.saat = ortam.saat;
    this.isik = isik;
    // Güneşli panoramada yağmur/kar: sahneyi kıs, güneşi yumuşat (yağışlı panorama yoksa inandırıcılık için)
    this.yagisKararma = ortam.yagis === "siddetli_yagmur" ? 0.62 : ortam.yagis === "hafif_yagmur" ? 0.8 : ortam.yagis === "kar" ? 0.85 : 1;
    this.yagisKararma *= 1 - ortam.bulut * 0.18;
    this.isikGuncelle();
  }

  /** Oda 2 sütre dizilimi (güvenli alan tipi); null → kaldır. */
  sutreAyarla(tip: string | null, esyalar: SutreEsyasi[] | undefined, kok: string) {
    this.sutre.ayarla(tip, esyalar, kok);
  }

  private isikGuncelle() {
    // Panorama kendi zamanını taşıyorsa (gece çekimi) karartma yok; gündüz/genel panorama gece saatinde karartılır.
    const z = this.kaynak?.zaman;
    const faktor = (z === "gece" ? 1 : z === "alacakaranlik" ? Math.min(1, 0.55 + this.isik * 0.45) : 0.08 + 0.92 * this.isik) * this.yagisKararma;
    this.sahne.backgroundIntensity = faktor;
    this.sahne.environmentIntensity = faktor;
    this.parcaciklar.isik = faktor;
    this.catisma.isik = this.isik;
    this.dolgu.intensity = 0.15 * faktor;

    let azimut: number;
    let yukseklik: number;
    let guc: number;
    if (this.gunesTahmini && this.gunesTahmini.guc > 0.05) {
      azimut = panoramadanSahneAzimutu(this.gunesTahmini.azimut, this.kaynak?.yawKaydirma ?? 0);
      guc = this.gunesTahmini.guc;
      // Disk yok, yalnızca ışıma sütunu: yön panoramadan, yükseklik saatten (gece panoramasında ay için 25°)
      yukseklik = this.gunesTahmini.yukseklikGuvenilir ? this.gunesTahmini.yukseklik : Math.max(20, this.kaynak?.zaman === "gece" ? 25 : gunesKonumu(this.saat).yukseklik);
      if (!this.gunesTahmini.yukseklikGuvenilir) guc *= 0.7;
      // Makullük sınırı: parlak ufuk pusu / yapay zekâ panoramasında güneş diski 5° gibi çıkabiliyor; o zaman
      // gölgeler boyun 10 katı çizgiler oluyor. Gündüz panoramasında en az 18°, alacakaranlıkta 6°, gecede 15°.
      const enAz = z === "gece" ? 15 : z === "alacakaranlik" ? 6 : 18;
      if (yukseklik < enAz) yukseklik = enAz;
    } else {
      const g = gunesKonumu(this.saat);
      azimut = g.azimut;
      yukseklik = Math.max(5, g.yukseklik);
      guc = 0.5;
    }
    const yon = azimutYon(azimut);
    const e = radyan(yukseklik);
    const d = new THREE.Vector3(yon.x * Math.cos(e), Math.sin(e), yon.z * Math.cos(e));
    this.gunes.position.copy(d.clone().multiplyScalar(120)).add(this.gunes.target.position);
    this.gunesIsareti?.position.copy(d.clone().multiplyScalar(400));
    // Alçak güneş sıcak renk; kapalı gökte zayıf ve yumuşak
    const sicaklik = Math.max(0, Math.min(1, 1 - yukseklik / 18));
    this.gunes.color.setRGB(1, 0.96 - sicaklik * 0.22, 0.9 - sicaklik * 0.4);
    // Yağışta güneş zayıf ve gölge yumuşak
    const yagisGunes = 0.3 + 0.7 * this.yagisKararma;
    this.gunes.intensity = (0.35 + guc * 2.4) * faktor * yagisGunes;
    this.gunes.shadow.radius = 2 + (1 - guc * yagisGunes) * 8;
  }

  /** Yer patlaması: ateş, toprak sütunu, moloz, anlık aydınlatma, kalıcı krater + tüten duman. */
  patlama(azimut: number, siddet: number, uzak = false, plakaVar = false) {
    const s = Math.max(0.1, Math.min(1.5, siddet));
    if (uzak) {
      const mesafe = 260 + Math.random() * 300;
      const p = yerKonumu(azimut, mesafe);
      this.parcaciklar.patlama(p, 8 + s * 10);
      this.flasGuc = Math.max(this.flasGuc, 0.15 * s);
      return;
    }
    // Yerleşim planı: patlama her zaman hazır bir noktaya düşer (yön yalnız tercih); plan yoksa serbest
    const secim = this.noktaSec(azimut, "patlama", 30 - 16 * s, 180);
    const mesafe = secim.mesafe * (secim.nokta ? 0.92 + Math.random() * 0.16 : 0.85 + Math.random() * 0.3);
    const p = yerKonumu(secim.azimut, mesafe);
    const r = 1.2 + s * 2.4;
    // Gerçek çekilmiş plaka 2B katmanda oynuyorsa 3B ateş topu çizilmez; krater, moloz ve ışık yine eklenir.
    if (!plakaVar) this.parcaciklar.patlama(p, r);
    else this.parcaciklar.tozBulutu(p, r, s * 0.6);
    this.hasar.krater(p, 1.6 + s * 2.6, s);
    this.flas.position.set(p.x, p.y + r, p.z);
    this.flasGuc = Math.max(this.flasGuc, s);
  }

  tozDuman(azimut: number, siddet: number) {
    const secim = this.noktaSec(azimut, "toz", 9 + Math.random() * 9);
    const p = yerKonumu(secim.azimut, secim.mesafe);
    this.parcaciklar.tozBulutu(p, 3.5, Math.max(0.2, siddet));
  }

  /**
   * Panoramanın yerleşim planına göre yön/mesafe seçimi (2B plakalar için de kullanılır).
   * Plan azimutları panorama koordinatındadır (yawKaydirma'dan bağımsız); sahne azimutu ile
   * panorama azimutu arasında k = yawKaydirma kadar fark vardır (sahne = panorama − k).
   */
  noktaSec(azimut: number, tur: YerlesimTuru, varsayilanMesafe: number, tolerans?: number): YerlesimSecimi {
    const k = this.kaynak?.yawKaydirma ?? 0;
    const secim = noktaSec(this.kaynak?.plan, azimut + k, tur, varsayilanMesafe, tolerans);
    return { ...secim, azimut: panoramadanSahneAzimutu(secim.azimut, k) };
  }

  figurOynat(tanim: ModelTanimi, s: FigurSecenekleri, kok: string) {
    // Birlik yerleşimi: panelin yönü yalnızca tercih; model türüne uygun en yakın BOŞ hazır nokta seçilir
    // (tank → tank noktası, asker → mevzi). Nokta yoksa yön + mesafe serbest kalır.
    const varsayilan = s.yukseklik !== undefined ? yukseklikMesafe(s.yukseklik) : (tanim.mesafe ?? 20);
    const k = this.kaynak?.yawKaydirma ?? 0;
    const turler = tanim.yerlesim ?? ["asker", "figur"];
    const secim = birlikNoktasiSec(this.kaynak?.plan, s.azimut + k, turler, varsayilan, (az, m) => this.figurler.doluMu(yerKonumu(panoramadanSahneAzimutu(az, k), m)));
    const azimut = panoramadanSahneAzimutu(secim.azimut, k);
    void this.figurler.oynat(tanim, { ...s, azimut, mesafe: secim.nokta ? secim.mesafe : undefined }, kok);
  }
  figurDurdur(id: string) {
    this.figurler.durdur(id);
  }
  /** Duruş değişikliği: vuruldu (yere düşer), diz çök, ayağa kalk. */
  figurPoz(id: string, poz: FigurPozu) {
    this.figurler.pozAyarla(id, poz);
  }
  /** Figür ses olayları (yaralanma çığlığı, yardım çağrısı) → ses motoru. */
  figurSesleriAyarla(f: (tur: "vuruldu" | "yardim", azimut: number) => void) {
    this.figurler.sesOlayi = f;
  }
  figurTemizle() {
    this.figurler.temizle();
  }
  figurOnYukle(url: string) {
    this.figurler.onYukle(url);
  }

  helikopterYukle(url: string, boy?: number, rotor?: string[], renk?: string) {
    this.heli.yukle(url, boy, rotor, renk);
  }
  /** `yon`: panelden iniş yönü (sahne azimutu, derece); planın iniş noktasına 70° içinde yapışır. */
  helikopterAyarla(d: HelikopterDurumu, yon?: number) {
    if (yon !== undefined) {
      const secim = this.noktaSec(yon, "helikopter", 38, 70);
      this.heli.inisNoktasi(secim.azimut, secim.mesafe);
    }
    this.heli.durumAyarla(d);
  }
  get helikopterAzimutu() {
    return this.heli.inisAzimutu;
  }

  catismaSesleriAyarla(s: CatismaSesleri) {
    this.catismaSesleri = s;
  }
  /** Çatışma durumu; `azimut` düşman cephesinin sahne azimutu. */
  catismaAyarla(c: CatismaAyarlari, azimut: number) {
    this.catisma.catismaAyarla({ aktif: c.aktif, siddet: c.siddet, azimut, dostAtes: c.dostAtes });
    this.figurler.dusmanAzimutu = c.aktif ? azimut : null;
  }
  /** Klasik izli mermi ayarı 3B'de: duvar yaw'ı + yön → kaynak azimutu. */
  izliMermiAyarla(a: IzliMermiAyarlari, duvarYawlari: number[]) {
    const yaw = duvarYawlari[a.cikisNoktasi] ?? 0;
    this.catisma.izliAyarla({ aktif: a.aktif, azimut: yaw + a.yon * 0.5, siklik: a.siklik });
  }
  get izSayisi() {
    return this.catisma.aktifIzSayisi;
  }

  guncelle(dt: number) {
    if (!this.renderer) return;
    this.catisma.guncelle(dt);
    this.parcaciklar.guncelle(dt);
    this.hasar.guncelle(dt);
    this.figurler.guncelle(dt);
    this.heli.guncelle(dt);
    if (this.flasGuc > 0) {
      this.flas.intensity = this.flasGuc * 6000;
      this.flasGuc = Math.max(0, this.flasGuc - dt * 3.5);
    } else this.flas.intensity = 0;
  }

  /** Üç duvarı kendi tuvaline çizer. Arka plan hazır değilse false döner (çağıran eski yola düşer). */
  ciz(): boolean {
    const r = this.renderer;
    if (!r || !this.hazir || this.kameralar.length === 0) return false;
    r.setScissorTest(true);
    r.shadowMap.needsUpdate = true; // ilk duvar çiziminde gölge geçişi, diğer ikisi aynı haritayı kullanır
    this.yerlesimler.forEach((y, i) => {
      r.setViewport(y.x, 0, y.genislik, this.H);
      r.setScissor(y.x, 0, y.genislik, this.H);
      r.render(this.sahne, this.kameralar[i]);
    });
    r.setScissorTest(false);
    return true;
  }
}
