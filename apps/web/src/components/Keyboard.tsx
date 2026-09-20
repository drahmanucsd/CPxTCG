import { useMemo } from 'react';

export interface KeyboardProps {
  /** MIDI range to draw */
  from?: number;
  to?: number;
  /** correct notes played (green) */
  good?: number[];
  /** wrong notes played (red) */
  bad?: number[];
  /** target notes not played (hollow/outlined) */
  missed?: number[];
  /** currently held notes (subtle highlight) */
  held?: number[];
  /** target notes to show as a hint (amber) */
  hint?: number[];
  labels?: boolean;
  className?: string;
  onNote?: (note: number, down: boolean) => void;
}

const BLACK = new Set([1, 3, 6, 8, 10]);
const NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

/** SVG piano keyboard with per-note colouring. Auto-fits its range to the notes it needs to show if from/to omitted. */
export function Keyboard(p: KeyboardProps) {
  const all = [...(p.good ?? []), ...(p.bad ?? []), ...(p.missed ?? []), ...(p.held ?? []), ...(p.hint ?? [])];
  const lo = p.from ?? (all.length ? Math.min(48, Math.floor(Math.min(...all) / 12) * 12) : 48);
  const hi = p.to ?? (all.length ? Math.max(72, Math.ceil((Math.max(...all) + 1) / 12) * 12) : 72);
  const from = Math.max(21, lo), to = Math.min(108, hi);
  const whites = useMemo(() => { const w: number[] = []; for (let n = from; n <= to; n++) if (!BLACK.has(n % 12)) w.push(n); return w; }, [from, to]);
  const W = 24, H = 88, BW = 14, BH = 54;
  const xOfWhite = new Map(whites.map((n, i) => [n, i * W]));
  const colour = (n: number, isBlack: boolean) => {
    if (p.bad?.includes(n)) return 'var(--color-bad)';
    if (p.good?.includes(n)) return 'var(--color-good)';
    if (p.hint?.includes(n)) return 'var(--color-accent)';
    if (p.held?.includes(n)) return isBlack ? '#6b7d92' : '#c9d3df';
    return isBlack ? '#101318' : '#f1eee7';
  };
  const stroke = (n: number) => (p.missed?.includes(n) ? 'var(--color-accent)' : '#2a323d');
  const width = whites.length * W;
  return (
    <svg viewBox={`0 0 ${width} ${H}`} className={p.className ?? 'w-full'} style={{ maxHeight: 180 }} role="img" aria-label="keyboard">
      {whites.map((n) => (
        <g key={n} onPointerDown={() => p.onNote?.(n, true)} onPointerUp={() => p.onNote?.(n, false)} onPointerLeave={() => p.onNote?.(n, false)}>
          <rect x={xOfWhite.get(n)} y={0} width={W - 1} height={H} rx={3} fill={colour(n, false)} stroke={stroke(n)} strokeWidth={p.missed?.includes(n) ? 3 : 1} />
          {p.labels && n % 12 === 0 && <text x={xOfWhite.get(n)! + W / 2 - 0.5} y={H - 6} fontSize={8} textAnchor="middle" fill="#5b6570">C{Math.floor(n / 12) - 1}</text>}
          {p.missed?.includes(n) && <text x={xOfWhite.get(n)! + W / 2 - 0.5} y={H - 18} fontSize={9} textAnchor="middle" fill="var(--color-accent)">{NAMES[n % 12]}</text>}
        </g>
      ))}
      {Array.from({ length: to - from + 1 }, (_, i) => from + i).filter((n) => BLACK.has(n % 12)).map((n) => {
        const leftWhite = n - 1;
        const x = (xOfWhite.get(leftWhite) ?? 0) + W - BW / 2 - 0.5;
        return (
          <g key={n} onPointerDown={() => p.onNote?.(n, true)} onPointerUp={() => p.onNote?.(n, false)} onPointerLeave={() => p.onNote?.(n, false)}>
            <rect x={x} y={0} width={BW} height={BH} rx={2} fill={colour(n, true)} stroke={stroke(n)} strokeWidth={p.missed?.includes(n) ? 3 : 1} />
            {p.missed?.includes(n) && <text x={x + BW / 2} y={BH - 6} fontSize={8} textAnchor="middle" fill="var(--color-accent)">{NAMES[n % 12]}</text>}
          </g>
        );
      })}
    </svg>
  );
}
