/**
 * 3B sahnenin koordinat sözleşmesi.
 *
 * İzleyici başlangıç noktasında, göz hizası GOZ_YUKSEKLIGI; zemin y = -GOZ_YUKSEKLIGI düzlemi.
 * Azimut 0 = orta duvarın ortası (-z yönü), sağa artı (+x), sola eksi. 2B katmanla aynı sözleşme.
 */
import * as THREE from "three";

export const GOZ_YUKSEKLIGI = 1.7;
export const ZEMIN_Y = -GOZ_YUKSEKLIGI;

/** Arazi katmanı açıkken zemin yüksekliği (m, düzleme göre); kapalıyken 0. arazi.ts bağlar. */
let yukseklikFn: (x: number, z: number) => number = () => 0;
export function zeminFonksiyonu(f: ((x: number, z: number) => number) | null) {
  yukseklikFn = f ?? (() => 0);
}
/** Dünya (x, z) noktasında zemin y'si (arazi dâhil). Yere oturan her şey bunu kullanmalı. */
export function zeminY(x: number, z: number): number {
  return ZEMIN_Y + yukseklikFn(x, z);
}

export function derece(rad: number): number {
  return (rad * 180) / Math.PI;
}
export function radyan(der: number): number {
  return (der * Math.PI) / 180;
}

/** Azimut (derece) → yatay birim yön. */
export function azimutYon(azimut: number): THREE.Vector3 {
  const a = radyan(azimut);
  return new THREE.Vector3(Math.sin(a), 0, -Math.cos(a));
}

/** Zemin üzerinde azimut + mesafe → dünya konumu. */
export function yerKonumu(azimut: number, mesafe: number, yukseklik = 0): THREE.Vector3 {
  const v = azimutYon(azimut).multiplyScalar(mesafe);
  v.y = zeminY(v.x, v.z) + yukseklik;
  return v;
}

/** Dünya konumu → azimut (derece, -180..180). */
export function konumAzimutu(p: THREE.Vector3): number {
  return derece(Math.atan2(p.x, -p.z));
}

/**
 * Panelin "ufka göre yükseklik" değeri (derece, negatif = ufkun altı) → zemin mesafesi (m).
 * -4° → ~24 m, -6° → ~16 m, -12° → ~8 m. Pozitif/çok küçük değerlerde uzak varsayılır.
 */
export function yukseklikMesafe(yukseklikDerece: number): number {
  const aci = Math.max(0.5, -yukseklikDerece);
  return Math.min(300, GOZ_YUKSEKLIGI / Math.tan(radyan(aci)));
}

/** Nesnenin izleyiciye dönük durması için y ekseni dönüşü (glTF ön yüzü +z). */
export function izleyiciyeDonus(azimut: number): number {
  return -radyan(azimut);
}

/** Nesnenin izleyiciye göre sağa (yansit: sola) yürümesi için y dönüşü. */
export function yanaDonus(azimut: number, sola: boolean): number {
  return (sola ? -Math.PI / 2 : Math.PI / 2) - radyan(azimut);
}

/** Yatay fov (derece) ve duvar en/boy oranından dikey fov (derece). */
export function dikeyFov(yatayFovDerece: number, genislik: number, yukseklik: number): number {
  return derece(2 * Math.atan(Math.tan(radyan(yatayFovDerece) / 2) * (yukseklik / genislik)));
}
