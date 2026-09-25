import { describe, expect, it } from 'vitest';
import {
  FIGURE_BY_ID, figureBeats, figureCount, figuresFromMelody, gradeFigure, hitBeat, pushIndices, swingRatio,
} from '../src/index.js';

describe('figures', () => {
  it('an off-beat sits where the tempo puts it, not at 0.5', () => {
    const h = { beat: 3, slot: 1 } as const;
    expect(hitBeat(h, 140, false)).toBeCloseTo(3.5, 6);
    expect(hitBeat(h, 140, true)).toBeCloseTo(3 + swingRatio(140), 6);
    // slow swing is much more dotted than fast swing, and the figure has to follow
    expect(hitBeat(h, 80, true)).toBeGreaterThan(hitBeat(h, 220, true));
  });

  it('knows which hits are pushes across the bar line', () => {
    // the push: 1 2 3 4& with bar 2 silent
    expect(pushIndices(FIGURE_BY_ID['push-into-1']!)).toEqual([3]);
    // the Charleston's off-beat is inside the bar, not across it
    expect(pushIndices(FIGURE_BY_ID['and-of-2']!)).toEqual([]);
    // an off-beat on 4 is only a push when the downbeat after it is silent
    expect(pushIndices({ ...FIGURE_BY_ID['push-into-1']!, hits: [{ beat: 3, slot: 1 }, { beat: 4, slot: 0 }] })).toEqual([]);
  });

  it('counts a figure out the way a player says it', () => {
    expect(figureCount(FIGURE_BY_ID['push-into-1']!)).toBe('1 2 3 4& | –');
    expect(figureCount(FIGURE_BY_ID['and-of-2']!)).toBe('1 2&');
  });

  it('cuts a recorded head into phrases and names the pushes', () => {
    // two bars: 1 2 3 4&(push), then bar 3 starts on 1
    const off = swingRatio(140);
    const notes = [
      { midi: 60, start: 0 }, { midi: 62, start: 1 }, { midi: 64, start: 2 }, { midi: 65, start: 3 + off },
      { midi: 67, start: 8 },
    ];
    const figs = figuresFromMelody(notes, { bars: 2, bpm: 140, totalBars: 4 });
    expect(figs).toHaveLength(2);
    expect(figs[0]!.hits).toEqual([{ beat: 0, slot: 0 }, { beat: 1, slot: 0 }, { beat: 2, slot: 0 }, { beat: 3, slot: 1 }]);
    expect(pushIndices(figs[0]!)).toEqual([3]);
    expect(figs[0]!.blurb).toMatch(/1 push across the bar line/);
    expect(figs[0]!.name).toBe('Bars 1–2');
  });
});

describe('gradeFigure', () => {
  const beat = 0.5;                          // 120 bpm
  const fig = FIGURE_BY_ID['push-into-1']!;
  const want = figureBeats(fig, 120, false); // [0, 1, 2, 3.5]
  const pushes = pushIndices(fig);

  it('the figure, played, is the figure', () => {
    const v = gradeFigure(want, [0, 1, 2, 3.5], beat, { pushes });
    expect(v.ok).toBe(true);
    expect(v.clean).toBe(4);
    expect(v.headline).toBe('That is the figure');
    expect(v.advice).toBeNull();
  });

  it('a push played on the downbeat is a different rhythm, not a late one', () => {
    const v = gradeFigure(want, [0, 1, 2, 4], beat, { pushes });
    expect(v.ok).toBe(false);
    expect(v.flattened).toBe(1);
    expect(v.hits[3]!.verdict).toBe('flattened');
    expect(v.headline).toMatch(/flattened the push/);
    expect(v.advice).toMatch(/an eighth earlier/);
    // and it must not be reported as lateness, which would teach the wrong fix
    expect(v.headline).not.toMatch(/late/);
  });

  it('right places but behind the beat is lateness', () => {
    const late = want.map((b) => b + 0.36);   // 180 ms at 120
    const v = gradeFigure(want, late, beat, { pushes });
    expect(v.flattened).toBe(0);
    expect(v.headline).toMatch(/Right places, 180 ms late/);
    expect(v.advice).toMatch(/hearing the subdivision wrong/);
  });

  it('flattening while also being late is still flattening', () => {
    // 180 ms behind on everything, and the push put on the downbeat
    const v = gradeFigure(want, [0.36, 1.36, 2.36, 4.36], beat, { pushes });
    expect(v.flattened).toBe(1);
    expect(v.headline).toMatch(/flattened the push/);
  });

  it('small imprecision still counts as getting it', () => {
    const v = gradeFigure(want, want.map((b, i) => b + (i % 2 ? 0.08 : -0.06)), beat, { pushes });
    expect(v.ok).toBe(true);
  });

  it('counts what never arrived and what was not asked for', () => {
    expect(gradeFigure(want, [0, 1, 2], beat, { pushes }).missed).toBe(1);
    const extra = gradeFigure(want, [0, 0.45, 1, 2, 3.5], beat, { pushes });
    expect(extra.extra).toBe(1);
    expect(extra.ok).toBe(false);
    expect(extra.headline).toMatch(/extra notes/);
  });

  it('silence is silence, not a bad answer', () => {
    const v = gradeFigure(want, [], beat, { pushes });
    expect(v.missed).toBe(4);
    expect(v.headline).toBe('Nothing landed');
  });
});
