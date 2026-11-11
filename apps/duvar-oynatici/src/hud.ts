import { azimutX, type TuvalNoktasi, ufukSatiri, xAzimut, yonuIzdusur, type Yerlesim } from "./projeksiyon";

/** Hata ayıklama katmanı (H tuşu): durum özeti, FPS, bağlantı. */
export function hudCiz(ctx: CanvasRenderingContext2D, satirlar: string[], H: number) {
  const boyut = Math.max(12, Math.round(H / 40));
  ctx.save();
  ctx.font = `${boyut}px ui-monospace, Consolas, monospace`;
  ctx.textBaseline = "top";
  const genislik = Math.max(...satirlar.map((s) => ctx.measureText(s).width)) + boyut;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(boyut * 0.5, boyut * 0.5, genislik, (satirlar.length + 0.6) * boyut * 1.25);
  ctx.fillStyle = "#e8eaf0";
  satirlar.forEach((s, i) => ctx.fillText(s, boyut, boyut * 0.9 + i * boyut * 1.25));
  ctx.restore();
}

/** Ortada büyük uyarı (köprü yok, ses kapalı vb.). */
export function uyariCiz(ctx: CanvasRenderingContext2D, W: number, H: number, metin: string, alt?: string) {
  const boyut = Math.max(18, Math.round(H / 18));
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(W / 2 - boyut * 12, H / 2 - boyut * 1.6, boyut * 24, boyut * (alt ? 3.4 : 2.4));
  ctx.fillStyle = "#fff";
  ctx.font = `bold ${boyut}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(metin, W / 2, H / 2 - (alt ? boyut * 0.4 : 0));
  if (alt) {
    ctx.font = `${boyut * 0.6}px "Segoe UI", system-ui, sans-serif`;
    ctx.fillStyle = "#c9ccd6";
    ctx.fillText(alt, W / 2, H / 2 + boyut * 0.7);
  }
  ctx.restore();
}

const DUVAR_ADI: Record<Yerlesim["duvar"]["ad"], string> = { sol: "SOL", orta: "ORTA", sag: "SAĞ" };
const YUKSEKLIK_CIZGILERI = [-20, -10, 10, 20];
const izNokta: TuvalNoktasi = { x: 0, y: 0 };

function aciMetni(a: number): string {
  return `${a > 0 ? "+" : a < 0 ? "−" : ""}${Math.abs(Math.round(a))}°`;
}

/**
 * Kalibrasyon ızgarası (K tuşu), izdüşümle çizilir: her duvarda 10°'de bir azimut çizgisi (30°'de bir etiketli),
 * ufuk (göz hizası) çizgisi, −20/−10/+10/+20° yükseklik eğrileri, duvar adları ve sınırları, altta geometri ve
 * duvar açıları. Ölçüler doğruysa izleyici noktasından bakınca çizgiler düz görünür ve köşelerde kırılmadan
 * devam eder; kırılıyorsa duvar ölçüsü ya da izleyici konumu yanlıştır (`?oda=`).
 */
export function kalibrasyonCiz(ctx: CanvasRenderingContext2D, W: number, H: number, yerlesimler: Yerlesim[], ozet: readonly string[]) {
  const yazi = Math.max(11, Math.round(H / 42));
  // Geometri özeti kutusu (altta, ortada): satır yüksekliği ve üst kenarı; duvar adları bunun üstünde kalır
  const ozetSatiri = yazi * 1.35;
  const ozetUst = ozet.length > 0 ? H - ozetSatiri * ozet.length - yazi * 0.8 : H;
  ctx.save();
  ctx.lineCap = "round";
  for (const y of yerlesimler) {
    const d = y.duvar;
    ctx.save();
    ctx.beginPath();
    ctx.rect(y.x, 0, y.genislik, H);
    ctx.clip();
    ctx.font = `${yazi}px ui-monospace, Consolas, monospace`;
    ctx.textBaseline = "top";
    ctx.textAlign = "center";

    // Azimut çizgileri: dikey duvarda sabit azimut dikey bir doğrudur
    const ilk = Math.ceil((d.solAzimut - 1e-6) / 10) * 10;
    for (let az = ilk; az <= d.solAzimut + d.fov + 1e-6; az += 10) {
      const x = azimutX(az, y, 0.01);
      if (x === null) continue;
      const otuz = Math.round(az) % 30 === 0;
      ctx.strokeStyle = otuz ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.4)";
      ctx.lineWidth = otuz ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
      if (otuz) {
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.fillText(aciMetni(az), x, yazi * 0.5);
      }
    }

    // Yükseklik eğrileri: sabit yükseklik düz duvarda eğridir (kenara doğru ufuktan uzaklaşır)
    const adim = Math.max(8, y.genislik / 48);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(120,215,255,0.75)";
    ctx.fillStyle = "rgba(150,225,255,0.95)";
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    for (const e of YUKSEKLIK_CIZGILERI) {
      ctx.beginPath();
      let basladi = false;
      for (let x = y.x; x <= y.x + y.genislik + adim - 1e-6; x += adim) {
        const xx = Math.min(x, y.x + y.genislik);
        if (!yonuIzdusur(xAzimut(xx, y), e, y, izNokta, 180)) {
          basladi = false;
          continue;
        }
        if (basladi) ctx.lineTo(izNokta.x, izNokta.y);
        else ctx.moveTo(izNokta.x, izNokta.y);
        basladi = true;
      }
      ctx.stroke();
      if (yonuIzdusur(xAzimut(y.x + yazi * 0.6, y), e, y, izNokta, 180)) ctx.fillText(aciMetni(e), y.x + yazi * 0.6, izNokta.y - 2);
    }

    // Ufuk = göz hizası (göz görüntünün altında ya da üstündeyse çizgi tuvalin dışında kalır; aşağıda not)
    const ufuk = ufukSatiri(y);
    ctx.strokeStyle = "rgba(255,200,60,0.95)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(y.x, ufuk);
    ctx.lineTo(y.x + y.genislik, ufuk);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,210,90,0.95)";
    ctx.fillText("ufuk · göz hizası", y.x + yazi * 0.6, ufuk < yazi * 1.2 ? ufuk + 3 + yazi : ufuk - 3);

    // Duvar adı ve açı aralığı: ufka yakın, ama ufuk nerede olursa olsun tuvalde ve alttaki özet kutusunun üstünde
    // (doğrulama gözün görüntünün çok altında/üstünde olmasına izin verir: alt=2, yuk=1, goz=0,5 → ufuk 2,5·H)
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `bold ${Math.round(H / 12)}px "Segoe UI", system-ui, sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    const adYEnCok = Math.max(H * 0.3, ozetUst - H / 14 - yazi);
    const adY = Math.min(adYEnCok, Math.max(H * 0.12, ufuk > H * 0.3 ? ufuk - H * 0.16 : ufuk + H * 0.16));
    ctx.fillText(DUVAR_ADI[d.ad], y.x + y.genislik / 2, adY);
    ctx.font = `${yazi}px ui-monospace, Consolas, monospace`;
    ctx.fillText(`${d.fov.toFixed(1)}° · ${aciMetni(d.solAzimut)} … ${aciMetni(d.solAzimut + d.fov)}`, y.x + y.genislik / 2, adY + H / 14);
    if (ufuk < 0 || ufuk > H) {
      // Ufuk tuvalin dışında: not, ufuk üstteyse açı satırının altına, alttaysa adın üstüne (özet kutusuna değmez)
      ctx.fillStyle = "rgba(255,210,90,0.95)";
      const notY = ufuk < 0 ? adY + H / 14 + yazi * 1.5 : adY - H / 24 - yazi;
      ctx.fillText(`${ufuk < 0 ? "↑" : "↓"} ufuk (göz hizası) görüntünün ${ufuk < 0 ? "üstünde" : "altında"}`, y.x + y.genislik / 2, notY);
    }
    ctx.restore();
  }

  // Duvar sınırları: dış çerçeve düz, duvarlar arası kesik
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 2;
  ctx.setLineDash([12, 8]);
  for (let i = 1; i < yerlesimler.length; i++) {
    ctx.beginPath();
    ctx.moveTo(yerlesimler[i].x, 0);
    ctx.lineTo(yerlesimler[i].x, H);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.strokeRect(1, 1, W - 2, H - 2);

  // Geometri özeti (altta, ortada)
  if (ozet.length > 0) {
    ctx.font = `${yazi}px ui-monospace, Consolas, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const genislik = Math.min(W - 8, Math.max(...ozet.map((s) => ctx.measureText(s).width)) + yazi * 1.5);
    ctx.fillStyle = "rgba(0,0,0,0.62)";
    ctx.fillRect(W / 2 - genislik / 2, ozetUst, genislik, ozetSatiri * ozet.length + yazi * 0.5);
    ctx.fillStyle = "#e8eaf0";
    ozet.forEach((s, i) => ctx.fillText(s, W / 2, ozetUst + ozetSatiri * (i + 0.5) + yazi * 0.25, W - 16));
  }
  ctx.restore();
}
