/**
 * Gök maskesi (saf, DOM'suz): panoramanın hangi piksellerinin gökyüzü olduğunu bulur. Kapalı hava, yağmur ve sis
 * panoramayı değiştirmeden gökte yapılır (`gokOrtusu.ts`): mevcut 24 panorama ve yerleşim planları aynen kalır.
 *
 * Yöntem: zenit bandından (≥ 50°) başlayan, kenarda duran taşma doldurma. Komşu piksele yalnız renk adımı küçükse
 * ve iki piksellik kenar haritası düzse geçilir (ağaç, dağ, bina silueti keskin; gök gradyanı yumuşak). Yeşil ve
 * doygun pikseller (yaprak) ile ufkun 3°'den fazla altı hiç gök olmaz; gecede aydınlık bina ve lamba da. İkinci geçiş
 * her satırın gök rengi profiline uzak pikselleri dışarıda bırakır (puslu uzak dağ, güneşli cephe). Sonra gökle
 * çevrili, zemine değmeyen delikler (güneş diski, kuş, tel, bulut) göğe katılır ve kenar bir piksel yumuşatılır.
 * Ufka değen bulutlar ve hale dışarıda kalabilir; gök örtüsü onları ufuk pusuyla örter.
 *
 * 24 panoramada denendi (3 Kasım): açık arazi/dağlık/üs ≥ %86 gök, ormanda tepe boşlukları, meskûn mahalde bina
 * siluetleri doğru. Beton tavanlı üs kış gündüz panoraması yanlış (tavan gök sanılıyor): manifestte `gok: false`.
 *
 * Girdi dik RGBA (üst satır +90°), çıktı aynı düzende 0–255 tek kanal. İşçide panorama başına bir kez (2048×1024 ≈ 60 ms).
 */

export interface GokMaskesi {
  genislik: number;
  yukseklik: number;
  /** Dik düzende (ilk satır zenit) 0–255. */
  veri: Uint8Array;
  /** Gök piksellerinin oranı (ufkun üstündeki alana göre, 0–1); ormanda düşük, açık arazide yüksek. */
  oran: number;
}

/** Komşu adımı eşiği (0–1 sRGB, kanal başına en büyük fark), 1024 genişlikte; genişlikle ters orantılı ölçeklenir. */
const ADIM_ESIGI_1024 = 0.05;
/** Kenar haritası eşiği (iki piksellik açıklıkta kanal farkı; açıklık genişlikle ölçeklenir). */
const KENAR_ESIGI = 0.1;

function satirYuksekligi(y: number, h: number): number {
  return 90 - ((y + 0.5) / h) * 180;
}

export function gokMaskesiHesapla(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): GokMaskesi {
  const n = w * h;
  const r = new Float32Array(n);
  const g = new Float32Array(n);
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    r[i] = rgba[i * 4] / 255;
    g[i] = rgba[i * 4 + 1] / 255;
    b[i] = rgba[i * 4 + 2] / 255;
  }
  const yuk = new Float32Array(h);
  for (let y = 0; y < h; y++) yuk[y] = satirYuksekligi(y, h);

  // Zenit bandının parlaklığı: gece göğü karanlık, gündüz parlak; aday eşiği buna göre (göreli)
  let refY = 0;
  let refN = 0;
  for (let y = 0; y < h && yuk[y] > 55; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      refY += 0.2126 * r[i] + 0.7152 * g[i] + 0.0722 * b[i];
      refN++;
    }
  refY = refN ? refY / refN : 0.5;
  const gece = refY < 0.08;

  const aday = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    if (yuk[y] < -3) continue;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const R = r[i];
      const G = g[i];
      const B = b[i];
      const enb = Math.max(R, G, B);
      const enk = Math.min(R, G, B);
      const doygunluk = enb > 0 ? (enb - enk) / enb : 0;
      const yaprak = G > R * 1.04 && G > B * 1.02 && doygunluk > 0.12;
      if (yaprak) continue;
      const Y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
      if (!gece && Y < refY * 0.3) continue;
      // Gece göğü karanlık ve düz: aydınlatılmış bina, lamba ve ay ışığındaki kar ondan belirgin parlak
      if (gece && Y > Math.max(refY * 2.5, refY + 0.05)) continue;
      aday[i] = 1;
    }
  }

  // Kenar haritası: iki piksel ötedeki komşularla en büyük renk farkı. Uzak, puslu dağ gibi yumuşak siluetler komşu
  // adımında (tek piksel) eşiği aşmaz ama birkaç piksellik açıklıkta belirgindir; gök gradyanı orada da küçük kalır.
  const ar = Math.max(1, Math.round((2 * w) / 1024));
  /** Yalnız kenar haritası yüzünden aday olmayan pikseller (siluetin iki yanındaki şerit; aşağıda göğe büyütülür). */
  const kenarda = new Uint8Array(n);
  const fark = (i: number, j: number) => Math.max(Math.abs(r[i] - r[j]), Math.abs(g[i] - g[j]), Math.abs(b[i] - b[j]));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!aday[i]) continue;
      const sol = y * w + ((x - ar + w) % w);
      const sag = y * w + ((x + ar) % w);
      let e = fark(sol, sag);
      if (y >= ar && y < h - ar) e = Math.max(e, fark(i - ar * w, i + ar * w));
      if (e > KENAR_ESIGI) {
        aday[i] = 0;
        kenarda[i] = 1;
      }
    }
  }

  const esik = (ADIM_ESIGI_1024 * 1024) / w;
  const kuyruk = new Int32Array(n);
  /**
   * Zenit bandından taşma doldurma; `uygun` ek aday koşulu (ikinci geçişte satır profili). Zenitle bağı olmayan gök
   * parçaları (ağaçların arasında kalan gök) dışarıda kalır: profile yakın pikselden tohum denendi (3 Kasım), açık
   * renkli cepheye ve gövdelere taştı.
   */
  const doldur = (uygun: (i: number, y: number) => boolean): Uint8Array => {
    const gok = new Uint8Array(n);
    let bas = 0;
    let son = 0;
    for (let y = 0; y < h && yuk[y] > 50; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (aday[i] && uygun(i, y)) {
          gok[i] = 1;
          kuyruk[son++] = i;
        }
      }
    const komsu = (i: number, j: number, y: number) => {
      if (gok[j] || !aday[j] || !uygun(j, y)) return;
      if (fark(i, j) > esik) return;
      gok[j] = 1;
      kuyruk[son++] = j;
    };
    while (bas < son) {
      const i = kuyruk[bas++];
      const y = (i / w) | 0;
      const x = i - y * w;
      komsu(i, y * w + ((x + 1) % w), y);
      komsu(i, y * w + ((x + w - 1) % w), y);
      if (y > 0) komsu(i, i - w, y - 1);
      if (y < h - 1) komsu(i, i + w, y + 1);
    }
    return gok;
  };
  const ilk = doldur(() => true);

  // Satır profili: her satırdaki gök piksellerinin ortalama rengi. Ufka yakın puslu dağ (özellikle gece) kenar
  // haritasından geçebilir ama aynı yükseklikteki gerçek göğe göre belirgin koyu/farklıdır. Gök pikseli olmayan
  // satır bir üsttekinin profilini alır. İkinci geçiş profilden uzak pikselleri dışarıda bırakır (bulut gibi uzak
  // ama gökle çevrili bölgeler aşağıda delik olarak geri gelir).
  const pr = new Float32Array(h);
  const pg = new Float32Array(h);
  const pb = new Float32Array(h);
  for (let y = 0; y < h; y++) {
    let sr = 0;
    let sg = 0;
    let sb = 0;
    let say = 0;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!ilk[i]) continue;
      sr += r[i];
      sg += g[i];
      sb += b[i];
      say++;
    }
    if (say >= w * 0.02) {
      pr[y] = sr / say;
      pg[y] = sg / say;
      pb[y] = sb / say;
    } else if (y > 0) {
      pr[y] = pr[y - 1];
      pg[y] = pg[y - 1];
      pb[y] = pb[y - 1];
    }
  }
  const profilFarki = (i: number, y: number) => Math.max(Math.abs(r[i] - pr[y]), Math.abs(g[i] - pg[y]), Math.abs(b[i] - pb[y]));
  const profilTol = (y: number) => Math.max(0.04, 0.22 * Math.max(pr[y], pg[y], pb[y]));
  const gok = doldur((i, y) => profilFarki(i, y) <= profilTol(y));
  // Kenar şeridi: kenar haritası siluetin gök tarafında ~ar piksellik bir şeridi de dışarıda bırakır; kapalı havada
  // orada panoramanın açık göğü ince bir hale olarak kalıyordu. Gökle komşu, satır profiline yakın şerit pikselleri
  // ar+1 adımda göğe katılır (koyu ağaç/dağ profilden uzak olduğundan katılmaz).
  for (let adim = 0; adim <= ar; adim++) {
    const eklenecek: number[] = [];
    for (let y = 1; y < h - 1; y++) {
      const tol = Math.max(0.04, 0.22 * Math.max(pr[y], pg[y], pb[y]));
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (gok[i] || !kenarda[i]) continue;
        if (!gok[y * w + ((x + 1) % w)] && !gok[y * w + ((x + w - 1) % w)] && !gok[i - w] && !gok[i + w]) continue;
        if (Math.max(Math.abs(r[i] - pr[y]), Math.abs(g[i] - pg[y]), Math.abs(b[i] - pb[y])) > tol) continue;
        eklenecek.push(i);
      }
    }
    if (eklenecek.length === 0) break;
    for (const i of eklenecek) gok[i] = 1;
  }

  let bas = 0;
  let son = 0;

  // Delik doldurma: zemine (ufkun 3° altı) bağlı olmayan gök dışı bölgeler göğe katılır
  const zemineBagli = new Uint8Array(n);
  bas = 0;
  son = 0;
  for (let y = 0; y < h; y++) {
    if (yuk[y] >= -3) continue;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!gok[i]) {
        zemineBagli[i] = 1;
        kuyruk[son++] = i;
      }
    }
  }
  const zKomsu = (j: number) => {
    if (gok[j] || zemineBagli[j]) return;
    zemineBagli[j] = 1;
    kuyruk[son++] = j;
  };
  while (bas < son) {
    const i = kuyruk[bas++];
    const y = (i / w) | 0;
    const x = i - y * w;
    zKomsu(y * w + ((x + 1) % w));
    zKomsu(y * w + ((x + w - 1) % w));
    if (y > 0) zKomsu(i - w);
    if (y < h - 1) zKomsu(i + w);
  }

  // Bir piksellik yumuşatma (3×3 kutu), yatayda sarmalı
  const veri = new Uint8Array(n);
  let gokSayisi = 0;
  let ustAlan = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let t = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = Math.min(h - 1, Math.max(0, y + dy));
        for (let dx = -1; dx <= 1; dx++) {
          const j = yy * w + ((x + dx + w) % w);
          t += gok[j] || !zemineBagli[j] ? 1 : 0;
        }
      }
      const i = y * w + x;
      veri[i] = Math.round((t / 9) * 255);
      if (yuk[y] > 0) {
        ustAlan++;
        if (veri[i] > 127) gokSayisi++;
      }
    }
  }
  return { genislik: w, yukseklik: h, veri, oran: ustAlan ? gokSayisi / ustAlan : 0 };
}
