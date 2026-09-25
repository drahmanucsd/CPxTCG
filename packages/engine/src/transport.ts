/**
 * Transport: bars/beats on the clock with look-ahead scheduling.
 * Audio events (clicks) are scheduled ahead through a ClickSink; UI beat events fire at (or just after) beat time.
 */
import { type Clock, Emitter } from './clock.js';

export interface TimeSignature { beats: number; unit: number }

export type ClickKind = 'bar' | 'beat' | 'sub' | 'countIn';

export interface ClickSink {
  click(time: number, kind: ClickKind): void;
}

export interface BeatEvent { bar: number; beat: number; time: number; countIn: boolean; /** absolute beat index from the start of the music (count-in beats are negative) */ index: number }

export interface TransportEvents extends Record<string, unknown> {
  beat: BeatEvent;
  /** fired when a beat is scheduled (lookAhead before it sounds) — schedule audio for that beat here */
  schedule: BeatEvent & { beatDuration: number };
  start: { time: number };
  stop: { time: number };
  tempo: { bpm: number };
}

export interface TransportOptions {
  bpm: number;
  timeSig?: TimeSignature;
  countInBars?: number;
  /** clicks per beat (1 = quarter notes, 2 = 8ths, 3 = triplets) */
  subdivision?: number;
  /**
   * Which beats of the bar actually sound, 0-based. null = all of them.
   *
   * [1, 3] is the click on 2 and 4 that every jazz teacher asks for: the downbeat stops being
   * given to you, so keeping the form becomes your job rather than the metronome's. The count-in
   * always sounds every beat — otherwise there is no way to know where one is.
   */
  clickBeats?: number[] | null;
  /** seconds to schedule ahead of the clock */
  lookAhead?: number;
  /** ms between scheduler ticks */
  tickMs?: number;
  muted?: boolean;
  /** Timer abstraction (tests pass a manual one). */
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (h: unknown) => void;
}

export class Transport extends Emitter<TransportEvents> {
  bpm: number;
  timeSig: TimeSignature;
  countInBars: number;
  subdivision: number;
  clickBeats: number[] | null;
  muted: boolean;
  private lookAhead: number;
  private tickMs: number;
  private timer: unknown = null;
  private startTime = 0;      // clock time of beat 0 (first music beat)
  private nextBeatIndex = 0;  // next beat to schedule (may be negative during count-in)
  private lastEmitted = -Infinity;
  private running = false;
  private readonly _setInterval: (fn: () => void, ms: number) => unknown;
  private readonly _clearInterval: (h: unknown) => void;
  private pendingBeats: BeatEvent[] = [];

  constructor(private readonly clock: Clock, private readonly sink: ClickSink, opts: TransportOptions) {
    super();
    this.bpm = opts.bpm;
    this.timeSig = opts.timeSig ?? { beats: 4, unit: 4 };
    this.countInBars = opts.countInBars ?? 1;
    this.subdivision = opts.subdivision ?? 1;
    this.clickBeats = opts.clickBeats ?? null;
    this.muted = opts.muted ?? false;
    this.lookAhead = opts.lookAhead ?? 0.1;
    this.tickMs = opts.tickMs ?? 25;
    this._setInterval = opts.setInterval ?? ((fn, ms) => setInterval(fn, ms));
    this._clearInterval = opts.clearInterval ?? ((h) => clearInterval(h as number));
  }

  get isRunning(): boolean { return this.running; }
  get beatDuration(): number { return 60 / this.bpm; }
  get barDuration(): number { return this.beatDuration * this.timeSig.beats; }

  /** Clock time of an absolute beat index (0 = first music beat). */
  beatTime(index: number): number { return this.startTime + index * this.beatDuration; }
  /** Fractional beat index at a clock time. */
  beatAt(time: number): number { return (time - this.startTime) / this.beatDuration; }
  /** Time of beat 0 (music start). */
  get musicStart(): number { return this.startTime; }

  start(at?: number): void {
    if (this.running) return;
    const now = at ?? this.clock.now() + 0.05;
    this.startTime = now + this.countInBars * this.barDuration;
    this.nextBeatIndex = -this.countInBars * this.timeSig.beats;
    this.lastEmitted = -Infinity;
    this.running = true;
    this.emit('start', { time: now });
    this.timer = this._setInterval(() => this.tick(), this.tickMs);
    this.tick();
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.timer !== null) this._clearInterval(this.timer);
    this.timer = null;
    this.pendingBeats = [];
    this.emit('stop', { time: this.clock.now() });
  }

  /** Change tempo; re-anchors so the current beat position is preserved. */
  setBpm(bpm: number): void {
    if (this.running) {
      const now = this.clock.now();
      const beatPos = this.beatAt(now);
      this.bpm = bpm;
      this.startTime = now - beatPos * this.beatDuration;
    } else {
      this.bpm = bpm;
    }
    this.emit('tempo', { bpm });
  }

  /** Shift the grid by dt seconds (positive = beats happen later). For syncing to an external track. */
  nudge(dt: number): void { this.startTime += dt; }

  /** Called on every timer tick: schedule clicks up to lookAhead ahead and emit beats that are due. */
  tick(): void {
    if (!this.running) return;
    const now = this.clock.now();
    const horizon = now + this.lookAhead;
    while (this.beatTime(this.nextBeatIndex) <= horizon) {
      const idx = this.nextBeatIndex;
      const t = this.beatTime(idx);
      const countIn = idx < 0;
      const beatsPerBar = this.timeSig.beats;
      const beatInBar = ((idx % beatsPerBar) + beatsPerBar) % beatsPerBar;
      const bar = Math.floor(idx / beatsPerBar);
      if (!this.muted && (countIn || this.clickBeats === null || this.clickBeats.includes(beatInBar))) {
        this.sink.click(t, countIn ? 'countIn' : beatInBar === 0 ? 'bar' : 'beat');
        for (let s = 1; s < this.subdivision; s++) this.sink.click(t + (s * this.beatDuration) / this.subdivision, 'sub');
      }
      const ev: BeatEvent = { bar, beat: beatInBar, time: t, countIn, index: idx };
      this.pendingBeats.push(ev);
      this.emit('schedule', { ...ev, beatDuration: this.beatDuration });
      this.nextBeatIndex++;
    }
    // emit beats whose time has arrived
    while (this.pendingBeats.length && this.pendingBeats[0]!.time <= now + 0.005) {
      const b = this.pendingBeats.shift()!;
      if (b.index > this.lastEmitted) { this.lastEmitted = b.index; this.emit('beat', b); }
    }
  }
}
