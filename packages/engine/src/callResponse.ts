/**
 * Call and response: the app plays a phrase, you play it back, it tells you what you did.
 *
 * This is how a teacher teaches a line, and it is a different loop from the chord drill (which
 * asks "which notes") and the melody run (which measures a whole take). The phrase is short, you
 * hear it immediately before you play it, and the feedback names the error rather than scoring
 * it: "the book holds this note, you struck it twice" is something you can go and fix.
 *
 * Two kinds of call:
 *   - a **figure** — placement only, played on one note. Pitch is not graded; the question is
 *     purely where the hits go.
 *   - a **phrase** — real bars of a real melody. Pitch, duration and placement all graded, so
 *     wrong notes, split ties and flattened syncopations each come back named.
 *
 * The run ends when you get it right N times in a row, because once is luck.
 *
 * Audio is emitted as `play` events rather than rendered here, so the whole thing runs against a
 * manual clock in tests.
 */
import {
  type Figure, type FigureVerdict, type MelodyComparison, type MelodyNote, type PlayedNote,
  compareMelody, figureBeats, gradeFigure, pushIndices, swingPlacement, swingRatio,
} from '@shed/theory';
import { Emitter } from './clock.js';
import type { NoteEvent } from './capture.js';
import type { Transport } from './transport.js';

export interface CallNote { midi: number; beat: number; beats: number }

/** What gets played at you, and what you are judged against. */
export interface CallContent {
  label: string;
  bars: number;
  /** already swung: these are the times the call actually sounds */
  notes: CallNote[];
  /** grade pitch and duration too, not just placement */
  pitched: boolean;
  /** rhythm-only: indices of hits that are anticipations */
  pushes?: number[];
  /** pitched: the written line, rebased to the start of the phrase */
  written?: MelodyNote[];
}

/** A rung of the rhythm ladder, on one note. */
export function figureCall(figure: Figure, bpm: number, swing: boolean, voice = 72, beatsPerBar = 4): CallContent {
  const beats = figureBeats(figure, bpm, swing);
  return {
    label: figure.name,
    bars: figure.bars,
    pitched: false,
    pushes: pushIndices(figure, beatsPerBar),
    notes: beats.map((b) => ({ midi: voice, beat: b, beats: 0.4 })),
  };
}

/** Some bars of a real melody, rebased so the phrase starts at beat 0. */
export function phraseCall(
  melody: { notes: MelodyNote[]; beatsPerBar: number },
  fromBar: number,
  bars: number,
  bpm: number,
  swing: boolean,
): CallContent {
  const bpb = melody.beatsPerBar || 4;
  const from = fromBar * bpb;
  const to = from + bars * bpb;
  const ratio = swingRatio(bpm);
  const written: MelodyNote[] = melody.notes
    .filter((n) => n.midi !== null && n.start >= from - 1e-9 && n.start < to - 1e-9)
    .map((n) => ({ midi: n.midi, start: n.start - from, beats: Math.min(n.beats, to - n.start) }));
  const place = (b: number) => (swing ? swingPlacement(b, ratio) : b);
  return {
    label: `Bars ${fromBar + 1}–${fromBar + bars}`,
    bars,
    pitched: true,
    written,
    notes: written.map((n) => {
      const start = place(n.start);
      return { midi: n.midi!, beat: start, beats: Math.max(0.15, place(n.start + n.beats) - start) };
    }),
  };
}

export interface CallResponseSpec {
  call: CallContent;
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
  latencyMs?: number;
  /** stop after this many responses even if the streak is never reached. 0 = no limit. */
  maxRounds?: number;
  /** pitched calls: F4 and F5 are the same note unless this is set */
  octaveSensitive?: boolean;
}

export type Phase = 'idle' | 'countIn' | 'call' | 'response' | 'ended';

/** One answer, graded the way its call asks to be graded. */
export interface Answer {
  ok: boolean;
  headline: string;
  advice: string | null;
  figure?: FigureVerdict;
  melody?: MelodyComparison;
}

export interface CallResponseEvents extends Record<string, unknown> {
  phase: { phase: Phase; round: number; bars: number };
  beat: { bar: number; beat: number; countIn: boolean; index: number };
  /** schedule this in the audio layer */
  play: { time: number; notes: number[]; duration: number; velocity: number };
  /** a note you played during a response, placed immediately */
  hit: { beat: number; offsetMs: number; midi: number };
  result: { round: number; answer: Answer; streak: number; best: number };
  end: { rounds: number; best: number; answers: Answer[] };
}

interface Block { kind: 'call' | 'response'; start: number; end: number; round: number }

export class CallResponse extends Emitter<CallResponseEvents> {
  readonly spec: CallResponseSpec;
  phase: Phase = 'idle';
  streak = 0;
  best = 0;
  readonly answers: Answer[] = [];
  private readonly transport: Transport;
  private blocks: Block[] = [];
  private index = -1;
  private round = 0;
  private played: PlayedNote[] = [];
  private open = new Map<number, { beat: number; midi: number }>();
  private unsubs: Array<() => void> = [];
  private scheduled = new Set<number>();
  private lastAnnounced = '';

  constructor(opts: { spec: CallResponseSpec; transport: Transport }) {
    super();
    this.spec = opts.spec;
    this.transport = opts.transport;
  }

  get beatDuration(): number { return 60 / this.spec.bpm; }
  private get blockBeats(): number { return this.spec.call.bars * this.spec.timeSig.beats; }
  /** where the call's notes sound, in beats from the start of the phrase */
  get callBeats(): number[] { return this.spec.call.notes.map((n) => n.beat); }
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
    let at = this.blocks.length ? this.blocks[this.blocks.length - 1]!.end : 0;
    const round = this.round;
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
    for (const n of this.spec.call.notes) {
      const abs = call.start + n.beat;
      if (Math.floor(abs) !== beatIndex) continue;
      this.emit('play', {
        time: time + (abs - beatIndex) * this.beatDuration,
        notes: [n.midi],
        duration: Math.max(0.12, n.beats * this.beatDuration * 0.92),
        velocity: 0.8,
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
    if (cur.kind === 'response') { if (this.finishResponse(cur)) return; }
    this.index++;
    while (this.blocks.length <= this.index + 1) this.extend();
    const next = this.block;
    if (next) { this.played = []; this.open.clear(); this.setPhase(next.kind); }
  }

  /** Grade the answer just given. Returns true when the run is over. */
  private finishResponse(block: Block): boolean {
    // anything still held ends with the block rather than being dropped
    for (const [, o] of this.open) this.played.push({ midi: o.midi, startBeat: o.beat, beats: Math.max(0.1, this.blockBeats - o.beat) });
    this.open.clear();
    const answer = this.grade();
    this.answers.push(answer);
    this.streak = answer.ok ? this.streak + 1 : 0;
    this.best = Math.max(this.best, this.streak);
    this.emit('result', { round: this.answers.length, answer, streak: this.streak, best: this.best });
    void block;
    const capped = !!this.spec.maxRounds && this.answers.length >= this.spec.maxRounds;
    if (this.streak >= this.spec.target || capped) { this.stop(); return true; }
    return false;
  }

  private grade(): Answer {
    const c = this.spec.call;
    if (c.pitched && c.written) {
      const melody = compareMelody(c.written, this.played, {
        beatDuration: this.beatDuration,
        beatsPerBar: this.spec.timeSig.beats,
        swing: this.spec.swing,
        windowMs: this.spec.windowMs,
        octaveSensitive: this.spec.octaveSensitive ?? false,
      });
      return {
        ok: melody.score === 1 && !melody.extra.length,
        headline: melody.headline,
        advice: melody.detail[0] ?? null,
        melody,
      };
    }
    const figure = gradeFigure(this.callBeats, this.played.map((p) => p.startBeat), this.beatDuration, {
      windowMs: this.spec.windowMs,
      latencyMs: this.spec.latencyMs ?? 0,
      pushes: c.pushes ?? [],
    });
    return { ok: figure.ok, headline: figure.headline, advice: figure.advice, figure };
  }

  /** MIDI in. Only what lands inside a response window counts. */
  feed(e: NoteEvent): void {
    const cur = this.block;
    if (!cur || cur.kind !== 'response' || this.phase !== 'response') return;
    const lat = (this.spec.latencyMs ?? 0) / 1000;
    const beat = (e.time - lat - this.transport.beatTime(cur.start)) / this.beatDuration;
    if (e.type === 'on' && e.velocity > 0) {
      if (beat < -0.75 || beat > this.blockBeats + 0.25) return;
      // re-striking a pitch that is already sounding ends the first one; a rhythm figure is
      // usually played on a single note, so without this all but the last attack is lost
      const already = this.open.get(e.note);
      if (already) this.played.push({ midi: already.midi, startBeat: already.beat, beats: Math.max(0.05, beat - already.beat) });
      this.open.set(e.note, { beat, midi: e.note });
      const wants = this.callBeats;
      const nearest = wants.reduce((a, b) => (Math.abs(b - beat) < Math.abs(a - beat) ? b : a), wants[0] ?? 0);
      this.emit('hit', { beat, midi: e.note, offsetMs: (beat - nearest) * this.beatDuration * 1000 });
    } else {
      const o = this.open.get(e.note);
      if (!o) return;
      this.open.delete(e.note);
      this.played.push({ midi: o.midi, startBeat: o.beat, beats: Math.max(0.05, beat - o.beat) });
    }
  }

  /** Play the phrase once without starting a run — the "hear it" button. */
  preview(now: number): void {
    for (const n of this.spec.call.notes) {
      this.emit('play', {
        time: now + 0.1 + n.beat * this.beatDuration,
        notes: [n.midi],
        duration: Math.max(0.12, n.beats * this.beatDuration * 0.92),
        velocity: 0.8,
      });
    }
  }

  stop(): void {
    if (this.phase === 'ended' || this.phase === 'idle') return;
    this.transport.stop();
    for (const u of this.unsubs) u();
    this.unsubs = [];
    this.setPhase('ended');
    this.emit('end', { rounds: this.answers.length, best: this.best, answers: this.answers });
  }

  /**
   * Announce the phase. Two responses in a row are two different things to do, so the round has
   * to be part of the identity — otherwise "call once then keep answering" would look to the UI
   * like one endless response.
   */
  private setPhase(phase: Phase): void {
    const round = (this.block?.round ?? 0) + 1;
    const key = `${phase}:${round}`;
    if (this.lastAnnounced === key) return;
    this.lastAnnounced = key;
    this.phase = phase;
    this.emit('phase', { phase, round, bars: this.spec.call.bars });
  }
}
