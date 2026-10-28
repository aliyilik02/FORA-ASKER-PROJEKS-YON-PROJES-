#!/bin/sh
# Alfa kanallı TEST klipleri (VP9 alpha WebM) – klip katmanını gerçek içerik gelmeden denemek için.
# Sentetik çizimlerdir; gerçek VFX plakaları ve yeşil perde asker çekimleri aynı biçimde
# (VP9 alpha WebM, yuva420p) üretilip manifest.json'daki "klipler" bölümüne yazılır.
# Kullanım: sh araclar/test-klipleri-uret.sh apps/duvar-oynatici/public/icerik/klipler
set -e
OUT="${1:-apps/duvar-oynatici/public/icerik/klipler}"
mkdir -p "$OUT"

# 1) Patlama benzeri: büyüyüp sönen turuncu küre (1.4 sn, 30 fps). Yarıçap kareye sığacak şekilde sınırlı.
ffmpeg -y -hide_banner -loglevel error -f lavfi -i "color=c=black@0.0:s=512x512:r=30:d=1.4,format=rgba" \
  -vf "geq=r='if(lt(hypot(X-256,Y-330-N*2),min(40+N*14,236)),255,90)':g='if(lt(hypot(X-256,Y-330-N*2),min(40+N*14,236)),clip(230-N*7,40,230),80)':b='if(lt(hypot(X-256,Y-330-N*2),min(40+N*14,236)),30,70)':a='clip(255*(1-hypot(X-256,Y-330-N*2)/min(40+N*14,236))*(1.15-N/40)*1.6,0,255)'" \
  -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 1500k -auto-alt-ref 0 "$OUT/patlama_test_1.webm"

# 2) Figür yer tutucu: koyu yeşil siluet (baş + gövde + bacaklar), hafif salınımlı, 4 sn döngü
ffmpeg -y -hide_banner -loglevel error -f lavfi -i "color=c=black@0.0:s=256x512:r=25:d=4,format=rgba" \
  -vf "geq=r='40':g='62':b='38':a='255*max(lt(hypot(X-128-4*sin(N/12),Y-70),34), max(between(X,96+4*sin(N/12),160+4*sin(N/12))*between(Y,104,300), max(between(X,100,124)*between(Y,300,470), between(X,132,156)*between(Y,300,470))))'" \
  -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 600k -auto-alt-ref 0 "$OUT/asker_test_ayakta.webm"

echo "üretildi: $OUT/patlama_test_1.webm, $OUT/asker_test_ayakta.webm"
