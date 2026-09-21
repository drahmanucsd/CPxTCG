import { useRef, useState } from 'react';

export const BPM_MIN = 30;
export const BPM_MAX = 300;

const clamp = (n: number) => Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(n)));

/**
 * The one tempo control: a typed value, a slider, coarse ±5, fine ±1, and tap tempo.
 * Used by the drill's metronome panel, the pause overlay and the editor — there is deliberately
 * no second place in the app where a bpm can be nudged.
 */
export function TempoControl({ bpm, onChange, disabled, autoFocus }: { bpm: number; onChange: (bpm: number) => void; disabled?: boolean; autoFocus?: boolean }) {
  // only holds a value while you are mid-edit; otherwise the prop is the source of truth, so the
  // speed ladder and tap tempo show up here without an effect syncing two copies of the number
  const [draft, setDraft] = useState<string | null>(null);
  const taps = useRef<number[]>([]);

  const commit = (raw: string) => {
    const n = parseInt(raw, 10);
    setDraft(null);
    if (Number.isFinite(n)) onChange(clamp(n));
  };
  const nudge = (d: number) => onChange(clamp(bpm + d));

  const tap = () => {
    const now = performance.now();
    taps.current = [...taps.current.filter((t) => now - t < 3000), now];
    if (taps.current.length < 3) return;
    const iv = taps.current.slice(1).map((t, i) => t - taps.current[i]!).sort((a, b) => a - b);
    onChange(clamp(60000 / iv[Math.floor(iv.length / 2)]!));
  };

  return (
    <div className="space-y-2" aria-label="Tempo">
      <div className="flex items-center gap-2">
        <button className="btn btn-ghost !px-2.5 tabular-nums" disabled={disabled} onClick={() => nudge(-5)} aria-label="5 slower">−5</button>
        <button className="btn btn-ghost !px-2.5 tabular-nums" disabled={disabled} onClick={() => nudge(-1)} aria-label="1 slower">−1</button>
        <div className="flex items-baseline gap-1">
          <input
            className="input w-20 text-center text-2xl font-semibold tabular-nums !py-1"
            inputMode="numeric"
            autoFocus={autoFocus}
            disabled={disabled}
            value={draft ?? String(bpm)}
            onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ''))}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { commit((e.target as HTMLInputElement).value); (e.target as HTMLInputElement).blur(); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); nudge(e.shiftKey ? 5 : 1); }
              else if (e.key === 'ArrowDown') { e.preventDefault(); nudge(e.shiftKey ? -5 : -1); }
            }}
            aria-label="Beats per minute"
          />
          <span className="text-xs text-ink-faint">bpm</span>
        </div>
        <button className="btn btn-ghost !px-2.5 tabular-nums" disabled={disabled} onClick={() => nudge(1)} aria-label="1 faster">+1</button>
        <button className="btn btn-ghost !px-2.5 tabular-nums" disabled={disabled} onClick={() => nudge(5)} aria-label="5 faster">+5</button>
        <button className="btn btn-ghost !px-2.5 ml-auto" disabled={disabled} onClick={tap} title="Tap three or more beats">Tap</button>
      </div>
      <input
        type="range" min={BPM_MIN} max={BPM_MAX} step={1} value={bpm} disabled={disabled}
        className="w-full" aria-label="Tempo slider"
        onChange={(e) => onChange(clamp(+e.target.value))}
      />
    </div>
  );
}
