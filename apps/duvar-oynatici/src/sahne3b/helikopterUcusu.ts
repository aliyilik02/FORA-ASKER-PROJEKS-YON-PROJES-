/**
 * Helikopter uçuş modeli (saf, THREE'siz; testli): panelin durumlarını yumuşak, fiziğe yakın harekete çevirir.
 * Helikopter3B bu çıktıyı 3B modele uygular (konum, burun yönü, yunuslama/yatış, rotor devri, toz şiddeti).
 *
 *  - Yaklaşıyor: 420 m / 70 m'den belirir; yanal sapması iniş noktasına yaklaştıkça sönen hafif kavisli rota
 *    (virajda hafif yatış), sabit yavaşlama + zamanla doğrusal alçalış; ~17 sn'de iniş kapısında (~60 m kala,
 *    ~24 m, ~11 m/sn). "İniyor" gelmezse iniş noktasının ~17 m önünde 22 m'de askıda bekler.
 *  - İniyor: son ~25 m'de sabit yavaşlama (burun yukarı "flare"), iniş noktasının üstünde 2,5 m askı, dikey
 *    iniş, kızakta küçük sekme (kalan yatay hızı kızak sürtünmesi durdurur). Askıda burun kalkış tarafına döner
 *    (yerde yandan görünür). Kapıdan ~8–12 sn'de yerde.
 *  - Yerde: yere değdikten 25 sn sonra rotor yavaşlar (eski davranış).
 *  - Kalkıyor: rotor tam devre çıkar, ~5 m askıya yükselir, burun aşağı hızlanıp tırmanırken kalkış tarafına
 *    viraj alır; izleyicinin yanından geri bölgeye (arkaya) uzaklaşır, ~15 sn'de görüş dışındadır.
 *  - Arazi: uçarken 80 m ilerisine bakıp önündeki en yüksek zeminden 8 m (inişte 6 m) yukarıda kalır.
 *
 * Tutum ivmeden türetilir: rotor diski net yatay kuvvete yatar (hızlanırken burun aşağı, yavaşlarken yukarı,
 * virajda içe yatış). Konum yatay düzlemde (x, z; azimut 0 = −z, sağa +x); `yukseklik` iniş noktası zeminine,
 * `irtifa` yerel zemine göredir. Süreler örnek senaryolar ve paneldeki tam iniş dizisiyle uyumludur
 * (yaklaşıyor → 17–20 sn → iniyor → 15–17 sn → yerde; kalkıyor → 15–20 sn → yok).
 */
import type { HelikopterDurumu } from "../tipler";
import { rotorTozuSiddeti } from "./rotorTozu";

const G = 9.8;
const RAD = Math.PI / 180;
/** Tam rotor devri (rad/sn; model animasyonu ve ses bu ölçeği kullanır). */
export const TAM_DEVIR = 40;
/** Yerde rotor bu kadar saniye tam devirde kalır, sonra 2 rad/sn² ile 8'e iner. */
const YERDE_TAM_DEVIR_SURESI = 25;
const BASLANGIC_MESAFE = 420;
const BASLANGIC_YUKSEKLIK = 70;
/** Son yaklaşma kapısı: iniş noktasına bu kadar kala, bu yükseklik ve hızda. */
const KAPI_S = 60;
const KAPI_HIZ = 10;
const KAPI_YUKSEKLIK = 24;
const KAPI_YAVASLAMA = 0.88; // m/sn²
/** "İniyor" gelmezse bekleme askısı. */
const BEKLEME_S = 20;
const BEKLEME_YUKSEKLIK = 22;
const BEKLEME_YAVASLAMA = 1.25;
/** Son askı (dikey inişten önce) ve kalkış askısı yükseklikleri (m). */
const ASKI = 2.5;
const KALKIS_ASKI = 5;
/** Hız komutunu izleme süresi (sn) ve ivme sınırları (m/sn²). */
const HIZ_TAKIP = 1;
const YATAY_IVME = 3.5;
const DIKEY_IVME = 2.5;
/** Yere değerken kalan küçük yatay hızı durduran kızak sürtünmesi (m/sn²): hız sıçramaz, birkaç karede söner. */
const KIZAK_SURTUNMESI = 3;
/** Arazi engeli: uçuşta önündeki zeminden en az bu kadar yukarıda (m); bu kadar ilerisine bakar (m). */
const ENGEL_PAYI = 8;
const ENGEL_UFKU = 80;
/** İleri uçuşta diskin öne yatması: sürükleme ≈ katsayı · |v| · v. 40 m/sn'de ~8°. */
const SURUKLEME = 0.0009;
/** Burun dönüş hızı sınırı (derece/sn; pedal dönüşü). */
const YONELIM_HIZI = 26;
/** Yerde burun, izleyiciye bakış yönünden kalkış tarafına bu kadar dönük (yandan görünüş). */
const PARK_ACISI = 60;
/** Kalkışta tırmanırken kalkış tarafına alınan toplam viraj (derece). */
const KALKIS_VIRAJI = 38;
/** Bu uzaklıktan sonra (m) helikopter gitmiş sayılır, gizlenir. */
const GORUS_SINIRI = 1500;

const sinirla = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const yumusak = (a: number, b: number, x: number) => {
  const t = sinirla((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
/** a − b açı farkı (derece, −180..180). */
export function aciFarki(a: number, b: number): number {
  return ((((a - b) % 360) + 540) % 360) - 180;
}

type KalkisEvresi = "isinma" | "yuksel" | "ayril";

export class HelikopterUcusu {
  durum: HelikopterDurumu = "yok";
  /** Yatay konum (m, sahne). */
  x = 0;
  z = 0;
  /** İniş noktası zeminine göre yükseklik (m): uçuş rotası. */
  yukseklik = 0;
  /** Yerel zeminden kızak yüksekliği (m): toz ve ses. */
  irtifa = 0;
  vx = 0;
  vz = 0;
  vy = 0;
  /** Burun yönü (sahne azimutu, derece). */
  yonelim = 0;
  /** Görünen yunuslama (rad, burun yukarı +) ve yatış (rad, sağ taraf aşağı −); salınım dâhil. */
  yunuslama = 0;
  yatis = 0;
  /** Rotor devri (rad/sn, tam = TAM_DEVIR). */
  rotorHizi = 0;
  /** Rotor tozu şiddeti 0–1 (rotor sesi de kullanır). */
  tozSiddeti = 0;
  /** Yere değişte gövdenin kısa çöküp toparlanması (m, aşağı −). */
  govdeOfseti = 0;
  /** Askıda hafif dikey salınım (m). */
  salinim = 0;
  gorunur = false;
  yerde = false;
  /** Durumdaki süre (sn). */
  faz = 0;
  /** Yere değdikten sonra geçen süre (sn); rotor yavaşlaması bunu sayar. */
  yerdeSure = 0;
  /** Yerel zemin − iniş noktası zemini (m). Helikopter3B araziyi bağlar; testte düz. */
  zeminFarki: (x: number, z: number) => number = () => 0;

  private inisAz = 12;
  private inisMes = 38;
  // İniş ekseni: u dışa (izleyiciden uzağa), w sağa; l iniş noktası
  private ux = 0;
  private uz = -1;
  private wx = 1;
  private wz = 0;
  private lx = 0;
  private lz = -38;
  private zaman = 0;
  private yun = 0;
  private yat = 0;
  private ivX = 0;
  private ivZ = 0;
  // Komut hızı (m/sn)
  private kx = 0;
  private kz = 0;
  private ky = 0;
  // Rota planı: girişteki konum/yükseklik, iniş hız sınırı ve flare mesafesi
  private planS = 1;
  private planQ = 0;
  private planY = 0;
  private hizSiniri = KAPI_HIZ;
  private flareS = 25;
  private sonInis = false;
  private kalkisEvre: KalkisEvresi = "isinma";
  private kalkisT = 0;
  private ayrilmaYon = 0;
  private ayrilmaHiz = 0;
  private sekmeT = -1;
  private sekmeGenlik = 0;

  constructor() {
    this.eksenleriKur();
  }

  /** İniş noktası (sahne azimutu, m). Yerdeyken değişirse yeni noktada belirir; havadaysa rota yeniden kurulur. */
  inisNoktasi(azimut: number, mesafe: number) {
    if (azimut === this.inisAz && mesafe === this.inisMes) return;
    this.inisAz = azimut;
    this.inisMes = mesafe;
    this.eksenleriKur();
    if (!this.gorunur) return;
    if (this.yerde) {
      this.konumla(0, 0);
      this.yukseklik = 0;
      this.yonelim = this.parkYonu;
    } else this.planla();
  }

  /** İniş ekseni boyunca konum (iniş noktasından dışa +, m). */
  get s() {
    return (this.x - this.lx) * this.ux + (this.z - this.lz) * this.uz;
  }
  /** İniş eksenine göre yanal konum (izleyiciden bakınca sağa +, m). */
  get q() {
    return (this.x - this.lx) * this.wx + (this.z - this.lz) * this.wz;
  }
  /** Yerde burun yönü: izleyiciye bakış yönünden kalkış tarafına 60° dönük; kalkış burun yönünde başlar. */
  get parkYonu() {
    return aciFarki(this.inisAz + 180 - PARK_ACISI * this.yan, 0);
  }

  durumAyarla(d: HelikopterDurumu) {
    if (d === this.durum) return;
    const onceki = this.durum;
    // Kalkışta askıdan ayrılmış, uzaklaşıyor: iniş rotası buradan kurulamaz (izleyicinin yanında/arkasında)
    const ayriliyor = onceki === "kalkiyor" && this.kalkisEvre === "ayril" && this.gorunur && !this.yerde;
    this.durum = d;
    this.faz = 0;
    switch (d) {
      case "yok":
        this.gorunur = false;
        this.yerde = false;
        this.tozSiddeti = 0;
        this.rotorHizi = 0;
        break;
      case "yaklasiyor":
        // Görünmüyorsa, yerdeyse ya da kalkıştan dönüyorsa baştan (420 m); havada yakındaysa rota buradan kurulur
        if (!this.gorunur || this.yerde || onceki === "kalkiyor" || Math.hypot(this.x, this.z) > 600) this.yaklasmaBaslat();
        else this.planla();
        break;
      case "iniyor":
        // Uzaklaşırken "iniyor": yeni iniş, önden (85 m); askıdaysa ya da yaklaşıyorsa buradan iner
        if (!this.gorunur || ayriliyor) this.inisBaslat();
        else if (!this.yerde) this.planla();
        break;
      case "yerde":
        // Yoktan, uzaktan ya da uzaklaşırken: doğrudan yerde belirir. Yakında havadaysa inişini tamamlar (sıçramaz).
        if (!this.gorunur || ayriliyor || (!this.yerde && (Math.hypot(this.s, this.q) > 150 || this.yukseklik > 60))) this.yereKoy();
        else if (!this.yerde) this.planla();
        break;
      case "kalkiyor":
        if (!this.gorunur) {
          this.yereKoy();
          this.rotorHizi = 8; // rotor önce devrini alır
        }
        if (this.yerde) {
          this.kalkisEvre = "isinma";
          this.kalkisT = 0;
        } else this.ayrilmaBaslat(Math.hypot(this.vx, this.vz) > 3 ? this.hizYonu() : this.yonelim);
        break;
    }
  }

  guncelle(dt: number) {
    if (dt <= 0) return;
    this.zaman += dt;
    this.faz += dt;
    if (!this.gorunur) {
      this.tozSiddeti = 0;
      return;
    }
    if (this.yerde) {
      this.yerdeSure += dt;
      this.kizakKaymasi(dt);
      // Kalkış: rotor tam devre yaklaşınca kızaklar yerden kesilir
      if (this.durum === "kalkiyor" && this.kalkisEvre === "isinma" && this.rotorHizi >= 36) {
        this.yerde = false;
        this.kalkisEvre = "yuksel";
        this.kalkisT = 0;
        this.sekmeT = -1;
        this.govdeOfseti = 0;
      }
    }
    if (!this.yerde) this.uc(dt);
    this.tutum(dt);
    this.rotorVeToz(dt);
    this.sekmeVeSalinim(dt);
  }

  // ------------------------------------------------------------------ uçuş

  private uc(dt: number) {
    switch (this.durum) {
      case "yaklasiyor":
        this.yaklasmaKomutu();
        break;
      case "iniyor":
      case "yerde":
        this.inisKomutu();
        break;
      case "kalkiyor":
        this.kalkisKomutu(dt);
        break;
      default:
        this.kx = this.kz = this.ky = 0;
    }
    // Komut hızı ivme sınırıyla izlenir (helikopter diski yatırarak hızlanır/yavaşlar)
    let ax = (this.kx - this.vx) / HIZ_TAKIP;
    let az = (this.kz - this.vz) / HIZ_TAKIP;
    const a = Math.hypot(ax, az);
    if (a > YATAY_IVME) {
      ax *= YATAY_IVME / a;
      az *= YATAY_IVME / a;
    }
    this.ivX = ax;
    this.ivZ = az;
    this.vx += ax * dt;
    this.vz += az * dt;
    this.vy += sinirla((this.ky - this.vy) / 0.7, -DIKEY_IVME, DIKEY_IVME) * dt;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.yukseklik += this.vy * dt;
    // Zemin: son iniş ve kalkış askısı dışında yerel zeminden en az 1,5 m
    const zf = this.zeminFarki(this.x, this.z);
    const alcalabilir = this.sonInis || (this.durum === "kalkiyor" && this.kalkisEvre !== "ayril");
    const taban = zf + (alcalabilir ? 0 : 1.5);
    const inisHizi = -this.vy;
    if (this.yukseklik < taban) {
      this.yukseklik = taban;
      if (this.vy < 0) this.vy = 0;
    }
    this.irtifa = Math.max(0, this.yukseklik - zf);
    if (this.sonInis && this.irtifa <= 0.001 && (this.durum === "iniyor" || this.durum === "yerde")) this.yereDeg(inisHizi);
    if (Math.hypot(this.x, this.z) > GORUS_SINIRI) this.gorunur = false;
  }

  private yaklasmaKomutu() {
    const s = this.s;
    const sd = -this.yaklasmaHizi(s);
    const qd = sd * this.rotaEgimi(s) + 0.4 * (this.rotaQ(s) - this.q);
    const egim = this.yaklasmaYuksekligi(s + 0.5) - this.yaklasmaYuksekligi(s - 0.5);
    let yd = sd * egim + 0.5 * (this.yaklasmaYuksekligi(s) - this.yukseklik);
    // Arazi engeli (sırt, tepe): önündeki zeminden 8 m'nin altına inmez, sırta önceden tırmanır (iniş alanına
    // 15 m kalana kadar bakar; iniş alanının kendisi engel sayılmaz)
    const engel = this.engelYuksekligi(ENGEL_PAYI, s - 15);
    if (this.yukseklik < engel) yd = Math.max(yd, (engel - this.yukseklik) * 0.8);
    this.komut(sd, qd, sinirla(yd, -4, 4));
  }

  private inisKomutu() {
    const s = this.s;
    const q = this.q;
    if (!this.sonInis && s < 4 && Math.abs(q) < 4 && Math.hypot(this.vx, this.vz) < 2.5) this.sonInis = true;
    if (this.sonInis) {
      // Askıdan dikey iniş: noktaya yerleşir, yere yaklaştıkça yavaşlar (~0,45 m/sn ile değer)
      this.komut(sinirla(-0.8 * s, -1.5, 1.5), sinirla(-0.8 * q, -1.5, 1.5), -Math.min(3, 0.45 + 0.5 * this.irtifa));
      return;
    }
    // Rota boyunca: sınır hızla gelir, son flareS metrede sabit yavaşlar (burun yukarı), iniş noktasında askı.
    // Hız takibinin gecikmesi öngörülür (komut ~0,8 sn sonraki konuma göre): noktayı aşıp sert durmasın.
    const gelis = Math.max(0, -(this.vx * this.ux + this.vz * this.uz));
    const sIleri = s - gelis * HIZ_TAKIP * 0.8;
    const vs = Math.max(Math.min(0.6, s), this.hizSiniri * Math.sqrt(sinirla(sIleri / this.flareS, 0, 1)));
    const sd = -vs;
    const qd = sd * this.rotaEgimi(s) + 0.5 * (this.rotaQ(s) - q);
    const egim = this.inisYuksekligi(s + 0.5) - this.inisYuksekligi(s - 0.5);
    let yd = sd * egim + 0.6 * (this.inisYuksekligi(s) - this.yukseklik);
    // Arazi engeli: iniş alanına 12 m kalana kadar önündeki zeminden 6 m yukarıda
    const engel = this.engelYuksekligi(ENGEL_PAYI - 2, s - 12);
    if (this.yukseklik < engel) yd = Math.max(yd, (engel - this.yukseklik) * 0.8);
    this.komut(sd, qd, sinirla(yd, -4, 3));
  }

  private kalkisKomutu(dt: number) {
    this.kalkisT += dt;
    if (this.kalkisEvre !== "ayril") {
      // ~5 m askıya dikey yükseliş (yerinde; burun zaten ayrılış yönünde)
      this.kx = 0;
      this.kz = 0;
      this.ky = sinirla(1.3 * (KALKIS_ASKI + 0.3 - this.irtifa), 0.25, 2);
      if (this.irtifa > KALKIS_ASKI - 0.8 && this.kalkisT > 2.6) this.ayrilmaBaslat(this.yonelim);
      return;
    }
    // Ayrılış: burun aşağı hızlanır; hız alınca tırmanırken kalkış tarafına viraj alır
    const t = this.kalkisT;
    const yon = (this.ayrilmaYon + this.yan * KALKIS_VIRAJI * yumusak(1.5, 9, t)) * RAD;
    // Hız ~40 m/sn'ye üstel yaklaşır: ivme başta ~2,5 m/sn² (burun ~14° aşağı), hızlandıkça azalır
    const v = Math.max(this.ayrilmaHiz, 40 * (1 - Math.exp(-t / 16)));
    this.kx = Math.sin(yon) * v;
    this.kz = -Math.cos(yon) * v;
    this.ky = Math.min(5.5, 0.3 + 0.13 * Math.hypot(this.vx, this.vz));
    const engel = this.engelYuksekligi(ENGEL_PAYI, 250);
    if (this.yukseklik < engel) this.ky = Math.max(this.ky, Math.min(6, (engel - this.yukseklik) * 0.8));
  }

  /**
   * Önündeki arazi için gereken en düşük yükseklik (iniş noktası zeminine göre, m): bulunduğu yerde ve hız yönünde
   * `ufuk` metreye kadar (en çok ENGEL_UFKU, 10 m arayla) en yüksek zemin + `pay`. Sırta dibine gelmeden yükselir,
   * sırtı geçene dek alçalmaz. `ufuk` ≤ 0 ise kısıt yok (iniş alanının kendisi engel sayılmaz).
   */
  private engelYuksekligi(pay: number, ufuk: number): number {
    if (ufuk <= 0) return -Infinity;
    let zf = this.zeminFarki(this.x, this.z);
    const hiz = Math.hypot(this.vx, this.vz);
    if (hiz > 0.5) {
      const ux = this.vx / hiz;
      const uz = this.vz / hiz;
      const enUzak = Math.min(ufuk, ENGEL_UFKU);
      for (let d = 10; d <= enUzak; d += 10) zf = Math.max(zf, this.zeminFarki(this.x + ux * d, this.z + uz * d));
    }
    return zf + pay;
  }

  // ------------------------------------------------------------------ rota profilleri

  /** Yaklaşma hızı (rota boyunca, m/sn): kapıya kadar sabit yavaşlama, sonra bekleme noktasında durur. */
  private yaklasmaHizi(s: number) {
    if (s > KAPI_S) return Math.min(38, Math.sqrt(KAPI_HIZ * KAPI_HIZ + 2 * KAPI_YAVASLAMA * (s - KAPI_S)));
    return Math.sqrt(2 * BEKLEME_YAVASLAMA * Math.max(0, s - BEKLEME_S));
  }

  /** Yaklaşma rotası yüksekliği: kapıya kadar hızla orantılı (zamanla doğrusal alçalış), sonra bekleme askısı. */
  private yaklasmaYuksekligi(s: number) {
    const uzakGiris = this.planS > KAPI_S + 1;
    if (uzakGiris && s > KAPI_S) {
      const pay = this.yaklasmaHizi(s) - KAPI_HIZ;
      const payda = Math.max(0.5, this.yaklasmaHizi(this.planS) - KAPI_HIZ);
      return KAPI_YUKSEKLIK + (this.planY - KAPI_YUKSEKLIK) * sinirla(pay / payda, 0, 1);
    }
    const ust = uzakGiris ? KAPI_YUKSEKLIK : this.planY;
    const ustS = uzakGiris ? KAPI_S : Math.max(this.planS, BEKLEME_S + 1);
    return BEKLEME_YUKSEKLIK + (ust - BEKLEME_YUKSEKLIK) * sinirla((s - BEKLEME_S) / (ustS - BEKLEME_S), 0, 1);
  }

  /** İniş noktasına kalan süre (sn): sınır hızla, son flareS metrede sabit yavaşlayarak. */
  private inisSuresi(s: number) {
    const v = this.hizSiniri;
    const f = this.flareS;
    return s > f ? (s - f) / v + (2 * f) / v : (2 * Math.sqrt(Math.max(0, s) * f)) / v;
  }

  /**
   * İniş rotası yüksekliği: kalan süreyle doğrusal alçalış; askı yüksekliğine iniş noktasının ~3 m önünde ulaşır
   * (yatay hız sönerken helikopter alçakta olsun, yüksekten uzun dikey iniş olmasın).
   */
  private inisYuksekligi(s: number) {
    const oran = sinirla(this.inisSuresi(s - 3) / Math.max(0.1, this.inisSuresi(this.planS - 3)), 0, 1);
    return ASKI + (this.planY - ASKI) * oran;
  }

  /** Yanal rota: giriş sapması iniş noktasına yaklaştıkça karesel söner (son yaklaşma eksene oturur). */
  private rotaQ(s: number) {
    if (this.planS < 8) return 0;
    const o = sinirla(s / this.planS, 0, 1);
    return this.planQ * o * o;
  }
  private rotaEgimi(s: number) {
    return this.planS < 8 || s <= 0 || s > this.planS ? 0 : (2 * this.planQ * s) / (this.planS * this.planS);
  }

  // ------------------------------------------------------------------ tutum, rotor, toz

  private tutum(dt: number) {
    let hedefYun = 0;
    let hedefYat = 0;
    if (!this.yerde) {
      const hiz = Math.hypot(this.vx, this.vz);
      // Rotor diski net yatay kuvvete yatar: ivme + ileri uçuş sürüklemesi
      const fx = this.ivX + SURUKLEME * hiz * this.vx;
      const fz = this.ivZ + SURUKLEME * hiz * this.vz;
      const h = this.yonelim * RAD;
      const ileri = fx * Math.sin(h) - fz * Math.cos(h);
      const sag = fx * Math.cos(h) + fz * Math.sin(h);
      hedefYun = sinirla(-Math.atan2(ileri, G), -0.3, 0.26);
      hedefYat = sinirla(-Math.atan2(sag, G), -0.33, 0.33);
      // Burun: hızlıyken hız yönünde, yavaşken park yönüne (askıda pedal dönüşü); kalkışta ayrılış yönünde
      const hedef =
        this.durum === "kalkiyor"
          ? this.kalkisEvre === "ayril" && hiz > 3
            ? this.hizYonu()
            : this.yonelim
          : this.parkYonu + yumusak(1.5, 4.5, hiz) * aciFarki(this.hizYonu(), this.parkYonu);
      this.yonelim = aciFarki(this.yonelim + sinirla(aciFarki(hedef, this.yonelim) / 0.8, -YONELIM_HIZI, YONELIM_HIZI) * dt, 0);
    }
    const k = Math.min(1, dt / 0.4);
    this.yun += (hedefYun - this.yun) * k;
    this.yat += (hedefYat - this.yat) * k;
  }

  private rotorVeToz(dt: number) {
    const hedef = this.yerde && this.durum === "yerde" && this.yerdeSure > YERDE_TAM_DEVIR_SURESI ? 8 : TAM_DEVIR;
    this.rotorHizi = this.rotorHizi < hedef ? Math.min(hedef, this.rotorHizi + 12 * dt) : Math.max(hedef, this.rotorHizi - 2 * dt);
    const guc = Math.min(1, this.rotorHizi / TAM_DEVIR);
    // Yerde kolektif düşük: toz azalır (kalkış için güç alırken artar); havada yere yakınlıkla üstel
    const hedefToz = this.yerde ? 0.45 * Math.max(0.3, guc) * (this.durum === "kalkiyor" ? 1.5 : 1) : rotorTozuSiddeti(this.irtifa, guc);
    this.tozSiddeti += (hedefToz - this.tozSiddeti) * Math.min(1, dt / (hedefToz > this.tozSiddeti ? 0.4 : 1.2));
  }

  /** Yerde: yere değişten kalan yatay hız kızak sürtünmesiyle söner (konum birkaç santim kayar). */
  private kizakKaymasi(dt: number) {
    const v = Math.hypot(this.vx, this.vz);
    if (v === 0) return;
    const k = Math.max(0, v - KIZAK_SURTUNMESI * dt) / v;
    this.vx *= k;
    this.vz *= k;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
  }

  private sekmeVeSalinim(dt: number) {
    let bas = 0;
    if (this.sekmeT >= 0) {
      // Kızak teması: gövde kısa çöker, sönümlü toparlanır; burun hafifçe sallanır
      this.sekmeT += dt;
      const son = Math.exp(-this.sekmeT / 0.4);
      const f = 2 * Math.PI * 1.7 * this.sekmeT;
      this.govdeOfseti = -this.sekmeGenlik * son * Math.sin(f);
      bas = 0.1 * this.sekmeGenlik * son * Math.sin(f + 1.2);
      if (this.sekmeT > 2.5) {
        this.sekmeT = -1;
        this.govdeOfseti = 0;
      }
    }
    const askida = this.yerde ? 0 : Math.min(1, this.irtifa / 3);
    this.salinim = 0.22 * askida * Math.sin(this.zaman * 1.1);
    this.yunuslama = this.yun + bas + 0.012 * askida * Math.sin(this.zaman * 0.83 + 0.5);
    this.yatis = this.yat + 0.016 * askida * Math.sin(this.zaman * 1.17);
  }

  // ------------------------------------------------------------------ başlangıçlar

  private yaklasmaBaslat() {
    const s0 = Math.max(150, BASLANGIC_MESAFE - this.inisMes);
    // Karşı yandan, iniş noktasının uzağından gelir; yanal sapma kavisle söner
    this.konumla(s0, -this.yan * 0.2 * s0);
    this.yukseklik = BASLANGIC_YUKSEKLIK;
    this.havadaBelir();
    this.planla();
    // Seyir hızında, rota teğetinde belirir
    const sd = -this.yaklasmaHizi(s0);
    const qd = sd * this.rotaEgimi(s0);
    this.vx = this.ux * sd + this.wx * qd;
    this.vz = this.uz * sd + this.wz * qd;
    this.vy = sd * (this.yaklasmaYuksekligi(s0) - this.yaklasmaYuksekligi(s0 - 1));
    this.yonelim = this.hizYonu();
  }

  /**
   * Paneldeki "iniyor" doğrudan gelirse: 85 m geride, 35 m'de, eksen boyunca 14 m/sn ile. Hız kavisli rotanın
   * teğetinde (yaklaşmadaki gibi): belirir belirmez sert yatıp doğrulmaz.
   */
  private inisBaslat() {
    const s0 = 85;
    const q0 = -this.yan * 22;
    this.konumla(s0, q0);
    this.yukseklik = 35;
    this.havadaBelir();
    // Plan iniş hız sınırını eksen boyundaki hızdan alır
    this.vx = -this.ux * 14;
    this.vz = -this.uz * 14;
    this.planla();
    const sd = -14;
    const qd = sd * this.rotaEgimi(s0);
    this.vx = this.ux * sd + this.wx * qd;
    this.vz = this.uz * sd + this.wz * qd;
    this.vy = -2;
    this.yonelim = this.hizYonu();
  }

  private yereKoy() {
    this.konumla(0, 0);
    this.yukseklik = 0;
    this.irtifa = 0;
    this.vx = this.vz = this.vy = 0;
    this.ivX = this.ivZ = 0;
    this.gorunur = true;
    this.yerde = true;
    this.yerdeSure = 0;
    this.sonInis = false;
    this.sekmeT = -1;
    this.govdeOfseti = 0;
    this.yonelim = this.parkYonu;
    this.yun = this.yat = 0;
    this.rotorHizi = TAM_DEVIR;
  }

  private havadaBelir() {
    this.gorunur = true;
    this.yerde = false;
    this.sonInis = false;
    this.sekmeT = -1;
    this.govdeOfseti = 0;
    this.rotorHizi = TAM_DEVIR;
    this.yun = this.yat = 0;
    this.ivX = this.ivZ = 0;
  }

  /** Rota planını mevcut konumdan kurar; iniş hız sınırı rota boyundaki hızdan, flare mesafesi hıza göre. */
  private planla() {
    this.planS = this.s;
    this.planQ = this.q;
    this.planY = this.yukseklik;
    const vs = -(this.vx * this.ux + this.vz * this.uz);
    this.hizSiniri = sinirla(vs, 5, 16);
    // Sabit flare yavaşlaması hız²/(2·mesafe) ≤ ~1,5 m/sn²
    this.flareS = Math.max(25, (this.hizSiniri * this.hizSiniri) / 3);
    this.sonInis = false;
  }

  private ayrilmaBaslat(yon: number) {
    this.kalkisEvre = "ayril";
    this.kalkisT = 0;
    this.ayrilmaYon = yon;
    this.ayrilmaHiz = Math.hypot(this.vx, this.vz);
  }

  private yereDeg(inisHizi: number) {
    this.yerde = true;
    this.yerdeSure = 0;
    this.sonInis = false;
    // Yatay hız sıfırlanmaz: kızak sürtünmesi birkaç karede durdurur (kizakKaymasi)
    this.vy = 0;
    this.ivX = this.ivZ = 0;
    this.sekmeT = 0;
    this.sekmeGenlik = sinirla(0.06 + 0.12 * inisHizi, 0.06, 0.2);
  }

  // ------------------------------------------------------------------ geometri

  /** Kalkış/park tarafı: iniş noktasının bulunduğu yan (sağ +1, sol −1); yaklaşma karşı yandan kavis çizer. */
  private get yan() {
    return this.inisAz < 0 ? -1 : 1;
  }

  private hizYonu() {
    return Math.atan2(this.vx, -this.vz) / RAD;
  }

  private eksenleriKur() {
    const a = this.inisAz * RAD;
    this.ux = Math.sin(a);
    this.uz = -Math.cos(a);
    this.wx = Math.cos(a);
    this.wz = Math.sin(a);
    this.lx = this.ux * this.inisMes;
    this.lz = this.uz * this.inisMes;
  }

  private konumla(s: number, q: number) {
    this.x = this.lx + this.ux * s + this.wx * q;
    this.z = this.lz + this.uz * s + this.wz * q;
  }

  private komut(sd: number, qd: number, yd: number) {
    this.kx = this.ux * sd + this.wx * qd;
    this.kz = this.uz * sd + this.wz * qd;
    this.ky = yd;
  }
}
