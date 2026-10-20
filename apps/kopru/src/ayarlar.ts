/**
 * Ortam değişkenlerinden okunan sunucu ayarları.
 * Sistem tamamen çevrimdışı çalışır; tüm adresler yerel ağ içindir.
 *
 * Değerler sırasıyla şuradan gelir: gerçek ortam değişkeni > apps/kopru/.env dosyası > varsayılan.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export interface OrnekPaketAyarlari {
  /** Paketlenmiş UE oyununun kök klasörü (içinde Engine\Binaries\Win64\UnrealGame.exe). Boşsa özellik kapalı. */
  paket: string;
  /** .uproject adı (klasör ve dosya adı aynı kabul edilir, ör. "TCCC"). */
  proje: string;
  /** Doğrudan açılacak harita (ör. /Game/Maps/CitySuburbs). Boşsa ana menü. */
  harita: string;
  genislik: number;
  yukseklik: number;
  tamEkran: boolean;
  /** Komut satırına eklenecek ek parametreler (boşlukla ayrılmış). */
  ekParametreler: string;
}

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
  ornek: OrnekPaketAyarlari;
}

function sayi(deger: string | undefined, varsayilan: number): number {
  const n = Number(deger);
  return Number.isFinite(n) && deger !== undefined && deger !== "" ? n : varsayilan;
}

function bool(deger: string | undefined, varsayilan: boolean): boolean {
  if (deger === undefined || deger === "") return varsayilan;
  return ["1", "true", "evet", "acik"].includes(deger.toLowerCase());
}

/**
 * Basit .env okuyucu (bağımlılık yok). Var olan ortam değişkenlerini ezmez.
 * Satır biçimi: ANAHTAR=değer  — '#' ile başlayan satırlar yorumdur, tırnaklar soyulur.
 */
export function envDosyasiniYukle(yol: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!existsSync(yol)) return false;
  for (const ham of readFileSync(yol, "utf8").split(/\r?\n/)) {
    const satir = ham.trim();
    if (!satir || satir.startsWith("#")) continue;
    const esit = satir.indexOf("=");
    if (esit <= 0) continue;
    const anahtar = satir.slice(0, esit).trim();
    let deger = satir.slice(esit + 1).trim();
    if ((deger.startsWith('"') && deger.endsWith('"')) || (deger.startsWith("'") && deger.endsWith("'"))) {
      deger = deger.slice(1, -1);
    }
    if (env[anahtar] === undefined) env[anahtar] = deger;
  }
  return true;
}

/** Köprü klasöründeki .env dosyasının yolu (apps/kopru/.env). */
export function varsayilanEnvYolu(): string {
  return fileURLToPath(new URL("../.env", import.meta.url));
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
    ornek: {
      paket: env.ORNEK_PAKET ?? "",
      proje: env.ORNEK_PROJE ?? "TCCC",
      harita: env.ORNEK_HARITA ?? "",
      genislik: sayi(env.ORNEK_GENISLIK, 1920),
      yukseklik: sayi(env.ORNEK_YUKSEKLIK, 1080),
      tamEkran: bool(env.ORNEK_TAM_EKRAN, false),
      ekParametreler: env.ORNEK_EK_PARAMETRELER ?? "",
    },
  };
}
