# İçerik klasörü

Buraya üretilen video döngüleri ve sesler konur; `manifest.json` hangi dosyanın hangi
bölge/mevsim/zaman dilimine ait olduğunu söyler. Oynatıcı, manifestte eşleşme bulamazsa
**parametrik yer tutucu sahneyi** çizer; yani içerik gelene kadar da her şey çalışır.

```
icerik/
  manifest.json
  kirsal_acik_arazi/
    yaz_gunduz.mp4         5760x1080, 60–90 sn kusursuz döngü
    yaz_alacakaranlik.mp4
    yaz_gece.mp4
    kis_gunduz.mp4 ...
  meskun_mahal/ ormanlik/ daglik/ us_bolgesi/
  oda2/
    operasyonel_bolge_gunduz.mp4, kaya_sutre_arkasi_gece.mp4 ...
    helikopter_inis_<sahne>.webm   (alfa kanallı dizi)
  katmanlar/   yagmur.webm, kar.webm, sis.webm, patlama_1.webm ...
  sesler/      patlama_1.ogg, bagirma_yarali_var.ogg ...
```

Video dosyaları depoya eklenmez (`.gitignore`); saha bilgisayarına klasör olarak kopyalanır.

Klip üretim kuralları (3 kameralı rig, U duvar): bkz. `docs/sartname-analizi-ve-yaklasim.md` §4 ve
`docs/duvar-oynatici.md`.
