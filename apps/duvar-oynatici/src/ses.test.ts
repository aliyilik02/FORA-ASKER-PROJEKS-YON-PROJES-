/**
 * SesMotoru düğüm grafiği testleri: Node'da Web Audio yok, bağlantıları kaydeden sahte bir AudioContext ile
 * stereo yolun eskisi gibi kaldığı, çok kanalın doğru birleştirici girişlerine ve LFE'ye gittiği doğrulanır.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SesMotoru } from "./ses";
import type { OrtamAyarlari } from "./tipler";

class SahteParam {
  hedef: number | null = null;
  constructor(public value: number) {}
  setTargetAtTime(v: number) {
    this.hedef = v;
    return this;
  }
  setValueAtTime(v: number) {
    this.value = v;
    return this;
  }
  linearRampToValueAtTime() {
    return this;
  }
  exponentialRampToValueAtTime() {
    return this;
  }
}

interface Baglanti {
  hedef: SahteDugum | SahteParam;
  cikis: number;
  giris: number;
}

class SahteDugum {
  baglantilar: Baglanti[] = [];
  channelCount = 2;
  channelCountMode = "max";
  channelInterpretation = "speakers";
  gain = new SahteParam(1);
  pan = new SahteParam(0);
  frequency = new SahteParam(350);
  Q = new SahteParam(1);
  playbackRate = new SahteParam(1);
  type = "";
  buffer: unknown = null;
  loop = false;
  baslama: number | null = null;
  durma: number | null = null;
  constructor(
    public tur: string,
    baglam: SahteBaglam,
  ) {
    baglam.dugumler.push(this);
  }
  connect(hedef: SahteDugum | SahteParam, cikis = 0, giris = 0) {
    this.baglantilar.push({ hedef, cikis, giris });
    return hedef;
  }
  start(t = 0) {
    this.baslama = t;
  }
  stop(t = 0) {
    this.durma = t;
  }
}

class SahteTampon {
  private veri: Float32Array[];
  constructor(
    public numberOfChannels: number,
    public length: number,
    public sampleRate: number,
  ) {
    this.veri = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  getChannelData(i: number) {
    return this.veri[i];
  }
}

class SahteBaglam {
  static maxKanal = 2;
  static son: SahteBaglam;
  dugumler: SahteDugum[] = [];
  currentTime = 0;
  sampleRate = 48000;
  state = "suspended";
  destination: SahteDugum & { maxChannelCount: number };
  constructor() {
    this.destination = Object.assign(new SahteDugum("cikis", this), { maxChannelCount: SahteBaglam.maxKanal, channelCountMode: "explicit" });
    SahteBaglam.son = this;
  }
  async resume() {
    this.state = "running";
  }
  createGain() {
    return new SahteDugum("kazanc", this);
  }
  createStereoPanner() {
    return new SahteDugum("pan", this);
  }
  createBiquadFilter() {
    return new SahteDugum("filtre", this);
  }
  createChannelMerger(n: number) {
    return Object.assign(new SahteDugum("birlestirici", this), { girisSayisi: n });
  }
  createChannelSplitter() {
    return new SahteDugum("bolucu", this);
  }
  createBufferSource() {
    return new SahteDugum("kaynak", this);
  }
  createOscillator() {
    return new SahteDugum("osc", this);
  }
  createBuffer(kanal: number, uzunluk: number, oran: number) {
    return new SahteTampon(kanal, uzunluk, oran);
  }
}

const ORTAM = { yagis: "yok", ruzgarSiddeti: 0.5 } as OrtamAyarlari;

/** Bir düğüme (ya da birleştiricinin bir girişine) doğrudan bağlananlar. */
const gelenler = (b: SahteBaglam, hedef: SahteDugum, giris?: number) =>
  b.dugumler.filter((d) => d.baglantilar.some((k) => k.hedef === hedef && (giris === undefined || k.giris === giris)));

async function motor(maxKanal: number, ayar?: ConstructorParameters<typeof SesMotoru>[0]) {
  SahteBaglam.maxKanal = maxKanal;
  const ses = new SesMotoru(ayar);
  expect(await ses.etkinlestir()).toBe(true);
  const b = SahteBaglam.son;
  const ana = gelenler(b, b.destination)[0];
  return { ses, b, ana };
}

describe("SesMotoru (sahte Web Audio)", () => {
  beforeEach(() => {
    vi.stubGlobal("AudioContext", SahteBaglam);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stereo cihaz: StereoPanner yolu (pan = sin azimut), çıkış 2 kanal kalır, birleştirici yok", async () => {
    const { ses, b, ana } = await motor(2);
    expect(ses.duzenBilgisi).toBe("stereo (2 kanal)");
    expect(b.destination.channelCount).toBe(2);
    expect(b.destination.channelInterpretation).toBe("speakers");
    expect(ana.gain.value).toBe(0.8);
    await ses.patlama(30, 1);
    const panlar = b.dugumler.filter((d) => d.tur === "pan");
    expect(panlar).toHaveLength(2); // gürültü + alçak frekans vuruşu
    for (const p of panlar) {
      expect(p.pan.value).toBeCloseTo(0.5);
      expect(p.baglantilar[0].hedef).toBe(ana);
    }
    expect(b.dugumler.some((d) => d.tur === "birlestirici")).toBe(false);
    // Ortam (rüzgâr) doğrudan ana kazanca, eskisi gibi
    ses.ortamAyarla(ORTAM);
    const ruzgarKaynagi = b.dugumler.filter((d) => d.tur === "kaynak").find((d) => d.loop);
    const filtre = ruzgarKaynagi!.baglantilar[0].hedef as SahteDugum;
    const kazanc = filtre.baglantilar[0].hedef as SahteDugum;
    expect(kazanc.baglantilar[0].hedef).toBe(ana);
  });

  it("5.1 cihaz (otomatik): çıkış 6 kanal ayrık; ses iki komşu hoparlöre, patlama basları LFE'ye", async () => {
    const { ses, b, ana } = await motor(6);
    expect(ses.duzenBilgisi).toBe("5.1 (6 kanal)");
    expect(b.destination.channelCount).toBe(6);
    expect(b.destination.channelInterpretation).toBe("discrete");
    expect(ana.channelCount).toBe(6);
    const birlestirici = b.dugumler.find((d) => d.tur === "birlestirici")!;
    expect(birlestirici.baglantilar[0].hedef).toBe(ana);

    const once = b.dugumler.length;
    ses.tekAtis(15); // orta (0°) ile ön sağ (30°) arası
    const yeni = b.dugumler.slice(once);
    const girisler = yeni.flatMap((d) => d.baglantilar.filter((k) => k.hedef === birlestirici).map((k) => ({ giris: k.giris, kazanc: d.gain.value })));
    expect(girisler.map((g) => g.giris).sort()).toEqual([1, 2]);
    for (const g of girisler) expect(g.kazanc).toBeCloseTo(Math.SQRT1_2);
    expect(b.dugumler.some((d) => d.tur === "pan")).toBe(false);

    const once2 = b.dugumler.length;
    await ses.patlama(0, 1);
    const lfeGelen = gelenler(b, birlestirici, 3).filter((d) => b.dugumler.indexOf(d) >= once2);
    expect(lfeGelen).toHaveLength(2); // gürültü + vuruş, ikisinin de bas kopyası
    for (const k of lfeGelen) {
      expect(k.gain.value).toBe(0.5);
      const filtre = gelenler(b, k)[0];
      expect(filtre.type).toBe("lowpass");
      expect(filtre.frequency.value).toBe(120);
    }
    // Ortam: rüzgâr dağınık girişe (2 kanal, hoparlör kuralıyla açılır)
    ses.ortamAyarla(ORTAM);
    const ruzgarKaynagi = b.dugumler.filter((d) => d.tur === "kaynak").find((d) => d.loop)!;
    const kazanc = (ruzgarKaynagi.baglantilar[0].hedef as SahteDugum).baglantilar[0].hedef as SahteDugum;
    const giris = kazanc.baglantilar[0].hedef as SahteDugum;
    expect(giris.channelCount).toBe(2);
    expect(giris.channelCountMode).toBe("explicit");
  });

  it("uzak ses çok kanalda yayılır, LFE'siz düzende bas kopyası yok", async () => {
    const { ses, b } = await motor(4);
    expect(ses.duzenBilgisi).toBe("dortlu (4 kanal)");
    const birlestirici = b.dugumler.find((d) => d.tur === "birlestirici")!;
    const once = b.dugumler.length;
    await ses.patlama(0, 1, true, 800);
    const girisler = new Set(b.dugumler.slice(once).flatMap((d) => d.baglantilar.filter((k) => k.hedef === birlestirici).map((k) => k.giris)));
    expect([...girisler].sort()).toEqual([0, 1, 2, 3]); // %35 yayılım: arka hoparlörler de alır
    expect(b.dugumler.slice(once).some((d) => d.tur === "filtre" && d.frequency.value === 120)).toBe(false);
  });

  it("istenen düzen cihaza sığmazsa otomatik + uyarı; adres uyarıları dinleyiciye iletilir", async () => {
    const uyarilar: string[] = [];
    const { ses } = await motor(2, { duzen: "7.1", hoparlor: null, uyarilar: ["?ses=9 tanınmadı"] });
    ses.uyariDinle((m) => uyarilar.push(m));
    expect(ses.duzenBilgisi).toBe("stereo (2 kanal) · istenen 7.1, cihaz 2 kanal");
    expect(uyarilar[0]).toBe("?ses=9 tanınmadı");
    expect(uyarilar[1]).toContain("7.1 istendi");
  });

  it("?hoparlor= kanal sayısı düzeni belirler, özel açılar kullanılır", async () => {
    const { ses, b } = await motor(8, { duzen: null, hoparlor: [-60, 60, -120, 120], uyarilar: [] });
    expect(ses.duzenBilgisi).toBe("dortlu (4 kanal, özel açılar)");
    expect(b.destination.channelCount).toBe(4);
    const birlestirici = b.dugumler.find((d) => d.tur === "birlestirici")!;
    const once = b.dugumler.length;
    ses.vizilti(120); // tam arka sağ hoparlör
    const girisler = b.dugumler.slice(once).flatMap((d) => d.baglantilar.filter((k) => k.hedef === birlestirici).map((k) => k.giris));
    expect(girisler).toEqual([3]);
  });

  it("helikopter (stereo): konumsuz eski seviye ve yönsüz; konumla zayıflama, yön, boğuklaşma, Doppler", async () => {
    const { ses, b } = await motor(2);
    ses.helikopter("yaklasiyor", 0);
    const osc = b.dugumler.find((d) => d.tur === "osc" && d.baglantilar.some((k) => (k.hedef as SahteDugum).tur === "kazanc"))!;
    const vuru = osc.baglantilar[0].hedef as SahteDugum;
    const sentezFiltre = vuru.baglantilar[0].hedef as SahteDugum;
    const kazanc = sentezFiltre.baglantilar[0].hedef as SahteDugum;
    const mesafeFiltresi = kazanc.baglantilar[0].hedef as SahteDugum;
    const pan = mesafeFiltresi.baglantilar[0].hedef as SahteDugum;
    // Konumsuz: tek kanallı sentez StereoPanner'da 3 dB kısılır → √2 telafi, pan 0, filtre Nyquist (tam geçirgen)
    expect(kazanc.gain.hedef).toBeCloseTo(0.15 * Math.SQRT2);
    expect(pan.pan.hedef).toBe(0);
    expect(mesafeFiltresi.frequency.value).toBe(24000);
    expect(mesafeFiltresi.frequency.hedef).toBe(24000);

    b.currentTime = 0.1;
    ses.helikopter("yaklasiyor", 0, { azimut: 90, mesafe: 400, irtifa: 0 });
    expect(kazanc.gain.hedef).toBeCloseTo(0.15 * Math.SQRT2 * 0.12); // 40/400 = 0,1 → taban 0,12
    expect(pan.pan.hedef).toBeCloseTo(1);
    expect(mesafeFiltresi.frequency.hedef!).toBeLessThan(2000);
    expect(mesafeFiltresi.frequency.hedef!).toBeGreaterThanOrEqual(700);

    // 20 Hz sınırı: aynı anda ikinci çağrı konumu güncellemez
    ses.helikopter("yaklasiyor", 0, { azimut: -90, mesafe: 400, irtifa: 0 });
    expect(pan.pan.hedef).toBeCloseTo(1);

    b.currentTime = 0.2;
    ses.helikopter("yaklasiyor", 0, { azimut: 90, mesafe: 396, irtifa: 0 }); // 40 m/sn yaklaşıyor
    expect(osc.frequency.hedef!).toBeGreaterThan(55);
    expect(osc.frequency.hedef!).toBeLessThanOrEqual(55 * 1.05);

    b.currentTime = 0.3;
    ses.helikopter("yerde", 0.45, { azimut: 12, mesafe: 30, irtifa: 0 });
    expect(mesafeFiltresi.frequency.hedef).toBe(24000); // yakında açık
    expect(kazanc.gain.hedef).toBeCloseTo((0.15 + 0.45 * 0.45 + 0.1) * Math.SQRT2);
  });

  it("helikopter (çok kanal): kalıcı zincir, konumsuz dağınık, konumla yönlü; yeni düğüm üretmez", async () => {
    const { ses, b } = await motor(6);
    ses.helikopter("yaklasiyor", 0);
    const dugumSayisi = b.dugumler.length;
    const mesafeFiltresi = b.dugumler.find((d) => d.tur === "filtre" && d.frequency.value === 24000)!;
    const kanallar = mesafeFiltresi.baglantilar.map((k) => k.hedef as SahteDugum);
    expect(kanallar).toHaveLength(5); // LFE hariç
    for (const k of kanallar) expect(k.gain.hedef).toBeCloseTo(1 / Math.sqrt(5));
    b.currentTime = 0.1;
    ses.helikopter("iniyor", 0.3, { azimut: 30, mesafe: 38, irtifa: 5 });
    expect(b.dugumler.length).toBe(dugumSayisi);
    expect(kanallar[1].gain.hedef).toBeCloseTo(1); // ön sağ (30°)
    expect(kanallar[0].gain.hedef).toBeCloseTo(0);
  });

  it("hoparlör testi (5.1): kanal sırasıyla gürültü, LFE'de bant, ekran etiketi; ikinci çağrı durdurur", async () => {
    const { ses, b } = await motor(6);
    const birlestirici = b.dugumler.find((d) => d.tur === "birlestirici")!;
    const once = b.dugumler.length;
    expect(ses.hoparlorTesti()).toBe(true);
    expect(ses.testDurumu).toEqual({ ad: "Ön sol", kanal: 1, toplam: 6 });
    const kaynaklar = b.dugumler.slice(once).filter((d) => d.tur === "kaynak");
    expect(kaynaklar).toHaveLength(6);
    expect(kaynaklar[1].baslama! - kaynaklar[0].baslama!).toBeCloseTo(1.05);
    for (let i = 0; i < 6; i++) expect(gelenler(b, birlestirici, i).some((d) => b.dugumler.indexOf(d) >= once)).toBe(true);
    // LFE: yüksek geçiren 30 Hz → alçak geçiren 120 Hz
    const lfeYuksek = kaynaklar[3].baglantilar[0].hedef as SahteDugum;
    expect(lfeYuksek.type).toBe("highpass");
    expect((lfeYuksek.baglantilar[0].hedef as SahteDugum).frequency.value).toBe(120);
    b.currentTime = 0.15 + 3 * 1.05 + 0.1;
    expect(ses.testDurumu).toEqual({ ad: "Bas (LFE)", kanal: 4, toplam: 6 });
    expect(ses.hoparlorTesti()).toBe(false); // durdur
    expect(ses.testDurumu).toBeNull();
    expect(kaynaklar.every((k) => k.durma !== null)).toBe(true);
  });

  it("hoparlör testi (stereo): sol tam sola, sağ tam sağa; test bitince etiket yok", async () => {
    const { ses, b } = await motor(2);
    ses.hoparlorTesti();
    const panlar = b.dugumler.filter((d) => d.tur === "pan");
    expect(panlar.map((p) => p.pan.value)).toEqual([-1, 1]);
    expect(ses.testDurumu?.ad).toBe("Sol");
    b.currentTime = 0.15 + 2 * 1.05 + 0.01;
    expect(ses.testDurumu).toBeNull();
  });
});
