/**
 * Çatışma sistemi (3B): izli mermiler ve ateş alışverişi.
 *
 *  - Düşman ateşi: panelde seçilen yönden (uzak, 150–260 m) salvolar hâlinde gelen izli mermiler;
 *    yere çarpınca toz ve kıvılcım, bazıları seker; vızıltı/çarpma sesi sahne azimutuyla (stereo / çok kanal ses motorda).
 *  - Dost ateşi: sahnedeki silahlı figürler düşman yönüne karşılık verir: namlu alevi + giden iz + atış sesi.
 *  - Klasik "izli mermi" ayarı (duvar + yön + sıklık) da burada sürekli akış olarak çizilir: kaynak seçilen
 *    duvarın ortası yönünde uzakta, "yön" iz doğrultusunu döndürür (0: seçilen duvarın uzağından izleyiciye doğru;
 *    ±90: kaynak komşu duvarın yönüne kayar, mermiler seçilen duvarın önünden yandan geçer).
 *  - Uzak kaynak sırt/tepe arkasında kalırsa kaynak sınırlı yükselir (yerden ≤ 12 m, o yöndeki arazi ufkunun ≤ 1,5°
 *    üstü; düşman ateşinde de): mermi gökten gelmez; doğru yine kapalıysa mermi yamaca çarpar.
 *  - 3B alanda düşman mevzilerdeki atıcılardan ateş eder (pencere, çatı, kaya; dusman.ts): salvonun tamamı aynı
 *    atıcıdan, atıcı aynı mevzide birkaç salvo kalır; dost ateşi ve zırhlı araç o atıcıya nişan alır.
 *  - Başın ~6 m yakınından geçen düşman mermisi bir kez ses hızı üstü "çat" sesi verir. İzli akışın çarpma/"çat"
 *    sesleri saniyede en çok ~1,5 (görüntü aynı).
 * İzler ekran uzayında yumuşak kapsüllerdir (izCizimi.ts: sıcak çekirdek + renkli hale, başta parlak nokta, incelip
 * sönen kuyruk; uzakta en az ~1,5 px). Her mermi izli değildir: çatışmada düşman mermilerinin yarısı, dost mermilerinin
 * üçte biri iz bırakır (gerçekte şeritte 4–5 mermide bir izli vardır); izsiz mermi de çarpar, toz kaldırır, "çat" eder.
 * İzli mermi akışının (panel) her mermisi izlidir.
 */
import * as THREE from "three";
import { IzCizici } from "./izCizimi";
import { AraziUfku, izliKaynakYuksekligi, izliYolu, sirtaTasi, yakinGecis, type IzliYol } from "./izliYol";
import type { ParcacikSistemi } from "./parcaciklar";
import { rastgele } from "../rastgele";
import { ZEMIN_Y, azimutYon, derece, konumAzimutu, radyan, zeminY } from "./uzay";

interface Iz {
  p: THREE.Vector3;
  v: THREE.Vector3;
  kalan: number; // saniye
  renk: THREE.Color;
  dost: boolean;
  sekti: boolean;
  /** Ses hızı üstü "çat" sesi bu iz için çaldı mı (izleyicinin yakınından geçiş). */
  catladi: boolean;
  /** Klasik izli mermi akışından (ya da onun sekmesi): çarpma/"çat" sesi hız sınırına tabi. */
  izli: boolean;
  /**
   * Düşman mevzisine nişanlı dost mermisi: yapı kutusuna takılmaz (kutu cepheden 1–2 m öndedir, iz havada biterdi),
   * ömrü hedefe varış süresidir ve bittiği yerde isabet tozu kalkar (uzakIsabet).
   */
  hedefli: boolean;
  /** İzli mermi: çizilir. İzsiz mermi yalnız benzetilir (çarpma tozu, "çat"). */
  gorunur: boolean;
  /** Parlaklık çarpanı (iz bileşiği mermiden mermiye farklı yanar). */
  guc: number;
  /** Namludan beri gidilen yol (m): iz kuyruğu namlunun gerisine uzamaz. */
  yol: number;
}

/** Mevzideki düşman atıcısı (sahne3b → DusmanKatmani.aticiIste; dusman.ts AticiYaniti ile aynı biçim). */
export interface MevziAticisi {
  /** Namlu ucu (dünya); çağıran kopyalar. */
  konum: THREE.Vector3;
  /** Atıcı doğruldu, ateş edebilir. */
  hazir: boolean;
  no: number;
  /** Figür görünüyor: parıltı namlu boyunda, her atışta; telegraf figürün doğrulmasıdır. */
  siluet: boolean;
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
  /** Tek atış sesi (atıcının azimutu); uzak = düşman tarafı; `mesafe` (m) verilirse namlu sesi mesafe/343 sn gecikir (crack–thump). */
  atis: (azimut: AzimutDerece, uzak: boolean, mesafe?: number) => void;
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
  /** Seçilen duvarın ortası (sahne azimutu, derece): yön 0'da kaynak bu yönde; yön büyüdükçe komşu duvara kayar. */
  azimut: number;
  /**
   * İz doğrultusu (derece, −90..90): 0 mermiler seçilen duvarın uzağından izleyiciye doğru gelir; ±90 mermiler komşu
   * duvar yönünden gelip seçilen duvarın önünden yandan geçer (+ sağdan sola, − soldan sağa).
   */
  yon: number;
  siklik: number;
}

const rnd = (a: number, b: number) => a + rastgele() * (b - a);

/** Ses hızı üstü "çat" mesafesi (m): düşman mermisi izleyicinin başının bu kadar yakınından geçince. */
const CATLAMA_MESAFESI = 6;
/** İzlerin hafif düşüşü (m/sn²): guncelle'deki sekmemiş iz yer çekimi (0,15 g) ile aynı; izli akış nişanda karşılar. */
const IZ_DUSUSU = 9.8 * 0.15;
/**
 * İzli akışın hedef payları: figür yakını %50 (figür varsa), yakın zemin (3–24 m) %20, üstten/yandan geçip arkaya
 * %15, kalanı 28–60 m önde kısa düşer. Yakın zemin önceden %35–85'ti: varsayılan sıklıkta (3/sn) saniyede ~2,7
 * çarpma/"çat" sesi çıkıyordu.
 */
const IZLI_YAKIN_PAYI = 0.2;
const IZLI_UST_PAYI = 0.15;
/** İzli akışın çarpma/"çat" sesleri jeton kovasıyla sınırlı: saniyede en çok IZLI_SES_HIZI, birikim en çok IZLI_SES_KOVASI. */
const IZLI_SES_HIZI = 1.5;
const IZLI_SES_KOVASI = 2;
/** Düşman çatışma mermilerinde izli oranı (salvonun ilk mermisi hep izli) ve dost mermilerinde. */
const DUSMAN_IZLI_ARALIGI = 2;
const DOST_IZLI_ARALIGI = 3;
/** Namlu alevi (kapsül): süre (sn) ve aynı anda en çok. */
const ALEV_SURESI = 0.05;
const ALEV_KAPASITE = 48;
const _yon = new THREE.Vector3();
const _yakin = new THREE.Vector3();
const _kaynak = new THREE.Vector3();
const _hiz = new THREE.Vector3();
const _sekmeKonum = new THREE.Vector3();
const _sekmeHiz = new THREE.Vector3();
const _hedef = new THREE.Vector3();
const KAPASITE = 320;
/** İz halesinin rengi (doğrusal; çekirdek her ikisinde beyaza yakın): düşman kızıl-turuncu, dost sarı. */
const DUSMAN_RENK = new THREE.Color(1.0, 0.34, 0.09);
const DOST_RENK = new THREE.Color(1.0, 0.74, 0.34);

interface Alev {
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
  boyut: number;
  kalan: number;
}

export class CatismaSistemi {
  readonly grup = new THREE.Group();
  /** İzlerin ve namlu alevlerinin çizimi (ekran uzayında kapsül). */
  readonly cizici = new IzCizici(KAPASITE + ALEV_KAPASITE);
  private alevler: Alev[] = [];
  private alevHavuzu: Alev[] = [];
  private dusmanAtisNo = 0;
  private dostAtisNo = 0;
  private izler: Iz[] = [];
  private ayar: CatismaAyari = { aktif: false, siddet: 0.5, azimut: 0, dostAtes: true };
  private izli: IzliAyari = { aktif: false, azimut: 0, yon: 0, siklik: 3 };
  private izliBirikim = 0;
  /** Biten izler havuza döner (iz başına nesne üretilmez); yeniler ilerletme döngüsünün dışında listeye alınır. */
  private havuz: Iz[] = [];
  private eklenecek: Iz[] = [];
  private readonly yol: IzliYol = { sx: 0, sy: 0, sz: 0, hx: 0, hy: 0, hz: 0 };
  /** Arazi ufku (yön kovası başına önbellek): uzak kaynak yükseltmesinin açı sınırı. */
  private readonly ufuk = new AraziUfku();
  /** İzli akış ses jetonları (çarpma/"çat"; bkz. IZLI_SES_HIZI). */
  private izliSesJetonu = IZLI_SES_KOVASI;
  /** Uzak isabet tozu jetonları (saniyede 6, birikim 4; uzakIsabet). */
  private isabetJetonu = 4;
  private dusmanSalvoSayac = 0;
  private dusmanSalvoKalan = 0;
  private dusmanAtisSayac = 0;
  private uzakPatlamaSayac = 20;
  private dostSayaclar = new Map<number, number>();
  /** Silahlı dost figürlerin dünya konumları (ayak hizası). Dışarıdan her karede sağlanır. */
  dostlar: () => THREE.Vector3[] = () => [];
  /**
   * Dost namlu uçları (figür katmanı verir): yalnız nişan almış figürler, namlu elde tutulan tüfekten. Verilmezse eski
   * yol (dostlar() konumu + 1,35 m). `dostAtisOldu` her atışta figüre bildirir (ateş klibi salvoyla eş zamanlı).
   */
  atisNoktalari: (() => Array<{ id: string; namlu: THREE.Vector3 }>) | null = null;
  dostAtisOldu: ((id: string) => void) | null = null;
  private dostSalvolari = new Map<string, { kalan: number; seri: number }>();
  /** Ağır silahlar (tank): namlu ucu ve yönüyle. */
  agirSilahlar: () => AgirSilahKonumu[] = () => [];
  /**
   * 3B alanın düşman mevzilerindeki atıcı (pencere, çatı, kaya; sahne3b → DusmanKatmani.aticiIste): yönün ±`aci`
   * derecesinde mevzi varsa düşman ve izli mermi oradaki atıcıdan ateş eder. "sustu": mevzi var ama susturulmuş ya da
   * baskı altında (ateş yok); null: o yönde mevzi yok (uzak arazi kaynağı). `taraf`: +1 sağ, −1 sol cephe, 0 hepsi.
   * Salvo kanalında salvo başına bir kez, izli kanalında her mermide çağrılır.
   */
  aticiIste: ((azimut: number, aci: number, taraf: number, kanal: "salvo" | "izli", yogunluk: number) => MevziAticisi | "sustu" | null) | null = null;
  /** Atıcı ateş etti (figür parlar, geri teper). false: atıcı artık ateş edemiyor (susturuldu): salvo kesilir. */
  aticiAtisOldu: ((no: number) => boolean) | null = null;
  /** Dost ateşinin nişan alacağı düşman atıcısı (namlu ucu, dünya); yoksa null: eski genel düşman yönü. */
  dostHedefi: (() => THREE.Vector3 | null) | null = null;
  /** Dost ateşi düşman atıcısının üstüne düştü: atıcı birkaç saniye başını kaldıramaz (sahne3b → DusmanKatmani.baskila). */
  dusmanBaskisi: ((p: THREE.Vector3) => void) | null = null;
  /** Mermi izi parçasının ilk çarptığı alan yapısının parametresi (0–1) ya da -1 (sahne3b → AlanKatmani.kesisim). */
  engelKesisimi: ((x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => number) | null = null;
  /** Son düşman kaynağı bir alan mevzisi mi: yükseklik ve sırt düzeltmesi uygulanmaz (pencereden ateş eder). */
  private kaynakMevzi = false;
  private topSayaclar = new Map<number, number>();
  private mermiler: Array<{ p: THREE.Vector3; v: THREE.Vector3; kalan: number; hedefAz: number }> = [];
  /** Gündüz izler soluk, gece parlak (0 gece – 1 gündüz). */
  set isik(v: number) {
    this.cizici.parlaklik = 1 - v * 0.45;
  }

  constructor(
    private readonly parcaciklar: ParcacikSistemi,
    private readonly sesler: CatismaSesleri,
  ) {
    this.grup.add(this.cizici.mesh);
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

  private izEkle(p: THREE.Vector3, v: THREE.Vector3, dost: boolean, sekti = false, izli = false, hedefeSure = 0, gorunur = true) {
    const iz = this.havuz.pop() ?? { p: new THREE.Vector3(), v: new THREE.Vector3(), kalan: 0, renk: DUSMAN_RENK, dost: false, sekti: false, catladi: false, izli: false, hedefli: false, gorunur: true, guc: 1, yol: 0 };
    iz.p.copy(p);
    iz.v.copy(v);
    iz.kalan = hedefeSure > 0 ? hedefeSure : 3;
    iz.renk = dost ? DOST_RENK : DUSMAN_RENK;
    iz.dost = dost;
    iz.sekti = sekti;
    iz.catladi = false;
    iz.izli = izli;
    iz.hedefli = hedefeSure > 0;
    iz.gorunur = gorunur;
    iz.guc = 0.85 + rastgele() * 0.45;
    iz.yol = 0;
    this.eklenecek.push(iz);
  }

  /**
   * Namlu alevi: namludan atış yönüne kısa, kalın ışık kapsülü (50 ms). Yuvarlak parıltı parçacığının yanında aleve
   * yön verir. `boyut` 1 ≈ 35 cm (yakındaki dost tüfeği); uzak düşman namlusunda mesafeyle büyütülür (görünsün diye).
   */
  private namluAlevi(namlu: THREE.Vector3, yon: THREE.Vector3, boyut: number) {
    if (this.alevler.length >= ALEV_KAPASITE) return;
    const a = this.alevHavuzu.pop() ?? { x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 0, boyut: 1, kalan: 0 };
    const u = yon.length() || 1;
    a.x = namlu.x;
    a.y = namlu.y;
    a.z = namlu.z;
    a.dx = yon.x / u;
    a.dy = yon.y / u;
    a.dz = yon.z / u;
    a.boyut = boyut;
    a.kalan = ALEV_SURESI;
    this.alevler.push(a);
  }

  /** İzli akışın bir çarpma/"çat" sesi çalabilir mi (jeton varsa harcar). Düşman/dost ateşi sınırsız. */
  private sesCalabilir(iz: Iz): boolean {
    if (!iz.izli) return true;
    if (this.izliSesJetonu < 1) return false;
    this.izliSesJetonu -= 1;
    return true;
  }

  /** Bekleyen yeni izleri listeye alır; kapasite doluysa en eski iz havuza döner. */
  private eklenenleriAl() {
    for (let i = 0; i < this.eklenecek.length; i++) {
      if (this.izler.length >= KAPASITE) this.havuz.push(this.izler.shift()!);
      this.izler.push(this.eklenecek[i]);
    }
    this.eklenecek.length = 0;
  }

  /** Uzak arazi kaynağı: seçilen yönün ±10°'sinde, 150–260 m'de, zeminin 0,8–4 m üstünde. */
  private uzakKaynak(kaynakAzimut: number): THREE.Vector3 {
    const kaynakYon = azimutYon(kaynakAzimut + rnd(-10, 10));
    const kaynak = kaynakYon.clone().multiplyScalar(rnd(150, 260));
    kaynak.y = Math.max(ZEMIN_Y, zeminY(kaynak.x, kaynak.z)) + rnd(0.8, 4);
    return kaynak;
  }

  /**
   * Salvonun kaynağı (salvo başına bir kez). 3B alanda (meskûn mahal) uzak arazi kaynağı caddenin sonundaki binaların
   * arkasında kalırdı: yönün ±30°'sinde mevzi varsa salvonun tamamı oradaki atıcıdan çıkar (`salvoAtici`; atıcı aynı
   * mevzide birkaç salvo kalır, dusman.ts). Mevzi yoksa uzak arazi. null: mevziler susturulmuş, salvo atılmaz.
   */
  private dusmanKaynagi(kaynakAzimut: number): THREE.Vector3 | null {
    const a = this.aticiIste?.(kaynakAzimut, 30, 0, "salvo", this.ayar.siddet) ?? null;
    this.salvoAtici = null;
    this.kaynakMevzi = a !== null;
    if (a === "sustu") return null;
    if (a) {
      this.salvoAtici = { no: a.no, siluet: a.siluet, konum: a.konum.clone() };
      return this.mevziNamlusu(this.salvoAtici);
    }
    return this.uzakKaynak(kaynakAzimut);
  }

  /** Atıcının bu atıştaki namlu ucu: siluetli atıcıda sabit (figürün tüfeği), eski mevzide küçük titremeyle. */
  private mevziNamlusu(a: { siluet: boolean; konum: THREE.Vector3 }): THREE.Vector3 {
    const k = a.konum.clone();
    return a.siluet ? k : k.add(_yakin.set(rnd(-0.4, 0.4), rnd(-0.3, 0.3), rnd(-0.4, 0.4)));
  }

  /**
   * Siluetli atıcının namlu parıltısı ve sesi: parıltı namlu boyunda (25 m'de ~0,6 m, 90 m'de ~1,2 m; eski mevzi
   * parıltısı 1,5–2,5 m'ydi, figürü örterdi), her atışta; ses mesafe gecikmesiyle (`ilk` her zaman, sonrakiler %35).
   */
  private aticiParlamasi(kaynak: THREE.Vector3, ilk: boolean, yon?: THREE.Vector3) {
    const mesafe = Math.hypot(kaynak.x, kaynak.z);
    this.parcaciklar.parlama(kaynak, Math.max(0.5, Math.min(1.6, 0.35 + mesafe * 0.009)) * rnd(0.85, 1.2), true);
    if (yon) this.namluAlevi(kaynak, yon, Math.max(1.2, Math.min(4, mesafe / 14)));
    if (ilk || rastgele() < 0.35) this.sesler.atis(sesAzimutu(kaynak), true, mesafe);
    // Namlu dumanı: salvodan sonra mevzinin önünde 1–2 sn asılı kalan açık gri bulut (ateşin geldiği yer parıltı
    // söndükten sonra da okunur); atışların üçte birinde tek topak
    if (rastgele() < 0.33) {
      const olcek = Math.max(0.7, Math.min(2.2, mesafe / 35));
      this.parcaciklar.duman.ekle({
        x: kaynak.x,
        y: kaynak.y,
        z: kaynak.z,
        vx: (-kaynak.x / mesafe) * rnd(0.3, 0.9),
        vy: rnd(0.25, 0.6),
        vz: (-kaynak.z / mesafe) * rnd(0.3, 0.9),
        boyut: rnd(0.2, 0.32) * olcek,
        buyume: rnd(0.35, 0.6) * olcek,
        alfa: rnd(0.16, 0.28),
        aci: rnd(0, 6.28),
        donus: rnd(-0.8, 0.8),
        t: 0,
        sure: rnd(1.1, 2.1),
        renk: [0.78, 0.77, 0.74],
        yercekimi: 0,
        surtunme: 1.4,
        engelsiz: true,
      });
    }
  }

  /** Salvo telegrafında belirlenen uzak kaynak: ilk iz oradan çıkar (parıltıyla aynı yer). */
  private salvoKaynak: THREE.Vector3 | null = null;
  /** Salvoyu atan mevzi atıcısı (salvo boyunca aynı); null: uzak arazi kaynağı. */
  private salvoAtici: { no: number; siluet: boolean; konum: THREE.Vector3 } | null = null;
  private salvoIlkAtis = false;

  private dusmanAtis(kaynakAzimut: number, hedefAzimutYayilim: number) {
    const atici = this.salvoAtici;
    let kaynak: THREE.Vector3;
    if (atici) {
      // Atıcı susturulduysa (patlama, baskı ateşi) salvo yarıda kesilir
      if (this.aticiAtisOldu && !this.aticiAtisOldu(atici.no)) {
        this.dusmanSalvoKalan = 0;
        return;
      }
      kaynak = this.mevziNamlusu(atici);
      this.kaynakMevzi = true;
    } else {
      kaynak = this.salvoKaynak ?? this.uzakKaynak(kaynakAzimut);
      this.kaynakMevzi = false;
    }
    this.salvoKaynak = null;
    // Hedef: dost figürlerin yakını (%50, figür varsa), izleyici önündeki zemin; %15'i üstten/yandan geçer
    const dostlar = this.dostlar();
    let hedef: THREE.Vector3;
    const r = rastgele();
    if (dostlar.length && r < 0.5) {
      const d = dostlar[Math.floor(rastgele() * dostlar.length)];
      hedef = new THREE.Vector3(d.x + rnd(-3, 3), 0, d.z + rnd(-3, 3));
      hedef.y = zeminY(hedef.x, hedef.z) + (rastgele() < 0.6 ? 0 : rnd(0.3, 1.6));
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
    if (!this.kaynakMevzi) {
      kaynak.y = this.kaynakYuksekligi(kaynak, hedef);
      // Sınırlı yükseltme yetmediyse (doğru sırtla kapalı) düşman sırt çizgisinden ateş eder (izliYol.sirtaTasi)
      if (this.sirtaTasi()) kaynak.set(this.yol.sx, this.yol.sy, this.yol.sz);
    }
    const v = hedef.clone().sub(kaynak).normalize().multiplyScalar(rnd(140, 190));
    const izli = this.salvoIlkAtis || this.dusmanAtisNo % DUSMAN_IZLI_ARALIGI === 0;
    this.dusmanAtisNo++;
    this.izEkle(kaynak, v, false, false, false, 0, izli);
    if (atici?.siluet) {
      this.aticiParlamasi(kaynak, this.salvoIlkAtis, v);
      this.salvoIlkAtis = false;
      return;
    }
    this.salvoIlkAtis = false;
    // Düşman hattında namlu parıltısı (uzak, kısa) ve uzak atış sesi
    if (rastgele() < 0.6) this.parcaciklar.parlama(kaynak, rnd(1.5, 2.5));
    if (rastgele() < 0.35) this.sesler.atis(sesAzimutu(kaynak), true, Math.hypot(kaynak.x, kaynak.z));
  }

  /**
   * Kaynak → hedef doğrusu araziyi aşsın diye kaynağın sınırlı yükseltilmiş yüksekliği (izliKaynakYuksekligi: yerden
   * ≤ 12 m, o yöndeki arazi ufkunun ≤ 1,5° üstü; düz zeminde değişmez). Doğru `yol`da kalır (sonuç y.sy).
   */
  private kaynakYuksekligi(kaynak: THREE.Vector3, hedef: THREE.Vector3): number {
    const y = this.yol;
    y.sx = kaynak.x;
    y.sy = kaynak.y;
    y.sz = kaynak.z;
    y.hx = hedef.x;
    y.hy = hedef.y;
    y.hz = hedef.z;
    y.sy = izliKaynakYuksekligi(y, zeminY, this.ufuk.tanjant(konumAzimutu(kaynak), zeminY));
    return y.sy;
  }

  /**
   * `yol`daki doğru (sınırlı yükseltmeden sonra) hâlâ kapalıysa kaynağı sırtın tepesine taşır (izliYol.sirtaTasi:
   * izleyiciden ≥ 80 m, sırt zemininin 1,5 m üstü) ve sınırlı yükseltmeyi oradan yeniden uygular (daha yakın tümsek
   * için; 12 m sınırı sırt zeminine göre). Taşındıysa true; yeni kaynak `yol`da.
   */
  private sirtaTasi(): boolean {
    const y = this.yol;
    if (!sirtaTasi(y, zeminY)) return false;
    y.sy = izliKaynakYuksekligi(y, zeminY, this.ufuk.tanjant(derece(Math.atan2(y.sx, -y.sz)), zeminY));
    return true;
  }

  /**
   * Klasik izli mermi akışından bir atış. Kaynak: seçilen duvarın ortası yönünde (±10°) 150–300 m'de, yerden birkaç
   * metre yukarıda. Hedef payları: figür yakını %50 (figür varsa), yakın zemin %20 (yakına çarpar, seker), üstten/
   * yandan geçip arkaya %15, kalanı 28–60 m önde kısa düşer. `yon` ≠ 0 ise doğru izleyicinin 10–60 m önündeki bir
   * eksen noktası etrafında döndürülür (izliYolu): kaynak yana (±90'da komşu duvarın yönüne) kayar, mermiler seçilen
   * duvarın önünden yandan geçip görüş dışına uçar (+ sağdan sola, − soldan sağa); hedef yükseltilir ki yere dalmasın
   * (çarpmadıkça). Hedef yüksekliği döndürülmüş noktanın zemininden (ofsetler korunur), kaynağınki döndürülmüş kaynağın
   * zemininden; arada sırt/tepe varsa kaynak sınırlı yükselir, doğru yine kapalıysa mermi yamaca çarpar.
   */
  private izliAtis(kaynakAzimut: number, yon: number) {
    if (this.izliMevziAtis(kaynakAzimut, yon)) return;
    const y = this.yol;
    const kaynakAz = kaynakAzimut + rnd(-10, 10);
    const a = radyan(kaynakAz);
    const r = rnd(150, 300);
    y.sx = Math.sin(a) * r;
    y.sz = -Math.cos(a) * r;
    // Hedefin yatay konumu ve zeminden yüksekliği (zemin döndürmeden sonra eklenir)
    const dostlar = this.dostlar();
    let secim = rastgele();
    if (dostlar.length) {
      if (secim < 0.5) {
        const d = dostlar[Math.floor(rastgele() * dostlar.length)];
        y.hx = d.x + rnd(-3, 3);
        y.hz = d.z + rnd(-3, 3);
        y.hy = rastgele() < 0.6 ? 0 : rnd(0.3, 1.6);
        secim = -1;
      } else secim -= 0.5;
    }
    if (secim >= 0) {
      // Yakın zemin, izleyicinin yanından/üstünden geçip arkaya ya da kısa düşen
      const arka = secim >= IZLI_YAKIN_PAYI && secim < IZLI_YAKIN_PAYI + IZLI_UST_PAYI;
      const kisa = secim >= IZLI_YAKIN_PAYI + IZLI_UST_PAYI;
      const ha = radyan(kaynakAz + (arka ? 180 + rnd(-35, 35) : rnd(-20, 20)));
      const m = arka ? rnd(8, 30) : kisa ? rnd(28, 60) : rnd(3, 24);
      y.hx = Math.sin(ha) * m;
      y.hz = -Math.cos(ha) * m;
      y.hy = arka ? rnd(1.5, 6) : 0;
    }
    y.hy += (Math.min(90, Math.abs(yon)) / 90) * rnd(1.2, 4.5);
    if (yon !== 0) izliYolu(y, yon, 10 + 25 * (rastgele() + rastgele()));
    y.hy += zeminY(y.hx, y.hz);
    y.sy = Math.max(ZEMIN_Y, zeminY(y.sx, y.sz)) + rnd(0.8, 4);
    y.sy = izliKaynakYuksekligi(y, zeminY, this.ufuk.tanjant(derece(Math.atan2(y.sx, -y.sz)), zeminY));
    // Sınırlı yükseltme yetmediyse (sırt arkasında) kaynak sırtın tepesine: mermi arka yamaca değil izleyiciye gelir
    this.sirtaTasi();
    _kaynak.set(y.sx, y.sy, y.sz);
    const hiz = rnd(140, 190);
    _hiz.set(y.hx - y.sx, y.hy - y.sy, y.hz - y.sz);
    const mesafe = _hiz.length();
    _hiz.multiplyScalar(hiz / mesafe);
    // İzlerin hafif düşüşü önceden karşılanır: mermi hedefine varır (yakına çarpar, başın yanından geçer),
    // 40–60 m önde yere gömülmez
    _hiz.y += 0.5 * IZ_DUSUSU * (mesafe / hiz);
    this.izEkle(_kaynak, _hiz, false, false, true);
    // Kaynakta namlu parıltısı (uzak, kısa) ve uzak atış sesi
    if (rastgele() < 0.6) this.parcaciklar.parlama(_kaynak, rnd(1.5, 2.5));
    if (rastgele() < 0.35) this.sesler.atis(sesAzimutu(_kaynak), true, Math.hypot(_kaynak.x, _kaynak.z));
  }

  /**
   * 3B alanda (meskûn mahal) izli mermi: uzak arazi kaynağı şehirde binalara takılır. Düz akış (|yön| < 20) seçilen
   * duvarın ±30°'sindeki bir pencere/çatı mevzisinden izleyicinin önüne (dost yakını %50, yakın zemin %25, üstten
   * arkaya %25); yan akış caddenin `yön` işaretindeki cephesinden (+ sağ, − sol) karşı kaldırıma çaprazlama, seçilen
   * duvarın ±45°'sinde. Uygun mevzi yoksa false: klasik uzak akış.
   */
  private izliMevziAtis(kaynakAzimut: number, yon: number): boolean {
    if (!this.aticiIste) return false;
    const duz = Math.abs(yon) < 20;
    const a = this.aticiIste(kaynakAzimut, duz ? 30 : 45, duz ? 0 : Math.sign(yon), "izli", this.izli.siklik);
    if (!a) return false;
    // Makineli susturulmuş, baskı altında ya da henüz doğruluyor: bu mermi atılmaz (akışta doğal boşluk)
    if (a === "sustu" || !a.hazir) return true;
    if (this.aticiAtisOldu && !this.aticiAtisOldu(a.no)) return true;
    const kaynak = this.mevziNamlusu(a);
    const hedef = new THREE.Vector3();
    if (duz) {
      const dostlar = this.dostlar();
      const r = rastgele();
      if (dostlar.length && r < 0.5) {
        const d = dostlar[Math.floor(rastgele() * dostlar.length)];
        hedef.set(d.x + rnd(-3, 3), 0, d.z + rnd(-3, 3));
        hedef.y = zeminY(hedef.x, hedef.z) + (rastgele() < 0.6 ? 0 : rnd(0.3, 1.6));
      } else if (r < 0.75) {
        const yonv = azimutYon(kaynakAzimut + rnd(-20, 20));
        const m = rnd(3, 24);
        hedef.set(yonv.x * m, 0, yonv.z * m);
        hedef.y = zeminY(hedef.x, hedef.z);
      } else {
        const yonv = azimutYon(kaynakAzimut + 180 + rnd(-35, 35));
        const m = rnd(8, 30);
        hedef.set(yonv.x * m, 0, yonv.z * m);
        hedef.y = zeminY(hedef.x, hedef.z) + rnd(1.5, 6);
      }
    } else {
      // Karşı kaldırım: mevzinin hizasında (±8 m), kaldırım çizgisinde, 0,5–3 m yükseklikte (duvar dibine ya da araca)
      hedef.set(-Math.sign(yon) * rnd(7, 9), 0, kaynak.z + rnd(-8, 8));
      hedef.y = zeminY(hedef.x, hedef.z) + rnd(0.5, 3);
    }
    const hiz = rnd(140, 190);
    _hiz.copy(hedef).sub(kaynak);
    const mesafe = _hiz.length();
    _hiz.multiplyScalar(hiz / mesafe);
    _hiz.y += 0.5 * IZ_DUSUSU * (mesafe / hiz);
    this.izEkle(kaynak, _hiz, false, false, true);
    if (a.siluet) this.aticiParlamasi(kaynak, false, _hiz);
    else {
      if (rastgele() < 0.6) this.parcaciklar.parlama(kaynak, rnd(1.5, 2.5));
      if (rastgele() < 0.35) this.sesler.atis(sesAzimutu(kaynak), true, Math.hypot(kaynak.x, kaynak.z));
    }
    return true;
  }

  /**
   * İz bu karede (p0 → p) izleyicinin başının ~6 m yakınından geçtiyse ses hızı üstü "çat" (iz başına bir kez),
   * geçiş noktasının yönünden. Yere çarpacak mermi çatlamaz, çarpma sesi yeter (yakinGecis). İzli akışta jeton
   * yoksa sessiz geçer (sonra da çatlamaz).
   */
  private catlamaDenetle(iz: Iz, x0: number, y0: number, z0: number) {
    const dx = iz.p.x - x0;
    const dy = iz.p.y - y0;
    const dz = iz.p.z - z0;
    const t = yakinGecis(x0, y0, z0, dx, dy, dz, CATLAMA_MESAFESI);
    if (t < 0) return;
    iz.catladi = true;
    if (this.sesCalabilir(iz)) this.sesler.carpma(sesAzimutu(_yakin.set(x0 + dx * t, y0 + dy * t, z0 + dz * t)));
  }

  private dostAtis(konum: THREE.Vector3, hazirNamlu?: THREE.Vector3) {
    const dusman = azimutYon(this.ayar.azimut + rnd(-6, 6));
    const namlu = hazirNamlu ? hazirNamlu.clone() : konum.clone();
    if (!hazirNamlu) {
      namlu.y += 1.35;
      namlu.addScaledVector(dusman, 0.6);
    }
    this.parcaciklar.parlama(namlu, 0.3);
    this.namluAlevi(namlu, dusman, 1);
    this.sesler.atis(sesAzimutu(konum), false);
    const izli = this.dostAtisNo++ % DOST_IZLI_ARALIGI === 0;
    // Mevzi tutan düşman atıcısı varsa (ve askerin baktığı yönün ±28°'sindeyse) ona nişan alınır: izler o pencerede
    // toplanır, isabet tozu kalkar, ara sıra atıcıyı sindirir. Yoksa eski genel düşman yönü.
    const atici = this.dostHedefi?.() ?? null;
    if (atici) {
      const fark = ((((derece(Math.atan2(atici.x - namlu.x, -(atici.z - namlu.z))) - this.ayar.azimut) % 360) + 540) % 360) - 180;
      if (Math.abs(fark) <= 28) {
        this.hedefliAtis(namlu, atici, 1.3, rnd(160, 200), false, izli);
        if (rastgele() < 0.05) this.dusmanBaskisi?.(atici);
        return;
      }
    }
    const hedef = dusman.clone().multiplyScalar(rnd(160, 240));
    hedef.y = ZEMIN_Y + rnd(0, 3);
    const v = hedef.sub(namlu).normalize().multiplyScalar(rnd(160, 200));
    this.izEkle(namlu, v, true, false, false, 0, izli);
  }

  /**
   * Bilinen bir noktaya (düşman atıcısı) nişanlı dost izi: `yayilim` metre dağılımla, hedefe varınca biter ve isabet
   * tozu kalkar. Yapı kutusu denetimi atlanır (bkz. Iz.hedefli).
   */
  private hedefliAtis(namlu: THREE.Vector3, hedef: THREE.Vector3, yayilim: number, hiz: number, izli: boolean, gorunur = true) {
    const h = _hedef.set(hedef.x + rnd(-yayilim, yayilim), hedef.y + rnd(-yayilim * 0.7, yayilim * 0.7), hedef.z + rnd(-yayilim, yayilim));
    _hiz.copy(h).sub(namlu);
    const mesafe = _hiz.length();
    if (mesafe < 1) return;
    _hiz.multiplyScalar(hiz / mesafe);
    // Hafif düşüş önceden karşılanır (sekmemiş iz 0,15 g): iz hedef noktasında biter
    _hiz.y += 0.5 * IZ_DUSUSU * (mesafe / hiz);
    this.izEkle(namlu, _hiz, true, false, izli, mesafe / hiz, gorunur);
  }

  /** Araç üstü silah (zırhlı araç olayı): namludan `hedef`e (yoksa düşman yönüne) izli atış, namlu alevi, ses. */
  aracAtisi(namlu: THREE.Vector3, konum: THREE.Vector3, hedef?: THREE.Vector3) {
    this.parcaciklar.parlama(namlu, 0.5);
    this.sesler.atis(sesAzimutu(konum), false);
    const izli = this.dostAtisNo++ % 2 === 0;
    if (hedef) {
      this.namluAlevi(namlu, _yon.copy(hedef).sub(namlu), 1.5);
      this.hedefliAtis(namlu, hedef, 0.9, rnd(170, 210), true, izli);
      return;
    }
    const h = azimutYon(this.ayar.azimut + rnd(-8, 8)).multiplyScalar(rnd(160, 240)).setY(ZEMIN_Y + rnd(0, 4));
    const v = h.sub(namlu).normalize().multiplyScalar(rnd(170, 210));
    this.namluAlevi(namlu, v, 1.5);
    this.izEkle(namlu.clone(), v, true, false, true, 0, izli);
  }

  /**
   * Uzaktaki yapıya (düşman mevzisine) isabet: küçük toz/sıva bulutu, saniyede en çok ~6 (jeton). Yakın çarpmanın
   * (`carpma`) kıvılcımı ve sesi yok: 25–100 m'den yalnız toz seçilir.
   */
  private uzakIsabet(p: THREE.Vector3) {
    if (this.isabetJetonu < 1) return;
    this.isabetJetonu -= 1;
    const mesafe = p.length();
    const olcek = Math.max(0.6, Math.min(2.2, mesafe / 35));
    for (let i = 0; i < 2; i++) {
      this.parcaciklar.duman.ekle({
        x: p.x + rnd(-0.15, 0.15),
        y: p.y + rnd(-0.1, 0.1),
        z: p.z + rnd(-0.15, 0.15),
        // Toz izleyiciye doğru (cepheden dışarı) ve hafif yukarı savrulur
        vx: (-p.x / mesafe) * rnd(0.4, 1.4) + rnd(-0.3, 0.3),
        vy: rnd(0.2, 0.9),
        vz: (-p.z / mesafe) * rnd(0.4, 1.4) + rnd(-0.3, 0.3),
        boyut: rnd(0.3, 0.5) * olcek,
        buyume: rnd(0.7, 1.2) * olcek,
        alfa: rnd(0.3, 0.5),
        aci: rnd(0, 6.28),
        donus: rnd(-1, 1),
        t: 0,
        sure: rnd(0.7, 1.4),
        renk: [0.68, 0.64, 0.58],
        yercekimi: 0.25,
        surtunme: 1.6,
        engelsiz: true,
      });
    }
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
      // Ses: izli akışta saniyede en çok ~1,5 (toz, kıvılcım ve sekme her çarpmada)
      if (this.sesCalabilir(iz)) this.sesler.carpma(sesAzimutu(p));
      if (!iz.sekti && rastgele() < 0.3) {
        const v = _sekmeHiz.copy(iz.v);
        v.y = Math.abs(v.y) * rnd(0.4, 1.2) + rnd(10, 40);
        v.x += rnd(-40, 40);
        v.z += rnd(-40, 40);
        v.setLength(iz.v.length() * rnd(0.4, 0.7));
        this.izEkle(_sekmeKonum.set(p.x, zeminY(p.x, p.z) + 0.05, p.z), v, false, true, iz.izli, 0, iz.gorunur);
      }
    }
  }

  guncelle(dt: number) {
    this.ufuk.ilerlet(dt);
    this.izliSesJetonu = Math.min(IZLI_SES_KOVASI, this.izliSesJetonu + dt * IZLI_SES_HIZI);
    this.isabetJetonu = Math.min(4, this.isabetJetonu + dt * 6);
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
          // Telegraf (C-18): salvo kaynağı önce belirlenir, namlu parıltısı hemen görünür, ilk iz 0,25–0,45 sn sonra çıkar,
          // atış sesi mesafe gecikmesiyle gelir (crack–thump) → ışık → iz → ses sırası; eğitmen "önce parıltıyı gör" öğretir
          const kaynak = this.dusmanKaynagi(this.ayar.azimut);
          this.salvoIlkAtis = true;
          if (!kaynak) {
            // Yöndeki mevziler susturulmuş (patlama) ya da baskı altında: bu salvo atılmaz
            this.dusmanSalvoKalan = 0;
          } else if (this.salvoAtici?.siluet) {
            // Siluetli atıcı: telegraf figürün doğrulmasıdır (0,3 sn); parıltı ve ses ilk mermiyle birlikte namludan
            this.salvoKaynak = null;
            this.dusmanAtisSayac = rnd(0.42, 0.6);
          } else {
            this.salvoKaynak = kaynak;
            this.parcaciklar.parlama(kaynak, rnd(2.8, 3.8));
            this.sesler.atis(sesAzimutu(kaynak), true, Math.hypot(kaynak.x, kaynak.z));
            this.dusmanAtisSayac = rnd(0.25, 0.45);
          }
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
      if (this.ayar.dostAtes && this.atisNoktalari) {
        // Figür başına salvo sayacı (kimlikle: liste değişince sayaçlar kaymaz); 3–5 atış hızlı, sonra bekleme
        for (const n of this.atisNoktalari()) {
          const d = this.dostSalvolari.get(n.id) ?? { kalan: rnd(0.2, 1.5), seri: 0 };
          this.dostSalvolari.set(n.id, d);
          d.kalan -= dt;
          if (d.kalan > 0) continue;
          this.dostAtis(n.namlu, n.namlu);
          this.dostAtisOldu?.(n.id);
          d.seri++;
          if (d.seri < Math.round(rnd(3, 5))) d.kalan = rnd(0.09, 0.16);
          else {
            d.seri = 0;
            d.kalan = rnd(0.8, 3) * (1.4 - s);
          }
        }
      } else if (this.ayar.dostAtes) {
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
      iz.yol += Math.hypot(iz.v.x, iz.v.y, iz.v.z) * dt;
      const zemin = zeminY(iz.p.x, iz.p.z);
      // Zemine iniş ya da (düşman/izli mermi) önündeki yokuşa dalış: çarpma. Sekme yerden yükselirken, dost ateşi
      // (hedefi düz zemin yüksekliğinde) tepeden geçerken çarpmaz.
      if (yeniY <= zemin + 0.03 && (iz.v.y < 0 || (!iz.sekti && !iz.dost))) {
        iz.p.y = zemin + 0.03;
        this.carpma(iz);
        this.havuz.push(iz);
        continue;
      }
      // Düşman mevzisine nişanlı dost izi: hedefe varınca biter, isabet tozu kalkar
      if (iz.hedefli) {
        iz.p.y = yeniY;
        if (iz.kalan > 0) izler[canli++] = iz;
        else {
          this.uzakIsabet(iz.p);
          this.havuz.push(iz);
        }
        continue;
      }
      // 3B alan yapısına (bina, araç, bariyer) çarpma: iz o noktada biter, yakınsa toz/kıvılcım (carpma)
      if (this.engelKesisimi) {
        const t = this.engelKesisimi(x0, y0, z0, iz.p.x, yeniY, iz.p.z);
        if (t >= 0) {
          iz.p.set(x0 + (iz.p.x - x0) * t, y0 + (yeniY - y0) * t, z0 + (iz.p.z - z0) * t);
          this.carpma(iz);
          this.havuz.push(iz);
          continue;
        }
      }
      iz.p.y = yeniY;
      if (!iz.catladi && !iz.dost && !iz.sekti) this.catlamaDenetle(iz, x0, y0, z0);
      if (iz.kalan > 0 && iz.p.length() < 400) izler[canli++] = iz;
      else this.havuz.push(iz);
    }
    izler.length = canli;
    this.eklenenleriAl();

    // --- Çizim verisi (izCizimi.ts: ekran uzayında kapsül; kalınlığın piksel alt sınırı gölgelendiricide, duvar başına) ---
    const c = this.cizici;
    c.baslat();
    for (let i = 0; i < izler.length; i++) {
      const iz = izler[i];
      if (!iz.gorunur) continue;
      const hiz = iz.v.length() || 1;
      // Görünen uzunluk: gözde kalan iz (hız × ~1/60 sn), uzakta çizgi gibi okunsun diye biraz daha uzun; namlunun
      // gerisine uzamaz (iz namludan çıkarken büyür), seken parça kısa
      const uzunluk = Math.min(iz.yol, Math.min(5, 1 + hiz * 0.016) * (1 + Math.min(1, iz.p.length() / 150) * 0.8) * (iz.sekti ? 0.6 : 1));
      const k = uzunluk / hiz;
      c.ekle(iz.p.x, iz.p.y, iz.p.z, iz.p.x - iz.v.x * k, iz.p.y - iz.v.y * k, iz.p.z - iz.v.z * k, iz.renk.r, iz.renk.g, iz.renk.b, iz.dost ? 0.011 : 0.013, 1.5 * iz.guc);
    }
    // Namlu alevleri: 50 ms, sönerken kısalır
    let canliAlev = 0;
    for (let i = 0; i < this.alevler.length; i++) {
      const a = this.alevler[i];
      a.kalan -= dt;
      if (a.kalan <= 0) {
        this.alevHavuzu.push(a);
        continue;
      }
      this.alevler[canliAlev++] = a;
      const o = a.kalan / ALEV_SURESI;
      const boy = 0.36 * a.boyut * (0.55 + 0.45 * o);
      c.ekle(a.x + a.dx * boy, a.y + a.dy * boy, a.z + a.dz * boy, a.x, a.y, a.z, 1, 0.62, 0.24, 0.028 * a.boyut, 2.6 * o);
    }
    this.alevler.length = canliAlev;
    c.bitir();
  }

  /**
   * Bölge değişimi / sahne sıfırlaması: uçuştaki izler havuza döner; uçuştaki top mermileri (yoksa süresi bitince uzak
   * patlama üretirdi) ve salvo, dost, top, izli sayaçları baştan. Ayarlar (aktif, şiddet, yön) durumdan gelir, dokunulmaz.
   */
  temizle() {
    for (let i = 0; i < this.izler.length; i++) this.havuz.push(this.izler[i]);
    for (let i = 0; i < this.eklenecek.length; i++) this.havuz.push(this.eklenecek[i]);
    this.izler.length = 0;
    this.eklenecek.length = 0;
    for (let i = 0; i < this.alevler.length; i++) this.alevHavuzu.push(this.alevler[i]);
    this.alevler.length = 0;
    this.cizici.baslat();
    this.cizici.bitir();
    this.mermiler.length = 0;
    this.dusmanSalvoKalan = 0;
    this.dusmanSalvoSayac = 0;
    this.dusmanAtisSayac = 0;
    this.salvoAtici = null;
    this.salvoKaynak = null;
    this.uzakPatlamaSayac = 20;
    this.dostSayaclar.clear();
    this.dostSalvolari.clear();
    this.topSayaclar.clear();
    this.izliBirikim = 0;
  }
}
