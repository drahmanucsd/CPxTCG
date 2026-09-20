import { describe, expect, it } from 'vitest';
import { formatChord } from '@shed/theory';
import { ChordCapture } from '../src/capture.js';
import { ManualClock } from '../src/clock.js';
import { DrillRunner, type DrillSpec, type Target } from '../src/drill.js';
import { PRESETS, PRESET_BY_ID } from '../src/presets.js';
import { ManualTimers, makeTransport } from './helpers.js';

/** Simulated player: strikes the given notes at time t (rolled over 20ms). */
function play(capture: ChordCapture, notes: number[], t: number, timers: ManualTimers, clock: ManualClock) {
  timers.advance(Math.max(0, t - clock.now()));
  notes.forEach((n, i) => capture.feed({ type: 'on', note: n, velocity: 90, time: t + i * 0.005 }));
  timers.advance(0.15); // runner polls capture every 20 ms → settles after 70 ms of quiet
  notes.forEach((n) => capture.feed({ type: 'off', note: n, velocity: 0, time: clock.now() }));
  timers.advance(0.02);
}

describe('DrillRunner — free mode', () => {
  it('advances on correct, stays on wrong, ends after reps', () => {
    const clock = new ManualClock();
    const timers = new ManualTimers(clock);
    const capture = new ChordCapture();
    const spec: DrillSpec = { ...PRESET_BY_ID['learn-rootless-iiVI']!, length: { reps: 3 } };
    const runner = new DrillRunner({ spec, clock, capture, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout, setInterval: timers.setInterval, clearInterval: timers.clearInterval });
    const targets: Target[] = [];
    const verdicts: boolean[] = [];
    let summary: import('../src/drill.js').DrillSummary | null = null;
    runner.on('target', (e) => targets.push(e.target));
    runner.on('verdict', (e) => verdicts.push(e.verdict.ok));
    runner.on('end', (e) => { summary = e.summary; });
    runner.start();
    expect(formatChord(targets[0]!.chord, 'plain')).toBe('Dm7');
    // wrong
    play(capture, [60, 64, 67], clock.now(), timers, clock);
    expect(verdicts).toEqual([false]);
    expect(targets).toHaveLength(1);
    // right (target voicing itself)
    play(capture, targets[0]!.voicing.notes, clock.now(), timers, clock);
    timers.advance(0.5);
    expect(verdicts).toEqual([false, true]);
    expect(formatChord(targets[1]!.chord, 'plain')).toBe('G7');
    play(capture, targets[1]!.voicing.notes, clock.now(), timers, clock); timers.advance(0.5);
    play(capture, targets[2]!.voicing.notes, clock.now(), timers, clock); timers.advance(0.5);
    expect(summary).not.toBeNull();
    expect(summary!.total).toBe(3);
    expect(summary!.correct).toBe(3);
    expect(summary!.results[0]!.attempts).toBe(2);
  });
  it('hint escalates and is recorded', () => {
    const clock = new ManualClock();
    const capture = new ChordCapture();
    const runner = new DrillRunner({ spec: PRESET_BY_ID['learn-rootless-iiVI']!, clock, capture, setInterval: () => 0, clearInterval: () => {} });
    runner.start();
    expect(runner.hint()).toBe(1);
    expect(runner.hint()).toBe(2);
    expect(runner.hint()).toBe(3);
    expect(runner.hint()).toBe(3);
    runner.end();
  });
  it('voice leading off accepts any candidate in the family', () => {
    const clock = new ManualClock();
    const timers = new ManualTimers(clock);
    const capture = new ChordCapture();
    const spec: DrillSpec = { ...PRESET_BY_ID['drop2-any-inversion']!, generator: { kind: 'cycle', suffix: 'maj7', order: 'fourths' }, length: { reps: 2 } };
    const runner = new DrillRunner({ spec, clock, capture, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout, setInterval: timers.setInterval, clearInterval: timers.clearInterval });
    let t: Target | null = null;
    const ok: boolean[] = [];
    runner.on('target', (e) => { t = e.target; });
    runner.on('verdict', (e) => ok.push(e.verdict.ok));
    runner.start();
    const other = t!.candidates.find((c) => c.notes.join() !== t!.voicing.notes.join())!;
    play(capture, other.notes, clock.now(), timers, clock);
    expect(ok).toEqual([true]);
  });
});

describe('DrillRunner — timed mode', () => {
  it('grades attacks into beat windows, records lateness, marks misses', () => {
    const { clock, timers, transport } = makeTransport(120, 1);
    const capture = new ChordCapture();
    const spec: DrillSpec = { ...PRESET_BY_ID['rootless-iiVI-4ths-120']!, length: { reps: 3 }, ladder: undefined };
    const runner = new DrillRunner({ spec, clock, capture, transport, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout, setInterval: timers.setInterval, clearInterval: timers.clearInterval });
    const targets: Target[] = [];
    const finals: Array<{ ok: boolean; lateness: number | null; msg: string }> = [];
    let summary: import('../src/drill.js').DrillSummary | null = null;
    runner.on('target', (e) => targets.push(e.target));
    runner.on('verdict', (e) => { if (e.final) finals.push({ ok: e.verdict.ok, lateness: e.latenessMs, msg: e.verdict.message }); });
    runner.on('end', (e) => { summary = e.summary; });
    runner.start();
    expect(runner.state).toBe('countIn');
    // count-in is 1 bar = 2s at 120; music starts at transport.musicStart
    const t0 = transport.musicStart;
    timers.advance(t0 - clock.now() + 0.01);
    expect(runner.state).toBe('running');
    expect(targets).toHaveLength(1);
    // chord 1: play it 40 ms late
    play(capture, targets[0]!.voicing.notes, t0 + 0.04, timers, clock);
    expect(finals).toHaveLength(1);
    expect(finals[0]!.ok).toBe(true);
    expect(finals[0]!.lateness).toBe(40);
    // chord 2 starts at t0 + 4 beats = t0 + 2s; play it 100 ms early
    timers.advance(t0 + 2 - 0.1 - clock.now());
    play(capture, [1, 2, 3], clock.now(), timers, clock); // wrong, early window
    timers.advance(t0 + 2.3 - clock.now());
    expect(targets).toHaveLength(2);
    play(capture, targets[1]!.voicing.notes, clock.now(), timers, clock); // corrected in the window
    expect(finals).toHaveLength(2);
    expect(finals[1]!.ok).toBe(true);
    // chord 3: play nothing; drill ends after its window
    timers.advance(t0 + 6.2 - clock.now());
    expect(finals).toHaveLength(3);
    expect(finals[2]!.ok).toBe(false);
    expect(summary).not.toBeNull();
    expect(summary!.total).toBe(3);
    expect(summary!.correct).toBe(2);
    expect(summary!.results[1]!.attempts).toBe(2);
  });
  it('ladder raises tempo after a clean pass and lowers after a miss', () => {
    const { clock, timers, transport } = makeTransport(120, 0);
    const capture = new ChordCapture();
    const spec: DrillSpec = {
      ...PRESET_BY_ID['rootless-iiVI-4ths-120']!, generator: { kind: 'cycle', suffix: 'maj7', order: 'fourths' },
      pacing: { mode: 'timed', bpm: 120, beatsPerChord: 1, countInBars: 0, timeSig: { beats: 4, unit: 4 } }, length: { passes: 3 }, ladder: { up: 10, down: 20, min: 60, max: 200 },
    };
    const runner = new DrillRunner({ spec, clock, capture, transport, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout, setInterval: timers.setInterval, clearInterval: timers.clearInterval });
    const tempos: number[] = [];
    let cur: Target | null = null;
    runner.on('tempo', (e) => tempos.push(e.bpm));
    runner.on('target', (e) => { cur = e.target; });
    runner.start();
    // pass 1: play every chord correctly, right on the beat
    for (let i = 0; i < 12; i++) {
      const t = cur!;
      play(capture, t.voicing.notes, transport.beatTime(t.beatIndex!) + 0.02, timers, clock);
      timers.advance(transport.beatTime(t.beatIndex! + 1) + 0.001 - clock.now());
    }
    expect(tempos).toEqual([130]);
    // pass 2: miss everything
    timers.advance(20);
    expect(tempos).toEqual([130, 110]);
  });
  it('every preset constructs and yields a first target', () => {
    for (const p of PRESETS) {
      const { clock, transport } = makeTransport(p.pacing.bpm || 100, 0);
      const runner = new DrillRunner({ spec: p, clock, capture: new ChordCapture(), transport, setInterval: () => 0, clearInterval: () => {}, setTimeout: () => 0, clearTimeout: () => {} });
      let got = false;
      runner.on('target', () => { got = true; });
      runner.start();
      if (p.pacing.mode === 'free') expect(got, p.id).toBe(true);
      else expect(runner.currentTarget, p.id).toBeDefined();
      runner.end();
    }
  });
});
