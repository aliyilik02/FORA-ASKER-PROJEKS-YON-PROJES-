/**
 * Oynatıcı kalite kademesinin seçimi: adres çubuğu (`?kalite=`) > yerel kayıt > otomatik (ekran kartına göre).
 *
 * Otomatik: ekran kartının adı geçici bir WebGL bağlamından okunur (WEBGL_debug_renderer_info; yoksa RENDERER),
 * bağlam hemen bırakılır (WEBGL_lose_context). Intel entegre kart (Iris Xe, UHD, HD Graphics) → "orta": bitki
 * ayıklaması + tek geçişten sonra dizüstünde (Iris Xe) kırsal hibritte 1920×360'ta ~58 fps, "yuksek" ~54 fps
 * (önce sırasıyla 25 ve 19). Diğer kartlar (sahadaki RTX sınıfı) → "yuksek". Otomatik değer kaydedilmez: kart
 * değişirse (projektör PC'si) yeniden seçilir; elle seçim (panel adresi, ?kalite=, yerel kayıt) hep önceliklidir.
 * `?kalite=otomatik` (panelin varsayılan "Otomatik" seçimi) yerel kaydı siler: panel düğmesiyle bir kez verilen elle
 * kademe sonraki açılışlarda otomatiği ezmesin.
 *
 * Tek çözüm noktası: sonuç main.ts'te Sahne3B'ye verilir; gölge/parçacık/arazi kademesi (KALITE_AYARLARI, ARAZI_KALITE)
 * ve sahne geçişinin küp yüzü ile çözme genişliği (panoramaGecisi.ts KUP_YUZU, yuklemeGenisligi) hep `Sahne3B.kalite`yi
 * okur, ayrıca `?kalite=` ya da yerel kayıt okunmaz.
 */
import type { Kalite } from "./sahne3b/sahne3b";

const KADEMELER: readonly Kalite[] = ["dusuk", "orta", "yuksek"];

/** Ekran kartı adından önerilen kademe: yazılım çizici → dusuk, Intel entegre → orta, diğerleri → yuksek. */
export function ekranKartiKalitesi(ad: string): Kalite {
  if (/swiftshader|basic render|llvmpipe|software/i.test(ad)) return "dusuk";
  return /intel|iris|uhd graphics|hd graphics/i.test(ad) ? "orta" : "yuksek";
}

/**
 * HUD ve günlük için kısa kart adı: ANGLE dizesinden ("ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x000046A8)
 * Direct3D11 vs_5_0 ps_5_0, D3D11)") aygıt adı; tanınmazsa ilk 48 karakter.
 */
export function kartKisaAdi(ad: string): string {
  const m = /^ANGLE \([^,]+,\s*(.+?)(?:\s*\(0x[0-9a-f]+\))?(?:\s+Direct3D|\s+OpenGL|\s+Vulkan|,|\)$)/i.exec(ad);
  const kisa = (m ? m[1] : ad).trim();
  return kisa.length > 48 ? `${kisa.slice(0, 47)}…` : kisa;
}

/** Ekran kartının adı: geçici WebGL bağlamı (ana çizimle aynı güç tercihi), okunur okunmaz bırakılır; olmazsa null. */
export function ekranKartiAdi(): string | null {
  try {
    const tuval = document.createElement("canvas");
    const gl = (tuval.getContext("webgl2", { powerPreference: "high-performance" }) ?? tuval.getContext("webgl", { powerPreference: "high-performance" })) as WebGLRenderingContext | null;
    if (!gl) return null;
    const bilgi = gl.getExtension("WEBGL_debug_renderer_info");
    const ad = String(gl.getParameter(bilgi ? bilgi.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? "");
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return ad || null;
  } catch {
    return null;
  }
}

export interface KaliteSecimi {
  kalite: Kalite;
  /** Otomatik seçildiyse kartın kısa adı (HUD: "kalite orta (otomatik: …)"); elle seçimde null. */
  otomatikKart: string | null;
}

/** `?kalite=otomatik`: yerel kaydı sil, ekran kartına göre seç (panelin "Otomatik" seçeneği). */
export const OTOMATIK_KALITE = "otomatik";

/**
 * Kademe: geçerli `?kalite=` (yerel kayda yazılır) > geçerli yerel kayıt > otomatik. `?kalite=otomatik` yerel kaydı
 * siler ve doğrudan otomatiğe gider. `kartAdi` yalnız otomatikte çağrılır (geçici WebGL bağlamı gereksiz yere
 * açılmasın); null dönerse "yuksek".
 */
export function kaliteSec(
  param: string | null,
  kayit: Pick<Storage, "getItem" | "setItem"> & Partial<Pick<Storage, "removeItem">>,
  kartAdi: () => string | null = ekranKartiAdi,
): KaliteSecimi {
  const gecerli = (d: string | null) => KADEMELER.find((k) => k === d) ?? null;
  const elle = gecerli(param);
  if (elle) {
    try {
      kayit.setItem("kalite", elle);
    } catch {
      /* yerel kayıt kapalı: yalnız bu açılış */
    }
    return { kalite: elle, otomatikKart: null };
  }
  let kayitli: Kalite | null = null;
  try {
    if (param === OTOMATIK_KALITE) kayit.removeItem?.("kalite");
    else kayitli = gecerli(kayit.getItem("kalite"));
  } catch {
    kayitli = null;
  }
  if (kayitli) return { kalite: kayitli, otomatikKart: null };
  const ad = kartAdi();
  if (!ad) return { kalite: "yuksek", otomatikKart: null };
  return { kalite: ekranKartiKalitesi(ad), otomatikKart: kartKisaAdi(ad) };
}
