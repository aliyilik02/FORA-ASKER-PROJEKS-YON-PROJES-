import { describe, expect, it } from "vitest";
import { kalibrasyonCiz } from "./hud";
import { duvarlariOlustur, duvarYerlesimleri, odaDuvarlari, type OdaGeometrisi, ufukSatiri } from "./projeksiyon";

/** Yazıları ve dolu dikdörtgenleri kaydeden sahte 2B bağlam; diğer çağrılar boş, atanan özellikler saklanır. */
function sahteBaglam() {
  const yazilar: Array<{ metin: string; y: number }> = [];
  const kutular: Array<{ y: number }> = [];
  const hedef: Record<string, unknown> = {
    fillText: (metin: string, _x: number, y: number) => yazilar.push({ metin, y }),
    fillRect: (_x: number, y: number) => kutular.push({ y }),
    measureText: (metin: string) => ({ width: metin.length * 8 }),
  };
  const ctx = new Proxy(hedef, {
    get: (h, ad: string) => (ad in h ? h[ad] : () => undefined),
    set: (h, ad: string, deger) => {
      h[ad] = deger;
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, yazilar, kutular };
}

describe("K ızgarası yazıları", () => {
  const u: OdaGeometrisi = { tip: "u", on: 6, yan: 4, yukseklik: 3, alt: 0.3, izleyiciX: 0, izleyiciZ: 3, goz: 1.7 };

  it("göz görüntünün çok altında / üstünde olsa da duvar adları, açılar ve ufuk notu tuvalde, özet kutusunun üstünde", () => {
    const durumlar: Array<[number, number, OdaGeometrisi | null]> = [
      [5760, 1080, { ...u, alt: 2, yukseklik: 1, goz: 0.5 }], // ufuk 2,5·H (görüntünün altında)
      [5760, 1080, { ...u, alt: 0, yukseklik: 1, goz: 3 }], // ufuk −2·H (üstünde)
      [1440, 270, { ...u, alt: 2, yukseklik: 1, goz: 0.5 }], // küçük tuval: yazı en az 11 px
      [1440, 270, null], // ölçüsüz: ufuk ortada
      [5760, 1080, u],
    ];
    for (const [W, H, oda] of durumlar) {
      const yer = duvarYerlesimleri(W, H, oda ? odaDuvarlari(oda) : duvarlariOlustur(90));
      const ufuk = ufukSatiri(yer[1]);
      const { ctx, yazilar, kutular } = sahteBaglam();
      kalibrasyonCiz(ctx, W, H, yer, ["geometri", "açılar"]);
      expect(kutular).toHaveLength(1); // yalnız özet kutusu
      const ozetUst = kutular[0].y;
      const yazi = Math.max(11, Math.round(H / 42));
      const adlar = yazilar.filter((t) => ["SOL", "ORTA", "SAĞ"].includes(t.metin));
      const acilar = yazilar.filter((t) => / · [−+]?\d+° … /.test(t.metin));
      const notlar = yazilar.filter((t) => t.metin.includes("ufuk (göz hizası) görüntünün"));
      expect(adlar).toHaveLength(3);
      expect(acilar).toHaveLength(3);
      expect(notlar).toHaveLength(ufuk < 0 || ufuk > H ? 3 : 0);
      for (const t of adlar) {
        expect(t.y - H / 24).toBeGreaterThan(0); // ad yazısı (H/12 punto, ortadan) tuvalde
        expect(t.y + H / 24).toBeLessThan(ozetUst);
      }
      for (const t of [...acilar, ...notlar]) {
        expect(t.y - yazi / 2).toBeGreaterThan(0);
        expect(t.y + yazi / 2).toBeLessThan(ozetUst);
      }
      // Not, ad ve açı satırıyla çakışmaz (yarım yükseklikler toplamından uzak)
      for (const n of notlar) {
        for (const a of adlar) expect(Math.abs(n.y - a.y)).toBeGreaterThanOrEqual(H / 24 + yazi / 2);
        for (const a of acilar) expect(Math.abs(n.y - a.y)).toBeGreaterThanOrEqual(yazi);
      }
    }
  });
});
