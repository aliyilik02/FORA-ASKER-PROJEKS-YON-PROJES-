/**
 * Panorama geçişi durum makinesi ve saf kararlar: yenisi eskisini geçersiz kılar (A→B→C), ekrandakine dönüşte geçiş
 * olmaz (A→B→A), düşen dosyada sıradaki aday, yalnız alan değişiminde meta takası, küp boyu, şerit planı, solma ve
 * yer tutucu kararı.
 */
import { describe, expect, it } from "vitest";
import { KUP_YUZU, PanoramaGecisi, arkaPlanKarari, kupYuzuSec, seritSatiri, solmaBaslayabilir, yuklemeGenisligi } from "./panoramaGecisi";

interface K {
  url: string;
  yaw?: number;
}
interface V {
  no: number;
  url: string;
  birakildi: boolean;
}

function kur() {
  const baslatilan: V[] = [];
  const g = new PanoramaGecisi<K, V>({
    baslat: (k, no) => {
      const v = { no, url: k.url, birakildi: false };
      baslatilan.push(v);
      return v;
    },
    birak: (v) => {
      v.birakildi = true;
    },
    imza: (k) => String(k.yaw ?? 0),
  });
  /** Hazırlığı bitirir (GPU adımları sahte): sonuç hazır. */
  const hazirla = () => {
    if (g.hazirlik) g.hazirlik.adim = "hazir";
  };
  return { g, baslatilan, hazirla };
}
const A: K = { url: "a.jpg" };
const B: K = { url: "b.jpg" };
const C: K = { url: "c.jpg" };

describe("PanoramaGecisi: istek, iptal, takas", () => {
  it("ilk panorama: hazırlanırken ilkBekleniyor, hazır olunca takas; ekrandaki etkin olur", () => {
    const { g, baslatilan, hazirla } = kur();
    expect(g.iste(A)).toBe("yeni");
    expect(g.ilkBekleniyor).toBe(true);
    expect(g.yukleniyor).toBe(true);
    expect(g.takasHazir).toBe(false);
    hazirla();
    expect(g.yukleniyor).toBe(false);
    expect(g.takasHazir).toBe(true);
    const t = g.takas();
    expect(t.yeni?.kaynak.url).toBe("a.jpg");
    expect(t.eski).toBeNull();
    expect(g.etkin?.veri).toBe(baslatilan[0]);
    expect(g.ilkBekleniyor).toBe(false);
    expect(g.takasHazir).toBe(false);
  });

  it("A→B→C: B'nin hazırlığı iptal edilir (kaynakları bırakılır), geç gelen sonucu geçersizdir; takasta A bırakılır", () => {
    const { g, baslatilan, hazirla } = kur();
    g.iste(A);
    hazirla();
    g.takas();
    expect(g.iste(B)).toBe("yeni");
    const bNo = g.hazirlik!.no;
    expect(g.iste(C)).toBe("yeni");
    expect(baslatilan[1].birakildi).toBe(true);
    expect(g.gecerli(bNo)).toBe(false);
    expect(g.gecerli(g.hazirlik!.no)).toBe(true);
    // Ekrandaki (A) hazırlık boyunca kalır
    expect(g.etkin?.kaynak.url).toBe("a.jpg");
    hazirla();
    const t = g.takas();
    expect(t.yeni?.kaynak.url).toBe("c.jpg");
    expect(t.eski?.kaynak.url).toBe("a.jpg");
    expect(baslatilan[0].birakildi).toBe(false); // çağıran yenisini uyguladıktan sonra bırakır
  });

  it("A→B→A: hazırlık iptal, geçiş olmaz; aynı istek tekrarlanınca (her durum mesajı) hiçbir şey olmaz", () => {
    const { g, baslatilan, hazirla } = kur();
    g.iste(A);
    hazirla();
    g.takas();
    g.iste(B);
    expect(g.iste(A)).toBe("ayni");
    expect(baslatilan[1].birakildi).toBe(true);
    expect(g.hazirlik).toBeNull();
    expect(g.takasHazir).toBe(false);
    expect(g.iste(A)).toBe("ayni");
    expect(baslatilan).toHaveLength(2);
  });

  it("hazırlanan dosya yeniden istenince süren hazırlık korunur (kaynak güncellenir)", () => {
    const { g, baslatilan } = kur();
    g.iste(A);
    expect(g.iste({ url: "a.jpg", yaw: 10 })).toBe("suruyor");
    expect(baslatilan).toHaveLength(1);
    expect(g.hazirlik?.kaynak.yaw).toBe(10);
  });

  it("aynı dosya, farklı alan (yaw/plan/güneş): yeniden yükleme yok, meta takası", () => {
    const { g, hazirla } = kur();
    g.iste(A);
    hazirla();
    g.takas();
    expect(g.iste({ url: "a.jpg", yaw: 30 })).toBe("meta");
    expect(g.yukleniyor).toBe(false);
    expect(g.takasHazir).toBe(true);
    const t = g.takas();
    expect(t.yeni).toBeNull();
    expect(t.meta?.yaw).toBe(30);
    expect(g.etkin?.kaynak.yaw).toBe(30);
  });

  it("düşen dosya: hatalı sayılır, sıradaki aday başlar; aday kalmazsa ekrandaki kalır; hatalı dosya yeniden denenmez", () => {
    const { g, baslatilan, hazirla } = kur();
    g.iste(A);
    hazirla();
    g.takas();
    g.iste(B, [C]);
    const bNo = g.hazirlik!.no;
    expect(g.dustu(bNo)?.url).toBe("c.jpg");
    expect(baslatilan[1].birakildi).toBe(true);
    expect(g.hazirlik?.kaynak.url).toBe("c.jpg");
    expect(g.dustu(g.hazirlik!.no)).toBeNull();
    expect(g.hazirlik).toBeNull();
    expect(g.etkin?.kaynak.url).toBe("a.jpg");
    // Aynı istek bir sonraki durum mesajında: iki dosya da hatalı → yeni hazırlık yok
    expect(g.iste(B, [C])).toBe("hatali");
    expect(baslatilan).toHaveLength(3);
  });

  it("düşen dosyanın sıradaki adayı ekrandakiyse geçiş olmaz", () => {
    const { g, hazirla } = kur();
    g.iste(A);
    hazirla();
    g.takas();
    g.iste(B, [A]);
    expect(g.dustu(g.hazirlik!.no)?.url).toBe("a.jpg");
    expect(g.hazirlik).toBeNull();
    expect(g.takasHazir).toBe(false);
  });

  it("eski neslin geç gelen hatası güncel hazırlığı etkilemez", () => {
    const { g } = kur();
    g.iste(A);
    const aNo = g.hazirlik!.no;
    g.iste(B);
    expect(g.dustu(aNo)).toBeNull();
    expect(g.hazirlik?.kaynak.url).toBe("b.jpg");
    expect(g.hatali.has("a.jpg")).toBe(false);
  });

  it("panorama yok (null): ekrandaki kalır, süren hazırlık iptal", () => {
    const { g, baslatilan, hazirla } = kur();
    g.iste(A);
    hazirla();
    g.takas();
    g.iste(B);
    expect(g.iste(null)).toBe("yok");
    expect(baslatilan[1].birakildi).toBe(true);
    expect(g.etkin?.kaynak.url).toBe("a.jpg");
    expect(g.takasHazir).toBe(false);
  });

  it("yan etki (bölge sıfırlaması, arazi): hazırlık yoksa hemen takas, hazırlık varsa sonuçla birlikte", () => {
    const { g, hazirla } = kur();
    g.iste(A);
    hazirla();
    g.takas();
    g.yanEtkiIste();
    expect(g.bekliyor).toBe(true);
    expect(g.takasHazir).toBe(true);
    let t = g.takas();
    expect(t.yanEtki).toBe(true);
    expect(t.yeni).toBeNull();
    expect(g.bekliyor).toBe(false);
    g.iste(B);
    g.yanEtkiIste();
    expect(g.takasHazir).toBe(false);
    hazirla();
    t = g.takas();
    expect(t.yeni?.kaynak.url).toBe("b.jpg");
    expect(t.yanEtki).toBe(true);
  });

  it("kapat (video panorama): takasta ekrandaki kalkar; ardından resim istenirse kapatma unutulur", () => {
    const { g, hazirla } = kur();
    g.iste(A);
    hazirla();
    g.takas();
    g.kapat();
    expect(g.takasHazir).toBe(true);
    const t = g.takas();
    expect(t.kapandi).toBe(true);
    expect(t.eski?.kaynak.url).toBe("a.jpg");
    expect(g.etkin).toBeNull();
    g.iste(A);
    hazirla();
    g.takas();
    g.kapat();
    g.iste(A);
    expect(g.kapatIstendi).toBe(false);
    expect(g.takasHazir).toBe(false);
  });
});

describe("kupYuzuSec ve yükleme genişliği", () => {
  it("kalite kademesi: düşük 1024, orta 1536, yüksek 2048 (8K kaynakta)", () => {
    expect(kupYuzuSec("dusuk", 4096)).toBe(1024);
    expect(kupYuzuSec("orta", 4096)).toBe(1536);
    expect(kupYuzuSec("yuksek", 4096)).toBe(2048);
    expect(KUP_YUZU.yuksek).toBe(2048);
  });
  it("kaynağın yüksekliğini aşmaz (2912×1440 AI panorama: 1440; büyütme yok)", () => {
    expect(kupYuzuSec("yuksek", 1440)).toBe(1440);
    expect(kupYuzuSec("orta", 1440)).toBe(1440);
    expect(kupYuzuSec("dusuk", 1440)).toBe(1024);
  });
  it("yükleme genişliği küp yüzünün 4 katı (yüz merkezinde 1:1)", () => {
    expect(yuklemeGenisligi("dusuk")).toBe(4096);
    expect(yuklemeGenisligi("orta")).toBe(6144);
    expect(yuklemeGenisligi("yuksek")).toBe(8192);
  });
});

describe("seritSatiri", () => {
  it("~8 MiB şerit: 8K'da 256 satır (16 şerit), 4K'da 512 satır (4 şerit)", () => {
    expect(seritSatiri(8192, 4096)).toBe(256);
    expect(4096 / seritSatiri(8192, 4096)).toBe(16);
    expect(seritSatiri(4096, 2048)).toBe(512);
    expect(Math.ceil(1440 / seritSatiri(2912, 1440))).toBe(2);
  });
  it("küçük görüntü tek şerit, en az 1 satır", () => {
    expect(seritSatiri(1024, 512)).toBe(512);
    expect(seritSatiri(1e9, 10)).toBe(1);
  });
});

describe("solmaBaslayabilir", () => {
  it("derleme sürerken ya da yeni sahne hiç çizilmeden solmaz", () => {
    expect(solmaBaslayabilir(0, false, false, true, 5000)).toBe(false);
    expect(solmaBaslayabilir(3, true, false, true, 5000)).toBe(false);
    expect(solmaBaslayabilir(1, false, false, false, 0)).toBe(true);
  });
  it("bölge değiştiyse arazi dokuları gelince, gelmezse 1,2 sn sonra solar", () => {
    expect(solmaBaslayabilir(1, false, true, false, 500)).toBe(false);
    expect(solmaBaslayabilir(1, false, true, true, 500)).toBe(true);
    expect(solmaBaslayabilir(1, false, true, false, 1200)).toBe(true);
  });
});

describe("arkaPlanKarari (yer tutucu kuralı)", () => {
  it("arka plan varsa hiçbir şey çizilmez", () => {
    expect(arkaPlanKarari(true, true, false, true)).toBe("yok");
  });
  it("manifest ya da ilk panorama beklenirken siyah (ilk demo görüntüsü yok)", () => {
    expect(arkaPlanKarari(false, false, false, false)).toBe("siyah");
    expect(arkaPlanKarari(false, true, true, false)).toBe("siyah");
  });
  it("daha önce panorama gösterildiyse siyah; yer tutucu yalnız hiç panorama yokken", () => {
    expect(arkaPlanKarari(false, true, false, true)).toBe("siyah");
    expect(arkaPlanKarari(false, true, false, false)).toBe("yer_tutucu");
  });
});
