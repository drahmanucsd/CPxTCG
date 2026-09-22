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
  /**
    * Of the hinted notes, the ones that CHANGE from the previous chord. Lit brightly while the
    * held notes stay dim — the whole point of voice leading is that only one or two move.
    */
   moved?: number[];
  /** pitch classes (0-11) to outline everywhere they appear — the first rung of the hint ladder */
  tones?: number[];
  /** degree label per pitch class, e.g. { 2: '9', 5: 'b7' }, drawn on outlined keys */
  toneLabels?: Record<number, string>;
  labels?: boolean;
  className?: string;
  onNote?: (note: number, down: boolean) => void;
}

const BLACK = new Set([1, 3, 6, 8, 10]);
const NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

/** SVG piano keyboard with per-note colouring. Auto-fits its range to the notes it needs to show if from/to omitted. */
export function Keyboard(p: KeyboardProps) {
  const all = [...(p.good ?? []), ...(p.bad ?? []), ...(p.missed ?? []), ...(p.held ?? []), ...(p.hint ?? []), ...(p.moved ?? [])];
  const lo = p.from ?? (all.length ? Math.min(48, Math.floor(Math.min(...all) / 12) * 12) : 48);
  const hi = p.to ?? (all.length ? Math.max(72, Math.ceil((Math.max(...all) + 1) / 12) * 12) : 72);
  const from = Math.max(21, lo), to = Math.min(108, hi);
  const whites = useMemo(() => { const w: number[] = []; for (let n = from; n <= to; n++) if (!BLACK.has(n % 12)) w.push(n); return w; }, [from, to]);
  const W = 24, H = 88, BW = 14, BH = 54;
  const xOfWhite = new Map(whites.map((n, i) => [n, i * W]));
  const colour = (n: number, isBlack: boolean) => {
    if (p.bad?.includes(n)) return 'var(--color-bad)';
    if (p.good?.includes(n)) return 'var(--color-good)';
    if (p.moved?.includes(n)) return 'var(--color-accent)';
    if (p.hint?.includes(n)) return p.moved?.length ? '#6f5a2c' : 'var(--color-accent)';
    if (p.held?.includes(n)) return isBlack ? '#6b7d92' : '#c9d3df';
    return isBlack ? '#101318' : '#f1eee7';
  };
  const isTone = (n: number) => !!p.tones?.includes(n % 12) && !p.hint?.includes(n) && !p.good?.includes(n) && !p.bad?.includes(n);
  const stroke = (n: number) => (p.missed?.includes(n) ? 'var(--color-accent)' : isTone(n) ? 'var(--color-accent)' : '#2a323d');
  const dash = (n: number) => (isTone(n) ? '3 2' : undefined);
  const width = whites.length * W;
  return (
    <svg viewBox={`0 0 ${width} ${H}`} className={p.className ?? 'w-full'} style={{ maxHeight: 180 }} role="img" aria-label="keyboard">
      {whites.map((n) => (
        <g key={n} onPointerDown={() => p.onNote?.(n, true)} onPointerUp={() => p.onNote?.(n, false)} onPointerLeave={() => p.onNote?.(n, false)}>
          <rect x={xOfWhite.get(n)} y={0} width={W - 1} height={H} rx={3} fill={colour(n, false)} stroke={stroke(n)} strokeDasharray={dash(n)} strokeWidth={p.missed?.includes(n) || isTone(n) ? 3 : 1} />
          {isTone(n) && p.toneLabels?.[n % 12] && <text x={xOfWhite.get(n)! + W / 2 - 0.5} y={H - 30} fontSize={9} textAnchor="middle" fill="var(--color-accent)">{p.toneLabels[n % 12]}</text>}
          {p.labels && n % 12 === 0 && <text x={xOfWhite.get(n)! + W / 2 - 0.5} y={H - 6} fontSize={8} textAnchor="middle" fill="#5b6570">C{Math.floor(n / 12) - 1}</text>}
          {p.missed?.includes(n) && <text x={xOfWhite.get(n)! + W / 2 - 0.5} y={H - 18} fontSize={9} textAnchor="middle" fill="var(--color-accent)">{NAMES[n % 12]}</text>}
        </g>
      ))}
      {Array.from({ length: to - from + 1 }, (_, i) => from + i).filter((n) => BLACK.has(n % 12)).map((n) => {
        const leftWhite = n - 1;
        const x = (xOfWhite.get(leftWhite) ?? 0) + W - BW / 2 - 0.5;
        return (
          <g key={n} onPointerDown={() => p.onNote?.(n, true)} onPointerUp={() => p.onNote?.(n, false)} onPointerLeave={() => p.onNote?.(n, false)}>
            <rect x={x} y={0} width={BW} height={BH} rx={2} fill={colour(n, true)} stroke={stroke(n)} strokeDasharray={dash(n)} strokeWidth={p.missed?.includes(n) || isTone(n) ? 2.5 : 1} />
            {isTone(n) && p.toneLabels?.[n % 12] && <text x={x + BW / 2} y={BH - 18} fontSize={7} textAnchor="middle" fill="var(--color-accent)">{p.toneLabels[n % 12]}</text>}
            {p.missed?.includes(n) && <text x={x + BW / 2} y={BH - 6} fontSize={8} textAnchor="middle" fill="var(--color-accent)">{NAMES[n % 12]}</text>}
          </g>
        );
      })}
    </svg>
  );
}
