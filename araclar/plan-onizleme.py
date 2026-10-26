#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Yerleşim planı önizlemesi: manifestteki her panoramanın duvarlarda nasıl görüneceğini ve yerleşim planı
noktalarının (patlama, asker, tank, helikopter, toz) panoramanın neresine düştüğünü resim olarak çizer.
Yeni panorama eklerken veya planı düzeltirken "patlama ağacın içinde mi, tank gölde mi" sorusunu
tarayıcı açmadan yanıtlamak için.

Her panorama için <cikis>/<anahtar>/ klasörüne:
  sol.jpg, orta.jpg, sag.jpg  üç duvar (yatay 90°, 16:9), oynatıcıyla aynı perspektif + yawKaydirma
  arka.jpg                    duvarlarda görünmeyen arka 90° (bilgi için)
  genel.jpg                   equirect özet: görünür aralık, yasak aralıklar, noktalar, güneş tahmini
  bilgi.json                  kullanılan plan, yaw, güneş tahmini, otomatik uyarılar
Anahtar: <bolge>_<mevsim>_<zaman>[_foto] (ör. daglik_kis_gunduz_foto, kirsal_acik_arazi_yaz_gunduz).

Çizim sözleşmesi (oynatıcıyla aynı): göz 1,7 m, zemin düz; plan azimutları PANORAMA koordinatında
(sahne azimutu = panorama azimutu − yawKaydirma); noktanın tabanı, o mesafedeki düz zeminin panoramada
düştüğü yerdir. İşaretler: kırmızı halka = patlama krateri (r 2,5 m), mavi dikdörtgen = asker (1,8 m),
turuncu kutu = tank (7×3,5×2,4 m), sarı halka + kutu = helikopter (r 7 m, 11×2,5×3,5 m), kahve = toz.
Üst cetvel panorama azimutudur (plan bu sayıları kullanır); kesikli beyaz eğriler zemin mesafe halkaları,
camgöbeği eğri hibrit 3B arazinin görünür yarıçapı.

Kullanım:
  python araclar/plan-onizleme.py                              # tümü → .plan-onizleme/
  python araclar/plan-onizleme.py --sec daglik                 # anahtarında "daglik" geçenler
  python araclar/plan-onizleme.py --sec daglik_kis_gunduz_foto --plan oneri.json --cikis C:/tmp/plan
     oneri.json: {"yawKaydirma": 30, "noktalar": [...], "yasak": [...], "gunes": {...}} (verilen alanlar
     manifestteki kaydın yerine çizilir; manifest değişmez)
"""
from __future__ import annotations

import argparse
import json
import math
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

KOK = Path(__file__).resolve().parent.parent
MANIFEST = KOK / "apps" / "duvar-oynatici" / "public" / "icerik" / "manifest.json"
GOZ = 1.7  # sahne3b/uzay.ts GOZ_YUKSEKLIGI
# main.ts ARAZI_VARSAYILAN (hibrit kipli bölgeler) + sahne3b/arazi.ts ARAZI_PROFILLERI (yaricap, kenarCukuru)
HIBRIT = {"kirsal_acik_arazi": (160, 0.0), "daglik": (160, 0.0), "ormanlik": (48, 1.6), "us_bolgesi": (90, 0.6)}
TUM_TURLER = ["patlama", "figur", "asker", "tank", "helikopter", "toz"]
RENK = {
    "patlama": (255, 70, 50),
    "figur": (70, 170, 255),
    "asker": (70, 170, 255),
    "tank": (255, 160, 20),
    "helikopter": (255, 235, 40),
    "toz": (200, 150, 90),
    "genel": (255, 255, 255),
}
KISA = {"patlama": "P", "figur": "F", "asker": "A", "tank": "T", "helikopter": "H", "toz": "Z"}
DUVARLAR = [("sol", -1), ("orta", 0), ("sag", 1)]


def yazi_tipi(boyut: int):
    for ad in ("arialbd.ttf", "arial.ttf", "segoeuib.ttf", "segoeui.ttf", "DejaVuSans-Bold.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(ad, boyut)
        except OSError:
            continue
    return ImageFont.load_default()


def aci_norm(a: float) -> float:
    return ((a + 180) % 360 + 360) % 360 - 180


def aralikta(az: float, bas: float, bit: float) -> bool:
    """yerlesim.ts aralikta(): saat yönünde bas → bit (sarmalı)."""
    a = aci_norm(az - bas)
    genislik = ((aci_norm(bit - bas) + 360) % 360) or 360
    return (a + 360) % 360 <= genislik


def anahtar(k: dict) -> str:
    ek = "_foto" if "_foto" in k.get("dosya", "") else ""
    return f"{k.get('bolge')}_{k.get('mevsim', 'hepsi')}_{k.get('zaman', 'hepsi')}{ek}"


def pano_yukle(dosya: Path, onbellek: Path, en: int = 4096) -> Image.Image:
    st = dosya.stat()
    c = onbellek / f"{dosya.parent.name}_{dosya.stem}_{st.st_size}_{int(st.st_mtime)}_{en}.jpg"
    if c.exists():
        return Image.open(c).convert("RGB")
    img = Image.open(dosya)
    if img.format == "JPEG":
        img.draft("RGB", (en, en // 2))  # DCT ölçekleme: 8K → 4K çözümü hızlı
    img = img.convert("RGB")
    if img.width > en:
        img = img.resize((en, max(1, round(en * img.height / img.width))), Image.LANCZOS)
    onbellek.mkdir(parents=True, exist_ok=True)
    img.save(c, quality=92)
    return img


def ornekle(a: np.ndarray, px: np.ndarray, py: np.ndarray) -> np.ndarray:
    """Çift doğrusal örnekleme; yatayda sarmalı, dikeyde kenara kıstırılmış."""
    H, W = a.shape[:2]
    x0 = np.floor(px).astype(np.int64)
    y0 = np.floor(py).astype(np.int64)
    fx = (px - x0)[..., None].astype(np.float32)
    fy = (py - y0)[..., None].astype(np.float32)
    x1 = (x0 + 1) % W
    x0 = x0 % W
    y1 = np.clip(y0 + 1, 0, H - 1)
    y0 = np.clip(y0, 0, H - 1)
    s = a[y0, x0] * (1 - fx) * (1 - fy) + a[y0, x1] * fx * (1 - fy) + a[y1, x0] * (1 - fx) * fy + a[y1, x1] * fx * fy
    return np.clip(s, 0, 255).astype(np.uint8)


class Kamera:
    """Duvar kamerası: sahne koordinatı X sağ, Y yukarı (göz 0), Z ileri (orta duvar); yaw sahne derecesi."""

    def __init__(self, yaw: float, gen: int, yuk: int, hfov: float, ykay: float = 0.0):
        self.yaw = yaw
        self.gen = gen
        self.yuk = yuk
        self.hfov = hfov
        self.ykay = ykay
        self.tx = math.tan(math.radians(hfov / 2))
        self.ty = self.tx * yuk / gen

    def izdusum(self, X: float, Y: float, Z: float):
        w = math.radians(self.yaw)
        c, s = math.cos(w), math.sin(w)
        xc = X * c - Z * s
        zc = X * s + Z * c
        if zc < 0.3:
            return None
        return ((xc / zc / self.tx + 1) / 2 * self.gen, (1 - (Y / zc / self.ty - self.ykay)) / 2 * self.yuk)

    def sutun_azimutu(self, px: float) -> float:
        nx = (px + 0.5) / self.gen * 2 - 1
        return self.yaw + math.degrees(math.atan(nx * self.tx))

    def azimut_x(self, sahne_az: float):
        f = aci_norm(sahne_az - self.yaw)
        if abs(f) >= self.hfov / 2 + 1e-6:
            return None
        return (math.tan(math.radians(f)) / self.tx + 1) / 2 * self.gen

    def goruntu(self, pano: np.ndarray, k: float) -> np.ndarray:
        Hp, Wp = pano.shape[:2]
        nx = (np.arange(self.gen) + 0.5) / self.gen * 2 - 1
        ny = 1 - (np.arange(self.yuk) + 0.5) / self.yuk * 2 + self.ykay
        X, Y = np.meshgrid(nx * self.tx, ny * self.ty)
        n = np.sqrt(X * X + Y * Y + 1.0)
        x, y, z = X / n, Y / n, 1.0 / n
        w = math.radians(self.yaw)
        c, s = math.cos(w), math.sin(w)
        dx = x * c + z * s
        dz = -x * s + z * c
        az = np.arctan2(dx, dz) + math.radians(k)
        el = np.arcsin(np.clip(y, -1, 1))
        px = ((0.5 + az / (2 * math.pi)) % 1.0) * Wp - 0.5
        py = (0.5 - el / math.pi) * Hp - 0.5
        return ornekle(pano, px, py)


def yer(sahne_az: float, mesafe: float, h: float = 0.0):
    r = math.radians(sahne_az)
    return (mesafe * math.sin(r), -GOZ + h, mesafe * math.cos(r))


def parlaklik_duzelt(a: np.ndarray):
    """Karanlık (gece) panoramalarda inceleme için parlaklık artırımı; oynatıcı görüntüsünü değiştirmez."""
    lum = float((0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]).mean())
    if lum >= 55:
        return a, 1.0
    kazanc = min(6.0, 85.0 / max(lum, 4.0))
    b = 255.0 * np.power(np.clip(a.astype(np.float32) / 255.0 * kazanc, 0, 1), 0.85)
    return b.astype(np.uint8), kazanc


def gunes_tahmini(img: Image.Image, gecici: Path):
    """
    Oynatıcının algoritmasıyla (araclar/gunes-tahmin.mjs → sahne3b/gunes.ts) güneş tahmini. Küçük kopya,
    tarayıcının drawImage(…, 256, 128) küçültmesine benzesin diye piksel merkezlerinden çift doğrusal
    örneklenir (alan ortalaması güneş diskini söndürür, tarayıcı söndürmez).
    """
    a = np.asarray(img).astype(np.float32)
    H, W = a.shape[:2]
    px, py = np.meshgrid((np.arange(256) + 0.5) / 256 * W - 0.5, (np.arange(128) + 0.5) / 128 * H - 0.5)
    kucuk = Image.fromarray(ornekle(a, px, py)).convert("RGBA")
    ham = gecici / "gunes_256x128.rgba"
    ham.write_bytes(kucuk.tobytes())
    try:
        cikti = subprocess.run(["node", str(KOK / "araclar" / "gunes-tahmin.mjs"), str(ham), "256", "128"], capture_output=True, text=True, timeout=60)
        return json.loads(cikti.stdout.strip() or "null")
    except Exception as h:  # node yoksa önizleme yine çizilir
        print(f"  güneş tahmini çalışmadı: {h}", file=sys.stderr)
        return None


def etkin_gunes(g, zaman: str | None):
    """sahne3b.ts isikGuncelle(): tahminden kullanılan yükseklik (makullük sınırı ile)."""
    if not g or g.get("guc", 0) <= 0.05:
        return None
    yuk = g["yukseklik"] if g.get("yukseklikGuvenilir") else max(20, 25 if zaman == "gece" else 45)
    en_az = 15 if zaman == "gece" else 6 if zaman == "alacakaranlik" else 18
    return {"azimut": g["azimut"], "yukseklik": max(yuk, en_az), "guc": g["guc"]}


class Etiketci:
    """Üst üste binen etiketleri yukarı kaydırır."""

    def __init__(self, ciz: ImageDraw.ImageDraw, font):
        self.ciz = ciz
        self.font = font
        self.kutular: list[tuple[float, float, float, float]] = []

    def yaz(self, x: float, y: float, metin: str, renk, alt_sinir: float = 0):
        l, t, r, b = self.ciz.textbbox((0, 0), metin, font=self.font)
        w, h = r - l + 8, b - t + 6
        x0 = max(2, min(x - w / 2, self.ciz.im.size[0] - w - 2))
        y0 = y - h
        for _ in range(40):
            if not any(not (x0 + w < k[0] or x0 > k[2] or y0 + h < k[1] or y0 > k[3]) for k in self.kutular):
                break
            y0 -= h + 2
        y0 = max(alt_sinir, y0)
        self.kutular.append((x0, y0, x0 + w, y0 + h))
        self.ciz.rectangle((x0, y0, x0 + w, y0 + h), fill=(0, 0, 0, 170), outline=renk + (255,))
        self.ciz.text((x0 + 4, y0 + 2 - t), metin, font=self.font, fill=renk + (255,))
        return (x0 + w / 2, y0 + h)


def duvar_ciz(pano: np.ndarray, kayit: dict, plan: dict, kam: Kamera, baslik: str, kazanc: float) -> Image.Image:
    k = float(plan.get("yawKaydirma", 0) or 0)
    taban = Image.fromarray(kam.goruntu(pano, k)).convert("RGBA")
    kat = Image.new("RGBA", taban.size, (0, 0, 0, 0))
    c = ImageDraw.Draw(kat)
    f_kucuk = yazi_tipi(13)
    f = yazi_tipi(15)
    f_buyuk = yazi_tipi(20)
    G, Y = kam.gen, kam.yuk
    yasak = plan.get("yasak") or []
    noktalar = plan.get("noktalar") or []
    bolge = kayit.get("bolge", "")

    # Yasak aralıklar: sütun başına (sıfır eğimli kamerada sütun = sabit azimut)
    onceki = None
    bant_bas = 0
    for px in range(G + 1):
        ad = None
        if px < G:
            p = aci_norm(kam.sutun_azimutu(px) + k)
            for yz in yasak:
                if aralikta(p, yz["baslangic"], yz["bitis"]):
                    ad = yz.get("ad", "yasak")
                    break
        if ad != onceki:
            if onceki is not None:
                c.rectangle((bant_bas, 0, px - 1, Y), fill=(255, 0, 0, 52))
                for xx in range(bant_bas - Y, px, 22):  # tarama
                    c.line((xx, Y, xx + Y, 0), fill=(255, 40, 40, 60), width=1)
                c.text(((bant_bas + px) / 2 - 60, 40), f"YASAK: {onceki}", font=f, fill=(255, 120, 120, 255))
            onceki = ad
            bant_bas = px

    # Ufuk ve zemin mesafe halkaları
    c.line((0, Y / 2 * (1 + kam.ykay), G, Y / 2 * (1 + kam.ykay)), fill=(255, 255, 255, 90), width=1)
    hibrit = HIBRIT.get(bolge)
    halkalar = [5, 10, 15, 20, 30, 40, 60, 80, 120, 160]
    for d in halkalar + ([hibrit[0]] if hibrit and hibrit[0] not in halkalar else []):
        ozel = hibrit and d == hibrit[0]
        nok = []
        for px in range(0, G + 1, 4):
            a = kam.sutun_azimutu(min(px, G - 1))
            p = kam.izdusum(*yer(a, d))
            if p:
                nok.append(p)
        if len(nok) < 2:
            continue
        if ozel:
            c.line(nok, fill=(0, 230, 255, 200), width=3)
            c.text((G - 330, nok[-1][1] - 22), f"hibrit 3B arazi sınırı {d} m", font=f_kucuk, fill=(0, 230, 255, 255))
        else:
            for i in range(0, len(nok) - 1, 2):
                c.line((nok[i], nok[i + 1]), fill=(255, 255, 255, 110), width=1)
            yy = nok[len(nok) // 2][1]
            if yy < Y - 4:
                c.text((G / 2 + 4, yy - 15), f"{d} m", font=f_kucuk, fill=(255, 255, 255, 200))
                c.text((6, nok[0][1] - 15), f"{d} m", font=f_kucuk, fill=(255, 255, 255, 160))

    # Noktalar
    et = Etiketci(c, f)
    for n in sorted(noktalar, key=lambda n: -n.get("mesafe", 20)):
        a = aci_norm(n["azimut"] - k)
        d = float(n.get("mesafe", 20))
        turler = n.get("tur") or []
        X, Yz, Z = yer(a, d)
        alt = kam.izdusum(X, Yz, Z)
        if not alt or not (-60 <= alt[0] <= G + 60):
            continue
        pxm = (G / 2) / (kam.tx * max(0.3, X * math.sin(math.radians(kam.yaw)) + Z * math.cos(math.radians(kam.yaw))))  # metre başına piksel
        ana = (turler[0] if turler else "genel")
        renk = RENK.get(ana, RENK["genel"])
        ust_y = alt[1]

        def halka(r, rk, kalinlik=2, dolgu=40):
            nok = []
            for i in range(29):
                t = 2 * math.pi * i / 28
                p = kam.izdusum(X + r * math.cos(t), Yz, Z + r * math.sin(t))
                if p is None:
                    return
                nok.append(p)
            c.polygon(nok, fill=rk + (dolgu,), outline=rk + (230,))
            c.line(nok, fill=rk + (230,), width=kalinlik)

        def kutu(uzun, derin, boy, rk):
            r = math.radians(a)
            ileri = (math.sin(r), math.cos(r))
            yan = (math.cos(r), -math.sin(r))
            kose = []
            for sy in (0.0, boy):
                for su, sd in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                    p = kam.izdusum(X + yan[0] * su * uzun / 2 + ileri[0] * sd * derin / 2, Yz + sy, Z + yan[1] * su * uzun / 2 + ileri[1] * sd * derin / 2)
                    if p is None:
                        return None
                    kose.append(p)
            for i, j in ((0, 1), (1, 2), (2, 3), (3, 0), (4, 5), (5, 6), (6, 7), (7, 4), (0, 4), (1, 5), (2, 6), (3, 7)):
                c.line((kose[i], kose[j]), fill=rk + (235,), width=2)
            return min(p[1] for p in kose)

        if not turler:
            halka(1.5, RENK["genel"])
        if "helikopter" in turler:
            halka(7.0, RENK["helikopter"], 3, 30)
            u = kutu(11, 2.5, 3.5, RENK["helikopter"])
            ust_y = min(ust_y, u if u is not None else ust_y)
        if "tank" in turler:
            u = kutu(7, 3.5, 2.4, RENK["tank"])
            ust_y = min(ust_y, u if u is not None else ust_y)
        if "patlama" in turler:
            halka(2.5, RENK["patlama"], 2, 50)
        if "toz" in turler and "patlama" not in turler:
            halka(2.0, RENK["toz"], 2, 40)
        if "asker" in turler or "figur" in turler:
            ust = kam.izdusum(X, Yz + 1.8, Z)
            if ust:
                g2 = max(2.0, 0.55 * pxm / 2)
                c.rectangle((alt[0] - g2, ust[1], alt[0] + g2, alt[1]), fill=RENK["asker"] + (120,), outline=(255, 255, 255, 230))
                bas = max(2.0, 0.24 * pxm / 2)
                c.ellipse((alt[0] - bas, ust[1] - bas * 2, alt[0] + bas, ust[1]), fill=RENK["asker"] + (200,))
                ust_y = min(ust_y, ust[1] - bas * 2)
        kodlar = "".join(KISA[t] for t in turler if t in KISA) or "hepsi"
        bag = et.yaz(alt[0], ust_y - 10, f"{n.get('ad', '?')} · {d:g} m · {kodlar}", renk, alt_sinir=34)
        c.line((alt[0], ust_y - 2, bag[0], bag[1]), fill=renk + (180,), width=1)

    # Üst cetvel: PANORAMA azimutu (planın kullandığı sayı)
    c.rectangle((0, 0, G, 30), fill=(0, 0, 0, 170))
    p_bas = math.ceil((kam.yaw - kam.hfov / 2 + k) / 5) * 5
    for p in range(int(p_bas), int(kam.yaw + kam.hfov / 2 + k) + 1, 5):
        x = kam.azimut_x(p - k)
        if x is None:
            continue
        uzun = p % 10 == 0
        c.line((x, 30 if uzun else 30, x, 18 if uzun else 24), fill=(255, 255, 255, 255), width=2 if uzun else 1)
        if uzun:
            metin = f"{aci_norm(p):.0f}"
            l, t, r, b = c.textbbox((0, 0), metin, font=f_kucuk)
            c.text((x - (r - l) / 2, 1), metin, font=f_kucuk, fill=(255, 230, 120, 255))
    # Alt bilgi
    s0, s1 = kam.yaw - kam.hfov / 2, kam.yaw + kam.hfov / 2
    bilgi = f"{baslik} · sahne {s0:+.0f}..{s1:+.0f}° · panorama {aci_norm(s0 + k):+.0f}..{aci_norm(s1 + k):+.0f}° · yaw {k:+.0f}°"
    if kazanc > 1.01:
        bilgi += f" · parlaklık ×{kazanc:.1f} (yalnız inceleme için)"
    c.rectangle((0, Y - 30, G, Y), fill=(0, 0, 0, 170))
    c.text((8, Y - 27), bilgi, font=f_buyuk, fill=(255, 255, 255, 255))
    c.text((G - 250, 34), "üst cetvel: panorama azimutu", font=f_kucuk, fill=(255, 230, 120, 230))
    return Image.alpha_composite(taban, kat).convert("RGB")


def genel_ciz(img: Image.Image, kayit: dict, plan: dict, gunes, etkin, gunes_elle, hfov: float) -> Image.Image:
    W, H = 2048, 1024
    a, kazanc = parlaklik_duzelt(np.asarray(img.resize((W, H), Image.BILINEAR)))
    taban = Image.fromarray(a).convert("RGBA")
    kat = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    c = ImageDraw.Draw(kat)
    f = yazi_tipi(16)
    f_kucuk = yazi_tipi(13)
    k = float(plan.get("yawKaydirma", 0) or 0)

    def x_of(p):
        return ((aci_norm(p) / 360 + 0.5) % 1.0) * W

    def bant(p0, p1, renk):
        x0, x1 = x_of(p0), x_of(p1)
        if x1 >= x0:
            c.rectangle((x0, 0, x1, H), fill=renk)
        else:
            c.rectangle((x0, 0, W, H), fill=renk)
            c.rectangle((0, 0, x1, H), fill=renk)

    # Arka 90° (duvarlarda görünmez)
    bant(k + 1.5 * hfov, k - 1.5 * hfov, (0, 0, 0, 150))
    c.text((x_of(k + 180) - 70, H * 0.1), "ARKA – görünmez", font=f, fill=(255, 255, 255, 220))
    for yz in plan.get("yasak") or []:
        bant(yz["baslangic"], yz["bitis"], (255, 0, 0, 60))
        c.text((x_of((yz["baslangic"] + ((aci_norm(yz["bitis"] - yz["baslangic"]) + 360) % 360) / 2)) - 40, H * 0.56), f"yasak: {yz.get('ad', '')}", font=f_kucuk, fill=(255, 140, 140, 255))
    for i, (ad, _) in enumerate(DUVARLAR):
        x = x_of(k + (i - 1) * hfov)
        c.text((x - 20, H * 0.03), ad.upper(), font=f, fill=(255, 255, 120, 255))
    for p in (k - 1.5 * hfov, k - 0.5 * hfov, k + 0.5 * hfov, k + 1.5 * hfov):
        c.line((x_of(p), 0, x_of(p), H), fill=(255, 255, 120, 200), width=2)
    for p in range(-180, 181, 30):
        c.line((x_of(p), H - 18, x_of(p), H), fill=(255, 255, 255, 255), width=1)
        c.text((x_of(p) + 3, H - 18), f"{p}", font=f_kucuk, fill=(255, 255, 255, 255))
    for el in (-30, -10, 0, 10, 30, 60):
        y = (0.5 - el / 180) * H
        c.line((0, y, W, y), fill=(255, 255, 255, 50 if el else 110), width=1)
        c.text((2, y - 14), f"{el}°", font=f_kucuk, fill=(255, 255, 255, 150))
    et = Etiketci(c, f_kucuk)
    for n in sorted(plan.get("noktalar") or [], key=lambda n: -n.get("mesafe", 20)):
        x = x_of(n["azimut"])
        y = (0.5 + math.degrees(math.atan(GOZ / max(0.5, n.get("mesafe", 20)))) / 180) * H
        turler = n.get("tur") or []
        renk = RENK.get(turler[0] if turler else "genel", RENK["genel"])
        c.line((x, H / 2, x, y), fill=renk + (200,), width=2)
        c.ellipse((x - 5, y - 5, x + 5, y + 5), fill=renk + (255,), outline=(0, 0, 0, 255))
        kodlar = "".join(KISA[t] for t in turler if t in KISA) or "hepsi"
        et.yaz(x, y + 26, f"{n.get('ad', '?')} {n.get('mesafe', 20):g}m {kodlar}", renk)
    if gunes:
        x = x_of(gunes["azimut"])
        y = (0.5 - gunes["yukseklik"] / 180) * H
        c.line((x - 16, y, x + 16, y), fill=(255, 255, 0, 255), width=3)
        c.line((x, y - 16, x, y + 16), fill=(255, 255, 0, 255), width=3)
        metin = f"güneş tahmini az {gunes['azimut']:.0f}° yük {gunes['yukseklik']:.0f}° güç {gunes['guc']:.2f} {'güvenilir' if gunes.get('yukseklikGuvenilir') else 'yükseklik güvenilmez'}"
        if etkin:
            metin += f" → kullanılan yük {etkin['yukseklik']:.0f}°"
        c.text((min(W - 560, max(4, x - 200)), max(4, y - 40)), metin, font=f_kucuk, fill=(255, 255, 0, 255))
    if gunes_elle:
        x = x_of(gunes_elle["azimut"])
        y = (0.5 - gunes_elle.get("yukseklik", 30) / 180) * H
        c.ellipse((x - 14, y - 14, x + 14, y + 14), outline=(0, 255, 120, 255), width=3)
        c.text((min(W - 300, max(4, x + 18)), y - 8), f"manifest gunes az {gunes_elle['azimut']:.0f}° yük {gunes_elle.get('yukseklik', 30):.0f}°", font=f_kucuk, fill=(0, 255, 120, 255))
    baslik = f"{anahtar(kayit)} · yawKaydirma {k:+.0f}° · {kayit.get('_kaynak', kayit.get('dosya'))}"
    if kazanc > 1.01:
        baslik += f" · parlaklık ×{kazanc:.1f}"
    c.rectangle((0, H - 44, W, H - 20), fill=(0, 0, 0, 160))
    c.text((6, H - 42), baslik, font=f, fill=(255, 255, 255, 255))
    return Image.alpha_composite(taban, kat).convert("RGB")


def uyarilar_uret(kayit: dict, plan: dict, hfov: float) -> list[str]:
    k = float(plan.get("yawKaydirma", 0) or 0)
    noktalar = plan.get("noktalar") or []
    yasak = plan.get("yasak") or []
    bolge = kayit.get("bolge", "")
    hib = HIBRIT.get(bolge)
    u: list[str] = []
    for n in noktalar:
        a = aci_norm(n["azimut"] - k)
        ad = n.get("ad", "?")
        if abs(a) > 1.5 * hfov - 3:
            u.append(f"'{ad}' arka 90°de (sahne {a:+.0f}°): duvarlarda görünmez")
        for yz in yasak:
            if aralikta(n["azimut"], yz["baslangic"], yz["bitis"]):
                u.append(f"'{ad}' yasak aralık '{yz.get('ad', '')}' içinde")
        if hib:
            r, cukur = hib
            if n.get("mesafe", 20) > r * 0.92:
                u.append(f"'{ad}' {n.get('mesafe')} m: hibrit 3B arazi yarıçapı ({r} m) dışında/kenarında")
            elif cukur > 0 and n.get("mesafe", 20) > r * 0.5:
                u.append(f"'{ad}' {n.get('mesafe')} m: hibrit kenar çanağında (arazi {cukur} m'ye kadar alçalıyor, r>{r * 0.45:.0f} m)")
    sayac = {ad: {"patlama": 0, "asker": 0} for ad, _ in DUVARLAR}
    for n in noktalar:
        a = aci_norm(n["azimut"] - k)
        turler = n.get("tur") or TUM_TURLER
        for ad, i in DUVARLAR:
            if abs(aci_norm(a - i * hfov)) <= hfov / 2:
                if "patlama" in turler:
                    sayac[ad]["patlama"] += 1
                if "asker" in turler:
                    sayac[ad]["asker"] += 1
    for ad, s in sayac.items():
        if s["patlama"] == 0:
            u.append(f"{ad} duvarda patlama noktası yok (o duvara istenen patlama başka duvara kayar)")
        if s["asker"] == 0:
            u.append(f"{ad} duvarda asker/mevzi noktası yok")
    helis = [n for n in noktalar if "helikopter" in (n.get("tur") or TUM_TURLER)]
    if not helis:
        u.append("helikopter iniş noktası yok")
    for n in helis:
        if abs(aci_norm(n["azimut"] - k)) > 1.5 * hfov - 10:
            u.append(f"helikopter noktası '{n.get('ad')}' görünür aralığın dışında/kenarında")
    if not [n for n in noktalar if "tank" in (n.get("tur") or [])]:
        u.append("tank noktası yok (tank figür noktalarına düşer)")
    return u


def main():
    ap = argparse.ArgumentParser(description="Yerleşim planı önizlemesi (panorama + plan noktaları)")
    ap.add_argument("--manifest", default=str(MANIFEST))
    ap.add_argument("--cikis", default=str(KOK / ".plan-onizleme"))
    ap.add_argument("--sec", default="", help="anahtar süzgeci (virgülle birden çok; alt dize)")
    ap.add_argument("--tam", action="store_true", help="--sec tam anahtar eşleşmesi olsun")
    ap.add_argument("--plan", default="", help="öneri planı JSON (yawKaydirma/noktalar/yasak/gunes); tek panorama seçiliyken")
    ap.add_argument("--fov", type=float, default=90.0)
    ap.add_argument("--genislik", type=int, default=1280)
    ap.add_argument("--onbellek", default=str(Path(tempfile.gettempdir()) / "plan-onizleme-onbellek"))
    ap.add_argument("--liste", action="store_true", help="yalnızca anahtarları listele")
    ag = ap.parse_args()

    manifest = json.loads(Path(ag.manifest).read_text(encoding="utf-8-sig"))
    icerik = Path(ag.manifest).parent
    kayitlar = [k for k in manifest.get("panorama", []) if isinstance(k, dict) and k.get("dosya")]
    suzgec = [s.strip() for s in ag.sec.split(",") if s.strip()]
    if suzgec:
        kayitlar = [k for k in kayitlar if any((anahtar(k) == s) if ag.tam else (s in anahtar(k)) for s in suzgec)]
    if ag.liste:
        for k in kayitlar:
            print(anahtar(k), "·", k["dosya"])
        return
    oneri = json.loads(Path(ag.plan).read_text(encoding="utf-8-sig")) if ag.plan else None
    if oneri is not None and len(kayitlar) != 1:
        sys.exit(f"--plan için tek panorama seçilmeli (seçilen: {[anahtar(k) for k in kayitlar]})")
    cikis = Path(ag.cikis)
    onbellek = Path(ag.onbellek)
    gen = ag.genislik
    yuk = round(gen * 9 / 16)
    for kayit in kayitlar:
        ad = anahtar(kayit)
        dosya = icerik / kayit["dosya"]
        if kayit.get("tip") == "video" or dosya.suffix.lower() in (".mp4", ".webm", ".mov"):
            print(f"{ad}: video panorama, atlandı")
            continue
        if not dosya.exists():
            print(f"{ad}: dosya yok ({dosya}), atlandı")
            continue
        plan = {"yawKaydirma": kayit.get("yawKaydirma", 0), "noktalar": kayit.get("noktalar", []), "yasak": kayit.get("yasak", []), "gunes": kayit.get("gunes")}
        if oneri:
            plan.update({a: v for a, v in oneri.items() if a in ("yawKaydirma", "noktalar", "yasak", "gunes")})
        hedef = cikis / ad
        hedef.mkdir(parents=True, exist_ok=True)
        img = pano_yukle(dosya, onbellek)
        a_ham = np.asarray(img).astype(np.float32)
        a_parlak, kazanc = parlaklik_duzelt(np.asarray(img))
        pano = a_parlak.astype(np.float32) if kazanc > 1.01 else a_ham
        k = float(plan.get("yawKaydirma", 0) or 0)
        ykay = float(kayit.get("yukseklikKaydirma", 0) or 0)
        for duvar_ad, i in DUVARLAR + [("arka", 2)]:
            kam = Kamera(i * ag.fov if duvar_ad != "arka" else 180.0, gen, yuk, ag.fov, ykay)
            baslik = f"{duvar_ad.upper()} DUVAR" if duvar_ad != "arka" else "ARKA (duvarlarda görünmez)"
            duvar_ciz(pano, kayit, plan, kam, baslik, kazanc).save(hedef / f"{duvar_ad}.jpg", quality=88)
        gecici = Path(tempfile.mkdtemp(prefix="plan_"))
        g = gunes_tahmini(img, gecici)
        etkin = etkin_gunes(g, kayit.get("zaman"))
        genel_ciz(img, kayit, plan, g, etkin, plan.get("gunes"), ag.fov).save(hedef / "genel.jpg", quality=88)
        uy = uyarilar_uret(kayit, plan, ag.fov)
        bilgi = {
            "anahtar": ad,
            "dosya": kayit["dosya"],
            "kaynak": kayit.get("_kaynak"),
            "not": kayit.get("_not"),
            "zaman": kayit.get("zaman"),
            "yawKaydirma": k,
            "gorunurPanoramaAraligi": [aci_norm(k - 1.5 * ag.fov), aci_norm(k + 1.5 * ag.fov)],
            "duvarlar": {d: [aci_norm(k + (i - 0.5) * ag.fov), aci_norm(k + (i + 0.5) * ag.fov)] for d, i in DUVARLAR},
            "gunesTahmini": g,
            "kullanilanGunes": etkin,
            "manifestGunes": plan.get("gunes"),
            "plan": {"noktalar": plan.get("noktalar"), "yasak": plan.get("yasak")},
            "uyarilar": uy,
            "oneriPlani": bool(oneri),
        }
        (hedef / "bilgi.json").write_text(json.dumps(bilgi, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"{ad}: {hedef}  ({len(uy)} uyarı)")
        for satir in uy:
            print(f"   - {satir}")


if __name__ == "__main__":
    main()
