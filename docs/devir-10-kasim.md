# Devir notu: 10 Kasım oturumu → genel kontrol oturumu

Sonraki oturum (yeni model, Fable 5.2) **genel kontrol**: hata ayıklama + geliştirme. Bu not, 10 Kasım'da ne değiştiğini,
neyin doğrulanmadığını ve kontrolün nasıl yapılacağını tek yerde toplar. Önce `CLAUDE.md`, sonra bu not.

## Ortam (yeni makine)

- MALIYıLıK: i5-10300H, 16 GB, **GTX 1650 4 GB** + Intel UHD, ekran 1920×1080 **144 Hz**, Node 25.9, Blender 5.1.
  Yol eskisiyle aynı (`C:\Users\Mehmet Ali Yılık\duvar-simulasyonu`). Projeksiyon bilgisayarı ayrı gelecek.
- Chrome NVIDIA'da: `HKCU\Software\Microsoft\DirectX\UserGpuPreferences` → `chrome.exe = GpuPreference=2;`
  (Chrome Windows Grafik listesinde yoktu). Doğrulama: oynatıcı `kalite yuksek (otomatik)` seçer; `chrome://gpu`.
- Köprü `demo.bat` ile açılır (port 4000). Claude in Chrome / Playwright MCP eklentileri bu makinede bağlanamayabilir:
  Playwright **npm paketi** kök devDependency, araçlar onu kullanır.

## Bugün yapılanlar (commit sırasıyla)

| Commit | İş |
|---|---|
| 231c0b5 | `araclar/goruntu-al.mjs` görsel denetim; `sahne3b/normalYumusat.ts` (Meshy düz gölge) |
| f2a2f1c | Ağaçlar **ez-tree** (`sahne3b/ezAgac.ts`); lekeli çimen; dağlık zemin `tasli_zemin`; kaya yamaca oturur |
| 59ab53f | Meshy ağaçları ≥ 36 m dolgu (`dolgu()`); ez yaprak ×1,4; çalı genişlik sınırı |
| 5cfdd7f | Meskûn hızlandı: `alan.ts ALAN_DOKU_SINIRI` (ekran kartı belleği); `araclar/model-sadelestir-izinli.mjs` (28 model 7,8 M → 1,3 M üçgen); `model-pisir.py` yumuşak gölge + `--voksel-yok` |
| (bu commit) | Ölçüm betikleri `araclar/olcum/`, bu devir notu |

Ayrıntı: `docs/duvar-oynatici.md` son üç bölüm ("Gerçekçilik turu", "Dolgu ve yoğunluk" paragrafı, "Meskûn cadde performansı").

## Ölçümler (bugün)

1920×360, GTX 1650, kalite yuksek, ayrı uygulama penceresi (`araclar/olcum/fps-tur.cjs`):

| Bölge | boş / 4 asker + çatışma |
|---|---|
| Orman yaz | 62 / 58 (en ağır sahne) |
| Orman kış | 64 / 60 |
| Meskûn yaz | 86 / 80 (sabah 57 / 55) |
| Kırsal yaz | 116 / 110 |
| Dağlık, kırsal kış, üs | ~143 (144 Hz tavanı) |

5760×1080 tam yük (sabah, ağaç/meskûn düzeltmelerinden **önce**; `araclar/olcum/fps-tam.cjs`): meskûn 13–14, diğerleri
19–29. Projeksiyon PC önerisi: oda başına RTX 5070 Ti / 4070 Ti Super 16 GB (asgari 5070 / 4070 12 GB).
**Yeni değişikliklerle 5760×1080 yeniden ölçülmedi.**

## Doğrulanmadı / risk (kontrol listesi)

Kod ve içerik:
1. **Duvarda gözle hiç bakılmadı**: ez-tree ormanı (yaz/kış), kavak sırası, Meshy dolgu geçişi (36 m), 40 m'de yakın →
   uzak kopya geçişinde "pop" (uzak kopya dal kesitini azaltınca dal biçimi de az değişir), rüzgârda yaprak.
2. **Gece**: ez-tree yaprakları gece/alacakaranlıkta ve aydınlatma fişeğinde hiç çekilmedi (`goruntu-al --sahneler
   "ormanlik:yaz:23"`). Gece projeksiyon modu (`?gece=projeksiyon`) ile birlikte.
3. **Krater + ağaç**: patlamada ez ağaçları (sınıf `agac`) krater zeminine iniyor mu; kraterde savrulan çalı (ez çalılar).
4. **Kar**: ez iğne yapraklılarda kar `bitkiKar` gölgelendiricisiyle (taç küresi normalinde üstler beyaz) — kış ormanı
   başsız çekimde iyiydi; sonbahar (0,15) ve kar → yaz geçişi bakılmadı.
5. **Gölge önbellek anahtarı**: `bitkiMalzemesi` artık modelin kendi `customProgramCacheKey`'ini ekliyor
   (`oncekiAnahtar`). Bölge değişiminde gölgelendirici derleme sayısı/takılma ölçülmedi.
6. **`dokulariSinirla`** (alan.ts) birim testi yok (DOM/canvas ister). Yan etki: ImageBitmap `close()` ediliyor —
   aynı doku başka bir glTF'de paylaşılmaz (her dosya ayrı yüklenir), ama kontrol edilmeli. Kalite değişince
   (`?kalite=`) sayfa yeniden açılıyor mu, yoksa önbellekteki küçültülmüş doku mu kalıyor.
7. **npm**: ez-tree ilk kurulumda `--legacy-peer-deps` gerektirdi (npm çalışma alanında `three@undefined` görüyor);
   düz `npm install` sonra geçti. **Temiz kurulum** (`rm -rf node_modules && npm install`, `geri-yukle.bat`) denenmedi.
8. meshoptimizer 0.22 → 1.1.1 (kök). `model-sadelestir.mjs` tek modelde denendi; `alan-modelleri-hazirla.mjs` ve
   `arazi-sadelestir.mjs` toplu çalıştırılmadı.
9. **Depo dışı içerik değişti**: `icerik/modeller/alan/` içindeki 28 model yeniden üretildi (yedek
   `meshy_output/alan_yedek_10kasim/`). Projeksiyon PC'ye `icerik/` kopyalanırken bu sürüm gitmeli.
10. Kırsalda 1–2 ağaç sarımsı (ez "aspen"/"ash" dokusu); belki kabul edilebilir ton farkı.

Eski açıklar (CLAUDE.md "Sıradaki işler" ve `docs/degerlendirme-8-kasim.md`): Esc Esc / ⇧0 sıfırlama, geçiş sırasında
sıfırlama, "Gösterim – Güncel Durum" ve "Test – Figür Davranışları" senaryoları duvarda, yerleşim planlarının 10'u.

## Kontrol yöntemi (araçlar)

```
npm run typecheck && npm test && npm run build          # temel; şu an 50+15 test dosyası, hepsi geçiyor
node araclar/goruntu-al.mjs --sahneler "ormanlik:yaz:12,ormanlik:kis:12,kirsal_acik_arazi:yaz:12,daglik:yaz:12,meskun_mahal:yaz:12,us_bolgesi:yaz:12"
node araclar/goruntu-al.mjs --bolge ormanlik --fov 30    # yakın plan; PNG araclar/_goruntu/, Read ile bak
node araclar/olcum/profil.mjs meskun_mahal 1920           # kare kırılımı (gölge / alan / arazi / doku denemesi)
node araclar/olcum/fps-tur.cjs "ormanlik:yaz" "1920×360 · kalite yuksek ·"   # ayrı uygulama penceresiyle (dosya başı)
```

Dikkat: `goruntu-al` ve `profil` köprüdeki bölgeyi değiştirir (açık bütün oynatıcılar da geçer); fps ölçümüyle aynı
anda çalıştırma. Derlemeden sonra köprü `dist`'i doğrudan sunar (yeniden başlatma gerekmez), ama açık oynatıcı
sayfası yenilenmeli. Köprü kodu değişirse port 4000'deki süreci durdurup `npm start`.

## Sıradaki geliştirme adayları

- Orman fps: uzak ağaçlarda sahte ağaç (impostor) ya da yaprak kartı alfa-kapsama; ölçüm darboğazın yaprak kartı
  aşırı çizimi olduğunu gösterdi (kabuk üçgenini yarıya indirmek fps'i değiştirmedi).
- GPU doku sıkıştırması (KTX2/Basis): ekran kartı belleği 4–6 kat azalır; `toktx` (KTX-Software) gerekir.
- 5760×1080 tam yük ölçümünü yeni sürümle yinele (`fps-tam.cjs`), donanım önerisini güncelle.
