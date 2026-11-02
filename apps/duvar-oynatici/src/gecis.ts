/**
 * Sahne geçişi örtüsü: 3B tuvalin son karesi bir 2B tuvale kopyalanır (3B tuvalin üstünde, 2B katmanın altında), yeni
 * sahne arkada hazırlanıp çizilir, örtü CSS opaklık animasyonuyla solar.
 *
 * Neden anlık görüntü: ikinci bir arka plan küresi yalnız gökyüzünü karıştırırdı; ışık, arazi ve figür değişimi yine
 * sıçrardı. Anlık görüntü ışıklandırılmış tüm 3B kareyi karıştırır; opaklık animasyonu compositor'da yürür, takas
 * anındaki arazi kurulumu ya da gölgelendirici derlemesi ana iş parçacığını tutsa da solma akar. Maliyet: bir drawImage
 * ve solma boyunca bir katman. Kopya `ciz()`den hemen sonra, aynı görevde alınmalı: preserveDrawingBuffer=false'ta çizim
 * tamponu yalnız o görev boyunca geçerlidir (önizleme de aynı yolu kullanır).
 */

/** Örtü tuvalinin kullanılan kısmı (testte sahte nesne). */
export interface GecisOgesi {
  width: number;
  height: number;
  style: { visibility: string; opacity: string; transform: string };
  getContext(tur: "2d"): GecisCizimi | null;
  animate?(kareler: Keyframe[], secenek: KeyframeAnimationOptions): { finished: Promise<unknown>; cancel(): void };
}
export interface GecisCizimi {
  fillStyle: string | CanvasGradient | CanvasPattern;
  globalAlpha: number;
  drawImage(kaynak: CanvasImageSource, x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
}

type Durum = "kapali" | "bekliyor" | "soluyor";

export class GecisKatmani {
  private durum: Durum = "kapali";
  private animasyon: { finished: Promise<unknown>; cancel(): void } | null = null;
  private solmaBasi = 0;
  private W = 0;
  private H = 0;

  /** `sureMs`: solma süresi (`?gecis=`; 0 = anlık kesme, ölçüm karşılaştırması için). */
  constructor(
    private readonly oge: GecisOgesi,
    readonly sureMs = 600,
    private readonly saat: () => number = () => performance.now(),
  ) {
    oge.style.visibility = "hidden";
  }

  /** Örtü görünüyor (yakalandı, solma bekleniyor ya da soluyor): yeni takas bitişini bekler. */
  get suruyor(): boolean {
    return this.durum !== "kapali";
  }
  /** Yakalandı, yeni sahne hazırlanırken örtü tam opak bekliyor. */
  get solmaBekliyor(): boolean {
    return this.durum === "bekliyor";
  }
  /** Örtünün şu anki opaklığı (önizlemeye örtüyü aynı oranda çizmek için). */
  get opaklik(): number {
    if (this.durum === "kapali") return 0;
    if (this.durum === "bekliyor" || this.sureMs <= 0) return 1;
    const t = Math.min(1, Math.max(0, (this.saat() - this.solmaBasi) / this.sureMs));
    // ease-in-out (kübik yaklaşık)
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    return 1 - e;
  }
  /** Önizleme ve testler için örtü tuvali. */
  get tuval(): GecisOgesi {
    return this.oge;
  }

  /** Tuval boyutu (3B tuvalle aynı); geçiş sürerken değişirse örtü hemen kalkar (eski kare yanlış ölçekte kalmasın). */
  boyutlandir(W: number, H: number) {
    if (W === this.W && H === this.H) return;
    this.W = W;
    this.H = H;
    if (this.durum !== "kapali") this.bitir();
  }

  /** 3B tuvalin son karesini kopyalar ve örtüyü tam opak gösterir (`ciz()`den hemen sonra çağrılmalı). */
  yakala(kaynak: CanvasImageSource) {
    const c = this.hazirla();
    if (!c) return;
    c.drawImage(kaynak, 0, 0, this.W, this.H);
    this.goster();
  }

  /** Henüz 3B kare yok (ilk açılış): siyah örtü; ilk sahne siyahtan solar. */
  siyahla() {
    const c = this.hazirla();
    if (!c) return;
    c.fillStyle = "#000";
    c.fillRect(0, 0, this.W, this.H);
    this.goster();
  }

  /** Örtüyü soldurur (compositor'da); bitince gizlenir. Süre 0 ise anında kalkar. */
  solmaBaslat() {
    if (this.durum !== "bekliyor") return;
    if (this.sureMs <= 0 || typeof this.oge.animate !== "function") {
      this.bitir();
      return;
    }
    this.durum = "soluyor";
    this.solmaBasi = this.saat();
    const a = this.oge.animate([{ opacity: 1 }, { opacity: 0 }], { duration: this.sureMs, easing: "ease-in-out", fill: "forwards" });
    this.animasyon = a;
    a.finished.then(
      () => {
        if (this.animasyon === a) this.bitir();
      },
      () => undefined,
    );
  }

  /**
   * Her karede: süre dolduysa (animasyonun `finished` sözü gecikse ya da sekme gizliyken) örtüyü kaldırır; patlama
   * sarsıntısında 3B tuvalle aynı CSS dönüşümünü alır.
   */
  guncelle(donusum: string) {
    if (this.durum === "kapali") return;
    if (this.oge.style.transform !== donusum) this.oge.style.transform = donusum;
    if (this.durum === "soluyor" && this.saat() - this.solmaBasi > this.sureMs + 400) this.bitir();
  }

  /** Örtüyü kaldırır; tuval 1×1'e küçülür (5760×1080'de ~25 MB serbest kalır). */
  bitir() {
    const a = this.animasyon;
    this.animasyon = null;
    this.durum = "kapali";
    this.oge.style.visibility = "hidden";
    this.oge.style.opacity = "1";
    a?.cancel();
    this.oge.width = 1;
    this.oge.height = 1;
  }

  private hazirla(): GecisCizimi | null {
    if (this.W <= 0 || this.H <= 0) return null;
    if (this.animasyon) {
      const a = this.animasyon;
      this.animasyon = null;
      a.cancel();
    }
    if (this.oge.width !== this.W || this.oge.height !== this.H) {
      this.oge.width = this.W;
      this.oge.height = this.H;
    }
    const c = this.oge.getContext("2d");
    if (c) c.globalAlpha = 1;
    return c;
  }

  private goster() {
    this.oge.style.opacity = "1";
    this.oge.style.visibility = "visible";
    this.durum = "bekliyor";
  }
}

/** `?gecis=` değeri → solma süresi (ms): sayı değilse varsayılan, 0–5000 arası. */
export function gecisSuresiCoz(deger: string | null, varsayilan = 600): number {
  if (deger === null || deger.trim() === "") return varsayilan;
  const n = Number(deger);
  if (!Number.isFinite(n)) return varsayilan;
  return Math.max(0, Math.min(5000, Math.round(n)));
}
