import { describe, expect, it } from 'vitest';
import { ChordCapture } from '../src/capture.js';

describe('ChordCapture', () => {
  it('groups a rolled chord into one attempt', () => {
    const c = new ChordCapture({ settleMs: 70 });
    const attempts: number[][] = [];
    c.on('attempt', (a) => attempts.push(a.notes));
    c.feed({ type: 'on', note: 53, velocity: 80, time: 1.000 });
    c.feed({ type: 'on', note: 57, velocity: 80, time: 1.020 });
    c.feed({ type: 'on', note: 60, velocity: 80, time: 1.045 });
    c.feed({ type: 'on', note: 64, velocity: 80, time: 1.060 });
    expect(c.update(1.100)).toBeNull();
    const a = c.update(1.140);
    expect(a?.notes).toEqual([53, 57, 60, 64]);
    expect(a?.attackTime).toBe(1.0);
    expect(attempts).toHaveLength(1);
  });
  it('counts notes released just before settle', () => {
    const c = new ChordCapture({ settleMs: 70, graceMs: 150 });
    c.feed({ type: 'on', note: 60, velocity: 80, time: 0 });
    c.feed({ type: 'on', note: 64, velocity: 80, time: 0.01 });
    c.feed({ type: 'off', note: 60, velocity: 0, time: 0.05 });
    const a = c.update(0.1);
    expect(a?.notes).toEqual([60, 64]);
  });
  it('separates two chords', () => {
    const c = new ChordCapture({ settleMs: 70 });
    c.feed({ type: 'on', note: 60, velocity: 80, time: 0 });
    const a1 = c.update(0.1);
    c.feed({ type: 'off', note: 60, velocity: 0, time: 0.4 });
    c.feed({ type: 'on', note: 62, velocity: 80, time: 0.5 });
    const a2 = c.update(0.6);
    expect(a1?.notes).toEqual([60]);
    expect(a2?.notes).toEqual([62]);
  });
});
