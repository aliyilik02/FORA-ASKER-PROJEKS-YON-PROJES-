/**
 * 3B yağış: yağmur çizgileri ve kar taneleri izleyicinin çevresinde, gerçek derinlikte. Eski 2B katman (hava.ts) ekrana
 * düz çiziyordu: duvar perspektifine uymuyor, uzak ve yakın damla aynı boydaydı. Burada her damla dünyada bir noktadır,
 * üç duvar kamerası onu kendi izdüşümüyle görür (köşede kırılmaz), arazinin ve figürlerin arkasında kalan gizlenir.
 *
 * Konumlar gölgelendiricide üretilir (CPU işi yok): tohum × kutu + hız × zaman, kutu içinde sarmalanır. İki katman:
 * yakın (sık, ince, izleyicinin 2,5 m'sinden önce sönen: duvarın önünde, odanın içinde damla olmasın) ve uzak (seyrek,
 * perde etkisi). Çizgi kalınlığı en az ~1 piksel; daha incesi saydamlıkla karşılanır (alt piksel kapsama), böylece uzak
 * yağmur titremez. Rüzgâr "nereden" esiyorsa damla ters yöne savrulur; kar salınır, güçlü rüzgârda tipiye döner.
 */
import * as THREE from "three";
import type { Kalite } from "./sahne3b";
import type { OrtamAyarlari } from "../tipler";
import { ZEMIN_Y, azimutYon } from "./uzay";

const KOSE = /* glsl */ `
attribute vec4 tohum;
uniform float zaman;
uniform vec3 kutu;
uniform vec3 hiz;
uniform float boy;
uniform float kalinlik;
uniform float kar;
uniform float salinim;
uniform float yakinSinir;
uniform float ekranYuksekligi;
uniform float zeminY;
varying vec2 vUv;
varying float vAlfa;
varying float vBulanik;

void main() {
  float hizCarpani = 0.8 + 0.4 * tohum.w;
  vec3 p = tohum.xyz * kutu + hiz * zaman * hizCarpani;
  if (kar > 0.5) {
    float f = 0.7 + tohum.w * 1.3;
    p.x += sin(zaman * f + tohum.x * 40.0) * salinim;
    p.z += cos(zaman * f * 0.8 + tohum.z * 40.0) * salinim;
  }
  // Kutu izleyicinin çevresinde (yatay merkez 0, alt zemin), sarmalı
  p = mod(p, kutu);
  p.xz -= kutu.xz * 0.5;
  p.y += zeminY - 0.5;

  vec3 kameraya = cameraPosition - p;
  float uzaklik = length(kameraya);
  // Ekranda bir pikselin dünya boyu bu uzaklıkta (duvar kamerasının izdüşümünden)
  float pikselBoyu = uzaklik / max(projectionMatrix[1][1] * ekranYuksekligi * 0.5, 1.0);
  float alfa = 1.0;
  // Yakında söner (oda içinde damla yok), kutunun yatay kenarında söner (sarmalama görünmesin)
  alfa *= smoothstep(yakinSinir, yakinSinir * 1.6, uzaklik);
  float yatay = length(p.xz - cameraPosition.xz);
  alfa *= 1.0 - smoothstep(kutu.x * 0.32, kutu.x * 0.48, yatay);

  vec3 konum;
  if (kar > 0.5) {
    float s = kalinlik * (0.5 + tohum.w);
    float sEkran = max(s, pikselBoyu * 1.5);
    alfa *= min(1.0, s / sEkran * 1.3);
    vec3 sag = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 yukari = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    konum = p + (sag * (position.x) + yukari * (position.y - 0.5)) * sEkran;
    // Yakın taneler odak dışı: büyük ve yumuşak
    vBulanik = smoothstep(8.0, 3.0, uzaklik);
  } else {
    vec3 yon = normalize(hiz);
    vec3 kuyruk = p - yon * boy * hizCarpani;
    vec3 yan = normalize(cross(yon, normalize(kameraya)));
    float w = max(kalinlik, pikselBoyu * 1.1);
    // Alt piksel kapsama: doğrusal oran gözün gördüğünden soluk (yağmur parlak, hareketli çizgidir); karekök
    alfa *= sqrt(kalinlik / w);
    konum = mix(kuyruk, p, position.y) + yan * position.x * w;
    vBulanik = 0.0;
  }
  vUv = vec2(position.x + 0.5, position.y);
  vAlfa = alfa;
  gl_Position = projectionMatrix * viewMatrix * vec4(konum, 1.0);
}
`;

const PARCA = /* glsl */ `
uniform vec3 renk;
uniform float opaklik;
uniform float kar;
varying vec2 vUv;
varying float vAlfa;
varying float vBulanik;
void main() {
  float a;
  if (kar > 0.5) {
    float r = length(vUv - 0.5) * 2.0;
    a = smoothstep(1.0, mix(0.35, 0.0, vBulanik), r) * mix(1.0, 0.55, vBulanik);
  } else {
    float yan = 1.0 - abs(vUv.x * 2.0 - 1.0);
    a = yan * smoothstep(0.0, 0.6, vUv.y);
  }
  a *= vAlfa * opaklik;
  if (a < 0.003) discard;
  gl_FragColor = vec4(renk, a);
  #include <colorspace_fragment>
}
`;

interface Katman {
  mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  kapasite: number;
}

/** Katman başına en çok damla (yüksek kalite, şiddetli yağmur); kalite ve yağış türü bunu ölçekler. */
const KAPASITE = { yakin: 9000, uzak: 9000 };
const KALITE_CARPANI: Record<Kalite, number> = { dusuk: 0.35, orta: 0.6, yuksek: 1 };

export class Yagis3B {
  readonly grup = new THREE.Group();
  private readonly yakin: Katman;
  private readonly uzak: Katman;
  private tur: OrtamAyarlari["yagis"] = "yok";
  private zaman = 0;
  private readonly hiz = new THREE.Vector3();

  constructor(kalite: Kalite) {
    this.grup.name = "yagis3b";
    const c = KALITE_CARPANI[kalite];
    this.yakin = this.katmanKur(Math.round(KAPASITE.yakin * c), new THREE.Vector3(26, 16, 26));
    this.uzak = this.katmanKur(Math.round(KAPASITE.uzak * c), new THREE.Vector3(110, 34, 110));
    this.grup.visible = false;
  }

  private katmanKur(kapasite: number, kutu: THREE.Vector3): Katman {
    const g = new THREE.InstancedBufferGeometry();
    // Dörtgen: x −0,5..0,5 (kalınlık), y 0..1 (kuyruk → baş)
    g.setAttribute("position", new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const tohum = new Float32Array(kapasite * 4);
    for (let i = 0; i < tohum.length; i++) tohum[i] = Math.random();
    g.setAttribute("tohum", new THREE.InstancedBufferAttribute(tohum, 4));
    g.instanceCount = 0;
    const m = new THREE.ShaderMaterial({
      name: "Yagis3B",
      uniforms: {
        zaman: { value: 0 },
        kutu: { value: kutu },
        hiz: { value: new THREE.Vector3(0, -9, 0) },
        boy: { value: 0.35 },
        kalinlik: { value: 0.0025 },
        kar: { value: 0 },
        salinim: { value: 0.3 },
        yakinSinir: { value: 2.5 },
        ekranYuksekligi: { value: 1080 },
        zeminY: { value: ZEMIN_Y },
        renk: { value: new THREE.Color(0.7, 0.72, 0.76) },
        opaklik: { value: 0.25 },
      },
      vertexShader: KOSE,
      fragmentShader: PARCA,
      transparent: true,
      depthWrite: false,
      fog: false,
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false;
    mesh.renderOrder = 25;
    this.grup.add(mesh);
    return { mesh, kapasite };
  }

  /** Ekran yüksekliği (piksel): en az bir piksellik çizgi için. */
  boyutlandir(H: number) {
    for (const k of [this.yakin, this.uzak]) k.mesh.material.uniforms.ekranYuksekligi.value = H;
  }

  /** Ortamdan: yağış türü, rüzgâr (nereden, 0–1). */
  ayarla(ortam: OrtamAyarlari) {
    this.tur = ortam.yagis;
    const kar = this.tur === "kar";
    const oran = this.tur === "siddetli_yagmur" || kar ? 1 : this.tur === "hafif_yagmur" ? 0.3 : 0;
    this.grup.visible = oran > 0;
    // Rüzgâr: yağmurda yatay hız ≤ 6 m/sn, karda ≤ 9 m/sn (tipi)
    const yon = azimutYon(ortam.ruzgarYonu + 180);
    const s = ortam.ruzgarSiddeti;
    if (kar) this.hiz.set(yon.x * s * 9, -1.2, yon.z * s * 9);
    else this.hiz.set(yon.x * s * 6, this.tur === "hafif_yagmur" ? -7 : -9.5, yon.z * s * 6);
    for (const [k, uzak] of [
      [this.yakin, false],
      [this.uzak, true],
    ] as const) {
      const u = k.mesh.material.uniforms;
      k.mesh.geometry.instanceCount = Math.round(k.kapasite * oran);
      (u.hiz.value as THREE.Vector3).copy(this.hiz);
      u.kar.value = kar ? 1 : 0;
      // Hareket bulanıklığı: 1/30 sn pozlamadaki yol
      u.boy.value = kar ? 0 : this.hiz.length() / 30;
      u.kalinlik.value = kar ? (uzak ? 0.05 : 0.04) : uzak ? 0.012 : 0.006;
      u.salinim.value = kar ? 0.25 + s * 0.4 : 0;
      u.opaklik.value = kar ? (uzak ? 0.75 : 0.9) : this.tur === "siddetli_yagmur" ? (uzak ? 0.35 : 0.5) : uzak ? 0.25 : 0.4;
    }
  }

  /** Damla rengi: gökten aydınlanır (doğrusal renk; gece koyu). Kar beyaz, yağmur gök grisi. */
  isikAyarla(gokRengi: THREE.Color, faktor: number) {
    const kar = this.tur === "kar";
    for (const k of [this.yakin, this.uzak]) {
      const r = k.mesh.material.uniforms.renk.value as THREE.Color;
      if (kar) r.setRGB(0.92, 0.94, 0.97).multiplyScalar(Math.max(0.08, faktor));
      // Damla arkadan gökle aydınlanır: zeminden ve gökten açık görünür
      else r.copy(gokRengi).multiplyScalar(1.8 * faktor).addScalar(0.04 * faktor);
    }
  }

  guncelle(dt: number) {
    if (!this.grup.visible) return;
    // Uzun oturumda kayan nokta duyarlılığı: zaman 1 saatte bir başa döner (kutu sarmalandığından görünmez değil,
    // bir kare sıçrar; gösterim boyunca fark edilmez)
    this.zaman = (this.zaman + dt) % 3600;
    for (const k of [this.yakin, this.uzak]) k.mesh.material.uniforms.zaman.value = this.zaman;
  }

  dispose() {
    for (const k of [this.yakin, this.uzak]) {
      k.mesh.geometry.dispose();
      k.mesh.material.dispose();
    }
  }
}
