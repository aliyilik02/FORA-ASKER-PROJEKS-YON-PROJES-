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

/** Duvar sınırları ve adları (kalibrasyon için, K tuşu). */
export function kalibrasyonCiz(ctx: CanvasRenderingContext2D, W: number, H: number, adlar: string[]) {
  const g = W / adlar.length;
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.8)";
  ctx.lineWidth = 2;
  ctx.setLineDash([12, 8]);
  for (let i = 1; i < adlar.length; i++) {
    ctx.beginPath();
    ctx.moveTo(i * g, 0);
    ctx.lineTo(i * g, H);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.strokeRect(1, 1, W - 2, H - 2);
  ctx.font = `bold ${Math.round(H / 12)}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  adlar.forEach((ad, i) => ctx.fillText(ad.toUpperCase(), i * g + g / 2, H / 2));
  // Köşe çarpıları
  for (let i = 0; i < adlar.length; i++) {
    ctx.beginPath();
    ctx.moveTo(i * g, 0);
    ctx.lineTo(i * g + g, H);
    ctx.moveTo(i * g + g, 0);
    ctx.lineTo(i * g, H);
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.stroke();
  }
  ctx.restore();
}
