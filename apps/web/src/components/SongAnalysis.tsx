import { useMemo } from 'react';
import { analyzeSong, keyName, romanPerBar, type Song } from '@shed/theory';

/**
 * The shape of the tune, before you play a note of it.
 *
 * The point is recognition: a new standard is mostly ii-V-Is you already know and sections that
 * repeat, and seeing that is what makes learning one fast (docs/11-platform.md, loop 2 stage 2).
 */
export function SongAnalysis({ song, onPickSection, selected }: {
  song: Song;
  onPickSection?: (from: number, to: number) => void;
  selected?: [number, number] | null;
}) {
  const a = useMemo(() => analyzeSong(song), [song]);
  const romans = useMemo(() => romanPerBar(song, a), [song, a]);

  return (
    <div className="space-y-4">
      <div>
        <div className="label">The shape</div>
        <div className="text-sm mt-1">{a.summary}</div>
      </div>

      <div className="space-y-1">
        <div className="label">Sections</div>
        <div className="flex flex-wrap gap-2">
          {a.sections.map((s, i) => {
            const on = selected && selected[0] === s.from && selected[1] === s.to;
            const body = (
              <>
                <span className="font-medium">{s.label}</span>
                <span className="text-ink-faint"> · {s.bars} bars · {keyName(s.key)}</span>
                {s.sameAs && (
                  <span className="text-good"> · same as {s.sameAs}
                    {s.differsAt?.length ? ` except bar ${s.differsAt.map((d) => d - s.from + 1).join(' & ')}` : ''}
                  </span>
                )}
              </>
            );
            return onPickSection ? (
              <button
                key={`${s.label}${i}`}
                className={`rounded-lg px-3 py-1.5 text-sm text-left bg-panel-2 hover:bg-line ${on ? 'ring-1 ring-accent' : ''}`}
                onClick={() => onPickSection(s.from, s.to)}
              >{body}</button>
            ) : (
              <span key={`${s.label}${i}`} className="rounded-lg px-3 py-1.5 text-sm bg-panel-2">{body}</span>
            );
          })}
        </div>
      </div>

      {a.cadences.length > 0 && (
        <div className="space-y-1">
          <div className="label">ii-V-Is ({a.cadences.length})</div>
          <div className="flex flex-wrap gap-1.5">
            {a.cadences.map((c, i) => (
              <span
                key={i}
                className={`rounded-md px-2 py-1 text-xs ${c.kind === 'iiVI' ? 'bg-good/15 text-good' : 'bg-warn/15 text-warn'}`}
                title={c.kind === 'iiVI' ? 'resolves' : 'does not resolve'}
              >
                bar {c.from + 1} · {c.label}
              </span>
            ))}
          </div>
          <div className="text-xs text-ink-faint">
            Green resolves to its I; amber is a ii-V that moves somewhere else.
          </div>
        </div>
      )}

      <div className="space-y-1">
        <div className="label">In numerals</div>
        <div className="flex flex-wrap gap-1 font-mono text-xs">
          {romans.map((r, i) => {
            const sec = a.sections.find((s) => i >= s.from && i <= s.to);
            const first = sec?.from === i;
            return (
              <span key={i} className={`rounded px-1.5 py-0.5 tabular-nums ${first ? 'bg-accent/20 text-ink' : 'bg-panel-2 text-ink-dim'}`} title={`bar ${i + 1}${sec ? ` · ${sec.label} · ${keyName(sec.key)}` : ''}`}>
                {r ?? '—'}
              </span>
            );
          })}
        </div>
        <div className="text-xs text-ink-faint">Relative to each section's own key, not the tune's.</div>
      </div>
    </div>
  );
}
