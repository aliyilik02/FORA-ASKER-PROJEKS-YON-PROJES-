/** Figür grubu simgeleri: tek çizgi ağırlığı (1.75), 24 px ızgara; emoji yerine (tasarım F bileşen kiti). */
const S = ({ children, boyut = 16 }: { children: React.ReactNode; boyut?: number }) => (
  <svg width={boyut} height={boyut} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const GRUP_SIMGELERI: Record<string, (boyut?: number) => JSX.Element> = {
  asker: (b) => (
    <S boyut={b}>
      <circle cx="12" cy="7" r="4" />
      <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
    </S>
  ),
  sihhiye: (b) => (
    <S boyut={b}>
      <path d="M12 5v14M5 12h14" />
      <circle cx="12" cy="12" r="9" />
    </S>
  ),
  yarali: (b) => (
    <S boyut={b}>
      <path d="M4 16h16M8 16V9h8v7" />
      <circle cx="12" cy="6" r="2" />
    </S>
  ),
  tank: (b) => (
    <S boyut={b}>
      <rect x="3" y="11" width="18" height="6" rx="2" />
      <path d="M8 11V8h8v3M12 8V5h7" />
    </S>
  ),
  arac: (b) => (
    <S boyut={b}>
      <path d="M3 13l2-5h12l4 5v4H3z" />
      <circle cx="7" cy="17" r="2" />
      <circle cx="17" cy="17" r="2" />
    </S>
  ),
  silah: (b) => (
    <S boyut={b}>
      <path d="M3 10h14l4 2-4 2H9l-2 4H4l2-4H3z" />
    </S>
  ),
  nesne: (b) => (
    <S boyut={b}>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
      <path d="M4 7.5l8 4.5 8-4.5M12 12v9" />
    </S>
  ),
  yapi: (b) => (
    <S boyut={b}>
      <path d="M3 21V9l9-6 9 6v12" />
      <path d="M9 21v-7h6v7" />
    </S>
  ),
  heli: (b) => (
    <S boyut={b}>
      <path d="M3 5h18M12 5v4" />
      <path d="M6 13a6 4 0 0 1 12 0v2a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3z" />
      <path d="M18 13h3M7 20h10" />
    </S>
  ),
};

export function GrupSimgesi({ grup, boyut = 16 }: { grup?: string; boyut?: number }) {
  const s = GRUP_SIMGELERI[grup ?? ""] ?? GRUP_SIMGELERI.nesne;
  return s(boyut);
}
