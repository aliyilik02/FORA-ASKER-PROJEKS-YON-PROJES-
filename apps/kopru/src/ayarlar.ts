/**
 * Ortam değişkenlerinden okunan sunucu ayarları.
 * Sistem tamamen çevrimdışı çalışır; tüm adresler yerel ağ içindir.
 */
import { fileURLToPath } from "node:url";

export interface SunucuAyarlari {
  port: number;
  /** Unreal Engine Remote Control API adresi (varsayılan port 30010). */
  unrealAdres: string;
  /** Remote Control preset adı (UE içinde oluşturulur). */
  unrealPreset: string;
  /** "gercek" → UE'ye HTTP istekleri atılır; "simulasyon" → yalnızca günlüğe yazılır. */
  unrealMod: "gercek" | "simulasyon";
  /** Art-Net hedef IP (yayın adresi veya ışık kontrolcüsü). */
  artnetHedef: string;
  artnetPort: number;
  artnetEvren: number;
  artnetAktif: boolean;
  /** Ön ayar ve senaryoların saklanacağı klasör. */
  veriKlasoru: string;
}

function sayi(deger: string | undefined, varsayilan: number): number {
  const n = Number(deger);
  return Number.isFinite(n) && deger !== undefined && deger !== "" ? n : varsayilan;
}

function bool(deger: string | undefined, varsayilan: boolean): boolean {
  if (deger === undefined || deger === "") return varsayilan;
  return ["1", "true", "evet", "acik"].includes(deger.toLowerCase());
}

export function ayarlariOku(env: NodeJS.ProcessEnv = process.env): SunucuAyarlari {
  const mod = (env.UNREAL_MOD ?? "simulasyon").toLowerCase();
  return {
    port: sayi(env.PORT, 4000),
    unrealAdres: env.UNREAL_ADRES ?? "http://127.0.0.1:30010",
    unrealPreset: env.UNREAL_PRESET ?? "DuvarSimulasyonu",
    unrealMod: mod === "gercek" ? "gercek" : "simulasyon",
    artnetHedef: env.ARTNET_HEDEF ?? "2.255.255.255",
    artnetPort: sayi(env.ARTNET_PORT, 6454),
    artnetEvren: sayi(env.ARTNET_EVREN, 0),
    artnetAktif: bool(env.ARTNET_AKTIF, false),
    // fileURLToPath: Windows'ta URL.pathname "/C:/..." döndürür ve "C:\C:\..." hatasına yol açar.
    veriKlasoru: env.VERI_KLASORU ?? fileURLToPath(new URL("../veri/", import.meta.url)),
  };
}
