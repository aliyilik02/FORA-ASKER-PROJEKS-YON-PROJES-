/**
 * Eğitmen ekranı (10 Kasım yeniden kurulum, kullanıcı kararı): tek sayfa. Üstte duvarın canlı görüntüsü ("Nereye?":
 * görüntüye dokun), altında konuya göre ayrılmış büyük düğmeler ("Ne olsun?"). Teknik terim, derece, kaydırıcı yok;
 * ince ayarlar Teknisyen sayfasında. Her düğme tek dokunuşla çalışır ve seçili yere gider.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../../api";
import { useArayuz, yonAzimut } from "../../arayuz";
import { sihhiyeBekleyenYarali, vurulabilirAskerler, yoneEnYakin } from "../../figurYardimcilari";
import { GUVENLI_ALAN_ETIKETLERI, HELIKOPTER_ETIKETLERI, type EfektTuru, type FigurKomutu, type GuvenliAlanTipi, type KlipOzeti, type MakroDurumu, type Safha, type SenaryoDurumu, type SimulasyonDurumu } from "../../tipler";
import { sifirlamaNesli } from "../../useKopru";
import { makrolar } from "../EfektPaneli";
import { HELI_DIZISI, HELI_MAKRO_ADI } from "../Oda2Paneli";
import { OnayliDugme, sureBicimi } from "../ortak";
import { DuvarSeridi, yerAdi } from "./DuvarSeridi";

type Calistir = <T>(islem: () => Promise<T>) => Promise<T | undefined>;
type Figur = FigurKomutu & { id: string };

const SAFHALAR: Array<{ safha: Safha; ad: string; aciklama: string }> = [
  { safha: "ates_altinda", ad: "Ateş altında", aciklama: "Sıhhiyeci yaralıya gitmez, siperde bekler" },
  { safha: "taktik_saha", ad: "Ateş kesildi", aciklama: "Sıhhiyeci yaralının başına gider, müdahale eder" },
  { safha: "tahliye", ad: "Tahliye", aciklama: "Yaralı tahliyeye hazırlanır" },
];
const SIDDETLER: Array<[number, string]> = [
  [0.3, "Az"],
  [0.6, "Orta"],
  [0.95, "Çok"],
];

function Konu({ ad, renk, sag, children }: { ad: string; renk: string; sag?: ReactNode; children: ReactNode }) {
  return (
    <section className={`konu konu-${renk}`}>
      <header>
        <h3>{ad}</h3>
        {sag}
      </header>
      <div className="konu-dugmeler">{children}</div>
    </section>
  );
}

export function EgitmenEkrani({
  durum,
  figurler,
  senaryo,
  makro,
  calistir,
  onizleme,
  sonSifirlamaZamani,
}: {
  durum: SimulasyonDurumu;
  figurler: Figur[];
  senaryo: SenaryoDurumu | null;
  makro: MakroDurumu | null;
  calistir: Calistir;
  onizleme: { veri: string; zaman: number } | null;
  sonSifirlamaZamani?: number;
}) {
  const { seciliYon, setSeciliYon, bildir } = useArayuz();
  const [klipler, setKlipler] = useState<KlipOzeti[]>([]);
  const [basilan, setBasilan] = useState<string | null>(null);
  const sayac = useRef(0);
  const sihhiyeGorevleri = useRef<Array<{ yaraliId: string; zaman: number }>>([]);
  useEffect(() => {
    void calistir(() => api.klipler()).then((k) => k && setKlipler(k));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const yer = yerAdi(seciliYon);
  const oda2 = durum.oda === "oda2";
  const c = durum.catisma ?? { aktif: false, siddet: 0.5, yon: 0, dostAtes: true };

  // --- Klip seçimi: yeni modeller öncelikli (manifest `eski` gizli)
  const guncel = klipler.filter((k) => !k.eski);
  const havuz = guncel.length ? guncel : klipler;
  const grup = (k: KlipOzeti) => k.grup ?? (k.kategori === "figur" ? "nesne" : k.kategori);
  const adlar = (g: string, desen: RegExp) => havuz.filter((k) => grup(k) === g && desen.test(k.ad)).map((k) => k.ad);
  const askerler = adlar("asker", /_(bekleyen|nisan)$/);
  const tanklar = havuz.filter((k) => grup(k) === "tank").map((k) => k.ad);
  const kosan = adlar("asker", /_kosan$/)[0];
  const yaraliKlip = adlar("yarali", /_yarali$/)[0];
  const sihhiyeci = adlar("sihhiye", /_sihhiyeci$/)[0];

  const vurulabilir = vurulabilirAskerler(figurler, klipler);
  const yaralilar = figurler.filter((f) => f.poz === "yarali");
  const sihhiyesiz = yaralilar.filter((y) => !figurler.some((f) => f.yaninda === y.id)).length;
  const askerSayisi = figurler.filter((f) => f.poz !== "yarali").length;

  /** Düğmeye basıldı izlenimi + işlem + kısa bildirim. */
  const yap = (anahtar: string, islem: () => Promise<unknown>, baslik: string, metin?: string) => {
    setBasilan(anahtar);
    window.setTimeout(() => setBasilan((b) => (b === anahtar ? null : b)), 500);
    void calistir(islem).then((r) => r !== undefined && r !== false && bildir({ tur: "basari", baslik, metin }));
  };
  const cagir = (klip: string, sapma = 0, yukseklik = -7, ek: Partial<FigurKomutu> = {}) => api.figur({ islem: "oynat", klip, azimut: yonAzimut(seciliYon + sapma), yukseklik, olcek: 1, yansit: false, dongu: true, ...ek });
  const efekt = (tur: EfektTuru, baslik: string, siddet = 1) => yap(tur, () => api.efekt({ tur, siddet, yon: seciliYon, mesafe: durum.oda2.uzakSesMesafesi }), baslik, `${yer} tarafı`);

  const askerCagir = () => {
    const ad = askerler[sayac.current++ % Math.max(1, askerler.length)];
    if (ad) yap("asker", () => cagir(ad), "Asker geldi", `${yer} tarafı`);
  };
  const mevziKur = () =>
    yap(
      "mevzi",
      async () => {
        const nesil = sifirlamaNesli();
        for (const [i, sapma] of [-22, 0, 22].entries()) {
          if (sifirlamaNesli() !== nesil) return false;
          await cagir(askerler[i % askerler.length], sapma, i === 1 ? -9 : -7);
        }
        return true;
      },
      "Üç asker mevzide",
      `${yer} tarafı`,
    );
  const sihhiyeciGonder = () => {
    const simdi = Date.now();
    sihhiyeGorevleri.current = sihhiyeGorevleri.current.filter((g) => simdi - g.zaman < 4000);
    const yarali = sihhiyeBekleyenYarali(figurler, sihhiyeGorevleri.current.map((g) => g.yaraliId));
    if (!sihhiyeci || !yarali) return;
    sihhiyeGorevleri.current.push({ yaraliId: yarali.id, zaman: simdi });
    yap("sihhiye", () => api.figur({ islem: "oynat", klip: sihhiyeci, yaninda: yarali.id, azimut: yarali.azimut, olcek: 1, dongu: true }), "Sıhhiyeci yola çıktı", durum.safha === "ates_altinda" ? "Ateş altında: siperde bekler" : "Yaralının başına gidiyor");
  };
  const askerVuruldu = () => {
    const f = yoneEnYakin(vurulabilir, seciliYon);
    if (f) yap("vuruldu", () => api.figur({ islem: "poz", id: f.id, poz: "yarali" }), "Asker vuruldu", "Yere düştü, yardım çağırıyor");
  };
  /** Çatışma: başlarken düşman seçili yerdedir; izli mermi çatışmayla birlikte açılıp kapanır. */
  const catismaAcKapa = () => {
    if (c.aktif) yap("catisma", () => api.catisma({ aktif: false }).then(() => api.izliMermi({ aktif: false })), "Çatışma durdu");
    else yap("catisma", () => api.catisma({ aktif: true, yon: seciliYon, siddet: c.siddet < 0.2 ? 0.6 : c.siddet }), "Çatışma başladı", `Düşman ${yer.toLocaleLowerCase("tr")} tarafta`);
  };
  const heliMakrosu = makro && makro.ad === HELI_MAKRO_ADI ? makro : null;
  const heliIndir = () =>
    yap(
      "heli",
      async () => {
        await api.oda2({ helikopterYonu: seciliYon });
        return api.makro(
          HELI_MAKRO_ADI,
          HELI_DIZISI.map((a, i) => ({ id: `heli_${i}`, gecikmeMs: a.sn * 1000, aciklama: `Helikopter ${HELIKOPTER_ETIKETLERI[a.durum]}`, islem: { tip: "oda2" as const, oda2: { helikopter: a.durum } } })),
        );
      },
      "Helikopter geliyor",
      "Yaklaşır, iner, yerde bekler (yaklaşık 35 sn)",
    );

  const D = ({ k, ad, alt, onClick, pasif, vurgu }: { k: string; ad: string; alt?: string; onClick: () => void; pasif?: boolean; vurgu?: boolean }) => (
    <button type="button" className={`eylem ${basilan === k ? "basildi" : ""} ${vurgu ? "vurgu" : ""}`} disabled={pasif} onClick={onClick}>
      <strong>{ad}</strong>
      {alt && <small>{alt}</small>}
    </button>
  );

  const temizleniyor = Boolean(onizleme && sonSifirlamaZamani !== undefined && onizleme.zaman < sonSifirlamaZamani);
  const senaryoAcik = senaryo?.senaryoId && senaryo.durum !== "duruyor";

  return (
    <div className="egitmen">
      {senaryoAcik && senaryo && (
        <div className={`senaryo-seridi ${senaryo.durum}`} role="status">
          <div className="senaryo-seridi-ad">
            <span>{senaryo.durum === "oynuyor" ? "Senaryo oynuyor" : senaryo.durum === "bekliyor" ? "Senaryo seni bekliyor" : "Senaryo duraklatıldı"}</span>
            <strong>{senaryo.ad ?? "Senaryo"}</strong>
            {senaryo.durum === "bekliyor" && senaryo.bekleme && <em>{senaryo.bekleme.mesaj}</em>}
          </div>
          <div className="senaryo-seridi-ray">
            <i style={{ width: senaryo.toplamMs ? `${Math.min(100, (senaryo.konumMs / senaryo.toplamMs) * 100)}%` : "0%" }} />
          </div>
          <span className="senaryo-seridi-sure">
            {sureBicimi(senaryo.konumMs)} / {sureBicimi(senaryo.toplamMs)}
          </span>
          {senaryo.durum === "oynuyor" ? (
            <button type="button" data-kilit-serbest onClick={() => void calistir(() => api.senaryoDuraklat())}>
              Duraklat
            </button>
          ) : (
            <button type="button" className="birincil" data-kilit-serbest onClick={() => void calistir(() => (senaryo.durum === "bekliyor" ? api.senaryoDevam() : api.senaryoOynat()))}>
              Devam et
            </button>
          )}
          <button type="button" className="tehlike" data-kilit-serbest onClick={() => void calistir(() => api.senaryoDur())}>
            Bitir
          </button>
        </div>
      )}

      <DuvarSeridi
        yon={seciliYon}
        onYon={setSeciliYon}
        figurler={figurler}
        onizleme={onizleme}
        temizleniyor={temizleniyor}
        dusmanYonu={c.aktif ? c.yon : null}
        helikopterYonu={oda2 && durum.oda2.helikopter !== "yok" ? (durum.oda2.helikopterYonu ?? 12) : null}
      />

      <div className="konular">
        {oda2 && (
          <>
            <Konu ad="Güvenli alan" renk="gok">
              {(Object.keys(GUVENLI_ALAN_ETIKETLERI) as GuvenliAlanTipi[]).map((g) => (
                <button key={g} type="button" className={`eylem ${durum.oda2.guvenliAlan === g ? "secili" : ""}`} onClick={() => void calistir(() => api.oda2({ guvenliAlan: g }))}>
                  <strong>{GUVENLI_ALAN_ETIKETLERI[g]}</strong>
                </button>
              ))}
            </Konu>
            <Konu ad="Helikopter" renk="amber" sag={<span className="konu-durum">{durum.oda2.helikopter === "yok" ? "Sahnede yok" : HELIKOPTER_ETIKETLERI[durum.oda2.helikopter]}</span>}>
              <D k="heli" ad="Helikopter insin" alt={`${yer} tarafına`} onClick={heliIndir} pasif={Boolean(heliMakrosu) || durum.oda2.helikopter !== "yok"} vurgu />
              <D
                k="kalkis"
                ad="Helikopter kalksın"
                alt="Havalanır, uzaklaşır"
                pasif={durum.oda2.helikopter === "yok"}
                onClick={() => yap("kalkis", () => (heliMakrosu ? api.makroDur().catch(() => undefined) : Promise.resolve(undefined)).then(() => api.oda2({ helikopter: "kalkiyor" })), "Helikopter kalkıyor")}
              />
            </Konu>
          </>
        )}

        <Konu ad="Askerler" renk="nvg" sag={<span className="konu-durum">{askerSayisi ? `Sahnede ${askerSayisi}` : "Sahne boş"}</span>}>
          <D k="asker" ad="Asker" alt="Bir asker gelir" onClick={askerCagir} pasif={!askerler.length} />
          {!oda2 && <D k="mevzi" ad="Üç asker" alt="Yan yana mevzilenir" onClick={mevziKur} pasif={!askerler.length} />}
          {!oda2 && <D k="tank" ad="Tank" alt="Açık alana gelir" pasif={!tanklar.length} onClick={() => yap("tank", () => cagir(tanklar[0], 0, -5), "Tank geldi", `${yer} tarafı`)} />}
          <D k="kosSag" ad="Koşan asker →" alt="Soldan sağa geçer" pasif={!kosan} onClick={() => yap("kosSag", () => cagir(kosan, -40, -6), "Asker sağa koşuyor")} />
          <D k="kosSol" ad="← Koşan asker" alt="Sağdan sola geçer" pasif={!kosan} onClick={() => yap("kosSol", () => cagir(kosan, 40, -6, { yansit: true }), "Asker sola koşuyor")} />
          {figurler.length > 0 && (
            <OnayliDugme sinif="eylem sessiz" onay="Hepsi gitsin mi?" onClick={() => yap("temizle", () => api.figur({ islem: "temizle" }), "Askerler çekildi")}>
              <strong>Hepsini çek</strong>
              <small>Sahnedeki herkes gider</small>
            </OnayliDugme>
          )}
        </Konu>

        <Konu ad="Yaralı" renk="izli" sag={<span className="konu-durum">{yaralilar.length ? `${yaralilar.length} yaralı${sihhiyesiz ? ` · ${sihhiyesiz} tanesi sıhhiyeci bekliyor` : ""}` : "Yaralı yok"}</span>}>
          <D k="vuruldu" ad="Asker vuruldu" alt={vurulabilir.length ? `${yer} taraftaki asker düşer` : "Önce asker çağır"} onClick={askerVuruldu} pasif={!vurulabilir.length} vurgu />
          <D k="yarali" ad="Yerde yaralı" alt="Yakında yatar, yardım ister" pasif={!yaraliKlip} onClick={() => yap("yarali", () => cagir(yaraliKlip, 0, oda2 ? -26 : -12), "Yaralı yerde", `${yer} tarafı`)} />
          <D k="sihhiye" ad="Sıhhiyeci gönder" alt={!yaralilar.length ? "Önce yaralı olmalı" : sihhiyesiz ? "Sıradaki yaralıya gider" : "Her yaralının başında var"} onClick={sihhiyeciGonder} pasif={!sihhiyeci || !yaralilar.length} />
          {!oda2 && (
            <div className="safha">
              <span>Durum</span>
              <div className="safha-dugmeler">
                {SAFHALAR.map((s) => (
                  <button key={s.safha} type="button" className={(durum.safha ?? "taktik_saha") === s.safha ? "secili" : ""} onClick={() => void calistir(() => api.safha(s.safha))}>
                    {s.ad}
                  </button>
                ))}
              </div>
              <small>{SAFHALAR.find((s) => s.safha === (durum.safha ?? "taktik_saha"))?.aciklama}</small>
            </div>
          )}
        </Konu>

        {!oda2 && (
          <Konu ad="Çatışma" renk="amber" sag={<span className={`konu-durum ${c.aktif ? "acik" : ""}`}>{c.aktif ? "Sürüyor" : "Yok"}</span>}>
            <button type="button" className={`eylem buyuk-anahtar ${c.aktif ? "acik" : ""} ${basilan === "catisma" ? "basildi" : ""}`} onClick={catismaAcKapa}>
              <strong>{c.aktif ? "Çatışmayı durdur" : "Çatışmayı başlat"}</strong>
              <small>{c.aktif ? "Ateş kesilir" : `Düşman ${yer.toLocaleLowerCase("tr")} taraftan ateş eder`}</small>
            </button>
            <div className="siddet">
              <span>Şiddet</span>
              <div className="safha-dugmeler">
                {SIDDETLER.map(([v, ad]) => (
                  <button key={ad} type="button" className={Math.abs(c.siddet - v) < 0.16 ? "secili" : ""} onClick={() => void calistir(() => api.catisma({ siddet: v }))}>
                    {ad}
                  </button>
                ))}
              </div>
            </div>
            <D k="dusman" ad="Düşman buradan" alt={`${yer} tarafa çevir`} pasif={!c.aktif || c.yon === seciliYon} onClick={() => yap("dusman", () => api.catisma({ yon: seciliYon }), "Düşman yönü değişti", `${yer} tarafı`)} />
            <button
              type="button"
              className={`eylem ${durum.izliMermi.aktif ? "secili" : ""}`}
              onClick={() => {
                const az = yonAzimut(seciliYon);
                const duvar = az < -45 ? 0 : az > 45 ? 2 : 1;
                void calistir(() => api.izliMermi(durum.izliMermi.aktif ? { aktif: false } : { aktif: true, cikisNoktasi: duvar, yon: 0, siklik: 4 }));
              }}
            >
              <strong>İzli mermi</strong>
              <small>{durum.izliMermi.aktif ? "Açık · kapatmak için dokun" : "Işıklı mermiler üstünüze gelir"}</small>
            </button>
          </Konu>
        )}

        {!oda2 && (
          <Konu ad="Patlama ve ateş" renk="turuncu">
            <D k="patlama" ad="Patlama" alt="Çukur ve duman bırakır" onClick={() => efekt("patlama", "Patlama")} vurgu />
            <D k="havan" ad="Havan" alt="Önce ıslık, sonra patlama" onClick={() => efekt("havan", "Havan geliyor")} />
            <D k="yangin" ad="Yangın" alt="Söndürene kadar yanar" onClick={() => efekt("yangin", "Yangın başladı", 0.8)} />
            <D k="yangin_sondur" ad="Yangını söndür" alt="Bütün yangınlar söner" onClick={() => efekt("yangin_sondur", "Yangınlar söndü")} />
            <D k="toz_duman" ad="Toz bulutu" alt="Görüşü kapatır" onClick={() => efekt("toz_duman", "Toz bulutu", 0.8)} />
            <D k="fisek" ad="Aydınlatma fişeği" alt="Geceyi aydınlatır" onClick={() => efekt("fisek", "Fişek atıldı")} />
            <D k="duvar_yik" ad="Duvarı patlat" alt="Duvar tuğla tuğla yıkılır" onClick={() => efekt("duvar_yik", "Duvar yıkıldı")} />
            <D k="zirhli_arac" ad="Zırhlı araç gelsin" alt="Gelir, durur, ateş açar" onClick={() => efekt("zirhli_arac", "Zırhlı araç geliyor")} />
          </Konu>
        )}

        <Konu ad="Sesler" renk="gok">
          <D k="bagirma" ad="Bağırma" alt="“Yaralı var!”" onClick={() => efekt("bagirma", "Bağırma")} />
          <D k="cagirma" ad="Çağırma" alt="“Sıhhiye!”" onClick={() => efekt("cagirma", "Çağırma")} />
          {!oda2 && <D k="gurultu" ad="Silah sesi" alt="Yakından seri atış" onClick={() => efekt("gurultu", "Silah sesi", 0.8)} />}
          <D k="uzak_patlama" ad="Uzak patlama" alt="Uzaktan gümbürtü" onClick={() => efekt("uzak_patlama", "Uzak patlama", 0.8)} />
          <D k="uzak_mermi_sesi" ad="Uzak silah sesi" alt="Uzaktan atışlar" onClick={() => efekt("uzak_mermi_sesi", "Uzak silah sesi", 0.7)} />
        </Konu>

        {!oda2 && (
          <Konu ad="Hazır olaylar" renk="kum" sag={makro && !heliMakrosu ? <span className="konu-durum acik">{makro.ad} sürüyor</span> : <span className="konu-durum">Tek dokunuşla olay dizisi</span>}>
            {makrolar(seciliYon).map((m) => (
              <D key={m.ad} k={`makro_${m.ad}`} ad={m.ad} alt={MAKRO_ACIKLAMA[m.ad] ?? m.aciklama} onClick={() => yap(`makro_${m.ad}`, () => api.makro(m.ad, m.adimlar), `${m.ad} başladı`, `${yer} tarafı`)} />
            ))}
            {makro && !heliMakrosu && <D k="makroDur" ad="Olayı durdur" alt="Kalan adımlar iptal" onClick={() => yap("makroDur", () => api.makroDur(), "Olay durduruldu")} />}
          </Konu>
        )}
      </div>
    </div>
  );
}

const MAKRO_ACIKLAMA: Record<string, string> = {
  Pusu: "Havan, çatışma, bağırma, patlama",
  "Havan baskını": "Art arda üç havan",
  "Gece aydınlatma": "İki fişek art arda",
  "Temas kes": "Ateş durur, yangın söner",
};
