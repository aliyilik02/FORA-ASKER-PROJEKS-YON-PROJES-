/**
 * Duvar yerleşimi ve projeksiyon matematiği.
 *
 * Dünya, izleyicinin etrafında bir küre gibi düşünülür: her yön bir azimut (yatay açı, derece; 0 = orta
 * duvarın ortası, sola negatif, sağa pozitif) ve ufka göre yükseklik (derece; aşağı negatif) ile tanımlanır.
 *
 * Her duvar, izleyicinin gözünden görülen bir dikdörtgendir ve genelleştirilmiş perspektif izdüşümüyle
 * (Kooima, "Generalized Perspective Projection", 2008) çizilir: duvar düzleminin birim eksenleri (sağ,
 * yukarı, izleyiciye dönük normal) + göze 1 birim uzaklıktaki teğet sınırları (sol, sağ, alt, üst). Sınırlar
 * simetrik olmak zorunda değildir (off-axis): U odada yan duvarlar, düz duvarın üçte birleri, izleyici ortada
 * değilken orta duvar. Ölçüler doğruysa izleyici noktasından bakınca görüntü köşelerde kırılmadan devam eder
 * ve ufuk göz hizasında durur.
 *
 * Koordinatlar `sahne3b/uzay.ts` ile aynı: x sağ, y yukarı, orta duvarın ilerisi -z, göz başlangıç noktasında.
 *
 * İki kaynak:
 *  - ölçüsüz varsayılan (`duvarlariOlustur(fov)`, `?fov=`): duvar i, yaw (i−1)·fov kadar döndürülmüş simetrik
 *    kamera; yatay sınır ±tan(fov/2), dikey sınır duvarın piksel en/boy oranından (±tan(fov/2)·H/w);
 *  - ölçülmüş oda (`odaDuvarlari`, `?oda=`): U oda (sol, ön, sağ duvar) ya da 3 projektörlü düz duvar.
 */

/** Sahne koordinatında vektör [x, y, z]. */
export type Vektor3 = [number, number, number];

/** Duvarın izdüşüm verisi (Kooima): düzlem eksenleri + teğet sınırları. */
export interface DuvarIzdusumu {
  /** Duvar düzleminin birim eksenleri (sahne koordinatı): sağ, yukarı ve izleyiciye dönük normal (kamera +z). */
  sagEksen: Vektor3;
  yukariEksen: Vektor3;
  normal: Vektor3;
  /** Göze 1 birim uzaklıkta teğet sınırları (Kooima l, r, b, t): sol < sag, alt < ust. */
  sol: number;
  sag: number;
  alt: number;
  ust: number;
}

export interface Duvar {
  ad: "sol" | "orta" | "sag";
  /** Eşdeğer yaw: duvar merkezinin göründüğü azimut (derece). İzli mermi çıkışı, HUD ve eski kullanıcılar için. */
  yaw: number;
  /** Duvarın kapsadığı yatay açı (derece): sol ve sağ kenar azimutları arası. */
  fov: number;
  /** Sol kenarın azimutu (derece); duvar [solAzimut, solAzimut + fov] aralığını gösterir. */
  solAzimut: number;
  izdusum: DuvarIzdusumu;
  /** true: dikey sınırlar yerleşimde duvarın piksel en/boy oranından hesaplanır (ölçüsüz varsayılan, `?fov=`). */
  dikeyOrandan: boolean;
}

const DUVAR_ADLARI: ReadonlyArray<Duvar["ad"]> = ["sol", "orta", "sag"];

function radyan(d: number): number {
  return (d * Math.PI) / 180;
}
function derece(r: number): number {
  return (r * 180) / Math.PI;
}

/**
 * Ölçüsüz yerleşim: duvar başına `fov` derece, yaw (i−1)·fov (U duvar 90). Düz tek duvara 3 projektör için
 * `?oda=duz,...` (`odaDuvarlari`) kullanılır: döndürülmüş kameralar düz duvarda yan görüntüleri bozar.
 */
export function duvarlariOlustur(fov: number): Duvar[] {
  const t = Math.tan(radyan(fov / 2));
  return DUVAR_ADLARI.map((ad, i) => {
    const yaw = (i - 1) * fov;
    const c = Math.cos(radyan(yaw));
    const s = Math.sin(radyan(yaw));
    return {
      ad,
      yaw,
      fov,
      solAzimut: yaw - fov / 2,
      dikeyOrandan: true,
      // Kamera y ekseninde -yaw döner: sağ = (cos, 0, sin), normal = (−sin, 0, cos); bakış −normal = azimut yönü
      izdusum: { sagEksen: [c, 0, s], yukariEksen: [0, 1, 0], normal: [-s, 0, c], sol: -t, sag: t, alt: -t, ust: t },
    };
  });
}

/** U duvar: yanlar ortaya dik; izleyici ortada → her duvar 90°. */
export const VARSAYILAN_DUVARLAR: Duvar[] = duvarlariOlustur(90);

/* ------------------------------------------------------------------------------------------------
 * Ölçülmüş oda (?oda=)
 * ---------------------------------------------------------------------------------------------- */

export type OdaTipi = "u" | "duz";

/** Sahada ölçülen oda geometrisi (metre). */
export interface OdaGeometrisi {
  /** "u": sol + ön + sağ duvar (yanlar öne dik); "duz": tek düz duvar, 3 projektör eşit üçte birlere. */
  tip: OdaTipi;
  /** Ön duvar (U) ya da düz duvar genişliği. */
  on: number;
  /** U: yan duvar uzunluğu, ön köşelerden izleyiciye doğru. Düz duvarda kullanılmaz (0). */
  yan: number;
  /** Yansıtılan görüntünün yüksekliği. */
  yukseklik: number;
  /** Görüntü alt kenarının yerden yüksekliği. */
  alt: number;
  /** İzleyicinin ortadan yanal kayması (sağa artı). */
  izleyiciX: number;
  /** İzleyicinin ön duvara uzaklığı. */
  izleyiciZ: number;
  /** Göz yüksekliği (yerden). */
  goz: number;
}

function fark(a: Vektor3, b: Vektor3): Vektor3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function nokta(a: Vektor3, b: Vektor3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function capraz(a: Vektor3, b: Vektor3): Vektor3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function birim(a: Vektor3): Vektor3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

/**
 * Kooima izdüşümü: dikdörtgen duvarın sol-alt (pa), sağ-alt (pb) ve sol-üst (pc) köşeleri, izleyicinin içeriden
 * gördüğü yönde ve göze göre (göz başlangıçta). Teğet sınırları göze 1 birim uzaklığa ölçeklidir.
 */
export function kooimaIzdusumu(pa: Vektor3, pb: Vektor3, pc: Vektor3): DuvarIzdusumu {
  const sagEksen = birim(fark(pb, pa));
  const yukariEksen = birim(fark(pc, pa));
  const normal = birim(capraz(sagEksen, yukariEksen));
  const d = -nokta(pa, normal); // gözün duvar düzlemine uzaklığı
  return {
    sagEksen,
    yukariEksen,
    normal,
    sol: nokta(sagEksen, pa) / d,
    sag: nokta(sagEksen, pb) / d,
    alt: nokta(yukariEksen, pa) / d,
    ust: nokta(yukariEksen, pc) / d,
  };
}

/** Kamera teğet düzleminde ufuk hizasındaki (v = 0) u noktasının azimutu (derece). */
function tegetAzimutu(iz: DuvarIzdusumu, u: number): number {
  const x = u * iz.sagEksen[0] - iz.normal[0];
  const z = u * iz.sagEksen[2] - iz.normal[2];
  return derece(Math.atan2(x, -z));
}

/** İzdüşümden duvar: kenar azimutları ve eşdeğer yaw (dikey duvarda kenarlar sabit azimutlu dikey çizgilerdir). */
function izdusumdenDuvar(ad: Duvar["ad"], izdusum: DuvarIzdusumu): Duvar {
  const solAzimut = tegetAzimutu(izdusum, izdusum.sol);
  let fov = tegetAzimutu(izdusum, izdusum.sag) - solAzimut;
  if (fov <= 0) fov += 360;
  const yaw = tegetAzimutu(izdusum, (izdusum.sol + izdusum.sag) / 2);
  return { ad, yaw, fov, solAzimut, izdusum, dikeyOrandan: false };
}

/**
 * Ölçülmüş odanın üç duvarı (tuvalde soldan sağa). U: sol duvar x = −ön/2 düzleminde ön köşeden `yan` kadar
 * geriye, ön duvar z = −izleyiciZ, sağ duvar x = +ön/2 (izleyici kayması çıkarılmış). Düz: tek düzlem, eşit üçte
 * birler; üç görüntü aynı yöne bakar, sınırları birbirine değer.
 */
export function odaDuvarlari(g: OdaGeometrisi): Duvar[] {
  const altY = g.alt - g.goz; // görüntünün alt kenarı, göze göre
  const ustY = g.alt + g.yukseklik - g.goz;
  const onZ = -g.izleyiciZ;
  const solX = -g.on / 2 - g.izleyiciX;
  const sagX = g.on / 2 - g.izleyiciX;
  if (g.tip === "duz") {
    const ucte = g.on / 3;
    return DUVAR_ADLARI.map((ad, i) => {
      const x0 = solX + i * ucte;
      const x1 = solX + (i + 1) * ucte;
      return izdusumdenDuvar(ad, kooimaIzdusumu([x0, altY, onZ], [x1, altY, onZ], [x0, ustY, onZ]));
    });
  }
  const arkaZ = onZ + g.yan; // yan duvarların izleyici tarafındaki ucu
  return [
    izdusumdenDuvar("sol", kooimaIzdusumu([solX, altY, arkaZ], [solX, altY, onZ], [solX, ustY, arkaZ])),
    izdusumdenDuvar("orta", kooimaIzdusumu([solX, altY, onZ], [sagX, altY, onZ], [solX, ustY, onZ])),
    izdusumdenDuvar("sag", kooimaIzdusumu([sagX, altY, onZ], [sagX, altY, arkaZ], [sagX, ustY, onZ])),
  ];
}

/** Ölçüler makul mü: izleyici duvarların önünde (U'da yan duvarların arasında), boyutlar pozitif ve sınırlı. */
export function odaGecerliMi(g: OdaGeometrisi): boolean {
  if (g.tip !== "u" && g.tip !== "duz") return false;
  if (![g.on, g.yan, g.yukseklik, g.alt, g.izleyiciX, g.izleyiciZ, g.goz].every(Number.isFinite)) return false;
  if (g.on < 0.5 || g.on > 60 || g.yukseklik < 0.2 || g.yukseklik > 20) return false;
  if (g.alt < -2 || g.alt > 10 || g.goz < 0.3 || g.goz > 3) return false;
  if (g.izleyiciZ < 0.2 || g.izleyiciZ > 60) return false;
  if (g.tip === "u") {
    if (g.yan < 0.2 || g.yan > 60) return false;
    // Yan duvarlar görünsün: izleyici iki yan duvar düzleminin arasında (en az 10 cm içeride)
    return Math.abs(g.izleyiciX) <= g.on / 2 - 0.1;
  }
  return Math.abs(g.izleyiciX) <= g.on;
}

/** `?oda=` anahtarları → alanlar. */
const ODA_ANAHTARLARI: Record<string, "on" | "yan" | "yukseklik" | "alt" | "izleyiciX" | "izleyiciZ" | "goz"> = {
  on: "on",
  yan: "yan",
  yuk: "yukseklik",
  alt: "alt",
  x: "izleyiciX",
  z: "izleyiciZ",
  goz: "goz",
};

/**
 * `?oda=` metni → geometri; geçersizse null (çağıran varsayılana düşer). Biçim: tip + virgülle ayrılmış
 * anahtar=değer (metre, ondalık nokta): `u,on=6,yan=4,yuk=3,alt=0.2,x=0,z=3,goz=1.7` ya da
 * `duz,on=9,yuk=2.5,alt=0.3,z=4,goz=1.7`. Zorunlu: on, yuk, z (U'da ayrıca yan); alt 0, x 0, goz 1,7 varsayılır.
 * Bilinmeyen ya da tekrarlanan anahtar, sayı olmayan değer veya makul olmayan ölçü → null.
 */
export function odaGeometrisiCoz(metin: string | null | undefined): OdaGeometrisi | null {
  if (!metin) return null;
  const parcalar = metin.trim().toLowerCase().split(",");
  const tip = parcalar[0].trim();
  if (tip !== "u" && tip !== "duz") return null;
  const d: Partial<Record<keyof OdaGeometrisi, number>> = {};
  for (const ham of parcalar.slice(1)) {
    const p = ham.trim();
    if (!p) continue;
    const esit = p.indexOf("=");
    if (esit <= 0) return null;
    const anahtar = p.slice(0, esit).trim();
    const degerMetni = p.slice(esit + 1).trim();
    if (!Object.hasOwn(ODA_ANAHTARLARI, anahtar) || degerMetni === "") return null;
    const alan = ODA_ANAHTARLARI[anahtar];
    const deger = Number(degerMetni);
    if (d[alan] !== undefined || !Number.isFinite(deger)) return null;
    d[alan] = deger;
  }
  if (d.on === undefined || d.yukseklik === undefined || d.izleyiciZ === undefined) return null;
  if (tip === "u" && d.yan === undefined) return null;
  const g: OdaGeometrisi = {
    tip,
    on: d.on,
    yan: tip === "u" ? (d.yan ?? 0) : 0,
    yukseklik: d.yukseklik,
    alt: d.alt ?? 0,
    izleyiciX: d.izleyiciX ?? 0,
    izleyiciZ: d.izleyiciZ,
    goz: d.goz ?? 1.7,
  };
  return odaGecerliMi(g) ? g : null;
}

function olcuMetni(v: number): string {
  return String(Math.round(v * 1000) / 1000);
}

/** Geometri → `?oda=` metni (milimetreye yuvarlı; `odaGeometrisiCoz` ile geri okunur). */
export function odaGeometrisiYaz(g: OdaGeometrisi): string {
  const p = [g.tip, `on=${olcuMetni(g.on)}`];
  if (g.tip === "u") p.push(`yan=${olcuMetni(g.yan)}`);
  p.push(`yuk=${olcuMetni(g.yukseklik)}`, `alt=${olcuMetni(g.alt)}`, `x=${olcuMetni(g.izleyiciX)}`, `z=${olcuMetni(g.izleyiciZ)}`, `goz=${olcuMetni(g.goz)}`);
  return p.join(",");
}

function trSayi(v: number, basamak = 1): string {
  return (Math.round(v * 10 ** basamak) / 10 ** basamak).toString().replace(".", ",").replace("-", "−");
}

/** HUD ve kalibrasyon için iki satır: geometri ve duvar başına açı aralığı. */
export function geometriOzeti(oda: OdaGeometrisi | null, duvarlar: Duvar[]): [string, string] {
  const m = (v: number) => `${trSayi(v, 2)} m`;
  const geometri = !oda
    ? `Ölçüsüz yerleşim: her duvar ${trSayi(duvarlar[0]?.fov ?? 90)}° (ölçüler ?oda= ya da panel Sistem › Duvar geometrisi ile girilir)`
    : `${oda.tip === "u" ? `U oda · ön ${m(oda.on)} · yan ${m(oda.yan)}` : `Düz duvar · genişlik ${m(oda.on)} (3 × ${m(oda.on / 3)})`} · görüntü ${m(oda.yukseklik)}, alt kenar ${m(oda.alt)} · izleyici: duvara ${m(oda.izleyiciZ)}, yanal ${m(oda.izleyiciX)}, göz ${m(oda.goz)}`;
  const AD: Record<Duvar["ad"], string> = { sol: "sol", orta: "orta", sag: "sağ" };
  const acilar = duvarlar.map((d) => `${AD[d.ad]} ${trSayi(d.fov)}° (${trSayi(d.solAzimut)}° … ${trSayi(d.solAzimut + d.fov)}°)`).join(" · ");
  return [geometri, acilar];
}

/* ------------------------------------------------------------------------------------------------
 * Tuval yerleşimi ve izdüşüm yardımcıları
 * ---------------------------------------------------------------------------------------------- */

/** Tuval üzerindeki bir duvar bölgesi. */
export interface Yerlesim {
  duvar: Duvar;
  indeks: number;
  x: number;
  genislik: number;
  yukseklik: number;
  /** Bu bölgenin izdüşümü (dikey sınırlar çözülmüş): 3B kamera, 2B panorama ve 2B katmanlar bunu kullanır. */
  izdusum: DuvarIzdusumu;
  /** Tuvalde soldaki / sağdaki duvar (köşe ötesi izdüşüm için; `duvarYerlesimleri` bağlar, dış kenarlarda yok). */
  solKomsu?: Yerlesim;
  sagKomsu?: Yerlesim;
}

export function aciNormalize(a: number): number {
  return ((((a + 180) % 360) + 360) % 360) - 180;
}

export function duvarYerlesimleri(W: number, H: number, duvarlar: Duvar[] = VARSAYILAN_DUVARLAR): Yerlesim[] {
  const g = W / duvarlar.length;
  const yerlesimler: Yerlesim[] = duvarlar.map((duvar, indeks) => {
    const iz = duvar.izdusum;
    // Ölçüsüz yerleşim: dikey sınır yatay sınırın duvar piksel oranıyla ölçeklenmiş hâli (kare piksel)
    const yarim = ((iz.sag - iz.sol) / 2) * (H / g);
    const izdusum = duvar.dikeyOrandan ? { ...iz, alt: -yarim, ust: yarim } : iz;
    return { duvar, indeks, x: indeks * g, genislik: g, yukseklik: H, izdusum };
  });
  yerlesimler.forEach((y, i) => {
    y.solKomsu = yerlesimler[i - 1];
    y.sagKomsu = yerlesimler[i + 1];
  });
  return yerlesimler;
}

/** Azimut duvarın yatay açı aralığında mı; `pay` derece tolerans (köşedeki geniş klip iki duvarda da çizilir). */
export function azimutGorunur(azimut: number, duvar: Duvar, pay = 0): boolean {
  const yarim = duvar.fov / 2;
  const sapma = aciNormalize(azimut - duvar.solAzimut - yarim);
  return sapma >= -yarim - pay && sapma <= yarim + pay;
}

/** Ara sonuç: kare döngüsünde ayırma (allocation) olmasın diye tek nesne. */
const teget = { u: 0, v: 0 };

/** Yön → duvar kamerasının teğet düzlemi (u sağa, v yukarı; göze 1 birim). Yön duvar düzleminin önünde değilse false. */
function tegeteIzdusur(azimut: number, yukseklik: number, iz: DuvarIzdusumu): boolean {
  const a = radyan(azimut);
  const e = radyan(yukseklik);
  const ce = Math.cos(e);
  const dx = Math.sin(a) * ce;
  const dy = Math.sin(e);
  const dz = -Math.cos(a) * ce;
  const z = dx * iz.normal[0] + dy * iz.normal[1] + dz * iz.normal[2];
  if (z > -1e-6) return false; // kamera −normal yönüne bakar; düzlemin arkası çizilemez
  teget.u = (dx * iz.sagEksen[0] + dy * iz.sagEksen[1] + dz * iz.sagEksen[2]) / -z;
  teget.v = (dx * iz.yukariEksen[0] + dy * iz.yukariEksen[1] + dz * iz.yukariEksen[2]) / -z;
  return true;
}

function tuvalX(u: number, y: Yerlesim): number {
  const iz = y.izdusum;
  return y.x + ((u - iz.sol) / (iz.sag - iz.sol)) * y.genislik;
}
function tuvalY(v: number, y: Yerlesim): number {
  const iz = y.izdusum;
  return ((iz.ust - v) / (iz.ust - iz.alt)) * y.yukseklik;
}

/** Kenardaki (köşedeki) azimut kayan nokta hatasıyla komşu duvara geçmesin (derece). */
const KENAR_PAYI = 1e-9;

/** Azimut duvarın açı aralığında mı (kenarlar dahil). */
function aralikta(azimut: number, d: Duvar): boolean {
  const s = aciNormalize(azimut - d.solAzimut);
  return s >= -KENAR_PAYI && s <= d.fov + KENAR_PAYI;
}

/**
 * Yönü çizen duvar: azimut `y`nin aralığındaysa `y`; kenarın ötesindeyse o yandaki komşu duvarlardan azimutu
 * içeren (yoksa o yandaki en dış duvar, perspektif uzantısıyla). Köşe ötesindeki yön böylece komşu duvarda
 * çizildiği tuval noktasına düşer: kenarı aşan sprite (bulut, güneş, ağaç, figür gölgesi) iki duvarda aynı yere
 * çizilir, her duvar kendi kırpılmış parçasını gösterir. Duvarın kendi perspektif uzantısı köşede kırılırdı
 * (1920 px'lik 90° duvarda 50°'deki nesne orta duvarda köşeden 184 px, sağ duvarda 154 px ötede); düz duvarda
 * (aynı düzlem) ikisi aynıdır.
 */
function cizenYerlesim(azimut: number, y: Yerlesim): Yerlesim {
  if (aralikta(azimut, y.duvar)) return y;
  const sagda = aciNormalize(azimut - y.duvar.solAzimut - y.duvar.fov / 2) > 0;
  let w = y;
  for (;;) {
    const k = sagda ? w.sagKomsu : w.solKomsu;
    if (!k) return w;
    if (aralikta(azimut, k.duvar)) return k;
    // Komşu ile arada boşluk varsa (bitişik olmayan duvarlar) bu duvarın uzantısı
    const s = aciNormalize(azimut - k.duvar.solAzimut - k.duvar.fov / 2);
    if (sagda ? s <= 0 : s >= 0) return w;
    w = k;
  }
}

/**
 * Azimut bu duvarda görünüyorsa tuval x koordinatı, değilse null. `pay` ile kenar dışı tolerans (derece);
 * `yukseklik` ufka göre açı (dikey duvarda x'i değiştirmez). Perspektif: duvar kenarına doğru derece başına
 * piksel artar, 3B kameralarla aynı izdüşüm. Kenar ötesinde (pay içinde) komşu duvarın tuval noktası
 * (`cizenYerlesim`); dış kenarın ötesinde duvarın perspektif uzantısı.
 */
export function azimutX(azimut: number, y: Yerlesim, pay = 0, yukseklik = 0): number | null {
  if (!azimutGorunur(azimut, y.duvar, pay)) return null;
  const w = cizenYerlesim(azimut, y);
  if (!tegeteIzdusur(azimut, yukseklik, w.izdusum)) return null;
  return tuvalX(teget.u, w);
}

/** Tuval x'inden azimut (ufuk hizasında; dikey duvarda her satırda aynı). Duvar içinde süreklidir (yaw çevresinde). */
export function xAzimut(x: number, y: Yerlesim): number {
  const iz = y.izdusum;
  const u = iz.sol + ((x - y.x) / y.genislik) * (iz.sag - iz.sol);
  return y.duvar.yaw + aciNormalize(tegetAzimutu(iz, u) - y.duvar.yaw);
}

/**
 * Azimutu gösteren duvarı ve x'i bulur. Önce azimutu gerçekten içeren duvar, yoksa (duvarların dışı: arka boşluk)
 * `pay` toleransıyla ilk duvar; x o yandaki dış duvarın perspektif uzantısı.
 */
export function azimutKonum(azimut: number, yerlesimler: Yerlesim[], pay = 0, yukseklik = 0): { x: number; yerlesim: Yerlesim } | null {
  for (const y of yerlesimler) {
    const x = azimutX(azimut, y, 0, yukseklik);
    if (x !== null) return { x, yerlesim: y };
  }
  if (pay > 0) {
    for (const y of yerlesimler) {
      const x = azimutX(azimut, y, pay, yukseklik);
      if (x !== null) return { x, yerlesim: y };
    }
  }
  return null;
}

export interface TuvalNoktasi {
  x: number;
  y: number;
}

/**
 * Yön (azimut, ufka göre yükseklik; derece) → tuval noktası (y üstten). Duvarda (± `pay` derece) görünmüyorsa
 * false. Kenar ötesinde `azimutX` gibi komşu duvarın noktası. Sonuç `cikti`ya yazılır; kare döngüsünde ayırma
 * yapılmaz.
 */
export function yonuIzdusur(azimut: number, yukseklik: number, y: Yerlesim, cikti: TuvalNoktasi, pay = 0): boolean {
  if (!azimutGorunur(azimut, y.duvar, pay)) return false;
  const w = cizenYerlesim(azimut, y);
  if (!tegeteIzdusur(azimut, yukseklik, w.izdusum)) return false;
  cikti.x = tuvalX(teget.u, w);
  cikti.y = tuvalY(teget.v, w);
  return true;
}

export interface Yon {
  azimut: number;
  yukseklik: number;
}

/** Tuval noktası (y üstten) → yön (azimut, ufka göre yükseklik; derece). `yonuIzdusur`un tersi. */
export function tuvaldenYon(x: number, yPiksel: number, y: Yerlesim, cikti: Yon = { azimut: 0, yukseklik: 0 }): Yon {
  const iz = y.izdusum;
  const u = iz.sol + ((x - y.x) / y.genislik) * (iz.sag - iz.sol);
  const v = iz.ust - (yPiksel / y.yukseklik) * (iz.ust - iz.alt);
  const dx = u * iz.sagEksen[0] + v * iz.yukariEksen[0] - iz.normal[0];
  const dy = u * iz.sagEksen[1] + v * iz.yukariEksen[1] - iz.normal[1];
  const dz = u * iz.sagEksen[2] + v * iz.yukariEksen[2] - iz.normal[2];
  cikti.azimut = y.duvar.yaw + aciNormalize(derece(Math.atan2(dx, -dz)) - y.duvar.yaw);
  cikti.yukseklik = derece(Math.atan2(dy, Math.hypot(dx, dz)));
  return cikti;
}

/**
 * Duvarda ufuk (göz hizası) satırı, piksel (üstten): üst/(üst−alt)·H. Ölçüsüz yerleşimde H/2; ölçülmüş odada
 * (görüntü üst kenarı − göz)/görüntü yüksekliği. `kaydirma`: panoramanın `yukseklikKaydirma` değeri (−1..1),
 * ufuk k·H/2 aşağı iner (3B kamera eğimi ve 2B panorama ile aynı).
 */
export function ufukSatiri(y: Yerlesim, kaydirma = 0): number {
  const iz = y.izdusum;
  return (iz.ust / (iz.ust - iz.alt) + kaydirma / 2) * y.yukseklik;
}

/**
 * `azimut` çevresindeki `genislikDerece` açının bu duvardaki piksel genişliği (perspektif: kenara yakın daha
 * geniş). Köşeyi aşan uç komşu duvarın noktasıdır: aynı sprite iki duvarda aynı genişlikte çıkar. Uçlardan biri
 * duvar düzleminin arkasındaysa (çok geniş açı) eşdeğer doğrusal ölçek.
 */
export function aciGenisligi(azimut: number, genislikDerece: number, y: Yerlesim, yukseklik = 0): number {
  const yarim = genislikDerece / 2;
  const x0 = azimutX(azimut - yarim, y, 180, yukseklik);
  const x1 = azimutX(azimut + yarim, y, 180, yukseklik);
  if (x0 === null || x1 === null) return (genislikDerece / y.duvar.fov) * y.genislik;
  return Math.min(Math.abs(x1 - x0), y.genislik * 4);
}

/* ------------------------------------------------------------------------------------------------
 * Ses, güneş, renk ve yardımcılar
 * ---------------------------------------------------------------------------------------------- */

/** Panelden gelen yön (0–359, 0 = karşı/orta, saat yönünde) → azimut (-180..180). */
export function yonAzimut(yon: number): number {
  return aciNormalize(yon);
}

/** Azimut → stereo pan (-1 sol, +1 sağ). Arkadaki sesler de yanlara düşer. */
export function azimutPan(azimut: number): number {
  return Math.sin((aciNormalize(azimut) * Math.PI) / 180);
}

/** Güneşin konumu: 05:45 solda (-90°) doğar, ~12:45 ortada tepede, 19:45 sağda (+90°) batar (14 saatlik yaz günü). */
export function gunesKonumu(saat: number): { azimut: number; yukseklik: number } {
  const t = (saat - 5.75) / 14;
  return { azimut: -90 + t * 180, yukseklik: Math.sin(t * Math.PI) * 65 };
}

export function yumusak(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** 0 (gece) – 1 (tam gündüz). */
export function gunIsigi(saat: number): number {
  return yumusak(-12, 10, gunesKonumu(saat).yukseklik);
}

/** Alacakaranlık yoğunluğu 0–1 (güneş ufka yakınken 1). */
export function alacakaranlik(saat: number): number {
  const e = gunesKonumu(saat).yukseklik;
  return Math.max(0, 1 - Math.abs(e) / 14);
}

export type ZamanDilimi = "gunduz" | "alacakaranlik" | "gece";

export function zamanDilimi(saat: number): ZamanDilimi {
  const e = gunesKonumu(saat).yukseklik;
  if (e > 12) return "gunduz";
  if (e > -12) return "alacakaranlik";
  return "gece";
}

/** Nesne uzaklığı (0 = hemen önde, 1 = ufukta) → zemin y ve ölçek. */
export function mesafeYerlesimi(mesafe: number, ufukY: number, H: number): { y: number; olcek: number } {
  const m = Math.max(0, Math.min(1, mesafe));
  const yakinlik = Math.pow(1 - m, 1.7);
  return { y: ufukY + yakinlik * (H - ufukY) * 0.92, olcek: 0.14 + yakinlik * 1.3 };
}

export type Renk = [number, number, number];

export function karistir(a: Renk, b: Renk, t: number): Renk {
  const k = Math.max(0, Math.min(1, t));
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

export function rgb(c: Renk, alfa = 1): string {
  return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${alfa})`;
}

/** Gece karartması ve mavi ay ışığı tonlaması (taban: ay ışığında siluetler seçilsin). */
export function isikla(c: Renk, isik: number): Renk {
  const k = 0.2 + 0.8 * isik;
  return karistir([c[0] * k, c[1] * k, c[2] * k], [24, 34, 70], (1 - isik) * 0.45);
}

/** Deterministik sözde rastgele sayı üreteci (sahne nesneleri her açılışta aynı yerde). */
export function mulberry32(tohum: number): () => number {
  let a = tohum >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
