/** Basit olay günlüğü: konsola yazar ve dinleyicilere (WebSocket) iletir. */

export type GunlukSeviyesi = "bilgi" | "uyari" | "hata";

export interface GunlukKaydi {
  seviye: GunlukSeviyesi;
  mesaj: string;
  zaman: number;
}

type Dinleyici = (kayit: GunlukKaydi) => void;

export class Gunluk {
  private dinleyiciler = new Set<Dinleyici>();
  private son: GunlukKaydi[] = [];
  private readonly kapasite = 200;

  dinle(d: Dinleyici): () => void {
    this.dinleyiciler.add(d);
    return () => this.dinleyiciler.delete(d);
  }

  sonKayitlar(): GunlukKaydi[] {
    return [...this.son];
  }

  bilgi(mesaj: string) {
    this.yaz("bilgi", mesaj);
  }
  uyari(mesaj: string) {
    this.yaz("uyari", mesaj);
  }
  hata(mesaj: string) {
    this.yaz("hata", mesaj);
  }

  private yaz(seviye: GunlukSeviyesi, mesaj: string) {
    const kayit: GunlukKaydi = { seviye, mesaj, zaman: Date.now() };
    this.son.push(kayit);
    if (this.son.length > this.kapasite) this.son.shift();
    const saat = new Date(kayit.zaman).toLocaleTimeString("tr-TR");
    const etiket = seviye === "hata" ? "HATA" : seviye === "uyari" ? "UYARI" : "BİLGİ";
    // eslint-disable-next-line no-console
    console.log(`[${saat}] ${etiket}: ${mesaj}`);
    for (const d of this.dinleyiciler) d(kayit);
  }
}
