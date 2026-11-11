/**
 * Açı sınırlı yumuşak normaller (10 Kasım). Meshy bitki/kaya modelleri Blender'da sadeleştirilip yeni UV'ye pişirilince
 * (araclar/model-pisir.py) ağ UV adaları boyunca tamamen parçalanıyor (köşe/üçgen = 3,00) ve düz gölgeli dışa
 * aktarılıyordu: her üçgen ayrı tonla parlıyor, ağaç "kristal/origami" görünüyordu. Burada aynı konumdaki köşeler
 * (UV dikişi yüzünden ayrı kalanlar dahil) komşu yüzlerin alan ağırlıklı normaliyle ortalanır; yüzü kendi normalinden
 * `aciDerece`'den fazla ayrılan komşular katılmaz, gerçek keskin kenar (kaya sırtı) korunur. Köşe/UV/indeks değişmez,
 * yalnız NORMAL özniteliği yazılır.
 */
import type * as THREE from "three";

/** Konum anahtarı: yakın köşeleri (dışa aktarma yuvarlaması) aynı kovaya alır. */
function anahtar(x: number, y: number, z: number, adim: number): string {
  return `${Math.round(x / adim)}|${Math.round(y / adim)}|${Math.round(z / adim)}`;
}

/** Saf hesap: konum dizisi + indeks (yoksa ardışık üçlü) → köşe başına normal (Float32Array, 3 × köşe). */
export function yumusakNormalHesapla(konum: ArrayLike<number>, indeks: ArrayLike<number> | null, aciDerece = 70): Float32Array {
  const kose = konum.length / 3;
  const ucgen = indeks ? indeks.length / 3 : kose / 3;
  const ix = (i: number) => (indeks ? indeks[i] : i);
  // Sınır kutusu → kovalama adımı (boyutun 1e-5'i)
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < konum.length; i++) { const v = konum[i]; if (v < min) min = v; if (v > max) max = v; }
  const adim = Math.max((max - min) * 1e-5, 1e-7);

  // Yüz normalleri (alan ağırlıklı = çapraz çarpım uzunluğu korunur) ve birim normaller
  const yuzN = new Float32Array(ucgen * 3);
  const yuzB = new Float32Array(ucgen * 3);
  for (let f = 0; f < ucgen; f++) {
    const a = ix(f * 3) * 3, b = ix(f * 3 + 1) * 3, c = ix(f * 3 + 2) * 3;
    const ux = konum[b] - konum[a], uy = konum[b + 1] - konum[a + 1], uz = konum[b + 2] - konum[a + 2];
    const vx = konum[c] - konum[a], vy = konum[c + 1] - konum[a + 1], vz = konum[c + 2] - konum[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    yuzN[f * 3] = nx; yuzN[f * 3 + 1] = ny; yuzN[f * 3 + 2] = nz;
    const l = Math.hypot(nx, ny, nz) || 1;
    yuzB[f * 3] = nx / l; yuzB[f * 3 + 1] = ny / l; yuzB[f * 3 + 2] = nz / l;
  }

  // Konum kovası → o konuma dokunan yüzler; köşe → kendi yüzü (paylaşılan köşede ilk yüz)
  const kovalar = new Map<string, number[]>();
  const koseKovasi: (number[] | undefined)[] = new Array(kose);
  const koseYuzu = new Int32Array(kose).fill(-1);
  for (let f = 0; f < ucgen; f++) {
    for (let k = 0; k < 3; k++) {
      const v = ix(f * 3 + k);
      let kova = koseKovasi[v];
      if (!kova) {
        const s = anahtar(konum[v * 3], konum[v * 3 + 1], konum[v * 3 + 2], adim);
        kova = kovalar.get(s);
        if (!kova) { kova = []; kovalar.set(s, kova); }
        koseKovasi[v] = kova;
      }
      kova.push(f);
      if (koseYuzu[v] < 0) koseYuzu[v] = f;
    }
  }

  const esik = Math.cos((aciDerece * Math.PI) / 180);
  const sonuc = new Float32Array(kose * 3);
  for (let v = 0; v < kose; v++) {
    const f = koseYuzu[v];
    const kova = koseKovasi[v];
    if (f < 0 || !kova) { sonuc[v * 3 + 1] = 1; continue; }
    const bx = yuzB[f * 3], by = yuzB[f * 3 + 1], bz = yuzB[f * 3 + 2];
    let x = 0, y = 0, z = 0;
    let onceki = -1;
    for (const g of kova) {
      if (g === onceki) continue; // aynı yüz aynı konuma iki kez dokunmaz ama sıralı tekrarı ucuzca atla
      onceki = g;
      if (bx * yuzB[g * 3] + by * yuzB[g * 3 + 1] + bz * yuzB[g * 3 + 2] < esik) continue;
      x += yuzN[g * 3]; y += yuzN[g * 3 + 1]; z += yuzN[g * 3 + 2];
    }
    const l = Math.hypot(x, y, z);
    if (l < 1e-12) { sonuc[v * 3] = bx; sonuc[v * 3 + 1] = by; sonuc[v * 3 + 2] = bz; continue; }
    sonuc[v * 3] = x / l; sonuc[v * 3 + 1] = y / l; sonuc[v * 3 + 2] = z / l;
  }
  return sonuc;
}

/** Geometrinin NORMAL özniteliğini açı sınırlı yumuşak normalle değiştirir (yerinde). */
export function normalleriYumusat(geometri: THREE.BufferGeometry, aciDerece = 70): void {
  const konum = geometri.getAttribute("position");
  if (!konum || konum.itemSize !== 3 || (konum as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute) return;
  const n = yumusakNormalHesapla(konum.array as ArrayLike<number>, geometri.index ? (geometri.index.array as ArrayLike<number>) : null, aciDerece);
  const mevcut = geometri.getAttribute("normal");
  if (mevcut && mevcut.itemSize === 3 && mevcut.count === konum.count && !(mevcut as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute) {
    (mevcut.array as Float32Array).set(n);
    mevcut.needsUpdate = true;
  } else {
    // three'nin BufferAttribute'u türü (geometri ile aynı modülden) üzerinden: yeni öznitelik
    const Oz = (konum as THREE.BufferAttribute).constructor as typeof THREE.BufferAttribute;
    geometri.setAttribute("normal", new Oz(n, 3));
  }
}
