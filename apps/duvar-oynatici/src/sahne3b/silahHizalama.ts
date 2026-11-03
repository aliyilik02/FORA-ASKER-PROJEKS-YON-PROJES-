/**
 * Silah soketi hesabı: elde taşınan silahın kemik uzayındaki konum/dönüşünü (manifest `silahModeli.konum/donus`)
 * deneme-yanılma yerine ölçerek bulur.
 *
 * Yöntem (oyun motorlarındaki "weapon socket" yaklaşımı):
 *  - Mixamo tüfek kliplerinde sağ el tutamakta, sol el kundaktadır → namlu doğrultusu ≈ sağ elden sol ele vektör;
 *    tüfek yatık taşınmaz → tüfeğin "yukarı"sı dünya yukarısının bu doğrultuya dik bileşeni.
 *  - Tüfek modelinin kendi ekseni geometriden: en uzun kenar = namlu ekseni; dar kesitli uç = namlu ağzı; orta
 *    bölgede ağırlık merkezinin kaydığı yön = aşağı (tutamak + şarjör). Kavrama noktası: dipçik ucundan %36 ileride,
 *    tabandan %30 yukarıda.
 *  - Avuç noktası: bilek kemiğinden parmaklara (önkol→el doğrultusu) 7 cm.
 *  Birkaç klip × birkaç kare örneklenir, ortalama alınır; kliplerin ortalamadan sapması raporlanır (tutarsız klip =
 *  aktarım sorunu). Çıktı doğrudan manifeste yazılacak biçimdedir: konum metre (kemiğin yönelimiyle), donus derece
 *  (three.js Euler XYZ). Oynatıcı `figurler3b.ts`'de konumu olcek·kemikOlcek ile kemik birimine çevirir.
 *
 * Kullanım (başsız/normal tarayıcı konsolu): `await window.duvar.silahHizala("<figür id>", ["Rifle Idle", "Rifle Walk"])`
 */
import * as THREE from "three";
import type { Aktif } from "./figurler3b";

export interface SilahHizasi {
  konum: [number, number, number];
  donus: [number, number, number];
  /** Her örnek için: klip, zaman, ortalama doğrultudan sapma (derece). */
  ornekler: Array<{ klip: string; t: number; sapma: number }>;
  /** Tüfek geometrisi: eksen, namlu ucu işareti, yukarı ekseni, uzunluk (model birimi). */
  tufek: { eksen: "x" | "y" | "z"; namluIsaret: 1 | -1; yukari: "x" | "y" | "z"; yukariIsaret: 1 | -1; uzunluk: number };
  uyari?: string;
}

function kemikBul(kok: THREE.Object3D, ad: string) {
  return kok.getObjectByName(ad) ?? kok.getObjectByName("mixamorig" + ad) ?? kok.getObjectByName("mixamorig:" + ad) ?? null;
}

/** Tüfek modelinin yerel geometrisi: eksenler ve kavrama noktası (model biriminde). */
function tufekGeometrisi(silah: THREE.Object3D) {
  silah.updateMatrixWorld(true);
  const ters = silah.matrixWorld.clone().invert();
  const noktalar: THREE.Vector3[] = [];
  silah.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.geometry) return;
    const poz = m.geometry.getAttribute("position");
    const donusum = ters.clone().multiply(m.matrixWorld);
    const adim = Math.max(1, Math.floor(poz.count / 20000));
    for (let i = 0; i < poz.count; i += adim) noktalar.push(new THREE.Vector3().fromBufferAttribute(poz, i).applyMatrix4(donusum));
  });
  const kutu = new THREE.Box3().setFromPoints(noktalar);
  const boyut = kutu.getSize(new THREE.Vector3());
  const eksenler: Array<"x" | "y" | "z"> = ["x", "y", "z"];
  const eksen = eksenler.reduce((a, b) => (boyut[b] > boyut[a] ? b : a));
  const uzunluk = boyut[eksen];
  const dik = eksenler.filter((e) => e !== eksen);
  // Yukarı: dik eksenlerden geniş olanı (alıcı + tutamak + şarjör yüksekliği > genişlik)
  const yukari = boyut[dik[0]] >= boyut[dik[1]] ? dik[0] : dik[1];
  const merkez = kutu.getCenter(new THREE.Vector3());
  // Namlu ucu: uç %12'lik dilimlerde dik yayılımı küçük olan taraf
  const yayilim = (isaret: 1 | -1) => {
    const sinir = isaret > 0 ? kutu.max[eksen] - 0.12 * uzunluk : kutu.min[eksen] + 0.12 * uzunluk;
    const sec = noktalar.filter((p) => (isaret > 0 ? p[eksen] > sinir : p[eksen] < sinir));
    if (!sec.length) return Infinity;
    const k = new THREE.Box3().setFromPoints(sec).getSize(new THREE.Vector3());
    return k[dik[0]] + k[dik[1]];
  };
  const namluIsaret: 1 | -1 = yayilim(1) < yayilim(-1) ? 1 : -1;
  // Aşağı: namlu hattından en çok çıkıntı yapan taraf (şarjör + tutamak, dürbünden daha uzun). Eksen boyunca 12 dilimde
  // dik eksenin min/max'ı; ortanca hattan en büyük sapma hangi taraftaysa orası aşağı. (Nokta yoğunluğu yanıltır:
  // dürbünlü tüfekte üst yarıda daha çok köşe var.)
  const dilimSayisi = 12;
  const dilimMin = Array<number>(dilimSayisi).fill(Infinity);
  const dilimMax = Array<number>(dilimSayisi).fill(-Infinity);
  for (const p of noktalar) {
    const d = Math.min(dilimSayisi - 1, Math.floor(((p[eksen] - kutu.min[eksen]) / uzunluk) * dilimSayisi));
    dilimMin[d] = Math.min(dilimMin[d], p[yukari]);
    dilimMax[d] = Math.max(dilimMax[d], p[yukari]);
  }
  const ortanca = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];
  const cikintiAlt = ortanca(dilimMin) - Math.min(...dilimMin);
  const cikintiUst = Math.max(...dilimMax) - ortanca(dilimMax);
  const yukariIsaret: 1 | -1 = cikintiAlt >= cikintiUst ? 1 : -1; // çıkıntı min tarafındaysa yukarı = +
  // Kavrama: en derin çıkıntı (şarjör) dilimi, ondan dipçiğe doğru bir dilim = tutamak; tutamağın altından %12 yukarı
  const altlar = yukariIsaret > 0 ? dilimMin : dilimMax.map((v) => -v);
  let sarjorDilimi = 0;
  for (let i = 1; i < dilimSayisi; i++) if (altlar[i] < altlar[sarjorDilimi]) sarjorDilimi = i;
  const tutamakDilimi = Math.max(0, Math.min(dilimSayisi - 1, sarjorDilimi - namluIsaret)); // dipçik yönü = -namluIsaret
  const kavrama = merkez.clone();
  kavrama[eksen] = kutu.min[eksen] + ((tutamakDilimi + 0.5) / dilimSayisi) * uzunluk;
  const tutamakAlt = yukariIsaret > 0 ? dilimMin[tutamakDilimi] : dilimMax[tutamakDilimi];
  kavrama[yukari] = tutamakAlt + yukariIsaret * 0.12 * boyut[yukari];
  const birim = (e: "x" | "y" | "z", isaret: number) => new THREE.Vector3(e === "x" ? isaret : 0, e === "y" ? isaret : 0, e === "z" ? isaret : 0);
  return { eksen, namluIsaret, yukari, yukariIsaret, uzunluk, kavrama, ileri: birim(eksen, namluIsaret), yukariV: birim(yukari, yukariIsaret) };
}

/** İki ortogonal birim vektörden sağ el dik tabanı (ileri, yukarı, yan). */
function taban(ileri: THREE.Vector3, yukari: THREE.Vector3) {
  const f = ileri.clone().normalize();
  const u = yukari.clone().sub(f.clone().multiplyScalar(f.dot(yukari))).normalize();
  const r = new THREE.Vector3().crossVectors(f, u).normalize();
  return new THREE.Matrix4().makeBasis(f, u, r);
}

export async function silahHizala(a: Aktif, klipAdlari: string[], silahBoy = 0.95, avucMesafe = 0.07): Promise<SilahHizasi> {
  if (!a.silahNesne || !a.silahKemik || !a.karistirici) throw new Error("figürde silah/kemik/karıştırıcı yok");
  const sag = a.silahKemik;
  const sol = kemikBul(a.nesne, "LeftHand");
  const onKol = kemikBul(a.nesne, "RightForeArm");
  if (!sol || !onKol) throw new Error("LeftHand / RightForeArm kemiği bulunamadı");
  const g = tufekGeometrisi(a.silahNesne);
  const olcekM = silahBoy / g.uzunluk; // model birimi → metre
  const kavramaM = g.kavrama.clone().multiplyScalar(olcekM);
  const tufekTaban = taban(g.ileri, g.yukariV);
  const tufekTabanTers = tufekTaban.clone().invert();

  const karistirici = a.karistirici;
  const oncekiEylemler: THREE.AnimationAction[] = [];
  for (const e of [a.eylemBekle, a.eylemAtes, a.aktifPoz]) if (e && e.isRunning()) oncekiEylemler.push(e);
  karistirici.stopAllAction();
  const ornekler: SilahHizasi["ornekler"] = [];
  const donusler: THREE.Quaternion[] = [];
  const konumlar: THREE.Vector3[] = [];
  const ileriler: THREE.Vector3[] = [];
  const sagKonum = new THREE.Vector3();
  const sagDonus = new THREE.Quaternion();
  const solKonum = new THREE.Vector3();
  const onKolKonum = new THREE.Vector3();
  for (const ad of klipAdlari) {
    const klip = a.klipler.find((k) => k.name === ad || k.name.toLowerCase().includes(ad.toLowerCase()));
    if (!klip) {
      ornekler.push({ klip: ad + " (yok)", t: 0, sapma: NaN });
      continue;
    }
    const eylem = karistirici.clipAction(klip);
    eylem.reset().setEffectiveWeight(1).play();
    for (const oran of [0.15, 0.4, 0.65, 0.9]) {
      karistirici.setTime(oran * klip.duration);
      a.nesne.updateMatrixWorld(true);
      sag.getWorldPosition(sagKonum);
      sag.getWorldQuaternion(sagDonus);
      sol.getWorldPosition(solKonum);
      onKol.getWorldPosition(onKolKonum);
      const ileri = solKonum.clone().sub(sagKonum).normalize();
      const dunyaTaban = taban(ileri, new THREE.Vector3(0, 1, 0));
      const rDunya = new THREE.Matrix4().multiplyMatrices(dunyaTaban, tufekTabanTers); // tüfek yerel → dünya yönelimi
      const qDunya = new THREE.Quaternion().setFromRotationMatrix(rDunya);
      const qYerel = sagDonus.clone().invert().multiply(qDunya);
      const avuc = sagKonum.clone().add(sagKonum.clone().sub(onKolKonum).normalize().multiplyScalar(avucMesafe));
      const kavramaDunya = kavramaM.clone().applyQuaternion(qDunya);
      const konumDunya = avuc.sub(kavramaDunya).sub(sagKonum); // silah orijini - el, dünya metre
      const konumYerel = konumDunya.applyQuaternion(sagDonus.clone().invert());
      if (donusler.length && donusler[0].dot(qYerel) < 0) qYerel.set(-qYerel.x, -qYerel.y, -qYerel.z, -qYerel.w);
      donusler.push(qYerel);
      konumlar.push(konumYerel);
      ileriler.push(ileri.clone().applyQuaternion(sagDonus.clone().invert()));
      ornekler.push({ klip: ad, t: oran, sapma: 0 });
    }
    eylem.stop();
  }
  // Geri yükle
  karistirici.stopAllAction();
  for (const e of oncekiEylemler) e.reset().setEffectiveWeight(1).play();
  karistirici.update(0);
  if (!donusler.length) throw new Error("örnek yok (klip adları?)");
  const ortQ = new THREE.Quaternion(0, 0, 0, 0);
  for (const q of donusler) {
    ortQ.x += q.x;
    ortQ.y += q.y;
    ortQ.z += q.z;
    ortQ.w += q.w;
  }
  ortQ.normalize();
  const ortK = konumlar.reduce((s, v) => s.add(v), new THREE.Vector3()).multiplyScalar(1 / konumlar.length);
  const ortIleri = ileriler.reduce((s, v) => s.add(v), new THREE.Vector3()).normalize();
  let i = 0;
  for (const o of ornekler) {
    if (Number.isNaN(o.sapma)) continue;
    o.sapma = Math.round(THREE.MathUtils.radToDeg(ileriler[i].angleTo(ortIleri)) * 10) / 10;
    i++;
  }
  const e = new THREE.Euler().setFromQuaternion(ortQ, "XYZ");
  const der = (r: number) => Math.round(THREE.MathUtils.radToDeg(r) * 10) / 10;
  const enBuyukSapma = Math.max(...ornekler.map((o) => o.sapma).filter((s) => !Number.isNaN(s)));
  return {
    konum: [Math.round(ortK.x * 1000) / 1000, Math.round(ortK.y * 1000) / 1000, Math.round(ortK.z * 1000) / 1000],
    donus: [der(e.x), der(e.y), der(e.z)],
    ornekler,
    tufek: { eksen: g.eksen, namluIsaret: g.namluIsaret, yukari: g.yukari, yukariIsaret: g.yukariIsaret, uzunluk: Math.round(g.uzunluk * 1000) / 1000 },
    uyari: enBuyukSapma > 25 ? `Klipler arasında ${enBuyukSapma}° sapma: bazı kliplerde el yönelimi tutarsız (aktarım/rig)` : undefined,
  };
}
