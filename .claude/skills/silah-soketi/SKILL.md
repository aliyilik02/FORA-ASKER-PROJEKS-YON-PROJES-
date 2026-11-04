---
name: silah-soketi
description: Elde taşınan silahın (tüfek, tabanca) iskelet kemiğine konum/dönüşünü ölçerek bulur; yeni tüfek modeli, yeni rig ya da "silah ele oturmuyor" şikâyetinde kullan. Deneme-yanılma yapma.
---

# Silah soketi (weapon socket) ölçümü

Tüfeğin eldeki konumu/dönüşü **ölçülür**, ekran görüntüsüne bakarak tahmin edilmez. Her yeni tüfek modeli ya da yeni
iskelet (Meshy web rig = "mixamorig:*", Meshy API rig = öneksiz) için bir kez ölçülür, o rig'in bütün manifest
kayıtlarına yazılır.

## Adımlar

1. Köprü ve oynatıcı açık olsun (`npm start`, `/oynatici/?hud=0&kalite=dusuk`). Figürü sahneye koy: silahlı bir kayıt
   (ör. `komando_bere_bekleyen`), tercihen `serbestYerlesim` ile yakın mesafe:
   `POST /api/figur {"islem":"oynat","id":"h1","klip":"komando_bere_bekleyen","azimut":0,"yukseklik":-5,"olcek":1,"dongu":true}`
   Açılışta bağlantıyla gelen figür bazen yüklenmez; `window.duvar.sahne3b.figurAktifBul("h1")` boşsa komutu yeniden gönder.
2. Tarayıcı konsolunda (ya da Playwright `browser_evaluate` ile):
   `await window.duvar.silahHizala("h1", ["Rifle Idle","Rifle Walk","Firing Rifle","Rifle Aiming Idle","Rifle Kneel Idle","Rifle Crouch Walk"], 0.95)`
   Son parametre silah boyu (m, manifest `silahModeli.boy`).
3. Çıktıyı oku:
   - `tufek`: eksen / namlu ucu işareti / yukarı ekseni. Yukarı "+" ve namlu modeldeki ince uç olmalı; tersse model
     geometrisi alışılmadık demektir (`sahne3b/silahHizalama.ts` `tufekGeometrisi`).
   - `ornekler[].sapma`: klip başına ortalama doğrultudan sapma. ≤ 12° normal. Bir klipte > 25° → o klibin el aktarımı
     bozuk (rig/aktarım sorunu; silah ayarıyla çözülmez).
   - `konum`, `donus`: manifest `silahModeli.konum` (metre) ve `silahModeli.donus` (derece, three.js Euler XYZ).
4. Aynı rig'i kullanan bütün kayıtlara yaz (`kemik` adı aynı olanlar). Görsel doğrulama: bekleyen (göğüs önünde taşıma),
   nişan (dürbün gözde, namlu izleyiciye), yürüyen (yana dönük, namlu ileri-aşağı).

## Bilinen değerler (tufek_piyade.glb, 0,95 m)

| Rig | kemik | konum | donus |
|---|---|---|---|
| Meshy API (24 kemik) | RightHand | [0.114, 0.187, -0.111] | [156.4, -27.4, 72.9] |
| Meshy web (65 kemik) | mixamorig:RightHand | [0.096, 0.164, -0.144] | [155.6, -45.9, 74.7] |

## Yöntem (neden işe yarıyor)

Mixamo tüfek kliplerinde sağ el tutamakta, sol el kundaktadır; sağ elden sol ele vektör namlu doğrultusudur ve bu
doğrultu sağ el kemiğinin yerel uzayında klipten klibe neredeyse sabittir. Tüfeğin kendi ekseni ve "aşağı"sı modelin
geometrisinden (en uzun kenar, dar uç = namlu, en büyük çıkıntı = şarjör) çıkar; kavrama noktası şarjörün gerisindeki
tutamaktır. Avuç = bilek + 7 cm. Böylece soket kemik uzayında tek seferde hesaplanır.

## Yapma

- Euler açılarını ekran görüntüsüne göre tahmin edip döngüye girme (3 Kasım'da 10 tur sürdü, yine yanlıştı).
- Kemik eksenlerini "Mixamo'da +Y parmak yönüdür" gibi varsayımlarla çözmeye çalışma; ölç.
