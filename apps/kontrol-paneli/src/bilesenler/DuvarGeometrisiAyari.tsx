/**
 * Duvar geometrisi (Sistem sekmesi): U duvar / düz duvar ölçüleri ve izleyici konumu. Oynatıcıya `?oda=` ile geçer
 * (ör. `u,on=6,yan=4,yuk=3,alt=0.3,x=0,z=3,goz=1.7`); oynatıcı her duvarı izleyicinin gözünden doğru perspektifle
 * çizer (genelleştirilmiş perspektif, ufuk göz hizasında). Açı hesabı oynatıcıdaki `projeksiyon.ts` ile aynı formül;
 * panel oynatıcı kodunu içe aktaramadığından küçük bir kopyası burada (biçim değişirse ikisi birlikte güncellenir).
 *
 * "Varsayılan" seçilince `oda=sifirla` gönderilir: oynatıcı önceki ölçüyü yerel kaydında tutuyorsa onu da siler.
 */
import { useMemo, useState, type ReactNode } from "react";
import { useArayuz } from "../arayuz";
import { Bolum, Rozet, SecenekGrubu } from "./ortak";

type Secim = "varsayilan" | "u" | "duz";
type OdaTipi = "u" | "duz";
type Alan = "on" | "yan" | "yuk" | "alt" | "z" | "x" | "goz";
type Olculer = Record<Alan, number>;

const SECIM_ETIKETLERI: Record<Secim, string> = { varsayilan: "Varsayılan (her duvar 90°)", u: "U duvar", duz: "Düz duvar (3 projektör)" };

/** Form alanları (sıra = ekrandaki sıra); düz duvarda yan duvar yok. */
const ALANLAR: Record<OdaTipi, Array<{ alan: Alan; etiket: string }>> = {
  u: [
    { alan: "on", etiket: "Ön duvar genişliği" },
    { alan: "yan", etiket: "Yan duvar boyu, ön köşeden" },
    { alan: "yuk", etiket: "Görüntü yüksekliği" },
    { alan: "alt", etiket: "Görüntü alt kenarı, yerden" },
    { alan: "z", etiket: "İzleyicinin ön duvara uzaklığı" },
    { alan: "x", etiket: "İzleyicinin yanal kayması, sağa +" },
    { alan: "goz", etiket: "Göz yüksekliği" },
  ],
  duz: [
    { alan: "on", etiket: "Duvar genişliği, 3 projektör toplam" },
    { alan: "yuk", etiket: "Görüntü yüksekliği" },
    { alan: "alt", etiket: "Görüntü alt kenarı, yerden" },
    { alan: "z", etiket: "İzleyicinin duvara uzaklığı" },
    { alan: "x", etiket: "İzleyicinin yanal kayması, sağa +" },
    { alan: "goz", etiket: "Göz yüksekliği" },
  ],
};

const VARSAYILAN_OLCULER: Record<OdaTipi, Olculer> = {
  u: { on: 6, yan: 4, yuk: 3, alt: 0.3, z: 3, x: 0, goz: 1.7 },
  duz: { on: 9, yan: 0, yuk: 2.5, alt: 0.3, z: 4, x: 0, goz: 1.7 },
};
const ANAHTARLAR: Alan[] = ["on", "yan", "yuk", "alt", "x", "z", "goz"];

/** Kayıtlı `oda` parametresini forma geri okur (oynatıcının biçimi; eksik isteğe bağlı alanlar oynatıcıdaki gibi). */
function cozumle(metin: string | undefined): { tip: OdaTipi; olculer: Olculer } | null {
  if (!metin) return null;
  const [tipHam, ...parcalar] = metin.trim().toLowerCase().split(",");
  const tip = tipHam.trim();
  if (tip !== "u" && tip !== "duz") return null;
  const olculer: Olculer = { ...VARSAYILAN_OLCULER[tip], alt: 0, x: 0, goz: 1.7 };
  for (const p of parcalar) {
    const [a, d] = p.split("=").map((s) => s.trim());
    const deger = Number(d);
    if ((ANAHTARLAR as string[]).includes(a) && d !== "" && Number.isFinite(deger)) olculer[a as Alan] = deger;
  }
  return { tip, olculer };
}

/** Oynatıcının `odaGeometrisiYaz` biçimi: milimetreye yuvarlı, ondalık nokta, sabit anahtar sırası. */
function odaMetni(tip: OdaTipi, o: Olculer): string {
  const m = (v: number) => String(Math.round(v * 1000) / 1000);
  const p = [tip, `on=${m(o.on)}`];
  if (tip === "u") p.push(`yan=${m(o.yan)}`);
  p.push(`yuk=${m(o.yuk)}`, `alt=${m(o.alt)}`, `x=${m(o.x)}`, `z=${m(o.z)}`, `goz=${m(o.goz)}`);
  return p.join(",");
}

function metne(o: Olculer): Record<Alan, string> {
  return Object.fromEntries(ANAHTARLAR.map((a) => [a, String(o[a]).replace(".", ",")])) as Record<Alan, string>;
}

function sayiyaCevir(s: string): number {
  const t = s.trim().replace(",", ".");
  return t === "" ? NaN : Number(t);
}

/** Oynatıcının `odaGecerliMi` kuralları, alan başına okunur mesajla. */
function hatalar(tip: OdaTipi, o: Olculer): Partial<Record<Alan, string>> {
  const h: Partial<Record<Alan, string>> = {};
  if (!(o.on >= 0.5 && o.on <= 60)) h.on = "Genişlik 0,5–60 m olmalı.";
  if (tip === "u" && !(o.yan >= 0.2 && o.yan <= 60)) h.yan = "Yan duvar 0,2–60 m olmalı.";
  if (!(o.yuk >= 0.2 && o.yuk <= 20)) h.yuk = "Görüntü yüksekliği 0,2–20 m olmalı.";
  else {
    // Projektör görüntüsü 16:9 (düz duvarda 3 projektör yan yana: 48:9). Yükseklik duvarın değil görüntünün yüksekliğidir;
    // oran %30'dan çok saparsa oynatıcı görüntüyü ezer/uzatır ve geometriyi reddeder (main.ts geometriMakulMu).
    const beklenen = (tip === "u" ? o.on : o.on / 3) * (9 / 16);
    if (Math.abs(o.yuk / beklenen - 1) > 0.3) h.yuk = `Görüntü 16:9 olmalı: ${o.on} m genişlik için yükseklik ≈ ${beklenen.toFixed(2)} m (duvar yüksekliği değil, yansıtılan görüntünün yüksekliği).`;
  }
  if (!(o.alt >= -2 && o.alt <= 10)) h.alt = "Alt kenar −2…10 m olmalı.";
  if (!(o.z >= 0.2 && o.z <= 60)) h.z = "Duvara uzaklık 0,2–60 m olmalı.";
  if (!(o.goz >= 0.3 && o.goz <= 3)) h.goz = "Göz yüksekliği 0,3–3 m olmalı.";
  if (tip === "u" ? !(Math.abs(o.x) <= o.on / 2 - 0.1) : !(Math.abs(o.x) <= o.on)) {
    h.x = tip === "u" ? "İzleyici iki yan duvarın arasında olmalı (|kayma| ≤ ön/2 − 0,1 m)." : "Yanal kayma duvar genişliğini aşmamalı.";
  }
  return h;
}

interface DuvarAcisi {
  ad: string;
  sol: number;
  sag: number;
}

/**
 * Duvar kenarlarının izleyiciden görünen azimutları (derece; 0 = ön duvara dik bakış, sağa +). Göze göre: ön duvar
 * z mesafede, yan duvarlar ön köşeden `yan` kadar izleyiciye doğru uzanır. Yalnızca 3 duvar kullanılır.
 */
function duvarAcilari(tip: OdaTipi, o: Olculer): DuvarAcisi[] {
  const az = (x: number, ileri: number) => (Math.atan2(x, ileri) * 180) / Math.PI;
  const solX = -o.on / 2 - o.x;
  const sagX = o.on / 2 - o.x;
  if (tip === "duz") {
    const ucte = o.on / 3;
    return ["Sol", "Orta", "Sağ"].map((ad, i) => ({ ad, sol: az(solX + i * ucte, o.z), sag: az(solX + (i + 1) * ucte, o.z) }));
  }
  const arka = o.z - o.yan; // yan duvarın izleyici tarafındaki ucu (negatifse izleyicinin arkasında)
  return [
    { ad: "Sol", sol: az(solX, arka), sag: az(solX, o.z) },
    { ad: "Orta", sol: az(solX, o.z), sag: az(sagX, o.z) },
    { ad: "Sağ", sol: az(sagX, o.z), sag: az(sagX, arka) },
  ];
}

function aci(v: number): string {
  return `${v < -0.05 ? "−" : ""}${Math.abs(v).toFixed(1).replace(".", ",")}°`;
}
function metre(v: number): string {
  return `${(Math.round(v * 100) / 100).toString().replace(".", ",")} m`;
}

function GeometriIkonu() {
  return (
    <svg width={18} height={18} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 15V4h14v11" />
      <path d="M10 14l-5-8M10 14l5-8" strokeDasharray="1.5 2" />
      <circle cx="10" cy="14.5" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Kuş bakışı oda planı: duvarlar (kum), izleyici (amber), göz → duvar kenarı ışınları. */
function OdaPlani({ tip, o, acilar }: { tip: OdaTipi; o: Olculer; acilar: DuvarAcisi[] }) {
  const solX = -o.on / 2 - o.x;
  const sagX = o.on / 2 - o.x;
  const onY = -o.z; // ön duvar çizimin üstünde, izleyici (0, 0)
  const arkaY = tip === "u" ? o.yan - o.z : onY;
  const minX = Math.min(solX, 0);
  const maxX = Math.max(sagX, 0);
  const maxY = Math.max(arkaY, 0);
  const boy = Math.max(maxX - minX, maxY - onY, 1);
  const pay = boy * 0.16;
  const kalin = boy * 0.02;
  const yazi = boy * 0.06;
  const kenarlar: Array<[number, number]> =
    tip === "u"
      ? [
          [solX, arkaY],
          [solX, onY],
          [sagX, onY],
          [sagX, arkaY],
        ]
      : [0, 1, 2, 3].map((i) => [solX + (i * o.on) / 3, onY]);
  const ad = (i: number) => `${acilar[i].ad} ${aci(acilar[i].sag - acilar[i].sol)}`;
  const etiketler: ReactNode[] =
    tip === "u"
      ? [
          <text key="sol" x={solX - kalin * 2} y={(onY + arkaY) / 2} textAnchor="end" dominantBaseline="middle">
            {ad(0)}
          </text>,
          <text key="orta" x={(solX + sagX) / 2} y={onY - kalin * 2.5} textAnchor="middle">
            {ad(1)}
          </text>,
          <text key="sag" x={sagX + kalin * 2} y={(onY + arkaY) / 2} textAnchor="start" dominantBaseline="middle">
            {ad(2)}
          </text>,
        ]
      : [0, 1, 2].map((i) => (
          <text key={i} x={solX + ((i + 0.5) * o.on) / 3} y={onY - kalin * 2.5} textAnchor="middle">
            {ad(i)}
          </text>
        ));
  return (
    <svg
      viewBox={`${minX - pay * 2.2} ${onY - pay * 1.4} ${maxX - minX + pay * 4.4} ${maxY - onY + pay * 2.8}`}
      role="img"
      aria-label={`Oda planı: ${acilar.map((a) => `${a.ad} duvar ${aci(a.sag - a.sol)}`).join(", ")}`}
      style={{ width: "100%", maxHeight: 190, display: "block", fontFamily: "var(--mono)" }}
    >
      {kenarlar.map(([x, y], i) => (
        <line key={i} x1={0} y1={0} x2={x} y2={y} stroke="var(--murekkep-silik)" strokeWidth={kalin * 0.4} strokeDasharray={`${kalin} ${kalin}`} />
      ))}
      <path d={kenarlar.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ")} fill="none" stroke="var(--kum)" strokeWidth={kalin} strokeLinecap="round" strokeLinejoin="round" />
      {tip === "duz" &&
        kenarlar.slice(1, 3).map(([x, y], i) => <line key={`b${i}`} x1={x} y1={y - kalin * 1.4} x2={x} y2={y + kalin * 1.4} stroke="var(--kum)" strokeWidth={kalin * 0.5} />)}
      <g fill="var(--murekkep-2)" fontSize={yazi}>
        {etiketler}
      </g>
      <circle cx={0} cy={0} r={kalin * 1.5} fill="var(--amber)" />
      <text x={0} y={kalin * 2 + yazi} textAnchor="middle" fill="var(--amber)" fontSize={yazi * 0.9}>
        izleyici
      </text>
    </svg>
  );
}

export function DuvarGeometrisiAyari() {
  const { oynaticiParametreleri, setOynaticiParametresi } = useArayuz();
  // Başlangıç: panelin kaydındaki `oda` parametresi (yoksa / "sifirla" ise varsayılan)
  const [baslangic] = useState(() => cozumle(oynaticiParametreleri.oda));
  const [secim, setSecim] = useState<Secim>(baslangic?.tip ?? "varsayilan");
  const [metinler, setMetinler] = useState<Record<OdaTipi, Record<Alan, string>>>(() => ({
    u: metne(baslangic?.tip === "u" ? baslangic.olculer : VARSAYILAN_OLCULER.u),
    duz: metne(baslangic?.tip === "duz" ? baslangic.olculer : VARSAYILAN_OLCULER.duz),
  }));

  const tip: OdaTipi | null = secim === "varsayilan" ? null : secim;
  const olculer = useMemo<Olculer | null>(() => (tip ? (Object.fromEntries(ANAHTARLAR.map((a) => [a, sayiyaCevir(metinler[tip][a])])) as Olculer) : null), [tip, metinler]);
  const hata = useMemo(() => (tip && olculer ? hatalar(tip, olculer) : {}), [tip, olculer]);
  const gecerli = Object.keys(hata).length === 0;
  const acilar = useMemo<DuvarAcisi[]>(
    () =>
      tip && olculer && gecerli
        ? duvarAcilari(tip, olculer)
        : [
            { ad: "Sol", sol: -135, sag: -45 },
            { ad: "Orta", sol: -45, sag: 45 },
            { ad: "Sağ", sol: 45, sag: 135 },
          ],
    [tip, olculer, gecerli],
  );

  /** Geçerli ölçü oynatıcı adresine yazılır; geçersizken son geçerli değer kalır. */
  const kaydet = (t: OdaTipi, m: Record<Alan, string>) => {
    const o = Object.fromEntries(ANAHTARLAR.map((a) => [a, sayiyaCevir(m[a])])) as Olculer;
    if (Object.keys(hatalar(t, o)).length === 0) setOynaticiParametresi("oda", odaMetni(t, o));
  };
  const secimDegistir = (s: Secim) => {
    setSecim(s);
    if (s === "varsayilan") setOynaticiParametresi("oda", "sifirla");
    else kaydet(s, metinler[s]);
  };
  const alanDegistir = (t: OdaTipi, alan: Alan, deger: string) => {
    const yeni = { ...metinler[t], [alan]: deger };
    setMetinler((eski) => ({ ...eski, [t]: yeni }));
    kaydet(t, yeni);
  };

  // Dikey açılar ön duvara dik bakışta (en yakın nokta); ufuk = göz hizası, her duvarda aynı satır
  const dikey = tip && olculer && gecerli ? { alt: (Math.atan((olculer.alt - olculer.goz) / olculer.z) * 180) / Math.PI, ust: (Math.atan((olculer.alt + olculer.yuk - olculer.goz) / olculer.z) * 180) / Math.PI } : null;
  const ufukOrani = tip && olculer && gecerli ? (olculer.alt + olculer.yuk - olculer.goz) / olculer.yuk : 0.5;
  const ozetRozeti = tip && gecerli ? `${tip === "u" ? "U" : "Düz"} · ${acilar.map((a) => Math.round(a.sag - a.sol)).join("/")}°` : tip ? "Ölçü hatalı" : "Varsayılan";

  return (
    <Bolum
      baslik="Duvar geometrisi"
      altBaslik="Gerçek duvar ölçüleri ve izleyici konumu → duvar başına doğru perspektif"
      ikon={<GeometriIkonu />}
      sag={<Rozet tur={tip && !gecerli ? "uyari" : tip ? "amber" : "notr"}>{ozetRozeti}</Rozet>}
    >
      <div className="satir">
        <span className="etiket">Yerleşim</span>
        <SecenekGrubu<Secim> deger={secim} secenekler={SECIM_ETIKETLERI} onChange={secimDegistir} />
      </div>

      {!tip && (
        <p className="aciklama">
          Ölçü girilmedi: her duvar izleyicinin ortada durduğu kare bir U odadaki gibi 90° gösterir, ufuk duvarların
          ortasındadır. Sahada duvarlar ölçüldükten sonra U duvar ya da düz duvar seçip ölçüleri girin.
        </p>
      )}

      {tip && olculer && (
        <>
          <div className="alanlar">
            {ALANLAR[tip].map(({ alan, etiket }) => (
              <label key={alan} className="alan" title={hata[alan]}>
                <span>
                  {etiket} <span className="mono">(m)</span>
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  className="mono"
                  value={metinler[tip][alan]}
                  aria-invalid={hata[alan] ? true : undefined}
                  style={hata[alan] ? { borderColor: "var(--izli)" } : undefined}
                  onChange={(e) => alanDegistir(tip, alan, e.target.value)}
                />
              </label>
            ))}
          </div>
          {!gecerli && (
            <p className="aciklama uyari-metin">
              {Object.values(hata).join(" ")} Oynatıcı adresinde son geçerli ölçü kalır.
            </p>
          )}
          {gecerli && (
            <>
              <OdaPlani tip={tip} o={olculer} acilar={acilar} />
              <ul className="liste">
                {acilar.map((a) => (
                  <li key={a.ad}>
                    <div className="liste-govde">
                      <strong>{a.ad} duvar</strong>
                      <small className="mono">
                        {aci(a.sol)} … {aci(a.sag)}
                      </small>
                    </div>
                    <Rozet tur="amber">{aci(a.sag - a.sol)}</Rozet>
                  </li>
                ))}
              </ul>
              {dikey && (
                <p className="aciklama">
                  Dikey (ön duvara dik bakışta): <span className="mono">{aci(dikey.alt)} … {aci(dikey.ust)}</span>. Ufuk (göz hizası) görüntünün
                  üstünden <span className="mono">%{Math.round(ufukOrani * 100)}</span> aşağıda, yerden {metre(olculer.goz)}.
                  {(ufukOrani < 0 || ufukOrani > 1) && <span className="uyari-metin"> Göz görüntünün dışında kalıyor: ufuk duvarda görünmez.</span>}
                </p>
              )}
              <p className="aciklama">
                Oynatıcı adresi: <code>?oda={odaMetni(tip, olculer)}</code>
              </p>
            </>
          )}
        </>
      )}

      <p className="aciklama">
        Sahada ölçün: duvar genişlikleri, yan duvarın ön köşeden uzunluğu, yansıyan görüntünün yüksekliği ve alt kenarı,
        eğitim alanının ortasındaki izleyicinin duvara uzaklığı ve yanal kayması, göz yüksekliği (ayakta ≈ 1,7 m, diz
        çökmüş ≈ 1,0 m). Sonra üst çubuktaki "Oynatıcı" düğmesiyle açın ve <kbd>K</kbd> tuşuna basın: izleyici noktasından
        bakınca ızgara çizgileri düz görünmeli ve duvar köşelerinde kırılmadan devam etmeli; sarı ufuk çizgisi göz hizasında
        olmalı. Açık oynatıcı penceresi yeni ölçüyü yeniden açılınca alır.
      </p>
    </Bolum>
  );
}
