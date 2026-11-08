/**
 * Ses motoru (Web Audio). Manifestte gerçek kayıtlar varsa onları çalar; yoksa sentezlenmiş
 * yer tutucular kullanır. Konumsal yerleşim sahne azimutuyla (derece; 0 = orta duvar, sağa artı):
 *  - stereo: StereoPanner, pan = sin(azimut) (ön/arka ayırt edilmez; önceki davranış aynen),
 *  - çok kanal (4 kanal / 5.1 / 7.1): ChannelMerger; her ses kendisini çevreleyen iki hoparlöre sabit güçle
 *    kaydırılır (`sesYerlesimi.ts`), uzak sesler kısmen dağınık, patlama/top basları LFE kanalına da gider.
 * Ortam döngüsü ve rüzgâr dağınıktır (çok kanalda sol kanal soldaki, sağ kanal sağdaki hoparlörlere).
 * Uzak sesler alçak geçiren filtre + düşük seviye ile uzaklaştırılır. Düzen `?ses=` / `?hoparlor=`
 * (main.ts), T tuşu hoparlör testi.
 */
import type { HelikopterDurumu, OrtamAyarlari } from "./tipler";
import {
  duzenSec,
  type HoparlorDuzeni,
  hoparlorDuzeni,
  kanalEtiketleri,
  kanalKazanclari,
  kanalSayisi,
  kanaldanDuzen,
  ortamKazanclari,
  type SesAyari,
  stereoPan,
  YANGIN_REF_MESAFE,
  YANGIN_TABAN,
  yanginKaynaklariSec,
  type YanginSesKaynagi,
} from "./sesYerlesimi";

export interface SesManifesti {
  patlama?: string[];
  uzak_patlama?: string[];
  gurultu?: string[];
  bagirma?: string[];
  cagirma?: string[];
  mermi_vizilti?: string[];
  /** Gök gürültüsü kayıtları (yoksa sentez: yakında çatırtı + uzun gürleme). */
  gok_gurultusu?: string[];
  helikopter_rotor?: string | null;
  /** Yangın döngüsü (kayıt); yoksa sentez (alçak uğultu + tıslama + çıtırtı). */
  yangin?: string | null;
  ortam?: Record<string, string>;
}

/** Çalan bir yangın sesi (konum sabit): uğultu + tıslama kaynakları, ortak kazanç, çıkış düğümü (çıtırtılar buna bağlanır). */
interface YanginSesi {
  kazanc: GainNode;
  cikis: GainNode;
  kaynaklar: AudioScheduledSourceNode[];
  tislama: GainNode | null;
  /** Sönmeye bırakıldıysa durma zamanı. */
  bitis: number;
  sonCitirti: number;
}
const YANGIN_EN_COK = 3;

/** Rotor sesinin konumu (3B sahneden): sahne azimutu (derece), yatay mesafe ve zeminden irtifa (m). */
export interface HelikopterSesKonumu {
  azimut: number;
  mesafe: number;
  irtifa: number;
}

const BAGIRMALAR = ["Yaralı var!", "Siper al!", "Geri çekil!", "Sağ taraf, sağ taraf!", "Yardım edin!"];
const CAGIRMALAR = ["Sıhhiye!", "Sıhhiye, buraya!", "Sedye getirin!", "Tahliye hazır!"];

/** Uzak seslerin dağınıklığı (0 yönlü – 1 her hoparlörde eşit; yalnız çok kanalda). */
const UZAK_YAYILIM = 0.35;
/** LFE (bas) kanalına giden kopyanın alçak geçiren kesimi (Hz). */
const LFE_KESIM = 120;
/** Rotor: bu mesafeye kadar (m) tam seviye ve açık filtre; ötesinde seviye 1/r ile düşer, tabanın altına inmez. */
const ROTOR_REF_MESAFE = 40;
const ROTOR_TABAN = 0.12;
const SES_HIZI = 343;
/** Hoparlör testi: kanal başına gürültü süresi ve kanallar arası adım (sn). */
const TEST_SURE = 0.7;
const TEST_ADIM = 1.05;
/**
 * Tek atış (çatışma) kaydı en çok bu kadar çalar (sn, kayıt zamanı): güvenlik ağı. Manifestteki atış listesi tek
 * atışlık kesimlerdir (~1–1,4 sn); çok atışlı uzun bir dosya gelirse her atış dosyanın tamamını (15 sn) çalmasın,
 * çatışmada yüzlerce eşzamanlı kaynak birikmesin.
 */
export const TEK_ATIS_EN_UZUN = 1.8;
/** Sahne sıfırlamasında tek seferlik seslerin sönme zaman sabiti (sn): tık sesi olmadan ~0,1 sn'de susar. */
const SUSTURMA_TAU = 0.03;

/** Parametreyi o anki değerinden `tau` zaman sabitiyle 0'a indirir; zamanlanmış rampalar kesilir (değer sıçramaz). */
function sondur(p: AudioParam, t: number, tau: number) {
  if (typeof p.cancelAndHoldAtTime === "function") p.cancelAndHoldAtTime(t);
  else {
    p.cancelScheduledValues(t);
    p.setValueAtTime(p.value, t);
  }
  p.setTargetAtTime(0, t, tau);
}

/** Kaynağı `zaman`da durdurur (sonraki çağrı öncekinin yerine geçer); durmuş / başlamamışsa sessizce geçer. */
function durdur(k: AudioScheduledSourceNode, zaman: number) {
  try {
    k.stop(zaman);
  } catch {
    /* zaten durdu */
  }
}

/** "Yok"ta sönmeye bırakılmış rotor (kayıt ya da sentez): kazancı, kaynakları ve duracağı zaman. */
interface SonenRotor {
  kazanc: GainNode;
  kaynaklar: AudioScheduledSourceNode[];
  bitis: number;
}

export class SesMotoru {
  private ctx: AudioContext | null = null;
  private ana: GainNode | null = null;
  /** Çok kanallı düzende hoparlör kanallarını birleştirir; stereoda null (StereoPanner yolu). */
  private birlestirici: ChannelMergerNode | null = null;
  /** Çok kanalda dağınık ortam girişi (sol/sağ hoparlör grupları); stereoda null (doğrudan ana). */
  private ortamGirisi: GainNode | null = null;
  private yerlesim: HoparlorDuzeni | null = null;
  private lfeKanali = -1;
  private maxKanal = 0;
  private gurultuTampon: AudioBuffer | null = null;
  /** Çok kanalda rüzgâr sentezinin iki bağımsız kanallı gürültüsü (dağınık); stereoda null (tek kanallı tampon). */
  private ruzgarTampon: AudioBuffer | null = null;
  private pembeTampon: AudioBuffer | null = null;
  private tamponlar = new Map<string, AudioBuffer>();
  private manifest: SesManifesti = {};
  private kokYol = "icerik/sesler/";
  private ortamKaynak: { kaynak: AudioBufferSourceNode; filtre: BiquadFilterNode; kazanc: GainNode } | null = null;
  private rotor: { osc: OscillatorNode; kazanc: GainNode; lfo: OscillatorNode } | null = null;
  /** Manifestten gelen döngülü ortam kaydı (bölge/gece/yağmur) ve rotor kaydı; yoksa sentez kalır. */
  private ortamDosya: { anahtar: string; kaynak: AudioBufferSourceNode; kazanc: GainNode } | null = null;
  private ortamAnahtar: string | null = null;
  private rotorDosya: { kaynak: AudioBufferSourceNode; kazanc: GainNode; telafi: number } | null = null;
  private rotorDosyaYukleniyor = false;
  /** Rotor sesinin kalıcı konum zinciri (mesafe filtresi → pan / kanal kazançları); bir kez kurulur, düğüm üretmez. */
  private rotorUzay: { filtre: BiquadFilterNode; pan: StereoPannerNode | null; kanallar: Array<GainNode | null> } | null = null;
  private rotorSonGuncelleme = -1;
  private rotorOncekiMesafe = -1;
  private rotorHiz = 0;
  private rotorZayiflama = 1;
  private rotorDoppler = 1;
  private readonly rotorKazanclari: number[] = [];
  /** Sönmekte olan rotorlar (durum "yok" oldu); sahne sıfırlaması bunları da hızla susturur. */
  private sonenRotorlar: SonenRotor[] = [];
  /** Çalan yangın sesleri (anahtar: yuvarlanmış konum) ve sönmekte olanlar. */
  private readonly yanginSesleri = new Map<string, YanginSesi>();
  private sonenYanginlar: YanginSesi[] = [];
  private yanginTampon: AudioBuffer | null | undefined;
  private yanginSonGuncelleme = -1;
  /**
   * Çalan tek seferlik kaynaklar (patlama, atış, çarpma, bağırma, vızıltı) → kendi kazanç düğümü: sahne sıfırlamasında
   * hepsi söner ve durur (efektleriSustur). Kaynak bitince (onended, ortak tek işleyici) listeden çıkar; düğüm üretmez.
   */
  private readonly anliklar = new Map<AudioScheduledSourceNode, GainNode>();
  private readonly anlikBitti = (e: Event) => {
    this.anliklar.delete(e.target as AudioScheduledSourceNode);
  };
  /** Sahne sıfırlamasında artar: zamanlanmış atış dizileri (setTimeout) ve tampon bekleyen çalmalar eski nesildeyse çalmaz. */
  private efektNesli = 0;
  /** `ortamDongusu` yarış koruması (bkz. oradaki açıklama). */
  private ortamNesli = 0;
  private test: { baslangic: number; etiketler: string[]; kaynaklar: AudioBufferSourceNode[] } | null = null;
  private uyariDinleyici: ((mesaj: string) => void) | null = null;
  private readonly bekleyenUyarilar: string[];
  sessiz = false;

  /** `ayar`: `?ses=` / `?hoparlor=` çözümü (sesYerlesimi.ts sesAyariniCoz); verilmezse otomatik düzen. */
  constructor(private readonly ayar: SesAyari = { duzen: null, hoparlor: null, uyarilar: [] }) {
    this.bekleyenUyarilar = [...ayar.uyarilar];
  }

  get hazir() {
    return this.ctx?.state === "running";
  }

  /** Ses düzeni uyarıları (istenen kanal sayısı cihazda yok vb.); dinleyici bağlanmadan önce gelenler de iletilir. */
  uyariDinle(f: (mesaj: string) => void) {
    this.uyariDinleyici = f;
    for (const m of this.bekleyenUyarilar.splice(0)) f(m);
  }
  private uyar(mesaj: string) {
    if (this.uyariDinleyici) this.uyariDinleyici(mesaj);
    else this.bekleyenUyarilar.push(mesaj);
  }

  /** HUD: etkin düzen ve kanal sayısı ("5.1 (6 kanal)"); bağlam açılmadan önce istenen düzen. */
  get duzenBilgisi(): string {
    const y = this.yerlesim;
    const istenen = this.ayar.duzen;
    if (!y) return `${istenen ?? "otomatik"} (bekliyor)`;
    let s = `${y.duzen} (${y.azimutlar.length} kanal${y.ozel ? ", özel açılar" : ""})`;
    if (istenen && istenen !== y.duzen) s += ` · istenen ${istenen}, cihaz ${this.maxKanal} kanal`;
    return s;
  }

  manifestAyarla(m: SesManifesti, kokYol?: string) {
    this.manifest = m;
    if (kokYol) this.kokYol = kokYol;
  }

  /** Kullanıcı hareketi veya kiosk otomatik izni ile bağlamı açar. */
  async etkinlestir(): Promise<boolean> {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.kur(this.ctx);
      const sn = 2;
      this.gurultuTampon = this.ctx.createBuffer(1, this.ctx.sampleRate * sn, this.ctx.sampleRate);
      const d = this.gurultuTampon.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      // Çok kanalda rüzgâr iki bağımsız gürültü kanalından: tek kanallı gürültü her hoparlörde aynı (ilintili) olur,
      // odanın ortasında hayalet bir kaynak gibi duyulur; sol/sağ ayrı gürültü dağınık bir alan verir. Stereo eskisi gibi.
      if (this.ortamGirisi) {
        this.ruzgarTampon = this.ctx.createBuffer(2, this.ctx.sampleRate * sn, this.ctx.sampleRate);
        for (let k = 0; k < 2; k++) {
          const r = this.ruzgarTampon.getChannelData(k);
          for (let i = 0; i < r.length; i++) r[i] = Math.random() * 2 - 1;
        }
      }
    }
    try {
      await this.ctx.resume();
    } catch {
      /* izin yok */
    }
    return this.hazir;
  }

  /**
   * Düzen kurulumu: cihazın kanal sayısına göre (istenen sığmıyorsa otomatik). Stereo: ana → çıkış.
   * Çok kanal: çıkış n kanal, ayrık ("discrete": kanal i → cihaz kanalı i); birleştirici(n) → ana → çıkış;
   * dağınık ortam girişi (stereo → sol/sağ hoparlör grupları).
   */
  private kur(c: AudioContext) {
    const ozel = this.ayar.hoparlor;
    // ?ses= yoksa ?hoparlor= kanal sayısı düzeni belirler (4 → 4 kanal, 6 → 5.1, 8 → 7.1)
    const istenen = this.ayar.duzen ?? (ozel ? kanaldanDuzen(ozel.length) : null);
    this.maxKanal = c.destination.maxChannelCount;
    let duzen = duzenSec(this.maxKanal, istenen);
    if (istenen && duzen !== istenen) {
      const neden = this.ayar.duzen ? `${istenen} istendi` : `?hoparlor= ${ozel?.length} kanallı (${istenen})`;
      this.uyar(`${neden} ama ses cihazı ${this.maxKanal} kanal veriyor, ${duzen} kullanılıyor (Windows ses ayarlarında hoparlör yapılandırmasını ${istenen} yapın)`);
    }
    this.ana = c.createGain();
    this.ana.gain.value = this.sessiz ? 0 : 0.8;
    if (duzen !== "stereo") {
      try {
        const cikis = c.destination;
        cikis.channelCount = kanalSayisi(duzen);
        cikis.channelCountMode = "explicit";
        cikis.channelInterpretation = "discrete";
      } catch (h) {
        this.uyar(`${kanalSayisi(duzen)} kanallı çıkış açılamadı (${h instanceof Error ? h.message : String(h)}), stereo kullanılıyor`);
        duzen = "stereo";
        try {
          c.destination.channelCount = 2;
          c.destination.channelInterpretation = "speakers";
        } catch {
          /* varsayılan çıkış kalır */
        }
      }
    }
    this.yerlesim = hoparlorDuzeni(duzen, ozel);
    // ?hoparlor= verilip kullanılamadıysa (stereo düzen ya da kanal sayısı tutmuyor) her durumda söylenir
    if (ozel && !this.yerlesim.ozel) {
      this.uyar(
        duzen === "stereo"
          ? "?hoparlor= kullanılmadı: stereo düzende hoparlör açısı yok (sol/sağ pan)"
          : `?hoparlor= kullanılmadı: ${ozel.length} kanal veriyor, ${duzen} düzeni ${kanalSayisi(duzen)} kanal; varsayılan açılar`,
      );
    }
    // 5.1 / 7.1'de 4. kanal (indeks 3) Windows'ta ve AV alıcıda bas (LFE) kanalıdır: oraya açı verilirse o yöndeki
    // sesler yalnız subwoofer'dan (~120 Hz altı) duyulur. LFE işlemesi olmayan ayrık çıkışlı ses kartında sorun yok.
    const dorduncu = this.yerlesim.azimutlar[3];
    if (this.yerlesim.ozel && (duzen === "5.1" || duzen === "7.1") && dorduncu !== null) {
      this.uyar(
        `?hoparlor= 4. kanalda açı var (${dorduncu}°): ${duzen} düzeninde 4. kanal bas (LFE) kanalıdır, AV alıcı onu subwoofer'a verir, o yöndeki sesler yalnız bas duyulur; ayrık çıkışlı ses kartı değilse 4. sıraya "lfe" yazın`,
      );
    }
    if (duzen === "stereo") {
      this.ana.connect(c.destination);
      return;
    }
    const n = this.yerlesim.azimutlar.length;
    this.ana.channelCount = n;
    this.ana.channelCountMode = "explicit";
    this.ana.channelInterpretation = "discrete";
    const birlestirici = c.createChannelMerger(n);
    birlestirici.connect(this.ana).connect(c.destination);
    this.birlestirici = birlestirici;
    this.lfeKanali = this.yerlesim.azimutlar.indexOf(null);
    // Dağınık ortam girişi (2 kanal): stereo döngü ve rüzgâr (iki bağımsız gürültü kanalı) sol/sağ hoparlör gruplarına;
    // tek kanallı kayıt iki kanala açılır
    const giris = c.createGain();
    giris.channelCount = 2;
    giris.channelCountMode = "explicit";
    giris.channelInterpretation = "speakers";
    const bolucu = c.createChannelSplitter(2);
    giris.connect(bolucu);
    ortamKazanclari(this.yerlesim).forEach((k, i) => {
      for (const taraf of [0, 1] as const) {
        if (k[taraf] <= 0) continue;
        const g = c.createGain();
        g.gain.value = k[taraf];
        bolucu.connect(g, taraf).connect(birlestirici, 0, i);
      }
    });
    this.ortamGirisi = giris;
  }

  sessizlik(deger: boolean) {
    this.sessiz = deger;
    if (this.ana) this.ana.gain.value = deger ? 0 : 0.8;
  }

  private async tampon(yol: string): Promise<AudioBuffer | null> {
    if (!this.ctx) return null;
    const onbellek = this.tamponlar.get(yol);
    if (onbellek) return onbellek;
    try {
      const yanit = await fetch(this.kokYol + yol);
      if (!yanit.ok) return null;
      const b = await this.ctx.decodeAudioData(await yanit.arrayBuffer());
      this.tamponlar.set(yol, b);
      return b;
    } catch {
      return null;
    }
  }

  /** Dağınık seslerin (ortam döngüsü, rüzgâr) hedefi: çok kanalda ortam girişi, stereoda ana kazanç. */
  private get ortamHedefi(): AudioNode {
    return this.ortamGirisi ?? this.ana!;
  }

  /**
   * Konumlu çıkış; dönen düğüme kaynak bağlanır. Stereo: kazanç → (uzak: alçak geçiren) → StereoPanner.
   * Çok kanal: kazanç → (uzak) → kanal kazançları → birleştirici; `lfe` > 0 ise 120 Hz altı kopya LFE kanalına
   * (düzende LFE varsa).
   */
  private cikis(azimut: number, kazanc: number, uzak = false, lfe = 0): GainNode {
    const c = this.ctx!;
    // AudioParam'a NaN yazmak TypeError atar ve kare döngüsünü düşürürdü (NaN azimutlu çatışma/helikopter)
    if (!Number.isFinite(azimut)) azimut = 0;
    if (!Number.isFinite(kazanc)) kazanc = 0;
    const g = c.createGain();
    g.gain.value = kazanc;
    let son: AudioNode = g;
    if (uzak) {
      const f = c.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 600;
      son = g.connect(f);
    }
    const birlestirici = this.birlestirici;
    if (!birlestirici || !this.yerlesim) {
      const p = c.createStereoPanner();
      p.pan.value = stereoPan(azimut);
      son.connect(p).connect(this.ana!);
      return g;
    }
    const kazanclar = kanalKazanclari(this.yerlesim, azimut, uzak ? UZAK_YAYILIM : 0);
    for (let i = 0; i < kazanclar.length; i++) {
      if (kazanclar[i] < 1e-4) continue;
      const k = c.createGain();
      k.gain.value = kazanclar[i];
      son.connect(k).connect(birlestirici, 0, i);
    }
    if (lfe > 0 && this.lfeKanali >= 0) {
      const f = c.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = LFE_KESIM;
      const k = c.createGain();
      k.gain.value = lfe;
      g.connect(f).connect(k).connect(birlestirici, 0, this.lfeKanali);
    }
    return g;
  }

  /** Çok kanalda stereo kayıt birleştirici girişinde tek noktaya iner (≈3 dB kayıp); seviye stereodakine yakın kalsın. */
  private telafi(b: AudioBuffer): number {
    return this.birlestirici && b.numberOfChannels > 1 ? Math.SQRT2 : 1;
  }

  /** Tek seferlik kaynağı izlemeye alır (sahne sıfırlamasında `kazanc` söner, kaynak durur); bitince kendiliğinden çıkar. */
  private anlik(kaynak: AudioScheduledSourceNode, kazanc: GainNode) {
    this.anliklar.set(kaynak, kazanc);
    kaynak.onended = this.anlikBitti;
  }

  /**
   * Manifestteki dosyalardan rastgele birini çalar. true: kayıt çalındı ya da tampon beklenirken sahne sıfırlandı
   * (yedek sentez gerekmez); false: listede kayıt yok / yüklenemedi (çağıran sentezler).
   */
  private async dosyaCal(liste: string[] | undefined, azimut: number, kazanc: number, uzak: boolean, lfe = 0): Promise<boolean> {
    if (!this.ctx || !liste || liste.length === 0) return false;
    const nesil = this.efektNesli;
    const b = await this.tampon(liste[Math.floor(Math.random() * liste.length)]);
    if (nesil !== this.efektNesli) return true;
    if (!b) return false;
    const s = this.ctx.createBufferSource();
    s.buffer = b;
    const g = this.cikis(azimut, kazanc * this.telafi(b), uzak, lfe);
    s.connect(g);
    this.anlik(s, g);
    s.start();
    return true;
  }

  private gurultuPatlamasi(azimut: number, kazanc: number, sure: number, kesim: number, uzak: boolean, tip: BiquadFilterType = "lowpass", lfe = 0) {
    if (!this.ctx || !this.gurultuTampon) return;
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = this.gurultuTampon;
    const f = c.createBiquadFilter();
    f.type = tip;
    f.frequency.setValueAtTime(kesim, c.currentTime);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, kesim * 0.15), c.currentTime + sure);
    const g = c.createGain();
    g.gain.setValueAtTime(kazanc, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + sure);
    s.connect(f).connect(g).connect(this.cikis(azimut, 1, uzak, lfe));
    this.anlik(s, g);
    s.start();
    s.stop(c.currentTime + sure + 0.05);
  }

  /**
   * Patlama (`azimut` sahne derecesi); 5.1/7.1'de bas kopyası LFE'ye (uzakta bas baskın). Tank topu da bunu kullanır.
   * Uzak patlamada ses ışıktan `mesafe/343` sn sonra gelir (flash-to-bang; 800 m ≈ 2,3 sn, en çok 6 sn): önceden
   * görüntüyle aynı anda çalıyordu, uzaklık hissi ölüyordu (8 Kasım değerlendirmesi §1-1). Sahne sıfırlanırsa bekleyen
   * gürültü çalmaz.
   */
  async patlama(azimut: number, siddet: number, uzak = false, mesafe = 0) {
    if (!this.hazir) return;
    const gecikme = uzak && Number.isFinite(mesafe) ? Math.min(6, Math.max(0, mesafe) / SES_HIZI) : 0;
    if (gecikme > 0.05) {
      const nesil = this.efektNesli;
      await new Promise<void>((coz) => setTimeout(coz, gecikme * 1000));
      if (nesil !== this.efektNesli || !this.hazir) return;
    }
    const zayiflama = uzak ? Math.max(0.08, 1 - mesafe / 5000) : 1;
    const lfe = uzak ? 0.6 : 0.5;
    if (await this.dosyaCal(uzak ? this.manifest.uzak_patlama : this.manifest.patlama, azimut, siddet * zayiflama, uzak, lfe)) return;
    const c = this.ctx!;
    // Gürültü + alçak frekans vuruşu
    this.gurultuPatlamasi(azimut, 0.9 * siddet * zayiflama, uzak ? 1.6 : 1.1, uzak ? 500 : 3000, uzak, "lowpass", lfe);
    const o = c.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(uzak ? 60 : 110, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(30, c.currentTime + 0.8);
    const g = c.createGain();
    g.gain.setValueAtTime(0.8 * siddet * zayiflama, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.9);
    o.connect(g).connect(this.cikis(azimut, 1, uzak, lfe));
    this.anlik(o, g);
    o.start();
    o.stop(c.currentTime + 1);
  }

  /**
   * Gök gürültüsü: şimşekten mesafe/343 sn sonra (en çok 20 sn). Manifest `gok_gurultusu` kaydı varsa o (mesafeyle
   * kısılır), yoksa sentez: 1,5 km'den yakında önce sert çatırtı, sonra 3–6 yuvarlanmalı alçak gürleme; LFE'ye bas.
   * Sahne sıfırlanınca bekleyen gürültü çalmaz.
   */
  gokGurultusu(azimut: number, mesafe: number, siddet = 1) {
    if (!this.hazir) return;
    const nesil = this.efektNesli;
    const zay = Math.max(0.15, 1 - mesafe / 12000) * siddet;
    const uzak = mesafe > 1500;
    setTimeout(
      () => {
        if (nesil !== this.efektNesli) return;
        void this.dosyaCal(this.manifest.gok_gurultusu, azimut, zay, uzak, 0.7).then((caldi) => {
          if (!caldi && nesil === this.efektNesli) this.gokGurultusuSentez(azimut, mesafe, zay);
        });
      },
      Math.min(20, mesafe / 343) * 1000,
    );
  }

  private gokGurultusuSentez(azimut: number, mesafe: number, kazanc: number) {
    if (!this.ctx || !this.gurultuTampon) return;
    const c = this.ctx;
    const t = c.currentTime;
    const yakin = mesafe < 1500;
    if (yakin) this.gurultuPatlamasi(azimut, 0.9 * kazanc, 0.45, 7000, false, "highpass");
    const s = c.createBufferSource();
    s.buffer = this.gurultuTampon;
    s.loop = true;
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = yakin ? 280 : 160;
    f.Q.value = 0.7;
    const g = c.createGain();
    const sure = 3.5 + Math.random() * 3;
    const n = 3 + Math.floor(Math.random() * 4);
    g.gain.setValueAtTime(0.0001, t);
    let z = t + (yakin ? 0.08 : 0.25);
    for (let i = 0; i < n; i++) {
      z += 0.12 + (Math.random() * sure) / n;
      g.gain.exponentialRampToValueAtTime(Math.max(0.002, kazanc * (1.1 - i * 0.15) * (0.6 + 0.4 * Math.random())), z);
      z += 0.25 + Math.random() * 0.45;
      g.gain.exponentialRampToValueAtTime(Math.max(0.001, kazanc * 0.2 * (1 - i / n)), z);
    }
    g.gain.exponentialRampToValueAtTime(0.0003, z + 1.5);
    s.connect(f).connect(g).connect(this.cikis(azimut, 1, !yakin, 0.8));
    this.anlik(s, g);
    s.start(t);
    s.stop(z + 1.6);
  }

  async gurultu(azimut: number, siddet: number, uzak = false) {
    if (!this.hazir) return;
    // Sıfırlamadan sonra dizinin kalan atışları çalmaz
    const nesil = this.efektNesli;
    // Manifestteki kayıtlar tek atış; seri atış için 6–10 kez hızla art arda çalınır (±6° dağılım)
    if (this.manifest.gurultu?.length) {
      const adet = 6 + Math.floor(Math.random() * 5);
      for (let i = 0; i < adet; i++)
        setTimeout(() => {
          if (nesil === this.efektNesli) void this.dosyaCal(this.manifest.gurultu, azimut + (Math.random() - 0.5) * 12, siddet * 0.8, uzak);
        }, i * (85 + Math.random() * 35));
      return;
    }
    // Seri atış: 8–14 kısa patlama (±9° dağılım)
    const adet = 8 + Math.floor(Math.random() * 7);
    for (let i = 0; i < adet; i++) {
      setTimeout(() => {
        if (nesil === this.efektNesli) this.gurultuPatlamasi(azimut + (Math.random() - 0.5) * 18, 0.5 * siddet, 0.09, 2500, uzak, "bandpass");
      }, i * (70 + Math.random() * 40));
    }
  }

  /**
   * Tek atış (çatışma): manifest kaydı varsa rastgele perde ile, yoksa kısa gürültü vuruşu. Kayıt TEK_ATIS_EN_UZUN'dan
   * uzunsa o noktada kısa sönümle kesilir (güvenlik ağı; asıl çözüm tek atışlık kesimler, bkz. araclar/silah-tek-atis.mjs).
   */
  tekAtis(azimut: number, uzak = false) {
    if (!this.hazir || !this.ctx) return;
    const liste = this.manifest.gurultu;
    if (liste?.length) {
      const yol = liste[Math.floor(Math.random() * liste.length)];
      const onbellek = this.tamponlar.get(yol);
      const cal = (b: AudioBuffer) => {
        const c = this.ctx!;
        const s = c.createBufferSource();
        s.buffer = b;
        const hiz = 0.9 + Math.random() * 0.25;
        s.playbackRate.value = hiz;
        const kazanc = (uzak ? 0.22 : 0.55) * this.telafi(b);
        const g = this.cikis(azimut, kazanc, uzak);
        s.connect(g);
        this.anlik(s, g);
        if (b.duration > TEK_ATIS_EN_UZUN) {
          // Gerçek süre = kayıt süresi / hız; son 80 ms'de söner (kesik tık sesi olmasın)
          const bitis = c.currentTime + TEK_ATIS_EN_UZUN / hiz;
          g.gain.setValueAtTime(kazanc, bitis - 0.08);
          g.gain.linearRampToValueAtTime(0, bitis);
          s.start();
          s.stop(bitis + 0.02);
        } else s.start();
      };
      if (onbellek) cal(onbellek);
      else {
        const nesil = this.efektNesli;
        void this.tampon(yol).then((b) => b && nesil === this.efektNesli && cal(b));
      }
      return;
    }
    this.gurultuPatlamasi(azimut, uzak ? 0.2 : 0.5, 0.09, uzak ? 900 : 2500, uzak, "bandpass");
  }

  /** Yakına çarpan mermi: kısa tok vuruş + vızıltı. */
  carpma(azimut: number) {
    if (!this.hazir) return;
    this.gurultuPatlamasi(azimut, 0.35, 0.06, 1400, false, "bandpass");
    if (Math.random() < 0.5) this.vizilti(azimut);
  }

  async mermi(azimut: number, uzak = true) {
    if (!this.hazir) return;
    if (await this.dosyaCal(this.manifest.mermi_vizilti, azimut, 0.6, uzak)) return;
    const nesil = this.efektNesli;
    const adet = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < adet; i++)
      setTimeout(() => {
        if (nesil === this.efektNesli) this.gurultuPatlamasi(azimut, 0.35, 0.08, 1800, uzak, "bandpass");
      }, i * 120);
  }

  vizilti(azimut: number) {
    if (!this.hazir) return;
    if (this.manifest.mermi_vizilti?.length) {
      void this.dosyaCal(this.manifest.mermi_vizilti, azimut, 0.4, false);
      return;
    }
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(1800 + Math.random() * 600, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(300, c.currentTime + 0.25);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.12, c.currentTime + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.28);
    o.connect(g).connect(this.cikis(azimut, 1));
    this.anlik(o, g);
    o.start();
    o.stop(c.currentTime + 0.3);
  }

  /** Konuşma sentezi Web Audio'dan geçmez (konumlanamaz); yalnız sentez yoksa yedek gürültü konumlu. */
  private konus(metin: string, azimut: number, uzak: boolean) {
    if (!("speechSynthesis" in window)) {
      this.gurultuPatlamasi(azimut, 0.4, 0.5, 900, uzak, "bandpass");
      return;
    }
    const u = new SpeechSynthesisUtterance(metin);
    u.lang = "tr-TR";
    u.rate = 1.15;
    u.pitch = 0.8;
    u.volume = uzak ? 0.4 : 1;
    const sesler = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("tr"));
    if (sesler.length) u.voice = sesler[Math.floor(Math.random() * sesler.length)];
    speechSynthesis.speak(u);
  }

  async bagirma(azimut: number, uzak = false) {
    if (!this.hazir) return;
    const nesil = this.efektNesli;
    if (await this.dosyaCal(this.manifest.bagirma, azimut, 1, uzak)) return;
    if (nesil === this.efektNesli) this.konus(BAGIRMALAR[Math.floor(Math.random() * BAGIRMALAR.length)], azimut, uzak);
  }

  async cagirma(azimut: number, uzak = false) {
    if (!this.hazir) return;
    const nesil = this.efektNesli;
    if (await this.dosyaCal(this.manifest.cagirma, azimut, 1, uzak)) return;
    if (nesil === this.efektNesli) this.konus(CAGIRMALAR[Math.floor(Math.random() * CAGIRMALAR.length)], azimut, uzak);
  }

  /**
   * Sahne sıfırlaması: çalan tek seferlik sesler (patlama kuyrukları, atışlar, çarpma, bağırma, vızıltı) ~0,1 sn'de söner
   * ve durur (tık sesi yok), zamanlanmış atış dizileri ve tampon bekleyen çalmalar iptal olur, konuşma sentezi kuyruğu
   * silinir. `rotor`: helikopter rotoru da hızla söner (τ 0,15 sn, 1 sn'de durur); durumda helikopter hâlâ varsa
   * (kaçırılan sıfırlama senkronu) false verilir. Ortam döngüsü, rüzgâr ve hoparlör testi sürer.
   */
  efektleriSustur(rotor = true) {
    this.efektNesli++;
    const c = this.ctx;
    if (c) {
      const t = c.currentTime;
      for (const [kaynak, kazanc] of this.anliklar) {
        sondur(kazanc.gain, t, SUSTURMA_TAU);
        durdur(kaynak, t + 0.2);
      }
      if (rotor) this.rotoruBirak(0.15, 1);
      // Yangınlar sahneden kalktı: sesleri de hızla söner (bir sonraki karede yangin([]) zaten bırakırdı; tık yok)
      for (const [, y] of this.yanginSesleri) this.yanginiBirak(y, 0.15, 1);
      this.yanginSesleri.clear();
    }
    this.anliklar.clear();
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
  }

  /** İzlenen tek seferlik kaynak sayısı (tanı ve test). */
  get anlikSayisi() {
    return this.anliklar.size;
  }

  /**
   * Çalan rotoru (kayıt ya da sentez) sönmeye bırakır ve sönmekte olanlarla birlikte `tau` zaman sabitiyle söndürür,
   * `durma` sn sonra durdurur. Daha erken duracak olan rotorun süresi uzatılmaz. Durum "yok" (τ 2, 7 sn) ve sahne
   * sıfırlaması (τ 0,15, 1 sn) kullanır; her karede değil, yalnız çalan ya da sönen rotor varken çağrılır.
   */
  private rotoruBirak(tau: number, durma: number) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime;
    const bitis = t + durma;
    if (this.sonenRotorlar.length) this.sonenRotorlar = this.sonenRotorlar.filter((r) => r.bitis > t);
    if (this.rotorDosya) {
      this.sonenRotorlar.push({ kazanc: this.rotorDosya.kazanc, kaynaklar: [this.rotorDosya.kaynak], bitis: Infinity });
      this.rotorDosya = null;
    }
    if (this.rotor) {
      this.sonenRotorlar.push({ kazanc: this.rotor.kazanc, kaynaklar: [this.rotor.osc, this.rotor.lfo], bitis: Infinity });
      this.rotor = null;
    }
    for (const r of this.sonenRotorlar) {
      if (r.bitis <= bitis) continue;
      sondur(r.kazanc.gain, t, tau);
      for (const k of r.kaynaklar) durdur(k, bitis);
      r.bitis = bitis;
    }
    this.rotorOncekiMesafe = -1;
  }

  /** Sürekli ortam sesi: rüzgâr ve yağış şiddetine göre filtrelenmiş gürültü (dağınık). */
  ortamAyarla(ortam: OrtamAyarlari) {
    if (!this.hazir || !this.gurultuTampon) return;
    const c = this.ctx!;
    if (!this.ortamKaynak) {
      const kaynak = c.createBufferSource();
      kaynak.buffer = this.ruzgarTampon ?? this.gurultuTampon;
      kaynak.loop = true;
      const filtre = c.createBiquadFilter();
      filtre.type = "lowpass";
      const kazanc = c.createGain();
      kazanc.gain.value = 0;
      kaynak.connect(filtre).connect(kazanc).connect(this.ortamHedefi);
      kaynak.start();
      this.ortamKaynak = { kaynak, filtre, kazanc };
    }
    const yagisSeviye = ortam.yagis === "yok" ? 0 : ortam.yagis === "hafif_yagmur" ? 0.12 : ortam.yagis === "siddetli_yagmur" ? 0.3 : 0.04;
    const seviye = 0.03 + ortam.ruzgarSiddeti * 0.25 + yagisSeviye;
    this.ortamKaynak.kazanc.gain.setTargetAtTime(seviye, c.currentTime, 1.5);
    this.ortamKaynak.filtre.frequency.setTargetAtTime(200 + ortam.ruzgarSiddeti * 900 + yagisSeviye * 6000, c.currentTime, 1.5);
  }

  /**
   * Döngülü ortam kaydı: anahtar manifest `ortam` sözlüğünde (bölge adı, "gece", "kis", "yagmur").
   * Çapraz geçişle değişir; anahtar yoksa dosya katmanı susar, sentezlenmiş rüzgâr sürer.
   */
  async ortamDongusu(anahtar: string | null) {
    this.ortamAnahtar = anahtar;
    if (!this.hazir) return;
    const c = this.ctx!;
    const dosya = anahtar ? this.manifest.ortam?.[anahtar] : undefined;
    if (this.ortamDosya && this.ortamDosya.anahtar === anahtar) return;
    // Yarış koruması: dosya çözülürken aynı (ya da başka) anahtarla ikinci çağrı gelirse yalnız sonuncusu kaynak kurar
    // (önceden açılışta manifest + durum + sesiAc çağrıları üst üste 2–3 döngü başlatıyor, ortam sesi katlanıyordu)
    const nesil = ++this.ortamNesli;
    if (this.ortamDosya) {
      const eski = this.ortamDosya;
      this.ortamDosya = null;
      eski.kazanc.gain.setTargetAtTime(0, c.currentTime, 2);
      setTimeout(() => eski.kaynak.stop(), 7000);
    }
    if (!dosya || !anahtar) return;
    const b = await this.tampon(dosya);
    if (!b || this.ortamAnahtar !== anahtar || !this.ctx || nesil !== this.ortamNesli || this.ortamDosya) return;
    const kaynak = c.createBufferSource();
    kaynak.buffer = b;
    kaynak.loop = true;
    const kazanc = c.createGain();
    kazanc.gain.value = 0;
    kaynak.connect(kazanc).connect(this.ortamHedefi);
    kaynak.start();
    kazanc.gain.setTargetAtTime(0.35, c.currentTime, 2.5);
    this.ortamDosya = { anahtar, kaynak, kazanc };
  }

  /**
   * Helikopter rotor sesi (kayıt döngüsü ya da sentez), her karede çağrılır. `konum` (3B sahneden) verilirse ses
   * o yönden gelir: seviye mesafeyle düşer (40 m'ye kadar tam, ötesi 1/r, tabanlı), uzakta boğuklaşır, yaklaşırken
   * / uzaklaşırken hafif Doppler. Konum yoksa önceki davranış (yönsüz, aynı seviye).
   */
  helikopter(durum: HelikopterDurumu, tozSiddeti: number, konum?: HelikopterSesKonumu | null) {
    if (!this.hazir) return;
    const c = this.ctx!;
    // Gerçek rotor kaydı varsa onu döngüle (sentez devreye girmez)
    if (this.manifest.helikopter_rotor) {
      if (durum === "yok") {
        // τ 2 sn ile söner, 7 sn'de durur (sıfırlama bunu hızlandırır)
        if (this.rotorDosya) this.rotoruBirak(2, 7);
        this.rotorOncekiMesafe = -1;
        return;
      }
      if (!this.rotorDosya) {
        if (this.rotorDosyaYukleniyor) return;
        this.rotorDosyaYukleniyor = true;
        void this.tampon(this.manifest.helikopter_rotor).then((b) => {
          this.rotorDosyaYukleniyor = false;
          if (!b || !this.ctx || this.rotorDosya) return;
          const kaynak = this.ctx.createBufferSource();
          kaynak.buffer = b;
          kaynak.loop = true;
          const kazanc = this.ctx.createGain();
          kazanc.gain.value = 0;
          kaynak.connect(kazanc).connect(this.rotorGirisi());
          kaynak.start();
          // Tek kanallı kayıt StereoPanner'da (çok kanalda her kayıt) tek noktaya iner, 3 dB kısılır: eski seviye korunur
          this.rotorDosya = { kaynak, kazanc, telafi: b.numberOfChannels === 1 || this.birlestirici ? Math.SQRT2 : 1 };
        });
        return;
      }
      if (this.rotorKonumla(konum)) this.rotorDosya.kaynak.playbackRate.setTargetAtTime(this.rotorDoppler, c.currentTime, 0.3);
      const seviye = 0.12 + tozSiddeti * 0.6 + (durum === "yerde" ? 0.1 : 0);
      this.rotorDosya.kazanc.gain.setTargetAtTime(seviye * this.rotorDosya.telafi * this.rotorZayiflama, c.currentTime, 0.8);
      return;
    }
    if (durum === "yok") {
      if (this.rotor) this.rotoruBirak(2, 6);
      this.rotorOncekiMesafe = -1;
      return;
    }
    if (!this.rotor) {
      // Rotor: düşük frekanslı testere dişi, pala vuruşu LFO ile modüle
      const osc = c.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = 55;
      const lfo = c.createOscillator();
      lfo.type = "square";
      lfo.frequency.value = 13;
      const lfoKazanc = c.createGain();
      lfoKazanc.gain.value = 0.5;
      const vuru = c.createGain();
      vuru.gain.value = 0.5;
      lfo.connect(lfoKazanc).connect(vuru.gain);
      const filtre = c.createBiquadFilter();
      filtre.type = "lowpass";
      filtre.frequency.value = 400;
      const kazanc = c.createGain();
      kazanc.gain.value = 0;
      osc.connect(vuru).connect(filtre).connect(kazanc).connect(this.rotorGirisi());
      osc.start();
      lfo.start();
      this.rotor = { osc, kazanc, lfo };
    }
    if (this.rotorKonumla(konum)) {
      this.rotor.osc.frequency.setTargetAtTime(55 * this.rotorDoppler, c.currentTime, 0.3);
      this.rotor.lfo.frequency.setTargetAtTime(13 * this.rotorDoppler, c.currentTime, 0.3);
    }
    const seviye = 0.15 + tozSiddeti * 0.45 + (durum === "yerde" ? 0.1 : 0);
    // Tek kanallı sentez StereoPanner'da 3 dB kısılır (√2 telafi: konum yokken eski seviye aynen)
    this.rotor.kazanc.gain.setTargetAtTime(seviye * Math.SQRT2 * this.rotorZayiflama, c.currentTime, 0.8);
  }

  /**
   * Yangın sesleri, her karede çağrılır (`liste`: 3B sahnedeki yangınlar; boşsa çalanlar söner). En çok 3 kaynak
   * (aynı yerdekiler birleşir); her biri sahne yönünden, mesafeyle zayıflar (18 m'ye kadar tam), 5.1/7.1'de bas kopyası
   * LFE'ye. Manifest `yangin` kaydı varsa döngülenir; yoksa sentez: alçak geçiren gürültü uğultusu (~350 Hz) + titreyen
   * tıslama (bant 2,5 kHz) + rastgele çıtırtılar (kısa gürültü vuruşları, seviyeyle sıklaşır). 20 Hz'de güncellenir.
   */
  yangin(liste: readonly YanginSesKaynagi[]) {
    if (!this.hazir || !this.gurultuTampon) return;
    const c = this.ctx!;
    const t = c.currentTime;
    if (t - this.yanginSonGuncelleme < 0.05) return;
    const dt = this.yanginSonGuncelleme < 0 ? 0.05 : t - this.yanginSonGuncelleme;
    this.yanginSonGuncelleme = t;
    if (this.sonenYanginlar.length) this.sonenYanginlar = this.sonenYanginlar.filter((y) => y.bitis > t);
    const secim = liste.length ? yanginKaynaklariSec(liste, YANGIN_EN_COK) : [];
    // Listeden düşenler (söndü, sahne sıfırlandı, bölge değişti) 1,5 sn'de söner
    for (const [anahtar, y] of this.yanginSesleri) {
      if (!secim.some((s) => s.anahtar === anahtar)) {
        this.yanginSesleri.delete(anahtar);
        this.yanginiBirak(y, 0.6, 2.5);
      }
    }
    if (this.manifest.yangin && this.yanginTampon === undefined) {
      this.yanginTampon = null;
      void this.tampon(this.manifest.yangin).then((b) => {
        this.yanginTampon = b;
      });
    }
    for (const s of secim) {
      let y = this.yanginSesleri.get(s.anahtar);
      if (!y) {
        y = this.yanginKur(s.azimut);
        this.yanginSesleri.set(s.anahtar, y);
      }
      const zayiflama = Math.max(YANGIN_TABAN, Math.min(1, YANGIN_REF_MESAFE / Math.max(1, s.mesafe)));
      const seviye = s.seviye * zayiflama;
      y.kazanc.gain.setTargetAtTime(0.5 * seviye, t, 0.4);
      // Tıslama titrer: her güncellemede rastgele hedef (alev dalgalanması)
      y.tislama?.gain.setTargetAtTime(0.25 + 0.35 * Math.random(), t, 0.08);
      // Çıtırtı: saniyede ~2–8 (seviyeyle), en az 60 ms arayla; kısa yüksek geçiren gürültü vuruşu
      const olasilik = (2 + 6 * s.seviye) * dt;
      if (t - y.sonCitirti > 0.06 && Math.random() < olasilik) {
        y.sonCitirti = t;
        const k = c.createBufferSource();
        k.buffer = this.gurultuTampon;
        k.loop = true;
        k.loopStart = Math.random() * 1.5;
        k.loopEnd = k.loopStart + 0.2;
        const f = c.createBiquadFilter();
        f.type = "highpass";
        f.frequency.value = 1500 + Math.random() * 2500;
        const g = c.createGain();
        const sure = 0.015 + Math.random() * 0.04;
        g.gain.setValueAtTime(0.5 + Math.random() * 0.8, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + sure);
        k.connect(f).connect(g).connect(y.cikis);
        k.start(t);
        k.stop(t + sure + 0.01);
      }
    }
  }

  /** Bir yangın sesi kurar: konumlu çıkış (yön, LFE) + kayıt döngüsü ya da sentez (uğultu + tıslama). Çıtırtı `yangin`da. */
  private yanginKur(azimut: number): YanginSesi {
    const c = this.ctx!;
    const cikis = this.cikis(azimut, 1, false, 0.35);
    const kazanc = c.createGain();
    kazanc.gain.value = 0;
    kazanc.connect(cikis);
    const kaynaklar: AudioScheduledSourceNode[] = [];
    let tislama: GainNode | null = null;
    if (this.yanginTampon) {
      const k = c.createBufferSource();
      k.buffer = this.yanginTampon;
      k.loop = true;
      k.loopStart = Math.random() * Math.max(0, this.yanginTampon.duration - 1);
      const telafi = c.createGain();
      telafi.gain.value = this.telafi(this.yanginTampon);
      k.connect(telafi).connect(kazanc);
      k.start();
      kaynaklar.push(k);
    } else {
      // Uğultu: alçak geçiren gürültü; tıslama: bant geçiren gürültü, titreyen kazanç
      const ugultu = c.createBufferSource();
      ugultu.buffer = this.gurultuTampon;
      ugultu.loop = true;
      ugultu.loopStart = Math.random();
      const f1 = c.createBiquadFilter();
      f1.type = "lowpass";
      f1.frequency.value = 350;
      f1.Q.value = 0.8;
      const g1 = c.createGain();
      g1.gain.value = 1.4;
      ugultu.connect(f1).connect(g1).connect(kazanc);
      ugultu.start();
      const tis = c.createBufferSource();
      tis.buffer = this.gurultuTampon;
      tis.loop = true;
      tis.loopStart = Math.random();
      const f2 = c.createBiquadFilter();
      f2.type = "bandpass";
      f2.frequency.value = 2500;
      f2.Q.value = 0.7;
      tislama = c.createGain();
      tislama.gain.value = 0.3;
      tis.connect(f2).connect(tislama).connect(kazanc);
      tis.start();
      kaynaklar.push(ugultu, tis);
    }
    return { kazanc, cikis, kaynaklar, tislama, bitis: Infinity, sonCitirti: 0 };
  }

  /** Yangın sesini `tau` ile söndürür, `durma` sn sonra kaynakları durdurur (sahne sıfırlaması 0,15/1, sönme 0,6/2,5). */
  private yanginiBirak(y: YanginSesi, tau: number, durma: number) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime;
    const bitis = t + durma;
    if (y.bitis <= bitis) return;
    sondur(y.kazanc.gain, t, tau);
    for (const k of y.kaynaklar) durdur(k, bitis);
    y.bitis = bitis;
    this.sonenYanginlar.push(y);
  }

  /** Çalan yangın sesi sayısı (tanı ve test). */
  get yanginSesSayisi() {
    return this.yanginSesleri.size;
  }

  /** Rotor sesinin kalıcı konum zinciri: mesafe filtresi → StereoPanner (stereo) / kanal kazançları (çok kanal). */
  private rotorGirisi(): AudioNode {
    const c = this.ctx!;
    if (!this.rotorUzay) {
      const filtre = c.createBiquadFilter();
      filtre.type = "lowpass";
      filtre.frequency.value = c.sampleRate / 2; // Nyquist: filtre tam geçirgen (konum yokken eski ses)
      let pan: StereoPannerNode | null = null;
      const kanallar: Array<GainNode | null> = [];
      const birlestirici = this.birlestirici;
      if (birlestirici && this.yerlesim) {
        const g = kanalKazanclari(this.yerlesim, 0, 1, this.rotorKazanclari);
        this.yerlesim.azimutlar.forEach((a, i) => {
          if (a === null) {
            kanallar.push(null);
            return;
          }
          const k = c.createGain();
          k.gain.value = g[i];
          filtre.connect(k).connect(birlestirici, 0, i);
          kanallar.push(k);
        });
      } else {
        pan = c.createStereoPanner();
        filtre.connect(pan).connect(this.ana!);
      }
      this.rotorUzay = { filtre, pan, kanallar };
    }
    return this.rotorUzay.filtre;
  }

  /**
   * Konum zincirini en çok 20 Hz'de günceller (yön, mesafe zayıflaması, filtre, Doppler oranı); güncellediyse true.
   * Ayırmasız: kanal kazançları hazır diziye yazılır.
   */
  private rotorKonumla(konum: HelikopterSesKonumu | null | undefined): boolean {
    const z = this.rotorUzay;
    const c = this.ctx;
    if (!z || !c) return false;
    const simdi = c.currentTime;
    const dt = simdi - this.rotorSonGuncelleme;
    if (dt < 0.05) return false;
    this.rotorSonGuncelleme = simdi;
    const nyquist = c.sampleRate / 2;
    let kesim = nyquist;
    if (konum) {
      const d = Math.max(1, Math.hypot(konum.mesafe, konum.irtifa));
      this.rotorZayiflama = Math.max(ROTOR_TABAN, Math.min(1, ROTOR_REF_MESAFE / d));
      // Hava soğurması: uzakta tizler kaybolur (40 m'de açık, ~200 m'de ~3,5 kHz, ~430 m'de ~1,4 kHz)
      if (d > ROTOR_REF_MESAFE) kesim = Math.max(700, nyquist * Math.pow(ROTOR_REF_MESAFE / d, 1.2));
      // Hafif Doppler: radyal hız mesafe değişiminden (durum değişimindeki sıçrama yok sayılır), ±%5
      if (this.rotorOncekiMesafe >= 0 && dt < 0.5) {
        const v = (d - this.rotorOncekiMesafe) / dt;
        this.rotorHiz += ((Math.abs(v) < 120 ? v : 0) - this.rotorHiz) * 0.3;
      }
      this.rotorOncekiMesafe = d;
      this.rotorDoppler = Math.max(0.95, Math.min(1.05, SES_HIZI / (SES_HIZI + 0.5 * this.rotorHiz)));
    } else {
      this.rotorZayiflama = 1;
      this.rotorOncekiMesafe = -1;
      this.rotorHiz = 0;
      this.rotorDoppler = 1;
    }
    z.filtre.frequency.setTargetAtTime(kesim, simdi, 0.3);
    if (z.pan) z.pan.pan.setTargetAtTime(konum && Number.isFinite(konum.azimut) ? stereoPan(konum.azimut) : 0, simdi, 0.15);
    else if (this.yerlesim) {
      // Konum yokken dağınık (her hoparlörde eşit), varken yönlü
      const g = kanalKazanclari(this.yerlesim, konum?.azimut ?? 0, konum ? 0 : 1, this.rotorKazanclari);
      for (let i = 0; i < z.kanallar.length; i++) z.kanallar[i]?.gain.setTargetAtTime(g[i], simdi, 0.15);
    }
    return true;
  }

  /** 1 sn pembe gürültü (Paul Kellet süzgeci); hoparlör testi için bir kez üretilir. */
  private pembeGurultu(c: AudioContext): AudioBuffer {
    if (this.pembeTampon) return this.pembeTampon;
    const b = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = b.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let b3 = 0;
    let b4 = 0;
    let b5 = 0;
    let b6 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
    this.pembeTampon = b;
    return b;
  }

  /**
   * Hoparlör testi (T tuşu): kanal sırasıyla her hoparlörde ~0,7 sn pembe gürültü (LFE'de 30–120 Hz bant).
   * Test sürerken yeniden çağrılırsa durdurur. Çalan kanalın adı `testDurumu`'nda (ekranda gösterilir).
   * Ana kazançtan geçer: sessiz kipte (M) duyulmaz.
   */
  hoparlorTesti(): boolean {
    const c = this.ctx;
    if (!this.hazir || !c || !this.yerlesim) return false;
    if (this.testDurumu) {
      for (const s of this.test?.kaynaklar ?? []) {
        try {
          s.stop();
        } catch {
          /* zaten durdu */
        }
      }
      this.test = null;
      return false;
    }
    const tampon = this.pembeGurultu(c);
    const etiketler = kanalEtiketleri(this.yerlesim);
    const baslangic = c.currentTime + 0.15;
    const kaynaklar: AudioBufferSourceNode[] = [];
    etiketler.forEach((_, i) => {
      const t = baslangic + i * TEST_ADIM;
      const s = c.createBufferSource();
      s.buffer = tampon;
      // Tık sesi olmasın: 20 ms yumuşak giriş/çıkış
      const zarf = c.createGain();
      zarf.gain.setValueAtTime(0, t);
      zarf.gain.linearRampToValueAtTime(0.8, t + 0.02);
      zarf.gain.setValueAtTime(0.8, t + TEST_SURE - 0.02);
      zarf.gain.linearRampToValueAtTime(0, t + TEST_SURE);
      if (i === this.lfeKanali) {
        // Bas kanalı (subwoofer): 30–120 Hz bant
        const yuksek = c.createBiquadFilter();
        yuksek.type = "highpass";
        yuksek.frequency.value = 30;
        const alcak = c.createBiquadFilter();
        alcak.type = "lowpass";
        alcak.frequency.value = LFE_KESIM;
        s.connect(yuksek).connect(alcak).connect(zarf);
      } else s.connect(zarf);
      if (this.birlestirici) zarf.connect(this.birlestirici, 0, i);
      else {
        const p = c.createStereoPanner();
        p.pan.value = i === 0 ? -1 : 1;
        zarf.connect(p).connect(this.ana!);
      }
      s.start(t);
      s.stop(t + TEST_SURE + 0.05);
      kaynaklar.push(s);
    });
    this.test = { baslangic, etiketler, kaynaklar };
    return true;
  }

  /** Süren hoparlör testinde çalan kanal (1'den başlar); test yoksa null. */
  get testDurumu(): { ad: string; kanal: number; toplam: number } | null {
    const t = this.test;
    if (!t || !this.ctx) return null;
    const i = Math.max(0, Math.floor((this.ctx.currentTime - t.baslangic) / TEST_ADIM));
    if (i >= t.etiketler.length) return null;
    return { ad: t.etiketler[i], kanal: i + 1, toplam: t.etiketler.length };
  }
}
