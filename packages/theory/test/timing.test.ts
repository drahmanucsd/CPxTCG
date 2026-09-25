import { describe, expect, it } from 'vitest';
import {
  type Grid, type Onset,
  analyzeMelodyTiming, analyzeTiming, groupAttacks, parseAbc, positionLabel, slotsFor, swingRatio,
} from '../src/index.js';

const BPM = 120;
const grid: Grid = { startTime: 10, beatDuration: 60 / BPM, beatsPerBar: 4 };

/** Notes on the beats 0..n-1, each pushed by `offsetMs(i)` milliseconds. */
function onBeats(n: number, offsetMs: (i: number) => number = () => 0, midi = 60): Onset[] {
  return Array.from({ length: n }, (_, i) => ({ midi, time: grid.startTime + i * grid.beatDuration + offsetMs(i) / 1000 }));
}

/** Quarter, off-beat eighth, quarter… with the off-beat at `pos` of a beat. */
function withOffbeats(bars: number, pos: number, offsetMs = 0): Onset[] {
  const out: Onset[] = [];
  for (let b = 0; b < bars * 4; b++) {
    out.push({ midi: 60, time: grid.startTime + b * grid.beatDuration + offsetMs / 1000 });
    out.push({ midi: 62, time: grid.startTime + (b + pos) * grid.beatDuration + offsetMs / 1000 });
  }
  return out;
}

describe('grid helpers', () => {
  it('slots depend on swing', () => {
    expect(slotsFor('eighth', false, 0.667)).toEqual([0, 0.5]);
    expect(slotsFor('eighth', true, 0.667)).toEqual([0, 0.667]);
    expect(slotsFor('triplet', true, 0.667)).toEqual([0, 1 / 3, 2 / 3]);
  });
  it('names positions the way a player counts them', () => {
    expect(positionLabel(0, 0, 'eighth')).toBe('1');
    expect(positionLabel(3, 1, 'eighth')).toBe('4&');
    expect(positionLabel(1, 3, 'sixteenth')).toBe('2a');
  });
  it('notes struck together are one attack', () => {
    const g = groupAttacks([
      { midi: 60, time: 0 }, { midi: 72, time: 0.01 },      // an octave: one attack
      { midi: 64, time: 0.5 },
    ]);
    expect(g.map((x) => x.length)).toEqual([2, 1]);
  });
});

describe('analyzeTiming', () => {
  it('a perfect performance is tight, on top, and does not drift', () => {
    const r = analyzeTiming(onBeats(16), grid, { swing: false });
    expect(r.count).toBe(16);
    expect(r.spreadMs).toBeLessThan(1);
    expect(r.medianMs).toBeCloseTo(0, 1);
    expect(r.placement).toBe('on top');
    expect(r.grade).toBe('tight');
    expect(r.onGrid).toBe(16);
    expect(r.driftMsPerBar).toBeCloseTo(0, 1);
  });

  it('a constant lag is flagged as latency rather than as bad time', () => {
    const r = analyzeTiming(onBeats(16, () => 55), grid, { swing: false });
    expect(r.medianMs).toBeCloseTo(55, 0);
    expect(r.spreadMs).toBeLessThan(1);
    expect(r.latencySuspect).toBe(true);
    expect(r.detail.join(' ')).toMatch(/latency/i);
    // consistently *early* is never latency — that would mean playing before you pressed the key
    expect(analyzeTiming(onBeats(16, () => -55), grid, { swing: false }).latencySuspect).toBe(false);
    // still graded tight: the hands were steady, the interface was late
    expect(r.grade).toBe('tight');
  });

  it('laying back steadily is reported as a choice, not an error', () => {
    // 35 ms behind, varying the way a person does rather than the way an interface does
    const jitter = [0, 17, -15, 12, -10, 19, -18, 8, 14, -12, 16, -14, 10, -8, 18, -16];
    const r = analyzeTiming(onBeats(16, (i) => 35 + jitter[i]!), grid, { swing: false });
    expect(r.placement).toBe('behind');
    expect(r.spreadMs).toBeGreaterThan(20);
    expect(r.latencySuspect).toBe(false);
    expect(r.grade).toBe('good');
    expect(r.detail.join(' ')).toMatch(/Laying back is a choice/);
  });

  it('separates unsteady from merely displaced', () => {
    const wobble = [0, 70, -65, 55, -80, 60, -50, 75, -70, 45, -60, 80, -55, 65, -75, 50];
    const r = analyzeTiming(onBeats(16, (i) => wobble[i]!), grid, { swing: false });
    expect(r.grade).toBe('unsteady');
    expect(r.spreadMs).toBeGreaterThan(55);
    expect(r.headline).toMatch(/Unsteady/);
    // with a spread this wide the median describes nothing, and the text must not pretend it does
    expect(r.detail.join(' ')).toMatch(/does not mean much yet/);
  });

  it('measures the tempo you were actually playing when you rush', () => {
    // 6 ms earlier every beat: a real speed-up, not noise
    const r = analyzeTiming(onBeats(24, (i) => -6 * i), grid, { swing: false });
    expect(r.driftMsPerBar).toBeLessThan(-20);
    expect(r.playedBpm).not.toBeNull();
    expect(r.playedBpm!).toBeGreaterThan(BPM + 1);
    expect(r.lastMs).toBeLessThan(r.firstMs);
    expect(r.detail.join(' ')).toMatch(/sped up.*That is rushing/);
  });

  it('measures swing from where the eighths landed, not from the setting', () => {
    // played dead straight, analysed on a swung grid: it must still report straight
    const r = analyzeTiming(withOffbeats(4, 0.5), grid, { swing: true });
    expect(r.swing).not.toBeNull();
    expect(r.swing!.position).toBeCloseTo(0.5, 2);
    expect(r.swing!.ratio).toBeCloseTo(1, 1);
    expect(r.swing!.verdict).toBe('straighter');
    expect(r.detail.join(' ')).toMatch(/straighter/);
  });

  it('a 2:1 swing at a tempo that wants 2:1 is matched', () => {
    const want = swingRatio(BPM);
    const r = analyzeTiming(withOffbeats(4, want), grid, { swing: true });
    expect(r.swing!.verdict).toBe('matched');
    expect(r.swing!.ratio).toBeCloseTo(want / (1 - want), 1);
  });

  it('finds the one place in the bar that is consistently off', () => {
    // every beat clean except beat 4, which is 70 ms early
    const r = analyzeTiming(onBeats(24, (i) => (i % 4 === 3 ? -70 : 0)), grid, { swing: false });
    const four = r.byPosition.find((p) => p.label === '4')!;
    expect(Math.round(four.meanMs)).toBeCloseTo(-70, -1);
    expect(r.detail.join(' ')).toMatch(/"4" is your weak spot/);
  });

  it('too few notes reports nothing rather than noise', () => {
    expect(analyzeTiming(onBeats(2), grid).count).toBe(0);
  });
});

describe('analyzeMelodyTiming', () => {
  // four quarter notes, then a half: C D E F | G2
  const written = parseAbc('M:4/4\nL:1/4\nK:C\nC D E F | G2 |');

  function play(offsets: number[], pitches = [60, 62, 64, 65, 67]): Onset[] {
    const starts = [0, 1, 2, 3, 4];
    return pitches.map((midi, i) => ({ midi, time: grid.startTime + starts[i]! * grid.beatDuration + (offsets[i] ?? 0) / 1000 }));
  }

  it('times against where the note is written, and confirms the pitches', () => {
    const r = analyzeMelodyTiming(written.notes, play([10, 12, 8, 11, 9]), grid, { swing: false });
    expect(r.pitch.ok).toBe(true);
    expect(r.missed).toBe(0);
    expect(r.timing.count).toBe(5);
    expect(r.timing.medianMs).toBeCloseTo(10, 0);
    expect(r.perNote.every((n) => n.playedTime !== null)).toBe(true);
  });

  it('a dropped note is missing, not mis-timed', () => {
    const r = analyzeMelodyTiming(written.notes, play([0, 0, 0, 0], [60, 62, 65, 67]), grid, { swing: false });
    expect(r.missed).toBe(1);
    expect(r.perNote.find((n) => n.midi === 64)!.playedTime).toBeNull();
    // the notes that were played are still timed
    expect(r.timing.count).toBe(4);
  });

  it('a note played a bar away is displaced, not folded into the timing stats', () => {
    const late = play([0, 0, 0, 0, 0]);
    late[4] = { midi: 67, time: grid.startTime + 8 * grid.beatDuration };   // G four beats late
    const r = analyzeMelodyTiming(written.notes, late, grid, { swing: false });
    expect(r.displaced).toBe(1);
    expect(r.timing.count).toBe(4);
    expect(r.timing.spreadMs).toBeLessThan(2);
  });

  it('extra notes are counted without wrecking the alignment', () => {
    const notes = play([0, 0, 0, 0, 0]);
    notes.splice(2, 0, { midi: 61, time: grid.startTime + 1.5 * grid.beatDuration });
    const r = analyzeMelodyTiming(written.notes, notes, grid, { swing: false });
    expect(r.extra).toBe(1);
    expect(r.missed).toBe(0);
  });
});
