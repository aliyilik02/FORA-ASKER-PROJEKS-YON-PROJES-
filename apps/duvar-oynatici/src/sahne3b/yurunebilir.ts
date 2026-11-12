/**
 * Tek yürünebilir zemin (12 Kasım 2026): figürlerin yürüdüğü, koştuğu, yaralı sürüklediği bütün hareketlerin ortak
 * haritası. Önceden her hareket kendi denetimini yapıyordu (mevzi değiştirme düz hat + koridor, sıhhiyeci düz hat + yerel
 * kaçınma, yana koşan halka üstünde kutupsal kaçınma) ve askerler izleyiciden 4–7 m'lik bantta kalıyordu; derinlemesine
 * (izleyiciden uzağa / yakına) hareket için engelin çevresinden dolanan yol ve siper yeri bilgisi yoktu.
 *
 * Izgara: izleyici merkezli kare (yarıçap 32 m, hücre 0,5 m). Hücre türleri:
 *  - katı: sabit engel kutusu (bina, araç, bariyer, kum torbası, sütre eşyası, ayakta yıkılabilir duvar), su (dere) ya da
 *    tırmanılmaz eğim. Engelin boyu saklanır (siper mi, görüşü kapatır mı).
 *  - yasak: izleyicinin çevresi (oda: 3,6 m), duvarların görmediği arka sektör (|azimut| > 138°), ızgara dışı.
 *  - yürünür: yasak değil ve en yakın katı hücrenin kenarına uzaklığı ≥ beden yarıçapı (0,42 m).
 *
 * Saf hesap (three yok): testlerde elle kurulan kutularla sınanır; sahne3b gerçek kutuları toplayıp verir.
 */

export interface EngelKutusu {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Tepesinin zeminden yüksekliği (m): ≤ 1,75 arkasından ateş edilen siper, > 1,25 arkasındakini izleyiciden gizler. */
  boy: number;
}

export interface Nokta {
  x: number;
  z: number;
}

/** Yol ararken kaçınılan hareketli engel (duran figür): daire. */
export interface DinamikEngel extends Nokta {
  r: number;
}

export interface SiperYeri extends Nokta {
  /** Önündeki engelin boyu (m) ve düşman yönünde uzaklığı (m). */
  boy: number;
  ara: number;
}

export interface ZeminAyari {
  yaricap: number;
  hucre: number;
  /** İzleyiciye en yakın yürünebilir uzaklık (m). */
  enYakin: number;
  /** Duvarların gördüğü sektörün yarı açısı (derece). */
  sektor: number;
  /** Tırmanılmaz eğim (m/m). */
  egim: number;
  /** Asker yarıçapı (m): katı hücreden bu kadar açıkta yürünür. */
  beden: number;
}

export const ZEMIN_VARSAYILAN: ZeminAyari = { yaricap: 32, hucre: 0.5, enYakin: 3.6, sektor: 138, egim: 0.8, beden: 0.42 };

/** Arkasından ateş edilebilen siperin boy aralığı (m) ve görüşü kapatan engel boyu. */
export const SIPER_BOYU = { enAz: 0.55, enCok: 1.75 };
const GORUS_KAPATAN = 1.25;

const KOK2 = Math.SQRT2;

export class YurunebilirZemin {
  readonly ayar: ZeminAyari;
  readonly n: number;
  /** 1: katı (engel/su/dik). */
  private readonly kati: Uint8Array;
  /** 1: yasak bölge (izleyici çevresi, arka sektör, ızgara dışı). */
  private readonly yasak: Uint8Array;
  /** Katı hücrede engel boyu (m; su/dik için 0). */
  private readonly boy: Float32Array;
  /** En yakın katı hücreye uzaklık (m). */
  private readonly aciklikHaritasi: Float32Array;
  private readonly siperOnbellek = new Map<number, SiperYeri[]>();
  // Yol arama tamponları (her aramada yeniden ayrılmaz)
  private readonly g: Float32Array;
  private readonly f: Float32Array;
  private readonly gelen: Int32Array;
  private readonly damga: Uint16Array;
  private readonly dinamikDamga: Uint16Array;
  private nesil = 0;

  constructor(kutular: EngelKutusu[], su: ((x: number, z: number) => boolean) | null, zemin: ((x: number, z: number) => number) | null, ayar: Partial<ZeminAyari> = {}) {
    this.ayar = { ...ZEMIN_VARSAYILAN, ...ayar };
    const { yaricap, hucre, enYakin, sektor, egim } = this.ayar;
    const n = (this.n = Math.ceil((2 * yaricap) / hucre));
    this.kati = new Uint8Array(n * n);
    this.yasak = new Uint8Array(n * n);
    this.boy = new Float32Array(n * n);
    this.aciklikHaritasi = new Float32Array(n * n);
    this.g = new Float32Array(n * n);
    this.f = new Float32Array(n * n);
    this.gelen = new Int32Array(n * n);
    this.damga = new Uint16Array(n * n);
    this.dinamikDamga = new Uint16Array(n * n);
    // Kutular: merkezi kutunun içinde kalan hücreler katı
    for (const k of kutular) {
      const i0 = Math.max(0, Math.ceil((k.minX + yaricap) / hucre - 0.5));
      const i1 = Math.min(n - 1, Math.floor((k.maxX + yaricap) / hucre - 0.5));
      const j0 = Math.max(0, Math.ceil((k.minZ + yaricap) / hucre - 0.5));
      const j1 = Math.min(n - 1, Math.floor((k.maxZ + yaricap) / hucre - 0.5));
      // Hücreden dar engel (direk, ince duvar) kaybolmasın: en az merkezine en yakın hücre
      const ii0 = Math.min(i0, Math.max(0, Math.min(n - 1, Math.floor(((k.minX + k.maxX) / 2 + yaricap) / hucre))));
      const ii1 = Math.max(i1, ii0);
      const jj0 = Math.min(j0, Math.max(0, Math.min(n - 1, Math.floor(((k.minZ + k.maxZ) / 2 + yaricap) / hucre))));
      const jj1 = Math.max(j1, jj0);
      for (let j = jj0; j <= jj1; j++) {
        for (let i = ii0; i <= ii1; i++) {
          const c = j * n + i;
          this.kati[c] = 1;
          if (k.boy > this.boy[c]) this.boy[c] = k.boy;
        }
      }
    }
    const sektorRad = (sektor * Math.PI) / 180;
    const yukseklik = zemin ? new Float32Array(n * n) : null;
    for (let j = 0; j < n; j++) {
      const z = (j + 0.5) * hucre - yaricap;
      for (let i = 0; i < n; i++) {
        const x = (i + 0.5) * hucre - yaricap;
        const c = j * n + i;
        const r = Math.hypot(x, z);
        if (r < enYakin || r > yaricap - hucre || Math.abs(Math.atan2(x, -z)) > sektorRad) this.yasak[c] = 1;
        if (!this.kati[c] && su?.(x, z)) this.kati[c] = 1;
        if (yukseklik && zemin) yukseklik[c] = zemin(x, z);
      }
    }
    if (yukseklik) {
      const sinir = egim * hucre;
      for (let j = 1; j < n - 1; j++) {
        for (let i = 1; i < n - 1; i++) {
          const c = j * n + i;
          if (this.kati[c]) continue;
          const y = yukseklik[c];
          if (Math.abs(yukseklik[c - 1] - y) > sinir || Math.abs(yukseklik[c + 1] - y) > sinir || Math.abs(yukseklik[c - n] - y) > sinir || Math.abs(yukseklik[c + n] - y) > sinir) this.kati[c] = 1;
        }
      }
    }
    this.aciklikKur();
  }

  /** İki geçişli uzaklık dönüşümü (komşu h, çapraz h√2): her hücrenin en yakın katı hücreye uzaklığı. */
  private aciklikKur() {
    const { n } = this;
    const h = this.ayar.hucre;
    const a = this.aciklikHaritasi;
    for (let c = 0; c < n * n; c++) a[c] = this.kati[c] ? 0 : 1e6;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const c = j * n + i;
        if (a[c] === 0) continue;
        let d = a[c];
        if (i > 0) d = Math.min(d, a[c - 1] + h);
        if (j > 0) {
          d = Math.min(d, a[c - n] + h);
          if (i > 0) d = Math.min(d, a[c - n - 1] + h * KOK2);
          if (i < n - 1) d = Math.min(d, a[c - n + 1] + h * KOK2);
        }
        a[c] = d;
      }
    }
    for (let j = n - 1; j >= 0; j--) {
      for (let i = n - 1; i >= 0; i--) {
        const c = j * n + i;
        if (a[c] === 0) continue;
        let d = a[c];
        if (i < n - 1) d = Math.min(d, a[c + 1] + h);
        if (j < n - 1) {
          d = Math.min(d, a[c + n] + h);
          if (i < n - 1) d = Math.min(d, a[c + n + 1] + h * KOK2);
          if (i > 0) d = Math.min(d, a[c + n - 1] + h * KOK2);
        }
        a[c] = d;
      }
    }
    // Uzaklık hücre merkezinden katı hücrenin MERKEZİNE ölçüldü; engelin kenarı yarım hücre daha yakındır
    for (let c = 0; c < n * n; c++) a[c] = Math.max(0, a[c] - h / 2);
  }

  private hucreNo(x: number, z: number): number {
    const { yaricap, hucre } = this.ayar;
    const i = Math.floor((x + yaricap) / hucre);
    const j = Math.floor((z + yaricap) / hucre);
    if (i < 0 || j < 0 || i >= this.n || j >= this.n) return -1;
    return j * this.n + i;
  }
  private hucreMerkezi(c: number): Nokta {
    const { yaricap, hucre } = this.ayar;
    return { x: ((c % this.n) + 0.5) * hucre - yaricap, z: (Math.floor(c / this.n) + 0.5) * hucre - yaricap };
  }
  private yurunurHucre(c: number): boolean {
    return c >= 0 && !this.yasak[c] && this.aciklikHaritasi[c] >= this.ayar.beden;
  }

  /** (x, z) yürünebilir mi (engelden beden yarıçapı kadar açıkta, yasak bölge dışında). */
  bos(x: number, z: number): boolean {
    return this.yurunurHucre(this.hucreNo(x, z));
  }
  /** En yakın katı hücreye uzaklık (m); ızgara dışında 0. */
  aciklik(x: number, z: number): number {
    const c = this.hucreNo(x, z);
    return c < 0 ? 0 : this.aciklikHaritasi[c];
  }
  /** (x, z) katı mı ve engelin boyu (m; engel yoksa 0, su/dik eğimde 0). */
  katiMi(x: number, z: number): boolean {
    const c = this.hucreNo(x, z);
    return c >= 0 && this.kati[c] === 1;
  }
  engelBoyu(x: number, z: number): number {
    const c = this.hucreNo(x, z);
    return c < 0 ? 0 : this.boy[c];
  }

  /** Yürünebilir en yakın hücre merkezi (`enCok` m içinde; kendisi yürünürse kendisi); yoksa null. */
  enYakinBos(x: number, z: number, enCok = 2): Nokta | null {
    if (this.bos(x, z)) return { x, z };
    const h = this.ayar.hucre;
    let enIyi: Nokta | null = null;
    let enAz = Infinity;
    const adim = Math.ceil(enCok / h);
    const { yaricap } = this.ayar;
    const i0 = Math.floor((x + yaricap) / h);
    const j0 = Math.floor((z + yaricap) / h);
    for (let dj = -adim; dj <= adim; dj++) {
      for (let di = -adim; di <= adim; di++) {
        const i = i0 + di;
        const j = j0 + dj;
        if (i < 0 || j < 0 || i >= this.n || j >= this.n) continue;
        const c = j * this.n + i;
        if (!this.yurunurHucre(c)) continue;
        const m = this.hucreMerkezi(c);
        const d = Math.hypot(m.x - x, m.z - z);
        if (d <= enCok && d < enAz) {
          enAz = d;
          enIyi = m;
        }
      }
    }
    return enIyi;
  }

  /** Hareketli engelleri bu arama için damgalar (uç noktaların 0,6 m çevresi hariç: figür kendi yerinden çıkabilsin). */
  private dinamikDamgala(dinamik: DinamikEngel[] | undefined, a: Nokta, b: Nokta): number {
    if (++this.nesil >= 65535) {
      this.nesil = 1;
      this.damga.fill(0);
      this.dinamikDamga.fill(0);
    }
    if (!dinamik?.length) return this.nesil;
    const { yaricap, hucre } = this.ayar;
    for (const d of dinamik) {
      const i0 = Math.max(0, Math.floor((d.x - d.r + yaricap) / hucre));
      const i1 = Math.min(this.n - 1, Math.floor((d.x + d.r + yaricap) / hucre));
      const j0 = Math.max(0, Math.floor((d.z - d.r + yaricap) / hucre));
      const j1 = Math.min(this.n - 1, Math.floor((d.z + d.r + yaricap) / hucre));
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const x = (i + 0.5) * hucre - yaricap;
          const z = (j + 0.5) * hucre - yaricap;
          if (Math.hypot(x - d.x, z - d.z) > d.r) continue;
          if (Math.hypot(x - a.x, z - a.z) < 0.6 || Math.hypot(x - b.x, z - b.z) < 0.6) continue;
          this.dinamikDamga[j * this.n + i] = this.nesil;
        }
      }
    }
    return this.nesil;
  }

  private gecilir(c: number, nesil: number): boolean {
    return this.yurunurHucre(c) && this.dinamikDamga[c] !== nesil;
  }

  /** Düz hat yürünebilir mi (yarım hücre adımlarla örneklenir; hareketli engeller dahil). */
  duzYol(a: Nokta, b: Nokta, dinamik?: DinamikEngel[]): boolean {
    return this.duzYolIc(a, b, this.dinamikDamgala(dinamik, a, b));
  }
  private duzYolIc(a: Nokta, b: Nokta, nesil: number): boolean {
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const adim = Math.max(1, Math.ceil(d / (this.ayar.hucre * 0.5)));
    for (let k = 0; k <= adim; k++) {
      const t = k / adim;
      if (!this.gecilir(this.hucreNo(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t), nesil)) return false;
    }
    return true;
  }

  /**
   * a → b yolu (A*, 8 komşu, köşe kesmeden; engele yakın hücre pahalı: yol kum torbasına sürtünmez). Dönen dizi a'yı
   * içermez, son elemanı varış noktasıdır (b yürünür değilse en yakın yürünür hücre). Düz hat açıksa tek nokta. Yol
   * yoksa null.
   */
  yolBul(a: Nokta, b: Nokta, dinamik?: DinamikEngel[]): Nokta[] | null {
    const bas = this.enYakinBos(a.x, a.z, 1.6);
    const son = this.enYakinBos(b.x, b.z, 1.6);
    if (!bas || !son) return null;
    const nesil = this.dinamikDamgala(dinamik, bas, son);
    if (this.duzYolIc(bas, son, nesil)) return [son];
    const { n } = this;
    const h = this.ayar.hucre;
    const c0 = this.hucreNo(bas.x, bas.z);
    const c1 = this.hucreNo(son.x, son.z);
    if (c0 < 0 || c1 < 0) return null;
    const i1 = c1 % n;
    const j1 = Math.floor(c1 / n);
    const sezgi = (c: number) => {
      const di = Math.abs((c % n) - i1);
      const dj = Math.abs(Math.floor(c / n) - j1);
      return h * (Math.max(di, dj) + (KOK2 - 1) * Math.min(di, dj));
    };
    // İkili yığın (f'ye göre)
    const yigin: number[] = [];
    const it = (c: number) => {
      yigin.push(c);
      let k = yigin.length - 1;
      while (k > 0) {
        const u = (k - 1) >> 1;
        if (this.f[yigin[u]] <= this.f[yigin[k]]) break;
        [yigin[u], yigin[k]] = [yigin[k], yigin[u]];
        k = u;
      }
    };
    const cek = (): number => {
      const ust = yigin[0];
      const s = yigin.pop()!;
      if (yigin.length) {
        yigin[0] = s;
        let k = 0;
        for (;;) {
          const l = 2 * k + 1;
          const r = l + 1;
          let m = k;
          if (l < yigin.length && this.f[yigin[l]] < this.f[yigin[m]]) m = l;
          if (r < yigin.length && this.f[yigin[r]] < this.f[yigin[m]]) m = r;
          if (m === k) break;
          [yigin[m], yigin[k]] = [yigin[k], yigin[m]];
          k = m;
        }
      }
      return ust;
    };
    // damga: nesil = açık kümede görüldü; kapalı küme için ayrı işaret (g < 0 olmaz, f'yi -1 yaparız)
    const kapali = new Uint8Array(n * n);
    this.damga[c0] = nesil;
    this.g[c0] = 0;
    this.f[c0] = sezgi(c0);
    this.gelen[c0] = -1;
    it(c0);
    let bulundu = false;
    let sayac = 0;
    while (yigin.length) {
      const c = cek();
      if (kapali[c]) continue;
      kapali[c] = 1;
      if (c === c1) {
        bulundu = true;
        break;
      }
      if (++sayac > 9000) break; // güvenlik: çok uzun arama (kapalı avlu)
      const i = c % n;
      const j = Math.floor(c / n);
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ii = i + di;
          const jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
          const k = jj * n + ii;
          if (kapali[k] || !this.gecilir(k, nesil)) continue;
          // Köşe kesme yok: çaprazda iki yan komşu da geçilir olmalı
          if (di && dj && (!this.gecilir(j * n + ii, nesil) || !this.gecilir(jj * n + i, nesil))) continue;
          const yakinlik = Math.max(0, 1 - this.aciklikHaritasi[k] / 1.2);
          const maliyet = (di && dj ? h * KOK2 : h) * (1 + 0.7 * yakinlik);
          const yeni = this.g[c] + maliyet;
          if (this.damga[k] === nesil && yeni >= this.g[k]) continue;
          this.damga[k] = nesil;
          this.g[k] = yeni;
          this.f[k] = yeni + sezgi(k);
          this.gelen[k] = c;
          it(k);
        }
      }
    }
    if (!bulundu) return null;
    const hucreler: number[] = [];
    for (let c = c1; c !== -1; c = this.gelen[c]) hucreler.push(c);
    hucreler.reverse();
    // İp germe: görülebilen en uzak noktaya düz git
    const noktalar = hucreler.map((c) => this.hucreMerkezi(c));
    noktalar[0] = bas;
    noktalar[noktalar.length - 1] = son;
    const yol: Nokta[] = [];
    let k = 0;
    while (k < noktalar.length - 1) {
      let ileri = noktalar.length - 1;
      while (ileri > k + 1 && !this.duzYolIc(noktalar[k], noktalar[ileri], nesil)) ileri--;
      yol.push(noktalar[ileri]);
      k = ileri;
    }
    return yol;
  }

  /** a'dan başlayıp yolun noktalarından geçen toplam uzunluk (m). */
  static yolUzunlugu(a: Nokta, yol: Nokta[]): number {
    let toplam = 0;
    let p = a;
    for (const q of yol) {
      toplam += Math.hypot(q.x - p.x, q.z - p.z);
      p = q;
    }
    return toplam;
  }

  /**
   * Düşman yönüne (azimut, derece) göre siper yerleri: yürünebilir hücre, düşman yönünde 0,5–1,9 m içindeki ilk katı
   * hücre arkasından ateş edilebilen boyda (0,55–1,75 m: bariyer, kum torbası, araç kaputu, moloz, alçak duvar).
   * Yönün 5 derecelik dilimi başına bir kez hesaplanır.
   */
  siperler(dusmanAzimutu: number): SiperYeri[] {
    const dilim = Math.round(dusmanAzimutu / 5);
    const hazir = this.siperOnbellek.get(dilim);
    if (hazir) return hazir;
    const a = (dilim * 5 * Math.PI) / 180;
    const dx = Math.sin(a);
    const dz = -Math.cos(a);
    const { n } = this;
    const h = this.ayar.hucre;
    const liste: SiperYeri[] = [];
    for (let c = 0; c < n * n; c++) {
      if (!this.yurunurHucre(c)) continue;
      // Engele bitişik olmayan hücre siper olamaz (hızlı eleme)
      if (this.aciklikHaritasi[c] > 1.9) continue;
      const m = this.hucreMerkezi(c);
      for (let t = 0.5; t <= 1.9; t += h * 0.5) {
        const k = this.hucreNo(m.x + dx * t, m.z + dz * t);
        if (k < 0 || !this.kati[k]) continue;
        const boy = this.boy[k];
        if (boy >= SIPER_BOYU.enAz && boy <= SIPER_BOYU.enCok) liste.push({ x: m.x, z: m.z, boy, ara: t });
        break; // ilk katı hücre belirler (yüksek duvarın dibi siper değil: üstünden ateş edilmez)
      }
    }
    this.siperOnbellek.set(dilim, liste);
    return liste;
  }

  /** İzleyici (merkez) bu noktadaki ayakta figürü görür mü: arada 1,25 m'den yüksek engel yok. */
  izleyiciGorur(x: number, z: number): boolean {
    const d = Math.hypot(x, z);
    const h = this.ayar.hucre * 0.5;
    for (let t = this.ayar.enYakin; t < d - 0.6; t += h) {
      const c = this.hucreNo((x / d) * t, (z / d) * t);
      if (c >= 0 && this.kati[c] && this.boy[c] > GORUS_KAPATAN) return false;
    }
    return true;
  }

  /** Tanı: hücre sayıları. */
  ozet(): { hucre: number; kati: number; yurunur: number } {
    let kati = 0;
    let yurunur = 0;
    for (let c = 0; c < this.n * this.n; c++) {
      if (this.kati[c]) kati++;
      if (this.yurunurHucre(c)) yurunur++;
    }
    return { hucre: this.n * this.n, kati, yurunur };
  }

  /**
   * Tanı: harita satırları (kuzey = izleyicinin önü üstte). `#` yüksek engel, `=` siper boyunda engel, `~` su/dik,
   * `.` yürünür, boşluk yasak/dar; `isaretler` haritaya harf basar. `adim` hücre atlama (1 = her hücre).
   */
  harita(isaretler: Array<Nokta & { harf: string }> = [], adim = 2, yariGenislik = this.ayar.yaricap): string[] {
    const { n } = this;
    const { yaricap, hucre } = this.ayar;
    const satirlar: string[] = [];
    const i0 = Math.max(0, Math.floor((-yariGenislik + yaricap) / hucre));
    const i1 = Math.min(n - 1, Math.floor((yariGenislik + yaricap) / hucre));
    for (let j = 0; j < n; j += adim) {
      const z = (j + 0.5) * hucre - yaricap;
      if (z > 4) break;
      let s = "";
      for (let i = i0; i <= i1; i += adim) {
        const c = j * n + i;
        const x = (i + 0.5) * hucre - yaricap;
        const isaret = isaretler.find((p) => Math.abs(p.x - x) <= (hucre * adim) / 2 && Math.abs(p.z - z) <= (hucre * adim) / 2);
        if (isaret) s += isaret.harf;
        else if (this.kati[c]) s += this.boy[c] > SIPER_BOYU.enCok ? "#" : this.boy[c] >= SIPER_BOYU.enAz ? "=" : "~";
        else s += this.yurunurHucre(c) ? "." : " ";
      }
      satirlar.push(s);
    }
    return satirlar;
  }
}
