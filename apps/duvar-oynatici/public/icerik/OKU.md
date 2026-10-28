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
  klipler/     sahneye azimutla yerleştirilen alfa klipler: patlama_yakin_1.webm, toz_1.webm,
               asker_yarali_yerde.webm, asker_siper_ates.webm ... (manifest "klipler" bölümü)
  sesler/      patlama_1.ogg, bagirma_yarali_var.ogg ...
```

Köprü bu klasörü doğrudan sunar: dosya koyup `manifest.json`'u düzenledikten sonra **derleme
gerekmez**, oynatıcı sayfasını yenilemek yeter. Sahada içerik ayrı bir diskte duracaksa köprüye
`ICERIK_KLASORU=D:\icerik` verilir (`apps/kopru/.env`).

Görüntü ve ses dosyaları (jpg/png/webp/mp4/webm/mov/ogg/mp3/wav) depoya eklenmez (`.gitignore`);
saha bilgisayarına klasör olarak kopyalanır.
İstisna: `klipler/patlama_test_1.webm` ve `klipler/asker_test_ayakta.webm` küçük **sentetik test
klipleridir** (`araclar/test-klipleri-uret.sh` ile üretilir); panelin Figürler bölümünü ve efekt
plakası yolunu gerçek içerik gelmeden denemek içindir, gerçek klipler gelince silinebilir.

Klip üretim kuralları (3 kameralı rig, U duvar): bkz. `docs/sartname-analizi-ve-yaklasim.md` §4 ve
`docs/duvar-oynatici.md`.
