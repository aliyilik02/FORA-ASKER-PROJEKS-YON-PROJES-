/**
 * Ses motoru (Web Audio). Manifestte gerçek kayıtlar varsa onları çalar; yoksa sentezlenmiş
 * yer tutucular kullanır. Konumsal yerleşim StereoPanner ile (saha kurulumunda 4+ kanal için
 * ChannelMerger'a genişletilir). Uzak sesler alçak geçiren filtre + düşük seviye ile uzaklaştırılır.
 */
import type { HelikopterDurumu, OrtamAyarlari } from "./tipler";

export interface SesManifesti {
  patlama?: string[];
  uzak_patlama?: string[];
  gurultu?: string[];
  bagirma?: string[];
  cagirma?: string[];
  mermi_vizilti?: string[];
  helikopter_rotor?: string | null;
  ortam?: Record<string, string>;
}

const BAGIRMALAR = ["Yaralı var!", "Siper al!", "Geri çekil!", "Sağ taraf, sağ taraf!", "Yardım edin!"];
const CAGIRMALAR = ["Sıhhiye!", "Sıhhiye, buraya!", "Sedye getirin!", "Tahliye hazır!"];

export class SesMotoru {
  private ctx: AudioContext | null = null;
  private ana: GainNode | null = null;
  private gurultuTampon: AudioBuffer | null = null;
  private tamponlar = new Map<string, AudioBuffer>();
  private manifest: SesManifesti = {};
  private kokYol = "icerik/sesler/";
  private ortamKaynak: { kaynak: AudioBufferSourceNode; filtre: BiquadFilterNode; kazanc: GainNode } | null = null;
  private rotor: { osc: OscillatorNode; kazanc: GainNode; lfo: OscillatorNode } | null = null;
  /** Manifestten gelen döngülü ortam kaydı (bölge/gece/yağmur) ve rotor kaydı; yoksa sentez kalır. */
  private ortamDosya: { anahtar: string; kaynak: AudioBufferSourceNode; kazanc: GainNode } | null = null;
  private ortamAnahtar: string | null = null;
  private rotorDosya: { kaynak: AudioBufferSourceNode; kazanc: GainNode } | null = null;
  private rotorDosyaYukleniyor = false;
  sessiz = false;

  get hazir() {
    return this.ctx?.state === "running";
  }

  manifestAyarla(m: SesManifesti, kokYol?: string) {
    this.manifest = m;
    if (kokYol) this.kokYol = kokYol;
  }

  /** Kullanıcı hareketi veya kiosk otomatik izni ile bağlamı açar. */
  async etkinlestir(): Promise<boolean> {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.ana = this.ctx.createGain();
      this.ana.gain.value = 0.8;
      this.ana.connect(this.ctx.destination);
      const sn = 2;
      this.gurultuTampon = this.ctx.createBuffer(1, this.ctx.sampleRate * sn, this.ctx.sampleRate);
      const d = this.gurultuTampon.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    try {
      await this.ctx.resume();
    } catch {
      /* izin yok */
    }
    return this.hazir;
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

  private cikis(pan: number, kazanc: number, uzak = false): AudioNode {
    const c = this.ctx!;
    const g = c.createGain();
    g.gain.value = kazanc;
    const p = c.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    if (uzak) {
      const f = c.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 600;
      g.connect(f).connect(p).connect(this.ana!);
    } else {
      g.connect(p).connect(this.ana!);
    }
    return g;
  }

  /** Manifestteki dosyalardan rastgele birini çalar; yoksa false döner. */
  private async dosyaCal(liste: string[] | undefined, pan: number, kazanc: number, uzak: boolean): Promise<boolean> {
    if (!this.ctx || !liste || liste.length === 0) return false;
    const b = await this.tampon(liste[Math.floor(Math.random() * liste.length)]);
    if (!b) return false;
    const s = this.ctx.createBufferSource();
    s.buffer = b;
    s.connect(this.cikis(pan, kazanc, uzak));
    s.start();
    return true;
  }

  private gurultuPatlamasi(pan: number, kazanc: number, sure: number, kesim: number, uzak: boolean, tip: BiquadFilterType = "lowpass") {
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
    s.connect(f).connect(g).connect(this.cikis(pan, 1, uzak));
    s.start();
    s.stop(c.currentTime + sure + 0.05);
  }

  async patlama(pan: number, siddet: number, uzak = false, mesafe = 0) {
    if (!this.hazir) return;
    const zayiflama = uzak ? Math.max(0.08, 1 - mesafe / 5000) : 1;
    if (await this.dosyaCal(uzak ? this.manifest.uzak_patlama : this.manifest.patlama, pan, siddet * zayiflama, uzak)) return;
    const c = this.ctx!;
    // Gürültü + alçak frekans vuruşu
    this.gurultuPatlamasi(pan, 0.9 * siddet * zayiflama, uzak ? 1.6 : 1.1, uzak ? 500 : 3000, uzak);
    const o = c.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(uzak ? 60 : 110, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(30, c.currentTime + 0.8);
    const g = c.createGain();
    g.gain.setValueAtTime(0.8 * siddet * zayiflama, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.9);
    o.connect(g).connect(this.cikis(pan, 1, uzak));
    o.start();
    o.stop(c.currentTime + 1);
  }

  async gurultu(pan: number, siddet: number, uzak = false) {
    if (!this.hazir) return;
    // Manifestteki kayıtlar tek atış; seri atış için 6–10 kez hızla art arda çalınır
    if (this.manifest.gurultu?.length) {
      const adet = 6 + Math.floor(Math.random() * 5);
      for (let i = 0; i < adet; i++) setTimeout(() => void this.dosyaCal(this.manifest.gurultu, pan + (Math.random() - 0.5) * 0.2, siddet * 0.8, uzak), i * (85 + Math.random() * 35));
      return;
    }
    // Seri atış: 8–14 kısa patlama
    const adet = 8 + Math.floor(Math.random() * 7);
    for (let i = 0; i < adet; i++) {
      setTimeout(() => this.gurultuPatlamasi(pan + (Math.random() - 0.5) * 0.3, 0.5 * siddet, 0.09, 2500, uzak, "bandpass"), i * (70 + Math.random() * 40));
    }
  }

  /** Tek atış (çatışma): manifest kaydı varsa rastgele perde ile, yoksa kısa gürültü vuruşu. */
  tekAtis(pan: number, uzak = false) {
    if (!this.hazir || !this.ctx) return;
    const liste = this.manifest.gurultu;
    if (liste?.length) {
      const yol = liste[Math.floor(Math.random() * liste.length)];
      const onbellek = this.tamponlar.get(yol);
      const cal = (b: AudioBuffer) => {
        const s = this.ctx!.createBufferSource();
        s.buffer = b;
        s.playbackRate.value = 0.9 + Math.random() * 0.25;
        s.connect(this.cikis(pan, uzak ? 0.22 : 0.55, uzak));
        s.start();
      };
      if (onbellek) cal(onbellek);
      else void this.tampon(yol).then((b) => b && cal(b));
      return;
    }
    this.gurultuPatlamasi(pan, uzak ? 0.2 : 0.5, 0.09, uzak ? 900 : 2500, uzak, "bandpass");
  }

  /** Yakına çarpan mermi: kısa tok vuruş + vızıltı. */
  carpma(pan: number) {
    if (!this.hazir) return;
    this.gurultuPatlamasi(pan, 0.35, 0.06, 1400, false, "bandpass");
    if (Math.random() < 0.5) this.vizilti(pan);
  }

  async mermi(pan: number, uzak = true) {
    if (!this.hazir) return;
    if (await this.dosyaCal(this.manifest.mermi_vizilti, pan, 0.6, uzak)) return;
    const adet = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < adet; i++) setTimeout(() => this.gurultuPatlamasi(pan, 0.35, 0.08, 1800, uzak, "bandpass"), i * 120);
  }

  vizilti(pan: number) {
    if (!this.hazir) return;
    if (this.manifest.mermi_vizilti?.length) {
      void this.dosyaCal(this.manifest.mermi_vizilti, pan, 0.4, false);
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
    o.connect(g).connect(this.cikis(pan, 1));
    o.start();
    o.stop(c.currentTime + 0.3);
  }

  private konus(metin: string, pan: number, uzak: boolean) {
    if (!("speechSynthesis" in window)) {
      this.gurultuPatlamasi(pan, 0.4, 0.5, 900, uzak, "bandpass");
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

  async bagirma(pan: number, uzak = false) {
    if (!this.hazir) return;
    if (await this.dosyaCal(this.manifest.bagirma, pan, 1, uzak)) return;
    this.konus(BAGIRMALAR[Math.floor(Math.random() * BAGIRMALAR.length)], pan, uzak);
  }

  async cagirma(pan: number, uzak = false) {
    if (!this.hazir) return;
    if (await this.dosyaCal(this.manifest.cagirma, pan, 1, uzak)) return;
    this.konus(CAGIRMALAR[Math.floor(Math.random() * CAGIRMALAR.length)], pan, uzak);
  }

  /** Sürekli ortam sesi: rüzgâr ve yağış şiddetine göre filtrelenmiş gürültü. */
  ortamAyarla(ortam: OrtamAyarlari) {
    if (!this.hazir || !this.gurultuTampon) return;
    const c = this.ctx!;
    if (!this.ortamKaynak) {
      const kaynak = c.createBufferSource();
      kaynak.buffer = this.gurultuTampon;
      kaynak.loop = true;
      const filtre = c.createBiquadFilter();
      filtre.type = "lowpass";
      const kazanc = c.createGain();
      kazanc.gain.value = 0;
      kaynak.connect(filtre).connect(kazanc).connect(this.ana!);
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
    if (this.ortamDosya) {
      const eski = this.ortamDosya;
      this.ortamDosya = null;
      eski.kazanc.gain.setTargetAtTime(0, c.currentTime, 2);
      setTimeout(() => eski.kaynak.stop(), 7000);
    }
    if (!dosya || !anahtar) return;
    const b = await this.tampon(dosya);
    if (!b || this.ortamAnahtar !== anahtar || !this.ctx) return;
    const kaynak = c.createBufferSource();
    kaynak.buffer = b;
    kaynak.loop = true;
    const kazanc = c.createGain();
    kazanc.gain.value = 0;
    kaynak.connect(kazanc).connect(this.ana!);
    kaynak.start();
    kazanc.gain.setTargetAtTime(0.35, c.currentTime, 2.5);
    this.ortamDosya = { anahtar, kaynak, kazanc };
  }

  helikopter(durum: HelikopterDurumu, tozSiddeti: number) {
    if (!this.hazir) return;
    const c = this.ctx!;
    // Gerçek rotor kaydı varsa onu döngüle (sentez devreye girmez)
    if (this.manifest.helikopter_rotor) {
      if (durum === "yok") {
        if (this.rotorDosya) {
          const r = this.rotorDosya;
          this.rotorDosya = null;
          r.kazanc.gain.setTargetAtTime(0, c.currentTime, 2);
          setTimeout(() => r.kaynak.stop(), 7000);
        }
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
          kaynak.connect(kazanc).connect(this.ana!);
          kaynak.start();
          this.rotorDosya = { kaynak, kazanc };
        });
        return;
      }
      const seviye = 0.12 + tozSiddeti * 0.6 + (durum === "yerde" ? 0.1 : 0);
      this.rotorDosya.kazanc.gain.setTargetAtTime(seviye, c.currentTime, 0.8);
      return;
    }
    if (durum === "yok") {
      if (this.rotor) {
        this.rotor.kazanc.gain.setTargetAtTime(0, c.currentTime, 2);
        const r = this.rotor;
        this.rotor = null;
        setTimeout(() => {
          r.osc.stop();
          r.lfo.stop();
        }, 6000);
      }
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
      osc.connect(vuru).connect(filtre).connect(kazanc).connect(this.ana!);
      osc.start();
      lfo.start();
      this.rotor = { osc, kazanc, lfo };
    }
    const seviye = 0.15 + tozSiddeti * 0.45 + (durum === "yerde" ? 0.1 : 0);
    this.rotor.kazanc.gain.setTargetAtTime(seviye, c.currentTime, 0.8);
  }
}
