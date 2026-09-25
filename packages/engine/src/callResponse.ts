/**
 * Call and response: the app plays a figure, you play it back, it tells you where you put it.
 *
 * This is how a teacher actually teaches placement, and it is a different loop from both the
 * chord drill (which asks "which notes") and the melody run (which measures a whole take). Here
 * the phrase is short, you hear it immediately before you play it, and the feedback names the
 * error rather than scoring it: "you flattened the push" is a thing you can fix on the next
 * repetition; "+180 ms late" is not.
 *
 * The run ends when you get it right N times in a row, because that is what learning a placement
 * means — once is luck.
 *
 * Audio is emitted as `play` events rather than rendered here, so the whole thing runs against a
 * manual clock in tests.
 */
import { type Figure, type FigureVerdict, figureBeats, gradeFigure, pushIndices } from '@shed/theory';
import { Emitter } from './clock.js';
import type { NoteEvent } from './capture.js';
import type { Transport } from './transport.js';

export interface CallResponseSpec {
  figure: Figure;
  bpm: number;
  timeSig: { beats: number; unit: number };
  countInBars: number;
  swing: boolean;
  /** beats of the bar the click sounds on, 0-based; null = all */
  clickBeats: number[] | null;
  /** play the call before every response, or once at the start and then keep going */
  callEvery: boolean;
  /** clean responses in a row that ends the run */
  target: number;
  /** ± ms that counts as hitting a placement */
  windowMs: number;
  /** what the call is played with; the response is graded on placement, never on pitch */
  voice: number[];
  latencyMs?: number;
  /** stop after this many responses even if the streak is never reached. 0 = no limit. */
  maxRounds?: number;
}

export type Phase = 'idle' | 'countIn' | 'call' | 'response' | 'ended';

export interface CallResponseEvents extends Record<string, unknown> {
  phase: { phase: Phase; round: number; bars: number };
  beat: { bar: number; beat: number; countIn: boolean; index: number };
  /** schedule this in the audio layer */
  play: { time: number; notes: number[]; duration: number; velocity: number };
  /** a note you played during a response, placed immediately */
  hit: { beat: number; offsetMs: number; midi: number };
  result: { round: number; verdict: FigureVerdict; streak: number; best: number };
  end: { rounds: number; best: number; results: FigureVerdict[] };
}

interface Block { kind: 'call' | 'response'; start: number; end: number; round: number }

export class CallResponse extends Emitter<CallResponseEvents> {
  readonly spec: CallResponseSpec;
  phase: Phase = 'idle';
  streak = 0;
  best = 0;
  readonly results: FigureVerdict[] = [];
  private readonly transport: Transport;
  private blocks: Block[] = [];
  private index = -1;
  private round = 0;
  private answered: number[] = [];
  private unsubs: Array<() => void> = [];
  private scheduled = new Set<number>();

  constructor(opts: { spec: CallResponseSpec; transport: Transport }) {
    super();
    this.spec = opts.spec;
    this.transport = opts.transport;
  }

  get beatDuration(): number { return 60 / this.spec.bpm; }
  private get blockBeats(): number { return this.spec.figure.bars * this.spec.timeSig.beats; }
  /** hit positions within a phrase, in beats, with swing already resolved */
  get hitBeats(): number[] { return figureBeats(this.spec.figure, this.spec.bpm, this.spec.swing); }
  get pushes(): number[] { return pushIndices(this.spec.figure, this.spec.timeSig.beats); }
  private get block(): Block | undefined { return this.blocks[this.index]; }

  start(at?: number): void {
    if (this.phase !== 'idle') return;
    const t = this.transport;
    t.bpm = this.spec.bpm;
    t.timeSig = this.spec.timeSig;
    t.countInBars = this.spec.countInBars;
    t.clickBeats = this.spec.clickBeats;
    this.extend();
    this.unsubs.push(t.on('beat', (b) => this.onBeat(b)));
    this.unsubs.push(t.on('schedule', (b) => this.onSchedule(b.index, b.time)));
    this.index = 0;
    this.setPhase(this.spec.countInBars > 0 ? 'countIn' : this.blocks[0]!.kind);
    t.start(at);
  }

  /** Queue the next call/response pair. */
  private extend(): void {
    const n = this.blockBeats;
    const from = this.blocks.length ? this.blocks[this.blocks.length - 1]!.end : 0;
    const round = this.round;
    let at = from;
    if (round === 0 || this.spec.callEvery) {
      this.blocks.push({ kind: 'call', start: at, end: at + n, round });
      at += n;
    }
    this.blocks.push({ kind: 'response', start: at, end: at + n, round });
    this.round++;
  }

  /** Schedule the call's notes as the transport reaches each beat. */
  private onSchedule(beatIndex: number, time: number): void {
    if (beatIndex < 0 || this.scheduled.has(beatIndex)) return;
    this.scheduled.add(beatIndex);
    while (this.blocks[this.blocks.length - 1]!.end <= beatIndex + this.blockBeats) this.extend();
    const call = this.blocks.find((b) => b.kind === 'call' && beatIndex >= b.start && beatIndex < b.end);
    if (!call) return;
    const dur = this.beatDuration * 0.45;
    for (const h of this.hitBeats) {
      const abs = call.start + h;
      if (Math.floor(abs) !== beatIndex) continue;
      this.emit('play', {
        time: time + (abs - beatIndex) * this.beatDuration,
        notes: this.spec.voice, duration: dur, velocity: 0.8,
      });
    }
  }

  private onBeat(b: { bar: number; beat: number; countIn: boolean; index: number }): void {
    this.emit('beat', b);
    if (b.countIn) return;
    const cur = this.block;
    if (!cur) return;
    if (this.phase === 'countIn') this.setPhase(cur.kind);
    if (b.index < cur.end) return;
    // this block is over
    if (cur.kind === 'response') { if (this.finishResponse()) return; }
    this.index++;
    while (this.blocks.length <= this.index + 1) this.extend();
    const next = this.block;
    if (next) { this.answered = []; this.setPhase(next.kind); }
  }

  /** Grade the answer just given. Returns true when the run is over. */
  private finishResponse(): boolean {
    const verdict = gradeFigure(this.hitBeats, this.answered, this.beatDuration, {
      windowMs: this.spec.windowMs,
      latencyMs: this.spec.latencyMs ?? 0,
      pushes: this.pushes,
    });
    this.results.push(verdict);
    this.streak = verdict.ok ? this.streak + 1 : 0;
    this.best = Math.max(this.best, this.streak);
    this.emit('result', { round: this.results.length, verdict, streak: this.streak, best: this.best });
    const capped = !!this.spec.maxRounds && this.results.length >= this.spec.maxRounds;
    if (this.streak >= this.spec.target || capped) { this.stop(); return true; }
    return false;
  }

  /** Note-ons from MIDI. Only what lands inside a response window counts. */
  feed(e: NoteEvent): void {
    if (e.type !== 'on' || e.velocity <= 0) return;
    const cur = this.block;
    if (!cur || cur.kind !== 'response' || this.phase !== 'response') return;
    const beat = (e.time - this.transport.beatTime(cur.start)) / this.beatDuration;
    if (beat < -0.75 || beat > this.blockBeats + 0.25) return;
    this.answered.push(beat);
    const wants = this.hitBeats;
    const nearest = wants.reduce((a, b) => (Math.abs(b - beat) < Math.abs(a - beat) ? b : a), wants[0] ?? 0);
    this.emit('hit', { beat, midi: e.note, offsetMs: (beat - nearest) * this.beatDuration * 1000 - (this.spec.latencyMs ?? 0) });
  }

  /** Play the figure once without starting a run — the "hear it" button. */
  preview(now: number): void {
    const dur = this.beatDuration * 0.45;
    for (const h of this.hitBeats) {
      this.emit('play', { time: now + 0.1 + h * this.beatDuration, notes: this.spec.voice, duration: dur, velocity: 0.8 });
    }
  }

  stop(): void {
    if (this.phase === 'ended' || this.phase === 'idle') return;
    this.transport.stop();
    for (const u of this.unsubs) u();
    this.unsubs = [];
    this.setPhase('ended');
    this.emit('end', { rounds: this.results.length, best: this.best, results: this.results });
  }

  /**
   * Announce the phase. Two responses in a row are two different things to do, so the round has
   * to be part of the identity — otherwise "call once then keep answering" would look to the UI
   * like one endless response.
   */
  private lastAnnounced = '';
  private setPhase(phase: Phase): void {
    const round = (this.block?.round ?? 0) + 1;
    const key = `${phase}:${round}`;
    if (this.lastAnnounced === key) return;
    this.lastAnnounced = key;
    this.phase = phase;
    this.emit('phase', { phase, round, bars: this.spec.figure.bars });
  }
}
