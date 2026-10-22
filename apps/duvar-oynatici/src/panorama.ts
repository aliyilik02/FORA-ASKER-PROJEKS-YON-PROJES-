/**
 * 360° panorama katmanı (equirectangular resim veya video) → 3 duvara doğru perspektif.
 *
 * Fotogerçekçi içeriğin ana taşıyıcısı: gerçek 360° çekim, yapay zekâ ile üretilmiş panorama
 * veya oyun motorundan alınmış equirectangular render, hepsi aynı dosya biçimiyle gelir.
 * Her duvar için piksel → bakış yönü → panorama UV dönüşümü GPU'da (WebGL) yapılır; böylece
 * U duvarın köşelerinde perspektif kırılmaz ve duvar açıları (yaw/fov) sahada değiştirilebilir.
 */
import type { Yerlesim } from "./projeksiyon";

const VERTEX = `
attribute vec2 a;
void main() { gl_Position = vec4(a, 0.0, 1.0); }
`;

const FRAGMENT = `
precision highp float;
uniform sampler2D doku;
uniform vec2 boyut;        // tuval genişlik/yükseklik
uniform float duvarSayisi;
uniform vec3 duvarlar[8];  // x: yaw (rad), y: fov yarım tanjantı, z: dikey yarım tanjant
uniform float yawKaydirma; // panoramanın döndürülmesi (rad)
uniform float yukseklikKaydirma; // ufuk kaydırma (-1..1)
const float PI = 3.14159265358979;
void main() {
  vec2 p = gl_FragCoord.xy;
  float g = boyut.x / duvarSayisi;
  float i = floor(p.x / g);
  // GLSL ES 1.0: fragment shader'da uniform dizisi değişken indeksle okunamaz → sabit indeks zinciri
  vec3 d = duvarlar[0];
  if (i >= 1.0) d = duvarlar[1];
  if (i >= 2.0) d = duvarlar[2];
  if (i >= 3.0) d = duvarlar[3];
  if (i >= 4.0) d = duvarlar[4];
  if (i >= 5.0) d = duvarlar[5];
  if (i >= 6.0) d = duvarlar[6];
  if (i >= 7.0) d = duvarlar[7];
  float nx = ((p.x - i * g) / g) * 2.0 - 1.0;   // -1..1 duvar içinde
  float ny = (p.y / boyut.y) * 2.0 - 1.0 + yukseklikKaydirma; // alt -1, üst +1
  // Bakış yönü: ileri = +z, sağ = +x, yukarı = +y
  vec3 yon = normalize(vec3(nx * d.y, ny * d.z, 1.0));
  float c = cos(d.x); float s = sin(d.x);
  vec3 dondur = vec3(yon.x * c + yon.z * s, yon.y, -yon.x * s + yon.z * c);
  float azimut = atan(dondur.x, dondur.z) + yawKaydirma;
  float yukseklik = asin(clamp(dondur.y, -1.0, 1.0));
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
  private yuklenen = "";
  private kayit: PanoramaKaydi | null = null;
  private konumlar: Record<string, WebGLUniformLocation | null> = {};
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
      for (const ad of ["doku", "boyut", "duvarSayisi", "duvarlar", "yawKaydirma", "yukseklikKaydirma"]) this.konumlar[ad] = gl.getUniformLocation(p, ad);
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

  /** Aynı dosya zaten yüklüyse hiçbir şey yapmaz. null → katmanı kapat. */
  sec(kayit: PanoramaKaydi | null, kok: string) {
    if (!this.gl) return;
    if (!kayit) {
      this.kapat();
      return;
    }
    const url = /^(https?:|data:|blob:|\/)/.test(kayit.dosya) ? kayit.dosya : kok + kayit.dosya;
    if (url === this.yuklenen) {
      this.kayit = kayit;
      return;
    }
    this.kapat();
    this.yuklenen = url;
    this.kayit = kayit;
    const video = kayit.tip === "video" || /\.(mp4|webm|mov)(\?|$)/i.test(url);
    if (video) {
      const v = document.createElement("video");
      v.src = url;
      v.loop = true;
      v.muted = true;
      v.playsInline = true;
      v.crossOrigin = "anonymous";
      v.addEventListener("canplay", () => {
        if (this.yuklenen !== url) return;
        this.kaynak = v;
        this.kaynakVideo = true;
        this.hazir = true;
        void v.play().catch(() => undefined);
      });
      v.addEventListener("error", () => {
        if (this.yuklenen === url) this.hata = `panorama videosu yüklenemedi: ${url}`;
      });
    } else {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        if (this.yuklenen !== url) return;
        this.kaynak = img;
        this.kaynakVideo = false;
        this.dokuyuYukle();
        this.hazir = true;
      };
      img.onerror = () => {
        if (this.yuklenen === url) this.hata = `panorama resmi yüklenemedi: ${url}`;
      };
      img.src = url;
    }
  }

  kapat() {
    if (this.kaynak instanceof HTMLVideoElement) {
      this.kaynak.pause();
      this.kaynak.src = "";
    }
    this.kaynak = null;
    this.hazir = false;
    this.yuklenen = "";
    this.kayit = null;
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
    gl.uniform1f(this.konumlar.duvarSayisi, yerlesimler.length);
    const dizi = new Float32Array(8 * 3);
    yerlesimler.forEach((y, i) => {
      const yarimFov = (y.duvar.fov * Math.PI) / 360;
      const yatayTan = Math.tan(yarimFov);
      dizi[i * 3] = (y.duvar.yaw * Math.PI) / 180;
      dizi[i * 3 + 1] = yatayTan;
      dizi[i * 3 + 2] = yatayTan * (H / y.genislik);
    });
    gl.uniform3fv(this.konumlar.duvarlar, dizi);
    gl.uniform1f(this.konumlar.yawKaydirma, ((this.kayit?.yawKaydirma ?? 0) * Math.PI) / 180);
    gl.uniform1f(this.konumlar.yukseklikKaydirma, this.kayit?.yukseklikKaydirma ?? 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    hedef.drawImage(this.tuval, 0, 0);
    return true;
  }
}
