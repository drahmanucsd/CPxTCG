import type { MelodyComparison, NoteComparison } from '@shed/theory';

const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const noteName = (m: number) => NAMES[((m % 12) + 12) % 12]!;

const TONE: Record<string, string> = {
  clean: 'var(--color-good)',
  early: 'var(--color-warn)',
  late: 'var(--color-warn)',
  flat: 'var(--color-bad)',
  wrongPitch: 'var(--color-bad)',
  split: 'var(--color-bad)',
  merged: 'var(--color-bad)',
  missed: '#5b6570',
};

/**
 * The written line, and what you played on top of it.
 *
 * Outlined bars are the book; filled bars underneath are you, drawn where and for as long as you
 * actually played. That makes the three errors that a numeric score hides visible at a glance: a
 * held note you struck twice shows as two short bars under one long one, a flattened syncopation
 * shows as a bar shifted right onto the bar line, and a wrong note shows at the wrong height.
 *
 * Positions are where the notes should *sound*, not where they sit on the page — with swing on,
 * a written off-beat belongs late, and drawing it on the page grid would mark a correct
 * performance wrong.
 */
export function MelodyView({
  comparison, beatsPerBar = 4, bars, onPickBar,
}: {
  comparison: MelodyComparison;
  beatsPerBar?: number;
  bars?: number;
  onPickBar?: (bar: number) => void;
}) {
  const notes = comparison.notes;
  if (!notes.length) return <div className="text-sm text-ink-dim">Nothing written here.</div>;

  const totalBars = bars ?? Math.max(1, Math.ceil(Math.max(...notes.map((n) => n.expectedBeat + n.writtenBeats)) / beatsPerBar));
  const totalBeats = totalBars * beatsPerBar;
  const pitches = notes.flatMap((n) => [n.midi, n.playedMidi ?? n.midi]);
  const lo = Math.min(...pitches) - 2;
  const hi = Math.max(...pitches) + 2;

  const W = 720, padL = 8, padR = 8, padT = 16, rowH = 9;
  const H = padT + (hi - lo + 1) * rowH + 22;
  const x = (beat: number) => padL + (beat / totalBeats) * (W - padL - padR);
  const y = (midi: number) => padT + (hi - midi) * rowH;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="written melody against what you played">
      {/* bar lines and the beat grid */}
      {Array.from({ length: totalBeats + 1 }, (_, b) => {
        const bar = b % beatsPerBar === 0;
        return (
          <g key={b}>
            <line x1={x(b)} y1={padT - 8} x2={x(b)} y2={H - 16} stroke="var(--color-line)" strokeWidth={bar ? 1.5 : 0.7} opacity={bar ? 1 : 0.45} />
            {bar && b < totalBeats && (
              <text
                x={x(b) + 4} y={H - 4} fontSize={10} fill="#5b6570"
                className={onPickBar ? 'cursor-pointer' : ''}
                onClick={onPickBar ? () => onPickBar(b / beatsPerBar) : undefined}
              >bar {b / beatsPerBar + 1}</text>
            )}
          </g>
        );
      })}

      {notes.map((n, i) => <NoteRow key={i} n={n} x={x} y={y} rowH={rowH} />)}

      {comparison.extra.map((e, i) => (
        <rect
          key={`x${i}`} x={x(e.startBeat)} y={y(e.midi) + rowH * 0.55} width={Math.max(4, x(e.startBeat + e.beats) - x(e.startBeat))} height={rowH * 0.55}
          rx={2} fill="var(--color-bad)" opacity={0.5}
        />
      ))}
    </svg>
  );
}

function NoteRow({ n, x, y, rowH }: { n: NoteComparison; x: (b: number) => number; y: (m: number) => number; rowH: number }) {
  const tone = TONE[n.verdict] ?? 'var(--color-warn)';
  const wx = x(n.expectedBeat);
  const ww = Math.max(5, x(n.expectedBeat + n.writtenBeats) - wx);
  return (
    <g>
      <title>{`${noteName(n.midi)} · bar ${n.bar + 1} · ${n.message}`}</title>
      {/* the book */}
      <rect x={wx} y={y(n.midi) - rowH * 0.42} width={ww} height={rowH * 0.8} rx={2} fill="none" stroke={tone} strokeWidth={1.4} strokeDasharray={n.verdict === 'missed' ? '3 2' : undefined} />
      {ww > 16 && <text x={wx + 3} y={y(n.midi) - rowH * 0.6} fontSize={8} fill="#8a94a2">{noteName(n.midi)}</text>}
      {/* you */}
      {n.playedBeat !== null && n.playedMidi !== null && (
        <rect
          x={x(n.playedBeat)} y={y(n.playedMidi) + rowH * 0.5}
          width={Math.max(4, x(n.playedBeat + (n.playedBeats ?? 0.2)) - x(n.playedBeat))}
          height={rowH * 0.55} rx={2} fill={tone} opacity={0.85}
        />
      )}
    </g>
  );
}

/** The per-note list: the same information as words, which is what you read after the picture. */
export function NoteList({ comparison, onPickBar }: { comparison: MelodyComparison; onPickBar?: (bar: number) => void }) {
  const bad = comparison.notes.filter((n) => n.verdict !== 'clean');
  if (!bad.length) return null;
  return (
    <ol className="space-y-1 text-sm">
      {bad.map((n, i) => (
        <li key={i} className="flex gap-3">
          <button
            className="text-ink-faint tabular-nums shrink-0 w-14 text-left hover:text-accent"
            onClick={onPickBar ? () => onPickBar(n.bar) : undefined}
          >bar {n.bar + 1}</button>
          <span className="w-8 shrink-0 text-ink-dim">{noteName(n.midi)}</span>
          <span className={n.verdict === 'wrongPitch' || n.verdict === 'split' || n.verdict === 'merged' || n.verdict === 'flat' ? 'text-bad' : 'text-ink-dim'}>{n.message}</span>
        </li>
      ))}
    </ol>
  );
}
