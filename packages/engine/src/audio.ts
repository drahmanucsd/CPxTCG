/**
 * Audio: click synth for the metronome and an Instrument interface for playing voicings.
 */
import type { ClickKind, ClickSink } from './transport.js';

export interface Instrument {
  /** Play a note at an absolute audio-clock time. */
  play(note: number, time: number, durationSec: number, velocity?: number): void;
  /** Play a chord at once. */
  playChord(notes: number[], time: number, durationSec: number, velocity?: number): void;
  ready: Promise<void>;
  readonly name: string;
}

export class ClickSynth implements ClickSink {
  volume = 0.6;
  constructor(private readonly ctx: AudioContext, private readonly out: AudioNode = ctx.destination) {}
  click(time: number, kind: ClickKind): void {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const freq = kind === 'bar' ? 1600 : kind === 'countIn' ? 1200 : kind === 'sub' ? 700 : 1000;
    const vol = (kind === 'bar' ? 1 : kind === 'sub' ? 0.25 : 0.6) * this.volume;
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(vol, time + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
    osc.connect(gain).connect(this.out);
    osc.start(time);
    osc.stop(time + 0.05);
  }
}

/** A plain additive synth piano so the app makes sound with no network. Replaced by samples when they load. */
export class SynthPiano implements Instrument {
  readonly name = 'synth';
  readonly ready = Promise.resolve();
  volume = 0.5;
  constructor(private readonly ctx: AudioContext, private readonly out: AudioNode = ctx.destination) {}
  play(note: number, time: number, durationSec: number, velocity = 0.8): void {
    const ctx = this.ctx;
    const f = 440 * Math.pow(2, (note - 69) / 12);
    const gain = ctx.createGain();
    const v = velocity * this.volume * 0.25;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(v, time + 0.005);
    gain.gain.exponentialRampToValueAtTime(v * 0.35, time + 0.25);
    gain.gain.exponentialRampToValueAtTime(0.0005, time + durationSec);
    gain.connect(this.out);
    const partials: Array<[number, number, OscillatorType]> = [[1, 1, 'triangle'], [2, 0.35, 'sine'], [3, 0.12, 'sine'], [4, 0.06, 'sine']];
    for (const [mult, amp, type] of partials) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = f * mult;
      const g = ctx.createGain();
      g.gain.value = amp;
      osc.connect(g).connect(gain);
      osc.start(time);
      osc.stop(time + durationSec + 0.05);
    }
  }
  playChord(notes: number[], time: number, durationSec: number, velocity = 0.8): void {
    for (const n of notes) this.play(n, time, durationSec, velocity);
  }
}

/** Measures round-trip latency: user taps along to clicks, we return the median offset (ms; positive = late). */
export function medianOffsetMs(clickTimes: number[], tapTimes: number[]): number | null {
  const offsets: number[] = [];
  for (const tap of tapTimes) {
    let best = Infinity;
    for (const c of clickTimes) { const d = (tap - c) * 1000; if (Math.abs(d) < Math.abs(best)) best = d; }
    if (Number.isFinite(best) && Math.abs(best) < 300) offsets.push(best);
  }
  if (offsets.length < 3) return null;
  offsets.sort((a, b) => a - b);
  return Math.round(offsets[Math.floor(offsets.length / 2)]!);
}
