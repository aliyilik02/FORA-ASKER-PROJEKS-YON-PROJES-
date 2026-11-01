/**
 * Çatışma sistemi (3B): izli mermiler ve ateş alışverişi.
 *
 *  - Düşman ateşi: panelde seçilen yönden (uzak, 150–260 m) salvolar hâlinde gelen izli mermiler;
 *    yere çarpınca toz ve kıvılcım, bazıları seker; vızıltı/çarpma sesi sahne azimutuyla (stereo / çok kanal ses motorda).
 *  - Dost ateşi: sahnedeki silahlı figürler düşman yönüne karşılık verir: namlu alevi + giden iz + atış sesi.
 *  - Klasik "izli mermi" ayarı (duvar + yön + sıklık) da burada sürekli akış olarak çizilir: kaynak seçilen
 *    duvarın ortası yönünde uzakta, "yön" iz doğrultusunu döndürür (0 izleyiciye doğru, ±90 önünden yandan geçer).
 *  - Uzak kaynak sırt/tepe arkasında kalırsa kaynak, mermi araziyi aşacak kadar yükselir (arazide kaybolmaz).
 *  - Başın ~6 m yakınından geçen düşman mermisi bir kez ses hızı üstü "çat" sesi verir.
 * İzler tek bir instanced kutu mesh'idir (katkı karışımı, parlak; baş beyazımsı, kuyruk sönük); yön hız
 * vektöründen gelir, uzaktaki iz piksel altına inmesin diye kalınlığı mesafeyle büyür.
 */
import * as THREE from "three";
import { VARSAYILAN_PIKSEL_ACISI, izKalinligi, izUzunlukCarpani, izliYolu, kaynakYukseltmesi, yakinGecis, type IzliYol } from "./izliYol";
import type { ParcacikSistemi } from "./parcaciklar";
import { ZEMIN_Y, azimutYon, konumAzimutu, radyan, zeminY } from "./uzay";

interface Iz {
  p: THREE.Vector3;
  v: THREE.Vector3;
  kalan: number; // saniye
  renk: THREE.Color;
  dost: boolean;
  sekti: boolean;
  /** Ses hızı üstü "çat" sesi bu iz için çaldı mı (izleyicinin yakınından geçiş). */
  catladi: boolean;
}

/**
 * Ses geri çağrılarının konum argümanı: sahne azimutu (derece; 0 = orta duvar, sağa artı, ±180 arka), stereo pan
 * (−1..1) değil. Yerleşimi ses motoru yapar (stereoda pan = sin(azimut), çok kanalda hoparlör kazançları). İkisi de
 * sayı olduğundan ayrı (markalı) tip: düz number ya da Math.sin(...) gibi pan değeri geçilirse derleme hatası verir
 * (yoksa bütün çatışma sesleri sessizce ortaya toplanırdı; çalışma anı denetimi `catismaSesleri.test.ts`). Değer
 * `sesAzimutu(konum)` ya da `azimutDerece(derece)` ile üretilir; çalışma anında düz sayıdır.
 */
export type AzimutDerece = number & { readonly __birim: "sahneAzimutuDerece" };
/** Sahne azimutu (derece) → ses argümanı (yalnız tip işareti, değer aynen). */
const azimutDerece = (azimut: number) => azimut as AzimutDerece;
/** Sahne konumunun izleyiciden azimutu (derece) → ses argümanı. */
const sesAzimutu = (p: THREE.Vector3) => konumAzimutu(p) as AzimutDerece;

export interface CatismaSesleri {
  /** Yakına çarpan/vızıldayan mermi (çarpma noktasının azimutu). */
  carpma: (azimut: AzimutDerece) => void;
  /** Tek atış sesi (atıcının azimutu); uzak = düşman tarafı. */
  atis: (azimut: AzimutDerece, uzak: boolean) => void;
  /** Ağır çatışmada düşman hattında rastgele uzak patlama (azimut, sahne). */
  uzakPatlama?: (azimut: AzimutDerece) => void;
  /** Tank top atışı sesi (tankın azimutu). */
  topAtisi?: (azimut: AzimutDerece) => void;
}

export interface AgirSilahKonumu {
  konum: THREE.Vector3;
  namlu: THREE.Vector3;
  yon: THREE.Vector3;
}

export interface CatismaAyari {
  aktif: boolean;
  siddet: number;
  /** Düşman cephesi, sahne azimutu (derece). */
  azimut: number;
  dostAtes: boolean;
}

export interface IzliAyari {
  aktif: boolean;
  /** Kaynak yönü: seçilen duvarın ortası (sahne azimutu, derece). */
  azimut: number;
  /** İz doğrultusu (derece, −90..90): 0 izleyiciye doğru, ±90 önünden yandan geçer (+ sağdan sola). */
  yon: number;
  siklik: number;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
/** Ses hızı üstü "çat" mesafesi (m): düşman mermisi izleyicinin başının bu kadar yakınından geçince. */
const CATLAMA_MESAFESI = 6;
/** İzlerin hafif düşüşü (m/sn²): guncelle'deki sekmemiş iz yer çekimi (0,15 g) ile aynı; izli akış nişanda karşılar. */
const IZ_DUSUSU = 9.8 * 0.15;
/** İz köşe renkleri z boyunca (örnek rengiyle çarpılır): baş sıcak ve beyazımsı, kuyruk sönük kızıl. */
const IZ_BAS = [1.1, 1.4, 2.0];
const IZ_KUYRUK = [0.3, 0.18, 0.1];
const _yon = new THREE.Vector3();
const _yakin = new THREE.Vector3();
const _kaynak = new THREE.Vector3();
const _hiz = new THREE.Vector3();
const _gorunum = new THREE.Vector4();
const KAPASITE = 320;
const DUSMAN_RENK = new THREE.Color(1.0, 0.5, 0.18);
const DOST_RENK = new THREE.Color(0.9, 0.85, 0.45);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _ileri = new THREE.Vector3(0, 0, 1);

export class CatismaSistemi {
  readonly grup = new THREE.Group();
  private readonly mesh: THREE.InstancedMesh;
  private izler: Iz[] = [];
  private ayar: CatismaAyari = { aktif: false, siddet: 0.5, azimut: 0, dostAtes: true };
  private izli: IzliAyari = { aktif: false, azimut: 0, yon: 0, siklik: 3 };
  private izliBirikim = 0;
  /** Biten izler havuza döner (iz başına nesne üretilmez); yeniler ilerletme döngüsünün dışında listeye alınır. */
  private havuz: Iz[] = [];
  private eklenecek: Iz[] = [];
  private readonly yol: IzliYol = { sx: 0, sy: 0, sz: 0, hx: 0, hy: 0, hz: 0 };
  /** Bir pikselin açısı (radyan); son karede çizilen duvarların en büyüğü. Uzak izin kalınlığı buna göre. */
  private pikselAcisi = VARSAYILAN_PIKSEL_ACISI;
  /** Bu karede çizilen duvarlardan ölçülen en büyük piksel açısı (0: henüz ölçülmedi); guncelle devralır. */
  private olculenPikselAcisi = 0;
  private dusmanSalvoSayac = 0;
  private dusmanSalvoKalan = 0;
  private dusmanAtisSayac = 0;
  private uzakPatlamaSayac = 20;
  private dostSayaclar = new Map<number, number>();
  /** Silahlı dost figürlerin dünya konumları (ayak hizası). Dışarıdan her karede sağlanır. */
  dostlar: () => THREE.Vector3[] = () => [];
  /** Ağır silahlar (tank): namlu ucu ve yönüyle. */
  agirSilahlar: () => AgirSilahKonumu[] = () => [];
  private topSayaclar = new Map<number, number>();
  private mermiler: Array<{ p: THREE.Vector3; v: THREE.Vector3; kalan: number; hedefAz: number }> = [];
  /** Gündüz izler soluk, gece parlak (0 gece – 1 gündüz). */
  set isik(v: number) {
    (this.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - v * 0.5;
  }

  constructor(
    private readonly parcaciklar: ParcacikSistemi,
    private readonly sesler: CatismaSesleri,
  ) {
    const g = new THREE.BoxGeometry(1, 1, 1);
    g.translate(0, 0, -0.5); // z ekseninde geriye uzanan iz: baş noktası kutunun önünde
    // Baş kuyruktan parlak: köşe rengi z boyunca (tek örneklenmiş mesh, ek çizim yok)
    const konum = g.getAttribute("position");
    const koseRenkleri = new Float32Array(konum.count * 3);
    for (let i = 0; i < konum.count; i++) {
      const t = konum.getZ(i) + 1; // 0 kuyruk … 1 baş
      for (let j = 0; j < 3; j++) koseRenkleri[i * 3 + j] = IZ_KUYRUK[j] + (IZ_BAS[j] - IZ_KUYRUK[j]) * t;
    }
    g.setAttribute("color", new THREE.BufferAttribute(koseRenkleri, 3));
    const m = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.mesh = new THREE.InstancedMesh(g, m, KAPASITE);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 25;
    // Piksel açısı her duvarın izdüşümü ve çözünürlüğünden; sonraki karenin kalınlığına girer. elements[0] = 2/(sağ−sol),
    // elements[5] = 2/(üst−alt) (teğet, simetrik olmayan duvar piramidinde de; kayma elements[8]/[9]'da): piksel
    // başına teğet = piksel açısı optik eksende, eksenden uzakta daha küçük, yani alt sınır güvenli. Ölçülmüş odada
    // (`?oda=`) duvarların uzaklığı ve piksel en/boy oranı farklı olabilir: yatay/dikey ve duvarlar arasında en büyüğü
    // (her duvarda en az ~1,5 px). Ölçüsüz yerleşimde üç duvar aynı, pikseller kare: değer öncekiyle aynı.
    this.mesh.onBeforeRender = (renderer, _sahne, kamera) => {
      const e = (kamera as THREE.PerspectiveCamera).projectionMatrix.elements;
      renderer.getCurrentViewport(_gorunum);
      if (e[0] > 0 && e[5] > 0 && _gorunum.z > 0 && _gorunum.w > 0) {
        const p = Math.max(2 / (e[0] * _gorunum.z), 2 / (e[5] * _gorunum.w));
        if (p > this.olculenPikselAcisi) this.olculenPikselAcisi = p;
      }
    };
    this.grup.add(this.mesh);
  }

  get aktifIzSayisi() {
    return this.izler.length;
  }

  catismaAyarla(a: CatismaAyari) {
    this.ayar = a;
  }
  izliAyarla(a: IzliAyari) {
    this.izli = a;
  }

  private izEkle(p: THREE.Vector3, v: THREE.Vector3, dost: boolean, sekti = false) {
    const iz = this.havuz.pop() ?? { p: new THREE.Vector3(), v: new THREE.Vector3(), kalan: 0, renk: DUSMAN_RENK, dost: false, sekti: false, catladi: false };
    iz.p.copy(p);
    iz.v.copy(v);
    iz.kalan = 3;
    iz.renk = dost ? DOST_RENK : DUSMAN_RENK;
    iz.dost = dost;
    iz.sekti = sekti;
    iz.catladi = false;
    this.eklenecek.push(iz);
  }

  /** Bekleyen yeni izleri listeye alır; kapasite doluysa en eski iz havuza döner. */
  private eklenenleriAl() {
    for (let i = 0; i < this.eklenecek.length; i++) {
      if (this.izler.length >= KAPASITE) this.havuz.push(this.izler.shift()!);
      this.izler.push(this.eklenecek[i]);
    }
    this.eklenecek.length = 0;
  }

  /** Düşman tarafından bir atış: uzak kaynaktan hedefe doğru. */
  private dusmanAtis(kaynakAzimut: number, hedefAzimutYayilim: number) {
    const kaynakYon = azimutYon(kaynakAzimut + rnd(-10, 10));
    const kaynak = kaynakYon.clone().multiplyScalar(rnd(150, 260));
    kaynak.y = Math.max(ZEMIN_Y, zeminY(kaynak.x, kaynak.z)) + rnd(0.8, 4);
    // Hedef: dost figürlerin yakını ya da izleyici önündeki zemin; %35'i üstten/yan geçer
    const dostlar = this.dostlar();
    let hedef: THREE.Vector3;
    const r = Math.random();
    if (dostlar.length && r < 0.5) {
      const d = dostlar[Math.floor(Math.random() * dostlar.length)];
      hedef = new THREE.Vector3(d.x + rnd(-3, 3), 0, d.z + rnd(-3, 3));
      hedef.y = zeminY(hedef.x, hedef.z) + (Math.random() < 0.6 ? 0 : rnd(0.3, 1.6));
    } else if (r < 0.85) {
      const az = kaynakAzimut + rnd(-hedefAzimutYayilim, hedefAzimutYayilim);
      const yon = azimutYon(az);
      const mesafe = rnd(3, 24);
      hedef = new THREE.Vector3(yon.x * mesafe, 0, yon.z * mesafe);
      hedef.y = zeminY(hedef.x, hedef.z);
    } else {
      // İzleyicinin yanından/üstünden geçen: arkadaki bir nokta
      const az = kaynakAzimut + 180 + rnd(-35, 35);
      const yon = azimutYon(az);
      const mesafe = rnd(8, 30);
      hedef = new THREE.Vector3(yon.x * mesafe, 0, yon.z * mesafe);
      hedef.y = zeminY(hedef.x, hedef.z) + rnd(1.5, 6);
    }
    kaynak.y += this.araziAsimi(kaynak, hedef);
    const v = hedef.clone().sub(kaynak).normalize().multiplyScalar(rnd(140, 190));
    this.izEkle(kaynak, v, false);
    // Düşman hattında namlu parıltısı (uzak, kısa) ve uzak atış sesi
    if (Math.random() < 0.6) this.parcaciklar.parlama(kaynak, rnd(1.5, 2.5));
    if (Math.random() < 0.35) this.sesler.atis(sesAzimutu(kaynak), true);
  }

  /** Kaynak → hedef doğrusu araziyi aşsın diye kaynağın yükseltilmesi (m; düz zeminde 0). */
  private araziAsimi(kaynak: THREE.Vector3, hedef: THREE.Vector3): number {
    const y = this.yol;
    y.sx = kaynak.x;
    y.sy = kaynak.y;
    y.sz = kaynak.z;
    y.hx = hedef.x;
    y.hy = hedef.y;
    y.hz = hedef.z;
    return kaynakYukseltmesi(y, zeminY);
  }

  /**
   * Klasik izli mermi akışından bir atış. Kaynak: seçilen duvarın ortası yönünde (±10°) 150–300 m'de, yerden birkaç
   * metre yukarıda. Hedef dağılımı dusmanAtis ile aynı (yakına çarpar, seker, bir kısmı üstten geçer). `yon` ≠ 0 ise
   * bu doğru izleyicinin 10–60 m önündeki bir eksen noktası etrafında döndürülür (izliYolu): ±90'da mermiler önden
   * yana geçip görüş dışına uçar (+ sağdan sola, − soldan sağa); hedef yükseltilir ki yere dalmasın (çarpmadıkça).
   * Kaynak yüksekliği döndürülmüş konumun zemininden; arada sırt/tepe varsa mermi onu aşacak kadar yukarıdan gelir.
   */
  private izliAtis(kaynakAzimut: number, yon: number) {
    const y = this.yol;
    const kaynakAz = kaynakAzimut + rnd(-10, 10);
    const a = radyan(kaynakAz);
    const r = rnd(150, 300);
    y.sx = Math.sin(a) * r;
    y.sz = -Math.cos(a) * r;
    const dostlar = this.dostlar();
    const secim = Math.random();
    if (dostlar.length && secim < 0.5) {
      const d = dostlar[Math.floor(Math.random() * dostlar.length)];
      y.hx = d.x + rnd(-3, 3);
      y.hz = d.z + rnd(-3, 3);
      y.hy = zeminY(y.hx, y.hz) + (Math.random() < 0.6 ? 0 : rnd(0.3, 1.6));
    } else {
      // Yakın zemin ya da (%15) izleyicinin yanından/üstünden geçip arkaya
      const arka = secim >= 0.85;
      const ha = radyan(kaynakAz + (arka ? 180 + rnd(-35, 35) : rnd(-20, 20)));
      const m = arka ? rnd(8, 30) : rnd(3, 24);
      y.hx = Math.sin(ha) * m;
      y.hz = -Math.cos(ha) * m;
      y.hy = zeminY(y.hx, y.hz) + (arka ? rnd(1.5, 6) : 0);
    }
    y.hy += (Math.min(90, Math.abs(yon)) / 90) * rnd(1.2, 4.5);
    if (yon !== 0) izliYolu(y, yon, 10 + 25 * (Math.random() + Math.random()));
    y.sy = Math.max(ZEMIN_Y, zeminY(y.sx, y.sz)) + rnd(0.8, 4);
    y.sy += kaynakYukseltmesi(y, zeminY);
    _kaynak.set(y.sx, y.sy, y.sz);
    const hiz = rnd(140, 190);
    _hiz.set(y.hx - y.sx, y.hy - y.sy, y.hz - y.sz);
    const mesafe = _hiz.length();
    _hiz.multiplyScalar(hiz / mesafe);
    // İzlerin hafif düşüşü önceden karşılanır: mermi hedefine varır (yakına çarpar, başın yanından geçer),
    // 40–60 m önde yere gömülmez
    _hiz.y += 0.5 * IZ_DUSUSU * (mesafe / hiz);
    this.izEkle(_kaynak, _hiz, false);
    // Kaynakta namlu parıltısı (uzak, kısa) ve uzak atış sesi
    if (Math.random() < 0.6) this.parcaciklar.parlama(_kaynak, rnd(1.5, 2.5));
    if (Math.random() < 0.35) this.sesler.atis(sesAzimutu(_kaynak), true);
  }

  /**
   * İz bu karede (p0 → p) izleyicinin başının ~6 m yakınından geçtiyse ses hızı üstü "çat" (iz başına bir kez),
   * geçiş noktasının yönünden. Yere çarpacak mermi çatlamaz, çarpma sesi yeter (yakinGecis).
   */
  private catlamaDenetle(iz: Iz, x0: number, y0: number, z0: number) {
    const dx = iz.p.x - x0;
    const dy = iz.p.y - y0;
    const dz = iz.p.z - z0;
    const t = yakinGecis(x0, y0, z0, dx, dy, dz, CATLAMA_MESAFESI);
    if (t < 0) return;
    iz.catladi = true;
    this.sesler.carpma(sesAzimutu(_yakin.set(x0 + dx * t, y0 + dy * t, z0 + dz * t)));
  }

  private dostAtis(konum: THREE.Vector3) {
    const dusman = azimutYon(this.ayar.azimut + rnd(-6, 6));
    const namlu = konum.clone();
    namlu.y += 1.35;
    namlu.addScaledVector(dusman, 0.6);
    this.parcaciklar.parlama(namlu, 0.45);
    const hedef = dusman.clone().multiplyScalar(rnd(160, 240));
    hedef.y = ZEMIN_Y + rnd(0, 3);
    const v = hedef.sub(namlu).normalize().multiplyScalar(rnd(160, 200));
    this.izEkle(namlu, v, true);
    this.sesler.atis(sesAzimutu(konum), false);
  }

  /** Tank top atışı: büyük parlama + namlu dumanı + hızlı parlak mermi; düşman hattında patlama ile biter. */
  private topAtisi(t: AgirSilahKonumu) {
    const yonDuz = t.yon.clone().setY(0).normalize();
    const hedefAz = (Math.atan2(yonDuz.x, -yonDuz.z) * 180) / Math.PI;
    this.parcaciklar.parlama(t.namlu, 2.2);
    for (let i = 0; i < 10; i++) {
      this.parcaciklar.duman.ekle({
        x: t.namlu.x + rnd(-0.3, 0.3),
        y: t.namlu.y + rnd(-0.2, 0.3),
        z: t.namlu.z + rnd(-0.3, 0.3),
        vx: yonDuz.x * rnd(4, 9) + rnd(-1, 1),
        vy: rnd(0.5, 2),
        vz: yonDuz.z * rnd(4, 9) + rnd(-1, 1),
        boyut: rnd(0.6, 1.2),
        buyume: rnd(1.2, 2.2),
        alfa: rnd(0.3, 0.5),
        aci: rnd(0, 6.28),
        donus: rnd(-1, 1),
        t: 0,
        sure: rnd(1.5, 3),
        renk: [0.75, 0.7, 0.62],
        yercekimi: -0.2,
        surtunme: 1.6,
      });
    }
    const v = yonDuz.clone().multiplyScalar(320);
    v.y = 2;
    this.mermiler.push({ p: t.namlu.clone(), v, kalan: rnd(0.55, 0.8), hedefAz });
    this.izEkle(t.namlu, v, true);
    this.sesler.topAtisi?.(sesAzimutu(t.konum));
  }

  private carpma(iz: Iz) {
    const p = iz.p;
    const yakin = p.length() < 26;
    if (yakin) {
      // Toz + birkaç kıvılcım; sekme %30
      for (let i = 0; i < 5; i++) {
        this.parcaciklar.duman.ekle({
          x: p.x + rnd(-0.2, 0.2),
          y: zeminY(p.x, p.z) + 0.05,
          z: p.z + rnd(-0.2, 0.2),
          vx: rnd(-0.6, 0.6),
          vy: rnd(0.8, 2.2),
          vz: rnd(-0.6, 0.6),
          boyut: rnd(0.25, 0.5),
          buyume: rnd(0.5, 1),
          alfa: rnd(0.3, 0.55),
          aci: rnd(0, 6.28),
          donus: rnd(-1, 1),
          t: 0,
          sure: rnd(0.6, 1.3),
          renk: [0.6, 0.52, 0.4],
          yercekimi: 0.4,
          surtunme: 1.5,
        });
      }
      for (let i = 0; i < 4; i++) {
        const a = rnd(0, 6.28);
        this.parcaciklar.kivilcim.ekle({ x: p.x, y: zeminY(p.x, p.z) + 0.05, z: p.z, vx: Math.cos(a) * rnd(1, 4), vy: rnd(2, 6), vz: Math.sin(a) * rnd(1, 4), boyut: rnd(0.04, 0.09), buyume: 0, alfa: 1, aci: 0, donus: 0, t: 0, sure: rnd(0.25, 0.6), renk: [1, 0.8, 0.5], yercekimi: 9.8, surtunme: 0.3 });
      }
      this.sesler.carpma(sesAzimutu(p));
      if (!iz.sekti && Math.random() < 0.3) {
        const v = iz.v.clone();
        v.y = Math.abs(v.y) * rnd(0.4, 1.2) + rnd(10, 40);
        v.x += rnd(-40, 40);
        v.z += rnd(-40, 40);
        v.setLength(iz.v.length() * rnd(0.4, 0.7));
        this.izEkle(new THREE.Vector3(p.x, zeminY(p.x, p.z) + 0.05, p.z), v, false, true);
      }
    }
  }

  guncelle(dt: number) {
    // --- Düşman ateşi: çatışma salvoları ---
    if (this.ayar.aktif && this.ayar.siddet > 0.02) {
      const s = this.ayar.siddet;
      // Ağır çatışmada düşman hattında ara sıra uzak patlama (havan/top)
      if (s > 0.45 && this.sesler.uzakPatlama) {
        this.uzakPatlamaSayac -= dt;
        if (this.uzakPatlamaSayac <= 0) {
          this.uzakPatlamaSayac = rnd(14, 45) * (1.5 - s);
          this.sesler.uzakPatlama(azimutDerece(this.ayar.azimut + rnd(-40, 40)));
        }
      }
      if (this.dusmanSalvoKalan > 0) {
        this.dusmanAtisSayac -= dt;
        if (this.dusmanAtisSayac <= 0) {
          this.dusmanAtisSayac = rnd(0.07, 0.13);
          this.dusmanSalvoKalan--;
          this.dusmanAtis(this.ayar.azimut, 30);
        }
      } else {
        this.dusmanSalvoSayac -= dt;
        if (this.dusmanSalvoSayac <= 0) {
          this.dusmanSalvoKalan = Math.round(rnd(3, 5 + s * 6));
          this.dusmanSalvoSayac = rnd(0.4, 3.2) * (1.3 - s);
        }
      }
      // --- Tank top atışları (7–16 sn arayla, şiddete göre) ---
      if (this.ayar.dostAtes) {
        this.agirSilahlar().forEach((t, i) => {
          const kalan = (this.topSayaclar.get(i) ?? rnd(2, 6)) - dt;
          if (kalan <= 0) {
            this.topAtisi(t);
            this.topSayaclar.set(i, rnd(7, 16) * (1.3 - s * 0.6));
          } else this.topSayaclar.set(i, kalan);
        });
      }
      // --- Dost ateşi ---
      if (this.ayar.dostAtes) {
        const dostlar = this.dostlar();
        dostlar.forEach((k, i) => {
          const kalan = (this.dostSayaclar.get(i) ?? rnd(0.2, 1.5)) - dt;
          if (kalan <= 0) {
            this.dostAtis(k);
            // Salvo: 3–5 atış hızlı, sonra bekleme
            const seri = (this.dostSayaclar.get(1000 + i) ?? 0) + 1;
            if (seri < Math.round(rnd(3, 5))) {
              this.dostSayaclar.set(1000 + i, seri);
              this.dostSayaclar.set(i, rnd(0.09, 0.16));
            } else {
              this.dostSayaclar.set(1000 + i, 0);
              this.dostSayaclar.set(i, rnd(0.8, 3) * (1.4 - s));
            }
          } else this.dostSayaclar.set(i, kalan);
        });
      }
    }
    // --- Klasik izli mermi akışı ---
    if (this.izli.aktif) {
      this.izliBirikim += dt * this.izli.siklik;
      while (this.izliBirikim >= 1) {
        this.izliBirikim -= 1;
        this.izliAtis(this.izli.azimut, this.izli.yon);
      }
    } else this.izliBirikim = 0;

    // --- Top mermileri: uçuş bitince düşman hattında patlama ---
    for (const m of this.mermiler) {
      m.kalan -= dt;
      if (m.kalan <= 0) this.sesler.uzakPatlama?.(azimutDerece(m.hedefAz + rnd(-3, 3)));
    }
    this.mermiler = this.mermiler.filter((m) => m.kalan > 0);

    // --- İzleri ilerlet (bu karede atılanlar da ilerler; çarpmada doğan sekmeler sonraki karede) ---
    this.eklenenleriAl();
    const izler = this.izler;
    let canli = 0;
    for (let i = 0; i < izler.length; i++) {
      const iz = izler[i];
      iz.kalan -= dt;
      iz.v.y -= 9.8 * dt * (iz.sekti ? 1 : 0.15);
      const x0 = iz.p.x;
      const y0 = iz.p.y;
      const z0 = iz.p.z;
      const yeniY = iz.p.y + iz.v.y * dt;
      iz.p.x += iz.v.x * dt;
      iz.p.z += iz.v.z * dt;
      const zemin = zeminY(iz.p.x, iz.p.z);
      if (yeniY <= zemin + 0.03 && iz.v.y < 0) {
        iz.p.y = zemin + 0.03;
        this.carpma(iz);
        this.havuz.push(iz);
        continue;
      }
      iz.p.y = yeniY;
      if (!iz.catladi && !iz.dost && !iz.sekti) this.catlamaDenetle(iz, x0, y0, z0);
      if (iz.kalan > 0 && iz.p.length() < 400) izler[canli++] = iz;
      else this.havuz.push(iz);
    }
    izler.length = canli;
    this.eklenenleriAl();

    // --- Çizim verisi: uzaktaki iz piksel altına inip titremesin (kalınlık ve biraz uzunluk mesafeyle büyür) ---
    if (this.olculenPikselAcisi > 0) {
      this.pikselAcisi = this.olculenPikselAcisi;
      this.olculenPikselAcisi = 0;
    }
    const n = Math.min(KAPASITE, izler.length);
    for (let i = 0; i < n; i++) {
      const iz = izler[i];
      const hiz = iz.v.length();
      const taban = iz.dost ? 0.03 : 0.04;
      const kalinlik = izKalinligi(iz.p.length(), taban, this.pikselAcisi);
      const uzunluk = Math.min(4, 0.8 + hiz * 0.014) * izUzunlukCarpani(kalinlik / taban); // yakında ~3 m iz
      _yon.copy(iz.v).multiplyScalar(1 / (hiz || 1));
      _q.setFromUnitVectors(_ileri, _yon);
      _s.set(kalinlik, kalinlik, uzunluk);
      _m.compose(iz.p, _q, _s);
      this.mesh.setMatrixAt(i, _m);
      this.mesh.setColorAt(i, iz.renk);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  temizle() {
    for (let i = 0; i < this.izler.length; i++) this.havuz.push(this.izler[i]);
    for (let i = 0; i < this.eklenecek.length; i++) this.havuz.push(this.eklenecek[i]);
    this.izler.length = 0;
    this.eklenecek.length = 0;
    this.mesh.count = 0;
  }
}
