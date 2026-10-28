/**
 * Art-Net (DMX512 over UDP) gönderici – şartname §6 ortam ışığı.
 *
 * Art-Net ArtDmx paketi: "Art-Net\0" + OpCode 0x5000 (LE) + ProtVer 14 (BE)
 * + Sequence + Physical + SubUni + Net + Length (BE) + 512 kanal verisi.
 *
 * Kanal haritası (varsayılan, armatüre göre ayarlanır):
 *   1: Dimmer (0–255)   2: R   3: G   4: B   5: Strobe (0 = kapalı)
 */
import dgram from "node:dgram";
import type { OrtamIsigi } from "./tipler.js";

export const DMX_KANAL_SAYISI = 512;

export interface ArtNetAyarlari {
  hedef: string;
  port: number;
  evren: number;
  aktif: boolean;
}

export function artDmxPaketiOlustur(evren: number, kanallar: Uint8Array, sira = 0): Buffer {
  if (kanallar.length > DMX_KANAL_SAYISI) throw new Error("DMX en fazla 512 kanal olabilir");
  const uzunluk = Math.max(2, kanallar.length + (kanallar.length % 2));
  const paket = Buffer.alloc(18 + uzunluk);
  paket.write("Art-Net\0", 0, "ascii");
  paket.writeUInt16LE(0x5000, 8); // OpDmx
  paket.writeUInt16BE(14, 10); // Protokol sürümü
  paket.writeUInt8(sira & 0xff, 12);
  paket.writeUInt8(0, 13); // Physical
  paket.writeUInt8(evren & 0xff, 14); // SubUni
  paket.writeUInt8((evren >> 8) & 0x7f, 15); // Net
  paket.writeUInt16BE(uzunluk, 16);
  Buffer.from(kanallar).copy(paket, 18);
  return paket;
}

/** Ortam ışığı ayarını DMX kanal dizisine çevirir. */
export function isiktanDmxKanallari(isik: OrtamIsigi, strobe = 0): Uint8Array {
  const kanallar = new Uint8Array(DMX_KANAL_SAYISI);
  const sinirla = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  kanallar[0] = sinirla(isik.parlaklik * 255);
  kanallar[1] = sinirla(isik.r);
  kanallar[2] = sinirla(isik.g);
  kanallar[3] = sinirla(isik.b);
  kanallar[4] = sinirla(strobe);
  return kanallar;
}

/** Günün saatine ve bulut/mevsime göre doğal ortam ışığı önerir (senaryoya bağlı modda). */
export function gunIsigiHesapla(saat: number, bulut: number): Pick<OrtamIsigi, "parlaklik" | "r" | "g" | "b"> {
  // 06:00 gün doğumu, 12:00 öğle, 19:00 gün batımı; gece düşük mavi ışık.
  const s = ((saat % 24) + 24) % 24;
  let parlaklik: number;
  let r = 255,
    g = 244,
    b = 224;
  if (s < 5 || s >= 21) {
    parlaklik = 0.05;
    r = 90;
    g = 110;
    b = 170;
  } else if (s < 7) {
    const t = (s - 5) / 2;
    parlaklik = 0.05 + t * 0.55;
    r = 255;
    g = Math.round(140 + t * 100);
    b = Math.round(80 + t * 140);
  } else if (s < 18) {
    parlaklik = 0.9;
  } else {
    const t = (s - 18) / 3;
    parlaklik = 0.9 - t * 0.85;
    r = 255;
    g = Math.round(240 - t * 110);
    b = Math.round(220 - t * 140);
  }
  parlaklik *= 1 - bulut * 0.5;
  return { parlaklik: Math.max(0.02, parlaklik), r, g, b };
}

export class ArtNetGonderici {
  private soket: dgram.Socket | null = null;
  private sira = 0;
  private sonKanallar: Uint8Array = new Uint8Array(DMX_KANAL_SAYISI);
  private sonGonderim = 0;
  private strobeZamanlayici: NodeJS.Timeout | null = null;

  constructor(private readonly ayarlar: ArtNetAyarlari) {}

  get aktif() {
    return this.ayarlar.aktif;
  }
  get hedef() {
    return `${this.ayarlar.hedef}:${this.ayarlar.port}`;
  }
  get evren() {
    return this.ayarlar.evren;
  }
  get sonGonderimZamani() {
    return this.sonGonderim;
  }

  baslat() {
    if (!this.ayarlar.aktif || this.soket) return;
    this.soket = dgram.createSocket("udp4");
    this.soket.on("error", () => {
      /* hatalar günlükte; soket kapanmasın */
    });
    this.soket.bind(() => this.soket?.setBroadcast(true));
  }

  kapat() {
    if (this.strobeZamanlayici) clearInterval(this.strobeZamanlayici);
    this.soket?.close();
    this.soket = null;
  }

  /** Verilen kanalları gönderir; aktif değilse yalnızca saklar. */
  gonder(kanallar: Uint8Array): Buffer {
    this.sonKanallar = kanallar;
    const paket = artDmxPaketiOlustur(this.ayarlar.evren, kanallar, this.sira++);
    if (this.soket) {
      this.soket.send(paket, this.ayarlar.port, this.ayarlar.hedef);
      this.sonGonderim = Date.now();
    }
    return paket;
  }

  isigiUygula(isik: OrtamIsigi) {
    this.gonder(isiktanDmxKanallari(isik));
  }

  /**
   * Patlama flaşı: kısa süreli tam parlaklık + beyaz, sonra önceki değere dönüş.
   * Şartname §6: ışık, sahnedeki patlama gibi olaylarla birlikte değişir.
   */
  patlamaFlasi(siddet = 1, sureMs = 250) {
    const onceki = Uint8Array.from(this.sonKanallar);
    const flas = Uint8Array.from(onceki);
    flas[0] = 255;
    flas[1] = 255;
    flas[2] = Math.round(200 + 55 * siddet);
    flas[3] = Math.round(120 * (1 - siddet) + 60);
    this.gonder(flas);
    setTimeout(() => this.gonder(onceki), sureMs);
  }

  sonDurum(): Uint8Array {
    return Uint8Array.from(this.sonKanallar);
  }
}
