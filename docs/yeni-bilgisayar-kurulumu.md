# Devir notu: yeni bilgisayara kurulum (9 Kasım 2026)

Eski dizüstü (GTX 1650 + Iris Xe) yetmediği için proje yeni bilgisayara taşınıyor. Bu not, yeni makinede
oturan kişinin (ya da yeni Claude Code oturumunun) sıfırdan çalışır duruma gelmesi için gereken her şeyi
tek yerde toplar. Projenin kendisi için önce `CLAUDE.md`, sonra `docs/` okunur.

## Kod nereden çekilir

- Depo: <https://github.com/aliyilik02/FORA-ASKER-PROJEKS-YON-PROJES->
- Çalışma dalı: **`claude/festive-mayer-278or1`** (taslak PR #1; `main` geride kalıyor, ona geçme)
- Son commit taşıma anında: bu belgeyi ekleyen commit (öncesi `6262dd8`)
- GitHub'a ulaşılamazsa: USB'deki `depo.bundle` bütün dalları içerir (`git clone -b claude/festive-mayer-278or1 depo.bundle`)

```
git clone https://github.com/aliyilik02/FORA-ASKER-PROJEKS-YON-PROJES-.git duvar-simulasyonu
cd duvar-simulasyonu
git checkout claude/festive-mayer-278or1
```

## Depoda olmayanlar (USB `D:\duvar-tasima`)

Medya ve kayıtlar `.gitignore`'da; kod tek başına boş sahne açar. USB'deki `geri-yukle.bat` bunları yerine koyar:

| USB'de | Yeni makinede yeri | Not |
|---|---|---|
| `icerik\` (2,3 GB) | `apps\duvar-oynatici\public\icerik\` | **Şart**: panoramalar, Meshy modelleri, arazi, sesler |
| `kopru-veri\` | `apps\kopru\veri\` | **Şart**: eğitmen senaryoları, son durum, tatbikat günlükleri |
| `meshy_output\` (7,9 GB) | `meshy_output\` | Ham Meshy arşivi; yalnız yeniden işleme için |
| `mixamo_icin\` | `%USERPROFILE%\Downloads\mixamo_icin\` | Mixamo aktarımı (`araclar/mixamo-aktar.py`) |
| `proje-agents\`, `tasarim-taslak\`, `proje-settings.local.json` | `.agents\`, `tasarim-taslak\`, `.claude\settings.local.json` | Küçük yardımcılar |
| `claude-hafiza\` | `%USERPROFILE%\.claude\projects\<yoldan-türeyen-ad>\memory\` | Claude'un proje hafızası; ad proje yolundan türer, betik hesaplar |
| `claude-skills\`, `ev-memory\`, `ev-CLAUDE.md` | `%USERPROFILE%\.claude\skills\`, `%USERPROFILE%\memory\`, `%USERPROFILE%\CLAUDE.md` | Kullanıcı düzeyi skill'ler ve oturum hafızası |

USB'ye **konmayanlar** (bilerek):
- Meshy API anahtarı (`%USERPROFILE%\.config\meshy\credentials.json`): yeni makinede Meshy CLI'ye yeniden giriş yapılır.
- GitHub girişi: `gh auth login` ile yeniden.
- `node_modules`, `dist`, `.claude\worktrees`: `npm install` / `npm run build` yeniden üretir.

## Adım adım

1. Kur: **Git**, **Node 24**, **Chrome**. İsteğe bağlı: Python 3.12 (`pip install pillow numpy`), Blender 5.1
   (model pişirme/aktarım betikleri), GitHub CLI (`gh`), Claude Code.
2. USB'deki `duvar-tasima` klasörünü masaüstüne kopyala (USB'den çalıştırmak yavaş).
3. `geri-yukle.bat`'a çift tıkla. Varsayılan yer `C:\Users\<ad>\duvar-simulasyonu`; başka yer için
   `geri-yukle.bat -Proje "D:\isler\duvar-simulasyonu"`, ham Meshy arşivi olmadan `-MeshyHaric`.
   Betik: bundle'dan klonlar → origin'i GitHub'a ayarlar ve günceller → içeriği ve hafızayı yerleştirir →
   `npm install`, `typecheck`, `test`, `build`.
4. `demo.bat` → panel `http://localhost:4000`, oynatıcı `/oynatici/?hud=1`. Panelden birkaç bölgeye geç:
   panorama ve 3B modeller (meskûn cadde, orman ağaçları) gelmeli. Gelmiyorsa `icerik\` yanlış yerdedir.
5. Claude Code'u proje klasöründe aç. İlk iş olarak şunu yazmak yeterli:
   > Yeni bilgisayara geçtik, `docs/yeni-bilgisayar-kurulumu.md`'yi oku, kurulumu doğrula ve kaldığımız yerden devam edelim.

## Yeni makinede ilk yapılacaklar

1. **Ekran kartını öğren, gerçek fps'i ölç.** Bütün eski ölçümler Iris Xe içindi (`CLAUDE.md` "Performans",
   "Stabilizasyon"). Oynatıcıda `?kalite=` otomatik seçim Intel entegre → orta, diğerleri → yuksek
   (`src/kaliteSecimi.ts`); güçlü kartta yuksek varsayılanın yettiğini, gerekirse yeni bir kademe gerekip
   gerekmediğini ölç. Ölçüm tuzağı: arka plandaki Chrome sekmesi kareyi kısar; HUD'a normal pencerede bak.
2. **`CLAUDE.md` "Sıradaki işler" madde 00:** 3B alanlar (meskûn cadde, 3B orman yaz/kış, dağ yarları, kırsal kavak
   sırası) duvarda gözle ve gerçek fps ile hiç bakılmadı; eski makine bunu kaldıramıyordu.
3. Yol farklıysa: hafızadaki notlar eski yolları (`C:\Users\Mehmet Ali Yılık\...`) anar; komut çalıştırmadan önce yeni
   yola göre düşün.

## Bilinen tuzaklar (yeni makinede de geçerli)

- Derlemeden sonra eski köprü süreci çalışıyorsa panel "İşlem başarısız" / sözleşme şeridi verir: port 4000'i dinleyen
  süreci durdur, `npm start` ile yeniden başlat.
- Windows `.bat` dosyalarında `if (...)` blokları içinde parantez kullanma (`CLAUDE.md` Kodlama kuralları).
- Meshy topluluk indirmesi yalnız sitedeki İndir düğmesiyle; hızlı ardışık istek IP'yi 403'e düşürür.
- Bulut oturumu da aynı dalda çalışıyor: oturuma `git pull` ile başla, bitirince commit + push.
