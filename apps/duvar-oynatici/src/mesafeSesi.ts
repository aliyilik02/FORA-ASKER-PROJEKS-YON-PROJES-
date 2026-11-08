/**
 * Mesafeye göre ses (8 Kasım, C-17 crack–thump): uzak atışın namlu sesi ışıktan (namlu parıltısından) `mesafe/343` sn
 * sonra gelir; her mesafe ikiye katlanışında ~6 dB düşer; yüksek frekanslar havada sönümlenir (alçak geçiren kesim).
 * Yakın geçen merminin "çat"ı (ses hızı üstü şok) ayrıdır ve beklemez: önce çat, sonra uzak "tump" (crack–thump).
 * Saf hesap, birim testli; ses.ts kullanır.
 */
export const SES_HIZI_M_S = 343;

/** Namlu sesinin gecikmesi (sn): mesafe/343, en çok `enCok` (varsayılan 4 sn ≈ 1,4 km; ötesi dramatik olarak yeterli). */
export function mesafeGecikmesi(mesafeM: number, enCok = 4): number {
  if (!Number.isFinite(mesafeM) || mesafeM <= 0) return 0;
  return Math.min(enCok, mesafeM / SES_HIZI_M_S);
}

/**
 * Alçak geçiren kesim (Hz): 300 m → 6 kHz, 1 km → 2 kHz, 2 km+ → 800 Hz (logaritmik aralıkta doğrusal), 100 m altında 9 kHz.
 */
export function mesafeKesimi(mesafeM: number): number {
  if (!Number.isFinite(mesafeM) || mesafeM <= 100) return 9000;
  const noktalar: Array<[number, number]> = [
    [100, 9000],
    [300, 6000],
    [1000, 2000],
    [2000, 800],
  ];
  if (mesafeM >= 2000) return 800;
  for (let i = 1; i < noktalar.length; i++) {
    const [m0, f0] = noktalar[i - 1];
    const [m1, f1] = noktalar[i];
    if (mesafeM <= m1) {
      const t = (Math.log(mesafeM) - Math.log(m0)) / (Math.log(m1) - Math.log(m0));
      return Math.exp(Math.log(f0) + (Math.log(f1) - Math.log(f0)) * t);
    }
  }
  return 800;
}

/** Kazanç çarpanı: 100 m'de 1, her ikiye katlanışta −6 dB (1/r), 2 km'de ~0,05; tabanı 0,04 (tamamen yok olmasın). */
export function mesafeKazanci(mesafeM: number, referansM = 100): number {
  if (!Number.isFinite(mesafeM) || mesafeM <= referansM) return 1;
  return Math.max(0.04, referansM / mesafeM);
}
