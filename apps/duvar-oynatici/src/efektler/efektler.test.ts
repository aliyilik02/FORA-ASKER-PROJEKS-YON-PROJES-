/**
 * 2B efekt katmanlarının sahne sıfırlaması: EfektSistemi (ateş topu, duman, kıvılcım, flaş, ekran sarsıntısı) ve
 * IzliMermiSistemi (uçuştaki 2B izler) temizle() sonrası boş; ayar (izli mermi açık/kapalı) durumdan gelir.
 */
import { describe, expect, it } from "vitest";
import { duvarYerlesimleri } from "../projeksiyon";
import { IzliMermiSistemi } from "./izliMermi";
import { EfektSistemi } from "./patlama";

const W = 1920;
const H = 360;
const YER = duvarYerlesimleri(W, H);

/** Çizim çağrılarını sayan sahte 2B bağlam (yalnız kullanılan yöntemler). */
function sahteBaglam() {
  let cizim = 0;
  const gradyan = { addColorStop: () => undefined };
  const ctx = {
    save: () => undefined,
    restore: () => undefined,
    beginPath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    arc: () => undefined,
    ellipse: () => undefined,
    createRadialGradient: () => gradyan,
    createLinearGradient: () => gradyan,
    fillRect: () => cizim++,
    fill: () => cizim++,
    stroke: () => cizim++,
  } as unknown as CanvasRenderingContext2D;
  return { ctx, cizim: () => cizim };
}

describe("EfektSistemi.temizle", () => {
  it("patlama, duman ve kıvılcımlar silinir; flaş ve sarsıntı anında biter", () => {
    const e = new EfektSistemi();
    e.patlama(10, 1, YER, H * 0.5, H);
    e.tozDuman(-30, 0.8, YER, H * 0.5, H);
    e.guncelle(0.05);
    expect(e.flasAlfa).toBeGreaterThan(0.1);
    expect(e.sallantiMiktari).toBeGreaterThan(1);
    const once = sahteBaglam();
    e.ciz(once.ctx);
    expect(once.cizim()).toBeGreaterThan(10);
    e.temizle();
    expect(e.flasAlfa).toBe(0);
    expect(e.sallantiMiktari).toBe(0);
    const sonra = sahteBaglam();
    e.guncelle(0.05);
    e.ciz(sonra.ctx);
    expect(sonra.cizim()).toBe(0);
  });
});

describe("IzliMermiSistemi.temizle", () => {
  it("uçuştaki izler ve birikmiş atış payı silinir; kapalıyken yeni iz doğmaz, açılınca yine akar", () => {
    let ses = 0;
    const izli = new IzliMermiSistemi(() => ses++);
    izli.ayarla({ aktif: true, cikisNoktasi: 1, yon: 0, siklik: 10 });
    izli.guncelle(0.25, YER, H * 0.5, H, W);
    expect(ses).toBeGreaterThan(0);
    const once = sahteBaglam();
    izli.ciz(once.ctx, H);
    expect(once.cizim()).toBeGreaterThan(0);
    // Durum yayını kapatır, sonra sahne mesajı temizler
    izli.ayarla({ aktif: false, cikisNoktasi: 1, yon: 0, siklik: 10 });
    izli.temizle();
    const sonra = sahteBaglam();
    izli.guncelle(0.25, YER, H * 0.5, H, W);
    izli.ciz(sonra.ctx, H);
    expect(sonra.cizim()).toBe(0);
    izli.ayarla({ aktif: true, cikisNoktasi: 1, yon: 0, siklik: 10 });
    ses = 0;
    izli.guncelle(0.25, YER, H * 0.5, H, W);
    expect(ses).toBeGreaterThan(0);
  });
});
