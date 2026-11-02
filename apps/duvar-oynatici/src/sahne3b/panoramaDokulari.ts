/**
 * Panorama GPU adımları: equirect'i şeritler hâlinde yükleme, derinliksiz arka plan küpü, küçük kopyadan PMREM.
 *
 * Eski yol: `sahne.background = 8K equirect` → three her panoramada derinlik tamponlu 4096'lık küp kuruyordu (384 MiB renk
 * + 384 MiB derinlik), PMREM 8K'dan 2048'lik küp (2 × 384 MiB, 256 örnekli GGX: 2,15 milyar örnek) ve yalnız
 * `ortamDokusu.dispose()` çağrıldığı için PMREM hedefi hiç bırakılmıyordu (her 8K geçişinde +384 MiB). Burada: equirect
 * kaliteye göre en çok 4×yüz genişliğinde yüklenir ve küpten sonra silinir; küp derinliksizdir; PMREM sabit 1024×512
 * girdiden (256'lık küp, 6 MiB, GGX 36 milyon örnek) ve hedefi `dispose()` ile bırakılır.
 */
import * as THREE from "three";
import { seritSatiri } from "./panoramaGecisi";

/**
 * ImageBitmap'i (GPU satır düzeninde, flipY'li) değişmez bir GL dokusuna şerit şerit yükler. Her `adim()` en çok bir
 * şerit gönderir ve önceki şeridin GPU'da bittiğini (fenceSync) bekler: GPU sürecinin kuyruğu dolmadığından ana iş
 * parçacığı kare başına ~17 ms'den fazla durmaz (Iris Xe, 8 MiB şerit). Doku three'ye `ExternalTexture` olarak verilir;
 * bağlamalar three'nin durum önbelleği (`renderer.state`) üzerinden yapılır ki önbellek bozulmasın.
 */
export class EquirectYukleyici {
  readonly doku: THREE.ExternalTexture;
  readonly genislik: number;
  readonly yukseklik: number;
  private readonly gl: WebGL2RenderingContext;
  private tex: WebGLTexture | null;
  private satir = 0;
  private readonly serit: number;
  private readonly citler: WebGLSync[] = [];
  /** Gönderilen şerit sayısı (ölçüm). */
  seritSayisi = 0;

  /** `ucustaEnCok`: GPU'da aynı anda bitmemiş en çok şerit (çit) sayısı. */
  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private bitmap: ImageBitmap | null,
    private readonly ucustaEnCok = 2,
  ) {
    const gl = renderer.getContext() as WebGL2RenderingContext;
    this.gl = gl;
    const b = bitmap!;
    this.genislik = b.width;
    this.yukseklik = b.height;
    this.serit = seritSatiri(b.width, b.height);
    this.tex = gl.createTexture();
    renderer.state.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.SRGB8_ALPHA8, b.width, b.height);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.doku = new THREE.ExternalTexture(this.tex);
    this.doku.mapping = THREE.EquirectangularReflectionMapping;
    this.doku.colorSpace = THREE.SRGBColorSpace;
    this.doku.minFilter = THREE.LinearFilter;
    this.doku.generateMipmaps = false;
  }

  /**
   * Karede en çok bir şerit; GPU'da bitmemiş şerit (çit) `ucustaEnCok`'a ulaştıysa bekler. Tüm şeritler yüklenip son
   * çit geçince true; bitmap kapatılır.
   */
  adim(): boolean {
    const gl = this.gl;
    while (this.citler.length > 0 && gl.clientWaitSync(this.citler[0], 0, 0) !== gl.TIMEOUT_EXPIRED) gl.deleteSync(this.citler.shift()!);
    const tex = this.tex;
    const bitmap = this.bitmap;
    if (this.satir >= this.yukseklik || !bitmap || !tex) {
      if (this.citler.length > 0) return false;
      this.bitmap?.close();
      this.bitmap = null;
      return true;
    }
    if (this.citler.length >= this.ucustaEnCok) return false;
    const h = Math.min(this.serit, this.yukseklik - this.satir);
    this.renderer.state.bindTexture(gl.TEXTURE_2D, tex);
    // WebGL 2: DOM kaynağından alt dikdörtgen UNPACK_SKIP_ROWS + yükseklikle seçilir (three yüklemede 0 bekler, geri alınır)
    gl.pixelStorei(gl.UNPACK_SKIP_ROWS, this.satir);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, this.satir, this.genislik, h, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
    gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
    this.satir += h;
    this.seritSayisi++;
    const cit = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    if (cit) this.citler.push(cit);
    gl.flush();
    return false;
  }

  /** GL dokusu, çitler ve bitmap bırakılır (küp üretildikten ya da hazırlık iptal edildikten sonra). */
  birak() {
    const gl = this.gl;
    for (const c of this.citler) gl.deleteSync(c);
    this.citler.length = 0;
    this.bitmap?.close();
    this.bitmap = null;
    if (this.tex) {
      // three'nin önbelleğinde bağlı kalmasın: etkin birime bağlanıp çözülür, sonra silinir
      this.renderer.state.bindTexture(gl.TEXTURE_2D, this.tex);
      this.renderer.state.unbindTexture();
      gl.deleteTexture(this.tex);
      this.tex = null;
    }
  }
}

const KUP_VERTEX = /* glsl */ `
varying vec3 vDunyaYonu;
void main() {
  vDunyaYonu = normalize((modelMatrix * vec4(position, 0.0)).xyz);
  #include <begin_vertex>
  #include <project_vertex>
}`;

const KUP_FRAGMENT = /* glsl */ `
uniform sampler2D tEquirect;
varying vec3 vDunyaYonu;
#include <common>
void main() {
  gl_FragColor = texture2D(tEquirect, equirectUv(normalize(vDunyaYonu)));
}`;

/**
 * Equirect → küp: three'nin `WebGLCubeRenderTarget.fromEquirectangularTexture` gölgelendiricisinin aynısı (aynı yön,
 * aynı örnekleme), ama malzeme kalıcı (program bir kez derlenir; three her çağrıda yenisini kurup atıyordu, program da
 * siliniyordu) ve hedef derinliksiz, yüz boyu çağırandan (kalite kademesi).
 */
export class KupDonusturucu {
  private readonly malzeme = new THREE.ShaderMaterial({
    name: "PanoramaKupu",
    uniforms: { tEquirect: { value: null } },
    vertexShader: KUP_VERTEX,
    fragmentShader: KUP_FRAGMENT,
    side: THREE.BackSide,
    blending: THREE.NoBlending,
    depthTest: false,
    depthWrite: false,
  });
  private readonly kutu = new THREE.Mesh(new THREE.BoxGeometry(5, 5, 5), this.malzeme);
  private kamera: THREE.CubeCamera | null = null;

  donustur(renderer: THREE.WebGLRenderer, doku: THREE.Texture, yuz: number): THREE.WebGLCubeRenderTarget {
    const hedef = new THREE.WebGLCubeRenderTarget(yuz, {
      depthBuffer: false,
      generateMipmaps: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      type: THREE.UnsignedByteType,
      colorSpace: THREE.SRGBColorSpace,
    });
    if (!this.kamera) this.kamera = new THREE.CubeCamera(1, 10, hedef);
    this.kamera.renderTarget = hedef;
    this.malzeme.uniforms.tEquirect.value = doku;
    this.kamera.update(renderer, this.kutu);
    this.malzeme.uniforms.tEquirect.value = null;
    return hedef;
  }
}

/** Küçük (1024×512, flipY'li) bitmap'ten PMREM; hedef çağıranda saklanır, takasta `dispose()` ile bırakılır. */
export function pmremUret(pmrem: THREE.PMREMGenerator, kucuk: ImageBitmap): THREE.WebGLRenderTarget {
  const k = new THREE.Texture(kucuk);
  k.mapping = THREE.EquirectangularReflectionMapping;
  k.colorSpace = THREE.SRGBColorSpace;
  k.minFilter = THREE.LinearFilter;
  k.generateMipmaps = false;
  k.flipY = false;
  k.needsUpdate = true;
  const hedef = pmrem.fromEquirectangular(k);
  k.dispose();
  return hedef;
}
