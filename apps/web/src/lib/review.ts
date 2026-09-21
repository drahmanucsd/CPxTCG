/**
 * The arithmetic behind the review screen (docs/06-review-ux.md).
 *
 * Pure functions over a DrillSummary so the screen is layout only, and so the rules that decide
 * "what do I do next" are testable and consistent rather than re-derived in JSX.
 */
import type { DrillSummary, Outcome, TargetResult, TimingStats } from '@shed/engine';
import { timingStats } from '@shed/engine';

export const OUTCOME_LABEL: Record<Outcome, string> = { clean: 'Clean', timing: 'Late / early', wrong: 'Wrong notes', blank: 'Blank' };
export const OUTCOME_TONE: Record<Outcome, string> = { clean: 'text-good', timing: 'text-warn', wrong: 'text-bad', blank: 'text-ink-dim' };
export const OUTCOME_BG: Record<Outcome, string> = {
  clean: 'bg-good/15 text-good',
  timing: 'bg-warn/20 text-warn',
  wrong: 'bg-bad/15 text-bad',
  blank: 'bg-panel-2 text-ink-faint',
};

/** Sessions recorded before outcomes existed still have to render. Derive what we can. */
export function normalize(s: DrillSummary, timingWindowMs = 120): DrillSummary {
  if (s.outcomes && s.timing !== undefined && typeof s.clean === 'number') return s;
  const results = s.results.map((r): TargetResult => {
    if (r.outcome) return r;
    const timing = r.latenessMs === null || r.latenessMs === undefined ? null : Math.abs(r.latenessMs) <= timingWindowMs ? 'onTime' : r.latenessMs < 0 ? 'early' : 'late';
    const outcome: Outcome = r.ok ? (timing === null || timing === 'onTime' ? 'clean' : 'timing') : r.attempts > 0 ? 'wrong' : 'blank';
    return { ...r, timing, outcome, assisted: r.ok && r.hints > 0, repeats: r.repeats ?? 0 };
  });
  const outcomes: Record<Outcome, number> = { clean: 0, timing: 0, wrong: 0, blank: 0 };
  for (const r of results) outcomes[r.outcome]++;
  return {
    ...s, results, outcomes, clean: outcomes.clean, timing: timingStats(results),
    startBpm: s.startBpm ?? s.finalBpm, assisted: s.assisted ?? results.filter((r) => r.assisted).length,
  };
}

export interface Cell { key: string; label: string; total: number; clean: number; ok: number }

function tally(results: TargetResult[], keyOf: (r: TargetResult) => string | null, labelOf: (k: string) => string): Cell[] {
  const m = new Map<string, Cell>();
  for (const r of results) {
    const k = keyOf(r);
    if (k === null) continue;
    let c = m.get(k);
    if (!c) { c = { key: k, label: labelOf(k), total: 0, clean: 0, ok: 0 }; m.set(k, c); }
    c.total++;
    if (r.outcome === 'clean') c.clean++;
    if (r.ok) c.ok++;
  }
  return [...m.values()];
}

const ROOT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
/** Circle of fourths from C — the order these drills actually run in. */
const FOURTHS = [0, 5, 10, 3, 8, 1, 6, 11, 4, 9, 2, 7];

export function byKey(results: TargetResult[]): Cell[] {
  const cells = tally(results, (r) => String(r.chord.root), (k) => ROOT_NAMES[+k] ?? k);
  return cells.sort((a, b) => FOURTHS.indexOf(+a.key) - FOURTHS.indexOf(+b.key));
}

export function byQuality(results: TargetResult[], suffixOf: (r: TargetResult) => string): Cell[] {
  return tally(results, (r) => suffixOf(r) || 'maj', (k) => k).sort((a, b) => b.total - a.total);
}

export function byFamily(results: TargetResult[], label: (f: string) => string): Cell[] {
  return tally(results, (r) => r.family, label).sort((a, b) => b.total - a.total);
}

/** ii / V / I — only meaningful when the generator produced roman numerals. */
export function byPosition(results: TargetResult[]): Cell[] {
  const cells = tally(results, (r) => r.roman ?? null, (k) => k);
  return cells.length >= 2 ? cells : [];
}

export type NextKind = 'slower' | 'faster' | 'same' | 'misses' | 'noHints';

export interface Verdict {
  line: string;
  kind: NextKind;
  /** suggested tempo for the next run, when the action changes it */
  bpm?: number;
  /** the chords worth drilling on their own */
  focus: TargetResult[];
}

/**
 * One sentence and one action, decided by rule so the advice is consistent.
 * Order matters: the first rule that fires wins, most-blocking problem first.
 */
export function verdictFor(s: DrillSummary, opts: { timed: boolean } = { timed: true }): Verdict {
  const total = s.total || 1;
  const o = s.outcomes ?? { clean: s.correct, timing: 0, wrong: s.total - s.correct, blank: 0 };
  const pct = (n: number) => n / total;
  const wrongChords = s.results.filter((r) => r.outcome === 'wrong' || r.outcome === 'blank');
  const distinctWrong = new Set(wrongChords.map((r) => r.chordText)).size;
  const spread = s.timing?.spreadMs ?? 0;
  const bpm = s.finalBpm || s.startBpm || 0;

  if (!s.total) return { line: 'Nothing graded — the run ended before a chord landed.', kind: 'same', focus: [] };

  if (opts.timed && pct(o.blank) > 0.2) {
    return { line: 'Too fast to recall — a fifth of the chords never arrived.', kind: 'slower', bpm: Math.max(30, bpm - 12), focus: wrongChords };
  }
  if (pct(s.assisted ?? 0) > 0.25) {
    return { line: 'Mostly hints. You are reading these, not playing them.', kind: 'noHints', bpm: Math.max(30, bpm - 8), focus: [] };
  }
  if (opts.timed && pct(o.timing) > pct(o.wrong) + 0.1 && pct(o.timing) > 0.15) {
    return { line: 'You know these — it is placement, not knowledge. Right notes, wrong moment.', kind: 'slower', bpm: Math.max(30, bpm - 8), focus: [] };
  }
  if (pct(o.wrong) > 0.15 && distinctWrong > 0 && distinctWrong <= 5) {
    return { line: `${distinctWrong} shape${distinctWrong > 1 ? 's are' : ' is'} doing the damage. Take ${distinctWrong > 1 ? 'them' : 'it'} out of time.`, kind: 'misses', focus: wrongChords };
  }
  if (pct(o.clean) >= 0.95 && (!opts.timed || spread <= 90)) {
    return { line: opts.timed ? 'Clean and steady. Push it.' : 'Clean. Put a clock on it.', kind: 'faster', bpm: bpm + 8, focus: [] };
  }
  if (pct(o.clean) >= 0.95) {
    return { line: 'Right notes, loose time. Same tempo, sit on the click.', kind: 'same', focus: [] };
  }
  if (pct(o.wrong) + pct(o.blank) > 0.3) {
    return { line: 'These shapes are not in the hand yet. Slow it down.', kind: 'slower', bpm: Math.max(30, bpm - 10), focus: wrongChords };
  }
  return { line: 'Close. Same thing again.', kind: 'same', focus: wrongChords };
}

/** A steady offset with a tight spread is input latency, not playing — worth saying so. */
export function latencySuspect(t: TimingStats | null): number | null {
  if (!t || t.offsets.length < 8) return null;
  return Math.abs(t.medianMs) >= 40 && t.spreadMs <= 70 ? t.medianMs : null;
}

export function fmtMs(n: number): string { return `${n > 0 ? '+' : ''}${Math.round(n)} ms`; }

export function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}
