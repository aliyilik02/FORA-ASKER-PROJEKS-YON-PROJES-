/** Köprü sunucusu WebSocket istemcisi; koparsa 2 sn'de bir yeniden bağlanır. */
import type { IstemciMesaji, SunucuMesaji } from "./tipler";

export type BaglantiDurumu = "bagli" | "kopuk";

export class KopruBaglantisi {
  durum: BaglantiDurumu = "kopuk";
  private ws: WebSocket | null = null;
  private zamanlayici: number | null = null;

  constructor(
    private readonly onMesaj: (m: SunucuMesaji) => void,
    private readonly onDurum: (d: BaglantiDurumu) => void,
    private readonly adres = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`,
  ) {}

  baslat() {
    this.baglan();
  }

  private baglan() {
    this.ws = new WebSocket(this.adres);
    this.ws.onopen = () => {
      this.durum = "bagli";
      this.onDurum("bagli");
      const merhaba: IstemciMesaji = { tip: "merhaba", rol: "oynatici", ad: `${screen.width}x${screen.height}` };
      this.ws?.send(JSON.stringify(merhaba));
    };
    this.ws.onmessage = (olay) => {
      try {
        this.onMesaj(JSON.parse(olay.data) as SunucuMesaji);
      } catch {
        /* bozuk mesaj yok sayılır */
      }
    };
    this.ws.onclose = () => {
      this.durum = "kopuk";
      this.onDurum("kopuk");
      this.zamanlayici = window.setTimeout(() => this.baglan(), 2000);
    };
    this.ws.onerror = () => this.ws?.close();
  }

  /** Köprüye istemci mesajı (önizleme görüntüsü); bağlı değilse sessizce atlanır. */
  gonder(m: IstemciMesaji) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  kapat() {
    if (this.zamanlayici) clearTimeout(this.zamanlayici);
    this.ws?.close();
  }
}
