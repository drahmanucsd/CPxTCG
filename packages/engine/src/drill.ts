/**
 * Drill runner: turns a DrillSpec into targets, paces them (free or on the transport),
 * grades attempts from the ChordCapture, and emits everything the UI needs.
 */
import {
  type ChordSymbol, type Key, type KeyOrder, type PitchClass, type ProgressionChord, type RealizeOptions, type Strictness, type Verdict, type Voicing,
  STRICTNESS_ORDER, blues, chooseVoicing, cycle, evaluate, generateVoicings, iiVIAllKeys, parseProgression, randomChord, turnaround, keySequence, formatChord, qualityClass,
} from '@shed/theory';
import { type Clock, Emitter } from './clock.js';
import type { Attempt, ChordCapture } from './capture.js';
import type { Transport } from './transport.js';

export type GeneratorSpec =
  | { kind: 'random'; suffixes: string[]; roots?: PitchClass[]; smart?: boolean }
  | { kind: 'iiVI'; order: KeyOrder; minor?: boolean; shape?: 'iiVI' | 'iiV' | 'VI' | 'iiVIVI'; longTonic?: boolean; altered?: boolean; start?: PitchClass }
  | { kind: 'cycle'; suffix: string; order: KeyOrder; start?: PitchClass }
  | { kind: 'turnaround'; id: string; order: KeyOrder | 'single'; tonic?: PitchClass; minor?: boolean }
  | { kind: 'blues'; id: string; tonic: PitchClass }
  | { kind: 'custom'; text: string; key?: Key; beatsPerBar?: number }
  | { kind: 'progression'; chords: ProgressionChord[]; label?: string };

export interface Pacing {
  mode: 'free' | 'timed';
  bpm: number;
  /**
   * What ends a chord.
   *   'onTime'    — the beat grid does: when the window closes the drill moves on, hit or miss.
   *   'onCorrect' — you do: the chord repeats (click still running) until you play it right.
   * Defaults: timed → 'onTime', free → 'onCorrect'.
   */
  advance?: 'onTime' | 'onCorrect';
  /** ± ms around the chord's downbeat that still counts as "in time". Default 120. */
  timingWindowMs?: number;
  /** 'onCorrect': give up and move on after this many repeats. Default 8. */
  maxRepeats?: number;
  /** beats per chord; ignored when the generator provides its own beats (custom/blues/progression) unless `overrideBeats` */
  beatsPerChord: number;
  overrideBeats?: boolean;
  countInBars: number;
  timeSig: { beats: number; unit: number };
  subdivision?: number;
  /** free mode: ms to hold the green before advancing */
  holdMs?: number;
}

export interface Ladder { up: number; down: number; min: number; max: number }

export interface BandSpec {
  style: 'swing' | 'bossa' | 'ballad' | 'latin' | 'waltz' | 'straight' | 'funk' | 'even8ths';
  bass: boolean;
  drums: boolean;
  volume?: number;
}

/** Denormalized song info so the drill screen can draw the chart with a cursor. */
export interface SongRef {
  songId: string;
  title: string;
  /** resolved form bars: each with chord texts + beats, for display */
  bars: Array<{ formIndex: number; barIndex: number; section?: string; chords: Array<{ text: string; beats: number }> }>;
  /** first form bar index of the practiced range */
  from: number;
  to: number;
  /** scanned page image + per written-bar boxes (normalized) for the page-cursor view */
  scan?: { imageId: string; boxes: Array<{ x: number; y: number; w: number; h: number } | null> };
}

export interface DrillSpec {
  id: string;
  name: string;
  description?: string;
  generator: GeneratorSpec;
  families: string[];
  strictness: Strictness;
  voiceLeading: 'strict' | 'off';
  pacing: Pacing;
  lookAhead: 'always' | 'lastBeat' | 'never';
  ladder?: Ladder;
  length: { reps?: number; minutes?: number; passes?: number };
  realize?: RealizeOptions;
  /** ms window before the beat in which an attack counts for that beat */
  earlyMs?: number;
  /** show roman numerals instead of chord symbols when available */
  prompt?: 'symbol' | 'roman' | 'hidden';
  tags?: string[];
  band?: BandSpec;
  song?: SongRef;
  /** External backing: click muted. YouTube auto-syncs when anchorSec+bpm are known (else tap on beat 1); a record is
   *  the user's own audio (stems) played on the audio clock, sample-accurate once anchored. */
  backing?: { kind: 'youtube'; videoId: string; anchorSec?: number; bpm?: number } | { kind: 'record'; recordId: string; anchorSec?: number; bpm?: number };
  /** "Name it & play it": the player must also say the chord name; graded separately. */
  speak?: boolean;
  /**
   * Grade one hand only. Notes on the other side of the split are ignored, which is what lets
   * you play a melody over a left-hand voicing without the melody failing the chord.
   * Default (undefined) grades everything played.
   *
   * `split` is optional and usually should be: a left-hand rootless voicing straddles middle C,
   * so a fixed split cuts the voicing in half. Left out, the split is derived per chord from the
   * target itself — anything above the top note of the voicing is the other hand.
   */
  hands?: { grade: 'below' | 'above'; split?: number };
}

export interface Target {
  index: number;
  pc: ProgressionChord;
  chord: ChordSymbol;
  voicing: Voicing;
  candidates: Voicing[];
  /** transport beat index the chord starts on (timed mode) */
  beatIndex?: number;
  beats: number;
  dueTime?: number;
  windowEnd?: number;
  /** 1-based pass number through the progression */
  pass: number;
  /** notes of this voicing that the previous voicing did not have — the ones your hand moves */
  moved: number[];
  /** notes held over from the previous voicing */
  held: number[];
}

export interface TargetResult {
  index: number;
  chordText: string;
  chord: ChordSymbol;
  roman?: string;
  family: string;
  label: string;
  /** the notes were right (regardless of when) */
  ok: boolean;
  met: Strictness | null;
  latenessMs: number | null;
  /** where the attack landed relative to the chord's downbeat; null in free time or when nothing was played */
  timing: 'early' | 'onTime' | 'late' | null;
  /** the authoritative four-way classification — see docs/06-review-ux.md */
  outcome: Outcome;
  /** right notes, but a hint was open when they landed */
  assisted: boolean;
  /** extra windows the chord took in 'onCorrect' mode (0 = got it first time round) */
  repeats: number;
  /** clock time of the attack that got it right — used to measure the tempo you actually played at */
  attackTime?: number;
  /** beats this chord occupied, so measured tempo can be derived from the gaps */
  beats: number;
  hints: number;
  attempts: number;
  message: string;
  playedNotes: number[];
  targetNotes: number[];
  bpm: number;
  pass: number;
  spoken?: { heard: string; ok: boolean };
}

/**
 * Clean  — right notes, in the window, unaided.
 * Timing — right notes, outside the window (early or late). You know it; you can't place it.
 * Wrong  — played something, it wasn't the chord.
 * Blank  — nothing playable arrived.
 */
export type Outcome = 'clean' | 'timing' | 'wrong' | 'blank';

export interface TimingStats {
  /** median signed offset in ms — a big median with a small spread is input latency, not playing */
  medianMs: number;
  /** interquartile range in ms — the actual consistency number */
  spreadMs: number;
  onTime: number;
  early: number;
  late: number;
  /** every signed offset, for the strip plot */
  offsets: number[];
}

export interface DrillSummary {
  specId: string;
  startedAt: number;
  endedAt: number;
  results: TargetResult[];
  total: number;
  /** chords whose notes were right, on time or not */
  correct: number;
  /** right notes, in the window, no hint — the number that matters */
  clean: number;
  outcomes: Record<Outcome, number>;
  timing: TimingStats | null;
  avgLatenessMs: number | null;
  startBpm: number;
  finalBpm: number;
  /**
   * The tempo you actually played at, from the gaps between correct chords. In free time and in
   * 'onCorrect' this is the number that matters: it is what the clock should be set to next.
   * null when there were too few correct chords in a row to measure.
   */
  measuredBpm: number | null;
  hintsUsed: number;
  assisted: number;
}

export type DrillState = 'idle' | 'countIn' | 'running' | 'paused' | 'ended';

export interface DrillEvents extends Record<string, unknown> {
  state: { state: DrillState };
  target: { target: Target; upcoming: Target[] };
  verdict: { target: Target; verdict: Verdict; attempt: Attempt | null; latenessMs: number | null; final: boolean };
  hint: { target: Target; level: number };
  tempo: { bpm: number };
  pass: { pass: number; correct: number; total: number };
  /** 'onCorrect' mode: the current chord is coming round again */
  repeat: { target: Target; repeats: number };
  spoken: { target: Target; heard: string; ok: boolean };
  end: { summary: DrillSummary };
}

export interface DrillRunnerOptions {
  spec: DrillSpec;
  clock: Clock;
  capture: ChordCapture;
  transport?: Transport;
  /** smart-random weighting: higher = more likely */
  weight?: (root: PitchClass, suffix: string) => number;
  rng?: () => number;
  latencyOffsetMs?: number;
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (h: unknown) => void;
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (h: unknown) => void;
}

/** A lazily generated sequence of progression chords; `null` = finite end. */
interface TargetSource { next(index: number, prev: ChordSymbol | null): { pc: ProgressionChord; pass: number } | null }

function makeSource(spec: DrillSpec, rng: () => number, weight?: DrillRunnerOptions['weight']): TargetSource {
  const g = spec.generator;
  const beats = spec.pacing.beatsPerChord;
  if (g.kind === 'random') {
    return {
      next(index, prev) {
        const chord = randomChord({ suffixes: g.suffixes, roots: g.roots, rng, avoid: prev, weight: g.smart ? weight : undefined });
        return { pc: { chord, beats }, pass: Math.floor(index / 12) + 1 };
      },
    };
  }
  let list: ProgressionChord[];
  switch (g.kind) {
    case 'iiVI': list = iiVIAllKeys(g.order, { minor: g.minor, shape: g.shape, longTonic: g.longTonic, altered: g.altered, start: g.start, beatsPerChord: beats, rng }); break;
    case 'cycle': list = cycle(g.suffix, g.order, { start: g.start, beatsPerChord: beats, rng }); break;
    case 'turnaround':
      list = g.order === 'single' ? turnaround(g.id, g.tonic ?? 0, g.minor) : keySequence(g.order, g.tonic ?? 0, rng).flatMap((k) => turnaround(g.id, k, g.minor));
      break;
    case 'blues': list = blues(g.id, g.tonic, spec.pacing.timeSig.beats); break;
    case 'custom': list = parseProgression(g.text, { key: g.key, beatsPerBar: g.beatsPerBar ?? spec.pacing.timeSig.beats }); break;
    case 'progression': list = g.chords; break;
  }
  if (spec.pacing.overrideBeats) list = list.map((c) => ({ ...c, beats }));
  const loop = spec.length.passes === undefined ? true : spec.length.passes > 1 || spec.length.minutes !== undefined || spec.length.reps !== undefined;
  return {
    next(index) {
      if (!list.length) return null;
      if (index >= list.length && !loop) return null;
      const pass = Math.floor(index / list.length) + 1;
      if (spec.length.passes !== undefined && pass > spec.length.passes) return null;
      return { pc: list[index % list.length]!, pass };
    },
  };
}

export class DrillRunner extends Emitter<DrillEvents> {
  readonly spec: DrillSpec;
  state: DrillState = 'idle';
  bpm: number;
  private readonly clock: Clock;
  private readonly capture: ChordCapture;
  private readonly transport: Transport | undefined;
  private readonly source: TargetSource;
  private readonly rng: () => number;
  private readonly latency: number;
  private readonly _setTimeout: (fn: () => void, ms: number) => unknown;
  private readonly _clearTimeout: (h: unknown) => void;
  private readonly _setInterval: (fn: () => void, ms: number) => unknown;
  private readonly _clearInterval: (h: unknown) => void;
  private pollTimer: unknown = null;
  private emittedIndex = -1;
  private targets: Target[] = [];
  private results = new Map<number, TargetResult>();
  private current = 0;
  private nextBeat = 0;
  private startedAt = 0;
  private unsubs: Array<() => void> = [];
  private holdTimer: unknown = null;
  private endTimer: unknown = null;
  private lastPass = 1;
  private finished = false;
  private readonly startBpm: number;

  constructor(opts: DrillRunnerOptions) {
    super();
    this.spec = opts.spec;
    this.clock = opts.clock;
    this.capture = opts.capture;
    this.transport = opts.transport;
    this.rng = opts.rng ?? Math.random;
    this.latency = (opts.latencyOffsetMs ?? 0) / 1000;
    this._setTimeout = opts.setTimeout ?? ((fn, ms) => setTimeout(fn, ms));
    this._clearTimeout = opts.clearTimeout ?? ((h) => clearTimeout(h as number));
    this._setInterval = opts.setInterval ?? ((fn, ms) => setInterval(fn, ms));
    this._clearInterval = opts.clearInterval ?? ((h) => clearInterval(h as number));
    this.bpm = opts.spec.pacing.bpm;
    this.startBpm = this.bpm;
    this.source = makeSource(opts.spec, this.rng, opts.weight);
    if (this.spec.pacing.mode === 'timed' && !this.transport) throw new Error('timed drills need a transport');
  }

  get currentTarget(): Target | undefined { return this.targets[this.current]; }

  /** What ends a chord: the grid, or getting it right. */
  get advanceMode(): 'onTime' | 'onCorrect' {
    return this.spec.pacing.advance ?? (this.spec.pacing.mode === 'timed' ? 'onTime' : 'onCorrect');
  }

  /** ± ms around the downbeat that counts as in time, never more than half the chord. */
  private timingWindow(t: Target): number {
    const w = this.spec.pacing.timingWindowMs ?? 120;
    if (this.spec.pacing.mode !== 'timed') return w;
    return Math.min(w, (t.beats * 60_000) / this.bpm / 2);
  }

  private classifyTiming(t: Target, latenessMs: number | null): 'early' | 'onTime' | 'late' | null {
    if (latenessMs === null) return null;
    const w = this.timingWindow(t);
    return Math.abs(latenessMs) <= w ? 'onTime' : latenessMs < 0 ? 'early' : 'late';
  }

  /** The chord sounding on a transport beat (timed mode), with its neighbours — for the rhythm section. */
  chordAtBeat(beatIndex: number): { chord: ChordSymbol; next: ChordSymbol | null; beatInChord: number; chordBeats: number; target: Target } | null {
    for (let i = Math.max(0, this.current - 1); i < this.targets.length; i++) {
      const t = this.targets[i]!;
      if (t.beatIndex === undefined) continue;
      if (beatIndex >= t.beatIndex && beatIndex < t.beatIndex + t.beats) {
        return { chord: t.chord, next: this.targets[i + 1]?.chord ?? null, beatInChord: beatIndex - t.beatIndex, chordBeats: t.beats, target: t };
      }
    }
    return null;
  }
  get upcoming(): Target[] { return this.targets.slice(this.current + 1, this.current + 3); }
  get resultsSoFar(): TargetResult[] { return [...this.results.values()].sort((a, b) => a.index - b.index); }

  // ---------------------------------------------------------------------
  start(opts: { at?: number } = {}): void {
    if (this.state !== 'idle') return;
    this.startedAt = this.clock.now();
    this.unsubs.push(this.capture.on('attempt', (a) => this.onAttempt(a)));
    // settle held chords even when no further MIDI events arrive
    this.pollTimer = this._setInterval(() => this.capture.update(this.clock.now()), 20);
    if (!this.ensureTargets(3)) { this.finish(); return; }
    if (this.spec.pacing.mode === 'timed') {
      const t = this.transport!;
      t.bpm = this.bpm;
      t.timeSig = this.spec.pacing.timeSig;
      t.countInBars = this.spec.pacing.countInBars;
      if (this.spec.pacing.subdivision) t.subdivision = this.spec.pacing.subdivision;
      this.unsubs.push(t.on('beat', (b) => this.onBeat(b.index, b.time)));
      this.setState(this.spec.pacing.countInBars > 0 ? 'countIn' : 'running');
      t.start(opts.at);
      this.assignBeats();
      this.emitTarget();
    } else {
      this.setState('running');
      this.emitTarget();
    }
    if (this.spec.length.minutes) {
      this.endTimer = this._setTimeout(() => this.finish(), this.spec.length.minutes * 60_000);
    }
  }

  pause(): void {
    if (this.state !== 'running' && this.state !== 'countIn') return;
    this.transport?.stop();
    this.setState('paused');
  }

  /** Resume a timed drill: restarts the transport with a count-in at the current chord. */
  resume(): void {
    if (this.state !== 'paused') return;
    if (this.spec.pacing.mode === 'timed') {
      // drop pending results for the current chord; re-anchor beats from the current target
      this.results.delete(this.current);
      this.nextBeat = 0;
      for (let i = this.current; i < this.targets.length; i++) { this.targets[i]!.beatIndex = this.nextBeat; this.nextBeat += this.targets[i]!.beats; }
      this.setState(this.spec.pacing.countInBars > 0 ? 'countIn' : 'running');
      this.transport!.start();
      this.assignBeats();
    } else {
      this.setState('running');
    }
  }

  end(): void { this.finish(); }

  /** Skip the current chord (free mode). Counts as a miss. */
  skip(): void {
    const t = this.currentTarget;
    if (!t || this.state !== 'running' || this.spec.pacing.mode !== 'free') return;
    this.record(t, { ok: false, met: null, diagnosis: ['nothingPlayed'], missingPcs: [], extraPcs: [], correctNotes: [], wrongNotes: [], missedNotes: t.voicing.notes, message: 'Skipped' }, null, null, true);
    this.advanceFree(0);
  }

  /** Request a hint for the current chord; returns the new hint level (1..3). */
  hint(): number {
    const t = this.currentTarget;
    if (!t) return 0;
    const r = this.resultFor(t);
    r.hints = Math.min(3, r.hints + 1);
    this.emit('hint', { target: t, level: r.hints });
    return r.hints;
  }

  /** Record a spoken answer for a target (speech drills). Returns whether it matched. */
  markSpoken(targetIndex: number, heard: string, said: ChordSymbol): boolean {
    const t = this.targets[targetIndex];
    if (!t) return false;
    const ok = said.root === t.chord.root && qualityClass(said) === qualityClass(t.chord);
    const r = this.resultFor(t);
    if (!r.spoken?.ok) r.spoken = { heard, ok };
    this.emit('spoken', { target: t, heard, ok });
    return ok;
  }

  setBpm(bpm: number): void {
    this.bpm = Math.round(bpm);
    this.transport?.setBpm(this.bpm);
    this.emit('tempo', { bpm: this.bpm });
  }

  // ---------------------------------------------------------------------
  private setState(s: DrillState): void { this.state = s; this.emit('state', { state: s }); }

  /** Make sure targets exist up to index current+n. Returns false if the source is exhausted at `current`. */
  private ensureTargets(n: number): boolean {
    while (this.targets.length <= this.current + n) {
      const idx = this.targets.length;
      const prevT = this.targets[idx - 1];
      const got = this.source.next(idx, prevT?.chord ?? null);
      if (!got) break;
      const chord = got.pc.chord;
      let candidates: Voicing[] = [];
      for (const f of this.spec.families) candidates = candidates.concat(generateVoicings(chord, f, this.spec.realize));
      const voicing = chooseVoicing(prevT?.voicing ?? null, candidates) ?? fallbackVoicing(chord);
      const beats = this.spec.pacing.mode === 'timed' ? (this.spec.pacing.overrideBeats ? this.spec.pacing.beatsPerChord : got.pc.beats) : got.pc.beats;
      const before = new Set(prevT?.voicing.notes ?? []);
      const moved = prevT ? voicing.notes.filter((n) => !before.has(n)) : [];
      const held = prevT ? voicing.notes.filter((n) => before.has(n)) : [];
      this.targets.push({ index: idx, pc: got.pc, chord, voicing, candidates, beats, pass: got.pass, moved, held });
    }
    return this.current < this.targets.length;
  }

  private assignBeats(): void {
    for (const t of this.targets) if (t.beatIndex === undefined) { t.beatIndex = this.nextBeat; this.nextBeat += t.beats; }
    const tr = this.transport!;
    const early = (this.spec.earlyMs ?? 150) / 1000;
    for (const t of this.targets) {
      t.dueTime = tr.beatTime(t.beatIndex!);
      t.windowEnd = tr.beatTime(t.beatIndex! + t.beats) - early;
    }
  }

  private emitTarget(): void {
    const t = this.currentTarget;
    if (!t || t.index === this.emittedIndex) return;
    this.emittedIndex = t.index;
    this.emit('target', { target: t, upcoming: this.upcoming });
  }

  private resultFor(t: Target): TargetResult {
    let r = this.results.get(t.index);
    if (!r) {
      r = {
        index: t.index, chordText: formatChord(t.chord), chord: t.chord, family: t.voicing.family, label: t.voicing.label, ok: false, met: null,
        latenessMs: null, timing: null, outcome: 'blank', assisted: false, repeats: 0, beats: t.beats,
        hints: 0, attempts: 0, message: '', playedNotes: [], targetNotes: t.voicing.notes, bpm: this.bpm, pass: t.pass,
      };
      if (t.pc.roman) r.roman = t.pc.roman;
      this.results.set(t.index, r);
    }
    return r;
  }

  /** The notes this drill is actually grading — the other hand is ignored, not marked wrong. */
  gradedNotes(notes: number[], target?: Target): number[] {
    const h = this.spec.hands;
    if (!h) return notes;
    const t = target ?? this.currentTarget;
    const tn = t?.voicing.notes ?? [];
    const split = h.split ?? (tn.length
      ? (h.grade === 'below' ? Math.max(...tn) + 1 : Math.min(...tn))
      : 60);
    return h.grade === 'below' ? notes.filter((n) => n < split) : notes.filter((n) => n >= split);
  }

  private grade(t: Target, notes: number[]): Verdict {
    const s = this.spec.strictness;
    if (this.spec.voiceLeading === 'strict' || !t.candidates.length) return evaluate(notes, t.voicing, s);
    // voice leading off: any candidate at this strictness passes; report the best
    let best: Verdict | null = null;
    for (const c of t.candidates) {
      const v = evaluate(notes, c, s);
      if (v.ok) return v;
      if (!best || rank(v) > rank(best)) best = v;
    }
    return best ?? evaluate(notes, t.voicing, s);
  }

  private record(t: Target, verdict: Verdict, attempt: Attempt | null, latenessMs: number | null, final: boolean): void {
    const r = this.resultFor(t);
    if (attempt) { r.attempts++; r.playedNotes = this.gradedNotes(attempt.notes, t); if (verdict.ok) r.attackTime = attempt.attackTime; }
    r.ok = verdict.ok; r.met = verdict.met; r.message = verdict.message; r.latenessMs = latenessMs; r.bpm = this.bpm;
    r.timing = this.classifyTiming(t, latenessMs);
    if (verdict.ok) {
      r.assisted = r.hints > 0;
      // free time has no grid, so there is nothing to be late for
      r.outcome = r.timing === null || r.timing === 'onTime' ? 'clean' : 'timing';
    } else {
      r.outcome = r.attempts > 0 ? 'wrong' : 'blank';
    }
    this.emit('verdict', { target: t, verdict, attempt, latenessMs, final });
  }

  // --- free mode ---------------------------------------------------------
  private onAttempt(a: Attempt): void {
    if (this.state !== 'running' && this.state !== 'countIn') return;
    if (this.spec.pacing.mode === 'free') {
      const t = this.currentTarget;
      if (!t || this.holdTimer !== null) return;
      const v = this.grade(t, this.gradedNotes(a.notes, t));
      this.record(t, v, a, null, v.ok);
      if (v.ok) this.advanceFree(this.spec.pacing.holdMs ?? 350);
      return;
    }
    // timed: attribute the attack to a chord window
    const attack = a.attackTime - this.latency;
    const early = Math.max(this.spec.earlyMs ?? 150, this.spec.pacing.timingWindowMs ?? 120) / 1000;
    const t = this.targets.find((x) => x.dueTime !== undefined && attack >= x.dueTime - early && attack < x.windowEnd!);
    if (!t) return;
    const r = this.resultFor(t);
    if (r.ok) return; // already nailed it; ignore re-strikes
    const v = this.grade(t, this.gradedNotes(a.notes, t));
    // in 'onCorrect' the chord repeats, so lateness is measured inside the current repetition
    const lateness = Math.round((attack - t.dueTime!) * 1000);
    this.record(t, v, a, lateness, v.ok);
  }

  private advanceFree(holdMs: number): void {
    const go = () => {
      this.holdTimer = null;
      this.current++;
      if (this.spec.length.reps && this.current >= this.spec.length.reps) { this.finish(); return; }
      if (!this.ensureTargets(3)) { this.finish(); return; }
      this.reportPass();
      this.emitTarget();
    };
    if (holdMs > 0) this.holdTimer = this._setTimeout(go, holdMs); else go();
  }

  // --- timed mode --------------------------------------------------------
  private onBeat(index: number, _time: number): void {
    if (this.state === 'paused' || this.state === 'ended') return;
    if (index < 0) return;
    if (this.state === 'countIn') this.setState('running');
    // finalize any chord whose window ended before this beat
    while (this.currentTarget && this.currentTarget.beatIndex! + this.currentTarget.beats <= index) {
      const t = this.currentTarget;
      const r = this.resultFor(t);
      if (!r.ok) {
        if (r.attempts === 0) this.record(t, { ok: false, met: null, diagnosis: ['nothingPlayed'], missingPcs: [], extraPcs: [], correctNotes: [], wrongNotes: [], missedNotes: t.voicing.notes, message: 'Missed' }, null, null, true);
        else this.emit('verdict', { target: t, verdict: { ok: false, met: r.met, diagnosis: [], missingPcs: [], extraPcs: [], correctNotes: [], wrongNotes: [], missedNotes: [], message: r.message }, attempt: null, latenessMs: r.latenessMs, final: true });
        // "wait until you get it": keep the click running and come round again on the same chord
        if (this.advanceMode === 'onCorrect' && r.repeats < (this.spec.pacing.maxRepeats ?? 8)) {
          r.repeats++;
          this.repeatCurrent(t);
          this.emitTarget();
          return;
        }
        r.outcome = r.attempts > 0 ? 'wrong' : 'blank';
      }
      this.current++;
      if (this.spec.length.reps && this.current >= this.spec.length.reps) { this.finish(); return; }
      if (!this.ensureTargets(3)) { this.finish(); return; }
      this.assignBeats();
      this.reportPass();
    }
    const t = this.currentTarget;
    if (t && t.beatIndex === index) this.emitTarget();
  }

  /** 'onCorrect' timed mode: slide this chord and every later one back one chord-length. */
  private repeatCurrent(t: Target): void {
    const shift = t.beats;
    for (let i = this.targets.indexOf(t); i < this.targets.length; i++) {
      const x = this.targets[i]!;
      if (x.beatIndex !== undefined) x.beatIndex += shift;
    }
    this.nextBeat += shift;
    // re-issue this chord: clear the failed verdict so the UI shows a fresh prompt, keep the counts
    const r = this.resultFor(t);
    r.ok = false; r.met = null; r.timing = null; r.latenessMs = null; r.outcome = 'blank'; r.message = '';
    this.emittedIndex = -1;
    this.assignBeats();
    this.emit('repeat', { target: t, repeats: r.repeats });
  }

  private reportPass(): void {
    const t = this.currentTarget;
    if (!t || t.pass <= this.lastPass) return;
    const passResults = this.resultsSoFar.filter((r) => r.pass === this.lastPass);
    const correct = passResults.filter((r) => r.ok).length;
    this.emit('pass', { pass: this.lastPass, correct, total: passResults.length });
    if (this.spec.ladder && passResults.length) {
      const l = this.spec.ladder;
      const next = correct === passResults.length ? Math.min(l.max, this.bpm + l.up) : Math.max(l.min, this.bpm - l.down);
      if (next !== this.bpm) this.setBpm(next);
    }
    this.lastPass = t.pass;
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.transport?.stop();
    for (const u of this.unsubs) u();
    if (this.holdTimer !== null) this._clearTimeout(this.holdTimer);
    if (this.endTimer !== null) this._clearTimeout(this.endTimer);
    if (this.pollTimer !== null) this._clearInterval(this.pollTimer);
    // settle anything in flight
    this.capture.settle(this.clock.now());
    const results = this.resultsSoFar.filter((r) => r.attempts > 0 || r.index < this.current);
    const graded = results.filter((r) => r.ok || r.attempts > 0 || r.index < this.current);
    const lat = graded.filter((r) => r.ok && r.latenessMs !== null).map((r) => r.latenessMs!);
    const outcomes: Record<Outcome, number> = { clean: 0, timing: 0, wrong: 0, blank: 0 };
    for (const r of graded) outcomes[r.outcome]++;
    const summary: DrillSummary = {
      specId: this.spec.id, startedAt: this.startedAt, endedAt: this.clock.now(), results: graded,
      total: graded.length, correct: graded.filter((r) => r.ok).length,
      clean: outcomes.clean, outcomes, timing: timingStats(graded),
      avgLatenessMs: lat.length ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length) : null,
      startBpm: this.startBpm, finalBpm: this.bpm, measuredBpm: measuredTempo(graded),
      hintsUsed: graded.reduce((a, r) => a + r.hints, 0),
      assisted: graded.filter((r) => r.assisted).length,
    };
    this.setState('ended');
    this.emit('end', { summary });
  }
}

/**
 * The tempo the player actually held, from the gaps between consecutive correct chords.
 * Uses the median gap so one long pause (a thought, a hint) does not drag the answer down.
 */
export function measuredTempo(results: TargetResult[]): number | null {
  const hits = results.filter((r) => r.attackTime !== undefined).sort((a, b) => a.index - b.index);
  const perBeat: number[] = [];
  for (let i = 1; i < hits.length; i++) {
    const a = hits[i - 1]!, b = hits[i]!;
    if (b.index !== a.index + 1) continue;       // not consecutive: the gap means nothing
    const gap = b.attackTime! - a.attackTime!;
    const beats = a.beats || 1;
    if (gap <= 0 || gap > 30) continue;
    perBeat.push(gap / beats);
  }
  if (perBeat.length < 3) return null;
  perBeat.sort((x, y) => x - y);
  const median = perBeat[Math.floor(perBeat.length / 2)]!;
  return Math.max(20, Math.min(400, Math.round(60 / median)));
}

/** Median and IQR of the signed offsets of every chord whose notes were right. */
export function timingStats(results: TargetResult[]): TimingStats | null {
  const offsets = results.filter((r) => r.ok && r.latenessMs !== null).map((r) => r.latenessMs!);
  if (!offsets.length) return null;
  const sorted = [...offsets].sort((a, b) => a - b);
  const q = (f: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(f * (sorted.length - 1))))]!;
  return {
    medianMs: q(0.5),
    spreadMs: q(0.75) - q(0.25),
    onTime: results.filter((r) => r.timing === 'onTime').length,
    early: results.filter((r) => r.timing === 'early').length,
    late: results.filter((r) => r.timing === 'late').length,
    offsets,
  };
}

function rank(v: Verdict): number { return v.met === null ? -1 : STRICTNESS_ORDER.length - STRICTNESS_ORDER.indexOf(v.met); }

function fallbackVoicing(chord: ChordSymbol): Voicing {
  const close = generateVoicings(chord, 'close', { lowIntervalLimits: false });
  if (close[0]) return close[0];
  return { chord, family: 'close', notes: [60 + chord.root], label: '1', degrees: ['1'] };
}
