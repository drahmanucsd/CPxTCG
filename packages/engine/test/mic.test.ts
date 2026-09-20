import { describe, expect, it } from 'vitest';
import { chroma, findPeaks, pickNotes } from '../src/mic.js';

const SR = 44100, N = 8192;
/** Synthesize a dB spectrum with peaks at the given MIDI notes and their harmonics. */
function spectrum(notes: number[], harmonicDb = [0, -4, -9, -14, -18]): Float32Array {
  const spec = new Float32Array(N / 2).fill(-100);
  const binHz = SR / N;
  for (const n of notes) {
    const f0 = 440 * Math.pow(2, (n - 69) / 12);
    harmonicDb.forEach((db, h) => {
      const f = f0 * (h + 1);
      const bin = f / binHz;
      const i = Math.round(bin);
      if (i + 1 >= spec.length) return;
      // a small hump around the bin
      for (let k = -2; k <= 2; k++) spec[i + k] = Math.max(spec[i + k]!, -30 + db - Math.abs(k + (i - bin)) * 6);
    });
  }
  return spec;
}

describe('mic analysis', () => {
  it('finds the fundamentals of a Dm7 rootless voicing (F3 A3 C4 E4) despite harmonics', () => {
    const notes = [53, 57, 60, 64];
    const peaks = findPeaks(spectrum(notes), SR, N, -70);
    const picked = pickNotes(peaks).map((p) => p.midi);
    for (const n of notes) expect(picked, picked.join(',')).toContain(n);
    // the 3rd harmonic of F3 is C5 (pc C, already in chord); of A3 is E5; none should add a foreign pitch class
    const pcs = new Set(picked.map((m) => m % 12));
    expect([...pcs].every((p) => [5, 9, 0, 4].includes(p))).toBe(true);
  });
  it('single low note is not mistaken for an octave/fifth stack', () => {
    const peaks = findPeaks(spectrum([40]), SR, N, -70);
    expect(pickNotes(peaks).map((p) => p.midi)).toEqual([40]);
  });
  it('chroma highlights the chord tones', () => {
    const c = chroma(spectrum([60, 64, 67, 71]), SR, N, -70);
    const top = c.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0]).slice(0, 4).map((x) => x[1]).sort((a, b) => a - b);
    expect(top).toEqual([0, 4, 7, 11]);
  });
});
