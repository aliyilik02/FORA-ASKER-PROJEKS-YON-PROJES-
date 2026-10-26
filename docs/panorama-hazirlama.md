# Yeni panorama hazırlama: yerleşim planı, güneş, gece

Bir bölgeye yeni 360° panorama (gerçek çekim, Poly Haven HDRI, yapay zekâ, UE render) eklerken üç şey
oynatıcının gerçekçiliğini belirler:

1. **Yerleşim planı** (`noktalar`, `yasak`, `yawKaydirma`): patlama, asker, tank, helikopter nereye düşer.
2. **Güneş / ay** (`gunes`): 3B nesnelerin gölgesi panoramadaki ışıkla aynı yöne düşsün.
3. **Gece derecelendirmesi** (`gece`): gece panoraması gerçekten gece gibi görünsün.

Araçlar `araclar/` altında, Python 3 + Pillow + NumPy ve Node 22.6+ ister (makinede kurulu).

## 1. Dosyayı koy, manifeste satır ekle

`apps/duvar-oynatici/public/icerik/<bolge>/pano_<mevsim>_<zaman>_foto_8k.jpg` (equirectangular, 2:1,
8K önerilir). `manifest.json` → `panorama` dizisine:

```json
{ "bolge": "ormanlik", "mevsim": "yaz", "zaman": "gunduz", "dosya": "ormanlik/pano_yaz_gunduz_foto_8k.jpg",
  "tip": "resim", "yawKaydirma": 0, "yukseklikKaydirma": 0, "_kaynak": "Poly Haven \"...\" (CC0)",
  "noktalar": [], "yasak": [] }
```

## 2. Önizle: `araclar/plan-onizleme.py`

```
python araclar/plan-onizleme.py --sec ormanlik_yaz_gunduz_foto --tam
```

`.plan-onizleme/<anahtar>/` klasörüne (depoya girmez) yazar:

- `sol.jpg`, `orta.jpg`, `sag.jpg`: üç duvar, oynatıcıyla aynı perspektif ve `yawKaydirma` ile.
  **Üst cetvel panorama azimutudur**: plan bu sayıları kullanır. Kesikli beyaz eğriler zemin mesafe
  halkaları (5–160 m), camgöbeği eğri hibrit 3B arazinin görünür sınırı.
- `arka.jpg`: duvarlarda görünmeyen arka 90° (yalnız bilgi).
- `genel.jpg`: tüm panorama; duvar sınırları, görünmeyen bölge, yasak aralıklar, noktalar; sarı artı
  otomatik güneş tahmini, yeşil halka manifestteki `gunes`.
- `bilgi.json`: otomatik uyarılar (arka 90°'deki nokta, yasak içindeki nokta, patlama/asker noktası olmayan
  duvar, helikopter noktası yok...).

İşaretler: kırmızı halka patlama krateri (r 2,5 m), mavi dikdörtgen asker (1,8 m), turuncu kutu tank
(7×3,5×2,4 m), sarı halka + kutu helikopter iniş alanı (r 7 m), kahverengi halka toz. Gece panoramaları
yalnız önizlemede aydınlatılır.

Planı manifeste yazmadan denemek için öneri dosyası:

```
python araclar/plan-onizleme.py --sec ormanlik_yaz_gunduz_foto --tam --plan oneri.json
```

`oneri.json`: `{"yawKaydirma": 20, "noktalar": [...], "yasak": [...], "gunes": {...}}`.

## 3. Yerleşim planı kuralları

Sözleşme: azimut **panorama** derecesi (−180..180, sağa artı); sahne azimutu = panorama − `yawKaydirma`.
`mesafe` metre, göz 1,7 m yükseklikte düz zemin varsayımıyla: nesne, o mesafedeki düz zeminin panoramada
düştüğü yere oturur. 3B nesne panoramanın **önüne** çizilir (fotoğrafın derinliği yok): fotoğraftaki daha
yakın bir ağacın/duvarın üstüne düşen nesne yapıştırma gibi görünür.

- **yawKaydirma** (5'in katı): orta duvar asıl açık alana (tarla, vadi, yol, meydan) baksın; görünmeyen arka
  90° en işe yaramaz yön olsun (yakın engel, fotoğrafçı tarafı).
- Her duvarda en az bir `patlama` ve bir `asker` noktası (zemin varsa, ağaç/bina önünde 6–15 m de olur).
  Tipik: 3–6 patlama, 4–7 asker/figür, 1–2 helikopter, 2–3 tank, 0–2 toz. Arka 90°'de nokta yok.
- `asker` / `figur`: plan noktası askerin **yönünü** belirler; oynatıcı mesafeyi 4–7 m'ye çeker
  (`sahne3b.ts` `ASKER_EN_UZAK`/`ASKER_EN_YAKIN`: asker duvarda iri ve net okunsun; 7 m'de 1080p duvarda ~265 px).
  Yön, yakın zemini açık olan (siper, kaya, hendek kenarı yanı) bir yer seçilmeli; `figur` yürüyen/koşan için
  yanlara açık alan. `patlama` 12–30 m, su/buz, çatı, ağaç/bina içi değil (oynatıcı askerin/tankın 4,5 m
  yakınına patlama düşürmez, boş noktaya kaydırır); `tank` 22–35 m düz alan/yol; `helikopter` 25–45 m,
  ≥ 15 m açık düz alan, en az biri sahne −55..+80° arasında (paneldeki varsayılan iniş yönü +12°);
  `toz` toprak yol / çakıl. Oda 2'de askerler sütre eşyalarının (kaya, HESCO) içine konmaz.
- Hibrit 3B arazi (kırsal/dağlık 160 m, ormanlık 48 m, üs 90 m): ormanlıkta noktalar ≤ 30 m, üste ≤ 55 m
  (kenarda arazi alçalır). Sırt/tepe üstünden çekilmiş panoramada zemin uzakta düşer: noktalar yakın zeminde.
- `yasak` aralıkları [baslangic → bitis, saat yönünde]: yakın engellerin (gövde, bina, duvar, araç, direk)
  zemin bandını kaplar; plan noktası yoksa serbest yerleşim bunlardan kaçar. İçinde plan noktası olmasın.
- Adlar kısa, Türkçe karakter yok ("tarla sol", "yol uzak"); tank noktaları "tank · " önekli.

## 4. Güneş / ay: `gunes`

Otomatik tahmin (en parlak gök diski) bulutlu/puslu gökte ya da geniş parlamada yanılabilir; doğrulanmış
değer manifeste yazılır ve tahminin yerine geçer:

```json
"gunes": { "azimut": 36, "yukseklik": 50, "guc": 0.95, "aciklama": "güneş diski açık, gölgeler sola" }
```

`genel.jpg`'de yükseklik çizgileri (−30, −10, 0, 10, 30, 60°) ve alt cetvel (30°'de bir) ile okunur;
yeşil halka ışığın üstüne gelmeli, yerdeki gölgeler ondan uzağa düşmeli. `guc`: güneş diski 0,85–1;
ince bulut 0,5–0,8; kapalı gök 0,15–0,35; gece ay 0,3–0,6. Oynatıcı HUD'u (H) "güneş: manifest ..."
satırını gösterir.

## 5. Gece panoraması: `araclar/gece-derecelendir.py`

Gece/ay ışığı HDRI'ları otomatik pozlamayla gündüz gibi parlak çıkar. Araç karartır, maviye kaydırır,
doygunluğu düşürür; lamba, pencere, yıldız korunur; ay ışıklı uzun pozun geniş halesi yerine küçük keskin
ay diski çizer. Özgün dosya değişmez:

```json
"dosya": "ormanlik/pano_yaz_gece_foto_8k_gece.jpg",
"kaynakDosya": "ormanlik/pano_yaz_gece_foto_8k.jpg",
"gece": { "pozlama": -2.4, "doygunluk": 0.3, "ton": [0.6, 0.74, 1.0], "gokKarartma": 0.45, "ay": true }
```

```
python araclar/gece-derecelendir.py                 # gece alanı olan tüm kayıtlar: kaynakDosya → dosya
python araclar/gece-derecelendir.py --sec ormanlik --onizleme .plan-onizleme/gece   # özgün/sonuç yan yana
```

Başlangıç değerleri: ay ışıklı açık arazi/orman `pozlama −2,3..−2,6`, `doygunluk 0,3–0,35`, `ton
[0.6, 0.74, 1]`, `gokKarartma 0,45–0,5`, `ay: true`; yıldızlı açık gök (zaten koyu) `−1,4`, `gokKarartma 0,75`;
lambalı sokak `−1,7..−2,2`, `doygunluk 0,55–0,6`, `cekirdek 0,9` (lamba başları korunur), `isikliRenk 0,8`
(lambayla aydınlanan yüzey sıcak kalır, gölgeler maviye kayar), `gokKarartma 1`. `ay: true` ise diskin
yönü manifestteki `gunes` ile aynı olmalı (araç ayı en parlak gök bölgesinin merkezinde bulur ve konsola yazar).
