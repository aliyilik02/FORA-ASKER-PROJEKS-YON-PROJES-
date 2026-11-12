/**
 * Düşman atıcılarının mevzi seçimi (saf hesap; `dusman.ts` kullanır, three bağımlılığı yok).
 *
 * Eskiden her salvo (izli akışta her mermi) yöndeki mevzilerden rastgele birinden çıkıyordu: 25 pencereden sırayla
 * parıltı, hiçbirinde kalıcı tehdit yok. Artık az sayıda atıcı (şiddete göre 2–4) birer mevziyi tutar, oradan birkaç
 * salvo atar, sonra yer değiştirir: eğitmen "saat 11, çatıda" diyebilir, kursiyer aynı yere bakınca yine onu görür.
 */

export interface MevziKonumu {
  /** Plandaki sıra numarası. */
  no: number;
  x: number;
  z: number;
  /** İzleyiciden sahne azimutu (derece) ve yatay uzaklık (m). */
  azimut: number;
  mesafe: number;
}

/** İki azimutun işaretli farkı (derece, −180..180). */
export function aciFarki(a: number, b: number): number {
  return ((((a - b) % 360) + 540) % 360) - 180;
}

/**
 * Yönün `aci` derece içindeki mevziler (izleyiciden ≥ `enAzMesafe`). `taraf` verilirse yalnız o yandakiler (+1 sağ
 * cephe, −1 sol cephe: çaprazlama izli mermi).
 */
export function koniAdaylari(mevziler: MevziKonumu[], azimut: number, aci: number, taraf = 0, enAzMesafe = 15): MevziKonumu[] {
  return mevziler.filter((m) => m.mesafe >= enAzMesafe && (!taraf || Math.sign(m.x) === taraf) && Math.abs(aciFarki(m.azimut, azimut)) <= aci);
}

/** Çatışmada aynı anda mevzi tutan atıcı sayısı: şiddet 0 → 2, 0,5 → 3, 1 → 4. */
export function aticiSayisi(siddet: number): number {
  return 2 + Math.round(Math.max(0, Math.min(1, siddet)) * 2);
}

/** İzli mermi akışını besleyen atıcı sayısı: saniyede 4,5 mermiye kadar tek makineli, üstünde iki. */
export function izliAticiSayisi(siklik: number): number {
  return siklik > 4.5 ? 2 : 1;
}

/**
 * Boş adaylardan yeni mevzi: dolu mevzilerden açıca (ve biraz uzaklıkça) ayrık olan öne geçer (atıcılar cepheye
 * yayılır, yan yana iki pencereye dizilmez), yakın mevzi hafif önceliklidir; `kacin` (az önce bırakılan) başka aday varken seçilmez (yer değiştirme
 * gerçekten yer değiştirir). Aday yoksa null.
 */
export function mevziSec(bos: MevziKonumu[], dolu: MevziKonumu[], kacin: number | null, rastgele: () => number): MevziKonumu | null {
  let en: MevziKonumu | null = null;
  let enPuan = -Infinity;
  for (const m of bos) {
    let ayrim = 20;
    for (const d of dolu) ayrim = Math.min(ayrim, Math.abs(aciFarki(m.azimut, d.azimut)) + Math.abs(m.mesafe - d.mesafe) * 0.15);
    // Yakın mevzi duvarda daha iri okunur (25 m'de göğüs üstü ~30 px, 90 m'de ~8 px): hafif öncelik
    const yakinlik = Math.max(0, Math.min(1, (90 - m.mesafe) / 70)) * 6;
    const puan = Math.min(ayrim, 20) + yakinlik + rastgele() * 10 - (m.no === kacin ? 1000 : 0);
    if (puan > enPuan) {
      enPuan = puan;
      en = m;
    }
  }
  return en;
}

export interface AraziMevzisi {
  x: number;
  z: number;
  /** Örtü çizgisinin zemin üstü yüksekliği (m): göz hattının sırtın üstünden geçtiği yer. */
  y: number;
  azimut: number;
  mesafe: number;
}

/**
 * Arazi mevzileri: plan mevzisi olmayan yönde (açık arazi) düşman sırtın hemen gerisinde durur. Her yön hattında
 * izleyiciden uzaklaşırken arazinin o ana dek oluşturduğu ufuk çizgisi (en büyük yükseliş açısı) izlenir; zeminin bu
 * çizginin 0,85–1,2 m altında kaldığı ilk yer (sırtın en çok 15 m gerisi) göğüs hizasına kadar örtülü bir mevzidir:
 * ayakta duran atıcının yalnız göğüs üstü görünür, çökünce kaybolur. Düz arazide (ya da arazi kapalıyken) sonuç boş.
 *
 * `zemin(x, z)`: dünya y'si (göz y = 0). `enYakin`–`enUzak`: aranacak uzaklık bandı (m; uzak sınır 3B arazinin
 * görünür yarıçapının içinde kalmalı). Mevziler birbirinden ≥ `aralik` m.
 */
export function araziMevzileriBul(zemin: (x: number, z: number) => number, azimut: number, aci: number, enYakin = 40, enUzak = 118, aralik = 9): AraziMevzisi[] {
  const sonuc: AraziMevzisi[] = [];
  for (let az = azimut - aci; az <= azimut + aci + 1e-6; az += 4) {
    const a = (az * Math.PI) / 180;
    const sx = Math.sin(a);
    const sz = -Math.cos(a);
    let ufuk = -Infinity; // şimdiye dek en büyük tan(yükseliş)
    let tepe = 0; // ufku son yükselten uzaklık
    let alindi = false; // bu sırt için mevzi alındı
    let onceki = 0; // önceki adımın örtü yüksekliği
    const ADIM = 1.5;
    for (let d = 6; d <= enUzak; d += ADIM) {
      const g = zemin(sx * d, sz * d);
      const egim = g / d;
      if (egim > ufuk) {
        ufuk = egim;
        tepe = d;
        alindi = false;
        onceki = 0;
        continue;
      }
      const ortu = ufuk * d - g; // göz hattının bu noktadaki zemin üstü yüksekliği
      const once = onceki;
      onceki = ortu;
      if (alindi || d < enYakin || d - tepe > 15 || ortu < 0.85) continue;
      // Dik arka yamaçta örtü bir adımda 0,85–1,2 bandını atlayabilir: 1 m'ye denk gelen ara uzaklık
      let dm = d;
      let om = ortu;
      if (ortu > 1.2) {
        dm = d - ADIM + (ADIM * (1 - once)) / (ortu - once);
        om = ufuk * dm - zemin(sx * dm, sz * dm);
        if (om < 0.7 || om > 1.3 || dm < enYakin) continue;
      }
      alindi = true;
      const x = sx * dm;
      const z = sz * dm;
      if (sonuc.some((m) => Math.hypot(m.x - x, m.z - z) < aralik)) continue;
      sonuc.push({ x, z, y: om + 0.03, azimut: az, mesafe: dm });
    }
  }
  return sonuc;
}

/**
 * Açık arazi mevzileri (yedek): yönde ne plan mevzisi ne sırt varsa düşman görünür yamaçta, yerde yatar; ateş için diz
 * çöker gibi doğrulur (örtü çizgisi zemin: figürün belden yukarısı görünür, çökünce otların içinde kaybolur). Her yön
 * hattında (6°'de bir) izleyiciden görünen (kendinden öndeki araziyle örtülmeyen) zemin noktalarından biri seçilir;
 * seçim yöne bağlı sabit bir karmadır (aynı arazide hep aynı yerler). Mevziler birbirinden ≥ `aralik` m.
 */
export function acikAraziMevzileriBul(zemin: (x: number, z: number) => number, azimut: number, aci: number, enYakin = 55, enUzak = 95, aralik = 12): AraziMevzisi[] {
  const sonuc: AraziMevzisi[] = [];
  for (let az = azimut - aci + 3; az <= azimut + aci - 3 + 1e-6; az += 6) {
    const a = (az * Math.PI) / 180;
    const sx = Math.sin(a);
    const sz = -Math.cos(a);
    let ufuk = -Infinity;
    const gorunen: number[] = [];
    for (let d = 6; d <= enUzak; d += 2) {
      const egim = zemin(sx * d, sz * d) / d;
      // Görünen zemin: ufku yükselten (ya da ufuk çizgisinde kalan) nokta
      if (egim >= ufuk - 1e-4) {
        ufuk = Math.max(ufuk, egim);
        if (d >= enYakin) gorunen.push(d);
      }
    }
    if (gorunen.length < 3) continue;
    const karma = Math.abs(Math.sin(az * 12.9898 + 78.233) * 43758.5453) % 1;
    const d = gorunen[Math.floor(karma * gorunen.length)];
    const x = sx * d;
    const z = sz * d;
    if (sonuc.some((m) => Math.hypot(m.x - x, m.z - z) < aralik)) continue;
    sonuc.push({ x, z, y: 0.05, azimut: az, mesafe: d });
  }
  return sonuc;
}
