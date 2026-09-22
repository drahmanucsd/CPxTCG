import { describe, expect, it } from 'vitest';
import { COMP_FIGURES, DEFAULT_FEEL, humanise, isFillBar, offbeatAt, pickFigure, swingRatio } from '../src/groove.js';

describe('swing ratio', () => {
  it('is more dotted slow and flatter fast', () => {
    expect(swingRatio(80)).toBeGreaterThan(swingRatio(140));
    expect(swingRatio(140)).toBeGreaterThan(swingRatio(220));
  });
  it('is about 2:1 at a medium tempo', () => {
    expect(swingRatio(140)).toBeCloseTo(0.667, 2);
  });
  it('approaches even eighths at fast tempos but never passes them', () => {
    expect(swingRatio(280)).toBeLessThan(0.6);
    expect(swingRatio(300)).toBeGreaterThan(0.5);
  });
  it('clamps outside the table', () => {
    expect(swingRatio(20)).toBe(swingRatio(60));
    expect(swingRatio(400)).toBe(swingRatio(300));
  });
  it('straight feel puts the offbeat exactly halfway', () => {
    expect(offbeatAt(140, false)).toBe(0.5);
    expect(offbeatAt(140, true)).toBeGreaterThan(0.5);
  });
});

describe('form awareness', () => {
  it('fills at the end of each eight and at the end of the form', () => {
    expect(isFillBar(7, 32)).toBe(true);
    expect(isFillBar(31, 32)).toBe(true);
    expect(isFillBar(2, 32)).toBe(false);
  });
  it('comps more as the choruses go on', () => {
    const rng = () => 0.3;
    const early = pickFigure(COMP_FIGURES, 3, 1, rng);
    const late = pickFigure(COMP_FIGURES, 3, 4, rng);
    expect(late.length).toBeGreaterThanOrEqual(early.length);
  });
});

describe('feel', () => {
  it('nudges time and velocity without running away', () => {
    const rng = () => 1;
    const h = humanise(10, 0.5, DEFAULT_FEEL, rng, -0.004);
    expect(h.time).toBeCloseTo(10 - 0.004 + DEFAULT_FEEL.timingJitter, 5);
    expect(h.vel).toBeCloseTo(0.55, 5);
  });
  it('keeps velocity inside 0..1 however hard it is pushed', () => {
    expect(humanise(0, 1, DEFAULT_FEEL, () => 1).vel).toBeLessThanOrEqual(1);
    expect(humanise(0, 0.01, DEFAULT_FEEL, () => 0).vel).toBeGreaterThan(0);
  });
});
