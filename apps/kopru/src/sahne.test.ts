/**
 * Sahne sıfırlaması (SahneYoneticisi + POST /api/sahne/sifirla): yayın sırası ve sayısı, temel sahnede korunan ve
 * temizlenen alanlar, idempotentlik, sıfırlamadan sonra oynayan senaryonun yeni figür/efekt üretmemesi, tek günlük satırı.
 * Gerçek depo, senaryo motoru (sahte saat) ve figür yöneticisi; UE simülasyon kipinde.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import { apiOlustur } from "./api.js";
import { ArtNetGonderici } from "./artnet.js";
import { VeriDeposu } from "./depo.js";
import { DurumDeposu } from "./durum.js";
import { FigurYoneticisi } from "./figur.js";
import { Gunluk } from "./gunluk.js";
import { OrnekBaslatici } from "./ornek.js";
import { SahneYoneticisi, sifirlamaKaynagiCoz } from "./sahne.js";
import { SenaryoMotoru, type Zamanlayici } from "./senaryo.js";
import { sifirlamaOzetiMetni, type Senaryo, type SifirlamaYaniti, type SunucuMesaji } from "./tipler.js";
import { UnrealIstemci } from "./unreal.js";

/** Elle ilerletilen sahte saat (senaryo.test.ts ile aynı). */
function sahteZamanlayici() {
  let simdi = 0;
  const geriCagrilar: Array<() => void> = [];
  const z: Zamanlayici = {
    simdi: () => simdi,
    aralik: (cb) => {
      geriCagrilar.push(cb);
      return () => {
        const i = geriCagrilar.indexOf(cb);
        if (i >= 0) geriCagrilar.splice(i, 1);
      };
    },
  };
  const ilerle = async (ms: number) => {
    for (let t = 0; t < ms; t += 50) {
      simdi += 50;
      for (const cb of [...geriCagrilar]) cb();
      await new Promise((r) => setTimeout(r, 0));
    }
  };
  return { z, ilerle };
}

const GOSTERIM: Senaryo = {
  id: "gs",
  ad: "Gösterim – Deneme",
  oda: "oda1",
  adimlar: [
    { id: "a1", gecikmeMs: 0, aciklama: "çatışma", islem: { tip: "catisma", catisma: { aktif: true, siddet: 0.8, yon: 30 } } },
    { id: "a2", gecikmeMs: 0, aciklama: "asker", islem: { tip: "figur", figur: { islem: "oynat", id: "senaryo_a2", klip: "asker_swat", azimut: -20 } } },
    { id: "a3", gecikmeMs: 1000, aciklama: "asker 2", islem: { tip: "figur", figur: { islem: "oynat", id: "senaryo_a3", klip: "asker_swat" } } },
    { id: "a4", gecikmeMs: 1500, aciklama: "patlama", islem: { tip: "efekt", efekt: { tur: "patlama", siddet: 1 } } },
  ],
};

function kur(baslangicNesli?: number) {
  const gunluk = new Gunluk();
  const unreal = new UnrealIstemci({ adres: "http://x", preset: "T", mod: "simulasyon" }, gunluk);
  const artnet = new ArtNetGonderici({ hedef: "127.0.0.1", port: 6454, evren: 0, aktif: false });
  const depo = new DurumDeposu(unreal, artnet, gunluk);
  const { z, ilerle } = sahteZamanlayici();
  const senaryo = new SenaryoMotoru(depo, gunluk, z, 50);
  const figur = new FigurYoneticisi(gunluk, []);
  senaryo.figurBagla(figur);
  const olaylar: string[] = [];
  const yayinlar: SunucuMesaji[] = [];
  let kayit = 0;
  depo.dinle(() => olaylar.push("durum"));
  depo.efektDinle((e) => olaylar.push(`efekt:${e.tur}`));
  figur.dinle((k) => olaylar.push(`figur:${k.islem}`));
  senaryo.dinle((s) => olaylar.push(`senaryo:${s.durum}`));
  const sahne = new SahneYoneticisi(
    {
      depo,
      senaryo,
      figur,
      gunluk,
      yayinla: (m) => {
        yayinlar.push(m);
        olaylar.push(`${m.tip}:${"islem" in m ? m.islem : ""}`);
      },
      kaydet: () => {
        kayit++;
        olaylar.push("kaydet");
      },
    },
    baslangicNesli,
  );
  return { gunluk, unreal, artnet, depo, senaryo, figur, sahne, olaylar, yayinlar, ilerle, kayitSayisi: () => kayit };
}

/** Eğitim sırasında karışmış sahne: oynayan senaryo, iki figür, çatışma + izli mermi, Oda 2'de yerde helikopter, efektler. */
async function karisikSahne(k: ReturnType<typeof kur>) {
  await k.depo.bolgeSec("kirsal_acik_arazi");
  await k.depo.ortamGuncelle({ saat: 23, sis: 0.25, bulut: 0.6 });
  await k.depo.izliMermiGuncelle({ aktif: true, cikisNoktasi: 0, yon: -30, siklik: 6 });
  await k.depo.oda2Guncelle({ helikopter: "yerde", helikopterYonu: 300, guvenliAlan: "operasyonel_bolge", uzakSesMesafesi: 2000, uzakSesYonu: 100 });
  await k.depo.efektTetikle({ tur: "patlama", siddet: 1, yon: 10 });
  k.figur.komut({ islem: "oynat", id: "fg_elle", klip: "asker_yarali_3b", azimut: 15, poz: "yarali" });
  k.senaryo.yukle(GOSTERIM);
  await k.senaryo.oynat();
  await k.ilerle(100);
}

const gecici: string[] = [];
afterEach(() => {
  for (const k of gecici.splice(0)) rmSync(k, { recursive: true, force: true });
});

describe("senaryo baştan oynatılınca temel sahne", () => {
  it("Oynat: önce sıfırlama (figürler, çatışma, helikopter gider; ortam/bölge kalır), sonra senaryonun adımları", async () => {
    const k = kur(7);
    k.senaryo.sahneBagla(k.sahne);
    // Eğitmenin elle kurduğu karışık sahne (senaryo oynatmadan)
    await k.depo.bolgeSec("daglik");
    await k.depo.ortamGuncelle({ saat: 23, sis: 0.25 });
    await k.depo.catismaGuncelle({ aktif: true, siddet: 2, yon: 20 });
    await k.depo.oda2Guncelle({ helikopter: "yerde" });
    k.figur.komut({ islem: "oynat", id: "fg_elle", klip: "asker_yarali_3b", azimut: 15, poz: "yarali" });
    k.figur.komut({ islem: "oynat", id: "fg_elle2", klip: "asker_swat", azimut: -20 });
    k.senaryo.yukle(GOSTERIM);
    const satirlar: string[] = [];
    k.gunluk.dinle((s) => satirlar.push(s.mesaj));
    k.olaylar.length = 0;

    await k.senaryo.oynat();

    // Sıra: sıfırlama yayınları önce, senaryo "oynuyor" ve ilk adımı (asker, 0 ms) sonra
    expect(k.olaylar.slice(0, 4)).toEqual(["figur:temizle", "durum", "sahne:sifirla", "kaydet"]);
    expect(k.olaylar.indexOf("senaryo:oynuyor")).toBeGreaterThan(k.olaylar.indexOf("sahne:sifirla"));
    const mesaj = k.yayinlar.find((m) => m.tip === "sahne" && m.islem === "sifirla");
    expect(mesaj && mesaj.tip === "sahne" && mesaj.islem === "sifirla" ? mesaj.kaynak : null).toBe("senaryo");
    expect(mesaj && mesaj.tip === "sahne" && mesaj.islem === "sifirla" ? mesaj.ozet : null).toEqual({ figur: 2, senaryo: null, catisma: true, izliMermi: false, helikopter: true });
    expect(k.sahne.nesil).toBe(8);
    expect(satirlar.some((s) => s.includes("senaryo başlarken"))).toBe(true);
    // Elle çağrılanlar gitti, senaryonun kendi figürü geldi; ortam ve bölge korundu
    await k.ilerle(600);
    expect(k.senaryo.al().durum).toBe("oynuyor");
    expect(k.figur.aktifListe().map((f) => f.id)).toEqual(["senaryo_a2"]);
    const d = k.depo.al();
    // Çatışma elle 20°'de açılmıştı; sıfırlama kapattı, senaryonun kendi adımı 30°'de yeniden açtı
    expect(d.catisma.aktif).toBe(true);
    expect(d.catisma.yon).toBe(30);
    expect(d.oda2.helikopter).toBe("yok");
    expect(d.ortam.saat).toBe(23);
    expect(d.ortam.sis).toBe(0.25);
  });

  it("duraklatılmıştan devam ederken sıfırlama yok; bitmiş senaryoyu yeniden oynatınca var", async () => {
    const k = kur(0);
    k.senaryo.sahneBagla(k.sahne);
    k.senaryo.yukle(GOSTERIM);
    await k.senaryo.oynat();
    expect(k.sahne.nesil).toBe(1);
    await k.ilerle(600);
    k.senaryo.duraklat();
    await k.senaryo.oynat();
    expect(k.sahne.nesil).toBe(1);
    expect(k.figur.aktifListe().map((f) => f.id)).toEqual(["senaryo_a2"]);
    await k.ilerle(2000);
    expect(k.senaryo.al().durum).toBe("duruyor");
    expect(k.figur.aktifListe().length).toBe(2);
    await k.senaryo.oynat();
    expect(k.sahne.nesil).toBe(2);
    expect(k.figur.aktifListe().map((f) => f.id)).toEqual(["senaryo_a2"]);
    expect(k.senaryo.al().durum).toBe("oynuyor");
  });
});

describe("SahneYoneticisi.sifirla", () => {
  it("sıra: senaryo dur → figür temizle → tek durum → sahne/sifirla → kayıt; korunanlar aynı, temizlenenler kapalı", async () => {
    const k = kur(41);
    await karisikSahne(k);
    expect(k.senaryo.al().durum).toBe("oynuyor");
    expect(k.figur.aktifListe().map((f) => f.id).sort()).toEqual(["fg_elle", "senaryo_a2"]);
    const once = k.depo.al();
    expect(once.catisma.aktif).toBe(true);
    const satirlar: string[] = [];
    k.gunluk.dinle((s) => satirlar.push(s.mesaj));
    k.olaylar.length = 0;

    const ozet = k.sahne.sifirla("kisayol");

    expect(k.olaylar).toEqual(["senaryo:duruyor", "figur:temizle", "durum", "sahne:sifirla", "kaydet"]);
    expect(ozet).toEqual({ figur: 2, senaryo: "Gösterim – Deneme", catisma: true, izliMermi: true, helikopter: true });
    const mesaj = k.yayinlar.at(-1)!;
    expect(mesaj).toMatchObject({ tip: "sahne", islem: "sifirla", nesil: 42, kaynak: "kisayol", ozet });
    expect(k.sahne.nesil).toBe(42);

    const d = k.depo.al();
    // Korunanlar: oda, bölge, ortam, ışık, güvenli alan ve bütün ayar değerleri
    expect(d.oda).toBe(once.oda);
    expect(d.bolge).toBe("kirsal_acik_arazi");
    expect(d.ortam).toEqual(once.ortam);
    expect(d.isik).toEqual(once.isik);
    expect(d.oda2).toEqual({ ...once.oda2, helikopter: "yok" });
    expect(d.catisma).toEqual({ ...once.catisma, aktif: false });
    expect(d.izliMermi).toEqual({ ...once.izliMermi, aktif: false });
    expect(d.sonEfektler).toEqual([]);
    expect(k.figur.aktifListe()).toEqual([]);
    // Senaryo: yüklü kalır, durur, başa sarılır
    const s = k.senaryo.al();
    expect(s).toMatchObject({ senaryoId: "gs", durum: "duruyor", konumMs: 0 });
    // Tek günlük satırı (UE simülasyon izleri hariç)
    const kendi = satirlar.filter((m) => !m.startsWith("[UE simülasyon]"));
    expect(kendi).toEqual([`Sahne temele döndü (panel kısayoluyla (Esc, Esc)): ${sifirlamaOzetiMetni(ozet)}; ortam, bölge ve ışık korundu`]);
    expect(kendi[0]).toContain('2 figür, çatışma, izli mermi, helikopter kaldırıldı; senaryo "Gösterim – Deneme" durdu');
  });

  it("sıfırlamadan sonra oynayan senaryo yeni figür / efekt / durum üretmez (eskiden 700 ms içinde asker + patlama geliyordu)", async () => {
    const k = kur();
    await karisikSahne(k);
    k.sahne.sifirla("panel");
    k.olaylar.length = 0;
    await k.ilerle(5000);
    expect(k.olaylar).toEqual([]);
    expect(k.figur.aktifListe()).toEqual([]);
  });

  it("idempotent: ikinci çağrı aynı temel sahne, özet boş, nesil artar; her çağrıda sahne mesajı ve kayıt", async () => {
    const k = kur(7);
    await karisikSahne(k);
    k.sahne.sifirla("panel");
    const ilk = k.depo.al();
    k.olaylar.length = 0;
    const ozet = k.sahne.sifirla("oynatici");
    expect(ozet).toEqual({ figur: 0, senaryo: null, catisma: false, izliMermi: false, helikopter: false });
    expect(sifirlamaOzetiMetni(ozet)).toBe("sahne zaten temizdi");
    expect(k.depo.al()).toEqual(ilk);
    expect(k.sahne.nesil).toBe(9);
    // Senaryo zaten duruyordu: senaryo yayını yok; figür temizle ve durum yine tek
    expect(k.olaylar).toEqual(["figur:temizle", "durum", "sahne:sifirla", "kaydet"]);
    expect(k.kayitSayisi()).toBe(2);
  });

  it("nesil: kayıttan sürer; geçersizse saatten; kaynak çözümü tanınmayanı panel sayar", () => {
    expect(kur(123).sahne.nesil).toBe(123);
    const once = Date.now();
    expect(kur(Number.NaN).sahne.nesil).toBeGreaterThanOrEqual(once);
    expect(sifirlamaKaynagiCoz("kisayol")).toBe("kisayol");
    expect(sifirlamaKaynagiCoz("oynatici")).toBe("oynatici");
    expect(sifirlamaKaynagiCoz(undefined)).toBe("panel");
    expect(sifirlamaKaynagiCoz("<script>")).toBe("panel");
  });
});

describe("POST /api/sahne/sifirla", () => {
  it("{kaynak} gövdesiyle sıfırlar; yanıt {tamam, nesil, kaynak, ozet, zaman, durum, senaryo}; gövdesiz eski çağrı panel", async () => {
    const k = kur(1000);
    await karisikSahne(k);
    const klasor = mkdtempSync(join(tmpdir(), "duvar-sahne-"));
    gecici.push(klasor);
    const veri = new VeriDeposu(klasor);
    const ornek = new OrnekBaslatici({ exe: "", args: [], cwd: "" }, k.gunluk, false);
    const app = express();
    app.use("/api", apiOlustur({ depo: k.depo, senaryo: k.senaryo, veri, unreal: k.unreal, artnet: k.artnet, gunluk: k.gunluk, ornek, figur: k.figur, sahne: k.sahne }));
    const sunucu = app.listen(0);
    try {
      const adres = `http://127.0.0.1:${(sunucu.address() as AddressInfo).port}/api/sahne/sifirla`;
      const r1 = await fetch(adres, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kaynak: "oynatici" }) });
      expect(r1.status).toBe(200);
      const y1 = (await r1.json()) as SifirlamaYaniti;
      expect(y1).toMatchObject({ tamam: true, nesil: 1001, kaynak: "oynatici", ozet: { figur: 2, senaryo: "Gösterim – Deneme", catisma: true } });
      expect(y1.zaman).toBe(k.sahne.sonZaman);
      expect(y1.durum.catisma.aktif).toBe(false);
      expect(y1.durum.oda2.helikopter).toBe("yok");
      expect(y1.senaryo).toMatchObject({ senaryoId: "gs", durum: "duruyor", konumMs: 0 });
      const r2 = await fetch(adres, { method: "POST" });
      const y2 = (await r2.json()) as SifirlamaYaniti;
      expect(y2).toMatchObject({ tamam: true, nesil: 1002, kaynak: "panel" });
    } finally {
      sunucu.close();
    }
  });
});
