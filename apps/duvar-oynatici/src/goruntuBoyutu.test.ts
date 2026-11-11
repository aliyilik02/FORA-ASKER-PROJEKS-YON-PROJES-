import { describe, expect, it } from "vitest";
import { goruntuBoyutu } from "./goruntuBoyutu";

function png(g: number, y: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const dv = new DataView(b.buffer);
  dv.setUint32(16, g);
  dv.setUint32(20, y);
  return b;
}
function jpeg(g: number, y: number): Uint8Array {
  // FFD8, APP0 (16 bayt), SOF0
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00];
  const sof = [0xff, 0xc0, 0x00, 0x11, 0x08, (y >> 8) & 0xff, y & 0xff, (g >> 8) & 0xff, g & 0xff, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  return new Uint8Array([0xff, 0xd8, ...app0, ...sof, 0xff, 0xda, 0, 2]);
}

describe("goruntuBoyutu", () => {
  it("PNG IHDR ve JPEG SOF0'dan genişlik/yükseklik okur", () => {
    expect(goruntuBoyutu(png(12288, 6144))).toEqual({ genislik: 12288, yukseklik: 6144 });
    expect(goruntuBoyutu(jpeg(8192, 4096))).toEqual({ genislik: 8192, yukseklik: 4096 });
  });
  it("tanınmayan ya da kısa veri null", () => {
    expect(goruntuBoyutu(new Uint8Array(10))).toBeNull();
    expect(goruntuBoyutu(new Uint8Array(40))).toBeNull();
    const bozuk = jpeg(100, 100);
    bozuk[21] = 0xda; // SOF0 işareti (APP0'dan sonra, 20–21) yerine SOS
    expect(goruntuBoyutu(bozuk)).toBeNull();
  });
});
