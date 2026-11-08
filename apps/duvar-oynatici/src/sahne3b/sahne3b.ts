/**
 * 3B sahne katmanı (Three.js): panorama arka planı + panoramanın ışığıyla aydınlanan 3B nesneler.
 *
 * Neden: 2B bindirmelerde figür/efekt "yapıştırma" gibi durur; burada
 *  - panorama hem arka plan hem ortam ışığı (IBL) olur, nesneler aynı ışıkla aydınlanır,
 *  - güneş yönü panoramadan tahmin edilir, gölgeler o yöne düşer ve zemine oturur,
 *  - patlamalar kalıcı krater + tüten duman bırakır, ortamı anlık aydınlatır,
 *  - helikopter ve figürler gerçek 3B modellerdir.
 * Görüntü, duvar başına bir perspektif kamerayla aynı tuvale (viewport/scissor) çizilir; kameralar duvarın
 * gerçek düzlemine göre (genelleştirilmiş perspektif, `duvarKamerasi.ts`) kurulduğundan köşelerde perspektif
 * kırılmaz. Bu tuval 2B tuvalin altındadır; 2B katman (klipler, sis, yağış, HUD) üstüne gelir.
 *
 * Panorama geçişi (`panoramaGecisi.ts`): yeni panorama ekrandakine dokunmadan hazırlanır (işçide çözme, şeritli
 * yükleme, derinliksiz küp, 1024'lük PMREM); eski sahne o sürede canlı çizilir. Bölge sıfırlaması, arazi, kar, ışık ve
 * helikopter iniş noktası takasa ertelenir. Takas tek karede (main.ts örtüyü yakaladıktan hemen sonra `takasYap`); ardından
 * gölgelendiriciler `compileAsync` ile paralel derlenirken çizim beklenir, örtü solar.
 */
import * as THREE from "three";
import { gunesKonumu, ufukSatiri, type Yerlesim } from "../projeksiyon";
import type { CatismaAyarlari, HelikopterDurumu, IzliMermiAyarlari, OrtamAyarlari } from "../tipler";
import { CatismaSistemi, type CatismaSesleri } from "./catisma";
import { atesDokusu, dumanAtlasi, dumanDokusu, kivilcimDokusu, kraterDokusu } from "./dokular";
import { DuvarKamerasi, sisUzakligiAyarla, uzaklikSisiGerekir } from "./duvarKamerasi";
import { FigurKatmani, type FigurPozu, type FigurSecenekleri, type ModelTanimi } from "./figurler3b";
import { panoramadanSahneAzimutu, type GunesTahmini } from "./gunes";
import { HasarKatmani } from "./hasar";
import { Helikopter3B } from "./helikopter3b";
import { rotorTozuTuru } from "./rotorTozu";
import { ParcacikSistemi } from "./parcaciklar";
import { SutreKatmani, type SutreEsyasi } from "./sutre";
import { ARAZI_KALITE, ARAZI_PROFILLERI, AraziKatmani, type AraziModu } from "./arazi";
import { Gokyuzu } from "./gokyuzu";
import { GokOrtusu } from "./gokOrtusu";
import { Yagis3B } from "./yagis3b";
import type { PanoramaAnalizi } from "./panoramaAnalizi";
import type { CozumSecenekleri, CozulmusPanorama } from "./panoramaCozucu";
import { EquirectYukleyici, KupDonusturucu, pmremUret } from "./panoramaDokulari";
import { ADIM_ADLARI, PanoramaGecisi, kupYuzuSec, solmaBaslayabilir, yuklemeGenisligi } from "./panoramaGecisi";
import { cozmeBaslat, type CozmeIsi } from "./panoramaIsi";
import { GOZ_YUKSEKLIGI, ZEMIN_Y, azimutYon, radyan, yerKonumu, yukseklikMesafe, zeminFonksiyonu, zeminY } from "./uzay";
import { aciNormalize, birlikNoktasiSec, noktaSec, yasaktanKacin, type YerlesimPlani, type YerlesimSecimi, type YerlesimTuru } from "./yerlesim";
import { YanginKatmani } from "./yangin";

export type Kalite = "dusuk" | "orta" | "yuksek";
/** Kalite kademeleri: dizüstü/entegre GPU'da "dusuk", sahadaki RTX sınıfı makinede "yuksek". */
export const KALITE_AYARLARI: Record<Kalite, { golgeHaritasi: number; kenarYumusatma: boolean; parcacikCarpani: number }> = {
  dusuk: { golgeHaritasi: 1024, kenarYumusatma: false, parcacikCarpani: 0.5 },
  orta: { golgeHaritasi: 1536, kenarYumusatma: true, parcacikCarpani: 0.75 },
  yuksek: { golgeHaritasi: 2048, kenarYumusatma: true, parcacikCarpani: 1 },
};

/**
 * Askerlerin izleyiciye uzaklığı (m). Eğitimde asker duvarda net ve iri okunmalı (kullanıcı isteği: "çok yakın"):
 * 7 m'de 1,8 m'lik asker 1080p duvarda ~265 px (duvar yüksekliğinin dörtte biri), 4 m'de ~440 px; 20 m'de yalnız ~95 px.
 * Plan noktası daha uzaksa yönü korunur, mesafe kısalır. Tank ve helikopter plandaki mesafede kalır.
 */
export const ASKER_EN_UZAK = 7;
export const ASKER_EN_YAKIN = 4;
/** Asker yerleşiminde istenen yöne bu açı içindeki boş noktalar (asker, sonra figür) önce denenir. */
export const ASKER_YAKIN_TOLERANS = 50;

export interface PanoramaKaynagi {
  url: string;
  yawKaydirma?: number;
  yukseklikKaydirma?: number;
  /** Manifestteki zaman dilimi: gece panoraması ayrıca karartılmaz. */
  zaman?: "gunduz" | "alacakaranlik" | "gece";
  /** Panoramaya özel yerleşim noktaları ve yasak aralıklar. */
  plan?: YerlesimPlani;
  /** Manifestte elle belirlenmiş ışık kaynağı (panorama koordinatı); varsa otomatik tahmin yapılmaz. */
  gunes?: { azimut: number; yukseklik: number; guc?: number };
  /** false: gök maskesi çıkarılmaz (beton tavan gibi gök sanılan üst yüzey); bulut çizilmez, sis ve tonlama kalır. */
  gok?: boolean;
}

/** Manifestteki elle girilmiş güneş/ay → tahmin biçimi (yükseklik doğrulanmış sayılır). */
function elleGunes(g: { azimut: number; yukseklik: number; guc?: number }): GunesTahmini {
  return { azimut: g.azimut, yukseklik: Math.max(0, Math.min(89, g.yukseklik)), guc: Math.max(0, Math.min(1, g.guc ?? 0.9)), yukseklikGuvenilir: true };
}

/** Aynı dosyada takas gerektiren alanlar (yaw, ufuk, zaman, güneş, plan). */
function kaynakImzasi(k: PanoramaKaynagi): string {
  return JSON.stringify([k.yawKaydirma ?? 0, k.yukseklikKaydirma ?? 0, k.zaman ?? null, k.gunes ?? null, k.plan ?? null, k.gok ?? true]);
}
function dosyaAdi(url: string): string {
  return url.split("/").slice(-2).join("/");
}
/** Zemin kar örtüsü (arazi): kışın tam, sonbaharda serpinti. */
function karDegeri(mevsim: string): number {
  return mevsim === "kis" ? 1 : mevsim === "sonbahar" ? 0.12 : 0;
}

/** Bir panoramanın hazırlık ve ekran kaynakları (nesil başına; ekrandan kalkınca ya da iptalde bırakılır). */
interface PanoramaVerisi {
  no: number;
  isi: CozmeIsi | null;
  cozum: CozulmusPanorama | null;
  yukleyici: EquirectYukleyici | null;
  /** Arka plan küpü (derinliksiz) ve ortam ışığı (PMREM hedefi; dokusu değil hedefin kendisi bırakılır). */
  kup: THREE.WebGLCubeRenderTarget | null;
  pmrem: THREE.WebGLRenderTarget | null;
  analiz: PanoramaAnalizi | null;
  /** Gök maskesinin dokusu (takasta maskeden kurulur, bırakılırken atılır). */
  gokDokusu: THREE.DataTexture | null;
  /** performance.now: istek ve adım bitişleri (ölçüm). */
  zaman: { istek: number; cozum?: number; yukleme?: number; kup?: number; pmrem?: number; takas?: number; ilkKare?: number };
  isciSureleri: CozulmusPanorama["sureler"] | null;
  seritSayisi: number;
  boyut: [number, number];
  kupYuzu: number;
  birakildi: boolean;
}

interface AraziIstegi {
  mod: AraziModu;
  bolge: string;
  mevsim: string;
  kok: string;
}

/** Son tamamlanan geçişin ölçümü (ms, istekten itibaren); HUD ve ölçüm betikleri (`window.duvar.sahne3b.sonGecis`). */
export interface GecisOlcumu {
  dosya: string;
  cozum: number;
  yukleme: number;
  kup: number;
  pmrem: number;
  takas: number;
  ilkKare: number;
  solma: number;
  isci: CozulmusPanorama["sureler"] | null;
  serit: number;
  boyut: [number, number];
  kupYuzu: number;
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
  private kameralar: DuvarKamerasi[] = [];
  private yerlesimler: Yerlesim[] = [];
  private W = 0;
  private H = 0;
  private readonly gunes = new THREE.DirectionalLight(0xffffff, 2);
  private readonly dolgu = new THREE.HemisphereLight(0xcfd8e6, 0x6b5a45, 0.15);
  private readonly flas = new THREE.PointLight(0xffd9a0, 0, 80, 2);
  private flasGuc = 0;
  /** Tek PMREM üreteci (panorama ve tam kipte gökyüzü): gölgelendiricileri bir kez derlenir, ping-pong hedefi paylaşılır. */
  private pmrem: THREE.PMREMGenerator | null = null;
  /** Ekrandaki panoramanın kaynağı; takasa kadar eskisi kalır (noktaSec, patlama yeri, ufukY görüntüyle tutarlı olsun). */
  private kaynak: PanoramaKaynagi | null = null;
  private _gecis: PanoramaGecisi<PanoramaKaynagi, PanoramaVerisi> | undefined;
  private readonly kupDonusturucu = new KupDonusturucu();
  /** Çözme işi başlatıcı (varsayılan işçi; testte sahte). */
  cozucu: ((url: string, secenek: CozumSecenekleri) => CozmeIsi) | undefined;
  /** Equirect yüklemesinde GPU'da aynı anda bitmemiş en çok şerit (ölçüm için konsoldan ayarlanabilir). */
  seritUcusta = 2;
  /** Takasa ertelenenler: arazi isteği (bölge/kip/mevsim), bölge sıfırlaması, ışık. */
  private bekleyenArazi: AraziIstegi | null = null;
  private bekleyenSifirla = false;
  private isikBekliyor = false;
  /** Takastan sonra gölgelendiriciler paralel derlenirken çizim beklenir (örtü önceki kareyi gösterir); en çok 4 sn. */
  private derlemeBekleniyor = false;
  private derlemeNo = 0;
  private derlemeSiniri = 0;
  private takasZamani = 0;
  private takastanSonraCizim = 0;
  /** Son takasta arazi yeniden kuruldu: dokuları gelene dek (en çok 1,2 sn) solma beklenir. */
  private araziBekleniyor = false;
  private dokuHazirCizim = 0;
  private uygulananKar = -1;
  /** Bu karede 3B gerçekten çizildi (örtü ancak taze kareden yakalanır). */
  buKareCizildi = false;
  /** İlk patlamada derleme takılmasın: krater/moloz malzemelerinin gizli kopyaları (programları canlı tutar). */
  private onDerleme: THREE.Group | null = null;
  private onDerlemeKare = 0;
  /** Son tamamlanan geçiş (ölçüm). */
  sonGecis: GecisOlcumu | null = null;
  private olculen: { veri: PanoramaVerisi; dosya: string } | null = null;
  /** Tek sis nesnesi: her ışık güncellemesinde yenisi atanınca tüm sisli malzemelerde program yeniden değerlendiriliyordu. */
  private readonly sis = new THREE.Fog(0xc7ccd1, 100, 1000);
  /** Takas öncesi ön derleme için ışıksız sınama sahnesi (yeni ortam + hedef sis; ışıklar sahneden toplanır). */
  private probSahne: THREE.Scene | null = null;
  private readonly ufukRengiGecici = new THREE.Color();
  private gunesTahmini: GunesTahmini | null = null;
  /** true: güneş manifestten (elle), false: panoramadan otomatik tahmin. */
  private gunesElle = false;
  private saat = 12;
  private isik = 1;
  private readonly parcaciklar: ParcacikSistemi;
  /** Kalıcı yangınlar (efekt `yangin` / `yangin_sondur`). */
  private readonly yanginlar: YanginKatmani;
  private readonly hasar: HasarKatmani;
  private readonly figurler = new FigurKatmani();
  private readonly heli: Helikopter3B;
  /** Panelin helikopter iniş yönü (sahne azimutu): helikopterAyarla'dan; gelmeden önce panelin varsayılanı 12°. */
  private heliYonu = 12;
  private readonly catisma: CatismaSistemi;
  private readonly sutre = new SutreKatmani();
  private catismaSesleri: CatismaSesleri = { carpma: () => undefined, atis: () => undefined };
  private yagisKararma = 1;
  /** 3B arazi (hibrit / tam) ve tam kipte prosedürel gökyüzü. */
  readonly arazi = new AraziKatmani();
  private readonly gokyuzu = new Gokyuzu();
  private readonly gokOrtusu = new GokOrtusu();
  private readonly yagis3b: Yagis3B;
  private golgeZemini: THREE.Mesh | null = null;
  private araziBolge = "";
  private sonBulut = 0.2;
  /** Ortamın son hava değerleri (gök örtüsü ve sis; ortamAyarla). */
  private sonSis = 0;
  private sonYagis: OrtamAyarlari["yagis"] = "yok";
  private ruzgarSiddeti = 0.2;
  private ruzgarYonu = 0;
  private readonly sisRengi = new THREE.Color();
  /** Şimşek: darbe zamanları (sn, sahne saatine göre) ve ışık tabanı (isikGuncelle'nin bıraktığı değerler). */
  private simsekDarbeleri: Array<{ t: number; guc: number }> = [];
  private sahneSaati = 0;
  private isikTabani = { dolgu: 0, ortam: 1 };
  private gunesIsareti: THREE.Mesh | null = null;
  /** Ekranda bir panorama var (ilk takastan sonra; geçişler sırasında da açık kalır). */
  hazir = false;
  hata = "";

  /** Kalite kademesi (`?kalite=`): gölge haritası, kenar yumuşatma ve parçacık kapasitesi. */
  readonly kalite: Kalite;
  /** Uyarı kanalı (model yüklenemedi vb.); main.ts köprü günlüğüne iletir. */
  uyari: ((mesaj: string) => void) | null = null;

  constructor(tuval: HTMLCanvasElement, hataAyiklama = false, kalite: Kalite = "yuksek") {
    this.kalite = kalite;
    this.yagis3b = new Yagis3B(kalite);
    const k = KALITE_AYARLARI[kalite];
    let r: THREE.WebGLRenderer | null = null;
    try {
      r = new THREE.WebGLRenderer({ canvas: tuval, antialias: k.kenarYumusatma, alpha: false, powerPreference: "high-performance", preserveDrawingBuffer: false });
    } catch (h) {
      this.hata = h instanceof Error ? h.message : String(h);
    }
    this.destekli = r !== null;
    this.parcaciklar = new ParcacikSistemi(dumanDokusu(128, 1), atesDokusu(128, 7), kivilcimDokusu(32), k.parcacikCarpani);
    this.hasar = new HasarKatmani([kraterDokusu(256, 3), kraterDokusu(256, 9), kraterDokusu(256, 21)], this.parcaciklar, Math.round(320 * k.parcacikCarpani));
    this.yanginlar = new YanginKatmani(this.parcaciklar);
    this.heli = new Helikopter3B(this.parcaciklar);
    // Ses geri çağrıları sahne azimutuyla (derece, AzimutDerece): pan değil, ses motoru yerleştirir
    this.catisma = new CatismaSistemi(this.parcaciklar, {
      carpma: (azimut) => this.catismaSesleri.carpma(azimut),
      atis: (azimut, uzak) => this.catismaSesleri.atis(azimut, uzak),
      uzakPatlama: (azimut) => {
        this.patlama(azimut, 0.7, true, false);
        this.catismaSesleri.uzakPatlama?.(azimut);
      },
      topAtisi: (azimut) => this.catismaSesleri.topAtisi?.(azimut),
    });
    this.catisma.dostlar = () => this.figurler.silahliKonumlar();
    this.figurler.engel = (p) => this.sutre.doluMu(p, 0.3);
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
    this.gunes.shadow.mapSize.set(k.golgeHaritasi, k.golgeHaritasi);
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
    this.sahne.add(this.gunes, this.gunes.target, this.dolgu, this.flas, this.yanginlar.grup);

    // Zemin: yalnızca gölge alır (panoramanın zemini görünür kalır)
    const zemin = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.ShadowMaterial({ opacity: 0.55, transparent: true }));
    zemin.rotation.x = -Math.PI / 2;
    zemin.position.y = ZEMIN_Y;
    zemin.receiveShadow = true;
    zemin.renderOrder = 1;
    this.sahne.add(zemin);
    this.golgeZemini = zemin;
    this.gokyuzu.baglan(r, this.pmrem);

    this.sahne.add(this.gokOrtusu.kutu, this.yagis3b.grup);
    this.sahne.add(this.arazi.grup, this.hasar.grup, this.figurler.grup, this.heli.grup, this.catisma.grup, this.sutre.grup, this.parcaciklar.grup);

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
    return `güneş: ${this.gunesElle ? "manifest" : "panoramadan"} az ${g.azimut.toFixed(0)}° yük ${g.yukseklikGuvenilir ? `${g.yukseklik.toFixed(0)}°` : "saatten"} güç ${g.guc.toFixed(2)}`;
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
    // Duman: dört Kenney topağı tek 2×2 atlasta (parçacık başına farklı kare → tekrar eden tek şekil yok).
    // Doku DOĞRUSAL veri (NoColorSpace): parçacık gölgelendiricisi çıkışı sRGB'ye çevirmez; sRGB işaretli gri
    // (0,46) doku örneklenince 0,18'e düşüyor, bütün duman çamur gibi koyu çıkıyordu (4 Kasım).
    const dogrusal = (t: THREE.Texture) => {
      t.colorSpace = THREE.NoColorSpace;
      t.needsUpdate = true;
      return t;
    };
    Promise.all(["smoke_01", "smoke_03", "smoke_05", "smoke_07"].map((ad) => yukle(`dokular/${ad}.png`)))
      .then((dokular) => this.parcaciklar.duman.dokuAyarla(dumanAtlasi(dokular.map(dogrusal)), true))
      .catch(() => yukle("dokular/smoke_05.png").then((t) => this.parcaciklar.duman.dokuAyarla(dogrusal(t))).catch(() => undefined));
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
  /**
   * Yeni resim panorama hazırlanıyor (saat/mevsim/bölge değişti). Eski sahne bu sürede çizilmeye devam eder (`hazir` açık
   * kalır); ilk açılışta da 3B helikopter uçmayı sürdürür (main.ts 2B siluete geçirmez). İniş noktası takasta yeni plandan
   * seçilir: helikopter havadaysa yeni noktaya göre pas geçer ya da rotasını kurar, baştan başlamaz.
   */
  get panoramaYukleniyor() {
    return this.gecis.yukleniyor;
  }
  /** Geçiş durum makinesi (testte kurucusuz oluşturulan nesnede de ilk kullanımda kurulur). */
  private get gecis(): PanoramaGecisi<PanoramaKaynagi, PanoramaVerisi> {
    return (this._gecis ??= new PanoramaGecisi<PanoramaKaynagi, PanoramaVerisi>({
      baslat: (k, no) => this.hazirlikBaslat(k, no),
      birak: (v) => this.verilerBirak(v),
      imza: kaynakImzasi,
    }));
  }
  /** Takas bu karede yapılabilir (main.ts: örtüyü yakala, sonra `takasYap`). */
  get takasHazir(): boolean {
    return this.renderer !== null && this.gecis.takasHazir;
  }
  /** Hiç panorama gösterilmedi, ilki hazırlanıyor: ekran siyah (yer tutucu çizilmez). */
  get ilkPanoramaBekleniyor(): boolean {
    return this.gecis.ilkBekleniyor;
  }
  /** Bölge değişti, yeni bölgenin sahnesi takasta kurulacak: yeni figür ve patlamalar main.ts'te takasa dek bekler. */
  get bolgeGecisiBekliyor(): boolean {
    return this.bekleyenSifirla;
  }
  /** HUD ve önizleme için geçiş durumu. */
  get gecisBilgisi(): string {
    const h = this._gecis?.hazirlik;
    if (h) return `geçiş: ${ADIM_ADLARI[h.adim]} ${dosyaAdi(h.kaynak.url)} ${((performance.now() - h.veri.zaman.istek) / 1000).toFixed(1)} sn`;
    const s = this.sonGecis;
    return s ? `son geçiş ${(s.solma / 1000).toFixed(1)} sn (${dosyaAdi(s.dosya)})` : "geçiş yok";
  }
  get helikopterTozu() {
    return this.heli.tozSiddeti;
  }
  /** 2B katman için ufuk çizgisi (piksel, üstten). */
  get ufukY() {
    // İzdüşüm sınırlarından göz hizası satırı (ölçüsüz yerleşimde H/2) + panoramanın yukseklikKaydirma'sı.
    // Odanın tüm duvarlarında görüntü yüksekliği ve alt kenarı aynı → satır duvarlar arasında ortak.
    const k = this.kaynak?.yukseklikKaydirma ?? 0;
    const orta = this.yerlesimler[Math.floor(this.yerlesimler.length / 2)];
    return orta ? ufukSatiri(orta, k) : (this.H * (1 + k)) / 2;
  }

  boyutlandir(W: number, H: number, yerlesimler: Yerlesim[]) {
    this.W = W;
    this.H = H;
    this.yerlesimler = yerlesimler;
    this.renderer?.setSize(W, H, false);
    this.yagis3b.boyutlandir(H);
    this.kameralar = yerlesimler.map(() => new DuvarKamerasi(0.1, 3000));
    // Ölçülmüş odada sis gerçek uzaklıkla (kaymış izleyicide köşede kırılmaz); ilk çizimden önce (duvarKamerasi.ts)
    sisUzakligiAyarla(uzaklikSisiGerekir(yerlesimler));
    this.kameralariYonlendir();
  }

  /** Duvar kameraları: duvar düzlemi + simetrik olmayan kesik piramit; `yukseklikKaydirma` ek eğim. */
  private kameralariYonlendir() {
    const k = this.kaynak?.yukseklikKaydirma ?? 0;
    this.kameralar.forEach((kam, i) => kam.duvaraAyarla(this.yerlesimler[i].izdusum, k));
  }

  /**
   * Panorama isteği (equirect resim). Ekrandaki panorama yenisi tamamen hazır olana dek kalır: hazırlık arka planda yürür
   * (`hazirlikAdimi`), takası main.ts örtüyü yakaladıktan sonra `takasYap` ile yapar. `yedekler`: dosya yüklenemezse
   * sırayla denenecek en yakın panoramalar (video.ts panoramaAdaylari). null: bu bölgede panorama yok → ekrandaki kalır
   * (hiç gösterilmediyse main.ts yer tutucu çizer).
   */
  panoramaAyarla(kaynak: PanoramaKaynagi | null, yedekler: PanoramaKaynagi[] = []) {
    if (!this.renderer) return;
    if (this.gecis.iste(kaynak, yedekler) === "hatali" && kaynak && !this.gecis.etkin) this.hata = `panorama yüklenemedi: ${kaynak.url}`;
  }

  /** 3B katmanı kapat (video panorama 2B yolda): takasta panorama kalkar, örtü 2B görüntüye solar. */
  panoramaKapat() {
    if (this.renderer) this.gecis.kapat();
  }

  /** Yeni hazırlık: dosya işçide çözülür (indirme, çözme, küçültme, analiz); GPU adımları sonra karelere yayılır. */
  private hazirlikBaslat(k: PanoramaKaynagi, no: number): PanoramaVerisi {
    const v: PanoramaVerisi = { no, isi: null, cozum: null, yukleyici: null, kup: null, pmrem: null, analiz: null, gokDokusu: null, zaman: { istek: performance.now() }, isciSureleri: null, seritSayisi: 0, boyut: [0, 0], kupYuzu: 0, birakildi: false };
    const isi = (this.cozucu ?? cozmeBaslat)(k.url, { enGenis: yuklemeGenisligi(this.kalite), gokGenisligi: k.gok === false ? 0 : this.kalite === "dusuk" ? 1024 : 2048 });
    v.isi = isi;
    isi.sonuc.then(
      (s) => {
        const h = this.gecis.hazirlik;
        if (v.birakildi || !h || h.no !== no) {
          s.tam.close();
          s.kucuk.close();
          return;
        }
        v.cozum = s;
        v.analiz = s.analiz;
        // Maske dokusu şimdi (CPU nesnesi; GPU'ya ilk çizimde gider): çözüm GPU'ya yüklenince bırakılır
        v.gokDokusu = s.gok ? GokOrtusu.maskeDokusu(s.gok) : null;
        v.isciSureleri = s.sureler;
        v.boyut = [s.tam.width, s.tam.height];
        v.zaman.cozum = performance.now();
        h.adim = "yukle";
      },
      (hata: unknown) => {
        if (v.birakildi || !this.gecis.gecerli(no)) return;
        const sonraki = this.gecis.dustu(no);
        const neden = hata instanceof Error ? hata.message : String(hata);
        this.hata = `panorama yüklenemedi: ${k.url} (${neden})`;
        this.uyari?.(`Panorama yüklenemedi: ${dosyaAdi(k.url)} (${neden})${sonraki ? ` → yedek: ${dosyaAdi(sonraki.url)}` : this.gecis.etkin ? "; ekrandaki panorama kalıyor" : ""}`);
      },
    );
    return v;
  }

  /**
   * Hazırlığın GPU adımları, karede en çok bir adım (guncelle'den): equirect şeritleri (önceki şerit GPU'da bitmeden
   * yenisi gönderilmez) → derinliksiz küp (yüz kaliteye göre) → 1024'lük kopyadan PMREM → hazır. Ekrandaki sahneye
   * dokunulmaz; kaynaklar hazırlık nesnesinde tutulur, iptalde bırakılır.
   */
  private hazirlikAdimi() {
    const h = this._gecis?.hazirlik;
    const r = this.renderer;
    if (!h || !r || !this.pmrem) return;
    const v = h.veri;
    if (h.adim === "yukle") {
      if (!v.yukleyici) {
        if (!v.cozum) return;
        v.yukleyici = new EquirectYukleyici(r, v.cozum.tam, this.seritUcusta);
        return;
      }
      if (!v.yukleyici.adim()) return;
      v.seritSayisi = v.yukleyici.seritSayisi;
      v.zaman.yukleme = performance.now();
      h.adim = "kup";
    } else if (h.adim === "kup" && v.yukleyici) {
      v.kupYuzu = kupYuzuSec(this.kalite, v.yukleyici.yukseklik);
      v.kup = this.kupDonusturucu.donustur(r, v.yukleyici.doku, v.kupYuzu);
      v.yukleyici.birak();
      v.yukleyici = null;
      v.zaman.kup = performance.now();
      h.adim = "pmrem";
    } else if (h.adim === "pmrem" && v.cozum) {
      v.pmrem = pmremUret(this.pmrem, v.cozum.kucuk);
      v.cozum.kucuk.close();
      v.cozum = null;
      v.zaman.pmrem = performance.now();
      h.adim = "derle";
      this.onDerle(h.no, v);
    }
  }

  /**
   * Takastan önce: sahnedeki malzemeler yeni ortam (PMREM) ve hedef sis durumuyla bir sınama sahnesi üzerinden
   * `compileAsync`e verilir; değişen program çeşitleri (ilk panorama, sisli ↔ sissiz bölge) eski sahne çizilirken paralel
   * derlenmeye başlar (KHR_parallel_shader_compile). Eski sahne bu arada çizildiğinden three'nin "hazır" denetimi erken
   * dönebilir; asıl bekleme takastan sonraki `derlemeyiBaslat`ta (çizim tutulurken). En çok 2 sn beklenir.
   */
  private onDerle(no: number, v: PanoramaVerisi) {
    const r = this.renderer;
    const kamera = this.kameralar[Math.floor(this.kameralar.length / 2)];
    const ilerle = () => {
      const h = this._gecis?.hazirlik;
      if (h && h.no === no && h.adim === "derle") h.adim = "hazir";
    };
    if (!r || !kamera || typeof r.compileAsync !== "function" || !v.pmrem) {
      ilerle();
      return;
    }
    const prob = (this.probSahne ??= new THREE.Scene());
    const hedefMod = this.bekleyenArazi?.mod ?? this.arazi.mod;
    prob.environment = hedefMod === "tam" ? this.sahne.environment : v.pmrem.texture;
    // Sis her kipte açık (kapalı kipte de, sis 0 iken etkisiz uzaklıkla): sis ayarı programları yeniden derletmez
    prob.fog = this.sis;
    const sinir = setTimeout(ilerle, 2000);
    r.compileAsync(this.sahne, kamera, prob).then(
      () => {
        clearTimeout(sinir);
        ilerle();
      },
      () => {
        clearTimeout(sinir);
        ilerle();
      },
    );
    prob.environment = null;
  }

  /** Hazırlık iptal edildi ya da panorama ekrandan kalktı: işçi durur, bitmapler kapanır, GPU hedefleri bırakılır. */
  private verilerBirak(v: PanoramaVerisi) {
    if (v.birakildi) return;
    v.birakildi = true;
    v.isi?.iptal();
    if (v.cozum) {
      v.cozum.tam.close();
      v.cozum.kucuk.close();
      v.cozum = null;
    }
    v.yukleyici?.birak();
    v.yukleyici = null;
    v.kup?.dispose();
    v.kup = null;
    // PMREM'in kendi hedefi: yalnız `.texture.dispose()` GPU belleğini bırakmıyordu (8K'da her geçişte +384 MiB)
    v.pmrem?.dispose();
    v.pmrem = null;
    v.gokDokusu?.dispose();
    v.gokDokusu = null;
  }

  /**
   * Takas (main.ts, örtü yakalandıktan hemen sonra, aynı karede): yeni panorama (ya da aynı dosyanın yeni alanları)
   * ekrana gelir; ertelenen bölge sıfırlaması, arazi, kar, yön, helikopter iniş noktası ve ışık uygulanır; eskinin GPU
   * kaynakları bırakılır. Sonra gölgelendiriciler paralel derlenir (`ciz` o sürede çizmez, örtü eski kareyi gösterir).
   */
  takasYap(simdi = performance.now()) {
    const t = this.gecis.takas();
    if (t.yeni) {
      const v = t.yeni.veri;
      v.zaman.takas = performance.now();
      this.kaynak = t.yeni.kaynak;
      this.gunesElle = Boolean(this.kaynak.gunes);
      this.gunesTahmini = this.kaynak.gunes ? elleGunes(this.kaynak.gunes) : (v.analiz?.gunes ?? null);
      this.hata = "";
      this.olculen = { veri: v, dosya: t.yeni.kaynak.url };
    } else if (t.meta) {
      this.kaynak = t.meta;
      this.gunesElle = Boolean(t.meta.gunes);
      this.gunesTahmini = t.meta.gunes ? elleGunes(t.meta.gunes) : (this.gecis.etkin?.veri.analiz?.gunes ?? null);
    } else if (t.kapandi) {
      this.kaynak = null;
      this.gunesTahmini = null;
      this.gunesElle = false;
    }
    this.arkaPlaniUygula();
    if (this.bekleyenSifirla) {
      this.bekleyenSifirla = false;
      this.sahneyiSifirla();
    }
    const arazi = this.bekleyenArazi;
    this.bekleyenArazi = null;
    let araziKuruldu = false;
    if (arazi) araziKuruldu = this.araziUygula(arazi, this.kaynak);
    else if ((t.yeni || t.meta) && this.arazi.koridorlariAyarla(this.planKoridorlari())) {
      // Aynı bölgede yeni plan: görüş koridorları yerinde güncellendi, nesneler yeni zemine
      this.figurler.zemineOturt();
      this.sutre.zemineOturt();
    }
    this.yonelimUygula();
    // İniş noktası yeni plandan, panelin son yönüyle (havadaki helikopter pas geçer ya da rotasını kurar)
    this.heliInisiniSec();
    this.isikBekliyor = false;
    this.isikGuncelle();
    this.hazir = this.gecis.etkin !== null;
    if (t.eski) this.verilerBirak(t.eski.veri);
    this.takasZamani = simdi;
    this.takastanSonraCizim = 0;
    this.araziBekleniyor = araziKuruldu && this.arazi.aktif;
    this.dokuHazirCizim = 0;
    if (this.hazir) {
      this.onDerlemeKur();
      this.derlemeyiBaslat();
    }
  }

  /** Arka plan küpü ve ortam ışığı ekrandaki panoramadan (tam kipte gök ve IBL gokyuzu.ts'ten, isikGuncelle). */
  private arkaPlaniUygula() {
    if (this.arazi.mod === "tam") return;
    const v = this.gecis.etkin?.veri;
    // Arka plan three'nin kutusu yerine gök örtüsünde (aynı küp; bulut, sis, şimşek onun içinde)
    this.sahne.background = null;
    this.gokOrtusu.ayarla(v?.kup?.texture ?? null, v?.gokDokusu ?? null);
    this.sahne.environment = v?.pmrem?.texture ?? null;
  }

  /**
   * Gölgelendiricileri paralel derler (KHR_parallel_shader_compile; yeni arazi malzemeleri, sis/ortam değişimi, ilk
   * takasta her şey). Bitene dek `ciz` çizmez: çizim yarım derlenmiş programda ana iş parçacığını bekletirdi. En çok 4 sn.
   */
  private derlemeyiBaslat() {
    const r = this.renderer;
    const kamera = this.kameralar[Math.floor(this.kameralar.length / 2)];
    if (!r || !kamera || typeof r.compileAsync !== "function") return;
    const no = ++this.derlemeNo;
    this.derlemeBekleniyor = true;
    this.derlemeSiniri = performance.now() + 4000;
    const bitti = () => {
      if (this.derlemeNo === no) this.derlemeBekleniyor = false;
    };
    r.compileAsync(this.sahne, kamera).then(bitti, bitti);
  }

  /**
   * İlk takastan sonra bir kez: patlamada ilk kez görünen malzemelerin (moloz: örneklenmiş standart, gölge düşürür;
   * krater çıkartması: dokulu saydam standart) gizli kopyaları sahneye eklenir. Takastaki `compileAsync` bunları da
   * derler (her sis/ortam durumu için) ve kopyalar yaşadıkça programlar silinmez (three, son malzeme gidince programı
   * siler). Moloz ilk iki çizimde izleyicinin altında görünür kalır: gölge geçişinin derinlik programı da derlensin
   * (duvar kameraları dik aşağıyı görmez; gölgesi zeminin altına düşer). İlk patlama bu sayede takılmaz (eskiden 1,28 sn).
   */
  private onDerlemeKur() {
    if (this.onDerleme) return;
    const g = new THREE.Group();
    g.name = "onDerleme";
    g.position.set(0, ZEMIN_Y - 3, 0);
    const moloz = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x6e5a42, roughness: 1, metalness: 0 }), 1);
    moloz.setMatrixAt(0, new THREE.Matrix4().makeScale(0.05, 0.05, 0.05));
    moloz.castShadow = true;
    moloz.receiveShadow = true;
    const beyaz = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    beyaz.colorSpace = THREE.SRGBColorSpace;
    beyaz.needsUpdate = true;
    const krater = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ map: beyaz, transparent: true, roughness: 1, metalness: 0, depthWrite: false }));
    krater.receiveShadow = true;
    krater.visible = false;
    g.add(moloz, krater);
    this.sahne.add(g);
    this.onDerleme = g;
    this.onDerlemeKare = 2;
  }

  /**
   * Örtü solmaya başlayabilir mi (main.ts her karede): yeni sahne çizildi, derleme bitti, bölge değiştiyse arazi dokuları
   * geldi (en çok 1,2 sn). 3B katman kapandıysa (video panorama) hemen.
   */
  solmaHazir(simdi: number): boolean {
    if (!this.hazir) return true;
    return solmaBaslayabilir(this.takastanSonraCizim, this.derlemeBekleniyor, this.araziBekleniyor, this.dokuHazirCizim > 0, simdi - this.takasZamani);
  }

  /** Solma başladı (main.ts): geçiş ölçümü kaydedilir; 2 sn'yi aşan geçiş köprü günlüğüne adım süreleriyle yazılır. */
  solmaBasladi(_simdi: number) {
    this.araziBekleniyor = false;
    const o = this.olculen;
    this.olculen = null;
    if (!o) return;
    // Adım zamanları performance.now() ile (rAF zaman damgası karenin başı, karışırsa süreler eksiye düşer)
    const simdi = performance.now();
    const z = o.veri.zaman;
    const ms = (t: number | undefined) => Math.round((t ?? simdi) - z.istek);
    this.sonGecis = {
      dosya: o.dosya,
      cozum: ms(z.cozum),
      yukleme: ms(z.yukleme),
      kup: ms(z.kup),
      pmrem: ms(z.pmrem),
      takas: ms(z.takas),
      ilkKare: ms(z.ilkKare),
      solma: ms(simdi),
      isci: o.veri.isciSureleri,
      serit: o.veri.seritSayisi,
      boyut: o.veri.boyut,
      kupYuzu: o.veri.kupYuzu,
    };
    const s = this.sonGecis;
    if (s.solma > 2000) {
      const i = s.isci;
      const sn = (v: number) => (v / 1000).toFixed(1);
      this.uyari?.(
        `Panorama geçişi ${sn(s.solma)} sn (${dosyaAdi(s.dosya)}): işçi ${sn(s.cozum)}${i ? ` (indirme ${sn(i.indirme)}, çözme ${sn(i.cozme)}, küçültme ${sn(i.kucultme)}, analiz ${sn(i.analiz)})` : ""} · yükleme ${sn(s.yukleme - s.cozum)} (${s.serit} şerit) · küp ${sn(s.kup - s.yukleme)} · ışık ${sn(s.pmrem - s.kup)} · takas beklemesi ${sn(s.takas - s.pmrem)} · derleme + ilk kare ${sn(s.ilkKare - s.takas)} · doku beklemesi ${sn(s.solma - s.ilkKare)}`,
      );
    }
  }

  /** Ekrandaki panoramanın analizi (işçide bir kez: ufuk rengi, parlaklık, güneş). */
  private get analiz(): PanoramaAnalizi | null {
    return this._gecis?.etkin?.veri.analiz ?? null;
  }

  /** Panoramanın ufuk bandının ortalama rengi (doğrusal; hibrit kipte arazi kenarının sisi). Analiz yoksa açık gri. */
  private ufukRengi(): THREE.Color {
    const u = this.analiz?.ufuk;
    return u ? this.ufukRengiGecici.setRGB(u[0], u[1], u[2]).convertSRGBToLinear() : this.ufukRengiGecici.setRGB(0.78, 0.8, 0.82).convertSRGBToLinear();
  }

  /**
   * Panoramanın doğrusal parlaklığı: zemin bandı (ufkun 8–35° altı) ve gök (ufkun 10–60° üstü) ortalaması.
   * Gece panoramasında 3B ışık bu ölçüye eşlenir (bkz. isikGuncelle); analiz yoksa null (sabit gece sınırları).
   */
  private panoramaParlakligi(): { zemin: number; gok: number } | null {
    return this.analiz?.parlaklik ?? null;
  }

  private yonelimUygula() {
    const yaw = radyan(UC_YAW_TABANI + (this.kaynak?.yawKaydirma ?? 0));
    this.sahne.backgroundRotation.set(0, yaw, 0);
    this.gokOrtusu.donusAyarla(this.sahne.backgroundRotation);
    this.sahne.environmentRotation.set(0, yaw, 0);
    this.kameralariYonlendir();
  }

  /**
   * Bölge değişti ya da sahne sıfırlandı: hasar (krater çıkartması, moloz, tüten duman), parçacıklar, uçuştaki izler ve
   * top mermileri, patlamanın anlık ışığı temizlenir (figürler panelden; sahne sıfırlamasında temeleDondur). Arazi
   * kraterleri (çukur, yanık izi, silinen çimen ve bitki) yerinde geri alınır (`AraziKatmani.kraterleriTemizle`, birkaç
   * ms; ızgara yeniden kurulmaz, dokular yeniden yüklenmez); zemin değiştiyse figür ve sütre ona oturur. `araziBolge`ye
   * dokunulmaz: sıfırlama bir sonraki durum mesajında arazinin yeniden kurulmasını (ve takaslı geçişi) tetiklemez.
   * Bölge değişiminin takasında da buradan geçilir; arazi ardından yeni bölgeyle kurulur.
   */
  sahneyiSifirla() {
    this.hasar.temizle();
    this.parcaciklar.temizle();
    this.catisma.temizle();
    this.flasGuc = 0;
    this.flas.intensity = 0;
    if (this.arazi.kraterleriTemizle()) {
      this.figurler.zemineOturt();
      this.sutre.zemineOturt();
    }
  }

  /**
   * Sahne sıfırlaması (köprünün `sahne/sifirla` mesajı, bkz. main.ts sahneyiTemizle): figürler (yüklenmekte olanlar ve
   * hedef bekleyen "yanında" figürler dahil) + sahneyiSifirla, ekrandaki sahnede hemen. Çatışma, izli mermi ve
   * helikopterin açık/kapalı oluşu köprünün durum yayınından gelir; burada dokunulmaz. Sütre (Oda 2 güvenli alanı) kalır.
   *
   * Panorama geçişi sürerken de böyle: süren hazırlık (gelen panorama) bırakılmaz, bölge geçişinin ertelenen işleri
   * (`bekleyenSifirla`, `bekleyenArazi`) yerinde kalır; takas yeni bölgenin sahnesini yine kurar ve sahneyiSifirla'yı bir
   * kez daha çalıştırır (sıfırlamayı geri almaz: sıfırlamadan sonra gelen figür/efektler main.ts kuyruğunda takası
   * bekler, öncekileri sahneyiTemizle kuyruktan siler). Örtüdeki eski kare için bkz. gecis.ts `sahneTemizlendi`.
   */
  temeleDondur() {
    this.figurler.temizle();
    this.yanginlar?.temizle(); // testler Sahne3B'yi kısmi kurar
    this.sahneyiSifirla();
  }

  /** Seçilen yöndeki patlama noktasında kalıcı yangın (alev, kor, kara duman, titreyen ışık). */
  yangin(azimut: number, siddet: number) {
    const s = Math.max(0.1, Math.min(1, siddet));
    const secim = this.patlamaYeri(azimut, 24 - 10 * s);
    const p = yerKonumu(secim.azimut, secim.mesafe);
    if (this.arazi.aktif) p.y = zeminY(p.x, p.z);
    this.yanginlar.ekle(p, s);
  }

  yanginSondur() {
    this.yanginlar.sondur();
  }

  get yanginSayisi() {
    return this.yanginlar.sayi;
  }

  ortamAyarla(ortam: OrtamAyarlari, isik: number) {
    this.saat = ortam.saat;
    this.isik = isik;
    this.sonBulut = ortam.bulut;
    this.sonSis = ortam.sis;
    this.sonYagis = ortam.yagis;
    this.ruzgarSiddeti = ortam.ruzgarSiddeti;
    this.ruzgarYonu = ortam.ruzgarYonu;
    this.yagis3b.ayarla(ortam);
    // Güneşli panoramada yağmur/kar: sahneyi kıs, güneşi yumuşat (yağışlı panorama yoksa inandırıcılık için)
    this.yagisKararma = ortam.yagis === "siddetli_yagmur" ? 0.62 : ortam.yagis === "hafif_yagmur" ? 0.8 : ortam.yagis === "kar" ? 0.85 : 1;
    this.yagisKararma *= 1 - ortam.bulut * 0.18;
    // Yeni panorama hazırlanırken (ya da takas beklerken) ekrandaki görüntü değişmesin: gündüz panoraması gece saatinde
    // önce kararıp sonra geçmesin. Değerler saklanır; takasta ya da hazırlık iptal olunca uygulanır (guncelle).
    if (this.gecis.etkin && this.gecis.bekliyor) {
      this.isikBekliyor = true;
      return;
    }
    this.isikGuncelle();
  }

  /**
   * Bölge değişti (main.ts, durum mesajında): eski bölgenin hasarı ve parçacıkları takasta silinir (ekranda eski bölge
   * dururken kraterler kaybolmasın). Ekranda henüz panorama yoksa hemen.
   */
  bolgeDegisti() {
    if (this.gecis.etkin) {
      this.bekleyenSifirla = true;
      this.gecis.yanEtkiIste();
    } else this.sahneyiSifirla();
  }

  /** Oda 2 sütre dizilimi (güvenli alan tipi); null → kaldır. */
  sutreAyarla(tip: string | null, esyalar: SutreEsyasi[] | undefined, kok: string) {
    this.sutre.ayarla(tip, esyalar, kok);
  }

  /**
   * 3B arazi kipi. "kapali": yalnızca panorama + gölge düzlemi (eski yol). "hibrit": yakın arazi 3B, uzak
   * panorama. "tam": uzak halka + prosedürel gökyüzü, panorama yalnız yerleşim planı için yüklenir.
   * Bölge değişince arazi yeniden kurulur (profil bölgeye göre).
   *
   * Ekranda panorama varken kurulum (ya da kar) değişikliği takasa ertelenir: eski görüntü yeni bölgenin arazisiyle
   * bozulmasın, ~0,4 sn'lik kurulum örtünün arkasında kalsın. Hazırlık sürerken aynı bölge isteği de saklanır (yeni
   * planın görüş koridorları takasta). Ekranda henüz bir şey yoksa (ilk açılış) hemen, hazırlanan panoramanın planıyla.
   */
  araziAyarla(mod: AraziModu, bolge: string, mevsim: string, kok: string) {
    if (!this.renderer) {
      this.heli.tozTuru = rotorTozuTuru(bolge, mevsim);
      return;
    }
    const istek: AraziIstegi = { mod, bolge, mevsim, kok };
    const g = this.gecis;
    if (g.etkin) {
      const degisir = this.araziBolge !== `${mod}|${bolge}` || this.uygulananKar !== karDegeri(mevsim);
      if (degisir || g.bekliyor) {
        this.bekleyenArazi = istek;
        if (degisir) g.yanEtkiIste();
        return;
      }
    }
    this.araziUygula(istek, g.hazirlik?.kaynak ?? this.kaynak);
  }

  /** Arazi isteğini uygular (`planKaynagi`: görüş koridorlarının planı). Arazi yeniden kurulduysa true. */
  private araziUygula(i: AraziIstegi, planKaynagi: PanoramaKaynagi | null): boolean {
    const { mod, bolge, mevsim, kok } = i;
    // Rotor tozu zemin malzemesine göre: kışın kar, ormanda koyu toprak + yaprak, üs/meskûn mahalde beton tozu
    this.heli.tozTuru = rotorTozuTuru(bolge, mevsim);
    const kar = karDegeri(mevsim);
    const anahtar = `${mod}|${bolge}`;
    let kuruldu = false;
    if (this.araziBolge !== anahtar) {
      this.araziBolge = anahtar;
      kuruldu = true;
      const profil = ARAZI_PROFILLERI[bolge] ?? ARAZI_PROFILLERI.kirsal_acik_arazi;
      // Görüş koridorları kurulumda hesaplanır (yerinde güncelleme gereksiz: arazi zaten yeniden kuruluyor)
      this.arazi.koridorlariAyarla(this.planKoridorlari(planKaynagi), false);
      this.arazi.uyari = (m) => this.uyari?.(m);
      this.arazi.kur(mod, profil, ARAZI_KALITE[this.kalite], kok, kar);
      zeminFonksiyonu(this.arazi.aktif ? (x, z) => this.arazi.yukseklik(x, z) : null);
      // Yere oturan mevcut nesneler yeni yüksekliğe (bölge değişti: profil farklı; kip değişti: düz ↔ engebeli)
      this.figurler.zemineOturt();
      this.sutre.zemineOturt();
      if (this.golgeZemini) this.golgeZemini.visible = !this.arazi.aktif;
      this.hasar.cikartmaCiz = !this.arazi.aktif;
      if (mod !== "tam") {
        this.gokyuzu.sok(this.sahne);
        this.arkaPlaniUygula();
      }
      this.isikGuncelle();
    } else if (this.arazi.koridorlariAyarla(this.planKoridorlari(planKaynagi))) {
      // Aynı bölgede panorama değişti (saat/mevsim → başka plan): koridorlar yerinde güncellendi, nesneler zemine
      this.figurler.zemineOturt();
      this.sutre.zemineOturt();
    }
    this.arazi.karAyarla(kar);
    this.uygulananKar = kar;
    return kuruldu;
  }

  /** Yerleşim planı noktaları (sahne koordinatı) + düz alan yarıçapı: iniş alanı 9 m, tank 5 m, diğerleri 3,5 m. */
  private planKoridorlari(kaynak: PanoramaKaynagi | null = this.kaynak): Array<{ x: number; z: number; yaricap: number }> {
    const k = kaynak?.yawKaydirma ?? 0;
    return (kaynak?.plan?.noktalar ?? []).map((n) => {
      const p = azimutYon(panoramadanSahneAzimutu(n.azimut, k)).multiplyScalar(n.mesafe);
      return { x: p.x, z: p.z, yaricap: n.tur?.includes("helikopter") ? 9 : n.tur?.includes("tank") ? 5 : 3.5 };
    });
  }
  get araziModu(): AraziModu {
    return this.arazi.mod;
  }
  get araziDurumu(): string {
    return this.arazi.durum;
  }

  private isikGuncelle() {
    // Panorama kendi zamanını taşıyorsa (gece çekimi) karartma yok; gündüz/genel panorama gece saatinde karartılır.
    const z = this.kaynak?.zaman;
    const faktor = (z === "gece" ? 1 : z === "alacakaranlik" ? Math.min(1, 0.55 + this.isik * 0.45) : 0.08 + 0.92 * this.isik) * this.yagisKararma;
    this.sahne.backgroundIntensity = faktor;
    this.gokOrtusu.u.parlaklik.value = faktor;
    this.sahne.environmentIntensity = faktor;
    this.parcaciklar.isik = faktor;
    this.catisma.isik = this.isik;
    this.dolgu.intensity = 0.15 * faktor;

    let azimut: number;
    let yukseklik: number;
    let guc: number;
    if (this.arazi.mod === "tam") {
      // Tam 3B: gökyüzü saatten, panorama yalnız plan için; sis ufuk rengine
      this.gokyuzu.guncelle(this.saat, this.sonBulut, this.sahne);
      this.sahne.background = null;
      this.gokOrtusu.kutu.visible = false;
      this.sis.color.copy(this.gokyuzu.ufukRengi(this.sonBulut));
      this.sis.near = 180;
      this.sis.far = 1400 - this.sonBulut * 700;
      this.sahne.fog = this.sis;
      const g = gunesKonumu(this.saat);
      azimut = g.azimut;
      yukseklik = Math.max(-10, g.yukseklik);
      guc = (1 - this.sonBulut * 0.7) * (yukseklik > 0 ? 1 : 0.1);
      const yon = azimutYon(azimut);
      const e = radyan(Math.max(6, yukseklik));
      const d = new THREE.Vector3(yon.x * Math.cos(e), Math.sin(e), yon.z * Math.cos(e));
      this.gunes.position.copy(d.clone().multiplyScalar(120)).add(this.gunes.target.position);
      const gun = Math.max(0, Math.min(1, (yukseklik + 4) / 16));
      this.gunes.intensity = (0.2 + guc * 2.6) * gun * (0.3 + 0.7 * this.yagisKararma);
      const sicak = Math.max(0, Math.min(1, 1 - yukseklik / 18));
      this.gunes.color.setRGB(1, 0.96 - sicak * 0.25, 0.9 - sicak * 0.45);
      this.gunes.shadow.radius = 2 + (1 - guc) * 8;
      this.dolgu.intensity = 0.1 + 0.25 * gun;
      this.sahne.environmentIntensity = (0.15 + 0.85 * gun) * this.yagisKararma;
      this.parcaciklar.isik = 0.1 + 0.9 * gun;
      this.catisma.isik = gun;
      this.isikTabani = { dolgu: this.dolgu.intensity, ortam: this.sahne.environmentIntensity };
      return;
    }
    this.sisUygula(faktor);
    if (this.gunesTahmini && this.gunesTahmini.guc > 0.05) {
      azimut = panoramadanSahneAzimutu(this.gunesTahmini.azimut, this.kaynak?.yawKaydirma ?? 0);
      guc = this.gunesTahmini.guc;
      // Disk yok, yalnızca ışıma sütunu: yön panoramadan, yükseklik saatten (gece panoramasında ay için 25°)
      yukseklik = this.gunesTahmini.yukseklikGuvenilir ? this.gunesTahmini.yukseklik : Math.max(20, this.kaynak?.zaman === "gece" ? 25 : gunesKonumu(this.saat).yukseklik);
      if (!this.gunesTahmini.yukseklikGuvenilir) guc *= 0.7;
      // Makullük sınırı: parlak ufuk pusu / yapay zekâ panoramasında güneş diski 5° gibi çıkabiliyor; o zaman
      // gölgeler boyun 10 katı çizgiler oluyor. Gündüz panoramasında en az 18°, alacakaranlıkta 6°, gecede 15°.
      // Manifestte elle doğrulanmış güneş (kış öğleden sonrası 12° gibi) aynen kullanılır; yalnız 4° taban.
      const enAz = this.gunesElle ? 4 : z === "gece" ? 15 : z === "alacakaranlik" ? 6 : 18;
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
    // Gece panoraması: parlak nokta sokak lambası/ay olabilir; figürler gündüz gibi aydınlanmasın.
    // Ay ışığı: zayıf, mavimsi, yumuşak gölge. Alacakaranlıkta orta. Gündüz panoraması gece saatinde zaten faktörle kısılır.
    if (z === "gece") {
      this.gunes.color.lerp(new THREE.Color(0.72, 0.8, 1), 0.7);
      this.gunes.shadow.radius = Math.max(this.gunes.shadow.radius, 6);
      // Karartılmış gece çekiminde sabit sınır (ay 0,45, dolgu 0,15) 3B zemini ve figürleri çevresinden 3–5 kat parlak
      // bırakıyordu. Işık panoramanın kendi zemin parlaklığına eşlenir: yansıtması 0,3 olan yatay yüzey
      // 0,3·((ay·sin + dolgu·0,7)/π + gök) ≈ zemin olsun; gereken ışığın ¾'ü ay (gölge), ¼'ü dolgu.
      const p = this.panoramaParlakligi();
      if (p) {
        const gerekli = Math.max(0, p.zemin / 0.3 - p.gok) * Math.PI;
        const sinY = Math.max(0.2, Math.sin(radyan(yukseklik)));
        this.gunes.intensity = Math.min(this.gunes.intensity, 0.45, Math.max(0.015, (0.75 * gerekli) / sinY));
        this.dolgu.intensity = Math.min(0.15, Math.max(0.005, (0.25 * gerekli) / 0.7));
        // Duman/toz ay ışığında koyu (alevler ve izli mermi kendi ışığıyla parlak kalır)
        this.parcaciklar.isik = Math.max(0.08, Math.min(1, Math.sqrt(p.zemin / 0.15)));
      } else {
        this.gunes.intensity = Math.min(this.gunes.intensity, 0.45);
        this.dolgu.intensity = Math.max(this.dolgu.intensity, 0.08);
      }
    } else if (z === "alacakaranlik") {
      this.gunes.intensity = Math.min(this.gunes.intensity, 1.2);
    }
    // Kapalı gök (bulut ya da yağış): güneş bulutun arkasında, gölgeler söner; gök örtüsü göğü buluta çevirir
    const ortu = this.etkinBulut;
    const kapali = Math.max(0, Math.min(1, (ortu - 0.45) / 0.5));
    this.gunes.intensity *= 1 - 0.85 * kapali * kapali * (3 - 2 * kapali);
    this.gunes.shadow.radius = Math.max(this.gunes.shadow.radius, 2 + 10 * kapali);
    // Güneşin yerini yaygın gök ışığı alır (kapalı havada kar ve zemin yine aydınlık; yalnız gölge kaybolur)
    this.dolgu.intensity += kapali * 1.6 * faktor;
    this.gokHavasiAyarla(d, ortu);
    // Panoramadaki güneş/ay diskinin gerçek yeri (ışık yönü makullük sınırıyla yükseltilmiş olabilir; disk değil)
    const t = this.gunesTahmini;
    const du = this.gokOrtusu.u;
    du.diskVar.value = t && t.yukseklikGuvenilir && t.guc > 0.05 && t.yukseklik > 1 ? 1 : 0;
    if (t && du.diskVar.value) {
      const dy = azimutYon(panoramadanSahneAzimutu(t.azimut, this.kaynak?.yawKaydirma ?? 0));
      const de = radyan(t.yukseklik);
      (du.diskYonu.value as THREE.Vector3).set(dy.x * Math.cos(de), Math.sin(de), dy.z * Math.cos(de));
    }
    this.isikTabani = { dolgu: this.dolgu.intensity, ortam: this.sahne.environmentIntensity };
  }

  /** Yağış göğü kapatır: hafif yağmurda en az 0,8, şiddetlide 0,95, karda 0,85 bulut. */
  private get etkinBulut(): number {
    const y = this.sonYagis;
    return Math.max(this.sonBulut, y === "siddetli_yagmur" ? 0.95 : y === "hafif_yagmur" ? 0.8 : y === "kar" ? 0.85 : 0);
  }

  /** Gök örtüsünün bulut değerleri: örtü, yağış koyuluğu, bulut rengi (panoramanın gök parlaklığından), güneş yönü. */
  private gokHavasiAyarla(gunesYonu: THREE.Vector3, ortu: number) {
    const u = this.gokOrtusu.u;
    u.bulut.value = ortu;
    const y = this.sonYagis;
    u.yagis.value = y === "siddetli_yagmur" ? 1 : y === "hafif_yagmur" ? 0.55 : y === "kar" ? 0.25 : 0;
    // Kapalı gök, açık göğün bant ortalamasından biraz açık ve nötr gri; ufkun tonu (alacakaranlıkta turuncu) %25
    const p = this.panoramaParlakligi();
    const L = Math.max(0.02, Math.min(0.85, (p ? p.gok : 0.45) * 1.1));
    const ufuk = this.ufukRengi();
    const uL = Math.max(1e-4, 0.2126 * ufuk.r + 0.7152 * ufuk.g + 0.0722 * ufuk.b);
    (u.bulutRengi.value as THREE.Color).setRGB(L * (0.75 * 0.97 + (0.25 * ufuk.r) / uL), L * (0.75 * 0.99 + (0.25 * ufuk.g) / uL), L * (0.75 * 1.03 + (0.25 * ufuk.b) / uL));
    (u.gunesYonu.value as THREE.Vector3).copy(gunesYonu).normalize();
    (u.gunesRengi.value as THREE.Color).copy(this.gunes.color);
    this.yagis3b.isikAyarla(u.bulutRengi.value as THREE.Color, u.parlaklik.value as number);
  }

  /**
   * Sis: hibrit arazinin kenarı (profil yarıçapı, panoramanın ufuk rengine) ve ortamın sisi tek three sisinde
   * (doğrusal). Sis arttıkça renk sis rengine, uzak sınır görüş mesafesine iner (sis 1 → 35 m, 0,5 → 385 m). Gök
   * örtüsü panoramayı aynı eğriyle sisler (zemin pikselinin uzaklığı göz yüksekliğinden), 3B ve panorama birleşir.
   * Sis nesnesi her kipte sahnede: kapalı kipte sis 0 iken uzaklık etkisizdir (programlar sis ayarında yeniden derlenmez).
   */
  private sisUygula(faktor: number) {
    const s = Math.max(0, Math.min(1, this.sonSis));
    const a = Math.min(1, s / 0.12);
    const t = a * a * (3 - 2 * a);
    const gorus = 35 + 1400 * (1 - s) ** 2;
    const ufuk = this.ufukRengi();
    const L = 0.2126 * ufuk.r + 0.7152 * ufuk.g + 0.0722 * ufuk.b;
    this.sisRengi.setRGB(ufuk.r + (L * 1.05 - ufuk.r) * 0.6, ufuk.g + (L * 1.05 - ufuk.g) * 0.6, ufuk.b + (L * 1.08 - ufuk.b) * 0.6).multiplyScalar(faktor);
    let yakin = 1e5;
    let uzak = 1e6;
    let kenar = this.sisRengi;
    if (this.arazi.mod === "hibrit" && this.gecis.etkin) {
      const r = this.arazi.yaricap;
      yakin = r * 0.55;
      uzak = r * 1.45;
      kenar = this.ufukRengiGecici.copy(ufuk).multiplyScalar(faktor);
    }
    this.sis.color.copy(kenar).lerp(this.sisRengi, t);
    this.sis.far = t > 0 ? Math.min(uzak, gorus) : uzak;
    this.sis.near = Math.min(yakin * (1 - t), this.sis.far * 0.5);
    this.sahne.fog = this.sis;
    const u = this.gokOrtusu.u;
    u.sisMiktar.value = t;
    u.sisYakin.value = 0;
    u.sisUzak.value = gorus;
    u.sisYuksekligi.value = 40 + 160 * s;
    u.gozYuksekligi.value = GOZ_YUKSEKLIGI;
    (u.sisRengi.value as THREE.Color).copy(this.sisRengi);
  }

  /**
   * Şimşek: gök örtüsünde çakma yönünde aydınlanan bulutlar ve sahne ışığında kısa artış (ortam ışığı, dolgu). Bir
   * çakma 2–4 darbedir (ilki en güçlü). `azimut` sahne azimutu; gök gürültüsü çağıranda (mesafeye göre gecikmeli).
   */
  simsek(azimut: number, guc = 1) {
    const yon = azimutYon(azimut);
    (this.gokOrtusu.u.simsekYonu.value as THREE.Vector3).set(yon.x, 0.35, yon.z).normalize();
    const t0 = this.sahneSaati;
    const n = 2 + Math.floor(Math.random() * 3);
    let t = t0;
    for (let i = 0; i < n; i++) {
      this.simsekDarbeleri.push({ t, guc: guc * (i === 0 ? 1 : 0.35 + Math.random() * 0.5) });
      t += 0.06 + Math.random() * 0.16;
    }
  }

  /** Karede: bulut ve sis kayması (rüzgâr), şimşek zarfı. */
  private havaGuncelle(dt: number) {
    this.sahneSaati += dt;
    const hedefIslak = this.sonYagis === "siddetli_yagmur" ? 1 : this.sonYagis === "hafif_yagmur" ? 0.65 : 0;
    const sabit = hedefIslak > this.islaklik ? 12 : 90;
    const yeni = this.islaklik + (hedefIslak - this.islaklik) * Math.min(1, dt / sabit);
    if (Math.abs(yeni - this.islaklik) > 1e-4) {
      this.islaklik = yeni;
      this.arazi.islaklikAyarla(yeni);
      this.yagis3b.islaklikAyarla(yeni);
    }
    const u = this.gokOrtusu.u;
    // Rüzgâr "nereden" esiyor (pusula oku içe bakar): bulut ters yöne kayar; düzlem biriminde (bulut yüksekliği 1)
    const yon = azimutYon(this.ruzgarYonu + 180);
    const hiz = 0.006 + 0.05 * this.ruzgarSiddeti;
    const bk = u.bulutKayma.value as THREE.Vector2;
    bk.x -= yon.x * hiz * dt;
    bk.y -= yon.z * hiz * dt;
    const sk = u.sisKayma.value as THREE.Vector2;
    sk.x += (0.02 + 0.12 * this.ruzgarSiddeti) * dt;
    // Şimşek zarfı: her darbe 25 ms'de tepe, ~90 ms'de söner
    let zarf = 0;
    const simdi = this.sahneSaati;
    this.simsekDarbeleri = this.simsekDarbeleri.filter((d) => simdi - d.t < 0.6);
    for (const d of this.simsekDarbeleri) {
      const g = simdi - d.t;
      if (g < 0) continue;
      zarf = Math.max(zarf, d.guc * (g < 0.025 ? g / 0.025 : Math.exp(-(g - 0.025) / 0.09)));
    }
    u.simsek.value = zarf;
    if (zarf > 0.001 || this.simsekVardi) {
      this.dolgu.intensity = this.isikTabani.dolgu + zarf * 1.2;
      this.sahne.environmentIntensity = this.isikTabani.ortam * (1 + zarf * 2.2);
    }
    this.simsekVardi = zarf > 0.001;
  }
  private simsekVardi = false;
  /** Zemin ıslaklığı 0–1: yağmurda ~12 sn'de ıslanır, kesilince ~90 sn'de kurur (arazi malzemesi + yağış sıçraması). */
  private islaklik = 0;

  /**
   * Patlama yeri: yöne en yakın plan noktası; çevresinde (4,5 m) asker/tank varsa yöne 40° içindeki boş bir patlama
   * noktası, o da yoksa aynı yönde dışarı (6 m adımlarla), en son plandaki herhangi bir boş nokta. Askerin üstüne düşmez.
   */
  private patlamaYeri(azimut: number, varsayilanMesafe: number): { azimut: number; mesafe: number } {
    const k = this.kaynak?.yawKaydirma ?? 0;
    const titret = (m: number, nokta: boolean) => m * (nokta ? 0.92 + Math.random() * 0.16 : 0.85 + Math.random() * 0.3);
    const bos = (az: number, m: number) => !this.figurler.doluMu(yerKonumu(az, m), 4.5);
    const ilk = this.noktaSec(azimut, "patlama", varsayilanMesafe, 180);
    const m0 = titret(ilk.mesafe, Boolean(ilk.nokta));
    if (bos(ilk.azimut, m0)) return { azimut: ilk.azimut, mesafe: m0 };
    const istenen = azimut + k;
    const adaylar = (this.kaynak?.plan?.noktalar ?? [])
      .filter((n) => !n.tur || n.tur.includes("patlama"))
      .map((n) => ({ az: panoramadanSahneAzimutu(n.azimut, k), m: titret(n.mesafe, true), fark: Math.abs(aciNormalize(n.azimut - istenen)) }))
      .sort((a, b) => a.fark - b.fark);
    for (const a of adaylar) if (a.fark <= 40 && bos(a.az, a.m)) return { azimut: a.az, mesafe: a.m };
    for (let ek = 6; ek <= 18; ek += 6) if (bos(ilk.azimut, m0 + ek)) return { azimut: ilk.azimut, mesafe: m0 + ek };
    for (const a of adaylar) if (bos(a.az, a.m)) return { azimut: a.az, mesafe: a.m };
    return { azimut: ilk.azimut, mesafe: m0 + 24 };
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
    const secim = this.patlamaYeri(azimut, 30 - 16 * s);
    const p = yerKonumu(secim.azimut, secim.mesafe);
    const r = 1.2 + s * 2.4;
    const varyant = this.parcaciklar.patlamaVaryantiSec();
    // Gerçek çekilmiş plaka 2B katmanda oynuyorsa 3B ateş topu çizilmez; krater, moloz ve ışık yine eklenir.
    if (!plakaVar) this.parcaciklar.patlama(p, r, varyant);
    else this.parcaciklar.tozBulutu(p, r, s * 0.6);
    // Önce arazi çukurlaşır, sonra moloz/duman yeni (alçak) zemine yerleşir
    if (this.arazi.aktif) {
      this.arazi.krater(p, 1.6 + s * 2.6, s);
      p.y = zeminY(p.x, p.z);
    }
    this.hasar.krater(p, 1.6 + s * 2.6, s);
    this.flas.position.set(p.x, p.y + r, p.z);
    this.flasGuc = Math.max(this.flasGuc, s);
    // Patlama artığı: kraterde küçük bir yangın 2,5–3,5 sn yanar, sonra 2,5 sn'de söner (alev → seyrek duman);
    // ışığı ve sesi (yangın ses kaynağı) kendiliğinden gelir. Panelin "yangın" efekti ise kalıcıdır.
    this.yanginlar?.ekle(p, (0.25 + 0.2 * Math.min(1, s)) * varyant.yangin, (2.5 + Math.min(1, s)) * (0.85 + 0.3 * Math.random()));
  }

  tozDuman(azimut: number, siddet: number) {
    const secim = this.noktaSec(azimut, "toz", 9 + Math.random() * 9);
    const p = yerKonumu(secim.azimut, secim.mesafe);
    this.parcaciklar.tozBulutu(p, 3.5 + 1.5 * Math.min(1, siddet), Math.max(0.2, siddet));
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
    if (s.yaninda) {
      // Başka figürün yanına: yerleşim planı atlanır, konum oynatıcıda o figüre göre hesaplanır
      void this.figurler.oynat(tanim, { ...s, mesafe: undefined }, kok).then((ok) => ok || this.uyari?.(`Figür yüklenemedi: ${tanim.dosya}`));
      return;
    }
    if (tanim.serbestYerlesim) {
      // Yaralı vb.: panelin yönü ve mesafesi aynen (Oda 2'de sütrenin içine, Oda 1'de yakına); yalnız ağaç/bina içine değil
      const az = panoramadanSahneAzimutu(yasaktanKacin(s.azimut + k, this.kaynak?.plan?.yasak), k);
      void this.figurler.oynat(tanim, { ...s, azimut: az, mesafe: Math.min(ASKER_EN_UZAK, varsayilan) }, kok).then((ok) => ok || this.uyari?.(`Figür yüklenemedi: ${tanim.dosya}`));
      return;
    }
    const turler = tanim.yerlesim ?? ["asker", "figur"];
    // Asker/figür: plan noktasının yönü korunur, mesafe ASKER_EN_YAKIN–ASKER_EN_UZAK aralığına çekilir (duvarda net
    // okunsun); tank ve araçlar plandaki mesafede kalır. Doluluk da kısaltılmış mesafede denetlenir.
    const askerMi = !turler.includes("tank");
    const kisalt = (m: number) => (askerMi ? Math.min(ASKER_EN_UZAK, Math.max(ASKER_EN_YAKIN, m)) : m);
    const dolu = (p: THREE.Vector3) => this.figurler.doluMu(p) || this.sutre.doluMu(p);
    // Asker: istenen duvarda (±50°) boş asker, sonra figür noktası; ancak o duvar doluysa başka duvara geçilir
    const secim = birlikNoktasiSec(this.kaynak?.plan, s.azimut + k, turler, varsayilan, (az, m) => dolu(yerKonumu(panoramadanSahneAzimutu(az, k), kisalt(m))), askerMi ? ASKER_YAKIN_TOLERANS : undefined);
    const azimut = panoramadanSahneAzimutu(secim.azimut, k);
    // Seçilen yer hâlâ bir sütre eşyasının içindeyse (Oda 2 kaya/HESCO hattı) aynı yönde biraz dışarı
    let mesafe = kisalt(secim.mesafe);
    for (let ek = 0; ek < 6 && this.sutre.doluMu(yerKonumu(azimut, mesafe)); ek += 1.5) mesafe += 1.5;
    void this.figurler.oynat(tanim, { ...s, azimut, mesafe }, kok).then((ok) => ok || this.uyari?.(`Figür yüklenemedi: ${tanim.dosya}`));
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
  /** Figür ekrandan çıkınca (yürüyen/koşan, |azimut| > 165°) çağrılır; köprüye `figur bitti` gider. */
  figurBittiAyarla(f: (id: string) => void) {
    this.figurler.bittiOlayi = f;
  }
  figurOnYukle(url: string) {
    this.figurler.onYukle(url);
  }

  /** Tanı/hizalama: kimliğe göre aktif figür kaydı (silahHizalama.ts). */
  figurAktifBul(id: string) {
    return this.figurler.aktifBul(id);
  }

  helikopterYukle(url: string, boy?: number, rotor?: string[], renk?: string) {
    this.heli.yukle(url, boy, rotor, renk);
  }
  /**
   * `yon`: panelden iniş yönü (sahne azimutu, derece; verilmezse son gelen yön kalır). Planda iniş noktası varsa yöne
   * en yakın olana iner (helikopter açık alana inmeli; ağaçlık/binalı yöne serbest iniş yapılmaz); plan yoksa yön + 38 m.
   */
  helikopterAyarla(d: HelikopterDurumu, yon?: number) {
    if (yon !== undefined) this.heliYonu = yon;
    this.heliInisiniSec();
    this.heli.durumAyarla(d);
  }
  /**
   * İniş noktası: panelin yönüne (heliYonu) en yakın plan iniş noktası, plan yoksa o yön + 38 m (sahne koordinatı).
   * Sabit bir varsayılana dönmez: sonuç yalnız plan (panorama), yawKaydirma ya da panelin yönü değişince değişir;
   * Helikopter3B aynı noktayı yok sayar. Havadayken değişirse uçuş modeli rotasını kurar ya da pas geçer.
   */
  private heliInisiniSec() {
    const secim = this.noktaSec(this.heliYonu, "helikopter", 38, 180);
    this.heli.inisNoktasi(secim.azimut, secim.mesafe);
  }
  get helikopterAzimutu() {
    return this.heli.inisAzimutu;
  }
  /** Rotor sesinin konumu (sahne azimutu, yatay mesafe, irtifa; ses.ts helikopter); helikopter yokken null. */
  get helikopterSesKonumu() {
    return this.heli.sesKonumu;
  }

  /** Yangın ses kaynakları (her kare; yangın yoksa boş). */
  get yanginSesleri() {
    return this.yanginlar?.sesOzeti() ?? [];
  }

  catismaSesleriAyarla(s: CatismaSesleri) {
    this.catismaSesleri = s;
  }
  /** Çatışma durumu; `azimut` düşman cephesinin sahne azimutu. */
  catismaAyarla(c: CatismaAyarlari, azimut: number) {
    this.catisma.catismaAyarla({ aktif: c.aktif, siddet: c.siddet, azimut, dostAtes: c.dostAtes });
    this.figurler.dusmanAzimutu = c.aktif ? azimut : null;
  }
  /**
   * Klasik izli mermi ayarı 3B'de: kaynak seçilen duvarın ortası yönünde (duvar yaw'ı; ±10° dağılım, 150–300 m),
   * `yon` iz doğrultusunu döndürür: 0 mermiler seçilen duvarın uzağından izleyiciye doğru gelir; ±90 mermiler komşu
   * duvar yönünden gelip seçilen duvarın 10–60 m önünden yandan geçer (+ sağdan sola, − soldan sağa). Bkz.
   * CatismaSistemi.izliAtis.
   */
  izliMermiAyarla(a: IzliMermiAyarlari, duvarYawlari: number[]) {
    const yaw = duvarYawlari[a.cikisNoktasi] ?? 0;
    this.catisma.izliAyarla({ aktif: a.aktif, azimut: yaw, yon: Math.max(-90, Math.min(90, a.yon)), siklik: a.siklik });
  }
  get izSayisi() {
    return this.catisma.aktifIzSayisi;
  }

  guncelle(dt: number) {
    if (!this.renderer) return;
    // Panorama hazırlığı: karede en çok bir GPU adımı (şerit, küp, PMREM)
    if (this._gecis?.hazirlik) this.hazirlikAdimi();
    // Ertelenen ışık: hazırlık iptal olduysa ya da düştüyse (takas olmadan bitti) şimdi uygulanır
    if (this.isikBekliyor && !this.gecis.bekliyor) {
      this.isikBekliyor = false;
      this.isikGuncelle();
    }
    this.havaGuncelle(dt);
    this.yagis3b.guncelle(dt);
    this.catisma.guncelle(dt);
    // Rüzgâr (yangın dumanı sürüklenir) ve duman aydınlatması (güneş yönü) — parçacık güncellemesinden önce
    this.yanginlar.ruzgar.set(Math.sin(radyan(this.ruzgarYonu)), 0, -Math.cos(radyan(this.ruzgarYonu))).multiplyScalar(this.ruzgarSiddeti * 6);
    this.parcaciklar.duman.ruzgar.copy(this.yanginlar.ruzgar); // toz ve duman topakları da sürüklenir (`surukle`)
    this.yanginlar.guncelle(dt);
    this.parcaciklar.duman.isikYonuAyarla(this.gunes.position.clone().sub(this.gunes.target.position));
    this.parcaciklar.guncelle(dt);
    this.hasar.guncelle(dt);
    this.figurler.guncelle(dt);
    this.heli.guncelle(dt);
    this.arazi.guncelle(dt);
    if (this.flasGuc > 0) {
      this.flas.intensity = this.flasGuc * 6000;
      this.flasGuc = Math.max(0, this.flasGuc - dt * 3.5);
    } else this.flas.intensity = 0;
  }

  /**
   * Üç duvarı kendi tuvaline çizer. Ekranda panorama yoksa false (ilk açılış: siyah; panorama hiç yoksa yer tutucu).
   * Takastan sonra gölgelendiriciler derlenirken çizmez ama true döner: geçiş örtüsü önceki kareyi gösterir
   * (`buKareCizildi` false kalır, örtü bu kareden yakalanmaz).
   */
  ciz(): boolean {
    const r = this.renderer;
    this.buKareCizildi = false;
    if (!r || !this.hazir || this.kameralar.length === 0) return false;
    if (this.derlemeBekleniyor) {
      if (performance.now() < this.derlemeSiniri) return true;
      this.derlemeBekleniyor = false;
    }
    // Bölge değiştiyse arazi dokularının ilk yüklemesi (ana iş parçacığında çözme) bu çizimde, örtünün arkasında olur
    const dokuHazir = this.araziBekleniyor && this.araziDokulariHazir();
    r.setScissorTest(true);
    r.shadowMap.needsUpdate = true; // ilk duvar çiziminde gölge geçişi, diğer ikisi aynı haritayı kullanır
    this.yerlesimler.forEach((y, i) => {
      r.setViewport(y.x, 0, y.genislik, this.H);
      r.setScissor(y.x, 0, y.genislik, this.H);
      r.render(this.sahne, this.kameralar[i]);
    });
    r.setScissorTest(false);
    this.buKareCizildi = true;
    if (this.takastanSonraCizim === 0 && this.olculen) this.olculen.veri.zaman.ilkKare = performance.now();
    this.takastanSonraCizim++;
    if (dokuHazir) this.dokuHazirCizim++;
    // Ön derleme molozu iki çizim görünür kalır (gölge geçişinin derinlik programı), sonra gizlenir (derleme için kalır)
    if (this.onDerlemeKare > 0 && --this.onDerlemeKare === 0 && this.onDerleme) for (const c of this.onDerleme.children) c.visible = false;
    return true;
  }

  /**
   * Arazi dokuları yüklendi mi (bölge değişiminde solma bunu bekler; en çok 1,2 sn): `AraziKatmani.dokularHazir`
   * (yüklemesi süren doku kalmadı; bulunamayan doku da bitmiş sayılır, önbellekteki ortak dokular hemen hazır).
   */
  private araziDokulariHazir(): boolean {
    return !this.arazi.aktif || this.arazi.dokularHazir;
  }
}
