# Eğitmen paneli tasarım sistemi

**Yön:** Gece kontrol odası, "harekât masası". Eğitmen bir elle, gözü eğitim alanında, doğru olayı doğru anda
tetikler. Sakin ve koyu; yalnız eylem (amber) ve tehlike (izli kızılı) renk taşır.

**Belirteçler (`src/stil.css` :root):** `--gece` tuval, `--masa` / `--masa-ust` / `--masa-yukari` üç yüzey
kademesi (yalnız açıklık değişir, ton aynı), `--girdi` girdiler yüzeyden koyu. Metin dört kademe:
`--murekkep`, `-2`, `-3`, `-silik`. Vurgu tek: `--amber`; semantik: `--izli` (tehlike), `--nvg` (bağlı/iyi),
`--uyari`, `--gok` (bilgi/ay). `--kum` yapısal ikincil (pusula duvarları, liste işaretleri).

**Derinlik:** yalnız kenarlık + yüzey açıklığı. Gölge yok (bildirimler hariç). Kenarlık kademeleri
`--cizgi-yumusak` < `--cizgi` < `--cizgi-vurgu`.

**Tipografi:** Bahnschrift (Windows'ta hazır; internet yok) → Segoe UI. Sayılar ve saatler `--mono`
(Cascadia Mono) tablo hizalı. Bölüm başlıkları 15/600, kart başlığı 22/600, etiketler 12.5 px.

**Aralık:** 4 px birim; kart içi 16 px, bölümler arası 16 px, sütunlar arası 20 px. Yarıçap 6 / 10 / 14.

**İmza:** Sahne pusulası (`Pusula.tsx`): U duvar kuş bakışı, yön seçimi sahnenin kendisinden; figür, patlama
halkası, helikopter, güneş/ay ve rüzgâr aynı yüzeyde. Pusula + hızlı efektler her bölümde görünür (`CanliSahne`).

**Desenler:** `Bolum` kartı (ikon + başlık + alt başlık + sağ alan); `Kaydirici` gecikmeli gönderim, amber dolgu;
`SecenekGrubu` segment (seçili = amber dolgu, koyu metin); `Anahtar` 40×22 ray; `OnayliDugme` iki aşamalı
tehlikeli işlem (confirm() yok); `Led` bağlantı lambası (bekliyor = nefes animasyonu); `Rozet` küçük durum
etiketi; `.efekt-satir` ad + açıklama + "TETİKLE" ucu; bildirimler sağ altta, 3 s.

**Hareket:** 160 ms yavaşlayan eğri; bölüm geçişi 220 ms belirme; efekt tetiklenince halka darbesi;
`prefers-reduced-motion` saygı. Yay/sıçrama yok.

**Düzen:** üst çubuk (marka · oda · görev saati · lambalar) + sol görev rayı (92 px) + sol sütun canlı sahne
(400 px, sticky) + sağ sütun bölüm. ≤1180 px tek sütun; ≤900 px ray altta sekme çubuğu olur.
