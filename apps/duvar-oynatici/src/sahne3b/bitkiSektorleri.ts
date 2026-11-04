/**
 * Arazi bitkilerinin (kaya, çalı, ot) azimut sektörlerine bölünmesi ve hücre başına sıkı görüş piramidi denetimi
 * (saf, THREE'siz; testli).
 *
 * Neden: her bitki türü tek bir InstancedMesh'ti ve izleyicinin çevresine 360° yayıldığı için ayıklanamıyordu
 * (frustumCulled = false): üç duvar kamerası ve güneşin gölge kamerası bütün örnekleri çiziyordu (Iris Xe'de
 * kare süresinin ~%75'i). Örnekler 45°'lik sektörlere ve yakın/uzak halkaya bölünür, her hücre kendi mesh'i olur;
 * three hücreyi kamera başına ayıklar.
 *
 * Hücre sınırı küre değil: 45°'lik, 8–148 m'lik bir dilimin en küçük küresi bile (merkez ~84 m, yarıçap ~77 m)
 * izleyicinin hemen önüne kadar uzanır; yan duvarın piramidi onu hiç dışarıda bırakmaz. Bunun yerine örneklerin
 * kapladığı halka dilimini içine alan dışbükey kabuk (5 köşe × 2 yükseklik) piramidin düzlemleriyle denetlenir.
 */

/** Yatay konum (sahne: azimut 0 = −z, sağa +x). */
export interface DuzKonum {
  x: number;
  z: number;
}

/** Örneğin sınır küresi (dünya koordinatı). */
export interface OrnekKuresi {
  x: number;
  y: number;
  z: number;
  r: number;
}

/** Düzlem: n·p + sabit ≥ 0 içeride (THREE.Plane ile aynı biçim; frustum.planes doğrudan verilebilir). */
export interface Duzlem {
  normal: { x: number; y: number; z: number };
  constant: number;
}

/**
 * Azimut sektörü indeksi (0..n−1): sektör k = [−180° + kayma + k·360°/n, −180° + kayma + (k+1)·360°/n) (kayma derece).
 * Ölçüsüz U odada duvar kenarları ±45°/±135°'de: 8 sektör 22,5° kaydırılınca her kenar bir sektörün ortasına düşer,
 * duvar başına 3 hücre görünür (kaymasız: kenardaki örneklerin küreleri yüzünden 4).
 */
export function sektorIndeksi(x: number, z: number, n: number, kayma = 0): number {
  let a = Math.atan2(x, -z) - (kayma * Math.PI) / 180;
  if (a < -Math.PI) a += 2 * Math.PI;
  else if (a >= Math.PI) a -= 2 * Math.PI;
  const k = Math.floor(((a + Math.PI) / (2 * Math.PI)) * n);
  return k < 0 ? 0 : k >= n ? n - 1 : k;
}

/** Halka indeksi: `sinirlar` artan yarıçaplar (m); r < sinirlar[0] → 0, … , r ≥ son sınır → sinirlar.length. */
export function halkaIndeksi(r: number, sinirlar: readonly number[]): number {
  let k = 0;
  while (k < sinirlar.length && r >= sinirlar[k]) k++;
  return k;
}

/**
 * Örnekleri `n` azimut sektörüne (`kayma` derece kaydırılmış) ve isteğe bağlı halka sınırlarına böler. Dönen dizi
 * hücre başına bir liste: hücre = halka·n + sektör (boş hücre boş liste). Her örnek tam bir hücrede, hücre içinde
 * sıra korunur.
 */
export function sektorlereBol<T extends DuzKonum>(yerler: readonly T[], n: number, kayma = 0, halkalar: readonly number[] = []): T[][] {
  const hucreler: T[][] = Array.from({ length: n * (halkalar.length + 1) }, () => []);
  for (const y of yerler) hucreler[halkaIndeksi(Math.hypot(y.x, y.z), halkalar) * n + sektorIndeksi(y.x, y.z, n, kayma)].push(y);
  return hucreler;
}

/**
 * Kürelerin (örnek sınırları) tümünü içine alan dışbükey kabuk: 10 köşe (xyz, art arda). Yatayda halka dilimi
 * [a0 − δ, a1 + δ] × [rIc, rDis] (δ: kürelerin açısal payı); dış yay üç köşeli teğet çizgiyle (yarıçap rDis/cos(Δ/4)),
 * iç kenar kirişle kapatılır; alt ve üst yükseklikte beşer köşe. Dilim yarım düzlemden genişse ya da bir küre
 * izleyicinin dikey eksenini içeriyorsa null (çağıran küre denetimine düşer).
 */
export function kamaKabugu(ornekler: readonly OrnekKuresi[]): Float64Array | null {
  if (ornekler.length === 0) return null;
  // Ortalama yön: açılar ona göre (−π, π] aralığına çekilir (dilim ±180°'yi kesse de doğru)
  let sx = 0;
  let sz = 0;
  for (const o of ornekler) {
    const r = Math.hypot(o.x, o.z);
    if (r <= o.r) return null;
    sx += o.x / r;
    sz += o.z / r;
  }
  if (Math.hypot(sx, sz) < 1e-6 * ornekler.length) return null;
  const orta = Math.atan2(sx, -sz);
  let enAz = Infinity;
  let enCok = -Infinity;
  let rIc = Infinity;
  let rDis = 0;
  let yAlt = Infinity;
  let yUst = -Infinity;
  for (const o of ornekler) {
    const r = Math.hypot(o.x, o.z);
    let fark = Math.atan2(o.x, -o.z) - orta;
    if (fark > Math.PI) fark -= 2 * Math.PI;
    else if (fark <= -Math.PI) fark += 2 * Math.PI;
    const pay = Math.asin(o.r / r);
    if (fark - pay < enAz) enAz = fark - pay;
    if (fark + pay > enCok) enCok = fark + pay;
    if (r - o.r < rIc) rIc = r - o.r;
    if (r + o.r > rDis) rDis = r + o.r;
    if (o.y - o.r < yAlt) yAlt = o.y - o.r;
    if (o.y + o.r > yUst) yUst = o.y + o.r;
  }
  const aci = enCok - enAz;
  if (aci >= Math.PI) return null;
  const a0 = orta + enAz;
  const a1 = orta + enCok;
  const am = (a0 + a1) / 2;
  const dis = rDis / Math.cos(aci / 4);
  const ic = Math.max(0, rIc);
  const duz = [ic * Math.sin(a0), -ic * Math.cos(a0), ic * Math.sin(a1), -ic * Math.cos(a1), dis * Math.sin(a0), -dis * Math.cos(a0), dis * Math.sin(am), -dis * Math.cos(am), dis * Math.sin(a1), -dis * Math.cos(a1)];
  const k = new Float64Array(30);
  for (let i = 0; i < 5; i++) {
    k[i * 3] = duz[i * 2];
    k[i * 3 + 1] = yAlt;
    k[i * 3 + 2] = duz[i * 2 + 1];
    k[15 + i * 3] = duz[i * 2];
    k[15 + i * 3 + 1] = yUst;
    k[15 + i * 3 + 2] = duz[i * 2 + 1];
  }
  return k;
}

/**
 * Kabuk görüş piramidiyle kesişiyor mu (tutucu): köşelerin hepsi tek bir düzlemin dışındaysa false (görünmez),
 * değilse true. Dışbükey kabukta "bütün köşeler dışarıda" kabuğun tamamının dışarıda olması demektir.
 */
export function kabukPiramitte(duzlemler: readonly Duzlem[], kabuk: Float64Array): boolean {
  for (let d = 0; d < duzlemler.length; d++) {
    const p = duzlemler[d];
    const nx = p.normal.x;
    const ny = p.normal.y;
    const nz = p.normal.z;
    const c = p.constant;
    let disarida = true;
    for (let i = 0; i < kabuk.length; i += 3) {
      if (nx * kabuk[i] + ny * kabuk[i + 1] + nz * kabuk[i + 2] + c >= 0) {
        disarida = false;
        break;
      }
    }
    if (disarida) return false;
  }
  return true;
}

/**
 * Kesik dağılımdan örnek sayısı payı: yerleşim r = r0 + u^us · (rEnCok − r0), u ∈ [0, 1] (yakına yoğun). Sınıfın en uzak
 * mesafesi `sinir` ise u ≤ uSinir = ((sinir − r0)/(rEnCok − r0))^(1/us): yakındaki yoğunluk aynı kalsın diye örnek
 * sayısı bu payla çarpılır, u da [0, uSinir] aralığından çekilir.
 */
export function kesikPay(r0: number, rEnCok: number, sinir: number, us: number): number {
  if (!(sinir < rEnCok) || rEnCok <= r0) return 1;
  if (sinir <= r0) return 0;
  return Math.pow((sinir - r0) / (rEnCok - r0), 1 / us);
}
