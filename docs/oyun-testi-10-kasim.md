# Oynayarak test: meskûn mahal (10 Kasım 2026)

Meskûn mahalde figürler, silah/ateş efektleri, patlama/yangın/havan/fişek, yağmur/kar/sis/şimşek ve Oda 2 helikopteri
başsız Chrome'da (GTX 1650, 3840×720, kalite yuksek) **oynatılarak** test edildi: sahne köprü API'siyle sürüldü, ~150 kare
çekilip gözle incelendi, figür kemikleri kare kare örneklenip ölçüldü. Duvarda (projeksiyonda) bakılmadı.

## Araç

`araclar/oyun-testi/` (Playwright; köprü çalışıyor olmalı, görüntüler `araclar/_goruntu/oyun/`):

| Betik | Ne yapar |
|---|---|
| `cekirdek.mjs` | Ortak çekirdek: `cek` (ekran/kırpım), `figurKutusu` (figüre yakın plan), `ornekle` (kemikleri kare kare kaydet), `cozumle` (sıçrama, ayak kayması, klibin doğal hızı, dönüş hızı, eylem zaman çizgisi), `fps` |
| `meskun-figur.mjs` | Yerleşim, bekleme, çatışmaya geçiş, patlama irkilmesi, duruş geçişleri, vurulma, sıhhiyeci/safha, koşan/yürüyen |
| `meskun-hava-efekt.mjs` | Yağmur, sağanak + şimşek, sis, kış + kar, yangın, havan, gece çatışması, fişek, Oda 2 helikopteri; her durumda fps |
| `siper-ve-yarali.mjs` | Siper alma döngüsü (açık/kapalı, eğitmen komutu korunur) ve yaralının görüş hattı; koşullu, çıkış kodu verir |
| `figur-yakin.mjs` | fov 50 yakın plan: klip dökümü, hareket kliplerinin doğal hızı, 40 sn bekleme, model başına silah–el, yandan ateş |

Ölçüt: "sıçrama" = kök hareketi düşülmüş kemik hızı (kalça > 2,5, baş > 4, el/ayak > 9 m/sn tek karede).

## Bulunan ve DÜZELTİLEN hatalar

| # | Hata (ölçüm) | Kök neden | Düzeltme |
|---|---|---|---|
| 1 | Asker vurulunca tek karede 27 cm çöküyor, 2 sn sonra 0,1 sn'de 40 cm geri fırlayıp düşüyordu (15 sıçrama) | Mixamo "Hit Reaction" **çömelik** bir klip (kalça 0,44 m); ayaktaki askere (0,93 m) uygulanıyor, sonra ayakta başlayan "Dying"e geçiliyordu | Vurulma klibi yalnız duruşa uyuyorsa (kalça farkı < %20) çalar; ayaktaki asker doğrudan düşme klibine geçer. Diz çökmüş/yatan asker düşme klibine **kalçasının o anki yüksekliğinden** girer. Sıçrama 0 |
| 2 | Her asker aynı biçimde ölüyordu | Tek düşme klibi | Ayakta 3 çeşit (Dying, Death From The Front, Standing React Death Backward), rastgele |
| 3 | Çatışma başlayınca asker 530°/sn ile olduğu yerde dönüyor; yatan asker pusula iğnesi gibi 384°/sn dönüyordu | Üstel dönüş, hız sınırı yok | Sınır: ayakta 160, diz çökmüş 110, yatan 60, kulesiz araç 30 °/sn |
| 4 | Sıhhiyeci yaralıya varınca tek karede dönüyordu (526°/sn) | Varışta `rotation.y = donus` | Yumuşak dönüş (`donusHedef`) |
| 5 | Ayak kayması ("buz pateni"): yürüyüş %35, koşu %42, çömelerek yürüyüş 2 kat | Figür hızı klibin doğal hızından bağımsızdı (Rifle Walk doğal 1,0 m/sn → 1,5 ile; Rifle Run 2,65 → 4,5; Crouch Walk 0,48 → 1,0) | `KLIP_DOGAL_HIZI` + `hareketUyumu`: klip en çok %30 hızlanır, figür tam o hızda gider (yürüyüş 1,3, koşu 3,45 m/sn). Sıhhiyeci yürüyüşü de (önceden Crouch Walk ile 1,5 m/sn: 3 kat kayma) |
| 6 | "Kalk" komutundan sonra asker ~3,5 sn kıpırdamıyor, kalkış 8+ sn sürüyordu | Mixamo "Standing Up" 11,4 sn; başı yerde kıpırtısız | `gecisAraligi`: geçiş klibinin ölü başı/sonu kırpılır, uzun kalkış 1,3× → ~4 sn |
| 7 | Namlu parıltısı ve iz, diz çökmüş/yatan askerde havada (1,35 m) çıkıyordu; dönmekte olan, tüfeği dik tutan asker de "ateş ediyordu" | Parıltı ayak konumu + sabit 1,35 m; duruşa bakılmıyordu | `atisNoktalari()`: namlu elde tutulan tüfeğin gövde merkezinden ölçülür; yalnız nişan almış ve düşmana dönmüş (≤ 25°) figür ateş eder |
| 8 | Diz çökmüş asker çatışmada tüfeği dik tutuyordu | "Rifle Kneel Idle" nişan klibi değil | Çatışmada "Idle Crouching Aiming"e geçer, bitince döner |
| 9 | Ateş klibi atış olsa da olmasa da sürekli sarsılıyordu | Klip döngüde, salvo ayrı sayaçta | Ateş klibi yalnız salvo sırasında oynar (`atisOldu`), arada nişanda bekler; salvo sayacı figür kimliğiyle |
| 10 | Ateşte ve koşarken sol el tüfeği tutmuyor, kundağın 20–27 cm altında açık duruyordu | Tüfek sağ ele sabit bağlı; Mixamo klibinde sol el başka yerde | `solEliOturt`: iki kemikli IK, sol el el kundağına (yalnız el ≤ 32 cm yakınsa; geçiş/düşmede kapalı) |
| 11 | Ateş kesilince bütün askerler izleyiciye dönüp sırtını düşmana veriyordu | Hedef `temelDonus` | Son düşman yönüne bakmayı sürdürür (`sonDusman`) |
| 12 | Bekleyen asker heykel: 40 sn'de baş 2 cm, el 0,6 cm oynuyor | "Rifle Idle" neredeyse durağan | Prosedürel nefes (göğüs ±0,9°) + hedef yokken ağır çevre kollama (baş ±20°, figür başına ayrı faz) |
| 13 | Yaralının tüfeği kabzası üstünde dik duruyordu | Yalnız yaw veriliyordu | Uzun eksen etrafında 90° yan yatar |
| 14 | Yere düşer düşmez "yardım" kolu hareketin ortasından sıçrayarak kalkıyordu (sağ el 27 cm) | Sayaç düşerken doluyordu | Sayaç yere değince kurulur (2–5 sn sonra) |

Doğrulama: `meskun-figur.mjs` yeniden çalıştırıldı, bütün adımlarda sıçrama 0; fps değişmedi (43–51, 3840×720).
Birim test: `figurHareketi.test.ts`.

## Bulunan, DÜZELTİLMEYEN (karar ya da içerik ister)

Öncelik sırasıyla:

1. ~~Askerler çatışmada açıkta, dimdik ateş ediyor.~~ **Yapıldı (10 Kasım gece): siper alma.** Çatışma başlayınca her
   asker 0,5–2,2 sn içinde karar verir: düşman yönünde 0,6–2,4 m içinde sabit engel (bariyer, kum torbası, HESCO, duvar)
   varsa çöker, 3–7 sn sonra doğrulup 3,5–6 sn ateş eder, yeniden çöker (figür başına ayrı zamanlama); açıktaysa yarısı
   diz çöküp öyle ateş eder. Siperde çökmüşken nişan almaz, ateş etmez. Çatışma bitince kendi çökenler 1,5–4 sn içinde
   kalkar. Eğitmenin verdiği duruşa karışmaz. Panel: Efektler › Çatışma › **Siper al** (`catisma.siperAl`, varsayılan
   açık; sözleşme sürümü 4). Kod: `FigurKatmani.siperiGuncelle`, `sutreArkasinda`.
2. ~~Yaralı öndeki askerin arkasında kalabiliyor.~~ **Yapıldı: görüş hattı açılır.** İzleyici ile yerdeki yaralı arasında
   duran asker yana yürür (`gorusHatlariniAc`, saniyede bir; görüş açıklığı < 1 m ise 1,4 m olacak kadar, boş olan yana;
   sıhhiyeci ve nesneler hariç). Ölçüm: açıklık 0,48 → 1,63 m. Açık kalan: `azimut` isteği mevzi noktasına yapışıyor
   (−20° istenen −43°'ye ve 3,4 m'ye düştü).
   İkisinin testi: `node araclar/oyun-testi/siper-ve-yarali.mjs` (koşul sağlanmazsa çıkış kodu 1).
3. **Oda 2 sütreleri meskûn mahalde alan nesneleriyle iç içe**: jeneratör römorku beton bariyerin, HESCO hattı nöbetçi
   kulübesinin içinden geçiyor. Oda 2 dizilimi alan planından haberdar değil (meskûn için ayrı dizilim ya da alan
   nesnelerini gizleme gerekir).
4. **Helikopter 58 m'ye iniyor**: orta duvarda ~60 piksel, rotor tozu seçilmiyor. Oda 2'nin ana olayı için küçük.
   Öneri: meskûn planında 25–30 m'de ikinci iniş noktası (meydan) ya da alçak geçiş.
5. **Kış**: yalnız zemin beyaz. Bina çatıları, bariyer üstleri, araçlar karsız; yoldaki yassı moloz parçaları kar üstünde
   koyu lekeler olarak kalıyor; askerler yazlık kamuflajla (kışlık model var: `komando_kis_*`, panel kışın onu
   önerebilir); patlama krateri karda görünmüyor; ayak izi yok.
6. **Yağmur zayıf**: hafif yağmur neredeyse görünmüyor, sağanakta çizgiler seyrek; ıslak zemin, sıçrama, su birikintisi
   yok (bilinen eksik). Kapalı havada güneş gölgesi sönünce figürler zemine "yapıştırılmış" duruyor: ayak altına
   yumuşak temas gölgesi (blob) eklenmeli.
7. **Fişek görünmüyor**: sahne aydınlanıyor ama yıldızın kendisi duvarın görüş alanının (dikey ~59°) üstünde kalıyor;
   ışığın kaynağı görünmeyince ipucu yarım. Daha uzağa/alçağa atılmalı ya da ufka yakın düşüş evresi uzatılmalı.
8. **Patlama flaşı** üç duvarı birden beyaza boğuyor (35–40 m'deki patlamada bile); mesafeyle azalmalı.
9. **Dost izli mermi** her atışta, 8+ m'lik kalın bir çizgi (yandan "lazer" gibi). Gerçekte 4–5 atışta bir iz; dost
   izleri inceltilip seyreltilmeli.
10. **Gece**: asker neredeyse görünmez siluet; namlu parıltısı askeri/çevreyi aydınlatmıyor, sokak lambası/pencere
    ışığı yok. `?gece=projeksiyon` ile birlikte duvarda bakılmalı.
11. **Sıhhiyeci** yaralının başında "Kneeling Pointing" (eliyle işaret ediyor) oynuyor; müdahale (turnike) animasyonu
    yok (bilinen; yeşil perde ya da Mixamo "Kneeling/Medic" klibi).
12. **Tepkisizlik**: 25 m arkada yangın/havan düşerken askerler sırtı dönük bekliyor (yalnız baş dönüyor, 1,1 sn
    irkilme var). Havan ıslığında çömelme/siper alma tepkisi eğitim açısından değerli olur.
13. **Koşan/yürüyen asker** izleyicinin çevresinde halka üzerinde gidiyor; 5 m yarıçapta koşan asker duvarı 3–4 sn'de
    geçip kayboluyor. Derinlemesine (caddeden izleyiciye/uzağa) hareket yok.
14. Mikro: sis 0,9'da görüntü genel olarak gri-karanlık bir perdeye dönüyor (kontrast düşük); vurulmuş figürde
    `atesPozu` bayrağı açık kalıyor (görsel etkisi yok).

## Eklenebilecekler (öneri)

- **Düşman figürü**: pencere/çatı mevzilerinde kısa görünen silüet + namlu parıltısı (şimdi yalnız parıltı/iz var).
- **Sipere taşıma**: "Carrying"/"Pull Heavy Object" klipleri GLB'de hazır; yaralıyı bariyer arkasına sürükleme adımı.
- **Şarjör değiştirme**: "Reloading" / "Prone Reloading" klipleri GLB'de var; salvolar arasında ara ara oynatılabilir.
- **El-kol işareti**: "Beckoning", "Pointing Gesture" (lider figür "buraya" işareti).
- **Ayak IK** (eğimli zeminde), ekipman sallanması, mermi kovanı parçacığı, sıcak namlu dumanı.
- **Bina hasarı**: patlama cepheye denk gelirse toz + moloz dökülmesi; pencere camı.
- **Oynayarak testi CI'ya bağlama**: `meskun-figur.mjs` sıçrama sayısı > 0 ise hata versin (şimdi yalnız rapor).

## Ölçümler

fps (3840×720, GTX 1650, başsız): boş 51, hafif yağmur 47, sağanak 46, kış kar 48, 2 yangın + toz 43, gece çatışma +
izli 48, fişek + çatışma 47, helikopter 43. Konsolda hata/uyarı yok. Gölgelendirici programı 29 → 82 (tur boyunca).
