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
  it('right notes outside the window are a timing outcome, not a pass', () => {
    const { clock, timers, transport } = makeTransport(120, 0);
    const capture = new ChordCapture();
    const spec: DrillSpec = {
      ...PRESET_BY_ID['rootless-iiVI-4ths-120']!, ladder: undefined, length: { reps: 2 },
      pacing: { mode: 'timed', bpm: 120, beatsPerChord: 4, countInBars: 0, timeSig: { beats: 4, unit: 4 }, advance: 'onTime', timingWindowMs: 120 },
    };
    const runner = new DrillRunner({ spec, clock, capture, transport, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout, setInterval: timers.setInterval, clearInterval: timers.clearInterval });
    let cur: Target | null = null;
    let summary: import('../src/drill.js').DrillSummary | null = null;
    runner.on('target', (e) => { cur = e.target; });
    runner.on('end', (e) => { summary = e.summary; });
    runner.start();
    // chord 1: right notes, 60 ms late — inside ±120 ms
    const first = cur!;
    play(capture, first.voicing.notes, transport.beatTime(first.beatIndex!) + 0.06, timers, clock);
    timers.advance(transport.beatTime(first.beatIndex! + 4) + 0.01 - clock.now());
    // chord 2: right notes, 300 ms late — outside the window
    const second = cur!;
    play(capture, second.voicing.notes, transport.beatTime(second.beatIndex!) + 0.3, timers, clock);
    timers.advance(5);
    expect(summary).not.toBeNull();
    const [a, b] = summary!.results;
    expect(a!.ok).toBe(true);
    expect(a!.timing).toBe('onTime');
    expect(a!.outcome).toBe('clean');
    expect(b!.ok).toBe(true);           // the notes were right
    expect(b!.timing).toBe('late');
    expect(b!.outcome).toBe('timing');  // but it does not count as clean
    expect(summary!.clean).toBe(1);
    expect(summary!.outcomes).toMatchObject({ clean: 1, timing: 1, wrong: 0, blank: 0 });
    expect(summary!.timing!.late).toBe(1);
    expect(summary!.timing!.offsets).toEqual([60, 300]);
  });
  it("advance 'onCorrect' repeats the chord until it is played", () => {
    const { clock, timers, transport } = makeTransport(120, 0);
    const capture = new ChordCapture();
    const spec: DrillSpec = {
      ...PRESET_BY_ID['rootless-iiVI-4ths-120']!, ladder: undefined, length: { reps: 2 },
      pacing: { mode: 'timed', bpm: 120, beatsPerChord: 4, countInBars: 0, timeSig: { beats: 4, unit: 4 }, advance: 'onCorrect', maxRepeats: 8 },
    };
    const runner = new DrillRunner({ spec, clock, capture, transport, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout, setInterval: timers.setInterval, clearInterval: timers.clearInterval });
    const chords: string[] = [];
    const repeats: number[] = [];
    runner.on('target', (e) => chords.push(formatChord(e.target.chord, 'plain')));
    runner.on('repeat', (e) => repeats.push(e.repeats));
    runner.start();
    const first = runner.currentTarget!;
    // sit out two whole windows without playing: the same chord comes round again, twice
    timers.advance(transport.beatTime(first.beatIndex! + 8) + 0.01 - clock.now());
    expect(repeats).toEqual([1, 2]);
    expect(runner.currentTarget!.index).toBe(first.index);
    expect(new Set(chords).size).toBe(1);
    // now play it: the drill moves on to the next chord
    play(capture, first.voicing.notes, clock.now() + 0.01, timers, clock);
    timers.advance(transport.beatTime(first.beatIndex! + 4) + 0.02 - clock.now());
    expect(runner.currentTarget!.index).toBe(first.index + 1);
    const r = runner.resultsSoFar[0]!;
    expect(r.repeats).toBe(2);
    expect(r.ok).toBe(true);
    runner.end();
  });
  it('grades one hand only when a split is set, so a melody does not fail the chord', () => {
    const clock = new ManualClock();
    const timers = new ManualTimers(clock);
    const capture = new ChordCapture();
    const spec: DrillSpec = { ...PRESET_BY_ID['learn-rootless-iiVI']!, length: { reps: 2 }, hands: { grade: 'below' } };
    const runner = new DrillRunner({ spec, clock, capture, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout, setInterval: timers.setInterval, clearInterval: timers.clearInterval });
    let t: Target | null = null;
    const ok: boolean[] = [];
    runner.on('target', (e) => { t = e.target; });
    runner.on('verdict', (e) => ok.push(e.verdict.ok));
    runner.start();
    const lh = t!.voicing.notes;
    // the whole left-hand voicing plus a melody note above it
    play(capture, [...lh, 84], clock.now(), timers, clock);
    expect(ok).toEqual([true]);
    // the melody note is not recorded as something you played wrong
    expect(runner.resultsSoFar[0]!.playedNotes).toEqual(lh);
  });
  it('a wrong note below the split still fails even with a melody above it', () => {
    const clock = new ManualClock();
    const timers = new ManualTimers(clock);
    const capture = new ChordCapture();
    const spec: DrillSpec = { ...PRESET_BY_ID['learn-rootless-iiVI']!, length: { reps: 2 }, hands: { grade: 'below' } };
    const runner = new DrillRunner({ spec, clock, capture, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout, setInterval: timers.setInterval, clearInterval: timers.clearInterval });
    let t: Target | null = null;
    const ok: boolean[] = [];
    runner.on('target', (e) => { t = e.target; });
    runner.on('verdict', (e) => ok.push(e.verdict.ok));
    runner.start();
    // drop a note out of the voicing, keep the melody: the graded hand is still wrong
    play(capture, [...t!.voicing.notes.slice(1), 84], clock.now(), timers, clock);
    expect(ok).toEqual([false]);
  });
  it('reports which notes move from the previous voicing', () => {
    const clock = new ManualClock();
    const timers = new ManualTimers(clock);
    const capture = new ChordCapture();
    const spec: DrillSpec = { ...PRESET_BY_ID['learn-rootless-iiVI']!, length: { reps: 3 } };
    const runner = new DrillRunner({ spec, clock, capture, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout, setInterval: timers.setInterval, clearInterval: timers.clearInterval });
    const targets: Target[] = [];
    runner.on('target', (e) => targets.push(e.target));
    runner.start();
    expect(targets[0]!.moved).toEqual([]);           // nothing to move from on the first chord
    play(capture, targets[0]!.voicing.notes, clock.now(), timers, clock);
    timers.advance(0.5);
    const second = targets[1]!;
    // ii -> V voice-led: most notes are held, only one or two move
    expect(second.moved.length + second.held.length).toBe(second.voicing.notes.length);
    expect(second.held.length, 'voice leading should hold most notes').toBeGreaterThan(0);
    expect(second.moved.every((n) => !targets[0]!.voicing.notes.includes(n))).toBe(true);
  });
  it('measures the tempo actually played in free time', () => {
    const clock = new ManualClock();
    const timers = new ManualTimers(clock);
    const capture = new ChordCapture();
    const spec: DrillSpec = { ...PRESET_BY_ID['learn-rootless-iiVI']!, length: { reps: 5 }, pacing: { ...PRESET_BY_ID['learn-rootless-iiVI']!.pacing, holdMs: 0 } };
    const runner = new DrillRunner({ spec, clock, capture, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout, setInterval: timers.setInterval, clearInterval: timers.clearInterval });
    let t: Target | null = null;
    let summary: import('../src/drill.js').DrillSummary | null = null;
    runner.on('target', (e) => { t = e.target; });
    runner.on('end', (e) => { summary = e.summary; });
    runner.start();
    // one chord every 2 s, 4 beats each => 2 beats/s => 120 bpm
    for (let i = 0; i < 5; i++) {
      play(capture, t!.voicing.notes, clock.now(), timers, clock);
      timers.advance(2 - 0.17);
    }
    timers.advance(1);
    expect(summary).not.toBeNull();
    expect(summary!.measuredBpm).toBeGreaterThan(110);
    expect(summary!.measuredBpm).toBeLessThan(130);
  });
  it('auto-hints: a fixed level shows immediately, adaptive rises only when you stall', () => {
    const fixed = (() => {
      const clock = new ManualClock();
      const timers = new ManualTimers(clock);
      const capture = new ChordCapture();
      const spec: DrillSpec = { ...PRESET_BY_ID['learn-rootless-iiVI']!, length: { reps: 2 }, autoHint: 2 };
      const runner = new DrillRunner({ spec, clock, capture, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout, setInterval: timers.setInterval, clearInterval: timers.clearInterval });
      const levels: number[] = [];
      runner.on('hint', (e) => levels.push(e.level));
      runner.start();
      return levels;
    })();
    expect(fixed[0]).toBe(2);

    const clock = new ManualClock();
    const timers = new ManualTimers(clock);
    const capture = new ChordCapture();
    const spec: DrillSpec = { ...PRESET_BY_ID['learn-rootless-iiVI']!, length: { reps: 3 }, autoHint: 'adaptive', stallMs: 1000 };
    const runner = new DrillRunner({ spec, clock, capture, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout, setInterval: timers.setInterval, clearInterval: timers.clearInterval });
    const levels: number[] = [];
    let t: Target | null = null;
    runner.on('hint', (e) => levels.push(e.level));
    runner.on('target', (e) => { t = e.target; });
    runner.start();
    expect(levels).toEqual([]);          // nothing offered up front
    timers.advance(1.05);
    expect(levels).toEqual([1]);         // stalled once
    timers.advance(1.05);
    expect(levels).toEqual([1, 2]);
    // getting it right stops this chord's ladder
    play(capture, t!.voicing.notes, clock.now(), timers, clock);
    timers.advance(0.5);
    expect(levels).toEqual([1, 2]);
    // the next chord starts its own ladder from scratch rather than inheriting the level
    timers.advance(1.05);
    expect(levels).toEqual([1, 2, 1]);
    runner.end();
  });
  it("skip gets you out of a repeating chord in 'onCorrect'", () => {
    const { clock, timers, transport } = makeTransport(120, 0);
    const capture = new ChordCapture();
    const spec: DrillSpec = {
      ...PRESET_BY_ID['rootless-iiVI-4ths-120']!, ladder: undefined, length: { reps: 3 },
      pacing: { mode: 'timed', bpm: 120, beatsPerChord: 4, countInBars: 0, timeSig: { beats: 4, unit: 4 }, advance: 'onCorrect', maxRepeats: 8 },
    };
    const runner = new DrillRunner({ spec, clock, capture, transport, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout, setInterval: timers.setInterval, clearInterval: timers.clearInterval });
    runner.start();
    const first = runner.currentTarget!;
    timers.advance(transport.beatTime(first.beatIndex! + 4) + 0.01 - clock.now());
    expect(runner.currentTarget!.index, 'still stuck on the same chord').toBe(first.index);
    runner.skip();
    expect(runner.currentTarget!.index).toBe(first.index + 1);
    expect(runner.resultsSoFar[0]!.outcome).toBe('blank');
    runner.end();
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
