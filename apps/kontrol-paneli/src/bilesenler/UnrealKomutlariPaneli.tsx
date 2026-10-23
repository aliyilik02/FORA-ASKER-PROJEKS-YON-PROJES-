import type { BaglantiDurumu, UnrealIstekKaydi } from "../tipler";
import { Bolum, Ikon } from "./ortak";

function parametreMetni(p: Record<string, unknown>): string {
  return Object.entries(p)
    .map(([k, v]) => `${k}=${typeof v === "number" ? Math.round(v * 100) / 100 : String(v)}`)
    .join("  ");
}

/** Köprünün Unreal Engine'e gönderdiği Remote Control çağrıları (UE yolu isteğe bağlı; simülasyon modunda yalnız listelenir). */
export function UnrealKomutlariPaneli({ istekler, baglanti }: { istekler: UnrealIstekKaydi[]; baglanti: BaglantiDurumu | null }) {
  const mod = baglanti?.unreal.mod;
  return (
    <Bolum
      baslik="Unreal Komutları"
      altBaslik={mod === "simulasyon" ? "Simülasyon modu: çağrılar UE'ye gitmiyor, yalnızca listeleniyor" : `Remote Control → ${baglanti?.unreal.adres ?? ""}`}
      ikon={<Ikon.sistem />}
      sag={<span className="rozet notr">{istekler.length} kayıt</span>}
    >
      <ul className="unreal-liste">
        {istekler.length === 0 && <li className="aciklama">Henüz çağrı yok.</li>}
        {istekler.map((i, n) => (
          <li key={`${i.zaman}-${n}`} className={i.basarili ? "" : "basarisiz"} title={i.hata}>
            <time>{new Date(i.zaman).toLocaleTimeString("tr-TR")}</time>
            <span className="fonksiyon">{i.fonksiyon}</span>
            <code>{parametreMetni(i.parametreler)}</code>
            <span className={`nokta ${i.basarili ? "iyi" : "kotu"}`} aria-label={i.basarili ? "gönderildi" : "hata"} />
          </li>
        ))}
      </ul>
    </Bolum>
  );
}
