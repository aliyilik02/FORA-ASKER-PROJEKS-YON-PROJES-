---
name: askeri-simulasyon-tasarimi
description: Use when evaluating, designing or reviewing any feature of the duvar-simulasyonu project (wall projection training simulator) from a game-developer and military-training perspective - new effects, sounds, figure behaviour, scenario steps, instructor panel controls, night/weather scenes, helicopter or tracer realism, or when asked "gerçekçi mi", "oyun geliştirici gözüyle", "eğitim değeri", TCCC/TMYB accuracy.
---

# Askeri Simülasyon Tasarımı (oyun geliştirici + eğitim bilinci)

## Temel ilke

**Psikolojik sadakat > fiziksel sadakat.** Eğitim transferi, öğrencinin sahada yaşayacağı zihinsel süreçleri (karar baskısı,
tehdit algısı, öncelik sırası) yaşamasıyla olur; piksel gerçekçiliği ancak buna hizmet ettiği kadar değerlidir. Her efekt /
ses / figür davranışı için önce sor: **Hangi eğitim hedefini tetikliyor? Öğrenci ne yapmalı?** Cevap yoksa süs eşyasıdır.

## TCCC / TMYB gerçekleri (senaryo ve efekt doğruluğu için)

| Safha (TR adı) | Ne yapılır | Ne YAPILMAZ |
|---|---|---|
| Ateş Altında Bakım (CUF) | Ateşe karşılık ver, sipere gir, yaralı muharip kalır; yaralı sipere taşınır; yalnız uzuv kanamasına turnike ("yüksek ve sıkı", yara yeri belirsizse mümkün olduğunca proksimal) | Hava yolu, göğüs, damar yolu, muayene; ateş sürerken açıkta müdahale |
| Taktik Saha Bakımı (TFC) | MARCH: **M**asif kanama → **A**irway → **R**espiration (tansiyon pnömotoraks, göğüs mührü, iğne dekompresyon) → **C**irculation (damar yolu, TXA, kan) → **H**ipotermi/kafa | Siper dışında uzun kalma |
| Taktik Tahliye (TACEVAC) | 9-line MEDEVAC; LZ işareti (ters Y, uzun ekseni rüzgâra), duman rengi telsizde söylenmez, pilot görüp sorar, yer teyit eder | Düşmanın taklit edebileceği işaret |

- Önlenebilir ölümlerin %90'ından fazlası kanama; ölümcül kanama yeri gövde %67, kavşak (kasık/koltuk altı) %19, uzuv %13,5
  (Eastridge 2012). Uzuv kanaması turnikeyle önlenebilir ölüm %7,8 → %2,6 düştü.
- Türkiye'de beş seviye: 1 tüm personel 4–7 saat; 2 Muharebe Cankurtaranı 48–72 saat; 3 Muharip Sıhhiye ~13 hafta.
  Türkçe terimler: turnike, göğüs mührü, yaralı toplama noktası, tahliye, sıhhiyeci.
- Senaryo tasarımı: **crawl–walk–run**; her "lane"in tek, ölçülebilir eğitim hedefi olur; stresörler (bağırma, atış, kesinti)
  eğitmenin anlık kontrolünde ve kademeli artar; stres altında %90 işitsel dışlama, tünel görüşü yaygındır → kritik ipuçları
  **hem görsel hem işitsel**, tekrar eden ve yönlü verilmeli.

### Ateş Altında Bakım (CUF) için duvar ipuçları
1. **Telegraf:** uzak namlu parıltısı ve toz kalkışı, sonra yakın "çat" → öğrenciye sipere girme penceresi.
2. **Yönlü, sürekli, hem görsel hem işitsel tehdit:** izli mermiler ve çat tek düşman yönünden; çarpma tozu sütre üstünde (örtü işe yarıyor).
3. **Yaralı görünür ve sesli:** yerde, kol kaldırır, Türkçe yardım çağrısı; yara uzuvda belirgin (turnike ipucu); gövde/hava yolu ipucu bu safhada yok.
4. **Yoğunluk dalgası:** ateş şiddeti eğitmen elinde iner çıkar; sakin pencere "şimdi taşı" kararını tetikler.
5. **Sonuç geri bildirimi:** açıkta kalan figür/sıhhiyeci ateş altında vurulur; sipere taşıma sonrası ateş sütreye çarpar, yaralıya değmez.

## Fiziksel ipuçlarının kuralları (ses ve ışık)

- **Crack–thump:** süpersonik mermi önce "çat" (geçtikten sonra duyulur), namlu sesi 340 m/s ile gecikir; her 1 sn fark ≈ 300 m.
  300 m içindeyse ikisi hemen hemen aynı anda. Yakın geçen iz: çat + sonra uzak "tump". Uzak çatışma: çat yok, yalnız yumuşamış tump.
- Süpersonik/subsonik: tüfek mermisi (5,56/7,62, ~800–900 m/s) 600–800 m'ye kadar süpersonik → "çat" var; tabanca ve susturuculu
  subsonik mermide "çat" yok. Alçak geçiren kesim kabaca 300 m → 6 kHz, 1 km → 2 kHz, 2 km+ → 800 Hz (kulakla ince ayar).
- **Flash-to-bang:** patlama ışığı anında, sesi 3 sn/km gecikir; uzak patlamada önce flaş ve toz, sonra bas ağırlıklı gümbürtü.
- **Mesafe:** her mesafe ikiye katlanışında ~6 dB düşüş + yüksek frekans kaybı (alçak geçiren filtre) + yankı kuyruğu uzar;
  silah sesi katmanları: mekanik, bas, yakın ayrıntı, uzak ayrıntı, kuyruk; katmanlar mesafeyle ayrı ayrı kısılır.
- **Tekrar yok:** aynı ses/efekt art arda aynı gelmez; ≥ 4–6 varyant, ±%5 perde, küçük zaman sapması.
- **Helikopter:** rüzgâra karşı iner, kızak öncesi flare; toz ("brownout") rotor yarıçapının 2–3 katında yoğun, zemine göre
  (toprak/kar/beton) değişir; rotor sesi konumlu ve Doppler'li; hot LZ'de kısa yerde kalış.
- **Aydınlatma fişeği:** 40 mm 20–35 sn, ~70 bin kandela, paraşütle ~2,5 m/s iniş, salınımlı sert gölge; gece ışığı: dolunay
  0,05–0,3 lux, mavimsi, düşük kontrast. **Projektör siyahı yansıtamaz**: gece sahnesi fiziksel doğrudan daha açık tasarlanır,
  oda karartılır, duvar rengi koyu.

## Projeksiyon odası (CAVE) kuralları

- Perspektif izleyici göz noktasından; ölçüsüz odada 90°/duvar varsayımı. Tatlı noktadan uzaklaşan izleyici köşelerde bükülme görür;
  **kritik nesneler köşelere konmaz**, ufuk göz hizasında.
- Komşu projektörler ~%15 bindirme + kenar karartma; parlaklık uyumu ölçülür.
- **Kamera sallanmaz:** izleyici hareketi kontrol etmediğinde dünya sarsıntısı vection/bulantı yapar. "Sarsıntı" nesneye,
  ışığa, toza, kısa flaşa verilir; kamera sabit kalır.
- Gecikme: komut → duvar < 100 ms hissedilmez; ses–görüntü senkronu ± 40 ms. Saniyede 3'ten sık flaş ışığa duyarlılık riski.

## Oyun hissi (juice) – eğitim bağlamında

Her efektin üç evresi: **telegraf** (ıslık, uzak flaş, toz kalkışı) → **temas** (flaş, basınç, ses) → **artık** (duman, krater,
yangın, çınlama). Telegraf eğitim için en değerlisidir: öğrenciye tepki penceresi verir. Nesne havuzu, parçacık tavanı,
idempotent temizlik (sıfırlama/duraklat/geçişte sızıntı yok), düşük kalitede aynı anlamı taşıyan sade sürüm.

## İnandırıcı figür

Yüzden çok **davranış** sayılır (uncanny valley yüzde başlar, davranışta affedilmez): idle varyasyonu, bakış/baş yönelimi
(tehdide ve yaralıya bakma), üst/alt gövde katmanlama (yürürken nişan), ayak IK, tepki animasyonları (yakın patlamada çömelme),
ekipman sallanması, grup davranışı (birlik aynı anda değil kademeli hareket eder), ses–animasyon senkronu (bağırma ağız/kol ile).

## Değerlendirme kontrol listesi

Bir özellik önerir ya da incelerken şunları yaz: tetikleyici · sahip/sorumlu katman · süre · eğitim anlamı · duvar mesafesinden
siluet (6 m genişlik, 4–5 m uzaktan okunur mu) · renk hiyerarşisi (tehdit sıcak, güvenli alan soğuk) · üretim tavanı · temizlik
kuralı · düşük kalite eşdeğeri · ses eşi · panelde eğitmen kontrolü (şiddet, yön, zamanlama) · AAR için günlüğe ne düşer.

## Sık hatalar

- Sesin görüntüyle aynı anda gelmesi (uzaklık hissi ölür) · kamera sarsıntısı · gece sahnesinin fiziksel doğru ama duvarda gri
  çamur olması · aynı patlama sesinin tekrarı · figürün tehdide bakmaması · eğitmene şiddet/zamanlama kontrolü vermemek ·
  CUF'ta sıhhiyecinin açıkta müdahale etmesi · duman renginin telsizle "söylenmesi" · efektin eğitim hedefi olmadan eklenmesi.

Kaynaklar ve ayrıntı: `kaynaklar.md` (aynı klasör).
