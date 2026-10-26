#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Gece panoraması derecelendirme ("day for night"): Poly Haven'ın gece/ay ışığı HDRI'ları otomatik pozlamayla
ton eşlendiğinde gündüz gibi parlak görünüyor (ay ışığında uzun poz, lambalarla yıkanmış sokak). Bu araç
manifestte `gece` alanı olan panoramaları karartır, maviye kaydırır, doygunluğu düşürür; lamba, pencere,
ay ve yıldız gibi küçük parlak ışık kaynaklarını korur. Çıktı ayrı bir dosyadır, özgün dosya değişmez.

Manifest kaydı (panorama):
  "dosya": "ormanlik/pano_yaz_gece_foto_8k_gece.jpg",     ← oynatıcının kullandığı (derecelendirilmiş)
  "kaynakDosya": "ormanlik/pano_yaz_gece_foto_8k.jpg",     ← özgün ton eşlenmiş JPG
  "gece": {"pozlama": -2.6, "doygunluk": 0.35, "ton": [0.6, 0.74, 1.0], "gokKarartma": 0.5, "vurgu": 0.8}
    pozlama      EV (negatif = karanlık); ay ışıklı uzun pozda -2.3..-3, lambalı sokakta -1..-1.6
    doygunluk    0..1 (gece renkler solar); lambalı sokakta 0,7 civarı
    ton          RGB çarpanı (parlaklığı korunacak biçimde normalize edilir); ay ışığı mavimsi
    gokKarartma  ufkun üstündeki parlak gökyüzüne ek çarpan (1 = yok); gündüz gibi mavi gökte 0,4–0,6
    vurgu        bu sRGB eşiğinin üstündeki küçük parlak noktalar (yıldız, uzak lamba, pencere) korunur (0..1)
    vurguKazanc  korunan alanların parlaklık çarpanı (varsayılan 0,95)
    cekirdek     doymuş küçük lekelerin (lamba başı) ne kadar korunacağı 0..1; lambalı sokakta 0,9. Ay ışıklı
                 uzun pozda 0 (ayın parlama halesi gökyüzünün onlarca derecesini kaplar, korunursa leke olur)
    isikliRenk   0..1: özgünde parlak (lambayla aydınlanmış) yüzeyler sıcak rengini ve doygunluğunu korur,
                 yalnız gölgeler maviye kayar; lambalı sokakta 0,7–0,8, ay ışığında 0
    ay           true: uzun pozun ay halesinin yerine (en parlak gök bölgesinin merkezi) küçük, keskin bir ay
                 diski ve hafif hale çizer; {"azimut": .., "yukseklik": .., "yaricap": 0.35, "hale": 4} elle konum

Kullanım:
  python araclar/gece-derecelendir.py                      # `gece` alanı olan tüm kayıtlar (kaynakDosya → dosya)
  python araclar/gece-derecelendir.py --sec ormanlik --onizleme C:/tmp/gece   # yan yana önizleme de yaz
  python araclar/gece-derecelendir.py --kayit ormanlik/pano_yaz_gece_foto_8k.jpg --parametre '{"pozlama":-2.6}' --cikti C:/tmp/deneme.jpg
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

KOK = Path(__file__).resolve().parent.parent
MANIFEST = KOK / "apps" / "duvar-oynatici" / "public" / "icerik" / "manifest.json"
Image.MAX_IMAGE_PIXELS = None

VARSAYILAN = {"pozlama": -2.2, "doygunluk": 0.4, "ton": [0.62, 0.75, 1.0], "gokKarartma": 0.5, "vurgu": 0.82, "vurguKazanc": 0.95, "cekirdek": 0.0, "ay": False}
LUM = np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)


def srgb_dogrusal_tablo() -> np.ndarray:
    c = np.arange(256, dtype=np.float32) / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4).astype(np.float32)


def dogrusal_srgb(x: np.ndarray) -> np.ndarray:
    x = np.clip(x, 0.0, 1.0)
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1 / 2.4) - 0.055)


def yumusak(a: float, b: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def yon(az_der: np.ndarray, el_der: np.ndarray):
    az = np.radians(az_der)
    el = np.radians(el_der)
    return np.cos(el) * np.sin(az), np.sin(el), np.cos(el) * np.cos(az)


def ay_bul(kucuk_l: Image.Image):
    """Uzun pozdaki ay halesinin merkezi: ufkun üstünde parlaklığın 4. kuvvetiyle ağırlıklı yön ortalaması."""
    l = np.asarray(kucuk_l, dtype=np.float32)
    h, w = l.shape
    el = (0.5 - (np.arange(h) + 0.5) / h) * 180.0
    az = (np.arange(w) + 0.5) / w * 360.0 - 180.0
    AZ, EL = np.meshgrid(az, el)
    ag = np.clip(l - 200.0, 0, None) ** 4 * (EL > 1.0) * np.cos(np.radians(EL))
    if ag.sum() <= 0:
        return None
    x, y, z = yon(AZ, EL)
    vx, vy, vz = (x * ag).sum(), (y * ag).sum(), (z * ag).sum()
    n = math.sqrt(vx * vx + vy * vy + vz * vz)
    return {"azimut": math.degrees(math.atan2(vx, vz)), "yukseklik": math.degrees(math.asin(max(-1.0, min(1.0, vy / n))))}


def derecelendir(img: Image.Image, p: dict, satir_blok: int = 256) -> Image.Image:
    p = {**VARSAYILAN, **p}
    a = np.asarray(img.convert("RGB"))
    H, W = a.shape[:2]
    tablo = srgb_dogrusal_tablo()
    ton = np.array(p["ton"], dtype=np.float32)
    ton = ton / max(1e-6, float((ton * LUM).sum()))  # parlaklığı korur, yalnız renk kaydırır
    kazanc = 2.0 ** float(p["pozlama"])
    # Yerel başvuru parlaklığı: küçük kopyanın ortanca süzgeci. Yıldız/lamba/pencere çevresinden belirgin parlaktır;
    # ağaç-gök sınırındaki gök pikseli değildir (ortanca kenarı korur, kutu bulanıklığı korumaz → hale olurdu).
    k = 8
    kucuk_l = img.convert("L").resize((max(1, W // k), max(1, H // k)), Image.BOX)
    yerel = np.asarray(kucuk_l.filter(ImageFilter.MedianFilter(9)).resize((W, H), Image.BILINEAR), dtype=np.float32) / 255.0
    # Doymuş çekirdek maskesi küçük kopyadan (yumuşak kenar, JPEG gürültüsü benek yapmaz); geniş çevredeki doymuş
    # payı büyükse (bulut, karlı meydan, ay halesi) korunmaz
    cekirdek_maske = None
    if float(p["cekirdek"]) > 0:
        doymus = kucuk_l.point(lambda v: 255 if v >= 236 else 0)
        pay = np.asarray(doymus.filter(ImageFilter.BoxBlur(48)), dtype=np.float32) / 255.0
        cek = np.asarray(kucuk_l.filter(ImageFilter.GaussianBlur(1.2)), dtype=np.float32) / 255.0
        m = yumusak(0.88, 0.98, cek) * (1.0 - yumusak(0.2, 0.5, pay)) * float(p["cekirdek"])
        cekirdek_maske = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).resize((W, H), Image.BILINEAR), dtype=np.float32) / 255.0
    # Yapay ay: uzun pozun geniş halesi yerine küçük keskin disk + hafif hale (doğrusal uzayda eklenir)
    ay = None
    if p.get("ay"):
        ay = dict(p["ay"]) if isinstance(p["ay"], dict) else (ay_bul(kucuk_l) or {})
        if "azimut" not in ay:
            ay = None
        else:
            ay.setdefault("yaricap", 0.35)
            ay.setdefault("hale", 4.0)
            ay.setdefault("parlaklik", 1.0)
            print(f"  ay: az {ay['azimut']:.1f}° yük {ay['yukseklik']:.1f}°")
    cikti = np.empty_like(a)
    for r0 in range(0, H, satir_blok):
        r1 = min(H, r0 + satir_blok)
        c8 = a[r0:r1]
        lin = tablo[c8]  # (h, W, 3) doğrusal
        srgb = c8.astype(np.float32) / 255.0
        l_srgb = (srgb * LUM).sum(-1)
        # Pozlama + doygunluk + ton (ay ışığı). `isikliRenk`: lambayla aydınlanmış (özgünde parlak) yüzeyler kendi
        # sıcak rengini ve doygunluğunu korur, gölgeler maviye kayar (sokak gecesi)
        d = lin * kazanc
        ld = (d * LUM).sum(-1, keepdims=True)
        aydinlik = (yumusak(0.35, 0.8, l_srgb) * float(p.get("isikliRenk", 0.0)))[..., None]
        doy = float(p["doygunluk"])
        d = ld + (d - ld) * (doy + (1.0 - doy) * aydinlik)
        d = d * (1.0 + (ton - 1.0) * (1.0 - aydinlik))
        # Ufkun üstündeki parlak gök ek kararır (gündüz mavisi gece göğü olmaz); ağaç/bina silueti daha az
        satirlar = np.arange(r0, r1, dtype=np.float32)
        yukseklik = (0.5 - (satirlar + 0.5) / H) * 180.0
        gok = yumusak(-1.0, 8.0, yukseklik)[:, None]
        parlak_gok = yumusak(0.25, 0.65, l_srgb)
        gk = 1.0 - (1.0 - float(p["gokKarartma"])) * gok * parlak_gok
        d = d * gk[..., None]
        # Küçük parlak ışık kaynakları korunur: (1) çevresinden belirgin parlak noktalar (yıldız, pencere, uzak lamba),
        # (2) doymuş ama küçük lekeler (lamba başı), `cekirdek` oranında
        ust = srgb.max(-1)
        maske = yumusak(float(p["vurgu"]), 1.0, ust) * yumusak(0.08, 0.25, l_srgb - yerel[r0:r1])
        if cekirdek_maske is not None:
            maske = np.maximum(maske, cekirdek_maske[r0:r1])
        korunan = lin * float(p["vurguKazanc"])
        d = d + (korunan - d) * maske[..., None]
        if ay is not None:
            d = ay_ciz(d, r0, r1, H, W, ay)
        cikti[r0:r1] = np.clip(dogrusal_srgb(d) * 255.0 + 0.5, 0, 255).astype(np.uint8)
    return Image.fromarray(cikti)


def ay_ciz(d: np.ndarray, r0: int, r1: int, H: int, W: int, ay: dict) -> np.ndarray:
    """Satır bloğuna (doğrusal) ay diski + hale ekler; yalnız ayın çevresindeki pencere hesaplanır."""
    pencere = max(3.0, float(ay["hale"]) * 3.0)
    el0 = float(ay["yukseklik"])
    satirlar = np.arange(r0, r1)
    el = 90.0 - (satirlar + 0.5) / H * 180.0
    secili = np.abs(el - el0) <= pencere
    if not secili.any():
        return d
    genis = min(180.0, pencere / max(0.05, math.cos(math.radians(min(85.0, abs(el0) + pencere)))))
    sutun_az = (np.arange(W) + 0.5) / W * 360.0 - 180.0
    fark = (sutun_az - float(ay["azimut"]) + 180.0) % 360.0 - 180.0
    sutunlar = np.nonzero(np.abs(fark) <= genis)[0]
    if sutunlar.size == 0:
        return d
    sx, sy, sz = yon(np.array(float(ay["azimut"])), np.array(el0))
    satir_idx = np.nonzero(secili)[0]
    AZ, EL = np.meshgrid(sutun_az[sutunlar], el[satir_idx])
    x, y, z = yon(AZ, EL)
    aci = np.degrees(np.arccos(np.clip(x * sx + y * sy + z * sz, -1.0, 1.0)))
    r = float(ay["yaricap"])
    parlak = float(ay["parlaklik"])
    disk = yumusak(r + 0.06, r - 0.06, aci)[..., None]
    hale = (np.exp(-((aci / float(ay["hale"])) ** 2)) * 0.05 + np.exp(-((aci / (r * 3.0)) ** 2)) * 0.12)[..., None] * parlak
    alt = d[np.ix_(satir_idx, sutunlar)]
    alt = alt + hale * np.array([0.78, 0.85, 1.0], dtype=np.float32)
    alt = alt * (1.0 - disk) + disk * np.array([1.0, 0.98, 0.93], dtype=np.float32) * parlak
    d[np.ix_(satir_idx, sutunlar)] = alt
    return d


def onizleme_yaz(once: Image.Image, sonra: Image.Image, yol: Path):
    a = once.resize((2048, 1024), Image.BILINEAR)
    b = sonra.resize((2048, 1024), Image.BILINEAR)
    tuval = Image.new("RGB", (2048, 2048))
    tuval.paste(a, (0, 0))
    tuval.paste(b, (0, 1024))
    yol.parent.mkdir(parents=True, exist_ok=True)
    tuval.save(yol, quality=88)


def main():
    ap = argparse.ArgumentParser(description="Gece panoraması derecelendirme (day for night)")
    ap.add_argument("--manifest", default=str(MANIFEST))
    ap.add_argument("--sec", default="", help="dosya yolunda geçen alt dize (virgülle birden çok)")
    ap.add_argument("--onizleme", default="", help="özgün/derecelendirilmiş yan yana önizleme klasörü")
    ap.add_argument("--kayit", default="", help="manifest dışı deneme: kaynak dosya (icerik/ altına göre)")
    ap.add_argument("--parametre", default="{}", help="--kayit ile JSON parametreler")
    ap.add_argument("--cikti", default="", help="--kayit ile çıktı yolu")
    ag = ap.parse_args()
    icerik = Path(ag.manifest).parent

    if ag.kayit:
        kaynak = icerik / ag.kayit
        img = Image.open(kaynak)
        sonuc = derecelendir(img, json.loads(ag.parametre))
        hedef = Path(ag.cikti) if ag.cikti else kaynak.with_name(kaynak.stem + "_gece.jpg")
        sonuc.save(hedef, quality=92)
        if ag.onizleme:
            onizleme_yaz(img.convert("RGB"), sonuc, Path(ag.onizleme) / (kaynak.parent.name + "_" + kaynak.stem + ".jpg"))
        print(f"{kaynak} → {hedef}")
        return

    manifest = json.loads(Path(ag.manifest).read_text(encoding="utf-8-sig"))
    suzgec = [s.strip() for s in ag.sec.split(",") if s.strip()]
    sayi = 0
    for k in manifest.get("panorama", []):
        if not isinstance(k, dict) or not k.get("gece"):
            continue
        kaynak_ad = k.get("kaynakDosya") or k["dosya"]
        if suzgec and not any(s in kaynak_ad for s in suzgec):
            continue
        if not k.get("kaynakDosya"):
            sys.exit(f"{k['dosya']}: 'kaynakDosya' yok; özgün dosya kaynakDosya, çıktı dosya alanına yazılmalı")
        kaynak = icerik / kaynak_ad
        hedef = icerik / k["dosya"]
        if kaynak.resolve() == hedef.resolve():
            sys.exit(f"{kaynak_ad}: dosya ile kaynakDosya aynı olamaz (özgün dosyanın üstüne yazılmaz)")
        if not kaynak.exists():
            print(f"{kaynak_ad}: kaynak yok, atlandı")
            continue
        parametre = k["gece"] if isinstance(k["gece"], dict) else {}
        img = Image.open(kaynak)
        sonuc = derecelendir(img, parametre)
        sonuc.save(hedef, quality=92)
        if ag.onizleme:
            onizleme_yaz(img.convert("RGB"), sonuc, Path(ag.onizleme) / (kaynak.parent.name + "_" + kaynak.stem + ".jpg"))
        print(f"{kaynak_ad} → {k['dosya']}  {json.dumps(parametre, ensure_ascii=False)}")
        sayi += 1
    print(f"{sayi} panorama derecelendirildi")


if __name__ == "__main__":
    main()
