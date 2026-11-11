/**
 * 360° panorama katmanı (equirectangular resim veya video) → 3 duvara doğru perspektif.
 *
 * Fotogerçekçi içeriğin ana taşıyıcısı: gerçek 360° çekim, yapay zekâ ile üretilmiş panorama
 * veya oyun motorundan alınmış equirectangular render, hepsi aynı dosya biçimiyle gelir.
 * Her duvar için piksel → bakış yönü → panorama UV dönüşümü GPU'da (WebGL) yapılır. Bakış yönü duvarın
 * izdüşümünden (projeksiyon.ts: düzlem eksenleri + teğet sınırları, Kooima) gelir; böylece U duvarın
 * köşelerinde perspektif kırılmaz, ölçülmüş odada (`?oda=`) simetrik olmayan duvarlar da doğru çizilir.
 */
import type { Yerlesim } from "./projeksiyon";

const VERTEX = `
attribute vec2 a;
void main() { gl_Position = vec4(a, 0.0, 1.0); }
`;

/** Shader'daki duvar dizisi boyutu (duvar başına 3 vec3: en düşük WebGL 1 sınırı 16 vektöre sığar). */
const EN_COK_DUVAR = 4;

const FRAGMENT = `
precision highp float;
uniform sampler2D doku;
uniform vec2 boyut;        // tuval genişlik/yükseklik
uniform float duvarSayisi;
// Duvar başına bakış yönü (sahne koordinatı: sağ +x, yukarı +y, orta duvarın ilerisi -z):
// yon = A·fx + B·fy + C; fx, fy duvar içinde 0..1 (soldan, alttan). Ufuk kaydırması C'ye katılı.
uniform vec3 duvarA[${EN_COK_DUVAR}];
uniform vec3 duvarB[${EN_COK_DUVAR}];
uniform vec3 duvarC[${EN_COK_DUVAR}];
uniform float yawKaydirma; // panoramanın döndürülmesi (rad)
const float PI = 3.14159265358979;
void main() {
  vec2 p = gl_FragCoord.xy;
  float g = boyut.x / duvarSayisi;
  float i = floor(p.x / g);
  // GLSL ES 1.0: fragment shader'da uniform dizisi değişken indeksle okunamaz → sabit indeks zinciri
  vec3 a = duvarA[0]; vec3 b = duvarB[0]; vec3 c = duvarC[0];
  if (i >= 1.0) { a = duvarA[1]; b = duvarB[1]; c = duvarC[1]; }
  if (i >= 2.0) { a = duvarA[2]; b = duvarB[2]; c = duvarC[2]; }
  if (i >= 3.0) { a = duvarA[3]; b = duvarB[3]; c = duvarC[3]; }
  vec3 yon = normalize(a * ((p.x - i * g) / g) + b * (p.y / boyut.y) + c);
  float azimut = atan(yon.x, -yon.z) + yawKaydirma;
  float yukseklik = asin(clamp(yon.y, -1.0, 1.0));
  // Doku FLIP_Y ile yüklenir (v=1 üst satır): yukarı bakış → üst yarı
  vec2 uv = vec2(0.5 + azimut / (2.0 * PI), 0.5 + yukseklik / PI);
  gl_FragColor = texture2D(doku, vec2(fract(uv.x), clamp(uv.y, 0.0, 1.0)));
}
`;

export interface PanoramaKaydi {
  dosya: string;
  tip?: "resim" | "video";
  /** Panoramanın hangi azimutu orta duvarın ortasına gelsin (derece). */
  yawKaydirma?: number;
  /** Ufuk çizgisini yukarı/aşağı kaydır (-1..1). */
  yukseklikKaydirma?: number;
}

export class PanoramaKatmani {
  private gl: WebGLRenderingContext | null = null;
  private tuval: HTMLCanvasElement;
  private program: WebGLProgram | null = null;
  private doku: WebGLTexture | null = null;
  private kaynak: HTMLImageElement | HTMLVideoElement | null = null;
  private kaynakVideo = false;
  /** Ekrandaki dosya; `istenen` hazırlanan (çözülene / oynatılabilir olana dek eskisi ekranda kalır). */
  private yuklenen = "";
  private istenen = "";
  private kayit: PanoramaKaydi | null = null;
  private bekleyenKayit: PanoramaKaydi | null = null;
  private konumlar: Record<string, WebGLUniformLocation | null> = {};
  /** Duvar yön katsayıları (A, B, C); her karede doldurulur, yeniden ayrılmaz. */
  private readonly duvarA = new Float32Array(EN_COK_DUVAR * 3);
  private readonly duvarB = new Float32Array(EN_COK_DUVAR * 3);
  private readonly duvarC = new Float32Array(EN_COK_DUVAR * 3);
  hazir = false;
  hata = "";

  constructor() {
    this.tuval = document.createElement("canvas");
    const gl = this.tuval.getContext("webgl", { alpha: false, antialias: false, preserveDrawingBuffer: false });
    if (!gl) {
      this.hata = "WebGL yok";
      return;
    }
    this.gl = gl;
    const derle = (tip: number, kaynak: string) => {
      const s = gl.createShader(tip)!;
      gl.shaderSource(s, kaynak);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader hatası");
      return s;
    };
    try {
      const p = gl.createProgram()!;
      gl.attachShader(p, derle(gl.VERTEX_SHADER, VERTEX));
      gl.attachShader(p, derle(gl.FRAGMENT_SHADER, FRAGMENT));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "link hatası");
      this.program = p;
      gl.useProgram(p);
      const tampon = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, tampon);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const a = gl.getAttribLocation(p, "a");
      gl.enableVertexAttribArray(a);
      gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
      for (const ad of ["doku", "boyut", "duvarSayisi", "duvarA", "duvarB", "duvarC", "yawKaydirma"]) this.konumlar[ad] = gl.getUniformLocation(p, ad);
      this.doku = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.doku);
      // WebGL 1: ikinin kuvveti olmayan dokular (2912x1440, 12288x6144 ...) REPEAT ile "eksik" sayılır ve
      // siyah örneklenir. Yatay sarma shader'da fract(uv.x) ile yapıldığından CLAMP_TO_EDGE yeterli.
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    } catch (h) {
      this.hata = h instanceof Error ? h.message : String(h);
      this.gl = null;
    }
  }

  get aktif() {
    return this.hazir && this.gl !== null;
  }
  get kaynakAdi() {
    return this.yuklenen;
  }
  /** İstenen dosya hazırlanıyor (henüz ekranda değil). */
  get yukleniyor() {
    return this.istenen !== "";
  }
  /** Seçili panoramanın ufuk kaydırması (−1..1); 2B katmanların ufuk satırı için. */
  get yukseklikKaydirma() {
    return this.kayit?.yukseklikKaydirma ?? 0;
  }

  /**
   * Aynı dosya zaten ekrandaysa yalnız alanları günceller. Yeni dosya hazırlanırken eskisi ekranda kalır: resim
   * `decode()` ile ana iş parçacığı dışında çözülür, video oynatılabilir olunca geçilir (eskiden önce kapatılıyor, arada
   * yer tutucu görünüyordu). null → katmanı kapat.
   */
  sec(kayit: PanoramaKaydi | null, kok: string) {
    if (!this.gl) return;
    if (!kayit) {
      this.kapat();
      return;
    }
    const url = /^(https?:|data:|blob:|\/)/.test(kayit.dosya) ? kayit.dosya : kok + kayit.dosya;
    if (url === this.yuklenen) {
      this.kayit = kayit;
      this.istenen = "";
      this.bekleyenKayit = null;
      return;
    }
    this.bekleyenKayit = kayit;
    if (url === this.istenen) return;
    this.istenen = url;
    const video = kayit.tip === "video" || /\.(mp4|webm|mov)(\?|$)/i.test(url);
    if (video) {
      const v = document.createElement("video");
      v.src = url;
      v.loop = true;
      v.muted = true;
      v.playsInline = true;
      v.crossOrigin = "anonymous";
      v.addEventListener("canplay", () => {
        if (this.istenen !== url) {
          if (this.kaynak !== v) v.src = "";
          return;
        }
        this.degistir(v, true, url);
        void v.play().catch(() => undefined);
      });
      v.addEventListener("error", () => {
        if (this.istenen !== url) return;
        this.hata = `panorama videosu yüklenemedi: ${url}`;
        this.istenen = "";
      });
    } else {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = url;
      img.decode().then(
        () => {
          if (this.istenen !== url) return;
          this.degistir(img, false, url);
          this.dokuyuYukle();
        },
        () => {
          if (this.istenen !== url) return;
          this.hata = `panorama resmi yüklenemedi: ${url}`;
          this.istenen = "";
        },
      );
    }
  }

  /** Hazırlanan kaynak ekrana gelir (eski video durdurulur). */
  private degistir(kaynak: HTMLImageElement | HTMLVideoElement, video: boolean, url: string) {
    if (this.kaynak instanceof HTMLVideoElement && this.kaynak !== kaynak) {
      this.kaynak.pause();
      this.kaynak.src = "";
    }
    this.kaynak = kaynak;
    this.kaynakVideo = video;
    this.yuklenen = url;
    this.istenen = "";
    this.kayit = this.bekleyenKayit;
    this.bekleyenKayit = null;
    this.hazir = true;
    this.hata = "";
  }

  kapat() {
    if (this.kaynak instanceof HTMLVideoElement) {
      this.kaynak.pause();
      this.kaynak.src = "";
    }
    this.kaynak = null;
    this.hazir = false;
    this.yuklenen = "";
    this.istenen = "";
    this.kayit = null;
    this.bekleyenKayit = null;
  }

  private dokuyuYukle() {
    const gl = this.gl;
    if (!gl || !this.kaynak) return;
    gl.bindTexture(gl.TEXTURE_2D, this.doku);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, this.kaynak);
  }

  /** 3 duvar için panoramayı çizer ve 2B tuvale kopyalar. */
  ciz(hedef: CanvasRenderingContext2D, yerlesimler: Yerlesim[], W: number, H: number): boolean {
    const gl = this.gl;
    if (!gl || !this.program || !this.hazir || !this.kaynak || yerlesimler.length === 0) return false;
    if (this.tuval.width !== W || this.tuval.height !== H) {
      this.tuval.width = W;
      this.tuval.height = H;
    }
    if (this.kaynakVideo) this.dokuyuYukle();
    gl.viewport(0, 0, W, H);
    gl.useProgram(this.program);
    gl.uniform1i(this.konumlar.doku, 0);
    gl.uniform2f(this.konumlar.boyut, W, H);
    const n = Math.min(yerlesimler.length, EN_COK_DUVAR);
    gl.uniform1f(this.konumlar.duvarSayisi, n);
    // Teğet düzleminde (u, v) = (sol + (sağ−sol)·fx, alt + (üst−alt)·fy + k·(üst−alt)/2); yön = u·sağ + v·yukarı − normal.
    // k (yukseklikKaydirma) ufku k·H/2 aşağı indirir: eski "ny + k" ile ve 3B kamera eğimiyle aynı satır.
    const k = this.kayit?.yukseklikKaydirma ?? 0;
    for (let i = 0; i < n; i++) {
      const iz = yerlesimler[i].izdusum;
      const yatay = iz.sag - iz.sol;
      const dikey = iz.ust - iz.alt;
      const v0 = iz.alt + (k * dikey) / 2;
      for (let e = 0; e < 3; e++) {
        this.duvarA[i * 3 + e] = yatay * iz.sagEksen[e];
        this.duvarB[i * 3 + e] = dikey * iz.yukariEksen[e];
        this.duvarC[i * 3 + e] = iz.sol * iz.sagEksen[e] + v0 * iz.yukariEksen[e] - iz.normal[e];
      }
    }
    gl.uniform3fv(this.konumlar.duvarA, this.duvarA);
    gl.uniform3fv(this.konumlar.duvarB, this.duvarB);
    gl.uniform3fv(this.konumlar.duvarC, this.duvarC);
    gl.uniform1f(this.konumlar.yawKaydirma, ((this.kayit?.yawKaydirma ?? 0) * Math.PI) / 180);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    hedef.drawImage(this.tuval, 0, 0);
    return true;
  }
}
