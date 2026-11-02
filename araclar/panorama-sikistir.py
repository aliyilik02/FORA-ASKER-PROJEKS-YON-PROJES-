#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Panorama sıkıştırma: manifestteki foto panoramaları (Poly Haven 8K JPG'leri çoğu kalite 100 ve 4:4:4, 21–64 MB) JPEG
kalite 90, 4:2:0 renk örneklemesiyle aynı adla yeniden kodlar. Neden: oynatıcı panoramayı sahne geçişinde çözer; q100
4:4:4 dosyada indirme + çözme 2–3 kat uzun sürer (60,6 MB orman: çözme 1,29 sn → q90 4:2:0'da 0,63 sn, 17,2 MB). 1080p
duvarda 90° ≈ 2048 px, 8K equirect zaten 1:1; q90 4:2:0 farkı projeksiyonda görünmez (gece dosyaları zaten q≈90).

Kurallar:
  - Yalnız manifestteki `panorama[].dosya` foto panoramaları (adında `_foto_`; `--hepsi` ile tümü, ör. 3,4 MB'lık AI
    panoraması). Gece derecelendirmesinin kaynağı (`kaynakDosya`) dokunulmaz.
  - Kalitesi zaten ≤ 92 olan (kuantalama tablosundan kestirilir) ve 4:2:0 olan dosya atlanır.
  - Özgün dosya önce `icerik/_yedek_ozgun/<bolge>/` altına TAŞINIR (varsa üzerine yazılmaz), yeni dosya özgün adla yazılır.
  - Baseline (progresif değil; tarayıcıda daha hızlı çözülür), Huffman eniyilemeli; ICC profili ve EXIF korunur.
  - Önce/sonra boyut ve çözme süresi (Pillow/libjpeg-turbo, tek çekirdek, 2 denemenin en iyisi) raporlanır.

Kullanım:
  python araclar/panorama-sikistir.py                     # depo içeriği (apps/duvar-oynatici/public/icerik)
  python araclar/panorama-sikistir.py --icerik D:/icerik  # sahada ayrı içerik klasörü (ICERIK_KLASORU)
  python araclar/panorama-sikistir.py --kuru              # yalnız rapor: neler sıkıştırılacak, kalite/örnekleme
  python araclar/panorama-sikistir.py --kalite 88 --sec daglik,ormanlik

Geri almak için `_yedek_ozgun/<bolge>/<dosya>` özgün yerine kopyalanır.
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
import time
from pathlib import Path

from PIL import Image, JpegImagePlugin

KOK = Path(__file__).resolve().parent.parent
ICERIK = KOK / "apps" / "duvar-oynatici" / "public" / "icerik"
Image.MAX_IMAGE_PIXELS = None

# IJG (libjpeg) standart parlaklık kuantalama tablosu (doğal sıra); kalite kestirimi için
_STD_PARLAKLIK = [
    16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62,
    18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99,
]
_ORNEKLEME = {0: "4:4:4", 1: "4:2:2", 2: "4:2:0"}


def _ijg_tablo(kalite: int) -> list[int]:
    olcek = 5000 / kalite if kalite < 50 else 200 - 2 * kalite
    return [min(255, max(1, (q * olcek + 50) // 100)) for q in _STD_PARLAKLIK]


def kalite_kestir(img: Image.Image) -> int | None:
    """Parlaklık tablosuna en yakın IJG kalitesi (1–100). Tablo okunamazsa None. Sıra farkı (zigzag/doğal) sonucu
    değiştirmesin diye değerler sıralanarak karşılaştırılır."""
    tablolar = getattr(img, "quantization", None)
    if not tablolar or 0 not in tablolar:
        return None
    t = sorted(int(v) for v in tablolar[0])
    if len(t) != 64:
        return None
    en_iyi, en_az = None, float("inf")
    for q in range(1, 101):
        fark = sum(abs(a - b) for a, b in zip(t, sorted(_ijg_tablo(q))))
        if fark < en_az:
            en_iyi, en_az = q, fark
    return en_iyi


def ornekleme(img: Image.Image) -> str:
    try:
        return _ORNEKLEME.get(JpegImagePlugin.get_sampling(img), "?")
    except Exception:
        return "?"


def cozme_suresi(yol: Path, deneme: int = 2) -> float:
    en_iyi = float("inf")
    for _ in range(deneme):
        t = time.perf_counter()
        with Image.open(yol) as im:
            im.load()
        en_iyi = min(en_iyi, time.perf_counter() - t)
    return en_iyi


def manifest_dosyalari(icerik: Path) -> list[str]:
    m = json.loads((icerik / "manifest.json").read_text(encoding="utf-8"))
    dosyalar: list[str] = []
    for k in m.get("panorama", []):
        d = k.get("dosya", "")
        if d.lower().endswith((".jpg", ".jpeg")) and not d.startswith(("http:", "https:", "/")) and d not in dosyalar:
            dosyalar.append(d)
    return dosyalar


def mb(n: float) -> str:
    return f"{n / 1e6:.1f} MB"


def main() -> int:
    ap = argparse.ArgumentParser(description="Foto panoramaları JPEG q90 4:2:0'a yeniden kodlar (özgünler _yedek_ozgun'a)")
    ap.add_argument("--icerik", default=str(ICERIK), help="içerik klasörü (manifest.json burada)")
    ap.add_argument("--kalite", type=int, default=90)
    ap.add_argument("--esik", type=int, default=92, help="kalitesi bu değer ve altındaki 4:2:0 dosyalar atlanır")
    ap.add_argument("--sec", default="", help="dosya yolunda geçen alt dize (virgülle birden çok)")
    ap.add_argument("--kuru", action="store_true", help="dosyalara dokunma, yalnız raporla")
    ap.add_argument("--hepsi", action="store_true", help="foto olmayan panoramalar da (adında _foto_ geçmeyen)")
    a = ap.parse_args()

    icerik = Path(a.icerik)
    yedek_kok = icerik / "_yedek_ozgun"
    secim = [s for s in a.sec.split(",") if s]
    satirlar = []
    toplam_once = toplam_sonra = 0
    for goreli in manifest_dosyalari(icerik):
        if secim and not any(s in goreli for s in secim):
            continue
        if not a.hepsi and "_foto_" not in Path(goreli).name:
            continue
        yol = icerik / goreli
        if not yol.exists():
            print(f"YOK      {goreli}")
            continue
        with Image.open(yol) as im:
            q = kalite_kestir(im)
            orn = ornekleme(im)
            boyut_px = im.size
        once = yol.stat().st_size
        if q is not None and q <= a.esik and orn == "4:2:0":
            print(f"atlandı  {goreli}: q≈{q} {orn} {mb(once)}")
            continue
        if a.kuru:
            print(f"sıkışır  {goreli}: q≈{q} {orn} {mb(once)} {boyut_px[0]}×{boyut_px[1]}")
            continue
        bolge = Path(goreli).parts[0] if len(Path(goreli).parts) > 1 else "_kok"
        yedek = yedek_kok / bolge / Path(goreli).name
        yedek.parent.mkdir(parents=True, exist_ok=True)
        if yedek.exists():
            print(f"UYARI    {goreli}: yedek zaten var ({yedek}); özgün sayılır, mevcut dosya yeniden kodlanmaz")
            continue
        sure_once = cozme_suresi(yol)
        shutil.move(str(yol), str(yedek))
        try:
            with Image.open(yedek) as im:
                ek = {}
                if im.info.get("icc_profile"):
                    ek["icc_profile"] = im.info["icc_profile"]
                if im.info.get("exif"):
                    ek["exif"] = im.info["exif"]
                im.convert("RGB").save(yol, "JPEG", quality=a.kalite, subsampling=2, optimize=True, progressive=False, **ek)
        except Exception as h:
            # Yazılamadıysa özgün geri konur
            if yol.exists():
                yol.unlink()
            shutil.move(str(yedek), str(yol))
            print(f"HATA     {goreli}: {h}; özgün geri kondu")
            continue
        sonra = yol.stat().st_size
        sure_sonra = cozme_suresi(yol)
        toplam_once += once
        toplam_sonra += sonra
        satir = f"{goreli}: q≈{q} {orn} {mb(once)}, çözme {sure_once * 1000:.0f} ms → q{a.kalite} 4:2:0 {mb(sonra)}, çözme {sure_sonra * 1000:.0f} ms"
        satirlar.append(satir)
        print("sıkıştı  " + satir)
    if satirlar:
        print(f"\nToplam: {mb(toplam_once)} → {mb(toplam_sonra)} ({len(satirlar)} dosya); özgünler: {yedek_kok}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
