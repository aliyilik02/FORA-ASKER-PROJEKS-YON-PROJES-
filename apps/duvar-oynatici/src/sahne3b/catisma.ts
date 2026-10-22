/**
 * Çatışma sistemi (3B): izli mermiler ve ateş alışverişi.
 *
 *  - Düşman ateşi: panelde seçilen yönden (uzak, 150–260 m) salvolar hâlinde gelen izli mermiler;
 *    yere çarpınca toz ve kıvılcım, bazıları seker; vızıltı/çarpma sesi stereo yerleşimli.
 *  - Dost ateşi: sahnedeki silahlı figürler düşman yönüne karşılık verir: namlu alevi + giden iz + atış sesi.
 *  - Klasik "izli mermi" ayarı (duvar + yön + sıklık) da burada sürekli akış olarak çizilir.
 * İzler tek bir instanced kutu mesh'idir (katkı karışımı, parlak); yön hız vektöründen gelir.
 */
import * as THREE from "three";
import type { ParcacikSistemi } from "./parcaciklar";
import { ZEMIN_Y, azimutYon, konumAzimutu, radyan } from "./uzay";

interface Iz {
  p: THREE.Vector3;
  v: THREE.Vector3;
  kalan: number; // saniye
  renk: THREE.Color;
  dost: boolean;
  sekti: boolean;
}

export interface CatismaSesleri {
  /** Yakına çarpan/vızıldayan mermi (pan -1..1). */
  carpma: (pan: number) => void;
  /** Tek atış sesi; uzak = düşman tarafı. */
  atis: (pan: number, uzak: boolean) => void;
  /** Ağır çatışmada düşman hattında rastgele uzak patlama (azimut, sahne). */
  uzakPatlama?: (azimut: number) => void;
}

export interface CatismaAyari {
  aktif: boolean;
  siddet: number;
  /** Düşman cephesi, sahne azimutu (derece). */
  azimut: number;
  dostAtes: boolean;
}

export interface IzliAyari {
  aktif: boolean;
  azimut: number;
  siklik: number;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const KAPASITE = 320;
const DUSMAN_RENK = new THREE.Color(1.0, 0.5, 0.18);
const DOST_RENK = new THREE.Color(0.9, 0.85, 0.45);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _ileri = new THREE.Vector3(0, 0, 1);

export class CatismaSistemi {
  readonly grup = new THREE.Group();
  private readonly mesh: THREE.InstancedMesh;
  private izler: Iz[] = [];
  private ayar: CatismaAyari = { aktif: false, siddet: 0.5, azimut: 0, dostAtes: true };
  private izli: IzliAyari = { aktif: false, azimut: 0, siklik: 3 };
  private izliBirikim = 0;
  private dusmanSalvoSayac = 0;
  private dusmanSalvoKalan = 0;
  private dusmanAtisSayac = 0;
  private uzakPatlamaSayac = 20;
  private dostSayaclar = new Map<number, number>();
  /** Silahlı dost figürlerin dünya konumları (ayak hizası). Dışarıdan her karede sağlanır. */
  dostlar: () => THREE.Vector3[] = () => [];
  /** Gündüz izler soluk, gece parlak (0 gece – 1 gündüz). */
  set isik(v: number) {
    (this.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - v * 0.5;
  }

  constructor(
    private readonly parcaciklar: ParcacikSistemi,
    private readonly sesler: CatismaSesleri,
  ) {
    const g = new THREE.BoxGeometry(1, 1, 1);
    g.translate(0, 0, -0.5); // z ekseninde geriye uzanan iz: baş noktası kutunun önünde
    const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.mesh = new THREE.InstancedMesh(g, m, KAPASITE);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 25;
    this.grup.add(this.mesh);
  }

  get aktifIzSayisi() {
    return this.izler.length;
  }

  catismaAyarla(a: CatismaAyari) {
    this.ayar = a;
  }
  izliAyarla(a: IzliAyari) {
    this.izli = a;
  }

  private izEkle(p: THREE.Vector3, v: THREE.Vector3, dost: boolean, sekti = false) {
    if (this.izler.length >= KAPASITE) this.izler.shift();
    this.izler.push({ p: p.clone(), v: v.clone(), kalan: 3, renk: dost ? DOST_RENK : DUSMAN_RENK, dost, sekti });
  }

  /** Düşman tarafından bir atış: uzak kaynaktan hedefe doğru. */
  private dusmanAtis(kaynakAzimut: number, hedefAzimutYayilim: number) {
    const kaynakYon = azimutYon(kaynakAzimut + rnd(-10, 10));
    const kaynak = kaynakYon.clone().multiplyScalar(rnd(150, 260));
    kaynak.y = ZEMIN_Y + rnd(0.8, 4);
    // Hedef: dost figürlerin yakını ya da izleyici önündeki zemin; %35'i üstten/yan geçer
    const dostlar = this.dostlar();
    let hedef: THREE.Vector3;
    const r = Math.random();
    if (dostlar.length && r < 0.5) {
      const d = dostlar[Math.floor(Math.random() * dostlar.length)];
      hedef = new THREE.Vector3(d.x + rnd(-3, 3), ZEMIN_Y + (Math.random() < 0.6 ? 0 : rnd(0.3, 1.6)), d.z + rnd(-3, 3));
    } else if (r < 0.85) {
      const az = kaynakAzimut + rnd(-hedefAzimutYayilim, hedefAzimutYayilim);
      const yon = azimutYon(az);
      const mesafe = rnd(3, 24);
      hedef = new THREE.Vector3(yon.x * mesafe, ZEMIN_Y, yon.z * mesafe);
    } else {
      // İzleyicinin yanından/üstünden geçen: arkadaki bir nokta
      const az = kaynakAzimut + 180 + rnd(-35, 35);
      const yon = azimutYon(az);
      const mesafe = rnd(8, 30);
      hedef = new THREE.Vector3(yon.x * mesafe, ZEMIN_Y + rnd(1.5, 6), yon.z * mesafe);
    }
    const v = hedef.clone().sub(kaynak).normalize().multiplyScalar(rnd(140, 190));
    this.izEkle(kaynak, v, false);
    // Düşman hattında namlu parıltısı (uzak, kısa) ve uzak atış sesi
    if (Math.random() < 0.6) this.parcaciklar.parlama(kaynak, rnd(1.5, 2.5));
    if (Math.random() < 0.35) this.sesler.atis(Math.sin(radyan(kaynakAzimut)), true);
  }

  private dostAtis(konum: THREE.Vector3) {
    const dusman = azimutYon(this.ayar.azimut + rnd(-6, 6));
    const namlu = konum.clone();
    namlu.y += 1.35;
    namlu.addScaledVector(dusman, 0.6);
    this.parcaciklar.parlama(namlu, 0.45);
    const hedef = dusman.clone().multiplyScalar(rnd(160, 240));
    hedef.y = ZEMIN_Y + rnd(0, 3);
    const v = hedef.sub(namlu).normalize().multiplyScalar(rnd(160, 200));
    this.izEkle(namlu, v, true);
    this.sesler.atis(Math.sin(radyan(konumAzimutu(konum))), false);
  }

  private carpma(iz: Iz) {
    const p = iz.p;
    const pan = Math.sin(radyan(konumAzimutu(p)));
    const yakin = p.length() < 26;
    if (yakin) {
      // Toz + birkaç kıvılcım; sekme %30
      for (let i = 0; i < 5; i++) {
        this.parcaciklar.duman.ekle({
          x: p.x + rnd(-0.2, 0.2),
          y: ZEMIN_Y + 0.05,
          z: p.z + rnd(-0.2, 0.2),
          vx: rnd(-0.6, 0.6),
          vy: rnd(0.8, 2.2),
          vz: rnd(-0.6, 0.6),
          boyut: rnd(0.25, 0.5),
          buyume: rnd(0.5, 1),
          alfa: rnd(0.3, 0.55),
          aci: rnd(0, 6.28),
          donus: rnd(-1, 1),
          t: 0,
          sure: rnd(0.6, 1.3),
          renk: [0.6, 0.52, 0.4],
          yercekimi: 0.4,
          surtunme: 1.5,
        });
      }
      for (let i = 0; i < 4; i++) {
        const a = rnd(0, 6.28);
        this.parcaciklar.kivilcim.ekle({ x: p.x, y: ZEMIN_Y + 0.05, z: p.z, vx: Math.cos(a) * rnd(1, 4), vy: rnd(2, 6), vz: Math.sin(a) * rnd(1, 4), boyut: rnd(0.04, 0.09), buyume: 0, alfa: 1, aci: 0, donus: 0, t: 0, sure: rnd(0.25, 0.6), renk: [1, 0.8, 0.5], yercekimi: 9.8, surtunme: 0.3 });
      }
      this.sesler.carpma(pan);
      if (!iz.sekti && Math.random() < 0.3) {
        const v = iz.v.clone();
        v.y = Math.abs(v.y) * rnd(0.4, 1.2) + rnd(10, 40);
        v.x += rnd(-40, 40);
        v.z += rnd(-40, 40);
        v.setLength(iz.v.length() * rnd(0.4, 0.7));
        this.izEkle(new THREE.Vector3(p.x, ZEMIN_Y + 0.05, p.z), v, false, true);
      }
    }
  }

  guncelle(dt: number) {
    // --- Düşman ateşi: çatışma salvoları ---
    if (this.ayar.aktif && this.ayar.siddet > 0.02) {
      const s = this.ayar.siddet;
      // Ağır çatışmada düşman hattında ara sıra uzak patlama (havan/top)
      if (s > 0.45 && this.sesler.uzakPatlama) {
        this.uzakPatlamaSayac -= dt;
        if (this.uzakPatlamaSayac <= 0) {
          this.uzakPatlamaSayac = rnd(14, 45) * (1.5 - s);
          this.sesler.uzakPatlama(this.ayar.azimut + rnd(-40, 40));
        }
      }
      if (this.dusmanSalvoKalan > 0) {
        this.dusmanAtisSayac -= dt;
        if (this.dusmanAtisSayac <= 0) {
          this.dusmanAtisSayac = rnd(0.07, 0.13);
          this.dusmanSalvoKalan--;
          this.dusmanAtis(this.ayar.azimut, 30);
        }
      } else {
        this.dusmanSalvoSayac -= dt;
        if (this.dusmanSalvoSayac <= 0) {
          this.dusmanSalvoKalan = Math.round(rnd(3, 5 + s * 6));
          this.dusmanSalvoSayac = rnd(0.4, 3.2) * (1.3 - s);
        }
      }
      // --- Dost ateşi ---
      if (this.ayar.dostAtes) {
        const dostlar = this.dostlar();
        dostlar.forEach((k, i) => {
          const kalan = (this.dostSayaclar.get(i) ?? rnd(0.2, 1.5)) - dt;
          if (kalan <= 0) {
            this.dostAtis(k);
            // Salvo: 3–5 atış hızlı, sonra bekleme
            const seri = (this.dostSayaclar.get(1000 + i) ?? 0) + 1;
            if (seri < Math.round(rnd(3, 5))) {
              this.dostSayaclar.set(1000 + i, seri);
              this.dostSayaclar.set(i, rnd(0.09, 0.16));
            } else {
              this.dostSayaclar.set(1000 + i, 0);
              this.dostSayaclar.set(i, rnd(0.8, 3) * (1.4 - s));
            }
          } else this.dostSayaclar.set(i, kalan);
        });
      }
    }
    // --- Klasik izli mermi akışı ---
    if (this.izli.aktif) {
      this.izliBirikim += dt * this.izli.siklik;
      while (this.izliBirikim >= 1) {
        this.izliBirikim -= 1;
        this.dusmanAtis(this.izli.azimut, 20);
      }
    } else this.izliBirikim = 0;

    // --- İzleri ilerlet ---
    const canli: Iz[] = [];
    for (const iz of this.izler) {
      iz.kalan -= dt;
      iz.v.y -= 9.8 * dt * (iz.sekti ? 1 : 0.15);
      const yeniY = iz.p.y + iz.v.y * dt;
      iz.p.x += iz.v.x * dt;
      iz.p.z += iz.v.z * dt;
      if (yeniY <= ZEMIN_Y + 0.03 && iz.v.y < 0) {
        iz.p.y = ZEMIN_Y + 0.03;
        this.carpma(iz);
        continue;
      }
      iz.p.y = yeniY;
      if (iz.kalan > 0 && iz.p.length() < 400) canli.push(iz);
    }
    this.izler = canli;

    // --- Çizim verisi ---
    const n = Math.min(KAPASITE, this.izler.length);
    for (let i = 0; i < n; i++) {
      const iz = this.izler[i];
      const hiz = iz.v.length();
      const uzunluk = Math.min(4, 0.8 + hiz * 0.014); // ~3 m iz
      const kalinlik = iz.dost ? 0.03 : 0.04;
      _q.setFromUnitVectors(_ileri, iz.v.clone().normalize());
      _s.set(kalinlik, kalinlik, uzunluk);
      _m.compose(iz.p, _q, _s);
      this.mesh.setMatrixAt(i, _m);
      this.mesh.setColorAt(i, iz.renk);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  temizle() {
    this.izler = [];
    this.mesh.count = 0;
  }
}
