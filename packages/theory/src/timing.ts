/**
 * Timing analysis: where your notes actually landed against a beat grid.
 *
 * This is the thing a metronome cannot tell you. The click tells you *that* you were off; it
 * never tells you whether you were off in a consistent direction (a choice) or off at random
 * (a problem), whether your eighths were swung or straight, or whether you sped up.
 *
 * Four facts, in the order a teacher would give them:
 *
 *   1. Steadiness — the spread of your offsets. This is the grade. Everything else is colour.
 *   2. Placement  — the median offset. Behind the beat is a valid jazz choice, so it is
 *                   reported and never marked wrong. A big median with a tiny spread is almost
 *                   always input latency rather than your hands.
 *   3. Swing      — where your off-beat eighths actually sat, as a ratio, against what the
 *                   tempo calls for. Players nearly always play straighter than they think.
 *   4. Drift      — did you rush. Measured as the tempo you were really playing.
 *
 * Pure: onsets and a grid in, numbers out. No audio, no DOM.
 */
import { swingRatio } from './groove.js';
import { type Melody, type MelodyNote, type MelodyVerdict, alignMelody, gradeMelody } from './melody.js';

/** One note-on. `time` is clock seconds on the same clock as the grid. */
export interface Onset { midi: number; time: number; velocity?: number }

/** The beat grid the click is running on. */
export interface Grid {
  /** clock time of beat 0 — the first beat of the music, after any count-in */
  startTime: number;
  /** seconds per beat */
  beatDuration: number;
  beatsPerBar: number;
}

export type Subdivision = 'quarter' | 'eighth' | 'triplet' | 'sixteenth';

export interface TimingOptions {
  /** off-beat eighths sit at the swing ratio rather than halfway. Default true. */
  swing?: boolean;
  /** override the tempo-derived ratio (0.5 = straight, 0.667 = 2:1) */
  ratio?: number;
  /** the finest grid a note is allowed to land on. Default 'eighth'. */
  subdivision?: Subdivision;
  /** onsets this close together are one attack (a two-note octave is one event). Default 40 ms. */
  chordMs?: number;
  /** known input latency to remove before analysing, ms */
  latencyMs?: number;
  /** ± ms that counts as on the grid. Default 50. */
  windowMs?: number;
}

export interface PlacedNote {
  midi: number;
  /** clock time of the attack */
  time: number;
  /** the grid position it belongs to, in beats from beat 0 */
  gridBeat: number;
  bar: number;
  beatInBar: number;
  /** which subdivision of the beat: 0 = on the beat */
  slot: number;
  /** signed error in ms; positive = late */
  offsetMs: number;
}

export interface SwingMeasure {
  /** where the off-beat eighth sat, as a fraction of the beat (0.5 straight, 0.667 = 2:1) */
  position: number;
  /** the same thing as the ratio players talk about: "1.9 : 1" */
  ratio: number;
  /** what the tempo calls for */
  expected: number;
  expectedRatio: number;
  /** how many off-beat notes it was measured from */
  n: number;
  verdict: 'straighter' | 'matched' | 'more dotted';
}

export interface PositionStat { label: string; beat: number; slot: number; n: number; meanMs: number }

export interface TimingReport {
  notes: PlacedNote[];
  count: number;
  /** ± ms that counted as on the grid */
  windowMs: number;
  onGrid: number;
  /** median signed offset in ms; negative = ahead of the beat */
  medianMs: number;
  meanMs: number;
  /** interquartile range in ms — the steadiness number */
  spreadMs: number;
  /** the same spread as a percentage of one beat, which is what it sounds like */
  spreadPercentOfBeat: number;
  placement: 'ahead' | 'on top' | 'behind';
  steadiness: number;                       // 0..100
  grade: 'tight' | 'good' | 'loose' | 'unsteady';
  /** ms of offset gained per bar: positive = dragging, negative = rushing */
  driftMsPerBar: number;
  /** the tempo you were really playing, from that drift */
  playedBpm: number | null;
  /** mean offset over the first and last third of the take */
  firstMs: number;
  lastMs: number;
  swing: SwingMeasure | null;
  byPosition: PositionStat[];
  worstBars: Array<{ bar: number; n: number; meanMs: number }>;
  /** a steady offset this large is usually the interface, not the player */
  latencySuspect: boolean;
  headline: string;
  detail: string[];
}

const EMPTY = (windowMs: number): TimingReport => ({
  notes: [], count: 0, windowMs, onGrid: 0, medianMs: 0, meanMs: 0, spreadMs: 0, spreadPercentOfBeat: 0,
  placement: 'on top', steadiness: 0, grade: 'unsteady', driftMsPerBar: 0, playedBpm: null, firstMs: 0, lastMs: 0,
  swing: null, byPosition: [], worstBars: [], latencySuspect: false,
  headline: 'Nothing to measure yet', detail: ['Play at least a few notes with the click running.'],
});

/** Grid positions within one beat, as fractions of a beat. */
export function slotsFor(sub: Subdivision, swing: boolean, ratio: number): number[] {
  switch (sub) {
    case 'quarter': return [0];
    case 'triplet': return [0, 1 / 3, 2 / 3];
    case 'sixteenth': return [0, 0.25, 0.5, 0.75];
    case 'eighth': default: return [0, swing ? ratio : 0.5];
  }
}

/** Collapse notes struck together into single attacks, keeping every pitch. */
export function groupAttacks(onsets: Onset[], chordMs = 40): Onset[][] {
  const sorted = [...onsets].sort((a, b) => a.time - b.time);
  const out: Onset[][] = [];
  for (const o of sorted) {
    const last = out[out.length - 1];
    if (last && (o.time - last[0]!.time) * 1000 <= chordMs) last.push(o);
    else out.push([o]);
  }
  return out;
}

function snap(x: number, slots: number[]): { gridBeat: number; slot: number } {
  const k = Math.floor(x);
  const frac = x - k;
  let gridBeat = k, slot = 0, best = Infinity;
  for (let i = 0; i < slots.length; i++) {
    const d = Math.abs(frac - slots[i]!);
    if (d < best) { best = d; gridBeat = k + slots[i]!; slot = i; }
  }
  if (Math.abs(frac - 1) < best) { gridBeat = k + 1; slot = 0; }
  return { gridBeat, slot };
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function quartileRange(xs: number[]): number {
  if (xs.length < 4) return xs.length < 2 ? 0 : Math.abs(xs[1]! - xs[0]!);
  const s = [...xs].sort((a, b) => a - b);
  const q = (p: number) => {
    const i = (s.length - 1) * p;
    const lo = Math.floor(i), hi = Math.ceil(i);
    return s[lo]! + (s[hi]! - s[lo]!) * (i - lo);
  };
  return q(0.75) - q(0.25);
}

function mean(xs: number[]): number { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; }

/** Least-squares slope of y against x. */
function slope(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3) return 0;
  const mx = mean(xs), my = mean(ys);
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i]! - mx; num += dx * (ys[i]! - my); den += dx * dx; }
  return den === 0 ? 0 : num / den;
}

/** "1&", "2", "3a" — how a player names the spot in the bar. */
export function positionLabel(beat: number, slot: number, sub: Subdivision): string {
  const b = String(beat + 1);
  if (slot === 0) return b;
  if (sub === 'triplet') return b + (slot === 1 ? 'la' : 'li');
  if (sub === 'sixteenth') return b + (slot === 1 ? 'e' : slot === 2 ? '&' : 'a');
  return b + '&';
}

/**
 * Place every note on the grid and describe the result.
 *
 * Two passes: the first finds the constant offset (latency, or a player who sits behind
 * everything), the second re-snaps with it removed so that a player 90 ms behind is not scored
 * as if every note were early for the *next* subdivision.
 */
export function analyzeTiming(onsets: Onset[], grid: Grid, opts: TimingOptions = {}): TimingReport {
  const windowMs = opts.windowMs ?? 50;
  const bpm = 60 / grid.beatDuration;
  const sub = opts.subdivision ?? 'eighth';
  const swing = opts.swing ?? true;
  const ratio = opts.ratio ?? swingRatio(bpm);
  const slots = slotsFor(sub, swing, ratio);
  const lat = (opts.latencyMs ?? 0) / 1000;

  const attacks = groupAttacks(onsets, opts.chordMs ?? 40).filter((g) => g[0]!.time >= grid.startTime - grid.beatDuration);
  if (attacks.length < 3) return EMPTY(windowMs);

  const beatsOf = (t: number, shift: number) => (t - lat - shift - grid.startTime) / grid.beatDuration;

  // pass 1: rough snap to find the constant offset
  const rough = attacks.map((g) => {
    const x = beatsOf(g[0]!.time, 0);
    return (x - snap(x, slots).gridBeat) * grid.beatDuration;
  });
  const shift = median(rough);

  // pass 2: assign on the shifted grid, but report the error against the real one
  const notes: PlacedNote[] = attacks.map((g) => {
    const a = g[0]!;
    const { gridBeat, slot } = snap(beatsOf(a.time, shift), slots);
    const target = grid.startTime + gridBeat * grid.beatDuration + lat;
    const bar = Math.floor(gridBeat / grid.beatsPerBar);
    return {
      midi: a.midi, time: a.time, gridBeat, slot, bar,
      beatInBar: ((Math.floor(gridBeat) % grid.beatsPerBar) + grid.beatsPerBar) % grid.beatsPerBar,
      offsetMs: (a.time - target) * 1000,
    };
  });

  return summarise(notes, grid, sub, windowMs);
}

/**
 * Everything after placement is the same whether the notes were snapped to the click or lined up
 * against a written melody, so both paths share it.
 */
function summarise(notes: PlacedNote[], grid: Grid, sub: Subdivision, windowMs: number): TimingReport {
  const bpm = 60 / grid.beatDuration;
  const offs = notes.map((n) => n.offsetMs);
  const med = median(offs);
  const spread = quartileRange(offs);
  const onGrid = offs.filter((o) => Math.abs(o) <= windowMs).length;

  const driftPerBeat = slope(notes.map((n) => n.gridBeat), offs) / 1000;   // seconds of offset per beat
  const driftMsPerBar = driftPerBeat * 1000 * grid.beatsPerBar;
  const playedBeat = grid.beatDuration + driftPerBeat;
  const playedBpm = playedBeat > 0.05 ? 60 / playedBeat : null;

  const third = Math.max(1, Math.floor(notes.length / 3));
  const firstMs = mean(offs.slice(0, third));
  const lastMs = mean(offs.slice(-third));

  const grade = spread <= 20 ? 'tight' : spread <= 35 ? 'good' : spread <= 55 ? 'loose' : 'unsteady';
  const steadiness = Math.max(0, Math.min(100, Math.round(100 - (spread - 10) * 1.4)));
  const placement = med < -18 ? 'ahead' : med > 18 ? 'behind' : 'on top';
  // Latency always makes you look *late* and is machine-steady; a human laying back varies more.
  // Below 20 ms of spread the two are genuinely indistinguishable from the data, so say so
  // rather than pick one.
  const latencySuspect = med > 25 && spread < 20;

  // where in the bar things go wrong
  const buckets = new Map<string, { beat: number; slot: number; xs: number[] }>();
  for (const n of notes) {
    const k = `${n.beatInBar}:${n.slot}`;
    if (!buckets.has(k)) buckets.set(k, { beat: n.beatInBar, slot: n.slot, xs: [] });
    buckets.get(k)!.xs.push(n.offsetMs);
  }
  const byPosition: PositionStat[] = [...buckets.values()]
    .map((b) => ({ label: positionLabel(b.beat, b.slot, sub), beat: b.beat, slot: b.slot, n: b.xs.length, meanMs: mean(b.xs) }))
    .sort((a, b) => a.beat - b.beat || a.slot - b.slot);

  const barMap = new Map<number, number[]>();
  for (const n of notes) { if (!barMap.has(n.bar)) barMap.set(n.bar, []); barMap.get(n.bar)!.push(n.offsetMs); }
  const worstBars = [...barMap.entries()]
    .map(([bar, xs]) => ({ bar, n: xs.length, meanMs: mean(xs) }))
    .sort((a, b) => Math.abs(b.meanMs) - Math.abs(a.meanMs))
    .slice(0, 4);

  const report: TimingReport = {
    notes, count: notes.length, windowMs, onGrid,
    medianMs: round(med), meanMs: round(mean(offs)), spreadMs: round(spread),
    spreadPercentOfBeat: round((spread / 1000 / grid.beatDuration) * 100),
    placement, steadiness, grade,
    driftMsPerBar: round(driftMsPerBar), playedBpm: playedBpm === null ? null : round(playedBpm, 1),
    firstMs: round(firstMs), lastMs: round(lastMs),
    swing: measureSwing(notes, grid, bpm, sub),
    byPosition, worstBars, latencySuspect,
    headline: '', detail: [],
  };
  const words = describe(report, grid);
  report.headline = words.headline;
  report.detail = words.detail;
  return report;
}

function round(x: number, dp = 0): number { const f = Math.pow(10, dp); return Math.round(x * f) / f; }

/**
 * Where your off-beat eighths really sat.
 *
 * Measured from the raw position inside the beat, not from the snapped grid, so the answer does
 * not depend on whether the grid was set to swing in the first place — otherwise this would just
 * report back the setting.
 */
function measureSwing(notes: PlacedNote[], grid: Grid, bpm: number, sub: Subdivision): SwingMeasure | null {
  if (sub === 'quarter') return null;
  const fracs: number[] = [];
  for (const n of notes) {
    if (n.slot === 0) continue;
    const x = (n.time - grid.startTime) / grid.beatDuration;
    const f = x - Math.floor(x);
    if (f > 0.25 && f < 0.85) fracs.push(f);
  }
  if (fracs.length < 4) return null;
  const position = median(fracs);
  const expected = swingRatio(bpm);
  const asRatio = (p: number) => (p >= 0.995 ? 99 : p / (1 - p));
  const d = position - expected;
  return {
    position: round(position, 3),
    ratio: round(asRatio(position), 2),
    expected: round(expected, 3),
    expectedRatio: round(asRatio(expected), 2),
    n: fracs.length,
    verdict: d < -0.03 ? 'straighter' : d > 0.03 ? 'more dotted' : 'matched',
  };
}

function describe(r: TimingReport, grid: Grid): { headline: string; detail: string[] } {
  const detail: string[] = [];
  const ms = (x: number) => `${x > 0 ? '+' : ''}${Math.round(x)} ms`;

  // 1. steadiness first: it is the only thing here that is straightforwardly good or bad
  const headline =
    r.grade === 'tight' ? `Tight time — your notes land within ${Math.round(r.spreadMs)} ms of each other`
    : r.grade === 'good' ? `Solid time, ±${Math.round(r.spreadMs / 2)} ms`
    : r.grade === 'loose' ? `Loose time — a ${Math.round(r.spreadMs)} ms spread is audible`
    : `Unsteady — a ${Math.round(r.spreadMs)} ms spread is the thing to fix first`;

  // 2. placement, explicitly not a fault
  if (r.latencySuspect) {
    detail.push(`Everything sits ${ms(r.medianMs)} late and barely varies (±${Math.round(r.spreadMs / 2)} ms). That is either an unusually consistent lay-back or your MIDI/audio latency, and the notes cannot tell you which — calibrate in Settings, then run this again to find out.`);
  } else if (r.grade === 'unsteady') {
    // a median is a summary of a distribution; with a spread this wide there is nothing to summarise
    detail.push(`The median is ${ms(r.medianMs)}, but with a spread this wide that number does not mean much yet. Steady first, placement after.`);
  } else if (r.placement === 'behind') {
    detail.push(`You sit ${ms(r.medianMs)} behind the click. Laying back is a choice, and ${r.grade === 'tight' || r.grade === 'good' ? 'you are doing it consistently, which is the hard part' : 'it only reads as intent once the spread comes down'}.`);
  } else if (r.placement === 'ahead') {
    detail.push(`You sit ${ms(r.medianMs)} in front of the click. On top of the beat drives a band; too far ahead pulls the tempo up.`);
  } else {
    detail.push('You are sitting right on top of the beat.');
  }

  // 3. did you rush
  const bpmNow = 60 / grid.beatDuration;
  if (Math.abs(r.driftMsPerBar) >= 3 && r.playedBpm !== null) {
    // "rush" and "drag" are about the direction of travel, not about being early or late: a
    // player who starts 60 ms behind and finishes 10 ms behind has still sped up.
    const rushing = r.driftMsPerBar < 0;
    detail.push(`You ${rushing ? 'sped up' : 'slowed down'} across the take: ${ms(r.firstMs)} at the start against ${ms(r.lastMs)} by the end, about ${Math.round(r.playedBpm)} bpm against a click at ${Math.round(bpmNow)}. That is ${rushing ? 'rushing' : 'dragging'}.`);
  } else {
    detail.push('No drift — you finished where you started.');
  }

  // 4. swing
  if (r.swing) {
    const s = r.swing;
    detail.push(
      s.verdict === 'matched'
        ? `Your eighths sat at ${s.ratio.toFixed(1)}:1, which is the feel this tempo wants.`
        : `Your eighths sat at ${s.ratio.toFixed(1)}:1; at this tempo the band is nearer ${s.expectedRatio.toFixed(1)}:1, so you played ${s.verdict === 'straighter' ? 'straighter' : 'more dotted'} than the groove.`,
    );
  }

  // 5. one place to look
  const worst = [...r.byPosition].filter((p) => p.n >= 3).sort((a, b) => Math.abs(b.meanMs) - Math.abs(a.meanMs))[0];
  if (worst && Math.abs(worst.meanMs - r.medianMs) > 25) {
    detail.push(`The "${worst.label}" is your weak spot: ${ms(worst.meanMs)} on average, against ${ms(r.medianMs)} everywhere else.`);
  }

  return { headline, detail };
}

// ---------------------------------------------------------------------------
// Against a written melody
// ---------------------------------------------------------------------------

export interface MelodyTimingReport {
  timing: TimingReport;
  pitch: MelodyVerdict;
  /** one row per written note, in order */
  perNote: Array<{ index: number; midi: number; writtenBeat: number; playedTime: number | null; offsetMs: number | null }>;
  missed: number;
  extra: number;
  /** matched notes that landed more than a beat from where they are written — counted, not scored */
  displaced: number;
}

/** Lay the written melody out over several choruses so a whole take can be graded in one go. */
export function repeatMelody(m: Melody, times: number, formBeats: number): MelodyNote[] {
  const out: MelodyNote[] = [];
  for (let i = 0; i < Math.max(1, times); i++) {
    for (const n of m.notes) out.push({ ...n, start: n.start + i * formBeats });
  }
  return out;
}

/**
 * Timing against the written rhythm rather than against the nearest click.
 *
 * This is the stricter, more useful version, and it is only available once there is a melody to
 * compare with: it can tell you that you held bar 5 too long, which a bare grid cannot, because
 * a bare grid happily snaps a late note onto the next subdivision and calls it early.
 *
 * Notes that land more than a beat from where they are written are dropped from the timing
 * statistics — at that distance the pitch match is more likely a coincidence than the same note —
 * and reported separately as `displaced`.
 */
export function analyzeMelodyTiming(
  expected: MelodyNote[],
  onsets: Onset[],
  grid: Grid,
  opts: TimingOptions & { octaveSensitive?: boolean } = {},
): MelodyTimingReport {
  const windowMs = opts.windowMs ?? 50;
  const sub = opts.subdivision ?? 'eighth';
  const swing = opts.swing ?? true;
  const slots = slotsFor(sub, swing, opts.ratio ?? swingRatio(60 / grid.beatDuration));
  const lat = (opts.latencyMs ?? 0) / 1000;

  // a melody is the top voice: an octave doubling is one melody note, not two
  const attacks = groupAttacks(onsets, opts.chordMs ?? 40);
  const played = attacks.map((g) => g.reduce((a, b) => (b.midi > a.midi ? b : a)));

  const pitch = gradeMelody(expected, played.map((p) => p.midi), { octaveSensitive: opts.octaveSensitive ?? false });
  const { pairs, missed, extra } = alignMelody(expected, played.map((p) => p.midi), { octaveSensitive: opts.octaveSensitive ?? false });

  const playedFor = new Map<number, Onset>();
  for (const p of pairs) playedFor.set(p.want, played[p.got]!);

  const notes: PlacedNote[] = [];
  let displaced = 0;
  const perNote = expected.map((n, index) => {
    const hit = playedFor.get(index);
    if (n.midi === null) return { index, midi: -1, writtenBeat: n.start, playedTime: null, offsetMs: null };
    if (!hit) return { index, midi: n.midi, writtenBeat: n.start, playedTime: null, offsetMs: null };
    const target = grid.startTime + n.start * grid.beatDuration + lat;
    const offsetMs = (hit.time - target) * 1000;
    if (Math.abs(offsetMs) > grid.beatDuration * 1000) {
      displaced++;
    } else {
      const frac = n.start - Math.floor(n.start);
      let slot = 0, best = Infinity;
      for (let i = 0; i < slots.length; i++) { const d = Math.abs(frac - slots[i]!); if (d < best) { best = d; slot = i; } }
      notes.push({
        midi: n.midi, time: hit.time, gridBeat: n.start,
        bar: Math.floor(n.start / grid.beatsPerBar),
        beatInBar: ((Math.floor(n.start) % grid.beatsPerBar) + grid.beatsPerBar) % grid.beatsPerBar,
        slot, offsetMs,
      });
    }
    return { index, midi: n.midi, writtenBeat: n.start, playedTime: hit.time, offsetMs };
  });

  const timing = notes.length >= 3 ? summarise(notes, grid, sub, windowMs) : EMPTY(windowMs);
  return { timing, pitch, perNote, missed: missed.length, extra: extra.length, displaced };
}
