/**
 * Melody run: play the head against the click, get your time analysed afterwards.
 *
 * Deliberately not a DrillRunner. A drill grades chords — a set of notes you either played or
 * did not, at a moment the drill chose. A head is a line: single notes, your phrasing, and the
 * question is not "was it right" but "where did it sit". Nothing is failed here and nothing
 * blocks; the run records, the analysis talks.
 *
 * Two modes, and the difference matters:
 *   - no written melody → your notes are placed on the nearest subdivision of the grid. This
 *     works for any tune in any fake book on your stand, and needs no melody data at all.
 *   - a written melody   → your notes are matched to it by pitch and timed against where they
 *     are *written*, which can see a note held too long where a bare grid cannot.
 */
import {
  type Grid, type Melody, type MelodyTimingReport, type Onset, type Subdivision, type TimingReport,
  analyzeMelodyTiming, analyzeTiming, quantise, repeatMelody,
} from '@shed/theory';
import { type Clock, Emitter } from './clock.js';
import type { NoteEvent } from './capture.js';
import type { Transport } from './transport.js';

export interface MelodyRunSpec {
  title: string;
  songId?: string;
  bpm: number;
  timeSig: { beats: number; unit: number };
  countInBars: number;
  /** stop after this many bars of music; 0 = run until stopped */
  bars: number;
  /** off-beat eighths are expected at the swing ratio for the tempo, not halfway */
  swing: boolean;
  /** the finest grid a note is allowed to land on */
  subdivision: Subdivision;
  /** beats of the bar the click sounds on, 0-based; null = all four */
  clickBeats: number[] | null;
  /** audible click subdivision (1 = quarters) */
  clickSubdivision?: number;
  /** the written head. Absent is the normal case — see the module comment. */
  melody?: Melody | null;
  /** beats in one chorus, so a written head can be laid out over several passes */
  formBeats?: number;
  latencyMs?: number;
  /** ± ms that counts as on the grid */
  windowMs?: number;
}

/** What the screen needs while you are playing: the last note's placement, live. */
export interface LiveNote { midi: number; time: number; offsetMs: number; bar: number; beat: number }

export interface MelodyRunReport {
  spec: MelodyRunSpec;
  startedAt: number;
  endedAt: number;
  grid: Grid;
  onsets: Onset[];
  timing: TimingReport;
  /** only when a written melody was supplied */
  melody: MelodyTimingReport | null;
  /** the take itself, quantised — this is how a head gets into the app legitimately */
  take: Melody;
  /** bars of music actually covered */
  bars: number;
}

export interface MelodyRunEvents extends Record<string, unknown> {
  state: { state: 'idle' | 'countIn' | 'running' | 'ended' };
  beat: { bar: number; beat: number; countIn: boolean; index: number };
  note: LiveNote;
  end: { report: MelodyRunReport };
}

export interface MelodyRunOptions {
  spec: MelodyRunSpec;
  clock: Clock;
  transport: Transport;
}

export class MelodyRun extends Emitter<MelodyRunEvents> {
  readonly spec: MelodyRunSpec;
  state: 'idle' | 'countIn' | 'running' | 'ended' = 'idle';
  private readonly clock: Clock;
  private readonly transport: Transport;
  private readonly events: NoteEvent[] = [];
  private unsubs: Array<() => void> = [];
  private startedAt = 0;
  private endedAt = 0;
  private lastBeatIndex = -1;

  constructor(opts: MelodyRunOptions) {
    super();
    this.spec = opts.spec;
    this.clock = opts.clock;
    this.transport = opts.transport;
  }

  get beatDuration(): number { return 60 / this.spec.bpm; }

  get grid(): Grid {
    return { startTime: this.transport.musicStart, beatDuration: this.beatDuration, beatsPerBar: this.spec.timeSig.beats };
  }

  /** Note-ons and note-offs, from MIDI or the on-screen keyboard. Offs only affect the saved take. */
  feed(e: NoteEvent): void {
    if (this.state !== 'running' && this.state !== 'countIn') return;
    this.events.push(e);
    if (e.type !== 'on' || e.velocity <= 0) return;
    const beats = (e.time - this.transport.musicStart) / this.beatDuration;
    if (beats < -0.5) return;                              // still counting in
    const slot = this.nearestSlot(beats);
    this.emit('note', {
      midi: e.note, time: e.time,
      offsetMs: (beats - slot) * this.beatDuration * 1000 - (this.spec.latencyMs ?? 0),
      bar: Math.floor(slot / this.spec.timeSig.beats),
      beat: ((Math.floor(slot) % this.spec.timeSig.beats) + this.spec.timeSig.beats) % this.spec.timeSig.beats,
    });
  }

  /** Grid position nearest a fractional beat, for the live readout only. */
  private nearestSlot(beats: number): number {
    const k = Math.floor(beats);
    const frac = beats - k;
    const off = this.spec.swing ? swingFor(this.spec.bpm) : 0.5;
    const cands = this.spec.subdivision === 'quarter' ? [0, 1]
      : this.spec.subdivision === 'triplet' ? [0, 1 / 3, 2 / 3, 1]
      : this.spec.subdivision === 'sixteenth' ? [0, 0.25, 0.5, 0.75, 1]
      : [0, off, 1];
    let best = 0, d = Infinity;
    for (const c of cands) { const dd = Math.abs(frac - c); if (dd < d) { d = dd; best = c; } }
    return k + best;
  }

  get onsets(): Onset[] {
    return this.events
      .filter((e) => e.type === 'on' && e.velocity > 0 && e.time >= this.transport.musicStart - this.beatDuration * 0.5)
      .map((e) => ({ midi: e.note, time: e.time, velocity: e.velocity }));
  }

  start(at?: number): void {
    if (this.state !== 'idle') return;
    this.startedAt = this.clock.now();
    const t = this.transport;
    t.bpm = this.spec.bpm;
    t.timeSig = this.spec.timeSig;
    t.countInBars = this.spec.countInBars;
    t.subdivision = this.spec.clickSubdivision ?? 1;
    t.clickBeats = this.spec.clickBeats;
    this.unsubs.push(t.on('beat', (b) => this.onBeat(b)));
    this.setState(this.spec.countInBars > 0 ? 'countIn' : 'running');
    t.start(at);
  }

  private onBeat(b: { bar: number; beat: number; countIn: boolean; index: number }): void {
    this.lastBeatIndex = b.index;
    if (!b.countIn && this.state === 'countIn') this.setState('running');
    this.emit('beat', b);
    const total = this.spec.bars * this.spec.timeSig.beats;
    if (total > 0 && b.index >= total) this.stop();
  }

  /** Stop and produce the report. Safe to call twice. */
  stop(): MelodyRunReport | null {
    if (this.state === 'ended' || this.state === 'idle') return null;
    this.endedAt = this.clock.now();
    this.transport.stop();
    for (const u of this.unsubs) u();
    this.unsubs = [];
    this.setState('ended');
    const report = this.report();
    this.emit('end', { report });
    return report;
  }

  report(): MelodyRunReport {
    const spec = this.spec;
    const grid = this.grid;
    const onsets = this.onsets;
    const common = {
      swing: spec.swing, subdivision: spec.subdivision,
      latencyMs: spec.latencyMs ?? 0, windowMs: spec.windowMs ?? 50,
    };
    const beatsPlayed = Math.max(0, (this.endedAt || this.clock.now()) - grid.startTime) / this.beatDuration;
    const bars = Math.max(0, Math.round(beatsPlayed / spec.timeSig.beats));

    let melody: MelodyTimingReport | null = null;
    if (spec.melody && spec.melody.notes.length) {
      const formBeats = spec.formBeats ?? spec.bars * spec.timeSig.beats;
      const passes = Math.max(1, Math.ceil(beatsPlayed / Math.max(1, formBeats)));
      const written = repeatMelody(spec.melody, passes, formBeats);
      melody = analyzeMelodyTiming(written, onsets, grid, common);
    }

    return {
      spec, grid, onsets, bars,
      startedAt: this.startedAt,
      endedAt: this.endedAt || this.clock.now(),
      timing: analyzeTiming(onsets, grid, common),
      melody,
      take: this.take(),
    };
  }

  /**
   * The performance as a Melody, quantised to the grid it was played against.
   *
   * Recording your own head is the only way an in-copyright tune gets a melody in this app, and
   * it is a better exercise than typing notation anyway: you have to know it to play it.
   */
  take(): Melody {
    const open = new Map<number, number>();
    const out: Array<{ midi: number; startBeat: number; beats: number }> = [];
    for (const e of this.events) {
      const beat = (e.time - this.transport.musicStart) / this.beatDuration;
      if (e.type === 'on' && e.velocity > 0) open.set(e.note, beat);
      else {
        const started = open.get(e.note);
        if (started === undefined) continue;
        open.delete(e.note);
        if (beat > -0.25) out.push({ midi: e.note, startBeat: Math.max(0, started), beats: Math.max(0.25, beat - started) });
      }
    }
    const last = ((this.endedAt || this.clock.now()) - this.transport.musicStart) / this.beatDuration;
    for (const [note, started] of open) out.push({ midi: note, startBeat: Math.max(0, started), beats: Math.max(0.25, last - started) });
    const grid = this.spec.subdivision === 'triplet' ? 1 / 3 : this.spec.subdivision === 'sixteenth' ? 0.25 : this.spec.subdivision === 'quarter' ? 1 : 0.5;
    const m = quantise(out.sort((a, b) => a.startBeat - b.startBeat), grid);
    return { ...m, beatsPerBar: this.spec.timeSig.beats };
  }

  private setState(state: MelodyRun['state']): void { this.state = state; this.emit('state', { state }); }
}

/** Local copy of the tempo→swing curve so the live readout does not need the theory import path. */
function swingFor(bpm: number): number {
  const pts: Array<[number, number]> = [[60, 0.76], [80, 0.75], [140, 0.667], [180, 0.62], [220, 0.565], [300, 0.54]];
  if (bpm <= pts[0]![0]) return pts[0]![1];
  if (bpm >= pts[pts.length - 1]![0]) return pts[pts.length - 1]![1];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]!;
    const [x1, y1] = pts[i]!;
    if (bpm <= x1) return y0 + ((bpm - x0) / (x1 - x0)) * (y1 - y0);
  }
  return 0.667;
}
