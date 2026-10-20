/**
 * İlk kurulumda yüklenen örnek senaryolar. Eğitmen panelden yenilerini oluşturabilir.
 */
import type { Senaryo } from "./tipler.js";

export const ORNEK_SENARYOLAR: Senaryo[] = [
  {
    id: "sn_daglik_pusu_gece",
    ad: "Dağlık – Gece Pusu",
    aciklama: "Dağlık bölgede gece, hafif sisli ortamda ani pusu. Patlama, izli mermi ve bağırmalar.",
    oda: "oda1",
    adimlar: [
      { id: "a1", gecikmeMs: 0, aciklama: "Dağlık bölge yüklenir", islem: { tip: "bolge", bolge: "daglik" } },
      {
        id: "a2",
        gecikmeMs: 500,
        aciklama: "Gece, kış, hafif sis",
        islem: { tip: "ortam", ortam: { mevsim: "kis", saat: 22.5, bulut: 0.6, sis: 0.3, yagis: "yok", ruzgarSiddeti: 0.3 } },
      },
      { id: "a3", gecikmeMs: 8000, aciklama: "Uzaktan gürültü", islem: { tip: "efekt", efekt: { tur: "gurultu", siddet: 0.4, yon: 300 } } },
      { id: "a4", gecikmeMs: 12000, aciklama: "İlk patlama", islem: { tip: "efekt", efekt: { tur: "patlama", siddet: 0.9, yon: 320 } } },
      {
        id: "a5",
        gecikmeMs: 12500,
        aciklama: "İzli mermi başlar (sol duvar)",
        islem: { tip: "izli_mermi", izliMermi: { aktif: true, cikisNoktasi: 0, yon: 25, siklik: 6 } },
      },
      { id: "a6", gecikmeMs: 14000, aciklama: "Bağırma: 'Yaralı var!'", islem: { tip: "efekt", efekt: { tur: "bagirma", siddet: 1, yon: 20 } } },
      { id: "a7", gecikmeMs: 20000, aciklama: "Çağırma: 'Sıhhiye!'", islem: { tip: "efekt", efekt: { tur: "cagirma", siddet: 0.9, yon: 10 } } },
      { id: "a8", gecikmeMs: 26000, aciklama: "İkinci patlama ve toz", islem: { tip: "efekt", efekt: { tur: "patlama", siddet: 1, yon: 40 } } },
      { id: "a9", gecikmeMs: 26300, aciklama: "Toz / duman bulutu", islem: { tip: "efekt", efekt: { tur: "toz_duman", siddet: 0.8, yon: 40 } } },
      { id: "a10", gecikmeMs: 45000, aciklama: "İzli mermi biter", islem: { tip: "izli_mermi", izliMermi: { aktif: false } } },
    ],
  },
  {
    id: "sn_meskun_mahal_gunduz",
    ad: "Meskûn Mahal – Gündüz Temas",
    aciklama: "Meskûn mahalde gündüz, yağmurlu havada temas. Gürültü, patlama ve sağ duvardan izli mermi.",
    oda: "oda1",
    adimlar: [
      { id: "b1", gecikmeMs: 0, aciklama: "Meskûn mahal yüklenir", islem: { tip: "bolge", bolge: "meskun_mahal" } },
      {
        id: "b2",
        gecikmeMs: 500,
        aciklama: "Sonbahar, 14:00, yağmur",
        islem: { tip: "ortam", ortam: { mevsim: "sonbahar", saat: 14, bulut: 0.9, sis: 0.1, yagis: "hafif_yagmur", ruzgarSiddeti: 0.4 } },
      },
      { id: "b3", gecikmeMs: 6000, aciklama: "Sokak gürültüsü", islem: { tip: "efekt", efekt: { tur: "gurultu", siddet: 0.5, yon: 90 } } },
      { id: "b4", gecikmeMs: 10000, aciklama: "Patlama (sağ)", islem: { tip: "efekt", efekt: { tur: "patlama", siddet: 0.8, yon: 70 } } },
      {
        id: "b5",
        gecikmeMs: 10300,
        aciklama: "İzli mermi (sağ duvar)",
        islem: { tip: "izli_mermi", izliMermi: { aktif: true, cikisNoktasi: 2, yon: -30, siklik: 8 } },
      },
      { id: "b6", gecikmeMs: 13000, aciklama: "Bağırma", islem: { tip: "efekt", efekt: { tur: "bagirma", siddet: 1, yon: 60 } } },
      { id: "b7", gecikmeMs: 30000, aciklama: "İzli mermi biter", islem: { tip: "izli_mermi", izliMermi: { aktif: false } } },
    ],
  },
  {
    id: "sn_oda2_tahliye",
    ad: "Oda 2 – Sütre Arkası Tahliye",
    aciklama: "Güvenli alanda yaralı tahliyesi; uzaktan sesler, ardından helikopter yaklaşır ve iner.",
    oda: "oda2",
    adimlar: [
      {
        id: "c1",
        gecikmeMs: 0,
        aciklama: "Kaya/sütre arkası görüntüsü, uzak sesler 800 m kuzeydoğudan",
        islem: { tip: "oda2", oda2: { guvenliAlan: "kaya_sutre_arkasi", helikopter: "yok", uzakSesMesafesi: 800, uzakSesYonu: 45 } },
      },
      { id: "c2", gecikmeMs: 5000, aciklama: "Uzaktan mermi sesi", islem: { tip: "efekt", efekt: { tur: "uzak_mermi_sesi", siddet: 0.7 } } },
      { id: "c3", gecikmeMs: 12000, aciklama: "Uzaktan patlama", islem: { tip: "efekt", efekt: { tur: "uzak_patlama", siddet: 0.8 } } },
      { id: "c4", gecikmeMs: 25000, aciklama: "Helikopter yaklaşıyor", islem: { tip: "oda2", oda2: { helikopter: "yaklasiyor" } } },
      { id: "c5", gecikmeMs: 45000, aciklama: "Helikopter iniyor (rotor rüzgârı ve toz)", islem: { tip: "oda2", oda2: { helikopter: "iniyor" } } },
      { id: "c6", gecikmeMs: 60000, aciklama: "Helikopter yerde", islem: { tip: "oda2", oda2: { helikopter: "yerde" } } },
      { id: "c7", gecikmeMs: 90000, aciklama: "Helikopter kalkıyor", islem: { tip: "oda2", oda2: { helikopter: "kalkiyor" } } },
      { id: "c8", gecikmeMs: 110000, aciklama: "Helikopter gitti", islem: { tip: "oda2", oda2: { helikopter: "yok" } } },
    ],
  },
];
