# Warp / blend ile 3 projektör (MPCDI)

Projektörler duvarlara tam dik ve kenarları çakışmadan bakmıyorsa `simple` projeksiyon
politikası yerine **MPCDI** kullanılır. Kalibrasyon yazılımı (ör. Vioso, Scalable Display,
Domeprojection) `.mpcdi` dosyası üretir; her viewport o dosyadaki bölgeye bağlanır.

`uc-duvar.ndisplay` içindeki her `projectionPolicy` bloğu şu şekle çevrilir:

```json
"projectionPolicy": {
  "type": "mpcdi",
  "parameters": {
    "file": "C:/DuvarSimulasyonu/kalibrasyon/uc-duvar.mpcdi",
    "buffer": "Ana",
    "region": "SolDuvar"
  }
}
```

- `buffer` ve `region` adları `.mpcdi` içindeki tanımlarla birebir aynı olmalıdır.
- Kenar karıştırma (edge blend) ve geometrik düzeltme (warp) dosyadan okunur; nDisplay içinde
  ayrıca ayar gerekmez.
- Müşterinin mevcut harici warp cihazı varsa (ön fizibilite raporu, Risk tablosu), nDisplay
  `simple` modda düz görüntü üretir ve warp/blend cihazda yapılır. Bu durumda projektör
  bölgeleri cihazın beklediği çözünürlükte tek geniş pencere olarak ayarlanır.
