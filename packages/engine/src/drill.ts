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
  /** External backing track: the drill waits for a tap on beat 1, runs with the click muted. */
  backing?: { kind: 'youtube'; videoId: string; startSec?: number };
  /** "Name it & play it": the player must also say the chord name; graded separately. */
  speak?: boolean;
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
}

export interface TargetResult {
  index: number;
  chordText: string;
  chord: ChordSymbol;
  roman?: string;
  family: string;
  label: string;
  ok: boolean;
  met: Strictness | null;
  latenessMs: number | null;
  hints: number;
  attempts: number;
  message: string;
  playedNotes: number[];
  targetNotes: number[];
  bpm: number;
  pass: number;
  spoken?: { heard: string; ok: boolean };
}

export interface DrillSummary {
  specId: string;
  startedAt: number;
  endedAt: number;
  results: TargetResult[];
  total: number;
  correct: number;
  avgLatenessMs: number | null;
  finalBpm: number;
  hintsUsed: number;
}

export type DrillState = 'idle' | 'countIn' | 'running' | 'paused' | 'ended';

export interface DrillEvents extends Record<string, unknown> {
  state: { state: DrillState };
  target: { target: Target; upcoming: Target[] };
  verdict: { target: Target; verdict: Verdict; attempt: Attempt | null; latenessMs: number | null; final: boolean };
  hint: { target: Target; level: number };
  tempo: { bpm: number };
  pass: { pass: number; correct: number; total: number };
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
    this.source = makeSource(opts.spec, this.rng, opts.weight);
    if (this.spec.pacing.mode === 'timed' && !this.transport) throw new Error('timed drills need a transport');
  }

  get currentTarget(): Target | undefined { return this.targets[this.current]; }

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
  start(): void {
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
      t.start();
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
      this.targets.push({ index: idx, pc: got.pc, chord, voicing, candidates, beats, pass: got.pass });
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
        latenessMs: null, hints: 0, attempts: 0, message: '', playedNotes: [], targetNotes: t.voicing.notes, bpm: this.bpm, pass: t.pass,
      };
      if (t.pc.roman) r.roman = t.pc.roman;
      this.results.set(t.index, r);
    }
    return r;
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
    if (attempt) { r.attempts++; r.playedNotes = attempt.notes; }
    r.ok = verdict.ok; r.met = verdict.met; r.message = verdict.message; r.latenessMs = latenessMs; r.bpm = this.bpm;
    this.emit('verdict', { target: t, verdict, attempt, latenessMs, final });
  }

  // --- free mode ---------------------------------------------------------
  private onAttempt(a: Attempt): void {
    if (this.state !== 'running' && this.state !== 'countIn') return;
    if (this.spec.pacing.mode === 'free') {
      const t = this.currentTarget;
      if (!t || this.holdTimer !== null) return;
      const v = this.grade(t, a.notes);
      this.record(t, v, a, null, v.ok);
      if (v.ok) this.advanceFree(this.spec.pacing.holdMs ?? 350);
      return;
    }
    // timed: attribute the attack to a chord window
    const attack = a.attackTime - this.latency;
    const early = (this.spec.earlyMs ?? 150) / 1000;
    const t = this.targets.find((x) => x.dueTime !== undefined && attack >= x.dueTime - early && attack < x.windowEnd!);
    if (!t) return;
    const r = this.resultFor(t);
    if (r.ok) return; // already nailed it; ignore re-strikes
    const v = this.grade(t, a.notes);
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
    const summary: DrillSummary = {
      specId: this.spec.id, startedAt: this.startedAt, endedAt: this.clock.now(), results: graded,
      total: graded.length, correct: graded.filter((r) => r.ok).length,
      avgLatenessMs: lat.length ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length) : null,
      finalBpm: this.bpm, hintsUsed: graded.reduce((a, r) => a + r.hints, 0),
    };
    this.setState('ended');
    this.emit('end', { summary });
  }
}

function rank(v: Verdict): number { return v.met === null ? -1 : STRICTNESS_ORDER.length - STRICTNESS_ORDER.indexOf(v.met); }

function fallbackVoicing(chord: ChordSymbol): Voicing {
  const close = generateVoicings(chord, 'close', { lowIntervalLimits: false });
  if (close[0]) return close[0];
  return { chord, family: 'close', notes: [60 + chord.root], label: '1', degrees: ['1'] };
}
