# Eğitmen paneli tasarım sistemi — Tema A "Cam ve ışık" (4 Kasım 2026)

> Önceki "harekât masası" (22 Ekim) belirteçleri `stil.css`'te duruyor; `tema-a.css` onları ezer. Yeni bileşen yazarken
> bu dosyaya ve `tema-a.css`'e uy. Taslaklar ve seçim: artifact "Eğitmen Paneli Tasarım Seçenekleri" (A + D2 + F).

## Dünya
Koyu kontrol odası, buzlu cam yüzeyler, tek sıcak vurgu. Apple'ın koyu arayüz dili: derinlik gölgeyle, kenarlık ince,
köşeler 9 / 12 / 18 px. Süs yok; hareket yalnız durum bildirir (150–220 ms).

## Belirteçler (`:root`, tema-a.css)
- Zemin: `body` radyal (#26282c → #131416 → #0b0c0d). Kart: `--cam` rgba(255,255,255,.045) + `--cam-kenar` .08 +
  `--golge` 0 24px 48px -24px rgba(0,0,0,.7) + blur(14px).
- Metin: `--murekkep` #ecebe6, `--murekkep-2` #c4c3bd, `--murekkep-3` #a3a39d (ikincil, 4.5:1 sağlar), silik #6b6b67.
- Vurgu: `--amber` #e3b267 (yalnız birincil eylem, seçili durum, sayısal değer); koyu #c99a52; üzeri #f0c98a.
- Durum: tehlike `--izli` #f0806a (zemin #2a1a17, kenar #5a2f27, metin #f0a799); başarı `--nvg` #74c98a; uyarı #e8c54a.
- Yazı: Manrope (500/600/700/800; başlık 800, düğme 700, gövde 500), sayılar JetBrains Mono, `font-variant-numeric:
  tabular-nums`. Yerel kopya `public/fonts/fontlar.css` (OFL) — internet yok.
- Ölçek: başlık 22, bölüm 15, düğme/satır 13.5, açıklama 12. Tracking −0.015em başlıklarda.

## Bileşenler (F kiti)
- Düğme: yüzey #26282c, kenarlık yok; hover #2f3237; basılı 1 px aşağı; odak 2 px amber halka (offset 3); devre dışı
  #1f2124 + silik metin (opaklık değil); yükleniyor `aria-busy="true"` → dönen halka. Birincil amber + amber gölge;
  ikincil saydam + kenarlık; tehlike kırmızı tonlu; iki aşamalı onay (`OnayliDugme`) kırmızı dolu, animasyonsuz.
- Bölmeli denetim (`.secenek-grubu`, yön/mesafe/kalite): koyu tepsi rgba(0,0,0,.38) içinde 8 px köşeli segmentler,
  seçili açık yüzey; yön seçicide seçili amber. Uzun etiket tek satır, sığmazsa segment alt sıraya iner.
- Anahtar 44×26, beyaz topuz; açık amber. Kaydırıcı 5 px ray, beyaz 20 px topuz, değer amber.
- Rozet: yumuşak yüzey, kenarlıksız. LED: 8 px nokta, parıltısız.
- Liste satırı: rgba(0,0,0,.3), 12 px köşe, seçili amber kenarlık; sol simge kutusu 30 px (`GrupSimgesi`).
- Bildirim: cam, 8 px renkli nokta (başarı yeşil, hata kızıl, bilgi amber), gölge.
- Simgeler: `Simgeler.tsx` (gruplar) ve `ortak.tsx Ikon` — tek çizgi 1.75, emoji yok.

## Yön seçimi (D2)
`YonSecici`: beş bölge (Sol −90, Sol-ön −45, Karşı 0, Sağ-ön 45, Sağ 90) + ±5° + derece; seçili bölge en yakın
merkez (±22,5°). Sahnedekiler (figür, yaralı, düşman, helikopter) altta metin. Saat tetiği yok (eski SVG pusula 250 ms'de
yeniden çizilip oynatıcının kare hızını düşürüyordu).

## Yerleşim
Üst çubuk 64 px cam; sol ray 208 px satır ikon+ad; içerik `minmax(400px,440px) 1fr`; 900 px altı ray sekme çubuğu,
1100 px altı oda adları gizli (yalnız numara).
