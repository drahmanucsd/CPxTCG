import { useEffect, useRef } from 'react';
import { parseChord, type Bar, type FormBar } from '@shed/theory';
import { ChordText } from './ChordDisplay';
import { useSettings } from '../store/settings';

export interface GridBar {
  key: string | number;
  chords: Array<{ text: string; beats: number }>;
  section?: string;
  repeatStart?: boolean;
  repeatEnd?: number;
  ending?: number;
  segno?: boolean;
  coda?: boolean;
  toCoda?: boolean;
  jump?: string;
  fine?: boolean;
  timeSig?: [number, number];
}

export function writtenBars(bars: Bar[]): GridBar[] {
  return bars.map((b, i) => ({
    key: i, chords: b.chords.map((c) => ({ text: c.chord ? c.chord.text : 'N.C.', beats: c.beats })), section: b.section, repeatStart: b.repeatStart, repeatEnd: b.repeatEnd,
    ending: b.ending, segno: b.segno, coda: b.coda, toCoda: b.toCoda, jump: b.jump, fine: b.fine, timeSig: b.timeSig,
  }));
}

export function formBars(form: FormBar[]): GridBar[] {
  return form.map((b) => ({ key: b.formIndex, chords: b.chords.map((c) => ({ text: c.chord ? c.chord.text : 'N.C.', beats: c.beats })), section: b.section }));
}

export interface ChordGridProps {
  bars: GridBar[];
  barsPerLine?: number;
  /** highlighted bar (by index into `bars`) */
  cursor?: number;
  /** per-bar result colouring */
  results?: Map<number, boolean>;
  /** selected range (inclusive indices) */
  selection?: [number, number] | null;
  onBarClick?: (index: number, shift: boolean) => void;
  compact?: boolean;
}

export function ChordGrid({ bars, barsPerLine = 4, cursor, results, selection, onBarClick, compact }: ChordGridProps) {
  const settings = useSettings();
  const cursorRef = useRef<HTMLDivElement>(null);
  useEffect(() => { cursorRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [cursor]);
  // break lines at barsPerLine, and always at a new section
  const lines: GridBar[][] = [];
  let line: GridBar[] = [];
  bars.forEach((b) => {
    if (line.length && (line.length >= barsPerLine || b.section)) { lines.push(line); line = []; }
    line.push(b);
  });
  if (line.length) lines.push(line);
  let idx = -1;
  let prevEnding: number | undefined;
  return (
    <div className={`space-y-1 pt-2 ${compact ? 'text-sm' : ''}`}>
      {lines.map((ln, li) => (
        <div key={li} className="relative">
          {ln[0]?.section && <div className="absolute -left-1 -top-2 text-[10px] uppercase tracking-widest text-accent bg-bg px-1">{ln[0].section}</div>}
          <div className="grid" style={{ gridTemplateColumns: `repeat(${barsPerLine}, minmax(0, 1fr))` }}>
            {ln.map((b) => {
              idx++;
              const i = idx;
              const isCursor = cursor === i;
              const res = results?.get(i);
              const selected = selection && i >= selection[0] && i <= selection[1];
              const showEnding = b.ending !== undefined && b.ending !== prevEnding;
              prevEnding = b.ending;
              return (
                <div
                  key={b.key}
                  ref={isCursor ? cursorRef : undefined}
                  onClick={(e) => onBarClick?.(i, e.shiftKey)}
                  className={`relative border-l border-line/80 last:border-r px-2 ${compact ? 'py-1.5 min-h-[2.6rem]' : 'py-2.5 min-h-[3.6rem]'} flex items-center gap-2 transition-colors ${onBarClick ? 'cursor-pointer hover:bg-panel-2' : ''}
                    ${isCursor ? 'bg-accent/15 ring-1 ring-accent' : selected ? 'bg-panel-2' : ''} ${res === true ? 'text-good' : res === false ? 'text-bad' : ''}`}
                >
                  {b.repeatStart && <span className="text-ink-faint text-xs absolute left-0.5 top-0.5">𝄆</span>}
                  {b.repeatEnd !== undefined && <span className="text-ink-faint text-xs absolute right-0.5 top-0.5">𝄇{b.repeatEnd > 2 ? `×${b.repeatEnd}` : ''}</span>}
                  {b.ending !== undefined && <span className="absolute left-0 right-0 top-0 border-t border-ink-dim/70" />}
                  {showEnding && <span className="absolute left-1 -top-0.5 text-[10px] text-ink-dim border-l border-ink-dim px-1">{b.ending}.</span>}
                  {b.segno && <span className="absolute right-1 -top-1 text-accent text-xs">𝄋</span>}
                  {b.toCoda && <span className="absolute right-1 -top-1 text-accent text-xs">→𝄌</span>}
                  {b.coda && <span className="absolute left-1 -top-1 text-accent text-xs">𝄌</span>}
                  {b.timeSig && <span className="text-[10px] text-ink-faint mr-1">{b.timeSig[0]}/{b.timeSig[1]}</span>}
                  <div className="flex items-baseline gap-2 flex-wrap w-full">
                    {b.chords.map((c, ci) => {
                      const chord = c.text === 'N.C.' ? null : safeParse(c.text);
                      return (
                        <span key={ci} className={`${compact ? 'text-base' : 'text-xl'} font-medium`} style={{ flexGrow: c.beats }}>
                          {chord ? <ChordText chord={chord} style={settings.displayStyle} /> : <span className="text-ink-faint text-sm">{c.text}</span>}
                        </span>
                      );
                    })}
                  </div>
                  {(b.jump || b.fine) && <span className="absolute right-1 bottom-0 text-[9px] text-accent">{b.fine ? 'Fine' : b.jump?.replace('_al', ' al ').replace('DS', 'D.S.').replace('DC', 'D.C.')}</span>}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

const cache = new Map<string, ReturnType<typeof parseChord> | null>();
function safeParse(t: string) {
  if (!cache.has(t)) { try { cache.set(t, parseChord(t)); } catch { cache.set(t, null); } }
  return cache.get(t)!;
}
